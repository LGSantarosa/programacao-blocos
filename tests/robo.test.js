'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Robo = require('../web/robo.js');

const base = { msDesdeColisao: 99999, msDesdeFim: 99999, msParado: 0 };

test('andando sem novidade, o robô fica normal', () => {
  assert.strictEqual(Robo.reacao({ ...base }), 'normal');
});

test('acabou de bater, fica tonto', () => {
  assert.strictEqual(Robo.reacao({ ...base, msDesdeColisao: 200 }), 'tonto');
});

test('a tontura passa', () => {
  assert.strictEqual(Robo.reacao({ ...base, msDesdeColisao: 3000 }), 'normal');
});

test('acabou de terminar o programa, comemora', () => {
  assert.strictEqual(Robo.reacao({ ...base, msDesdeFim: 300 }), 'feliz');
});

test('parado há muito tempo, cochila', () => {
  assert.strictEqual(Robo.reacao({ ...base, msParado: 30000 }), 'dormindo');
});

test('bater ganha da comemoração: o susto é mais recente', () => {
  assert.strictEqual(
    Robo.reacao({ ...base, msDesdeColisao: 100, msDesdeFim: 100 }), 'tonto');
});

test('comemorar ganha do sono', () => {
  assert.strictEqual(
    Robo.reacao({ ...base, msDesdeFim: 300, msParado: 30000 }), 'feliz');
});

test('estado incompleto não estoura', () => {
  assert.doesNotThrow(() => Robo.reacao({}));
  assert.strictEqual(Robo.reacao({}), 'normal');
});
