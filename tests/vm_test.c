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

static void teste_repetir_tres_vezes(void) {
    printf("teste_repetir_tres_vezes\n");
    VM vm;
    uint8_t prog[4 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_SET_REG, 0, 3, 0);   /* r0 = 3          */
    p = emit(p, OP_MOTOR, 1, 1, 0);     /* corpo (pc = 1)  */
    p = emit(p, OP_DEC_JNZ, 0, 1, 0);   /* volta para pc 1 */
    p = emit(p, OP_HALT, 0, 0, 0);
    preparar(&vm, prog, sizeof(prog));
    rodar_ate_parar(&vm);
    const char *esperado[] = {
        "MOTOR 1,1", "MOTOR 1,1", "MOTOR 1,1", "MOTOR 0,0"
    };
    checar_trace(esperado, 4);
}

static void teste_laco_aninhado(void) {
    printf("teste_laco_aninhado\n");
    VM vm;
    /* repetir 3 { repetir 2 { motor } } -> 6 execuções do corpo */
    uint8_t prog[6 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_SET_REG, 0, 3, 0);   /* pc 0: r0 = 3            */
    p = emit(p, OP_SET_REG, 1, 2, 0);   /* pc 1: r1 = 2            */
    p = emit(p, OP_MOTOR, 7, 7, 0);     /* pc 2: corpo interno     */
    p = emit(p, OP_DEC_JNZ, 1, 2, 0);   /* pc 3: volta para pc 2   */
    p = emit(p, OP_DEC_JNZ, 0, 1, 0);   /* pc 4: volta para pc 1   */
    p = emit(p, OP_HALT, 0, 0, 0);      /* pc 5                    */
    preparar(&vm, prog, sizeof(prog));
    rodar_ate_parar(&vm);
    CHECK(fake_trace_count() == 7);     /* 6 corpos + MOTOR 0,0 do HALT */
    for (int i = 0; i < 6 && i < fake_trace_count(); i++)
        CHECK(strcmp(fake_trace_get(i), "MOTOR 7,7") == 0);
}

