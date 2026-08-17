/* Remonta uma mensagem WebSocket que chegou partida.

   O ESPAsyncWebServer entrega uma mensagem grande em vários pedaços — ou
   porque o quadro não coube no MTU, ou porque o cliente a mandou em vários
   quadros. O código anterior descartava qualquer coisa que não chegasse
   inteira de uma vez:

       if (!info->final || info->index != 0 || info->len != tam) return;

   Um programa de 256 instruções já são 1795 bytes, acima do MTU típico de
   1436 — ou seja, programa grande simplesmente não carregava, em silêncio.
   Nunca apareceu porque nada tinha rodado em hardware e os programas eram
   curtos; com o teto em 1024 instruções, viraria regra.

   É C puro e sem Arduino de propósito, para caber num teste de mesa. */
#ifndef QUADROS_H
#define QUADROS_H

#include <stdint.h>
#include <string.h>
#include "bytecode.h"

/* O maior T_LOAD possível: um byte de tipo, dois de contagem, e o programa. */
#define MONTADOR_MAX (3 + MAX_INSTR * INSTR_BYTES)

typedef struct {
    uint8_t  buf[MONTADOR_MAX];
    uint32_t recebido;
} Montador;

static inline void montador_init(Montador *m) {
    m->recebido = 0;
}

/* Recebe um pedaço. Devolve o tamanho da mensagem quando ela fica completa, ou
   0 enquanto falta pedaço — e também 0 quando a mensagem é grande demais, caso
   em que ela é descartada inteira e o montador volta ao zero. */
static inline uint32_t montador_pedaco(Montador *m, const uint8_t *dados,
                                       uint32_t tam, uint32_t indice,
                                       uint32_t total, int final) {
    if (m->recebido + tam > MONTADOR_MAX) {
        m->recebido = 0;
        return 0;
    }
    if (tam > 0 && dados != NULL) {
        memcpy(m->buf + m->recebido, dados, tam);
        m->recebido += tam;
    }
    /* Fim do quadro é (indice + tam == total); fim da mensagem é isso mais o
       bit final. Um quadro do meio tem final == 0 e não termina nada. */
    if (final && (indice + tam) >= total) {
        uint32_t n = m->recebido;
        m->recebido = 0;
        return n;
    }
    return 0;
}

#endif
