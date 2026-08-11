# Trocar de nível: fechar a aba, confirmar e limpar — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar de dificuldade passa a fechar a aba de blocos, perguntar antes quando há trabalho montado, e — confirmado — esvaziar o espaço de trabalho.

**Architecture:** Três funções puras novas em `web/blocos.js` respondem o que o `app.js` precisa saber sobre o workspace (tem trabalho? limpa; cria a raiz), e são testáveis em Node com o DOM falso. O diálogo é marcação escondida no `index.html` mais fiação no `app.js`, no mesmo padrão do `#missao` e do `#gabarito`. O teste do Chromium, que hoje afirma o comportamento antigo, é reescrito para o novo.

**Tech Stack:** JavaScript ES5 sem transpilador (módulos UMD), Blockly 8 compilado, `node:test`, Chromium headless via CDP.

**Spec:** [`docs/superpowers/specs/2026-08-11-troca-de-nivel-design.md`](../specs/2026-08-11-troca-de-nivel-design.md)

## Global Constraints

Valem para **todas** as tarefas.

- **ES5 estrito em tudo dentro de `web/`.** Nada de `let`, `const`, arrow function, template literal, `class`, spread/rest, `**`, nem método abreviado em objeto (`{ m() {} }` → `{ m: function () {} }`). O alvo é o Safari do iOS 9 num iPad 2, que dá erro ao **carregar** o arquivo: uma arrow function perdida mata a página antes da primeira linha rodar. `tests/es5.test.js` é o guarda. Arquivos em `tests/` rodam em Node e **não** têm essa restrição.
- **CSS sem `var()`, sem `gap`, sem `aspect-ratio`, sem `inset`, e sem `<dialog>`.** Mesma razão. A regra já está escrita em `web/index.html:20`. Sobreposição se faz com `position: fixed` mais `top/right/bottom/left`.
- **Comentários em português**, explicando *por que*, não *o quê*. Siga a densidade dos arquivos vizinhos.
- **Nenhuma mudança em `core/`, `host/` ou `firmware/src/`.** Se um passo parecer exigir isso, pare e reporte.
- **Cores exatas do projeto:** azul royal `#0050f0`, ciano `#20b0f0`, navy `#002080`, amarelo `#f0c000`, verde do PLAY `#37c26b`, vermelho do PARAR `#f25c4a`.
- **Commits em português, no imperativo**, descrevendo a intenção e não o diff.
- **Como rodar os testes:**
  - Tudo: `node --test tests/` (leva ~5 min por causa dos testes de Chromium)
  - Tudo menos os lentos: `node --test $(ls tests/*.test.js | grep -v gabaritos.test.js | grep -v navegador.test.js)`. Nada de `--test-skip-pattern`: esta máquina tem Node 18 e a flag só existe da 20 em diante.
  - Um arquivo: `node --test tests/blocos.test.js`
  - C: `make -C tests test`

---

## Estrutura de arquivos

| arquivo | responsabilidade | tarefa |
|---|---|---|
| `web/blocos.js` | Ganha `criarRaiz`, `temTrabalho`, `limpar` — perguntas e operações sobre o conteúdo do workspace, que este arquivo já é dono de traduzir. | 1 |
| `tests/blocos.test.js` | Testa as três em Node, em milissegundos. | 1 |
| `web/app.js` | Passa a usar `Blocos.criarRaiz`; `trocarNivel` ganha as guardas, o diálogo, o fechamento da aba e o reset. | 1, 2 |
| `web/index.html` | Marcação e CSS do diálogo. | 2 |
| `tests/navegador.test.js` | Reescrito para o comportamento novo. | 2 |
| `README.md` | A frase sobre não perder nada ao trocar de nível deixou de valer. | 3 |

---

## Task 1: as três funções de workspace em `web/blocos.js`

Independente do diálogo: entrega valor sozinha (tira a criação da raiz de dentro do `app.js`, onde não é testável) e é o alicerce do resto.

