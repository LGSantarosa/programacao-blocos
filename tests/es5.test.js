'use strict';
/* A interface precisa abrir num iPad 2 com iOS 9, cujo Safari não lê sintaxe
   moderna: ele dá erro ao *carregar* o arquivo, então uma única arrow function
   perdida mata a página inteira antes da primeira linha rodar.

   Isso já aconteceu duas vezes. Da primeira foram as arrow functions do
   Blockly; da segunda, nove métodos abreviados que passaram na conversão. Cada
   descoberta custou uma ida ao tablet. Este teste é o guarda que evita a
   terceira.

   **A régua é ES5, e não «o que o Safari 9 aguenta».** As duas foram
   consideradas: o Safari 9 tem for…of, propriedade abreviada e repeat, então
   pela segunda régua o código de hoje já passaria. Escolhida a primeira porque
   é uma linha que a máquina cobra sozinha — a outra depende de alguém lembrar
   de qual construção o iOS 9 tem, e foi exatamente essa lembrança que falhou
   duas vezes. Quem escrever ES6 num arquivo novo descobre aqui, em
   milissegundos, e não com a criança na frente do tablet.

   Preço pago em 2026-09-10: oito for…of, cinco objetos de propriedade
   abreviada e dois .repeat viraram ES5. Nenhum deles quebrava o iPad. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const WEB = path.join(__dirname, '..', 'web');

/* Só o nosso código: web/vendor/ é o Blockly, que já escolhemos na versão 8
   justamente por ser compilada em ES5. */
const ARQUIVOS = fs.readdirSync(WEB)
  .filter((f) => f.endsWith('.js'))
  .map((f) => path.join(WEB, f));

/* Tira comentários e strings antes de procurar sintaxe: a palavra "const" num
   comentário explicando por que não usamos const não é um defeito. */
