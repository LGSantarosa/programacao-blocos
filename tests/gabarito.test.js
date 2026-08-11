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
