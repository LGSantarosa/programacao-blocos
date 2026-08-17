# Números que se calculam — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um número dentro de um bloco pode ser uma conta, e nasce o quarto nível — o Gigante — onde a criança tem contas, comparações e o `distância cm` como valor.

**Architecture:** A VM ganha uma pilha de valores e passa a ler dela os argumentos que hoje vêm no corpo da instrução; o formato de 7 bytes não muda. O compilador passa a ter um caminho único: todo slot de valor vira `PUSH`. Na tela, os campos numéricos viram encaixes com shadow block — idênticos ao que eram nos três níveis de baixo, e capazes de receber uma conta no quarto.

**Tech Stack:** C11 para a VM (`core/`), JavaScript ES5 sem transpilador para a interface (`web/`), Blockly 8 compilado, `node:test`, `make` para os testes em C, Chromium headless via CDP.

**Spec:** [`docs/superpowers/specs/2026-08-17-numeros-que-se-calculam-design.md`](../specs/2026-08-17-numeros-que-se-calculam-design.md)

## Global Constraints

Valem para **todas** as tarefas.

- **ES5 estrito em tudo dentro de `web/`.** Nada de `let`, `const`, arrow function, template literal, `class`, spread/rest, `**`, nem método abreviado em objeto (`{ m() {} }` → `{ m: function () {} }`). O alvo é o Safari do iOS 9 num iPad 2, que dá erro ao **carregar** o arquivo. `tests/es5.test.js` é o guarda, e varre todo `web/*.js`. Arquivos em `tests/` rodam em Node e **não** têm essa restrição.
- **CSS sem `var()`, sem `gap`, sem `aspect-ratio`, sem `inset`, e sem `<dialog>`.** Mesma razão.
- **C sem alocação dinâmica em `core/`.** Nada de `malloc`. Tudo é vetor de tamanho fixo dentro do `struct VM` — é o que faz a mesma VM rodar no PC e na ESP32.
- **Comentários em português**, explicando *por que*, não *o quê*. Siga a densidade dos arquivos vizinhos.
- **Cores exatas do projeto:** azul royal `#0050f0`, ciano `#20b0f0`, navy `#002080`, amarelo `#f0c000`, verde do PLAY `#37c26b`, vermelho do PARAR `#f25c4a`.
- **Commits em português, no imperativo**, descrevendo a intenção e não o diff.
- **Como rodar os testes:**
  - Tudo: `node --test tests/` (leva ~5 min por causa dos testes de Chromium)
  - Tudo menos os lentos: `node --test $(ls tests/*.test.js | grep -v gabaritos.test.js | grep -v navegador.test.js)`. Nada de `--test-skip-pattern`: esta máquina tem Node 18 e a flag só existe da 20 em diante.
  - Um arquivo: `node --test tests/compilador.test.js`
  - C: `make -C tests test`
  - Ponta a ponta sem placa: `bash tests/host_test.sh`
  - Firmware: `cd firmware && pio run`

## A AST, que é o contrato entre quase todas as tarefas

Hoje um nó de comando carrega números crus:

```javascript
{ op: 'frente', segundos: 1, velocidade: 200, blockId: 'b1' }
```

A partir da Task 4, cada um desses campos é um **valor**: ou um número, ou um nó
de valor. Um nó de valor tem `op` em:

`mais` `menos` `vezes` `dividir` `aleatorio` `menor` `maior` `igual` `e` `ou` `nao` `distancia`

Binários carregam `a` e `b`; `nao` carrega só `a`; `distancia` não carrega nada.
Todos carregam `blockId`. Exemplo:

```javascript
{ op: 'frente',
  segundos: { op: 'aleatorio', a: 1, b: 3, blockId: 'r1' },
  velocidade: 200, blockId: 'b1' }
```

E três nós de comando novos, do Gigante:

```javascript
{ op: 'se',        cond: <valor>, corpo: [...], blockId }
{ op: 'se_entao_senao', cond: <valor>, entao: [...], senao: [...], blockId }
{ op: 'repetir_ate', cond: <valor>, corpo: [...], blockId }
```

---

## Estrutura de arquivos

| arquivo | responsabilidade | tarefa |
|---|---|---|
| `core/bytecode.h` | opcodes, `MAX_INSTR`, seletores de `BIN`/`UN` | 1, 2 |
| `core/vm.h` | a pilha dentro do `struct VM` | 1 |
| `core/vm.c` | executa os opcodes novos; os antigos passam a desempilhar | 1, 2 |
| `tests/vm_test.c` | a pilha e cada operação, sem hardware | 1, 2 |
| `web/compilador.js` | AST → bytecode, por caminho único de pilha | 2, 4 |
| `web/campos.js` | os dois tipos de shadow block | 3 |
| `web/blocos.js` | campos viram encaixes; os 14 blocos novos; a AST deles | 3, 4 |
| `web/niveis.js` | visibilidade por encaixe; o nível Gigante | 3, 4 |
| `web/gabarito.js` | monta `inputs` com shadow em vez de `fields` | 5 |
| `web/arduino.js` | expressões em C++ | 6 |
| `firmware/src/quadros.h` | remonta mensagem WebSocket fragmentada, em C puro | 7 |
| `firmware/src/main.cpp` | usa o montador | 7 |
| `README.md` | o quarto nível e as duas tabelas de tradução | 8 |

---

## Task 1: a pilha na VM

Entrega sozinha: a VM passa a saber empilhar, calcular e saltar por valor, com os
opcodes antigos intactos. Nada na interface muda ainda.

**Files:**
- Modify: `core/bytecode.h`, `core/vm.h`, `core/vm.c`
- Test: `tests/vm_test.c`

**Interfaces:**
- Consumes: `hal_distancia_cm()`, `hal_millis()`, `hal_motors()` (já existem em `core/hal.h`).
- Produces, para a Task 2:
  - `OP_PUSH = 8`, `OP_SENSOR = 9`, `OP_BIN = 10`, `OP_UN = 11`, `OP_JMP_FALSE = 12`
  - Seletores de `BIN`: `BIN_MAIS 0`, `BIN_MENOS 1`, `BIN_VEZES 2`, `BIN_DIVIDIR 3`, `BIN_MENOR 4`, `BIN_MAIOR 5`, `BIN_IGUAL 6`, `BIN_E 7`, `BIN_OU 8`, `BIN_ALEATORIO 9`
  - Seletor de `UN`: `UN_NAO 0`
  - `PILHA_MAX 16`, e `int32_t pilha[PILHA_MAX]` mais `uint8_t topo` no `struct VM`

- [ ] **Step 1: Escrever os testes que falham**

Acrescente a `tests/vm_test.c`, antes do `main`:

```c
/* Empilhar e somar. O MOTOR passa a ler da pilha, então este teste também
   prova que a ordem de desempilhar é (esquerdo, direito) e não o contrário. */
static void teste_pilha_soma(void) {
    printf("teste_pilha_soma\n");
    VM vm;
    uint8_t prog[6 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_PUSH, 100, 0, 0);
    p = emit(p, OP_PUSH, 20, 0, 0);
    p = emit(p, OP_BIN, BIN_MAIS, 0, 0);   /* 120 */
    p = emit(p, OP_PUSH, 7, 0, 0);
    p = emit(p, OP_MOTOR, 0, 0, 0);        /* esq=120, dir=7 */
    p = emit(p, OP_HALT, 0, 0, 0);

    preparar(&vm, prog, sizeof(prog));
    rodar_ate_parar(&vm);

    const char *esperado[] = { "MOTOR 120,7", "MOTOR 0,0" };
    checar_trace(esperado, 2);
}

/* Uma criança vai dividir por zero. O robô não pode morrer no meio da sala. */
static void teste_dividir_por_zero_da_zero(void) {
    printf("teste_dividir_por_zero_da_zero\n");
    VM vm;
    uint8_t prog[6 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_PUSH, 100, 0, 0);
    p = emit(p, OP_PUSH, 0, 0, 0);
    p = emit(p, OP_BIN, BIN_DIVIDIR, 0, 0);
    p = emit(p, OP_PUSH, 0, 0, 0);
    p = emit(p, OP_MOTOR, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);

    preparar(&vm, prog, sizeof(prog));
    rodar_ate_parar(&vm);

    const char *esperado[] = { "MOTOR 0,0", "MOTOR 0,0" };
    checar_trace(esperado, 2);
    CHECK(vm.rodando == 0);
}

/* Cada comparação e cada booleano, num programa só: o resultado vira a
   velocidade do motor esquerdo, então o trace conta o que deu. */
static void teste_comparacoes_e_booleanos(void) {
    printf("teste_comparacoes_e_booleanos\n");
    struct { uint8_t sel; int16_t a, b; int esperado; } casos[] = {
        { BIN_MENOR, 3, 4, 1 }, { BIN_MENOR, 4, 3, 0 },
        { BIN_MAIOR, 4, 3, 1 }, { BIN_MAIOR, 3, 4, 0 },
        { BIN_IGUAL, 5, 5, 1 }, { BIN_IGUAL, 5, 6, 0 },
        { BIN_E, 1, 1, 1 },     { BIN_E, 1, 0, 0 },
        { BIN_OU, 0, 1, 1 },    { BIN_OU, 0, 0, 0 },
        { BIN_MENOS, 10, 4, 6 }, { BIN_VEZES, 6, 7, 42 },
        { BIN_DIVIDIR, 9, 2, 4 },
    };
    for (unsigned i = 0; i < sizeof(casos) / sizeof(casos[0]); i++) {
        VM vm;
        uint8_t prog[6 * INSTR_BYTES], *p = prog;
        p = emit(p, OP_PUSH, casos[i].a, 0, 0);
        p = emit(p, OP_PUSH, casos[i].b, 0, 0);
        p = emit(p, OP_BIN, casos[i].sel, 0, 0);
        p = emit(p, OP_PUSH, 0, 0, 0);
        p = emit(p, OP_MOTOR, 0, 0, 0);
        p = emit(p, OP_HALT, 0, 0, 0);

        preparar(&vm, prog, sizeof(prog));
        rodar_ate_parar(&vm);

        char querido[32];
        snprintf(querido, sizeof(querido), "MOTOR %d,0", casos[i].esperado);
        if (fake_trace_count() < 1 || strcmp(fake_trace_get(0), querido) != 0) {
            printf("  FALHOU caso %u: esperado \"%s\", veio \"%s\"\n",
                   i, querido, fake_trace_count() ? fake_trace_get(0) : "(nada)");
            falhas++;
        }
    }
}

static void teste_nao_inverte(void) {
    printf("teste_nao_inverte\n");
    VM vm;
    uint8_t prog[5 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_PUSH, 0, 0, 0);
    p = emit(p, OP_UN, UN_NAO, 0, 0);      /* 1 */
    p = emit(p, OP_PUSH, 0, 0, 0);
    p = emit(p, OP_MOTOR, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);

    preparar(&vm, prog, sizeof(prog));
    rodar_ate_parar(&vm);

    const char *esperado[] = { "MOTOR 1,0", "MOTOR 0,0" };
    checar_trace(esperado, 2);
}

/* O aleatório não pode sair da faixa pedida, e os extremos entram. */
static void teste_aleatorio_respeita_a_faixa(void) {
    printf("teste_aleatorio_respeita_a_faixa\n");
    for (int k = 0; k < 60; k++) {
        VM vm;
        uint8_t prog[5 * INSTR_BYTES], *p = prog;
        p = emit(p, OP_PUSH, 5, 0, 0);
        p = emit(p, OP_PUSH, 7, 0, 0);
        p = emit(p, OP_BIN, BIN_ALEATORIO, 0, 0);
        p = emit(p, OP_PUSH, 0, 0, 0);
        p = emit(p, OP_MOTOR, 0, 0, 0);
        preparar(&vm, prog, sizeof(prog));
        vm_tick(&vm); vm_tick(&vm); vm_tick(&vm); vm_tick(&vm); vm_tick(&vm);
        int v = -1;
        if (fake_trace_count() > 0) sscanf(fake_trace_get(0), "MOTOR %d,", &v);
        CHECK(v >= 5 && v <= 7);
    }
}

/* O sensor vira valor. É o bloco que carrega a lição do ciclo. */
static void teste_sensor_como_valor(void) {
    printf("teste_sensor_como_valor\n");
    VM vm;
    uint8_t prog[4 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_SENSOR, SENSOR_DISTANCIA, 0, 0);
    p = emit(p, OP_PUSH, 0, 0, 0);
    p = emit(p, OP_MOTOR, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);

    preparar(&vm, prog, sizeof(prog));
    fake_dist_set(37);
    rodar_ate_parar(&vm);

    const char *esperado[] = { "MOTOR 37,0", "MOTOR 0,0" };
    checar_trace(esperado, 2);
}

static void teste_jmp_false_salta_quando_falso(void) {
    printf("teste_jmp_false_salta_quando_falso\n");
    VM vm;
    uint8_t prog[6 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_PUSH, 0, 0, 0);          /* falso    */
    p = emit(p, OP_JMP_FALSE, 4, 0, 0);     /* salta    */
    p = emit(p, OP_PUSH, 9, 0, 0);          /* pulados  */
    p = emit(p, OP_PUSH, 9, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);

    preparar(&vm, prog, sizeof(prog));
    rodar_ate_parar(&vm);
    CHECK(vm.pc == 4);
    CHECK(vm.topo == 0);
}

/* Nada pode ficar pendurado na pilha entre instruções que devolvem o controle
   ao loop(): é isso que mantém o watchdog e a não-bloqueância valendo. */
static void teste_pilha_vazia_depois_de_cada_comando(void) {
    printf("teste_pilha_vazia_depois_de_cada_comando\n");
    VM vm;
    uint8_t prog[8 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_PUSH, 200, 0, 0);
    p = emit(p, OP_PUSH, 200, 0, 0);
    p = emit(p, OP_MOTOR, 0, 0, 0);
    p = emit(p, OP_PUSH, 50, 0, 0);
    p = emit(p, OP_WAIT, 0, 0, 0);
    p = emit(p, OP_PUSH, 90, 0, 0);
    p = emit(p, OP_TURN, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);

    preparar(&vm, prog, sizeof(prog));
    for (int k = 0; k < 200 && vm.rodando; k++) {
        vm_tick(&vm);
        CHECK(vm.topo <= 2);
        fake_clock_advance(10);
    }
    CHECK(vm.topo == 0);
}

/* Pilha vazia não pode ler lixo de memória: para o programa, como já se faz
   com registrador fora da faixa. */
static void teste_desempilhar_vazio_para_o_programa(void) {
    printf("teste_desempilhar_vazio_para_o_programa\n");
    VM vm;
    uint8_t prog[2 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_BIN, BIN_MAIS, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);

    preparar(&vm, prog, sizeof(prog));
    vm_tick(&vm);
    CHECK(!vm.rodando);
}
```

