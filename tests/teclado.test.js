'use strict';

const test = require('node:test');
const assert = require('node:assert');

/* A caixa do teclado, de mentira. Não é o dom_falso.js: aquele existe para o
   Blockly montar SVG sem tela, e aqui o que se testa é justamente o que o
   teclado escreve nos elementos — um document que engole tudo não provaria
   nada. */
function elemento(id) {
  return {
    id,
    hidden: true,
    textContent: '',
    atributos: {},
    ouvintes: {},
    addEventListener(tipo, fn) {
      (this.ouvintes[tipo] = this.ouvintes[tipo] || []).push(fn);
    },
    getAttribute(nome) {
      return Object.prototype.hasOwnProperty.call(this.atributos, nome)
        ? this.atributos[nome] : null;
    },
    disparar(tipo, ev) {
      (this.ouvintes[tipo] || []).forEach((fn) => fn(ev || {}));
    },
  };
}

const IDS = ['teclado', 'teclado-valor', 'teclado-titulo', 'teclado-teclas',
             'teclado-nao', 'teclado-sim'];

function pagina() {
  const pecas = {};
  IDS.forEach((id) => { pecas[id] = elemento(id); });
  const doc = {
    ouvintes: {},
    getElementById: (id) => pecas[id] || null,
    addEventListener(tipo, fn) {
      (this.ouvintes[tipo] = this.ouvintes[tipo] || []).push(fn);
    },
    removeEventListener(tipo, fn) {
      this.ouvintes[tipo] = (this.ouvintes[tipo] || []).filter((f) => f !== fn);
    },
    teclar(key) {
      (this.ouvintes.keydown || []).slice()
        .forEach((fn) => fn({ key, preventDefault() {} }));
    },
  };
  globalThis.document = doc;
  Teclado.esquecer();
  return { doc, pecas };
}

const Teclado = require('../web/teclado.js');

/* Tocar numa tecla é um clique na grade, e o alvo é o botão: é assim que o
   teclado recebe de verdade, com um ouvinte só para as doze. */
function tocar(pecas, tecla) {
  pecas['teclado-teclas'].disparar('click', {
    target: { getAttribute: (n) => (n === 'data-tecla' ? tecla : null) },
  });
}

test('a caixa abre com o número que o bloco já tinha', () => {
  const { pecas } = pagina();
  Teclado.pedir({ valor: '3' }, () => {});
  assert.strictEqual(pecas.teclado.hidden, false);
  assert.strictEqual(pecas['teclado-valor'].textContent, '3');
});

/* Meio segundo é 0,5 na escola e 0.5 no Number(). A tradução mora nas bordas —
   e nas duas, senão o valor vai e não volta. */
test('o ponto do programa vira vírgula na tela, e volta ponto na resposta', () => {
  const { pecas } = pagina();
  let resposta;
  Teclado.pedir({ valor: '0.5' }, (t) => { resposta = t; });
  assert.strictEqual(pecas['teclado-valor'].textContent, '0,5');
  pecas['teclado-sim'].disparar('click');
  assert.strictEqual(resposta, '0.5');
});

test('o primeiro algarismo troca o número, como numa calculadora', () => {
  const { pecas } = pagina();
  let resposta;
  Teclado.pedir({ valor: '1' }, (t) => { resposta = t; });
  tocar(pecas, '5');
  assert.strictEqual(pecas['teclado-valor'].textContent, '5',
    'quem toca no 5 querendo cinco não espera quinze');
  tocar(pecas, '0');
  assert.strictEqual(pecas['teclado-valor'].textContent, '50');
  pecas['teclado-sim'].disparar('click');
  assert.strictEqual(resposta, '50');
});

test('o apagar tira um algarismo de cada vez', () => {
  const { pecas } = pagina();
  Teclado.pedir({ valor: '1' }, () => {});
  tocar(pecas, '1'); tocar(pecas, '2'); tocar(pecas, '3');
  tocar(pecas, 'apaga');
  assert.strictEqual(pecas['teclado-valor'].textContent, '12');
});

test('apagar tudo mostra zero em vez de uma caixa muda', () => {
  const { pecas } = pagina();
  Teclado.pedir({ valor: '7' }, () => {});
  tocar(pecas, 'apaga');
  assert.strictEqual(pecas['teclado-valor'].textContent, '0');
});

