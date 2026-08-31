#ifndef LACO_H
#define LACO_H

#include <stdint.h>

/* O robô virtual sem casca. Recebe linhas do protocolo de texto e devolve
   linhas do protocolo de texto, e não sabe se do outro lado tem um stdin, um
   WebSocket ou um WebView. É o que o host/main.c era por dentro, tirado de
   cima do stdio para o app Android poder chamar a mesma coisa. */

#define LACO_FRAME_MS 5

#ifdef __cplusplus
extern "C" {
#endif

void laco_init(void);

/* Uma linha recebida: "L <hex>", "A <mm ...>", "R" ou "S". Sem o \n. */
void laco_linha(const char *l);

/* Avança o mundo em LACO_FRAME_MS e enfileira o que houver para dizer.
   Nunca dorme e nunca bloqueia: quem controla o compasso é o chamador. */
void laco_passo(void);

/* Tira a próxima linha da fila, sem \n. Devolve 1 se tirou, 0 se acabou. */
int laco_proxima_saida(char *dest, int tam);

#ifdef __cplusplus
}
#endif

#endif
