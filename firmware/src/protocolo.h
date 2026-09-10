/* Traduz o protocolo binário: o que a placa manda para o navegador, e o que
   ela recebe dele.

   Por que isto saiu do main.cpp: a tradução tem três implementações — esta,
   a do `bridge/server.js` e a do `android/.../Traducao.kt` — e as outras duas
   têm teste. Esta, que é a que roda na placa, não tinha nenhum. Se a ordem dos
   bytes de um quadro saísse trocada aqui, nada na suíte notaria: o `T_DIST`
   só é exercitado do lado do JavaScript que o lê. Sobraria olho humano na
   frente do robô, que é o teste mais caro do projeto.

   É C puro e sem Arduino de propósito, para caber num teste de mesa — o mesmo
   caminho que o quadros.h já tinha aberto.

   Todo campo de mais de um byte vai em little-endian, porque é o que o
   DataView do navegador lê com `true` no segundo argumento (web/rede.js). */
#ifndef PROTOCOLO_H
#define PROTOCOLO_H

#include <stdint.h>
#include "bytecode.h"

/* Do navegador para a placa. O 0x04 (T_ARENA) existe no protocolo, mas é do
   robô virtual: a placa não tem arena para trocar, e ignorá-lo é o certo. */
#define T_LOAD  0x01
#define T_RUN   0x02
#define T_STOP  0x03

/* Da placa para o navegador. O 0x83 (T_TELEM) não aparece aqui de propósito:
   a placa não tem física, e pose inventada faria o desenho do robô saltar para
   a origem e a missão se dar por cumprida sozinha. */
#define T_PC    0x81
#define T_STATE 0x82
#define T_VALOR 0x84
#define T_DIST  0x85

/* O maior quadro que esta casa monta é o do valor: tipo + int32. */
#define PROTOCOLO_MAX_QUADRO 5

/* Cada um destes escreve o quadro em q e devolve quantos bytes escreveu. */

static inline uint32_t protocolo_pc(uint8_t *q, uint16_t pc) {
    q[0] = T_PC;
    q[1] = (uint8_t)(pc & 0xFF);
    q[2] = (uint8_t)(pc >> 8);
    return 3;
}

static inline uint32_t protocolo_estado(uint8_t *q, uint8_t rodando) {
    q[0] = T_STATE;
    q[1] = rodando ? 1 : 0;
    return 2;
}

/* int32 e não int16: a pilha da VM é de 32 bits, e uma conta da criança chega
   lá — 100 × 100 já não caberia. É o único campo do protocolo com essa
   largura. O cast por uint32_t é o que garante deslocamento definido para
   valor negativo. */
static inline uint32_t protocolo_valor(uint8_t *q, int32_t valor) {
    uint32_t v = (uint32_t)valor;
    q[0] = T_VALOR;
    q[1] = (uint8_t)(v & 0xFF);
    q[2] = (uint8_t)((v >> 8) & 0xFF);
    q[3] = (uint8_t)((v >> 16) & 0xFF);
    q[4] = (uint8_t)((v >> 24) & 0xFF);
    return 5;
}

static inline uint32_t protocolo_dist(uint8_t *q, uint16_t cm) {
    q[0] = T_DIST;
    q[1] = (uint8_t)(cm & 0xFF);
    q[2] = (uint8_t)(cm >> 8);
    return 3;
}

/* O que chegou do navegador, já conferido. */
typedef enum {
    PEDIDO_NADA = 0,      /* nada a fazer: tipo desconhecido ou malformado */
    PEDIDO_LOAD,
    PEDIDO_RUN,
    PEDIDO_STOP
} TipoPedido;

typedef struct {
    TipoPedido tipo;
    const uint8_t *programa;   /* só no LOAD: aponta para dentro da mensagem */
    uint16_t bytes;            /* só no LOAD: tamanho do programa em bytes */
} Pedido;

/* Lê uma mensagem já remontada (ver quadros.h) e diz o que ela pede.

   Um LOAD mentiroso — que diz ter mais instruções do que trouxe — não vira
   pedido nenhum. Vale a pena ser rígido aqui: carregar um programa cortado
   pela metade faria o robô andar o começo de algo que a criança não montou. */
static inline Pedido protocolo_ler(const uint8_t *msg, uint32_t n) {
    Pedido p;
    p.tipo = PEDIDO_NADA;
    p.programa = 0;
    p.bytes = 0;
    if (msg == 0 || n == 0) return p;

    switch (msg[0]) {
    case T_LOAD: {
        if (n < 3) return p;
        uint32_t instr = (uint32_t)(msg[1] | (msg[2] << 8));
        if (instr > MAX_INSTR) return p;
        if (n != 3 + instr * INSTR_BYTES) return p;
        p.tipo = PEDIDO_LOAD;
        p.programa = msg + 3;
        p.bytes = (uint16_t)(instr * INSTR_BYTES);
        return p;
    }
    case T_RUN:
        p.tipo = PEDIDO_RUN;
        return p;
    case T_STOP:
        p.tipo = PEDIDO_STOP;
        return p;
    default:
        return p;
    }
}

#endif
