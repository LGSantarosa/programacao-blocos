#include <Arduino.h>
extern "C" {
#include "hal.h"
}

/* TB6612FNG */
static const int PIN_PWMA = 25, PIN_AIN1 = 26, PIN_AIN2 = 27;
static const int PIN_PWMB = 33, PIN_BIN1 = 14, PIN_BIN2 = 12;
static const int PIN_STBY = 13;

/* HC-SR04 */
static const int PIN_TRIG = 5, PIN_ECHO = 18;

static const int CANAL_A = 0, CANAL_B = 1;

/* Compensação de partida deste chassi. Os dois motores não arrancam no mesmo
   PWM: medido na bancada a 7,5 V, o robô guinava para um lado porque uma roda
   saía da inércia antes da outra. Pontos a mais no direito emparelham os dois.

   Um número para cada sentido, porque um só não serviu: com 6 nos dois, para
   frente ainda faltava e de ré sobrava. Os dois foram acertados no chão, em
   02/10/2026, andando reto com «andar frente» e «andar trás» normais.

   Mora aqui, e não no core/vm.c, de propósito: a guinada é defeito deste
   chassi — motor, redução, atrito da roda boba —, não da lógica do programa.
   No vm.c ela vazaria para o robô virtual, e o simulador passaria a guinar
   também, o que seria mentira.

   Trocando de chassi, remeça: um motor de cada vez, subindo o PWM até a roda
   girar, e a diferença entre os dois lados é este número. */
static const int16_t TRIM_DIR_FRENTE = 8;
static const int16_t TRIM_DIR_RE = 2;

void hal_esp32_setup() {
    pinMode(PIN_AIN1, OUTPUT); pinMode(PIN_AIN2, OUTPUT);
    pinMode(PIN_BIN1, OUTPUT); pinMode(PIN_BIN2, OUTPUT);
    pinMode(PIN_STBY, OUTPUT); digitalWrite(PIN_STBY, HIGH);

    ledcSetup(CANAL_A, 20000, 8);
    ledcSetup(CANAL_B, 20000, 8);
    ledcAttachPin(PIN_PWMA, CANAL_A);
    ledcAttachPin(PIN_PWMB, CANAL_B);

    pinMode(PIN_TRIG, OUTPUT); digitalWrite(PIN_TRIG, LOW);
    pinMode(PIN_ECHO, INPUT);
}

static void um_motor(int canal, int in1, int in2, int16_t v) {
    if (v > 255) v = 255;
    if (v < -255) v = -255;
    digitalWrite(in1, v >= 0 ? HIGH : LOW);
    digitalWrite(in2, v >= 0 ? LOW : HIGH);
    ledcWrite(canal, (uint32_t)(v >= 0 ? v : -v));
}

/* O trim soma no módulo e devolve o sinal: indo de ré o lado forte precisa ser
   o mesmo lado. Parado continua parado — somar em cima do zero faria o robô
   caminhar sozinho depois de um PARAR, que é o pior defeito possível num
   brinquedo de criança. */
static int16_t com_trim(int16_t v) {
    if (v == 0) return 0;
    int32_t m = (v > 0 ? v : -v) + (v > 0 ? TRIM_DIR_FRENTE : TRIM_DIR_RE);
    if (m > 255) m = 255;
    if (m < 0) m = 0;
    return (int16_t)(v > 0 ? m : -m);
}

static void aplicar(int16_t esq, int16_t dir) {
    um_motor(CANAL_A, PIN_AIN1, PIN_AIN2, esq);
    um_motor(CANAL_B, PIN_BIN1, PIN_BIN2, com_trim(dir));
}

/* Andar mais devagar que o PWM pedido. Com a bateria cheia (8,4 V, e não os
   7,5 V da medição) o robô andava rápido demais, mas baixar o PWM direto não
   serve: abaixo de uns 170 o motor parado não vence o atrito e fica chiando
   sem girar. Então ele arranca com o PWM inteiro por TRANCO_MS — o tranco — e
   só depois cai para PCT_ANDAR. Rodando, o motor aguenta o PWM mais baixo.

   Só no andar, os dois motores no mesmo sentido: o giro (um para cada lado)
   passa intacto, porque o GIRO_PCT foi acertado com ele assim. E só quando o
   firmware principal liga (hal_esp32_andar_reduzido): a régua de
   firmware/calibrar/ usa este mesmo arquivo e precisa do PWM cru.

   O simulador não sabe disto, de propósito: a velocidade é da bateria, e
   não do programa. */
