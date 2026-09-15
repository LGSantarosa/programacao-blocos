# Blocos que ela inventa — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A criança do Avançado dá nome a um pedaço de programa («🧩 ensinar dançar») e usa «🧩 dançar» como peça, no robô e no `.ino`.

**Architecture:** Duas peças novas em `web/blocos.js` que se apresentam ao `Blockly.Procedures` do núcleo (renomear e nome único vêm de lá). A tradução troca cada uso por `{op:'usar', nome, corpo}`, com o corpo traduzido uma vez por tradução e compartilhado. O compilador gera o corpo no lugar e confere o teto enquanto emite; o `.ino` gera uma função por definição. VM, protocolo, firmware e app não mudam.

**Tech Stack:** JavaScript ES5 (navegador, iPad com iOS 9), Blockly 8.0.5, `node --test`, g++ para o sketch gerado, Chromium headless via CDP.

**Spec:** [`docs/superpowers/specs/2026-09-15-blocos-que-ela-inventa-design.md`](../specs/2026-09-15-blocos-que-ela-inventa-design.md)

## Global Constraints

- Todo arquivo em `web/*.js` é ES5; quem cobra é `tests/es5.test.js`.
- Cor dos blocos inventados: `#a040c0`; peça de usar sem definição: `#b0b0b0`. Precisa bater entre `web/blocos.js` e `web/niveis.js`.
- Tipos: `bloco_ensinar` (campo `NOME` `field_input`, entrada `CORPO`), `bloco_usar` (campo `NOME` `field_label_serializable`).
- Categoria `custom="MEUS_BLOCOS"`, só no Avançado; botão com `callbackKey` `CRIAR_BLOCO`.
- Frases, exatas:
  - ciclo: `Um bloco não pode usar a si mesmo. Para fazer de novo, use o repetir.`
  - sem definição: `Esse bloco não existe mais. Desfaça para trazê-lo de volta, ou tire esta peça.`
  - teto no `emitir`: `O programa ficou grande demais: o robô só guarda 1024 instruções.`, com `codigo: 'programa_grande'`.
- Programa sem bloco inventado gera o bytecode de hoje, byte por byte.
- VM, `core/`, `firmware/`, `bridge/`, `android/` não mudam.
- Comentários em português, explicando o porquê.
- Commits em português, sem linha de atribuição, `git push origin master` depois de cada um.
- `make test` a cada task; testes de navegador só na Task 6, sem editar `web/` enquanto rodam. Todo toque em teste de navegador confere com `elementFromPoint`, e as peças ficam em y ≤ ~460.

---

### Task 1: O compilador gera o uso e confere o teto enquanto emite

**Files:**
- Modify: `web/compilador.js`
- Test: `tests/compilador.test.js`

**Interfaces:**
- Produces: nó `{op:'usar', nome: string, corpo: Node[], blockId}` aceito por `compilar`/`compilarTarefas`; erro do teto com `e.codigo === 'programa_grande'`.

- [ ] **Step 1: Escrever os testes que falham**

No fim de `tests/compilador.test.js`:

```js
/* ---------- os blocos que ela inventa ---------- */

test('usar gera o corpo da definição no lugar', () => {
  const corpo = [{ op: 'girar', graus: 90, blockId: 'dentro' }];
  const { bytes, pcMap } = compilar([{ op: 'usar', nome: 'dançar', corpo, blockId: 'uso' }]);
  assert.deepStrictEqual(instrucoes(bytes), [
    [OP.PUSH, 90, 0, 0],
    [OP.TURN, 0, 0, 0],
    [OP.HALT, 0, 0, 0],
  ]);
  /* Rodando «dançar», acende a peça de dentro da definição. */
  assert.deepStrictEqual(pcMap, ['dentro', 'dentro', null]);
});

test('dois usos do mesmo corpo geram duas cópias', () => {
  const corpo = [{ op: 'esperar', segundos: 1, blockId: 'e' }];
  const { bytes } = compilar([
    { op: 'usar', nome: 'd', corpo, blockId: 'u1' },
    { op: 'usar', nome: 'd', corpo, blockId: 'u2' },
  ]);
  assert.strictEqual(instrucoes(bytes).length, 5);
});

test('repetir dentro de uso dentro de repetir conta dois níveis', () => {
  const funda = (n, dentro) => n === 0 ? dentro
    : [{ op: 'repetir', vezes: 2, blockId: 'r' + n, corpo: funda(n - 1, dentro) }];
  const corpo = [{ op: 'repetir', vezes: 2, blockId: 'dentro', corpo: [] }];
  /* Três repetir por fora mais um dentro da definição: quatro, cabe. */
  assert.doesNotThrow(() => compilar(funda(3, [{ op: 'usar', nome: 'd', corpo, blockId: 'u' }])));
  /* Quatro por fora mais um dentro: cinco, e o erro aponta o repetir de dentro. */
  const e = erroDe(() => compilar(funda(4, [{ op: 'usar', nome: 'd', corpo, blockId: 'u' }])));
  assert.strictEqual(e.blockId, 'dentro');
  assert.strictEqual(e.codigo, undefined);
});

test('número que não cabe dentro de uma definição aponta a peça de dentro', () => {
  const corpo = [{ op: 'girar', graus: 99999, blockId: 'dentro' }];
  const e = erroDe(() => compilar([{ op: 'usar', nome: 'd', corpo, blockId: 'uso' }]));
  assert.strictEqual(e.blockId, 'dentro');
});

/* b0 é uma peça; b1 usa b0 duas vezes; b2 usa b1 duas vezes... O corpo é
   compartilhado, então a árvore é pequena — mas a emissão dobra a cada nível. */
function cadeia(n) {
  let corpo = [{ op: 'girar', graus: 1, blockId: 'b0' }];
  for (let i = 1; i <= n; i++) {
    const uso = { op: 'usar', nome: 'b' + (i - 1), corpo, blockId: 'uso' + i };
    corpo = [uso, uso];
  }
  return corpo;
}

test('a cadeia de vinte definições para no teto em milissegundos, no uso de fora', () => {
  const programa = [{ op: 'usar', nome: 'b20', corpo: cadeia(20), blockId: 'fora' }];
  const t0 = Date.now();
  const e = erroDe(() => compilar(programa));
  assert.ok(Date.now() - t0 < 500, 'demorou ' + (Date.now() - t0) + ' ms');
  assert.strictEqual(e.codigo, 'programa_grande');
  assert.strictEqual(e.blockId, 'fora');
  assert.match(e.message, /1024/);
});

test('programa sem uso nenhum continua com o bytecode de sempre', () => {
  const ast = [{ op: 'girar', graus: 45, blockId: 'g' }];
  assert.deepStrictEqual(instrucoes(compilar(ast).bytes), [
    [OP.PUSH, 45, 0, 0], [OP.TURN, 0, 0, 0], [OP.HALT, 0, 0, 0],
  ]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/compilador.test.js`