**Files:**
- Modify: `web/blocos.js` (funções novas e a API exportada em `web/blocos.js:216-217`)
- Modify: `web/app.js:57-61` (usa `Blocos.criarRaiz`)
- Test: `tests/blocos.test.js`

**Interfaces:**
- Consumes: `Blockly.serialization.blocks.append`, `workspace.getAllBlocks(false)`, `workspace.clear()`.
- Produces, todas exportadas em `Blocos`:
  - `criarRaiz(workspace)` → o bloco `quando_play` criado em `(40, 30)`, com `setDeletable(false)` e `setMovable(false)`.
  - `temTrabalho(workspace)` → `boolean`. Verdadeiro se existe **qualquer** bloco cujo `type` não seja `'quando_play'` — inclusive blocos soltos, fora da pilha, porque um bloco arrastado para o canto continua sendo trabalho da criança.
  - `limpar(workspace)` → esvazia e devolve a raiz nova, criada por `criarRaiz`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao fim de `tests/blocos.test.js`:

```javascript
/* criarRaiz e limpar mexem no workspace de verdade, e o evento de criação do
   Blockly monta XML com document.createElementNS — o mesmo motivo pelo qual o
   helper "carregar" desliga os eventos. Aqui vale o mesmo cuidado. */
function semEventos(fn) {
  Blockly.Events.disable();
  try { return fn(); } finally { Blockly.Events.enable(); }
}

test('criarRaiz põe um quando_play que a criança não apaga nem arrasta', () => {
  const ws = new Blockly.Workspace();
  const raiz = semEventos(() => Blocos.criarRaiz(ws));
  assert.strictEqual(raiz.type, 'quando_play');
  assert.strictEqual(raiz.isDeletable(), false, 'a raiz não pode ser apagável');
  assert.strictEqual(raiz.isMovable(), false, 'a raiz não pode ser arrastável');
  assert.strictEqual(ws.getAllBlocks(false).length, 1);
});

test('temTrabalho é falso quando só existe a raiz vazia', () => {
  const ws = carregar([{ type: 'quando_play' }]);
  assert.strictEqual(Blocos.temTrabalho(ws), false);
});

test('temTrabalho é verdadeiro com um bloco dentro da raiz', () => {
  const ws = carregar([{
    type: 'quando_play',
    inputs: { CORPO: { block: { type: 'mover_frente' } } },
  }]);
  assert.strictEqual(Blocos.temTrabalho(ws), true);
});

test('temTrabalho conta bloco solto, fora da pilha', () => {
  /* Um bloco arrastado para o canto e nunca encaixado continua sendo trabalho
     dela: apagá-lo sem avisar seria a mesma perda. */
  const ws = carregar([{ type: 'quando_play' }, { type: 'girar' }]);
  assert.strictEqual(Blocos.temTrabalho(ws), true);
});

test('limpar deixa exatamente uma raiz, e ela continua fixa', () => {
  const ws = carregar([{
    type: 'quando_play',
    inputs: { CORPO: { block: { type: 'mover_frente' } } },
  }, { type: 'girar' }]);
  const raiz = semEventos(() => Blocos.limpar(ws));
  const todos = ws.getAllBlocks(false);
  assert.strictEqual(todos.length, 1, 'sobrou bloco depois de limpar');
  assert.strictEqual(todos[0].type, 'quando_play');
  assert.strictEqual(raiz.isDeletable(), false);
  assert.strictEqual(raiz.isMovable(), false);
  assert.strictEqual(Blocos.temTrabalho(ws), false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/blocos.test.js`
Expected: FAIL, cinco testes, com `Blocos.criarRaiz is not a function` e `Blocos.temTrabalho is not a function`.

- [ ] **Step 3: Escrever as três funções**

Em `web/blocos.js`, logo depois de `workspaceParaAst` (por volta da linha 214) e antes da linha que monta `var api`:

```javascript
  /* A raiz nasce fixa: a criança não precisa saber que ela existe, e não pode
     apagá-la sem querer — sem ela o PLAY não tem por onde começar. */
  function criarRaiz(workspace) {
    var raiz = Blockly.serialization.blocks.append(
      { type: 'quando_play', x: 40, y: 30 }, workspace);
    raiz.setDeletable(false);
    raiz.setMovable(false);
    return raiz;
  }

  /* Tem alguma coisa além da raiz fixa? Conta bloco solto também: um bloco
     arrastado para o canto e nunca encaixado continua sendo trabalho dela, e
     apagá-lo sem avisar seria a mesma perda. */
  function temTrabalho(workspace) {
    var todos = workspace.getAllBlocks(false);
    for (var i = 0; i < todos.length; i++) {
      if (todos[i].type !== 'quando_play') return true;
    }
    return false;
  }

  /* setDeletable(false) impede a criança de apagar, não o programa: o clear do
     Blockly leva a raiz junto, por isso ela é recriada aqui. */
  function limpar(workspace) {
    workspace.clear();
    return criarRaiz(workspace);
  }
```

E troque a linha da API por:

```javascript
  var api = { definir: definir, workspaceParaAst: workspaceParaAst,
              criarRaiz: criarRaiz, temTrabalho: temTrabalho, limpar: limpar,
              CAIXA_XML: CAIXA_XML };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/blocos.test.js`
Expected: PASS, todos.

Se `limpar` falhar com "sobrou bloco depois de limpar", o `workspace.clear()` do Blockly 8 não removeu a raiz não-apagável. Nesse caso troque o corpo de `limpar` por um laço explícito e mantenha o resto igual:

```javascript
  function limpar(workspace) {
    var topo = workspace.getTopBlocks(false);
    for (var i = 0; i < topo.length; i++) {
      topo[i].setDeletable(true);
      topo[i].dispose(false);
    }
    return criarRaiz(workspace);
  }
```

- [ ] **Step 5: Usar `criarRaiz` no `app.js`**

Em `web/app.js`, substitua as linhas 57-61:

```javascript
  /* O bloco raiz nasce fixo: a criança não precisa saber que ele existe. */
  var raiz = Blockly.serialization.blocks.append(
    { type: 'quando_play', x: 40, y: 30 }, workspace);
  raiz.setDeletable(false);
  raiz.setMovable(false);
```

por:

```javascript
  /* O bloco raiz nasce fixo: a criança não precisa saber que ele existe. A
     regra mora no blocos.js porque o "limpar" precisa exatamente dela, e duas
     cópias da mesma regra é como elas divergem. */
  Blocos.criarRaiz(workspace);
```

A variável `raiz` não é usada em nenhum outro ponto do arquivo — confira com `grep -n "raiz" web/app.js` antes de apagar; deve sobrar só a palavra dentro do comentário.

- [ ] **Step 6: Bateria rápida**

Run: `node --test $(ls tests/*.test.js | grep -v gabaritos.test.js | grep -v navegador.test.js)`
Expected: PASS. O `es5.test.js` tem que continuar aprovando `blocos.js`.

- [ ] **Step 7: Commit**

```bash
git add web/blocos.js web/app.js tests/blocos.test.js
git commit -F - <<'EOF'
Move a raiz fixa para o blocos.js, junto de temTrabalho e limpar

A criação da raiz estava solta no app.js, onde não há como testar: precisa de
DOM. Ela se muda porque o "limpar" precisa exatamente dela, e duas cópias da
mesma regra é como elas divergem.

O temTrabalho conta bloco solto também. Um bloco arrastado para o canto e
nunca encaixado continua sendo trabalho da criança, e apagá-lo sem avisar
seria a mesma perda.
EOF
```

---

## Task 2: o diálogo, as guardas, a aba que fecha e o reset

**Files:**
- Modify: `tests/navegador.test.js` (reescrito no que toca a troca de nível)
- Modify: `web/index.html` (marcação do diálogo e CSS)
- Modify: `web/app.js:408-428` (`trocarNivel` e a fiação do diálogo)

