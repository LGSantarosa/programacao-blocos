/* FieldBolinhas: o mesmo campo numérico do "repetir", desenhado como bolinhas
   em vez de algarismo. É o que permite o bloco existir no nível Pequeno sem
   virar um bloco diferente. */
(function (raiz) {
  'use strict';

  /* A faixa é a da v1: o nível Grande precisa repetir muitas vezes. O que muda
     por nível é só o desenho. */
  var MIN = 1, MAX = 100;

  /* Precisa bater com COR_MOVIMENTO em web/blocos.js. */
  var COR_NUMERO = '#0050f0';
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

    /* O editor de número passa a ser o teclado da página.

       Não é enfeite: em aparelho de toque o showEditor_ do Blockly abre um
       window.prompt, e no WebView do app o prompt devolve null sem mostrar
       nada. Tocar no número não fazia coisa alguma — o defeito que obrigava a
       encaixar uma conta (2 × 3) para chegar a 6 segundos.

       Trocado aqui, e não só no aparelho: um caminho só para telefone, tablet e
       computador é um caminho só para acertar, e é o que o Chromium dos testes
       consegue exercitar. */
    var TITULOS = {
      SEG: 'Quantos segundos?',
      GRAUS: 'Quantos graus?',
      CM: 'Quantos centímetros?',
      N: 'Quantas vezes?',
    };

    /* O nome do encaixe mora no bloco de cima, e não no shadow: o campo aqui
       dentro se chama NUM em todos eles. É subindo uma peça que se descobre se
       este número é segundo, grau ou centímetro. */
    function tituloDoCampo(campo) {
      var bloco = campo.getSourceBlock && campo.getSourceBlock();
      if (!bloco) return null;
      var nome = campo.name;
      if (bloco.outputConnection && bloco.outputConnection.targetConnection) {
        var encaixe = bloco.outputConnection.targetConnection.getParentInput();
        if (encaixe) nome = encaixe.name;
      }
      return TITULOS[nome] || null;
    }

    /* O teclado se prepara agora, e não na primeira vez que abrir: é aqui que
       ele pendura o ouvinte que reconhece o toque fantasma, e esse ouvinte
       precisa existir antes do primeiro dedo na tela. Ver web/teclado.js. */
    if (typeof Teclado !== 'undefined' && Teclado.preparar) Teclado.preparar();

    Blockly.FieldNumber.prototype.showEditor_ = function () {
      var campo = this;
      if (typeof Teclado === 'undefined' ||
          !Teclado.pedir({ valor: campo.getText(), titulo: tituloDoCampo(campo) },
                         function (texto) {
                           if (texto === null) return;
                           campo.setValue(campo.getValueFromEditorText_(texto));
                         })) {
        /* Sem a caixa na página — o diagnóstico do iPad, um teste de campo sem
           HTML — o editor de sempre ainda é melhor que nada. */
        Blockly.FieldTextInput.prototype.showEditor_.call(campo);
      }
    };

    /* Dois blocos de número que existem só para morar dentro de um encaixe.
       Enquanto ninguém solta uma conta em cima, eles desenham e se comportam
       como o campo que eram antes — é isso que deixa os três níveis de baixo
       ficarem exatamente como estavam.

       A cor é a do movimento para o shadow sumir dentro da peça: um retângulo
       de outra cor no meio do bloco pareceria uma peça encaixada, e não um
       número. */
    Blockly.defineBlocksWithJsonArray([
      {
        type: 'numero',
        message0: '%1',
        args0: [{ type: 'field_number', name: 'NUM', value: 1 }],
        output: 'Number',
        colour: COR_NUMERO,
      },
      {
        /* O repetir desenha bolinhas para quem não lê algarismo, e o desenho é
           do campo — então o shadow dele é outro tipo de bloco. */
        type: 'numero_bolinhas',
        message0: '%1',
        args0: [{ type: 'field_bolinhas', name: 'NUM', value: 4 }],
        output: 'Number',
        colour: COR_NUMERO,
      },
    ]);

    raiz.__bolinhasRegistrado = true;
    return true;
  }

  var api = { paraBolinhas, registrar, MIN, MAX, CASAS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Campos = api;
})(typeof self !== 'undefined' ? self : globalThis);
