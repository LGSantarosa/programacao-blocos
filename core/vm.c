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

/* O sorteio do 🎲, e por que ele não é mais o relógio.

   Era `hal_millis() % faixa`. O relógio é monotônico e o laço executa até 256
   instruções no mesmo quadro, todas dentro do mesmo milissegundo: dentro de um
   `repetir`, o dado dava sempre o mesmo número, e `aleatório + aleatório` caía
   com os dois dados iguais quase toda vez. Um dado que depende do escalonador
   em vez do sorteio não é um dado.

   LCG de Numerical Recipes, e os 16 bits de cima porque os de baixo de um LCG
   alternam de um jeito visível — e num dado de 1 a 2 isso apareceria. Semeado
   no vm_run com o relógio, que é a única fonte de imprevisibilidade que a placa
   tem: o programa fica diferente a cada PLAY, e igual dentro do mesmo PLAY se
   alguém fixar a semente, que é o que os testes fazem.

   A semente é da VM e não da tarefa, de propósito: duas tarefas sorteando são
   dois dados diferentes, e não o mesmo número saindo duas vezes. */
static uint32_t sortear(VM *vm) {
    vm->semente = vm->semente * 1103515245u + 12345u;
    return vm->semente >> 16;
}

static void nascer(Tarefa *t, uint16_t pc) {
    t->pc           = pc;
    t->viva         = 1;
    t->topo         = 0;
    t->esperar_ate  = 0;
    t->parar_ao_fim = 0;
    memset(t->reg, 0, sizeof(t->reg));
}

/* Lê o cabeçalho de tarefas: os OP_TASK que vêm antes de qualquer código.

   Programa sem cabeçalho nenhum vale e roda como sempre — uma tarefa só,
   começando em zero. É o que o compilador emitia até aqui, e o que o bytecode
   guardado no navegador de uma criança ainda pode ser. Um formato novo que
   invalida o programa que ela deixou salvo é um formato novo que apaga o
   trabalho dela. */
static void montar_tarefas(VM *vm) {
    memset(vm->tarefa, 0, sizeof(vm->tarefa));
    vm->n_tarefas = 0;

    uint16_t pc = 0;
    while (pc < vm->n_instr && vm->prog[pc].op == OP_TASK &&
           vm->n_tarefas < N_TAREFAS) {
        Tarefa *t = &vm->tarefa[vm->n_tarefas++];
        t->quando = (uint8_t)vm->prog[pc].a;
        t->inicio = (uint16_t)vm->prog[pc].b;
        t->aviso  = vm->prog[pc].c;
        pc++;
    }

    if (vm->n_tarefas == 0) {
        vm->n_tarefas = 1;
        vm->tarefa[0].quando = TAREFA_NO_PLAY;
        vm->tarefa[0].inicio = 0;
    }

    /* Quem espera aviso nasce dormindo: ela só existe quando alguém chama. */
    for (uint8_t i = 0; i < vm->n_tarefas; i++) {
        Tarefa *t = &vm->tarefa[i];
        if (t->quando == TAREFA_NO_PLAY) nascer(t, t->inicio);
        else                             t->viva = 0;
    }
}

void vm_run(VM *vm) {
    montar_tarefas(vm);
    vm->vez         = 0;
    vm->pc          = 0;
    vm->rodando     = 1;
    vm->ultimo_tick = hal_millis();
    vm->semente     = hal_millis();
}

void vm_stop(VM *vm) {
    for (uint8_t i = 0; i < N_TAREFAS; i++) {
        vm->tarefa[i].viva         = 0;
        vm->tarefa[i].parar_ao_fim = 0;
    }
    vm->rodando = 0;
    hal_motors(0, 0);
}

int vm_tarefas_vivas(const VM *vm) {
    int n = 0;
    for (uint8_t i = 0; i < N_TAREFAS; i++) if (vm->tarefa[i].viva) n++;
    return n;
}

void vm_avisar(VM *vm, int16_t aviso) {
    for (uint8_t i = 0; i < vm->n_tarefas; i++) {
        Tarefa *t = &vm->tarefa[i];
        if (t->quando != TAREFA_NO_AVISO || t->aviso != aviso) continue;
        /* Recomeça do princípio mesmo se já estava rodando. Para a criança é o
           que se espera de apertar de novo o que já está tocando; e a outra
           saída — ignorar o aviso enquanto a tarefa corre — some em silêncio,
           que é pior de entender. */
        nascer(t, t->inicio);
    }
}

/* Morre esta tarefa, e a VM inteira quando ela era a última.

   O motor não é desligado ao fim de uma tarefa: quem parou pode não ser quem
   estava dirigindo. Quando a última morre, o vm_stop desliga. */
static void morrer(VM *vm, Tarefa *t) {
    t->viva         = 0;
    t->parar_ao_fim = 0;
    if (vm_tarefas_vivas(vm) == 0) vm_stop(vm);
}

