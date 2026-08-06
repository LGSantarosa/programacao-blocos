#include <stdio.h>
#include <string.h>
#include "fake_hal.h"
#include "hal.h"
#include "vm.h"

static int falhas;

#define CHECK(cond)                                                        \
    do {                                                                   \
        if (!(cond)) {                                                     \
            printf("  FALHOU %s:%d  %s\n", __FILE__, __LINE__, #cond);     \
            falhas++;                                                      \
        }                                                                  \
    } while (0)

/* Escreve uma instrução de 7 bytes e devolve o ponteiro seguinte. */
static uint8_t *emit(uint8_t *p, uint8_t op, int16_t a, int16_t b, int16_t c) {
    p[0] = op;
    p[1] = (uint8_t)(a & 0xFF); p[2] = (uint8_t)((a >> 8) & 0xFF);
    p[3] = (uint8_t)(b & 0xFF); p[4] = (uint8_t)((b >> 8) & 0xFF);
    p[5] = (uint8_t)(c & 0xFF); p[6] = (uint8_t)((c >> 8) & 0xFF);
    return p + INSTR_BYTES;
}

/* Carrega, zera o trace e começa a rodar. */
static void preparar(VM *vm, const uint8_t *prog, uint16_t n) {
    fake_clock_set(1000);
    fake_dist_set(400);
    vm_init(vm);
    CHECK(vm_load(vm, prog, n) == 1);
    fake_trace_reset();
    vm_run(vm);
}

/* Roda até parar, avançando o relógio 10 ms por tick. */
static void rodar_ate_parar(VM *vm) {
    for (int k = 0; k < 20000 && vm->rodando; k++) {
        vm_tick(vm);
        fake_clock_advance(10);
    }
    CHECK(!vm->rodando);
}

static void checar_trace(const char **esperado, int n) {
    CHECK(fake_trace_count() == n);
    int limite = fake_trace_count() < n ? fake_trace_count() : n;
    for (int i = 0; i < limite; i++) {
        if (strcmp(fake_trace_get(i), esperado[i]) != 0) {
            printf("  FALHOU trace[%d]: esperado \"%s\", veio \"%s\"\n",
                   i, esperado[i], fake_trace_get(i));
            falhas++;
        }
    }
    if (fake_trace_count() != n) {
        printf("  trace completo (%d entradas):\n", fake_trace_count());
        for (int i = 0; i < fake_trace_count(); i++)
            printf("    [%d] %s\n", i, fake_trace_get(i));
    }
}

static void teste_programa_vazio(void) {
    printf("teste_programa_vazio\n");
    VM vm;
    uint8_t prog[INSTR_BYTES];
    emit(prog, OP_HALT, 0, 0, 0);
    preparar(&vm, prog, sizeof(prog));
    vm_tick(&vm);
    CHECK(!vm.rodando);
    const char *esperado[] = { "MOTOR 0,0" };
    checar_trace(esperado, 1);
}

static void teste_sequencia_linear(void) {
    printf("teste_sequencia_linear\n");
    VM vm;
    uint8_t prog[4 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_MOTOR, 200, 200, 0);
    p = emit(p, OP_WAIT, 1000, 0, 0);
    p = emit(p, OP_MOTOR, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    preparar(&vm, prog, sizeof(prog));
    rodar_ate_parar(&vm);
    const char *esperado[] = { "MOTOR 200,200", "MOTOR 0,0", "MOTOR 0,0" };
    checar_trace(esperado, 3);
}

static void teste_wait_nao_avanca_antes_do_prazo(void) {
    printf("teste_wait_nao_avanca_antes_do_prazo\n");
    VM vm;
    uint8_t prog[2 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_WAIT, 1000, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    preparar(&vm, prog, sizeof(prog));

    vm_tick(&vm);                 /* executa o WAIT */
    CHECK(vm.pc == 1);
    CHECK(vm_esperando(&vm, hal_millis()));

    fake_clock_advance(999);
    vm_tick(&vm);
    CHECK(vm.rodando);            /* ainda esperando, não chegou no HALT */

    fake_clock_advance(2);
    vm_tick(&vm);
    CHECK(!vm.rodando);
}

int main(void) {
    teste_programa_vazio();
    teste_sequencia_linear();
    teste_wait_nao_avanca_antes_do_prazo();
    if (falhas == 0) { printf("\ntodos os testes passaram\n"); return 0; }
    printf("\n%d verificacao(oes) falharam\n", falhas);
    return 1;
}
