#ifndef VM_H
#define VM_H

#include <stdint.h>
#include "bytecode.h"

/* Calibração. Ver o spec: a física do simulador é derivada destes valores. */
#define VEL_FRENTE   200
#define VEL_GIRO     180
#define MS_POR_GRAU  5
#define WATCHDOG_MS  500

typedef struct {
    Instr    prog[MAX_INSTR];
    uint16_t n_instr;
    uint16_t pc;
    int16_t  reg[N_REGS];
    uint32_t esperar_ate;
    uint8_t  parar_ao_fim;
    uint8_t  rodando;
    uint32_t ultimo_tick;
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

/* 1 se a VM está no meio de um WAIT ou TURN. */
int  vm_esperando(const VM *vm, uint32_t agora);

/* Precisa ser chamada por um caminho independente do laço que chama
   vm_tick, senão morre junto com o que deveria vigiar. */
void vm_watchdog_check(VM *vm, uint32_t agora);

#ifdef __cplusplus
}
#endif

#endif
