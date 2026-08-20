'use strict';

const test = require('node:test');
const assert = require('node:assert');

require('./dom_falso.js');   /* precisa vir antes do Blockly */
const Blockly = require('../web/vendor/blockly_compressed.js');
globalThis.Blockly = Blockly;
const Campos = require('../web/campos.js');
globalThis.Blocos = require('../web/blocos.js');
const Niveis = require('../web/niveis.js');

/* Esconder um encaixe mexe no rastreio de conexões, que só existe num
   workspace desenhado — headless, o Blockly cria Connection em vez de
   RenderedConnection e falta o par startTrackingAll/stopTrackingAll. As duas
   funções cuidam de arrastar peça com o mouse, coisa que não existe aqui.
   Ficam no teste, e não no web/niveis.js, porque o navegador tem as de
   verdade. */
for (const nome of ['startTrackingAll', 'stopTrackingAll']) {
  if (!Blockly.Connection.prototype[nome]) {
    Blockly.Connection.prototype[nome] = function () { return []; };
  }
}

/* Pelo mesmo motivo: esconder o encaixe também esconde o SVG do bloco que
   estiver dentro dele, e headless não há SVG. Um objeto com "style" basta —
   o que os testes afirmam é o isVisible() do encaixe, não o CSS. */
if (!Blockly.Block.prototype.getSvgRoot) {
  Blockly.Block.prototype.getSvgRoot = function () {
    if (!this.__svgFalso) this.__svgFalso = { style: {} };
    return this.__svgFalso;
  };
}

Campos.registrar();
Blocos.definir();

test('a caixa do Pequeno oferece só movimento e repetir', () => {
  const xml = Niveis.caixaXml('pequeno');
  for (const t of ['mover_frente', 'mover_tras', 'girar', 'repetir']) {
    assert.ok(xml.includes(t), `faltou ${t} no Pequeno`);
  }
  assert.ok(!xml.includes('esperar'), 'Pequeno não deve ter esperar');
  assert.ok(!xml.includes('se_obstaculo'), 'Pequeno não deve ter o sensor');
});

test('o Pequeno oferece girar já preenchido para os dois lados', () => {
  const xml = Niveis.caixaXml('pequeno');
  assert.ok(xml.includes('>90<'), 'faltou o girar de 90');
  assert.ok(xml.includes('>-90<'), 'faltou o girar de -90');
});

test('Médio e Grande oferecem os seis blocos', () => {
  for (const nivel of ['medio', 'grande']) {
    const xml = Niveis.caixaXml(nivel);
    for (const t of ['mover_frente', 'mover_tras', 'girar', 'esperar',
                     'repetir', 'se_obstaculo']) {
      assert.ok(xml.includes(t), `faltou ${t} no ${nivel}`);
    }
  }
});

/* Os números moram em shadow blocks dentro dos encaixes. Estes dois ajudantes
   escondem essa mecânica dos testes: o que eles afirmam é sobre o nível, não
   sobre onde o Blockly guarda o valor. */
function num(v) {
  return { shadow: { type: 'numero', fields: { NUM: v } } };
}

function campoNum(bloco, nome) {
  const dentro = bloco.getInputTargetBlock(nome);
  return dentro ? dentro.getField('NUM') : null;
}

/* Sem navegador não há DOM, e o evento de criação de bloco do Blockly monta XML
   com document.createElementNS. Desligar os eventos durante a carga é o que
   deixa o workspace rodar headless aqui no Node. */
function bancada() {
  const ws = new Blockly.Workspace();
  Blockly.Events.disable();
  try {
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [
      { type: 'mover_frente', inputs: { SEG: num(0.5) }, fields: { VEL: '200' } },
      { type: 'girar', inputs: { GRAUS: num(90) } },
      { type: 'repetir',
        inputs: { N: { shadow: { type: 'numero_bolinhas', fields: { NUM: 12 } } } } },
    ] } }, ws);
  } finally {
    Blockly.Events.enable();
  }
  return ws;
}

test('no Pequeno o tempo e a velocidade ficam escondidos', () => {
  const ws = bancada();
  Niveis.aplicar(ws, 'pequeno');
  const b = ws.getBlocksByType('mover_frente', false)[0];
  assert.strictEqual(b.getInput('SEG').isVisible(), false);
  assert.strictEqual(b.getField('VEL').isVisible(), false);
});

test('no Pequeno as palavras somem junto com o número', () => {
  const ws = bancada();
  Niveis.aplicar(ws, 'pequeno');
  const b = ws.getBlocksByType('mover_frente', false)[0];
  assert.strictEqual(b.getField('T1').isVisible(), false,
    'sobrou "andar frente" num nível para quem não lê');
  assert.strictEqual(b.getField('T2').isVisible(), false,
    'sobrou o "s" solto na tela');
});

