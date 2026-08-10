'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Missoes = require('../web/missoes.js');

/* A arena tem 2 x 2 m, o robô nasce em (1.0, 0.40) e o obstáculo ocupa
   de (0.80, 1.40) a (1.20, 1.60). Uma estrela em cima do obstáculo seria
   inalcançável, e uma em cima do robô já nasceria cumprida. */
const OBSTACULO = { x0: 0.80, y0: 1.40, x1: 1.20, y1: 1.60 };
const INICIO = { x: 1.0, y: 0.40 };

test('toda missão cabe dentro da arena, longe da parede', () => {
  for (const m of Missoes.LISTA) {
    assert.ok(m.x > 0.15 && m.x < 1.85, `${m.texto}: x=${m.x} colado na parede`);
    assert.ok(m.y > 0.15 && m.y < 1.85, `${m.texto}: y=${m.y} colado na parede`);
  }
});

test('nenhuma estrela nasce em cima do obstáculo', () => {
  for (const m of Missoes.LISTA) {
    const dentro = m.x >= OBSTACULO.x0 && m.x <= OBSTACULO.x1 &&
                   m.y >= OBSTACULO.y0 && m.y <= OBSTACULO.y1;
    assert.ok(!dentro, `${m.texto}: estrela dentro do bloco, impossível de alcançar`);
  }
});

test('nenhuma missão já nasce cumprida', () => {
  for (const m of Missoes.LISTA) {
    assert.ok(!Missoes.chegou(INICIO, m),
      `${m.texto}: o robô já começa em cima da estrela`);
  }
});

test('encostar na estrela conta, passar longe não', () => {
  const m = { x: 1.0, y: 1.0 };
  assert.ok(Missoes.chegou({ x: 1.0, y: 1.0 }, m), 'em cima deveria contar');
  assert.ok(Missoes.chegou({ x: 1.0, y: 1.0 + Missoes.RAIO - 0.01 }, m),
    'dentro do raio deveria contar');
  assert.ok(!Missoes.chegou({ x: 1.0, y: 1.0 + Missoes.RAIO + 0.05 }, m),
    'fora do raio não deveria contar');
});

test('o raio é generoso, porque o giro do robô erra alguns graus', () => {
  assert.ok(Missoes.RAIO >= 0.12,
    'raio apertado transformaria a missão em sorte');
  assert.ok(Missoes.RAIO <= 0.30,
    'raio largo demais faria a criança acertar sem querer');
});

test('pose ou missão faltando não estoura', () => {
  assert.doesNotThrow(() => Missoes.chegou(null, null));
  assert.strictEqual(Missoes.chegou(null, Missoes.daVez(0)), false);
  assert.strictEqual(Missoes.chegou(INICIO, null), false);
});

test('daVez dá a volta em vez de sair da lista', () => {
  assert.strictEqual(Missoes.daVez(0), Missoes.LISTA[0]);
  assert.strictEqual(Missoes.daVez(Missoes.quantas()), Missoes.LISTA[0]);
  assert.strictEqual(Missoes.daVez(-5), Missoes.LISTA[0]);
  assert.strictEqual(Missoes.daVez('abacaxi'), Missoes.LISTA[0]);
});

test('avançar caminha pela lista e volta ao começo no fim', () => {
  Missoes.definir(0);
  assert.strictEqual(Missoes.atual(), 0);
  assert.strictEqual(Missoes.avancar(), 1);
  Missoes.definir(Missoes.quantas() - 1);
  assert.strictEqual(Missoes.avancar(), 0, 'depois da última, recomeça');
  Missoes.definir(0);
});

test('toda missão tem um texto curto, que criança lê', () => {
  for (const m of Missoes.LISTA) {
    assert.ok(m.texto && m.texto.length > 0, 'missão sem texto');
    assert.ok(m.texto.length <= 40,
      `"${m.texto}" tem ${m.texto.length} letras; não cabe no painel`);
  }
});
