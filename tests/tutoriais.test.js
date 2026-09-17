'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Tutoriais = require('../web/tutoriais.js');

test('há uma trilha completa para Caixas e outra para Meus blocos', () => {
  assert.deepStrictEqual(
    Tutoriais.TOPICOS.map((t) => t.id), ['caixas', 'meus-blocos']);
  for (const topico of Tutoriais.TOPICOS) {
    assert.ok(topico.passos.length >= 5,
      `${topico.titulo} ficou curto demais para ensinar a ideia e a prática`);
    for (const passo of topico.passos) {
      assert.ok(passo.titulo && passo.texto, 'todo passo precisa se explicar');
      assert.ok(passo.desenho.length > 0, 'todo passo precisa mostrar um exemplo');
    }
  }
});

test('Caixas explica criar, guardar, mudar e ler sem confundir as operações', () => {
  const texto = Tutoriais.buscar('caixas').passos
    .map((p) => `${p.titulo} ${p.texto} ${p.dica}`).join('\n').toLowerCase();
  for (const ideia of ['criar caixa', 'guardar', 'mudar', 'soma', 'lê', 'não muda']) {
    assert.ok(texto.includes(ideia), `faltou explicar “${ideia}”`);
  }
  assert.ok(texto.includes('ele sai'),
    'guardar precisa dizer que substitui o valor anterior');
});

test('Meus blocos separa ensinar de usar e chega às entradas', () => {
  const texto = Tutoriais.buscar('meus-blocos').passos
    .map((p) => `${p.titulo} ${p.texto} ${p.dica}`).join('\n').toLowerCase();
  for (const ideia of ['ensinar', 'play', 'receita', 'entrada', '➕', 'cada uso']) {
    assert.ok(texto.includes(ideia), `faltou explicar “${ideia}”`);
  }
  assert.ok(texto.includes('fora da pilha do play'),
    'precisa evitar o erro comum de encaixar a definição no PLAY');
});

test('buscar recusa assunto que não existe', () => {
  assert.strictEqual(Tutoriais.buscar('inventado'), null);
});
