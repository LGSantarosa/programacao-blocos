# Entradas nos blocos inventados — plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para executar tarefa a tarefa. Os passos usam
> caixinha (`- [ ]`) para marcar.

**Goal:** a criança ensina «quadrado (lado)» e, na hora de usar, entrega o
número no buraco da peça.

**Architecture:** a cópia do ciclo 5 continua; o que entra é um **ambiente
empilhado** na geração. O corpo da definição segue traduzido uma vez e
compartilhado entre os usos, e o compilador, ao esbarrar na peça roxa, gera ali
a subárvore do argumento daquele uso. **Nenhum arquivo em `core/` ou
`firmware/` muda; não se regrava a placa.**

**Tech Stack:** JavaScript ES5 no `web/`, Blockly 8.0.5 vendorizado,
`node --test` sem dependência nenhuma de npm, Chromium por CDP nos testes de
navegador, `g++` para conferir o sketch.

**Spec:** [`docs/superpowers/specs/2026-09-16-entradas-nos-blocos-inventados-design.md`](../specs/2026-09-16-entradas-nos-blocos-inventados-design.md)

## Global Constraints

- **ES5 no `web/`.** Nada de `for…of`, `class`, propriedade abreviada,
  `String.prototype.repeat`, `normalize`. O `tests/es5.test.js` reprova.
- **Zero dependência de npm.** O projeto não tem uma sequer.
- **`N_ENTRADAS = 3`**, constante de `web/blocos.js`. Não vai para
  `core/bytecode.h`.
- **Não tocar em `core/`, `firmware/`, `bridge/` nem `host/`.** Se um passo
  pedir isso, o plano está errado — pare e diga.
- **Cores:** `COR_BLOCO = '#a040c0'`, `COR_SEM_DEFINICAO = '#b0b0b0'`, já em
  `web/blocos.js`.
- **Prefixos de identificador no `.ino`:** `caixa_` para caixas, `bloco_` para
  blocos inventados, `p_` para parâmetros.
- **Mensagem de commit em português**, na voz do projeto (o que a criança
  ganha, não o que o arquivo mudou). **Sem linhas de atribuição.**
- **Ordem de validação, por decisão dele:** testes rápidos e a prova de
  navegador focada **antes** do commit; `make test-lento` inteiro só no fim do
  ciclo, e quem confere é ele. Não prenda o commit na suíte de 292 s — é ela
  que hospeda o F3, intermitente e sem reprodução.
- **Árvore parada durante prova lenta:** não edite `web/` enquanto o
  `gabaritos.test.js` roda; vermelho assim não prova nada.

---

## O rótulo é campo de texto — decidido, e já na spec

Ao detalhar apareceu um impedimento real: `field_label_serializable` tem
`EDITABLE = false` e **não é clicável**, então a janelinha do primeiro desenho
exigiria um ícone de lápis por entrada.

Este plano usa, para cada rótulo de entrada, um **`field_input`** — exatamente
o que o campo `NOME` da cabeça já é hoje, e que já funciona no WebView do app.
Tocar edita ali mesmo; **deixar vazio apaga a entrada**. O comportamento que a
spec promete é o mesmo; o mecanismo é mais simples e já provado no projeto.

O ➕ continua sendo campo (`Blockly.FieldImage` com `onClick`, quinto parâmetro
público do construtor), e não corpo de bloco — tocar no corpo roda a pilha.

**Decidido por ele em 2026-09-16, e a spec foi atualizada para casar com este
plano.** Não é desvio: é o desenho.

---

## Duas armadilhas pagas na Task 1, que valem para as Tasks 2 e 3

**Estado extra só entra por mutador.** `Blockly.Extensions.register` tira uma
fotografia das propriedades de mutador antes e depois de aplicar a extensão e
recusa se ela as acrescentou: «mutation properties changed when applying a
non-mutator extension». O caminho é `Blockly.Extensions.registerMutator(nome,
mixin, ajudante)`, com o par `saveExtraState`/`loadExtraState` **no mixin**, e no
JSON do bloco `mutator:` em vez de (ou ao lado de) `extensions:`. Sem `compose`
nem `decompose` no mixin não há bolha de diálogo — só o estado. O ajudante
`registrarMutador` já existe em `web/blocos.js`, ao lado do `registrarUma`.

**Um encaixe carrega junto os campos que vêm antes dele.** No JSON da cabeça o
campo `NOME` vem antes do `input_dummy ENTRADAS`, então ele mora *naquela*
fileira: `removeInput('ENTRADAS')` leva o nome do bloco junto, e o validador do
nome morre com ele. Por isso o `refazerEntradas_` remove e repõe **só os campos
que ele mesmo pôs**, guardados em `camposEntrada_`, em vez de derrubar o
encaixe. É a mesma armadilha que o `Niveis.aplicar` já paga ao esconder encaixe.

**Sobre o vermelho enganoso:** antes de o bloco ter `loadExtraState`, carregar um
estado com `extraState` cai no ramo XML do Blockly
(`a.loadExtraState ? … : a.domToMutation(Xml.textToDom(…))`) e estoura com
`DOMParser is not defined`, porque o `tests/dom_falso.js` não finge DOMParser —
e não deve fingir. Esse erro é «ainda não implementado» com fantasia: some
sozinho quando o gancho existe.

## Duas lições da Task 4, para os testes das tarefas seguintes

**Asserção frouxa vira teste que não pode falhar.** Dois testes da Task 4
passaram **antes** de a feature existir: eles exigiam `/entrada/i` e `/conta/i`,
e o erro genérico de nó desconhecido é «Conta desconhecida: entrada», que casa
com os dois. Um deles deveria provar o teto da pilha e nunca chegava perto dele.
Asserte a **frase exata** que a implementação promete, nunca uma palavra que o
erro de sempre também contém — e desconfie de todo teste que fica verde antes da
hora.

**Conta funda é para a direita.** `profundidadeDe` faz
`Math.max(ea, eb + 1)`: uma cadeia que cresce para a esquerda custa 2 lugares,
não n. O ajudante da casa é `funda(k)` em `tests/compilador.test.js`
(`{op:'mais', a:1, b:v}`), e a fronteira já está fixada em outro teste —
`funda(14)` cabe, `funda(15)` não. Use o ajudante; e prove a fronteira nos dois
sentidos, porque só a recusa também passaria com uma guarda estrita demais.

## Estrutura de arquivos

| arquivo | responsabilidade nova |
|---|---|
| `web/blocos.js` | `N_ENTRADAS`, o ➕, a lista de entradas da cabeça (com `saveExtraState`), a peça `bloco_entrada`, os encaixes `ENT_<id>` no `bloco_usar`, e os nós `entrada` e `usar.args` |
| `web/compilador.js` | o ambiente empilhado: `case 'entrada'`, `case 'usar'` com argumentos, e a profundidade medida depois da substituição |
| `web/arduino.js` | assinatura `void bloco_x(int p_lado)`, a chamada com argumentos, e a recusa do argumento vivo lido mais de uma vez |
| `web/niveis.js` | `bloco_entrada` na lista do Gigante, **sem** entrar na gaveta |
| `web/app.js` | ligar o ➕, a renomeação e a remoção à atualização dos usos e da gaveta |
| `tests/*.test.js` | as provas, incluindo a linha de ciclo de vida do Blockly que o ciclo 5 subestimou |

---

### Task 1: Os ids e as entradas na cabeça

**Files:**
- Modify: `web/blocos.js` (o JSON de `bloco_ensinar`, hoje em ~244-253; a
  extensão `bloco_ensinar_procedimento`, hoje em ~114-142)
- Test: `tests/blocos.test.js`

**Interfaces:**
- Consumes: `icone(desenho)`, `LADO_ICONE`, `registrarUma(nome, fn)`,
  `COR_BLOCO` — todos já em `web/blocos.js`.
- Produces:
  - `bloco.entradas_` → array de `{ id: string, nome: string }` na cabeça
    `bloco_ensinar`, na ordem em que aparecem.
  - `bloco.refazerEntradas_()` → redesenha a fileira `ENTRADAS`.
  - `bloco.getProcedureDef()` → `[nome, ['lado'], false]`.
  - `Blocos.entradasDe(bloco)` → cópia de `bloco.entradas_` (a Task 3 e a
    Task 6 leem por aqui, sem tocar no `_`).

