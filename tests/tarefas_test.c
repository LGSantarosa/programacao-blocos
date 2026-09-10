/* Mais de um pc na VM: duas pilhas de blocos rodando ao mesmo tempo, e os
   avisos que uma manda para a outra.

   O que se prova aqui é o que a criança vai sentir: que a espera de uma não
   congela a outra, que o aviso acorda quem estava dormindo, e que um programa
   torto para tudo em vez de deixar o robô andando sozinho. */
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

static uint8_t *emit(uint8_t *p, uint8_t op, int16_t a, int16_t b, int16_t c) {
    p[0] = op;
    p[1] = (uint8_t)(a & 0xFF); p[2] = (uint8_t)((a >> 8) & 0xFF);
    p[3] = (uint8_t)(b & 0xFF); p[4] = (uint8_t)((b >> 8) & 0xFF);
    p[5] = (uint8_t)(c & 0xFF); p[6] = (uint8_t)((c >> 8) & 0xFF);
    return p + INSTR_BYTES;
}

static void preparar(VM *vm, const uint8_t *prog, uint16_t n) {
    fake_clock_set(1000);
    fake_dist_set(400);
    vm_init(vm);
    CHECK(vm_load(vm, prog, n) == 1);
    fake_trace_reset();
    vm_run(vm);
}

/* Quantas vezes "REPORT n" aparece no trace. É como cada tarefa diz "passei
   por aqui" sem depender de motor, que é recurso compartilhado. */
static int contar(const char *quem) {
    int n = 0;
    for (int i = 0; i < fake_trace_count(); i++)
        if (strcmp(fake_trace_get(i), quem) == 0) n++;
    return n;
}

static int primeira_vez(const char *quem) {
    for (int i = 0; i < fake_trace_count(); i++)
        if (strcmp(fake_trace_get(i), quem) == 0) return i;
    return -1;
}

/* Um corpo que relata um número e morre. Ocupa 3 instruções. */
static uint8_t *corpo_relata(uint8_t *p, int16_t n) {
    p = emit(p, OP_PUSH, n, 0, 0);
    p = emit(p, OP_REPORT, 0, 0, 0);
    return emit(p, OP_HALT, 0, 0, 0);
}

static void rodar(VM *vm, int ticks, uint32_t passo_ms) {
    for (int k = 0; k < ticks && vm->rodando; k++) {
        vm_tick(vm);
        fake_clock_advance(passo_ms);
    }
}

/* ---------- o cabeçalho ---------- */

/* O programa que o compilador emitia até aqui não tem cabeçalho nenhum. Ele
   precisa continuar rodando igual, senão o bytecode que uma criança deixou
   guardado no navegador vira lixo no dia da atualização. */
static void teste_programa_velho_sem_cabecalho(void) {
    printf("teste_programa_velho_sem_cabecalho\n");
    VM vm;
    uint8_t prog[3 * INSTR_BYTES];
    corpo_relata(prog, 7);

    preparar(&vm, prog, sizeof(prog));
    CHECK(vm.n_tarefas == 1);
    CHECK(vm_tarefas_vivas(&vm) == 1);
    rodar(&vm, 50, 1);
    CHECK(contar("REPORT 7") == 1);
    CHECK(vm.rodando == 0);
}

static void teste_cabecalho_cria_uma_tarefa_por_task(void) {
    printf("teste_cabecalho_cria_uma_tarefa_por_task\n");
    VM vm;
    uint8_t prog[8 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 2, 0);
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 5, 0);
    p = corpo_relata(p, 1);          /* 2, 3, 4 */
    p = corpo_relata(p, 2);          /* 5, 6, 7 */

    preparar(&vm, prog, sizeof(prog));
    CHECK(vm.n_tarefas == 2);
    CHECK(vm_tarefas_vivas(&vm) == 2);
    rodar(&vm, 50, 1);
    CHECK(contar("REPORT 1") == 1);
    CHECK(contar("REPORT 2") == 1);
    CHECK(vm.rodando == 0);
}