test('no Médio o tempo aparece e a velocidade continua escondida', () => {
  const ws = bancada();
  Niveis.aplicar(ws, 'medio');
  const b = ws.getBlocksByType('mover_frente', false)[0];
  assert.strictEqual(b.getInput('SEG').isVisible(), true);
  assert.strictEqual(b.getField('VEL').isVisible(), false);
});

test('no Grande aparece tudo, e o giro troca o menu pelo ângulo', () => {
  const ws = bancada();
  Niveis.aplicar(ws, 'grande');
  const m = ws.getBlocksByType('mover_frente', false)[0];
  assert.strictEqual(m.getField('VEL').isVisible(), true);
  const g = ws.getBlocksByType('girar', false)[0];
  assert.strictEqual(g.getInput('GRAUS').isVisible(), true);
  assert.strictEqual(g.getField('DIR').isVisible(), false);
});

test('subir de nível preserva o valor que estava escondido', () => {
  const ws = bancada();
  Niveis.aplicar(ws, 'pequeno');
  const b = ws.getBlocksByType('mover_frente', false)[0];
  assert.strictEqual(Number(campoNum(b, 'SEG').getValue()), 0.5);
  Niveis.aplicar(ws, 'medio');
  assert.strictEqual(Number(campoNum(b, 'SEG').getValue()), 0.5);
});

test('descer de nível guarda o valor em vez de perder', () => {
  const ws = bancada();
  Niveis.aplicar(ws, 'medio');
  const b = ws.getBlocksByType('mover_frente', false)[0];
  campoNum(b, 'SEG').setValue(3);
  Niveis.aplicar(ws, 'pequeno');
  Niveis.aplicar(ws, 'medio');
  assert.strictEqual(Number(campoNum(b, 'SEG').getValue()), 3);
});

test('o repetir desenha bolinhas no Pequeno e algarismo nos outros', () => {
  const ws = bancada();
  const n = campoNum(ws.getBlocksByType('repetir', false)[0], 'N');
  Niveis.aplicar(ws, 'pequeno');
  assert.strictEqual(n.modoBolinhas, true);
  Niveis.aplicar(ws, 'medio');
  assert.strictEqual(n.modoBolinhas, false);
});

test('a faixa do repetir continua sendo a da v1, para o nível Grande servir', () => {
  const ws = bancada();
  const b = ws.getBlocksByType('repetir', false)[0];
  Niveis.aplicar(ws, 'grande');
  campoNum(b, 'N').setValue(60);
  assert.strictEqual(Number(campoNum(b, 'N').getValue()), 60,
    'o nível Grande precisa repetir mais que cinco vezes');
});

test('descer para o Pequeno não corta o valor grande', () => {
  const ws = bancada();
  const b = ws.getBlocksByType('repetir', false)[0];
  Niveis.aplicar(ws, 'grande');
  campoNum(b, 'N').setValue(60);
  Niveis.aplicar(ws, 'pequeno');
  assert.strictEqual(Number(campoNum(b, 'N').getValue()), 60);
  assert.strictEqual(campoNum(b, 'N').getText(), '60',
    'bolinhas não representam 60, então mostra o número');
});

test('as duas entradas de girar do Pequeno não aparecem iguais', () => {
  /* Preencher GRAUS em vez de DIR deixaria as duas mostrando "direita". */
  const xml = Niveis.caixaXml('pequeno');
  assert.ok(xml.includes('<field name="DIR">90</field>'), 'faltou o girar à direita');
  assert.ok(xml.includes('<field name="DIR">-90</field>'), 'faltou o girar à esquerda');
});

test('o menu do girar acompanha o GRAUS quando cabe nele', () => {
  const ws = new Blockly.Workspace();
  Blockly.Events.disable();
  try {
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [
      { type: 'girar', inputs: { GRAUS: num(-90) } },
    ] } }, ws);
  } finally {
    Blockly.Events.enable();
  }
  const b = ws.getBlocksByType('girar', false)[0];
  Niveis.aplicar(ws, 'pequeno');
  assert.strictEqual(b.getField('DIR').getText(), 'esquerda',
    'o menu mentiria sobre para que lado o bloco vira');
});

