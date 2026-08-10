'use strict';
/* A interface precisa abrir num iPad 2 com iOS 9, cujo Safari não lê sintaxe
   moderna: ele dá erro ao *carregar* o arquivo, então uma única arrow function
   perdida mata a página inteira antes da primeira linha rodar.

   Isso já aconteceu duas vezes. Da primeira foram as arrow functions do
   Blockly; da segunda, nove métodos abreviados que passaram na conversão. Cada
   descoberta custou uma ida ao tablet. Este teste é o guarda que evita a
   terceira. */

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

test('comentário sobre const não conta como const', () => {
  const src = '/* nada de const aqui */\nvar x = 1;\n';
  const limpo = semTextoLivre(src);
  const regra = PROIBIDO.find((p) => p.nome === 'let / const');
  assert.strictEqual(limpo.match(regra.re), null);
});
