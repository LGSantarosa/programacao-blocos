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
    OP_JMP_IF_GE = 7
};

#define MAX_INSTR        256
#define INSTR_BYTES      7
#define N_REGS           4
#define SENSOR_DISTANCIA 0

typedef struct {
    uint8_t op;
    int16_t a, b, c;
} Instr;

#endif
