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

test('velocidade escolhida vira o MOTOR com aquele valor', () => {
  const { bytes } = compilar([
    { op: 'frente', segundos: 1, velocidade: 255, blockId: 'b1' },
  ]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(dv.getInt16(1, true), 255);
  assert.strictEqual(dv.getInt16(3, true), 255);
});

test('velocidade também vale para trás, com sinal negativo', () => {
  const { bytes } = compilar([
    { op: 'tras', segundos: 1, velocidade: 120, blockId: 'b1' },
  ]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(dv.getInt16(1, true), -120);
});

test('sem velocidade continua usando 200, como a v1', () => {
  const { bytes } = compilar([{ op: 'frente', segundos: 1, blockId: 'b1' }]);
  assert.strictEqual(new DataView(bytes.buffer).getInt16(1, true), 200);
});

test('velocidade zero ou negativa cai para a calibração da v1', () => {
  for (const v of [0, -50]) {
    const { bytes } = compilar([
      { op: 'frente', segundos: 1, velocidade: v, blockId: 'b1' },
    ]);
    assert.strictEqual(new DataView(bytes.buffer).getInt16(1, true), 200,
      `velocidade ${v} deveria cair para 200`);
  }
});

test('velocidade absurda é trazida para a faixa do motor', () => {
  const { bytes } = compilar([
    { op: 'frente', segundos: 1, velocidade: 9999, blockId: 'b1' },
  ]);
  assert.strictEqual(new DataView(bytes.buffer).getInt16(1, true), 255);
});

test('o passo fixo do Pequeno gera o mesmo bytecode que andar frente 0.5 s', () => {
  const pequeno = compilar([{ op: 'frente', segundos: 0.5, blockId: 'p' }]);
  const medio   = compilar([{ op: 'frente', segundos: 0.5, blockId: 'm' }]);
  assert.deepStrictEqual([...pequeno.bytes], [...medio.bytes]);
  assert.strictEqual(new DataView(pequeno.bytes.buffer).getInt16(8, true), 500);
});

test('ângulo livre vira TURN com o ângulo pedido, não 90 fixo', () => {
  const { bytes } = compilar([{ op: 'girar', graus: 45, blockId: 'g' }]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(bytes[0], OP.TURN);
  assert.strictEqual(dv.getInt16(1, true), 45);
});