static void teste_cabecalho_nao_passa_do_teto(void) {
    printf("teste_cabecalho_nao_passa_do_teto\n");
    /* Mais TASK do que cabe: as que sobram são ignoradas, e o programa roda.
       Recusar tudo deixaria a criança com um PLAY que não faz nada. */
    VM vm;
    uint8_t prog[(N_TAREFAS + 2) * INSTR_BYTES + 3 * INSTR_BYTES], *p = prog;
    for (int k = 0; k < N_TAREFAS + 2; k++)
        p = emit(p, OP_TASK, TAREFA_NO_PLAY, (int16_t)(N_TAREFAS + 2), 0);
    corpo_relata(p, 3);

    preparar(&vm, prog, sizeof(prog));
    CHECK(vm.n_tarefas == N_TAREFAS);
}

/* ---------- duas rodando ao mesmo tempo ---------- */

/* O ponto inteiro do ciclo: uma tarefa esperando não congela a outra. Antes
   disso, com um pc só, qualquer espera parava o programa inteiro. */
static void teste_espera_de_uma_nao_para_a_outra(void) {
    printf("teste_espera_de_uma_nao_para_a_outra\n");
    VM vm;
    uint8_t prog[10 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 2, 0);
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 6, 0);
    /* 2: espera 1 s e relata 1 */
    p = emit(p, OP_PUSH, 1000, 0, 0);
    p = emit(p, OP_WAIT, 0, 0, 0);
    p = emit(p, OP_PUSH, 1, 0, 0);
    p = emit(p, OP_REPORT, 0, 0, 0);
    /* 6: relata 2 na hora */
    p = corpo_relata(p, 2);
    p = emit(p, OP_HALT, 0, 0, 0);

    preparar(&vm, prog, sizeof(prog));
    /* Dez ticks com o relógio quase parado: a primeira está dormindo. */
    rodar(&vm, 10, 1);
    CHECK(contar("REPORT 2") == 1);
    CHECK(contar("REPORT 1") == 0);
    CHECK(vm.rodando == 1);          /* a que dorme ainda está viva */

    rodar(&vm, 50, 200);
    CHECK(contar("REPORT 1") == 1);
    CHECK(vm.rodando == 0);
}

static void teste_rodizio_e_justo(void) {
    printf("teste_rodizio_e_justo\n");
    /* Duas tarefas que não param nunca: nenhuma pode monopolizar a vez. */
    VM vm;
    uint8_t prog[8 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 2, 0);
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 5, 0);
    p = emit(p, OP_PUSH, 1, 0, 0);   /* 2 */
    p = emit(p, OP_REPORT, 0, 0, 0);
    p = emit(p, OP_JMP, 2, 0, 0);
    p = emit(p, OP_PUSH, 2, 0, 0);   /* 5 */
    p = emit(p, OP_REPORT, 0, 0, 0);
    p = emit(p, OP_JMP, 5, 0, 0);

    preparar(&vm, prog, sizeof(prog));
    rodar(&vm, 120, 0);
    int a = contar("REPORT 1"), b = contar("REPORT 2");
    CHECK(a > 10 && b > 10);
    /* Mesmo número de instruções por volta: a diferença não passa de uma. */
    CHECK(a - b <= 1 && b - a <= 1);
}

static void teste_a_vm_so_para_quando_a_ultima_morre(void) {
    printf("teste_a_vm_so_para_quando_a_ultima_morre\n");
    VM vm;
    uint8_t prog[9 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 2, 0);
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 3, 0);
    p = emit(p, OP_HALT, 0, 0, 0);   /* 2: morre no primeiro tick */
    p = emit(p, OP_PUSH, 500, 0, 0); /* 3: espera e depois morre */
    p = emit(p, OP_WAIT, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);

    preparar(&vm, prog, sizeof(prog));
    rodar(&vm, 4, 1);
    CHECK(vm_tarefas_vivas(&vm) == 1);
    CHECK(vm.rodando == 1);
    rodar(&vm, 20, 100);
    CHECK(vm_tarefas_vivas(&vm) == 0);
    CHECK(vm.rodando == 0);
}

