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

test('todo módulo de web/ entra na página, e antes do app.js', () => {
  /* O app.js usa os outros como variáveis globais que o navegador só tem se a
     tag <script> estiver lá. Esquecer a tag não quebra teste nenhum de mesa —
     quebra a página inteira, em branco, no tablet. Aconteceu de perto quando o
     tentativas.js e o reconexao.js saíram do app.js. */
  const WEB = path.join(__dirname, '..', 'web');
  const modulos = fs.readdirSync(WEB)
    .filter((f) => f.endsWith('.js') && f !== 'app.js');
  const posApp = HTML.indexOf('src="app.js"');
  assert.ok(posApp > 0, 'a página tem de carregar o app.js');

  for (const m of modulos) {
    const pos = HTML.indexOf('src="' + m + '"');
    assert.ok(pos > 0, `faltou <script src="${m}"> no index.html`);
    assert.ok(pos < posApp, `${m} tem de vir antes do app.js`);
  }
});
