# Execução viva — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tocar numa peça faz aquela peça rodar na hora; tocar num relator mostra o valor dele numa bolha.

**Architecture:** Duas etapas. A etapa 1 (tarefas 1–2) só mexe em `web/`, reusa o `T_LOAD`+`T_RUN` que já existem, e roda na ESP32 **que já está gravada**. A etapa 2 (tarefas 3–6) abre um opcode `OP_REPORT` que devolve o topo da pilha pelo HAL, atravessa a ponte como `T_VALOR`, e vira bolha na tela — e essa etapa pede regravar a placa. A tarefa 7 escreve o limite conhecido no README.

**Tech Stack:** C11 (`core/`, `host/`), C++ Arduino/PlatformIO (`firmware/`), Node.js 18 sem dependências (`bridge/`, `tests/`), JavaScript **ES5** com Blockly 8.0.5 vendorizado (`web/`).

**Spec:** [`docs/superpowers/specs/2026-08-20-execucao-viva-design.md`](../specs/2026-08-20-execucao-viva-design.md)

## Global Constraints

- **`web/` é ES5, sem exceção.** Nada de `let`, `const`, arrow function, template string, `class`, spread. O alvo é o Safari do iOS 9 num iPad 2, que nem carrega a página se houver sintaxe moderna. `tests/es5.test.js` guarda isso e vai falhar se escorregar.
- **CSS sem `gap` em flexbox (iOS 14.5+), sem `aspect-ratio` (iOS 15+), sem `var()`.** Mesma razão.
- **`tests/` e `bridge/` rodam em Node 18 e podem usar sintaxe moderna.** A regra do ES5 vale só para o que o navegador antigo baixa, ou seja `web/*.js`.
- **Zero dependências.** Nada de `npm install`, em nenhuma parte do projeto.
- **Nada de assinatura de IA nos commits.** Sem `Co-Authored-By`, sem `Claude-Session`.
- **Instrução da VM tem 7 bytes:** `op` (u8) mais `a`, `b`, `c` (int16 LE). `INSTR_BYTES == 7`. Nenhuma tarefa muda isso.
- **A pilha da VM é `int32_t`**, `PILHA_MAX == 16`.
- **O opcode 7 continua vago.** Era o `OP_JMP_IF_GE`; reusá-lo faria bytecode antigo rodar errado. O opcode novo deste ciclo é o **13**.
- **Comentários em português**, explicando *por que* e não *o que* — é o estilo de todo o repositório.

### Como rodar os testes

```bash
cd tests && make test            # os três binários C: vm, física, montador
node tests/blocos.test.js        # qualquer suíte JS, uma a uma
node tests/navegador.test.js     # dirige um Chromium de verdade; ~1 min
node tests/gabaritos.test.js     # o lento, ~5 min; só quando mexer em gabarito
cd host && make                  # o robô virtual, que o teste de navegador sobe
cd firmware && pio run           # só compila o firmware; não precisa de placa
```

---

# Etapa 1 — rodar uma pilha

Nada aqui toca `core/`, `host/`, `bridge/` ou `firmware/`.

---

### Task 1: `Blocos.pilhaDoBloco`

Traduz "a criança tocou nesta peça" em "esta é a árvore para compilar".

**Files:**
- Modify: `web/blocos.js` (junto de `workspaceParaAst`, perto da linha 513)
- Test: `tests/blocos.test.js`

**Interfaces:**
- Consumes: `pilhaParaAst(bloco)` — já existe em `web/blocos.js`, privada ao módulo, aceita qualquer bloco e percorre `getNextBlock()`.
- Produces:
  ```js
  Blocos.pilhaDoBloco(bloco) -> { ast: Array, ehPrograma: boolean } | null
  ```
  Devolve `null` quando `bloco` é relator (tem `outputConnection`). `ehPrograma` é `true` quando a raiz da pilha é o `quando_play`.

- [ ] **Step 1: Write the failing test**

Acrescente ao final de `tests/blocos.test.js`, antes de qualquer linha de fechamento:

