#include <math.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "hal.h"
#include "laco.h"
#include "physics.h"
#include "vm.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#define TELEM_MS        50
#define PC_MIN_MS       30
#define MAX_INSTR_FRAME 256

#define MAX_SAIDA  64
#define TAM_LINHA  64

static VM       vm;
static uint8_t  prog_bytes[MAX_INSTR * INSTR_BYTES];
/* A instrução que está em efeito agora, que não é a mesma que vm.pc: depois
   de executar um TURN, vm.pc já aponta para a instrução seguinte enquanto o
   robô ainda está girando. É esta que o navegador traduz em bloco aceso. */
static uint16_t pc_exec      = 0;
static uint16_t pc_enviado   = 0xFFFF;
static uint32_t pc_ultimo_ms = 0;
static uint8_t  rodando_ant  = 0;
static uint32_t telem_ultimo = 0;

static char fila[MAX_SAIDA][TAM_LINHA];
static int  fila_ini, fila_n;

/* Fila cheia descarta a linha nova, e não a velha: a antiga já é um fato que
   o outro lado precisa ver na ordem. Com um consumidor que drena a cada passo
   ela não enche — 64 linhas é folga de mais de um segundo. */
static void enfileirar(const char *fmt, ...) {
    if (fila_n >= MAX_SAIDA) return;
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(fila[(fila_ini + fila_n) % MAX_SAIDA], TAM_LINHA, fmt, ap);
    va_end(ap);
    fila_n++;
}

/* Relatar é ato de protocolo, e não de hardware — o mesmo motivo pelo qual ele
   mora no firmware/src/main.cpp e não no hal_esp32.cpp. */
void hal_report(int32_t valor) {
    enfileirar("V %d", (int)valor);
}

static int hex_nib(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

void laco_linha(const char *l) {
    if (l == NULL || l[0] == '\0') return;
    if (l[0] == 'L') {
        const char *h = l + 1;
        while (*h == ' ') h++;
        size_t len = strlen(h);
        if (len % 2 != 0 || len / 2 > sizeof(prog_bytes)) return;
        for (size_t i = 0; i < len / 2; i++) {
            int hi = hex_nib(h[2 * i]), lo = hex_nib(h[2 * i + 1]);
            if (hi < 0 || lo < 0) return;
            prog_bytes[i] = (uint8_t)((hi << 4) | lo);
        }
        vm_load(&vm, prog_bytes, (uint16_t)(len / 2));
        pc_enviado = 0xFFFF;
    } else if (l[0] == 'A') {
        /* A <x_mm> <y_mm> <theta_decigraus> <n> <x0 y0 x1 y1>*n — a fase.
           Tudo em milímetros: inteiro atravessa o protocolo sem arredondar
           diferente dos dois lados. */
        int n = 0, lidos = 0;
        const char *p = l + 1;
        long v[4 + MAX_OBSTACULOS * 4];
        while (lidos < (int)(sizeof(v) / sizeof(v[0]))) {
            char *fim;
            long x = strtol(p, &fim, 10);
            if (fim == p) break;
            v[lidos++] = x;
            p = fim;
        }
        if (lidos < 4) return;
        double px = v[0] / 1000.0, py = v[1] / 1000.0;
        double pt = (v[2] / 10.0) * M_PI / 180.0;
        n = (int)v[3];
        if (n < 0) n = 0;
        if (n > MAX_OBSTACULOS) n = MAX_OBSTACULOS;
        if (lidos < 4 + n * 4) return;      /* mensagem cortada: ignora inteira */
        FisRect r[MAX_OBSTACULOS];
        for (int i = 0; i < n; i++) {
            r[i].x0 = v[4 + i * 4 + 0] / 1000.0;
            r[i].y0 = v[4 + i * 4 + 1] / 1000.0;
            r[i].x1 = v[4 + i * 4 + 2] / 1000.0;
            r[i].y1 = v[4 + i * 4 + 3] / 1000.0;
        }
        fis_definir_arena(px, py, pt, r, n);
        fis_init();
    } else if (l[0] == 'R') {
        fis_init();
        vm_run(&vm);
        pc_exec    = 0;
        pc_enviado = 0xFFFF;
    } else if (l[0] == 'S') {
        vm_stop(&vm);
    }
}

static void emitir_pc(uint32_t agora) {
    if (pc_exec == pc_enviado) return;
    if (agora - pc_ultimo_ms < PC_MIN_MS) return;
    pc_enviado   = pc_exec;
    pc_ultimo_ms = agora;
    enfileirar("P %u", (unsigned)pc_exec);
}

static void emitir_telem(void) {
    double x, y, th;
    fis_pose(&x, &y, &th);
    double graus = th * 180.0 / M_PI;
    if (graus < 0.0) graus += 360.0;
    enfileirar("T %d %d %d %u %d",
               (int)(x * 1000.0 + 0.5),
               (int)(y * 1000.0 + 0.5),
               (int)(graus * 10.0 + 0.5),
               (unsigned)fis_distancia_cm(),
               fis_colidiu());
}

void laco_init(void) {
    fila_ini     = 0;
    fila_n       = 0;
    pc_exec      = 0;
    pc_enviado   = 0xFFFF;
    pc_ultimo_ms = 0;
    rodando_ant  = 0;
    telem_ultimo = 0;
    vm_init(&vm);
    fis_init();
}

void laco_passo(void) {
    uint32_t agora = hal_millis();

    /* vm_tick precisa ser chamada mesmo durante um WAIT: ela já devolve sem
       executar instrução, mas é ela que alimenta o ultimo_tick do watchdog.
       Pular a chamada faria a espera matar a própria VM. */
    for (int k = 0; k < MAX_INSTR_FRAME && vm.rodando; k++) {
        uint16_t antes  = vm.pc;
        uint8_t  rodava = vm.rodando;
        vm_tick(&vm);
        /* Executou de fato? O tick não faz nada quando ainda está esperando,
           e aí a instrução em efeito continua a mesma. */
        if (vm.pc != antes || (rodava && !vm.rodando)) pc_exec = antes;
        if (vm_esperando(&vm, hal_millis())) break;
    }
    emitir_pc(agora);

    fis_passo(LACO_FRAME_MS / 1000.0);
    vm_watchdog_check(&vm, agora);

    if (vm.rodando != rodando_ant) {
        rodando_ant = vm.rodando;
        enfileirar("E %u", (unsigned)vm.rodando);
    }

    if (agora - telem_ultimo >= TELEM_MS) {
        telem_ultimo = agora;
        emitir_telem();
    }
}

int laco_proxima_saida(char *dest, int tam) {
    if (fila_n == 0 || tam <= 0) return 0;
    snprintf(dest, (size_t)tam, "%s", fila[fila_ini]);
    fila_ini = (fila_ini + 1) % MAX_SAIDA;
    fila_n--;
    return 1;
}