E chame as nove no `main`, junto das outras.

- [ ] **Step 2: Rodar e ver falhar**

Run: `make -C tests test`
Expected: FAIL na compilação — `OP_PUSH undeclared`.

- [ ] **Step 3: Os opcodes e a pilha em `core/bytecode.h`**

```c
enum {
    OP_HALT      = 0,
    OP_MOTOR     = 1,
    OP_WAIT      = 2,
    OP_TURN      = 3,
    OP_SET_REG   = 4,
    OP_DEC_JNZ   = 5,
    OP_JMP       = 6,
    OP_JMP_IF_GE = 7,   /* sai na Task 2, quando ninguém mais o emitir */
    OP_PUSH      = 8,
    OP_SENSOR    = 9,
    OP_BIN       = 10,
    OP_UN        = 11,
    OP_JMP_FALSE = 12
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
```

`MAX_INSTR` continua 256 nesta tarefa; sobe na Task 2, junto de quem gasta as
instruções.

- [ ] **Step 4: A pilha no `struct VM` (`core/vm.h`)**

Dentro do `typedef struct`, depois de `int16_t reg[N_REGS];`:

```c
    /* Vive dentro do cálculo de um valor e morre nele: nenhuma instrução que
       devolve o controle ao loop() deixa coisa pendurada aqui. É por isso que
       ela pode ser pequena. */
    int32_t  pilha[PILHA_MAX];
    uint8_t  topo;
```

- [ ] **Step 5: Executar os opcodes novos em `core/vm.c`**

Antes de `vm_tick`, os dois ajudantes:

```c
static void empilhar(VM *vm, int32_t v) {
    if (vm->topo >= PILHA_MAX) { vm_stop(vm); return; }
    vm->pilha[vm->topo++] = v;
}

/* Pilha vazia é programa torto, e programa torto para — mesma regra do
   registrador fora da faixa. O valor devolvido não importa: quem chamou vai
   ver rodando == 0 no tick seguinte. */
static int32_t desempilhar(VM *vm) {
    if (vm->topo == 0) { vm_stop(vm); return 0; }
    return vm->pilha[--vm->topo];
}
```

`vm_run` zera o topo, junto com os registradores:

```c
    vm->topo = 0;
```

E os casos novos no `switch`:

```c
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
        if (i->a == UN_NAO) empilhar(vm, !a);
        else { vm_stop(vm); return; }
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
```

- [ ] **Step 6: `MOTOR`, `WAIT`, `TURN` e `SET_REG` passam a desempilhar**

Substitua os quatro casos existentes por:

```c
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
    case OP_TURN: {
        int32_t graus = desempilhar(vm);
        if (!vm->rodando) break;
        int16_t v = (graus >= 0) ? VEL_GIRO : -VEL_GIRO;
        int32_t g = (graus >= 0) ? graus : -graus;
        hal_motors(v, (int16_t)-v);
        vm->esperar_ate  = agora + (uint32_t)(g * MS_POR_GRAU);
        vm->parar_ao_fim = 1;
        vm->pc++;
        break;
    }
    case OP_SET_REG: {
        int32_t n = desempilhar(vm);
        if (!vm->rodando) break;
        if (i->a < 0 || i->a >= N_REGS) { vm_stop(vm); break; }
        /* Zero viraria laço infinito: o DEC_JNZ decrementa antes de comparar e
           nunca chegaria a zero. Com número o compilador já resolve; com conta,
           só dá para saber aqui. */
        vm->reg[i->a] = (int16_t)(n < 1 ? 1 : n);
        vm->pc++;
        break;
    }
```

Ordem importa: `MOTOR` desempilha **direito primeiro**, porque o compilador
empilha esquerdo antes de direito.

- [ ] **Step 7: Consertar os testes antigos que emitiam argumentos no corpo**

Os testes que já existem em `tests/vm_test.c` emitem `OP_MOTOR, 200, 200` e
`OP_WAIT, 1000`. Com a mudança, cada um vira `PUSH` mais o comando. Percorra
`tests/vm_test.c` e reescreva **todos** os programas de teste nessa forma; o
`teste_dourado` fica para a Task 2, que é quem muda o compilador junto.

Exemplo da conversão, em `teste_sequencia_linear`:

```c
    /* antes */
    p = emit(p, OP_MOTOR, 200, 200, 0);
    p = emit(p, OP_WAIT, 1000, 0, 0);

    /* depois */
    p = emit(p, OP_PUSH, 200, 0, 0);
    p = emit(p, OP_PUSH, 200, 0, 0);
    p = emit(p, OP_MOTOR, 0, 0, 0);
    p = emit(p, OP_PUSH, 1000, 0, 0);
    p = emit(p, OP_WAIT, 0, 0, 0);
```

Não esqueça de crescer o `uint8_t prog[N * INSTR_BYTES]` de cada teste.

- [ ] **Step 8: Rodar e ver passar**

Run: `make -C tests test`
Expected: PASS, todos os testes, incluindo os nove novos.

- [ ] **Step 9: Commit**

```bash
git add core/bytecode.h core/vm.h core/vm.c tests/vm_test.c
git commit -m "Dá uma pilha de valores à VM"
```

---

## Task 2: o compilador emite pelo caminho da pilha

**Files:**
- Modify: `web/compilador.js`, `core/bytecode.h` (o `MAX_INSTR` e a saída do `OP_JMP_IF_GE`), `core/vm.c` (idem)
- Test: `tests/compilador.test.js`, `tests/vm_test.c` (o dourado)

**Interfaces:**
- Consumes: os opcodes e seletores da Task 1.
- Produces, para as Tasks 4 e 6: `Compilador.OP` ganha `PUSH: 8, SENSOR: 9, BIN: 10, UN: 11, JMP_FALSE: 12` e perde `JMP_IF_GE`; ganha `Compilador.BIN` e `Compilador.UN` com os seletores; `MAX_INSTR` passa a 1024.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/compilador.test.js`, os testes que afirmam a forma antiga (`frente vira
MOTOR, WAIT, MOTOR`, `trás usa velocidade negativa`, `girar vira um único TURN`,
`repetir fecha o laço...`, e os de sensor) precisam ser reescritos para a forma
nova. Substitua-os por:

```javascript
/* Um ajudante que lê o programa como lista de (op, a) — comparar byte a byte
   cada teste esconderia o que mudou. */
function instrucoes(bytes) {
  const dv = new DataView(bytes.buffer);
  const fora = [];
  for (let k = 0; k * 7 < bytes.length; k++) {
    fora.push([bytes[k * 7], dv.getInt16(k * 7 + 1, true),
               dv.getInt16(k * 7 + 3, true), dv.getInt16(k * 7 + 5, true)]);
  }
  return fora;
}

test('frente empilha velocidade, velocidade, e chama MOTOR', () => {
  const { bytes } = compilar([{ op: 'frente', segundos: 1, blockId: 'b1' }]);
  assert.deepStrictEqual(instrucoes(bytes), [
    [OP.PUSH, 200, 0, 0],
    [OP.PUSH, 200, 0, 0],
    [OP.MOTOR, 0, 0, 0],
    [OP.PUSH, 1000, 0, 0],
    [OP.WAIT, 0, 0, 0],
    [OP.PUSH, 0, 0, 0],
    [OP.PUSH, 0, 0, 0],
    [OP.MOTOR, 0, 0, 0],
    [OP.HALT, 0, 0, 0],
  ]);
});

test('trás empilha velocidade negativa', () => {
  const { bytes } = compilar([{ op: 'tras', segundos: 2, blockId: 'b1' }]);
  const i = instrucoes(bytes);
  assert.deepStrictEqual(i[0], [OP.PUSH, -200, 0, 0]);
  assert.deepStrictEqual(i[1], [OP.PUSH, -200, 0, 0]);
  assert.deepStrictEqual(i[3], [OP.PUSH, 2000, 0, 0]);
});

test('girar empilha os graus antes do TURN', () => {
  const { bytes } = compilar([{ op: 'girar', graus: -90, blockId: 'b1' }]);
  assert.deepStrictEqual(instrucoes(bytes).slice(0, 2), [
    [OP.PUSH, -90, 0, 0],
    [OP.TURN, 0, 0, 0],
  ]);
});

test('repetir empilha as vezes antes do SET_REG', () => {
  const { bytes } = compilar([
    { op: 'repetir', vezes: 3, blockId: 'r', corpo: [
      { op: 'girar', graus: 90, blockId: 'g' }] },
  ]);
  const i = instrucoes(bytes);
  assert.deepStrictEqual(i[0], [OP.PUSH, 3, 0, 0]);
  assert.deepStrictEqual(i[1], [OP.SET_REG, 0, 0, 0]);
  assert.deepStrictEqual(i[2], [OP.PUSH, 90, 0, 0]);
  assert.deepStrictEqual(i[3], [OP.TURN, 0, 0, 0]);
  assert.deepStrictEqual(i[4], [OP.DEC_JNZ, 0, 2, 0]);
});

