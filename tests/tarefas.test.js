'use strict';
/* O compilador das tarefas: várias pilhas com cabeça, cada uma virando um pc
   da VM.

   O que mais importa aqui são os saltos. Cada pilha é compilada sozinha,
   achando que começa em zero, e depois costurada num programa só — se um
   salto não for somado ao lugar onde a pilha caiu, a criança não vê erro
   nenhum: vê o robô fazendo o que está montado na pilha do lado. */

const test = require('node:test');
const assert = require('node:assert');
const { compilar, compilarTarefas, OP, TAREFA, N_TAREFAS } =
  require('../web/compilador.js');

function instrucoes(bytes) {
  const dv = new DataView(bytes.buffer);
  const fora = [];
  for (let k = 0; k * 7 < bytes.length; k++) {
    fora.push([bytes[k * 7], dv.getInt16(k * 7 + 1, true),
               dv.getInt16(k * 7 + 3, true), dv.getInt16(k * 7 + 5, true)]);
  }
  return fora;
}

const parar = (id) => ({ op: 'parar', blockId: id });

test('uma tarefa só do PLAY tem cabeçalho de uma linha', () => {
  const { bytes } = compilarTarefas([
    { quando: 'play', corpo: [parar('b1')], blockId: 'p' },
  ]);
  assert.deepStrictEqual(instrucoes(bytes), [
    [OP.TASK, TAREFA.NO_PLAY, 1, 0],   /* corpo começa em 1 */
    [OP.HALT, 0, 0, 0],                /* o parar da criança */
    [OP.HALT, 0, 0, 0],                /* o fecho da tarefa */
  ]);
});

test('cada tarefa aponta para onde o corpo dela caiu', () => {
  const { bytes } = compilarTarefas([
    { quando: 'play', corpo: [parar('a')], blockId: 'p' },
    { quando: 'aviso', aviso: 3, corpo: [parar('b')], blockId: 'q' },
  ]);
  const p = instrucoes(bytes);
  /* Duas linhas de cabeçalho: a primeira tarefa começa em 2, e a segunda
     depois dos dois HALT dela. */
  assert.deepStrictEqual(p[0], [OP.TASK, TAREFA.NO_PLAY, 2, 0]);
  assert.deepStrictEqual(p[1], [OP.TASK, TAREFA.NO_AVISO, 4, 3]);
  assert.strictEqual(p.length, 6);
});

test('toda tarefa fecha em HALT, senão invade a de baixo', () => {
  /* A VM não tem fim de tarefa: o pc simplesmente segue em frente e entra no
     corpo da pilha seguinte. É a regra que o tests/tarefas_test.c prova do
     lado de lá, e é este teste que garante que o compilador a cumpre. */
  const { bytes } = compilarTarefas([
    { quando: 'play', corpo: [], blockId: 'p' },
    { quando: 'play', corpo: [], blockId: 'q' },
  ]);
  const p = instrucoes(bytes);
  assert.deepStrictEqual(p[2], [OP.HALT, 0, 0, 0]);
  assert.deepStrictEqual(p[3], [OP.HALT, 0, 0, 0]);
});

test('o salto de um repetir sempre é somado ao lugar onde a pilha caiu', () => {
  const corpoQueSalta = [{ op: 'repetir_sempre', corpo: [parar('x')],
                           blockId: 'r' }];
  /* Sozinha, a pilha salta para zero. */
  const sozinha = instrucoes(compilar(corpoQueSalta).bytes);
  assert.deepStrictEqual(sozinha[1], [OP.JMP, 0, 0, 0]);

  /* Como segunda tarefa, ela cai depois do cabeçalho e da primeira. */
  const { bytes } = compilarTarefas([
    { quando: 'play', corpo: [parar('a')], blockId: 'p' },
    { quando: 'play', corpo: corpoQueSalta, blockId: 'q' },
  ]);
  const p = instrucoes(bytes);
  const inicioDaSegunda = p[1][2];
  assert.strictEqual(inicioDaSegunda, 4);
  assert.deepStrictEqual(p[inicioDaSegunda + 1], [OP.JMP, inicioDaSegunda, 0, 0]);
});

