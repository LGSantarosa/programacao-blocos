'use strict';

/* A arena era o único módulo de web/ sem teste, porque era o único sem
   module.exports. O que dá para provar aqui na mesa é o que interessa: a
   conversão metro→pixel, o y que vira de cabeça para baixo, e a estrela.
   O resto é cor, e cor é olho humano. */

const test = require('node:test');
const assert = require('node:assert');
const Arena = require('../web/arena.js');

const LADO_PX = 400;                 /* 2 m de arena → 200 px por metro */

/* Um ctx que não desenha nada: só anota o que lhe pediram, na ordem. */
function ctxFalso() {
  const chamadas = [];
  const ctx = {
    canvas: { width: LADO_PX, height: LADO_PX },
    chamadas: chamadas,
    de: function (nome) { return chamadas.filter((c) => c.nome === nome); },
  };
  ['clearRect', 'fillRect', 'strokeRect', 'beginPath', 'moveTo', 'lineTo',
   'closePath', 'fill', 'stroke', 'save', 'restore', 'translate', 'rotate',
  ].forEach(function (nome) {
    ctx[nome] = function () { chamadas.push({ nome: nome, args: [...arguments] }); };
  });
  return ctx;
}

test('o obstáculo vai para o lugar certo em pixels, com o y virado', () => {
  const ctx = ctxFalso();
  /* meio metro de lado, encostado no canto de baixo à esquerda da arena */
  Arena.desenhar(ctx, null, null, [{ x0: 0, y0: 0, x1: 0.5, y1: 0.5 }]);

  /* o primeiro fillRect é o chão; o segundo é o obstáculo */
  const rets = ctx.de('fillRect');
  assert.deepStrictEqual(rets[0].args, [0, 0, LADO_PX, LADO_PX]);
  /* x0=0 → 0 px; y1=0,5 m → 400 - 100 = 300 px; lado 0,5 m → 100 px */
  assert.deepStrictEqual(rets[1].args, [0, 300, 100, 100]);
});

test('arena sem obstáculo desenha só o chão', () => {
  const ctx = ctxFalso();
  Arena.desenhar(ctx, null, null, []);
  assert.strictEqual(ctx.de('fillRect').length, 1);
});

test('sem alvo não nasce estrela, e sem estado não nasce feixe', () => {
  const ctx = ctxFalso();
  Arena.desenhar(ctx, null, null, []);
  assert.strictEqual(ctx.de('lineTo').length, 0);
  assert.strictEqual(ctx.de('moveTo').length, 0);
});

test('o feixe do ultrassônico sai do robô e aponta para onde ele olha', () => {
  const ctx = ctxFalso();
  /* robô no meio da arena, virado para cima (theta = 90°), 100 cm de leitura */
  Arena.desenhar(ctx, { x: 1, y: 1, theta: Math.PI / 2, dist: 100 }, null, []);

  const de = ctx.de('moveTo')[0].args;
  assert.deepStrictEqual(de, [200, 200]);          /* 1 m → 200 px, centro */

  /* 0,08 m de raio + 1 m de alcance = 1,08 m para cima → 216 px acima */
  const ate = ctx.de('lineTo')[0].args;
  assert.ok(Math.abs(ate[0] - 200) < 0.001, 'não deve desviar em x');
  assert.ok(Math.abs(ate[1] - (200 - 216)) < 0.001, 'y = 200 - 216 px');
});

test('o feixe para em 4 m, por mais longe que o sensor diga', () => {
  const ctx = ctxFalso();
  Arena.desenhar(ctx, { x: 1, y: 1, theta: 0, dist: 99999 }, null, []);
  const ate = ctx.de('lineTo')[0].args;
  /* theta = 0 é para a direita: 0,08 + 4 = 4,08 m → 816 px a partir de 200 */
  assert.ok(Math.abs(ate[0] - (200 + 816)) < 0.001);
});

test('a estrela tem cinco pontas: dez vértices, alternando os dois raios', () => {
  const ctx = ctxFalso();
  Arena.desenharEstrela(ctx, 100, 100, 20);

  const pontos = ctx.de('lineTo').map((c) => c.args);
  assert.strictEqual(pontos.length, 10);
  assert.strictEqual(ctx.de('closePath').length, 1);

  /* a primeira ponta olha para cima: raio cheio, em cima do centro */
  assert.ok(Math.abs(pontos[0][0] - 100) < 0.001);
  assert.ok(Math.abs(pontos[0][1] - 80) < 0.001);

  const raio = (p) => Math.hypot(p[0] - 100, p[1] - 100);
  for (var i = 0; i < 10; i++) {
    const esperado = (i % 2 === 0) ? 20 : 20 * 0.45;
    assert.ok(Math.abs(raio(pontos[i]) - esperado) < 0.001,
      'vértice ' + i + ' deveria ter raio ' + esperado);
  }
});

test('o alvo da missão vira estrela no lugar certo', () => {
  const ctx = ctxFalso();
  Arena.desenhar(ctx, null, { x: 1.5, y: 0.5 }, []);
  const pontos = ctx.de('lineTo').map((c) => c.args);
  assert.strictEqual(pontos.length, 10);
  /* centro em (1,5 m; 0,5 m) → (300 px; 300 px), raio 0,075 m → 15 px */
  assert.ok(Math.abs(pontos[0][0] - 300) < 0.001);
  assert.ok(Math.abs(pontos[0][1] - 285) < 0.001);
});
