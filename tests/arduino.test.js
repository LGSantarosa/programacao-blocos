'use strict';
/* O gerador do .ino. Roda em Node porque ele não conhece DOM nem Blockly —
   mesma razão que separou o compilador.js e o gabarito.js. */

const test = require('node:test');
const assert = require('node:assert');
const { gerar } = require('../web/arduino.js');

/* Só o corpo do programa(), sem o resto do arquivo: é ali que mora a tradução,
   e comparar o arquivo inteiro faria cada teste falhar por causa do cabeçalho.

   O ^\}$ com a flag m é obrigatório: sem ele o [\s\S]*? pararia na primeira
   chave fechada que aparecesse, que é a de um laço lá dentro. */
function programa(ast) {
  const m = gerar(ast).match(/void programa\(\) \{\n([\s\S]*?)^\}$/m);
  assert.ok(m, 'não achei o programa() no arquivo gerado');
  return m[1].replace(/\n$/, '');
}

test('programa vazio gera um programa() de corpo vazio', () => {
  assert.strictEqual(programa([]), '');
});

test('andar frente vira andarFrente com segundos e velocidade', () => {
  assert.strictEqual(
    programa([{ op: 'frente', segundos: 1, velocidade: 200 }]),
    '  andarFrente(1.0, 200);');
});

test('andar trás vira andarTras', () => {
  assert.strictEqual(
    programa([{ op: 'tras', segundos: 2.5, velocidade: 120 }]),
    '  andarTras(2.5, 120);');
});

/* O Pequeno e o Médio não mostram o menu de velocidade. Sem ele vale a
   calibração da v1 — a mesma regra do web/compilador.js. */
test('sem velocidade vale 200, igual ao compilador', () => {
  assert.strictEqual(
    programa([{ op: 'frente', segundos: 0.5 }]),
    '  andarFrente(0.5, 200);');
});

test('velocidade acima de 255 satura, igual ao compilador', () => {
  assert.strictEqual(
    programa([{ op: 'frente', segundos: 1, velocidade: 400 }]),
    '  andarFrente(1.0, 255);');
});

test('segundos saem sempre com uma casa, que é a precisão do campo', () => {
  assert.strictEqual(
    programa([{ op: 'esperar', segundos: 2 }]),
    '  esperar(2.0);');
});

test('girar sai inteiro e com sinal', () => {
  assert.strictEqual(programa([{ op: 'girar', graus: -90 }]), '  girar(-90);');
});

test('o arquivo tem sempre o esqueleto do sketch', () => {
  const txt = gerar([]);
  for (const pedaco of ['void fiacao()', 'void motores(', 'void parar()',
                        'void programa()', 'void setup()', 'void loop()']) {
    assert.ok(txt.includes(pedaco), 'faltou ' + pedaco);
  }
});

/* Não há botão PLAY na placa: o RESET é que vira o PLAY, e os 3 s são o tempo
   de pôr o robô no chão e tirar a mão. */
test('setup espera, roda uma vez, e o loop fica vazio', () => {
  const txt = gerar([]);
  assert.ok(/void setup\(\) \{\n  fiacao\(\);\n  delay\(3000\);/.test(txt),
    'o setup não espera antes de rodar');
  assert.ok(/  programa\(\);\n  parar\(\);\n\}/.test(txt),
    'o setup não roda o programa uma vez');
  assert.ok(/void loop\(\) \{\n\}/.test(txt), 'o loop deveria estar vazio');
});

test('um programa sem giro não carrega girar()', () => {
  const txt = gerar([{ op: 'frente', segundos: 1 }]);
  assert.ok(!txt.includes('void girar('), 'sobrou a função de girar');
});

test('um programa sem espera não carrega esperar()', () => {
  const txt = gerar([{ op: 'frente', segundos: 1 }]);
  assert.ok(!txt.includes('void esperar('), 'sobrou a função de esperar');
});

test('quem anda para trás carrega andarTras, e só ele', () => {
  const txt = gerar([{ op: 'tras', segundos: 1 }]);
  assert.ok(txt.includes('void andarTras('), 'faltou andarTras');
  assert.ok(!txt.includes('void andarFrente('), 'sobrou andarFrente');
});

test('bloco desconhecido é erro, não silêncio', () => {
  assert.throws(() => gerar([{ op: 'voar' }]), /voar/);
});