int vm_esperando(const VM *vm, uint32_t agora) {
    for (uint8_t i = 0; i < vm->n_tarefas; i++) {
        const Tarefa *t = &vm->tarefa[i];
        if (t->viva && agora >= t->esperar_ate) return 0;
    }
    return 1;
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

static void empilhar(VM *vm, Tarefa *t, int32_t v) {
    if (t->topo >= PILHA_MAX) { vm_stop(vm); return; }
    t->pilha[t->topo++] = v;
}

/* Pilha vazia é programa torto, e programa torto para — mesma regra do
   registrador fora da faixa. Para tudo, e não só esta tarefa: um erro de
   montagem que deixasse as outras andando esconderia o defeito atrás de um
   robô que continua se mexendo. O valor devolvido não importa: quem chamou
   confere vm->rodando antes de usá-lo. */
static int32_t desempilhar(VM *vm, Tarefa *t) {
    if (t->topo == 0) { vm_stop(vm); return 0; }
    return t->pilha[--t->topo];
}

/* De quem é a vez. Rodízio: começa depois de quem rodou por último, para uma
   tarefa que nunca espera não deixar as outras sem vez. Devolve NULL quando
   ninguém pode executar agora — ou porque todas esperam, ou porque acabaram. */
static Tarefa *proxima(VM *vm, uint32_t agora) {
    for (uint8_t k = 0; k < vm->n_tarefas; k++) {
        uint8_t i = (uint8_t)((vm->vez + k) % vm->n_tarefas);
        Tarefa *t = &vm->tarefa[i];
        if (!t->viva) continue;
        if (agora < t->esperar_ate) continue;
        vm->vez = (uint8_t)((i + 1) % vm->n_tarefas);
        return t;
    }
    return 0;
}

void vm_tick(VM *vm) {
    if (!vm->rodando) return;

    uint32_t agora = hal_millis();
    vm->ultimo_tick = agora;

    Tarefa *t = proxima(vm, agora);
    if (!t) return;

    if (t->parar_ao_fim) { hal_motors(0, 0); t->parar_ao_fim = 0; }
    if (t->pc >= vm->n_instr) { morrer(vm, t); return; }

    Instr *i = &vm->prog[t->pc];
    switch (i->op) {
    case OP_HALT:
        morrer(vm, t);
        break;
    /* Desempilha a direita primeiro: o compilador empilha esquerda antes. */
    case OP_MOTOR: {
        int32_t dir = desempilhar(vm, t);
        int32_t esq = desempilhar(vm, t);
        if (!vm->rodando) break;
        hal_motors((int16_t)esq, (int16_t)dir);
        t->pc++;
        break;
    }
    case OP_WAIT: {
        int32_t ms = desempilhar(vm, t);
        if (!vm->rodando) break;
        t->esperar_ate = agora + (uint32_t)(ms > 0 ? ms : 0);
        t->pc++;
        break;
    }
    case OP_SET_REG: {
        int32_t n = desempilhar(vm, t);
        if (!vm->rodando) break;
        if (i->a < 0 || i->a >= N_REGS) { vm_stop(vm); break; }
        /* Zero viraria laço infinito: o DEC_JNZ decrementa antes de comparar e
           nunca chegaria a zero. Com número o compilador já resolve; com uma
           conta da criança, só dá para saber aqui. */
        t->reg[i->a] = (int16_t)(n < 1 ? 1 : n);
        t->pc++;
        break;
    }
    case OP_PUSH:
        empilhar(vm, t, i->a);
        t->pc++;
        break;
    case OP_SENSOR:
        empilhar(vm, t, (i->a == SENSOR_DISTANCIA) ? (int32_t)hal_distancia_cm() : 0);
        t->pc++;
        break;
    case OP_BIN: {
        int32_t b = desempilhar(vm, t);
        int32_t a = desempilhar(vm, t);
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
            r = lo + (int32_t)(sortear(vm) % (uint32_t)(hi - lo + 1));
            break;
        }
        default: vm_stop(vm); return;
        }
        empilhar(vm, t, r);
        t->pc++;
        break;
    }
    case OP_UN: {
        int32_t a = desempilhar(vm, t);
        if (!vm->rodando) break;
        if (i->a != UN_NAO) { vm_stop(vm); return; }
        empilhar(vm, t, !a);
        t->pc++;
        break;
    }
    case OP_JMP_FALSE: {
        int32_t c = desempilhar(vm, t);
        if (!vm->rodando) break;
        if (!c) t->pc = (uint16_t)i->a;
        else    t->pc++;
        break;
    }
    case OP_DEC_JNZ:
        if (i->a < 0 || i->a >= N_REGS) { vm_stop(vm); break; }
        t->reg[i->a]--;
        if (t->reg[i->a] != 0) t->pc = (uint16_t)i->b;
        else                   t->pc++;
        break;
    case OP_JMP:
        t->pc = (uint16_t)i->a;
        break;
    case OP_TURN: {
        int32_t pedido = desempilhar(vm, t);
        if (!vm->rodando) break;
        int16_t v = (pedido >= 0) ? VEL_GIRO : -VEL_GIRO;
        int32_t graus = (pedido >= 0) ? pedido : -pedido;
        hal_motors(v, (int16_t)-v);
        t->esperar_ate  = agora + (uint32_t)(graus * MS_POR_GRAU);
        t->parar_ao_fim = 1;
        t->pc++;
        break;
    }
    case OP_REPORT: {
        int32_t v = desempilhar(vm, t);
        if (!vm->rodando) break;
        hal_report(v);
        t->pc++;
        break;
    }
    /* O cabeçalho já foi lido no vm_run. Chegar aqui executando quer dizer que
       uma tarefa entrou no cabeçalho de outra — não faz nada, e segue. */
    case OP_TASK:
        t->pc++;
        break;
    case OP_BROADCAST:
        /* Avança antes de avisar: uma tarefa que manda um aviso para si mesma
           recomeça do princípio, e não do lugar onde estava. */
        t->pc++;
        vm_avisar(vm, i->a);
        break;
    default:
        vm_stop(vm);
        break;
    }

    /* O pc que fica à mostra é o da tarefa que acabou de andar, já apontando
       para a instrução seguinte dela — que é o que vm.pc sempre quis dizer,
       de volta ao tempo em que havia uma tarefa só. Quem lê isto de fora
       (host/laco.c, firmware/src/main.cpp) compara com o valor de antes para
       descobrir qual instrução executou. */
    vm->pc = t->pc;
}