```js
/* ---------- a peça tocada ---------- */

/* Devolve o bloco de um workspace pelo tipo. O clique chega como um id, e é
   por id que o app.js vai buscar a peça — aqui o atalho serve. */
function achar(ws, tipo) {
  return ws.getAllBlocks(false).filter((b) => b.type === tipo)[0];
}

test('tocar numa peça dentro da âncora roda o programa', () => {
  const ws = carregar([{
    type: 'quando_play',
    inputs: { CORPO: { block: {
      type: 'mover_frente', inputs: { SEG: num(2) },
      fields: { VEL: '200' },
    } } },
  }]);
  const r = Blocos.pilhaDoBloco(achar(ws, 'mover_frente'));
  assert.strictEqual(r.ehPrograma, true);
  assert.strictEqual(r.ast.length, 1);
  assert.strictEqual(r.ast[0].op, 'frente');
});

test('tocar numa pilha solta roda só ela, e não conta como programa', () => {
  const ws = carregar([
    { type: 'quando_play' },
    { type: 'girar', inputs: { GRAUS: num(90) } },
  ]);
  const r = Blocos.pilhaDoBloco(achar(ws, 'girar'));
  assert.strictEqual(r.ehPrograma, false);
  assert.strictEqual(r.ast.length, 1);
  assert.strictEqual(r.ast[0].op, 'girar');
});

test('tocar no meio de uma pilha solta roda a pilha inteira, do topo', () => {
  /* O que a criança vê é um grupo de peças, e é o grupo que ela espera ver
     rodar — não o pedaço debaixo do dedo. */
  const ws = carregar([
    { type: 'quando_play' },
    {
      type: 'girar', inputs: { GRAUS: num(90) },
      next: { block: { type: 'esperar', inputs: { SEG: num(1) } } },
    },
  ]);
  const r = Blocos.pilhaDoBloco(achar(ws, 'esperar'));
  assert.strictEqual(r.ast.length, 2);
  assert.strictEqual(r.ast[0].op, 'girar');
  assert.strictEqual(r.ast[1].op, 'esperar');
});

test('um relator não roda: quem toca nele quer o valor, não o movimento', () => {
  /* A regra se lê na peça tocada, e não na raiz dela. Um relator encaixado
     num soquete tem como raiz a pilha que o contém: lida pela raiz, tocar no
     (2+3) faria o robô ANDAR em vez de mostrar 5 — bem no momento em que a
     criança está tentando entender quanto aquele pedaço vale. */
  const ws = carregar([{
    type: 'quando_play',
    inputs: { CORPO: { block: {
      type: 'mover_frente',
      inputs: { SEG: { block: {
        type: 'conta_mais', inputs: { A: num(2), B: num(3) },
      } } },
      fields: { VEL: '200' },
    } } },
  }]);
  assert.strictEqual(Blocos.pilhaDoBloco(achar(ws, 'conta_mais')), null);
});

test('o numerinho do encaixe também é relator', () => {
  /* O shadow é uma peça de verdade, com saída de valor. O evento de clique do
     Blockly entrega o shadow, e não o pai — está no setStartBlock, que só
     sobe para o pai no targetBlock_. Sem esta regra, tocar no corpo do
     numerinho rodaria a pilha. */
  const ws = carregar([{
    type: 'quando_play',
    inputs: { CORPO: { block: {
      type: 'esperar', inputs: { SEG: num(1) },
    } } },
  }]);
  const shadow = achar(ws, 'esperar').getInputTargetBlock('SEG');
  assert.strictEqual(shadow.isShadow(), true);
  assert.strictEqual(Blocos.pilhaDoBloco(shadow), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/blocos.test.js`
Expected: FAIL — `TypeError: Blocos.pilhaDoBloco is not a function` nos cinco testes novos.

- [ ] **Step 3: Write minimal implementation**

Em `web/blocos.js`, logo depois de `workspaceParaAst` (por volta da linha 513):

```js
  /* A peça que a criança tocou, traduzida em "o que rodar".

     A regra se lê no bloco tocado, e não na raiz da pilha dele. Um relator
     encaixado num soquete tem como raiz a pilha que o contém: lida pela raiz,
     tocar no (2 + 3) dentro de "andar frente [(2+3)] s" faria o robô andar em
     vez de dizer quanto aquilo vale — bem no caso em que a criança está
     tentando entender o pedaço.

     Devolve null para relator. Relator não roda, relata: quem trata é a
     bolha. */
  function pilhaDoBloco(bloco) {
    if (!bloco || bloco.outputConnection) return null;
    var raiz = bloco.getRootBlock();
    if (raiz.type === 'quando_play') {
      return { ast: pilhaParaAst(raiz.getInputTargetBlock('CORPO')),
               ehPrograma: true };
    }
    return { ast: pilhaParaAst(raiz), ehPrograma: false };
  }
```

E acrescente à api exportada no final do arquivo:

```js
  var api = { definir: definir, workspaceParaAst: workspaceParaAst,
              pilhaDoBloco: pilhaDoBloco,
              valorDe: valorDe,
              criarRaiz: criarRaiz, temTrabalho: temTrabalho, limpar: limpar,
              CAIXA_XML: CAIXA_XML };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/blocos.test.js && node tests/es5.test.js`
Expected: PASS nos dois. `es5.test.js` confirma que nada de sintaxe moderna entrou em `web/`.

- [ ] **Step 5: Commit**

```bash
git add web/blocos.js tests/blocos.test.js
git commit -m "Traduz a peça tocada na pilha que ela manda rodar"
```

---

### Task 2: O clique roda a pilha

**Files:**
- Modify: `web/app.js` (o ouvinte do `btPlay`, por volta da linha 470; e `definirRodando`, por volta da linha 406)
- Test: `tests/navegador.test.js`

**Interfaces:**
- Consumes: `Blocos.pilhaDoBloco(bloco) -> { ast, ehPrograma } | null` (Task 1).
- Produces: nada que outra tarefa consuma. A Task 6 vai acrescentar um `else` ao mesmo ouvinte de clique criado aqui.

**Contexto que o implementador precisa:** o ouvinte do PLAY hoje é isto, em `web/app.js`:

```js
  btPlay.addEventListener('click', function () {
    spErro.textContent = '';
    Som.tocar('play');
    var compilado;
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
```

E `definirRodando` incrementa `tentativas`, que é o que faz o botão "me mostra como faz" aparecer sozinho depois de algumas execuções sem chegar na estrela.

**Quais campos "engolem" o toque, e quais não.** O `isFieldClick_` do Blockly exige `startField_.isClickable()`, e `Field.isClickable()` só é verdadeiro quando o campo tem editor. Na prática, nos nossos blocos:

| campo | tocar nele |
|---|---|
| o número do encaixe, o menu de velocidade, o menu do girar | abre o editor — **não** emite `CLICK` |
| `field_label` (as palavras "andar frente", "s") | não tem editor — emite `CLICK`, roda a peça |
| `field_image` (o `ICONE`, as setas desenhadas) | não tem editor — emite `CLICK`, roda a peça |

Isto é o que se quer: tocar na palavra ou na seta é tocar na peça. Só o que a criança edita é que não roda. É também o que faz o teste abaixo poder mirar a borda esquerda do bloco sem se preocupar em acertar exatamente o corpo.

- [ ] **Step 1: Write the failing test**

Acrescente ao final de `tests/navegador.test.js`. É um teste de navegador porque o que se afirma é um **gesto**, e gesto não existe sem ponteiro de verdade — o `dom_falso.js` diz isso explicitamente.

