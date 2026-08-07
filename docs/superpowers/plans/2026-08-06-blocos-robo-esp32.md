# Programação em blocos para robô ESP32 — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Uma criança monta blocos na tela, aperta PLAY, e o robô executa na hora — hoje num robô virtual no navegador, amanhã numa ESP32, sem mudar a lógica.

**Arquitetura:** Um único `core/vm.c` interpreta o bytecode e não conhece hardware; ele fala com o mundo por três funções (`hal_motors`, `hal_distancia_cm`, `hal_millis`). Duas implementações dessa camada — uma para o PC com física simulada, outra para a ESP32 — são a única diferença entre o robô virtual e o real. O navegador compila os blocos em bytecode e envia por WebSocket binário, idêntico nos dois modos.

**Stack:** C11 (VM, física, host), Node.js 18 sem dependências (bridge WebSocket), Blockly 11 vendorizado, PlatformIO + Arduino ESP32 (firmware).

## Restrições globais

- **Zero dependências npm.** O bridge usa apenas `http`, `crypto`, `net`, `fs`, `child_process`. Testes JS usam `node --test` embutido.
- **Zero CDN.** Blockly é vendorizado em `web/vendor/`. A ESP32 serve tudo offline.
- **A VM nunca bloqueia.** Nenhum `delay()`, `sleep()` ou laço de espera dentro de `core/`.
- **`core/` é C portátil**, compilável tanto por `gcc` quanto pelo compilador da ESP32. Sem `malloc`, sem `printf`, sem dependência de libc além de `string.h` e `stdint.h`. (Restrição sobre o que o código usa — não confundir com a flag `-std` abaixo, que é sobre quais macros a libc expõe.)
- **Toda mensagem visível para a criança é em português.**
- **Constantes de calibração** (`core/vm.h`): `VEL_FRENTE 200`, `VEL_GIRO 180`, `MS_POR_GRAU 5`, `WATCHDOG_MS 500`. A física do simulador (`V_MAX 0.30`, `ENTRE_EIXOS 0.12`) é derivada delas e não pode ser mudada isoladamente.
- **Formato de instrução:** 7 bytes, `op(uint8) a(int16) b(int16) c(int16)`, little-endian. Máximo 256 instruções.
- **Compilar com `-std=gnu11`, não `-std=c11`.** O modo estrito esconde `M_PI`, `clock_gettime` e `O_NONBLOCK` atrás de macros de feature.
- Commits em português, no presente ("Adiciona", "Implementa").

## Mapa de arquivos

| arquivo | responsabilidade |
|---|---|
| `core/bytecode.h` | opcodes, limites, `struct Instr` |
| `core/hal.h` | as três funções de hardware |
| `core/vm.h` | estado da VM, constantes de calibração, API |
| `core/vm.c` | o interpretador — única fonte de verdade da execução |
| `core/library.json` | faz `core/` ser reconhecido como biblioteca pelo PlatformIO |
| `tests/fake_hal.h` `.c` | HAL falso: relógio controlado, sensor roteirizado, trace |
| `tests/vm_test.c` | testes da VM |
| `tests/physics_test.c` | testes da física |
| `tests/Makefile` | build e execução dos testes C |
| `host/physics.h` `.c` | tração diferencial, arena, raycast do ultrassônico |
| `host/hal_sim.c` | HAL do PC: motores→física, sensor→raycast, relógio real |
| `host/main.c` | laço principal e protocolo de texto no stdio |
| `host/Makefile` | build do `robo_host` |
| `bridge/server.js` | servidor HTTP + WebSocket, traduz binário↔texto, sobe o `robo_host` |
| `web/compilador.js` | AST → bytecode + mapa `pc→blockId` (puro, testável no Node) |
| `web/blocos.js` | definição dos blocos Blockly e adaptador workspace→AST |
| `web/rede.js` | cliente WebSocket e codificação do protocolo binário |
| `web/arena.js` | desenho do robô virtual no canvas |
| `web/app.js` | fiação: PLAY, STOP, destaque do bloco |
| `web/index.html` | layout |
| `tests/compilador.test.js` | testes do compilador (node --test) |
| `firmware/platformio.ini` | build da ESP32 |
| `firmware/src/main.cpp` | Wi-Fi AP, servidor HTTP/WS, laço da VM |
| `firmware/src/hal_esp32.cpp` | HAL da placa: TB6612FNG e HC-SR04 |

---

### Tarefa 1: Núcleo da VM — instruções sequenciais

Estabelece os cabeçalhos compartilhados, o HAL falso e o ciclo de teste. Implementa `HALT`, `MOTOR` e `WAIT`.

**Arquivos:**
- Criar: `core/bytecode.h`, `core/hal.h`, `core/vm.h`, `core/vm.c`
- Criar: `tests/fake_hal.h`, `tests/fake_hal.c`, `tests/vm_test.c`, `tests/Makefile`

**Interfaces:**
- Produz: `vm_init(VM*)`, `vm_load(VM*, const uint8_t*, uint16_t) -> int`, `vm_run(VM*)`, `vm_stop(VM*)`, `vm_tick(VM*)`, `vm_esperando(const VM*, uint32_t) -> int`, `vm_watchdog_check(VM*, uint32_t)`. HAL falso: `fake_clock_set`, `fake_clock_advance`, `fake_dist_set`, `fake_trace_reset`, `fake_trace_count`, `fake_trace_get`.

- [x] **Passo 1: Criar os cabeçalhos compartilhados**

`core/bytecode.h`:

```c
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
```

`core/hal.h`:

```c
#ifndef HAL_H
#define HAL_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Liga os motores. Valores de -255 a 255; negativo é ré. */
void hal_motors(int16_t esq, int16_t dir);

/* Distância lida pelo ultrassônico, em centímetros. */
uint16_t hal_distancia_cm(void);

/* Milissegundos desde o início. Pode dar a volta em 32 bits. */
uint32_t hal_millis(void);

#ifdef __cplusplus
}
#endif

#endif
```

`core/vm.h`:

```c
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
```

- [x] **Passo 2: Criar o HAL falso**

`tests/fake_hal.h`:

```c
#ifndef FAKE_HAL_H
#define FAKE_HAL_H

#include <stdint.h>

void        fake_clock_set(uint32_t ms);
void        fake_clock_advance(uint32_t ms);
void        fake_dist_set(uint16_t cm);
void        fake_trace_reset(void);
int         fake_trace_count(void);
const char *fake_trace_get(int i);

#endif
```

`tests/fake_hal.c`:

```c
#include <stdio.h>
#include <string.h>
#include "fake_hal.h"
#include "hal.h"

#define MAX_TRACE 512

static uint32_t relogio;
static uint16_t distancia = 400;
static char     trace[MAX_TRACE][32];
static int      n_trace;

void fake_clock_set(uint32_t ms)     { relogio = ms; }
void fake_clock_advance(uint32_t ms) { relogio += ms; }
void fake_dist_set(uint16_t cm)      { distancia = cm; }
void fake_trace_reset(void)          { n_trace = 0; }
int  fake_trace_count(void)          { return n_trace; }

const char *fake_trace_get(int i) {
    if (i < 0 || i >= n_trace) return "<fora de faixa>";
    return trace[i];
}

void hal_motors(int16_t esq, int16_t dir) {
    if (n_trace < MAX_TRACE)
        snprintf(trace[n_trace++], sizeof(trace[0]), "MOTOR %d,%d", esq, dir);
}

uint16_t hal_distancia_cm(void) { return distancia; }
uint32_t hal_millis(void)       { return relogio; }
```

- [x] **Passo 3: Escrever os testes que devem falhar**

`tests/vm_test.c`:

```c
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
```

`tests/Makefile`:

```make
CC     ?= cc
CFLAGS  = -std=gnu11 -Wall -Wextra -Werror -g -I../core -I.
LDLIBS  = -lm

.PHONY: test clean

test: vm_test
	./vm_test

vm_test: vm_test.c fake_hal.c ../core/vm.c
	$(CC) $(CFLAGS) -o $@ $^ $(LDLIBS)

clean:
	rm -f vm_test physics_test
```

- [x] **Passo 4: Rodar os testes para confirmar que falham**

Rodar: `cd tests && make test`
Esperado: erro de compilação — `core/vm.c` ainda não existe.

- [x] **Passo 5: Implementar a VM mínima**

`core/vm.c`:

```c
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
    default:
        vm_stop(vm);
        break;
    }
}
```

- [x] **Passo 6: Rodar os testes para confirmar que passam**

Rodar: `cd tests && make test`
Esperado: `todos os testes passaram`

- [x] **Passo 7: Commit**

```bash
git add core tests
git commit -m "Adiciona núcleo da VM com HALT, MOTOR e WAIT"
```

---

### Tarefa 2: Laços

Implementa `SET_REG`, `DEC_JNZ` e `JMP` — o que faz o bloco `repetir` funcionar, inclusive aninhado.

**Arquivos:**
- Modificar: `core/vm.c` (o `switch` de `vm_tick`)
- Modificar: `tests/vm_test.c`

**Interfaces:**
- Consome: tudo da Tarefa 1.
- Produz: nenhuma função nova; três opcodes a mais.

- [x] **Passo 1: Escrever os testes que devem falhar**

Adicionar em `tests/vm_test.c`, antes de `main`:

```c
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
```

Registrar em `main`:

```c
    teste_repetir_tres_vezes();
    teste_laco_aninhado();
    teste_jmp_incondicional();
```

- [x] **Passo 2: Rodar os testes para confirmar que falham**

Rodar: `cd tests && make test`
Esperado: FALHA. `SET_REG` cai no `default` e para a VM, então o trace só terá `MOTOR 0,0`.

- [x] **Passo 3: Implementar os três opcodes**

Em `core/vm.c`, dentro do `switch` de `vm_tick`, antes do `default`:

```c
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
```

- [x] **Passo 4: Rodar os testes para confirmar que passam**

Rodar: `cd tests && make test`
Esperado: `todos os testes passaram`

- [x] **Passo 5: Commit**

```bash
git add core/vm.c tests/vm_test.c
git commit -m "Implementa laços na VM com SET_REG, DEC_JNZ e JMP"
```

---

### Tarefa 3: Giro, sensor, segurança e o teste dourado

Fecha a VM: `TURN`, `JMP_IF_GE`, as três proteções, e o teste que é o contrato do sistema inteiro.

**Arquivos:**
- Modificar: `core/vm.c`
- Modificar: `tests/vm_test.c`

**Interfaces:**
- Consome: tudo das Tarefas 1 e 2.
- Produz: VM completa. `host/` e `firmware/` dependem só de `vm.h`.