Expected: FAIL — `Bloco desconhecido: usar`.

- [ ] **Step 3: Implementar em `web/compilador.js`**

No começo de `emitir`, antes da conferência do `cabeNaInstrucao`:

```js
      /* Com blocos inventados, a árvore é pequena mas a emissão pode dobrar a
         cada uso encadeado. Conferir só no fim (naoPassaDoTeto) deixaria gerar
         um milhão de instruções antes de ouvir que passou de 1024. A marca é
         o que o case 'usar' olha para trocar o dono do erro. */
      if (instrucoes.length >= MAX_INSTR) {
        var teto = new Error('O programa ficou grande demais: o robô só guarda ' +
                             MAX_INSTR + ' instruções.');
        teto.blockId = null;
        teto.codigo = 'programa_grande';
        throw teto;
      }
```

No `switch` de `gerar`, antes de `case 'repetir_sempre': {`:

```js
          /* O corpo já vem traduzido e compartilhado (web/blocos.js); aqui ele
             é gerado no lugar, como se a criança o tivesse montado ali.

             Só o erro do teto troca de dono ao subir: a culpa é de quem usou
             aquilo tudo, e cada uso de fora sobrescreve o de dentro, até a
             bolha cair na peça que está no programa. Qualquer outro erro — um
             repetir fundo demais, um número que não cabe — atravessa intacto e
             aponta a peça de dentro, que é a que está errada. */
          case 'usar':
            try {
              gerar(no.corpo || []);
            } catch (e) {
              if (e && e.codigo === 'programa_grande') e.blockId = no.blockId || null;
              throw e;
            }
            break;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/compilador.test.js tests/es5.test.js`
Expected: PASS, todos.

- [ ] **Step 5: Commit**

```bash
git add web/compilador.js tests/compilador.test.js
git commit -m "O compilador gera o bloco inventado no lugar e para no teto enquanto emite"
git push origin master
```

---

### Task 2: O `.ino` gera uma função por bloco inventado

**Files:**
- Modify: `web/arduino.js`
- Test: `tests/arduino.test.js`

**Interfaces:**
- Consumes: nó `usar` da Task 1.
- Produces: `Arduino.limparNome(nome, prefixo?)` — `prefixo` padrão `'caixa_'`.

- [ ] **Step 1: Escrever os testes que falham**

No fim de `tests/arduino.test.js`:

```js
/* ---------- os blocos que ela inventa ---------- */

const girar90 = [{ op: 'girar', graus: 90 }];

test('usar vira chamada, e a função é declarada uma vez', () => {
  const uso = { op: 'usar', nome: 'dançar', corpo: girar90 };
  const texto = gerar([uso, uso]);
  assert.strictEqual(texto.split('void bloco_dancar() {').length - 1, 1, texto);
  assert.ok(texto.includes('  girar(90);\n}'), texto);
  assert.strictEqual(programa([uso, uso]), '  bloco_dancar();\n  bloco_dancar();');
});

test('a função usada por outra vem antes dela', () => {
  const b = { op: 'usar', nome: 'b', corpo: girar90 };
  const a = { op: 'usar', nome: 'a', corpo: [b] };
  const texto = gerar([a]);
  assert.ok(texto.indexOf('void bloco_b()') < texto.indexOf('void bloco_a()'), texto);
  assert.ok(texto.indexOf('void bloco_a()') < texto.indexOf('void programa()'), texto);
});

test('parar dentro de função chama fim(), e fim só existe então', () => {
  const com = gerar([{ op: 'usar', nome: 'x', corpo: [{ op: 'parar' }] }]);
  assert.ok(com.includes('void bloco_x() {\n  parar();\n  fim();\n}'), com);
  assert.ok(com.includes('void fim() {'), com);
  assert.ok(com.indexOf('void fim()') < com.indexOf('void bloco_x()'));
  const sem = gerar([{ op: 'parar' }]);
  assert.ok(!sem.includes('fim()'));
  assert.ok(sem.includes('  parar();\n  return;'), 'fora de função, o parar é o de sempre');
});

test('o sensor lido só dentro de um bloco inventado é declarado', () => {
  const texto = gerar([{ op: 'usar', nome: 'olhar',
    corpo: [{ op: 'se', cond: { op: 'menor', a: { op: 'distancia' }, b: 10 },
              corpo: [{ op: 'parar' }] }] }]);
  assert.ok(texto.includes('int distanciaCm()'), texto);
});

test('o repetir dentro da função recomeça em i', () => {
  const texto = gerar([{ op: 'repetir', vezes: 2, corpo: [
    { op: 'usar', nome: 'volta', corpo: [{ op: 'repetir', vezes: 3, corpo: girar90 }] }] }]);
  assert.ok(texto.includes('void bloco_volta() {\n  for (int i = 0; i < 3; i++) {'), texto);
});

test('bloco e caixa com o mesmo nome não se atropelam', () => {
  const texto = gerar([
    { op: 'guardar', indice: 0, nome: 'x', valor: 1 },
    { op: 'usar', nome: 'x', corpo: girar90 },
  ]);
  assert.ok(texto.includes('int32_t caixa_x = 0;'));
  assert.ok(texto.includes('void bloco_x() {'));
});

test('a cadeia de vinte blocos gera o .ino em milissegundos', () => {
  let corpo = girar90;
  for (let i = 0; i < 20; i++) {
    const uso = { op: 'usar', nome: 'b' + i, corpo };
    corpo = [uso, uso];
  }
  const t0 = Date.now();
  const texto = gerar(corpo);
  assert.ok(Date.now() - t0 < 500, 'demorou ' + (Date.now() - t0) + ' ms');
  assert.strictEqual((texto.match(/^void bloco_b\d+\(\) \{$/gm) || []).length, 20);
});

test('o sketch com dois blocos encadeados e um parar compila',
  { skip: temGpp() ? false : 'sem g++ nesta máquina' }, () => {
    const b = { op: 'usar', nome: 'girar um pouco', corpo: [{ op: 'girar', graus: 10 }] };
    const a = { op: 'usar', nome: 'dançar', corpo: [b, b, { op: 'parar' }] };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ino-'));
    const arq = path.join(dir, 'blocos.cpp');
    fs.writeFileSync(arq, '#include "fake_arduino.h"\n' + gerar([a, { op: 'girar', graus: 5 }]));
    const r = spawnSync('g++', ['-fsyntax-only', '-Wall', '-I', __dirname, arq],
      { encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    assert.strictEqual(r.status, 0, 'o sketch não compilou:\n' + r.stderr);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/arduino.test.js`