function semTextoLivre(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

const PROIBIDO = [
  { nome: 'arrow function', re: /=>/,
    porque: 'o Safari do iOS 9 não tem; só chegou no iOS 10' },
  { nome: 'let / const', re: /(?<![\w.])(let|const)\s+[A-Za-z_$]/,
    porque: 'o Safari do iOS 9 não tem' },
  { nome: 'template literal', re: /`/,
    porque: 'suporte parcial no Safari 9; use concatenação' },
  { nome: 'class', re: /(?<![\w.])class\s+[A-Za-z_$]/,
    porque: 'suporte parcial no Safari 9; use protótipo' },
  /* Exclui as palavras-chave: "if (x) {" e "for (…) {" têm a mesma forma que um
     método abreviado e não são um. */
  { nome: 'método abreviado em objeto',
    /* A lista de parâmetros só tem identificadores e vírgulas. Exigir isso
       evita casar com "setTimeout(function () {", que tem a mesma forma. */
    re: /^[ \t]+(?!(?:if|for|while|switch|catch|function|return|else|do|try|with)\b)[A-Za-z_$][\w$]*[ \t]*\([A-Za-z0-9_$,\s]*\)[ \t]*\{/m,
    porque: 'escreva "nome: function () {}"' },
  { nome: 'spread / rest', re: /\.\.\./,
    porque: 'use Array.prototype.slice.call()' },
  { nome: 'exponenciação **', re: /\*\*/,
    porque: 'use Math.pow()' },
  { nome: 'for…of', re: /(?<![\w.])for\s*\([^;)]*?(?<![\w.$])of\b/,
    porque: 'use for (var i = 0; i < lista.length; i++)' },
  /* Pega o identificador solto dentro de chaves: "{ pronto," ou ", url }".
     Uma propriedade normal tem ":" logo depois do nome, e por isso não casa.
     Duas exigências, e cada uma custou um falso positivo: o trecho entre as
     chaves não pode ter parêntese (senão a lista de parâmetros de
     "function f(a, nivel, b)" casa), e a chave tem de vir depois de "=", ":",
     "(", ",", "[" ou "return" — ou seja, ser objeto e não corpo de função,
     senão um "var i, no," logo no começo do corpo casa. */
  { nome: 'propriedade abreviada',
    re: /(?:[=:(,[]|return)\s*\{(?:[^{}()]*,)?\s*[A-Za-z_$][\w$]*\s*[,}]/,
    porque: 'escreva "nome: nome"' },
  { nome: 'String.prototype.repeat', re: /\.repeat\s*\(/,
    porque: 'é ES6; use um laço (ver "vezes" em campos.js)' },
];

for (const arq of ARQUIVOS) {
  test(`${path.basename(arq)} é ES5, para abrir em tablet antigo`, () => {
    const limpo = semTextoLivre(fs.readFileSync(arq, 'utf8'));
    for (const p of PROIBIDO) {
      const achado = limpo.match(p.re);
      assert.strictEqual(achado, null,
        `${path.basename(arq)} usa ${p.nome} — ${p.porque}\n  em: ${
          achado ? achado[0].slice(0, 60) : ''}`);
    }
  });
}

test('a varredura enxerga os arquivos certos', () => {
  assert.ok(ARQUIVOS.length >= 9, `esperava ao menos 9 arquivos, achei ${ARQUIVOS.length}`);
  const nomes = ARQUIVOS.map((a) => path.basename(a));
  for (const obrigatorio of ['app.js', 'rede.js', 'blocos.js', 'niveis.js', 'campos.js']) {
    assert.ok(nomes.includes(obrigatorio), `faltou varrer ${obrigatorio}`);
  }
});

test('o detector realmente detecta, senão não guarda nada', () => {
  /* Um teste que não consegue falhar é pior que nenhum: aqui provamos que cada
     padrão pega o que promete pegar. */
  const amostras = {
    'arrow function': 'var f = function () { return (x) => x; };',
    'let / const': 'const a = 1;',
    'template literal': 'var s = `oi`;',
    'class': 'class Foo {}',
    'método abreviado em objeto': 'var o = {\n  metodo(a) {\n  }\n};',
    'spread / rest': 'var a = [...b];',
    'exponenciação **': 'var a = 2 ** 3;',
    'for…of': 'for (var x of lista) { y(x); }',
    'propriedade abreviada': 'var api = { tocar, mudo };',
    'String.prototype.repeat': "var s = 'a'.repeat(3);",
  };
  for (const p of PROIBIDO) {
    const amostra = amostras[p.nome];
    assert.ok(amostra, `sem amostra para "${p.nome}"`);
    assert.ok(p.re.test(semTextoLivre(amostra)),
      `o padrão de "${p.nome}" não pegou a própria amostra`);
  }
});

test('chamar função com callback não conta como método abreviado', () => {
  /* "setTimeout(function () {" tem a mesma forma de um método abreviado, e
     marcá-lo faria o guarda gritar em código correto — até virar ruído que
     todo mundo ignora. */
  const regra = PROIBIDO.find((p) => p.nome === 'método abreviado em objeto');
  for (const inocente of [
    '  setTimeout(function () {\n  }, 10);',
    '  ws.addChangeListener(function (e) {\n  });',
    '  if (x) {',
    '  for (var i = 0; i < 3; i++) {',
  ]) {
    assert.strictEqual(semTextoLivre(inocente).match(regra.re), null,
      `falso positivo em: ${inocente.trim()}`);
  }
  /* mas o de verdade continua sendo pego */
  assert.ok(regra.re.test('  metodo(a, b) {\n  }'));
});

test('o padrão da propriedade abreviada não grita em código honesto', () => {
  /* Este é o padrão mais largo dos três novos, e um guarda que grita em código
     correto vira ruído que todo mundo ignora — que é o defeito que esta
     rodada veio consertar, não repetir. */
  const regra = PROIBIDO.find((p) => p.nome === 'propriedade abreviada');
  for (const inocente of [
    'var api = { tocar: tocar, mudo: mudo };',
    'var o = { lista: [1, 2], n: 3 };',
    'switch (t) {\n  case T_POSE:\n    break;\n}',
    'function f() {\n  return;\n}',
    'if (x) {\n  g();\n}',
    'var vazio = {};',
    'var f = function () { return h(a, b); };',
    'function f(a, nivel, b) {\n  g();\n}',
    'function f() {\n  var i, no, x;\n  return i;\n}',
    'try {\n  f();\n} catch (e) {\n  var a, b;\n}',
  ]) {
    assert.strictEqual(semTextoLivre(inocente).match(regra.re), null,
      `falso positivo em: ${inocente}`);
  }
  assert.ok(regra.re.test('var api = { conectar, url };'));
  assert.ok(regra.re.test('return {\n  pronto,\n  carregar: f\n};'));
});

test('o padrão do for…of não confunde com um for comum', () => {
  const regra = PROIBIDO.find((p) => p.nome === 'for…of');
  for (const inocente of [
    'for (var i = 0; i < lista.length; i++) {',
    'for (var i = 0, n = fim.of; i < n; i++) {',
    'for (var k in obj) {',
  ]) {
    assert.strictEqual(semTextoLivre(inocente).match(regra.re), null,
      `falso positivo em: ${inocente}`);
  }
  assert.ok(regra.re.test('for (var o of obstaculos) {'));
});

test('comentário sobre const não conta como const', () => {
  const src = '/* nada de const aqui */\nvar x = 1;\n';
  const limpo = semTextoLivre(src);
  const regra = PROIBIDO.find((p) => p.nome === 'let / const');
  assert.strictEqual(limpo.match(regra.re), null);
});