**Interfaces:**
- Consumes: `Blocos.temTrabalho(workspace)` e `Blocos.limpar(workspace)` da Task 1; `Niveis.NOMES` (`{pequeno:'Pequeno', medio:'Médio', grande:'Grande'}`); `robo.parar()` de `web/rede.js:78`.
- Produces: os ids de DOM `#confirma`, `#confirma-titulo`, `#confirma-texto`, `#confirma-nao`, `#confirma-sim`, que o teste do navegador dirige.

**O comportamento completo, que os testes fixam:**

| situação | o que acontece |
|---|---|
| clique no nível **já ativo** | nada. Sem diálogo, sem reset. |
| workspace **sem trabalho** | troca direto, sem diálogo |
| workspace **com trabalho** | abre o diálogo; nada muda ainda |
| "Não", `Esc`, ou toque no fundo | fecha; nível, blocos e aba como estavam |
| "Trocar" | nível muda, workspace esvazia, aba fecha, tentativas zeram, robô para |

- [ ] **Step 1: Reescrever o trecho de troca de nível no teste do navegador**

Em `tests/navegador.test.js`, substitua o bloco das linhas 145-162 (do comentário `/* Sobe para Médio: ... */` até a asserção `'o valor escondido não foi preservado'`) por:

```javascript
    /* A aba está aberta desde a checagem da paleta, logo acima. Trocar de nível
       com trabalho montado tem que perguntar antes — e, até responder, nada
       pode ter mudado. */
    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=medio]').click();
      return 1;
    })()`);
    await espera(300);

    assert.strictEqual(await aval(`document.getElementById('confirma').hidden`),
      false, 'trocar de nível com trabalho montado deveria perguntar');
    assert.strictEqual(
      await aval(`document.getElementById('confirma-titulo').textContent`),
      'Trocar para Médio?', 'o título deveria nomear o destino');
    assert.strictEqual(
      await aval(`document.querySelector('#niveis button[data-nivel=pequeno]')
        .getAttribute('aria-pressed')`),
      'true', 'o botão do nível não pode afundar antes de confirmar');
    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace().getBlocksByType('mover_frente', false).length`),
      1, 'nada pode ser apagado antes de confirmar');

    /* "Não" desfaz tudo: continua no Pequeno, com o programa intacto. */
    await aval(`(() => {
      document.getElementById('confirma-nao').click();
      return 1;
    })()`);
    await espera(300);

    assert.strictEqual(await aval(`document.getElementById('confirma').hidden`),
      true, 'o diálogo deveria ter fechado');
    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace().getBlocksByType('mover_frente', false).length`),
      1, 'dizer não apagou o programa');
    assert.strictEqual(
      await aval(`document.querySelector('#niveis button[data-nivel=pequeno]')
        .getAttribute('aria-pressed')`),
      'true', 'dizer não trocou o nível assim mesmo');

    /* Clicar no nível em que já está não é troca: não pergunta e não apaga. */
    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=pequeno]').click();
      return 1;
    })()`);
    await espera(300);

    assert.strictEqual(await aval(`document.getElementById('confirma').hidden`),
      true, 'clicar no nível ativo não deveria perguntar nada');
    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace().getBlocksByType('mover_frente', false).length`),
      1, 'clicar no nível ativo apagou o programa');

    /* Agora confirma de verdade: troca, esvazia e fecha a aba. */
    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=medio]').click();
      return 1;
    })()`);
    await espera(300);
    await aval(`(() => {
      document.getElementById('confirma-sim').click();
      return 1;
    })()`);
    await espera(500);

    assert.strictEqual(
      await aval(`document.querySelector('#niveis button[data-nivel=medio]')
        .getAttribute('aria-pressed')`),
      'true', 'o nível não trocou depois de confirmar');
    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace().getBlocksByType('mover_frente', false).length`),
      0, 'confirmar deveria ter apagado o programa');
    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace().getAllBlocks(false).length`),
      1, 'deveria sobrar só a raiz');
    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace().getAllBlocks(false)[0].type`),
      'quando_play', 'o que sobrou não é a raiz');

    /* O defeito que começou tudo: a aba aberta continuava oferecendo as peças
       do nível anterior, e dava para arrastar uma delas para dentro do
       Pequeno. */
    assert.strictEqual(
      await aval(`(() => {
        const f = Blockly.getMainWorkspace().getFlyout();
        return !!(f && f.isVisible());
      })()`),
      false, 'a aba de blocos continuou aberta depois de trocar de nível');

    /* Com o workspace vazio não há o que perder, e um diálogo que aparece sem
       precisar ensina a criança a atravessá-lo sem ler. */
    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=grande]').click();
      return 1;
    })()`);
    await espera(300);

    assert.strictEqual(await aval(`document.getElementById('confirma').hidden`),
      true, 'workspace vazio não deveria perguntar nada');
    assert.strictEqual(
      await aval(`document.querySelector('#niveis button[data-nivel=grande]')
        .getAttribute('aria-pressed')`),
      'true', 'a troca sem diálogo não aconteceu');

    /* Volta para o Médio e remonta, porque o resto do teste roda um programa. */
    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=medio]').click();
      const ws = Blockly.getMainWorkspace();
      Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
        type: 'quando_play', x: 40, y: 30,
        inputs: { CORPO: { block: {
          type: 'mover_frente', fields: { SEG: 0.5 },
          next: { block: { type: 'girar', fields: { GRAUS: 90 } } }
        } } }
      }] } }, ws);
      Niveis.aplicar(ws, 'medio');
      return 1;
    })()`);
    await espera(300);

    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace()
        .getBlocksByType('mover_frente', false)[0].getField('SEG').isVisible()`),
      true, 'no Médio o número deveria aparecer');
```

