/* FieldBolinhas: o mesmo campo numérico do "repetir", desenhado como bolinhas
   em vez de algarismo. É o que permite o bloco existir no nível Pequeno sem
   virar um bloco diferente. */
(function (raiz) {
  'use strict';

  const MIN = 2, MAX = 5;

  function paraBolinhas(n) {
    let v = Math.round(Number(n));
    if (!isFinite(v)) v = MIN;
    if (v < MIN) v = MIN;
    if (v > MAX) v = MAX;
    return '●'.repeat(v) + '○'.repeat(MAX - v);
  }

  /* Só faz sentido no navegador, onde Blockly existe. */
  function registrar() {
    if (typeof Blockly === 'undefined') return false;
    if (Blockly.fieldRegistry.hasOwnProperty &&
        raiz.__bolinhasRegistrado) return true;

    class FieldBolinhas extends Blockly.FieldNumber {
      constructor(valor, opcoes) {
        super(valor, MIN, MAX, 1, undefined, opcoes);
      }
      static fromJson(opcoes) {
        return new FieldBolinhas(opcoes.value, opcoes);
      }
      /* É isto que troca o algarismo pelas bolinhas na tela. */
      getText() {
        return paraBolinhas(this.getValue());
      }
      /* Clicar avança a quantidade em vez de abrir teclado numérico —
         criança de 4 anos não digita. */
      showEditor_() {
        const v = Math.round(Number(this.getValue()));
        this.setValue(v >= MAX ? MIN : v + 1);
      }
    }

    Blockly.fieldRegistry.register('field_bolinhas', FieldBolinhas);
    raiz.__bolinhasRegistrado = true;
    return true;
  }

  const api = { paraBolinhas, registrar, MIN, MAX };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Campos = api;
})(typeof self !== 'undefined' ? self : globalThis);
