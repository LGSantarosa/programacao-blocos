#ifndef BYTECODE_H
#define BYTECODE_H

#include <stdint.h>

enum {
    OP_HALT      = 0,
    OP_MOTOR     = 1,
    OP_WAIT      = 2,
    OP_TURN      = 3,
    OP_SET_REG   = 4,
    OP_DEC_JNZ   = 5,
    OP_JMP       = 6,
    /* 7 foi o OP_JMP_IF_GE, o sensor embutido num salto. Saiu quando o sensor
       virou valor: hoje é SENSOR ; PUSH ; BIN < ; JMP_FALSE. O número fica
       vago de propósito — reusá-lo faria bytecode antigo rodar errado. */
    OP_PUSH      = 8,
    OP_SENSOR    = 9,
    OP_BIN       = 10,
    OP_UN        = 11,
    OP_JMP_FALSE = 12,
    /* Desempilha o topo e o entrega ao HAL. É o caminho de volta que faltava:
       sem ele a criança pode mandar uma conta para o robô, mas não pode
       perguntar quanto ela deu. */
    OP_REPORT    = 13
};

/* Um opcode com seletor em vez de um por conta: o campo "a" já existe e está
   sobrando, e onze opcodes por onze contas engordariam a tabela sem ganhar
   nada. */
enum {
    BIN_MAIS = 0, BIN_MENOS = 1, BIN_VEZES = 2, BIN_DIVIDIR = 3,
    BIN_MENOR = 4, BIN_MAIOR = 5, BIN_IGUAL = 6,
    BIN_E = 7, BIN_OU = 8, BIN_ALEATORIO = 9
};

enum { UN_NAO = 0 };

#define PILHA_MAX 16

#define MAX_INSTR        1024
#define INSTR_BYTES      7
#define N_REGS           4
#define SENSOR_DISTANCIA 0

typedef struct {
    uint8_t op;
    int16_t a, b, c;
} Instr;

#endif