Expected: FAIL — `Bloco desconhecido: usar`.

- [ ] **Step 3: Implementar em `web/arduino.js`**

Troque o cabeçalho de `limparNome` e o `return`:

```js
  function limparNome(nome, prefixo) {
```

e

```js
    return (prefixo || 'caixa_') + (fora || 'caixa');
```

Troque `identificadores`/`identificadoresUsados`/`identificadorDe` por uma versão com prefixo, e acrescente o registro dos blocos:

```js
  /* Nome → identificador, para o gerar() em curso. Refeito a cada gerar(), na
     ordem em que aparecem, para que dois nomes que dão no mesmo virem _2, _3
     sempre na mesma ordem. Caixas e blocos contam colisão separado: o prefixo
     já os separa. */
  var identificadores = {};
  var identificadoresUsados = {};

  function identificadorDe(nome, prefixo) {
    prefixo = prefixo || 'caixa_';
    var chave = prefixo + ' ' + nome;   /* o espaço impede "constructor" e parentes */
    if (Object.prototype.hasOwnProperty.call(identificadores, chave)) {
      return identificadores[chave];
    }
    var base = limparNome(nome, prefixo), ident = base, k = 2;
    while (Object.prototype.hasOwnProperty.call(identificadoresUsados, ident)) {
      ident = base + '_' + k;
      k++;
    }
    identificadores[chave] = ident;
    identificadoresUsados[ident] = prefixo;
    return ident;
  }

  /* As funções dos blocos inventados, em ordem de dependência: uma entra na
     lista depois de todas as que ela usa. Sem ciclo (a tradução já recusou),
     essa ordem sempre existe. Cada nome é visitado uma vez só: a árvore
     compartilha o corpo de uma definição em todos os usos, e visitá-lo em cada
     um refaria a explosão que a tradução evitou. */
  var funcoes = [];
  var funcoesVistas = {};
```

Em `declaracoes()`, só as caixas viram global:

```js
  function declaracoes() {
    var fora = [], ident;
    for (ident in identificadoresUsados) {
      if (Object.prototype.hasOwnProperty.call(identificadoresUsados, ident) &&
          identificadoresUsados[ident] === 'caixa_') {
        fora.push('int32_t ' + ident + ' = 0;');
      }
    }
    if (!fora.length) return [];
    return ['/* As caixas que você criou. */'].concat(fora, ['']);
  }
```

Em `usoDe(nos, uso)`, depois da linha `if (no.op === 'mudar') uso.somar = true;`:

```js
      if (no.op === 'usar') {
        var chaveFn = ' ' + String(no.nome).toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(funcoesVistas, chaveFn)) {
          funcoesVistas[chaveFn] = true;
          /* A de dentro primeiro: é o que põe a função usada antes de quem usa.
             E marcando que está dentro de função, para o «parar» de lá pedir
             o fim(). */
          var antes = uso.dentroDeFuncao;
          uso.dentroDeFuncao = true;
          usoDe(no.corpo || [], uso);
          uso.dentroDeFuncao = antes;
          funcoes.push(no);
          identificadorDe(no.nome, 'bloco_');
        }
      }
      if (no.op === 'parar' && uso.dentroDeFuncao) uso.fim = true;
```

Uma variável de módulo diz ao `gerarNos` se está dentro de função:

```js
  /* Dentro de bloco_x(), o return do «parar» só sairia da função, e o robô
     seguiria para o bloco seguinte — onde a VM parou tudo. */
  var emFuncao = false;
```

No `switch` de `gerarNos`, troque o `case 'parar':` por:

```js
        case 'parar':
          linhas.push(r + 'parar();');
          linhas.push(r + (emFuncao ? 'fim();' : 'return;'));
          break;
        case 'usar':
          linhas.push(r + identificadorDe(no.nome, 'bloco_') + '();');
          break;
```

Depois de `var SOMAR = [...];`:

```js
  /* delay e não laço vazio: o delay do ESP32 cede a vez, e um while (true) {}
     seco dispara o watchdog da tarefa e reinicia a placa. */
  var FIM_FN = [
    '/* O robô para aqui, e não volta para quem chamou: é o que o parar faz nos',
    '   blocos. */',
    'void fim() {',
    '  while (true) delay(1000);',
    '}',
    ''
  ];

  function gerarFuncoes() {
    var fora = [], k, no, corpo;
    for (k = 0; k < funcoes.length; k++) {
      no = funcoes[k];
      corpo = [];
      emFuncao = true;
      gerarNos(no.corpo || [], 1, 0, corpo);
      emFuncao = false;
      fora.push('void ' + identificadorDe(no.nome, 'bloco_') + '() {');
      fora = fora.concat(corpo);
      fora.push('}');
      fora.push('');
    }
    return fora;
  }
```

Em `gerar(ast)`, zere o estado novo junto com o das caixas e monte as funções antes de `programa()`:

```js
    identificadores = {};
    identificadoresUsados = {};
    funcoes = [];
    funcoesVistas = {};
    emFuncao = false;
    var uso = usoDe(nos);
```

e, depois de `if (uso.somar) linhas = linhas.concat(SOMAR);`:

```js
    if (uso.fim) linhas = linhas.concat(FIM_FN);
    linhas = linhas.concat(gerarFuncoes());
```