/* Os três blocos de sensor do Grande deixam de ter opcode próprio e passam a
   compilar pelo caminho de todo mundo. Não mudam na tela nem no comportamento —
   e é essa unificação que faz o "distância cm" do Gigante ser o mesmo
   mecanismo, não um segundo. */
test('se obstáculo vira SENSOR, PUSH, BIN menor, JMP_FALSE', () => {
  const { bytes } = compilar([
    { op: 'se_obstaculo', cm: 20, blockId: 's', corpo: [
      { op: 'parar', blockId: 'p' }] },
  ]);
  const i = instrucoes(bytes);
  assert.deepStrictEqual(i[0], [OP.SENSOR, 0, 0, 0]);
  assert.deepStrictEqual(i[1], [OP.PUSH, 20, 0, 0]);
  assert.deepStrictEqual(i[2], [OP.BIN, BIN.MENOR, 0, 0]);
  assert.deepStrictEqual(i[3], [OP.JMP_FALSE, 5, 0, 0]);
  assert.deepStrictEqual(i[4], [OP.HALT, 0, 0, 0]);
});

test('repetir até perto testa antes de rodar, agora com JMP_FALSE', () => {
  const { bytes } = compilar([
    { op: 'repetir_ate_perto', cm: 20, blockId: 'r', corpo: [
      { op: 'girar', graus: 90, blockId: 'g' }] },
  ]);
  const i = instrucoes(bytes);
  /* início: SENSOR ; PUSH 20 ; BIN >= ... o bloco diz "até chegar a menos de",
     então o laço roda enquanto a distância NÃO é menor que o limite. */
  assert.deepStrictEqual(i[0], [OP.SENSOR, 0, 0, 0]);
  assert.deepStrictEqual(i[1], [OP.PUSH, 20, 0, 0]);
  assert.deepStrictEqual(i[2], [OP.BIN, BIN.MENOR, 0, 0]);
  assert.deepStrictEqual(i[3], [OP.UN, UN.NAO, 0, 0]);
  assert.deepStrictEqual(i[4], [OP.JMP_FALSE, 8, 0, 0]);
  assert.deepStrictEqual(i[7], [OP.JMP, 0, 0, 0]);
});

test('o teto de instruções é 1024', () => {
  assert.strictEqual(MAX_INSTR, 1024);
  const muitos = [];
  for (let k = 0; k < 400; k++) muitos.push({ op: 'girar', graus: 90, blockId: 'g' });
  assert.doesNotThrow(() => compilar(muitos));
});

test('programa grande demais dá mensagem em português', () => {
  const muitos = [];
  for (let k = 0; k < 600; k++) muitos.push({ op: 'girar', graus: 90, blockId: 'g' });
  assert.throws(() => compilar(muitos), /grande demais/);
});

/* A pilha da VM tem fundo. Descobrir isso com o robô andando seria descobrir
   tarde: uma conta funda demais é recusada aqui, com mensagem que a criança
   consegue ler. */
test('conta funda demais é recusada ao compilar, em português', () => {
  let fundo = 1;
  for (let k = 0; k < 20; k++) fundo = { op: 'mais', a: fundo, b: 1 };
  assert.throws(() => compilar([{ op: 'girar', graus: fundo, blockId: 'g' }]),
    /conta.*complicada/i);
});

test('uma conta de profundidade normal passa', () => {
  let ok = 1;
  for (let k = 0; k < 6; k++) ok = { op: 'mais', a: ok, b: 1 };
  assert.doesNotThrow(() => compilar([{ op: 'girar', graus: ok, blockId: 'g' }]));
});
```

E ajuste o `require` no topo do arquivo:

```javascript
const { compilar, OP, BIN, UN, MAX_INSTR } = require('../web/compilador.js');
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/compilador.test.js`
Expected: FAIL — `OP.PUSH` é `undefined` e as instruções saem na forma antiga.

- [ ] **Step 3: Reescrever o `web/compilador.js`**

O corpo de `compilar` passa a ter um emissor de valor. Substitua o `OP`, e
acrescente `BIN`, `UN` e a função `gerarValor`:

```javascript
  var OP = {
    HALT: 0, MOTOR: 1, WAIT: 2, TURN: 3,
    SET_REG: 4, DEC_JNZ: 5, JMP: 6,
    PUSH: 8, SENSOR: 9, BIN: 10, UN: 11, JMP_FALSE: 12,
  };

  var BIN = {
    MAIS: 0, MENOS: 1, VEZES: 2, DIVIDIR: 3,
    MENOR: 4, MAIOR: 5, IGUAL: 6, E: 7, OU: 8, ALEATORIO: 9,
  };

  var UN = { NAO: 0 };

  var MAX_INSTR = 1024;

  /* Precisa bater com PILHA_MAX em core/bytecode.h — é a mesma pilha, e quem
     confere se a conta cabe nela é este arquivo. */
  var PILHA_MAX = 16;
```

`OP.JMP_IF_GE` **sai**: ninguém mais o emite.

Dentro de `compilar`, antes de `gerar`:

```javascript
    /* A pilha da VM tem 16 lugares. Uma conta funda demais estouraria em tempo
       de execução, e a criança veria o robô parar sem explicação — então a
       profundidade sai da árvore antes de emitir byte nenhum. */
    function profundidadeDe(v) {
      if (!v || typeof v === 'number') return 1;
      if (v.op === 'distancia') return 1;
      if (v.op === 'nao') return profundidadeDe(v.a);
      /* O lado esquerdo fica na pilha enquanto o direito é calculado. */
      var ea = profundidadeDe(v.a), eb = profundidadeDe(v.b);
      return Math.max(ea, eb + 1);
    }

    /* `>=` e não `>`: o MOTOR calcula o valor da direita com o da esquerda já
       na pilha, então sempre pode haver um a mais em cima do que a conta
       sozinha pede. Um lugar de folga cobre isso. */
    function conferirProfundidade(v) {
      if (profundidadeDe(v) >= PILHA_MAX) {
        throw new Error('Essa conta ficou complicada demais para o robô. ' +
                        'Tente quebrá-la em partes menores.');
      }
    }

    /* Um valor é um número ou um nó de conta. Números viram PUSH; contas viram
       a subárvore inteira, sempre deixando exatamente um valor na pilha. */
    function gerarValor(v, blockId) {
      conferirProfundidade(v);
      if (v === null || v === undefined) { emitir(OP.PUSH, 0, 0, 0, blockId); return; }
      if (typeof v === 'number') {
        emitir(OP.PUSH, Math.round(v), 0, 0, blockId);
        return;
      }
      var id = v.blockId || blockId;
      switch (v.op) {
        case 'distancia':
          emitir(OP.SENSOR, SENSOR_DISTANCIA, 0, 0, id);
          break;
        case 'nao':
          gerarValor(v.a, id);
          emitir(OP.UN, UN.NAO, 0, 0, id);
          break;
        default: {
          var sel = BINARIOS[v.op];
          if (sel === undefined) throw new Error('Conta desconhecida: ' + v.op);
          gerarValor(v.a, id);
          gerarValor(v.b, id);
          emitir(OP.BIN, sel, 0, 0, id);
        }
      }
    }
```

E, no escopo do módulo, a tabela:

```javascript
  var BINARIOS = {
    mais: BIN.MAIS, menos: BIN.MENOS, vezes: BIN.VEZES, dividir: BIN.DIVIDIR,
    aleatorio: BIN.ALEATORIO, menor: BIN.MENOR, maior: BIN.MAIOR,
    igual: BIN.IGUAL, e: BIN.E, ou: BIN.OU,
  };
```

- [ ] **Step 4: Reescrever os casos de `gerar`**

```javascript
          case 'frente': {
            var v = velocidadeDe(no);
            gerarValor(v, no.blockId); gerarValor(v, no.blockId);
            emitir(OP.MOTOR, 0, 0, 0, no.blockId);
            gerarValor(msDe(no.segundos), no.blockId);
            emitir(OP.WAIT, 0, 0, 0, no.blockId);
            gerarValor(0, no.blockId); gerarValor(0, no.blockId);
            emitir(OP.MOTOR, 0, 0, 0, no.blockId);
            break;
          }
```

`tras` é igual, com a velocidade negada. `msDe` converte segundos em
milissegundos e é onde a conta entra quando o valor não é número:

```javascript
    /* Segundos viram milissegundos. Se for número, a conta é aqui e sai um
       PUSH só; se for uma conta da criança, multiplica-se em tempo de execução. */
    function msDe(segundos) {
      if (typeof segundos === 'number') return Math.round(segundos * 1000);
      return { op: 'vezes', a: segundos, b: 1000 };
    }
```

Os demais:

```javascript
          case 'girar':
            gerarValor(no.graus, no.blockId);
            emitir(OP.TURN, 0, 0, 0, no.blockId);
            break;

          case 'esperar':
            gerarValor(msDe(no.segundos), no.blockId);
            emitir(OP.WAIT, 0, 0, 0, no.blockId);
            break;

          case 'repetir': {
            if (profundidade >= N_REGS) {
              throw new Error(
                'Tem blocos "repetir" aninhados demais — o máximo é ' + N_REGS + '.');
            }
            var registrador = profundidade++;
            gerarValor(vezesDe(no.vezes), no.blockId);
            emitir(OP.SET_REG, registrador, 0, 0, no.blockId);
            var inicio = instrucoes.length;
            gerar(no.corpo || []);
            emitir(OP.DEC_JNZ, registrador, inicio, 0, no.blockId);
            profundidade--;
            break;
          }

          case 'se_obstaculo':
            gerarCondicional(
              { op: 'menor', a: { op: 'distancia' }, b: Math.round(no.cm) },
              no.corpo || [], null, no.blockId);
            break;

          case 'se':
            gerarCondicional(no.cond, no.corpo || [], null, no.blockId);
            break;

          case 'se_senao':
            gerarCondicional(
              { op: 'menor', a: { op: 'distancia' }, b: Math.round(no.cm) },
              no.entao || [], no.senao || [], no.blockId);
            break;

          case 'se_entao_senao':
            gerarCondicional(no.cond, no.entao || [], no.senao || [], no.blockId);
            break;

          case 'repetir_ate_perto':
            gerarLacoAte(
              { op: 'menor', a: { op: 'distancia' }, b: Math.round(no.cm) },
              no.corpo || [], no.blockId);
            break;

          case 'repetir_ate':
            gerarLacoAte(no.cond, no.corpo || [], no.blockId);
            break;
```

`vezesDe` guarda o mínimo de 1 sem estragar uma conta:

```javascript
    /* Zero viraria laço infinito no DEC_JNZ. Com número dá para resolver aqui;
       com conta, quem garante o mínimo é o SET_REG da VM, que corta em 1. */
    function vezesDe(v) {
      if (typeof v === 'number') return Math.max(1, Math.round(v));
      return v;
    }
```

E os dois moldes, um lugar só para cada forma:

```javascript
    /* JMP_FALSE salta quando a condição é falsa, então o alvo é o "senão" —
       ou o fim, quando não há senão. */
    function gerarCondicional(cond, entao, senao, blockId) {
      gerarValor(cond, blockId);
      var salto = instrucoes.length;
      emitir(OP.JMP_FALSE, 0, 0, 0, blockId);
      gerar(entao);
      if (senao && senao.length) {
        var pula = instrucoes.length;
        emitir(OP.JMP, 0, 0, 0, blockId);
        instrucoes[salto].a = instrucoes.length;
        gerar(senao);
        instrucoes[pula].a = instrucoes.length;
      } else {
        instrucoes[salto].a = instrucoes.length;
      }
    }

    /* Testa antes de rodar: o bloco diz "até", não "pelo menos uma vez".
       O laço roda enquanto a condição é falsa, daí o "não". */
    function gerarLacoAte(cond, corpo, blockId) {
      var inicio = instrucoes.length;
      gerarValor(cond, blockId);
      emitir(OP.UN, UN.NAO, 0, 0, blockId);
      var saida = instrucoes.length;
      emitir(OP.JMP_FALSE, 0, 0, 0, blockId);
      gerar(corpo);
      emitir(OP.JMP, inicio, 0, 0, blockId);
      instrucoes[saida].a = instrucoes.length;
    }