- [x] **Passo 1: Escrever os testes que devem falhar**

Adicionar em `tests/vm_test.c`:

```c
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
```

Registrar em `main`:

```c
    teste_turn_desliga_motores_no_fim();
    teste_turn_esquerda_inverte_os_motores();
    teste_sensor_perto_entra_no_corpo();
    teste_sensor_longe_pula_o_corpo();
    teste_stop_no_meio_zera_motores();
    teste_watchdog_corta_motores();
    teste_load_rejeita_programa_invalido();
    teste_para_com_seguranca_em_programa_torto();
    teste_dourado();
```

- [x] **Passo 2: Rodar os testes para confirmar que falham**

Rodar: `cd tests && make test`
Esperado: FALHA nos testes de `TURN`, sensor e no dourado. Os de segurança e o watchdog já devem passar — a VM da Tarefa 1 já para no `default` e já tem `vm_watchdog_check`. Isso é esperado e correto: eles são testes de regressão que travam o comportamento.

- [x] **Passo 3: Implementar TURN e JMP_IF_GE**

Em `core/vm.c`, no `switch` de `vm_tick`, antes do `default`:

```c
    case OP_TURN: {
        int16_t v = (i->a >= 0) ? VEL_GIRO : -VEL_GIRO;
        int32_t graus = (i->a >= 0) ? i->a : -i->a;
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
```

- [x] **Passo 4: Rodar os testes para confirmar que passam**

Rodar: `cd tests && make test`
Esperado: `todos os testes passaram`, com 12 testes listados.

- [x] **Passo 5: Commit**

```bash
git add core/vm.c tests/vm_test.c
git commit -m "Completa a VM com giro, sensor, proteções e teste dourado"
```

---

### Tarefa 4: Física do robô virtual

Tração diferencial, arena com obstáculo, colisão e raycast do ultrassônico. Nada aqui conhece a VM.

**Arquivos:**
- Criar: `host/physics.h`, `host/physics.c`
- Criar: `tests/physics_test.c`
- Modificar: `tests/Makefile`

**Interfaces:**
- Produz: `fis_init()`, `fis_set_motores(int16_t, int16_t)`, `fis_passo(double dt)`, `fis_pose(double *x, double *y, double *theta)`, `fis_distancia_cm() -> uint16_t`, `fis_set_pose(double, double, double)`.

- [x] **Passo 1: Escrever o cabeçalho**

`host/physics.h`:

```c
#ifndef PHYSICS_H
#define PHYSICS_H

#include <stdint.h>

/* Derivados da calibração da VM — ver o spec. Mexer aqui exige recalcular
   MS_POR_GRAU em core/vm.h. */
#define V_MAX        0.30   /* m/s com PWM 255       */
#define ENTRE_EIXOS  0.12   /* m                     */
#define RAIO_ROBO    0.08   /* m                     */
#define ARENA_LADO   2.00   /* m                     */

void     fis_init(void);
void     fis_set_motores(int16_t esq, int16_t dir);
void     fis_passo(double dt);
void     fis_pose(double *x, double *y, double *theta);
void     fis_set_pose(double x, double y, double theta);
uint16_t fis_distancia_cm(void);

#endif
```

- [x] **Passo 2: Criar o stub da física**

Um esqueleto que compila e não faz nada. Existe para o passo RED ser uma
asserção falhando de verdade, e não um "arquivo não encontrado" — que passaria
igual se os testes tivessem erro de sintaxe ou asserções vazias.

`host/physics.c`:

```c
#include "physics.h"

/* Stub: substituído pela implementação real no Passo 5. */
void fis_init(void) {}
void fis_set_motores(int16_t esq, int16_t dir) { (void)esq; (void)dir; }
void fis_passo(double dt) { (void)dt; }
void fis_set_pose(double x, double y, double theta) { (void)x; (void)y; (void)theta; }
void fis_pose(double *x, double *y, double *theta) { *x = 0; *y = 0; *theta = 0; }
uint16_t fis_distancia_cm(void) { return 0; }
```

- [x] **Passo 3: Escrever os testes que devem falhar**

`tests/physics_test.c`:

```c
#include <math.h>
#include <stdio.h>
#include "physics.h"

static int falhas;

#define CHECK(cond)                                                        \
    do {                                                                   \
        if (!(cond)) {                                                     \
            printf("  FALHOU %s:%d  %s\n", __FILE__, __LINE__, #cond);     \
            falhas++;                                                      \
        }                                                                  \
    } while (0)

/* Integra por `segundos` em passos de 5 ms, como faz o laço do host. */
static void avancar(double segundos) {
    int passos = (int)(segundos / 0.005 + 0.5);
    for (int k = 0; k < passos; k++) fis_passo(0.005);
}

static void teste_anda_reto(void) {
    printf("teste_anda_reto\n");
    fis_init();
    fis_set_pose(1.0, 0.4, M_PI / 2);   /* apontando para +y */
    fis_set_motores(255, 255);
    avancar(1.0);
    double x, y, th;
    fis_pose(&x, &y, &th);
    CHECK(fabs(x - 1.0) < 0.01);
    CHECK(fabs(y - 0.70) < 0.01);       /* 0.4 + V_MAX * 1 s */
    CHECK(fabs(th - M_PI / 2) < 0.01);
}

static void teste_giro_bate_com_a_calibracao(void) {
    printf("teste_giro_bate_com_a_calibracao\n");
    fis_init();
    fis_set_pose(1.0, 1.0, 0.0);
    fis_set_motores(180, -180);         /* o que o opcode TURN 90 faz */
    avancar(0.450);                     /* 90 * MS_POR_GRAU ms         */
    double x, y, th;
    fis_pose(&x, &y, &th);
    /* Gira no lugar, sentido horário, ~91 graus (1% de erro é o esperado). */
    CHECK(fabs(x - 1.0) < 0.005);
    CHECK(fabs(y - 1.0) < 0.005);
    double graus = -th * 180.0 / M_PI;
    CHECK(graus > 88.0 && graus < 94.0);
}

static void teste_sensor_ve_o_obstaculo(void) {
    printf("teste_sensor_ve_o_obstaculo\n");
    fis_init();
    /* Obstáculo começa em y = 1.40. Sensor fica a RAIO_ROBO à frente,
       em y = 0.48. Distância esperada: 92 cm. */
    fis_set_pose(1.0, 0.40, M_PI / 2);
    uint16_t d = fis_distancia_cm();
    CHECK(d >= 91 && d <= 93);
}

static void teste_sensor_ve_a_parede(void) {
    printf("teste_sensor_ve_a_parede\n");
    fis_init();
    /* Apontando para +x, parede em x = 2.00, sensor em x = 1.08. */
    fis_set_pose(1.0, 0.40, 0.0);
    uint16_t d = fis_distancia_cm();
    CHECK(d >= 91 && d <= 93);
}

static void teste_nao_atravessa_a_parede(void) {
    printf("teste_nao_atravessa_a_parede\n");
    fis_init();
    fis_set_pose(1.0, 1.80, M_PI / 2);
    fis_set_motores(255, 255);
    avancar(3.0);                        /* muito mais do que caberia */
    double x, y, th;
    fis_pose(&x, &y, &th);
    CHECK(y <= ARENA_LADO - RAIO_ROBO + 0.001);
    CHECK(y > 1.80);                     /* mas andou alguma coisa */
}

static void teste_nao_atravessa_o_obstaculo(void) {
    printf("teste_nao_atravessa_o_obstaculo\n");
    fis_init();
    fis_set_pose(1.0, 0.40, M_PI / 2);
    fis_set_motores(255, 255);
    avancar(5.0);
    double x, y, th;
    fis_pose(&x, &y, &th);
    CHECK(y < 1.40);                     /* parou antes do obstáculo */
    CHECK(y > 1.20);
}

int main(void) {
    teste_anda_reto();
    teste_giro_bate_com_a_calibracao();
    teste_sensor_ve_o_obstaculo();
    teste_sensor_ve_a_parede();
    teste_nao_atravessa_a_parede();
    teste_nao_atravessa_o_obstaculo();
    if (falhas == 0) { printf("\ntodos os testes passaram\n"); return 0; }
    printf("\n%d verificacao(oes) falharam\n", falhas);
    return 1;
}
```

Substituir `tests/Makefile` por:

```make
CC     ?= cc
CFLAGS  = -std=gnu11 -Wall -Wextra -Werror -g -I../core -I../host -I.
LDLIBS  = -lm

.PHONY: test clean

test: vm_test physics_test
	./vm_test
	./physics_test

vm_test: vm_test.c fake_hal.c ../core/vm.c
	$(CC) $(CFLAGS) -o $@ $^ $(LDLIBS)

physics_test: physics_test.c ../host/physics.c
	$(CC) $(CFLAGS) -o $@ $^ $(LDLIBS)

clean:
	rm -f vm_test physics_test
```

- [x] **Passo 4: Rodar os testes para confirmar que falham**

Rodar: `cd tests && make test`

Esperado: compila limpo e os **seis** testes falham por asserção — não por
arquivo ausente. A saída precisa nomear as asserções, por exemplo
`FALHOU physics_test.c:NN  fabs(y - 0.70) < 0.01`. Se algum teste passar contra
o stub, esse teste não está afirmando nada e precisa ser corrigido antes de
seguir.

- [x] **Passo 5: Implementar a física**

`host/physics.c`:

```c
#include <math.h>
#include "physics.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

typedef struct { double x0, y0, x1, y1; } Rect;

/* Arena da v1: um obstáculo retangular no meio. Sem editor por enquanto. */
static const Rect obstaculos[] = {
    { 0.80, 1.40, 1.20, 1.60 }
};
static const int n_obstaculos = (int)(sizeof(obstaculos) / sizeof(obstaculos[0]));

static double  pos_x, pos_y, ang;
static int16_t mot_esq, mot_dir;

void fis_init(void) {
    pos_x = 1.0;
    pos_y = 0.40;
    ang   = M_PI / 2;
    mot_esq = mot_dir = 0;
}

void fis_set_motores(int16_t esq, int16_t dir) {
    mot_esq = esq;
    mot_dir = dir;
}

void fis_set_pose(double x, double y, double theta) {
    pos_x = x;
    pos_y = y;
    ang   = theta;
}

void fis_pose(double *x, double *y, double *theta) {
    *x = pos_x; *y = pos_y; *theta = ang;
}

static int dentro_de_retangulo(double x, double y, const Rect *r) {
    return x >= r->x0 && x <= r->x1 && y >= r->y0 && y <= r->y1;
}

/* O centro do robô, com seu raio, encosta em parede ou obstáculo? */
static int colide(double x, double y) {
    if (x - RAIO_ROBO < 0.0 || x + RAIO_ROBO > ARENA_LADO) return 1;
    if (y - RAIO_ROBO < 0.0 || y + RAIO_ROBO > ARENA_LADO) return 1;
    for (int i = 0; i < n_obstaculos; i++) {
        const Rect *r = &obstaculos[i];
        /* ponto do retângulo mais próximo do centro do robô */
        double px = x < r->x0 ? r->x0 : (x > r->x1 ? r->x1 : x);
        double py = y < r->y0 ? r->y0 : (y > r->y1 ? r->y1 : y);
        double dx = x - px, dy = y - py;
        if (dx * dx + dy * dy < RAIO_ROBO * RAIO_ROBO) return 1;
    }
    return 0;
}

void fis_passo(double dt) {
    double vE = (mot_esq / 255.0) * V_MAX;
    double vD = (mot_dir / 255.0) * V_MAX;
    double v     = (vE + vD) / 2.0;
    double omega = (vD - vE) / ENTRE_EIXOS;

    ang += omega * dt;
    if (ang >  M_PI) ang -= 2.0 * M_PI;
    if (ang < -M_PI) ang += 2.0 * M_PI;

    double nx = pos_x + v * cos(ang) * dt;
    double ny = pos_y + v * sin(ang) * dt;
    /* Bateu: gira mas não translada. É o comportamento de um robô real
       encostado numa parede. */
    if (!colide(nx, ny)) { pos_x = nx; pos_y = ny; }
}

/* Um raio a partir da frente do robô, marchando de 5 em 5 mm. Simples e
   determinístico — a repetibilidade importa mais que a elegância aqui. */
static int ponto_bloqueado(double x, double y) {
    if (x < 0.0 || x > ARENA_LADO || y < 0.0 || y > ARENA_LADO) return 1;
    for (int i = 0; i < n_obstaculos; i++)
        if (dentro_de_retangulo(x, y, &obstaculos[i])) return 1;
    return 0;
}

uint16_t fis_distancia_cm(void) {
    const double passo = 0.005;
    const double alcance = 4.00;
    double ox = pos_x + RAIO_ROBO * cos(ang);
    double oy = pos_y + RAIO_ROBO * sin(ang);
    double dx = cos(ang), dy = sin(ang);

    for (double d = 0.0; d <= alcance; d += passo) {
        if (ponto_bloqueado(ox + dx * d, oy + dy * d)) {
            long cm = (long)(d * 100.0 + 0.5);
            if (cm < 2)   cm = 2;
            if (cm > 400) cm = 400;
            return (uint16_t)cm;
        }
    }
    return 400;
}
```

- [x] **Passo 6: Rodar os testes para confirmar que passam**

Rodar: `cd tests && make test`
Esperado: os dois binários imprimem `todos os testes passaram`.

- [x] **Passo 7: Commit**

```bash
git add host/physics.h host/physics.c tests/physics_test.c tests/Makefile
git commit -m "Adiciona física do robô virtual com colisão e raycast"
```

---

### Tarefa 5: Executável do robô virtual

Liga a VM à física e expõe o protocolo de texto no stdio. É o `robo_host` que o bridge vai subir.

**Arquivos:**
- Criar: `host/hal_sim.c`, `host/main.c`, `host/Makefile`
- Criar: `tests/host_test.sh`

**Interfaces:**
- Consome: `vm.h`, `physics.h`.
- Produz: binário `host/robo_host`. Protocolo stdio: entrada `L <hex>` / `R` / `S`; saída `P <pc>` / `E <0|1>` / `T <x_mm> <y_mm> <theta_decigraus> <dist_cm>`.

- [x] **Passo 1: Implementar o HAL do simulador**

`host/hal_sim.c`:

```c
#include <time.h>
#include "hal.h"
#include "physics.h"

void hal_motors(int16_t esq, int16_t dir) {
    fis_set_motores(esq, dir);
}

uint16_t hal_distancia_cm(void) {
    return fis_distancia_cm();
}

uint32_t hal_millis(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint32_t)((uint64_t)ts.tv_sec * 1000u + (uint64_t)ts.tv_nsec / 1000000u);
}
```

- [x] **Passo 2: Implementar o laço principal**

`host/main.c`:

```c
#include <fcntl.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#include "hal.h"
#include "physics.h"
#include "vm.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#define FRAME_MS      5
#define TELEM_MS      50
#define PC_MIN_MS     30
#define MAX_INSTR_FRAME 256

static VM       vm;
static uint8_t  prog_bytes[MAX_INSTR * INSTR_BYTES];
static uint16_t pc_enviado   = 0xFFFF;
static uint32_t pc_ultimo_ms = 0;
static uint8_t  rodando_ant  = 0;

static int hex_nib(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

static void processar_linha(char *l) {
    if (l[0] == 'L') {
        char *h = l + 1;
        while (*h == ' ') h++;
        size_t len = strlen(h);
        if (len % 2 != 0 || len / 2 > sizeof(prog_bytes)) return;
        for (size_t i = 0; i < len / 2; i++) {
            int hi = hex_nib(h[2 * i]), lo = hex_nib(h[2 * i + 1]);
            if (hi < 0 || lo < 0) return;
            prog_bytes[i] = (uint8_t)((hi << 4) | lo);
        }
        vm_load(&vm, prog_bytes, (uint16_t)(len / 2));
        pc_enviado = 0xFFFF;
    } else if (l[0] == 'R') {
        fis_init();
        vm_run(&vm);
    } else if (l[0] == 'S') {
        vm_stop(&vm);
    }
}

/* Devolve 0 quando a entrada fechou — aí o robô virtual não tem mais com
   quem falar e o processo termina. Sem isso ele giraria para sempre. */
static int ler_stdin(void) {
    static char   buf[8192];
    static size_t usado = 0;
    ssize_t n;

    while ((n = read(0, buf + usado, sizeof(buf) - usado - 1)) != 0) {
        if (n < 0) break;                          /* nada disponível agora */
        usado += (size_t)n;
        char *nl;
        while ((nl = memchr(buf, '\n', usado)) != NULL) {
            *nl = '\0';
            processar_linha(buf);
            size_t resto = usado - (size_t)(nl - buf) - 1;
            memmove(buf, nl + 1, resto);
            usado = resto;
        }
        if (usado >= sizeof(buf) - 1) usado = 0;   /* linha absurda: descarta */
    }
    return n != 0;
}

static void emitir_pc(uint32_t agora) {
    if (vm.pc == pc_enviado) return;
    if (agora - pc_ultimo_ms < PC_MIN_MS) return;
    pc_enviado   = vm.pc;
    pc_ultimo_ms = agora;
    printf("P %u\n", (unsigned)vm.pc);
}

static void emitir_telem(void) {
    double x, y, th;
    fis_pose(&x, &y, &th);
    double graus = th * 180.0 / M_PI;
    if (graus < 0.0) graus += 360.0;
    printf("T %d %d %d %u\n",
           (int)(x * 1000.0 + 0.5),
           (int)(y * 1000.0 + 0.5),
           (int)(graus * 10.0 + 0.5),
           (unsigned)fis_distancia_cm());
}

int main(void) {
    fcntl(0, F_SETFL, O_NONBLOCK);
    setvbuf(stdout, NULL, _IOLBF, 0);

    vm_init(&vm);
    fis_init();

    uint32_t telem_ultimo = 0;

    for (;;) {
        if (!ler_stdin()) { vm_stop(&vm); return 0; }

        uint32_t agora = hal_millis();

        for (int k = 0; k < MAX_INSTR_FRAME && vm.rodando
                        && !vm_esperando(&vm, hal_millis()); k++) {
            vm_tick(&vm);
        }
        emitir_pc(agora);

        fis_passo(FRAME_MS / 1000.0);
        vm_watchdog_check(&vm, agora);

        if (vm.rodando != rodando_ant) {
            rodando_ant = vm.rodando;
            printf("E %u\n", (unsigned)vm.rodando);
        }

        if (agora - telem_ultimo >= TELEM_MS) {
            telem_ultimo = agora;
            emitir_telem();
        }

        struct timespec ts = { 0, FRAME_MS * 1000000L };
        nanosleep(&ts, NULL);
    }
}
```

`host/Makefile`:

```make
CC     ?= cc
CFLAGS  = -std=gnu11 -Wall -Wextra -Werror -O2 -I../core -I.
LDLIBS  = -lm

.PHONY: all clean

all: robo_host

robo_host: main.c hal_sim.c physics.c ../core/vm.c
	$(CC) $(CFLAGS) -o $@ $^ $(LDLIBS)

clean:
	rm -f robo_host
```

- [x] **Passo 3: Escrever o teste de integração**

`tests/host_test.sh`:

```bash
#!/usr/bin/env bash
# Alimenta o robo_host com o programa dourado e confere a saída.
set -u

cd "$(dirname "$0")/../host" || exit 1
make --silent || exit 1

# repetir 4 { frente 1s; girar direita } — o mesmo programa do teste dourado.
# Montado instrução por instrução de propósito: um literal de 98 dígitos é
# fácil demais de digitar errado, e o erro só aparece como "não rodou nada".
PROG=""
PROG="$PROG""04000004000000"   # SET_REG r0, 4
PROG="$PROG""01c800c8000000"   # MOTOR 200, 200
PROG="$PROG""02e80300000000"   # WAIT 1000
PROG="$PROG""01000000000000"   # MOTOR 0, 0
PROG="$PROG""035a0000000000"   # TURN 90
PROG="$PROG""05000001000000"   # DEC_JNZ r0, 1
PROG="$PROG""00000000000000"   # HALT

if [ "${#PROG}" -ne 98 ]; then
    echo "  FALHOU: programa tem ${#PROG} dígitos hex, esperava 98"
    exit 1
fi

SAIDA=$( { printf 'L %s\nR\n' "$PROG"; sleep 7; } | ./robo_host )

falhas=0
verificar() {
    if printf '%s\n' "$SAIDA" | grep --quiet "$1"; then
        echo "  ok: $2"
    else
        echo "  FALHOU: $2"
        falhas=$((falhas + 1))
    fi
}

verificar '^E 1$' 'reportou que começou a rodar'
verificar '^P '   'reportou o pc'
verificar '^T '   'enviou telemetria'

# A última linha E precisa ser 0: o programa terminou sozinho.
ULTIMO_E=$(printf '%s\n' "$SAIDA" | grep '^E ' | tail -n 1)
if [ "$ULTIMO_E" = "E 0" ]; then
    echo "  ok: programa terminou sozinho"
else
    echo "  FALHOU: esperava 'E 0' no fim, veio '$ULTIMO_E'"
    falhas=$((falhas + 1))
fi

# O robô precisa ter saído do lugar.
PRIMEIRO_Y=$(printf '%s\n' "$SAIDA" | grep '^T ' | head -n 1 | cut -d' ' -f3)
MAIOR_Y=$(printf '%s\n' "$SAIDA" | grep '^T ' | cut -d' ' -f3 | sort -n | tail -n 1)
if [ "$MAIOR_Y" -gt "$((PRIMEIRO_Y + 100))" ]; then
    echo "  ok: robô andou (y foi de ${PRIMEIRO_Y}mm a ${MAIOR_Y}mm)"
else
    echo "  FALHOU: robô mal saiu do lugar (${PRIMEIRO_Y}mm -> ${MAIOR_Y}mm)"
    falhas=$((falhas + 1))
fi

[ "$falhas" -eq 0 ] && echo "todos os testes passaram" && exit 0
echo "$falhas verificacao(oes) falharam"
exit 1
```