Atenção: `gerarNos(nos, 1, 0, corpo)` do programa principal roda **antes** dessa montagem (já é assim no `gerar`), com `emFuncao = false`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/arduino.test.js tests/es5.test.js`
Expected: PASS, todos — inclusive os das caixas do ciclo 4.

- [ ] **Step 5: Commit**

```bash
git add web/arduino.js tests/arduino.test.js
git commit -m "O .ino dá a cada bloco inventado uma função, e o parar de dentro para de verdade"
git push origin master
```

---

### Task 3: As peças e a tradução — `web/blocos.js`

**Files:**
- Modify: `web/blocos.js`
- Test: `tests/blocos.test.js`

**Interfaces:**
- Consumes: nó `usar` (Task 1).
- Produces: tipos `bloco_ensinar`, `bloco_usar`; `Blocos.gavetaDeBlocos(workspace) → Element[]`; `Blocos.acertarUsos(workspace) → void`; `Blocos.COR_BLOCO = '#a040c0'`, `Blocos.COR_SEM_DEFINICAO = '#b0b0b0'`.

- [ ] **Step 1: Escrever os testes que falham**

No fim de `tests/blocos.test.js`:

```js
/* ---------- os blocos que ela inventa ---------- */

function ensinar(nome, corpo, id) {
  return { type: 'bloco_ensinar', id: id || ('def_' + nome), x: 400, y: 30,
           fields: { NOME: nome },
           inputs: corpo ? { CORPO: { block: corpo } } : {} };
}

function usar(nome, id, depois) {
  const b = { type: 'bloco_usar', id: id || ('uso_' + nome), fields: { NOME: nome } };
  if (depois) b.next = { block: depois };
  return b;
}

function noPlay(bloco) {
  return { type: 'quando_play', inputs: { CORPO: { block: bloco } } };
}

test('usar traz o corpo da definição, com os blockId de dentro dela', () => {
  const ws = carregar([
    ensinar('dançar', { type: 'girar', id: 'g', inputs: { GRAUS: num(90) } }),
    noPlay(usar('dançar', 'u')),
  ]);
  assert.deepStrictEqual(Blocos.workspaceParaAst(ws), [
    { op: 'usar', nome: 'dançar', blockId: 'u',
      corpo: [{ op: 'girar', graus: 90, blockId: 'g' }] },
  ]);
});

test('dois usos da mesma definição recebem o mesmo array', () => {
  const ws = carregar([
    ensinar('d', { type: 'parar', id: 'p' }),
    noPlay(usar('d', 'u1', usar('d', 'u2'))),
  ]);
  const ast = Blocos.workspaceParaAst(ws);
  assert.strictEqual(ast[0].corpo, ast[1].corpo);
});

test('a usa b traduz as duas camadas', () => {
  const ws = carregar([
    ensinar('b', { type: 'parar', id: 'p' }),
    ensinar('a', usar('b', 'ub')),
    noPlay(usar('a', 'ua')),
  ]);
  const ast = Blocos.workspaceParaAst(ws);
  assert.strictEqual(ast[0].corpo[0].op, 'usar');
  assert.strictEqual(ast[0].corpo[0].corpo[0].op, 'parar');
});

test('usar a si mesmo é erro na peça que fecha o ciclo', () => {
  const ws = carregar([
    ensinar('d', usar('d', 'dentro')),
    noPlay(usar('d', 'fora')),
  ]);
  const e = erroDe(() => Blocos.workspaceParaAst(ws));
  assert.match(e.message, /não pode usar a si mesmo/);
  assert.strictEqual(e.blockId, 'dentro');
});

test('ciclo de dois é erro na peça mais funda', () => {
  const ws = carregar([
    ensinar('a', usar('b', 'a_usa_b')),
    ensinar('b', usar('a', 'b_usa_a')),
    noPlay(usar('a', 'fora')),
  ]);
  assert.strictEqual(erroDe(() => Blocos.workspaceParaAst(ws)).blockId, 'b_usa_a');
});

test('peça sem definição é erro nela', () => {
  const ws = carregar([noPlay(usar('sumiu', 'u'))]);
  const e = erroDe(() => Blocos.workspaceParaAst(ws));
  assert.match(e.message, /não existe mais/);
  assert.strictEqual(e.blockId, 'u');
});

test('cabeça ensinar vazia é usar sem fazer nada', () => {
  const ws = carregar([ensinar('nada'), noPlay(usar('nada', 'u'))]);
  assert.deepStrictEqual(Blocos.workspaceParaAst(ws)[0].corpo, []);
});

test('tocar na cabeça ensinar roda o corpo, e não é o programa', () => {
  const ws = carregar([ensinar('d', { type: 'parar', id: 'p' }, 'def')]);
  const pilha = Blocos.pilhaDoBloco(ws.getBlockById('def'));
  assert.deepStrictEqual(pilha, { ast: [{ op: 'parar', blockId: 'p' }], ehPrograma: false });
  const dePeca = Blocos.pilhaDoBloco(ws.getBlockById('p'));
  assert.strictEqual(dePeca.ehPrograma, false);
});

test('a cabeça ensinar não é tarefa', () => {
  const ws = carregar([ensinar('d', { type: 'parar' })]);
  assert.strictEqual(Blocos.temTarefas(ws), false);
});

test('renomear a cabeça renomeia os usos', () => {
  const ws = carregar([ensinar('dançar', null, 'def'), noPlay(usar('dançar', 'u'))]);
  ws.getBlockById('def').getField('NOME').setValue('pular');
  assert.strictEqual(ws.getBlockById('u').getFieldValue('NOME'), 'pular');
});

test('nome repetido vira dançar2', () => {
  const ws = carregar([ensinar('dançar', null, 'a'), ensinar('outro', null, 'b')]);
  ws.getBlockById('b').getField('NOME').setValue('Dançar');
  assert.strictEqual(ws.getBlockById('b').getFieldValue('NOME'), 'Dançar2');
});

test('o nome da peça de usar volta igual depois de salvar e carregar', () => {
  const ws = carregar([ensinar('dançar'), noPlay(usar('dançar', 'u'))]);
  const salvo = Blockly.serialization.workspaces.save(ws);
  const outro = new Blockly.Workspace();
  Blockly.Events.disable();
  try { Blockly.serialization.workspaces.load(salvo, outro); }
  finally { Blockly.Events.enable(); }
  assert.strictEqual(outro.getBlockById('u').getFieldValue('NOME'), 'dançar');
});