E troque o nome do teste na linha 35 — ele afirmava o contrário do que agora vale:

```javascript
test('a criança monta, roda, e trocar de nível pergunta antes de apagar',
```

Atualize também o comentário do topo do arquivo (linhas 2-4):

```javascript
/* Sobe o bridge, dirige um Chromium headless e confere o que a criança veria.
   É o único nível em que dá para testar o diálogo de troca de nível: ele é
   DOM, evento e Blockly ao mesmo tempo. Pula sozinho se não houver Chromium. */
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/navegador.test.js`
Expected: FAIL em `trocar de nível com trabalho montado deveria perguntar` — `document.getElementById('confirma')` é `null`, então a avaliação estoura antes da asserção. Isso conta como falha esperada.

- [ ] **Step 3: Marcação do diálogo no `index.html`**

Em `web/index.html`, logo depois de `<canvas id="confete"></canvas>` e antes do primeiro `<script>`:

```html
  <div id="confirma" hidden>
    <div id="confirma-caixa" role="dialog" aria-modal="true"
         aria-labelledby="confirma-titulo">
      <h2 id="confirma-titulo">Trocar de nível?</h2>
      <p id="confirma-texto">Os blocos que você montou vão ser apagados.</p>
      <div id="confirma-botoes">
        <button id="confirma-nao" type="button">Não</button>
        <button id="confirma-sim" type="button">Trocar</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 4: CSS do diálogo**

Em `web/index.html`, dentro do `<style>`, logo antes do comentário `/* ---------- corpo ---------- */`:

```css
  /* ---------- diálogo de confirmação ---------- */
  /* Sem <dialog>: não existe no Safari do iOS 9. Um div com position:fixed e
     top/right/bottom/left faz o mesmo e abre em tudo. */

  #confirma {
    position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 200;
    background: rgba(0, 32, 128, .55);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  }
  /* Obrigatório: o display:flex acima vence o [hidden] do navegador, e sem
     esta linha o diálogo nasce visível e nunca fecha. */
  #confirma[hidden] { display: none; }

  #confirma-caixa {
    background: #fff; border-radius: 22px; padding: 26px 28px;
    max-width: 420px; text-align: center;
    box-shadow: 0 10px 0 rgba(0, 32, 128, .25);
  }
  #confirma-titulo { margin: 0 0 10px; font-size: 24px; font-weight: 800;
                     color: #002080; }
  #confirma-texto { margin: 0 0 22px; font-size: 17px; font-weight: 700;
                    color: #002080; line-height: 1.35; }
  #confirma-botoes { display: flex; justify-content: center; }
  #confirma-botoes button { margin: 0 8px; }

  /* O "Não" é o botão pesado, e nasce com o foco: o que escapar por teclado
     escapa para o lado seguro. */
  #confirma-nao { background: #002080; box-shadow: 0 5px 0 #00185f; }
  #confirma-sim { background: #f0c000; color: #002080;
                  box-shadow: 0 5px 0 #c49c00; }
