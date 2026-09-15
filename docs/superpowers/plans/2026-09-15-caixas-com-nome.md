# Caixas com nome — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A criança do Avançado cria caixas com nome, guarda, soma e lê números nelas — no robô virtual, na placa e no `.ino`.

**Architecture:** Quatro opcodes novos na VM (`PUSH_VAR`, `STORE_VAR`, `CHANGE_VAR`, `ZERAR_CAIXAS`) sobre um vetor de 16 caixas que mora na `VM`, fora das tarefas e fora do `vm_load`. Um mapa estável `id da variável → lugar` (`web/caixas.js`, sem Blockly) é gravado junto com o programa e decide o índice de cada caixa e se o PLAY precisa zerar. O `blocos.js` traduz os três blocos novos em nós com índice e nome; o compilador usa o índice, o `arduino.js` usa o nome.

**Tech Stack:** C11 (VM, testes de mesa), JavaScript ES5 (navegador, iPad com iOS 9), Blockly 8.0.5, `node --test`, g++ com UBSan para o sketch gerado, Chromium headless via CDP para o teste de navegador.

**Spec:** [`docs/superpowers/specs/2026-09-15-caixas-com-nome-design.md`](../specs/2026-09-15-caixas-com-nome-design.md)

## Global Constraints

- Todo arquivo em `web/*.js` é ES5: sem `let`/`const`, arrow, template literal, `class`, método abreviado, propriedade abreviada, spread, `for…of`, `.repeat(`, e — a partir da Task 4 — `.normalize(`. Quem cobra é `tests/es5.test.js`.
- Números de opcode: `OP_PUSH_VAR = 16`, `OP_STORE_VAR = 17`, `OP_CHANGE_VAR = 18`, `OP_ZERAR_CAIXAS = 19`. O 7 continua vago.
- `N_CAIXAS = 16`, em `core/bytecode.h` e copiado em `web/compilador.js` e `web/caixas.js`.
- Programa compilado sem `zerarCaixas` gera o bytecode de hoje, byte por byte.
- O protocolo (`T_LOAD`, `T_RUN`, `T_STOP`, quadros de volta) não muda.
- Comentários em português, explicando o porquê, na densidade do arquivo em volta.
- Commits em português, sem linha de atribuição, e `git push origin master` depois de cada um.
- `make test` roda em segundos e é o que se roda a cada task. `make test-lento` (Chromium, ~5 min) só na Task 10, e sem editar `web/` enquanto ele roda.

---

### Task 1: As caixas na VM

**Files:**
- Modify: `core/bytecode.h`
- Modify: `core/vm.h`
- Modify: `core/vm.c`
- Test: `tests/vm_test.c`, `tests/tarefas_test.c`

**Interfaces:**
- Produces: `OP_PUSH_VAR`, `OP_STORE_VAR`, `OP_CHANGE_VAR`, `OP_ZERAR_CAIXAS`, `N_CAIXAS`, campo `int32_t caixa[N_CAIXAS]` em `VM`.

- [ ] **Step 1: Escrever os testes que falham em `tests/vm_test.c`**

Acrescente, antes de `int main`, um ajudante e os testes:

```c
/* Procura uma linha exata no trace. O vm_stop do fim deixa "MOTOR 0 0" lá
   dentro, então comparar o trace inteiro amarraria o teste a um detalhe que
   não é dele. */
static int no_trace(const char *linha) {
    for (int i = 0; i < fake_trace_count(); i++)
        if (strcmp(fake_trace_get(i), linha) == 0) return 1;
    return 0;
}

static void teste_caixa_guarda_e_le(void) {
    uint8_t prog[7 * 5], *p = prog;
    p = emit(p, OP_PUSH, 42, 0, 0);
    p = emit(p, OP_STORE_VAR, 3, 0, 0);
    p = emit(p, OP_PUSH_VAR, 3, 0, 0);
    p = emit(p, OP_REPORT, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    VM vm;
    preparar(&vm, prog, (uint16_t)(p - prog));
    rodar_ate_parar(&vm);
    CHECK(no_trace("REPORT 42"));
    CHECK(vm.caixa[3] == 42);
}

static void teste_mudar_soma_na_caixa(void) {
    uint8_t prog[7 * 7], *p = prog;
    p = emit(p, OP_PUSH, 5, 0, 0);
    p = emit(p, OP_STORE_VAR, 0, 0, 0);
    p = emit(p, OP_PUSH, 3, 0, 0);
    p = emit(p, OP_CHANGE_VAR, 0, 0, 0);
    p = emit(p, OP_PUSH_VAR, 0, 0, 0);
    p = emit(p, OP_REPORT, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    VM vm;
    preparar(&vm, prog, (uint16_t)(p - prog));
    rodar_ate_parar(&vm);
    CHECK(no_trace("REPORT 8"));
}

static void teste_mudar_estourando_da_a_volta(void) {
    uint8_t prog[7 * 3], *p = prog;
    p = emit(p, OP_PUSH, 1, 0, 0);
    p = emit(p, OP_CHANGE_VAR, 1, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    VM vm;
    preparar(&vm, prog, (uint16_t)(p - prog));
    vm.caixa[1] = 2147483647;
    rodar_ate_parar(&vm);
    CHECK(vm.caixa[1] == (int32_t)(-2147483647 - 1));
}

/* Os três opcodes com índice fora da faixa param a VM antes do REPORT. */
static void teste_caixa_fora_da_faixa_para_a_vm(void) {
    const uint8_t ops[3] = { OP_PUSH_VAR, OP_STORE_VAR, OP_CHANGE_VAR };
    const int16_t indices[2] = { N_CAIXAS, -1 };
    for (int k = 0; k < 3; k++) {
        for (int j = 0; j < 2; j++) {
            uint8_t prog[7 * 5], *p = prog;
            p = emit(p, OP_PUSH, 1, 0, 0);
            p = emit(p, ops[k], indices[j], 0, 0);
            p = emit(p, OP_PUSH, 99, 0, 0);
            p = emit(p, OP_REPORT, 0, 0, 0);
            p = emit(p, OP_HALT, 0, 0, 0);
            VM vm;
            preparar(&vm, prog, (uint16_t)(p - prog));
            rodar_ate_parar(&vm);
            CHECK(!no_trace("REPORT 99"));
        }
    }
}

/* É o que faz tocar em «mudar» e depois em «voltas» mostrar o número: a
   execução viva carrega um programa novo a cada toque. */
static void teste_caixa_sobrevive_a_outro_programa(void) {
    uint8_t guarda[7 * 3], *p = guarda;
    p = emit(p, OP_PUSH, 6, 0, 0);
    p = emit(p, OP_STORE_VAR, 2, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    uint16_t n_guarda = (uint16_t)(p - guarda);

    uint8_t le[7 * 3], *q = le;
    q = emit(q, OP_PUSH_VAR, 2, 0, 0);
    q = emit(q, OP_REPORT, 0, 0, 0);
    q = emit(q, OP_HALT, 0, 0, 0);
    uint16_t n_le = (uint16_t)(q - le);

    VM vm;
    preparar(&vm, guarda, n_guarda);
    rodar_ate_parar(&vm);
    CHECK(vm_load(&vm, le, n_le) == 1);
    fake_trace_reset();
    vm_run(&vm);
    rodar_ate_parar(&vm);
    CHECK(no_trace("REPORT 6"));
}

static void teste_zerar_como_primeira_instrucao(void) {
    uint8_t prog[7 * 4], *p = prog;
    p = emit(p, OP_ZERAR_CAIXAS, 0, 0, 0);
    p = emit(p, OP_PUSH_VAR, 2, 0, 0);
    p = emit(p, OP_REPORT, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    VM vm;
    fake_clock_set(1000);
    vm_init(&vm);
    CHECK(vm_load(&vm, prog, (uint16_t)(p - prog)) == 1);
    vm.caixa[2] = 5;
    vm.caixa[15] = 7;
    fake_trace_reset();
    vm_run(&vm);
    /* Antes de qualquer tick: quem zera é o vm_run. */
    CHECK(vm.caixa[2] == 0);
    CHECK(vm.caixa[15] == 0);
    rodar_ate_parar(&vm);
    CHECK(no_trace("REPORT 0"));
}

static void teste_zerar_no_meio_zera_ao_executar(void) {
    uint8_t prog[7 * 6], *p = prog;
    p = emit(p, OP_PUSH, 4, 0, 0);
    p = emit(p, OP_STORE_VAR, 0, 0, 0);
    p = emit(p, OP_ZERAR_CAIXAS, 0, 0, 0);
    p = emit(p, OP_PUSH_VAR, 0, 0, 0);
    p = emit(p, OP_REPORT, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    VM vm;
    preparar(&vm, prog, (uint16_t)(p - prog));
    rodar_ate_parar(&vm);
    CHECK(no_trace("REPORT 0"));
}
```

E no `main`, depois de `teste_report_com_pilha_vazia_para_a_vm();`:

```c
    teste_caixa_guarda_e_le();
    teste_mudar_soma_na_caixa();
    teste_mudar_estourando_da_a_volta();
    teste_caixa_fora_da_faixa_para_a_vm();
    teste_caixa_sobrevive_a_outro_programa();
    teste_zerar_como_primeira_instrucao();
    teste_zerar_no_meio_zera_ao_executar();
```

- [ ] **Step 2: Escrever os testes que falham em `tests/tarefas_test.c`**

Antes de `int main`:

```c
/* O programa que motiva o ciclo: duas pilhas contando na mesma caixa. Com
   «mudar» feito em quatro instruções, o rodízio por instrução intercala as
   leituras e as escritas, e a caixa termina com menos do que as duas somaram. */
static void teste_duas_tarefas_mudando_a_mesma_caixa(void) {
    uint8_t prog[7 * 14], *p = prog;
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 2, 0);
    p = emit(p, OP_TASK, TAREFA_NO_PLAY, 8, 0);
    /* 2 */ p = emit(p, OP_PUSH, 100, 0, 0);
    /* 3 */ p = emit(p, OP_SET_REG, 0, 0, 0);
    /* 4 */ p = emit(p, OP_PUSH, 1, 0, 0);
    /* 5 */ p = emit(p, OP_CHANGE_VAR, 0, 0, 0);
    /* 6 */ p = emit(p, OP_DEC_JNZ, 0, 4, 0);
    /* 7 */ p = emit(p, OP_HALT, 0, 0, 0);
    /* 8 */ p = emit(p, OP_PUSH, 100, 0, 0);
    /* 9 */ p = emit(p, OP_SET_REG, 0, 0, 0);
    /*10 */ p = emit(p, OP_PUSH, 1, 0, 0);
    /*11 */ p = emit(p, OP_CHANGE_VAR, 0, 0, 0);
    /*12 */ p = emit(p, OP_DEC_JNZ, 0, 10, 0);
    /*13 */ p = emit(p, OP_HALT, 0, 0, 0);
    VM vm;
    preparar(&vm, prog, (uint16_t)(p - prog));
    for (int k = 0; k < 5000 && vm.rodando; k++) vm_tick(&vm);
    CHECK(!vm.rodando);
    CHECK(vm.caixa[0] == 200);
}

static void teste_zerar_antes_do_cabecalho(void) {
    uint8_t prog[7 * 9], *p = prog;
    /* 0 */ p = emit(p, OP_ZERAR_CAIXAS, 0, 0, 0);
    /* 1 */ p = emit(p, OP_TASK, TAREFA_NO_PLAY, 3, 0);
    /* 2 */ p = emit(p, OP_TASK, TAREFA_NO_PLAY, 6, 0);
    /* 3 */ p = emit(p, OP_PUSH, 7, 0, 0);
    /* 4 */ p = emit(p, OP_REPORT, 0, 0, 0);
    /* 5 */ p = emit(p, OP_HALT, 0, 0, 0);
    /* 6 */ p = emit(p, OP_PUSH, 9, 0, 0);
    /* 7 */ p = emit(p, OP_REPORT, 0, 0, 0);
    /* 8 */ p = emit(p, OP_HALT, 0, 0, 0);
    VM vm;
    fake_clock_set(1000);
    fake_dist_set(400);
    vm_init(&vm);
    CHECK(vm_load(&vm, prog, (uint16_t)(p - prog)) == 1);
    vm.caixa[4] = 5;
    fake_trace_reset();
    vm_run(&vm);
    CHECK(vm.caixa[4] == 0);
    CHECK(vm.n_tarefas == 2);
    for (int k = 0; k < 100 && vm.rodando; k++) vm_tick(&vm);
    CHECK(contar("REPORT 7") == 1);
    CHECK(contar("REPORT 9") == 1);
}
```

E no `main`, depois de `teste_sem_halt_a_tarefa_invade_a_seguinte();`:

```c
    teste_duas_tarefas_mudando_a_mesma_caixa();
    teste_zerar_antes_do_cabecalho();
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `make -C tests vm_test tarefas_test`
Expected: erro de compilação — `OP_STORE_VAR` e `vm.caixa` não existem.

- [ ] **Step 4: `core/bytecode.h`**

Troque o fim do enum de opcodes:

```c
    /* Manda o aviso a = número. Toda tarefa que espera por ele recomeça do
       princípio. Não empilha nem desempilha nada: aviso não é valor. */
    OP_BROADCAST = 15,
    /* As caixas com nome. a = o lugar da caixa, de 0 a N_CAIXAS-1; o nome
       fica no navegador, e aqui só chega o número. */
    OP_PUSH_VAR  = 16,
    OP_STORE_VAR = 17,
    /* Desempilha n e soma n à caixa, dentro de uma instrução só. Não é uma
       conta a mais: é o que impede duas tarefas de lerem o mesmo valor antes
       de uma delas gravar, e a caixa perder uma das somas. */
    OP_CHANGE_VAR = 18,
    /* Zera todas as caixas. Só o programa do PLAY o emite, e sempre como a
       primeira instrução — antes do cabeçalho de tarefas, que o vm_run lê
       pulando-o. */
    OP_ZERAR_CAIXAS = 19
};
```

E depois de `#define N_TAREFAS        6`:

```c
/* Quantas caixas com nome o robô guarda. 64 bytes de RAM, que é mais caixa
   do que uma criança nomeia numa tela de tablet. */
#define N_CAIXAS         16
```

- [ ] **Step 5: `core/vm.h`**

Em `typedef struct { ... } VM;`, depois de `uint32_t semente;`:

```c
    /* As caixas moram na VM e não na tarefa: é o que as faz de todas as
       pilhas. E o vm_load não as toca, porque a execução viva carrega um
       programa novo a cada toque — só o vm_init e o OP_ZERAR_CAIXAS zeram. */
    int32_t  caixa[N_CAIXAS];
```

- [ ] **Step 6: `core/vm.c`**

Em `montar_tarefas`, troque `uint16_t pc = 0;` por:

```c
    /* O ZERAR do PLAY vem antes do cabeçalho; quem o executa é o vm_run. */
    uint16_t pc = 0;
    if (vm->n_instr > 0 && vm->prog[0].op == OP_ZERAR_CAIXAS) pc = 1;
```

Em `vm_run`, antes de `montar_tarefas(vm);`:

```c
    if (vm->n_instr > 0 && vm->prog[0].op == OP_ZERAR_CAIXAS)
        memset(vm->caixa, 0, sizeof(vm->caixa));
```

No `switch` do `vm_tick`, antes de `default:`:

```c
    case OP_PUSH_VAR:
        if (i->a < 0 || i->a >= N_CAIXAS) { vm_stop(vm); break; }
        empilhar(vm, t, vm->caixa[i->a]);
        t->pc++;
        break;
    case OP_STORE_VAR: {
        int32_t v = desempilhar(vm, t);
        if (!vm->rodando) break;
        if (i->a < 0 || i->a >= N_CAIXAS) { vm_stop(vm); break; }
        vm->caixa[i->a] = v;
        t->pc++;
        break;
    }
    case OP_CHANGE_VAR: {
        int32_t n = desempilhar(vm, t);
        if (!vm->rodando) break;
        if (i->a < 0 || i->a >= N_CAIXAS) { vm_stop(vm); break; }
        /* Pela soma sem sinal, que dá a volta sem ser comportamento
           indefinido. A volta para int32_t é definida pela implementação, e
           módulo 2^32 no GCC e no Clang, que são os compiladores do projeto. */
        vm->caixa[i->a] = (int32_t)((uint32_t)vm->caixa[i->a] + (uint32_t)n);
        t->pc++;
        break;
    }
    case OP_ZERAR_CAIXAS:
        memset(vm->caixa, 0, sizeof(vm->caixa));
        t->pc++;
        break;
```

- [ ] **Step 7: Rodar e ver passar**

Run: `make -C tests test`
Expected: `todos os testes passaram` em cada binário, inclusive `vm_test` e `tarefas_test`.

- [ ] **Step 8: Commit**

```bash
git add core/bytecode.h core/vm.h core/vm.c tests/vm_test.c tests/tarefas_test.c
git commit -m "Dá à VM dezesseis caixas que todas as pilhas veem"
git push origin master
```

---

### Task 2: O compilador conhece as caixas

**Files:**
- Modify: `web/compilador.js`
- Test: `tests/compilador.test.js`

**Interfaces:**
- Consumes: opcodes 16–19 da Task 1.
- Produces: nós `{op:'caixa', indice, nome, blockId}`, `{op:'guardar', indice, nome, valor, blockId}`, `{op:'mudar', indice, nome, valor, blockId}`; `compilar(ast, { zerarCaixas: true })`; `compilarTarefas(tarefas, { zerarCaixas: true })`; `OP.PUSH_VAR`, `OP.STORE_VAR`, `OP.CHANGE_VAR`, `OP.ZERAR_CAIXAS`; `N_CAIXAS` exportado.

- [ ] **Step 1: Escrever os testes que falham**

No topo de `tests/compilador.test.js`, troque o `require` por:

```js
const { compilar, compilarValor, compilarTarefas, OP, BIN, UN, MAX_INSTR,
        N_CAIXAS } = require('../web/compilador.js');
```

E no fim do arquivo:

```js
/* ---------- as caixas com nome ---------- */

test('ler uma caixa empilha o que ela guarda', () => {
  const { bytes } = compilarValor({ op: 'caixa', indice: 3, nome: 'voltas' });
  assert.deepStrictEqual(instrucoes(bytes), [
    [OP.PUSH_VAR, 3, 0, 0],
    [OP.REPORT, 0, 0, 0],
    [OP.HALT, 0, 0, 0],
  ]);
});

test('guardar calcula o valor e grava na caixa', () => {
  const { bytes } = compilar([{ op: 'guardar', indice: 2, nome: 'x', valor: 7 }]);
  assert.deepStrictEqual(instrucoes(bytes), [
    [OP.PUSH, 7, 0, 0],
    [OP.STORE_VAR, 2, 0, 0],
    [OP.HALT, 0, 0, 0],
  ]);
});

test('mudar soma numa instrução só, e não em quatro', () => {
  const { bytes } = compilar([{ op: 'mudar', indice: 0, nome: 'x',
                                valor: { op: 'mais', a: 1, b: 2 } }]);
  assert.deepStrictEqual(instrucoes(bytes), [
    [OP.PUSH, 1, 0, 0],
    [OP.PUSH, 2, 0, 0],
    [OP.BIN, BIN.MAIS, 0, 0],
    [OP.CHANGE_VAR, 0, 0, 0],
    [OP.HALT, 0, 0, 0],
  ]);
});

test('caixa sem lugar vira erro no bloco dela', () => {
  for (const indice of [N_CAIXAS, -1, 1.5, undefined]) {
    assert.throws(
      () => compilar([{ op: 'guardar', indice, nome: 'x', valor: 1, blockId: 'g' }]),
      (e) => e.blockId === 'g');
  }
});

test('sem zerarCaixas o bytecode é o de sempre', () => {
  const ast = [{ op: 'frente', segundos: 1, blockId: 'b' }];
  assert.deepStrictEqual(Buffer.from(compilar(ast).bytes),
                         Buffer.from(compilar(ast, { zerarCaixas: false }).bytes));
  assert.notStrictEqual(compilar(ast).bytes[0], OP.ZERAR_CAIXAS);
});

test('zerarCaixas põe o ZERAR na frente, e o salto do repetir anda junto', () => {
  const { bytes, pcMap } = compilar(
    [{ op: 'repetir', vezes: 2, blockId: 'r',
       corpo: [{ op: 'esperar', segundos: 1, blockId: 'e' }] }],
    { zerarCaixas: true });
  assert.deepStrictEqual(instrucoes(bytes), [
    [OP.ZERAR_CAIXAS, 0, 0, 0],
    [OP.PUSH, 2, 0, 0],
    [OP.SET_REG, 0, 0, 0],
    [OP.PUSH, 1000, 0, 0],
    [OP.WAIT, 0, 0, 0],
    [OP.DEC_JNZ, 0, 3, 0],
    [OP.HALT, 0, 0, 0],
  ]);
  assert.strictEqual(pcMap[0], null);
});

test('zerarCaixas sai mesmo sem caixa nenhuma na árvore', () => {
  const { bytes } = compilar([{ op: 'parar' }], { zerarCaixas: true });
  assert.strictEqual(bytes[0], OP.ZERAR_CAIXAS);
});

test('com tarefas, o ZERAR vem antes do cabeçalho e os inícios somam 1', () => {
  const { bytes } = compilarTarefas([
    { quando: 'play', corpo: [{ op: 'avisar', aviso: 1 }] },
    { quando: 'aviso', aviso: 1,
      corpo: [{ op: 'guardar', indice: 0, nome: 'x', valor: 5 }] },
  ], { zerarCaixas: true });
  assert.deepStrictEqual(instrucoes(bytes), [
    [OP.ZERAR_CAIXAS, 0, 0, 0],
    [OP.TASK, 0, 3, 0],
    [OP.TASK, 1, 5, 1],
    [OP.BROADCAST, 1, 0, 0],
    [OP.HALT, 0, 0, 0],
    [OP.PUSH, 5, 0, 0],
    [OP.STORE_VAR, 0, 0, 0],
    [OP.HALT, 0, 0, 0],
  ]);
});

test('com ZERAR, o «quando» lendo uma caixa salta para o lugar certo', () => {
  const { bytes } = compilarTarefas([
    { quando: 'condicao',
      cond: { op: 'maior', a: { op: 'caixa', indice: 0, nome: 'x' }, b: 3 },
      corpo: [{ op: 'parar' }] },
  ], { zerarCaixas: true });
  assert.deepStrictEqual(instrucoes(bytes), [
    [OP.ZERAR_CAIXAS, 0, 0, 0],
    [OP.TASK, 0, 2, 0],
    [OP.PUSH_VAR, 0, 0, 0],
    [OP.PUSH, 3, 0, 0],
    [OP.BIN, BIN.MAIOR, 0, 0],
    [OP.JMP_FALSE, 2, 0, 0],
    [OP.HALT, 0, 0, 0],
    [OP.JMP, 2, 0, 0],
  ]);
});

/* Uma conta com k «mais» encaixados à direita pede k + 1 lugares na pilha. */
function funda(k) {
  let v = 1;
  for (let i = 0; i < k; i++) v = { op: 'mais', a: 1, b: v, blockId: 'c' };
  return v;
}

test('mudar aceita a conta mais funda que cabe, e recusa a seguinte', () => {
  assert.doesNotThrow(() => compilar(
    [{ op: 'mudar', indice: 0, nome: 'x', valor: funda(14), blockId: 'm' }]));
  assert.throws(() => compilar(
    [{ op: 'mudar', indice: 0, nome: 'x', valor: funda(15), blockId: 'm' }]),
    (e) => e.blockId === 'c');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/compilador.test.js`
Expected: FAIL — `Bloco desconhecido: guardar`, `OP.PUSH_VAR` indefinido.

- [ ] **Step 3: Implementar em `web/compilador.js`**

O mapa de opcodes:

```js
  var OP = {
    HALT: 0, MOTOR: 1, WAIT: 2, TURN: 3,
    SET_REG: 4, DEC_JNZ: 5, JMP: 6,
    PUSH: 8, SENSOR: 9, BIN: 10, UN: 11, JMP_FALSE: 12, REPORT: 13,
    TASK: 14, BROADCAST: 15,
    PUSH_VAR: 16, STORE_VAR: 17, CHANGE_VAR: 18, ZERAR_CAIXAS: 19,
  };
```

Depois de `var N_TAREFAS = 6;`:

```js
  /* Quantas caixas a VM guarda. Também de bytecode.h. */
  var N_CAIXAS = 16;
```

Dentro de `compilarPedaco`, depois de `function emitir(...) {...}`:

```js
    /* O lugar vem pronto do navegador (web/caixas.js). Chegar aqui sem um é
       bloco de caixa que não coube — e um índice inventado gravaria na caixa
       de outra criança da mesma tela. */
    function lugarDe(no) {
      var n = no.indice;
      if (typeof n !== 'number' || Math.floor(n) !== n || n < 0 || n >= N_CAIXAS) {
        throw erroNoBloco('Essa caixa não coube no robô. Apague uma caixa ' +
                          'e crie esta de novo.', no.blockId);
      }
      return n;
    }
```

Em `profundidadeDe`, depois de `if (v.op === 'distancia') return 1;`:

```js
      if (v.op === 'caixa') return 1;
```

Em `gerarValorInterno`, depois do bloco `if (v.op === 'distancia') {...}`:

```js
      if (v.op === 'caixa') {
        emitir(OP.PUSH_VAR, lugarDe(v), 0, 0, id);
        return;
      }
```

No `switch` de `gerar`, antes de `case 'repetir_sempre':`:

```js
          case 'guardar':
            gerarValor(no.valor, no.blockId);
            emitir(OP.STORE_VAR, lugarDe(no), 0, 0, no.blockId);
            break;

          /* Sem empilhar a caixa antes: quem lê o valor dela é o CHANGE_VAR,
             por dentro. Por isso a profundidade é só a do valor. */
          case 'mudar':
            gerarValor(no.valor, no.blockId);
            emitir(OP.CHANGE_VAR, lugarDe(no), 0, 0, no.blockId);
            break;
```

