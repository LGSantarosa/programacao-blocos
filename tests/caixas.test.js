'use strict';
/* O lugar de cada caixa na VM. Tudo aqui é regra de endereço, e endereço
   errado não dá erro: dá uma caixa mostrando o número de outra. */

const test = require('node:test');
const assert = require('node:assert');
const Caixas = require('../web/caixas.js');

function vazio() { return Caixas.importar(null); }

test('criar dá o menor lugar livre, e criar de novo o mesmo id não gasta outro', () => {
  const m = vazio();
  assert.strictEqual(m.criada('a'), 0);
  assert.strictEqual(m.criada('b'), 1);
  assert.strictEqual(m.criada('a'), 0);
  assert.strictEqual(m.lugarDe('b'), 1);
  assert.strictEqual(m.lugarDe('nada'), null);
});

test('apagar libera o lugar para a próxima', () => {
  const m = vazio();
  m.criada('a'); m.criada('b');
  m.apagada('a');
  assert.strictEqual(m.lugarDe('a'), null);
  assert.strictEqual(m.criada('c'), 0);
});

test('apagar e desfazer volta ao mesmo lugar', () => {
  const m = vazio();
  m.criada('a'); m.criada('b'); m.criada('c');
  m.apagada('b');
  assert.strictEqual(m.criada('b'), 1);
});

test('desfazer depois que outra caixa tomou o lugar cai no menor livre', () => {
  const m = vazio();
  m.criada('a'); m.criada('b');
  m.apagada('a');
  m.criada('c');             /* toma o 0 */
  assert.strictEqual(m.criada('a'), 2);
});

test('a 17ª caixa não nasce', () => {
  const m = vazio();
  for (let i = 0; i < Caixas.N_CAIXAS; i++) assert.strictEqual(m.criada('c' + i), i);
  assert.strictEqual(m.temLugar(), false);
  assert.strictEqual(m.criada('mais uma'), null);
  m.apagada('c5');
  assert.strictEqual(m.temLugar(), true);
});

test('um mapa novo não tem nada sujo', () => {
  assert.strictEqual(vazio().temSujo(), false);
});

test('lugar apagado continua sujo, e só o ZERAR o limpa', () => {
  const m = vazio();
  m.criada('x');
  assert.strictEqual(m.temSujo(), true);
  m.apagada('x');
  assert.strictEqual(m.temSujo(), true, 'a VM ainda pode ter o número de x');
  m.zerou();
  assert.strictEqual(m.temSujo(), false);
});

test('depois do ZERAR, quem ainda existe continua sujo', () => {
  const m = vazio();
  m.criada('x'); m.criada('y');
  m.apagada('x');
  m.zerou();
  assert.strictEqual(m.temSujo(), true);
  assert.deepStrictEqual(m.exportar().sujo, [1]);
});

test('o mapa volta igual depois de exportado e importado', () => {
  const m = vazio();
  m.criada('a'); m.criada('b'); m.criada('c');
  m.apagada('b');
  const volta = Caixas.importar(JSON.parse(JSON.stringify(m.exportar())));
  assert.deepStrictEqual(volta.exportar(), m.exportar());
  assert.strictEqual(volta.criada('b'), 1, 'a lembrança de onde b estava foi junto');
});

test('estado corrompido não quebra, e o que é ruim sai entrada por entrada', () => {
  for (const lixo of [undefined, null, 7, 'texto', [], true]) {
    const m = Caixas.importar(lixo);
    assert.strictEqual(m.temSujo(), false);
    assert.strictEqual(m.criada('a'), 0);
  }
  const m = Caixas.importar({
    lugar: { ok: 2, grande: 16, negativo: -1, quebrado: 1.5, texto: '3',
             repetido: 2, '': 4, outro: 5 },
    antigo: { velho: 99, bom: 7 },
    sujo: [2, 5, 40, 'x', -3, 7],
  });
  assert.deepStrictEqual(m.exportar().lugar, { ok: 2, outro: 5 });
  assert.deepStrictEqual(m.exportar().antigo, { bom: 7 });
  assert.deepStrictEqual(m.exportar().sujo, [2, 5, 7]);
  const soArray = Caixas.importar({ lugar: [1, 2, 3] });
  assert.deepStrictEqual(soArray.exportar().lugar, {});
});

test('lugar ocupado é sempre sujo, mesmo que o gravado diga que não', () => {
  const m = Caixas.importar({ lugar: { a: 3 }, sujo: [] });
  assert.deepStrictEqual(m.exportar().sujo, [3]);
});

/* O workspace.clear() do Blockly esvazia as variáveis sem disparar VAR_DELETE.
   Quem mantém o mapa em dia é o reconciliar, e não os eventos. */

test('reconciliar tira do mapa quem não existe mais, e o lugar fica sujo', () => {
  const m = vazio();
  m.criada('a'); m.criada('b');
  m.zerou();
  m.reconciliar(['b']);
  assert.strictEqual(m.lugarDe('a'), null);
  assert.strictEqual(m.lugarDe('b'), 1);
  assert.deepStrictEqual(m.exportar().sujo, [0, 1]);
  assert.strictEqual(m.criada('c'), 0);
});

test('reconciliar dá lugar a quem está na tela e não no mapa', () => {
  const m = vazio();
  m.reconciliar(['x', 'y']);
  assert.strictEqual(m.lugarDe('x'), 0);
  assert.strictEqual(m.lugarDe('y'), 1);
});

test('trocar de tela sem evento nenhum não deixa fantasma segurando lugar', () => {
  const m = vazio();
  for (let volta = 0; volta < 5; volta++) {
    const ids = [];
    for (let i = 0; i < 10; i++) ids.push('v' + volta + '_' + i);
    m.reconciliar(ids);
    assert.deepStrictEqual(ids.map((id) => m.lugarDe(id)),
                           [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'volta ' + volta);
    m.reconciliar([]);        /* o clear() do Blockly */
  }
  assert.strictEqual(m.temLugar(), true);
  assert.ok(Object.keys(m.exportar().antigo).length <= Caixas.N_CAIXAS,
    'a lembrança não pode crescer a cada troca de tela');
});

test('estado gravado com 16 fantasmas não impede a caixa de verdade', () => {
  const lugar = {};
  for (let i = 0; i < 16; i++) lugar['fantasma' + i] = i;
  const m = Caixas.importar({ lugar });
  m.reconciliar(['real']);
  assert.strictEqual(m.lugarDe('real'), 0);
  assert.strictEqual(m.temSujo(), true, 'os fantasmas podiam ter número na VM');
});

test('quando uma caixa toma um lugar, a lembrança antiga dele some', () => {
  const m = vazio();
  m.criada('a');
  m.apagada('a');
  m.criada('b');
  assert.deepStrictEqual(m.exportar().antigo, {});
  const lido = Caixas.importar({ lugar: { b: 0 }, antigo: { a: 0, c: 4 } });
  assert.deepStrictEqual(lido.exportar().antigo, { c: 4 });
});

test('estado gravado com várias lembranças no mesmo lugar guarda só a primeira', () => {
  const antigo = {};
  for (let i = 0; i < 300; i++) antigo['velho' + i] = 4;
  antigo.outro = 9;
  const m = Caixas.importar({ lugar: {}, antigo });
  assert.deepStrictEqual(m.exportar().antigo, { velho0: 4, outro: 9 });
  assert.strictEqual(m.criada('velho0'), 4, 'a lembrança que ficou ainda vale');
});