test('ângulo que não cabe no menu aparece como número, mesmo no Pequeno', () => {
  const ws = new Blockly.Workspace();
  Blockly.Events.disable();
  try {
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [
      { type: 'girar', inputs: { GRAUS: num(45) } },
    ] } }, ws);
  } finally {
    Blockly.Events.enable();
  }
  const b = ws.getBlocksByType('girar', false)[0];
  Niveis.aplicar(ws, 'pequeno');
  assert.strictEqual(b.getField('DIR').isVisible(), false,
    'o menu de duas opções não representa 45 graus');
  assert.strictEqual(b.getInput('GRAUS').isVisible(), true);
  assert.strictEqual(Number(campoNum(b, 'GRAUS').getValue()), 45,
    'o valor não pode se perder');
});

test('nível desconhecido cai no Médio em vez de quebrar', () => {
  assert.strictEqual(Niveis.definicao('inventado'), Niveis.definicao('medio'));
});

test('o Pequeno continua com quatro blocos e nenhum de controle', () => {
  const xml = Niveis.caixaXml('pequeno');
  for (const t of ['repetir_sempre', 'parar', 'se_senao', 'repetir_ate_perto']) {
    assert.ok(!xml.includes('"' + t + '"'), `Pequeno não deve oferecer ${t}`);
  }
});

test('o Médio ganha parar e repetir para sempre, e só isso', () => {
  const xml = Niveis.caixaXml('medio');
  assert.ok(xml.includes('"parar"'), 'faltou parar no Médio');
  assert.ok(xml.includes('"repetir_sempre"'), 'faltou repetir para sempre no Médio');
  assert.ok(!xml.includes('"se_senao"'), 'se…senão é só do Grande');
  assert.ok(!xml.includes('"repetir_ate_perto"'), 'até perto é só do Grande');
});

test('o Grande oferece os dez', () => {
  const xml = Niveis.caixaXml('grande');
  for (const t of ['mover_frente', 'mover_tras', 'girar', 'esperar', 'parar',
                   'repetir', 'repetir_sempre', 'repetir_ate_perto',
                   'se_obstaculo', 'se_senao']) {
    assert.ok(xml.includes('"' + t + '"'), `faltou ${t} no Grande`);
  }
});

test('cada nível oferece a quantidade certa de blocos', () => {
  const quantos = function (nivel) {
    return (Niveis.caixaXml(nivel).match(/<block /g) || []).length;
  };
  assert.strictEqual(quantos('pequeno'), 5);   /* girar aparece duas vezes */
  assert.strictEqual(quantos('medio'), 8);
  assert.strictEqual(quantos('grande'), 10);
});

/* ---------- os ícones desenhados ---------- */

/* Os dois testes abaixo guardam defeitos que a criança viu antes da bateria:
   no tablet e no celular as peças de movimento saíam vazias, e o menu do girar
   aparecia desenhado fora do próprio bloco. Nenhum dos dois quebrava um teste —
   por isso passaram. */

test('o ícone sobrevive em todos os níveis, inclusive no Pequeno', () => {
  /* No Pequeno as palavras somem e o desenho passa a ser a única coisa legível
     da peça. Ele vem antes do encaixe SEG, então mora na fileira dele e some
     junto quando o Pequeno esconde o encaixe: é a tabela do nível que precisa
     reacendê-lo, e ela só enxerga campo com nome. */
  for (const nivel of ['pequeno', 'medio', 'grande', 'gigante']) {
    for (const tipo of ['mover_frente', 'mover_tras']) {
      const ws = new Blockly.Workspace();
      Blockly.Events.disable();
      try {
        Blockly.serialization.blocks.append({ type: tipo }, ws);
      } finally {
        Blockly.Events.enable();
      }
      const b = ws.getBlocksByType(tipo, false)[0];
      Niveis.aplicar(ws, nivel);
      const icone = b.getField('ICONE');
      assert.ok(icone, tipo + ' perdeu o campo do ícone no ' + nivel);
      assert.ok(icone.isVisible(),
        'no ' + nivel + ' o ' + tipo + ' fica sem sinal nenhum na tela');
    }
  }
});

test('o menu do girar tem fileira própria, separada do encaixe', () => {
  /* O Blockly guarda os campos que vêm antes de um encaixe na fileira daquele
     encaixe, e calcula posição só de fileira visível. Com o menu morando na
     fileira do GRAUS — que o Pequeno e o Médio escondem para mostrar o menu no
     lugar do número — o corpo do bloco encolhia e o ícone continuava desenhado
     na coordenada antiga, boiando fora da peça. */
  const ws = new Blockly.Workspace();
  Blockly.Events.disable();
  try {
    Blockly.serialization.blocks.append({ type: 'girar' }, ws);
  } finally {
    Blockly.Events.enable();
  }
  const b = ws.getBlocksByType('girar', false)[0];
  const linha = b.getInput('LINHA_DIR');
  assert.ok(linha, 'o girar perdeu a fileira própria do menu');

  const nomes = [];
  for (const campo of linha.fieldRow) nomes.push(campo.name);
  assert.ok(nomes.indexOf('DIR') >= 0,
    'o menu voltou para a fileira do encaixe, e vai boiar fora do bloco');
  assert.ok(nomes.indexOf('T1') >= 0,
    'a palavra "girar" precisa acompanhar o menu, senão some com o encaixe');
});