Logo antes de `if (opcoes && opcoes.reportar !== undefined) {`:

```js
    /* Primeira instrução, antes de qualquer outra, para o vm_run achá-la em
       prog[0]. Quem decide pedir é o app.js; aqui só se obedece. */
    if (opcoes && opcoes.zerarCaixas) emitir(OP.ZERAR_CAIXAS, 0, 0, 0, null);
```

Em `compilarTarefas`, troque a assinatura e o começo:

```js
  function compilarTarefas(tarefas, opcoes) {
    var zerar = !!(opcoes && opcoes.zerarCaixas);
    if (!tarefas.length) return compilar([], opcoes);
```

Troque `var instrucoes = [];` e `var mapa = [];` e `var base = tarefas.length;` por:

```js
    var instrucoes = [];
    var mapa = [];
    if (zerar) {
      instrucoes.push({ op: OP.ZERAR_CAIXAS, a: 0, b: 0, c: 0, blockId: null });
      mapa.push(null);
    }
    /* O cabeçalho ocupa uma instrução por tarefa, e o corpo da primeira começa
       logo depois dele — e depois do ZERAR, quando há um. */
    var base = (zerar ? 1 : 0) + tarefas.length;
```

(O comentário antigo "O cabeçalho ocupa uma instrução por tarefa…" sai, substituído pelo de cima.)

No `api`:

```js
  var api = { compilar: compilar, compilarValor: compilarValor,
              compilarTarefas: compilarTarefas,
              OP: OP, BIN: BIN, UN: UN, TAREFA: TAREFA,
              MAX_INSTR: MAX_INSTR, N_TAREFAS: N_TAREFAS, N_CAIXAS: N_CAIXAS };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/compilador.test.js tests/es5.test.js`
Expected: PASS, todos.

- [ ] **Step 5: Commit**

```bash
git add web/compilador.js tests/compilador.test.js
git commit -m "O compilador guarda, soma e lê caixas, e zera quando o PLAY pede"
git push origin master
```

---

### Task 3: Uma pilha conta, outra lê, no robô virtual

**Files:**
- Test: `tests/tarefas_ponta_a_ponta.test.js`

**Interfaces:**
- Consumes: `compilarTarefas(tarefas, { zerarCaixas: true })`, `compilarValor({op:'caixa', ...})` da Task 2; VM da Task 1.

- [ ] **Step 1: Escrever o teste**

No topo, troque o `require` do compilador:

```js
const { compilar, compilarTarefas, compilarValor } = require('../web/compilador.js');
```

No fim do arquivo:

```js
/* Carrega e roda um programa, e depois — no mesmo robô, sem reiniciar o
   processo — um segundo. É a execução viva: a caixa tem que atravessar a
   troca de programa. */
function rodarDois(primeiro, segundo, msPrimeiro, msSegundo) {
  return new Promise((resolve, reject) => {
    const robo = spawn(ROBO, [], { cwd: path.join(RAIZ, 'host') });
    let saida = '';
    robo.stdout.on('data', (d) => { saida += d.toString(); });
    robo.on('error', reject);
    robo.stdin.write('L ' + hex(primeiro) + '\nR\n');
    setTimeout(() => {
      robo.stdin.write('L ' + hex(segundo) + '\nR\n');
      setTimeout(() => {
        robo.kill();
        resolve(saida.split('\n').filter((l) => l.length));
      }, msSegundo);
    }, msPrimeiro);
  });
}

test('uma pilha conta na caixa, outra lê e responde', { timeout: 20000 }, async () => {
  const conta = compilarTarefas([
    { quando: 'play', corpo: [
      { op: 'repetir', vezes: 5, corpo: [
        { op: 'mudar', indice: 0, nome: 'voltas', valor: 1 },
        { op: 'esperar', segundos: 0.05 } ] } ] },
    { quando: 'condicao',
      cond: { op: 'igual', a: { op: 'caixa', indice: 0, nome: 'voltas' }, b: 5 },
      corpo: [{ op: 'guardar', indice: 1, nome: 'pronto', valor: 42 }] },
  ], { zerarCaixas: true });
  const pergunta = compilarValor({ op: 'caixa', indice: 1, nome: 'pronto' });
  const linhas = await rodarDois(conta.bytes, pergunta.bytes, 1500, 800);
  assert.ok(linhas.includes('V 42'),
    'a pilha do «quando» devia ter visto a conta da outra; o robô disse:\n' +
    linhas.filter((l) => l[0] !== 'T').join('\n'));
});
```

- [ ] **Step 2: Rodar**

Run: `make all && node --test tests/tarefas_ponta_a_ponta.test.js`
Expected: PASS. Se falhar com a linha `V 0` ou sem `V`, o defeito está no par compilador↔VM (número de opcode, ou o `ZERAR` sendo lido como cabeçalho) — a Task 1 e a 2 passaram sozinhas, e é exatamente isso que este teste existe para pegar.

- [ ] **Step 3: Commit**

```bash
git add tests/tarefas_ponta_a_ponta.test.js
git commit -m "Prova no robô virtual que duas pilhas dividem a mesma caixa"
git push origin master
```

---

### Task 4: O mapa de lugares — `web/caixas.js`

**Files:**
- Create: `web/caixas.js`
- Test: `tests/caixas.test.js`
- Modify: `tests/es5.test.js`

**Interfaces:**
- Produces (global `Caixas` no navegador, `module.exports` no Node):
  - `Caixas.N_CAIXAS` → `16`
  - `Caixas.importar(dados) → Mapa` — `dados` pode ser qualquer coisa; nunca lança.
  - `mapa.criada(id: string) → number | null` — idempotente.
  - `mapa.apagada(id: string) → void`
  - `mapa.lugarDe(id: string) → number | null`
  - `mapa.temLugar() → boolean`
  - `mapa.temSujo() → boolean`
  - `mapa.zerou() → void`
  - `mapa.reconciliar(ids: string[]) → void` — id do mapa fora de `ids` vira apagado; id de `ids` sem lugar vira criado.
  - `mapa.exportar() → { lugar: {id: n}, antigo: {id: n}, sujo: number[] }`

- [ ] **Step 1: Escrever os testes que falham**

Crie `tests/caixas.test.js`:

```js
'use strict';
/* O lugar de cada caixa na VM. Tudo aqui é regra de endereço, e endereço
   errado não dá erro: dá uma caixa mostrando o número de outra. */

const test = require('node:test');
const assert = require('node:assert');
const Caixas = require('../web/caixas.js');

function vazio() { return Caixas.importar(null); }

test('criar dá o menor lugar livre, e criar de novo o mesmo id não gasta outro', () => {
  const m = vazio();
  assert.strictEqual(m.criada('a'), 0);
  assert.strictEqual(m.criada('b'), 1);
  assert.strictEqual(m.criada('a'), 0);
  assert.strictEqual(m.lugarDe('b'), 1);
  assert.strictEqual(m.lugarDe('nada'), null);
});

test('apagar libera o lugar para a próxima', () => {
  const m = vazio();
  m.criada('a'); m.criada('b');
  m.apagada('a');
  assert.strictEqual(m.lugarDe('a'), null);
  assert.strictEqual(m.criada('c'), 0);
});

test('apagar e desfazer volta ao mesmo lugar', () => {
  const m = vazio();
  m.criada('a'); m.criada('b'); m.criada('c');
  m.apagada('b');
  assert.strictEqual(m.criada('b'), 1);
});

test('desfazer depois que outra caixa tomou o lugar cai no menor livre', () => {
  const m = vazio();
  m.criada('a'); m.criada('b');
  m.apagada('a');
  m.criada('c');             /* toma o 0 */
  assert.strictEqual(m.criada('a'), 2);
});

test('a 17ª caixa não nasce', () => {
  const m = vazio();
  for (let i = 0; i < Caixas.N_CAIXAS; i++) assert.strictEqual(m.criada('c' + i), i);
  assert.strictEqual(m.temLugar(), false);
  assert.strictEqual(m.criada('mais uma'), null);
  m.apagada('c5');
  assert.strictEqual(m.temLugar(), true);
});

test('um mapa novo não tem nada sujo', () => {
  assert.strictEqual(vazio().temSujo(), false);
});

test('lugar apagado continua sujo, e só o ZERAR o limpa', () => {
  const m = vazio();
  m.criada('x');
  assert.strictEqual(m.temSujo(), true);
  m.apagada('x');
  assert.strictEqual(m.temSujo(), true, 'a VM ainda pode ter o número de x');
  m.zerou();
  assert.strictEqual(m.temSujo(), false);
});

test('depois do ZERAR, quem ainda existe continua sujo', () => {
  const m = vazio();
  m.criada('x'); m.criada('y');
  m.apagada('x');
  m.zerou();
  assert.strictEqual(m.temSujo(), true);
  assert.deepStrictEqual(m.exportar().sujo, [1]);
});

test('o mapa volta igual depois de exportado e importado', () => {
  const m = vazio();
  m.criada('a'); m.criada('b'); m.criada('c');
  m.apagada('b');
  const volta = Caixas.importar(JSON.parse(JSON.stringify(m.exportar())));
  assert.deepStrictEqual(volta.exportar(), m.exportar());
  assert.strictEqual(volta.criada('b'), 1, 'a lembrança de onde b estava foi junto');
});

test('estado corrompido não quebra, e o que é ruim sai entrada por entrada', () => {
  for (const lixo of [undefined, null, 7, 'texto', [], true]) {
    const m = Caixas.importar(lixo);
    assert.strictEqual(m.temSujo(), false);
    assert.strictEqual(m.criada('a'), 0);
  }
  const m = Caixas.importar({
    lugar: { ok: 2, grande: 16, negativo: -1, quebrado: 1.5, texto: '3',
             repetido: 2, '': 4, outro: 5 },
    antigo: { velho: 99, bom: 7 },
    sujo: [2, 5, 40, 'x', -3, 7],
  });
  assert.deepStrictEqual(m.exportar().lugar, { ok: 2, outro: 5 });
  assert.deepStrictEqual(m.exportar().antigo, { bom: 7 });
  assert.deepStrictEqual(m.exportar().sujo, [2, 5, 7]);
  const soArray = Caixas.importar({ lugar: [1, 2, 3] });
  assert.deepStrictEqual(soArray.exportar().lugar, {});
});

test('lugar ocupado é sempre sujo, mesmo que o gravado diga que não', () => {
  const m = Caixas.importar({ lugar: { a: 3 }, sujo: [] });
  assert.deepStrictEqual(m.exportar().sujo, [3]);
});

/* O workspace.clear() do Blockly esvazia as variáveis sem disparar VAR_DELETE.
   Quem mantém o mapa em dia é o reconciliar, e não os eventos. */

test('reconciliar tira do mapa quem não existe mais, e o lugar fica sujo', () => {
  const m = vazio();
  m.criada('a'); m.criada('b');
  m.zerou();
  m.reconciliar(['b']);
  assert.strictEqual(m.lugarDe('a'), null);
  assert.strictEqual(m.lugarDe('b'), 1);
  assert.deepStrictEqual(m.exportar().sujo, [0, 1]);
  assert.strictEqual(m.criada('c'), 0);
});

test('reconciliar dá lugar a quem está na tela e não no mapa', () => {
  const m = vazio();
  m.reconciliar(['x', 'y']);
  assert.strictEqual(m.lugarDe('x'), 0);
  assert.strictEqual(m.lugarDe('y'), 1);
});

test('trocar de tela sem evento nenhum não deixa fantasma segurando lugar', () => {
  const m = vazio();
  for (let volta = 0; volta < 5; volta++) {
    const ids = [];
    for (let i = 0; i < 10; i++) ids.push('v' + volta + '_' + i);
    m.reconciliar(ids);
    assert.deepStrictEqual(ids.map((id) => m.lugarDe(id)),
                           [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'volta ' + volta);
    m.reconciliar([]);        /* o clear() do Blockly */
  }
  assert.strictEqual(m.temLugar(), true);
  assert.ok(Object.keys(m.exportar().antigo).length <= Caixas.N_CAIXAS,
    'a lembrança não pode crescer a cada troca de tela');
});

test('estado gravado com 16 fantasmas não impede a caixa de verdade', () => {
  const lugar = {};
  for (let i = 0; i < 16; i++) lugar['fantasma' + i] = i;
  const m = Caixas.importar({ lugar });
  m.reconciliar(['real']);
  assert.strictEqual(m.lugarDe('real'), 0);
  assert.strictEqual(m.temSujo(), true, 'os fantasmas podiam ter número na VM');
});

test('quando uma caixa toma um lugar, a lembrança antiga dele some', () => {
  const m = vazio();
  m.criada('a');
  m.apagada('a');
  m.criada('b');
  assert.deepStrictEqual(m.exportar().antigo, {});
  const lido = Caixas.importar({ lugar: { b: 0 }, antigo: { a: 0, c: 4 } });
  assert.deepStrictEqual(lido.exportar().antigo, { c: 4 });
});
```