- [ ] **Step 1: Escrever o teste que falha**

Em `tests/blocos.test.js`, no fim do arquivo:

```js
/* ---------- entradas dos blocos inventados ---------- */

function cabecaCom(entradas) {
  const ws = carregar([{ type: 'bloco_ensinar', fields: { NOME: 'quadrado' },
                         extraState: { entradas: entradas } }]);
  return ws.getBlocksByType('bloco_ensinar', false)[0];
}

test('a cabeça guarda as entradas e as devolve na ordem', () => {
  const b = cabecaCom([{ id: 'e1', nome: 'lado' }, { id: 'e2', nome: 'cor' }]);
  assert.deepStrictEqual(Blocos.entradasDe(b),
    [{ id: 'e1', nome: 'lado' }, { id: 'e2', nome: 'cor' }]);
});

test('cada entrada vira um campo editável na cabeça', () => {
  const b = cabecaCom([{ id: 'e1', nome: 'lado' }]);
  assert.strictEqual(b.getFieldValue('ENT_e1'), 'lado');
});

test('getProcedureDef leva os nomes das entradas', () => {
  const b = cabecaCom([{ id: 'e1', nome: 'lado' }]);
  assert.deepStrictEqual(b.getProcedureDef(), ['quadrado', ['lado'], false]);
});

test('as entradas voltam iguais depois de salvar e carregar', () => {
  const b = cabecaCom([{ id: 'e1', nome: 'lado' }]);
  const estado = Blockly.serialization.blocks.save(b);
  const ws2 = carregar([estado]);
  const b2 = ws2.getBlocksByType('bloco_ensinar', false)[0];
  assert.deepStrictEqual(Blocos.entradasDe(b2), [{ id: 'e1', nome: 'lado' }]);
  assert.strictEqual(b2.getFieldValue('ENT_e1'), 'lado');
});

test('o ➕ some na terceira entrada', () => {
  const tres = [{ id: 'a', nome: 'x' }, { id: 'b', nome: 'y' },
                { id: 'c', nome: 'z' }];
  assert.ok(!cabecaCom(tres).getField('MAIS'), 'o ➕ não devia existir com 3');
  assert.ok(cabecaCom(tres.slice(0, 2)).getField('MAIS'), 'faltou o ➕ com 2');
});

test('esvaziar o nome de uma entrada apaga a entrada', () => {
  const b = cabecaCom([{ id: 'e1', nome: 'lado' }, { id: 'e2', nome: 'cor' }]);
  b.setFieldValue('', 'ENT_e1');
  assert.deepStrictEqual(Blocos.entradasDe(b), [{ id: 'e2', nome: 'cor' }]);
  assert.ok(!b.getField('ENT_e1'), 'o campo da entrada apagada devia sumir');
});

test('renomear a entrada troca o nome e mantém o id', () => {
  const b = cabecaCom([{ id: 'e1', nome: 'lado' }]);
  b.setFieldValue('tamanho', 'ENT_e1');
  assert.deepStrictEqual(Blocos.entradasDe(b), [{ id: 'e1', nome: 'tamanho' }]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --test-name-pattern="entrada" tests/blocos.test.js`
Expected: FAIL — `Blocos.entradasDe is not a function`.

- [ ] **Step 3: O ➕ e a constante**

Em `web/blocos.js`, logo depois de `GIRO_ANTI` (~linha 71):

```js
  /* Cruz grossa, para ler a 20px num tablet — mesma régua das setas. */
  var MAIS_ICONE = icone('<path d="M10 3 h4 v7 h7 v4 h-7 v7 h-4 v-7 h-7 v-4 h7 z"' +
                         ' fill="#fff"/>');

  /* Quantas entradas um bloco inventado aceita. Três é o que cabe na largura
     de uma peça num tablet, e cobre «retângulo (largura) (altura)». Não vai
     para core/bytecode.h: a VM não sabe que blocos inventados existem. */
  var N_ENTRADAS = 3;
```

- [ ] **Step 4: A fileira das entradas no JSON da cabeça**

Em `web/blocos.js`, trocar o objeto `bloco_ensinar` (~244-253) por:

```js
      {
        type: 'bloco_ensinar',
        message0: '🧩 ensinar %1 %2',
        args0: [
          { type: 'field_input', name: 'NOME', text: 'meu bloco' },
          /* A fileira onde os rótulos das entradas e o ➕ moram. Nomeada
             porque o refazerEntradas_ a derruba e remonta a cada mudança. */
          { type: 'input_dummy', name: 'ENTRADAS' },
        ],
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        colour: COR_BLOCO,
        extensions: ['bloco_ensinar_procedimento'],
        tooltip: 'Dá um nome às peças de baixo. Depois, a peça com esse nome ' +
                 'faz tudo isso de uma vez.',
      },
```

- [ ] **Step 5: A lista de entradas na extensão da cabeça**

Em `web/blocos.js`, dentro de `registrarUma('bloco_ensinar_procedimento', …)`,
**antes** do `getProcedureDef` que já existe:

```js
      bloco.entradas_ = [];
      bloco.proximoId_ = 1;

      /* Id curto e monotônico, guardado no extraState — e NÃO o
         Blockly.utils.idGenerator.genUid, que existe mas gera coisas como
         «#,9?MMXZK+a/rQA,~PSE»: este id vira nome de encaixe e de campo
         (ENT_<id>, ROT_<id>), e nome de encaixe com # e / é frágil e ilegível.

         Monotônico, e nunca reaproveitado: se «e1» fosse apagada e o próximo
         id voltasse a ser «e1», um uso que ficou para trás teria o buraco
         ENT_e1 apontando calado para uma entrada nova. É o defeito do "lugar
         sujo" que o caixas.js já pagou uma vez. */
      bloco.novoIdDeEntrada_ = function () {
        var id = 'e' + bloco.proximoId_;
        bloco.proximoId_++;
        return id;
      };

      /* O id nunca muda; o nome é só o que aparece. É a lição do caixas.js:
         amarrar o argumento ao nome faria renomear «lado» jogar fora o número
         que a criança já digitou no buraco do uso. */
      bloco.saveExtraState = function () {
        var fora = [], k;
        for (k = 0; k < bloco.entradas_.length; k++) {
          fora.push({ id: bloco.entradas_[k].id, nome: bloco.entradas_[k].nome });
        }
        return { entradas: fora, proximo: bloco.proximoId_ };
      };

      bloco.loadExtraState = function (estado) {
        var lista = (estado && estado.entradas) || [], k, e, n;
        bloco.entradas_ = [];
        for (k = 0; k < lista.length && bloco.entradas_.length < N_ENTRADAS; k++) {
          e = lista[k];
          if (!e || !e.id) continue;
          bloco.entradas_.push({ id: String(e.id), nome: String(e.nome || '') });
        }
        /* O contador volta junto; e se o estado vier torto, ele sobe acima de
           todo id já usado, para o próximo nunca colidir com um que exista. */
        bloco.proximoId_ = Number(estado && estado.proximo) || 1;
        for (k = 0; k < bloco.entradas_.length; k++) {
          n = Number(String(bloco.entradas_[k].id).replace(/^e/, ''));
          if (isFinite(n) && n >= bloco.proximoId_) bloco.proximoId_ = n + 1;
        }
        bloco.refazerEntradas_();
      };

      /* Derruba a fileira e remonta. Remontar inteiro, em vez de mexer campo a
         campo, é o que mantém a ordem certa depois de apagar a do meio. */
      bloco.refazerEntradas_ = function () {
        if (bloco.getInput('ENTRADAS')) bloco.removeInput('ENTRADAS');
        var fileira = bloco.appendDummyInput('ENTRADAS'), k, e;
        for (k = 0; k < bloco.entradas_.length; k++) {
          e = bloco.entradas_[k];
          fileira.appendField(
            new Blockly.FieldTextInput(e.nome, validadorDeEntrada(bloco, e.id)),
            'ENT_' + e.id);
        }
        if (bloco.entradas_.length < N_ENTRADAS) {
          fileira.appendField(
            new Blockly.FieldImage(MAIS_ICONE, LADO_ICONE, LADO_ICONE,
                                   'mais uma entrada',
                                   function () { bloco.novaEntrada_(); }),
            'MAIS');
        }
        /* A fileira nasce no fim; o corpo tem que continuar embaixo. */
        if (bloco.getInput('CORPO')) bloco.moveInputBefore('ENTRADAS', 'CORPO');
      };

      bloco.novaEntrada_ = function () {
        if (bloco.entradas_.length >= N_ENTRADAS) return;
        bloco.entradas_.push({ id: bloco.novoIdDeEntrada_(),
                               nome: nomeLivreDeEntrada(bloco) });
        bloco.refazerEntradas_();
        if (bloco.aoMudarEntradas_) bloco.aoMudarEntradas_();
      };
```