```

Exporte os novos: `var api = { compilar: compilar, OP: OP, BIN: BIN, UN: UN, MAX_INSTR: MAX_INSTR };`

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/compilador.test.js`
Expected: PASS.

- [ ] **Step 6: Refazer o teste dourado dos dois lados**

O dourado compara byte a byte o bytecode do compilador JavaScript com um
programa escrito à mão em C. Os dois mudam juntos, e é isso que ele prova.

Em `tests/vm_test.c`, o `teste_dourado` passa a ser:

```c
static void teste_dourado(void) {
    printf("teste_dourado\n");
    VM vm;
    uint8_t prog[14 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_PUSH, 4, 0, 0);
    p = emit(p, OP_SET_REG, 0, 0, 0);
    p = emit(p, OP_PUSH, VEL_FRENTE, 0, 0);
    p = emit(p, OP_PUSH, VEL_FRENTE, 0, 0);
    p = emit(p, OP_MOTOR, 0, 0, 0);
    p = emit(p, OP_PUSH, 1000, 0, 0);
    p = emit(p, OP_WAIT, 0, 0, 0);
    p = emit(p, OP_PUSH, 0, 0, 0);
    p = emit(p, OP_PUSH, 0, 0, 0);
    p = emit(p, OP_MOTOR, 0, 0, 0);
    p = emit(p, OP_PUSH, 90, 0, 0);
    p = emit(p, OP_TURN, 0, 0, 0);
    p = emit(p, OP_DEC_JNZ, 0, 2, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    CHECK(sizeof(prog) == 98);

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

E em `tests/compilador.test.js`, o `programa dourado bate byte a byte com o teste
da VM` precisa produzir esses mesmos 98 bytes. Rode o teste, leia o hex que ele
imprime ao falhar, e confira contra a lista acima instrução por instrução antes de
atualizar o esperado — **o dourado só vale se os dois lados forem escritos
independentemente.**

- [ ] **Step 7: Tirar o `OP_JMP_IF_GE` de circulação**

Agora que ninguém o emite, remova o `OP_JMP_IF_GE` do `enum` em
`core/bytecode.h` e o `case OP_JMP_IF_GE` de `core/vm.c`. Suba o `MAX_INSTR` de
`256` para `1024` no mesmo arquivo. Ajuste os testes de `tests/vm_test.c` que o
usavam (`teste_sensor_perto_entra_no_corpo`, `teste_sensor_longe_pula_o_corpo`,
`teste_jmp_para_tras_fecha_laco`) para a forma nova:

```c
    p = emit(p, OP_SENSOR, SENSOR_DISTANCIA, 0, 0);
    p = emit(p, OP_PUSH, 20, 0, 0);
    p = emit(p, OP_BIN, BIN_MENOR, 0, 0);
    p = emit(p, OP_JMP_FALSE, /* alvo */ 0, 0, 0);