```

- [ ] **Step 5: Fiação no `app.js`**

Em `web/app.js`, junto das outras buscas de elemento no topo do arquivo (perto da linha 18, onde está `var btGabarito = ...`):

```javascript
  var caixaConfirma = document.getElementById('confirma');
  var tituloConfirma = document.getElementById('confirma-titulo');
  var btConfirmaNao = document.getElementById('confirma-nao');
  var btConfirmaSim = document.getElementById('confirma-sim');
  var nivelPendente = null;
```

E substitua a função `trocarNivel` e o laço de botões (linhas 416-428) por:

```javascript
  /* A aba de blocos é um workspace à parte, e o updateToolbox reconstrói a
     caixa sem fechá-la: sem isto ela continua oferecendo as peças do nível que
     se acabou de sair, e dá para arrastar um se…senão para dentro do Pequeno. */
  function fecharPaleta() {
    var f = workspace.getFlyout && workspace.getFlyout();
    if (f && f.isVisible && f.isVisible()) f.hide();
    /* A categoria selecionada também precisa soltar: só esconder o flyout
       deixa a aba marcada como aberta, e o toque seguinte nela não faz nada. */
    var tb = workspace.getToolbox && workspace.getToolbox();
    if (tb && tb.clearSelection) tb.clearSelection();
  }

  function aplicarTroca(novo) {
    /* Trocar de nível no meio de uma execução deixaria o robô andando na arena
       com um programa que não existe mais na tela. */
    if (rodando && robo && robo.parar) robo.parar();
    nivel = Niveis.definir(novo);
    marcarNivel();
    workspace.updateToolbox(Niveis.caixaXml(nivel));
    fecharPaleta();
    Blocos.limpar(workspace);
    /* A fase fica: o nível decide como os blocos são desenhados, não quais
       fases já foram vencidas. Mas as tentativas dela naquela fase eram de um
       programa que não existe mais. */
    tentativas = 0;
    btGabarito.hidden = true;
    aplicarNivel();
  }

  function perguntarTroca(novo) {
    nivelPendente = novo;
    tituloConfirma.textContent = 'Trocar para ' + Niveis.NOMES[novo] + '?';
    caixaConfirma.hidden = false;
    btConfirmaNao.focus();
  }

  function fecharConfirma() {
    caixaConfirma.hidden = true;
    nivelPendente = null;
  }

  function trocarNivel(novo) {
    /* Clicar no nível em que já está não é troca. Sem esta guarda, apagaria o
       trabalho sem que nada mudasse na tela. */
    if (novo === nivel) return;
    /* Nada montado, nada a perder — e um diálogo que aparece sem precisar
       ensina a criança a atravessá-lo sem ler, e aí ele para de proteger. */
    if (!Blocos.temTrabalho(workspace)) { aplicarTroca(novo); return; }
    perguntarTroca(novo);
  }

  btConfirmaNao.addEventListener('click', fecharConfirma);
  btConfirmaSim.addEventListener('click', function () {
    var novo = nivelPendente;
    fecharConfirma();
    if (novo) aplicarTroca(novo);
  });
  /* Tocar no fundo é o mesmo que "Não" — só no fundo, não na caixa. */
  caixaConfirma.addEventListener('click', function (e) {
    if (e.target === caixaConfirma) fecharConfirma();
  });
  /* keyCode além de key: o Safari do iOS 9 não tem event.key confiável. */
  document.addEventListener('keydown', function (e) {
    if (caixaConfirma.hidden) return;
    if (e.key === 'Escape' || e.keyCode === 27) fecharConfirma();
  });

  /* forEach, e não for: com var o laço não cria escopo, e todos os botões
     acabariam apontando para o último. */
  botoesNivel.forEach(function (b) {
    b.addEventListener('click', function () { trocarNivel(b.dataset.nivel); });
  });