Em `tests/es5.test.js`, acrescente ao fim da lista `PROIBIDO`, depois da entrada de `.repeat`:

```js
  { nome: 'String.prototype.normalize', re: /\.normalize\s*\(/,
    porque: 'não existe no Safari do iOS 9; tire acento por tabela (ver arduino.js)' },
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/caixas.test.js`
Expected: FAIL — `Cannot find module '../web/caixas.js'`.

- [ ] **Step 3: Criar `web/caixas.js`**

```js
/* Onde cada caixa da criança mora na VM.

   A VM guarda 16 números e não sabe nome nenhum; o Blockly sabe os nomes e não
   sabe de VM. Este arquivo é o endereço entre os dois: o id da variável do
   Blockly vira um lugar de 0 a 15, e o lugar não muda enquanto a caixa
   existir — nem quando outra é apagada, nem quando ela é renomeada.

   Contar pela posição na lista de variáveis foi o primeiro desenho, e errava
   de dois jeitos: apagar uma caixa deslocava as de depois (e «pontos» passava
   a mostrar o número de «voltas»), e o limite de 16 contava caixa que nem
   estava em uso.

   "Sujo" é o lugar que pode ter número na VM: toda caixa que existe, e toda
   que existiu desde o último ZERAR. É o que diz ao app.js se o PLAY precisa
   zerar — olhar só as caixas da tela esqueceria a que foi apagada com número
   dentro.

   Sem Blockly e sem DOM, como o guardar.js e o compilador.js: assim dá para
   provar em Node, em milissegundos, que o endereço não troca. */
(function (raiz) {
  'use strict';

  /* Precisa bater com N_CAIXAS em core/bytecode.h e em web/compilador.js. */
  var N_CAIXAS = 16;

  function lugarValido(n) {
    return typeof n === 'number' && Math.floor(n) === n && n >= 0 && n < N_CAIXAS;
  }

  function temDono(obj, chave) {
    return Object.prototype.hasOwnProperty.call(obj, chave);
  }

  function Mapa() {
    this.lugar = {};
    /* Onde cada caixa apagada estava. É o que faz desfazer funcionar: o
       Blockly recria a variável com o mesmo id, e ela volta para casa. */
    this.antigo = {};
    this.sujo = [];
    for (var k = 0; k < N_CAIXAS; k++) this.sujo.push(false);
  }

  Mapa.prototype.lugarDe = function (id) {
    return temDono(this.lugar, id) ? this.lugar[id] : null;
  };

  Mapa.prototype.ocupado = function (n) {
    for (var id in this.lugar) {
      if (temDono(this.lugar, id) && this.lugar[id] === n) return true;
    }
    return false;
  };

  Mapa.prototype.temLugar = function () {
    for (var k = 0; k < N_CAIXAS; k++) if (!this.ocupado(k)) return true;
    return false;
  };

  /* Idempotente: o app.js chama isto no VAR_CREATE e de novo ao restaurar, e
     as duas chamadas têm que dar o mesmo lugar. */
  Mapa.prototype.criada = function (id) {
    var ja = this.lugarDe(id);
    if (ja !== null) return ja;
    var n = null;
    if (temDono(this.antigo, id) && !this.ocupado(this.antigo[id])) n = this.antigo[id];
    for (var k = 0; n === null && k < N_CAIXAS; k++) {
      if (!this.ocupado(k)) n = k;
    }
    if (n === null) return null;
    this.lugar[id] = n;
    delete this.antigo[id];
    /* Quem lembrava deste lugar perde a lembrança: desfazer depois disso cai
       no menor livre, que é a regra de sempre, e a lista nunca passa de
       N_CAIXAS entradas — senão cresceria no localStorage a cada troca de
       nível. */
    for (var velho in this.antigo) {
      if (temDono(this.antigo, velho) && this.antigo[velho] === n) delete this.antigo[velho];
    }
    this.sujo[n] = true;
    return n;
  };

  /* Acerta o mapa com as variáveis que existem na tela, nos dois sentidos.

     Existe porque os eventos não bastam: o workspace.clear() do Blockly — que o
     Blocos.limpar usa ao trocar de nível, e que o load usa ao restaurar e ao
     abrir o gabarito — esvazia as variáveis sem disparar VAR_DELETE. Contando
     só com eventos, as caixas da tela apagada segurariam lugar para sempre.

     Primeiro solta quem sumiu, depois dá lugar a quem chegou: assim quem
     chegou pode usar o lugar que acabou de ser solto. */
  Mapa.prototype.reconciliar = function (ids) {
    var existe = {}, sumiram = [], id, k;
    for (k = 0; k < ids.length; k++) existe[' ' + ids[k]] = true;
    for (id in this.lugar) {
      if (temDono(this.lugar, id) && !existe[' ' + id]) sumiram.push(id);
    }
    for (k = 0; k < sumiram.length; k++) this.apagada(sumiram[k]);
    for (k = 0; k < ids.length; k++) this.criada(ids[k]);
  };

  /* O lugar fica livre, mas sujo: o número que a caixa tinha continua na VM
     até um programa com ZERAR chegar lá. */
  Mapa.prototype.apagada = function (id) {
    var n = this.lugarDe(id);
    if (n === null) return;
    delete this.lugar[id];
    this.antigo[id] = n;
  };

  Mapa.prototype.temSujo = function () {
    for (var k = 0; k < N_CAIXAS; k++) if (this.sujo[k]) return true;
    return false;
  };

  /* Chamado depois de mandar um programa com ZERAR. A caixa que existe
     continua suja: o próprio programa pode escrever nela. */
  Mapa.prototype.zerou = function () {
    for (var k = 0; k < N_CAIXAS; k++) this.sujo[k] = this.ocupado(k);
  };

  Mapa.prototype.exportar = function () {
    var lugar = {}, antigo = {}, sujo = [], id, k;
    for (id in this.lugar) if (temDono(this.lugar, id)) lugar[id] = this.lugar[id];
    for (id in this.antigo) if (temDono(this.antigo, id)) antigo[id] = this.antigo[id];
    for (k = 0; k < N_CAIXAS; k++) if (this.sujo[k]) sujo.push(k);
    return { lugar: lugar, antigo: antigo, sujo: sujo };
  };

  function ehObjeto(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  /* Lê o que veio do localStorage. Qualquer entrada ruim sai sozinha, e
     nunca lança: um mapa quebrado que derrubasse a página tiraria da criança
     o programa inteiro por causa de uma caixa. */
  function importar(dados) {
    var m = new Mapa();
    if (!ehObjeto(dados)) return m;
    var usados = {}, id, n, k;

    if (ehObjeto(dados.lugar)) {
      for (id in dados.lugar) {
        if (!temDono(dados.lugar, id) || id === '') continue;
        n = dados.lugar[id];
        /* Dois ids no mesmo lugar: fica o primeiro. */
        if (!lugarValido(n) || usados[n]) continue;
        usados[n] = true;
        m.lugar[id] = n;
      }
    }

    if (ehObjeto(dados.antigo)) {
      for (id in dados.antigo) {
        if (!temDono(dados.antigo, id) || id === '' || temDono(m.lugar, id)) continue;
        /* Lembrança de um lugar que já tem dono não serve mais para nada. */
        n = dados.antigo[id];
        if (lugarValido(n) && !usados[n]) m.antigo[id] = n;
      }
    }

    if (Array.isArray(dados.sujo)) {
      for (k = 0; k < dados.sujo.length; k++) {
        if (lugarValido(dados.sujo[k])) m.sujo[dados.sujo[k]] = true;
      }
    }
    for (id in m.lugar) if (temDono(m.lugar, id)) m.sujo[m.lugar[id]] = true;

    return m;
  }

  var api = { importar: importar, N_CAIXAS: N_CAIXAS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Caixas = api;
})(typeof self !== 'undefined' ? self : globalThis);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/caixas.test.js tests/es5.test.js`
Expected: PASS, todos. Se o `es5.test.js` acusar "propriedade abreviada" ou "método abreviado" no `caixas.js`, é falso positivo das regexes — reescreva a linha acusada sem mudar o comportamento, não afrouxe a regra.

- [ ] **Step 5: Commit**

```bash
git add web/caixas.js tests/caixas.test.js tests/es5.test.js
git commit -m "Cada caixa ganha um lugar fixo na VM, e o mapa lembra o que está sujo"
git push origin master
```

---

### Task 5: O mapa vai junto com o programa — `web/guardar.js`

**Files:**
- Modify: `web/guardar.js`
- Test: `tests/guardar.test.js`

**Interfaces:**
- Produces: `Guardar.gravar(estado, nivel, caixas)` — `caixas` opcional, é o `mapa.exportar()`; `Guardar.lerCaixas(nivel) → object | null`. `Guardar.ler(nivel)` não muda.

- [ ] **Step 1: Escrever os testes que falham**

No fim de `tests/guardar.test.js` (o arquivo já define `armazenamento()` e `com(caixa, corpo)`, que liga o `localStorage` falso e o desliga no fim):

```js
test('o mapa de caixas vai e volta junto com os blocos', () => {
  const caixa = armazenamento();
  com(caixa, () => {
    const mapa = { lugar: { v1: 0 }, antigo: {}, sujo: [0] };
    assert.strictEqual(Guardar.gravar(PROGRAMA, 'gigante', mapa), true);
    assert.deepStrictEqual(Guardar.lerCaixas('gigante'), mapa);
    assert.deepStrictEqual(Guardar.ler('gigante'), PROGRAMA);
  });
});

test('programa gravado antes das caixas lê sem mapa', () => {
  const caixa = armazenamento();
  com(caixa, () => {
    caixa.plantar(Guardar.CHAVE, JSON.stringify({ nivel: 'gigante', blocos: PROGRAMA }));
    assert.strictEqual(Guardar.lerCaixas('gigante'), null);
    assert.deepStrictEqual(Guardar.ler('gigante'), PROGRAMA);
  });
});

test('mapa de outro nível não volta', () => {
  const caixa = armazenamento();
  com(caixa, () => {
    Guardar.gravar(PROGRAMA, 'grande', { lugar: {}, antigo: {}, sujo: [] });
    assert.strictEqual(Guardar.lerCaixas('gigante'), null);
  });
});

test('sem armazenamento, lerCaixas devolve null sem lançar', () => {
  com(null, () => {
    assert.strictEqual(Guardar.lerCaixas('gigante'), null);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/guardar.test.js`
Expected: FAIL — `Guardar.lerCaixas is not a function`.

- [ ] **Step 3: Implementar em `web/guardar.js`**

Troque `gravar` por:

```js
  /* O mapa das caixas (web/caixas.js) vai na mesma chave, e não numa própria:
     gravados juntos, não há como voltar um programa com o mapa de outro — e um
     mapa trocado faz uma caixa mostrar o número de outra. */
  function gravar(estado, nivel, caixas) {
    var c = caixa();
    if (!c) return false;
    var dados = { nivel: nivel, blocos: estado };
    if (caixas) dados.caixas = caixas;
    try {
      c.setItem(CHAVE, JSON.stringify(dados));
      return true;
    } catch (e) {
      /* Navegação privada do Safari lança ao gravar; cota cheia também. Perder
         o backup é ruim, derrubar a página no meio da brincadeira é pior. */
      return false;
    }
  }
```

Troque `ler` pela dupla abaixo (o corpo de leitura sai para `lerTudo`, e `ler` fica com o comportamento de antes):

```js
  function lerTudo(nivel) {
    var c = caixa();
    if (!c) return null;
    var cru;
    try {
      cru = c.getItem(CHAVE);
    } catch (e) {
      return null;
    }
    if (!cru) return null;
    var dados;
    try {
      dados = JSON.parse(cru);
    } catch (e) {
      /* Meia gravação, ou lixo de uma versão antiga do formato. */
      return null;
    }
    if (!dados || typeof dados !== 'object') return null;
    if (dados.nivel !== nivel) return null;
    if (!dados.blocos || typeof dados.blocos !== 'object') return null;
    return dados;
  }

  /* Devolve o programa guardado, ou null — e null é resposta legítima em quatro
     casos: nunca houve nada, o armazenamento não existe, o que estava lá é
     ilegível, ou era de outro nível. Quem chama não precisa distinguir: em
     todos, a tela começa como sempre começou. */
  function ler(nivel) {
    var dados = lerTudo(nivel);
    return dados ? dados.blocos : null;
  }

  /* O mapa cru, sem conferir: quem confere entrada por entrada é o
     Caixas.importar, que é quem sabe o que é um lugar válido. */
  function lerCaixas(nivel) {
    var dados = lerTudo(nivel);
    return (dados && dados.caixas !== undefined) ? dados.caixas : null;
  }
```

E o `api`:

```js
  var api = { gravar: gravar, ler: ler, lerCaixas: lerCaixas,
              esquecer: esquecer, CHAVE: CHAVE };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/guardar.test.js tests/es5.test.js`
Expected: PASS, todos — inclusive os testes antigos do `ler`.

- [ ] **Step 5: Commit**

```bash
git add web/guardar.js tests/guardar.test.js
git commit -m "O mapa das caixas é gravado na mesma chave do programa"
git push origin master
```

