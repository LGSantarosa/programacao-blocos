'use strict';
/* A contagem de tentativas decide quando a ajuda aparece sem ser pedida — que
   é o momento mais delicado da tela: cedo demais é entregar a resposta a quem
   estava explorando, tarde demais é deixar a criança travada. Enquanto morava
   no app.js, só o Chromium alcançava esta regra. */

const test = require('node:test');
const assert = require('node:assert');
const Tentativas = require('../web/tentativas.js');

const PROGRAMA = true, PILHA_SOLTA = false;
const NAO_CUMPRIU = false, CUMPRIU = true;

/* Uma execução inteira: liga e desliga. Devolve se destravou a ajuda. */
function rodou(t, cumpriu, ehPrograma) {
  t.mudouRodando(false, true, cumpriu, ehPrograma);
  return t.mudouRodando(true, false, cumpriu, ehPrograma);
}

test('rodar e não chegar conta uma tentativa', () => {
  const t = Tentativas.criar(3);
  rodou(t, NAO_CUMPRIU, PROGRAMA);
  assert.strictEqual(t.quantas(), 1);
  assert.strictEqual(t.ajuda(), false);
});

test('começar a rodar não conta nada — só terminar conta', () => {
  const t = Tentativas.criar(3);
  t.mudouRodando(false, true, NAO_CUMPRIU, PROGRAMA);
  assert.strictEqual(t.quantas(), 0);
});

test('a ajuda aparece na tentativa do limite, e diz que apareceu', () => {
  const t = Tentativas.criar(3);
  assert.strictEqual(rodou(t, NAO_CUMPRIU, PROGRAMA), false);
  assert.strictEqual(rodou(t, NAO_CUMPRIU, PROGRAMA), false);
  assert.strictEqual(rodou(t, NAO_CUMPRIU, PROGRAMA), true, 'a terceira destrava');
  assert.strictEqual(t.ajuda(), true);
});

test('destravou uma vez, continua destravada — e não avisa duas', () => {
  const t = Tentativas.criar(2);
  rodou(t, NAO_CUMPRIU, PROGRAMA);
  assert.strictEqual(rodou(t, NAO_CUMPRIU, PROGRAMA), true);
  assert.strictEqual(rodou(t, NAO_CUMPRIU, PROGRAMA), false, 'não avisa de novo');
  assert.strictEqual(t.ajuda(), true, 'mas a ajuda segue à mão');
});

test('quem já cumpriu a missão não acumula fracasso', () => {
  const t = Tentativas.criar(3);
  rodou(t, CUMPRIU, PROGRAMA);
  rodou(t, CUMPRIU, PROGRAMA);
  rodou(t, CUMPRIU, PROGRAMA);
  assert.strictEqual(t.quantas(), 0);
  assert.strictEqual(t.ajuda(), false);
});

test('pilha solta rodada com o dedo é exploração, não tentativa', () => {
  /* Contá-la ofereceria o gabarito a quem está se divertindo, dizendo que
     fracassou. */
  const t = Tentativas.criar(2);
  rodou(t, NAO_CUMPRIU, PILHA_SOLTA);
  rodou(t, NAO_CUMPRIU, PILHA_SOLTA);
  rodou(t, NAO_CUMPRIU, PILHA_SOLTA);
  assert.strictEqual(t.quantas(), 0);
  assert.strictEqual(t.ajuda(), false);
});

test('exploração no meio não atrapalha a conta das tentativas', () => {
  const t = Tentativas.criar(2);
  rodou(t, NAO_CUMPRIU, PROGRAMA);
  rodou(t, NAO_CUMPRIU, PILHA_SOLTA);
  assert.strictEqual(t.quantas(), 1);
  assert.strictEqual(rodou(t, NAO_CUMPRIU, PROGRAMA), true);
});

test('trocar de fase zera a conta', () => {
  /* As tentativas eram de uma fase; na fase nova a criança começa inteira. */
  const t = Tentativas.criar(2);
  rodou(t, NAO_CUMPRIU, PROGRAMA);
  t.zerar();
  assert.strictEqual(t.quantas(), 0);
  assert.strictEqual(t.ajuda(), false);
});

test('a queda da conexão no meio da execução não conta tentativa', () => {
  /* O app.js zera o "rodando" ao cair a conexão sem passar por aqui; se um dia
     passar, terminar sem ter começado não pode contar. */
  const t = Tentativas.criar(2);
  assert.strictEqual(t.mudouRodando(false, false, NAO_CUMPRIU, PROGRAMA), false);
  assert.strictEqual(t.quantas(), 0);
});

test('o limite vem de fora, e é ele que manda', () => {
  const t = Tentativas.criar(1);
  assert.strictEqual(rodou(t, NAO_CUMPRIU, PROGRAMA), true, 'limite 1 destrava na primeira');
});
