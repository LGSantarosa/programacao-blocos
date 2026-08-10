'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Blockly = require('../web/vendor/blockly_compressed.js');
globalThis.Blockly = Blockly;
const Campos = require('../web/campos.js');
globalThis.Blocos = require('../web/blocos.js');
const Niveis = require('../web/niveis.js');

Campos.registrar();
Blocos.definir();

test('a caixa do Pequeno oferece só movimento e repetir', () => {
  const xml = Niveis.caixaXml('pequeno');
  for (const t of ['mover_frente', 'mover_tras', 'girar', 'repetir']) {
    assert.ok(xml.includes(t), `faltou ${t} no Pequeno`);
  }
  assert.ok(!xml.includes('esperar'), 'Pequeno não deve ter esperar');
  assert.ok(!xml.includes('se_obstaculo'), 'Pequeno não deve ter o sensor');
});

test('o Pequeno oferece girar já preenchido para os dois lados', () => {
  const xml = Niveis.caixaXml('pequeno');
  assert.ok(xml.includes('>90<'), 'faltou o girar de 90');
  assert.ok(xml.includes('>-90<'), 'faltou o girar de -90');
});

test('Médio e Grande oferecem os seis blocos', () => {
  for (const nivel of ['medio', 'grande']) {
    const xml = Niveis.caixaXml(nivel);
    for (const t of ['mover_frente', 'mover_tras', 'girar', 'esperar',
                     'repetir', 'se_obstaculo']) {
      assert.ok(xml.includes(t), `faltou ${t} no ${nivel}`);
    }
  }
});

/* Sem navegador não há DOM, e o evento de criação de bloco do Blockly monta XML
   com document.createElementNS. Desligar os eventos durante a carga é o que
   deixa o workspace rodar headless aqui no Node. */
function bancada() {
  const ws = new Blockly.Workspace();
  Blockly.Events.disable();
  try {
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [
      { type: 'mover_frente', fields: { SEG: 0.5, VEL: '200' } },
      { type: 'girar', fields: { GRAUS: 90 } },
      { type: 'repetir', fields: { N: 12 } },
    ] } }, ws);
  } finally {
    Blockly.Events.enable();
  }
  return ws;
}

test('no Pequeno o tempo e a velocidade ficam escondidos', () => {
  const ws = bancada();
  Niveis.aplicar(ws, 'pequeno');
  const b = ws.getBlocksByType('mover_frente', false)[0];
  assert.strictEqual(b.getField('SEG').isVisible(), false);
  assert.strictEqual(b.getField('VEL').isVisible(), false);
});

test('no Pequeno as palavras somem junto com o número', () => {
  const ws = bancada();
  Niveis.aplicar(ws, 'pequeno');
  const b = ws.getBlocksByType('mover_frente', false)[0];
  assert.strictEqual(b.getField('T1').isVisible(), false,
    'sobrou "andar frente" num nível para quem não lê');
  assert.strictEqual(b.getField('T2').isVisible(), false,
    'sobrou o "s" solto na tela');
});

test('no Médio o tempo aparece e a velocidade continua escondida', () => {
  const ws = bancada();
  Niveis.aplicar(ws, 'medio');
  const b = ws.getBlocksByType('mover_frente', false)[0];
  assert.strictEqual(b.getField('SEG').isVisible(), true);
  assert.strictEqual(b.getField('VEL').isVisible(), false);
});

test('no Grande aparece tudo, e o giro troca o menu pelo ângulo', () => {
  const ws = bancada();
  Niveis.aplicar(ws, 'grande');
  const m = ws.getBlocksByType('mover_frente', false)[0];
  assert.strictEqual(m.getField('VEL').isVisible(), true);
  const g = ws.getBlocksByType('girar', false)[0];
  assert.strictEqual(g.getField('GRAUS').isVisible(), true);
  assert.strictEqual(g.getField('DIR').isVisible(), false);
});