```js
/* ---------- o toque que roda ---------- */

test('tocar no corpo da peça roda; tocar no número só abre o editor',
  { skip: CHROMIUM ? false : 'sem Chromium nesta máquina', timeout: 120000 },
  async (t) => {
    /* As duas metades do mesmo gesto, e a segunda é a que mais importa: a
       criança toca no "1" para trocar o número dezenas de vezes por sessão, e
       se isso ligasse os motores a execução viva seria um perigo em vez de um
       presente.

       Não precisamos de raio de arrasto próprio para isso. O handleUp do
       Gesture do Blockly despacha em cadeia exclusiva — arrastar, depois
       campo, depois bloco — então tocar num campo nunca emite CLICK. Este
       teste é o que avisa se alguém um dia trocar o ouvinte por um próprio e
       perder essa garantia. */
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 4) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-toque-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 4}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 4}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 4}/json/list`);
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
    const clicar = async (x, y) => {
      await mouse('mousePressed', x, y);
      await mouse('mouseReleased', x, y);
    };

    await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 4}/` });
    await espera(3000);

    /* Uma pilha solta no canto, longe da âncora: é o rascunho da criança. */
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      const b = Blockly.serialization.blocks.append(
        { type: 'mover_frente',
          inputs: { SEG: { shadow: { type: 'numero', fields: { NUM: 2 } } } },
          fields: { VEL: '200' } }, ws);
      b.moveBy(60, 320);
      window.__b = b.id;
      return 1;
    })()`);
    await espera(600);

    /* O canto de cima à esquerda do bloco é corpo, nunca campo: os campos
       ficam depois do ícone, mais para dentro. */
    const alvo = await aval(`(() => {
      const b = Blockly.getMainWorkspace().getBlockById(window.__b);
      const r = b.getSvgRoot().getBoundingClientRect();
      return JSON.stringify({ corpo: { x: r.left + 6, y: r.top + r.height / 2 } });
    })()`);
    const p = JSON.parse(alvo);

    assert.strictEqual(await aval('document.getElementById("estado").textContent'),
      'parado', 'não devia estar rodando antes de ninguém tocar em nada');

    await clicar(p.corpo.x, p.corpo.y);
    await espera(700);
    assert.strictEqual(await aval('document.getElementById("estado").textContent'),
      'rodando', 'tocar no corpo da peça tinha que rodar a pilha');

    /* Para, e limpa o rastro, para a segunda metade começar do zero. */
    await aval('document.getElementById("parar").click()');
    await espera(700);
    assert.strictEqual(await aval('document.getElementById("estado").textContent'),
      'parado');

    /* Agora o campo do número. O centro do encaixe é onde mora o "2". */
    const campo = await aval(`(() => {
      const b = Blockly.getMainWorkspace().getBlockById(window.__b);
      const alvo = b.getInputTargetBlock('SEG');
      const r = alvo.getSvgRoot().getBoundingClientRect();
      return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()`);
    const c = JSON.parse(campo);
    await clicar(c.x, c.y);
    await espera(700);

    assert.strictEqual(await aval('document.getElementById("estado").textContent'),
      'parado',
      'tocar no número ligou os motores — a criança troca esse número o tempo todo');

    cdp.fechar();
  });

test('rodar uma pilha solta não gasta tentativa da missão',
  { skip: CHROMIUM ? false : 'sem Chromium nesta máquina', timeout: 120000 },
  async (t) => {
    /* O botão "me mostra como faz" aparece sozinho depois de algumas
       execuções sem chegar na estrela, e existe para quem travou. Uma criança
       explorando com o dedo não travou: se cada toque contasse tentativa, a
       oferta de ajuda apareceria no meio da brincadeira, dizendo a ela que
       fracassou justamente quando estava se divertindo. */
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 5) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-tent-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 5}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 5}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 5}/json/list`);
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

    await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 5}/` });
    await espera(3000);

    /* Uma pilha solta que dura pouco: assim dá para rodá-la várias vezes
       dentro do tempo do teste. */
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      const b = Blockly.serialization.blocks.append(
        { type: 'esperar',
          inputs: { SEG: { shadow: { type: 'numero', fields: { NUM: 0 } } } } }, ws);
      b.moveBy(60, 320);
      window.__b = b.id;
      return 1;
    })()`);
    await espera(600);

    const ponto = await aval(`(() => {
      const b = Blockly.getMainWorkspace().getBlockById(window.__b);
      const r = b.getSvgRoot().getBoundingClientRect();
      return JSON.stringify({ x: r.left + 6, y: r.top + r.height / 2 });
    })()`);
    const p = JSON.parse(ponto);

    /* Bem mais toques do que TENTATIVAS_ATE_AJUDA. */
    for (let i = 0; i < Missoes_TENTATIVAS + 3; i++) {
      await mouse('mousePressed', p.x, p.y);
      await mouse('mouseReleased', p.x, p.y);
      await espera(400);
    }

    assert.strictEqual(await aval('document.getElementById("gabarito").hidden'), true,
      'o gabarito se ofereceu sozinho para quem só estava explorando');

    cdp.fechar();
  });
```

E, no topo do arquivo, junto dos outros `require`, acrescente a constante que o laço usa:

```js
const Missoes_TENTATIVAS = require('../web/missoes.js').TENTATIVAS_ATE_AJUDA;
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/navegador.test.js`
Expected: FAIL. O primeiro teste falha em `'tocar no corpo da peça tinha que rodar a pilha'` — o estado continua `parado`, porque ninguém escuta clique ainda. O segundo passa por acidente neste momento (nada roda, então nada conta tentativa); ele vira teste de verdade depois do Step 3, e é por isso que os dois entram juntos.

- [ ] **Step 3: Write the implementation**

Em `web/app.js`, troque o ouvinte do `btPlay` por isto:

```js
  /* O corpo do PLAY, agora com dois chamadores: o botão e o dedo.

     ehPrograma diz o que rodou, não por onde foi pedido — é essa distinção
     que a contagem de tentativas usa. */
  function rodar(ast, ehPrograma) {
    spErro.textContent = '';
    Som.tocar('play');
    var compilado;
    try {
      compilado = Compilador.compilar(ast);
    } catch (e) {
      spErro.textContent = e.message;
      return;
    }
    contarTentativa = ehPrograma;
    mapaPc = compilado.pcMap;
    robo.carregar(compilado.bytes);
    robo.rodar();
  }

  btPlay.addEventListener('click', function () {
    rodar(Blocos.workspaceParaAst(workspace), true);
  });

  /* Tocar numa peça roda a peça. O evento vem do próprio Blockly, e é por isso
     que ele acerta o gesto: o handleUp do Gesture despacha em cadeia
     exclusiva — arrastar vence campo, que vence bloco — então arrastar não
     chega aqui, e tocar no número abre o editor sem chegar aqui. Um ouvinte
     próprio, com raio de arrasto na mão, erraria as duas coisas.

     O flyout tem workspace próprio, então a gaveta de blocos não dispara. */
  workspace.addChangeListener(function (e) {
    if (e.type !== Blockly.Events.CLICK || e.targetType !== 'block') return;
    if (!robo || !robo.pronto()) return;
    var bloco = workspace.getBlockById(e.blockId);
    if (!bloco) return;
    var pilha = Blocos.pilhaDoBloco(bloco);
    if (!pilha) return;          /* relator: quem trata é a bolha */
    if (!pilha.ast.length) return;
    rodar(pilha.ast, pilha.ehPrograma);
  });
```

Declare a variável nova junto das outras do topo do arquivo (perto de `var mapaPc = [];`, por volta da linha 30):

```js
  /* A execução em curso conta como tentativa da missão? Só quando o que rodou
     foi o programa da âncora. Ver definirRodando. */
  var contarTentativa = true;
```

E em `definirRodando`, ponha a condição na contagem:

```js
      /* Rodou e não chegou: uma tentativa. Depois de algumas, a ajuda aparece
         sozinha — sem a criança precisar pedir, que é justamente o que quem
         travou não faz.

         Só o programa da âncora conta. Uma pilha solta rodada com o dedo é
         exploração, não tentativa: contá-la ofereceria o gabarito a quem está
         se divertindo, dizendo que fracassou. */
      if (!cumpriu && contarTentativa) {
        tentativas++;
        if (tentativas >= Missoes.TENTATIVAS_ATE_AJUDA) btGabarito.hidden = false;
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/navegador.test.js && node tests/es5.test.js`
Expected: PASS. O `navegador.test.js` sobe para 5 testes.

- [ ] **Step 5: Commit**

```bash
git add web/app.js tests/navegador.test.js
git commit -m "Toca na peça e ela roda, sem passar pelo PLAY"
```

---

# Etapa 2 — relatar um valor

A partir daqui o firmware muda, e a placa precisa ser regravada para a bolha funcionar no robô de verdade.

---

### Task 3: `OP_REPORT` e o HAL que relata

Uma tarefa só para as quatro implementações do HAL, porque acrescentar uma função a `core/hal.h` é, por definição, uma mudança em **todas** elas — deixar qualquer uma para depois quebra o link de algum build.

**Files:**
- Modify: `core/bytecode.h`
- Modify: `core/vm.c` (o `switch` do `vm_tick`)
- Modify: `core/hal.h`
- Modify: `host/hal_sim.c`
- Modify: `firmware/src/main.cpp`
- Modify: `tests/fake_hal.c`
- Test: `tests/vm_test.c`

**Interfaces:**
- Consumes: `empilhar`/`desempilhar`, estáticas em `core/vm.c`. `desempilhar` já para a VM quando a pilha está vazia — nenhuma regra nova precisa ser escrita para esse caso.
- Produces:
  - `OP_REPORT = 13` em `core/bytecode.h`
  - `void hal_report(int32_t valor);` em `core/hal.h`
  - no trace do `fake_hal`: a linha `"REPORT <n>"`
  - no stdout do robô virtual: a linha `V <n>\n`
  - no WebSocket da ESP32: o quadro `T_VALOR = 0x84` seguido de `int32` LE

- [ ] **Step 1: Write the failing test**

Em `tests/vm_test.c`, acrescente as duas funções de teste antes do `main`:

```c
static void teste_report_devolve_o_topo_da_pilha(void) {
    printf("teste_report_devolve_o_topo_da_pilha\n");
    VM vm;
    uint8_t prog[INSTR_BYTES * 5], *p = prog;
    /* 40 + 2, relatado. É o que a criança vê ao tocar numa conta. */
    p = emit(p, OP_PUSH, 40, 0, 0);
    p = emit(p, OP_PUSH, 2, 0, 0);
    p = emit(p, OP_BIN, BIN_MAIS, 0, 0);
    p = emit(p, OP_REPORT, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    preparar(&vm, prog, sizeof(prog));
    rodar_ate_parar(&vm);
    /* O MOTOR 0,0 é o HALT: parar é sempre cortar os motores. */
    const char *esperado[] = { "REPORT 42", "MOTOR 0,0" };
    checar_trace(esperado, 2);
}

static void teste_report_com_pilha_vazia_para_a_vm(void) {
    printf("teste_report_com_pilha_vazia_para_a_vm\n");
    VM vm;
    uint8_t prog[INSTR_BYTES * 2], *p = prog;
    p = emit(p, OP_REPORT, 0, 0, 0);
    p = emit(p, OP_HALT, 0, 0, 0);
    preparar(&vm, prog, sizeof(prog));
    vm_tick(&vm);
    CHECK(!vm.rodando);
    /* Nada relatado: um valor que não existe não vira número na tela da
       criança. Só o corte de motores do vm_stop. */
    const char *esperado[] = { "MOTOR 0,0" };
    checar_trace(esperado, 1);
}
```