Tornar executável: `chmod +x tests/host_test.sh`

- [x] **Passo 4: Rodar o teste**

Rodar: `./tests/host_test.sh`
Esperado: `todos os testes passaram`.

Se o `hex` do programa dourado estiver errado, o `E 1` nunca aparece. Para conferir os bytes, comparar com o `teste_dourado` da Tarefa 3.

- [x] **Passo 5: Commit**

```bash
git add host tests/host_test.sh
git commit -m "Adiciona executável do robô virtual com protocolo de texto"
```

---

### Tarefa 6: Bridge WebSocket

Serve os arquivos de `web/`, aceita o WebSocket binário do navegador e traduz para o texto do `robo_host`. Sem nenhuma dependência npm.

**Arquivos:**
- Criar: `bridge/server.js`
- Criar: `web/index.html` (versão mínima, só para o teste passar)
- Criar: `tests/bridge.test.js`

**Interfaces:**
- Consome: binário `host/robo_host`.
- Produz: servidor em `http://localhost:8080`, WebSocket no mesmo endereço. Protocolo binário: cliente envia `0x01 LOAD`, `0x02 RUN`, `0x03 STOP`; servidor envia `0x81 PC`, `0x82 STATE`, `0x83 TELEM`.

- [x] **Passo 1: Implementar o bridge**

`bridge/server.js`:

```js
'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RAIZ_WEB = path.join(__dirname, '..', 'web');
const BIN_HOST = path.join(__dirname, '..', 'host', 'robo_host');
const PORTA = Number(process.env.PORTA || 8080);

const GUID_WS = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const T_LOAD = 0x01, T_RUN = 0x02, T_STOP = 0x03;
const T_PC = 0x81, T_STATE = 0x82, T_TELEM = 0x83;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

/* ---------- HTTP: arquivos estáticos ---------- */

const servidor = http.createServer((req, res) => {
  const caminho = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const arquivo = path.join(RAIZ_WEB, path.normalize(decodeURIComponent(caminho)));
  if (!arquivo.startsWith(RAIZ_WEB)) {
    res.writeHead(403).end('proibido');
    return;
  }
  fs.readFile(arquivo, (erro, dados) => {
    if (erro) {
      res.writeHead(404).end('não encontrado');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream',
    });
    res.end(dados);
  });
});

/* ---------- WebSocket ---------- */

function montarQuadro(carga, opcode = 0x2) {
  const n = carga.length;
  let cabecalho;
  if (n < 126) {
    cabecalho = Buffer.from([0x80 | opcode, n]);
  } else {
    cabecalho = Buffer.alloc(4);
    cabecalho[0] = 0x80 | opcode;
    cabecalho[1] = 126;
    cabecalho.writeUInt16BE(n, 2);
  }
  return Buffer.concat([cabecalho, carga]);
}

function lerQuadros(socket, aoReceber) {
  let buf = Buffer.alloc(0);
  socket.on('data', (pedaco) => {
    buf = Buffer.concat([buf, pedaco]);
    for (;;) {
      if (buf.length < 2) return;
      const fim = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      const mascarado = (buf[1] & 0x80) !== 0;
      let tam = buf[1] & 0x7f;
      let off = 2;

      if (tam === 126) {
        if (buf.length < 4) return;
        tam = buf.readUInt16BE(2);
        off = 4;
      } else if (tam === 127) {
        socket.destroy();               // acima de 64 KB não é usado aqui
        return;
      }
      if (mascarado && buf.length < off + 4) return;
      const mascara = mascarado ? buf.subarray(off, off + 4) : null;
      if (mascarado) off += 4;
      if (buf.length < off + tam) return;

      const carga = Buffer.from(buf.subarray(off, off + tam));
      if (mascara) {
        for (let i = 0; i < carga.length; i++) carga[i] ^= mascara[i % 4];
      }
      buf = buf.subarray(off + tam);

      if (opcode === 0x8) { socket.end(); return; }
      if (opcode === 0x9) { socket.write(montarQuadro(carga, 0xa)); continue; }
      if (opcode === 0xa) continue;
      if (!fim) { socket.destroy(); return; }   // não lidamos com fragmentação
      if (opcode === 0x1 || opcode === 0x2) aoReceber(carga);
    }
  });
}

servidor.on('upgrade', (req, socket) => {
  const chave = req.headers['sec-websocket-key'];
  if (!chave) { socket.destroy(); return; }
  const aceite = crypto.createHash('sha1').update(chave + GUID_WS).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${aceite}\r\n\r\n`
  );
  socket.setNoDelay(true);
  ligarRobo(socket);
});

/* ---------- tradução binário <-> texto ---------- */

function paraLinhaDoRobo(carga) {
  if (carga.length === 0) return null;
  switch (carga[0]) {
    case T_LOAD: {
      if (carga.length < 3) return null;
      const n = carga.readUInt16LE(1);
      if (carga.length !== 3 + n * 7) return null;
      return `L ${carga.subarray(3).toString('hex')}`;
    }
    case T_RUN:  return 'R';
    case T_STOP: return 'S';
    default:     return null;
  }
}

function paraQuadroDoNavegador(linha) {
  const p = linha.split(' ');
  if (p[0] === 'P') {
    const q = Buffer.alloc(3);
    q[0] = T_PC;
    q.writeUInt16LE(Number(p[1]) & 0xffff, 1);
    return q;
  }
  if (p[0] === 'E') {
    return Buffer.from([T_STATE, Number(p[1]) ? 1 : 0]);
  }
  if (p[0] === 'T') {
    const q = Buffer.alloc(9);
    q[0] = T_TELEM;
    q.writeInt16LE(Number(p[1]) | 0, 1);
    q.writeInt16LE(Number(p[2]) | 0, 3);
    q.writeInt16LE(Number(p[3]) | 0, 5);
    q.writeUInt16LE(Number(p[4]) & 0xffff, 7);
    return q;
  }
  return null;
}

/* ---------- um robô por conexão ---------- */

