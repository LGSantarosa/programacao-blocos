'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { compilar, OP } = require('../web/compilador.js');

function hex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

test('programa vazio vira só HALT', () => {
  const { bytes, pcMap } = compilar([]);
  assert.strictEqual(bytes.length, 7);
  assert.strictEqual(bytes[0], OP.HALT);
  assert.deepStrictEqual(pcMap, [null]);
});

test('frente vira MOTOR, WAIT, MOTOR', () => {
  const { bytes } = compilar([{ op: 'frente', segundos: 1, blockId: 'b1' }]);
  assert.strictEqual(bytes.length, 4 * 7);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(bytes[0], OP.MOTOR);
  assert.strictEqual(dv.getInt16(1, true), 200);
  assert.strictEqual(dv.getInt16(3, true), 200);
  assert.strictEqual(bytes[7], OP.WAIT);
  assert.strictEqual(dv.getInt16(8, true), 1000);
  assert.strictEqual(bytes[14], OP.MOTOR);
  assert.strictEqual(dv.getInt16(15, true), 0);
});

test('trás usa velocidade negativa', () => {
  const { bytes } = compilar([{ op: 'tras', segundos: 2, blockId: 'b1' }]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(dv.getInt16(1, true), -200);
  assert.strictEqual(dv.getInt16(8, true), 2000);
});

test('girar vira um único TURN', () => {
  const { bytes } = compilar([{ op: 'girar', graus: -90, blockId: 'b1' }]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(bytes[0], OP.TURN);
  assert.strictEqual(dv.getInt16(1, true), -90);
});

test('repetir fecha o laço voltando para o início do corpo', () => {
  const { bytes } = compilar([
    { op: 'repetir', vezes: 3, blockId: 'r', corpo: [
      { op: 'girar', graus: 90, blockId: 'g' },
    ] },
  ]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(bytes[0], OP.SET_REG);
  assert.strictEqual(dv.getInt16(1, true), 0);      // r0
  assert.strictEqual(dv.getInt16(3, true), 3);
  assert.strictEqual(bytes[7], OP.TURN);
  assert.strictEqual(bytes[14], OP.DEC_JNZ);
  assert.strictEqual(dv.getInt16(15, true), 0);     // r0
  assert.strictEqual(dv.getInt16(17, true), 1);     // volta para pc 1
});

test('repetir 0 vezes vira 1 e não trava a placa', () => {
  const { bytes } = compilar([
    { op: 'repetir', vezes: 0, blockId: 'r', corpo: [
      { op: 'girar', graus: 90, blockId: 'g' },
    ] },
  ]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(dv.getInt16(3, true), 1);
});

test('laços aninhados usam registradores diferentes', () => {
  const { bytes } = compilar([
    { op: 'repetir', vezes: 2, blockId: 'r1', corpo: [
      { op: 'repetir', vezes: 3, blockId: 'r2', corpo: [
        { op: 'girar', graus: 90, blockId: 'g' },
      ] },
    ] },
  ]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(dv.getInt16(1, true), 0);      // externo usa r0
  assert.strictEqual(dv.getInt16(8, true), 1);      // interno usa r1
});

test('laços fundos demais dão erro em português', () => {
  let no = { op: 'girar', graus: 90, blockId: 'g' };
  for (let i = 0; i < 5; i++) {
    no = { op: 'repetir', vezes: 2, blockId: 'r' + i, corpo: [no] };
  }
  assert.throws(() => compilar([no]), /aninhados/);
});

test('se_obstaculo salta para depois do corpo', () => {
  const { bytes } = compilar([
    { op: 'se_obstaculo', cm: 20, blockId: 's', corpo: [
      { op: 'girar', graus: 90, blockId: 'g' },
    ] },
  ]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(bytes[0], OP.JMP_IF_GE);
  assert.strictEqual(dv.getInt16(1, true), 0);      // sensor de distância
  assert.strictEqual(dv.getInt16(3, true), 20);
  assert.strictEqual(dv.getInt16(5, true), 2);      // pc 2 = depois do TURN
  assert.strictEqual(bytes[7], OP.TURN);
  assert.strictEqual(bytes[14], OP.HALT);
});

test('pcMap aponta cada instrução para o bloco que a gerou', () => {
  const { pcMap } = compilar([
    { op: 'repetir', vezes: 2, blockId: 'r', corpo: [
      { op: 'girar', graus: 90, blockId: 'g' },
    ] },
  ]);
  assert.deepStrictEqual(pcMap, ['r', 'g', 'r', null]);
});

test('programa dourado bate byte a byte com o teste da VM', () => {
  const { bytes } = compilar([
    { op: 'repetir', vezes: 4, blockId: 'r', corpo: [
      { op: 'frente', segundos: 1, blockId: 'f' },
      { op: 'girar', graus: 90, blockId: 'g' },
    ] },
  ]);
  assert.strictEqual(bytes.length, 49);
  assert.strictEqual(
    hex(bytes),
    '04000004000000' +   // SET_REG r0, 4
    '01c800c8000000' +   // MOTOR 200, 200
    '02e80300000000' +   // WAIT 1000
    '01000000000000' +   // MOTOR 0, 0
    '035a0000000000' +   // TURN 90
    '05000001000000' +   // DEC_JNZ r0, 1
    '00000000000000'     // HALT
  );
});

test('programa grande demais dá erro em português', () => {
  const corpo = [];
  for (let i = 0; i < 100; i++) corpo.push({ op: 'frente', segundos: 1, blockId: 'f' + i });
  assert.throws(() => compilar(corpo), /grande demais/);
});
