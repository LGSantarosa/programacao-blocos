/* O buraco que este teste fecha: a tradução do protocolo tem três
   implementações — `bridge/server.js`, `Traducao.kt` e a da placa — e só as
   duas primeiras tinham teste. Se a ordem dos bytes saísse trocada no
   firmware, nada na suíte notaria: o `T_DIST` só é exercitado do lado do
   JavaScript que o lê. Sobrava olho humano na frente do robô.

   Aqui os bytes são conferidos um a um, na ordem em que o DataView do
   navegador os lê (little-endian, ver web/rede.js). */
#include <stdio.h>
#include <string.h>
#include "protocolo.h"

static int falhas;

#define CHECK(cond)                                                        \
    do {                                                                   \
        if (!(cond)) {                                                     \
            printf("  FALHOU %s:%d  %s\n", __FILE__, __LINE__, #cond);     \
            falhas++;                                                      \
        }                                                                  \
    } while (0)

/* ---------- o que a placa manda ---------- */

static void teste_pc_vai_em_little_endian(void) {
    printf("teste_pc_vai_em_little_endian\n");
    uint8_t q[PROTOCOLO_MAX_QUADRO];
    CHECK(protocolo_pc(q, 0x0102) == 3);
    CHECK(q[0] == 0x81);
    CHECK(q[1] == 0x02);      /* byte baixo primeiro */
    CHECK(q[2] == 0x01);
}

static void teste_pc_no_maximo(void) {
    printf("teste_pc_no_maximo\n");
    uint8_t q[PROTOCOLO_MAX_QUADRO];
    protocolo_pc(q, 0xFFFF);
    CHECK(q[1] == 0xFF && q[2] == 0xFF);
    /* O 0xFFFF é o "nenhum pc enviado ainda" do main.cpp; tem de caber. */
    protocolo_pc(q, 0);
    CHECK(q[1] == 0 && q[2] == 0);
}

static void teste_estado_e_sempre_zero_ou_um(void) {
    printf("teste_estado_e_sempre_zero_ou_um\n");
    uint8_t q[PROTOCOLO_MAX_QUADRO];
    CHECK(protocolo_estado(q, 0) == 2);
    CHECK(q[0] == 0x82 && q[1] == 0);
    protocolo_estado(q, 1);
    CHECK(q[1] == 1);
    /* vm.rodando é uint8_t e nada impede um valor esquisito; o navegador
       compara com 1, então normalizar aqui é o que evita "rodando" mudo. */
    protocolo_estado(q, 7);
    CHECK(q[1] == 1);
}

static void teste_valor_positivo(void) {
    printf("teste_valor_positivo\n");
    uint8_t q[PROTOCOLO_MAX_QUADRO];
    CHECK(protocolo_valor(q, 0x01020304) == 5);
    CHECK(q[0] == 0x84);
    CHECK(q[1] == 0x04 && q[2] == 0x03 && q[3] == 0x02 && q[4] == 0x01);
}

static void teste_valor_negativo_vai_em_complemento_de_dois(void) {
    printf("teste_valor_negativo_vai_em_complemento_de_dois\n");
    /* O navegador lê com getInt32(1, true): -1 tem de chegar como FF FF FF FF,
       e não como um zero silencioso. A criança faz 3 - 5 no primeiro dia. */
    uint8_t q[PROTOCOLO_MAX_QUADRO];
    protocolo_valor(q, -1);
    CHECK(q[1] == 0xFF && q[2] == 0xFF && q[3] == 0xFF && q[4] == 0xFF);

    protocolo_valor(q, -2);
    CHECK(q[1] == 0xFE && q[2] == 0xFF && q[3] == 0xFF && q[4] == 0xFF);
}

static void teste_valor_grande_nao_cabe_em_int16(void) {
    printf("teste_valor_grande_nao_cabe_em_int16\n");
    /* 100 × 100 = 10000 cabe; 100 × 1000 não caberia em int16. É a razão de o
       campo ser de 32 bits. */
    uint8_t q[PROTOCOLO_MAX_QUADRO];
    protocolo_valor(q, 100000);
    int32_t volta = (int32_t)((uint32_t)q[1] | ((uint32_t)q[2] << 8) |
                              ((uint32_t)q[3] << 16) | ((uint32_t)q[4] << 24));
    CHECK(volta == 100000);
}

static void teste_distancia(void) {
    printf("teste_distancia\n");
    uint8_t q[PROTOCOLO_MAX_QUADRO];
    CHECK(protocolo_dist(q, 400) == 3);
    CHECK(q[0] == 0x85);
    CHECK(q[1] == 0x90 && q[2] == 0x01);      /* 400 = 0x0190 */
}

static void teste_a_placa_nunca_manda_telemetria(void) {
    printf("teste_a_placa_nunca_manda_telemetria\n");
    /* O 0x83 leva pose, e a placa não tem física. Se um quadro dela saísse com
       esse tipo, o desenho do robô saltaria para a origem e a missão se daria
       por cumprida sozinha. Nenhum montador desta casa pode emitir 0x83. */
    uint8_t q[PROTOCOLO_MAX_QUADRO];
    protocolo_pc(q, 1);       CHECK(q[0] != 0x83);
    protocolo_estado(q, 1);   CHECK(q[0] != 0x83);
    protocolo_valor(q, 1);    CHECK(q[0] != 0x83);
    protocolo_dist(q, 1);     CHECK(q[0] != 0x83);
}

/* ---------- o que a placa recebe ---------- */

static void teste_run_e_stop(void) {
    printf("teste_run_e_stop\n");
    uint8_t run[1] = { 0x02 }, stop[1] = { 0x03 };
    CHECK(protocolo_ler(run, 1).tipo == PEDIDO_RUN);
    CHECK(protocolo_ler(stop, 1).tipo == PEDIDO_STOP);
}

static void teste_load_de_uma_instrucao(void) {
    printf("teste_load_de_uma_instrucao\n");
    uint8_t msg[3 + INSTR_BYTES];
    memset(msg, 0, sizeof(msg));
    msg[0] = 0x01;
    msg[1] = 1;                        /* uma instrução */
    msg[3] = 0xAB;                     /* primeiro byte do programa */

    Pedido p = protocolo_ler(msg, sizeof(msg));
    CHECK(p.tipo == PEDIDO_LOAD);
    CHECK(p.bytes == INSTR_BYTES);
    CHECK(p.programa == msg + 3);
    CHECK(p.programa[0] == 0xAB);
}

static void teste_load_com_contagem_em_dois_bytes(void) {
    printf("teste_load_com_contagem_em_dois_bytes\n");
    /* 256 instruções: 0x0100. É onde a contagem passa a precisar do segundo
       byte, e onde um little-endian trocado apareceria como programa vazio. */
    static uint8_t msg[3 + 256 * INSTR_BYTES];
    memset(msg, 0, sizeof(msg));
    msg[0] = 0x01;
    msg[1] = 0x00;
    msg[2] = 0x01;

    Pedido p = protocolo_ler(msg, sizeof(msg));
    CHECK(p.tipo == PEDIDO_LOAD);
    CHECK(p.bytes == 256 * INSTR_BYTES);
}

static void teste_load_cortado_nao_vira_pedido(void) {
    printf("teste_load_cortado_nao_vira_pedido\n");
    /* Diz que traz duas instruções e traz uma. Carregar isso faria o robô
       andar o começo de algo que a criança não montou. */
    uint8_t msg[3 + INSTR_BYTES];
    memset(msg, 0, sizeof(msg));
    msg[0] = 0x01;
    msg[1] = 2;
    CHECK(protocolo_ler(msg, sizeof(msg)).tipo == PEDIDO_NADA);
}

static void teste_load_com_sobra_nao_vira_pedido(void) {
    printf("teste_load_com_sobra_nao_vira_pedido\n");
    uint8_t msg[3 + INSTR_BYTES + 1];
    memset(msg, 0, sizeof(msg));
    msg[0] = 0x01;
    msg[1] = 1;
    CHECK(protocolo_ler(msg, sizeof(msg)).tipo == PEDIDO_NADA);
}

static void teste_load_maior_que_a_vm_aguenta(void) {
    printf("teste_load_maior_que_a_vm_aguenta\n");
    /* MAX_INSTR + 1 não cabe na VM. A conta n * INSTR_BYTES ainda estoura o
       uint16 lá na frente, então a recusa tem de vir antes. */
    uint8_t msg[3];
    uint32_t instr = MAX_INSTR + 1;
    msg[0] = 0x01;
    msg[1] = (uint8_t)(instr & 0xFF);
    msg[2] = (uint8_t)(instr >> 8);
    CHECK(protocolo_ler(msg, 3).tipo == PEDIDO_NADA);
}

static void teste_load_vazio_e_valido(void) {
    printf("teste_load_vazio_e_valido\n");
    /* Zero instrução é o que chega quando a criança apaga tudo e aperta PLAY:
       carrega um programa vazio, e o robô fica parado. Não é erro. */
    uint8_t msg[3] = { 0x01, 0, 0 };
    Pedido p = protocolo_ler(msg, 3);
    CHECK(p.tipo == PEDIDO_LOAD);
    CHECK(p.bytes == 0);
}

static void teste_lixo_nao_vira_pedido(void) {
    printf("teste_lixo_nao_vira_pedido\n");
    uint8_t arena[1] = { 0x04 };       /* é do robô virtual, não da placa */
    uint8_t nada[1] = { 0x7F };
    CHECK(protocolo_ler(arena, 1).tipo == PEDIDO_NADA);
    CHECK(protocolo_ler(nada, 1).tipo == PEDIDO_NADA);
    CHECK(protocolo_ler(nada, 0).tipo == PEDIDO_NADA);
    CHECK(protocolo_ler(0, 3).tipo == PEDIDO_NADA);
}

static void teste_pedido_sem_load_nao_aponta_para_nada(void) {
    printf("teste_pedido_sem_load_nao_aponta_para_nada\n");
    uint8_t run[1] = { 0x02 };
    Pedido p = protocolo_ler(run, 1);
    CHECK(p.programa == 0 && p.bytes == 0);
}

int main(void) {
    teste_pc_vai_em_little_endian();
    teste_pc_no_maximo();
    teste_estado_e_sempre_zero_ou_um();
    teste_valor_positivo();
    teste_valor_negativo_vai_em_complemento_de_dois();
    teste_valor_grande_nao_cabe_em_int16();
    teste_distancia();
    teste_a_placa_nunca_manda_telemetria();
    teste_run_e_stop();
    teste_load_de_uma_instrucao();
    teste_load_com_contagem_em_dois_bytes();
    teste_load_cortado_nao_vira_pedido();
    teste_load_com_sobra_nao_vira_pedido();
    teste_load_maior_que_a_vm_aguenta();
    teste_load_vazio_e_valido();
    teste_lixo_nao_vira_pedido();
    teste_pedido_sem_load_nao_aponta_para_nada();

    if (falhas) {
        printf("\n%d verificação(ões) falharam\n", falhas);
        return 1;
    }
    printf("\ntodos os testes passaram\n");
    return 0;
}