function ligarRobo(socket) {
  const proc = spawn(BIN_HOST, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  let pendente = '';

  proc.stdout.on('data', (pedaco) => {
    pendente += pedaco.toString();
    let i;
    while ((i = pendente.indexOf('\n')) >= 0) {
      const linha = pendente.slice(0, i).trim();
      pendente = pendente.slice(i + 1);
      const quadro = paraQuadroDoNavegador(linha);
      if (quadro && !socket.destroyed) socket.write(montarQuadro(quadro));
    }
  });

  lerQuadros(socket, (carga) => {
    const linha = paraLinhaDoRobo(carga);
    if (linha && proc.stdin.writable) proc.stdin.write(linha + '\n');
  });

  const encerrar = () => { try { proc.kill(); } catch (_) {} };
  socket.on('close', encerrar);
  socket.on('error', encerrar);
  proc.on('exit', () => socket.destroy());
}

if (require.main === module) {
  servidor.listen(PORTA, () => {
    console.log(`robô virtual em http://localhost:${PORTA}`);
  });
}

module.exports = { servidor, paraLinhaDoRobo, paraQuadroDoNavegador, montarQuadro };
```

- [x] **Passo 2: Criar um index.html mínimo**

`web/index.html` (será substituído na Tarefa 9; agora só existe para o teste do servidor estático):

```html
<!doctype html>
<meta charset="utf-8">
<title>Robô de Blocos</title>
<p>em construção</p>
```

- [x] **Passo 3: Escrever os testes**

`tests/bridge.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { paraLinhaDoRobo, paraQuadroDoNavegador, montarQuadro } =
  require('../bridge/server.js');

test('LOAD vira uma linha L com o programa em hex', () => {
  const carga = Buffer.alloc(3 + 7);
  carga[0] = 0x01;
  carga.writeUInt16LE(1, 1);
  carga[3] = 0x00;                        // HALT, resto zerado
  assert.strictEqual(paraLinhaDoRobo(carga), 'L 00000000000000');
});

test('LOAD com tamanho inconsistente é descartado', () => {
  const carga = Buffer.alloc(3 + 7);
  carga[0] = 0x01;
  carga.writeUInt16LE(5, 1);              // diz 5 instruções, traz 1
  assert.strictEqual(paraLinhaDoRobo(carga), null);
});

test('RUN e STOP viram R e S', () => {
  assert.strictEqual(paraLinhaDoRobo(Buffer.from([0x02])), 'R');
  assert.strictEqual(paraLinhaDoRobo(Buffer.from([0x03])), 'S');
});

test('tipo desconhecido é descartado', () => {
  assert.strictEqual(paraLinhaDoRobo(Buffer.from([0x77])), null);
});

test('P vira quadro de pc', () => {
  const q = paraQuadroDoNavegador('P 300');
  assert.strictEqual(q[0], 0x81);
  assert.strictEqual(q.readUInt16LE(1), 300);
});

test('E vira quadro de estado', () => {
  assert.deepStrictEqual([...paraQuadroDoNavegador('E 1')], [0x82, 1]);
  assert.deepStrictEqual([...paraQuadroDoNavegador('E 0')], [0x82, 0]);
});

test('T vira quadro de telemetria com sinal preservado', () => {
  const q = paraQuadroDoNavegador('T 1000 400 2700 92');
  assert.strictEqual(q[0], 0x83);
  assert.strictEqual(q.readInt16LE(1), 1000);
  assert.strictEqual(q.readInt16LE(3), 400);
  assert.strictEqual(q.readInt16LE(5), 2700);
  assert.strictEqual(q.readUInt16LE(7), 92);
});

test('quadro curto usa cabeçalho de 2 bytes', () => {
  const q = montarQuadro(Buffer.alloc(10));
  assert.strictEqual(q.length, 12);
  assert.strictEqual(q[0], 0x82);         // FIN + binário
  assert.strictEqual(q[1], 10);
});

test('quadro longo usa cabeçalho estendido de 4 bytes', () => {
  const q = montarQuadro(Buffer.alloc(1794));   // LOAD cheio: 256 instruções
  assert.strictEqual(q.length, 1798);
  assert.strictEqual(q[1], 126);
  assert.strictEqual(q.readUInt16BE(2), 1794);
});
```

- [x] **Passo 4: Rodar os testes**

Rodar: `node --test tests/bridge.test.js`
Esperado: 9 testes passando.

- [x] **Passo 5: Conferir o servidor à mão**

Rodar em um terminal: `node bridge/server.js`
Rodar em outro: `curl -s http://localhost:8080/ | head -3`
Esperado: o HTML mínimo. Encerrar com Ctrl+C.

- [x] **Passo 6: Commit**

```bash
git add bridge web/index.html tests/bridge.test.js
git commit -m "Adiciona bridge WebSocket sem dependências"
```

---

### Tarefa 7: Compilador de blocos

Converte a árvore de blocos em bytecode e no mapa `pc→blockId`. É código puro, sem Blockly e sem DOM — por isso roda no `node --test`.

**Arquivos:**
- Criar: `web/compilador.js`
- Criar: `tests/compilador.test.js`

**Interfaces:**
- Produz: `Compilador.compilar(ast) -> { bytes: Uint8Array, pcMap: Array<string|null> }`.
- Formato da AST (cada nó carrega `blockId`):
  - `{ op:'frente', segundos:Number, blockId }`
  - `{ op:'tras', segundos:Number, blockId }`
  - `{ op:'girar', graus:Number, blockId }`
  - `{ op:'esperar', segundos:Number, blockId }`
  - `{ op:'repetir', vezes:Number, corpo:[...], blockId }`
  - `{ op:'se_obstaculo', cm:Number, corpo:[...], blockId }`

- [x] **Passo 1: Criar o stub do compilador**

Existe para o passo RED ser uma asserção falhando de verdade, e não um
"módulo não encontrado" — que passaria igual se os testes tivessem erro de
sintaxe ou asserções vazias.

`web/compilador.js`:

```js
/* Stub: substituído pela implementação real no Passo 4. */
(function (raiz) {
  'use strict';
  const OP = {
    HALT: 0, MOTOR: 1, WAIT: 2, TURN: 3,
    SET_REG: 4, DEC_JNZ: 5, JMP: 6, JMP_IF_GE: 7,
  };
  const MAX_INSTR = 256;
  function compilar(ast) {
    void ast;
    return { bytes: new Uint8Array(0), pcMap: [] };
  }
  const api = { compilar, OP, MAX_INSTR };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Compilador = api;
})(typeof self !== 'undefined' ? self : globalThis);
```

- [x] **Passo 2: Escrever os testes que devem falhar**

`tests/compilador.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { compilar, OP } = require('../web/compilador.js');

function hex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

test('programa vazio vira só HALT', () => {
  const { bytes, pcMap } = compilar([]);
  assert.strictEqual(bytes.length, 7);
  assert.strictEqual(bytes[0], OP.HALT);
  assert.deepStrictEqual(pcMap, [null]);
});

test('frente vira MOTOR, WAIT, MOTOR', () => {
  const { bytes } = compilar([{ op: 'frente', segundos: 1, blockId: 'b1' }]);
  assert.strictEqual(bytes.length, 4 * 7);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(bytes[0], OP.MOTOR);
  assert.strictEqual(dv.getInt16(1, true), 200);
  assert.strictEqual(dv.getInt16(3, true), 200);
  assert.strictEqual(bytes[7], OP.WAIT);
  assert.strictEqual(dv.getInt16(8, true), 1000);
  assert.strictEqual(bytes[14], OP.MOTOR);
  assert.strictEqual(dv.getInt16(15, true), 0);
});

test('trás usa velocidade negativa', () => {
  const { bytes } = compilar([{ op: 'tras', segundos: 2, blockId: 'b1' }]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(dv.getInt16(1, true), -200);
  assert.strictEqual(dv.getInt16(8, true), 2000);
});

test('girar vira um único TURN', () => {
  const { bytes } = compilar([{ op: 'girar', graus: -90, blockId: 'b1' }]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(bytes[0], OP.TURN);
  assert.strictEqual(dv.getInt16(1, true), -90);
});

test('repetir fecha o laço voltando para o início do corpo', () => {
  const { bytes } = compilar([
    { op: 'repetir', vezes: 3, blockId: 'r', corpo: [
      { op: 'girar', graus: 90, blockId: 'g' },
    ] },
  ]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(bytes[0], OP.SET_REG);
  assert.strictEqual(dv.getInt16(1, true), 0);      // r0
  assert.strictEqual(dv.getInt16(3, true), 3);
  assert.strictEqual(bytes[7], OP.TURN);
  assert.strictEqual(bytes[14], OP.DEC_JNZ);
  assert.strictEqual(dv.getInt16(15, true), 0);     // r0
  assert.strictEqual(dv.getInt16(17, true), 1);     // volta para pc 1
});

test('repetir 0 vezes vira 1 e não trava a placa', () => {
  const { bytes } = compilar([
    { op: 'repetir', vezes: 0, blockId: 'r', corpo: [
      { op: 'girar', graus: 90, blockId: 'g' },
    ] },
  ]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(dv.getInt16(3, true), 1);
});

test('laços aninhados usam registradores diferentes', () => {
  const { bytes } = compilar([
    { op: 'repetir', vezes: 2, blockId: 'r1', corpo: [
      { op: 'repetir', vezes: 3, blockId: 'r2', corpo: [
        { op: 'girar', graus: 90, blockId: 'g' },
      ] },
    ] },
  ]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(dv.getInt16(1, true), 0);      // externo usa r0
  assert.strictEqual(dv.getInt16(8, true), 1);      // interno usa r1
});

test('laços fundos demais dão erro em português', () => {
  let no = { op: 'girar', graus: 90, blockId: 'g' };
  for (let i = 0; i < 5; i++) {
    no = { op: 'repetir', vezes: 2, blockId: 'r' + i, corpo: [no] };
  }
  assert.throws(() => compilar([no]), /aninhados/);
});

test('se_obstaculo salta para depois do corpo', () => {
  const { bytes } = compilar([
    { op: 'se_obstaculo', cm: 20, blockId: 's', corpo: [
      { op: 'girar', graus: 90, blockId: 'g' },
    ] },
  ]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(bytes[0], OP.JMP_IF_GE);
  assert.strictEqual(dv.getInt16(1, true), 0);      // sensor de distância
  assert.strictEqual(dv.getInt16(3, true), 20);
  assert.strictEqual(dv.getInt16(5, true), 2);      // pc 2 = depois do TURN
  assert.strictEqual(bytes[7], OP.TURN);
  assert.strictEqual(bytes[14], OP.HALT);
});

test('pcMap aponta cada instrução para o bloco que a gerou', () => {
  const { pcMap } = compilar([
    { op: 'repetir', vezes: 2, blockId: 'r', corpo: [
      { op: 'girar', graus: 90, blockId: 'g' },
    ] },
  ]);
  assert.deepStrictEqual(pcMap, ['r', 'g', 'r', null]);
});

test('programa dourado bate byte a byte com o teste da VM', () => {
  const { bytes } = compilar([
    { op: 'repetir', vezes: 4, blockId: 'r', corpo: [
      { op: 'frente', segundos: 1, blockId: 'f' },
      { op: 'girar', graus: 90, blockId: 'g' },
    ] },
  ]);
  assert.strictEqual(bytes.length, 49);
  assert.strictEqual(
    hex(bytes),
    '04000004000000' +   // SET_REG r0, 4
    '01c800c8000000' +   // MOTOR 200, 200
    '02e80300000000' +   // WAIT 1000
    '01000000000000' +   // MOTOR 0, 0
    '035a0000000000' +   // TURN 90
    '05000001000000' +   // DEC_JNZ r0, 1
    '00000000000000'     // HALT
  );
});

test('programa grande demais dá erro em português', () => {
  const corpo = [];
  for (let i = 0; i < 100; i++) corpo.push({ op: 'frente', segundos: 1, blockId: 'f' + i });
  assert.throws(() => compilar(corpo), /grande demais/);
});
```

- [x] **Passo 3: Rodar os testes para confirmar que falham**

Rodar: `node --test tests/compilador.test.js`

Esperado: o módulo carrega e os **12** testes falham por asserção — não por
módulo ausente. Os dois testes de `assert.throws` falham porque o stub não
lança nada, e os demais porque ele devolve zero bytes. Se algum teste passar
contra o stub, esse teste não está afirmando nada e precisa ser corrigido
antes de seguir.

- [x] **Passo 4: Implementar o compilador**

`web/compilador.js`:

```js
/* Compila a árvore de blocos em bytecode. Roda no navegador e no Node,
   sem depender de Blockly nem do DOM — é o que permite testá-lo. */
(function (raiz) {
  'use strict';

  const OP = {
    HALT: 0, MOTOR: 1, WAIT: 2, TURN: 3,
    SET_REG: 4, DEC_JNZ: 5, JMP: 6, JMP_IF_GE: 7,
  };

  const VEL_FRENTE = 200;
  const MAX_INSTR = 256;
  const N_REGS = 4;
  const SENSOR_DISTANCIA = 0;

  function compilar(ast) {
    const instrucoes = [];
    let profundidade = 0;

    function emitir(op, a, b, c, blockId) {
      instrucoes.push({ op, a: a | 0, b: b | 0, c: c | 0, blockId: blockId || null });
    }

    function gerar(nos) {
      for (const no of nos) {
        switch (no.op) {
          case 'frente':
            emitir(OP.MOTOR, VEL_FRENTE, VEL_FRENTE, 0, no.blockId);
            emitir(OP.WAIT, Math.round(no.segundos * 1000), 0, 0, no.blockId);
            emitir(OP.MOTOR, 0, 0, 0, no.blockId);
            break;

          case 'tras':
            emitir(OP.MOTOR, -VEL_FRENTE, -VEL_FRENTE, 0, no.blockId);
            emitir(OP.WAIT, Math.round(no.segundos * 1000), 0, 0, no.blockId);
            emitir(OP.MOTOR, 0, 0, 0, no.blockId);
            break;

          case 'girar':
            emitir(OP.TURN, no.graus, 0, 0, no.blockId);
            break;

          case 'esperar':
            emitir(OP.WAIT, Math.round(no.segundos * 1000), 0, 0, no.blockId);
            break;

          case 'repetir': {
            if (profundidade >= N_REGS) {
              throw new Error(
                'Tem blocos "repetir" aninhados demais — o máximo é ' + N_REGS + '.');
            }
            const registrador = profundidade++;
            /* Zero viraria laço infinito: DEC_JNZ nunca chegaria a zero. */
            const vezes = Math.max(1, Math.round(no.vezes));
            emitir(OP.SET_REG, registrador, vezes, 0, no.blockId);
            const inicio = instrucoes.length;
            gerar(no.corpo || []);
            emitir(OP.DEC_JNZ, registrador, inicio, 0, no.blockId);
            profundidade--;
            break;
          }

          case 'se_obstaculo': {
            const salto = instrucoes.length;
            emitir(OP.JMP_IF_GE, SENSOR_DISTANCIA, Math.round(no.cm), 0, no.blockId);
            gerar(no.corpo || []);
            instrucoes[salto].c = instrucoes.length;
            break;
          }

          default:
            throw new Error('Bloco desconhecido: ' + no.op);
        }
      }
    }

    gerar(ast);
    emitir(OP.HALT, 0, 0, 0, null);

    if (instrucoes.length > MAX_INSTR) {
      throw new Error(
        'O programa ficou grande demais: ' + instrucoes.length +
        ' instruções, e o robô só guarda ' + MAX_INSTR + '.');
    }

    const bytes = new Uint8Array(instrucoes.length * 7);
    const dv = new DataView(bytes.buffer);
    instrucoes.forEach((it, k) => {
      const o = k * 7;
      dv.setUint8(o, it.op);
      dv.setInt16(o + 1, it.a, true);
      dv.setInt16(o + 3, it.b, true);
      dv.setInt16(o + 5, it.c, true);
    });

    return { bytes, pcMap: instrucoes.map((it) => it.blockId) };
  }

  const api = { compilar, OP, MAX_INSTR };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Compilador = api;
})(typeof self !== 'undefined' ? self : globalThis);
```

- [x] **Passo 5: Rodar os testes para confirmar que passam**

Rodar: `node --test tests/compilador.test.js`
Esperado: 12 testes passando. O teste dourado é o que importa mais: ele prova que o compilador do navegador e o teste da VM em C falam exatamente a mesma linguagem.

- [x] **Passo 6: Commit**

```bash
git add web/compilador.js tests/compilador.test.js
git commit -m "Adiciona compilador de blocos para bytecode"
```

---

### Tarefa 8: Blocos Blockly

Baixa o Blockly, define os seis blocos em português e traduz o workspace para a AST que o compilador espera.

**Arquivos:**
- Criar: `web/vendor/blockly_compressed.js`, `web/vendor/pt-br.js` (baixados)
- Criar: `web/blocos.js`
- Modificar: `web/index.html`

**Interfaces:**
- Consome: `Compilador` da Tarefa 7.
- Produz: `Blocos.definir()`, `Blocos.workspaceParaAst(workspace) -> AST`, `Blocos.CAIXA_XML` (a toolbox).

- [x] **Passo 1: Baixar o Blockly**

```bash
mkdir -p web/vendor
curl -sL -o web/vendor/blockly_compressed.js \
  https://cdn.jsdelivr.net/npm/blockly@11.2.1/blockly_compressed.js
curl -sL -o web/vendor/pt-br.js \
  https://cdn.jsdelivr.net/npm/blockly@11.2.1/msg/pt-br.js
ls -l web/vendor
```

Esperado: `blockly_compressed.js` com ~922 KB e `pt-br.js` com ~35 KB. Os dois são UMD: carregados por `<script>`, o primeiro define o global `Blockly` e o segundo preenche `Blockly.Msg`, nessa ordem obrigatoriamente.

Não baixar `blocks_compressed.js` — ele traz os blocos padrão do Blockly, e aqui todos os blocos são nossos.

- [x] **Passo 2: Definir os blocos**

`web/blocos.js`:

```js
/* Os seis blocos da v1 e a tradução do workspace para a AST do compilador. */
(function (raiz) {
  'use strict';

  const COR_MOVIMENTO = 210;
  const COR_LACO = 120;
  const COR_SENSOR = 20;
  const COR_INICIO = 40;

  function definir() {
    Blockly.defineBlocksWithJsonArray([
      {
        type: 'quando_play',
        message0: '▶ quando apertar PLAY',
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        colour: COR_INICIO,
        tooltip: 'Tudo que estiver aqui dentro roda quando a criança apertar PLAY.',
      },
      {
        type: 'mover_frente',
        message0: 'andar frente %1 s',
        args0: [{ type: 'field_number', name: 'SEG', value: 1, min: 0.1, max: 10, precision: 0.1 }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_MOVIMENTO,
        tooltip: 'O robô anda para frente pelo tempo escolhido.',
      },
      {
        type: 'mover_tras',
        message0: 'andar trás %1 s',
        args0: [{ type: 'field_number', name: 'SEG', value: 1, min: 0.1, max: 10, precision: 0.1 }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_MOVIMENTO,
        tooltip: 'O robô anda de ré pelo tempo escolhido.',
      },
      {
        type: 'girar',
        message0: 'girar %1',
        args0: [{
          type: 'field_dropdown',
          name: 'DIR',
          options: [['direita ↻', '90'], ['esquerda ↺', '-90']],
        }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_MOVIMENTO,
        tooltip: 'O robô gira um quarto de volta.',
      },
      {
        type: 'esperar',
        message0: 'esperar %1 s',
        args0: [{ type: 'field_number', name: 'SEG', value: 1, min: 0.1, max: 10, precision: 0.1 }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_MOVIMENTO,
        tooltip: 'O robô fica parado pelo tempo escolhido.',
      },
      {
        type: 'repetir',
        message0: 'repetir %1 vezes',
        args0: [{ type: 'field_number', name: 'N', value: 4, min: 1, max: 100, precision: 1 }],
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_LACO,
        tooltip: 'Repete os blocos de dentro o número de vezes escolhido.',
      },
      {
        type: 'se_obstaculo',
        message0: 'se obstáculo a menos de %1 cm',
        args0: [{ type: 'field_number', name: 'CM', value: 20, min: 2, max: 400, precision: 1 }],
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_SENSOR,
        tooltip: 'Só faz os blocos de dentro se tiver algo perto na frente.',
      },
    ]);
  }

  const CAIXA_XML =
    '<xml id="caixa" style="display: none">' +
    '  <category name="Movimento" colour="' + COR_MOVIMENTO + '">' +
    '    <block type="mover_frente"></block>' +
    '    <block type="mover_tras"></block>' +
    '    <block type="girar"></block>' +
    '    <block type="esperar"></block>' +
    '  </category>' +
    '  <category name="Repetir" colour="' + COR_LACO + '">' +
    '    <block type="repetir"></block>' +
    '  </category>' +
    '  <category name="Sentidos" colour="' + COR_SENSOR + '">' +
    '    <block type="se_obstaculo"></block>' +
    '  </category>' +
    '</xml>';

  function blocoParaNo(b) {
    const id = b.id;
    switch (b.type) {
      case 'mover_frente':
        return { op: 'frente', segundos: Number(b.getFieldValue('SEG')), blockId: id };
      case 'mover_tras':
        return { op: 'tras', segundos: Number(b.getFieldValue('SEG')), blockId: id };
      case 'girar':
        return { op: 'girar', graus: Number(b.getFieldValue('DIR')), blockId: id };
      case 'esperar':
        return { op: 'esperar', segundos: Number(b.getFieldValue('SEG')), blockId: id };
      case 'repetir':
        return {
          op: 'repetir',
          vezes: Number(b.getFieldValue('N')),
          corpo: pilhaParaAst(b.getInputTargetBlock('CORPO')),
          blockId: id,
        };
      case 'se_obstaculo':
        return {
          op: 'se_obstaculo',
          cm: Number(b.getFieldValue('CM')),
          corpo: pilhaParaAst(b.getInputTargetBlock('CORPO')),
          blockId: id,
        };
      default:
        throw new Error('Bloco sem tradução: ' + b.type);
    }
  }

  function pilhaParaAst(bloco) {
    const nos = [];
    while (bloco) {
      if (bloco.isEnabled() && !bloco.isInsertionMarker()) {
        nos.push(blocoParaNo(bloco));
      }
      bloco = bloco.getNextBlock();
    }
    return nos;
  }

  function workspaceParaAst(workspace) {
    const raizes = workspace.getBlocksByType('quando_play', false);
    if (raizes.length === 0) return [];
    return pilhaParaAst(raizes[0].getInputTargetBlock('CORPO'));
  }

  raiz.Blocos = { definir, workspaceParaAst, CAIXA_XML };
})(typeof self !== 'undefined' ? self : globalThis);
```

- [x] **Passo 3: Montar o index.html com o editor**

`web/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Robô de Blocos</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; height: 100vh; display: flex; flex-direction: column;
    font-family: system-ui, sans-serif; background: #f2f4f7;
  }
  header {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 16px; background: #fff; border-bottom: 1px solid #d7dce3;
  }
  header h1 { font-size: 18px; margin: 0; flex: 1; }
  button {
    font-size: 18px; font-weight: 600; padding: 10px 22px;
    border: none; border-radius: 10px; color: #fff; cursor: pointer;
  }
  #play { background: #1f9d4d; }
  #parar { background: #c0392b; }
  button:disabled { opacity: .45; cursor: default; }
  #estado { font-size: 14px; color: #667; min-width: 160px; text-align: right; }
  main { flex: 1; display: flex; min-height: 0; }
  #editor { flex: 1; min-width: 0; }
  #painel {
    width: 440px; padding: 16px; background: #fff;
    border-left: 1px solid #d7dce3; display: flex;
    flex-direction: column; gap: 12px;
  }
  #arena { width: 100%; aspect-ratio: 1; border-radius: 8px; background: #e9edf2; }
  #leitura { font-size: 14px; color: #445; }
  #erro { color: #c0392b; font-size: 14px; min-height: 20px; }
</style>
</head>
<body>
  <header>
    <h1>Robô de Blocos</h1>
    <span id="erro"></span>
    <button id="play">▶ PLAY</button>
    <button id="parar" disabled>■ PARAR</button>
    <span id="estado">conectando…</span>
  </header>
  <main>
    <div id="editor"></div>
    <aside id="painel">
      <canvas id="arena" width="400" height="400"></canvas>
      <div id="leitura">distância: —</div>
    </aside>
  </main>

  <script src="vendor/blockly_compressed.js"></script>
  <script src="vendor/pt-br.js"></script>
  <script src="compilador.js"></script>
  <script src="blocos.js"></script>
  <script src="rede.js"></script>
  <script src="arena.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [x] **Passo 4: Conferir que os blocos aparecem**

`rede.js`, `arena.js` e `app.js` só existem na Tarefa 9, então o console vai acusar 404 neles — é esperado. O que precisa funcionar agora é o Blockly carregar.

Rodar: `node bridge/server.js` e abrir `http://localhost:8080`.
Esperado: a página carrega. No console do navegador, `Blockly` e `Blocos` existem e `Blockly.Msg.ADD_COMMENT` devolve `"Adicionar comentário"` — prova que o arquivo de idioma entrou.

- [x] **Passo 5: Commit**

```bash
git add web/vendor web/blocos.js web/index.html
git commit -m "Adiciona blocos Blockly em português e vendoriza a biblioteca"
```

---

### Tarefa 9: Fechar o ciclo — arena, rede e PLAY

Liga tudo: a criança arrasta blocos, aperta PLAY, o robô virtual anda e o bloco em execução acende.

**Arquivos:**
- Criar: `web/rede.js`, `web/arena.js`, `web/app.js`

**Interfaces:**
- Consome: `Compilador.compilar`, `Blocos.workspaceParaAst`, `Blocos.CAIXA_XML`.
- Produz: `Rede.conectar(url, manipuladores) -> { carregar, rodar, parar }`, `Arena.desenhar(ctx, estado)`.

- [x] **Passo 1: Implementar o cliente de rede**

`web/rede.js`:

```js
/* Fala o protocolo binário. É o mesmo código para o robô virtual e para a
   ESP32 — só muda a URL. */
(function (raiz) {
  'use strict';

  const T_LOAD = 0x01, T_RUN = 0x02, T_STOP = 0x03;
  const T_PC = 0x81, T_STATE = 0x82, T_TELEM = 0x83;

  function conectar(url, manipuladores) {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => manipuladores.aoConectar && manipuladores.aoConectar();
    ws.onclose = () => manipuladores.aoDesconectar && manipuladores.aoDesconectar();
    ws.onerror = () => manipuladores.aoDesconectar && manipuladores.aoDesconectar();

    ws.onmessage = (ev) => {
      const d = new DataView(ev.data);
      if (d.byteLength === 0) return;
      switch (d.getUint8(0)) {
        case T_PC:
          if (manipuladores.aoPc) manipuladores.aoPc(d.getUint16(1, true));
          break;
        case T_STATE:
          if (manipuladores.aoEstado) manipuladores.aoEstado(d.getUint8(1));
          break;
        case T_TELEM:
          if (manipuladores.aoTelem) {
            manipuladores.aoTelem({
              x: d.getInt16(1, true) / 1000,
              y: d.getInt16(3, true) / 1000,
              theta: (d.getInt16(5, true) / 10) * Math.PI / 180,
              dist: d.getUint16(7, true),
            });
          }
          break;
        default:
          break;
      }
    };

    function pronto() { return ws.readyState === WebSocket.OPEN; }

    return {
      pronto,
      carregar(bytes) {
        if (!pronto()) return;
        const quadro = new Uint8Array(3 + bytes.length);
        new DataView(quadro.buffer).setUint8(0, T_LOAD);
        new DataView(quadro.buffer).setUint16(1, bytes.length / 7, true);
        quadro.set(bytes, 3);
        ws.send(quadro);
      },
      rodar() { if (pronto()) ws.send(new Uint8Array([T_RUN])); },
      parar() { if (pronto()) ws.send(new Uint8Array([T_STOP])); },
    };
  }

  raiz.Rede = { conectar };
})(typeof self !== 'undefined' ? self : globalThis);
```

- [x] **Passo 2: Implementar a arena**

`web/arena.js`:

```js
/* Desenha o robô virtual. Só existe no modo de teste: com a ESP32 nenhum
   pacote de telemetria chega e este painel some. */
(function (raiz) {
  'use strict';

  const LADO_M = 2.0;           /* precisa bater com ARENA_LADO em physics.h */
  const RAIO_M = 0.08;
  const OBSTACULOS = [{ x0: 0.80, y0: 1.40, x1: 1.20, y1: 1.60 }];

  function desenhar(ctx, estado) {
    const px = ctx.canvas.width;
    const m = (v) => (v / LADO_M) * px;
    /* y do canvas cresce para baixo; y da arena cresce para cima */
    const my = (v) => px - (v / LADO_M) * px;

    ctx.clearRect(0, 0, px, px);

    ctx.fillStyle = '#e9edf2';
    ctx.fillRect(0, 0, px, px);
    ctx.strokeStyle = '#9aa5b1';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, px - 4, px - 4);

    ctx.fillStyle = '#b0bac5';
    for (const o of OBSTACULOS) {
      ctx.fillRect(m(o.x0), my(o.y1), m(o.x1 - o.x0), m(o.y1 - o.y0));
    }

    if (!estado) return;

    /* feixe do ultrassônico */
    const alcance = Math.min(estado.dist / 100, 4);
    ctx.strokeStyle = 'rgba(224, 138, 30, .55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(m(estado.x), my(estado.y));
    ctx.lineTo(
      m(estado.x + (RAIO_M + alcance) * Math.cos(estado.theta)),
      my(estado.y + (RAIO_M + alcance) * Math.sin(estado.theta))
    );
    ctx.stroke();

    /* corpo */
    ctx.fillStyle = '#1f6feb';
    ctx.beginPath();
    ctx.arc(m(estado.x), my(estado.y), m(RAIO_M), 0, Math.PI * 2);
    ctx.fill();

    /* nariz, para a criança ver para onde ele aponta */
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(m(estado.x), my(estado.y));
    ctx.lineTo(
      m(estado.x + RAIO_M * Math.cos(estado.theta)),
      my(estado.y + RAIO_M * Math.sin(estado.theta))
    );
    ctx.stroke();
  }

  raiz.Arena = { desenhar };
})(typeof self !== 'undefined' ? self : globalThis);
```

- [x] **Passo 3: Implementar a fiação**

`web/app.js`:

```js
(function () {
  'use strict';

  const btPlay = document.getElementById('play');
  const btParar = document.getElementById('parar');
  const spEstado = document.getElementById('estado');
  const spErro = document.getElementById('erro');
  const divLeitura = document.getElementById('leitura');
  const ctx = document.getElementById('arena').getContext('2d');
  const painel = document.getElementById('painel');

  let mapaPc = [];
  let blocoAceso = null;
  let robo = null;
  let viuTelemetria = false;

  Blocos.definir();

  const workspace = Blockly.inject('editor', {
    toolbox: Blocos.CAIXA_XML,
    trashcan: true,
    zoom: { controls: true, startScale: 1.0 },
    grid: { spacing: 22, length: 3, colour: '#dde3ea', snap: true },
  });

  /* O bloco raiz nasce fixo: a criança não precisa saber que ele existe. */
  const raiz = Blockly.serialization.blocks.append(
    { type: 'quando_play', x: 40, y: 30 }, workspace);
  raiz.setDeletable(false);
  raiz.setMovable(false);

  Arena.desenhar(ctx, null);

  function acender(id) {
    if (blocoAceso === id) return;
    if (blocoAceso) workspace.highlightBlock(null);
    blocoAceso = id;
    if (id) workspace.highlightBlock(id);
  }

  function definirRodando(rodando) {
    btPlay.disabled = rodando || !robo || !robo.pronto();
    btParar.disabled = !rodando;
    spEstado.textContent = rodando ? 'rodando' : 'parado';
    if (!rodando) acender(null);
  }

  function conectar() {
    const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:';
    robo = Rede.conectar(`${protocolo}//${location.host}/`, {
      aoConectar() {
        spEstado.textContent = 'parado';
        btPlay.disabled = false;
      },
      aoDesconectar() {
        spEstado.textContent = 'desconectado';
        btPlay.disabled = true;
        btParar.disabled = true;
        setTimeout(conectar, 1500);
      },
      aoPc(pc) {
        acender(pc < mapaPc.length ? mapaPc[pc] : null);
      },
      aoEstado(estado) {
        definirRodando(estado === 1);
      },
      aoTelem(t) {
        if (!viuTelemetria) { viuTelemetria = true; painel.style.display = 'flex'; }
        Arena.desenhar(ctx, t);
        divLeitura.textContent = `distância: ${t.dist} cm`;
      },
    });
  }

  /* Sem telemetria por 2 s significa robô real: esconde a arena. */
  setTimeout(() => { if (!viuTelemetria) painel.style.display = 'none'; }, 2000);

  btPlay.addEventListener('click', () => {
    spErro.textContent = '';
    let compilado;
    try {
      compilado = Compilador.compilar(Blocos.workspaceParaAst(workspace));
    } catch (e) {
      spErro.textContent = e.message;
      return;
    }
    mapaPc = compilado.pcMap;
    robo.carregar(compilado.bytes);
    robo.rodar();
  });

  btParar.addEventListener('click', () => robo.parar());

  conectar();
})();
```

- [x] **Passo 4: Rodar o ciclo completo à mão**

```bash
cd host && make && cd ..
node bridge/server.js
```

Abrir `http://localhost:8080` e:

1. Arrastar `repetir` para dentro do bloco PLAY, deixar em 4 vezes.
2. Colocar `andar frente 1 s` e `girar direita` dentro do repetir.
3. Apertar PLAY.

Esperado:
- o robô azul anda para cima na arena, gira, anda, gira — quatro vezes;
- o bloco em execução fica destacado enquanto roda;
- o feixe laranja encurta quando o robô aponta para o obstáculo cinza;
- `distância: N cm` muda;
- ao terminar, o botão PARAR desabilita sozinho;
- apertar PARAR no meio congela o robô na hora.

- [x] **Passo 5: Rodar toda a bateria de testes**

```bash
cd tests && make test && cd ..
./tests/host_test.sh
node --test tests/
```

Esperado: tudo passando.

- [x] **Passo 6: Commit**

```bash
git add web/rede.js web/arena.js web/app.js
git commit -m "Fecha o ciclo blocos-PLAY-robô com arena e destaque de bloco"
```

---

### Tarefa 10: Firmware da ESP32

Escreve o firmware que roda o mesmo `core/vm.c`. Sem a placa, a verificação possível é a compilação — que já pega erro de API, de tipo e de biblioteca.

**Arquivos:**
- Criar: `core/library.json`
- Criar: `firmware/platformio.ini`, `firmware/src/main.cpp`, `firmware/src/hal_esp32.cpp`
- Criar: `firmware/preparar_data.sh`
- Modificar: `.gitignore`

