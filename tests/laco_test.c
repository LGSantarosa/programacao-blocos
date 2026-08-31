#include <stdio.h>
#include <string.h>
#include "laco.h"
#include "relogio_falso.h"

static int falhas;

#define CHECK(cond)                                                        \
    do {                                                                   \
        if (!(cond)) {                                                     \
            printf("  FALHOU %s:%d  %s\n", __FILE__, __LINE__, #cond);     \
            falhas++;                                                      \
        }                                                                  \
    } while (0)

/* O mesmo programa dourado do tests/host_test.sh, encurtado: anda 1 s e para.
   Sete bytes por instrução, little-endian. */
static const char *PROG_ANDAR =
    "08c80000000000"   /* PUSH 200          */
    "08c80000000000"   /* PUSH 200          */
    "01000000000000"   /* MOTOR             */
    "08e80300000000"   /* PUSH 1000         */
    "02000000000000"   /* WAIT              */
    "08000000000000"   /* PUSH 0            */
    "08000000000000"   /* PUSH 0            */
    "01000000000000"   /* MOTOR             */
    "00000000000000";  /* HALT              */

/* Roda o laço n vezes, avançando o relógio LACO_FRAME_MS por vez, e junta
   tudo o que saiu num buffer só. */
static void rodar(char *saida, size_t tam, int n) {
    saida[0] = '\0';
    char linha[128];
    for (int k = 0; k < n; k++) {
        laco_passo();
        while (laco_proxima_saida(linha, sizeof(linha))) {
            if (strlen(saida) + strlen(linha) + 2 < tam) {
                strcat(saida, linha);
                strcat(saida, "\n");
            }
        }
        relogio_avancar(LACO_FRAME_MS);
    }
}

/* O y da primeira linha T e o maior y visto. É como o host_test.sh prova que
   o robô saiu do lugar. */
static void faixa_de_y(const char *saida, int *primeiro, int *maior) {
    *primeiro = 0;
    *maior = 0;
    int achou = 0;
    const char *p = saida;
    while ((p = strstr(p, "T ")) != NULL) {
        if (p != saida && p[-1] != '\n') { p += 2; continue; }
        int x, y;
        if (sscanf(p, "T %d %d", &x, &y) == 2) {
            if (!achou) { *primeiro = y; *maior = y; achou = 1; }
            else if (y > *maior) *maior = y;
        }
        p += 2;
    }
}

int main(void) {
    char saida[65536];
    char linha[128];
    int primeiro_y, maior_y;

    printf("laco_test\n");

    /* Sem programa e sem RUN, o laço só emite telemetria — e nunca diz que
       começou a rodar. */
    relogio_set(1000);
    laco_init();
    rodar(saida, sizeof(saida), 40);
    CHECK(strncmp(saida, "T ", 2) == 0 || strstr(saida, "\nT ") != NULL);
    CHECK(strstr(saida, "E 1") == NULL);

    /* Com programa e RUN: anuncia que começou, reporta pc, anda e termina. */
    relogio_set(1000);
    laco_init();
    char carga[512];
    snprintf(carga, sizeof(carga), "L %s", PROG_ANDAR);
    laco_linha(carga);
    laco_linha("R");
    rodar(saida, sizeof(saida), 600);
    CHECK(strstr(saida, "E 1") != NULL);
    CHECK(strstr(saida, "P ")  != NULL);
    CHECK(strstr(saida, "E 0") != NULL);

    /* Saiu do lugar. Sem isto o teste passaria mesmo com a física desligada. */
    faixa_de_y(saida, &primeiro_y, &maior_y);
    CHECK(maior_y > primeiro_y + 100);

    /* STOP no meio para a VM. */
    relogio_set(1000);
    laco_init();
    laco_linha(carga);
    laco_linha("R");
    rodar(saida, sizeof(saida), 20);
    CHECK(strstr(saida, "E 1") != NULL);
    laco_linha("S");
    rodar(saida, sizeof(saida), 20);
    CHECK(strstr(saida, "E 0") != NULL);

    /* A arena chega em milímetros e muda onde o robô nasce. */
    relogio_set(1000);
    laco_init();
    laco_linha("A 1500 300 900 0");
    rodar(saida, sizeof(saida), 5);
    faixa_de_y(saida, &primeiro_y, &maior_y);
    CHECK(primeiro_y > 250 && primeiro_y < 350);

    /* A fila vazia devolve 0, e não lixo. */
    while (laco_proxima_saida(linha, sizeof(linha))) { }
    CHECK(laco_proxima_saida(linha, sizeof(linha)) == 0);

    /* Linha torta não derruba nada. */
    laco_linha("");
    laco_linha("Z 1 2 3");
    laco_linha("L naoehex");
    laco_passo();

    if (falhas == 0) printf("  todos os testes passaram\n");
    return falhas != 0;
}
