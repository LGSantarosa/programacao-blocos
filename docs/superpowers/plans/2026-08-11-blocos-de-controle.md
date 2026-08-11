# Blocos de controle e gabarito no vocabulário do nível — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acrescentar quatro blocos de controle de fluxo (`repetir para sempre`, `parar`, `se…senão`, `repetir até chegar perto`) sem nenhum opcode novo na VM, e consertar o gabarito, que no nível Pequeno monta blocos que a criança daquele nível não lê nem consegue construir.

**Architecture:** O compilador ganha quatro casos que combinam `OP_JMP` e `OP_JMP_IF_GE`, que já existem em `core/vm.c`. A lógica de montagem do gabarito sai do `app.js` (que precisa de DOM e por isso não tem teste) para um módulo puro `web/gabarito.js`, testável em Node em milissegundos. Uma fase nova exercita três dos quatro blocos num teste que aperta PLAY de verdade.

**Tech Stack:** JavaScript ES5 sem transpilador (módulos UMD), Blockly 8 compilado, C11 para VM e física, `node:test` para JS, Makefile + binários próprios para C, Chromium headless via CDP para ponta a ponta.

**Spec:** [`docs/superpowers/specs/2026-08-11-blocos-de-controle-design.md`](../specs/2026-08-11-blocos-de-controle-design.md)

## Global Constraints

Estas valem para **todas** as tarefas. Não são opcionais e não são estilo.

- **ES5 estrito em tudo dentro de `web/`.** Nada de `let`, `const`, arrow function, template literal, `class`, spread/rest, `**`, nem método abreviado em objeto (`{ m() {} }` → escreva `{ m: function () {} }`). O alvo é o Safari do iOS 9 num iPad 2, que dá erro ao **carregar** o arquivo: uma arrow function perdida mata a página inteira antes da primeira linha rodar. Isso já aconteceu duas vezes. `tests/es5.test.js` é o guarda. Os arquivos de teste em `tests/` **não** têm essa restrição — eles rodam em Node.
- **Módulo novo em `web/` segue o padrão UMD do projeto:** IIFE recebendo `raiz`, `'use strict';` na primeira linha de dentro, e no fim `if (typeof module === 'object' && module.exports) module.exports = api; else raiz.<Nome> = api;` fechando com `})(typeof self !== 'undefined' ? self : globalThis);`.
- **Comentários em português**, explicando *por que*, não *o quê*. É a convenção do repositório inteiro; siga a densidade dos arquivos vizinhos.
- **Nenhuma mudança em `core/`, `host/` ou `firmware/src/`.** Nenhum opcode novo. Se um passo parecer exigir isso, pare e reporte — é sinal de que algo saiu do plano.
- **Cores exatas**, já usadas em `web/blocos.js` e repetidas em `web/niveis.js`: movimento `#0050f0`, laço `#f0c000`, sensor `#20b0f0`, início `#37c26b`.
- **Constantes que não podem divergir:** `SENSOR_DISTANCIA = 0`, `N_REGS = 4`, `MAX_INSTR = 256`, `INSTR_BYTES = 7`. Estão em `core/bytecode.h` e espelhadas em `web/compilador.js`.
- **Commits em português, no imperativo**, descrevendo a intenção e não o diff — siga `git log`.
- **Como rodar os testes:**
  - JS: `node --test tests/` a partir da raiz do repositório.
  - Tudo menos o lento: `node --test $(ls tests/*.test.js | grep -v gabaritos.test.js)`. Nada de `--test-skip-pattern`: esta máquina tem Node 18, e a flag só existe da 20 em diante.
  - Um arquivo só: `node --test tests/gabarito.test.js`
  - C: `make -C tests test`
  - Ponta a ponta do host: `bash tests/host_test.sh`
  - Gabaritos no Chromium (lento, ~4 min): `node --test tests/gabaritos.test.js`

---

## Estrutura de arquivos

| arquivo | responsabilidade | tarefa |
|---|---|---|
| `web/gabarito.js` | **novo.** Função pura: trilha da missão + nível → JSON de serialização do Blockly. Sem DOM, sem Blockly. | 1, 6 |
| `tests/gabarito.test.js` | **novo.** Testa `web/gabarito.js` em Node, em milissegundos. | 1, 6 |
| `web/app.js` | Perde `blocoAndar`; passa a delegar para `Gabarito.montar`. | 1 |
| `web/index.html` | Carrega o módulo novo. | 1 |
| `web/compilador.js` | Quatro casos novos em `gerar`. | 2 |
| `web/blocos.js` | Quatro definições de bloco e quatro casos em `blocoParaNo`. | 3 |
| `web/niveis.js` | Quais blocos cada nível oferece. | 4 |
| `tests/vm_test.c` | Um caso para salto **para trás**. | 5 |
| `web/missoes.js` | A fase 6 e o tipo de passo `ate_perto`. | 6 |

---

## Task 1: `web/gabarito.js` — corrente de `repetir` de até 5

Esta tarefa conserta um defeito que já está no ar e não depende de nenhum bloco novo. Ela sozinha vale um commit.

**O defeito:** no nível Pequeno, `Campos.paraBolinhas(n)` mostra o algarismo acima de cinco casas (`web/campos.js:17`). Os gabaritos pedem trechos de 6, 7, 10, 11 e 12 passos, então quatro das cinco fases exibem `repetir 6`, `repetir 12` — número que a criança daquele nível não lê, numa peça que ela não consegue construir, porque o clique nas bolinhas volta a 1 depois de cinco (`web/campos.js:56`).

**Files:**
- Create: `web/gabarito.js`
- Create: `tests/gabarito.test.js`
- Modify: `web/app.js:190-221` (some `blocoAndar`, muda o handler do botão)
- Modify: `web/index.html:283` (script novo depois de `missoes.js`)

**Interfaces:**
- Consumes: nada de tarefas anteriores. Lê `Missoes.LISTA` só no teste.
- Produces:
  - `Gabarito.pedacos(n)` → `Array<number>`, cada elemento entre 1 e 5, somando `n`. `[]` para `n < 1` ou não-numérico.
  - `Gabarito.montar(passos, nivel, passoS)` → `{ blocks: { languageVersion: 0, blocks: [ <estado do quando_play> ] } }`, pronto para `Blockly.serialization.workspaces.load`.
    - `passos`: array de `{ andar: n }` ou `{ girar: graus }`. (Task 6 acrescenta `{ ate_perto: cm, andar: n }`.)
    - `nivel`: `'pequeno' | 'medio' | 'grande'`.
    - `passoS`: número, segundos de um passo curto. Quem chama passa `Missoes.PASSO_S` (0.5).
  - `Gabarito.MAX_BOLINHAS` → `5`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `tests/gabarito.test.js`:

```javascript
'use strict';
/* O gabarito é a resposta que a criança segue quando travou. Se ele monta uma
   peça que ela não sabe ler — ou pior, que ela não consegue construir — a
   criança conclui que o erro é dela.

   No Pequeno o "repetir" vai até 5: acima disso as bolinhas viram algarismo, e
   o clique no campo volta para 1 em vez de passar de cinco. Então 12 passos
   têm que virar 5 + 5 + 2, e não um "repetir 12" que ela não alcança. */

const test = require('node:test');
const assert = require('node:assert');
const Gabarito = require('../web/gabarito.js');
const Campos = require('../web/campos.js');
const Missoes = require('../web/missoes.js');

const PASSO_S = Missoes.PASSO_S;

/* Todo bloco da árvore, achatado — inclusive os de dentro de inputs e os
   encadeados por next. */
function todosOsBlocos(estado) {
  const fora = [];
  (function anda(b) {
    if (!b) return;
    fora.push(b);
    if (b.inputs) {
      for (const nome of Object.keys(b.inputs)) anda(b.inputs[nome].block);
    }
    if (b.next) anda(b.next.block);
  })(estado);
  return fora;
}

function blocosDe(passos, nivel) {
  const doc = Gabarito.montar(passos, nivel, PASSO_S);
  return todosOsBlocos(doc.blocks.blocks[0]);
}

test('MAX_BOLINHAS acompanha as casas do campo, senão os dois divergem', () => {
  assert.strictEqual(Gabarito.MAX_BOLINHAS, Campos.CASAS);
});

test('pedacos enche de cinco em cinco e sobra o que sobrar', () => {
  assert.deepStrictEqual(Gabarito.pedacos(12), [5, 5, 2]);
  assert.deepStrictEqual(Gabarito.pedacos(6), [5, 1]);
  assert.deepStrictEqual(Gabarito.pedacos(5), [5]);
  assert.deepStrictEqual(Gabarito.pedacos(1), [1]);
  assert.deepStrictEqual(Gabarito.pedacos(13), [5, 5, 3]);
});

test('pedacos devolve vazio para o que não é quantidade', () => {
  assert.deepStrictEqual(Gabarito.pedacos(0), []);
  assert.deepStrictEqual(Gabarito.pedacos(-3), []);
  assert.deepStrictEqual(Gabarito.pedacos(NaN), []);
});

test('no Pequeno nenhum repetir passa de cinco, em fase nenhuma', () => {
  for (let i = 0; i < Missoes.quantas(); i++) {
    const missao = Missoes.daVez(i);
    for (const b of blocosDe(missao.gabarito, 'pequeno')) {
      if (b.type !== 'repetir') continue;
      assert.ok(b.fields.N <= Gabarito.MAX_BOLINHAS,
        `fase ${i + 1} "${missao.texto}" monta repetir ${b.fields.N} no Pequeno`);
    }
  }
});

test('doze passos no Pequeno viram três repetir, e não um repetir 12', () => {
  const blocos = blocosDe([{ andar: 12 }], 'pequeno');
  const repetir = blocos.filter((b) => b.type === 'repetir');
  assert.deepStrictEqual(repetir.map((b) => b.fields.N), [5, 5, 2]);
  /* Um "andar" dentro de cada repetir, nenhum solto. */
  assert.strictEqual(blocos.filter((b) => b.type === 'mover_frente').length, 3);
});

test('seis passos no Pequeno viram repetir 5 mais um andar solto', () => {
  const blocos = blocosDe([{ andar: 6 }], 'pequeno');
  assert.deepStrictEqual(
    blocos.filter((b) => b.type === 'repetir').map((b) => b.fields.N), [5]);
  assert.strictEqual(blocos.filter((b) => b.type === 'mover_frente').length, 2);
});

test('um passo só não ganha repetir em volta', () => {
  const blocos = blocosDe([{ andar: 1 }], 'pequeno');
  assert.strictEqual(blocos.filter((b) => b.type === 'repetir').length, 0);
  assert.strictEqual(blocos.filter((b) => b.type === 'mover_frente').length, 1);
});

test('no Médio e no Grande a trilha vira um bloco com os segundos somados', () => {
  for (const nivel of ['medio', 'grande']) {
    const blocos = blocosDe([{ andar: 12 }], nivel);
    assert.strictEqual(blocos.filter((b) => b.type === 'repetir').length, 0,
      `${nivel} não deve usar repetir`);
    const andar = blocos.filter((b) => b.type === 'mover_frente');
    assert.strictEqual(andar.length, 1);
    assert.strictEqual(andar[0].fields.SEG, 6);   /* 12 × 0,5 s */
  }
});

test('girar vira um bloco só, com o menu e os graus concordando', () => {
  const blocos = blocosDe([{ girar: -90 }], 'grande');
  const g = blocos.find((b) => b.type === 'girar');
  assert.ok(g, 'faltou o bloco girar');
  assert.strictEqual(g.fields.GRAUS, -90);
  assert.strictEqual(g.fields.DIR, '-90');
});

test('a raiz é um quando_play e tudo pendura nele', () => {
  const doc = Gabarito.montar([{ andar: 2 }, { girar: 90 }], 'grande', PASSO_S);
  const raiz = doc.blocks.blocks[0];
  assert.strictEqual(raiz.type, 'quando_play');
  assert.ok(raiz.inputs.CORPO.block, 'o corpo do quando_play está vazio');
  assert.strictEqual(doc.blocks.languageVersion, 0);
});

test('trilha vazia ainda dá um quando_play, para a tela não ficar em branco', () => {
  const raiz = Gabarito.montar([], 'grande', PASSO_S).blocks.blocks[0];
  assert.strictEqual(raiz.type, 'quando_play');
  assert.ok(!raiz.inputs, 'sem passos, o quando_play não tem corpo');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/gabarito.test.js`
Expected: FAIL — `Cannot find module '../web/gabarito.js'`

- [ ] **Step 3: Escrever `web/gabarito.js`**

```javascript
/* Monta o gabarito de uma missão como blocos, no vocabulário do nível.

   Está separado do app.js por um motivo prático: aqui não há DOM nem Blockly,
   então dá para conferir em Node, em milissegundos, que nenhuma fase monta uma
   peça que a criança daquele nível não sabe ler. Antes isso só apareceria no
   Chromium, quatro minutos depois — ou não apareceria, que foi o que
   aconteceu. */
(function (raiz) {
  'use strict';

  /* O teto das bolinhas. Acima disso o campo desiste do desenho e mostra o
     algarismo, e o clique nele volta para 1 em vez de passar de cinco: no
     Pequeno a criança não teria como construir a peça que o gabarito mostra.
     Tem que bater com CASAS em web/campos.js — há um teste guardando. */
  var MAX_BOLINHAS = 5;

  /* A velocidade da v1, a mesma que o compilador assume quando o nível não
     mostra o menu. */
  var VEL_PADRAO = '200';

  /* Enche de cinco em cinco e sobra o que sobrar: 12 = 5 + 5 + 2.
     Guloso e não equilibrado (6 vira 5 + 1, não 3 + 3) porque a regra precisa
     caber numa frase. Um "andar" solto no fim é legível; uma regra que às vezes
     divide bonito e às vezes não, não é. */
  function pedacos(n) {
    var v = Math.round(Number(n));
    var fora = [];
    if (!isFinite(v) || v < 1) return fora;
    while (v > MAX_BOLINHAS) {
      fora.push(MAX_BOLINHAS);
      v -= MAX_BOLINHAS;
    }
    fora.push(v);
    return fora;
  }

  function blocoAndar(segundos) {
    return { type: 'mover_frente',
             fields: { SEG: segundos, VEL: VEL_PADRAO } };
  }

  /* No Pequeno o caminho vira pilha de passos curtos, que é o vocabulário
     dela; nos outros vira um bloco só com os segundos somados, que é como
     alguém que lê número escreveria. Mesma distância, escrita na língua de quem
     está olhando. */
  function blocosDeAndar(passos, nivel, passoS) {
    var fora = [];
    var i, n;
    if (nivel !== 'pequeno') {
      /* Arredonda para o décimo, que é a precisão do campo. */
      fora.push(blocoAndar(Math.round(passos * passoS * 10) / 10));
      return fora;
    }
    var lista = pedacos(passos);
    for (i = 0; i < lista.length; i++) {
      n = lista[i];
      fora.push(n > 1
        ? { type: 'repetir', fields: { N: n },
            inputs: { CORPO: { block: blocoAndar(passoS) } } }
        : blocoAndar(passoS));
    }
    return fora;
  }

  /* Preenche DIR junto com GRAUS: o menu é o que a criança lê por ícone nos
     dois primeiros níveis, e deixá-lo no padrão faria um giro para a esquerda
     aparecer com a seta da direita. */
  function blocoGirar(graus) {
    return { type: 'girar',
             fields: { DIR: String(graus), GRAUS: graus } };
  }

  function blocosDoPasso(passo, nivel, passoS) {
    if (passo.girar !== undefined) return [blocoGirar(passo.girar)];
    return blocosDeAndar(passo.andar, nivel, passoS);
  }

  function montar(passos, nivel, passoS) {
    var lista = [];
    var i, j, blocos;
    for (i = 0; i < (passos || []).length; i++) {
      blocos = blocosDoPasso(passos[i], nivel, passoS);
      for (j = 0; j < blocos.length; j++) lista.push(blocos[j]);
    }

    /* Encadeia de trás para frente: cada bloco carrega o seguinte em "next". */
    var corpo = null;
    for (i = lista.length - 1; i >= 0; i--) {
      if (corpo) lista[i].next = { block: corpo };
      corpo = lista[i];
    }

    var raizNova = { type: 'quando_play', x: 40, y: 30 };
    if (corpo) raizNova.inputs = { CORPO: { block: corpo } };
    return { blocks: { languageVersion: 0, blocks: [raizNova] } };
  }

  var api = { montar: montar, pedacos: pedacos, MAX_BOLINHAS: MAX_BOLINHAS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Gabarito = api;
})(typeof self !== 'undefined' ? self : globalThis);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/gabarito.test.js`
Expected: PASS, 11 testes.