test('vinte definições em cadeia traduzem em milissegundos', () => {
  const estados = [ensinar('b0', { type: 'parar' })];
  for (let i = 1; i <= 20; i++) {
    const anterior = 'b' + (i - 1);
    estados.push(ensinar('b' + i, usar(anterior, 'u' + i + 'a', usar(anterior, 'u' + i + 'b'))));
  }
  estados.push(noPlay(usar('b20', 'fora')));
  const ws = carregar(estados);
  const t0 = Date.now();
  const ast = Blocos.workspaceParaAst(ws);
  assert.ok(Date.now() - t0 < 500, 'demorou ' + (Date.now() - t0) + ' ms');
  assert.strictEqual(ast[0].corpo[0].corpo, ast[0].corpo[1].corpo);
});

test('acertarUsos esmaece quem perdeu a definição e acende quem a tem', () => {
  const ws = carregar([ensinar('d', null, 'def'), noPlay(usar('d', 'u'))]);
  Blocos.acertarUsos(ws);
  assert.strictEqual(ws.getBlockById('u').getColour(), Blocos.COR_BLOCO);
  ws.getBlockById('def').dispose(false);
  Blocos.acertarUsos(ws);
  assert.strictEqual(ws.getBlockById('u').getColour(), Blocos.COR_SEM_DEFINICAO);
});
```

O arquivo já tem `carregar` e `num`; `erroDe` não existe nele — acrescente junto dos testes novos:

```js
function erroDe(f) {
  try { f(); } catch (e) { return e; }
  assert.fail('devia ter lançado');
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/blocos.test.js`
Expected: FAIL — tipo `bloco_ensinar` desconhecido.

- [ ] **Step 3: Implementar em `web/blocos.js`**

Depois de `var COR_CAIXA     = '#e06000';`:

```js
  /* Roxo: nenhuma família usa, e um bloco inventado não é movimento, nem laço,
     nem conta — é da criança. Precisa bater com web/niveis.js. */
  var COR_BLOCO         = '#a040c0';
  /* A peça de usar cuja definição sumiu. Esmaecer é só aparência: o aviso vem
     da tradução, porque o pilhaParaAst pula peça desligada em silêncio. */
  var COR_SEM_DEFINICAO = '#b0b0b0';
```

Troque `registrarExtensao` inteiro — cada extensão conferida pelo próprio nome:

```js
  function registrarUma(nome, fn) {
    if (Blockly.Extensions.isRegistered && Blockly.Extensions.isRegistered(nome)) return;
    Blockly.Extensions.register(nome, fn);
  }

  /* GRAUS é a fonte de verdade; o menu direita/esquerda é só um editor
     amigável dela. É isso que deixa o compilador ignorar o nível. */
  function registrarExtensao() {
    if (extensaoPronta || typeof Blockly === 'undefined') return;
    registrarUma('girar_dir_escreve_graus', function () {
      var bloco = this;
      bloco.getField('DIR').setValidator(function (novo) {
        /* O menu escreve no shadow que mora no encaixe. Se a criança soltou
           uma conta ali, não há o que escrever — e nem faria sentido: o menu
           já não representa aquele valor, e o Niveis.aplicar esconde o menu. */
        var dentro = bloco.getInputTargetBlock('GRAUS');
        if (dentro && dentro.type === 'numero') {
          dentro.setFieldValue(Number(novo), 'NUM');
        }
        return novo;
      });
    });

    /* A cabeça «ensinar» se apresenta ao Blockly.Procedures do núcleo: é o que
       dá de graça o nome único (findLegalName) e o renomear que alcança todos
       os usos. Sem entrada e sem resposta: [nome, [], false]. */
    registrarUma('bloco_ensinar_procedimento', function () {
      this.getProcedureDef = function () {
        return [this.getFieldValue('NOME'), [], false];
      };
      this.getField('NOME').setValidator(Blockly.Procedures.rename);
    });

    /* A peça de usar responde ao renomear da cabeça. O nome dela não se edita
       aqui: é rótulo. */
    registrarUma('bloco_usar_procedimento', function () {
      this.getProcedureCall = function () {
        return this.getFieldValue('NOME');
      };
      /* Sem maiúscula e minúscula, como o Names.equals do núcleo compara. */
      this.renameProcedure = function (antigo, novo) {
        if (String(antigo).toLowerCase() ===
            String(this.getFieldValue('NOME')).toLowerCase()) {
          this.setFieldValue(novo, 'NOME');
        }
      };
    });
    extensaoPronta = true;
  }
```

No array do `definir()`, depois das três peças de caixa:

```js
      {
        type: 'bloco_ensinar',
        message0: '🧩 ensinar %1',
        args0: [{ type: 'field_input', name: 'NOME', text: 'meu bloco' }],
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        colour: COR_BLOCO,
        extensions: ['bloco_ensinar_procedimento'],
        tooltip: 'Dá um nome às peças de baixo. Depois, a peça com esse nome ' +
                 'faz tudo isso de uma vez.',
      },
      {
        type: 'bloco_usar',
        message0: '🧩 %1',
        /* field_label_serializable e não field_label: o field_label não é
           gravado, e a peça voltaria do localStorage — e do desfazer — sem
           saber de qual bloco ela é. */
        args0: [{ type: 'field_label_serializable', name: 'NOME', text: 'meu bloco' }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_BLOCO,
        extensions: ['bloco_usar_procedimento'],
        tooltip: 'Faz as peças que você ensinou com este nome.',
      },
```

Antes de `function blocoParaNo(b) {`:

```js
  /* A tradução em curso: os nomes sendo traduzidos agora (para achar ciclo) e
     os corpos já prontos (para traduzir cada definição uma vez só). Vive o
     tempo de uma chamada de fora — entre duas, a criança pode ter mexido na
     definição. */
  var traducao = null;

  function traduzindo(fn) {
    if (traducao) return fn();
    traducao = { abertos: {}, prontos: {} };
    try {
      return fn();
    } finally {
      traducao = null;
    }
  }

  function erroNaPeca(mensagem, b) {
    var e = new Error(mensagem);
    e.blockId = b.id;
    return e;
  }

  /* Cada definição vira o mesmo array em todos os usos. Traduzir de novo a cada
     uso explode sem ciclo nenhum: vinte definições que usam a anterior duas
     vezes dariam mais de um milhão de nós. */
  function noDeUso(b) {
    /* Quem chegou aqui sem passar por uma das entradas de fora ganha uma
       tradução só para si, em vez de quebrar lendo traducao nula. */
    if (!traducao) return traduzindo(function () { return noDeUso(b); });
    var nome = b.getFieldValue('NOME');
    var chave = ' ' + String(nome).toLowerCase();   /* Names.equals ignora caixa */
    if (traducao.abertos[chave]) {
      throw erroNaPeca('Um bloco não pode usar a si mesmo. Para fazer de novo, ' +
                       'use o repetir.', b);
    }
    var corpo = traducao.prontos[chave];
    if (!corpo) {
      var def = Blockly.Procedures.getDefinition(nome, b.workspace);
      if (!def) {
        throw erroNaPeca('Esse bloco não existe mais. Desfaça para trazê-lo de ' +
                         'volta, ou tire esta peça.', b);
      }
      traducao.abertos[chave] = true;
      try {
        corpo = pilhaParaAst(def.getInputTargetBlock('CORPO'));
      } finally {
        delete traducao.abertos[chave];
      }
      traducao.prontos[chave] = corpo;
    }
    return { op: 'usar', nome: nome, corpo: corpo, blockId: b.id };
  }
```

No `switch` de `blocoParaNo`, antes de `default:`:

```js
      case 'bloco_usar':    return noDeUso(b);
```

Envolva as quatro entradas de fora com `traduzindo`. Troque o corpo de cada uma:

```js
  function workspaceParaAst(workspace) {
    return traduzindo(function () {
      var raizes = workspace.getBlocksByType('quando_play', false);
      if (raizes.length === 0) return [];
      return pilhaParaAst(raizes[0].getInputTargetBlock('CORPO'));
    });
  }
```

Em `workspaceParaTarefas`, envolva o corpo inteiro em `return traduzindo(function () { ... return tarefas; });`. Em `pilhaDoBloco` e `valorDoBloco`, idem — o `return` de cada ramo fica dentro da função passada.

Em `pilhaDoBloco`, depois do caso `quando_condicao`/`quando_aviso` e antes do `return` final:

```js
      /* Tocar na cabeça «ensinar», ou numa peça dentro dela, roda o corpo uma
         vez — como as cabeças «quando». Não é o programa. */
      if (raiz.type === 'bloco_ensinar') {
        return { ast: pilhaParaAst(raiz.getInputTargetBlock('CORPO')),
                 ehPrograma: false };
      }
```

Depois de `pecaDeCaixa`:

```js
  /* A gaveta «Meus blocos»: o botão de criar, e uma peça de usar para cada
     definição na tela, em ordem de nome. Montada na hora, então uma definição
     apagada some daqui sem regra nova. */
  function gavetaDeBlocos(workspace) {
    var xml = Blockly.utils.xml;
    var itens = [];
    var botao = xml.createElement('button');
    botao.setAttribute('text', '🧩 Criar bloco');
    botao.setAttribute('callbackKey', 'CRIAR_BLOCO');
    itens.push(botao);

    var nomes = [];
    var defs = workspace.getBlocksByType('bloco_ensinar', false);
    for (var i = 0; i < defs.length; i++) nomes.push(defs[i].getFieldValue('NOME'));
    nomes.sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });

    for (var k = 0; k < nomes.length; k++) {
      var bloco = xml.createElement('block');
      bloco.setAttribute('type', 'bloco_usar');
      var campo = xml.createElement('field');
      campo.setAttribute('name', 'NOME');
      campo.appendChild(xml.createTextNode(nomes[k]));
      bloco.appendChild(campo);
      itens.push(bloco);
    }
    return itens;
  }

  /* Acende a peça de usar que tem definição e esmaece a que perdeu. setColour
     não dispara evento, então quem chama isto de um ouvinte não se chama de
     novo. */
  function acertarUsos(workspace) {
    var usos = workspace.getBlocksByType('bloco_usar', false);
    for (var i = 0; i < usos.length; i++) {
      var tem = !!Blockly.Procedures.getDefinition(usos[i].getFieldValue('NOME'), workspace);
      var cor = tem ? COR_BLOCO : COR_SEM_DEFINICAO;
      if (usos[i].getColour() !== cor) usos[i].setColour(cor);
    }
  }
```

No `api`, acrescente: `gavetaDeBlocos: gavetaDeBlocos, acertarUsos: acertarUsos, COR_BLOCO: COR_BLOCO, COR_SEM_DEFINICAO: COR_SEM_DEFINICAO`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/blocos.test.js tests/es5.test.js`
Expected: PASS, todos. Se `nome repetido vira dançar2` falhar com `Dançar` intacto: no Blockly headless o validador só roda com `setValue` num campo de bloco já inicializado — confira que o teste usa `getField('NOME').setValue`, e não `setFieldValue` (que também passa pelo validador no 8.0.5; se não passar, é esse o motivo).

- [ ] **Step 5: Commit**

```bash
git add web/blocos.js tests/blocos.test.js
git commit -m "Nascem as peças de ensinar e de usar, e a tradução copia sem explodir"
git push origin master
```

---

### Task 4: A gaveta «Meus blocos» no Avançado — `web/niveis.js`

**Files:**
- Modify: `web/niveis.js`
- Test: `tests/niveis.test.js`

**Interfaces:**
- Consumes: tipos `bloco_ensinar`, `bloco_usar` (Task 3).
- Produces: `<category name="Meus blocos" colour="#a040c0" custom="MEUS_BLOCOS"></category>` no XML do Avançado.

- [ ] **Step 1: Escrever os testes que falham**

No fim de `tests/niveis.test.js`:

```js
/* ---------- os blocos que ela inventa ---------- */

test('só o Avançado tem os blocos inventados', () => {
  for (const nivel of ['pequeno', 'medio', 'grande']) {
    const b = Niveis.definicao(nivel).blocos;
    assert.ok(b.indexOf('bloco_ensinar') < 0, nivel + ' não deveria ter blocos inventados');
    assert.ok(!Niveis.caixaXml(nivel).includes('custom="MEUS_BLOCOS"'));
  }
  const g = Niveis.definicao('gigante').blocos;
  assert.ok(g.indexOf('bloco_ensinar') >= 0);
  assert.ok(g.indexOf('bloco_usar') >= 0);
  assert.ok(Niveis.caixaXml('gigante').includes(
    '<category name="Meus blocos" colour="#a040c0" custom="MEUS_BLOCOS"></category>'));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/niveis.test.js`
Expected: FAIL — `bloco_ensinar` ausente do Avançado.

- [ ] **Step 3: Implementar em `web/niveis.js`**

Depois de `var COR_CAIXA = '#e06000';`:

```js
  var COR_BLOCO = '#a040c0';
```

Em `DEFINICOES.gigante.blocos`, depois de `'caixa_guardar', 'caixa_mudar', 'caixa_ler',`:

```js
      /* Os blocos que ela inventa. No Avançado porque dar nome a um pedaço de
         programa só vale para quem já monta pedaços grandes o bastante para
         repetir. */
      'bloco_ensinar', 'bloco_usar',
```

Em `caixaXml`, depois do bloco da categoria «Caixas»:

```js
    /* Como a das caixas: depende do que a criança já ensinou, e quem monta é
       o Blocos.gavetaDeBlocos, registrado pelo app.js com este nome. */
    if (tem('bloco_ensinar')) {
      xml += '<category name="Meus blocos" colour="' + COR_BLOCO +
             '" custom="MEUS_BLOCOS"></category>';
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/niveis.test.js tests/es5.test.js`
Expected: PASS, todos.

- [ ] **Step 5: Commit**

```bash
git add web/niveis.js tests/niveis.test.js
git commit -m "O Avançado ganha a gaveta dos blocos que ela inventa"
git push origin master
```

---

### Task 5: Um bloco inventado dentro de uma tarefa, no robô virtual

**Files:**
- Test: `tests/tarefas_ponta_a_ponta.test.js`

**Interfaces:**
- Consumes: `compilarTarefas` com nó `usar` (Task 1).

- [ ] **Step 1: Escrever o teste**

No fim de `tests/tarefas_ponta_a_ponta.test.js`:

```js
test('um bloco inventado anda dentro de uma pilha «quando»', { timeout: 20000 }, async () => {
  /* O mesmo «quando perto, gira» do teste acima, com o giro dentro de um bloco
     inventado. Se a cópia do corpo errar um salto dentro da tarefa, o robô não
     gira. */
  const girarUmPouco = [{ op: 'girar', graus: 90, blockId: 'g' }];
  const { bytes } = compilarTarefas([
    { quando: 'play', blockId: 'p',
      corpo: [{ op: 'frente', segundos: 5, blockId: 'f' }] },
    { quando: 'condicao', blockId: 'q',
      cond: { op: 'menor', a: { op: 'distancia' }, b: 40, blockId: 'c' },
      corpo: [{ op: 'usar', nome: 'desviar', corpo: girarUmPouco, blockId: 'u' }] },
  ]);
  const linhas = await rodar(bytes, 4000);
  const thetas = linhas.filter((l) => l[0] === 'T')
                       .map((l) => Number(l.split(' ')[3]));
  assert.ok(thetas.some((t) => Math.abs(t - thetas[0]) > 300),
    'o bloco inventado devia ter feito o robô girar ao chegar perto da parede');
});
```

- [ ] **Step 2: Rodar**

Run: `make all && node --test tests/tarefas_ponta_a_ponta.test.js`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/tarefas_ponta_a_ponta.test.js
git commit -m "Prova no robô virtual um bloco inventado dentro de uma pilha «quando»"
git push origin master
```

---

### Task 6: Ligar no `app.js`, e a prova no navegador

**Files:**
- Modify: `web/app.js`
- Test: `tests/navegador.test.js`

**Interfaces:**
- Consumes: `Blocos.gavetaDeBlocos`, `Blocos.acertarUsos` (Task 3); categoria `MEUS_BLOCOS` (Task 4).

- [ ] **Step 1: Escrever o teste de navegador que falha**

No fim de `tests/navegador.test.js` (porta `+ 18`):

```js
test('a criança ensina um bloco, usa, apaga a definição e desfaz',
  { skip: PULAR, timeout: 180000 },
  async (t) => {
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 18) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-blocos-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 18}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 18}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 18}/json/list`);
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
    /* Mira o emoji 🧩, que é field_label, e confere que o ponto cai na peça. */
    const tocar = async (id) => {
      const p = JSON.parse(await aval(`(() => {
        const svg = Blockly.getMainWorkspace().getBlockById(${JSON.stringify(id)})
          .getSvgRoot();
        const r = svg.getBoundingClientRect();
        const x = r.left + 14, y = r.top + 14;
        const alvo = document.elementFromPoint(x, y);
        return JSON.stringify({ x, y, acerta: !!alvo && svg.contains(alvo),
          alvo: alvo ? (alvo.id || alvo.getAttribute('class') || alvo.tagName) : null });
      })()`));
      assert.ok(p.acerta, `o toque em ${id} (${Math.round(p.x)}, ${Math.round(p.y)}) ` +
        `caiu em ${p.alvo}, e não na peça`);
      await mouse('mousePressed', p.x, p.y);
      await mouse('mouseReleased', p.x, p.y);
      await espera(1200);
    };
    const bolha = () => aval('document.getElementById("bolha").hidden ? "" : ' +
                             'document.getElementById("bolha").textContent');
    const url = `http://localhost:${PORTA_WEB + 18}/`;

    await cdp.envia('Page.navigate', { url });
    await espera(3000);
    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=gigante]').click();
      window.prompt = function () { return 'relatar'; };
      window.confirm = function () { return true; };
      return 1;
    })()`);
    await espera(800);

    /* Criar pelo botão: a cabeça aparece na tela. */
    await aval(`(Blockly.getMainWorkspace().getButtonCallback('CRIAR_BLOCO')(), 1)`);
    await espera(600);
    const def = await aval(`(() => {
      const d = Blockly.getMainWorkspace().getBlocksByType('bloco_ensinar', false);
      return d.length === 1 ? d[0].id + '|' + d[0].getFieldValue('NOME') : String(d.length);
    })()`);
    const [defId, defNome] = def.split('|');
    assert.strictEqual(defNome, 'relatar', 'o botão não criou a cabeça: ' + def);

    /* A gaveta mostra a peça de usar. */
    await aval(`(() => {
      const tb = Blockly.getMainWorkspace().getToolbox();
      tb.setSelectedItem(tb.getToolboxItems().find(i => i.getName && i.getName() === 'Meus blocos'));
      return 1;
    })()`);
    await espera(700);
    assert.strictEqual(await aval(`Blockly.getMainWorkspace().getFlyout().getWorkspace()
      .getTopBlocks(false).map(b => b.type + ':' + b.getFieldValue('NOME')).join()`),
      'bloco_usar:relatar');
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      ws.getFlyout().hide();
      ws.getToolbox().clearSelection();
      return 1;
    })()`);
    await espera(400);

    /* A definição guarda 7 numa caixa; o uso roda a definição; ler a caixa
       mostra 7. A caixa é o jeito de ver, no teste, que o corpo rodou. */
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      const v = ws.createVariable('marca');
      const d = ws.getBlockById(${JSON.stringify(defId)});
      d.moveTo(new Blockly.utils.Coordinate(500, 60));
      const g = Blockly.serialization.blocks.append({ type: 'caixa_guardar', id: 'dentro',
        fields: { CAIXA: { id: v.getId() } },
        inputs: { VALOR: { shadow: { type: 'numero', fields: { NUM: 7 } } } } }, ws);
      d.getInput('CORPO').connection.connect(g.previousConnection);
      Blockly.serialization.blocks.append({ type: 'bloco_usar', id: 'uso',
        fields: { NOME: 'relatar' } }, ws).moveBy(60, 340);
      Blockly.serialization.blocks.append({ type: 'caixa_ler', id: 'ler',
        fields: { CAIXA: { id: v.getId() } } }, ws).moveBy(60, 440);
      return 1;
    })()`);
    await espera(600);
    await tocar('uso');
    await tocar('ler');
    assert.strictEqual(await bolha(), '7', 'tocar na peça de usar não rodou a definição');

    /* Apagar a definição esmaece o uso, e tocar nele mostra o aviso. */
    await aval(`(Blockly.getMainWorkspace().getBlockById(${JSON.stringify(defId)}).dispose(true, true), 1)`);
    await espera(600);
    assert.strictEqual(await aval(`Blockly.getMainWorkspace().getBlockById('uso').getColour()`),
      '#b0b0b0', 'a peça de usar não esmaeceu');
    await tocar('uso');
    assert.match(await bolha(), /não existe mais/);

    /* Desfazer traz a definição, e o uso acende. */
    await aval('document.getElementById("desfazer").click(), 1');
    await espera(800);
    assert.strictEqual(await aval(`Blockly.getMainWorkspace().getBlockById('uso').getColour()`),
      '#a040c0', 'desfazer não acendeu a peça de usar');

    /* Usar a si mesmo: a bolha cai na peça de dentro. */
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      const d = ws.getBlocksByType('bloco_ensinar', false)[0];
      const u = Blockly.serialization.blocks.append({ type: 'bloco_usar', id: 'dentro_de_si',
        fields: { NOME: 'relatar' } }, ws);
      d.getInput('CORPO').connection.connect(u.previousConnection);
      return 1;
    })()`);
    await espera(600);
    /* Que a bolha cai na peça de dentro, e não no uso, o blocos.test.js prova
       pelo blockId; aqui basta a frase chegar à tela. */
    await tocar('uso');
    assert.match(await bolha(), /a si mesmo/);

    /* Recarregar traz cabeça e usos com o nome. */
    await espera(1500);
    await cdp.envia('Page.navigate', { url });
    await espera(3000);
    assert.strictEqual(await aval(`Blockly.getMainWorkspace().getBlockById('uso').getFieldValue('NOME')`),
      'relatar', 'o nome da peça de usar não voltou');
    assert.strictEqual(await aval(
      `Blockly.getMainWorkspace().getBlocksByType('bloco_ensinar', false).length`), 1);

    cdp.fechar();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `make all && TESTES_LENTOS=1 node --test --test-name-pattern="ensina um bloco" tests/navegador.test.js`
