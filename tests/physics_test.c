#include <math.h>
#include <stdio.h>
#include "physics.h"

static int falhas;

#define CHECK(cond)                                                        \
    do {                                                                   \
        if (!(cond)) {                                                     \
            printf("  FALHOU %s:%d  %s\n", __FILE__, __LINE__, #cond);     \
            falhas++;                                                      \
        }                                                                  \
    } while (0)

/* Integra por `segundos` em passos de 5 ms, como faz o laço do host. */
static void avancar(double segundos) {
    int passos = (int)(segundos / 0.005 + 0.5);
    for (int k = 0; k < passos; k++) fis_passo(0.005);
}

static void teste_anda_reto(void) {
    printf("teste_anda_reto\n");
    fis_init();
    fis_set_pose(1.0, 0.4, M_PI / 2);   /* apontando para +y */
    fis_set_motores(255, 255);
    avancar(1.0);
    double x, y, th;
    fis_pose(&x, &y, &th);
    CHECK(fabs(x - 1.0) < 0.01);
    CHECK(fabs(y - 0.70) < 0.01);       /* 0.4 + V_MAX * 1 s */
    CHECK(fabs(th - M_PI / 2) < 0.01);
}

static void teste_giro_bate_com_a_calibracao(void) {
    printf("teste_giro_bate_com_a_calibracao\n");
    fis_init();
    fis_set_pose(1.0, 1.0, 0.0);
    fis_set_motores(180, -180);         /* o que o opcode TURN 90 faz */
    avancar(0.450);                     /* 90 * MS_POR_GRAU ms         */
    double x, y, th;
    fis_pose(&x, &y, &th);
    /* Gira no lugar, sentido horário, ~91 graus (1% de erro é o esperado). */
    CHECK(fabs(x - 1.0) < 0.005);
    CHECK(fabs(y - 1.0) < 0.005);
    double graus = -th * 180.0 / M_PI;
    CHECK(graus > 88.0 && graus < 94.0);
}

static void teste_sensor_ve_o_obstaculo(void) {
    printf("teste_sensor_ve_o_obstaculo\n");
    fis_init();
    /* Obstáculo começa em y = 1.40. Sensor fica a RAIO_ROBO à frente,
       em y = 0.48. Distância esperada: 92 cm. */
    fis_set_pose(1.0, 0.40, M_PI / 2);
    uint16_t d = fis_distancia_cm();
    CHECK(d >= 91 && d <= 93);
}

static void teste_sensor_ve_a_parede(void) {
    printf("teste_sensor_ve_a_parede\n");
    fis_init();
    /* Apontando para +x, parede em x = 2.00, sensor em x = 1.08. */
    fis_set_pose(1.0, 0.40, 0.0);
    uint16_t d = fis_distancia_cm();
    CHECK(d >= 91 && d <= 93);
}

static void teste_nao_atravessa_a_parede(void) {
    printf("teste_nao_atravessa_a_parede\n");
    fis_init();
    fis_set_pose(1.0, 1.80, M_PI / 2);
    fis_set_motores(255, 255);
    avancar(3.0);                        /* muito mais do que caberia */
    double x, y, th;
    fis_pose(&x, &y, &th);
    CHECK(y <= ARENA_LADO - RAIO_ROBO + 0.001);
    CHECK(y > 1.80);                     /* mas andou alguma coisa */
}

static void teste_nao_atravessa_o_obstaculo(void) {
    printf("teste_nao_atravessa_o_obstaculo\n");
    fis_init();
    fis_set_pose(1.0, 0.40, M_PI / 2);
    fis_set_motores(255, 255);
    avancar(5.0);
    double x, y, th;
    fis_pose(&x, &y, &th);
    CHECK(y < 1.40);                     /* parou antes do obstáculo */
    CHECK(y > 1.20);
}

static void teste_colidiu_e_zero_andando_livre(void) {
    printf("teste_colidiu_e_zero_andando_livre\n");
    fis_init();
    fis_set_pose(1.0, 0.40, M_PI / 2);
    CHECK(fis_colidiu() == 0);
    fis_set_motores(255, 255);
    avancar(0.5);
    CHECK(fis_colidiu() == 0);
}

static void teste_colidiu_marca_ao_bater_na_parede(void) {
    printf("teste_colidiu_marca_ao_bater_na_parede\n");
    fis_init();
    fis_set_pose(1.0, 1.90, M_PI / 2);   /* colado na parede de cima */
    fis_set_motores(255, 255);
    avancar(1.0);
    CHECK(fis_colidiu() == 1);
}

static void teste_colidiu_volta_a_zero_ao_se_afastar(void) {
    printf("teste_colidiu_volta_a_zero_ao_se_afastar\n");
    fis_init();
    fis_set_pose(1.0, 1.90, M_PI / 2);
    fis_set_motores(255, 255);
    avancar(1.0);
    CHECK(fis_colidiu() == 1);

    fis_set_motores(-255, -255);          /* de ré, sai de perto */
    avancar(0.5);
    CHECK(fis_colidiu() == 0);
}

static void teste_arena_trocavel(void) {
    printf("teste_arena_trocavel\n");
    /* Um corredor estreito: paredes em x=0.6 e x=1.4, robô entrando por baixo. */
    FisRect corredor[2] = {
        { 0.00, 0.80, 0.60, 1.00 },
        { 1.40, 0.80, 2.00, 1.00 }
    };
    fis_definir_arena(1.0, 0.30, M_PI / 2, corredor, 2);
    fis_init();
    double x, y, th;
    fis_pose(&x, &y, &th);
    CHECK(fabs(x - 1.0) < 0.001);
    CHECK(fabs(y - 0.30) < 0.001);   /* nasce onde a fase mandou */

    /* Pelo meio do corredor ele passa. */
    fis_set_motores(255, 255);
    avancar(3.0);
    fis_pose(&x, &y, &th);
    CHECK(y > 1.10);

    /* Contra a parede nova ele para. */
    fis_definir_arena(0.30, 0.30, M_PI / 2, corredor, 2);
    fis_init();
    fis_set_motores(255, 255);
    avancar(4.0);
    fis_pose(&x, &y, &th);
    CHECK(y < 0.80);                 /* barrado pelo bloco da esquerda */
    CHECK(fis_colidiu() == 1);
}

static void teste_arena_vazia_so_tem_paredes(void) {
    printf("teste_arena_vazia_so_tem_paredes\n");
    fis_definir_arena(1.0, 1.0, M_PI / 2, NULL, 0);
    fis_init();
    fis_set_motores(255, 255);
    avancar(6.0);
    double x, y, th;
    fis_pose(&x, &y, &th);
    CHECK(y > 1.85);                 /* foi até a parede de cima, sem obstáculo */
    CHECK(y <= ARENA_LADO - RAIO_ROBO + 0.001);
}

static void teste_arena_nao_estoura_o_limite(void) {
    printf("teste_arena_nao_estoura_o_limite\n");
    FisRect muitos[MAX_OBSTACULOS + 10];
    for (int i = 0; i < MAX_OBSTACULOS + 10; i++) {
        muitos[i].x0 = 0.1; muitos[i].y0 = 0.1;
        muitos[i].x1 = 0.2; muitos[i].y1 = 0.2;
    }
    /* Mais do que cabe: aceita o que cabe e não escreve fora do vetor. */
    fis_definir_arena(1.0, 0.4, M_PI / 2, muitos, MAX_OBSTACULOS + 10);
    fis_init();
    CHECK(fis_colidiu() == 0);
}

/* Devolve a arena padrão, para os testes seguintes não herdarem a fase. */
static void arena_padrao(void) {
    FisRect um = { 0.80, 1.40, 1.20, 1.60 };
    fis_definir_arena(1.0, 0.40, M_PI / 2, &um, 1);
}

int main(void) {
    teste_anda_reto();
    teste_giro_bate_com_a_calibracao();
    teste_sensor_ve_o_obstaculo();
    teste_sensor_ve_a_parede();
    teste_nao_atravessa_a_parede();
    teste_nao_atravessa_o_obstaculo();
    teste_colidiu_e_zero_andando_livre();
    teste_colidiu_marca_ao_bater_na_parede();
    teste_colidiu_volta_a_zero_ao_se_afastar();
    teste_arena_trocavel();
    teste_arena_vazia_so_tem_paredes();
    teste_arena_nao_estoura_o_limite();
    arena_padrao();
    if (falhas == 0) { printf("\ntodos os testes passaram\n"); return 0; }
    printf("\n%d verificacao(oes) falharam\n", falhas);
    return 1;
}