E, **fora** da extensão, no mesmo arquivo:

```js
  /* «entrada», «entrada2»… O nome só precisa ser único dentro da cabeça. */
  function nomeLivreDeEntrada(bloco) {
    var base = 'entrada', n = 1, tentativa = base, k, repetido;
    do {
      repetido = false;
      for (k = 0; k < bloco.entradas_.length; k++) {
        if (bloco.entradas_[k].nome === tentativa) repetido = true;
      }
      if (repetido) { n++; tentativa = base + n; }
    } while (repetido);
    return tentativa;
  }

  /* Trocar renomeia; deixar vazio apaga. Uma janelinha só para as duas coisas
     — e é o campo de texto que o NOME da cabeça já usa, que funciona no
     WebView do app. */
  function validadorDeEntrada(bloco, id) {
    return function (novo) {
      var limpo = String(novo === null || novo === undefined ? '' : novo).trim();
      var k;
      for (k = 0; k < bloco.entradas_.length; k++) {
        if (bloco.entradas_[k].id !== id) continue;
        if (!limpo) {
          bloco.entradas_.splice(k, 1);
          /* Remontar de dentro do validador: o campo que está sendo validado
             morre junto, e por isso o valor devolvido não importa. */
          setTimeout(function () {
            bloco.refazerEntradas_();
            if (bloco.aoMudarEntradas_) bloco.aoMudarEntradas_();
          }, 0);
          return null;
        }
        bloco.entradas_[k].nome = limpo;
        if (bloco.aoMudarEntradas_) bloco.aoMudarEntradas_();
        return limpo;
      }
      return limpo;
    };
  }
```

- [ ] **Step 6: `getProcedureDef` leva os nomes**

Trocar, na mesma extensão:

```js
      bloco.getProcedureDef = function () {
        var nomes = [], k;
        for (k = 0; k < bloco.entradas_.length; k++) nomes.push(bloco.entradas_[k].nome);
        return [bloco.getFieldValue('NOME'), nomes, false];
      };
```

- [ ] **Step 7: Exportar `entradasDe`**

No objeto `api` (~1002-1013), acrescentar `entradasDe: entradasDe,` e, antes
dele:

```js
  /* Cópia: quem lê de fora não mexe na lista da cabeça. */
  function entradasDe(bloco) {
    var fora = [], lista = (bloco && bloco.entradas_) || [], k;
    for (k = 0; k < lista.length; k++) {
      fora.push({ id: lista[k].id, nome: lista[k].nome });
    }
    return fora;
  }
```

- [ ] **Step 8: Rodar e ver passar**

Run: `node --test --test-name-pattern="entrada" tests/blocos.test.js`
Expected: PASS, os sete.

Se o teste de apagar falhar por o campo ainda existir, o `setTimeout(…, 0)` do
validador ainda não rodou: envolva a asserção em
`await new Promise((r) => setTimeout(r, 0));` e marque o teste como `async`.

- [ ] **Step 9: A suíte inteira, que é barata**

Run: `make test`
Expected: PASS, 0 falhas. O `es5.test.js` faz parte — se ele reprovar, você
escreveu ES6 em `web/`.

- [ ] **Step 10: Commit**

```bash
git add web/blocos.js tests/blocos.test.js
git commit -m "A cabeça de ensinar ganha entradas com nome, e cada uma tem um lugar que não muda"
git push origin master
```

---

### Task 2: A peça roxa e o nó `entrada`

**Files:**
- Modify: `web/blocos.js` (o array de `defineBlocksWithJsonArray`; o
  `blocoParaNo`, hoje em ~724)
- Test: `tests/blocos.test.js`

**Interfaces:**
- Consumes: `entradasDe`, `erroNaPeca(mensagem, b)` (já existe, ~583).
- Produces: o nó `{ op: 'entrada', id, nome, blockId }`, devolvido por
  `blocoParaNo` para o tipo `bloco_entrada`.

- [ ] **Step 1: Escrever o teste que falha**

```js
test('a peça roxa dentro da cabeça vira nó de entrada', () => {
  const ws = carregar([{
    type: 'bloco_ensinar', fields: { NOME: 'quadrado' },
    extraState: { entradas: [{ id: 'e1', nome: 'lado' }] },
    inputs: { CORPO: { block: {
      type: 'girar',
      inputs: { GRAUS: { block: { type: 'bloco_entrada',
                                  extraState: { id: 'e1', nome: 'lado' } } } },
    } } },
  }]);
  const def = ws.getBlocksByType('bloco_ensinar', false)[0];
  const ast = Blocos.pilhaDoBloco(def).ast;
  assert.strictEqual(ast[0].graus.op, 'entrada');
  assert.strictEqual(ast[0].graus.id, 'e1');
  assert.strictEqual(ast[0].graus.nome, 'lado');
});

test('a peça roxa fora de qualquer cabeça é erro', () => {
  const ws = carregar([{ type: 'quando_play', inputs: { CORPO: { block: {
    type: 'girar',
    inputs: { GRAUS: { block: { type: 'bloco_entrada',
                                extraState: { id: 'e1', nome: 'lado' } } } },
  } } } }]);
  assert.throws(() => Blocos.workspaceParaAst(ws),
    /só funciona dentro do bloco que você ensinou/);
});

test('a peça roxa de uma entrada apagada é erro', () => {
  const ws = carregar([{
    type: 'bloco_ensinar', fields: { NOME: 'quadrado' },
    extraState: { entradas: [] },
    inputs: { CORPO: { block: {
      type: 'girar',
      inputs: { GRAUS: { block: { type: 'bloco_entrada',
                                  extraState: { id: 'e1', nome: 'lado' } } } },
    } } },
  }]);
  const def = ws.getBlocksByType('bloco_ensinar', false)[0];
  assert.throws(() => Blocos.pilhaDoBloco(def), /Essa entrada não existe mais/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --test-name-pattern="peça roxa" tests/blocos.test.js`
Expected: FAIL — `Bloco sem tradução: bloco_entrada` (ou bloco desconhecido na
carga).

- [ ] **Step 3: A peça**

No array de blocos, logo depois de `bloco_usar`:

```js
      {
        type: 'bloco_entrada',
        message0: '🧩 %1',
        args0: [{ type: 'field_label_serializable', name: 'NOME', text: 'entrada' }],
        output: 'Number',
        colour: COR_BLOCO,
        /* mutator, e não extensions — ver a nota da Task 1. */
        mutator: 'bloco_entrada_estado',
        tooltip: 'O número que quem usou este bloco entregou.',
      },
```

E a extensão, junto das outras:

```js
    /* A peça roxa carrega o id da entrada, e não só o nome: renomear a entrada
       não pode fazer a peça perder de quem ela é.

       Mutador, e não extensão: o Blockly recusa uma extensão comum que
       acrescente saveExtraState/loadExtraState. Pago na Task 1. */
    var ESTADO_DA_PECA = {
      saveExtraState: function () {
        return { id: this.entradaId_ || '', nome: this.getFieldValue('NOME') };
      },
      loadExtraState: function (estado) {
        this.entradaId_ = (estado && String(estado.id)) || '';
        if (estado && estado.nome) this.setFieldValue(String(estado.nome), 'NOME');
      },
    };

    registrarMutador('bloco_entrada_estado', ESTADO_DA_PECA, function () {
      this.entradaId_ = '';
    });
```

- [ ] **Step 4: A tradução**

Em `blocoParaNo`, junto de `case 'bloco_usar'` (~724):

```js
      case 'bloco_entrada':  return noDeEntrada(b);
```

E a função, perto de `noDeUso`:

```js
  /* A peça roxa só vale dentro da cabeça que a criou. Fora dela não há
     argumento nenhum para ler, e virar zero em silêncio esconderia da criança
     que a peça está no lugar errado. */
  function noDeEntrada(b) {
    var raiz = b.getRootBlock();
    if (!raiz || raiz.type !== 'bloco_ensinar') {
      throw erroNaPeca('Esta peça só funciona dentro do bloco que você ' +
                       'ensinou.', b);
    }
    var lista = entradasDe(raiz), k;
    for (k = 0; k < lista.length; k++) {
      if (lista[k].id === b.entradaId_) {
        return { op: 'entrada', id: lista[k].id, nome: lista[k].nome,
                 blockId: b.id };
      }
    }
    throw erroNaPeca('Essa entrada não existe mais. Desfaça para trazê-la de ' +
                     'volta, ou tire esta peça.', b);
  }
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test --test-name-pattern="peça roxa" tests/blocos.test.js`
Expected: PASS, os três.

- [ ] **Step 6: A suíte inteira**

Run: `make test`
Expected: PASS, 0 falhas.

- [ ] **Step 7: Commit**

```bash
git add web/blocos.js tests/blocos.test.js
git commit -m "Nasce a peça que lê a entrada, e ela só vale dentro do bloco que a criança ensinou"
git push origin master
```

---

### Task 3: Os encaixes no uso e os argumentos no nó

**Files:**
- Modify: `web/blocos.js` (extensão `bloco_usar_procedimento`; `noDeUso`,
  ~592-618; `gavetaDeBlocos`, ~893-916)
- Test: `tests/blocos.test.js`

**Interfaces:**
- Consumes: `entradasDe`, `valorDe(bloco, nome)` (~554), `noDeUso`.
- Produces:
  - `bloco.encaixes_` no `bloco_usar` → `[{ id, nome }]`, salvo no extraState.
  - `bloco.acertarEncaixes_(lista)` → cria, renomeia e remove encaixes
    `ENT_<id>` preservando o que já está dentro dos que continuam.
  - nó `{ op: 'usar', nome, corpo, args: [{ id, nome, valor }], blockId }`.

- [ ] **Step 1: Escrever o teste que falha**

```js
test('o uso ganha um encaixe por entrada, com o shadow de número', () => {
  const ws = carregar([
    { type: 'bloco_ensinar', fields: { NOME: 'quadrado' },
      extraState: { entradas: [{ id: 'e1', nome: 'lado' }] } },
    { type: 'bloco_usar', fields: { NOME: 'quadrado' },
      extraState: { encaixes: [{ id: 'e1', nome: 'lado' }] },
      inputs: { ENT_e1: num(30) } },
  ]);
  const uso = ws.getBlocksByType('bloco_usar', false)[0];
  assert.ok(uso.getInput('ENT_e1'), 'faltou o encaixe da entrada');
  assert.strictEqual(
    Number(uso.getInputTargetBlock('ENT_e1').getFieldValue('NUM')), 30);
});

test('o nó de uso leva os argumentos na ordem da definição', () => {
  const ws = carregar([
    { type: 'bloco_ensinar', fields: { NOME: 'quadrado' },
      extraState: { entradas: [{ id: 'e1', nome: 'lado' }] },
      inputs: { CORPO: { block: { type: 'girar', inputs: { GRAUS: num(90) } } } } },
    { type: 'quando_play', inputs: { CORPO: { block: {
      type: 'bloco_usar', fields: { NOME: 'quadrado' },
      extraState: { encaixes: [{ id: 'e1', nome: 'lado' }] },
      inputs: { ENT_e1: num(30) },
    } } } },
  ]);
  const ast = Blocos.workspaceParaAst(ws);
  assert.strictEqual(ast[0].op, 'usar');
  assert.deepStrictEqual(ast[0].args, [{ id: 'e1', nome: 'lado', valor: 30 }]);
});

test('renomear a entrada preserva o número já digitado no buraco', () => {
  const ws = carregar([
    { type: 'bloco_ensinar', fields: { NOME: 'quadrado' },
      extraState: { entradas: [{ id: 'e1', nome: 'lado' }] } },
    { type: 'bloco_usar', fields: { NOME: 'quadrado' },
      extraState: { encaixes: [{ id: 'e1', nome: 'lado' }] },
      inputs: { ENT_e1: num(30) } },
  ]);
  const uso = ws.getBlocksByType('bloco_usar', false)[0];
  uso.acertarEncaixes_([{ id: 'e1', nome: 'tamanho' }]);
  assert.strictEqual(
    Number(uso.getInputTargetBlock('ENT_e1').getFieldValue('NUM')), 30,
    'o número tinha que ficar: o encaixe é pelo id, não pelo nome');
});

test('apagar a entrada tira o encaixe do uso', () => {
  const ws = carregar([
    { type: 'bloco_usar', fields: { NOME: 'quadrado' },
      extraState: { encaixes: [{ id: 'e1', nome: 'lado' }] },
      inputs: { ENT_e1: num(30) } },
  ]);
  const uso = ws.getBlocksByType('bloco_usar', false)[0];
  uso.acertarEncaixes_([]);
  assert.ok(!uso.getInput('ENT_e1'), 'o encaixe devia ter sumido');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --test-name-pattern="encaixe|argumento" tests/blocos.test.js`
Expected: FAIL — `uso.acertarEncaixes_ is not a function`.

- [ ] **Step 3: Os encaixes no `bloco_usar`**

**Antes de escrever:** o `bloco_usar` também passa a carregar estado, então ele
também precisa virar mutador — `saveExtraState`/`loadExtraState` num mixin
`ESTADO_DO_USO`, registrado com `registrarMutador('bloco_usar_estado', …)`, e no
JSON do `bloco_usar` acrescente `mutator: 'bloco_usar_estado'` **ao lado** do
`extensions: ['bloco_usar_procedimento']` que já existe (os dois convivem: a
extensão continua cuidando de `getProcedureCall` e `renameProcedure`, que não
são propriedades de mutador). O resto abaixo — `acertarEncaixes_`,
`desenharEncaixes_`, `encaixeNome_` — fica no ajudante do mutador ou na extensão,
tanto faz, desde que **não** seja o par de estado.

Dentro de `registrarUma('bloco_usar_procedimento', …)`, acrescentar:

```js
      var bloco = this;
      bloco.encaixes_ = [];

      bloco.saveExtraState = function () {
        var fora = [], k;
        for (k = 0; k < bloco.encaixes_.length; k++) {
          fora.push({ id: bloco.encaixes_[k].id, nome: bloco.encaixes_[k].nome });
        }
        return { encaixes: fora };
      };

      /* O uso guarda os próprios encaixes, e não os deriva da definição na
         carga: um uso cuja definição foi apagada continua desenhando os
         buracos que tinha, esmaecido, em vez de encolher sozinho na tela. */
      bloco.loadExtraState = function (estado) {
        var lista = (estado && estado.encaixes) || [], k, e;
        bloco.encaixes_ = [];
        for (k = 0; k < lista.length; k++) {
          e = lista[k];
          if (!e || !e.id) continue;
          bloco.encaixes_.push({ id: String(e.id), nome: String(e.nome || '') });
        }
        bloco.desenharEncaixes_();
      };

      /* Só mexe no que mudou: encaixe que continua fica de pé com o que a
         criança pôs dentro. É isto que faz renomear não jogar fora o número. */
      bloco.acertarEncaixes_ = function (lista) {
        var tem = {}, k, e, encaixe;
        for (k = 0; k < lista.length; k++) tem[' ' + lista[k].id] = true;
        for (k = bloco.encaixes_.length - 1; k >= 0; k--) {
          if (!tem[' ' + bloco.encaixes_[k].id]) {
            if (bloco.getInput('ENT_' + bloco.encaixes_[k].id)) {
              bloco.removeInput('ENT_' + bloco.encaixes_[k].id);
            }
            bloco.encaixes_.splice(k, 1);
          }
        }
        for (k = 0; k < lista.length; k++) {
          e = lista[k];
          encaixe = bloco.getInput('ENT_' + e.id);
          if (!encaixe) {
            encaixe = bloco.appendValueInput('ENT_' + e.id);
            encaixe.setCheck('Number');
            bloco.encaixes_.push({ id: e.id, nome: e.nome });
            comShadowDeNumero(encaixe);
          }
          encaixe.removeField('ROT_' + e.id, true);
          encaixe.appendField(new Blockly.FieldLabel(e.nome), 'ROT_' + e.id);
          bloco.encaixeNome_(e.id, e.nome);
        }
      };

      bloco.encaixeNome_ = function (id, nome) {
        var k;
        for (k = 0; k < bloco.encaixes_.length; k++) {
          if (bloco.encaixes_[k].id === id) bloco.encaixes_[k].nome = nome;
        }
      };

      bloco.desenharEncaixes_ = function () {
        var lista = bloco.encaixes_.slice();
        bloco.encaixes_ = [];
        bloco.acertarEncaixes_(lista);
      };
```