Expected: FAIL — `getButtonCallback('CRIAR_BLOCO')` não é função.

- [ ] **Step 3: `web/app.js`**

Logo antes de `/* ---------- o programa da criança volta como ela deixou ---------- */`, depois do `registerButtonCallback('CRIAR_CAIXA', ...)`:

```js
  /* ---------- os blocos que ela inventa ---------- */

  workspace.registerToolboxCategoryCallback('MEUS_BLOCOS', function (ws) {
    return Blocos.gavetaDeBlocos(ws);
  });

  /* O botão pede o nome, passa pelo findLegalName (que faz «dançar2» se já
     existe um «dançar») e põe a cabeça no canto visível de cima à esquerda —
     onde a criança está olhando, e não na origem do workspace, que pode estar
     rolada para fora da tela. */
  workspace.registerButtonCallback('CRIAR_BLOCO', function () {
    Blockly.dialog.prompt('Nome do bloco novo:', '', function (nome) {
      if (nome === null || nome === undefined) return;
      nome = String(nome).trim();
      if (!nome) return;
      var cabeca = Blockly.serialization.blocks.append(
        { type: 'bloco_ensinar', fields: { NOME: nome } }, workspace);
      cabeca.setFieldValue(Blockly.Procedures.findLegalName(nome, cabeca), 'NOME');
      var vista = workspace.getMetricsManager().getViewMetrics(true);
      cabeca.moveTo(new Blockly.utils.Coordinate(vista.left + 40, vista.top + 40));
      cabeca.select();
    });
  });

  /* A peça de usar acende com definição e esmaece sem. Em todo evento que muda
     o programa: apagar a cabeça, desfazer, renomear, trocar de nível. */
  workspace.addChangeListener(function (e) {
    if (e.isUiEvent) return;
    Blocos.acertarUsos(workspace);
  });
```

Em `restaurarPrograma`, depois do `reconciliarCaixas();` do ramo que deu certo:

```js
      Blocos.acertarUsos(workspace);
```

- [ ] **Step 4: Rodar os testes rápidos**

Run: `make test`
Expected: tudo PASS.

- [ ] **Step 5: Rodar o teste de navegador novo**

Run: `TESTES_LENTOS=1 node --test --test-name-pattern="ensina um bloco" tests/navegador.test.js`
Expected: PASS. Se falhar, siga `superpowers:systematic-debugging`: a mensagem do `assert` diz qual promessa quebrou, e a de toque diz onde o dedo caiu.

- [ ] **Step 6: Commit e push**

```bash
git add web/app.js tests/navegador.test.js
git commit -m "Liga os blocos inventados na tela: o botão ensina, a gaveta oferece e o uso esmaece sem definição"
git push origin master
```

- [ ] **Step 7: A prova lenta, sem mexer em `web/`**

Run: `make test-lento`
Expected: PASS. É a prova de minutos; o commit já foi, e ele confere depois.