static const int16_t PCT_ANDAR = 80;
static const uint32_t TRANCO_MS = 80;
/* Cada «andar» termina com os motores em zero, e o seguinte religa no mesmo
   instante. Sem esta folga, todo bloco novo dava um tranco com o robô ainda
   embalado — um pulso de velocidade no meio do caminho. Parado há menos que
   isto no mesmo sentido, não é partida: segue direto nos PCT_ANDAR. */
static const uint32_t EMBALADO_MS = 150;

static bool reduzir = false;
static int sentido_ant = 0;          /* +1 frente, -1 ré, 0 qualquer outra coisa */
static int16_t pedido_esq = 0, pedido_dir = 0;
static bool no_tranco = false;
static uint32_t tranco_desde = 0;
static int sentido_embalado = 0;     /* o sentido do último andar, e quando ele acabou */
static uint32_t parou_em = 0;

/* O vigia (main.cpp) para os motores de outra tarefa. Sem a trava, o fim do
   tranco, aplicado no loop(), poderia religar um motor que o vigia acabou de
   desligar — e o robô andaria sozinho depois de um PARAR. */
static portMUX_TYPE trava = portMUX_INITIALIZER_UNLOCKED;

static int sentido_de(int16_t esq, int16_t dir) {
    if (esq > 0 && dir > 0) return 1;
    if (esq < 0 && dir < 0) return -1;
    return 0;
}

static int16_t reduzido(int16_t v) {
    return (int16_t)((int32_t)v * PCT_ANDAR / 100);
}

void hal_esp32_andar_reduzido() {
    reduzir = true;
}

extern "C" void hal_motors(int16_t esq, int16_t dir) {
    portENTER_CRITICAL(&trava);
    int sentido = reduzir ? sentido_de(esq, dir) : 0;
    uint32_t agora = millis();
    if (sentido == 0) {
        if (sentido_ant != 0) {
            sentido_embalado = sentido_ant;
            parou_em = agora;
        }
        no_tranco = false;
        aplicar(esq, dir);
    } else {
        pedido_esq = esq;
        pedido_dir = dir;
        bool embalado = sentido == sentido_embalado &&
                        agora - parou_em < EMBALADO_MS;
        if (sentido != sentido_ant && !embalado) {
            no_tranco = true;
            tranco_desde = agora;
        }
        if (no_tranco) aplicar(esq, dir);
        else           aplicar(reduzido(esq), reduzido(dir));
    }
    sentido_ant = sentido;
    portEXIT_CRITICAL(&trava);
}

/* Chamada a cada volta do loop(): é ela que encerra o tranco. */
void hal_esp32_loop() {
    portENTER_CRITICAL(&trava);
    if (no_tranco && millis() - tranco_desde >= TRANCO_MS) {
        no_tranco = false;
        aplicar(reduzido(pedido_esq), reduzido(pedido_dir));
    }
    portEXIT_CRITICAL(&trava);
}

extern "C" uint32_t hal_millis(void) {
    return (uint32_t)millis();
}

/* O HC-SR04 é lento. Ler a cada chamada travaria a VM por até 25 ms, então
   a leitura é feita no máximo a cada 60 ms e o último valor fica em cache. */
extern "C" uint16_t hal_distancia_cm(void) {
    static uint32_t ultima = 0;
    static uint16_t cache = 400;

    uint32_t agora = millis();
    if (agora - ultima < 60) return cache;
    ultima = agora;

    digitalWrite(PIN_TRIG, LOW);  delayMicroseconds(2);
    digitalWrite(PIN_TRIG, HIGH); delayMicroseconds(10);
    digitalWrite(PIN_TRIG, LOW);

    unsigned long us = pulseIn(PIN_ECHO, HIGH, 25000UL);
    if (us == 0) { cache = 400; return cache; }

    long cm = (long)(us / 58);
    if (cm < 2) cm = 2;
    if (cm > 400) cm = 400;
    cache = (uint16_t)cm;
    return cache;
}