E, fora da extensão:

```js
  /* O mesmo shadow de número dos outros encaixes do projeto: até a criança
     soltar uma conta em cima, ele parece o campo de sempre. */
  function comShadowDeNumero(encaixe) {
    var sombra = Blockly.serialization.blocks.append(
      { type: 'numero', fields: { NUM: 1 } },
      encaixe.getSourceBlock().workspace);
    sombra.setShadow(true);
    encaixe.connection.connect(sombra.outputConnection);
  }
```

- [ ] **Step 4: Os argumentos no nó**

Em `noDeUso`, trocar a linha do `return` (~617) por:

```js
    var args = [], lista = uso.encaixes_ || [], k;
    for (k = 0; k < lista.length; k++) {
      args.push({ id: lista[k].id, nome: lista[k].nome,
                  valor: valorDe(b, 'ENT_' + lista[k].id) });
    }
    return { op: 'usar', nome: nome, corpo: corpo, args: args, blockId: b.id };
```

trocando `uso` por `b` (o próprio bloco de usar).

- [ ] **Step 5: A gaveta monta a peça com os buracos**

Em `gavetaDeBlocos` (~906-914), depois de pôr o campo `NOME`, acrescentar o
estado dos encaixes e os shadows:

```js
      var def = Blockly.Procedures.getDefinition(nomes[k], workspace);
      var entradas = def ? entradasDe(def) : [];
      if (entradas.length) {
        var estado = xml.createElement('mutation');
        var j;
        for (j = 0; j < entradas.length; j++) {
          var ent = xml.createElement('entrada');
          ent.setAttribute('id', entradas[j].id);
          ent.setAttribute('nome', entradas[j].nome);
          estado.appendChild(ent);
          bloco.appendChild(pecaComNumero('ENT_' + entradas[j].id, 1));
        }
        bloco.appendChild(estado);
      }
```

> **Confirmado lendo o Blockly 8.0.5, e não é hipótese:**
> `Xml_applyMutationTagNodes = function(a,b){ … b.domToMutation &&
> b.domToMutation(e) … }` — o caminho XML, que é o da gaveta, **só** chama
> `domToMutation` e nunca consulta `loadExtraState`. Sem o par XML, a peça de
> usar sai da gaveta sem buraco nenhum, em silêncio.
>
> **A saída não é dar os quatro ganchos à peça — é a gaveta parar de ser XML.**
> Dar `mutationToDom` ao `bloco_usar` fez o `blockToDom` ser chamado em todo
> evento de criação de bloco (`d.hasChildNodes()`), e o DOM mínimo do
> `dom_falso.js` não tem isso: 13 testes verdes do ciclo 5 quebraram de uma vez.
>
> O flyout escolhe o caminho pelo que o callback devolve:
> `convertFlyoutDefToJsonArray` repassa um array de **objetos** intacto, e
> `createFlyoutBlock_` então usa `serialization.blocks.append` (caminho JSON,
> com `loadExtraState`); um array de **nós DOM** vira `blockxml` e é montado por
> `Xml.domToBlock` (caminho XML, só `domToMutation`).
>
> Então `gavetaDeBlocos` devolve itens JSON — `{kind:'button', text, callbackKey}`
> e `{kind:'block', type, fields, extraState, inputs}` — e o mixin do
> `bloco_usar` fica só com o par JSON. Uma verdade só sobre estado. O
> `gavetaDeCaixas` pode continuar em XML: cada callback é independente. (O
> `FlyoutButton` lê `callbackKey` e `callbackkey`, tanto faz.)

- [ ] **Step 6: Rodar e ver passar**

Run: `node --test --test-name-pattern="encaixe|argumento|buraco" tests/blocos.test.js`
Expected: PASS, os quatro.

- [ ] **Step 7: A suíte inteira**

Run: `make test`
Expected: PASS, 0 falhas.

- [ ] **Step 8: Commit**

```bash
git add web/blocos.js tests/blocos.test.js
git commit -m "A peça de usar ganha um buraco por entrada, e renomear não joga fora o número de dentro"
git push origin master
```

---

### Task 4: O compilador, com quadros empilhados

**Files:**
- Modify: `web/compilador.js` (`gerarValorInterno`, ~192-220;
  `conferirProfundidade`, ~176-183; `case 'usar'`, ~371-378)
- Test: `tests/compilador.test.js`

**Interfaces:**
- Consumes: os nós `usar.args` e `entrada` das Tasks 2 e 3.
- Produces: nenhum símbolo novo exportado; o comportamento é interno.

- [ ] **Step 1: Escrever o teste que falha**

Em `tests/compilador.test.js`, no fim:

```js
/* ---------- entradas dos blocos inventados ---------- */

function usar(nome, corpo, args) {
  return { op: 'usar', nome: nome, corpo: corpo, args: args, blockId: 'u' };
}

test('o argumento é gerado onde a peça roxa está', () => {
  const { bytes } = compilar([usar('quadrado',
    [{ op: 'girar', graus: { op: 'entrada', id: 'e1', nome: 'lado' },
       blockId: 'g' }],
    [{ id: 'e1', nome: 'lado', valor: 30 }])]);
  assert.deepStrictEqual(instrucoes(bytes).slice(0, 2), [
    [OP.PUSH, 30, 0, 0],
    [OP.TURN, 0, 0, 0],
  ]);
});

test('lido duas vezes, o argumento é gerado duas vezes', () => {
  const ler = { op: 'entrada', id: 'e1', nome: 'lado' };
  const { bytes } = compilar([usar('quadrado',
    [{ op: 'girar', graus: ler, blockId: 'g1' },
     { op: 'girar', graus: ler, blockId: 'g2' }],
    [{ id: 'e1', nome: 'lado', valor: 30 }])]);
  const i = instrucoes(bytes);
  assert.deepStrictEqual(i[0], [OP.PUSH, 30, 0, 0]);
  assert.deepStrictEqual(i[2], [OP.PUSH, 30, 0, 0]);
});

test('o argumento resolve no quadro de quem chamou', () => {
  /* «fora» passa o próprio lado para «dentro». Se o nó resolvesse no quadro
     de dentro, o 7 nunca chegaria — e sem barulho nenhum. */
  const dentro = usar('dentro',
    [{ op: 'girar', graus: { op: 'entrada', id: 'd1', nome: 'g' }, blockId: 'g' }],
    [{ id: 'd1', nome: 'g', valor: { op: 'entrada', id: 'f1', nome: 'lado' } }]);
  const { bytes } = compilar([usar('fora', [dentro],
    [{ id: 'f1', nome: 'lado', valor: 7 }])]);
  assert.deepStrictEqual(instrucoes(bytes)[0], [OP.PUSH, 7, 0, 0]);
});

test('peça roxa com id que o quadro não conhece é erro', () => {
  assert.throws(() => compilar([usar('quadrado',
    [{ op: 'girar', graus: { op: 'entrada', id: 'sumiu', nome: 'lado' },
       blockId: 'g' }],
    [{ id: 'e1', nome: 'lado', valor: 30 }])]),
    /entrada/i);
});

test('conta funda passada a um bloco ainda respeita o teto da pilha', () => {
  /* Dezoito somas encadeadas não cabem na pilha de 16 — e não cabem também
     quando chegam por dentro de um bloco inventado. */
  let conta = 1;
  for (let k = 0; k < 18; k++) conta = { op: 'mais', a: conta, b: 1 };
  assert.throws(() => compilar([usar('quadrado',
    [{ op: 'girar', graus: { op: 'entrada', id: 'e1', nome: 'lado' },
       blockId: 'g' }],
    [{ id: 'e1', nome: 'lado', valor: conta }])]),
    /conta/i);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --test-name-pattern="argumento|peça roxa|quadro" tests/compilador.test.js`
