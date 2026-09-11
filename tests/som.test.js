'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Som = require('../web/som.js');

test('existe um som para cada evento da interface', () => {
  for (const nome of ['play', 'comando', 'batida', 'fim']) {
    assert.ok(Array.isArray(Som.SONS[nome]), `faltou o som "${nome}"`);
    assert.ok(Som.SONS[nome].length > 0, `o som "${nome}" está vazio`);
  }
});

test('toda nota tem frequência audível e duração curta', () => {
  for (const [nome, notas] of Object.entries(Som.SONS)) {
    for (const n of notas) {
      assert.ok(n.hz >= 100 && n.hz <= 4000, `${nome}: ${n.hz} Hz fora da faixa`);
      assert.ok(n.ms > 0 && n.ms <= 400, `${nome}: ${n.ms} ms fora da faixa`);
    }
  }
});

test('o som de fim sobe, que é o que soa como vitória', () => {
  const hz = Som.SONS.fim.map((n) => n.hz);
  assert.strictEqual(hz.length, 3);
  assert.ok(hz[0] < hz[1] && hz[1] < hz[2], `esperava subida, veio ${hz}`);
});

test('a batida é mais grave que o comando', () => {
  assert.ok(Som.SONS.batida[0].hz < Som.SONS.comando[0].hz);
});

test('tocar um som que não existe não estoura', () => {
  assert.doesNotThrow(() => Som.tocar('inexistente'));
});

test('alternarMudo inverte o estado', () => {
  const antes = Som.mudo();
  assert.strictEqual(Som.alternarMudo(), !antes);
  assert.strictEqual(Som.mudo(), !antes);
  Som.alternarMudo();
  assert.strictEqual(Som.mudo(), antes);
});

/* ---------- a voz que descreve os blocos ---------- */

/* Um dublê no lugar do speechSynthesis do navegador. Não é mock de
   conveniência: é a única forma de afirmar o que sai pelo alto-falante sem um
   navegador por perto, e o que os testes checam é o que o código pede à API —
   a língua, o cancelamento, o silêncio no mudo. */
function dublê() {
  const falas = [];
  globalThis.SpeechSynthesisUtterance = function (texto) { this.text = texto; };
  globalThis.speechSynthesis = {
    cancel: () => falas.push('CANCELA'),
    speak: (u) => falas.push(u.lang + ': ' + u.text),
    /* A propriedade existe na interface do navegador mesmo sem ninguém
       escutando — é por ela que o código descobre se dá para ser avisado. */
    onvoiceschanged: null,
    getVoices: () => [],
  };
  return falas;
}

function semDublê() {
  delete globalThis.speechSynthesis;
  delete globalThis.SpeechSynthesisUtterance;
}

test('falar diz o texto em português do Brasil', () => {
  const falas = dublê();
  try {
    Som.falar('andar para frente');
    assert.ok(falas.includes('pt-BR: andar para frente'),
      `esperava a fala em pt-BR, veio ${JSON.stringify(falas)}`);
  } finally { semDublê(); }
});

/* Arrastar três peças seguidas fala a última, não enfileira três: a criança
   ouviria o nome de uma peça que já largou. */
test('falar corta a fala anterior antes de começar a próxima', () => {
  const falas = dublê();
  try {
    Som.falar('andar para frente');
    Som.falar('girar para a direita');
    assert.deepStrictEqual(falas, ['CANCELA', 'pt-BR: andar para frente',
                                   'CANCELA', 'pt-BR: girar para a direita']);
  } finally { semDublê(); }
});

/* O botão do alto-falante é um só, e para quem aperta "mudo" é mudo. */
test('no mudo a voz cala junto com os bipes', () => {
  const falas = dublê();
  Som.alternarMudo();
  try {
    Som.falar('andar para frente');
    assert.deepStrictEqual(falas, [], 'a voz falou com o som desligado');
  } finally { Som.alternarMudo(); semDublê(); }
});

/* Mesma regra do tocar(): navegador sem a API fica quieto e nunca derruba a
   página. Num aparelho Android sem TTS instalado é exatamente este o caso. */
test('sem speechSynthesis a voz fica quieta em vez de estourar', () => {
  semDublê();
  assert.doesNotThrow(() => Som.falar('andar para frente'));
});

test('falar sem texto não pede nada ao navegador', () => {
  const falas = dublê();
  try {
    Som.falar(null);
    Som.falar('');
    assert.deepStrictEqual(falas, []);
  } finally { semDublê(); }
});

/* ---------- saber se este aparelho tem voz ---------- */

/* Sem voz instalada o speak() vira silêncio sem erro nenhum, e a criança não
   tem como distinguir isso de defeito. Quem pergunta é o painel de Ajustes,
   para poder dizer ao adulto por que os blocos não falam. */
test('temVoz é falso quando o navegador não tem a API', () => {
  semDublê();
  assert.strictEqual(Som.temVoz(), false);
});

/* O caso desta máquina: o snap do Chromium não carrega a libspeechd, então a
   API existe e a lista de vozes volta vazia. */
test('temVoz é falso quando a API existe mas não há voz instalada', () => {
  dublê();
  globalThis.speechSynthesis.getVoices = () => [];
  try {
    assert.strictEqual(Som.temVoz(), false);
  } finally { semDublê(); }
});

test('temVoz é verdadeiro quando há voz instalada', () => {
  dublê();
  globalThis.speechSynthesis.getVoices = () => [{ lang: 'pt-BR', name: 'Portuguese' }];
  try {
    assert.strictEqual(Som.temVoz(), true);
  } finally { semDublê(); }
});

/* A lista de vozes carrega assíncrona: no primeiro instante da página ela vem
   vazia mesmo num aparelho que fala. Quem mostra o aviso precisa saber que a
   resposta pode mudar, senão avisa que não há voz num aparelho que tem. */
test('aoMudarVozes avisa quando a lista termina de carregar', () => {
  dublê();
  globalThis.speechSynthesis.getVoices = () => [];
  try {
    let avisos = 0;
    Som.aoMudarVozes(() => { avisos++; });
    globalThis.speechSynthesis.onvoiceschanged();
    assert.strictEqual(avisos, 1, 'o aviso não foi chamado quando as vozes chegaram');
  } finally { semDublê(); }
});
