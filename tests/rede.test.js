'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Rede = require('../web/rede.js');

test('no navegador comum, o alvo é a própria origem em ws://', () => {
  assert.strictEqual(Rede.url('localhost:8080', 'http:'), 'ws://localhost:8080/');
});

test('página servida por https usa wss', () => {
  assert.strictEqual(Rede.url('exemplo.org', 'https:'), 'wss://exemplo.org/');
});

test('a placa é sempre ws: não existe certificado em 192.168.4.1', () => {
  assert.strictEqual(Rede.url('192.168.4.1', 'http:'), 'ws://192.168.4.1/');
});

test('o alvo pode trazer porta junto', () => {
  assert.strictEqual(Rede.url('127.0.0.1:53411', 'http:'), 'ws://127.0.0.1:53411/');
});