/* Vazio e desistir dão no mesmo: o bloco fica com o número que tinha. Aceitar
   o vazio escreveria nada dentro de um encaixe que precisa de número. */
test('dizer pronto com a caixa vazia mantém o número de antes', () => {
  const { pecas } = pagina();
  let resposta = 'nao chamou';
  Teclado.pedir({ valor: '7' }, (t) => { resposta = t; });
  tocar(pecas, 'apaga');
  pecas['teclado-sim'].disparar('click');
  assert.strictEqual(resposta, null);
});

test('a vírgula entra uma vez só', () => {
  const { pecas } = pagina();
  Teclado.pedir({ valor: '1' }, () => {});
  tocar(pecas, '2'); tocar(pecas, ','); tocar(pecas, ','); tocar(pecas, '5');
  assert.strictEqual(pecas['teclado-valor'].textContent, '2,5');
});

test('a vírgula sozinha começa em zero, e não num número solto', () => {
  const { pecas } = pagina();
  Teclado.pedir({ valor: '9' }, () => {});
  tocar(pecas, ','); tocar(pecas, '5');
  assert.strictEqual(pecas['teclado-valor'].textContent, '0,5');
});

test('o Deixa fecha sem trocar nada', () => {
  const { pecas } = pagina();
  let resposta = 'nao chamou';
  Teclado.pedir({ valor: '1' }, (t) => { resposta = t; });
  tocar(pecas, '9');
  pecas['teclado-nao'].disparar('click');
  assert.strictEqual(resposta, null);
  assert.strictEqual(pecas.teclado.hidden, true);
});

test('tocar no escuro em volta também desiste', () => {
  const { pecas } = pagina();
  let resposta = 'nao chamou';
  Teclado.pedir({ valor: '1' }, (t) => { resposta = t; });
  pecas.teclado.disparar('click', { target: pecas.teclado });
  assert.strictEqual(resposta, null);
  assert.strictEqual(pecas.teclado.hidden, true);
});

/* O teclado de verdade não é enfeite de acessibilidade: é ele que o Chromium
   dos testes usa, e é o que o professor no computador vai apertar. */
test('o teclado físico digita, confirma e desiste', () => {
  const { doc, pecas } = pagina();
  let resposta;
  Teclado.pedir({ valor: '1' }, (t) => { resposta = t; });
  doc.teclar('4'); doc.teclar('2');
  assert.strictEqual(pecas['teclado-valor'].textContent, '42');
  doc.teclar('Enter');
  assert.strictEqual(resposta, '42');

  Teclado.pedir({ valor: '1' }, (t) => { resposta = t; });
  doc.teclar('9');
  doc.teclar('Escape');
  assert.strictEqual(resposta, null);
});

test('o ponto do teclado físico também vira vírgula', () => {
  const { doc, pecas } = pagina();
  Teclado.pedir({ valor: '1' }, () => {});
  doc.teclar('2'); doc.teclar('.'); doc.teclar('5');
  assert.strictEqual(pecas['teclado-valor'].textContent, '2,5');
});

test('fechado, o teclado físico não mexe mais em nada', () => {
  const { doc, pecas } = pagina();
  Teclado.pedir({ valor: '1' }, () => {});
  doc.teclar('Escape');
  doc.teclar('7');
  assert.strictEqual(pecas['teclado-valor'].textContent, '1',
    'o ouvinte de teclas ficou pendurado depois de fechar');
});

test('o título diz o que se está trocando', () => {
  const { pecas } = pagina();
  Teclado.pedir({ valor: '1', titulo: 'Quantos segundos?' }, () => {});
  assert.strictEqual(pecas['teclado-titulo'].textContent, 'Quantos segundos?');
  Teclado.pedir({ valor: '1' }, () => {});
  assert.strictEqual(pecas['teclado-titulo'].textContent, 'Qual número?');
});

/* Sem a caixa na página o pedir devolve false, e é isso que deixa o campos.js
   cair no editor de sempre em vez de a criança tocar no número e nada
   acontecer — o defeito que trouxe este arquivo até aqui. */
test('sem a caixa na página, o pedir avisa em vez de engolir', () => {
  globalThis.document = { getElementById: () => null };
  Teclado.esquecer();
  let resposta = 'nao chamou';
  assert.strictEqual(Teclado.pedir({ valor: '1' }, (t) => { resposta = t; }), false);
  assert.strictEqual(resposta, null);
});
