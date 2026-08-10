/* FieldBolinhas: o mesmo campo numérico do "repetir", desenhado como bolinhas
   em vez de algarismo. É o que permite o bloco existir no nível Pequeno sem
   virar um bloco diferente. */
(function (raiz) {
  'use strict';

  /* A faixa é a da v1: o nível Grande precisa repetir muitas vezes. O que muda
     por nível é só o desenho. */
  var MIN = 1, MAX = 100;
  /* Cinco casas fixas: as vazias mostram à criança que dá para pedir mais, e a
     largura constante evita o bloco pular de tamanho a cada clique. */
  var CASAS = 5;

  function paraBolinhas(n) {
    var v = Math.round(Number(n));
    if (!isFinite(v) || v < 1) return '●' + '○'.repeat(CASAS - 1);
    if (v > CASAS) return String(v);   /* bolinhas não representam doze */
    return '●'.repeat(v) + '○'.repeat(CASAS - v);
  }

  /* Só faz sentido no navegador, onde Blockly existe. */
  function registrar() {
    if (typeof Blockly === 'undefined') return false;
    if (raiz.__bolinhasRegistrado) return true;

    /* Protótipo em vez de class: o Safari do iOS 9 tem class só pela metade,
       e ela herdaria de uma função ES5 do Blockly. Isto funciona nos dois. */
    function FieldBolinhas(valor, opcoes) {
      Blockly.FieldNumber.call(this, valor, MIN, MAX, 1, undefined, opcoes);
      this.modoBolinhas = true;
    }
    FieldBolinhas.prototype = Object.create(Blockly.FieldNumber.prototype);
    FieldBolinhas.prototype.constructor = FieldBolinhas;

    FieldBolinhas.fromJson = function (opcoes) {
      return new FieldBolinhas(opcoes.value, opcoes);
    };

    /* O nível decide o desenho; o valor é o mesmo nos dois modos. */
    FieldBolinhas.prototype.setModoBolinhas = function (ligado) {
      this.modoBolinhas = !!ligado;
      if (this.sourceBlock_ && this.sourceBlock_.rendered) this.forceRerender();
    };

    FieldBolinhas.prototype.getText = function () {
      return this.modoBolinhas ? paraBolinhas(this.getValue())
                               : String(this.getValue());
    };

    /* No modo bolinhas, clicar avança a quantidade em vez de abrir teclado
       numérico — criança de 4 anos não digita. No modo número, o editor
       normal do Blockly serve.
       Um valor que não cabe em bolinhas também não se edita por cliques:
       avançar de um em um seria interminável e voltar para 1 apagaria o
       número que a criança escolheu num nível acima. */
    FieldBolinhas.prototype.showEditor_ = function () {
      if (!this.modoBolinhas || Number(this.getValue()) > CASAS) {
        return Blockly.FieldNumber.prototype.showEditor_.call(this);
      }
      var v = Math.round(Number(this.getValue()));
      this.setValue(v >= CASAS ? 1 : v + 1);
    };

    Blockly.fieldRegistry.register('field_bolinhas', FieldBolinhas);
    raiz.__bolinhasRegistrado = true;
    return true;
  }

  var api = { paraBolinhas, registrar, MIN, MAX, CASAS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Campos = api;
})(typeof self !== 'undefined' ? self : globalThis);
