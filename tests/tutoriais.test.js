'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Tutoriais = require('../web/tutoriais.js');
const Niveis = require('../web/niveis.js');

test('todo assunto tem explicação e exemplo', () => {
  for (const topico of Tutoriais.TOPICOS) {
    assert.ok(topico.nivel && topico.categoria && topico.blocos.length,
      `${topico.titulo} precisa dizer onde e quando existe`);
    assert.ok(topico.passos.length > 0,
      `${topico.titulo} precisa ensinar pelo menos uma ideia`);
    for (const passo of topico.passos) {
      assert.ok(passo.titulo && passo.texto, 'todo passo precisa se explicar');
      assert.ok(passo.desenho.length > 0, 'todo passo precisa mostrar um exemplo');
    }
  }
});

test('Aprender mostra somente os blocos disponíveis e cobre todos eles', () => {
  for (const nivel of Niveis.LISTA) {
    const ensinados = Tutoriais.disponiveis(nivel)
      .flatMap((topico) => topico.blocos);
    const semRepetir = [...new Set(ensinados)].sort();
    const disponiveis = [...Niveis.definicao(nivel).blocos].sort();
    assert.deepStrictEqual(semRepetir, disponiveis,
      `os tutoriais do ${Niveis.NOMES[nivel]} precisam acompanhar sua gaveta`);
  }
});

test('os assuntos entram aos poucos e o Avançado vira a consulta completa', () => {
  const quantidades = Niveis.LISTA.map(
    (nivel) => Tutoriais.disponiveis(nivel).length);
  assert.deepStrictEqual(quantidades, [2, 5, 7, Tutoriais.TOPICOS.length]);
  assert.strictEqual(Tutoriais.disponivel('caixas', 'grande'), false);
  assert.strictEqual(Tutoriais.disponivel('caixas', 'gigante'), true);
});

test('os dois assuntos do Iniciante têm animação e narração sem texto obrigatório', () => {
  const assuntos = Tutoriais.disponiveis('pequeno');
  assert.deepStrictEqual(assuntos.map((t) => t.id), ['mover', 'repetir']);
  for (const assunto of assuntos) {
    assert.ok(assunto.animacao && assunto.animacao.tipo,
      `${assunto.titulo} ficou sem animação`);
    assert.ok(assunto.animacao.fala,
      `${assunto.titulo} ficou sem narração`);
  }
});

test('Caixas explica criar, guardar, mudar e ler sem confundir as operações', () => {
  const texto = Tutoriais.buscar('caixas').passos
    .map((p) => `${p.titulo} ${p.texto} ${p.dica}`).join('\n').toLowerCase();
  for (const ideia of ['criar caixa', 'guardar', 'mudar', 'soma', 'lê', 'não muda']) {
    assert.ok(texto.includes(ideia), `faltou explicar “${ideia}”`);
  }
  assert.ok(texto.includes('ele sai'),
    'guardar precisa dizer que substitui o valor anterior');
});

test('Meus blocos separa ensinar de usar e chega às entradas', () => {
  const texto = Tutoriais.buscar('meus-blocos').passos
    .map((p) => `${p.titulo} ${p.texto} ${p.dica}`).join('\n').toLowerCase();
  for (const ideia of ['ensinar', 'play', 'receita', 'entrada', '➕', 'cada uso']) {
    assert.ok(texto.includes(ideia), `faltou explicar “${ideia}”`);
  }
  assert.ok(texto.includes('fora da pilha do play'),
    'precisa evitar o erro comum de encaixar a definição no PLAY');
});

test('buscar recusa assunto que não existe', () => {
  assert.strictEqual(Tutoriais.buscar('inventado'), null);
});
