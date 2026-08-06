#include <string.h>
#include "vm.h"
#include "hal.h"

static int16_t rd16(const uint8_t *p) {
    return (int16_t)((uint16_t)p[0] | ((uint16_t)p[1] << 8));
}

void vm_init(VM *vm) {
    memset(vm, 0, sizeof(*vm));
}

int vm_load(VM *vm, const uint8_t *bytes, uint16_t n_bytes) {
    if (n_bytes % INSTR_BYTES != 0) return 0;
    uint16_t n = (uint16_t)(n_bytes / INSTR_BYTES);
    if (n > MAX_INSTR) return 0;

    vm_stop(vm);
    for (uint16_t i = 0; i < n; i++) {
        const uint8_t *p = bytes + (uint32_t)i * INSTR_BYTES;
        vm->prog[i].op = p[0];
        vm->prog[i].a  = rd16(p + 1);
        vm->prog[i].b  = rd16(p + 3);
        vm->prog[i].c  = rd16(p + 5);
    }
    vm->n_instr = n;
    return 1;
}

void vm_run(VM *vm) {
    vm->pc           = 0;
    vm->esperar_ate  = 0;
    vm->parar_ao_fim = 0;
    vm->rodando      = 1;
    vm->ultimo_tick  = hal_millis();
    memset(vm->reg, 0, sizeof(vm->reg));
}

void vm_stop(VM *vm) {
    vm->rodando      = 0;
    vm->parar_ao_fim = 0;
    hal_motors(0, 0);
}

int vm_esperando(const VM *vm, uint32_t agora) {
    return agora < vm->esperar_ate;
}

void vm_watchdog_check(VM *vm, uint32_t agora) {
    if (!vm->rodando) return;
    if (agora - vm->ultimo_tick > WATCHDOG_MS) vm_stop(vm);
}

void vm_tick(VM *vm) {
    if (!vm->rodando) return;

    uint32_t agora = hal_millis();
    vm->ultimo_tick = agora;

    if (agora < vm->esperar_ate) return;
    if (vm->parar_ao_fim) { hal_motors(0, 0); vm->parar_ao_fim = 0; }
    if (vm->pc >= vm->n_instr) { vm_stop(vm); return; }

    Instr *i = &vm->prog[vm->pc];
    switch (i->op) {
    case OP_HALT:
        vm_stop(vm);
        break;
    case OP_MOTOR:
        hal_motors(i->a, i->b);
        vm->pc++;
        break;
    case OP_WAIT:
        vm->esperar_ate = agora + (uint32_t)(i->a > 0 ? i->a : 0);
        vm->pc++;
        break;
    case OP_SET_REG:
        if (i->a < 0 || i->a >= N_REGS) { vm_stop(vm); break; }
        vm->reg[i->a] = i->b;
        vm->pc++;
        break;
    case OP_DEC_JNZ:
        if (i->a < 0 || i->a >= N_REGS) { vm_stop(vm); break; }
        vm->reg[i->a]--;
        if (vm->reg[i->a] != 0) vm->pc = (uint16_t)i->b;
        else                    vm->pc++;
        break;
    case OP_JMP:
        vm->pc = (uint16_t)i->a;
        break;
    default:
        vm_stop(vm);
        break;
    }
}