**Interfaces:**
- Consome: `vm.h`, `hal.h` (via `lib_extra_dirs`).
- Produz: firmware que cria a rede `Robo-01` e serve a interface em `192.168.4.1`.

- [x] **Passo 1: Transformar core em biblioteca do PlatformIO**

`core/library.json`:

```json
{
  "name": "core",
  "version": "1.0.0",
  "description": "VM de bytecode compartilhada entre o simulador e a ESP32",
  "build": { "srcFilter": "+<*.c>" }
}
```

`firmware/platformio.ini`:

```ini
[env:esp32dev]
platform = espressif32@^6.5.0
board = esp32dev
framework = arduino
monitor_speed = 115200
board_build.filesystem = littlefs

; core/ vira uma biblioteca: #include "vm.h" funciona e o vm.c é compilado
lib_extra_dirs = ${PROJECT_DIR}/..

lib_deps =
    mathieucarbou/ESPAsyncWebServer @ ^3.1.0

build_flags = -Wall
```

- [x] **Passo 2: Implementar o HAL da placa**

`firmware/src/hal_esp32.cpp`:

```cpp
#include <Arduino.h>
extern "C" {
#include "hal.h"
}

/* TB6612FNG */
static const int PIN_PWMA = 25, PIN_AIN1 = 26, PIN_AIN2 = 27;
static const int PIN_PWMB = 33, PIN_BIN1 = 14, PIN_BIN2 = 12;
static const int PIN_STBY = 13;

/* HC-SR04 */
static const int PIN_TRIG = 5, PIN_ECHO = 18;

static const int CANAL_A = 0, CANAL_B = 1;

void hal_esp32_setup() {
    pinMode(PIN_AIN1, OUTPUT); pinMode(PIN_AIN2, OUTPUT);
    pinMode(PIN_BIN1, OUTPUT); pinMode(PIN_BIN2, OUTPUT);
    pinMode(PIN_STBY, OUTPUT); digitalWrite(PIN_STBY, HIGH);

    ledcSetup(CANAL_A, 20000, 8);
    ledcSetup(CANAL_B, 20000, 8);
    ledcAttachPin(PIN_PWMA, CANAL_A);
    ledcAttachPin(PIN_PWMB, CANAL_B);

    pinMode(PIN_TRIG, OUTPUT); digitalWrite(PIN_TRIG, LOW);
    pinMode(PIN_ECHO, INPUT);
}

static void um_motor(int canal, int in1, int in2, int16_t v) {
    if (v > 255) v = 255;
    if (v < -255) v = -255;
    digitalWrite(in1, v >= 0 ? HIGH : LOW);
    digitalWrite(in2, v >= 0 ? LOW : HIGH);
    ledcWrite(canal, (uint32_t)(v >= 0 ? v : -v));
}

extern "C" void hal_motors(int16_t esq, int16_t dir) {
    um_motor(CANAL_A, PIN_AIN1, PIN_AIN2, esq);
    um_motor(CANAL_B, PIN_BIN1, PIN_BIN2, dir);
}

extern "C" uint32_t hal_millis(void) {
    return (uint32_t)millis();
}

/* O HC-SR04 é lento. Ler a cada chamada travaria a VM por até 25 ms, então
   a leitura é feita no máximo a cada 60 ms e o último valor fica em cache. */
extern "C" uint16_t hal_distancia_cm(void) {
    static uint32_t ultima = 0;
    static uint16_t cache = 400;

    uint32_t agora = millis();
    if (agora - ultima < 60) return cache;
    ultima = agora;

    digitalWrite(PIN_TRIG, LOW);  delayMicroseconds(2);
    digitalWrite(PIN_TRIG, HIGH); delayMicroseconds(10);
    digitalWrite(PIN_TRIG, LOW);

    unsigned long us = pulseIn(PIN_ECHO, HIGH, 25000UL);
    if (us == 0) { cache = 400; return cache; }

    long cm = (long)(us / 58);
    if (cm < 2) cm = 2;
    if (cm > 400) cm = 400;
    cache = (uint16_t)cm;
    return cache;
}
```