E registre as duas no `main`, junto das outras chamadas.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests && make test`
Expected: FAIL na compilação — `OP_REPORT undeclared`.

- [ ] **Step 3: Write the implementation**

**`core/bytecode.h`** — dentro do `enum` dos opcodes, depois de `OP_JMP_FALSE = 12`:

```c
    OP_JMP_FALSE = 12,
    /* Desempilha o topo e o entrega ao HAL. É o caminho de volta que faltava:
       sem ele a criança pode mandar uma conta para o robô, mas não pode
       perguntar quanto ela deu. */
    OP_REPORT    = 13
```

**`core/hal.h`** — junto das outras:

```c
/* Entrega um valor calculado a quem estiver ouvindo: a linha "V n" no robô
   virtual, um quadro no WebSocket na placa. Diferente dos outros hal_*, este
   não fala com um pino — fala com quem está olhando. */
void hal_report(int32_t valor);
```

**`core/vm.c`** — no `switch` do `vm_tick`, depois do `case OP_JMP_FALSE`:

```c
    case OP_REPORT: {
        int32_t v = desempilhar(vm);
        if (!vm->rodando) break;
        hal_report(v);
        vm->pc++;
        break;
    }
```

**`host/hal_sim.c`** — no fim do arquivo:

```c
/* O stdout já é line-buffered no main.c, então a linha sai na hora. */
void hal_report(int32_t valor) {
    printf("V %d\n", (int)valor);
}
```

e acrescente `#include <stdio.h>` ao topo desse arquivo.

**`tests/fake_hal.c`** — no fim do arquivo:

```c
void hal_report(int32_t valor) {
    if (n_trace < MAX_TRACE)
        snprintf(trace[n_trace++], sizeof(trace[0]), "REPORT %d", (int)valor);
}
```

**`firmware/src/main.cpp`** — acrescente o tipo junto dos outros, por volta da linha 20:

```cpp
static const uint8_t T_PC = 0x81, T_STATE = 0x82, T_VALOR = 0x84;
```

e a implementação logo depois de `enviar_estado`:

```cpp
/* int32 e não int16: a pilha da VM é de 32 bits, e uma conta da criança chega
   lá — 100 x 100 já não caberia. É o primeiro campo do protocolo com essa
   largura, de propósito.

   Mora aqui, e não no hal_esp32.cpp, porque relatar é ato de protocolo e não
   de hardware: o ws é desta casa, ao lado de enviar_pc e enviar_estado. */
extern "C" void hal_report(int32_t valor) {
    uint32_t v = (uint32_t)valor;
    uint8_t q[5] = { T_VALOR, (uint8_t)(v & 0xFF), (uint8_t)((v >> 8) & 0xFF),
                     (uint8_t)((v >> 16) & 0xFF), (uint8_t)((v >> 24) & 0xFF) };
    ws.binaryAll(q, sizeof(q));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd tests && make test`
Expected: PASS nos três binários, com as duas linhas novas no `vm_test`.

Run: `cd host && make`
Expected: compila sem aviso (o Makefile usa `-Werror`).

Run: `cd firmware && pio run`
Expected: compila. Se o PlatformIO não estiver instalado nesta máquina, anote isso no commit em vez de fingir que passou.

- [ ] **Step 5: Commit**

```bash
git add core/bytecode.h core/vm.c core/hal.h host/hal_sim.c \
        firmware/src/main.cpp tests/fake_hal.c tests/vm_test.c
git commit -m "Abre o caminho de volta: a VM sabe relatar um valor"
```

---

### Task 4: `Compilador.compilarValor`

**Files:**
- Modify: `web/compilador.js`
- Test: `tests/compilador.test.js`

**Interfaces:**
- Consumes: `OP_REPORT = 13` (Task 3), como espelho na tabela `OP` do compilador.
- Produces:
  ```js
  Compilador.OP.REPORT === 13
  Compilador.compilar(ast, opcoes)      // opcoes.reportar: nó de valor (opcional)
  Compilador.compilarValor(no) -> { bytes: Uint8Array, pcMap: Array }
  ```

**Contexto:** `gerarValor(v, blockId)` já existe dentro de `compilar` e deixa exatamente um valor na pilha, conferindo profundidade antes. O fim de `compilar` hoje é `gerar(ast); emitir(OP.HALT, 0, 0, 0, null);`.

- [ ] **Step 1: Write the failing test**

Acrescente ao final de `tests/compilador.test.js`:

```js
/* ---------- relatar um valor ---------- */

/* Devolve os opcodes em ordem, para afirmar a forma do programa sem depender
   dos bytes. */
function opcodesDe(bytes) {
  const ops = [];
  for (let i = 0; i < bytes.length; i += 7) ops.push(bytes[i]);
  return ops;
}

test('compilarValor emite a conta, depois REPORT, depois HALT', () => {
  const { bytes } = Compilador.compilarValor(
    { op: 'mais', a: 40, b: 2, blockId: 'x' });
  assert.deepStrictEqual(opcodesDe(bytes), [
    Compilador.OP.PUSH, Compilador.OP.PUSH, Compilador.OP.BIN,
    Compilador.OP.REPORT, Compilador.OP.HALT,
  ]);
});

test('compilarValor de um número solto é PUSH, REPORT, HALT', () => {
  /* É o numerinho do encaixe: a criança toca no "3" e o robô responde 3. */
  const { bytes } = Compilador.compilarValor(3);
  assert.deepStrictEqual(opcodesDe(bytes), [
    Compilador.OP.PUSH, Compilador.OP.REPORT, Compilador.OP.HALT,
  ]);
});

test('compilarValor do sensor pergunta ao sensor, e não à telemetria', () => {
  /* O bloco que carrega a lição toda: na ESP32 isto lê o HC-SR04 de verdade. */
  const { bytes } = Compilador.compilarValor({ op: 'distancia', blockId: 'd' });
  assert.deepStrictEqual(opcodesDe(bytes), [
    Compilador.OP.SENSOR, Compilador.OP.REPORT, Compilador.OP.HALT,
  ]);
});

test('uma conta funda demais para a pilha é recusada aqui também', () => {
  /* A mesma guarda do programa normal vale para a bolha: melhor a criança ler
     a frase do que ver o robô parar sem explicação. */
  let no = 1;
  for (let i = 0; i < 20; i++) no = { op: 'mais', a: 1, b: no };
  assert.throws(() => Compilador.compilarValor(no), /complicada demais/);
});

test('o REPORT não aparece no programa normal', () => {
  /* O exportador de .ino lê a AST, não o bytecode, e nenhum bloco de comando
     relata. Se um REPORT vazasse para cá, o robô pararia de rodar o programa
     no meio para falar sozinho. */
  const { bytes } = Compilador.compilar([
    { op: 'frente', segundos: 1, velocidade: 200, blockId: 'a' },
  ]);
  assert.ok(!opcodesDe(bytes).includes(Compilador.OP.REPORT));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/compilador.test.js`
Expected: FAIL — `Compilador.compilarValor is not a function`.

- [ ] **Step 3: Write the implementation**

Em `web/compilador.js`, acrescente `REPORT` à tabela `OP`:

```js
  var OP = {
    HALT: 0, MOTOR: 1, WAIT: 2, TURN: 3,
    SET_REG: 4, DEC_JNZ: 5, JMP: 6,
    PUSH: 8, SENSOR: 9, BIN: 10, UN: 11, JMP_FALSE: 12, REPORT: 13,
  };
```

Troque a assinatura de `compilar` e o trecho final dela:

```js
  /* opcoes.reportar, quando vem, é um nó de valor: compila-se a subárvore dele
     e relata-se o resultado, em vez de gerar o programa. É o mesmo compilador
     de propósito — o navegador não calcula nada por conta própria, senão
     passariam a existir duas aritméticas no projeto (o int32 da VM e o double
     do JS) divergindo justamente onde é difícil perceber. */
  function compilar(ast, opcoes) {
```

e, onde hoje está `gerar(ast); emitir(OP.HALT, 0, 0, 0, null);`:

```js
    if (opcoes && opcoes.reportar !== undefined) {
      var idValor = (opcoes.reportar && opcoes.reportar.blockId) || null;
      gerarValor(opcoes.reportar, idValor);
      emitir(OP.REPORT, 0, 0, 0, idValor);
    } else {
      gerar(ast);
    }
    emitir(OP.HALT, 0, 0, 0, null);
```

E, junto da api exportada no final do arquivo:

```js
  /* Um programa que existe só para responder uma pergunta: calcula o valor,
     relata, e para. */
  function compilarValor(no) {
    return compilar([], { reportar: no });
  }

  var api = { compilar: compilar, compilarValor: compilarValor,
              OP: OP, BIN: BIN, UN: UN, MAX_INSTR: MAX_INSTR };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/compilador.test.js && node tests/arduino.test.js && node tests/es5.test.js`
Expected: PASS nos três. O `arduino.test.js` entra porque compartilha a AST e é o vizinho mais provável de quebrar.

- [ ] **Step 5: Commit**

```bash
git add web/compilador.js tests/compilador.test.js
git commit -m "Compila uma pergunta: o valor, o REPORT, e para"
```

---

### Task 5: `V` atravessa a ponte

**Files:**
- Modify: `bridge/server.js` (`paraQuadroDoNavegador`, por volta da linha 173)
- Modify: `web/rede.js`
- Test: `tests/bridge.test.js`

**Interfaces:**
- Consumes: a linha `V <n>\n` do robô virtual (Task 3).
- Produces:
  - `paraQuadroDoNavegador('V 42')` → `Buffer` de 5 bytes: `0x84` e `int32` LE
  - `Rede.conectar(url, { aoValor: function (n) {...} })` — `n` é `Number`

- [ ] **Step 1: Write the failing test**

Acrescente ao final de `tests/bridge.test.js`:

```js
test('a linha V vira o quadro T_VALOR, em int32', () => {
  const q = paraQuadroDoNavegador('V 42');
  assert.strictEqual(q.length, 5);
  assert.strictEqual(q[0], 0x84);
  assert.strictEqual(q.readInt32LE(1), 42);
});

test('o valor relatado passa dos 16 bits sem estragar', () => {
  /* A pilha da VM é int32, e 100 x 100 já não caberia em int16. Cortar aqui
     faria a bolha mentir para a criança justamente na conta grande, que é a
     que ela quis conferir. */
  const q = paraQuadroDoNavegador('V 100000');
  assert.strictEqual(q.readInt32LE(1), 100000);
});

test('valor negativo atravessa como negativo', () => {
  const q = paraQuadroDoNavegador('V -7');
  assert.strictEqual(q.readInt32LE(1), -7);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/bridge.test.js`
Expected: FAIL — `paraQuadroDoNavegador('V 42')` devolve `null`, então `q.length` estoura com `Cannot read properties of null`.

- [ ] **Step 3: Write the implementation**

Em `bridge/server.js`, acrescente `T_VALOR` às constantes do topo:

```js
const T_PC = 0x81, T_STATE = 0x82, T_TELEM = 0x83, T_VALOR = 0x84;
```

e o ramo em `paraQuadroDoNavegador`, antes do `return null` final:

```js
  if (p[0] === 'V') {
    /* int32, e não int16 como os outros campos: a pilha da VM é de 32 bits, e
       uma conta da criança chega lá. */
    const q = Buffer.alloc(5);
    q[0] = T_VALOR;
    q.writeInt32LE(Number(p[1]) | 0, 1);
    return q;
  }
```

Em `web/rede.js`, acrescente o tipo e o ramo:

```js
  var T_PC = 0x81, T_STATE = 0x82, T_TELEM = 0x83, T_VALOR = 0x84;
```

```js
        case T_VALOR:
          if (manipuladores.aoValor) manipuladores.aoValor(d.getInt32(1, true));
          break;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/bridge.test.js && node tests/es5.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add bridge/server.js web/rede.js tests/bridge.test.js
git commit -m "Leva o valor relatado do robô até o navegador"
```

---

### Task 6: A bolha

**Files:**
- Modify: `web/index.html` (o CSS, e um `div` junto dos outros painéis por volta da linha 409)
- Modify: `web/app.js` (o ouvinte de clique da Task 2; o `conectar`, por volta da linha 428)
- Test: `tests/navegador.test.js`

**Interfaces:**
- Consumes: `Blocos.pilhaDoBloco` devolvendo `null` para relator (Task 1); `Compilador.compilarValor(no)` (Task 4); `aoValor` (Task 5); `Blocos.valorDe(bloco, nome)` — já existe e é exportado.
- Produces: nada que outra tarefa consuma.

**Nota de tradução:** para compilar um relator é preciso o **nó de valor** dele. `blocoParaNo` é privado em `web/blocos.js`, mas `pilhaDoBloco` já devolve `null` para relator, então a Task 6 precisa de um caminho novo: exporte também `Blocos.valorDoBloco(bloco)`, que devolve `blocoParaNo(bloco)` quando o bloco tem `outputConnection`, e `null` caso contrário. Para o shadow de número, `blocoParaNo` não tem `case` — trate antes, lendo `bloco.getFieldValue('NUM')` como `Number`.

- [ ] **Step 1: Write the failing test**

Acrescente ao final de `tests/blocos.test.js`:

```js
test('valorDoBloco traduz um relator, e recusa um comando', () => {
  const ws = carregar([{
    type: 'quando_play',
    inputs: { CORPO: { block: {
      type: 'mover_frente',
      inputs: { SEG: { block: {
        type: 'conta_mais', inputs: { A: num(2), B: num(3) },
      } } },
      fields: { VEL: '200' },
    } } },
  }]);
  const no = Blocos.valorDoBloco(achar(ws, 'conta_mais'));
  assert.strictEqual(no.op, 'mais');
  assert.strictEqual(no.a, 2);
  assert.strictEqual(no.b, 3);
  assert.strictEqual(Blocos.valorDoBloco(achar(ws, 'mover_frente')), null);
});

test('valorDoBloco lê o numerinho do encaixe', () => {
  const ws = carregar([{
    type: 'quando_play',
    inputs: { CORPO: { block: { type: 'esperar', inputs: { SEG: num(7) } } } },
  }]);
  const shadow = achar(ws, 'esperar').getInputTargetBlock('SEG');
  assert.strictEqual(Blocos.valorDoBloco(shadow), 7);
});
```

E acrescente ao final de `tests/navegador.test.js`:

```js
test('tocar num relator mostra o valor numa bolha',
  { skip: CHROMIUM ? false : 'sem Chromium nesta máquina', timeout: 120000 },
  async (t) => {
    /* A metade do encanto que custou o opcode novo. O número não é calculado
       aqui: ele desce até a VM como qualquer outra coisa e volta de lá, para
       não existirem duas aritméticas no projeto. */
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 6) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-bolha-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 6}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 6}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 6}/json/list`);
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

    await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 6}/` });
    await espera(3000);

    /* O Gigante é o nível onde as contas existem. */
    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=gigante]').click();
      return 1;
    })()`);
    await espera(800);

    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      const b = Blockly.serialization.blocks.append(
        { type: 'conta_mais',
          inputs: { A: { shadow: { type: 'numero', fields: { NUM: 40 } } },
                    B: { shadow: { type: 'numero', fields: { NUM: 2 } } } } }, ws);
      b.moveBy(60, 340);
      window.__b = b.id;
      return 1;
    })()`);
    await espera(600);

    const ponto = await aval(`(() => {
      const b = Blockly.getMainWorkspace().getBlockById(window.__b);
      const r = b.getSvgRoot().getBoundingClientRect();
      return JSON.stringify({ x: r.left + 4, y: r.top + r.height / 2 });
    })()`);
    const p = JSON.parse(ponto);

    await mouse('mousePressed', p.x, p.y);
    await mouse('mouseReleased', p.x, p.y);
    await espera(1200);

    assert.strictEqual(await aval('document.getElementById("bolha").hidden'), false,
      'a bolha não apareceu');
    assert.strictEqual(await aval('document.getElementById("bolha").textContent'),
      '42', 'a conta voltou errada do robô');

    cdp.fechar();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/blocos.test.js`
Expected: FAIL — `Blocos.valorDoBloco is not a function`.

Run: `node tests/navegador.test.js`
Expected: FAIL — `document.getElementById("bolha")` é `null`.

- [ ] **Step 3: Write the implementation**

**`web/blocos.js`** — junto de `pilhaDoBloco`:

```js
  /* O nó de valor de um relator, para a bolha compilar a pergunta.

     O shadow de número não tem case no blocoParaNo — ele é o campo, não um
     bloco traduzível — então sai daqui direto como número. É o que faz tocar
     no "7" do encaixe responder 7. */
  function valorDoBloco(bloco) {
    if (!bloco || !bloco.outputConnection) return null;
    if (bloco.type === 'numero' || bloco.type === 'numero_bolinhas') {
      return Number(bloco.getFieldValue('NUM'));
    }
    return blocoParaNo(bloco);
  }
```

