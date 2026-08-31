#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#include "hal.h"
#include "laco.h"

/* A casca de stdio do robô virtual. Todo o miolo mora no laco.c, que não sabe
   de onde as linhas vêm — é o que permite o app Android chamar o mesmo laço. */

/* Devolve 0 quando a entrada fechou — aí o robô virtual não tem mais com quem
   falar e o processo termina. Sem isso ele giraria para sempre. */
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
            laco_linha(buf);
            size_t resto = usado - (size_t)(nl - buf) - 1;
            memmove(buf, nl + 1, resto);
            usado = resto;
        }
        if (usado >= sizeof(buf) - 1) usado = 0;   /* linha absurda: descarta */
    }
    return n != 0;
}

int main(void) {
    fcntl(0, F_SETFL, O_NONBLOCK);
    setvbuf(stdout, NULL, _IOLBF, 0);
    laco_init();

    char linha[128];
    for (;;) {
        if (!ler_stdin()) { laco_linha("S"); return 0; }
        laco_passo();
        while (laco_proxima_saida(linha, sizeof(linha))) puts(linha);
        struct timespec ts = { 0, LACO_FRAME_MS * 1000000L };
        nanosleep(&ts, NULL);
    }
}
