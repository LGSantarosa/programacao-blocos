#ifndef VM_H
#define VM_H

#include <stdint.h>
#include "bytecode.h"

/* Calibração. Ver o spec: a física do simulador é derivada destes valores. */
#define VEL_FRENTE   200
#define VEL_GIRO     180
#define MS_POR_GRAU  5
#define WATCHDOG_MS  500

/* Uma pilha que roda sozinha. Cada uma tem o seu pc, os seus registradores e
   a sua pilha de valores — é isso que faz duas rodarem ao mesmo tempo sem uma
   embaralhar a conta da outra.

   O que elas dividem é o hardware: um motor só, um sensor só. Duas tarefas
   mandando no motor ao mesmo tempo é a última que fala que vale, e isso é
   consequência do robô ter dois motores e não doze. */
typedef struct {
    uint16_t pc;
    uint8_t  viva;            /* ocupa lugar: rodando ou esperando */
    uint16_t inicio;          /* onde recomeça ao receber o aviso dela */
    uint8_t  quando;          /* TAREFA_NO_PLAY ou TAREFA_NO_AVISO */
    int16_t  aviso;           /* qual aviso a acorda, se for do tipo aviso */
    int16_t  reg[N_REGS];
    /* Vive dentro do cálculo de um valor e morre nele: nenhuma instrução que
       devolve o controle ao loop() deixa coisa pendurada aqui. É por isso que
       ela pode ser pequena. */
    int32_t  pilha[PILHA_MAX];
    uint8_t  topo;
    uint32_t esperar_ate;
    uint8_t  parar_ao_fim;
} Tarefa;

typedef struct {
    Instr    prog[MAX_INSTR];
    uint16_t n_instr;
    Tarefa   tarefa[N_TAREFAS];
    uint8_t  n_tarefas;
    uint8_t  vez;             /* de quem é a vez, no rodízio */
    /* O pc da instrução que acabou de ser executada, seja de qual tarefa for.
       Existe para quem está de fora — o host e o firmware acendem o bloco por
       ele — e para não quebrar quem já lia vm.pc quando havia uma tarefa só. */
    uint16_t pc;
    uint8_t  rodando;         /* 1 enquanto qualquer tarefa estiver viva */
    uint32_t ultimo_tick;
    /* A semente do 🎲, campo e não variável de arquivo: duas VMs com a mesma
       semente têm que andar iguais sem uma mexer na outra, senão um teste
       passa a depender da ordem em que os testes rodam. */
    uint32_t semente;
} VM;

#ifdef __cplusplus
extern "C" {
#endif

void vm_init(VM *vm);

/* Devolve 1 se aceitou o programa, 0 se rejeitou. Rejeitar preserva o
   programa anterior. Aceitar sempre interrompe a execução em curso. */
int  vm_load(VM *vm, const uint8_t *bytes, uint16_t n_bytes);

void vm_run(VM *vm);
void vm_stop(VM *vm);

/* Executa no máximo uma instrução e retorna. Nunca bloqueia. */
void vm_tick(VM *vm);

/* 1 se toda tarefa viva está no meio de um WAIT ou TURN — ou seja, se não há
   nada a executar agora. É o que diz ao laço de fora que pode ir dormir. */
int  vm_esperando(const VM *vm, uint32_t agora);

/* Manda um aviso: toda tarefa que espera por ele recomeça do princípio.
   Existe na API porque o teste precisa dela, e porque um dia o botão de fora
   pode mandar um aviso sem passar por bytecode. */
void vm_avisar(VM *vm, int16_t aviso);

/* Quantas tarefas estão vivas agora. Zero quer dizer VM parada. */
int  vm_tarefas_vivas(const VM *vm);

/* Precisa ser chamada por um caminho independente do laço que chama
   vm_tick, senão morre junto com o que deveria vigiar. */
void vm_watchdog_check(VM *vm, uint32_t agora);

#ifdef __cplusplus
}
#endif

#endif
