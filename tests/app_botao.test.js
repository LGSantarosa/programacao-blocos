'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(
  path.join(__dirname, '..', 'web', 'index.html'), 'utf8');
const APP = fs.readFileSync(
  path.join(__dirname, '..', 'web', 'app.js'), 'utf8');

test('o botão de procurar o robô existe e nasce escondido', () => {
  assert.match(HTML, /id="procurar"[^>]*hidden/);
});

test('o botão só se revela quando window.Android existe', () => {
  assert.match(APP, /typeof Android !== 'undefined'/);
});

test('o gesto chama Android.procurarRobo', () => {
  assert.match(APP, /Android\.procurarRobo\(\)/);
});

test('dentro do app, o download passa pelo Kotlin e não pelo Blob', () => {
  assert.match(APP, /Android\.salvarIno\(/);
});

test('a página sabe dizer se está no ensaio ou no robô', () => {
  assert.match(APP, /aoTrocarDeRobo/);
});

test('existe como voltar para o ensaio', () => {
  assert.match(APP, /Android\.voltarParaEnsaio\(\)/);
});
