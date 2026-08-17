#include <stdio.h>
#include <string.h>
#include "quadros.h"

static int falhas;

#define CHECK(cond)                                                        \
    do {                                                                   \
        if (!(cond)) {                                                     \
            printf("  FALHOU %s:%d  %s\n", __FILE__, __LINE__, #cond);     \
            falhas++;                                                      \
        }                                                                  \
    } while (0)

static void teste_mensagem_inteira_num_pedaco(void) {
    printf("teste_mensagem_inteira_num_pedaco\n");
    Montador m;
    montador_init(&m);
    uint8_t dados[3] = { 0x02, 0, 0 };
    CHECK(montador_pedaco(&m, dados, 3, 0, 3, 1) == 3);
    CHECK(m.buf[0] == 0x02);
}

/* O caso que era descartado em silêncio: um quadro só, entregue em dois
   pedaços porque não coube no MTU. É o que acontece com todo programa acima
   de umas duzentas instruções. */
static void teste_um_quadro_em_dois_pedacos(void) {
    printf("teste_um_quadro_em_dois_pedacos\n");
    Montador m;
    montador_init(&m);
    uint8_t a[2] = { 1, 2 }, b[2] = { 3, 4 };
    CHECK(montador_pedaco(&m, a, 2, 0, 4, 1) == 0);
    CHECK(montador_pedaco(&m, b, 2, 2, 4, 1) == 4);
    CHECK(m.buf[0] == 1 && m.buf[3] == 4);
}

/* Mensagem partida em três quadros: só o último traz o bit final. */
static void teste_tres_quadros(void) {
    printf("teste_tres_quadros\n");
    Montador m;
    montador_init(&m);
    uint8_t a[2] = { 1, 2 }, b[2] = { 3, 4 }, c[2] = { 5, 6 };
    CHECK(montador_pedaco(&m, a, 2, 0, 2, 0) == 0);
    CHECK(montador_pedaco(&m, b, 2, 0, 2, 0) == 0);
    CHECK(montador_pedaco(&m, c, 2, 0, 2, 1) == 6);
    CHECK(m.buf[0] == 1 && m.buf[5] == 6);
}

/* Grande demais é descartada inteira, e o montador volta ao zero: meia
   mensagem guardada corromperia a seguinte. */
static void teste_grande_demais_nao_estraga_a_seguinte(void) {
    printf("teste_grande_demais_nao_estraga_a_seguinte\n");
    Montador m;
    montador_init(&m);
    static uint8_t enorme[MONTADOR_MAX + 10];
    memset(enorme, 7, sizeof(enorme));
    CHECK(montador_pedaco(&m, enorme, sizeof(enorme), 0, sizeof(enorme), 1) == 0);

    uint8_t ok[3] = { 0x03, 0, 0 };
    CHECK(montador_pedaco(&m, ok, 3, 0, 3, 1) == 3);
    CHECK(m.buf[0] == 0x03);
}

/* Um programa cheio: 1024 instruções mais o cabeçalho, entregue em pedaços de
   1400 bytes como a rede faria. É o tamanho que este conserto existe para
   aguentar. */
static void teste_programa_maximo_em_pedacos_de_mtu(void) {
    printf("teste_programa_maximo_em_pedacos_de_mtu\n");
    Montador m;
    montador_init(&m);
    static uint8_t inteiro[MONTADOR_MAX];
    for (unsigned i = 0; i < sizeof(inteiro); i++) inteiro[i] = (uint8_t)(i & 0xFF);

    uint32_t total = (uint32_t)sizeof(inteiro), enviado = 0, devolveu = 0;
    while (enviado < total) {
        uint32_t pedaco = (total - enviado > 1400) ? 1400 : total - enviado;
        devolveu = montador_pedaco(&m, inteiro + enviado, pedaco, enviado, total, 1);
        enviado += pedaco;
        if (enviado < total) CHECK(devolveu == 0);
    }
    CHECK(devolveu == total);
    CHECK(memcmp(m.buf, inteiro, total) == 0);
}

static void teste_mensagem_vazia_nao_conta(void) {
    printf("teste_mensagem_vazia_nao_conta\n");
    Montador m;
    montador_init(&m);
    CHECK(montador_pedaco(&m, NULL, 0, 0, 0, 1) == 0);
}

int main(void) {
    teste_mensagem_inteira_num_pedaco();
    teste_um_quadro_em_dois_pedacos();
    teste_tres_quadros();
    teste_grande_demais_nao_estraga_a_seguinte();
    teste_programa_maximo_em_pedacos_de_mtu();
    teste_mensagem_vazia_nao_conta();
    if (falhas == 0) { printf("\ntodos os testes passaram\n"); return 0; }
    printf("\n%d verificacao(oes) falharam\n", falhas);
    return 1;
}
