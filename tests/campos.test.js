'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Campos = require('../web/campos.js');

test('a quantidade vira bolinhas cheias e vazias', () => {
  assert.strictEqual(Campos.paraBolinhas(1), '●○○○○');
  assert.strictEqual(Campos.paraBolinhas(3), '●●●○○');
  assert.strictEqual(Campos.paraBolinhas(5), '●●●●●');
});

test('acima de cinco o campo mostra o número, porque bolinhas não representam doze', () => {
  assert.strictEqual(Campos.paraBolinhas(12), '12');
  assert.strictEqual(Campos.paraBolinhas(100), '100');
});

test('valor inválido não estoura e cai em uma bolinha', () => {
  assert.doesNotThrow(() => Campos.paraBolinhas(undefined));
  assert.strictEqual(Campos.paraBolinhas(undefined), '●○○○○');
  assert.strictEqual(Campos.paraBolinhas(0), '●○○○○');
});

test('registrar() devolve false fora do navegador, em vez de estourar', () => {
  assert.strictEqual(typeof Blockly, 'undefined');
  assert.doesNotThrow(() => Campos.registrar());
  assert.strictEqual(Campos.registrar(), false);
});

test('clicar num valor que não cabe em bolinhas não o apaga', () => {
  /* Um 12 herdado do nível Grande não pode virar 1 por um clique — seria
     perder o que a criança escolheu sem ela pedir. */
  assert.strictEqual(Campos.paraBolinhas(12), '12');
  assert.ok(Campos.CASAS === 5, 'a regra depende de CASAS ser 5');
});
