#include <Arduino.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <Ticker.h>
#include <WiFi.h>

extern "C" {
#include "hal.h"
#include "vm.h"
}
#include "quadros.h"

void hal_esp32_setup();

static const char *NOME_REDE = "Robo-01";
static const char *SENHA     = "robo1234";   /* mínimo 8 caracteres */

static const uint8_t T_LOAD = 0x01, T_RUN = 0x02, T_STOP = 0x03;
static const uint8_t T_PC = 0x81, T_STATE = 0x82, T_VALOR = 0x84;

static const int MAX_INSTR_LOOP = 256;
static const uint32_t PC_MIN_MS = 30;

static AsyncWebServer servidor(80);
static AsyncWebSocket ws("/");
static Ticker vigia;

static VM vm;

/* Uma mensagem grande chega partida, e antes disso ela era descartada. Ver
   firmware/src/quadros.h. Um montador só, e não um por cliente: dois editores
   abertos ao mesmo tempo embaralhariam o buffer — o que já valia para o código
   anterior, e com um robô e uma criança não acontece. */
static Montador montador;
/* A instrução em efeito agora, que não é a mesma que vm.pc: depois de
   executar um TURN, vm.pc já aponta para a seguinte enquanto o robô ainda
   está girando. É esta que o navegador traduz em bloco aceso. Igual ao
   host/main.c, de propósito: o navegador não sabe com qual dos dois fala. */
static uint16_t pc_exec = 0;
static uint16_t pc_enviado = 0xFFFF;
static uint32_t pc_ultimo_ms = 0;
static uint8_t  rodando_ant = 0;

/* Roda no contexto do timer, independente do loop() — é isso que faz o
   watchdog valer alguma coisa.

   Há uma corrida com o vm_tick() do loop(), assumida de propósito: os dois
   caminhos só empurram a VM na direção de "parada", nunca de volta. O pior
   caso é um vm_stop pela metade, e o tick seguinte termina o serviço. Um
   mutex aqui custaria mais do que resolve. */
static void checar_vigia() {
    vm_watchdog_check(&vm, hal_millis());
}

static void enviar_pc(uint16_t pc) {
    uint8_t q[3] = { T_PC, (uint8_t)(pc & 0xFF), (uint8_t)(pc >> 8) };
    ws.binaryAll(q, sizeof(q));
}

static void enviar_estado(uint8_t estado) {
    uint8_t q[2] = { T_STATE, estado };
    ws.binaryAll(q, sizeof(q));
}

/* int32 e não int16: a pilha da VM é de 32 bits, e uma conta da criança chega
   lá — 100 × 100 já não caberia. É o primeiro campo do protocolo com essa
   largura, de propósito.

   Mora aqui, e não no hal_esp32.cpp, porque relatar é ato de protocolo e não
   de hardware: o ws é desta casa, ao lado de enviar_pc e enviar_estado. */
extern "C" void hal_report(int32_t valor) {
    uint32_t v = (uint32_t)valor;
    uint8_t q[5] = { T_VALOR, (uint8_t)(v & 0xFF), (uint8_t)((v >> 8) & 0xFF),
                     (uint8_t)((v >> 16) & 0xFF), (uint8_t)((v >> 24) & 0xFF) };
    ws.binaryAll(q, sizeof(q));
}

static void aoEvento(AsyncWebSocket *, AsyncWebSocketClient *cliente,
                     AwsEventType tipo, void *arg, uint8_t *dados, size_t tam) {
    (void)cliente;
    if (tipo == WS_EVT_CONNECT) {
        /* Conexão nova começa do zero: meia mensagem de uma sessão anterior
           corromperia a primeira desta. */
        montador_init(&montador);
        enviar_estado(vm.rodando);
        return;
    }
    if (tipo != WS_EVT_DATA) return;

    AwsFrameInfo *info = (AwsFrameInfo *)arg;
    uint32_t n_msg = montador_pedaco(&montador, dados, (uint32_t)tam,
                                     (uint32_t)info->index, (uint32_t)info->len,
                                     info->final ? 1 : 0);
    if (n_msg == 0) return;   /* ainda falta pedaco, ou veio grande demais */

    const uint8_t *msg = montador.buf;
    switch (msg[0]) {
    case T_LOAD: {
        if (n_msg < 3) return;
        uint16_t n = (uint16_t)(msg[1] | (msg[2] << 8));
        if (n_msg != (uint32_t)(3 + n * INSTR_BYTES)) return;
        vm_load(&vm, msg + 3, (uint16_t)(n * INSTR_BYTES));
        pc_enviado = 0xFFFF;
        break;
    }
    case T_RUN:
        vm_run(&vm);
        pc_exec = 0;
        pc_enviado = 0xFFFF;
        break;
    case T_STOP:
        vm_stop(&vm);
        break;
    default:
        break;
    }
}

void setup() {
    Serial.begin(115200);
    hal_esp32_setup();
    vm_init(&vm);
    montador_init(&montador);

    if (!LittleFS.begin(true)) {
        Serial.println("LittleFS falhou");
    }

    WiFi.mode(WIFI_AP);
    WiFi.softAP(NOME_REDE, SENHA);
    Serial.print("rede ");
    Serial.print(NOME_REDE);
    Serial.print("  ->  http://");
    Serial.println(WiFi.softAPIP());

    ws.onEvent(aoEvento);
    servidor.addHandler(&ws);
    servidor.serveStatic("/", LittleFS, "/")
            .setDefaultFile("index.html");
    servidor.begin();

    vigia.attach_ms(50, checar_vigia);
}

void loop() {
    /* vm_tick precisa ser chamada mesmo durante um WAIT: ela já devolve sem
       executar instrução, mas é ela que atualiza o ultimo_tick que o
       checar_vigia() vigia. Pular a chamada faria qualquer espera maior que
       WATCHDOG_MS matar a própria VM. */
    for (int k = 0; k < MAX_INSTR_LOOP && vm.rodando; k++) {
        uint16_t antes  = vm.pc;
        uint8_t  rodava = vm.rodando;
        vm_tick(&vm);
        if (vm.pc != antes || (rodava && !vm.rodando)) pc_exec = antes;
        if (vm_esperando(&vm, hal_millis())) break;
    }

    uint32_t agora = hal_millis();
    if (pc_exec != pc_enviado && agora - pc_ultimo_ms >= PC_MIN_MS) {
        pc_enviado = pc_exec;
        pc_ultimo_ms = agora;
        enviar_pc(pc_exec);
    }
    if (vm.rodando != rodando_ant) {
        rodando_ant = vm.rodando;
        enviar_estado(vm.rodando);
    }

    ws.cleanupClients();
}