---

### Task 6: O `.ino` arredonda como a VM

**Files:**
- Modify: `web/arduino.js:59-62`
- Test: `tests/arduino.test.js`

**Interfaces:**
- Produces: `valor(v)` escreve `String(Math.round(v))` para número solto. Nenhuma assinatura muda.

- [ ] **Step 1: Escrever os testes que falham**

No fim de `tests/arduino.test.js` (o arquivo já tem o ajudante `programa(ast)` que devolve só as linhas do corpo de `programa()` — use-o como os testes vizinhos):

```js
/* ---------- números arredondados como na VM ---------- */

test('número decimal dentro de uma conta sai arredondado, como no bytecode', () => {
  const texto = gerar([{ op: 'frente', segundos: { op: 'mais', a: 1.5, b: 1 },
                         velocidade: 200 }]);
  assert.ok(texto.includes('andarFrente(2 + 1, 200);'),
    'a VM anda 3 s; o .ino tem que andar 3 s também:\n' + texto);
});

test('arredonda negativo pelo Math.round, que é o do compilador', () => {
  const texto = gerar([{ op: 'se', cond: { op: 'maior', a: -1.6, b: -1.5 },
                         corpo: [{ op: 'parar' }] }]);
  assert.ok(texto.includes('if (-2 > -1) {'), texto);
});

test('número sozinho no campo de segundos continua com uma casa', () => {
  assert.ok(gerar([{ op: 'esperar', segundos: 0.5 }]).includes('esperar(0.5);'));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/arduino.test.js`
Expected: FAIL — o texto tem `1.5 + 1` e `-1.6 > -1.5`.

- [ ] **Step 3: Implementar**

Em `web/arduino.js`, na função `valor`, troque `if (typeof v === 'number') return String(v);` por:

```js
    /* Arredondado como o compilador arredonda cada PUSH: a VM só conhece
       inteiros, e um .ino que faz conta com 1.5 anda diferente do robô. O
       Math.round e não o round do C++, porque os dois discordam nos
       negativos (-1.5 dá -1 aqui e -2 lá), e quem manda é a VM. O número
       sozinho num campo de segundos não passa por aqui: vai pelo seg(),
       porque ali a VM multiplica por 1000 antes de arredondar. */
    if (typeof v === 'number') return String(Math.round(v));
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/arduino.test.js tests/es5.test.js`
Expected: PASS, todos. Os testes antigos com `0.5` e `2.5` são de segundos puros e continuam iguais.

- [ ] **Step 5: Commit**

```bash
git add web/arduino.js tests/arduino.test.js
git commit -m "O .ino arredonda os números das contas como o robô arredonda"
git push origin master
```

---

### Task 7: As caixas no `.ino`

**Files:**
- Modify: `web/arduino.js`
- Modify: `tests/fake_arduino.h`
- Test: `tests/arduino.test.js`

**Interfaces:**
- Consumes: nós `caixa`, `guardar`, `mudar` com `nome` (Task 2).
- Produces: `Arduino.limparNome(nome: string) → string` (exportado para teste).

- [ ] **Step 1: Escrever os testes que falham**

No fim de `tests/arduino.test.js`:

```js
/* ---------- as caixas ---------- */

const { limparNome } = require('../web/arduino.js');

test('o nome da caixa vira identificador com prefixo', () => {
  assert.strictEqual(limparNome('voltas'), 'caixa_voltas');
  assert.strictEqual(limparNome('número de voltas'), 'caixa_numero_de_voltas');
  assert.strictEqual(limparNome('Ação!'), 'caixa_Acao');
  assert.strictEqual(limparNome('3voltas'), 'caixa_3voltas');
  assert.strictEqual(limparNome('__x'), 'caixa_x');
  assert.strictEqual(limparNome('_Nome'), 'caixa_Nome');
  assert.strictEqual(limparNome('a  --  b'), 'caixa_a_b');
  assert.strictEqual(limparNome('???'), 'caixa_caixa');
  assert.strictEqual(limparNome('PWMA'), 'caixa_PWMA');
});

test('a caixa é int32_t, declarada antes da primeira função', () => {
  const texto = gerar([{ op: 'guardar', indice: 0, nome: 'voltas', valor: 3 }]);
  const decl = texto.indexOf('int32_t caixa_voltas = 0;');
  assert.ok(decl >= 0, texto);
  assert.ok(decl < texto.indexOf('void fiacao()'));
  assert.ok(decl < texto.indexOf('void programa()'));
  assert.ok(texto.includes('  caixa_voltas = 3;'));
});

test('mudar passa pela somar, e a somar só existe quando há mudar', () => {
  const com = gerar([{ op: 'mudar', indice: 0, nome: 'voltas',
                       valor: { op: 'caixa', indice: 1, nome: 'passo' } }]);
  assert.ok(com.includes('  caixa_voltas = somar(caixa_voltas, caixa_passo);'), com);
  assert.ok(com.includes('int32_t somar(int32_t caixa, int32_t n) {'));
  assert.ok(com.includes('int32_t caixa_passo = 0;'), 'caixa só lida também é declarada');
  const sem = gerar([{ op: 'guardar', indice: 0, nome: 'voltas', valor: 1 }]);
  assert.ok(!sem.includes('somar('));
});

test('guardar 1.6 e -1.6 arredondam como o bytecode', () => {
  const texto = gerar([
    { op: 'guardar', indice: 0, nome: 'a', valor: 1.6 },
    { op: 'guardar', indice: 1, nome: 'b', valor: -1.6 },
    { op: 'guardar', indice: 2, nome: 'c', valor: -1.5 },
  ]);
  assert.ok(texto.includes('  caixa_a = 2;'));
  assert.ok(texto.includes('  caixa_b = -2;'));
  assert.ok(texto.includes('  caixa_c = -1;'));
});

test('dois nomes que dão no mesmo identificador ficam distintos', () => {
  const texto = gerar([
    { op: 'guardar', indice: 0, nome: 'número', valor: 1 },
    { op: 'guardar', indice: 1, nome: 'numero', valor: 2 },
    { op: 'guardar', indice: 2, nome: 'número!', valor: 3 },
  ]);
  assert.ok(texto.includes('  caixa_numero = 1;'), texto);
  assert.ok(texto.includes('  caixa_numero_2 = 2;'), texto);
  assert.ok(texto.includes('  caixa_numero_3 = 3;'), texto);
});

test('nomes perigosos geram um sketch que compila',
  { skip: temGpp() ? false : 'sem g++ nesta máquina' }, () => {
    const nomes = ['PWMA', 'delay', 'HIGH', '__x', '_Nome', '3voltas',
                   'número de voltas', 'somar', 'int'];
    const ast = nomes.map((nome, i) => ({ op: 'mudar', indice: i, nome, valor: i }));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ino-'));
    const arq = path.join(dir, 'caixas.cpp');
    fs.writeFileSync(arq, '#include "fake_arduino.h"\n' + gerar(ast));
    const r = spawnSync('g++', ['-fsyntax-only', '-Wall', '-I', __dirname, arq],
      { encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    assert.strictEqual(r.status, 0, 'o sketch não compilou:\n' + r.stderr);
  });

/* Não basta compilar: a somar tem que dar a volta como o CHANGE_VAR da VM, e
   sem comportamento indefinido. O UBSan com -fno-sanitize-recover derruba o
   programa se a soma com sinal estourar. */
test('a somar do sketch gerado dá a volta sem comportamento indefinido',
  { skip: temGpp() ? false : 'sem g++ nesta máquina' }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ino-'));
    const arq = path.join(dir, 'somar.cpp');
    const bin = path.join(dir, 'somar');
    fs.writeFileSync(arq,
      '#include "fake_arduino.h"\n' +
      gerar([{ op: 'mudar', indice: 0, nome: 'x', valor: 1 }]) +
      '\nint main() {\n' +
      '  if (somar(INT32_MAX, 1) != INT32_MIN) return 1;\n' +
      '  if (somar(INT32_MIN, -1) != INT32_MAX) return 2;\n' +
      '  if (somar(40, 2) != 42) return 3;\n' +
      '  return 0;\n}\n');
    const c = spawnSync('g++', ['-fsanitize=undefined', '-fno-sanitize-recover=all',
                                '-I', __dirname, '-o', bin, arq], { encoding: 'utf8' });
    assert.strictEqual(c.status, 0, 'não compilou:\n' + c.stderr);
    const r = spawnSync(bin, [], { encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    assert.strictEqual(r.status, 0, 'a somar errou (código ' + r.status + '):\n' + r.stderr);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/arduino.test.js`
Expected: FAIL — `limparNome is not a function`, `Bloco desconhecido: guardar`.

- [ ] **Step 3: `tests/fake_arduino.h`**

Depois de `#include <stdlib.h>   /* abs */`:

```c
#include <stdint.h>   /* int32_t, que o Arduino.h de verdade já traz */
```

- [ ] **Step 4: Implementar em `web/arduino.js`**

Depois de `var NOMES_LACO = ['i', 'j', 'k', 'l'];`:

```js
  /* Tirar acento por tabela, e não por String.prototype.normalize: o Safari do
     iOS 9 não tem, e o tests/es5.test.js o proíbe. */
  var SEM_ACENTO = {
    'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a',
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
    'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
    'ç': 'c', 'ñ': 'n'
  };

  /* O nome que a criança deu vira identificador de C++.

     Sempre com "caixa_" na frente. Guardar só as palavras reservadas não
     fecha: o arquivo declara PWMA e TRIG, chama delay e pinMode, usa HIGH e
     OUTPUT, e o C++ reserva todo nome com "__" ou começado por "_" e
     maiúscula. Uma lista que acompanhasse tudo isso ficaria para trás no
     primeiro bloco novo; o prefixo fecha tudo de uma vez, e ainda diz a quem
     lê que aquilo é a caixa que ela criou. */
  function limparNome(nome) {
    var s = String(nome === null || nome === undefined ? '' : nome);
    var fora = '', i, c, baixo, troca;
    for (i = 0; i < s.length; i++) {
      c = s.charAt(i);
      baixo = c.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(SEM_ACENTO, baixo)) {
        troca = SEM_ACENTO[baixo];
        fora += (c === baixo) ? troca : troca.toUpperCase();
      } else {
        fora += c;
      }
    }
    fora = fora.replace(/[^A-Za-z0-9_]/g, '_')
               .replace(/_+/g, '_')
               .replace(/^_+|_+$/g, '');
    return 'caixa_' + (fora || 'caixa');
  }

  /* Nome da caixa → identificador, para o gerar() em curso. Refeito a cada
     gerar(), na ordem em que as caixas aparecem, para que dois nomes que
     dão no mesmo virem _2, _3 sempre na mesma ordem. */
  var identificadores = {};
  var identificadoresUsados = {};

  function identificadorDe(nome) {
    var chave = ' ' + nome;   /* o espaço impede "constructor" e parentes */
    if (Object.prototype.hasOwnProperty.call(identificadores, chave)) {
      return identificadores[chave];
    }
    var base = limparNome(nome), ident = base, k = 2;
    while (Object.prototype.hasOwnProperty.call(identificadoresUsados, ident)) {
      ident = base + '_' + k;
      k++;
    }
    identificadores[chave] = ident;
    identificadoresUsados[ident] = true;
    return ident;
  }
```

Em `valor(v)`, depois de `if (v.op === 'distancia') return 'distanciaCm()';`:

```js
    if (v.op === 'caixa') return identificadorDe(v.nome);
```

Em `parte(v)`, troque a condição de chamada por:

```js
    if (v.op === 'distancia' || v.op === 'nao' || v.op === 'aleatorio' ||
        v.op === 'caixa') {
      return valor(v);
    }
```

Em `usoDeValor(v, uso)`, depois de `if (v.op === 'aleatorio') uso.aleatorio = true;`:

```js
    if (v.op === 'caixa') identificadorDe(v.nome);
```

Em `usoDe(nos, uso)`, depois de `usoDeValor(no.cond, uso);`:

```js
      usoDeValor(no.valor, uso);
      if (no.op === 'guardar' || no.op === 'mudar') identificadorDe(no.nome);
      if (no.op === 'mudar') uso.somar = true;
```

No `switch` de `gerarNos`, antes de `case 'avisar':`:

```js
        case 'guardar':
          linhas.push(r + identificadorDe(no.nome) + ' = ' + valor(no.valor) + ';');
          break;
        case 'mudar': {
          var caixa = identificadorDe(no.nome);
          linhas.push(r + caixa + ' = somar(' + caixa + ', ' + valor(no.valor) + ');');
          break;
        }
```

Depois de `var SENSOR = [...];`:

```js
  /* A soma direta, "x = x + n", era a mais legível, e foi recusada: estouro de
     inteiro com sinal é comportamento indefinido em C++, e a caixa da VM dá a
     volta. A conversão final para int32_t é definida pela implementação, e
     módulo 2^32 no GCC da ESP32 — que é o compilador do Arduino IDE para
     esta placa. */
  var SOMAR = [
    '/* Soma que dá a volta, como a caixa do robô: passar de 2147483647 volta',
    '   para -2147483648, em vez de fazer o que o C++ quiser. */',
    'int32_t somar(int32_t caixa, int32_t n) {',
    '  return (int32_t)((uint32_t)caixa + (uint32_t)n);',
    '}',
    ''
  ];

  function declaracoes() {
    var fora = [], ident;
    for (ident in identificadoresUsados) {
      if (Object.prototype.hasOwnProperty.call(identificadoresUsados, ident)) {
        fora.push('int32_t ' + ident + ' = 0;');
      }
    }
    if (!fora.length) return [];
    return ['/* As caixas que você criou. */'].concat(fora, ['']);
  }
```

Em `gerar(ast)`, troque o começo e a montagem:

```js
  function gerar(ast) {
    var nos = ast || [];
    identificadores = {};
    identificadoresUsados = {};
    var uso = usoDe(nos);
    var corpo = [];
    var linhas = [];

    gerarNos(nos, 1, 0, corpo);

    linhas = linhas.concat(CABECALHO, pinos(uso), declaracoes(), fiacao(uso), MOTORES);
    if (uso.frente) linhas = linhas.concat(ANDAR_FRENTE);
    if (uso.tras) linhas = linhas.concat(ANDAR_TRAS);
    if (uso.girar) linhas = linhas.concat(GIRAR);
    if (uso.esperar) linhas = linhas.concat(ESPERAR);
    if (uso.aleatorio) linhas = linhas.concat(ALEATORIO);
    if (uso.sensor) linhas = linhas.concat(SENSOR);
    if (uso.somar) linhas = linhas.concat(SOMAR);
```

(O resto do `gerar` fica como está.)

No `api`:

```js
  var api = { gerar: gerar, limparNome: limparNome,
              VEL_GIRO: VEL_GIRO, MS_POR_GRAU: MS_POR_GRAU,
              TRIM_DIR: TRIM_DIR,
              PINOS: PINOS };
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/arduino.test.js tests/es5.test.js`
Expected: PASS, todos, inclusive os dois com g++.

- [ ] **Step 6: Commit**

```bash
git add web/arduino.js tests/arduino.test.js tests/fake_arduino.h
git commit -m "O .ino declara as caixas com prefixo e soma dando a volta como o robô"
git push origin master
```

---

### Task 8: Os três blocos — `web/blocos.js`

**Files:**
- Modify: `web/blocos.js`
- Test: `tests/blocos.test.js`

**Interfaces:**
- Consumes: `Mapa` da Task 4 (`lugarDe`).
- Produces: tipos `caixa_guardar` (entrada `VALOR`, campo `CAIXA`), `caixa_mudar` (campo `CAIXA`, entrada `VALOR`), `caixa_ler` (campo `CAIXA`, saída `Number`); `Blocos.usarCaixas(mapa)`; `Blocos.gavetaDeCaixas(workspace) → Element[]`; `Blocos.COR_CAIXA`.

- [ ] **Step 1: Escrever os testes que falham**

No topo de `tests/blocos.test.js`, depois de `const Blocos = require('../web/blocos.js');`:

```js
const Caixas = require('../web/caixas.js');
```

No fim do arquivo:

```js
/* ---------- as caixas com nome ---------- */

function carregarComCaixas(variaveis, estados) {
  const ws = new Blockly.Workspace();
  Blockly.Events.disable();
  try {
    Blockly.serialization.workspaces.load(
      { variables: variaveis,
        blocks: { languageVersion: 0, blocks: estados } }, ws);
  } finally {
    Blockly.Events.enable();
  }
  return ws;
}

function programaComCaixa(bloco) {
  return carregarComCaixas([{ name: 'voltas', id: 'v1' }],
    [{ type: 'quando_play', inputs: { CORPO: { block: bloco } } }]);
}

test('guardar leva o lugar do mapa e o nome da caixa', () => {
  Blocos.usarCaixas(Caixas.importar({ lugar: { v1: 3 } }));
  const ws = programaComCaixa({ type: 'caixa_guardar', id: 'g',
    fields: { CAIXA: { id: 'v1' } }, inputs: { VALOR: num(7) } });
  assert.deepStrictEqual(Blocos.workspaceParaAst(ws),
    [{ op: 'guardar', indice: 3, nome: 'voltas', valor: 7, blockId: 'g' }]);
});

test('mudar e ler viram os nós deles', () => {
  Blocos.usarCaixas(Caixas.importar({ lugar: { v1: 0 } }));
  const ws = programaComCaixa({ type: 'caixa_mudar', id: 'm',
    fields: { CAIXA: { id: 'v1' } },
    inputs: { VALOR: { block: { type: 'caixa_ler', id: 'l',
                                fields: { CAIXA: { id: 'v1' } } } } } });
  assert.deepStrictEqual(Blocos.workspaceParaAst(ws), [{
    op: 'mudar', indice: 0, nome: 'voltas', blockId: 'm',
    valor: { op: 'caixa', indice: 0, nome: 'voltas', blockId: 'l' },
  }]);
});

test('renomear mantém o lugar e troca o nome', () => {
  Blocos.usarCaixas(Caixas.importar({ lugar: { v1: 5 } }));
  const ws = programaComCaixa({ type: 'caixa_guardar', id: 'g',
    fields: { CAIXA: { id: 'v1' } }, inputs: { VALOR: num(1) } });
  Blockly.Events.disable();
  try { ws.renameVariableById('v1', 'pontos'); } finally { Blockly.Events.enable(); }
  const no = Blocos.workspaceParaAst(ws)[0];
  assert.strictEqual(no.indice, 5);
  assert.strictEqual(no.nome, 'pontos');
});

test('caixa sem lugar no mapa vira erro no bloco dela', () => {
  Blocos.usarCaixas(Caixas.importar(null));
  const ws = programaComCaixa({ type: 'caixa_guardar', id: 'g',
    fields: { CAIXA: { id: 'v1' } }, inputs: { VALOR: num(1) } });
  assert.throws(() => Blocos.workspaceParaAst(ws), (e) => e.blockId === 'g');
});

test('tocar no relator da caixa pergunta pela caixa', () => {
  Blocos.usarCaixas(Caixas.importar({ lugar: { v1: 2 } }));
  const ws = carregarComCaixas([{ name: 'voltas', id: 'v1' }],
    [{ type: 'caixa_ler', id: 'l', fields: { CAIXA: { id: 'v1' } } }]);
  assert.deepStrictEqual(Blocos.valorDoBloco(ws.getBlockById('l')),
    { op: 'caixa', indice: 2, nome: 'voltas', blockId: 'l' });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/blocos.test.js`
Expected: FAIL — `Blocos.usarCaixas is not a function` / tipo `caixa_guardar` desconhecido.

- [ ] **Step 3: Implementar em `web/blocos.js`**

Depois de `var COR_CONTA     = '#002080';`:

```js
  /* Laranja: nenhuma outra família usa, e a caixa é uma coisa nova — não é
     conta, não é sensor, não é o que o robô faz. Precisa bater com
     web/niveis.js. */
  var COR_CAIXA     = '#e06000';
```

No array de definições do `definir()`, depois da entrada `avisar`:

```js
      {
        type: 'caixa_guardar',
        message0: '📦 guardar %1 na caixa %2',
        args0: [
          { type: 'input_value', name: 'VALOR', check: 'Number' },
          { type: 'field_variable', name: 'CAIXA' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        colour: COR_CAIXA,
        tooltip: 'Põe o número na caixa. O que estava lá dentro sai.',
      },
      {
        type: 'caixa_mudar',
        message0: '📦 mudar %1 por %2',
        args0: [
          { type: 'field_variable', name: 'CAIXA' },
          { type: 'input_value', name: 'VALOR', check: 'Number' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        colour: COR_CAIXA,
        tooltip: 'Soma o número ao que já está na caixa. Número negativo tira.',
      },
      {
        type: 'caixa_ler',
        message0: '📦 %1',
        args0: [{ type: 'field_variable', name: 'CAIXA' }],
        output: 'Number',
        colour: COR_CAIXA,
        tooltip: 'O número que está guardado na caixa.',
      },
```

Antes de `function blocoParaNo(b) {`:

```js
  /* O mapa de lugares (web/caixas.js), entregue pelo app.js. Fica aqui e não
     como global lida por nome porque o blocos.js também roda no ipad.html e
     nos testes, onde quem decide o mapa é quem chama. */
  var caixas = null;

  function usarCaixas(mapa) {
    caixas = mapa;
  }

  /* O nó de uma peça de caixa. O compilador usa o lugar e o arduino.js usa o
     nome — a árvore leva os dois. */
  function noDeCaixa(op, b) {
    var id = b.getFieldValue('CAIXA');
    var variavel = id ? b.workspace.getVariableById(id) : null;
    var lugar = (id && caixas) ? caixas.lugarDe(id) : null;
    if (lugar === null) {
      var e = new Error('Essa caixa não coube no robô. Apague uma caixa e ' +
                        'crie esta de novo.');
      e.blockId = b.id;
      throw e;
    }
    var no = { op: op, indice: lugar,
               nome: variavel ? variavel.name : 'caixa', blockId: b.id };
    if (op !== 'caixa') no.valor = valorDe(b, 'VALOR');
    return no;
  }
```

No `switch` de `blocoParaNo`, antes de `default:`:

```js
      case 'caixa_guardar': return noDeCaixa('guardar', b);
      case 'caixa_mudar':   return noDeCaixa('mudar', b);
      case 'caixa_ler':     return noDeCaixa('caixa', b);
```

Atenção à ordem das chaves no nó: o teste compara com `deepStrictEqual`, que não liga para ordem de chave — mas `valor` só existe em `guardar` e `mudar`.

Depois de `function valorDoBloco(bloco) {...}`:

```js
  /* A gaveta «Caixas», montada na hora em que a criança a abre: o botão de
     criar em cima, e as três peças já apontando para a última caixa criada.
     Sem caixa nenhuma, só o botão — um bloco sem variável faria o Blockly
     inventar uma chamada "item", que gastaria um lugar sem a criança pedir.

     Em XML, e não em JSON, porque é o caminho que a própria categoria de
     variáveis do Blockly 8 usa para a gaveta; e montado com createElement,
     que escapa o nome que a criança digitou. */
  function gavetaDeCaixas(workspace) {
    var xml = Blockly.utils.xml;
    var itens = [];
    var botao = xml.createElement('button');
    botao.setAttribute('text', '📦 Criar caixa');
    botao.setAttribute('callbackKey', 'CRIAR_CAIXA');
    itens.push(botao);

    var variaveis = workspace.getAllVariables();
    if (!variaveis.length) return itens;
    var ultima = variaveis[variaveis.length - 1];

    itens.push(pecaDeCaixa('caixa_guardar', ultima, 0));
    itens.push(pecaDeCaixa('caixa_mudar', ultima, 1));
    itens.push(pecaDeCaixa('caixa_ler', ultima, null));
    return itens;
  }

  function pecaDeCaixa(tipo, variavel, numero) {
    var xml = Blockly.utils.xml;
    var bloco = xml.createElement('block');
    bloco.setAttribute('type', tipo);
    var campo = xml.createElement('field');
    campo.setAttribute('name', 'CAIXA');
    campo.setAttribute('id', variavel.getId());
    campo.appendChild(xml.createTextNode(variavel.name));
    bloco.appendChild(campo);
    if (numero !== null) {
      var encaixe = xml.createElement('value');
      encaixe.setAttribute('name', 'VALOR');
      var sombra = xml.createElement('shadow');
      sombra.setAttribute('type', 'numero');
      var num = xml.createElement('field');
      num.setAttribute('name', 'NUM');
      num.appendChild(xml.createTextNode(String(numero)));
      sombra.appendChild(num);
      encaixe.appendChild(sombra);
      bloco.appendChild(encaixe);
    }
    return bloco;
  }
```

No `api`, acrescente `usarCaixas: usarCaixas, gavetaDeCaixas: gavetaDeCaixas, COR_CAIXA: COR_CAIXA`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/blocos.test.js tests/es5.test.js`
Expected: PASS, todos. (A `gavetaDeCaixas` não tem teste aqui: o `dom_falso.js` não monta elemento XML de verdade. Quem a prova é o teste de navegador da Task 10.)

- [ ] **Step 5: Commit**

```bash
git add web/blocos.js tests/blocos.test.js
git commit -m "Nascem as peças de caixa: guardar, mudar e ler"
git push origin master
```

---

### Task 9: A categoria «Caixas» no Avançado — `web/niveis.js`

**Files:**
- Modify: `web/niveis.js`
- Test: `tests/niveis.test.js`

**Interfaces:**
- Consumes: tipos `caixa_guardar`, `caixa_mudar`, `caixa_ler` (Task 8).
- Produces: `<category name="Caixas" colour="#e06000" custom="CAIXAS"></category>` no XML do Avançado.

- [ ] **Step 1: Escrever os testes que falham**

No fim de `tests/niveis.test.js`:

```js
/* ---------- as caixas ---------- */

