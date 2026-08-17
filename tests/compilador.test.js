'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { compilar, OP, BIN, UN, MAX_INSTR } = require('../web/compilador.js');

function hex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

/* Lê o programa como lista de (op, a, b, c). Comparar deslocamento de byte em
   cada teste esconderia o que mudou — e com a pilha os deslocamentos andam a
   cada instrução nova. */
function instrucoes(bytes) {
  const dv = new DataView(bytes.buffer);
  const fora = [];
  for (let k = 0; k * 7 < bytes.length; k++) {
    fora.push([bytes[k * 7], dv.getInt16(k * 7 + 1, true),
               dv.getInt16(k * 7 + 3, true), dv.getInt16(k * 7 + 5, true)]);
  }
  return fora;
}

test('programa vazio vira só HALT', () => {
  const { bytes, pcMap } = compilar([]);
  assert.strictEqual(bytes.length, 7);
  assert.strictEqual(bytes[0], OP.HALT);
  assert.deepStrictEqual(pcMap, [null]);
});

test('frente empilha velocidade, velocidade, e chama MOTOR', () => {
  const { bytes } = compilar([{ op: 'frente', segundos: 1, blockId: 'b1' }]);
  assert.deepStrictEqual(instrucoes(bytes), [
    [OP.PUSH, 200, 0, 0],
    [OP.PUSH, 200, 0, 0],
    [OP.MOTOR, 0, 0, 0],
    [OP.PUSH, 1000, 0, 0],
    [OP.WAIT, 0, 0, 0],
    [OP.PUSH, 0, 0, 0],
    [OP.PUSH, 0, 0, 0],
    [OP.MOTOR, 0, 0, 0],
    [OP.HALT, 0, 0, 0],
  ]);
});

test('trás empilha velocidade negativa', () => {
  const { bytes } = compilar([{ op: 'tras', segundos: 2, blockId: 'b1' }]);
  const i = instrucoes(bytes);
  assert.deepStrictEqual(i[0], [OP.PUSH, -200, 0, 0]);
  assert.deepStrictEqual(i[1], [OP.PUSH, -200, 0, 0]);
  assert.deepStrictEqual(i[3], [OP.PUSH, 2000, 0, 0]);
});

test('girar empilha os graus antes do TURN', () => {
  const { bytes } = compilar([{ op: 'girar', graus: -90, blockId: 'b1' }]);
  assert.deepStrictEqual(instrucoes(bytes).slice(0, 2), [
    [OP.PUSH, -90, 0, 0],
    [OP.TURN, 0, 0, 0],
  ]);
});

test('esperar empilha o prazo em milissegundos', () => {
  const { bytes } = compilar([{ op: 'esperar', segundos: 1.5, blockId: 'e' }]);
  assert.deepStrictEqual(instrucoes(bytes).slice(0, 2), [
    [OP.PUSH, 1500, 0, 0],
    [OP.WAIT, 0, 0, 0],
  ]);
});

test('repetir empilha as vezes antes do SET_REG', () => {
  const { bytes } = compilar([
    { op: 'repetir', vezes: 3, blockId: 'r', corpo: [
      { op: 'girar', graus: 90, blockId: 'g' },
    ] },
  ]);
  assert.deepStrictEqual(instrucoes(bytes), [
    [OP.PUSH, 3, 0, 0],
    [OP.SET_REG, 0, 0, 0],
    [OP.PUSH, 90, 0, 0],
    [OP.TURN, 0, 0, 0],
    [OP.DEC_JNZ, 0, 2, 0],
    [OP.HALT, 0, 0, 0],
  ]);
});

test('repetir 0 vezes vira 1 e não trava a placa', () => {
  const { bytes } = compilar([
    { op: 'repetir', vezes: 0, blockId: 'r', corpo: [
      { op: 'girar', graus: 90, blockId: 'g' },
    ] },
  ]);
  assert.deepStrictEqual(instrucoes(bytes)[0], [OP.PUSH, 1, 0, 0]);
});

