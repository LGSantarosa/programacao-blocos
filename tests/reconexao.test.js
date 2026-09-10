'use strict';
/* A regra que este arquivo guarda é «uma queda, um agendamento». Ela existe
   porque o contrário se paga em conexões que se multiplicam: um soquete velho
   acorda depois da troca de alvo, abre uma conexão a mais, e essa abre outra ao
   morrer. Com o app Android trocando de alvo em pleno voo, isso deixou de ser
   hipótese. */

const test = require('node:test');
const assert = require('node:assert');
const Reconexao = require('../web/reconexao.js');

/* Relógio de mentira: guarda o que foi agendado e só dispara quando mandado. */
function relogio() {
  const fila = [];
  return {
    agendar: (f, ms) => { fila.push({ f, ms }); },
    fila,
    correr: () => { const c = fila.splice(0); c.forEach((x) => x.f()); },
  };
}

test('a conexão nova vira a atual, e a velha vira passado', () => {
  const r = Reconexao.criar({ agendar: relogio().agendar });
  const velha = r.nova();
  assert.strictEqual(velha.souAtual(), true);
  const nova = r.nova();
  assert.strictEqual(velha.souAtual(), false);
  assert.strictEqual(nova.souAtual(), true);
});

test('uma queda agenda exatamente uma tentativa', () => {
  const c = relogio();
  const r = Reconexao.criar({ agendar: c.agendar });
  const conexao = r.nova();

  assert.strictEqual(conexao.aoCair(() => {}), true);
  assert.strictEqual(c.fila.length, 1);
});

test('a queda de uma conexão velha não agenda nada', () => {
  /* Este é o defeito inteiro: sem esta linha, a queda do soquete velho abre
     uma conexão a mais, que abre outra ao morrer. */
  const c = relogio();
  const r = Reconexao.criar({ agendar: c.agendar });
  const velha = r.nova();
  r.nova();                       /* trocou de alvo */

  assert.strictEqual(velha.aoCair(() => { throw new Error('não devia'); }), false);
  assert.strictEqual(c.fila.length, 0);
});

test('a tentativa agendada desiste se o alvo mudou enquanto ela dormia', () => {
  const c = relogio();
  const r = Reconexao.criar({ agendar: c.agendar });
  const conexao = r.nova();

  let tentou = 0;
  conexao.aoCair(() => { tentou++; });
  r.nova();                       /* a troca acontece durante o sono */
  c.correr();
  assert.strictEqual(tentou, 0, 'acordou velha: não deve reconectar');
});

test('sem troca durante o sono, a tentativa acontece', () => {
  const c = relogio();
  const r = Reconexao.criar({ agendar: c.agendar });
  const conexao = r.nova();

  let tentou = 0;
  conexao.aoCair(() => { tentou++; });
  c.correr();
  assert.strictEqual(tentou, 1);
});

test('duas quedas seguidas da mesma conexão agendam duas — e é o esperado', () => {
  /* A regra é uma queda, um agendamento; quem garante que a queda só chega uma
     vez por soquete é o rede.js, e tem teste próprio lá. */
  const c = relogio();
  const r = Reconexao.criar({ agendar: c.agendar });
  const conexao = r.nova();
  conexao.aoCair(() => {});
  conexao.aoCair(() => {});
  assert.strictEqual(c.fila.length, 2);
});

test('o atraso padrão é 1,5 s, e dá para trocar', () => {
  const c = relogio();
  Reconexao.criar({ agendar: c.agendar }).nova().aoCair(() => {});
  assert.strictEqual(c.fila[0].ms, Reconexao.ATRASO_MS);
  assert.strictEqual(Reconexao.ATRASO_MS, 1500);

  const c2 = relogio();
  Reconexao.criar({ agendar: c2.agendar, atrasoMs: 10 }).nova().aoCair(() => {});
  assert.strictEqual(c2.fila[0].ms, 10);
});

test('sem relógio de fora, usa o do navegador', () => {
  /* Não dá para provar o setTimeout real sem esperar; o que se prova aqui é que
     o padrão existe e não explode. */
  const r = Reconexao.criar();
  assert.strictEqual(r.atrasoMs, 1500);
  assert.strictEqual(typeof r.nova().souAtual, 'function');
});