static void teste_esperando_so_quando_todas_esperam(void) {
    printf("teste_esperando_so_quando_todas_esperam\n");
    VM vm;
    uint8_t prog[9 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 2, 0);
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 5, 0);
    p = emit(p, OP_PUSH, 1000, 0, 0);  /* 2: dorme longo */
    p = emit(p, OP_WAIT, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    p = emit(p, OP_PUSH, 1, 0, 0);     /* 5: fica acordada num laço */
    p = emit(p, OP_REPORT, 0, 0, 0);
    p = emit(p, OP_JMP, 5, 0, 0);

    preparar(&vm, prog, sizeof(prog));
    rodar(&vm, 6, 0);
    /* Uma dorme, a outra não: o laço de fora não pode ir dormir. */
    CHECK(vm_esperando(&vm, 1000) == 0);
}

/* Um motor só para duas tarefas: a última que fala é a que vale. Não é um
   defeito a consertar — é o robô ter dois motores e não doze. Fica escrito
   como teste para ninguém "consertar" isso por engano. */
static void teste_motor_e_da_ultima_que_falou(void) {
    printf("teste_motor_e_da_ultima_que_falou\n");
    VM vm;
    uint8_t prog[11 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 2, 0);
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 6, 0);
    p = emit(p, OP_PUSH, 100, 0, 0);   /* 2 */
    p = emit(p, OP_PUSH, 100, 0, 0);
    p = emit(p, OP_MOTOR, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    p = emit(p, OP_PUSH, -50, 0, 0);   /* 6 */
    p = emit(p, OP_PUSH, -50, 0, 0);
    p = emit(p, OP_MOTOR, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);

    preparar(&vm, prog, sizeof(prog));
    rodar(&vm, 40, 1);
    /* Os dois comandos aconteceram, um depois do outro. */
    CHECK(contar("MOTOR 100,100") == 1);
    CHECK(contar("MOTOR -50,-50") == 1);
    CHECK(primeira_vez("MOTOR 100,100") < primeira_vez("MOTOR -50,-50"));
}

/* ---------- avisos ---------- */

static void teste_quem_espera_aviso_nasce_dormindo(void) {
    printf("teste_quem_espera_aviso_nasce_dormindo\n");
    VM vm;
    uint8_t prog[8 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 2, 0);
    p = emit(p, OP_TASK, TAREFA_NO_AVISO, 5, 3);
    p = corpo_relata(p, 1);            /* 2 */
    p = corpo_relata(p, 9);            /* 5, só com o aviso 3 */

    preparar(&vm, prog, sizeof(prog));
    CHECK(vm.n_tarefas == 2);
    CHECK(vm_tarefas_vivas(&vm) == 1);
    rodar(&vm, 40, 1);
    CHECK(contar("REPORT 1") == 1);
    CHECK(contar("REPORT 9") == 0);
}

static void teste_broadcast_acorda_quem_espera(void) {
    printf("teste_broadcast_acorda_quem_espera\n");
    VM vm;
    uint8_t prog[9 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 2, 0);
    p = emit(p, OP_TASK, TAREFA_NO_AVISO, 4, 3);
    p = emit(p, OP_BROADCAST, 3, 0, 0);   /* 2 */
    p = emit(p, OP_HALT, 0, 0, 0);
    p = corpo_relata(p, 9);               /* 4 */

    preparar(&vm, prog, sizeof(prog));
    rodar(&vm, 40, 1);
    CHECK(contar("REPORT 9") == 1);
    CHECK(vm.rodando == 0);
}

