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
    vm->topo         = 0;
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
    /* Diferença com sinal: o vigia roda por um caminho independente do
       vm_tick, então o carimbo que ele recebe pode estar alguns ms atrás do
       ultimo_tick. Sem sinal, essa diferença negativa viraria um número
       gigante e cortaria os motores no meio de qualquer espera. Também é o
       que faz a conta continuar certa quando o relógio dá a volta. */
    if ((int32_t)(agora - vm->ultimo_tick) > WATCHDOG_MS) vm_stop(vm);
}

static void empilhar(VM *vm, int32_t v) {
    if (vm->topo >= PILHA_MAX) { vm_stop(vm); return; }
    vm->pilha[vm->topo++] = v;
}

/* Pilha vazia é programa torto, e programa torto para — mesma regra do
   registrador fora da faixa. O valor devolvido não importa: quem chamou
   confere vm->rodando antes de usá-lo. */
static int32_t desempilhar(VM *vm) {
    if (vm->topo == 0) { vm_stop(vm); return 0; }
    return vm->pilha[--vm->topo];
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
    /* Desempilha a direita primeiro: o compilador empilha esquerda antes. */
    case OP_MOTOR: {
        int32_t dir = desempilhar(vm);
        int32_t esq = desempilhar(vm);
        if (!vm->rodando) break;
        hal_motors((int16_t)esq, (int16_t)dir);
        vm->pc++;
        break;
    }
    case OP_WAIT: {
        int32_t ms = desempilhar(vm);
        if (!vm->rodando) break;
        vm->esperar_ate = agora + (uint32_t)(ms > 0 ? ms : 0);
        vm->pc++;
        break;
    }
    case OP_SET_REG: {
        int32_t n = desempilhar(vm);
        if (!vm->rodando) break;
        if (i->a < 0 || i->a >= N_REGS) { vm_stop(vm); break; }
        /* Zero viraria laço infinito: o DEC_JNZ decrementa antes de comparar e
           nunca chegaria a zero. Com número o compilador já resolve; com uma
           conta da criança, só dá para saber aqui. */
        vm->reg[i->a] = (int16_t)(n < 1 ? 1 : n);
        vm->pc++;
        break;
    }
    case OP_PUSH:
        empilhar(vm, i->a);
        vm->pc++;
        break;
    case OP_SENSOR:
        empilhar(vm, (i->a == SENSOR_DISTANCIA) ? (int32_t)hal_distancia_cm() : 0);
        vm->pc++;
        break;
    case OP_BIN: {
        int32_t b = desempilhar(vm);
        int32_t a = desempilhar(vm);
        if (!vm->rodando) break;
        int32_t r = 0;
        switch (i->a) {
        case BIN_MAIS:    r = a + b; break;
        case BIN_MENOS:   r = a - b; break;
        case BIN_VEZES:   r = a * b; break;
        /* Zero dá zero: uma criança vai dividir por zero, e um robô que morre
           no meio da sala ensina menos que um que anda estranho. */
        case BIN_DIVIDIR: r = (b == 0) ? 0 : a / b; break;
        case BIN_MENOR:   r = (a < b); break;
        case BIN_MAIOR:   r = (a > b); break;
        case BIN_IGUAL:   r = (a == b); break;
        case BIN_E:       r = (a && b); break;
        case BIN_OU:      r = (a || b); break;
        case BIN_ALEATORIO: {
            int32_t lo = (a < b) ? a : b, hi = (a < b) ? b : a;
            r = lo + (int32_t)(hal_millis() % (uint32_t)(hi - lo + 1));
            break;
        }
        default: vm_stop(vm); return;
        }
        empilhar(vm, r);
        vm->pc++;
        break;
    }
    case OP_UN: {
        int32_t a = desempilhar(vm);
        if (!vm->rodando) break;
        if (i->a != UN_NAO) { vm_stop(vm); return; }
        empilhar(vm, !a);
        vm->pc++;
        break;
    }
    case OP_JMP_FALSE: {
        int32_t c = desempilhar(vm);
        if (!vm->rodando) break;
        if (!c) vm->pc = (uint16_t)i->a;
        else    vm->pc++;
        break;
    }
    case OP_DEC_JNZ:
        if (i->a < 0 || i->a >= N_REGS) { vm_stop(vm); break; }
        vm->reg[i->a]--;
        if (vm->reg[i->a] != 0) vm->pc = (uint16_t)i->b;
        else                    vm->pc++;
        break;
    case OP_JMP:
        vm->pc = (uint16_t)i->a;
        break;
    case OP_TURN: {
        int32_t pedido = desempilhar(vm);
        if (!vm->rodando) break;
        int16_t v = (pedido >= 0) ? VEL_GIRO : -VEL_GIRO;
        int32_t graus = (pedido >= 0) ? pedido : -pedido;
        hal_motors(v, (int16_t)-v);
        vm->esperar_ate  = agora + (uint32_t)(graus * MS_POR_GRAU);
        vm->parar_ao_fim = 1;
        vm->pc++;
        break;
    }
    case OP_JMP_IF_GE: {
        uint16_t leitura = (i->a == SENSOR_DISTANCIA) ? hal_distancia_cm() : 0;
        if ((int32_t)leitura >= (int32_t)i->b) vm->pc = (uint16_t)i->c;
        else                                   vm->pc++;
        break;
    }
    default:
        vm_stop(vm);
        break;
    }
}