Se o teste `no Pequeno nenhum repetir passa de cinco` falhar aqui, o defeito não foi consertado — releia `blocosDeAndar`.

- [ ] **Step 5: Ligar no `app.js`**

Em `web/app.js`, **apague** o bloco de comentário e a função `blocoAndar` (linhas 178-202, do primeiro `/* Monta o gabarito` até o fecho da função) e **substitua** o handler seguinte por:

```javascript
  /* Monta o gabarito no espaço de trabalho em vez de descrever em palavras: a
     criança que ainda não lê precisa ver a peça, não a instrução. Ela aperta
     PLAY e assiste — depois pode desmontar e mexer.

     A trilha é uma só; quem a desenha na língua do nível é o web/gabarito.js,
     que fica separado justamente para poder ser testado sem navegador. */
  btGabarito.addEventListener('click', function () {
    Blockly.serialization.workspaces.load(
      Gabarito.montar(missao.gabarito || [], nivel, Missoes.PASSO_S), workspace);
    aplicarNivel();
    Som.tocar('play');
  });
```

Note que o comentário duplicado que existia nas linhas 178-189 do original desaparece junto — era uma colagem repetida.

- [ ] **Step 6: Carregar o módulo na página**

Em `web/index.html`, depois da linha `<script src="missoes.js"></script>`, acrescente:

```html
  <script src="gabarito.js"></script>
```

Não mexa em `web/ipad.html`: ela não carrega `app.js` nem `missoes.js` e não tem botão de gabarito.

- [ ] **Step 7: Rodar a bateria rápida**

Run: `node --test $(ls tests/*.test.js | grep -v gabaritos.test.js)`
Expected: PASS. Em particular `es5.test.js` tem que aprovar `gabarito.js` — se acusar `let / const` ou arrow function, você escreveu JS moderno num arquivo que precisa abrir num iPad de 2011.

- [ ] **Step 8: Rodar o teste lento, que é o que prova**

Run: `node --test tests/gabaritos.test.js`
Expected: PASS, ~3 min, 15 execuções (5 fases × 3 níveis). Prova que o gabarito reescrito continua resolvendo as fases.

Se falhar em `pequeno/...`, a corrente de `repetir` mudou a distância percorrida — não deveria: `pedacos` soma exatamente `n`. Confira que `blocoAndar(passoS)` está dentro de cada `repetir`, e não `blocoAndar(n * passoS)`.

- [ ] **Step 9: Commit**

```bash
git add web/gabarito.js tests/gabarito.test.js web/app.js web/index.html
git commit -F - <<'EOF'
Escreve o gabarito no vocabulário do nível Pequeno

No Pequeno o gabarito montava "repetir 6", "repetir 12" — algarismo que a
criança daquele nível não lê, numa peça que ela não consegue nem construir,
porque o clique nas bolinhas volta a 1 depois de cinco. Quatro das cinco
fases, incluindo a primeira que ela encontra.

Agora 12 vira 5 + 5 + 2: uma corrente de repetir que ela alcança clicando.

A montagem saiu do app.js para web/gabarito.js, sem DOM nem Blockly. Foi o
que permitiu descobrir isto: dá para conferir em Node, em milissegundos, que
nenhuma fase monta um repetir maior que cinco no Pequeno.
EOF
```

---

## Task 2: `web/compilador.js` — os quatro casos novos

Puro, sem Blockly e sem DOM. Vem antes dos blocos porque é onde mora a decisão difícil.

**Files:**
- Modify: `web/compilador.js:33-88` (dentro de `gerar`)
- Test: `tests/compilador.test.js`

**Interfaces:**
- Consumes: `compilar(ast)` e `OP` de `web/compilador.js`, já existentes.
- Produces: quatro nós de AST que Task 3 vai gerar a partir dos blocos:
  - `{ op: 'parar', blockId }`
  - `{ op: 'repetir_sempre', corpo: [...], blockId }`
  - `{ op: 'se_senao', cm: <número>, entao: [...], senao: [...], blockId }`
  - `{ op: 'repetir_ate_perto', cm: <número>, corpo: [...], blockId }`

**O bytecode gerado, que os testes fixam:**

```
parar                            repetir para sempre
  HALT                             inicio:
                                     <corpo>
                                     JMP inicio

se…senão                         repetir até chegar perto
  JMP_IF_GE sens, cm, @senao       inicio:
  <ENTAO>                            JMP_IF_GE sens, cm, @corpo
  JMP @fim                           JMP @fim
 senao:                            corpo:
  <SENAO>                            <corpo>
 fim:                                JMP inicio
                                   fim:
```

`JMP_IF_GE` salta quando a leitura é **maior ou igual** ao limite, ou seja quando *não* há obstáculo dentro da distância. Por isso o alvo é o `senão` no condicional e o corpo no laço — parece invertido e não é.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao fim de `tests/compilador.test.js`:

```javascript
test('parar vira um HALT antes do HALT final', () => {
  const { bytes } = compilar([{ op: 'parar', blockId: 'p' }]);
  assert.strictEqual(bytes.length, 2 * 7);
  assert.strictEqual(bytes[0], OP.HALT);
  assert.strictEqual(bytes[7], OP.HALT);
});

test('repetir para sempre fecha com um JMP para trás', () => {
  const { bytes } = compilar([
    { op: 'repetir_sempre', blockId: 's', corpo: [
      { op: 'girar', graus: 90, blockId: 'g' },
    ] },
  ]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(bytes.length, 3 * 7);
  assert.strictEqual(bytes[0], OP.TURN);
  assert.strictEqual(bytes[7], OP.JMP);
  assert.strictEqual(dv.getInt16(8, true), 0);      /* volta para o pc 0 */
  assert.strictEqual(bytes[14], OP.HALT);
});

test('repetir para sempre com corpo vazio salta para si mesmo', () => {
  /* Não trava: a VM executa uma instrução por tick, então é um laço ocioso que
     o botão PARAR encerra. Proibir custaria mais do que vale. */
  const { bytes } = compilar([{ op: 'repetir_sempre', blockId: 's', corpo: [] }]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(bytes[0], OP.JMP);
  assert.strictEqual(dv.getInt16(1, true), 0);
});

test('se…senão pula o então quando não há obstáculo', () => {
  const { bytes } = compilar([
    { op: 'se_senao', cm: 20, blockId: 'x',
      entao: [{ op: 'girar', graus: 90, blockId: 'a' }],
      senao: [{ op: 'girar', graus: -90, blockId: 'b' }] },
  ]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(bytes.length, 5 * 7);
  assert.strictEqual(bytes[0], OP.JMP_IF_GE);
  assert.strictEqual(dv.getInt16(1, true), 0);      /* sensor de distância */
  assert.strictEqual(dv.getInt16(3, true), 20);
  assert.strictEqual(dv.getInt16(5, true), 3);      /* longe → vai ao senão */
  assert.strictEqual(bytes[7], OP.TURN);            /* então */
  assert.strictEqual(bytes[14], OP.JMP);
  assert.strictEqual(dv.getInt16(15, true), 4);     /* então pula o senão */
  assert.strictEqual(bytes[21], OP.TURN);           /* senão */
  assert.strictEqual(bytes[28], OP.HALT);
});

test('se…senão com o ramo senão vazio ainda salta para o fim', () => {
  const { bytes } = compilar([
    { op: 'se_senao', cm: 30, blockId: 'x',
      entao: [{ op: 'girar', graus: 90, blockId: 'a' }], senao: [] },
  ]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(bytes.length, 4 * 7);
  assert.strictEqual(dv.getInt16(5, true), 3);      /* senão começa no fim */
  assert.strictEqual(dv.getInt16(15, true), 3);     /* e o pulo também */
});

test('repetir até perto testa antes de rodar o corpo', () => {
  const { bytes } = compilar([
    { op: 'repetir_ate_perto', cm: 20, blockId: 'a', corpo: [
      { op: 'girar', graus: 90, blockId: 'g' },
    ] },
  ]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(bytes.length, 5 * 7);
  assert.strictEqual(bytes[0], OP.JMP_IF_GE);
  assert.strictEqual(dv.getInt16(3, true), 20);
  assert.strictEqual(dv.getInt16(5, true), 2);      /* longe → entra no corpo */
  assert.strictEqual(bytes[7], OP.JMP);
  assert.strictEqual(dv.getInt16(8, true), 4);      /* perto → sai */
  assert.strictEqual(bytes[14], OP.TURN);           /* corpo */
  assert.strictEqual(bytes[21], OP.JMP);
  assert.strictEqual(dv.getInt16(22, true), 0);     /* volta para o teste */
  assert.strictEqual(bytes[28], OP.HALT);
});

test('os laços novos não gastam registrador', () => {
  /* Só o "repetir N vezes" usa DEC_JNZ, e o limite de quatro aninhados é só
     dele. Quatro repetir dentro de dois laços novos tem que compilar. */
  let dentro = { op: 'girar', graus: 90, blockId: 'g' };
  for (let i = 0; i < 4; i++) {
    dentro = { op: 'repetir', vezes: 2, blockId: 'r' + i, corpo: [dentro] };
  }
  assert.doesNotThrow(() => compilar([
    { op: 'repetir_sempre', blockId: 's', corpo: [
      { op: 'repetir_ate_perto', cm: 20, blockId: 'a', corpo: [dentro] },
    ] },
  ]));
});

test('cada instrução nova aponta para o bloco que a gerou', () => {
  const { pcMap } = compilar([{ op: 'parar', blockId: 'meu-parar' }]);
  assert.strictEqual(pcMap[0], 'meu-parar');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/compilador.test.js`