static void teste_aviso_sem_ninguem_escutando_nao_faz_nada(void) {
    printf("teste_aviso_sem_ninguem_escutando_nao_faz_nada\n");
    VM vm;
    uint8_t prog[6 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 2, 0);
    p = emit(p, OP_TASK, TAREFA_NO_AVISO, 5, 1);
    p = emit(p, OP_BROADCAST, 2, 0, 0);   /* 2: manda o aviso 2, e ninguém ouve */
    p = emit(p, OP_HALT, 0, 0, 0);
    p = corpo_relata(p, 9);               /* 5: espera o aviso 1 */

    preparar(&vm, prog, sizeof(prog));
    rodar(&vm, 40, 1);
    CHECK(contar("REPORT 9") == 0);
    CHECK(vm.rodando == 0);               /* e o programa termina */
}

static void teste_aviso_recomeca_quem_ja_rodava(void) {
    printf("teste_aviso_recomeca_quem_ja_rodava\n");
    /* A tarefa do aviso dorme 300 ms antes de relatar. O segundo aviso chega
       durante o sono e a manda de volta ao princípio: ela relata uma vez só,
       e mais tarde do que teria relatado. */
    VM vm;
    uint8_t prog[12 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 2, 0);
    p = emit(p, OP_TASK, TAREFA_NO_AVISO, 8, 1);
    p = emit(p, OP_BROADCAST, 1, 0, 0);   /* 2 */
    p = emit(p, OP_PUSH, 100, 0, 0);      /* 3: espera 100 ms */
    p = emit(p, OP_WAIT, 0, 0, 0);
    p = emit(p, OP_BROADCAST, 1, 0, 0);   /* 5: avisa de novo */
    p = emit(p, OP_HALT, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    p = emit(p, OP_PUSH, 300, 0, 0);      /* 8 */
    p = emit(p, OP_WAIT, 0, 0, 0);
    p = emit(p, OP_PUSH, 9, 0, 0);
    p = emit(p, OP_REPORT, 0, 0, 0);

    preparar(&vm, prog, sizeof(prog));
    rodar(&vm, 200, 20);
    CHECK(contar("REPORT 9") == 1);
}

static void teste_tarefa_pode_avisar_a_si_mesma(void) {
    printf("teste_tarefa_pode_avisar_a_si_mesma\n");
    /* Recomeça do princípio, e não da instrução seguinte: é um laço, e tem de
       ser um laço que não empilha nada. */
    VM vm;
    uint8_t prog[7 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 2, 0);
    p = emit(p, OP_TASK, TAREFA_NO_AVISO, 4, 5);
    p = emit(p, OP_BROADCAST, 5, 0, 0);   /* 2 */
    p = emit(p, OP_HALT, 0, 0, 0);
    p = emit(p, OP_PUSH, 4, 0, 0);        /* 4 */
    p = emit(p, OP_REPORT, 0, 0, 0);
    p = emit(p, OP_BROADCAST, 5, 0, 0);

    preparar(&vm, prog, sizeof(prog));
    rodar(&vm, 60, 0);
    CHECK(contar("REPORT 4") > 5);        /* segue relatando, sem crescer pilha */
    CHECK(vm.rodando == 1);
}

static void teste_vm_avisar_de_fora(void) {
    printf("teste_vm_avisar_de_fora\n");
    VM vm;
    uint8_t prog[6 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 2, 0);
    p = emit(p, OP_TASK, TAREFA_NO_AVISO, 3, 7);
    p = emit(p, OP_HALT, 0, 0, 0);        /* 2 */
    p = corpo_relata(p, 9);               /* 3 */

    preparar(&vm, prog, sizeof(prog));
    vm_avisar(&vm, 7);
    rodar(&vm, 40, 1);
    CHECK(contar("REPORT 9") == 1);
}

/* ---------- quando dá errado ---------- */

static void teste_programa_torto_para_tudo(void) {
    printf("teste_programa_torto_para_tudo\n");
    /* REPORT sem nada na pilha. A outra tarefa não pode seguir andando: um
       robô que continua se mexendo esconde o defeito. */
    VM vm;
    uint8_t prog[7 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 2, 0);
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 3, 0);
    p = emit(p, OP_REPORT, 0, 0, 0);      /* 2: pilha vazia */
    p = emit(p, OP_PUSH, 1, 0, 0);        /* 3: laço eterno */
    p = emit(p, OP_REPORT, 0, 0, 0);
    p = emit(p, OP_JMP, 3, 0, 0);

    preparar(&vm, prog, sizeof(prog));
    rodar(&vm, 60, 0);
    CHECK(vm.rodando == 0);
    CHECK(vm_tarefas_vivas(&vm) == 0);
}

