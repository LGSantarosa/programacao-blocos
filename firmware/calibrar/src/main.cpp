#include <Arduino.h>
extern "C" {
#include "hal.h"
}

void hal_esp32_setup();

/* Régua de velocidade: em que PWM o robô sai do lugar, e em que PWM ele
   continua andando depois de começado.

   Quem mede não é o olho de quem está olhando: é o HC-SR04 do próprio robô.
   Aponte-o para uma parede, e cada disparo diz em centímetros o quanto ele
   andou — número, e não "acho que mexeu". O sensor é o mesmo do bloco
   👁 distância cm, e a leitura passa pelo mesmo hal_distancia_cm(). */

static const uint32_t MS_PULSO  = 1000;
static const uint32_t MS_ASSENTA = 400;   /* o robô para de balançar */

/* A leitura crua tremula um ou dois centímetros. A mediana de cinco, espaçadas
   além do cache de 60 ms do HAL, é o que separa "andou 2 cm" de "não andou". */
static uint16_t medir() {
    uint16_t v[5];
    for (int i = 0; i < 5; i++) {
        v[i] = hal_distancia_cm();
        delay(70);
    }
    for (int i = 1; i < 5; i++) {
        uint16_t x = v[i];
        int j = i - 1;
        while (j >= 0 && v[j] > x) { v[j + 1] = v[j]; j--; }
        v[j + 1] = x;
    }
    return v[2];
}

static void pulso(int16_t esq, int16_t dir, const char *rotulo, int16_t pwm) {
    uint16_t antes = medir();
    hal_motors(esq, dir);
    delay(MS_PULSO);
    hal_motors(0, 0);
    delay(MS_ASSENTA);
    uint16_t depois = medir();

    Serial.print(rotulo);
    Serial.print(" pwm="); Serial.print(pwm);
    Serial.print(" antes="); Serial.print(antes);
    Serial.print(" depois="); Serial.print(depois);
    Serial.print(" andou="); Serial.println((int)antes - (int)depois);
}

/* Volta para a marca sozinho, de ré, olhando o sensor. Sem isto o chão acaba:
   cada disparo come uns vinte centímetros, e uma varredura inteira precisaria
   de dez metros de corredor. Com isto o robô mede sempre do mesmo lugar. */
static void voltar(uint16_t alvo) {
    uint32_t limite = millis() + 3500;
    hal_motors(-255, -255);
    delay(250);
    hal_motors(-215, -215);
    while (millis() < limite) {
        if (hal_distancia_cm() >= alvo) break;
        delay(30);
    }
    hal_motors(0, 0);
    delay(MS_ASSENTA);
    Serial.print("voltou distancia=");
    Serial.println(medir());
}

void setup() {
    Serial.begin(115200);
    hal_esp32_setup();
    hal_motors(0, 0);
    delay(400);
    Serial.println();
    Serial.println("PRONTO regua de velocidade");
    Serial.println("  p<n>  pulso de 1,2 s nos dois motores, medindo quanto andou");
    Serial.println("  t<n>  pulso so no motor esquerdo    u<n>  so no direito");
    Serial.println("  c<n>  continua: ja andando, cai para n e mede");
    Serial.println("  m     so mede a distancia");
    Serial.println("  w<n>  volta de re ate a distancia n");
    Serial.println("  s     parar");
}

void loop() {
    if (!Serial.available()) return;
    String linha = Serial.readStringUntil('\n');
    linha.trim();
    if (linha.length() == 0) return;

    char c = linha.charAt(0);
    int16_t v = (int16_t)linha.substring(1).toInt();

    if (c == 's') { hal_motors(0, 0); Serial.println("parado"); }
    else if (c == 'm') { Serial.print("distancia="); Serial.println(medir()); }
    else if (c == 'p') pulso(v, v, "os_dois", v);
    else if (c == 't') pulso(v, 0, "esquerdo", v);
    else if (c == 'u') pulso(0, v, "direito", v);
    else if (c == 'c') {
        /* Sair da inércia custa mais que continuar. Aqui ele já vem andando a
           220 e só então cai para o valor pedido: é o mínimo que sustenta. */
        uint16_t antes;
        hal_motors(255, 255);
        delay(300);
        hal_motors(v, v);
        delay(300);
        antes = hal_distancia_cm();
        delay(MS_PULSO);
        hal_motors(0, 0);
        delay(MS_ASSENTA);
        uint16_t depois = medir();
        Serial.print("continua pwm="); Serial.print(v);
        Serial.print(" antes="); Serial.print(antes);
        Serial.print(" depois="); Serial.print(depois);
        Serial.print(" andou="); Serial.println((int)antes - (int)depois);
    }
    else if (c == 'w') voltar((uint16_t)v);
    else Serial.println("?");
}