static void teste_jmp_incondicional(void) {
    printf("teste_jmp_incondicional\n");
    VM vm;
    uint8_t prog[3 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_JMP, 2, 0, 0);      /* pula por cima do MOTOR */
    p = emit(p, OP_MOTOR, 9, 9, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    preparar(&vm, prog, sizeof(prog));
    rodar_ate_parar(&vm);
    const char *esperado[] = { "MOTOR 0,0" };
    checar_trace(esperado, 1);
}

static void teste_turn_desliga_motores_no_fim(void) {
    printf("teste_turn_desliga_motores_no_fim\n");
    VM vm;
    uint8_t prog[2 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TURN, 90, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    preparar(&vm, prog, sizeof(prog));

    vm_tick(&vm);                       /* executa o TURN */
    CHECK(fake_trace_count() == 1);
    CHECK(strcmp(fake_trace_get(0), "MOTOR 180,-180") == 0);

    fake_clock_advance(90 * MS_POR_GRAU - 10);
    vm_tick(&vm);
    CHECK(fake_trace_count() == 1);     /* ainda girando */

    fake_clock_advance(20);
    vm_tick(&vm);                       /* prazo venceu: desliga e faz o HALT */
    CHECK(!vm.rodando);
    CHECK(fake_trace_count() >= 2);
    CHECK(strcmp(fake_trace_get(1), "MOTOR 0,0") == 0);
}

static void teste_turn_esquerda_inverte_os_motores(void) {
    printf("teste_turn_esquerda_inverte_os_motores\n");
    VM vm;
    uint8_t prog[2 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TURN, -90, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    preparar(&vm, prog, sizeof(prog));
    vm_tick(&vm);
    CHECK(strcmp(fake_trace_get(0), "MOTOR -180,180") == 0);
}

static void teste_sensor_perto_entra_no_corpo(void) {
    printf("teste_sensor_perto_entra_no_corpo\n");
    VM vm;
    uint8_t prog[3 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_JMP_IF_GE, SENSOR_DISTANCIA, 20, 2);  /* >= 20 cm: pula */
    p = emit(p, OP_MOTOR, 5, 5, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    preparar(&vm, prog, sizeof(prog));
    fake_dist_set(10);                   /* obstáculo perto */
    rodar_ate_parar(&vm);
    const char *esperado[] = { "MOTOR 5,5", "MOTOR 0,0" };
    checar_trace(esperado, 2);
}

static void teste_sensor_longe_pula_o_corpo(void) {
    printf("teste_sensor_longe_pula_o_corpo\n");
    VM vm;
    uint8_t prog[3 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_JMP_IF_GE, SENSOR_DISTANCIA, 20, 2);
    p = emit(p, OP_MOTOR, 5, 5, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    preparar(&vm, prog, sizeof(prog));
    fake_dist_set(150);                  /* caminho livre */
    rodar_ate_parar(&vm);
    const char *esperado[] = { "MOTOR 0,0" };
    checar_trace(esperado, 1);
}

static void teste_stop_no_meio_zera_motores(void) {
    printf("teste_stop_no_meio_zera_motores\n");
    VM vm;
    uint8_t prog[3 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_MOTOR, 200, 200, 0);
    p = emit(p, OP_WAIT, 5000, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    preparar(&vm, prog, sizeof(prog));
    vm_tick(&vm);
    vm_tick(&vm);
    CHECK(vm.rodando);
    vm_stop(&vm);
    CHECK(!vm.rodando);
    const char *esperado[] = { "MOTOR 200,200", "MOTOR 0,0" };
    checar_trace(esperado, 2);
}

static void teste_watchdog_corta_motores(void) {
    printf("teste_watchdog_corta_motores\n");
    VM vm;
    uint8_t prog[3 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_MOTOR, 200, 200, 0);
    p = emit(p, OP_WAIT, 30000, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    preparar(&vm, prog, sizeof(prog));
    vm_tick(&vm);
    vm_tick(&vm);

    /* Ninguém chama vm_tick por muito tempo: o vigia independente age. */
    fake_clock_advance(WATCHDOG_MS - 10);
    vm_watchdog_check(&vm, hal_millis());
    CHECK(vm.rodando);

    fake_clock_advance(20);
    vm_watchdog_check(&vm, hal_millis());
    CHECK(!vm.rodando);
    const char *esperado[] = { "MOTOR 200,200", "MOTOR 0,0" };
    checar_trace(esperado, 2);
}

/* O watchdog roda por um caminho independente do vm_tick, então o carimbo de
   tempo que ele recebe pode estar alguns milissegundos atrás do ultimo_tick.
   Se a comparação for feita sem sinal, essa diferença negativa vira um número
   gigante e o vigia mata o robô no meio de qualquer espera. */
static void teste_watchdog_tolera_relogio_atrasado(void) {
    printf("teste_watchdog_tolera_relogio_atrasado\n");
    VM vm;
    uint8_t prog[3 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_MOTOR, 200, 200, 0);
    p = emit(p, OP_WAIT, 30000, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    preparar(&vm, prog, sizeof(prog));
    vm_tick(&vm);                       /* ultimo_tick = 1000 */

    vm_watchdog_check(&vm, hal_millis() - 1);
    CHECK(vm.rodando);
    vm_watchdog_check(&vm, hal_millis() - 50);
    CHECK(vm.rodando);

    /* Mas um atraso de verdade continua cortando os motores. */
    fake_clock_advance(WATCHDOG_MS + 10);
    vm_watchdog_check(&vm, hal_millis());
    CHECK(!vm.rodando);
}

static void teste_load_rejeita_programa_invalido(void) {
    printf("teste_load_rejeita_programa_invalido\n");
    VM vm;
    uint8_t bom[INSTR_BYTES];
    emit(bom, OP_HALT, 0, 0, 0);
    vm_init(&vm);
    CHECK(vm_load(&vm, bom, sizeof(bom)) == 1);
    CHECK(vm.n_instr == 1);

    uint8_t torto[INSTR_BYTES + 3] = {0};
    CHECK(vm_load(&vm, torto, sizeof(torto)) == 0);   /* não é múltiplo de 7 */
    CHECK(vm.n_instr == 1);                           /* programa anterior intacto */

    static uint8_t grande[(MAX_INSTR + 1) * INSTR_BYTES];
    CHECK(vm_load(&vm, grande, sizeof(grande)) == 0); /* passou de 256 instruções */
    CHECK(vm.n_instr == 1);
}

static void teste_para_com_seguranca_em_programa_torto(void) {
    printf("teste_para_com_seguranca_em_programa_torto\n");

    /* opcode que não existe */
    VM vm;
    uint8_t prog[2 * INSTR_BYTES], *p = prog;
    p = emit(p, 99, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    preparar(&vm, prog, sizeof(prog));
    vm_tick(&vm);
    CHECK(!vm.rodando);
    CHECK(fake_trace_count() == 1);
    CHECK(strcmp(fake_trace_get(0), "MOTOR 0,0") == 0);

    /* salto para fora do programa */
    VM vm2;
    uint8_t prog2[2 * INSTR_BYTES], *q = prog2;
    q = emit(q, OP_JMP, 500, 0, 0);
    q = emit(q, OP_HALT, 0, 0, 0);
    preparar(&vm2, prog2, sizeof(prog2));
    vm_tick(&vm2);          /* executa o salto */
    vm_tick(&vm2);          /* pc fora de faixa: para */
    CHECK(!vm2.rodando);
}

/* O contrato do sistema: repetir 4 { frente 1s; girar direita } */
static void teste_dourado(void) {
    printf("teste_dourado\n");
    VM vm;
    uint8_t prog[7 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_SET_REG, 0, 4, 0);
    p = emit(p, OP_MOTOR, VEL_FRENTE, VEL_FRENTE, 0);
    p = emit(p, OP_WAIT, 1000, 0, 0);
    p = emit(p, OP_MOTOR, 0, 0, 0);
    p = emit(p, OP_TURN, 90, 0, 0);
    p = emit(p, OP_DEC_JNZ, 0, 1, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    CHECK(sizeof(prog) == 49);

    preparar(&vm, prog, sizeof(prog));
    rodar_ate_parar(&vm);

    const char *esperado[] = {
        "MOTOR 200,200", "MOTOR 0,0", "MOTOR 180,-180", "MOTOR 0,0",
        "MOTOR 200,200", "MOTOR 0,0", "MOTOR 180,-180", "MOTOR 0,0",
        "MOTOR 200,200", "MOTOR 0,0", "MOTOR 180,-180", "MOTOR 0,0",
        "MOTOR 200,200", "MOTOR 0,0", "MOTOR 180,-180", "MOTOR 0,0",
        "MOTOR 0,0"
    };
    checar_trace(esperado, 17);
}

/* O JMP para trás é o que fecha um laço, e é o que os blocos "repetir para
   sempre" e "repetir até chegar perto" emitem. O teste que já existia só cobre
   salto para frente, pulando por cima de uma instrução — caminho diferente.

   O programa aqui é exatamente a forma que o compilador gera para o "repetir
   até chegar perto": testa antes, corpo no meio, volta no fim. */
static void teste_jmp_para_tras_fecha_laco(void) {
    printf("teste_jmp_para_tras_fecha_laco\n");
    VM vm;
    uint8_t prog[5 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_JMP_IF_GE, SENSOR_DISTANCIA, 20, 2);  /* longe → corpo   */
    p = emit(p, OP_JMP, 4, 0, 0);                        /* perto → sai     */
    p = emit(p, OP_MOTOR, 5, 5, 0);                      /* corpo           */
    p = emit(p, OP_JMP, 0, 0, 0);                        /* volta: p/ trás  */
    p = emit(p, OP_HALT, 0, 0, 0);
    preparar(&vm, prog, sizeof(prog));

    /* Longe: entra no corpo e o salto para trás recomeça o laço. */
    fake_dist_set(100);
    vm_tick(&vm);
    CHECK(vm.pc == 2);
    vm_tick(&vm);
    CHECK(vm.pc == 3);
    vm_tick(&vm);
    CHECK(vm.pc == 0);          /* aqui está o salto para trás */
    CHECK(vm.rodando == 1);

    /* Perto: cai para o salto de saída e o programa acaba. */
    fake_dist_set(10);
    vm_tick(&vm);
    CHECK(vm.pc == 1);
    vm_tick(&vm);
    CHECK(vm.pc == 4);
    vm_tick(&vm);
    CHECK(vm.rodando == 0);
}

int main(void) {
    teste_programa_vazio();
    teste_sequencia_linear();
    teste_wait_nao_avanca_antes_do_prazo();
    teste_repetir_tres_vezes();
    teste_laco_aninhado();
    teste_jmp_incondicional();
    teste_jmp_para_tras_fecha_laco();
    teste_turn_desliga_motores_no_fim();
    teste_turn_esquerda_inverte_os_motores();
    teste_sensor_perto_entra_no_corpo();
    teste_sensor_longe_pula_o_corpo();
    teste_stop_no_meio_zera_motores();
    teste_watchdog_corta_motores();
    teste_watchdog_tolera_relogio_atrasado();
    teste_load_rejeita_programa_invalido();
    teste_para_com_seguranca_em_programa_torto();
    teste_dourado();
    if (falhas == 0) { printf("\ntodos os testes passaram\n"); return 0; }
    printf("\n%d verificacao(oes) falharam\n", falhas);
    return 1;
}