Expected: FAIL, oito testes, todos com `Bloco desconhecido: parar` / `repetir_sempre` / `se_senao` / `repetir_ate_perto`.

- [ ] **Step 3: Escrever os quatro casos**

Em `web/compilador.js`, dentro do `switch (no.op)` de `gerar`, depois do caso `'se_obstaculo'` e antes do `default`:

```javascript
          case 'parar':
            emitir(OP.HALT, 0, 0, 0, no.blockId);
            break;

          case 'repetir_sempre': {
            /* Primeiro uso real do OP_JMP: ele existe na VM desde a v1 e nunca
               tinha sido emitido por ninguém. */
            var inicioSempre = instrucoes.length;
            gerar(no.corpo || []);
            emitir(OP.JMP, inicioSempre, 0, 0, no.blockId);
            break;
          }

          case 'se_senao': {
            /* JMP_IF_GE salta quando a leitura é maior ou igual, isto é quando
               NÃO há obstáculo dentro da distância. Por isso o alvo do salto é
               o ramo "senão", e não o "então". */
            var testeSe = instrucoes.length;
            emitir(OP.JMP_IF_GE, SENSOR_DISTANCIA, Math.round(no.cm), 0, no.blockId);
            gerar(no.entao || []);
            var pulaSenao = instrucoes.length;
            emitir(OP.JMP, 0, 0, 0, no.blockId);
            instrucoes[testeSe].c = instrucoes.length;
            gerar(no.senao || []);
            instrucoes[pulaSenao].a = instrucoes.length;
            break;
          }

          case 'repetir_ate_perto': {
            /* Testa antes de rodar, não depois. Um do-while custaria duas
               instruções a menos, mas daria um passo mesmo já estando colado na
               parede — e o bloco diz "até chegar", não "pelo menos uma vez". */
            var inicioAte = instrucoes.length;
            emitir(OP.JMP_IF_GE, SENSOR_DISTANCIA, Math.round(no.cm), 0, no.blockId);
            var saidaAte = instrucoes.length;
            emitir(OP.JMP, 0, 0, 0, no.blockId);
            instrucoes[inicioAte].c = instrucoes.length;
            gerar(no.corpo || []);
            emitir(OP.JMP, inicioAte, 0, 0, no.blockId);
            instrucoes[saidaAte].a = instrucoes.length;
            break;
          }
```

Nomes de variável distintos (`inicioSempre`, `inicioAte`) de propósito: `var` num `switch` é function-scoped, então dois `var inicio` seriam a mesma variável.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/compilador.test.js`
Expected: PASS, todos.

- [ ] **Step 5: Conferir que nada mais quebrou**

Run: `node --test $(ls tests/*.test.js | grep -v gabaritos.test.js)`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/compilador.js tests/compilador.test.js
git commit -F - <<'EOF'
Compila os quatro blocos de controle sem opcode novo

repetir para sempre, parar, se…senão e repetir até chegar perto saem todos
de JMP e JMP_IF_GE, que já estavam na VM. É o primeiro uso real do OP_JMP:
ele existe desde a v1 e nunca tinha sido emitido por ninguém.

O "repetir até" testa antes de rodar, não depois. Um do-while custaria duas
instruções a menos, mas daria um passo mesmo já estando colado na parede — e
a peça tem que fazer o que está escrito nela.

Nenhum dos laços novos gasta registrador: o limite de quatro aninhados
continua sendo só do "repetir N vezes".
EOF
```

---

## Task 3: `web/blocos.js` — as quatro peças

**Files:**
- Modify: `web/blocos.js:45-148` (definições) e `web/blocos.js:167-197` (`blocoParaNo`)
- Test: `tests/blocos.test.js`

**Interfaces:**
- Consumes: os quatro nós de AST fixados na Task 2.
- Produces: os tipos de bloco `repetir_sempre`, `parar`, `se_senao`, `repetir_ate_perto`, com os campos `CM` (número), `T1`/`T2` (`field_label`) e os inputs `CORPO` e `SENAO`.

**Decisões que o código precisa respeitar:**

1. `repetir_sempre` e `parar` têm `previousStatement: null` e **nenhum** `nextStatement`. Nada depois deles jamais roda; deixar o encaixe de baixo seria mentir com a geometria da peça, e a criança encaixaria um bloco ali esperando que acontecesse.
2. `repetir para sempre`, `parar tudo` e `senão` são **texto cru** no `message`, não `field_label`. Rótulo virou campo no ciclo A por um motivo único: precisar sumir no Pequeno junto com o número que acompanha. Nenhum destes acompanha número. E como texto cru eles seguem legíveis quando um bloco montado no Grande fica no espaço de trabalho e se desce de nível — como campo, o `se…senão` viraria `👁 20` com os dois ramos indistinguíveis.
3. `se_senao` e `repetir_ate_perto` mantêm `T1`/`T2` como campos, iguais ao `se_obstaculo`, porque acompanham o número em `CM`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao fim de `tests/blocos.test.js`:

```javascript
test('os quatro blocos de controle existem', () => {
  for (const t of ['repetir_sempre', 'parar', 'se_senao', 'repetir_ate_perto']) {
    assert.ok(Blockly.Blocks[t], `faltou o bloco ${t}`);
  }
});

test('parar e para sempre não têm encaixe embaixo', () => {
  /* Nada depois deles jamais roda. Sem o bump, a criança não consegue nem
     tentar encaixar e ficar esperando. */
  const ws = carregar([{ type: 'parar' }, { type: 'repetir_sempre' }]);
  for (const t of ['parar', 'repetir_sempre']) {
    const b = ws.getBlocksByType(t, false)[0];
    assert.strictEqual(b.nextConnection, null, `${t} não devia ter saída embaixo`);
    assert.ok(b.previousConnection, `${t} precisa encaixar em algo acima`);
  }
});

