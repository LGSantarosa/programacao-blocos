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

int main(void) {
    teste_anda_reto();
    teste_giro_bate_com_a_calibracao();
    teste_sensor_ve_o_obstaculo();
    teste_sensor_ve_a_parede();
    teste_nao_atravessa_a_parede();
    teste_nao_atravessa_o_obstaculo();
    if (falhas == 0) { printf("\ntodos os testes passaram\n"); return 0; }
    printf("\n%d verificacao(oes) falharam\n", falhas);
    return 1;
}