Expected: FAIL — `Conta desconhecida: entrada`.

- [ ] **Step 3: A pilha de quadros**

Em `web/compilador.js`, dentro de `compilarPedaco`, junto de `var profundidade = 0;`:

```js
    /* Os argumentos do uso que está sendo gerado agora. Cada entrada guarda o
       nó E o quadro em que ele deve ser resolvido: o argumento pertence a quem
       chamou, não a quem recebe. Sem isso, «a» passando o próprio argumento
       para «b» leria o valor errado — e calado. */
    var quadro = null;

    function acharEntrada(id) {
      if (!quadro) return null;
      var k;
      for (k = 0; k < quadro.args.length; k++) {
        if (quadro.args[k].id === id) return quadro.args[k];
      }
      return null;
    }
```

- [ ] **Step 4: O `case 'entrada'` no gerador de valor**

Em `gerarValorInterno`, junto de `if (v.op === 'caixa')`:

```js
      if (v.op === 'entrada') {
        var arg = acharEntrada(v.id);
        if (!arg) {
          throw erroNoBloco('Essa entrada não existe mais. Tire esta peça, ou ' +
                            'crie a entrada de novo.', id);
        }
        /* Resolvido no quadro de origem, e restaurado depois: é o que faz o
           argumento pertencer a quem chamou. */
        var deVolta = quadro;
        quadro = arg.origem;
        try {
          gerarValorInterno(arg.valor, arg.blockId || id);
        } finally {
          quadro = deVolta;
        }
        return;
      }
```

- [ ] **Step 5: O `case 'usar'` empilha o quadro**

Trocar o `case 'usar'` (~371-378) por:

```js
          case 'usar': {
            var novo = { args: [] }, k, a;
            var lista = no.args || [];
            for (k = 0; k < lista.length; k++) {
              a = lista[k];
              /* A origem é o quadro de agora: o argumento foi escrito na tela
                 de quem está usando. */
              novo.args.push({ id: a.id, valor: a.valor, origem: quadro,
                               blockId: no.blockId });
            }
            var anterior = quadro;
            quadro = novo;
            try {
              gerar(no.corpo || []);
            } catch (e) {
              if (e && e.codigo === 'programa_grande') e.blockId = no.blockId || null;
              throw e;
            } finally {
              quadro = anterior;
            }
            break;
          }
```

- [ ] **Step 6: A profundidade mede depois de substituir**

Em `conferirProfundidade`, a função que mede a árvore precisa aprender a mesma
regra. Onde ela desce pelos filhos, acrescentar, antes de tudo:

```js
      /* Uma folha vira uma árvore inteira: medir o nó «entrada» como se fosse
         um valor simples deixaria uma conta funda passar e estourar a pilha da
         VM sem bolha nenhuma. */
      if (v && v.op === 'entrada') {
        var arg = acharEntrada(v.id);
        if (!arg) return 1;
        var deVolta = quadro;
        quadro = arg.origem;
        try {
          return medir(arg.valor);
        } finally {
          quadro = deVolta;
        }
      }
```

> Use o nome real da função recursiva de medida que existe no arquivo; se a
> medida hoje for feita inline dentro de `conferirProfundidade`, extraia-a para
> uma função `medir(v)` primeiro, sem mudar comportamento, e só então
> acrescente o caso.

- [ ] **Step 7: Rodar e ver passar**

Run: `node --test --test-name-pattern="argumento|peça roxa|quadro|teto da pilha" tests/compilador.test.js`
Expected: PASS, os cinco.

- [ ] **Step 8: A suíte inteira**

Run: `make test`
Expected: PASS, 0 falhas. Confira que os testes do ciclo 5 (cadeia de vinte
definições, erro do teto com o `blockId` do uso mais de fora) continuam verdes:
o `case 'usar'` foi reescrito e a regra de dono do erro tinha que sobreviver.

- [ ] **Step 9: Commit**

```bash
git add web/compilador.js tests/compilador.test.js
git commit -m "O compilador entrega o número ao bloco inventado, e o argumento continua sendo de quem chamou"
git push origin master
```

---

### Task 5: O `.ino` — parâmetro de verdade e a recusa

**Files:**
- Modify: `web/arduino.js` (`valor`, ~132-150; `usoDeValor`, ~200-207;
  `gerarNos` caso `usar`, ~288-290; `gerarFuncoes`, ~547-561)
- Test: `tests/arduino.test.js`

**Interfaces:**
- Consumes: os nós `usar.args` e `entrada`.
- Produces: `void bloco_x(int p_nome)` e a chamada `bloco_x(30);`.

- [ ] **Step 1: Escrever o teste que falha**

```js
test('o bloco com entrada vira função com parâmetro', () => {
  const txt = gerar([{ op: 'usar', nome: 'quadrado',
    corpo: [{ op: 'girar', graus: { op: 'entrada', id: 'e1', nome: 'lado' } }],
    args: [{ id: 'e1', nome: 'lado', valor: 30 }] }]);
  assert.ok(txt.includes('void bloco_quadrado(int p_lado) {'),
    'faltou a assinatura com parâmetro');
  assert.ok(txt.includes('girar(p_lado);'), 'o corpo devia usar o parâmetro');
  assert.ok(txt.includes('bloco_quadrado(30);'), 'faltou a chamada com o 30');
});

test('entrada chamada i não colide com o contador do repetir', () => {
  const txt = gerar([{ op: 'usar', nome: 'anda',
    corpo: [{ op: 'repetir', vezes: 2,
              corpo: [{ op: 'girar', graus: { op: 'entrada', id: 'e1', nome: 'i' } }] }],
    args: [{ id: 'e1', nome: 'i', valor: 5 }] }]);
  assert.ok(txt.includes('void bloco_anda(int p_i) {'), 'faltou p_i');
  assert.ok(txt.includes('for (int i = 0;'), 'o laço devia continuar com i');
});

test('o parâmetro não vira variável global', () => {
  const txt = gerar([{ op: 'usar', nome: 'quadrado',
    corpo: [{ op: 'girar', graus: { op: 'entrada', id: 'e1', nome: 'lado' } }],
    args: [{ id: 'e1', nome: 'lado', valor: 30 }] }]);
  assert.ok(!txt.includes('int32_t p_lado'), 'p_lado não é caixa');
});

test('argumento vivo lido duas vezes faz o .ino recusar', () => {
  const ler = { op: 'entrada', id: 'e1', nome: 'lado' };
  assert.throws(() => gerar([{ op: 'usar', nome: 'quadrado',
    corpo: [{ op: 'girar', graus: ler }, { op: 'girar', graus: ler }],
    args: [{ id: 'e1', nome: 'lado',
             valor: { op: 'aleatorio', a: 1, b: 10 } }] }]),
    /sortear de novo/);
});

test('argumento vivo lido uma vez só continua exportando', () => {
  assert.doesNotThrow(() => gerar([{ op: 'usar', nome: 'quadrado',
    corpo: [{ op: 'girar', graus: { op: 'entrada', id: 'e1', nome: 'lado' } }],
    args: [{ id: 'e1', nome: 'lado',
             valor: { op: 'aleatorio', a: 1, b: 10 } }] }]));
});

test('argumento constante lido duas vezes continua exportando', () => {
  const ler = { op: 'entrada', id: 'e1', nome: 'lado' };
  assert.doesNotThrow(() => gerar([{ op: 'usar', nome: 'quadrado',
    corpo: [{ op: 'girar', graus: ler }, { op: 'girar', graus: ler }],
    args: [{ id: 'e1', nome: 'lado', valor: 30 }] }]));
});

test('o sketch com entrada compila', { skip: temGpp() ? false : 'sem g++ nesta máquina' }, () => {
  const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ino-')), 'robo.ino.cpp');
  fs.writeFileSync(arq, '#include "fake_arduino.h"\n' + gerar([
    { op: 'usar', nome: 'quadrado',
      corpo: [{ op: 'repetir', vezes: 4, corpo: [
        { op: 'frente', segundos: 1, velocidade: 200 },
        { op: 'girar', graus: { op: 'entrada', id: 'e1', nome: 'lado' } }] }],
      args: [{ id: 'e1', nome: 'lado', valor: 90 }] }]));
  const r = spawnSync('g++', ['-fsyntax-only', '-Wall', '-I', __dirname, arq],
                      { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --test-name-pattern="entrada|parâmetro|recusar" tests/arduino.test.js`