test('parar vira um nó parar na AST', () => {
  const ast = astDe({
    type: 'quando_play',
    inputs: { CORPO: { block: { type: 'parar' } } },
  });
  assert.strictEqual(ast.length, 1);
  assert.strictEqual(ast[0].op, 'parar');
});

test('repetir para sempre carrega o corpo', () => {
  const ast = astDe({
    type: 'quando_play',
    inputs: { CORPO: { block: {
      type: 'repetir_sempre',
      inputs: { CORPO: { block: { type: 'girar', fields: { GRAUS: 90 } } } },
    } } },
  });
  assert.strictEqual(ast[0].op, 'repetir_sempre');
  assert.strictEqual(ast[0].corpo.length, 1);
  assert.strictEqual(ast[0].corpo[0].op, 'girar');
});

test('se…senão separa os dois ramos', () => {
  const ast = astDe({
    type: 'quando_play',
    inputs: { CORPO: { block: {
      type: 'se_senao',
      fields: { CM: 25 },
      inputs: {
        CORPO: { block: { type: 'parar' } },
        SENAO: { block: { type: 'girar', fields: { GRAUS: 90 } } },
      },
    } } },
  });
  assert.strictEqual(ast[0].op, 'se_senao');
  assert.strictEqual(ast[0].cm, 25);
  assert.strictEqual(ast[0].entao[0].op, 'parar');
  assert.strictEqual(ast[0].senao[0].op, 'girar');
});

test('se…senão com ramos vazios dá listas vazias, não undefined', () => {
  const ast = astDe({
    type: 'quando_play',
    inputs: { CORPO: { block: { type: 'se_senao' } } },
  });
  assert.deepStrictEqual(ast[0].entao, []);
  assert.deepStrictEqual(ast[0].senao, []);
});

test('repetir até perto leva a distância e o corpo', () => {
  const ast = astDe({
    type: 'quando_play',
    inputs: { CORPO: { block: {
      type: 'repetir_ate_perto',
      fields: { CM: 15 },
      inputs: { CORPO: { block: { type: 'mover_frente', fields: { SEG: 0.5 } } } },
    } } },
  });
  assert.strictEqual(ast[0].op, 'repetir_ate_perto');
  assert.strictEqual(ast[0].cm, 15);
  assert.strictEqual(ast[0].corpo[0].op, 'frente');
});

test('o senão é texto cru, para não sumir no Pequeno', () => {
  /* Se fosse field_label com nome T3, ele sumiria junto com T1/T2 no Pequeno e
     os dois ramos ficariam indistinguíveis num bloco herdado do Grande. */
  const b = carregar([{ type: 'se_senao' }]).getBlocksByType('se_senao', false)[0];
  assert.strictEqual(b.getField('T3'), null, 'o senão não deve ser um campo');
  assert.ok(b.getField('CM'), 'a distância continua sendo campo');
  assert.ok(b.getField('T1'), 'o "se obstáculo a menos de" continua campo');
});