static void teste_parar_mata_todas(void) {
    printf("teste_parar_mata_todas\n");
    VM vm;
    uint8_t prog[8 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 2, 0);
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 5, 0);
    p = emit(p, OP_PUSH, 1, 0, 0);   /* 2 */
    p = emit(p, OP_REPORT, 0, 0, 0);
    p = emit(p, OP_JMP, 2, 0, 0);
    p = emit(p, OP_PUSH, 2, 0, 0);   /* 5 */
    p = emit(p, OP_REPORT, 0, 0, 0);
    p = emit(p, OP_JMP, 5, 0, 0);

    preparar(&vm, prog, sizeof(prog));
    rodar(&vm, 10, 0);
    vm_stop(&vm);
    CHECK(vm_tarefas_vivas(&vm) == 0);
    int antes = fake_trace_count();
    rodar(&vm, 10, 0);
    CHECK(fake_trace_count() == antes);   /* PARAR é PARAR */
}

/* O vigia mata a VM inteira, e não a tarefa que estava com a vez: o watchdog
   existe para o robô não sair andando quando o laço de fora morre, e nesse
   caso nenhuma tarefa está sendo servida. */
static void teste_watchdog_mata_todas(void) {
    printf("teste_watchdog_mata_todas\n");
    VM vm;
    uint8_t prog[8 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 2, 0);
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 5, 0);
    p = emit(p, OP_PUSH, 5000, 0, 0);  /* 2 */
    p = emit(p, OP_WAIT, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    p = emit(p, OP_PUSH, 5000, 0, 0);  /* 5 */
    p = emit(p, OP_WAIT, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);

    preparar(&vm, prog, sizeof(prog));
    rodar(&vm, 4, 0);
    CHECK(vm_tarefas_vivas(&vm) == 2);
    vm_watchdog_check(&vm, 1000 + WATCHDOG_MS + 1);
    CHECK(vm.rodando == 0);
    CHECK(vm_tarefas_vivas(&vm) == 0);
}

/* Cada tarefa tem os seus registradores: dois `repetir` ao mesmo tempo, um em
   cada pilha, não podem contar um pelo outro. É o defeito mais provável de uma
   VM multitarefa mal feita, e o mais difícil de ver na tela. */
static void teste_registradores_nao_se_misturam(void) {
    printf("teste_registradores_nao_se_misturam\n");
    VM vm;
    uint8_t prog[13 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 2, 0);
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 8, 0);
    /* 2: repete 3 vezes, relatando 1 — usa o registrador 0.
       O HALT do fim não é enfeite: sem ele esta tarefa cai dentro do corpo da
       seguinte e roda o programa da outra. Foi o que aconteceu na primeira
       versão deste teste, e é regra para quem emite o bytecode: toda tarefa
       termina em HALT. */
    p = emit(p, OP_PUSH, 3, 0, 0);
    p = emit(p, OP_SET_REG, 0, 0, 0);
    p = emit(p, OP_PUSH, 1, 0, 0);
    p = emit(p, OP_REPORT, 0, 0, 0);
    p = emit(p, OP_DEC_JNZ, 0, 4, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    /* 8: repete 5 vezes, relatando 2 — o mesmo registrador 0 */
    p = emit(p, OP_PUSH, 5, 0, 0);
    p = emit(p, OP_SET_REG, 0, 0, 0);
    p = emit(p, OP_PUSH, 2, 0, 0);
    p = emit(p, OP_REPORT, 0, 0, 0);
    p = emit(p, OP_DEC_JNZ, 0, 10, 0);

    preparar(&vm, prog, sizeof(prog));
    rodar(&vm, 200, 1);
    CHECK(contar("REPORT 1") == 3);
    CHECK(contar("REPORT 2") == 5);
}