```

- [ ] **Step 8: Bateria e commit**

```bash
make -C tests test
node --test $(ls tests/*.test.js | grep -v gabaritos.test.js | grep -v navegador.test.js)
bash tests/host_test.sh
```

Expected: as três verdes.

```bash
git add core/bytecode.h core/vm.c web/compilador.js tests/vm_test.c tests/compilador.test.js
git commit -m "Compila todo valor pela pilha, e aposenta o JMP_IF_GE"
```

---

## Task 3: os campos viram encaixes

Nesta tarefa **nada muda na tela** e nada muda na AST. É uma troca de mecanismo
por baixo, e o jeito de saber que deu certo é a bateria inteira continuar verde.

**Files:**
- Modify: `web/campos.js`, `web/blocos.js`, `web/niveis.js`
- Test: `tests/blocos.test.js`, `tests/niveis.test.js`

**Interfaces:**
- Consumes: `Blockly.defineBlocksWithJsonArray`, `field_bolinhas` (já em `web/campos.js`).
- Produces, para as Tasks 4 e 5:
  - dois tipos de bloco: `numero` (campo `NUM`, `field_number`) e `numero_bolinhas` (campo `NUM`, `field_bolinhas`)
  - `Blocos.valorDe(bloco, nomeDoEncaixe)` → número quando há shadow, nó de valor quando há conta
  - os encaixes `SEG`, `GRAUS`, `N`, `CM` nos blocos que hoje têm esses campos

- [ ] **Step 1: Escrever os testes que falham**

Acrescente a `tests/blocos.test.js`:

```javascript
test('um bloco com shadow intacto produz a mesma AST de antes', () => {
  const ws = carregar([{
    type: 'quando_play',
    inputs: { CORPO: { block: {
      type: 'mover_frente',
      inputs: { SEG: { shadow: { type: 'numero', fields: { NUM: 2.5 } } } },
      fields: { VEL: '200' },
    } } },
  }]);
  assert.deepStrictEqual(
    Blocos.workspaceParaAst(ws).map((n) => ({ op: n.op, segundos: n.segundos })),
    [{ op: 'frente', segundos: 2.5 }]);
});

test('o repetir usa shadow de bolinhas, não de número', () => {
  const ws = carregar([{ type: 'quando_play', inputs: { CORPO: { block: {
    type: 'repetir',
    inputs: { N: { shadow: { type: 'numero_bolinhas', fields: { NUM: 3 } } } },
  } } } }]);
  const raiz = ws.getBlocksByType('repetir', false)[0];
  assert.strictEqual(raiz.getInputTargetBlock('N').type, 'numero_bolinhas');
  assert.strictEqual(Blocos.workspaceParaAst(ws)[0].vezes, 3);
});

test('encaixe vazio vale zero, e não quebra', () => {
  const ws = carregar([{ type: 'quando_play', inputs: { CORPO: { block: {
    type: 'girar',
  } } } }]);
  assert.strictEqual(Blocos.workspaceParaAst(ws)[0].graus, 0);
});
```

E a `tests/niveis.test.js`:

```javascript
test('no Pequeno o encaixe do tempo some inteiro, não só o número', () => {
  const ws = carregar([{ type: 'quando_play', inputs: { CORPO: { block: {
    type: 'mover_frente',
    inputs: { SEG: { shadow: { type: 'numero', fields: { NUM: 0.5 } } } },
  } } } }]);
  Niveis.aplicar(ws, 'pequeno');
  const b = ws.getBlocksByType('mover_frente', false)[0];
  assert.strictEqual(b.getInput('SEG').isVisible(), false,
    'o encaixe vazio apareceria como um buraco na peça');
});

test('no Médio o encaixe do tempo aparece', () => {
  const ws = carregar([{ type: 'quando_play', inputs: { CORPO: { block: {
    type: 'mover_frente',
    inputs: { SEG: { shadow: { type: 'numero', fields: { NUM: 0.5 } } } },
  } } } }]);
  Niveis.aplicar(ws, 'medio');
  assert.strictEqual(
    ws.getBlocksByType('mover_frente', false)[0].getInput('SEG').isVisible(), true);
});

test('o valor escondido continua guardado ao descer de nível', () => {
  const ws = carregar([{ type: 'quando_play', inputs: { CORPO: { block: {
    type: 'mover_frente',
    inputs: { SEG: { shadow: { type: 'numero', fields: { NUM: 3 } } } },
  } } } }]);
  Niveis.aplicar(ws, 'pequeno');
  Niveis.aplicar(ws, 'medio');
  assert.strictEqual(Blocos.workspaceParaAst(ws)[0].segundos, 3);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/blocos.test.js tests/niveis.test.js`
Expected: FAIL — `numero` não é um tipo de bloco conhecido.

- [ ] **Step 3: Os dois shadows em `web/campos.js`**

No fim de `registrar()`, antes do `return true`:

```javascript
    /* Dois blocos de número que existem só para morar dentro de um encaixe.
       Enquanto ninguém solta uma conta em cima, eles desenham e se comportam
       como o campo que eram antes — é isso que deixa os três níveis de baixo
       ficarem exatamente como estavam. */
    Blockly.defineBlocksWithJsonArray([
      {
        type: 'numero',
        message0: '%1',
        args0: [{ type: 'field_number', name: 'NUM', value: 1 }],
        output: 'Number',
        colour: COR_NUMERO,
      },
      {
        /* O repetir desenha bolinhas para quem não lê algarismo, e o desenho é
           do campo — então o shadow dele é outro tipo de bloco. */
        type: 'numero_bolinhas',
        message0: '%1',
        args0: [{ type: 'field_bolinhas', name: 'NUM', value: 4 }],
        output: 'Number',
        colour: COR_NUMERO,
      },
    ]);
```

Com `var COR_NUMERO = '#0050f0';` no topo do módulo — o azul do movimento, para
o shadow desaparecer dentro da peça em vez de virar um retângulo de outra cor.

- [ ] **Step 4: Os encaixes em `web/blocos.js`**

Em `definir()`, troque os `field_number` por `input_value` nos quatro lugares.
Exemplo em `mover_frente`:

```javascript
        args0: [
          { type: 'field_label', name: 'T1', text: 'andar frente' },
          { type: 'input_value', name: 'SEG', check: 'Number' },
          { type: 'field_label', name: 'T2', text: 's' },
          { type: 'field_dropdown', name: 'VEL', options: VELOCIDADES },
        ],
        /* Sem isto o bloco quebra a linha a cada encaixe e vira uma escada. */
        inputsInline: true,
```

Faça o mesmo para `mover_tras` (`SEG`), `girar` (`GRAUS`), `esperar` (`SEG`),
`repetir` (`N`), `se_obstaculo` (`CM`), `se_senao` (`CM`) e `repetir_ate_perto`
(`CM`). O `VEL` **continua** sendo `field_dropdown`: é um menu de três palavras
que ela lê, e virar encaixe trocaria as palavras por um número sem motivo.

- [ ] **Step 5: A leitura de valor em `web/blocos.js`**

```javascript
  /* O que está dentro de um encaixe: o número do shadow, ou a conta que a
     criança soltou em cima dele. Encaixe vazio vale zero — acontece quando ela
     arranca o shadow, e um programa que explode por isso seria pior. */
  function valorDe(bloco, nome) {
    var dentro = bloco.getInputTargetBlock(nome);
    if (!dentro) return 0;
    if (dentro.type === 'numero' || dentro.type === 'numero_bolinhas') {
      return Number(dentro.getFieldValue('NUM'));
    }
    return blocoParaNo(dentro);
  }
```

E `blocoParaNo` passa a usá-la:

```javascript
      case 'mover_frente':
        return { op: 'frente', segundos: valorDe(b, 'SEG'),
                 velocidade: Number(b.getFieldValue('VEL')), blockId: id };
```

O mesmo para `mover_tras` (`SEG`), `girar` (`GRAUS`), `esperar` (`SEG`),
`repetir` (`N` → `vezes`), `se_obstaculo` (`CM` → `cm`), `se_senao` (`CM`),
`repetir_ate_perto` (`CM`). Exporte `valorDe` junto do resto da `api`.

- [ ] **Step 6: A caixa de blocos nasce com shadow**

Os blocos que saem da paleta precisam vir com o shadow dentro, senão nascem com
um buraco. Em `web/niveis.js`, a função `bloco()` ganha o shadow padrão:

```javascript
  /* O XML da caixa: cada encaixe nasce com o seu shadow, senão a peça sai da
     paleta com um buraco no lugar do número. */
  var SHADOW = {
    SEG: '<shadow type="numero"><field name="NUM">1</field></shadow>',
    GRAUS: '<shadow type="numero"><field name="NUM">90</field></shadow>',
    CM: '<shadow type="numero"><field name="NUM">20</field></shadow>',
    N: '<shadow type="numero_bolinhas"><field name="NUM">4</field></shadow>',
  };

  function encaixe(nome, valor) {
    var padrao = SHADOW[nome];
    if (valor === undefined) return '<value name="' + nome + '">' + padrao + '</value>';
    return '<value name="' + nome + '">' +
           padrao.replace(/>[^<]*<\/field>/, '>' + valor + '</field>') +
           '</value>';
  }
```

O `PRE_PREENCHIDO` do Pequeno, que hoje é `'<field name="SEG">0.5</field>'`,
passa a ser `encaixe('SEG', '0.5')`.

- [ ] **Step 7: A visibilidade por encaixe em `web/niveis.js`**

Em `aplicar`, o laço que hoje faz `campo.setVisible(...)` passa a decidir entre
campo e encaixe:

```javascript
      for (var nome of Object.keys(campos)) {
        /* Encaixe primeiro: esconder o campo de dentro do shadow deixaria o
           encaixe vazio aparecendo — um buraco na peça, pior que o número. */
        var entrada = b.getInput(nome);
        if (entrada) { entrada.setVisible(campos[nome]); continue; }
        var campo = b.getField(nome);
        if (campo) campo.setVisible(campos[nome]);
      }
```

O `setModoBolinhas` passa a procurar o campo dentro do shadow:

```javascript
      var entradaN = b.getInput('N');
      var alvoN = entradaN && b.getInputTargetBlock('N');
      var n = alvoN ? alvoN.getField('NUM') : b.getField('N');
      if (n && n.setModoBolinhas) n.setModoBolinhas(def.bolinhas);
```

E o par `DIR`/`GRAUS` lê o valor de dentro do shadow, e ganha a extensão natural
da regra que já existia:

```javascript
      var dir = b.getField('DIR'), entradaG = b.getInput('GRAUS');
      if (dir && entradaG) {
        var dentro = b.getInputTargetBlock('GRAUS');
        /* Uma conta não cabe no menu de dois itens — do mesmo jeito que 45° não
           cabia. Mesma regra: quando o controle simples não representa o valor,
           aparece o honesto. */
        var ehNumero = dentro && dentro.type === 'numero';
        var g = ehNumero ? Number(dentro.getFieldValue('NUM')) : NaN;
        var cabeNoMenu = (g === 90 || g === -90);
        if (cabeNoMenu && dir.getValue() !== String(g)) dir.setValue(String(g));
        if (!campos.GRAUS) {
          dir.setVisible(cabeNoMenu);
          entradaG.setVisible(!cabeNoMenu);
        }
        var t2 = b.getField('T2');
        if (t2 && campos.T2) t2.setVisible(entradaG.isVisible());
      }
```

- [ ] **Step 8: A extensão do `girar` escreve no shadow**

Em `web/blocos.js`, `registrarExtensao` passa a escrever dentro do encaixe:

```javascript
      bloco.getField('DIR').setValidator(function (novo) {
        var dentro = bloco.getInputTargetBlock('GRAUS');
        if (dentro && dentro.type === 'numero') {
          dentro.setFieldValue(Number(novo), 'NUM');
        }
        return novo;
      });
```

E a definição do `girar` ganha o shadow padrão, para o bloco nascer inteiro
mesmo quando criado por código:

```javascript
        args0: [
          { type: 'field_label', name: 'T1', text: 'girar' },
          { type: 'field_dropdown', name: 'DIR', options: [['↻', '90'], ['↺', '-90']] },
          { type: 'input_value', name: 'GRAUS', check: 'Number' },
          { type: 'field_label', name: 'T2', text: 'graus' },
        ],
        inputsInline: true,
```

- [ ] **Step 9: Rodar e ver passar**

Run: `node --test $(ls tests/*.test.js | grep -v gabaritos.test.js | grep -v navegador.test.js)`
Expected: PASS. O `gabarito.test.js` provavelmente **falha** aqui — ele monta
`fields`. É a Task 5 que o conserta; se falhar só ele, siga.

- [ ] **Step 10: Ver com os olhos**

```bash
node bridge/server.js
```

Abra `http://localhost:8080`, recarregue com Ctrl+Shift+R, e confira nos três
níveis: no Pequeno o `⬆` não mostra número nem buraco; no Médio aparece `andar
frente [1] s`; no Grande o `girar` mostra o ângulo. Se aparecer um retângulo de
cor diferente dentro da peça, o `COR_NUMERO` está errado.

- [ ] **Step 11: Commit**

```bash
git add web/campos.js web/blocos.js web/niveis.js tests/blocos.test.js tests/niveis.test.js
git commit -m "Troca os campos numéricos por encaixes com shadow"
```

---

## Task 4: o nível Gigante e os quinze blocos

**Files:**
- Modify: `web/blocos.js`, `web/niveis.js`, `web/index.html`, `web/app.js`, `web/compilador.js`
- Test: `tests/blocos.test.js`, `tests/niveis.test.js`, `tests/compilador.test.js`, `tests/navegador.test.js`

**Interfaces:**
- Consumes: `valorDe` (Task 3), `gerarValor`/`gerarCondicional`/`gerarLacoAte` e os seletores `BIN`/`UN` (Task 2).
- Produces, para a Task 6: os nós de valor `mais menos vezes dividir aleatorio menor maior igual e ou nao distancia` e os nós de comando `se`, `se_entao_senao`, `repetir_ate`, todos na forma descrita em «A AST» no topo deste plano.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/niveis.test.js`:

```javascript
test('o Gigante é o quarto nível e herda tudo do Grande', () => {
  assert.deepStrictEqual(Niveis.LISTA, ['pequeno', 'medio', 'grande', 'gigante']);
  const grande = Niveis.definicao('grande').blocos;
  const gigante = Niveis.definicao('gigante').blocos;
  for (const t of grande) {
    assert.ok(gigante.indexOf(t) >= 0, 'o Gigante perdeu o bloco ' + t);
  }
});

test('só o Gigante oferece contas e o distância', () => {
  for (const nivel of ['pequeno', 'medio', 'grande']) {
    const b = Niveis.definicao(nivel).blocos;
    assert.ok(b.indexOf('conta_mais') < 0, nivel + ' não deveria ter contas');
    assert.ok(b.indexOf('distancia') < 0, nivel + ' não deveria ter o distância');
  }
  const g = Niveis.definicao('gigante').blocos;
  for (const t of ['conta_mais', 'conta_menor', 'conta_e', 'conta_nao',
                   'aleatorio', 'distancia', 'se', 'se_entao_senao', 'repetir_ate']) {
    assert.ok(g.indexOf(t) >= 0, 'faltou ' + t + ' no Gigante');
  }
});

test('a caixa do Gigante tem a categoria Contas', () => {
  assert.ok(Niveis.caixaXml('gigante').indexOf('name="Contas"') >= 0);
  assert.ok(Niveis.caixaXml('grande').indexOf('name="Contas"') < 0);
});
```

Em `tests/blocos.test.js`:

```javascript
test('uma conta dentro de um encaixe vira nó de valor na AST', () => {
  const ws = carregar([{ type: 'quando_play', inputs: { CORPO: { block: {
    type: 'mover_frente',
    inputs: { SEG: { block: {
      type: 'conta_mais',
      inputs: {
        A: { shadow: { type: 'numero', fields: { NUM: 1 } } },
        B: { shadow: { type: 'numero', fields: { NUM: 2 } } },
      },
    } } },
    fields: { VEL: '200' },
  } } } }]);
  const no = Blocos.workspaceParaAst(ws)[0];
  assert.strictEqual(no.segundos.op, 'mais');
  assert.strictEqual(no.segundos.a, 1);
  assert.strictEqual(no.segundos.b, 2);
});

test('o distância é um nó de valor sem argumento', () => {
  const ws = carregar([{ type: 'quando_play', inputs: { CORPO: { block: {
    type: 'se',
    inputs: { COND: { block: { type: 'distancia' } } },
  } } } }]);
  assert.strictEqual(Blocos.workspaceParaAst(ws)[0].cond.op, 'distancia');
});
```

Em `tests/compilador.test.js`:

```javascript
test('uma conta vira a subárvore antes do comando', () => {
  const { bytes } = compilar([
    { op: 'girar', blockId: 'g',
      graus: { op: 'vezes', a: 45, b: 2, blockId: 'c' } },
  ]);
  const i = instrucoes(bytes);
  assert.deepStrictEqual(i[0], [OP.PUSH, 45, 0, 0]);
  assert.deepStrictEqual(i[1], [OP.PUSH, 2, 0, 0]);
  assert.deepStrictEqual(i[2], [OP.BIN, BIN.VEZES, 0, 0]);
  assert.deepStrictEqual(i[3], [OP.TURN, 0, 0, 0]);
});

test('se com condição da criança usa JMP_FALSE', () => {
  const { bytes } = compilar([
    { op: 'se', blockId: 's',
      cond: { op: 'menor', a: { op: 'distancia' }, b: 30 },
      corpo: [{ op: 'parar', blockId: 'p' }] },
  ]);
  const i = instrucoes(bytes);
  assert.deepStrictEqual(i[0], [OP.SENSOR, 0, 0, 0]);
  assert.deepStrictEqual(i[1], [OP.PUSH, 30, 0, 0]);
  assert.deepStrictEqual(i[2], [OP.BIN, BIN.MENOR, 0, 0]);
  assert.deepStrictEqual(i[3], [OP.JMP_FALSE, 5, 0, 0]);
});

test('segundos que são conta viram multiplicação por mil', () => {
  const { bytes } = compilar([
    { op: 'esperar', blockId: 'e',
      segundos: { op: 'aleatorio', a: 1, b: 3, blockId: 'r' } },
  ]);
  const i = instrucoes(bytes);
  assert.deepStrictEqual(i[0], [OP.PUSH, 1, 0, 0]);
  assert.deepStrictEqual(i[1], [OP.PUSH, 3, 0, 0]);
  assert.deepStrictEqual(i[2], [OP.BIN, BIN.ALEATORIO, 0, 0]);
  assert.deepStrictEqual(i[3], [OP.PUSH, 1000, 0, 0]);
  assert.deepStrictEqual(i[4], [OP.BIN, BIN.VEZES, 0, 0]);
  assert.deepStrictEqual(i[5], [OP.WAIT, 0, 0, 0]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/niveis.test.js tests/blocos.test.js tests/compilador.test.js`
Expected: FAIL — `Niveis.LISTA` tem três itens e `conta_mais` não existe.

- [ ] **Step 3: Os blocos novos em `web/blocos.js`**

No topo, a cor: `var COR_CONTA = '#002080';` — o navy da marca, a única cor dela
que ainda não virou bloco.

Dentro de `defineBlocksWithJsonArray`, os quinze. Os binários seguem todos a
mesma forma; escreva-os com um laço para não repetir dez objetos iguais:

```javascript
    /* Dez contas com a mesma forma: dois encaixes e um símbolo no meio. Um
       laço em vez de dez objetos iguais — dez cópias é como elas divergem. */
    var BINARIOS = [
      ['conta_mais', '+', 'Number'], ['conta_menos', '−', 'Number'],
      ['conta_vezes', '×', 'Number'], ['conta_dividir', '÷', 'Number'],
      ['conta_menor', '<', 'Boolean'], ['conta_maior', '>', 'Boolean'],
      ['conta_igual', '=', 'Boolean'],
      ['conta_e', 'e', 'Boolean'], ['conta_ou', 'ou', 'Boolean'],
    ];
    var defs = [];
    for (var k = 0; k < BINARIOS.length; k++) {
      defs.push({
        type: BINARIOS[k][0],
        message0: '%1 ' + BINARIOS[k][1] + ' %2',
        args0: [
          { type: 'input_value', name: 'A' },
          { type: 'input_value', name: 'B' },
        ],
        inputsInline: true,
        output: BINARIOS[k][2],
        colour: COR_CONTA,
      });
    }
    Blockly.defineBlocksWithJsonArray(defs);
```

E os cinco restantes, junto dos blocos de comando:

```javascript
      {
        type: 'conta_nao',
        message0: 'não %1',
        args0: [{ type: 'input_value', name: 'A', check: 'Boolean' }],
        inputsInline: true,
        output: 'Boolean',
        colour: COR_CONTA,
        tooltip: 'Vira o contrário: o que era sim vira não.',
      },
      {
        type: 'aleatorio',
        message0: '🎲 aleatório de %1 a %2',
        args0: [
          { type: 'input_value', name: 'A', check: 'Number' },
          { type: 'input_value', name: 'B', check: 'Number' },
        ],
        inputsInline: true,
        output: 'Number',
        colour: COR_CONTA,
        tooltip: 'Sorteia um número entre os dois, incluindo os dois.',
      },
      {
        /* Ciano, não navy: quem lê o mundo é a família do sensor. É este bloco
           que transforma o "se obstáculo" num caso particular. */
        type: 'distancia',
        message0: '👁 distância cm',
        output: 'Number',
        colour: COR_SENSOR,
        tooltip: 'Quantos centímetros até a coisa mais próxima na frente.',
      },
      {
        /* Amarelo: este decide o caminho, e decidir é da família do laço. O
           "se obstáculo" continua ciano porque ele sente. */
        type: 'se',
        message0: 'se %1 então',
        args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_LACO,
        tooltip: 'Faz os blocos de dentro só se a resposta for sim.',
      },
      {
        type: 'se_entao_senao',
        message0: 'se %1 então',
        args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        message2: 'senão',
        message3: '%1',
        args3: [{ type: 'input_statement', name: 'SENAO' }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_LACO,
        tooltip: 'Faz uns blocos se for sim, e outros se for não.',
      },
      {
        type: 'repetir_ate',
        message0: '🔁 repetir até %1',
        args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_LACO,
        tooltip: 'Repete os blocos de dentro até a resposta virar sim.',
      },
```

- [ ] **Step 4: A AST dos blocos novos**

Em `blocoParaNo`, os casos:

```javascript
      case 'conta_mais':    return conta('mais', b);
      case 'conta_menos':   return conta('menos', b);
      case 'conta_vezes':   return conta('vezes', b);
      case 'conta_dividir': return conta('dividir', b);
      case 'conta_menor':   return conta('menor', b);
      case 'conta_maior':   return conta('maior', b);
      case 'conta_igual':   return conta('igual', b);
      case 'conta_e':       return conta('e', b);
      case 'conta_ou':      return conta('ou', b);
      case 'aleatorio':     return conta('aleatorio', b);
      case 'conta_nao':
        return { op: 'nao', a: valorDe(b, 'A'), blockId: id };
      case 'distancia':
        return { op: 'distancia', blockId: id };
      case 'se':
        return { op: 'se', cond: valorDe(b, 'COND'),
                 corpo: pilhaParaAst(b.getInputTargetBlock('CORPO')), blockId: id };
      case 'se_entao_senao':
        return { op: 'se_entao_senao', cond: valorDe(b, 'COND'),
                 entao: pilhaParaAst(b.getInputTargetBlock('CORPO')),
                 senao: pilhaParaAst(b.getInputTargetBlock('SENAO')), blockId: id };
      case 'repetir_ate':
        return { op: 'repetir_ate', cond: valorDe(b, 'COND'),
                 corpo: pilhaParaAst(b.getInputTargetBlock('CORPO')), blockId: id };
```

Com o ajudante, logo acima:

```javascript
  function conta(nome, b) {
    return { op: nome, a: valorDe(b, 'A'), b: valorDe(b, 'B'), blockId: b.id };
  }
```

- [ ] **Step 5: O nível Gigante em `web/niveis.js`**

```javascript
  var LISTA = ['pequeno', 'medio', 'grande', 'gigante'];
  var NOMES = { pequeno: 'Pequeno', medio: 'Médio', grande: 'Grande',
                gigante: 'Gigante' };
```

E a definição, montada a partir da do Grande para nunca divergir dela:

```javascript
  /* O Gigante é o Grande mais as contas. Escrito assim, e não como lista
     própria, porque um bloco novo no Grande tem que aparecer no Gigante — do
     contrário o degrau de cima teria menos peças que o de baixo. */
  DEFINICOES.gigante = {
    blocos: DEFINICOES.grande.blocos.concat([
      'conta_mais', 'conta_menos', 'conta_vezes', 'conta_dividir',
      'conta_menor', 'conta_maior', 'conta_igual',
      'conta_e', 'conta_ou', 'conta_nao', 'aleatorio',
      'distancia', 'se', 'se_entao_senao', 'repetir_ate',
    ]),
    campos: DEFINICOES.grande.campos,
    bolinhas: false,
  };
```

Em `caixaXml`, a categoria nova, depois de Sentir:

```javascript
    var contas = '';
    if (tem('conta_mais')) {
      contas += bloco('conta_mais') + bloco('conta_menos') +
                bloco('conta_vezes') + bloco('conta_dividir') +
                bloco('aleatorio') +
                bloco('conta_menor') + bloco('conta_maior') + bloco('conta_igual') +
                bloco('conta_e') + bloco('conta_ou') + bloco('conta_nao');
    }
    if (contas) {
      xml += '<category name="Contas" colour="' + COR_CONTA + '">' +
             contas + '</category>';
    }
```

O `distancia` entra na categoria **Sentir**, e o `se`, `se_entao_senao` e
`repetir_ate` na **Repetir** — cada um na família da sua cor.

- [ ] **Step 6: O quarto botão**

Em `web/index.html`, dentro do `#niveis`:

```html
      <button type="button" data-nivel="gigante" aria-pressed="false">Gigante</button>
```

`web/app.js` não muda: os botões são lidos por `querySelectorAll('#niveis button')`
e a troca já é genérica. Confirme que `atualizarBotaoCodigo` continua certo — o
`{ } ver código` deve aparecer no Grande **e** no Gigante:

```javascript
  function atualizarBotaoCodigo() {
    btCodigo.hidden = (nivel !== 'grande' && nivel !== 'gigante');
  }
```

- [ ] **Step 7: O teste de navegador**

Em `tests/navegador.test.js`, depois do trecho que hoje troca para o Grande,
acrescente:

```javascript
    /* No Gigante, uma conta de verdade: o robô anda um número que ele calculou. */
    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=gigante]').click();
      const ws = Blockly.getMainWorkspace();
      Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
        type: 'quando_play', x: 40, y: 30,
        inputs: { CORPO: { block: {
          type: 'mover_frente',
          inputs: { SEG: { block: {
            type: 'conta_vezes',
            inputs: {
              A: { shadow: { type: 'numero', fields: { NUM: 0.25 } } },
              B: { shadow: { type: 'numero', fields: { NUM: 2 } } },
            } } },
          },
          fields: { VEL: '200' },
        } } }
      }] } }, ws);
      Niveis.aplicar(ws, 'gigante');
      return 1;
    })()`);
    await espera(300);

    assert.strictEqual(
      await aval(`document.getElementById('erro').textContent`), '',
      'a conta não compilou');
```

E logo depois, aperte o PLAY como o teste já faz mais abaixo e confirme que o
estado chega a `rodando`.

- [ ] **Step 8: Rodar e ver passar**

Run: `node --test $(ls tests/*.test.js | grep -v gabaritos.test.js)`
Expected: PASS, menos o `gabarito.test.js` se ele ainda estiver montando
`fields` — é a Task 5.

- [ ] **Step 9: Ver com os olhos**

Suba o servidor, vá no Gigante, e monte `andar frente (aleatório de 1 a 3) s`.
Aperte PLAY algumas vezes e veja o robô andar distâncias diferentes. Confira
também que o bloco navy das Contas não some quando arrastado sobre o cabeçalho —
se sumir, é a hora de trocar a cor, e a spec já registra a alternativa.

- [ ] **Step 10: Commit**

```bash
git add web/blocos.js web/niveis.js web/index.html web/app.js tests/
git commit -m "Abre o nível Gigante, com contas e o distância como valor"
```

---

## Task 5: o gabarito monta encaixes

**Files:**
- Modify: `web/gabarito.js`
- Test: `tests/gabarito.test.js`, `tests/gabaritos.test.js`

**Interfaces:**
- Consumes: os tipos `numero` e `numero_bolinhas` (Task 3), o nível `gigante` (Task 4).
- Produces: nada para tarefas seguintes.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/gabarito.test.js`, substitua as asserções que leem `fields` por:

```javascript
test('o gabarito monta encaixe com shadow, não campo', () => {
  const projeto = Gabarito.montar([{ andar: 2 }], 'medio', 0.5);
  const primeiro = projeto.blocks.blocks[0].inputs.CORPO.block;
  assert.strictEqual(primeiro.type, 'mover_frente');
  assert.strictEqual(primeiro.inputs.SEG.shadow.type, 'numero');
  assert.strictEqual(primeiro.inputs.SEG.shadow.fields.NUM, 1);
  assert.strictEqual(primeiro.fields.VEL, '200');
});

test('no Pequeno o repetir usa o shadow de bolinhas', () => {
  const projeto = Gabarito.montar([{ andar: 3 }], 'pequeno', 0.5);
  const primeiro = projeto.blocks.blocks[0].inputs.CORPO.block;
  assert.strictEqual(primeiro.type, 'repetir');
  assert.strictEqual(primeiro.inputs.N.shadow.type, 'numero_bolinhas');
  assert.strictEqual(primeiro.inputs.N.shadow.fields.NUM, 3);
});

test('o girar preenche o menu e o encaixe', () => {
  const projeto = Gabarito.montar([{ girar: -90 }], 'medio', 0.5);
  const primeiro = projeto.blocks.blocks[0].inputs.CORPO.block;
  assert.strictEqual(primeiro.fields.DIR, '-90');
  assert.strictEqual(primeiro.inputs.GRAUS.shadow.fields.NUM, -90);
});

test('o Gigante usa a mesma língua do Grande', () => {
  const g = Gabarito.montar([{ ate_perto: 20, andar: 4 }], 'gigante', 0.5);
  const grande = Gabarito.montar([{ ate_perto: 20, andar: 4 }], 'grande', 0.5);
  assert.deepStrictEqual(g, grande);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/gabarito.test.js`
Expected: FAIL — o gabarito ainda devolve `fields: { SEG: … }`.

- [ ] **Step 3: Reescrever os construtores de `web/gabarito.js`**

```javascript
  /* Um encaixe com o shadow dentro. O gabarito monta o mesmo desenho que a
     criança monta arrastando — se ele montasse campo e ela montasse encaixe,
     o gabarito viraria uma peça que ela não consegue reproduzir. */
  function enc(tipo, valor) {
    return { shadow: { type: tipo, fields: { NUM: valor } } };
  }

  function blocoAndar(segundos) {
    return { type: 'mover_frente',
             inputs: { SEG: enc('numero', segundos) },
             fields: { VEL: VEL_PADRAO } };
  }

  function blocoGirar(graus) {
    return { type: 'girar',
             fields: { DIR: String(graus) },
             inputs: { GRAUS: enc('numero', graus) } };
  }
```

E nos três lugares que montam `repetir`, `se_obstaculo` e `repetir_ate_perto`:

```javascript
        ? { type: 'repetir', inputs: { N: enc('numero_bolinhas', n),
                                       CORPO: { block: blocoAndar(passoS) } } }
```

```javascript
      return [{ type: 'repetir_ate_perto',
                inputs: { CM: enc('numero', passo.ate_perto),
                          CORPO: { block: blocoAndar(passoS) } } }];
```

```javascript
    var se = { type: 'se_obstaculo',
               inputs: { CM: enc('numero', passo.ate_perto),
                         CORPO: { block: { type: 'parar' } } },
               next: { block: blocoAndar(passoS) } };
```

E `blocosAtePerto` e `blocosDeAndar` passam a tratar `gigante` como `grande`:

```javascript
  /* O Gigante fala a língua do Grande: as fases de hoje não pedem conta
     nenhuma, e um gabarito com conta ensinaria a resolver com mais do que
     precisa. */
  function comoGrande(nivel) {
    return nivel === 'grande' || nivel === 'gigante';
  }
```

Use `comoGrande(nivel)` no lugar de `nivel === 'grande'`, e
`nivel !== 'pequeno'` continua valendo como está.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/gabarito.test.js`
Expected: PASS.

- [ ] **Step 5: O teste lento, agora com quatro níveis**

Em `tests/gabaritos.test.js`, a lista de níveis passa a ter os quatro. Procure
por `['pequeno', 'medio', 'grande']` e acrescente `'gigante'`.

Run: `node --test tests/gabaritos.test.js`
Expected: PASS. Leva uns quatro minutos — ele monta cada gabarito, aperta PLAY e
confere que a missão é cumprida, nas cinco fases e nos quatro níveis.

- [ ] **Step 6: Commit**

```bash
git add web/gabarito.js tests/gabarito.test.js tests/gabaritos.test.js
git commit -m "Monta o gabarito com encaixes, e cobre o Gigante"
```

---

## Task 6: o `.ino` aprende a calcular

**Files:**
- Modify: `web/arduino.js`
- Test: `tests/arduino.test.js`

**Interfaces:**
- Consumes: os nós de valor da Task 4.
- Produces: nada para tarefas seguintes.

- [ ] **Step 1: Escrever os testes que falham**

```javascript
test('uma conta vira expressão em C++', () => {
  assert.strictEqual(
    programa([{ op: 'girar', graus: { op: 'vezes', a: 45, b: 2 } }]),
    '  girar(45 * 2);');
});

test('as contas põem parênteses para não depender de precedência', () => {
  assert.strictEqual(
    programa([{ op: 'girar',
                graus: { op: 'mais', a: 1, b: { op: 'vezes', a: 2, b: 3 } } }]),
    '  girar(1 + (2 * 3));');
});

test('o distância vira a chamada da função', () => {
  const txt = gerar([{ op: 'se', cond: { op: 'menor', a: { op: 'distancia' }, b: 20 },
                       corpo: [{ op: 'parar' }] }]);
  assert.ok(txt.includes('if (distanciaCm() < 20) {'), txt);
  assert.ok(txt.includes('int distanciaCm()'), 'faltou a função do sensor');
});

test('o aleatório sai como função nomeada, e ela é emitida', () => {
  const txt = gerar([{ op: 'esperar', segundos: { op: 'aleatorio', a: 1, b: 3 } }]);
  assert.ok(txt.includes('esperar(aleatorio(1, 3));'), txt);
  assert.ok(txt.includes('int aleatorio(int menor, int maior)'), 'faltou aleatorio');
});

test('um programa sem aleatório não carrega aleatorio()', () => {
  const txt = gerar([{ op: 'frente', segundos: 1 }]);
  assert.ok(!txt.includes('int aleatorio('), 'sobrou aleatorio');
});

test('se, se…senão e repetir até com condição da criança', () => {
  assert.strictEqual(
    programa([{ op: 'repetir_ate',
                cond: { op: 'maior', a: { op: 'distancia' }, b: 50 },
                corpo: [{ op: 'frente', segundos: 0.5 }] }]),
    ['  while (!(distanciaCm() > 50)) {',
     '    andarFrente(0.5, 200);',
     '  }'].join('\n'));
});

test('e, ou e não saem legíveis', () => {
  assert.strictEqual(
    programa([{ op: 'se',
                cond: { op: 'e',
                        a: { op: 'nao', a: { op: 'menor', a: 1, b: 2 } },
                        b: { op: 'ou', a: 3, b: 4 } },
                corpo: [{ op: 'parar' }] }]),
    ['  if (!(1 < 2) && (3 || 4)) {',
     '    parar();',
     '    return;',
     '  }'].join('\n'));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/arduino.test.js`
Expected: FAIL — `girar([object Object]);`.

- [ ] **Step 3: O emissor de expressão em `web/arduino.js`**

```javascript
  /* Um valor vira texto. Parênteses em toda subexpressão composta: depender da
     precedência do C++ para o código sair certo é apostar que a criança
     entende precedência antes de entender conta. */
  var SIMBOLO = {
    mais: '+', menos: '-', vezes: '*', dividir: '/',
    menor: '<', maior: '>', igual: '==', e: '&&', ou: '||'
  };

  function valor(v) {
    if (v === null || v === undefined) return '0';
    if (typeof v === 'number') return String(v);
    if (v.op === 'distancia') return 'distanciaCm()';
    if (v.op === 'nao') return '!(' + valor(v.a) + ')';
    if (v.op === 'aleatorio') {
      return 'aleatorio(' + valor(v.a) + ', ' + valor(v.b) + ')';
    }
    var s = SIMBOLO[v.op];
    if (!s) throw new Error('Conta desconhecida: ' + v.op);
    return parte(v.a) + ' ' + s + ' ' + parte(v.b);
  }

  /* Número e chamada não precisam de parênteses; conta precisa. */
  function parte(v) {
    if (typeof v === 'number' || v === null || v === undefined) return valor(v);
    if (v.op === 'distancia' || v.op === 'nao' || v.op === 'aleatorio') return valor(v);
    return '(' + valor(v) + ')';
  }
```

Todo lugar que hoje faz `seg(no.segundos)` ou `inteiro(no.graus, 0)` passa a
decidir:

```javascript
  /* Número continua saindo com uma casa, que é a precisão do campo. Conta sai
     como expressão — e aí a casa decimal não faz sentido. */
  function segOuConta(v) {
    return (typeof v === 'number' || v === null || v === undefined)
      ? seg(v) : valor(v);
  }

  function inteiroOuConta(v, padrao) {
    return (typeof v === 'number' || v === null || v === undefined)
      ? String(inteiro(v, padrao)) : valor(v);
  }
```

- [ ] **Step 4: Os três comandos novos e o uso do aleatório**

Em `gerarNos`, antes do `default`:

```javascript
        case 'se':
          linhas.push(r + 'if (' + valor(no.cond) + ') {');
          gerarNos(no.corpo || [], nivel + 1, profundidade, linhas);
          linhas.push(r + '}');
          break;
        case 'se_entao_senao':
          linhas.push(r + 'if (' + valor(no.cond) + ') {');
          gerarNos(no.entao || [], nivel + 1, profundidade, linhas);
          linhas.push(r + '} else {');
          gerarNos(no.senao || [], nivel + 1, profundidade, linhas);
          linhas.push(r + '}');
          break;
        case 'repetir_ate':
          /* "até" é "enquanto não": o laço roda enquanto a condição é falsa. */
          linhas.push(r + 'while (!(' + valor(no.cond) + ')) {');
          gerarNos(no.corpo || [], nivel + 1, profundidade, linhas);
          linhas.push(r + '}');
          break;
```

`usoDe` passa a descer pelos valores, não só pelos ramos de comando:

```javascript
    /* O sensor e o aleatório podem estar escondidos dentro de uma conta, e a
       varredura tem que alcançá-los — senão o arquivo chama uma função que ele
       não define. */
    function usoDeValor(v, uso) {
      if (!v || typeof v === 'number') return;
      if (v.op === 'distancia') uso.sensor = true;
      if (v.op === 'aleatorio') uso.aleatorio = true;
      usoDeValor(v.a, uso);
      usoDeValor(v.b, uso);
    }
```

Chame-a para `no.segundos`, `no.graus`, `no.vezes`, `no.cm` e `no.cond` dentro
de `usoDe`.

E a função nova, emitida sob demanda:

```javascript
  var ALEATORIO = [
    '/* Sorteia entre os dois, incluindo os dois. */',
    'int aleatorio(int menor, int maior) {',
    '  if (menor > maior) { int t = menor; menor = maior; maior = t; }',
    '  return random(menor, maior + 1);',
    '}',
    ''
  ];
```

Com `if (uso.aleatorio) linhas = linhas.concat(ALEATORIO);` em `gerar`, e
`randomSeed(micros());` dentro do `fiacao()` quando `uso.aleatorio` — sem
semente, o Arduino sorteia a mesma sequência a cada ligada.

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/arduino.test.js`
Expected: PASS, incluindo os dois testes de `g++ -fsyntax-only`. Se o `g++`
reclamar de `random` ou `randomSeed`, acrescente-os ao `tests/fake_arduino.h`:

```c
inline long random(long, long) { return 0; }
inline void randomSeed(unsigned long) {}
inline unsigned long micros() { return 0; }
```

- [ ] **Step 6: Commit**

```bash
git add web/arduino.js tests/arduino.test.js tests/fake_arduino.h
git commit -m "Traduz as contas do Gigante para expressões em C++"
```

---

## Task 7: a ESP32 aceita mensagem partida

Independente de todas as outras: conserta um defeito que já existe hoje e que o
teto de 1024 instruções torna provável.

**Files:**
- Create: `firmware/src/quadros.h`, `tests/quadros_test.c`
- Modify: `firmware/src/main.cpp`, `tests/Makefile`

**Interfaces:**
- Consumes: `MAX_INSTR` e `INSTR_BYTES` de `core/bytecode.h`.
- Produces: `montador_init(Montador *)` e `montador_pedaco(Montador *, const uint8_t *, uint32_t, uint32_t, uint32_t, int)`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/quadros_test.c`:

```c
#include <stdio.h>
#include <string.h>
#include "quadros.h"

static int falhas;

#define CHECK(cond)                                                        \
    do {                                                                   \
        if (!(cond)) {                                                     \
            printf("  FALHOU %s:%d  %s\n", __FILE__, __LINE__, #cond);     \
            falhas++;                                                      \
        }                                                                  \
    } while (0)

static void teste_mensagem_inteira_num_pedaco(void) {
    printf("teste_mensagem_inteira_num_pedaco\n");
    Montador m;
    montador_init(&m);
    uint8_t dados[3] = { 0x02, 0, 0 };
    CHECK(montador_pedaco(&m, dados, 3, 0, 3, 1) == 3);
    CHECK(m.buf[0] == 0x02);
}

/* O caso que hoje é descartado em silêncio: um quadro só, entregue em dois
   pedaços porque não coube no MTU. */
static void teste_um_quadro_em_dois_pedacos(void) {
    printf("teste_um_quadro_em_dois_pedacos\n");
    Montador m;
    montador_init(&m);
    uint8_t a[2] = { 1, 2 }, b[2] = { 3, 4 };
    CHECK(montador_pedaco(&m, a, 2, 0, 4, 1) == 0);
    CHECK(montador_pedaco(&m, b, 2, 2, 4, 1) == 4);
    CHECK(m.buf[0] == 1 && m.buf[3] == 4);
}

/* Mensagem partida em três quadros: só o último traz final == 1. */
static void teste_tres_quadros(void) {
    printf("teste_tres_quadros\n");
    Montador m;
    montador_init(&m);
    uint8_t a[2] = { 1, 2 }, b[2] = { 3, 4 }, c[2] = { 5, 6 };
    CHECK(montador_pedaco(&m, a, 2, 0, 2, 0) == 0);
    CHECK(montador_pedaco(&m, b, 2, 0, 2, 0) == 0);
    CHECK(montador_pedaco(&m, c, 2, 0, 2, 1) == 6);
    CHECK(m.buf[0] == 1 && m.buf[5] == 6);
}

/* Grande demais é descartada inteira, e o montador volta ao zero — meia
   mensagem guardada corromperia a seguinte. */
static void teste_grande_demais_nao_estraga_a_seguinte(void) {
    printf("teste_grande_demais_nao_estraga_a_seguinte\n");
    Montador m;
    montador_init(&m);
    static uint8_t enorme[MONTADOR_MAX + 10];
    memset(enorme, 7, sizeof(enorme));
    CHECK(montador_pedaco(&m, enorme, sizeof(enorme), 0, sizeof(enorme), 1) == 0);

    uint8_t ok[3] = { 0x03, 0, 0 };
    CHECK(montador_pedaco(&m, ok, 3, 0, 3, 1) == 3);
    CHECK(m.buf[0] == 0x03);
}

static void teste_mensagem_vazia_nao_conta(void) {
    printf("teste_mensagem_vazia_nao_conta\n");
    Montador m;
    montador_init(&m);
    CHECK(montador_pedaco(&m, NULL, 0, 0, 0, 1) == 0);
}

int main(void) {
    teste_mensagem_inteira_num_pedaco();
    teste_um_quadro_em_dois_pedacos();
    teste_tres_quadros();
    teste_grande_demais_nao_estraga_a_seguinte();
    teste_mensagem_vazia_nao_conta();
    if (falhas == 0) { printf("\ntodos os testes passaram\n"); return 0; }
    printf("\n%d verificacao(oes) falharam\n", falhas);
    return 1;
}
```

E o alvo em `tests/Makefile`:

```make
test: vm_test physics_test quadros_test
	./vm_test
	./physics_test
	./quadros_test

quadros_test: quadros_test.c
	$(CC) $(CFLAGS) -I../firmware/src -o $@ $^ $(LDLIBS)
```

Acrescente `quadros_test` ao alvo `clean`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `make -C tests test`
Expected: FAIL — `quadros.h: No such file or directory`.

- [ ] **Step 3: Escrever o `firmware/src/quadros.h`**

```c
/* Remonta uma mensagem WebSocket que chegou partida.

   O ESPAsyncWebServer entrega uma mensagem grande em vários pedaços — ou
   porque o quadro não coube no MTU, ou porque o cliente a mandou em vários
   quadros. O código anterior descartava qualquer coisa que não chegasse
   inteira de uma vez, e um programa de 256 instruções já dá 1795 bytes, acima
   do MTU típico de 1436: programa grande simplesmente não carregava, em
   silêncio.

   É C puro e sem Arduino de propósito, para caber num teste de mesa. */
#ifndef QUADROS_H
#define QUADROS_H

#include <stdint.h>
#include <string.h>
#include "bytecode.h"

/* O maior T_LOAD possível: um byte de tipo, dois de contagem, e o programa. */
#define MONTADOR_MAX (3 + MAX_INSTR * INSTR_BYTES)

typedef struct {
    uint8_t  buf[MONTADOR_MAX];
    uint32_t recebido;
} Montador;

static inline void montador_init(Montador *m) {
    m->recebido = 0;
}

/* Recebe um pedaço. Devolve o tamanho da mensagem quando ela fica completa, ou
   0 enquanto falta pedaço — e também 0 quando a mensagem é grande demais, caso
   em que ela é descartada inteira e o montador volta ao zero. */
static inline uint32_t montador_pedaco(Montador *m, const uint8_t *dados,
                                       uint32_t tam, uint32_t indice,
                                       uint32_t total, int final) {
    if (m->recebido + tam > MONTADOR_MAX) {
        m->recebido = 0;
        return 0;
    }
    if (tam > 0 && dados != NULL) {
        memcpy(m->buf + m->recebido, dados, tam);
        m->recebido += tam;
    }
    /* Fim do quadro é (indice + tam == total); fim da mensagem é isso mais o
       bit final. Um quadro do meio tem final == 0 e não termina nada. */
    if (final && (indice + tam) >= total) {
        uint32_t n = m->recebido;
        m->recebido = 0;
        return n;
    }
    return 0;
}

#endif
```

- [ ] **Step 4: Rodar e ver passar**

Run: `make -C tests test`
Expected: PASS, os três executáveis.

- [ ] **Step 5: Ligar no `firmware/src/main.cpp`**

O `#include "quadros.h"` junto dos outros, dentro do bloco `extern "C"` **não** —
ele já é C puro com guardas próprias, então basta incluir depois deles.

Um montador global, ao lado da VM:

```cpp
static Montador montador;
```

E o `aoEvento` passa a acumular em vez de descartar:

```cpp
    if (tipo == WS_EVT_CONNECT) {
        /* Conexão nova começa do zero: meia mensagem de uma sessão anterior
           corromperia a primeira desta. */
        montador_init(&montador);
        enviar_estado(vm.rodando);
        return;
    }
    if (tipo != WS_EVT_DATA) return;

    AwsFrameInfo *info = (AwsFrameInfo *)arg;
    uint32_t n = montador_pedaco(&montador, dados, (uint32_t)tam,
                                 (uint32_t)info->index, (uint32_t)info->len,
                                 info->final ? 1 : 0);
    if (n == 0) return;          /* ainda falta pedaço, ou veio grande demais */

    const uint8_t *msg = montador.buf;
    switch (msg[0]) {
    case T_LOAD: {
        if (n < 3) return;
        uint16_t qtd = (uint16_t)(msg[1] | (msg[2] << 8));
        if (n != (uint32_t)(3 + qtd * INSTR_BYTES)) return;
        vm_load(&vm, msg + 3, (uint16_t)(qtd * INSTR_BYTES));
        pc_enviado = 0xFFFF;
        break;
    }
```

O resto do `switch` continua igual, trocando `dados[0]` por `msg[0]`. Também
chame `montador_init(&montador)` no `setup()`.

- [ ] **Step 6: Conferir que o firmware compila**

Run: `cd firmware && pio run && cd ..`
Expected: SUCCESS. O uso de flash sobe um pouco: o buffer de 7171 bytes agora é
estático, e o `prog` da VM quadruplicou.

- [ ] **Step 7: Commit**

```bash
git add firmware/src/quadros.h firmware/src/main.cpp tests/quadros_test.c tests/Makefile
git commit -m "Remonta mensagem WebSocket partida em vez de descartá-la"
```

---

## Task 8: README, bateria inteira e os arquivos da placa

**Files:**
- Modify: `README.md`
- Regenerate: `firmware/data/`

- [ ] **Step 1: A tabela dos níveis**

Em `README.md`, na seção `## Os blocos e os níveis`, a tabela ganha uma coluna
`Gigante (12+)` — repetindo o conteúdo da coluna do Grande, porque o Gigante
herda tudo — e as linhas novas:

```markdown
| `➕` contas | — | — | — | `+ − × ÷` |
| `🎲` aleatório | — | — | — | `de [1] a [3]` |
| `< > =` comparações | — | — | — | sim |
| `e` `ou` `não` | — | — | — | sim |
| `👁` distância cm | — | — | — | como valor |
| `se ( ) então` | — | — | — | sim |
| `se ( ) senão` | — | — | — | sim |
| `🔁` repetir até ( ) | — | — | — | sim |
```

E o parágrafo que explica o degrau:

```markdown
O Gigante é o Grande mais as contas. Ele existe porque o Grande virou teto: até
ali todo número é uma constante que a criança digita, e no Gigante um número pode
ser uma conta — `andar frente (aleatório de 1 a 3) s`. O bloco que carrega a lição
é o `👁 distância cm`: com ele, o `se obstáculo a menos de [20] cm`, que ela usa
desde os sete anos, vira um caso particular de `se ((distância cm) < (20))`. O
primeiro sente; o segundo decide.
```

- [ ] **Step 2: A tabela de bytecode**

A seção `### Como cada bloco vira bytecode` está desatualizada desde a Task 2:
todo valor agora passa pela pilha. Reescreva-a:

```markdown
| bloco                        | bytecode                                           |
|------------------------------|----------------------------------------------------|
| `andar frente [n] s`         | `PUSH v` ; `PUSH v` ; `MOTOR` ; `PUSH n*1000` ; `WAIT` ; `PUSH 0` ; `PUSH 0` ; `MOTOR` |
| `girar [g] graus`            | `PUSH g` ; `TURN`                                  |
| `esperar [n] s`              | `PUSH n*1000` ; `WAIT`                             |
| `repetir [n] vezes { c }`    | `PUSH n` ; `SET_REG rk` ; corpo ; `DEC_JNZ rk,início` |
| `se ( cond ) { c }`          | cond ; `JMP_FALSE depois` ; corpo ; `depois:`      |
| `se…senão`                   | cond ; `JMP_FALSE senão` ; então ; `JMP fim` ; `senão:` senão ; `fim:` |
| `repetir até ( cond ) { c }` | `início:` cond ; `UN não` ; `JMP_FALSE fim` ; corpo ; `JMP início` ; `fim:` |
| `parar tudo`                 | `HALT`                                             |
| `( a ) + ( b )`              | a ; b ; `BIN +`                                    |
| `distância cm`               | `SENSOR 0`                                         |

Os três blocos de sensor do Grande não têm opcode próprio: `se obstáculo a menos
de [20] cm` é `SENSOR 0` ; `PUSH 20` ; `BIN <` ; `JMP_FALSE`. É a mesma coisa que
a criança monta à mão no Gigante — e é essa unificação que faz o `distância cm`
ser o mesmo mecanismo, não um segundo.
```

- [ ] **Step 3: A tabela do C++**

Acrescente as linhas novas à seção `### Como cada bloco vira C++`:

```markdown
| `( a ) + ( b )`              | `a + b`, com parênteses em toda conta composta |
| `🎲 aleatório de ( ) a ( )`  | `aleatorio(a, b)`                          |
| `👁 distância cm`            | `distanciaCm()`                            |
| `se ( ) então { c }`         | `if (cond) { c }`                          |
| `repetir até ( ) { c }`      | `while (!(cond)) { c }`                    |
```

- [ ] **Step 4: Bateria inteira**

```bash
node --test tests/
make -C tests test
bash tests/host_test.sh
node --test tests/es5.test.js
```

Expected: as quatro verdes. A primeira agora leva uns 6 min — o
`gabaritos.test.js` passou a rodar quatro níveis.

- [ ] **Step 5: Regravar os arquivos da placa**

```bash
./firmware/preparar_data.sh
cd firmware && pio run && cd ..
```

Expected: SUCCESS.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "Descreve o nível Gigante e a pilha no README"
```

---

## Verificação final

- [ ] `node --test tests/` — verde, incluindo `gabaritos.test.js` nos quatro níveis
- [ ] `make -C tests test` — verde, os três executáveis
- [ ] `bash tests/host_test.sh` — verde
- [ ] `node --test tests/es5.test.js` — verde
- [ ] `cd firmware && pio run` — SUCCESS
- [ ] `git status` — limpo
- [ ] O teste dourado passa, e os dois lados dele foram escritos separadamente
- [ ] Na tela: no Pequeno, nenhum buraco onde havia número; no Médio e no Grande, tudo como era
- [ ] No Gigante: montar `andar frente (aleatório de 1 a 3) s`, apertar PLAY três vezes, e ver distâncias diferentes
- [ ] No Gigante: montar `repetir até ((distância cm) < 20) { andar frente 0,5 s }` e ver o robô parar na parede
- [ ] O bloco navy das Contas continua visível ao ser arrastado sobre o cabeçalho — se sumir, trocar a cor
- [ ] `{ } ver código` no Gigante mostra a conta virada expressão em C++