e no `api`: `valorDoBloco: valorDoBloco,`.

**`web/index.html`** — o `div`, junto dos outros painéis (depois do `<canvas id="confete">`):

```html
  <div id="bolha" hidden></div>
```

e o CSS, junto das outras regras (sem `var()`, sem `gap` — a regra vale aqui):

```css
  /* Flutua sobre a peça tocada. position:fixed porque a medida vem do
     getBoundingClientRect, que já é relativo à janela. */
  #bolha {
    position: fixed;
    z-index: 60;
    background: #002080;
    color: #ffffff;
    font: bold 20px system-ui, sans-serif;
    padding: 6px 12px;
    border-radius: 14px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }
```

**`web/app.js`** — junto das outras referências de DOM no topo:

```js
  var divBolha = document.getElementById('bolha');
  var relatorEsperado = null;   /* o bloco cuja resposta estamos aguardando */
  var tempoBolha = null;
```

as funções, perto de `acender`:

```js
  function esconderBolha() {
    divBolha.hidden = true;
    if (tempoBolha) { clearTimeout(tempoBolha); tempoBolha = null; }
  }

  /* Sobre a peça, e um pouco acima dela. A medida sai do SVG do próprio bloco,
     que é quem sabe onde ele está depois de qualquer zoom ou rolagem. */
  function mostrarBolha(bloco, texto) {
    var r = bloco.getSvgRoot().getBoundingClientRect();
    divBolha.textContent = texto;
    divBolha.hidden = false;
    divBolha.style.left = Math.round(r.left) + 'px';
    divBolha.style.top = Math.round(r.top - 38) + 'px';
    if (tempoBolha) clearTimeout(tempoBolha);
    tempoBolha = setTimeout(esconderBolha, 4000);
  }
```

o ramo novo no ouvinte de clique da Task 2 — troque o `return` do relator por isto:

```js
    var pilha = Blocos.pilhaDoBloco(bloco);
    if (!pilha) {
      /* Relator: não roda, relata. */
      var no = Blocos.valorDoBloco(bloco);
      if (no === null) return;
      var perg;
      try {
        perg = Compilador.compilarValor(no);
      } catch (err) {
        spErro.textContent = err.message;
        return;
      }
      esconderBolha();
      relatorEsperado = bloco.id;
      contarTentativa = false;
      mapaPc = perg.pcMap;
      robo.carregar(perg.bytes);
      robo.rodar();
      return;
    }
    esconderBolha();
    if (!pilha.ast.length) return;
    rodar(pilha.ast, pilha.ehPrograma);
```

e o manipulador novo em `conectar`, junto de `aoPc` e `aoEstado`:

```js
      aoValor: function (n) {
        if (!relatorEsperado) return;
        var bloco = workspace.getBlockById(relatorEsperado);
        relatorEsperado = null;
        if (bloco) mostrarBolha(bloco, String(n));
      },
```

Por fim, esconda a bolha quando o PLAY roda — no `rodar`, logo depois de `spErro.textContent = '';`:

```js
    esconderBolha();
    relatorEsperado = null;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/blocos.test.js && node tests/navegador.test.js && node tests/es5.test.js`
Expected: PASS. O `navegador.test.js` sobe para 6 testes.

- [ ] **Step 5: Commit**

```bash
git add web/blocos.js web/app.js web/index.html \
        tests/blocos.test.js tests/navegador.test.js
git commit -m "Toca no relator e o número aparece numa bolha"
```

---

### Task 7: O limite conhecido, escrito

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: tudo o que as tarefas 1–6 entregaram.
- Produces: nada de código.

- [ ] **Step 1: Rodar a suíte inteira, e anotar o que ela disse**

```bash
cd tests && make test && cd ..
for f in tests/*.test.js; do echo "== $f"; node "$f" 2>&1 | grep -E '^# (pass|fail)'; done
```

Expected: `# fail 0` em todas. O `gabaritos.test.js` leva uns 5 minutos — é o preço de ele existir.

- [ ] **Step 2: Escrever a seção nova no README**

Na seção "Como usar", depois do item 3 (o PLAY):

```markdown
4. **Toque numa peça e ela roda na hora** — sem passar pelo PLAY. Uma pilha
   solta no canto é um rascunho que funciona; tocar no programa dentro do
   `▶ quando apertar PLAY` é o mesmo que apertar PLAY.
5. **Toque num relator** — uma conta, o `👁 distância cm` — e o valor aparece
   numa bolha. O número não é calculado pelo navegador: ele desce até a VM e
   volta de lá, então é o mesmo número que o robô usaria. Na ESP32 isso lê o
   HC-SR04 de verdade, o que faz do dedo a melhor ferramenta de bancada que o
   projeto tem.

Tocar no campo de um número não roda nada: abre o editor, como sempre. Quem
separa as duas coisas é o próprio Blockly, e não um raio de arrasto nosso.
```

E, junto das outras notas de limite:

```markdown
> **Um clique interrompe o que estiver rodando.** A VM tem um `pc` e um
> programa só, então tocar em qualquer peça — inclusive no `👁 distância cm`
> para espiar a leitura no meio de uma execução — para o que estava rodando e
> começa o que foi tocado. Não é defeito: é o teto desta versão da VM, e é
> exatamente o que o próximo ciclo, tarefas e eventos, existe para levantar.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Conta no README que agora é só tocar, e onde isso esbarra"
```

---

## Depois do plano

A etapa 2 muda o firmware. Para a bolha valer no robô de verdade:

```bash
./firmware/preparar_data.sh
cd firmware
pio run --target uploadfs
pio run --target upload
```

A porta da placa é `/dev/ttyACM0`.

Só a etapa 1 (tarefas 1–2) funciona na placa que já está gravada, sem regravar nada.