test('laços aninhados usam registradores diferentes', () => {
  const { bytes } = compilar([
    { op: 'repetir', vezes: 2, blockId: 'r1', corpo: [
      { op: 'repetir', vezes: 3, blockId: 'r2', corpo: [
        { op: 'girar', graus: 90, blockId: 'g' },
      ] },
    ] },
  ]);
  const i = instrucoes(bytes);
  assert.deepStrictEqual(i[1], [OP.SET_REG, 0, 0, 0]);   // externo usa r0
  assert.deepStrictEqual(i[3], [OP.SET_REG, 1, 0, 0]);   // interno usa r1
});

test('laços fundos demais dão erro em português', () => {
  let no = { op: 'girar', graus: 90, blockId: 'g' };
  for (let i = 0; i < 5; i++) {
    no = { op: 'repetir', vezes: 2, blockId: 'r' + i, corpo: [no] };
  }
  assert.throws(() => compilar([no]), /aninhados/);
});

/* Os três blocos de sensor do Grande deixam de ter opcode próprio e passam a
   compilar pelo caminho de todo mundo. Não mudam na tela nem no comportamento —
   e é essa unificação que faz o "distância cm" do Gigante ser o mesmo
   mecanismo, não um segundo. */
test('se obstáculo vira SENSOR, PUSH, BIN menor, JMP_FALSE', () => {
  const { bytes } = compilar([
    { op: 'se_obstaculo', cm: 20, blockId: 's', corpo: [
      { op: 'girar', graus: 90, blockId: 'g' },
    ] },
  ]);
  assert.deepStrictEqual(instrucoes(bytes), [
    [OP.SENSOR, 0, 0, 0],
    [OP.PUSH, 20, 0, 0],
    [OP.BIN, BIN.MENOR, 0, 0],
    [OP.JMP_FALSE, 6, 0, 0],     /* longe → pula o corpo */
    [OP.PUSH, 90, 0, 0],
    [OP.TURN, 0, 0, 0],
    [OP.HALT, 0, 0, 0],
  ]);
});

test('pcMap aponta cada instrução para o bloco que a gerou', () => {
  const { pcMap } = compilar([
    { op: 'repetir', vezes: 2, blockId: 'r', corpo: [
      { op: 'girar', graus: 90, blockId: 'g' },
    ] },
  ]);
  assert.deepStrictEqual(pcMap, ['r', 'r', 'g', 'g', 'r', null]);
});

test('programa dourado bate byte a byte com o teste da VM', () => {
  const { bytes } = compilar([
    { op: 'repetir', vezes: 4, blockId: 'r', corpo: [
      { op: 'frente', segundos: 1, blockId: 'f' },
      { op: 'girar', graus: 90, blockId: 'g' },
    ] },
  ]);
  assert.strictEqual(bytes.length, 98);
  assert.strictEqual(
    hex(bytes),
    '08040000000000' +   // pc  0: PUSH 4
    '04000000000000' +   // pc  1: SET_REG r0
    '08c80000000000' +   // pc  2: PUSH 200
    '08c80000000000' +   // pc  3: PUSH 200
    '01000000000000' +   // pc  4: MOTOR
    '08e80300000000' +   // pc  5: PUSH 1000
    '02000000000000' +   // pc  6: WAIT
    '08000000000000' +   // pc  7: PUSH 0
    '08000000000000' +   // pc  8: PUSH 0
    '01000000000000' +   // pc  9: MOTOR
    '085a0000000000' +   // pc 10: PUSH 90
    '03000000000000' +   // pc 11: TURN
    '05000002000000' +   // pc 12: DEC_JNZ r0, 2
    '00000000000000'     // pc 13: HALT
  );
});

test('o teto de instruções é 1024', () => {
  assert.strictEqual(MAX_INSTR, 1024);
  const muitos = [];
  for (let k = 0; k < 400; k++) muitos.push({ op: 'girar', graus: 90, blockId: 'g' });
  assert.doesNotThrow(() => compilar(muitos));
});

test('programa grande demais dá erro em português', () => {
  const corpo = [];
  for (let i = 0; i < 200; i++) corpo.push({ op: 'frente', segundos: 1, blockId: 'f' + i });
  assert.throws(() => compilar(corpo), /grande demais/);
});

/* A pilha da VM tem fundo. Descobrir isso com o robô andando seria descobrir
   tarde: uma conta funda demais é recusada aqui, com mensagem que a criança
   consegue ler. */