test('parar e para sempre não têm campo nenhum que possa sumir', () => {
  const ws = carregar([{ type: 'parar' }, { type: 'repetir_sempre' }]);
  for (const t of ['parar', 'repetir_sempre']) {
    const b = ws.getBlocksByType(t, false)[0];
    for (const nome of ['T1', 'T2', 'T3']) {
      assert.strictEqual(b.getField(nome), null,
        `${t} não devia ter o campo ${nome}: o texto tem que sobreviver ao Pequeno`);
    }
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/blocos.test.js`
Expected: FAIL — `faltou o bloco repetir_sempre` e erros de bloco desconhecido.

- [ ] **Step 3: Definir os quatro blocos**

Em `web/blocos.js`, dentro do array de `Blockly.defineBlocksWithJsonArray`, depois do `se_obstaculo`:

```javascript
      {
        type: 'repetir_sempre',
        /* Texto cru, não campo: não acompanha número nenhum, então não tem
           motivo para sumir no Pequeno — e um bloco herdado do Grande que
           descesse de nível viraria um 🔁 mudo, igual ao repetir comum. */
        message0: '🔁 repetir para sempre',
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        previousStatement: null,
        /* Sem nextStatement de propósito: nada depois dele jamais roda, e o
           encaixe de baixo seria uma promessa falsa. */
        colour: COR_LACO,
        tooltip: 'Repete os blocos de dentro sem parar, até apertar PARAR.',
      },
      {
        type: 'parar',
        message0: '🛑 parar tudo',
        previousStatement: null,
        /* Idem: o programa acaba aqui. */
        colour: COR_MOVIMENTO,
        tooltip: 'O robô para e o programa acaba, mesmo dentro de um repetir.',
      },
      {
        type: 'se_senao',
        message0: '👁 %1 %2 %3',
        args0: [
          { type: 'field_label', name: 'T1', text: 'se obstáculo a menos de' },
          { type: 'field_number', name: 'CM', value: 20, min: 2, max: 400, precision: 1 },
          { type: 'field_label', name: 'T2', text: 'cm' },
        ],
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        /* Texto cru: é o que separa os dois ramos, e um bloco herdado do
           Grande precisa continuar legível num nível abaixo. */
        message2: 'senão',
        message3: '%1',
        args3: [{ type: 'input_statement', name: 'SENAO' }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_SENSOR,
        tooltip: 'Faz uns blocos se tiver algo perto na frente, e outros se não tiver.',
      },
      {
        type: 'repetir_ate_perto',
        /* Amarelo com olho: a forma e a cor dizem laço, que é o conceito; o
           ícone diz sensor. Ciano ensinaria a coisa errada — o que ele faz é
           repetir. */
        message0: '🔁👁 %1 %2 %3',
        args0: [
          { type: 'field_label', name: 'T1', text: 'repetir até chegar a menos de' },
          { type: 'field_number', name: 'CM', value: 20, min: 2, max: 400, precision: 1 },
          { type: 'field_label', name: 'T2', text: 'cm' },
        ],
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_LACO,
        tooltip: 'Repete os blocos de dentro até o robô chegar perto de alguma coisa.',
      },
```

- [ ] **Step 4: Traduzir para a AST**

Em `web/blocos.js`, dentro de `blocoParaNo`, depois do caso `'se_obstaculo'`:

```javascript
      case 'parar':
        return { op: 'parar', blockId: id };
      case 'repetir_sempre':
        return {
          op: 'repetir_sempre',
          corpo: pilhaParaAst(b.getInputTargetBlock('CORPO')),
          blockId: id,
        };
      case 'se_senao':
        return {
          op: 'se_senao',
          cm: Number(b.getFieldValue('CM')),
          entao: pilhaParaAst(b.getInputTargetBlock('CORPO')),
          senao: pilhaParaAst(b.getInputTargetBlock('SENAO')),
          blockId: id,
        };
      case 'repetir_ate_perto':
        return {
          op: 'repetir_ate_perto',
          cm: Number(b.getFieldValue('CM')),
          corpo: pilhaParaAst(b.getInputTargetBlock('CORPO')),
          blockId: id,
        };
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/blocos.test.js`
Expected: PASS, todos.

- [ ] **Step 6: Atualizar o comentário do topo do arquivo**

`web/blocos.js:1` diz "Os seis blocos da v1". Agora são dez mais o `quando_play`. Troque por:

```javascript
/* Os blocos e a tradução do workspace para a AST do compilador. */
```

- [ ] **Step 7: Bateria rápida e commit**

Run: `node --test $(ls tests/*.test.js | grep -v gabaritos.test.js)`
Expected: PASS.

```bash
git add web/blocos.js tests/blocos.test.js
git commit -F - <<'EOF'
Desenha as quatro peças de controle

O "parar tudo" e o "repetir para sempre" não têm encaixe embaixo, porque
nada depois deles jamais roda: com o bump, a criança encaixaria um bloco ali
e ficaria esperando que ele acontecesse.

O texto dessas duas peças e o "senão" ficam crus, não como campo. Rótulo
virou campo no ciclo A só para poder sumir no Pequeno junto com o número que
acompanha, e nenhum destes acompanha número. Como campo, um se…senão herdado
do Grande viraria "👁 20" com os dois ramos indistinguíveis.
EOF
```

---

## Task 4: `web/niveis.js` — quem oferece o quê

**Files:**
- Modify: `web/niveis.js:17-37` (`DEFINICOES`) e `web/niveis.js:56-93` (`caixaXml`)
- Test: `tests/niveis.test.js`

**Interfaces:**
- Consumes: os tipos de bloco da Task 3.
- Produces: `Niveis.caixaXml(nivel)` passa a oferecer 4 / 8 / 10 blocos.

| | Mover | Repetir | Sentir | total |
|---|---|---|---|---|
| Pequeno | frente, trás, girar | repetir | — | 4 — **intacto** |
| Médio | + esperar, **parar** | + **para sempre** | se obstáculo | 8 |
| Grande | idem Médio | + **até perto** | + **se…senão** | 10 |

O Pequeno não recebe nada: ele vale por ser pequeno, e `para sempre` ali seria armadilha porque a fase nunca terminaria. **O mapa `campos` não muda** — os blocos novos só usam nomes de campo que já estão lá.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao fim de `tests/niveis.test.js`:

```javascript
test('o Pequeno continua com quatro blocos e nenhum de controle', () => {
  const xml = Niveis.caixaXml('pequeno');
  for (const t of ['repetir_sempre', 'parar', 'se_senao', 'repetir_ate_perto']) {
    assert.ok(!xml.includes('"' + t + '"'), `Pequeno não deve oferecer ${t}`);
  }
});

test('o Médio ganha parar e repetir para sempre, e só isso', () => {
  const xml = Niveis.caixaXml('medio');
  assert.ok(xml.includes('"parar"'), 'faltou parar no Médio');
  assert.ok(xml.includes('"repetir_sempre"'), 'faltou repetir para sempre no Médio');
  assert.ok(!xml.includes('"se_senao"'), 'se…senão é só do Grande');
  assert.ok(!xml.includes('"repetir_ate_perto"'), 'até perto é só do Grande');
});

test('o Grande oferece os dez', () => {
  const xml = Niveis.caixaXml('grande');
  for (const t of ['mover_frente', 'mover_tras', 'girar', 'esperar', 'parar',
                   'repetir', 'repetir_sempre', 'repetir_ate_perto',
                   'se_obstaculo', 'se_senao']) {
    assert.ok(xml.includes('"' + t + '"'), `faltou ${t} no Grande`);
  }
});

test('cada nível oferece a quantidade certa de blocos', () => {
  const quantos = function (nivel) {
    return (Niveis.caixaXml(nivel).match(/<block /g) || []).length;
  };
  assert.strictEqual(quantos('pequeno'), 5);   /* girar aparece duas vezes */
  assert.strictEqual(quantos('medio'), 8);
  assert.strictEqual(quantos('grande'), 10);
});

test('o mapa de campos não precisou de linha nova', () => {
  /* Os blocos novos reaproveitam CM, T1 e T2. Se alguém acrescentar um campo
     aqui, é sinal de que criou nome novo sem necessidade. */
  const campos = Object.keys(Niveis.definicao('grande').campos).sort();
  assert.deepStrictEqual(campos,
    ['CM', 'DIR', 'GRAUS', 'N', 'SEG', 'T1', 'T2', 'VEL']);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/niveis.test.js`
Expected: FAIL — `faltou parar no Médio`, contagens 4 / 6 / 6.

- [ ] **Step 3: Acrescentar os tipos às definições**

Em `web/niveis.js`, nas listas `blocos`:

```javascript
    medio: {
      blocos: ['mover_frente', 'mover_tras', 'girar', 'esperar', 'parar',
               'repetir', 'repetir_sempre', 'se_obstaculo'],
```

```javascript
    grande: {
      blocos: ['mover_frente', 'mover_tras', 'girar', 'esperar', 'parar',
               'repetir', 'repetir_sempre', 'repetir_ate_perto',
               'se_obstaculo', 'se_senao'],
```

O `pequeno` fica exatamente como está. O mapa `campos` dos três também.

- [ ] **Step 4: Montar as categorias**

Em `web/niveis.js`, dentro de `caixaXml`, depois da linha `if (tem('esperar')) movimento += bloco('esperar');`:

```javascript
    if (tem('parar')) movimento += bloco('parar');
```

E substitua as duas categorias finais por:

```javascript
    var laco = '';
    if (tem('repetir')) laco += bloco('repetir');
    if (tem('repetir_sempre')) laco += bloco('repetir_sempre');
    if (tem('repetir_ate_perto')) laco += bloco('repetir_ate_perto');
    if (laco) {
      xml += '<category name="Repetir" colour="' + COR_LACO + '">' +
             laco + '</category>';
    }

    var sentir = '';
    if (tem('se_obstaculo')) sentir += bloco('se_obstaculo');
    if (tem('se_senao')) sentir += bloco('se_senao');
    if (sentir) {
      xml += '<category name="Sentir" colour="' + COR_SENSOR + '">' +
             sentir + '</category>';
    }
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/niveis.test.js`
Expected: PASS, todos.

- [ ] **Step 6: Bateria rápida e commit**

Run: `node --test $(ls tests/*.test.js | grep -v gabaritos.test.js)`
Expected: PASS.

```bash
git add web/niveis.js tests/niveis.test.js
git commit -F - <<'EOF'
Distribui os blocos de controle entre Médio e Grande

O Pequeno fica intacto, com quatro blocos. Ele vale justamente por ser
pequeno: cada peça nova é uma escolha a mais na frente de quem tem quatro
anos, e "repetir para sempre" ali seria armadilha, porque a fase nunca
terminaria.

Médio ganha parar e repetir para sempre, que não têm condição embutida.
Grande ganha se…senão e repetir até chegar perto, que têm.
EOF
```

---

## Task 5: `tests/vm_test.c` — salto para trás

`tests/vm_test.c` já tem `teste_jmp_incondicional`, mas ele só cobre salto **para frente** — pular por cima de uma instrução. Os três blocos novos emitem salto **para trás**, que é o que fecha um laço, e isso a VM nunca executou em teste nenhum.

**Files:**
- Modify: `tests/vm_test.c` (uma função nova, mais uma linha no `main`)

**Interfaces:**
- Consumes: as ferramentas que já existem no arquivo — `emit(p, op, a, b, c)`, `preparar(&vm, prog, sizeof(prog))`, `rodar_ate_parar(&vm)`, `checar_trace(esperado, n)`, `fake_dist_set(cm)`, `CHECK(cond)`.
- Produces: nada consumido por outra tarefa.

- [ ] **Step 1: Escrever o teste que falha**

Antes de `int main(void)` em `tests/vm_test.c`:

```c
/* O JMP para trás é o que fecha um laço, e é o que os blocos "repetir para
   sempre" e "repetir até chegar perto" emitem. O teste que já existia só cobre
   salto para frente, pulando por cima de uma instrução — caminho diferente.

   O programa aqui é exatamente a forma que o compilador gera para o "repetir
   até chegar perto": testa antes, corpo no meio, volta no fim. */
static void teste_jmp_para_tras_fecha_laco(void) {
    printf("teste_jmp_para_tras_fecha_laco\n");
    VM vm;
    uint8_t prog[5 * INSTR_BYTES], *p = prog;
    p = emit(p, OP_JMP_IF_GE, SENSOR_DISTANCIA, 20, 2);  /* longe → corpo   */
    p = emit(p, OP_JMP, 4, 0, 0);                        /* perto → sai     */
    p = emit(p, OP_MOTOR, 5, 5, 0);                      /* corpo           */
    p = emit(p, OP_JMP, 0, 0, 0);                        /* volta: p/ trás  */
    p = emit(p, OP_HALT, 0, 0, 0);
    preparar(&vm, prog, sizeof(prog));

    /* Longe: entra no corpo e o salto para trás recomeça o laço. */
    fake_dist_set(100);
    vm_tick(&vm);
    CHECK(vm.pc == 2);
    vm_tick(&vm);
    CHECK(vm.pc == 3);
    vm_tick(&vm);
    CHECK(vm.pc == 0);          /* aqui está o salto para trás */
    CHECK(vm.rodando == 1);

    /* Perto: cai para o salto de saída e o programa acaba. */
    fake_dist_set(10);
    vm_tick(&vm);
    CHECK(vm.pc == 1);
    vm_tick(&vm);
    CHECK(vm.pc == 4);
    vm_tick(&vm);
    CHECK(vm.rodando == 0);
}
```

`preparar` já chama `vm_load`, `fake_trace_reset` e `vm_run`, e deixa o relógio em 1000 com o sensor em 400 cm — por isso o `fake_dist_set` vem depois dela.

- [ ] **Step 2: Registrar no `main`**

Em `int main(void)`, depois de `teste_jmp_incondicional();`:

```c
    teste_jmp_para_tras_fecha_laco();
```

- [ ] **Step 3: Compilar e rodar**

Run: `make -C tests test`
Expected: PASS. O `vm_test` imprime o nome de cada teste e sai com 0.

Se der erro de compilação sobre `SENSOR_DISTANCIA`, confira que `core/bytecode.h` está no include path — o Makefile já passa `-I../core`.

- [ ] **Step 4: Commit**

```bash
git add tests/vm_test.c
git commit -F - <<'EOF'
Testa o salto para trás, que é o que fecha um laço

O teste que já existia cobria só JMP para frente, pulando por cima de uma
instrução. Os blocos novos emitem salto para trás, e a VM nunca tinha
executado esse caminho em teste nenhum.
EOF
```

---

## Task 6: a fase 6 e o gabarito de três caras

**Files:**
- Modify: `web/missoes.js:42-65` (`LISTA`) e o cabeçalho de constantes
- Modify: `web/gabarito.js` (o tipo de passo `ate_perto`)
- Test: `tests/missoes.test.js`, `tests/gabarito.test.js`

**Interfaces:**
- Consumes: `Gabarito.montar` da Task 1; os tipos de bloco da Task 3; as listas de nível da Task 4.
- Produces: um tipo de passo novo na trilha das missões: `{ ate_perto: <cm>, andar: <n> }`, que guarda as duas leituras do mesmo caminho — a condição e o equivalente em passos cegos.

**A fase:**

```
texto:       "Chegue bem pertinho da parede"
obstáculos:  []                             (arena vazia — sem o bloco)
início:      (1.00, 0.25) olhando para cima
estrela:     (1.00, 1.70)
trilha:      [{ ate_perto: 20, andar: 13 }]
```

**As três caras da mesma trilha:**

| nível | forma |
|---|---|
| Pequeno | corrente de `repetir` somando 13 passos (5 + 5 + 3), sem sensor |
| Médio | `repetir para sempre { se obstáculo < 20 { parar } ; andar 0,5 s }` |
| Grande | `repetir até < 20 cm { andar 0,5 s }` |

No Médio o teste vem **antes** do `andar` dentro do laço — é o que torna as duas formas equivalentes ao `repetir até`, que também testa antes.

**A aritmética, que o teste lento vai julgar:** passo curto de 0,5 s ≈ 11,7 cm. De y = 0,25, o laço para quando `2,00 − (y + 0,08) < 0,20`, ou seja `y > 1,72`. Passo 12 → 1,654 (continua); passo 13 → 1,771 (sai). A estrela em 1,70 e não colada em 2,00 é de propósito: `colide` limita o centro do robô a `y ≤ 1,92` (`host/physics.c:67`), então **bater na parede fica a 0,22 da estrela e falha**, enquanto parar pelo sensor fica a 0,071 e cumpre (raio 0,16).

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao fim de `tests/missoes.test.js`:

```javascript
test('a fase da parede existe, em arena vazia', () => {
  const m = Missoes.daVez(5);
  assert.strictEqual(Missoes.quantas(), 6);
  assert.deepStrictEqual(m.obstaculos, []);
  assert.strictEqual(m.inicio.x, 1.00);
  assert.strictEqual(m.inicio.y, 0.25);
  assert.strictEqual(m.x, 1.00);
  assert.strictEqual(m.y, 1.70);
});

test('a trilha da parede guarda a condição e os passos cegos', () => {
  const passo = Missoes.daVez(5).gabarito[0];
  assert.strictEqual(passo.ate_perto, 20);
  assert.strictEqual(passo.andar, 13);
});

test('bater na parede não cumpre a fase da parede', () => {
  /* colide limita o centro do robô a y <= 1,92. Se a estrela estivesse colada
     em 2,00, bater seria uma forma de vencer — e a fase perderia o sentido. */
  const m = Missoes.daVez(5);
  assert.ok(!Missoes.chegou({ x: 1.00, y: 1.92 }, m),
    'bater na parede está cumprindo a missão');
  assert.ok(Missoes.chegou({ x: 1.00, y: 1.771 }, m),
    'parar pelo sensor deveria cumprir');
});
```

E ao fim de `tests/gabarito.test.js`:

```javascript
test('no Pequeno o ate_perto vira passos cegos, porque não há sensor', () => {
  const blocos = blocosDe([{ ate_perto: 20, andar: 13 }], 'pequeno');
  assert.deepStrictEqual(
    blocos.filter((b) => b.type === 'repetir').map((b) => b.fields.N), [5, 5, 3]);
  for (const t of ['repetir_ate_perto', 'repetir_sempre', 'parar', 'se_obstaculo']) {
    assert.strictEqual(blocos.filter((b) => b.type === t).length, 0,
      `Pequeno não tem ${t}`);
  }
});

test('no Médio o ate_perto usa para sempre, se obstáculo e parar', () => {
  const blocos = blocosDe([{ ate_perto: 20, andar: 13 }], 'medio');
  const sempre = blocos.find((b) => b.type === 'repetir_sempre');
  assert.ok(sempre, 'faltou o repetir para sempre');
  const se = sempre.inputs.CORPO.block;
  assert.strictEqual(se.type, 'se_obstaculo');
  assert.strictEqual(se.fields.CM, 20);
  assert.strictEqual(se.inputs.CORPO.block.type, 'parar');
  /* O teste vem antes do andar: é o que iguala esta forma ao repetir até. */
  assert.strictEqual(se.next.block.type, 'mover_frente');
  assert.strictEqual(se.next.block.fields.SEG, PASSO_S);
});

test('no Grande o ate_perto vira o bloco de laço com sensor', () => {
  const blocos = blocosDe([{ ate_perto: 20, andar: 13 }], 'grande');
  const laco = blocos.find((b) => b.type === 'repetir_ate_perto');
  assert.ok(laco, 'faltou o repetir até perto');
  assert.strictEqual(laco.fields.CM, 20);
  assert.strictEqual(laco.inputs.CORPO.block.type, 'mover_frente');
  assert.strictEqual(laco.inputs.CORPO.block.fields.SEG, PASSO_S);
  assert.strictEqual(blocos.filter((b) => b.type === 'repetir').length, 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/missoes.test.js tests/gabarito.test.js`
Expected: FAIL — `quantas()` devolve 5, e o `ate_perto` cai no ramo do `andar`.

- [ ] **Step 3: Acrescentar a fase**

Em `web/missoes.js`, junto das outras constantes de início:

```javascript
  /* A fase da parede não tem obstáculo desenhado: o alvo é a borda da arena,
     que o sensor já enxerga — ponto_bloqueado trata a borda como obstáculo
     (host/physics.c). Arena vazia porque encostar no bloco vindo de baixo é a
     mesma foto da fase 1. */
  var SEM_OBSTACULOS = [];
  var INICIO_PAREDE = { x: 1.00, y: 0.25, theta: Math.PI / 2 };
```

E ao fim de `LISTA`, depois da fase do labirinto:

```javascript
    /* A estrela fica em 1,70 e não colada em 2,00 de propósito: colide limita o
       centro do robô a y <= 1,92, então bater na parede fica a 0,22 da estrela
       e falha, enquanto parar pelo sensor para em ~1,77 e cumpre.

       O passo "ate_perto" guarda as duas leituras do mesmo caminho: a condição,
       para quem tem sensor, e o equivalente em passos cegos, para o Pequeno,
       que não tem. Fonte de verdade única, como as outras trilhas. */
    { texto: 'Chegue bem pertinho da parede', x: 1.00, y: 1.70,
      inicio: INICIO_PAREDE, obstaculos: SEM_OBSTACULOS,
      gabarito: [{ ate_perto: 20, andar: 13 }] }
```

Não esqueça a vírgula no fim da fase do labirinto.

- [ ] **Step 4: Desenhar o `ate_perto` nos três níveis**

Em `web/gabarito.js`, acrescente antes de `blocosDoPasso`:

```javascript
  /* O mesmo caminho nas três línguas. O Pequeno não tem sensor, então anda
     cego; o Médio compõe os três blocos que ele ganhou; o Grande usa o bloco
     de laço com sensor, que é o dele.

     No Médio o teste vem antes do andar dentro do laço — é o que torna esta
     forma equivalente ao "repetir até", que também testa antes de rodar. */
  function blocosAtePerto(passo, nivel, passoS) {
    if (nivel === 'pequeno') {
      return blocosDeAndar(passo.andar, nivel, passoS);
    }
    if (nivel === 'grande') {
      return [{ type: 'repetir_ate_perto', fields: { CM: passo.ate_perto },
                inputs: { CORPO: { block: blocoAndar(passoS) } } }];
    }
    var se = { type: 'se_obstaculo', fields: { CM: passo.ate_perto },
               inputs: { CORPO: { block: { type: 'parar' } } },
               next: { block: blocoAndar(passoS) } };
    return [{ type: 'repetir_sempre', inputs: { CORPO: { block: se } } }];
  }
```

E troque `blocosDoPasso` por:

```javascript
  function blocosDoPasso(passo, nivel, passoS) {
    if (passo.girar !== undefined) return [blocoGirar(passo.girar)];
    if (passo.ate_perto !== undefined) return blocosAtePerto(passo, nivel, passoS);
    return blocosDeAndar(passo.andar, nivel, passoS);
  }
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/missoes.test.js tests/gabarito.test.js`
Expected: PASS.

Repare que o teste `no Pequeno nenhum repetir passa de cinco` da Task 1 agora cobre seis fases, de graça.

- [ ] **Step 6: Bateria rápida**

Run: `node --test $(ls tests/*.test.js | grep -v gabaritos.test.js)`
Expected: PASS.

- [ ] **Step 7: O teste que julga a aritmética**

Run: `node --test tests/gabaritos.test.js`
Expected: PASS, ~4 min, 18 execuções (6 fases × 3 níveis).

**Se a fase 6 falhar**, a conta de papel errou — e foi exatamente conta de papel que errou dois gabaritos no ciclo passado. O que ajustar, nesta ordem:

1. Leia a mensagem: ela diz `(parou em x,y, alvo …)`.
2. Se parou **antes** de 1,70 e longe: aumente `andar` na trilha (o Pequeno anda cego) ou baixe o limite `ate_perto` de 20 para 15 (o robô chega mais perto antes de parar).
3. Se parou **depois** e falhou por bater: mova a estrela para o y onde ele efetivamente parou, desde que continue a mais de 0,16 de 1,92.
4. Se só o Pequeno falhar, o número de passos cegos não bate com onde o sensor para: acerte `andar` para o `y` observado, com `andar = round((y_alvo − 0,25) / 0,117)`.

Ajuste a estrela ou os passos — **não** a expectativa, e **não** o raio de 0,16.

- [ ] **Step 8: Commit**

```bash
git add web/missoes.js web/gabarito.js tests/missoes.test.js tests/gabarito.test.js
git commit -F - <<'EOF'
Acrescenta a fase da parede, que se resolve pelo sensor

Arena vazia: o alvo é a borda, que o sensor já enxerga. Encostar no bloco
vindo de baixo seria a mesma foto da fase 1.

A estrela fica em 1,70 e não colada em 2,00 de propósito. O robô só chega a
1,92 batendo, e 1,92 fica a 0,22 da estrela — fora do raio. Então bater
falha, e parar pelo sensor cumpre.

A trilha guarda a condição e o equivalente em passos cegos, e o desenho muda
com o nível: o Pequeno anda cego porque não tem sensor, o Médio compõe
"para sempre" com "se obstáculo" e "parar", e o Grande usa o "repetir até".
Um caminho só, escrito na língua de quem está olhando.
EOF
```

---

## Task 7: bateria completa e firmware

**Files:**
- Modify: `firmware/data/*.gz` (regerados por script)
- Modify: `README.md` (a lista de blocos)

- [ ] **Step 1: Bateria inteira, sem pular nada**

```bash
node --test tests/
make -C tests test
bash tests/host_test.sh
```

Expected: tudo verde. O `node --test tests/` inclui o `gabaritos.test.js`, então leva ~4 min.

Se algo falhar aqui e passou nas tarefas anteriores, é interação entre mudanças — pare e reporte antes de mexer.

- [ ] **Step 2: Regravar os arquivos servidos pela ESP32**

```bash
bash firmware/preparar_data.sh
```

O script copia `web/*.js` inteiro, então `gabarito.js` entra sozinho — não é preciso editá-lo. Confira que `firmware/data/gabarito.js.gz` existe:

```bash
ls firmware/data/gabarito.js.gz
```

- [ ] **Step 3: Conferir que o firmware ainda compila**

```bash
cd firmware && pio run
```

Expected: sucesso. Nenhum arquivo em `firmware/src/` foi tocado; isto é só o guarda.

Se `pio` não estiver instalado nesta máquina, registre isso no relatório e siga — não instale nada.

- [ ] **Step 4: Atualizar o README**

São três lugares concretos, todos já existentes.

**(a)** A tabela dos níveis em `README.md:162-168` — acrescente quatro linhas ao fim dela:

```markdown
| `🛑` parar tudo | — | sim | sim |
| `🔁` repetir para sempre | — | sim | sim |
| `👁` se…senão | — | — | `[20] cm` |
| `🔁👁` repetir até perto | — | — | `[20] cm` |
```

**(b)** A tabela de bytecode em `README.md:177-184` — acrescente quatro linhas ao fim dela:

```markdown
| `parar tudo`                 | `HALT`                                             |
| `repetir para sempre { c }`  | `início:` corpo ; `JMP início`                     |
| `se…senão < [n] cm`          | `JMP_IF_GE 0,n,senão` ; então ; `JMP fim` ; `senão:` senão ; `fim:` |
| `repetir até < [n] cm { c }` | `início:` `JMP_IF_GE 0,n,corpo` ; `JMP fim` ; `corpo:` c ; `JMP início` ; `fim:` |
```

**(c)** O parágrafo em `README.md:171`, que hoje diz que *«um `repetir 12` mostra o número em vez de bolinhas»*. A regra continua valendo, mas agora tem uma fronteira que vale escrever. Acrescente ao fim do parágrafo:

```markdown
Isso vale para um valor herdado de um nível acima. O gabarito nunca produz um:
no Pequeno ele quebra a trilha em corrente de `repetir` de até cinco, porque
naquele nível o clique nas bolinhas volta a 1 depois de cinco — mostrar uma peça
que a criança não consegue construir esvazia o sentido do botão.
```

- [ ] **Step 5: Commit final**

`firmware/data/` está no `.gitignore` — é artefato de build, regerado antes de gravar na placa, e não entra em commit. Só o README:

```bash
git add README.md
git commit -F - <<'EOF'
Descreve os blocos novos no README
EOF
```

---

## Verificação final

Antes de dizer que acabou, confirme cada linha com a saída do comando na mão:

- [ ] `node --test tests/` — verde, incluindo os 18 gabaritos no Chromium
- [ ] `make -C tests test` — verde
- [ ] `bash tests/host_test.sh` — verde
- [ ] `node --test tests/es5.test.js` — verde, com `gabarito.js` na varredura
- [ ] `git status` — limpo
- [ ] Nenhum arquivo em `core/`, `host/` ou `firmware/src/` no diff. `88bdb8d` é o
      commit da spec, imediatamente anterior à Task 1:
      `git diff --stat 88bdb8d -- core host firmware/src` não devolve nada
