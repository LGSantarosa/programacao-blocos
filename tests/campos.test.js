'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Campos = require('../web/campos.js');

test('a quantidade vira bolinhas cheias e vazias', () => {
  assert.strictEqual(Campos.paraBolinhas(2), '●●○○○');
  assert.strictEqual(Campos.paraBolinhas(3), '●●●○○');
  assert.strictEqual(Campos.paraBolinhas(5), '●●●●●');
});

test('a faixa é de 2 a 5, e valores fora dela são trazidos para dentro', () => {
  assert.strictEqual(Campos.paraBolinhas(0), '●●○○○');
  assert.strictEqual(Campos.paraBolinhas(99), '●●●●●');
});

test('valor não numérico não estoura', () => {
  assert.doesNotThrow(() => Campos.paraBolinhas(undefined));
  assert.strictEqual(Campos.paraBolinhas(undefined), '●●○○○');
});

test('registrar() devolve false fora do navegador, em vez de estourar', () => {
  assert.strictEqual(typeof Blockly, 'undefined');
  assert.doesNotThrow(() => Campos.registrar());
  assert.strictEqual(Campos.registrar(), false);
});