test('subir de nível preserva o valor que estava escondido', () => {
  const ws = bancada();
  Niveis.aplicar(ws, 'pequeno');
  const b = ws.getBlocksByType('mover_frente', false)[0];
  assert.strictEqual(Number(b.getFieldValue('SEG')), 0.5);
  Niveis.aplicar(ws, 'medio');
  assert.strictEqual(Number(b.getFieldValue('SEG')), 0.5);
});

test('descer de nível guarda o valor em vez de perder', () => {
  const ws = bancada();
  Niveis.aplicar(ws, 'medio');
  const b = ws.getBlocksByType('mover_frente', false)[0];
  b.setFieldValue(3, 'SEG');
  Niveis.aplicar(ws, 'pequeno');
  Niveis.aplicar(ws, 'medio');
  assert.strictEqual(Number(b.getFieldValue('SEG')), 3);
});

test('o repetir desenha bolinhas no Pequeno e algarismo nos outros', () => {
  const ws = bancada();
  const n = ws.getBlocksByType('repetir', false)[0].getField('N');
  Niveis.aplicar(ws, 'pequeno');
  assert.strictEqual(n.modoBolinhas, true);
  Niveis.aplicar(ws, 'medio');
  assert.strictEqual(n.modoBolinhas, false);
});

test('a faixa do repetir continua sendo a da v1, para o nível Grande servir', () => {
  const ws = bancada();
  const b = ws.getBlocksByType('repetir', false)[0];
  Niveis.aplicar(ws, 'grande');
  b.setFieldValue(60, 'N');
  assert.strictEqual(Number(b.getFieldValue('N')), 60,
    'o nível Grande precisa repetir mais que cinco vezes');
});

test('descer para o Pequeno não corta o valor grande', () => {
  const ws = bancada();
  const b = ws.getBlocksByType('repetir', false)[0];
  Niveis.aplicar(ws, 'grande');
  b.setFieldValue(60, 'N');
  Niveis.aplicar(ws, 'pequeno');
  assert.strictEqual(Number(b.getFieldValue('N')), 60);
  assert.strictEqual(b.getField('N').getText(), '60',
    'bolinhas não representam 60, então mostra o número');
});

test('as duas entradas de girar do Pequeno não aparecem iguais', () => {
  /* Preencher GRAUS em vez de DIR deixaria as duas mostrando "direita". */
  const xml = Niveis.caixaXml('pequeno');
  assert.ok(xml.includes('<field name="DIR">90</field>'), 'faltou o girar à direita');
  assert.ok(xml.includes('<field name="DIR">-90</field>'), 'faltou o girar à esquerda');
});

test('o menu do girar acompanha o GRAUS quando cabe nele', () => {
  const ws = new Blockly.Workspace();
  Blockly.Events.disable();
  try {
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [
      { type: 'girar', fields: { GRAUS: -90 } },
    ] } }, ws);
  } finally {
    Blockly.Events.enable();
  }
  const b = ws.getBlocksByType('girar', false)[0];
  Niveis.aplicar(ws, 'pequeno');
  assert.strictEqual(b.getField('DIR').getText(), '↶ esquerda',
    'o menu mentiria sobre para que lado o bloco vira');
});

test('ângulo que não cabe no menu aparece como número, mesmo no Pequeno', () => {
  const ws = new Blockly.Workspace();
  Blockly.Events.disable();
  try {
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [
      { type: 'girar', fields: { GRAUS: 45 } },
    ] } }, ws);
  } finally {
    Blockly.Events.enable();
  }
  const b = ws.getBlocksByType('girar', false)[0];
  Niveis.aplicar(ws, 'pequeno');
  assert.strictEqual(b.getField('DIR').isVisible(), false,
    'o menu de duas opções não representa 45 graus');
  assert.strictEqual(b.getField('GRAUS').isVisible(), true);
  assert.strictEqual(Number(b.getFieldValue('GRAUS')), 45, 'o valor não pode se perder');
});

test('nível desconhecido cai no Médio em vez de quebrar', () => {
  assert.strictEqual(Niveis.definicao('inventado'), Niveis.definicao('medio'));
});