Expected: FAIL — `Conta desconhecida: entrada`.

- [ ] **Step 3: O valor do parâmetro**

Em `valor(v)`, junto de `if (v.op === 'caixa')`:

```js
    if (v.op === 'entrada') return identificadorDe(v.nome, 'p_');
```

E em `parte(v)`, acrescentar `'entrada'` à lista dos que dispensam parênteses.

- [ ] **Step 4: A varredura entra nos argumentos**

Em `usoDeValor`, no começo:

```js
    if (v.op === 'entrada') return;   /* parâmetro não usa função de apoio */
```

E em `usoDe`, dentro do `if (no.op === 'usar')`, **antes** de visitar o corpo,
varrer os argumentos — eles são da tela de quem chamou e podem ter sensor ou
dado dentro:

```js
        var ar;
        for (ar = 0; ar < (no.args || []).length; ar++) {
          usoDeValor(no.args[ar].valor, uso);
        }
```

> Isto fica **fora** do `if (!funcoesVistas[chaveFn])`: a função é gerada uma
> vez, mas cada uso tem os seus argumentos, e um `🎲` que só aparece no segundo
> uso também precisa do `aleatorio()` declarado.

- [ ] **Step 5: A chamada com argumentos**

Trocar o `case 'usar'` de `gerarNos` (~288-290) por:

```js
        case 'usar': {
          recusarArgumentoVivo(no);
          var partes = [], a;
          for (a = 0; a < (no.args || []).length; a++) {
            partes.push(valor(no.args[a].valor));
          }
          linhas.push(r + identificadorDe(no.nome, 'bloco_') +
                      '(' + partes.join(', ') + ');');
          break;
        }
```

- [ ] **Step 6: A assinatura**

Em `gerarFuncoes`, trocar a linha do cabeçalho da função por:

```js
      var params = [], p;
      for (p = 0; p < (no.args || []).length; p++) {
        params.push('int ' + identificadorDe(no.args[p].nome, 'p_'));
      }
      fora.push('void ' + identificadorDe(no.nome, 'bloco_') +
                '(' + params.join(', ') + ') {');
```

- [ ] **Step 7: A recusa**

Perto de `gerarFuncoes`:

```js
  function ehConstante(v) {
    return v === null || v === undefined || typeof v === 'number';
  }

  /* Quantas vezes o corpo lê aquela entrada. */
  function lidaQuantasVezes(nos, id) {
    var n = 0, i, no;

    function emValor(v) {
      if (!v || typeof v === 'number') return;
      if (v.op === 'entrada') { if (v.id === id) n++; return; }
      emValor(v.a);
      emValor(v.b);
    }

    for (i = 0; i < nos.length; i++) {
      no = nos[i];
      emValor(no.segundos); emValor(no.graus); emValor(no.vezes);
      emValor(no.cm); emValor(no.cond); emValor(no.valor);
      /* Sem entrar no corpo de um «usar» de dentro: lá as entradas são
         outras, e a função dele é gerada à parte. */
      if (no.corpo && no.op !== 'usar') n += lidaQuantasVezes(no.corpo, id);
      if (no.entao) n += lidaQuantasVezes(no.entao, id);
      if (no.senao) n += lidaQuantasVezes(no.senao, id);
    }
    return n;
  }

  /* A função tem parâmetro por valor: o 🎲 do argumento é sorteado uma vez, e
     a VM sorteia a cada leitura. Gerar assim mentiria sobre o robô — e o
     arquivo já recusa o 📣 avisar pelo mesmo motivo. */
  function recusarArgumentoVivo(no) {
    var a, args = no.args || [];
    for (a = 0; a < args.length; a++) {
      if (ehConstante(args[a].valor)) continue;
      if (lidaQuantasVezes(no.corpo || [], args[a].id) > 1) {
        throw new Error(
          'O 🎲 e o 👁 dentro de um bloco com entrada fazem o robô sortear de ' +
          'novo a cada vez que ele lê a entrada, e o código do Arduino sorteia ' +
          'uma vez só. Ponha o número direto para ver o código.');
      }
    }
  }
```

- [ ] **Step 8: Rodar e ver passar**

Run: `node --test --test-name-pattern="entrada|parâmetro|recusar|compila" tests/arduino.test.js`
Expected: PASS, os sete.

- [ ] **Step 9: A suíte inteira**

Run: `make test`
Expected: PASS, 0 falhas.

- [ ] **Step 10: Commit**

```bash
git add web/arduino.js tests/arduino.test.js
git commit -m "O .ino dá ao bloco inventado um parâmetro de verdade, e recusa o que ele não sabe contar"
git push origin master
```

---

### Task 6: O nível e a ligação na tela

**Files:**
- Modify: `web/niveis.js` (lista do `gigante`, ~128)
- Modify: `web/app.js` (junto de `CRIAR_BLOCO`, ~175-223)
- Test: `tests/niveis.test.js`

**Interfaces:**
- Consumes: `Blocos.entradasDe`, `bloco.aoMudarEntradas_` (Task 1),
  `uso.acertarEncaixes_` (Task 3).
- Produces: nada exportado.

- [ ] **Step 1: Escrever o teste que falha**

Em `tests/niveis.test.js`:

```js
test('a peça de ler entrada existe no Avançado mas não na gaveta', () => {
  assert.ok(Blockly.Blocks.bloco_entrada, 'a peça tinha que estar definida');
  const xml = Niveis.caixaXml('gigante');
  assert.ok(xml.includes('MEUS_BLOCOS'), 'faltou a gaveta dos blocos dela');
  assert.ok(!xml.includes('bloco_entrada'),
    'a peça roxa não vai para a gaveta: ela nasce da cabeça');
});

test('os níveis de baixo não têm blocos inventados', () => {
  for (const nivel of ['pequeno', 'medio', 'grande']) {
    assert.ok(!Niveis.caixaXml(nivel).includes('MEUS_BLOCOS'),
      `${nivel} não devia ter a gaveta`);
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test --test-name-pattern="entrada" tests/niveis.test.js`
Expected: FAIL — `Blockly.Blocks.bloco_entrada` indefinido, se a Task 2 não
estiver aplicada; senão, PASS já, e aí só acrescente `'bloco_entrada'` à lista.

- [ ] **Step 3: A peça na lista do Gigante**

Em `web/niveis.js`, ~128, trocar por:

```js
      'bloco_ensinar', 'bloco_usar', 'bloco_entrada',
```

A peça entra na lista de tipos conhecidos do nível — é o que o `Niveis.aplicar`
usa —, mas **não** ganha linha no `caixaXml`: ela nasce arrastada da cabeça.

- [ ] **Step 4: Ligar a cabeça à tela**

Em `web/app.js`, depois do `registerButtonCallback('CRIAR_BLOCO', …)`:

```js
  /* Quando a lista de entradas de uma cabeça muda, os usos dela precisam
     ganhar, perder ou renomear buracos — e a gaveta, remontar. A cabeça não
     conhece o app.js; quem liga os dois é isto. */
  function ligarCabeca(cabeca) {
    cabeca.aoMudarEntradas_ = function () {
      var nome = String(cabeca.getFieldValue('NOME')).toLowerCase();
      var entradas = Blocos.entradasDe(cabeca);
      var usos = workspace.getBlocksByType('bloco_usar', false), i;
      for (i = 0; i < usos.length; i++) {
        if (String(usos[i].getFieldValue('NOME')).toLowerCase() !== nome) continue;
        usos[i].acertarEncaixes_(entradas);
      }
      atualizarGavetaDeBlocos();
    };
  }
```

E, no ouvinte que já existe (~219-223), ligar toda cabeça que aparecer:

```js
  workspace.addChangeListener(function (e) {
    if (e.isUiEvent) return;
    var cabecas = workspace.getBlocksByType('bloco_ensinar', false), i;
    for (i = 0; i < cabecas.length; i++) {
      if (!cabecas[i].aoMudarEntradas_) ligarCabeca(cabecas[i]);
    }
    Blocos.acertarUsos(workspace);
    atualizarGavetaDeBlocos();
  });
```

E, no callback do `CRIAR_BLOCO`, depois do `cabeca.select();`, acrescentar
`ligarCabeca(cabeca);`.

- [ ] **Step 5: A gaveta remonta quando as entradas mudam**