- [x] **Passo 3: Implementar o programa principal**

`firmware/src/main.cpp`:

```cpp
#include <Arduino.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <Ticker.h>
#include <WiFi.h>

extern "C" {
#include "hal.h"
#include "vm.h"
}

void hal_esp32_setup();

static const char *NOME_REDE = "Robo-01";
static const char *SENHA     = "robo1234";   /* mínimo 8 caracteres */

static const uint8_t T_LOAD = 0x01, T_RUN = 0x02, T_STOP = 0x03;
static const uint8_t T_PC = 0x81, T_STATE = 0x82;

static const int MAX_INSTR_LOOP = 256;
static const uint32_t PC_MIN_MS = 30;

static AsyncWebServer servidor(80);
static AsyncWebSocket ws("/");
static Ticker vigia;

static VM vm;
static uint16_t pc_enviado = 0xFFFF;
static uint32_t pc_ultimo_ms = 0;
static uint8_t  rodando_ant = 0;

/* Roda no contexto do timer, independente do loop() — é isso que faz o
   watchdog valer alguma coisa.

   Há uma corrida com o vm_tick() do loop(), assumida de propósito: os dois
   caminhos só empurram a VM na direção de "parada", nunca de volta. O pior
   caso é um vm_stop pela metade, e o tick seguinte termina o serviço. Um
   mutex aqui custaria mais do que resolve. */
static void checar_vigia() {
    vm_watchdog_check(&vm, hal_millis());
}

static void enviar_pc(uint16_t pc) {
    uint8_t q[3] = { T_PC, (uint8_t)(pc & 0xFF), (uint8_t)(pc >> 8) };
    ws.binaryAll(q, sizeof(q));
}

static void enviar_estado(uint8_t estado) {
    uint8_t q[2] = { T_STATE, estado };
    ws.binaryAll(q, sizeof(q));
}

static void aoEvento(AsyncWebSocket *, AsyncWebSocketClient *cliente,
                     AwsEventType tipo, void *arg, uint8_t *dados, size_t tam) {
    if (tipo == WS_EVT_CONNECT) {
        enviar_estado(vm.rodando);
        return;
    }
    if (tipo != WS_EVT_DATA) return;

    AwsFrameInfo *info = (AwsFrameInfo *)arg;
    if (!info->final || info->index != 0 || info->len != tam) return;  /* sem fragmentação */
    if (tam == 0) return;

    switch (dados[0]) {
    case T_LOAD: {
        if (tam < 3) return;
        uint16_t n = (uint16_t)(dados[1] | (dados[2] << 8));
        if (tam != (size_t)(3 + n * INSTR_BYTES)) return;
        vm_load(&vm, dados + 3, (uint16_t)(n * INSTR_BYTES));
        pc_enviado = 0xFFFF;
        break;
    }
    case T_RUN:
        vm_run(&vm);
        break;
    case T_STOP:
        vm_stop(&vm);
        break;
    default:
        break;
    }
}

void setup() {
    Serial.begin(115200);
    hal_esp32_setup();
    vm_init(&vm);

    if (!LittleFS.begin(true)) {
        Serial.println("LittleFS falhou");
    }

    WiFi.mode(WIFI_AP);
    WiFi.softAP(NOME_REDE, SENHA);
    Serial.print("rede ");
    Serial.print(NOME_REDE);
    Serial.print("  ->  http://");
    Serial.println(WiFi.softAPIP());

    ws.onEvent(aoEvento);
    servidor.addHandler(&ws);
    servidor.serveStatic("/", LittleFS, "/")
            .setDefaultFile("index.html");
    servidor.begin();

    vigia.attach_ms(50, checar_vigia);
}

void loop() {
    for (int k = 0; k < MAX_INSTR_LOOP && vm.rodando
                    && !vm_esperando(&vm, hal_millis()); k++) {
        vm_tick(&vm);
    }

    uint32_t agora = hal_millis();
    if (vm.pc != pc_enviado && agora - pc_ultimo_ms >= PC_MIN_MS) {
        pc_enviado = vm.pc;
        pc_ultimo_ms = agora;
        enviar_pc(vm.pc);
    }
    if (vm.rodando != rodando_ant) {
        rodando_ant = vm.rodando;
        enviar_estado(vm.rodando);
    }

    ws.cleanupClients();
}
```

- [x] **Passo 4: Script que prepara os arquivos da placa**

`firmware/preparar_data.sh`:

```bash
#!/usr/bin/env bash
# Copia web/ para firmware/data/ e comprime, para caber no LittleFS.
set -eu

cd "$(dirname "$0")"
rm -rf data
mkdir -p data/vendor

cp ../web/*.html ../web/*.js data/
cp ../web/vendor/*.js data/vendor/

# O ESPAsyncWebServer serve o .gz automaticamente quando só ele existe.
find data -name '*.js' -o -name '*.html' | while read -r f; do
    gzip -9 "$f"
done

echo "tamanho total:"
du -sh data
```

Tornar executável: `chmod +x firmware/preparar_data.sh`

- [x] **Passo 5: Compilar**

```bash
./firmware/preparar_data.sh
cd firmware && pio run
```

Esperado: `SUCCESS`. A primeira execução baixa a toolchain do ESP32 (algumas centenas de MB) e precisa de internet.

Conferir também a saída do `preparar_data.sh`: o total precisa ficar em torno de 220 KB. Se passar de 1 MB, o LittleFS padrão não comporta e é preciso ajustar a tabela de partições.

Se a resolução de `mathieucarbou/ESPAsyncWebServer @ ^3.1.0` falhar, rodar `pio pkg search ESPAsyncWebServer` e fixar uma versão existente. A API usada aqui (`AsyncWebServer`, `AsyncWebSocket`, `binaryAll`, `serveStatic`, `AwsFrameInfo`) é estável entre as versões 3.x.

- [x] **Passo 6: Atualizar o .gitignore**

Adicionar a `.gitignore`:

```
firmware/.pio/
firmware/data/
```

- [x] **Passo 7: Commit**

```bash
git add core/library.json firmware .gitignore
git commit -m "Adiciona firmware da ESP32 reusando a mesma VM"
```

---

## Como saber que acabou

```bash
cd tests && make test && cd ..      # VM e física
./tests/host_test.sh                # robô virtual de ponta a ponta
node --test tests/                  # compilador e bridge
cd firmware && pio run && cd ..     # firmware compila
```

E o teste que nenhuma máquina faz: sentar uma criança na frente da tela e ver quanto tempo ela leva para fazer o robô dar uma volta no quadrado sem ninguém explicar nada.
