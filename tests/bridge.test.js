'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { paraLinhaDoRobo, paraQuadroDoNavegador, montarQuadro } =
  require('../bridge/server.js');

test('LOAD vira uma linha L com o programa em hex', () => {
  const carga = Buffer.alloc(3 + 7);
  carga[0] = 0x01;
  carga.writeUInt16LE(1, 1);
  carga[3] = 0x00;                        // HALT, resto zerado
  assert.strictEqual(paraLinhaDoRobo(carga), 'L 00000000000000');
});

test('LOAD com tamanho inconsistente é descartado', () => {
  const carga = Buffer.alloc(3 + 7);
  carga[0] = 0x01;
  carga.writeUInt16LE(5, 1);              // diz 5 instruções, traz 1
  assert.strictEqual(paraLinhaDoRobo(carga), null);
});

test('RUN e STOP viram R e S', () => {
  assert.strictEqual(paraLinhaDoRobo(Buffer.from([0x02])), 'R');
  assert.strictEqual(paraLinhaDoRobo(Buffer.from([0x03])), 'S');
});

test('tipo desconhecido é descartado', () => {
  assert.strictEqual(paraLinhaDoRobo(Buffer.from([0x77])), null);
});

test('P vira quadro de pc', () => {
  const q = paraQuadroDoNavegador('P 300');
  assert.strictEqual(q[0], 0x81);
  assert.strictEqual(q.readUInt16LE(1), 300);
});

test('E vira quadro de estado', () => {
  assert.deepStrictEqual([...paraQuadroDoNavegador('E 1')], [0x82, 1]);
  assert.deepStrictEqual([...paraQuadroDoNavegador('E 0')], [0x82, 0]);
});

test('T vira quadro de telemetria com sinal preservado', () => {
  const q = paraQuadroDoNavegador('T 1000 400 2700 92');
  assert.strictEqual(q[0], 0x83);
  assert.strictEqual(q.readInt16LE(1), 1000);
  assert.strictEqual(q.readInt16LE(3), 400);
  assert.strictEqual(q.readInt16LE(5), 2700);
  assert.strictEqual(q.readUInt16LE(7), 92);
});

test('quadro curto usa cabeçalho de 2 bytes', () => {
  const q = montarQuadro(Buffer.alloc(10));
  assert.strictEqual(q.length, 12);
  assert.strictEqual(q[0], 0x82);         // FIN + binário
  assert.strictEqual(q[1], 10);
});

test('quadro longo usa cabeçalho estendido de 4 bytes', () => {
  const q = montarQuadro(Buffer.alloc(1794));   // LOAD cheio: 256 instruções
  assert.strictEqual(q.length, 1798);
  assert.strictEqual(q[1], 126);
  assert.strictEqual(q.readUInt16BE(2), 1794);
});
