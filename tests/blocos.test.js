'use strict';

const test = require('node:test');
const assert = require('node:assert');

require('./dom_falso.js');   /* precisa vir antes do Blockly */
const Blockly = require('../web/vendor/blockly_compressed.js');
globalThis.Blockly = Blockly;
const Campos = require('../web/campos.js');
const Blocos = require('../web/blocos.js');

Campos.registrar();
Blocos.definir();

/* Sem navegador não há DOM, e o evento de criação de bloco do Blockly monta XML
   com document.createElementNS. Desligar os eventos durante a carga é o que
   deixa o workspace rodar headless aqui no Node. */
function carregar(estados) {
  const ws = new Blockly.Workspace();
  Blockly.Events.disable();
  try {
    Blockly.serialization.workspaces.load(
      { blocks: { languageVersion: 0, blocks: estados } }, ws);
  } finally {
    Blockly.Events.enable();
  }
  return ws;
}

/* Monta um workspace headless com um programa e devolve a AST. */
function astDe(estado) {
  return Blocos.workspaceParaAst(carregar([estado]));
}

test('girar lê o campo GRAUS, não o menu', () => {
  const ast = astDe({
    type: 'quando_play',
    inputs: { CORPO: { block: { type: 'girar', fields: { GRAUS: 45 } } } },
  });
  assert.strictEqual(ast.length, 1);
  assert.strictEqual(ast[0].op, 'girar');
  assert.strictEqual(ast[0].graus, 45);
});

test('escolher esquerda no menu escreve -90 em GRAUS', () => {
  const b = carregar([{ type: 'girar' }]).getBlocksByType('girar', false)[0];
  b.setFieldValue('-90', 'DIR');
  assert.strictEqual(Number(b.getFieldValue('GRAUS')), -90);
});

test('o bloco de movimento carrega a velocidade para a AST', () => {
  const ast = astDe({
    type: 'quando_play',
    inputs: { CORPO: { block: {
      type: 'mover_frente', fields: { SEG: 2, VEL: '255' },
    } } },
  });
  assert.strictEqual(ast[0].segundos, 2);
  assert.strictEqual(ast[0].velocidade, 255);
});

test('repetir usa o campo de bolinhas', () => {
  const campo = carregar([{ type: 'repetir' }])
    .getBlocksByType('repetir', false)[0].getField('N');
  assert.strictEqual(campo.constructor.name, 'FieldBolinhas');
});

test('os seis blocos continuam sendo seis', () => {
  for (const t of ['mover_frente', 'mover_tras', 'girar', 'esperar',
                   'repetir', 'se_obstaculo', 'quando_play']) {
    assert.ok(Blockly.Blocks[t], `faltou o bloco ${t}`);
  }
});

test('as palavras dos blocos são campos, para poderem sumir no Pequeno', () => {
  const ws = carregar([{ type: 'mover_frente' }, { type: 'girar' }]);
  const m = ws.getBlocksByType('mover_frente', false)[0];
  assert.ok(m.getField('T1'), 'faltou o rótulo "andar frente" como campo');
  assert.ok(m.getField('T2'), 'faltou o rótulo "s" como campo');
  const g = ws.getBlocksByType('girar', false)[0];
  assert.ok(g.getField('T1'), 'faltou o rótulo "girar" como campo');
  assert.ok(g.getField('T2'), 'faltou o rótulo "graus" como campo');
});

test('definir() duas vezes não estoura por extensão repetida', () => {
  assert.doesNotThrow(() => Blocos.definir());
});

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
