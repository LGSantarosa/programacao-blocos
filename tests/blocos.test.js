'use strict';

const test = require('node:test');
const assert = require('node:assert');

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