test('conta funda demais é recusada ao compilar, em português', () => {
  /* Aninhada à direita: é ela que empilha. O lado esquerdo é calculado e
     consumido antes do direito começar, então aninhar à esquerda custa dois
     lugares e nunca estoura. */
  let fundo = 1;
  for (let k = 0; k < 20; k++) fundo = { op: 'mais', a: 1, b: fundo };
  assert.throws(() => compilar([{ op: 'girar', graus: fundo, blockId: 'g' }]),
    /conta.*complicada/i);
});

test('uma conta de profundidade normal passa', () => {
  let ok = 1;
  for (let k = 0; k < 6; k++) ok = { op: 'mais', a: 1, b: ok };
  assert.doesNotThrow(() => compilar([{ op: 'girar', graus: ok, blockId: 'g' }]));
});

/* Aninhar à esquerda é grátis, e vale ter isso escrito: uma criança que
   encadeia dez somas numa fila não pode esbarrar num limite. */
test('conta comprida para a esquerda não estoura a pilha', () => {
  let comprida = 1;
  for (let k = 0; k < 40; k++) comprida = { op: 'mais', a: comprida, b: 1 };
  assert.doesNotThrow(() =>
    compilar([{ op: 'girar', graus: comprida, blockId: 'g' }]));
});

test('velocidade escolhida vira o PUSH com aquele valor', () => {
  const { bytes } = compilar([
    { op: 'frente', segundos: 1, velocidade: 255, blockId: 'b1' },
  ]);
  const i = instrucoes(bytes);
  assert.deepStrictEqual(i[0], [OP.PUSH, 255, 0, 0]);
  assert.deepStrictEqual(i[1], [OP.PUSH, 255, 0, 0]);
});

test('velocidade também vale para trás, com sinal negativo', () => {
  const { bytes } = compilar([
    { op: 'tras', segundos: 1, velocidade: 120, blockId: 'b1' },
  ]);
  assert.deepStrictEqual(instrucoes(bytes)[0], [OP.PUSH, -120, 0, 0]);
});

test('sem velocidade continua usando 200, como a v1', () => {
  const { bytes } = compilar([{ op: 'frente', segundos: 1, blockId: 'b1' }]);
  assert.deepStrictEqual(instrucoes(bytes)[0], [OP.PUSH, 200, 0, 0]);
});

test('velocidade zero ou negativa cai para a calibração da v1', () => {
  for (const v of [0, -50]) {
    const { bytes } = compilar([
      { op: 'frente', segundos: 1, velocidade: v, blockId: 'b1' },
    ]);
    assert.deepStrictEqual(instrucoes(bytes)[0], [OP.PUSH, 200, 0, 0],
      `velocidade ${v} deveria cair para 200`);
  }
});

test('velocidade absurda é trazida para a faixa do motor', () => {
  const { bytes } = compilar([
    { op: 'frente', segundos: 1, velocidade: 9999, blockId: 'b1' },
  ]);
  assert.deepStrictEqual(instrucoes(bytes)[0], [OP.PUSH, 255, 0, 0]);
});

test('o passo fixo do Pequeno gera o mesmo bytecode que andar frente 0.5 s', () => {
  const pequeno = compilar([{ op: 'frente', segundos: 0.5, blockId: 'p' }]);
  const medio   = compilar([{ op: 'frente', segundos: 0.5, blockId: 'm' }]);
  assert.deepStrictEqual([...pequeno.bytes], [...medio.bytes]);
  assert.deepStrictEqual(instrucoes(pequeno.bytes)[3], [OP.PUSH, 500, 0, 0]);
});

test('ângulo livre vira TURN com o ângulo pedido, não 90 fixo', () => {
  const { bytes } = compilar([{ op: 'girar', graus: 45, blockId: 'g' }]);
  assert.deepStrictEqual(instrucoes(bytes).slice(0, 2), [
    [OP.PUSH, 45, 0, 0],
    [OP.TURN, 0, 0, 0],
  ]);
});

test('parar vira um HALT antes do HALT final', () => {
  const { bytes } = compilar([{ op: 'parar', blockId: 'p' }]);
  assert.strictEqual(bytes.length, 2 * 7);
  assert.strictEqual(bytes[0], OP.HALT);
  assert.strictEqual(bytes[7], OP.HALT);
});

