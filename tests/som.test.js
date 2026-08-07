'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Som = require('../web/som.js');

test('existe um som para cada evento da interface', () => {
  for (const nome of ['play', 'comando', 'batida', 'fim']) {
    assert.ok(Array.isArray(Som.SONS[nome]), `faltou o som "${nome}"`);
    assert.ok(Som.SONS[nome].length > 0, `o som "${nome}" está vazio`);
  }
});

test('toda nota tem frequência audível e duração curta', () => {
  for (const [nome, notas] of Object.entries(Som.SONS)) {
    for (const n of notas) {
      assert.ok(n.hz >= 100 && n.hz <= 4000, `${nome}: ${n.hz} Hz fora da faixa`);
      assert.ok(n.ms > 0 && n.ms <= 400, `${nome}: ${n.ms} ms fora da faixa`);
    }
  }
});

test('o som de fim sobe, que é o que soa como vitória', () => {
  const hz = Som.SONS.fim.map((n) => n.hz);
  assert.strictEqual(hz.length, 3);
  assert.ok(hz[0] < hz[1] && hz[1] < hz[2], `esperava subida, veio ${hz}`);
});

test('a batida é mais grave que o comando', () => {
  assert.ok(Som.SONS.batida[0].hz < Som.SONS.comando[0].hz);
});

test('tocar um som que não existe não estoura', () => {
  assert.doesNotThrow(() => Som.tocar('inexistente'));
});

test('alternarMudo inverte o estado', () => {
  const antes = Som.mudo();
  assert.strictEqual(Som.alternarMudo(), !antes);
  assert.strictEqual(Som.mudo(), !antes);
  Som.alternarMudo();
  assert.strictEqual(Som.mudo(), antes);
});