```

- [ ] **Step 6: Rodar o teste do navegador**

Run: `node --test tests/navegador.test.js`
Expected: PASS, ~1 min.

Se falhar em `a aba de blocos continuou aberta`, o `clearSelection` do toolbox não existe nesta versão do Blockly — troque por `tb.setSelectedItem(null)` e rode de novo.

Se falhar em `o diálogo deveria ter fechado`, confira que a linha `#confirma[hidden] { display: none; }` está no CSS: sem ela o `display: flex` vence o `hidden` e a caixa nunca some.

- [ ] **Step 7: Bateria e commit**

Run: `node --test $(ls tests/*.test.js | grep -v gabaritos.test.js)`
Expected: PASS. Inclui o `navegador.test.js` e o `es5.test.js`.

```bash
git add web/app.js web/index.html tests/navegador.test.js
git commit -F - <<'EOF'
Pergunta antes de trocar de nível, e fecha a aba de blocos

A aba aberta continuava oferecendo as peças do nível anterior depois da
troca: dava para arrastar um se…senão do Grande para dentro do Pequeno. O
updateToolbox reconstrói a caixa sem fechar o flyout.

Trocar de nível com algo montado passa a perguntar, e confirmado apaga. Não
pergunta quando não precisa: clicar no nível já ativo não é troca, e
workspace vazio não tem o que perder. Diálogo que aparece à toa ensina a
criança a atravessá-lo sem ler, e aí para de proteger.

A fase fica. O nível decide como os blocos são desenhados, não quais fases
já foram vencidas.
EOF
```

---

## Task 3: README, bateria e firmware

- [ ] **Step 1: Corrigir o README**

`README.md:172` termina o parágrafo da regra do controle honesto com **«Nada se perde ao descer de nível.»** Isso deixou de ser verdade. Substitua essa frase por:

```markdown
Dentro de um nível nada se perde: o valor escondido continua guardado, e é isso
que deixa o gabarito se escrever na língua de cada nível. **Trocar** de nível é
outra coisa — ele pergunta antes e apaga o que estava montado, porque os blocos
de controle não têm desenho simplificado possível: um `se…senão` no Pequeno não
é o `se obstáculo` com menos campos, é outra coisa.
```

- [ ] **Step 2: Bateria inteira**

```bash
node --test tests/
make -C tests test
bash tests/host_test.sh
```

Expected: tudo verde. Leva ~5 min por causa dos dois testes de Chromium.

Se algo falhar aqui e passou nas tarefas anteriores, é interação entre mudanças — pare e reporte antes de mexer.

- [ ] **Step 3: Regravar os arquivos servidos pela ESP32**

```bash
bash firmware/preparar_data.sh
```

`firmware/data/` está no `.gitignore` — é artefato de build, regerado antes de gravar na placa, e **não entra em commit**.

- [ ] **Step 4: Conferir que o firmware ainda compila**

```bash
cd firmware && pio run
```

Expected: `[SUCCESS]`. Nenhum arquivo em `firmware/src/` foi tocado; isto é só o guarda. Volte para a raiz depois (`cd ..`), porque o diretório de trabalho persiste entre comandos.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -F - <<'EOF'
Corrige o README: trocar de nível passou a apagar
EOF
```

---

## Verificação final

Confirme cada linha com a saída do comando na mão:

- [ ] `node --test tests/` — verde, incluindo `navegador.test.js` e `gabaritos.test.js`
- [ ] `make -C tests test` — verde
- [ ] `bash tests/host_test.sh` — verde
- [ ] `node --test tests/es5.test.js` — verde
- [ ] `git status` — limpo
- [ ] Nenhum arquivo em `core/`, `host/` ou `firmware/src/` no diff. `8a007d5` é o commit da spec, imediatamente anterior à Task 1:
      `git diff --stat 8a007d5 -- core host firmware/src` não devolve nada