test('repetir para sempre fecha com um JMP para trás', () => {
  const { bytes } = compilar([
    { op: 'repetir_sempre', blockId: 's', corpo: [
      { op: 'girar', graus: 90, blockId: 'g' },
    ] },
  ]);
  assert.deepStrictEqual(instrucoes(bytes), [
    [OP.PUSH, 90, 0, 0],
    [OP.TURN, 0, 0, 0],
    [OP.JMP, 0, 0, 0],           /* volta para o pc 0 */
    [OP.HALT, 0, 0, 0],
  ]);
});

test('repetir para sempre com corpo vazio salta para si mesmo', () => {
  /* Não trava: a VM executa uma instrução por tick, então é um laço ocioso que
     o botão PARAR encerra. Proibir custaria mais do que vale. */
  const { bytes } = compilar([{ op: 'repetir_sempre', blockId: 's', corpo: [] }]);
  assert.deepStrictEqual(instrucoes(bytes)[0], [OP.JMP, 0, 0, 0]);
});

test('se…senão pula o então quando não há obstáculo', () => {
  const { bytes } = compilar([
    { op: 'se_senao', cm: 20, blockId: 'x',
      entao: [{ op: 'girar', graus: 90, blockId: 'a' }],
      senao: [{ op: 'girar', graus: -90, blockId: 'b' }] },
  ]);
  assert.deepStrictEqual(instrucoes(bytes), [
    [OP.SENSOR, 0, 0, 0],
    [OP.PUSH, 20, 0, 0],
    [OP.BIN, BIN.MENOR, 0, 0],
    [OP.JMP_FALSE, 7, 0, 0],     /* longe → vai ao senão */
    [OP.PUSH, 90, 0, 0],         /* então */
    [OP.TURN, 0, 0, 0],
    [OP.JMP, 9, 0, 0],           /* então pula o senão */
    [OP.PUSH, -90, 0, 0],        /* senão */
    [OP.TURN, 0, 0, 0],
    [OP.HALT, 0, 0, 0],
  ]);
});

/* Com o ramo senão vazio não há para onde pular: o JMP_FALSE já cai no fim.
   Antes saía um JMP a mais, que saltava uma instrução adiante e nunca fez
   diferença nenhuma — o caminho da pilha aproveitou para não emiti-lo. */
test('se…senão com o ramo senão vazio não emite salto à toa', () => {
  const { bytes } = compilar([
    { op: 'se_senao', cm: 30, blockId: 'x',
      entao: [{ op: 'girar', graus: 90, blockId: 'a' }], senao: [] },
  ]);
  assert.deepStrictEqual(instrucoes(bytes), [
    [OP.SENSOR, 0, 0, 0],
    [OP.PUSH, 30, 0, 0],
    [OP.BIN, BIN.MENOR, 0, 0],
    [OP.JMP_FALSE, 6, 0, 0],
    [OP.PUSH, 90, 0, 0],
    [OP.TURN, 0, 0, 0],
    [OP.HALT, 0, 0, 0],
  ]);
});

test('repetir até perto testa antes de rodar o corpo', () => {
  const { bytes } = compilar([
    { op: 'repetir_ate_perto', cm: 20, blockId: 'a', corpo: [
      { op: 'girar', graus: 90, blockId: 'g' },
    ] },
  ]);
  assert.deepStrictEqual(instrucoes(bytes), [
    [OP.SENSOR, 0, 0, 0],
    [OP.PUSH, 20, 0, 0],
    [OP.BIN, BIN.MENOR, 0, 0],
    [OP.UN, UN.NAO, 0, 0],       /* roda enquanto NÃO chegou perto */
    [OP.JMP_FALSE, 8, 0, 0],     /* perto → sai */
    [OP.PUSH, 90, 0, 0],         /* corpo */
    [OP.TURN, 0, 0, 0],
    [OP.JMP, 0, 0, 0],           /* volta para o teste */
    [OP.HALT, 0, 0, 0],
  ]);
});

test('os laços novos não gastam registrador', () => {
  /* Só o "repetir N vezes" usa DEC_JNZ, e o limite de quatro aninhados é só
     dele. Quatro repetir dentro de dois laços novos tem que compilar. */
  let dentro = { op: 'girar', graus: 90, blockId: 'g' };
  for (let i = 0; i < 4; i++) {
    dentro = { op: 'repetir', vezes: 2, blockId: 'r' + i, corpo: [dentro] };
  }
  assert.doesNotThrow(() => compilar([
    { op: 'repetir_sempre', blockId: 's', corpo: [
      { op: 'repetir_ate_perto', cm: 20, blockId: 'a', corpo: [dentro] },
    ] },
  ]));
});