test('só o Avançado tem as caixas', () => {
  for (const nivel of ['pequeno', 'medio', 'grande']) {
    const b = Niveis.definicao(nivel).blocos;
    assert.ok(b.indexOf('caixa_guardar') < 0, nivel + ' não deveria ter caixas');
    assert.ok(!Niveis.caixaXml(nivel).includes('custom="CAIXAS"'));
  }
  const g = Niveis.definicao('gigante').blocos;
  for (const t of ['caixa_guardar', 'caixa_mudar', 'caixa_ler']) {
    assert.ok(g.indexOf(t) >= 0, 'faltou ' + t + ' no Avançado');
  }
});

test('a gaveta das caixas é montada na hora, e não escrita no XML', () => {
  const xml = Niveis.caixaXml('gigante');
  assert.ok(xml.includes('<category name="Caixas" colour="#e06000" custom="CAIXAS"></category>'), xml);
  assert.ok(!xml.includes('type="caixa_'), 'as peças vêm da gaveta, não do XML');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/niveis.test.js`
Expected: FAIL — `faltou caixa_guardar no Avançado`.

- [ ] **Step 3: Implementar em `web/niveis.js`**

Junto das outras cores (a que o comentário "Precisa bater com web/blocos.js" cobre):

```js
  var COR_CAIXA = '#e06000';
```

Em `DEFINICOES.gigante.blocos`, depois de `'quando_condicao', 'quando_aviso', 'avisar',`:

```js
      /* As caixas com nome. No Avançado porque «mudar voltas por 1» só diz
         alguma coisa para quem já faz conta — e porque é aqui que duas pilhas
         precisam de um lugar em comum. */
      'caixa_guardar', 'caixa_mudar', 'caixa_ler',
```

Em `caixaXml`, depois do bloco da categoria «Contas» e antes de `xml += '</xml>';`:

```js
    /* A gaveta das caixas depende de quais caixas a criança já criou, e o XML
       é fixo: quem a monta, na hora de abrir, é o Blocos.gavetaDeCaixas,
       registrado pelo app.js com este nome. */
    if (tem('caixa_guardar')) {
      xml += '<category name="Caixas" colour="' + COR_CAIXA +
             '" custom="CAIXAS"></category>';
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/niveis.test.js tests/es5.test.js`
Expected: PASS, todos — inclusive `cada nível oferece a quantidade certa de blocos`, que não conta o Avançado.

- [ ] **Step 5: Commit**

```bash
git add web/niveis.js tests/niveis.test.js
git commit -m "O Avançado ganha a gaveta das caixas"
git push origin master
```

---

### Task 10: Ligar tudo no `app.js`, e a prova no navegador

**Files:**
- Modify: `web/app.js`
- Modify: `web/index.html`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-15-caixas-com-nome-design.md` (só se algo medido aqui contradisser a spec)
- Test: `tests/navegador.test.js`

**Interfaces:**
- Consumes: `Caixas.importar`, `mapa.*` (Task 4); `Guardar.gravar(estado, nivel, caixas)`, `Guardar.lerCaixas` (Task 5); `Blocos.usarCaixas`, `Blocos.gavetaDeCaixas` (Task 8); categoria `custom="CAIXAS"` (Task 9); `compilar(ast, opcoes)`, `compilarTarefas(tarefas, opcoes)` (Task 2).

- [ ] **Step 1: Escrever o teste de navegador que falha**

No fim de `tests/navegador.test.js`, seguindo o molde de `'tocar num relator mostra o valor numa bolha'` (porta `+ 16`, livre):

```js
test('a caixa guarda entre um toque e outro, e só o PLAY zera',
  { skip: PULAR, timeout: 180000 },
  async (t) => {
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 16) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-caixas-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 16}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 16}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 16}/json/list`);
    const cdp = new Ws(alvos.find((a) => a.type === 'page').webSocketDebuggerUrl);
    await cdp.pronto;
    await cdp.envia('Runtime.enable');
    await cdp.envia('Page.enable');
    const aval = async (expr) => {
      const r = await cdp.envia('Runtime.evaluate',
        { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(expr + ' -> ' + JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };
    const mouse = (type, x, y) => cdp.envia('Input.dispatchMouseEvent', {
      type, x, y, button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1,
    });
    /* O emoji 📦 é field_label, que não é clicável: tocar ali vira clique de
       bloco, e não abre editor nenhum (ver a memória do gesto do Blockly). */
    const tocar = async (id) => {
      const p = JSON.parse(await aval(`(() => {
        const r = Blockly.getMainWorkspace().getBlockById(${JSON.stringify(id)})
          .getSvgRoot().getBoundingClientRect();
        return JSON.stringify({ x: r.left + 14, y: r.top + r.height / 2 });
      })()`));
      await mouse('mousePressed', p.x, p.y);
      await mouse('mouseReleased', p.x, p.y);
      await espera(1200);
    };
    const bolha = () => aval('document.getElementById("bolha").textContent');
    const url = `http://localhost:${PORTA_WEB + 16}/`;

    await cdp.envia('Page.navigate', { url });
    await espera(3000);
    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=gigante]').click();
      return 1;
    })()`);
    await espera(800);

    /* O prompt e o confirm do Blockly viram window.prompt e window.confirm, e
       um diálogo nativo aberto trava o headless. O confirm aparece ao apagar
       uma caixa com mais de um uso. */
    await aval(`(() => {
      window.prompt = function () { return 'voltas'; };
      window.confirm = function () { return true; };
      return 1;
    })()`);

    const abrirCaixas = () => aval(`(() => {
      const tb = Blockly.getMainWorkspace().getToolbox();
      const c = tb.getToolboxItems().find(i => i.getName && i.getName() === 'Caixas');
      tb.setSelectedItem(c);
      return 1;
    })()`);
    const pecasNaGaveta = () => aval(`(() => {
      const f = Blockly.getMainWorkspace().getFlyout();
      return f.getWorkspace().getTopBlocks(false).map(b => b.type).sort().join();
    })()`);

    /* Sem caixa nenhuma, a gaveta só tem o botão. */
    await abrirCaixas();
    await espera(700);
    assert.strictEqual(await pecasNaGaveta(), '', 'gaveta sem caixa não devia ter peça');

    /* O botão, pelo mesmo callback que o toque nele chama. */
    await aval(`(() => {
      Blockly.getMainWorkspace().getButtonCallback('CRIAR_CAIXA')();
      return 1;
    })()`);
    await espera(600);
    assert.strictEqual(await aval(
      'Blockly.getMainWorkspace().getAllVariables().map((v) => v.name).join()'),
      'voltas', 'o botão não criou a caixa');

    /* Reabrir a gaveta mostra as três peças, já apontando para «voltas». */
    await abrirCaixas();
    await espera(700);
    assert.strictEqual(await pecasNaGaveta(), 'caixa_guardar,caixa_ler,caixa_mudar');
    /* Fecha a gaveta do mesmo jeito que o fecharPaleta do app.js: sem isso
       ela fica por cima do lugar onde as peças vão ser soltas. */
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      ws.getFlyout().hide();
      ws.getToolbox().clearSelection();
      return 1;
    })()`);
    await espera(400);

    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      const id = ws.getAllVariables()[0].getId();
      const m = Blockly.serialization.blocks.append({ type: 'caixa_mudar', id: 'm',
        fields: { CAIXA: { id } },
        inputs: { VALOR: { shadow: { type: 'numero', fields: { NUM: 1 } } } } }, ws);
      m.moveBy(60, 340);
      const l = Blockly.serialization.blocks.append({ type: 'caixa_ler', id: 'l',
        fields: { CAIXA: { id } } }, ws);
      l.moveBy(60, 460);
      const g = Blockly.serialization.blocks.append({ type: 'caixa_guardar', id: 'g',
        fields: { CAIXA: { id } },
        inputs: { VALOR: { shadow: { type: 'numero', fields: { NUM: 5 } } } } }, ws);
      g.moveBy(60, 580);
      return 1;
    })()`);
    await espera(600);

    await tocar('m');
    await tocar('m');
    await tocar('l');
    assert.strictEqual(await bolha(), '2', 'a caixa não guardou entre um toque e outro');

    /* PLAY de um programa que não usa caixa nenhuma: a caixa tocada por pilha
       solta tem que voltar a zero. */
    await aval('document.getElementById("play").click(), 1');
    await espera(1500);
    await tocar('l');
    assert.strictEqual(await bolha(), '0', 'o PLAY não zerou a caixa da pilha solta');

    /* Guardar 5, apagar a caixa, PLAY, criar outra no mesmo lugar: tem que
       mostrar 0, e não o 5 que ficou na VM. */
    await tocar('g');
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      ws.deleteVariableById(ws.getAllVariables()[0].getId());
      return 1;
    })()`);
    await espera(400);
    await aval('document.getElementById("play").click(), 1');
    await espera(1500);
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      const v = ws.createVariable('pontos');
      const l = Blockly.serialization.blocks.append({ type: 'caixa_ler', id: 'l2',
        fields: { CAIXA: { id: v.getId() } } }, ws);
      l.moveBy(60, 340);
      return 1;
    })()`);
    await espera(600);
    await tocar('l2');
    assert.strictEqual(await bolha(), '0', 'a caixa nova mostrou a sobra da apagada');

    /* Apagar e desfazer mantém o número; recarregar mantém nome e lugar. */
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      const id = ws.getAllVariables()[0].getId();
      const m = Blockly.serialization.blocks.append({ type: 'caixa_mudar', id: 'm2',
        fields: { CAIXA: { id } },
        inputs: { VALOR: { shadow: { type: 'numero', fields: { NUM: 3 } } } } }, ws);
      m.moveBy(60, 460);
      return 1;
    })()`);
    await espera(600);
    await tocar('m2');
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      ws.deleteVariableById(ws.getAllVariables()[0].getId());
      return 1;
    })()`);
    await espera(400);
    await aval('document.getElementById("desfazer").click(), 1');
    await espera(800);
    await tocar('l2');
    assert.strictEqual(await bolha(), '3', 'desfazer trocou a caixa de lugar');

    /* Recarregar. O número não entra nesta conta: o bridge sobe um robô
       virtual por conexão, então a página recarregada fala com uma VM nova,
       de caixas zeradas. (Na placa a VM continua ligada, e é lá que o número
       volta — prova dele, no aparelho.) O que tem que voltar aqui é o nome e
       o lugar. */
    const lugarAntes = await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      return ws.getAllVariables()[0].getId();
    })()`);
    await espera(1500);   /* o segundo de silêncio antes de gravar */
    const gravado = await aval(
      `JSON.parse(localStorage.getItem('robo_programa')).caixas.lugar[${JSON.stringify(lugarAntes)}]`);
    assert.strictEqual(gravado, 0, 'o lugar de «pontos» não foi gravado');

    await cdp.envia('Page.navigate', { url });
    await espera(3000);
    assert.strictEqual(await aval(
      'Blockly.getMainWorkspace().getAllVariables().map((v) => v.name).join()'),
      'pontos', 'a caixa não voltou depois de recarregar');
    assert.strictEqual(await aval(
      `Blockly.getMainWorkspace().getAllVariables()[0].getId()`),
      lugarAntes, 'a caixa voltou com outro id');
    /* O mapa voltou: guardar na caixa e ler dá o número, e não erro de caixa
       sem lugar. */
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      const id = ws.getAllVariables()[0].getId();
      Blockly.serialization.blocks.append({ type: 'caixa_guardar', id: 'g3',
        fields: { CAIXA: { id } },
        inputs: { VALOR: { shadow: { type: 'numero', fields: { NUM: 9 } } } } }, ws)
        .moveBy(60, 700);
      return 1;
    })()`);
    await espera(600);
    await tocar('g3');
    await tocar('l2');
    assert.strictEqual(await bolha(), '9', 'depois de recarregar, a caixa perdeu o lugar');

    cdp.fechar();
  });
```

O id `desfazer` é o do `web/app.js:31`, e abrir a categoria com `tb.setSelectedItem` é o jeito que o teste da categoria «Contas» (`tests/navegador.test.js:325`) já usa.

E um segundo teste, logo depois, para o que os eventos de variável não veem: o `workspace.clear()` de trocar de nível e o mapa gravado torto (porta `+ 17`):

