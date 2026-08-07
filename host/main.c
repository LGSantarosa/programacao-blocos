#include <fcntl.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#include "hal.h"
#include "physics.h"
#include "vm.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#define FRAME_MS      5
#define TELEM_MS      50
#define PC_MIN_MS     30
#define MAX_INSTR_FRAME 256

static VM       vm;
static uint8_t  prog_bytes[MAX_INSTR * INSTR_BYTES];
/* A instrução que está em efeito agora, que não é a mesma que vm.pc: depois
   de executar um TURN, vm.pc já aponta para a instrução seguinte enquanto o
   robô ainda está girando. É esta que o navegador traduz em bloco aceso. */
static uint16_t pc_exec      = 0;
static uint16_t pc_enviado   = 0xFFFF;
static uint32_t pc_ultimo_ms = 0;
static uint8_t  rodando_ant  = 0;

static int hex_nib(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

static void processar_linha(char *l) {
    if (l[0] == 'L') {
        char *h = l + 1;
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
    } else if (l[0] == 'R') {
        fis_init();
        vm_run(&vm);
        pc_exec    = 0;
        pc_enviado = 0xFFFF;
    } else if (l[0] == 'S') {
        vm_stop(&vm);
    }
}

/* Devolve 0 quando a entrada fechou — aí o robô virtual não tem mais com
   quem falar e o processo termina. Sem isso ele giraria para sempre. */
static int ler_stdin(void) {
    static char   buf[8192];
    static size_t usado = 0;
    ssize_t n;

    while ((n = read(0, buf + usado, sizeof(buf) - usado - 1)) != 0) {
        if (n < 0) break;                          /* nada disponível agora */
        usado += (size_t)n;
        char *nl;
        while ((nl = memchr(buf, '\n', usado)) != NULL) {
            *nl = '\0';
            processar_linha(buf);
            size_t resto = usado - (size_t)(nl - buf) - 1;
            memmove(buf, nl + 1, resto);
            usado = resto;
        }
        if (usado >= sizeof(buf) - 1) usado = 0;   /* linha absurda: descarta */
    }
    return n != 0;
}

static void emitir_pc(uint32_t agora) {
    if (pc_exec == pc_enviado) return;
    if (agora - pc_ultimo_ms < PC_MIN_MS) return;
    pc_enviado   = pc_exec;
    pc_ultimo_ms = agora;
    printf("P %u\n", (unsigned)pc_exec);
}

static void emitir_telem(void) {
    double x, y, th;
    fis_pose(&x, &y, &th);
    double graus = th * 180.0 / M_PI;
    if (graus < 0.0) graus += 360.0;
    printf("T %d %d %d %u %d\n",
           (int)(x * 1000.0 + 0.5),
           (int)(y * 1000.0 + 0.5),
           (int)(graus * 10.0 + 0.5),
           (unsigned)fis_distancia_cm(),
           fis_colidiu());
}

int main(void) {
    fcntl(0, F_SETFL, O_NONBLOCK);
    setvbuf(stdout, NULL, _IOLBF, 0);

    vm_init(&vm);
    fis_init();

    uint32_t telem_ultimo = 0;

    for (;;) {
        if (!ler_stdin()) { vm_stop(&vm); return 0; }

        uint32_t agora = hal_millis();

        /* vm_tick precisa ser chamada mesmo durante um WAIT: ela já devolve
           sem executar instrução, mas é ela que alimenta o ultimo_tick do
           watchdog. Pular a chamada faria a espera matar a própria VM. */
        for (int k = 0; k < MAX_INSTR_FRAME && vm.rodando; k++) {
            uint16_t antes  = vm.pc;
            uint8_t  rodava = vm.rodando;
            vm_tick(&vm);
            /* Executou de fato? O tick não faz nada quando ainda está
               esperando, e aí a instrução em efeito continua a mesma. */
            if (vm.pc != antes || (rodava && !vm.rodando)) pc_exec = antes;
            if (vm_esperando(&vm, hal_millis())) break;
        }
        emitir_pc(agora);

        fis_passo(FRAME_MS / 1000.0);
        vm_watchdog_check(&vm, agora);

        if (vm.rodando != rodando_ant) {
            rodando_ant = vm.rodando;
            printf("E %u\n", (unsigned)vm.rodando);
        }

        if (agora - telem_ultimo >= TELEM_MS) {
            telem_ultimo = agora;
            emitir_telem();
        }

        struct timespec ts = { 0, FRAME_MS * 1000000L };
        nanosleep(&ts, NULL);
    }
}