O `atualizarGavetaDeBlocos` compara só nomes (`nomesDosBlocos`, ~201-208), e
mudar uma entrada não muda nome nenhum — a gaveta continuaria mostrando a peça
sem o buraco novo. Trocar `nomesDosBlocos` por:

```js
  function nomesDosBlocos() {
    var defs = workspace.getBlocksByType('bloco_ensinar', false);
    var nomes = [], i, entradas, j, linha;
    for (i = 0; i < defs.length; i++) {
      linha = String(defs[i].getFieldValue('NOME')).toLowerCase();
      entradas = Blocos.entradasDe(defs[i]);
      for (j = 0; j < entradas.length; j++) {
        linha += '\t' + entradas[j].id + '=' + entradas[j].nome;
      }
      nomes.push(linha);
    }
    return nomes.sort().join('\n');
  }
```

- [ ] **Step 6: Rodar e ver passar**

Run: `node --test tests/niveis.test.js`
Expected: PASS.

- [ ] **Step 7: A suíte inteira**

Run: `make test`
Expected: PASS, 0 falhas.

- [ ] **Step 8: Commit**

```bash
git add web/niveis.js web/app.js tests/niveis.test.js
git commit -m "Liga as entradas na tela: criar uma abre o buraco em todos os usos, e a gaveta acompanha"
git push origin master
```

---

### Task 7: As provas de fim — ciclo de vida e robô virtual

**Files:**
- Modify: `tests/navegador.test.js`
- Modify: `tests/tarefas_ponta_a_ponta.test.js`

**Interfaces:** consome tudo das Tasks 1-6.

- [ ] **Step 1: A prova no robô virtual**

Em `tests/tarefas_ponta_a_ponta.test.js`:

```js
test('um bloco com entrada gira o que a criança pediu',
  { timeout: 20000 }, async () => {
    /* 90 graus entregues pelo buraco. Se o argumento não chegar, o robô gira
       0 e a pose final é a de partida. */
    const { bytes } = compilarTarefas([
      { quando: 'play', blockId: 'p', corpo: [
        { op: 'usar', nome: 'vira', blockId: 'u',
          corpo: [{ op: 'girar',
                    graus: { op: 'entrada', id: 'e1', nome: 'g' },
                    blockId: 'g' }],
          args: [{ id: 'e1', nome: 'g', valor: 90 }] }] },
    ]);
    const linhas = await rodar(bytes, 2500);
    const thetas = linhas.filter((l) => l[0] === 'T')
                         .map((l) => Number(l.split(' ')[3]));
    assert.ok(thetas.length > 5, 'devia haver telemetria');
    assert.ok(Math.abs(thetas[thetas.length - 1] - thetas[0]) > 600,
      `o robô devia ter girado; foi de ${thetas[0]} a ${thetas[thetas.length - 1]}`);
  });
```

> O `theta` da telemetria é em décimos de grau (ver o comentário do topo do
> arquivo): 90° são 900, e o limite de 600 dá folga para a física.

- [ ] **Step 2: Rodar**

Run: `node --test --test-name-pattern="entrada" tests/tarefas_ponta_a_ponta.test.js`
Expected: PASS.

- [ ] **Step 3: A prova de ciclo de vida, no navegador**

Em `tests/navegador.test.js`, um teste novo com a mesma casca dos que já
existem (bridge + Chromium + `aval`). O que ele precisa provar, **nesta
ordem**, e é a linha que o ciclo 5 subestimou:

```js
    /* 1. Criar a entrada com a gaveta ABERTA. O botão de criar mora dentro
       dela, então este é o estado real — e foi exatamente o caso que o ciclo 5
       não cobriu. */
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      const tb = ws.getToolbox();
      tb.setSelectedItem(tb.getToolboxItems()
        .find(i => i.getName && i.getName() === 'Meus blocos'));
      return 1;
    })()`);
    await espera(700);
    /* …cria o bloco pelo botão, clica no ➕ da cabeça, e confere que a peça de
       usar na gaveta JÁ mostra o buraco, sem fechar e reabrir. */

    /* 2. Desfazer e refazer cada uma das três operações. */
    await aval(`Blockly.getMainWorkspace().undo(false)`);
    await aval(`Blockly.getMainWorkspace().undo(true)`);

    /* 3. Copiar e colar um uso: os ids dos encaixes têm que sobreviver. */

    /* 4. Recarregar a página: cabeça, entradas, usos e os números nos
       buracos voltam. */
```

Escreva as asserções no mesmo estilo dos testes vizinhos: todo toque confere
com `elementFromPoint` que o dedo caiu na peça, e as peças ficam em y ≤ ~460.

- [ ] **Step 4: A prova de navegador focada, antes do commit**

Run: `TESTES_LENTOS=1 node --test --test-name-pattern="entrada" tests/navegador.test.js`
Expected: PASS. Se falhar, siga `superpowers:systematic-debugging`: a mensagem
do `assert` diz qual promessa quebrou, e a do toque diz onde o dedo caiu.

- [ ] **Step 5: Commit**

```bash
git add tests/navegador.test.js tests/tarefas_ponta_a_ponta.test.js
git commit -m "Prova a entrada no robô virtual e no ciclo de vida da tela: criar com a gaveta aberta, desfazer, colar e recarregar"
git push origin master
```

- [ ] **Step 6: A prova lenta, sem mexer em `web/`**

Run: `make test-lento`
Expected: PASS, 23 + os novos. É a prova de minutos; o commit já foi, e ele
confere depois. **Não edite `web/` enquanto ela roda** — vermelho assim não
prova nada e ainda queima a amostra.

---

## Auto-revisão do plano

**Cobertura da spec, seção por seção:**

| seção da spec | onde está |
|---|---|
| Até três entradas, ➕ na cabeça | Task 1 |
| Id estável, nome só aparência | Task 1 (cabeça) e Task 3 (encaixe `ENT_<id>`) |
| O ➕ é campo, não corpo | Task 1, Step 5 (`Blockly.FieldImage` com `onClick`) |
| Janelinha única: renomear e apagar | Task 1, Step 5 — **com o desvio declarado no topo** |
| Peça roxa só dentro da cabeça | Task 2 |
| Renomear espalha, apagar esmaece | Task 1 (validador) + Task 6 (`aoMudarEntradas_`) |
| Uso guarda os próprios encaixes | Task 3, `loadExtraState` |
| Quadro empilhado, argumento de quem chamou | Task 4, Steps 3-5 |
| Profundidade medida depois de substituir | Task 4, Step 6 |
| Teto inalterado, dono do erro preservado | Task 4, Step 8 (regressão do ciclo 5) |
| `.ino` com parâmetro e prefixo `p_` | Task 5, Steps 3 e 6 |
| A recusa do argumento vivo | Task 5, Step 7 |
| Peça roxa fora da gaveta | Task 6, Step 3 |
| Provas de ciclo de vida do Blockly | Task 7, Step 3 |
| Explosão por contagem, não por relógio | Task 4, Step 8 — as provas de fan-out do ciclo 5 continuam, e nenhuma prova nova deste plano usa relógio |

**Varredura de vazios:** nenhum passo diz «tratar os casos de borda» ou
«escrever testes para o acima» — todo passo de código traz o código. Os dois
lugares com instrução em vez de código são deliberados e estão marcados: o
`medir` da Task 4 Step 6 (o nome real depende do arquivo) e o corpo do teste de
navegador da Task 7 Step 3 (a casca tem 60 linhas de bridge e Chromium, e
copiá-la aqui seria pior que apontar o vizinho).

**Consistência de nomes:** `entradas_`, `refazerEntradas_`, `novaEntrada_`,
`aoMudarEntradas_` na cabeça; `encaixes_`, `acertarEncaixes_`,
`desenharEncaixes_`, `encaixeNome_` no uso; `entradasDe` exportado; `quadro`,
`acharEntrada` no compilador; `recusarArgumentoVivo`, `lidaQuantasVezes`,
`ehConstante` no `.ino`. Conferidos entre tarefas.

**Risco conhecido:** a Task 3, Step 5 depende de a gaveta (que é XML) carregar
o estado dos encaixes. O passo traz o aviso e o caminho alternativo
(`mutationToDom`/`domToMutation`), porque é o ponto mais provável de a primeira
execução tropeçar.