```js
test('trocar de nível e mapa gravado torto não prendem lugar, e a 17ª caixa não nasce',
  { skip: PULAR, timeout: 180000 },
  async (t) => {
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 17) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-caixas-limite-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 17}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 17}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 17}/json/list`);
    const cdp = new Ws(alvos.find((a) => a.type === 'page').webSocketDebuggerUrl);
    await cdp.pronto;
    await cdp.envia('Runtime.enable');
    await cdp.envia('Page.enable');
    const aval = async (expr) => {
      const r = await cdp.envia('Runtime.evaluate',
        { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(expr + ' -> ' + JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };
    const mouse = (type, x, y) => cdp.envia('Input.dispatchMouseEvent', {
      type, x, y, button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1,
    });
    const tocar = async (id) => {
      const p = JSON.parse(await aval(`(() => {
        const r = Blockly.getMainWorkspace().getBlockById(${JSON.stringify(id)})
          .getSvgRoot().getBoundingClientRect();
        return JSON.stringify({ x: r.left + 14, y: r.top + r.height / 2 });
      })()`));
      await mouse('mousePressed', p.x, p.y);
      await mouse('mouseReleased', p.x, p.y);
      await espera(1200);
    };
    const nivel = async (n) => {
      await aval(`(() => {
        document.querySelector('#niveis button[data-nivel=${n}]').click();
        return 1;
      })()`);
      await espera(800);
    };
    /* Cada janelinha conta, e cada uma dá um nome diferente. */
    const dialogos = () => aval(`(() => {
      window.__prompts = window.__prompts || 0;
      window.prompt = function () { window.__prompts++; return 'caixa' + window.__prompts; };
      window.confirm = function () { return true; };
      return 1;
    })()`);
    const criarPeloBotao = () => aval(`(() => {
      Blockly.getMainWorkspace().getButtonCallback('CRIAR_CAIXA')();
      return 1;
    })()`);
    const quantasCaixas = () => aval('Blockly.getMainWorkspace().getAllVariables().length');
    /* Usa a última caixa: guarda n nela e toca, depois lê e toca. Uma caixa sem
       lugar daria o erro "não coube" em vez do número. */
    const usarUltima = async (n, sufixo) => {
      await aval(`(() => {
        const ws = Blockly.getMainWorkspace();
        const vars = ws.getAllVariables();
        const id = vars[vars.length - 1].getId();
        Blockly.serialization.blocks.append({ type: 'caixa_guardar', id: 'g${sufixo}',
          fields: { CAIXA: { id } },
          inputs: { VALOR: { shadow: { type: 'numero', fields: { NUM: ${n} } } } } }, ws)
          .moveBy(60, 340);
        Blockly.serialization.blocks.append({ type: 'caixa_ler', id: 'l${sufixo}',
          fields: { CAIXA: { id } } }, ws).moveBy(60, 460);
        return 1;
      })()`);
      await espera(600);
      await tocar('g' + sufixo);
      await tocar('l' + sufixo);
      return aval('document.getElementById("bolha").textContent');
    };
    const url = `http://localhost:${PORTA_WEB + 17}/`;

    await cdp.envia('Page.navigate', { url });
    await espera(3000);
    await nivel('gigante');
    await dialogos();

    /* Três trocas de nível com dez caixas na tela. Sem bloco nenhum, a troca
       não pergunta — e o clear() leva as trinta caixas sem um VAR_DELETE. */
    for (let volta = 0; volta < 3; volta++) {
      await aval(`(() => {
        const ws = Blockly.getMainWorkspace();
        for (let i = 0; i < 10; i++) ws.createVariable('v${volta}_' + i);
        return 1;
      })()`);
      await espera(400);
      await nivel('grande');
      await nivel('gigante');
      assert.strictEqual(await quantasCaixas(), 0, 'a troca de nível devia apagar as caixas');
    }

    /* Com os trinta fantasmas, a primeira caixa pelo botão já bateria no teto. */
    for (let i = 0; i < 16; i++) {
      await criarPeloBotao();
      await espera(150);
    }
    assert.strictEqual(await quantasCaixas(), 16, 'nem todas as 16 nasceram');
    assert.strictEqual(await aval('window.__prompts'), 16);
    assert.strictEqual(await usarUltima(7, 'a'), '7', 'a 16ª caixa ficou sem lugar');

    /* A 17ª: nem abre a janelinha, e o cabeçalho explica. */
    await criarPeloBotao();
    await espera(300);
    assert.strictEqual(await aval('window.__prompts'), 16, 'a janelinha da 17ª abriu');
    assert.strictEqual(await quantasCaixas(), 16);
    assert.match(await aval('document.getElementById("erro").textContent'),
      /guarda 16 caixas/);

    /* O mapa gravado com 16 fantasmas. O ouvinte entra depois do app.js no
       pagehide, então escreve por cima do que o app acabou de gravar. */
    await aval(`(() => {
      window.addEventListener('pagehide', function () {
        const d = JSON.parse(localStorage.getItem('robo_programa'));
        const lugar = {};
        for (let i = 0; i < 16; i++) lugar['fantasma' + i] = i;
        d.caixas = { lugar: lugar, antigo: {}, sujo: [] };
        d.blocos.variables = [];
        d.blocos.blocks = { languageVersion: 0,
                            blocks: [{ type: 'quando_play', x: 40, y: 30 }] };
        localStorage.setItem('robo_programa', JSON.stringify(d));
      });
      return 1;
    })()`);
    await cdp.envia('Page.navigate', { url });
    await espera(3000);
    await dialogos();
    assert.strictEqual(await quantasCaixas(), 0);

    await criarPeloBotao();
    await espera(400);
    assert.strictEqual(await quantasCaixas(), 1, 'os fantasmas impediram a caixa de nascer');
    assert.strictEqual(await usarUltima(4, 'b'), '4', 'a caixa nova ficou sem lugar');

    cdp.fechar();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `make all && TESTES_LENTOS=1 node --test --test-name-pattern="caixa" tests/navegador.test.js`
Expected: FAIL nos dois — `getButtonCallback('CRIAR_CAIXA')` devolve `undefined` (o botão não foi registrado).

- [ ] **Step 3: `web/index.html`**

Depois de `<script src="guardar.js"></script>`:

```html
  <script src="caixas.js"></script>
```

- [ ] **Step 4: `web/app.js` — o mapa, antes do programa voltar**

Logo antes do comentário `/* ---------- o programa da criança volta como ela deixou ---------- */`:

```js
  /* ---------- as caixas com nome ---------- */

  /* O lugar de cada caixa na VM. Volta do armazenamento antes do programa,
     porque carregar o programa recria as variáveis — e cada uma tem que cair
     no lugar onde estava, senão tocar em «voltas» depois de recarregar a
     página mostraria o número de outra caixa. */
  var caixas = Caixas.importar(Guardar.lerCaixas(nivel));
  Blocos.usarCaixas(caixas);

  workspace.registerToolboxCategoryCallback('CAIXAS', function (ws) {
    return Blocos.gavetaDeCaixas(ws);
  });

  /* O mapa acompanha as variáveis que existem na tela, nos dois sentidos.

     Não dá para contar com VAR_CREATE e VAR_DELETE: o workspace.clear() do
     Blockly — trocar de nível, restaurar, abrir o gabarito — esvazia as
     variáveis sem disparar evento nenhum, e as caixas da tela apagada
     segurariam lugar para sempre. Reconciliar é barato (16 lugares), então se
     reconcilia em todo evento que muda o programa e, de novo, logo antes de
     cada decisão que depende do mapa: criar, rodar, tocar, gravar. */
  function reconciliarCaixas() {
    var vars = workspace.getAllVariables();
    var ids = [];
    for (var i = 0; i < vars.length; i++) ids.push(vars[i].getId());
    caixas.reconciliar(ids);
  }

  workspace.addChangeListener(function (e) {
    if (e.isUiEvent) return;
    reconciliarCaixas();
  });

  /* A 17ª caixa não nasce: a janelinha nem abre. O menu do campo de caixa só
     renomeia e apaga, então este botão é a única porta de criação.

     A frase vai no cabeçalho, e não em bolha: a bolha do mostrarErro se ancora
     num bloco, e aqui não há bloco culpado — como no "programa grande demais",
     que também é limite do robô sem peça para apontar. */
  workspace.registerButtonCallback('CRIAR_CAIXA', function () {
    reconciliarCaixas();
    if (!caixas.temLugar()) {
      spErro.textContent = 'O robô guarda ' + Caixas.N_CAIXAS +
                           ' caixas. Apague uma para criar outra.';
      Som.tocar('batida');
      return;
    }
    Blockly.Variables.createVariableButtonHandler(workspace, null, '');
  });
```

- [ ] **Step 5: `web/app.js` — gravar e restaurar**

Em `gravarPrograma`, troque a chamada por:

```js
    /* Reconciliado antes de gravar: um mapa com fantasmas gravado aqui
       voltaria cheio na próxima visita. */
    reconciliarCaixas();
    Guardar.gravar(Blockly.serialization.workspaces.save(workspace), nivel,
                   caixas.exportar());
```

Em `restaurarPrograma`, depois de `Blocos.fixarRaiz(workspace);`:

```js
      /* O mapa gravado pode ter fantasma — de uma versão com defeito, ou de
         mão humana no localStorage — e a carga não dispara evento para cada
         variável na hora. */
      reconciliarCaixas();
```

E no `catch` da mesma função, depois de `Blocos.limpar(workspace);`:

```js
      reconciliarCaixas();
```

- [ ] **Step 6: `web/app.js` — o PLAY zera, e a árvore é montada dentro do `try`**

Troque `rodar` por:

```js
  /* O PLAY zera as caixas quando alguma pode ter número na VM — e "pode ter"
     é o caixas.js quem sabe, porque a caixa apagada com número dentro já não
     está na tela nem na árvore. */
  function opcoesDoPrograma(ehPrograma) {
    if (!ehPrograma) return undefined;
    reconciliarCaixas();
    return caixas.temSujo() ? { zerarCaixas: true } : undefined;
  }

  function rodar(ast, ehPrograma) {
    spErro.textContent = '';
    esconderBolha();
    relatorEsperado = null;
    Som.tocar('play');
    var opcoes = opcoesDoPrograma(ehPrograma);
    var compilado;
    try {
      compilado = Compilador.compilar(ast, opcoes);
    } catch (e) {
      mostrarErro(e);
      return;
    }
    contarTentativa = ehPrograma;
    mapaPc = compilado.pcMap;
    robo.carregar(compilado.bytes);
    robo.rodar();
    if (opcoes) caixas.zerou();
  }
```

Em `rodarPrograma`, troque o começo e a compilação:

```js
  function rodarPrograma() {
    if (!Blocos.temTarefas(workspace)) {
      /* Montar a árvore pode lançar — uma caixa que não coube — e o erro tem
         que virar bolha, e não exceção solta no console. */
      var ast;
      try {
        ast = Blocos.workspaceParaAst(workspace);
      } catch (e) {
        mostrarErro(e);
        return;
      }
      rodar(ast, true);
      return;
    }
    spErro.textContent = '';
    esconderBolha();
    relatorEsperado = null;
    Som.tocar('play');
    var opcoes = opcoesDoPrograma(true);
    var compilado;
    try {
      compilado = Compilador.compilarTarefas(Blocos.workspaceParaTarefas(workspace),
                                             opcoes);
    } catch (e) {
      mostrarErro(e);
      return;
    }
    contarTentativa = true;
    mapaPc = compilado.pcMap;
    robo.carregar(compilado.bytes);
    robo.rodar();
    if (opcoes) caixas.zerou();
  }
```

No ouvinte de clique, troque `var pilha = Blocos.pilhaDoBloco(bloco);` por:

```js
    /* A caixa criada agora mesmo pode não ter passado ainda pelo ouvinte de
       eventos, que o Blockly dispara depois. */
    reconciliarCaixas();
    var pilha;
    try {
      pilha = Blocos.pilhaDoBloco(bloco);
    } catch (err) {
      mostrarErro(err);
      return;
    }
```

E troque `var no = Blocos.valorDoBloco(bloco);` por:

```js
      var no;
      try {
        no = Blocos.valorDoBloco(bloco);
      } catch (err) {
        mostrarErro(err);
        return;
      }
```

- [ ] **Step 7: Rodar os testes rápidos**

Run: `make test`
Expected: tudo PASS — C, ponta a ponta e JS, inclusive `es5.test.js` sobre o `app.js`.

- [ ] **Step 8: Rodar o teste de navegador novo**

Run: `TESTES_LENTOS=1 node --test --test-name-pattern="caixa" tests/navegador.test.js`
Expected: PASS nos dois testes novos. Se falhar, siga `superpowers:systematic-debugging` antes de mexer: leia a mensagem do `assert`, que diz qual das promessas quebrou.

- [ ] **Step 9: README**

No `README.md`, na seção que lista os limites conhecidos (a mesma onde o ciclo 3 escreveu que tocar numa peça troca o programa inteiro), acrescente:

```markdown
- **Caixa nova pode mostrar sobra.** Apagar uma caixa e criar outra logo em
  seguida, sem apertar PLAY no meio, dá à nova o lugar da apagada — e, até o
  próximo PLAY, o número que ficou lá. Uma caixa que já existia nunca troca de
  número.
```

- [ ] **Step 10: Commit e push**

```bash
git add web/app.js web/index.html README.md tests/navegador.test.js
git commit -m "Liga as caixas na tela: a gaveta cria, o toque guarda e o PLAY zera"
git push origin master
```

- [ ] **Step 11: A prova lenta, sem mexer em `web/`**

Run: `make test-lento`
Expected: PASS. É a prova de minutos; o commit já foi, e ele confere depois. Não edite nada em `web/` enquanto roda — o `gabaritos.test.js` dá vermelho falso com a árvore mexendo.

A prova no S24 FE e na placa é dele: `make test-tudo` recompila o firmware (a `VM` cresceu 64 bytes) e o app.