test('o mapa de campos não precisou de linha nova', () => {
  /* Os blocos novos reaproveitam CM, T1 e T2. Se alguém acrescentar um campo
     aqui, é sinal de que criou nome novo sem necessidade.

     ICONE é a exceção que se justificou: o desenho que abre a peça vem antes de
     um encaixe, então o Blockly o guarda na fileira daquele encaixe e ele some
     junto quando o encaixe se esconde. Só a tabela do nível reacende campo
     escondido, e ela só enxerga campo com nome. Sem esta linha, o nível Pequeno
     mostra peças de movimento vazias. */
  const campos = Object.keys(Niveis.definicao('grande').campos).sort();
  assert.deepStrictEqual(campos,
    ['CM', 'DIR', 'GRAUS', 'ICONE', 'N', 'SEG', 'T1', 'T2', 'VEL']);
});

/* ---------- o quarto nível ---------- */

test('o Gigante é o quarto nível e herda tudo do Grande', () => {
  assert.deepStrictEqual(Niveis.LISTA, ['pequeno', 'medio', 'grande', 'gigante']);
  const grande = Niveis.definicao('grande').blocos;
  const gigante = Niveis.definicao('gigante').blocos;
  for (const t of grande) {
    assert.ok(gigante.indexOf(t) >= 0, 'o Gigante perdeu o bloco ' + t);
  }
});

test('só o Gigante oferece contas e o distância', () => {
  for (const nivel of ['pequeno', 'medio', 'grande']) {
    const b = Niveis.definicao(nivel).blocos;
    assert.ok(b.indexOf('conta_mais') < 0, nivel + ' não deveria ter contas');
    assert.ok(b.indexOf('distancia') < 0, nivel + ' não deveria ter o distância');
  }
  const g = Niveis.definicao('gigante').blocos;
  for (const t of ['conta_mais', 'conta_menor', 'conta_e', 'conta_nao',
                   'aleatorio', 'distancia', 'se', 'se_entao_senao',
                   'repetir_ate']) {
    assert.ok(g.indexOf(t) >= 0, 'faltou ' + t + ' no Gigante');
  }
});

test('a caixa do Gigante tem a categoria Contas, e as de baixo não', () => {
  assert.ok(Niveis.caixaXml('gigante').includes('name="Contas"'));
  for (const nivel of ['pequeno', 'medio', 'grande']) {
    assert.ok(!Niveis.caixaXml(nivel).includes('name="Contas"'),
      nivel + ' não deveria ter a categoria Contas');
  }
});

/* Um encaixe de conta sem shadow sairia da paleta com dois buracos, e a
   criança teria de arrastar um número para dentro antes de poder somar. */
test('as contas saem da paleta com número dentro', () => {
  const xml = Niveis.caixaXml('gigante');
  const pedaco = xml.slice(xml.indexOf('conta_mais'));
  assert.ok(pedaco.includes('<shadow type="numero">'),
    'o + saiu da caixa sem número nos encaixes');
});

/* O "se" tem encaixe de verdadeiro/falso, e ali um número não serve: o shadow
   seria uma peça que não responde a pergunta nenhuma. */
test('o se não vem com número no encaixe da condição', () => {
  const xml = Niveis.caixaXml('gigante');
  const pedaco = xml.slice(xml.indexOf('"se"'), xml.indexOf('"se_entao_senao"'));
  assert.ok(!pedaco.includes('<shadow'), 'a condição não pode nascer com número');
});

/* O defeito que este teste guarda: os três blocos gerais de controle estavam
   sendo somados à categoria depois de ela já ter ido para o XML, e nunca
   apareciam na caixa. A lista de blocos do nível dizia que existiam. */
test('a caixa do Gigante oferece de fato os blocos gerais de controle', () => {
  const xml = Niveis.caixaXml('gigante');
  for (const t of ['"se"', '"se_entao_senao"', '"repetir_ate"', '"distancia"',
                   '"conta_nao"']) {
    assert.ok(xml.includes('type=' + t), 'faltou ' + t + ' na caixa do Gigante');
  }
});