/* A pilha de valores também é de cada uma: uma conta pela metade numa tarefa
   não pode ser desempilhada pela outra. */
static void teste_pilhas_nao_se_misturam(void) {
    printf("teste_pilhas_nao_se_misturam\n");
    VM vm;
    uint8_t prog[12 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 2, 0);
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 7, 0);
    /* 2: 10 + 5 = 15 */
    p = emit(p, OP_PUSH, 10, 0, 0);
    p = emit(p, OP_PUSH, 5, 0, 0);
    p = emit(p, OP_BIN, BIN_MAIS, 0, 0);
    p = emit(p, OP_REPORT, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    /* 7: 100 - 1 = 99 */
    p = emit(p, OP_PUSH, 100, 0, 0);
    p = emit(p, OP_PUSH, 1, 0, 0);
    p = emit(p, OP_BIN, BIN_MENOS, 0, 0);
    p = emit(p, OP_REPORT, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);

    preparar(&vm, prog, sizeof(prog));
    rodar(&vm, 60, 1);
    CHECK(contar("REPORT 15") == 1);
    CHECK(contar("REPORT 99") == 1);
}

/* O erro que a primeira versão do teste acima cometeu, agora afirmado: uma
   tarefa que chega ao fim do próprio corpo sem HALT continua executando o que
   vier na memória — que é o corpo da tarefa seguinte. Quem emite bytecode
   precisa fechar toda tarefa com HALT, e é isto que diz o porquê. */
static void teste_sem_halt_a_tarefa_invade_a_seguinte(void) {
    printf("teste_sem_halt_a_tarefa_invade_a_seguinte\n");
    VM vm;
    uint8_t prog[7 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 2, 0);
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 4, 0);
    p = emit(p, OP_PUSH, 1, 0, 0);    /* 2: relata 1 e não fecha com HALT */
    p = emit(p, OP_REPORT, 0, 0, 0);
    p = emit(p, OP_PUSH, 2, 0, 0);    /* 4 */
    p = emit(p, OP_REPORT, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);

    preparar(&vm, prog, sizeof(prog));
    rodar(&vm, 40, 1);
    CHECK(contar("REPORT 1") == 1);
    CHECK(contar("REPORT 2") == 2);   /* a de cima caiu na de baixo */
}

int main(void) {
    teste_programa_velho_sem_cabecalho();
    teste_cabecalho_cria_uma_tarefa_por_task();
    teste_cabecalho_nao_passa_do_teto();
    teste_espera_de_uma_nao_para_a_outra();
    teste_rodizio_e_justo();
    teste_a_vm_so_para_quando_a_ultima_morre();
    teste_esperando_so_quando_todas_esperam();
    teste_motor_e_da_ultima_que_falou();
    teste_quem_espera_aviso_nasce_dormindo();
    teste_broadcast_acorda_quem_espera();
    teste_aviso_sem_ninguem_escutando_nao_faz_nada();
    teste_aviso_recomeca_quem_ja_rodava();
    teste_tarefa_pode_avisar_a_si_mesma();
    teste_vm_avisar_de_fora();
    teste_programa_torto_para_tudo();
    teste_parar_mata_todas();
    teste_watchdog_mata_todas();
    teste_registradores_nao_se_misturam();
    teste_pilhas_nao_se_misturam();
    teste_sem_halt_a_tarefa_invade_a_seguinte();

    if (falhas) {
        printf("\n%d verificação(ões) falharam\n", falhas);
        return 1;
    }
    printf("\ntodos os testes passaram\n");
    return 0;
}