test('cada instrução nova aponta para o bloco que a gerou', () => {
  const { pcMap } = compilar([{ op: 'parar', blockId: 'meu-parar' }]);
  assert.strictEqual(pcMap[0], 'meu-parar');
});

/* ---------- as contas do Gigante ---------- */

test('uma conta vira a subárvore antes do comando', () => {
  const { bytes } = compilar([
    { op: 'girar', blockId: 'g',
      graus: { op: 'vezes', a: 45, b: 2, blockId: 'c' } },
  ]);
  assert.deepStrictEqual(instrucoes(bytes).slice(0, 4), [
    [OP.PUSH, 45, 0, 0],
    [OP.PUSH, 2, 0, 0],
    [OP.BIN, BIN.VEZES, 0, 0],
    [OP.TURN, 0, 0, 0],
  ]);
});

test('se com condição da criança usa JMP_FALSE', () => {
  const { bytes } = compilar([
    { op: 'se', blockId: 's',
      cond: { op: 'menor', a: { op: 'distancia' }, b: 30 },
      corpo: [{ op: 'parar', blockId: 'p' }] },
  ]);
  assert.deepStrictEqual(instrucoes(bytes), [
    [OP.SENSOR, 0, 0, 0],
    [OP.PUSH, 30, 0, 0],
    [OP.BIN, BIN.MENOR, 0, 0],
    [OP.JMP_FALSE, 5, 0, 0],
    [OP.HALT, 0, 0, 0],
    [OP.HALT, 0, 0, 0],
  ]);
});

test('segundos que são conta viram multiplicação por mil', () => {
  const { bytes } = compilar([
    { op: 'esperar', blockId: 'e',
      segundos: { op: 'aleatorio', a: 1, b: 3, blockId: 'r' } },
  ]);
  assert.deepStrictEqual(instrucoes(bytes).slice(0, 6), [
    [OP.PUSH, 1, 0, 0],
    [OP.PUSH, 3, 0, 0],
    [OP.BIN, BIN.ALEATORIO, 0, 0],
    [OP.PUSH, 1000, 0, 0],
    [OP.BIN, BIN.VEZES, 0, 0],
    [OP.WAIT, 0, 0, 0],
  ]);
});

test('repetir até do Gigante testa antes e volta no fim', () => {
  const { bytes } = compilar([
    { op: 'repetir_ate', blockId: 'r',
      cond: { op: 'maior', a: { op: 'distancia' }, b: 50 },
      corpo: [{ op: 'parar', blockId: 'p' }] },
  ]);
  assert.deepStrictEqual(instrucoes(bytes), [
    [OP.SENSOR, 0, 0, 0],
    [OP.PUSH, 50, 0, 0],
    [OP.BIN, BIN.MAIOR, 0, 0],
    [OP.UN, UN.NAO, 0, 0],
    [OP.JMP_FALSE, 7, 0, 0],
    [OP.HALT, 0, 0, 0],
    [OP.JMP, 0, 0, 0],
    [OP.HALT, 0, 0, 0],
  ]);
});

test('e, ou e não viram BIN e UN', () => {
  const { bytes } = compilar([
    { op: 'se', blockId: 's',
      cond: { op: 'e', a: { op: 'nao', a: 1 }, b: 0 },
      corpo: [] },
  ]);
  const i = instrucoes(bytes);
  assert.deepStrictEqual(i[0], [OP.PUSH, 1, 0, 0]);
  assert.deepStrictEqual(i[1], [OP.UN, UN.NAO, 0, 0]);
  assert.deepStrictEqual(i[2], [OP.PUSH, 0, 0, 0]);
  assert.deepStrictEqual(i[3], [OP.BIN, BIN.E, 0, 0]);
});

test('conta desconhecida é erro, não silêncio', () => {
  assert.throws(
    () => compilar([{ op: 'girar', graus: { op: 'raiz', a: 9 }, blockId: 'g' }]),
    /Conta desconhecida/);
});
