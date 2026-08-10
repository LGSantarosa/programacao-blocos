'use strict';
/* DOM mínimo para o Blockly rodar headless no node --test.
   O Blockly 8 é compilado em ES5 — é o que faz a página abrir num iPad 2 — mas
   em troca ele monta SVG ao criar bloco, mesmo num workspace sem tela. Isto dá
   a ele o suficiente para não estourar.

   Não é um navegador: qualquer teste que dependa de medida, layout ou evento de
   ponteiro pertence a tests/navegador.test.js, que dirige um Chromium de
   verdade. Aqui só se testa lógica de bloco e de campo. */

function elemento() {
  return {
    style: {},
    childNodes: [],
    classList: {
      add() {}, remove() {}, toggle() {}, contains() { return false; },
    },
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    appendChild(f) { return f; }, removeChild(f) { return f; },
    insertBefore(f) { return f; },
    addEventListener() {}, removeEventListener() {},
    getBBox() { return { x: 0, y: 0, width: 0, height: 0 }; },
    querySelector() { return null; }, querySelectorAll() { return []; },
  };
}

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElementNS() { return elemento(); },
    createElement() { return elemento(); },
    createTextNode() { return elemento(); },
    getElementsByTagName() { return []; },
    getElementById() { return null; },
    head: elemento(),
    body: elemento(),
    documentElement: elemento(),
    addEventListener() {},
  };
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

module.exports = { elemento };