test('o salto de um repetir contado (DEC_JNZ) também é somado', () => {
  /* O DEC_JNZ leva o endereço no campo b, e não no a. É o erro mais fácil de
     cometer ao costurar, e o mais silencioso. */
  const repetir = [{ op: 'repetir', vezes: 3, corpo: [parar('x')],
                     blockId: 'r' }];
  const { bytes } = compilarTarefas([
    { quando: 'play', corpo: [parar('a')], blockId: 'p' },
    { quando: 'play', corpo: repetir, blockId: 'q' },
  ]);
  const p = instrucoes(bytes);
  const inicio = p[1][2];
  const dec = p.find((i) => i[0] === OP.DEC_JNZ);
  assert.ok(dec, 'devia haver um DEC_JNZ');
  assert.ok(dec[2] >= inicio,
    `o DEC_JNZ salta para ${dec[2]}, antes do início da tarefa (${inicio})`);
});

test('quando <condição> vira uma tarefa que testa, roda e volta a testar', () => {
  const { bytes } = compilarTarefas([
    { quando: 'condicao',
      cond: { op: 'menor', a: { op: 'distancia' }, b: 20, blockId: 'c' },
      corpo: [parar('x')],
      blockId: 'q' },
  ]);
  const p = instrucoes(bytes);
  const inicio = p[0][2];
  assert.strictEqual(p[0][0], OP.TASK);
  assert.strictEqual(p[0][1], TAREFA.NO_PLAY, 'o olho abre no PLAY');

  /* a condição, o desvio de volta ao teste, o corpo, e o salto ao teste */
  assert.strictEqual(p[inicio][0], OP.SENSOR);
  const jmpFalse = p.findIndex((i) => i[0] === OP.JMP_FALSE);
  assert.ok(jmpFalse > inicio);
  assert.strictEqual(p[jmpFalse][1], inicio, 'condição falsa volta ao teste');
  assert.deepStrictEqual(p[p.length - 1], [OP.JMP, inicio, 0, 0],
    'depois do corpo, volta a testar');
});

test('o «quando» não fecha em HALT: o olho fica aberto', () => {
  /* Uma tela com «quando» só para no PARAR, e isso é escolha: enquanto o
     programa roda, o olho está olhando. */
  const { bytes } = compilarTarefas([
    { quando: 'condicao', cond: { op: 'distancia' }, corpo: [], blockId: 'q' },
  ]);
  const p = instrucoes(bytes);
  assert.notStrictEqual(p[p.length - 1][0], OP.HALT);
});

test('avisar vira BROADCAST com o número do aviso', () => {
  const { bytes } = compilar([{ op: 'avisar', aviso: 4, blockId: 'a' }]);
  assert.deepStrictEqual(instrucoes(bytes), [
    [OP.BROADCAST, 4, 0, 0],
    [OP.HALT, 0, 0, 0],
  ]);
});

test('o pcMap acompanha as tarefas, para o bloco certo acender', () => {
  const { bytes, pcMap } = compilarTarefas([
    { quando: 'play', corpo: [parar('a')], blockId: 'p' },
    { quando: 'aviso', aviso: 1, corpo: [parar('b')], blockId: 'q' },
  ]);
  assert.strictEqual(pcMap.length, bytes.length / 7);
  assert.strictEqual(pcMap[0], 'p');
  assert.strictEqual(pcMap[1], 'q');
  assert.strictEqual(pcMap[2], 'a');
  assert.strictEqual(pcMap[4], 'b');
});

test('mais pilhas do que a VM roda é erro dito em português', () => {
  const muitas = [];
  for (let i = 0; i <= N_TAREFAS; i++) {
    muitas.push({ quando: 'play', corpo: [], blockId: 'b' + i });
  }
  assert.throws(() => compilarTarefas(muitas), (e) => {
    assert.match(e.message, /pilhas com cabeça/);
    assert.match(e.message, new RegExp(String(N_TAREFAS)));
    return true;
  });
});

test('sem tarefa nenhuma sai o programa vazio de sempre', () => {
  const { bytes } = compilarTarefas([]);
  assert.deepStrictEqual(instrucoes(bytes), [[OP.HALT, 0, 0, 0]]);
});

test('o programa de uma pilha só continua saindo sem cabeçalho', () => {
  /* O bytecode que a criança guardou no navegador tem de continuar valendo, e
     o .ino exportado também: quem não usa cabeça nova não paga por ela. */
  const ast = [{ op: 'frente', segundos: 1, blockId: 'b' }];
  const p = instrucoes(compilar(ast).bytes);
  assert.ok(p.every((i) => i[0] !== OP.TASK));
});
