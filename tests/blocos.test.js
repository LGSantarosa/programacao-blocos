'use strict';

const test = require('node:test');
const assert = require('node:assert');

require('./dom_falso.js');   /* precisa vir antes do Blockly */
const Blockly = require('../web/vendor/blockly_compressed.js');
globalThis.Blockly = Blockly;
const Campos = require('../web/campos.js');
const Blocos = require('../web/blocos.js');
const Caixas = require('../web/caixas.js');

Campos.registrar();
Blocos.definir();

/* Sem navegador não há DOM, e o evento de criação de bloco do Blockly monta XML
   com document.createElementNS. Desligar os eventos durante a carga é o que
   deixa o workspace rodar headless aqui no Node. */
function carregar(estados) {
  const ws = new Blockly.Workspace();
  Blockly.Events.disable();
  try {
    Blockly.serialization.workspaces.load(
      { blocks: { languageVersion: 0, blocks: estados } }, ws);
  } finally {
    Blockly.Events.enable();
  }
  return ws;
}

/* Um encaixe com o shadow de número dentro: é o que a criança vê como se
   fosse o campo de antes, até soltar uma conta em cima. */
function num(v) {
  return { shadow: { type: 'numero', fields: { NUM: v } } };
}

function bolinhas(v) {
  return { shadow: { type: 'numero_bolinhas', fields: { NUM: v } } };
}

/* Monta um workspace headless com um programa e devolve a AST. */
function astDe(estado) {
  return Blocos.workspaceParaAst(carregar([estado]));
}

test('girar lê o campo GRAUS, não o menu', () => {
  const ast = astDe({
    type: 'quando_play',
    inputs: { CORPO: { block: { type: 'girar', inputs: { GRAUS: num(45) } } } },
  });
  assert.strictEqual(ast.length, 1);
  assert.strictEqual(ast[0].op, 'girar');
  assert.strictEqual(ast[0].graus, 45);
});

test('escolher esquerda no menu escreve -90 no encaixe', () => {
  const b = carregar([{ type: 'girar', inputs: { GRAUS: num(90) } }])
    .getBlocksByType('girar', false)[0];
  b.setFieldValue('-90', 'DIR');
  assert.strictEqual(
    Number(b.getInputTargetBlock('GRAUS').getFieldValue('NUM')), -90);
});

test('o bloco de movimento carrega a velocidade para a AST', () => {
  const ast = astDe({
    type: 'quando_play',
    inputs: { CORPO: { block: {
      type: 'mover_frente', inputs: { SEG: num(2) }, fields: { VEL: '225' },
    } } },
  });
  assert.strictEqual(ast[0].segundos, 2);
  assert.strictEqual(ast[0].velocidade, 225);
});

test('repetir usa o campo de bolinhas, agora dentro do shadow', () => {
  const b = carregar([{ type: 'repetir', inputs: { N: bolinhas(4) } }])
    .getBlocksByType('repetir', false)[0];
  const campo = b.getInputTargetBlock('N').getField('NUM');
  assert.strictEqual(campo.constructor.name, 'FieldBolinhas');
});

test('os seis blocos continuam sendo seis', () => {
  for (const t of ['mover_frente', 'mover_tras', 'girar', 'esperar',
                   'repetir', 'se_obstaculo', 'quando_play']) {
    assert.ok(Blockly.Blocks[t], `faltou o bloco ${t}`);
  }
});

test('as palavras dos blocos são campos, para poderem sumir no Pequeno', () => {
  const ws = carregar([{ type: 'mover_frente' }, { type: 'girar' }]);
  const m = ws.getBlocksByType('mover_frente', false)[0];
  assert.ok(m.getField('T1'), 'faltou o rótulo "andar frente" como campo');
  assert.ok(m.getField('T2'), 'faltou o rótulo "s" como campo');
  const g = ws.getBlocksByType('girar', false)[0];
  assert.ok(g.getField('T1'), 'faltou o rótulo "girar" como campo');
  assert.ok(g.getField('T2'), 'faltou o rótulo "graus" como campo');
});

test('definir() duas vezes não estoura por extensão repetida', () => {
  assert.doesNotThrow(() => Blocos.definir());
});

test('os quatro blocos de controle existem', () => {
  for (const t of ['repetir_sempre', 'parar', 'se_senao', 'repetir_ate_perto']) {
    assert.ok(Blockly.Blocks[t], `faltou o bloco ${t}`);
  }
});

test('parar e para sempre não têm encaixe embaixo', () => {
  /* Nada depois deles jamais roda. Sem o bump, a criança não consegue nem
     tentar encaixar e ficar esperando. */
  const ws = carregar([{ type: 'parar' }, { type: 'repetir_sempre' }]);
  for (const t of ['parar', 'repetir_sempre']) {
    const b = ws.getBlocksByType(t, false)[0];
    assert.strictEqual(b.nextConnection, null, `${t} não devia ter saída embaixo`);
    assert.ok(b.previousConnection, `${t} precisa encaixar em algo acima`);
  }
});

test('parar vira um nó parar na AST', () => {
  const ast = astDe({
    type: 'quando_play',
    inputs: { CORPO: { block: { type: 'parar' } } },
  });
  assert.strictEqual(ast.length, 1);
  assert.strictEqual(ast[0].op, 'parar');
});

test('repetir para sempre carrega o corpo', () => {
  const ast = astDe({
    type: 'quando_play',
    inputs: { CORPO: { block: {
      type: 'repetir_sempre',
      inputs: { CORPO: { block: { type: 'girar', inputs: { GRAUS: num(90) } } } },
    } } },
  });
  assert.strictEqual(ast[0].op, 'repetir_sempre');
  assert.strictEqual(ast[0].corpo.length, 1);
  assert.strictEqual(ast[0].corpo[0].op, 'girar');
});

test('se…senão separa os dois ramos', () => {
  const ast = astDe({
    type: 'quando_play',
    inputs: { CORPO: { block: {
      type: 'se_senao',
      inputs: {
        CM: num(25),
        CORPO: { block: { type: 'parar' } },
        SENAO: { block: { type: 'girar', inputs: { GRAUS: num(90) } } },
      },
    } } },
  });
  assert.strictEqual(ast[0].op, 'se_senao');
  assert.strictEqual(ast[0].cm, 25);
  assert.strictEqual(ast[0].entao[0].op, 'parar');
  assert.strictEqual(ast[0].senao[0].op, 'girar');
});

test('se…senão com ramos vazios dá listas vazias, não undefined', () => {
  const ast = astDe({
    type: 'quando_play',
    inputs: { CORPO: { block: { type: 'se_senao' } } },
  });
  assert.deepStrictEqual(ast[0].entao, []);
  assert.deepStrictEqual(ast[0].senao, []);
});

test('repetir até perto leva a distância e o corpo', () => {
  const ast = astDe({
    type: 'quando_play',
    inputs: { CORPO: { block: {
      type: 'repetir_ate_perto',
      inputs: {
        CM: num(15),
        CORPO: { block: { type: 'mover_frente', inputs: { SEG: num(0.5) } } },
      },
    } } },
  });
  assert.strictEqual(ast[0].op, 'repetir_ate_perto');
  assert.strictEqual(ast[0].cm, 15);
  assert.strictEqual(ast[0].corpo[0].op, 'frente');
});

test('o senão é texto cru, para não sumir no Pequeno', () => {
  /* Se fosse field_label com nome T3, ele sumiria junto com T1/T2 no Pequeno e
     os dois ramos ficariam indistinguíveis num bloco herdado do Grande. */
  const b = carregar([{ type: 'se_senao' }]).getBlocksByType('se_senao', false)[0];
  assert.strictEqual(b.getField('T3'), null, 'o senão não deve ser um campo');
  assert.ok(b.getInput('CM'), 'a distância continua existindo, agora como encaixe');
  assert.ok(b.getField('T1'), 'o "se obstáculo a menos de" continua campo');
});

test('parar e para sempre não têm campo nenhum que possa sumir', () => {
  const ws = carregar([{ type: 'parar' }, { type: 'repetir_sempre' }]);
  for (const t of ['parar', 'repetir_sempre']) {
    const b = ws.getBlocksByType(t, false)[0];
    for (const nome of ['T1', 'T2', 'T3']) {
      assert.strictEqual(b.getField(nome), null,
        `${t} não devia ter o campo ${nome}: o texto tem que sobreviver ao Pequeno`);
    }
  }
});

/* criarRaiz e limpar mexem no workspace de verdade, e o evento de criação do
   Blockly monta XML com document.createElementNS — o mesmo motivo pelo qual o
   helper "carregar" desliga os eventos. Aqui vale o mesmo cuidado. */
function semEventos(fn) {
  Blockly.Events.disable();
  try { return fn(); } finally { Blockly.Events.enable(); }
}

test('criarRaiz põe um quando_play que a criança não apaga nem arrasta', () => {
  const ws = new Blockly.Workspace();
  const raiz = semEventos(() => Blocos.criarRaiz(ws));
  assert.strictEqual(raiz.type, 'quando_play');
  assert.strictEqual(raiz.isDeletable(), false, 'a raiz não pode ser apagável');
  assert.strictEqual(raiz.isMovable(), false, 'a raiz não pode ser arrastável');
  assert.strictEqual(ws.getAllBlocks(false).length, 1);
});

test('temTrabalho é falso quando só existe a raiz vazia', () => {
  const ws = carregar([{ type: 'quando_play' }]);
  assert.strictEqual(Blocos.temTrabalho(ws), false);
});

test('temTrabalho é verdadeiro com um bloco dentro da raiz', () => {
  const ws = carregar([{
    type: 'quando_play',
    inputs: { CORPO: { block: { type: 'mover_frente' } } },
  }]);
  assert.strictEqual(Blocos.temTrabalho(ws), true);
});

test('temTrabalho conta bloco solto, fora da pilha', () => {
  /* Um bloco arrastado para o canto e nunca encaixado continua sendo trabalho
     dela: apagá-lo sem avisar seria a mesma perda. */
  const ws = carregar([{ type: 'quando_play' }, { type: 'girar' }]);
  assert.strictEqual(Blocos.temTrabalho(ws), true);
});

test('limpar deixa exatamente uma raiz, e ela continua fixa', () => {
  const ws = carregar([{
    type: 'quando_play',
    inputs: { CORPO: { block: { type: 'mover_frente' } } },
  }, { type: 'girar' }]);
  const raiz = semEventos(() => Blocos.limpar(ws));
  const todos = ws.getAllBlocks(false);
  assert.strictEqual(todos.length, 1, 'sobrou bloco depois de limpar');
  assert.strictEqual(todos[0].type, 'quando_play');
  assert.strictEqual(raiz.isDeletable(), false);
  assert.strictEqual(raiz.isMovable(), false);
  assert.strictEqual(Blocos.temTrabalho(ws), false);
});

/* ---------- os campos numéricos viraram encaixes ---------- */

test('um bloco com shadow intacto produz a mesma AST de antes', () => {
  const ws = carregar([{
    type: 'quando_play',
    inputs: { CORPO: { block: {
      type: 'mover_frente',
      inputs: { SEG: num(2.5) },
      fields: { VEL: '200' },
    } } },
  }]);
  assert.deepStrictEqual(
    Blocos.workspaceParaAst(ws).map((n) => ({ op: n.op, segundos: n.segundos })),
    [{ op: 'frente', segundos: 2.5 }]);
});

test('o repetir usa shadow de bolinhas, não de número', () => {
  const ws = carregar([{ type: 'quando_play', inputs: { CORPO: { block: {
    type: 'repetir',
    inputs: { N: { shadow: { type: 'numero_bolinhas', fields: { NUM: 3 } } } },
  } } } }]);
  const bloco = ws.getBlocksByType('repetir', false)[0];
  assert.strictEqual(bloco.getInputTargetBlock('N').type, 'numero_bolinhas');
  assert.strictEqual(Blocos.workspaceParaAst(ws)[0].vezes, 3);
});

test('encaixe vazio vale zero, e não quebra', () => {
  const ws = carregar([{ type: 'quando_play', inputs: { CORPO: { block: {
    type: 'girar',
  } } } }]);
  assert.strictEqual(Blocos.workspaceParaAst(ws)[0].graus, 0);
});

/* ---------- as contas do Gigante ---------- */

test('uma conta dentro de um encaixe vira nó de valor na AST', () => {
  const ws = carregar([{ type: 'quando_play', inputs: { CORPO: { block: {
    type: 'mover_frente',
    inputs: { SEG: { block: {
      type: 'conta_mais',
      inputs: { A: num(1), B: num(2) },
    } } },
    fields: { VEL: '200' },
  } } } }]);
  const no = Blocos.workspaceParaAst(ws)[0];
  assert.strictEqual(no.segundos.op, 'mais');
  assert.strictEqual(no.segundos.a, 1);
  assert.strictEqual(no.segundos.b, 2);
});

/* O distância é número, e o "se" pede verdadeiro/falso: não dá para dizer
   "se (distância)". Precisa da comparação no meio, e o Blockly recusa o
   encaixe errado antes de a criança apertar PLAY. */
test('o distância é um nó de valor sem argumento', () => {
  const ws = carregar([{ type: 'quando_play', inputs: { CORPO: { block: {
    type: 'se',
    inputs: { COND: { block: { type: 'conta_menor',
      inputs: { A: { block: { type: 'distancia' } }, B: num(20) } } } },
  } } } }]);
  const cond = Blocos.workspaceParaAst(ws)[0].cond;
  assert.strictEqual(cond.op, 'menor');
  assert.strictEqual(cond.a.op, 'distancia');
  assert.strictEqual(cond.a.b, undefined, 'o distância não carrega argumento');
});

test('se…senão do Gigante separa os dois ramos', () => {
  const ws = carregar([{ type: 'quando_play', inputs: { CORPO: { block: {
    type: 'se_entao_senao',
    inputs: {
      COND: { block: { type: 'conta_menor',
                       inputs: { A: { block: { type: 'distancia' } }, B: num(20) } } },
      CORPO: { block: { type: 'parar' } },
      SENAO: { block: { type: 'girar', inputs: { GRAUS: num(90) } } },
    },
  } } } }]);
  const no = Blocos.workspaceParaAst(ws)[0];
  assert.strictEqual(no.op, 'se_entao_senao');
  assert.strictEqual(no.cond.op, 'menor');
  assert.strictEqual(no.cond.a.op, 'distancia');
  assert.strictEqual(no.cond.b, 20);
  assert.strictEqual(no.entao[0].op, 'parar');
  assert.strictEqual(no.senao[0].op, 'girar');
});

test('repetir até do Gigante leva a condição e o corpo', () => {
  const ws = carregar([{ type: 'quando_play', inputs: { CORPO: { block: {
    type: 'repetir_ate',
    inputs: {
      COND: { block: { type: 'conta_maior', inputs: { A: num(3), B: num(1) } } },
      CORPO: { block: { type: 'parar' } },
    },
  } } } }]);
  const no = Blocos.workspaceParaAst(ws)[0];
  assert.strictEqual(no.op, 'repetir_ate');
  assert.strictEqual(no.cond.op, 'maior');
  assert.strictEqual(no.corpo[0].op, 'parar');
});

test('o não carrega um argumento só', () => {
  const ws = carregar([{ type: 'quando_play', inputs: { CORPO: { block: {
    type: 'se',
    inputs: { COND: { block: { type: 'conta_nao',
      inputs: { A: { block: { type: 'conta_menor',
        inputs: { A: { block: { type: 'distancia' } }, B: num(20) } } } } } } },
  } } } }]);
  const cond = Blocos.workspaceParaAst(ws)[0].cond;
  assert.strictEqual(cond.op, 'nao');
  assert.strictEqual(cond.a.op, 'menor');
  assert.strictEqual(cond.b, undefined);
});

test('encaixe de condição vazio vale zero, e não quebra', () => {
  const ws = carregar([{ type: 'quando_play', inputs: { CORPO: { block: {
    type: 'se',
  } } } }]);
  assert.strictEqual(Blocos.workspaceParaAst(ws)[0].cond, 0);
});

/* ---------- o que encaixa em quê ---------- */

/* A tabela inteira, num teste só. Ela é a resposta para "esse bloco entra
   aqui?" — e é o guarda contra o encaixe permissivo demais, que é pior que o
   restritivo: uma peça que entra onde não faz sentido só falha depois, com o
   robô andando errado e sem ninguém saber por quê. */
const VALORES_NUMERO = ['numero', 'conta_mais', 'conta_menos', 'conta_vezes',
                        'conta_dividir', 'aleatorio', 'distancia'];
const VALORES_SIMNAO = ['conta_menor', 'conta_maior', 'conta_igual',
                        'conta_e', 'conta_ou', 'conta_nao'];

const BURACOS_NUMERO = [['mover_frente', 'SEG'], ['mover_tras', 'SEG'],
                        ['girar', 'GRAUS'], ['esperar', 'SEG'],
                        ['repetir', 'N'], ['se_obstaculo', 'CM'],
                        ['se_senao', 'CM'], ['repetir_ate_perto', 'CM'],
                        ['conta_mais', 'A'], ['conta_mais', 'B'],
                        ['conta_menos', 'A'], ['conta_vezes', 'B'],
                        ['conta_dividir', 'A'], ['aleatorio', 'A'],
                        ['aleatorio', 'B'], ['conta_menor', 'A'],
                        ['conta_maior', 'B'], ['conta_igual', 'A']];
const BURACOS_SIMNAO = [['se', 'COND'], ['se_entao_senao', 'COND'],
                        ['repetir_ate', 'COND'], ['conta_e', 'A'],
                        ['conta_e', 'B'], ['conta_ou', 'A'],
                        ['conta_nao', 'A']];

function encaixa(tipoPai, nomeEncaixe, tipoFilho) {
  const ws = new Blockly.Workspace();
  Blockly.Events.disable();
  try {
    const pai = ws.newBlock(tipoPai);
    const filho = ws.newBlock(tipoFilho);
    try { pai.getInput(nomeEncaixe).connection.connect(filho.outputConnection); }
    catch (e) { return false; }
    return !!filho.getParent();
  } finally {
    Blockly.Events.enable();
    ws.dispose();
  }
}

test('todo valor numérico entra em todo encaixe de número', () => {
  for (const v of VALORES_NUMERO) {
    for (const [pai, nome] of BURACOS_NUMERO) {
      assert.ok(encaixa(pai, nome, v),
        `${v} deveria entrar em ${pai}.${nome}`);
    }
  }
});

test('todo valor de sim/não entra em todo encaixe de sim/não', () => {
  for (const v of VALORES_SIMNAO) {
    for (const [pai, nome] of BURACOS_SIMNAO) {
      assert.ok(encaixa(pai, nome, v),
        `${v} deveria entrar em ${pai}.${nome}`);
    }
  }
});

/* "andar frente (3 < 4) s" não quer dizer nada. O Blockly recusa antes de a
   criança apertar PLAY, que é o melhor momento para recusar. */
test('sim/não não entra em encaixe de número', () => {
  for (const v of VALORES_SIMNAO) {
    for (const [pai, nome] of BURACOS_NUMERO) {
      assert.ok(!encaixa(pai, nome, v),
        `${v} não deveria entrar em ${pai}.${nome}`);
    }
  }
});

/* "se (5)" tampouco. Um número não responde sim nem não — ela precisa da
   comparação no meio, e é essa exigência que ensina a diferença. */
test('número não entra em encaixe de sim/não', () => {
  for (const v of VALORES_NUMERO) {
    for (const [pai, nome] of BURACOS_SIMNAO) {
      assert.ok(!encaixa(pai, nome, v),
        `${v} não deveria entrar em ${pai}.${nome}`);
    }
  }
});

/* ---------- a peça tocada ---------- */

/* Devolve o bloco de um workspace pelo tipo. O clique chega como um id, e é
   por id que o app.js vai buscar a peça — aqui o atalho serve. */
function achar(ws, tipo) {
  return ws.getAllBlocks(false).filter((b) => b.type === tipo)[0];
}

test('tocar numa peça dentro da âncora roda o programa', () => {
  const ws = carregar([{
    type: 'quando_play',
    inputs: { CORPO: { block: {
      type: 'mover_frente', inputs: { SEG: num(2) },
      fields: { VEL: '200' },
    } } },
  }]);
  const r = Blocos.pilhaDoBloco(achar(ws, 'mover_frente'));
  assert.strictEqual(r.ehPrograma, true);
  assert.strictEqual(r.ast.length, 1);
  assert.strictEqual(r.ast[0].op, 'frente');
});

test('tocar numa pilha solta roda só ela, e não conta como programa', () => {
  const ws = carregar([
    { type: 'quando_play' },
    { type: 'girar', inputs: { GRAUS: num(90) } },
  ]);
  const r = Blocos.pilhaDoBloco(achar(ws, 'girar'));
  assert.strictEqual(r.ehPrograma, false);
  assert.strictEqual(r.ast.length, 1);
  assert.strictEqual(r.ast[0].op, 'girar');
});

test('tocar no meio de uma pilha solta roda a pilha inteira, do topo', () => {
  /* O que a criança vê é um grupo de peças, e é o grupo que ela espera ver
     rodar — não o pedaço debaixo do dedo. */
  const ws = carregar([
    { type: 'quando_play' },
    {
      type: 'girar', inputs: { GRAUS: num(90) },
      next: { block: { type: 'esperar', inputs: { SEG: num(1) } } },
    },
  ]);
  const r = Blocos.pilhaDoBloco(achar(ws, 'esperar'));
  assert.strictEqual(r.ast.length, 2);
  assert.strictEqual(r.ast[0].op, 'girar');
  assert.strictEqual(r.ast[1].op, 'esperar');
});

test('um relator não roda: quem toca nele quer o valor, não o movimento', () => {
  /* A regra se lê na peça tocada, e não na raiz dela. Um relator encaixado
     num soquete tem como raiz a pilha que o contém: lida pela raiz, tocar no
     (2+3) faria o robô ANDAR em vez de mostrar 5 — bem no momento em que a
     criança está tentando entender quanto aquele pedaço vale. */
  const ws = carregar([{
    type: 'quando_play',
    inputs: { CORPO: { block: {
      type: 'mover_frente',
      inputs: { SEG: { block: {
        type: 'conta_mais', inputs: { A: num(2), B: num(3) },
      } } },
      fields: { VEL: '200' },
    } } },
  }]);
  assert.strictEqual(Blocos.pilhaDoBloco(achar(ws, 'conta_mais')), null);
});

test('o numerinho do encaixe também é relator', () => {
  /* O shadow é uma peça de verdade, com saída de valor. O evento de clique do
     Blockly entrega o shadow, e não o pai — está no setStartBlock, que só
     sobe para o pai no targetBlock_. Sem esta regra, tocar no corpo do
     numerinho rodaria a pilha. */
  const ws = carregar([{
    type: 'quando_play',
    inputs: { CORPO: { block: {
      type: 'esperar', inputs: { SEG: num(1) },
    } } },
  }]);
  const shadow = achar(ws, 'esperar').getInputTargetBlock('SEG');
  assert.strictEqual(shadow.isShadow(), true);
  assert.strictEqual(Blocos.pilhaDoBloco(shadow), null);
});

test('valorDoBloco traduz um relator, e recusa um comando', () => {
  const ws = carregar([{
    type: 'quando_play',
    inputs: { CORPO: { block: {
      type: 'mover_frente',
      inputs: { SEG: { block: {
        type: 'conta_mais', inputs: { A: num(2), B: num(3) },
      } } },
      fields: { VEL: '200' },
    } } },
  }]);
  const no = Blocos.valorDoBloco(achar(ws, 'conta_mais'));
  assert.strictEqual(no.op, 'mais');
  assert.strictEqual(no.a, 2);
  assert.strictEqual(no.b, 3);
  assert.strictEqual(Blocos.valorDoBloco(achar(ws, 'mover_frente')), null);
});

test('valorDoBloco lê o numerinho do encaixe', () => {
  const ws = carregar([{
    type: 'quando_play',
    inputs: { CORPO: { block: { type: 'esperar', inputs: { SEG: num(7) } } } },
  }]);
  const shadow = achar(ws, 'esperar').getInputTargetBlock('SEG');
  assert.strictEqual(Blocos.valorDoBloco(shadow), 7);
});

/* ---------- o que a voz diz de cada peça ---------- */

test('a descrição falada nomeia a ação, não o texto do bloco', () => {
  const ws = carregar([{ type: 'mover_frente' }]);
  const b = ws.getBlocksByType('mover_frente', false)[0];
  assert.strictEqual(Blocos.descrever(b), 'andar para frente');
});

/* "girar 90 graus" não diz nada a quem ainda não lê algarismo. O lado, sim:
   é o que a seta desenhada na peça já mostra. */
test('o girar diz o lado, que é o que a seta da peça mostra', () => {
  const ws = carregar([{ type: 'girar', fields: { DIR: '90' } },
                       { type: 'girar', fields: { DIR: '-90' } }]);
  const [d, e] = ws.getBlocksByType('girar', false);
  assert.strictEqual(Blocos.descrever(d), 'girar para a direita');
  assert.strictEqual(Blocos.descrever(e), 'girar para a esquerda');
});

/* ---------- as caixas com nome ---------- */

function carregarComCaixas(variaveis, estados) {
  const ws = new Blockly.Workspace();
  Blockly.Events.disable();
  try {
    Blockly.serialization.workspaces.load(
      { variables: variaveis,
        blocks: { languageVersion: 0, blocks: estados } }, ws);
  } finally {
    Blockly.Events.enable();
  }
  return ws;
}

function programaComCaixa(bloco) {
  return carregarComCaixas([{ name: 'voltas', id: 'v1' }],
    [{ type: 'quando_play', inputs: { CORPO: { block: bloco } } }]);
}

test('guardar leva o lugar do mapa e o nome da caixa', () => {
  Blocos.usarCaixas(Caixas.importar({ lugar: { v1: 3 } }));
  const ws = programaComCaixa({ type: 'caixa_guardar', id: 'g',
    fields: { CAIXA: { id: 'v1' } }, inputs: { VALOR: num(7) } });
  assert.deepStrictEqual(Blocos.workspaceParaAst(ws),
    [{ op: 'guardar', indice: 3, nome: 'voltas', valor: 7, blockId: 'g' }]);
});

test('mudar e ler viram os nós deles', () => {
  Blocos.usarCaixas(Caixas.importar({ lugar: { v1: 0 } }));
  const ws = programaComCaixa({ type: 'caixa_mudar', id: 'm',
    fields: { CAIXA: { id: 'v1' } },
    inputs: { VALOR: { block: { type: 'caixa_ler', id: 'l',
                                fields: { CAIXA: { id: 'v1' } } } } } });
  assert.deepStrictEqual(Blocos.workspaceParaAst(ws), [{
    op: 'mudar', indice: 0, nome: 'voltas', blockId: 'm',
    valor: { op: 'caixa', indice: 0, nome: 'voltas', blockId: 'l' },
  }]);
});

test('renomear mantém o lugar e troca o nome', () => {
  Blocos.usarCaixas(Caixas.importar({ lugar: { v1: 5 } }));
  const ws = programaComCaixa({ type: 'caixa_guardar', id: 'g',
    fields: { CAIXA: { id: 'v1' } }, inputs: { VALOR: num(1) } });
  Blockly.Events.disable();
  try { ws.renameVariableById('v1', 'pontos'); } finally { Blockly.Events.enable(); }
  const no = Blocos.workspaceParaAst(ws)[0];
  assert.strictEqual(no.indice, 5);
  assert.strictEqual(no.nome, 'pontos');
});

test('caixa sem lugar no mapa vira erro no bloco dela', () => {
  Blocos.usarCaixas(Caixas.importar(null));
  const ws = programaComCaixa({ type: 'caixa_guardar', id: 'g',
    fields: { CAIXA: { id: 'v1' } }, inputs: { VALOR: num(1) } });
  assert.throws(() => Blocos.workspaceParaAst(ws), (e) => e.blockId === 'g');
});

test('tocar no relator da caixa pergunta pela caixa', () => {
  Blocos.usarCaixas(Caixas.importar({ lugar: { v1: 2 } }));
  const ws = carregarComCaixas([{ name: 'voltas', id: 'v1' }],
    [{ type: 'caixa_ler', id: 'l', fields: { CAIXA: { id: 'v1' } } }]);
  assert.deepStrictEqual(Blocos.valorDoBloco(ws.getBlockById('l')),
    { op: 'caixa', indice: 2, nome: 'voltas', blockId: 'l' });
});

/* ---------- os blocos que ela inventa ---------- */

function erroDe(f) {
  try { f(); } catch (e) { return e; }
  assert.fail('devia ter lançado');
}

function ensinar(nome, corpo, id) {
  return { type: 'bloco_ensinar', id: id || ('def_' + nome), x: 400, y: 30,
           fields: { NOME: nome },
           inputs: corpo ? { CORPO: { block: corpo } } : {} };
}

function usar(nome, id, depois) {
  const b = { type: 'bloco_usar', id: id || ('uso_' + nome), fields: { NOME: nome } };
  if (depois) b.next = { block: depois };
  return b;
}

function noPlay(bloco) {
  return { type: 'quando_play', inputs: { CORPO: { block: bloco } } };
}

test('usar traz o corpo da definição, com os blockId de dentro dela', () => {
  const ws = carregar([
    ensinar('dançar', { type: 'girar', id: 'g', inputs: { GRAUS: num(90) } }),
    noPlay(usar('dançar', 'u')),
  ]);
  assert.deepStrictEqual(Blocos.workspaceParaAst(ws), [
    { op: 'usar', nome: 'dançar', blockId: 'u',
      corpo: [{ op: 'girar', graus: 90, blockId: 'g' }] },
  ]);
});

test('dois usos da mesma definição recebem o mesmo array', () => {
  const ws = carregar([
    ensinar('d', { type: 'parar', id: 'p' }),
    noPlay(usar('d', 'u1', usar('d', 'u2'))),
  ]);
  const ast = Blocos.workspaceParaAst(ws);
  assert.strictEqual(ast[0].corpo, ast[1].corpo);
});

test('a usa b traduz as duas camadas', () => {
  const ws = carregar([
    ensinar('b', { type: 'parar', id: 'p' }),
    ensinar('a', usar('b', 'ub')),
    noPlay(usar('a', 'ua')),
  ]);
  const ast = Blocos.workspaceParaAst(ws);
  assert.strictEqual(ast[0].corpo[0].op, 'usar');
  assert.strictEqual(ast[0].corpo[0].corpo[0].op, 'parar');
});

test('usar a si mesmo é erro na peça que fecha o ciclo', () => {
  const ws = carregar([
    ensinar('d', usar('d', 'dentro')),
    noPlay(usar('d', 'fora')),
  ]);
  const e = erroDe(() => Blocos.workspaceParaAst(ws));
  assert.match(e.message, /não pode usar a si mesmo/);
  assert.strictEqual(e.blockId, 'dentro');
});

test('ciclo de dois é erro na peça mais funda', () => {
  const ws = carregar([
    ensinar('a', usar('b', 'a_usa_b')),
    ensinar('b', usar('a', 'b_usa_a')),
    noPlay(usar('a', 'fora')),
  ]);
  assert.strictEqual(erroDe(() => Blocos.workspaceParaAst(ws)).blockId, 'b_usa_a');
});

test('peça sem definição é erro nela', () => {
  const ws = carregar([noPlay(usar('sumiu', 'u'))]);
  const e = erroDe(() => Blocos.workspaceParaAst(ws));
  assert.match(e.message, /não existe mais/);
  assert.strictEqual(e.blockId, 'u');
});

test('cabeça ensinar vazia é usar sem fazer nada', () => {
  const ws = carregar([ensinar('nada'), noPlay(usar('nada', 'u'))]);
  assert.deepStrictEqual(Blocos.workspaceParaAst(ws)[0].corpo, []);
});

test('tocar na cabeça ensinar roda o corpo, e não é o programa', () => {
  const ws = carregar([ensinar('d', { type: 'parar', id: 'p' }, 'def')]);
  const pilha = Blocos.pilhaDoBloco(ws.getBlockById('def'));
  assert.deepStrictEqual(pilha, { ast: [{ op: 'parar', blockId: 'p' }], ehPrograma: false });
  const dePeca = Blocos.pilhaDoBloco(ws.getBlockById('p'));
  assert.strictEqual(dePeca.ehPrograma, false);
});

test('a cabeça ensinar não é tarefa', () => {
  const ws = carregar([ensinar('d', { type: 'parar' })]);
  assert.strictEqual(Blocos.temTarefas(ws), false);
});

test('renomear a cabeça renomeia os usos', () => {
  const ws = carregar([ensinar('dançar', null, 'def'), noPlay(usar('dançar', 'u'))]);
  ws.getBlockById('def').getField('NOME').setValue('pular');
  assert.strictEqual(ws.getBlockById('u').getFieldValue('NOME'), 'pular');
});

/* O campo nasce com o nome padrão, e a carga põe o nome de verdade por cima.
   Se o validador tomasse isso por renomear, trocaria o nome de todos os usos
   de uma outra definição que por acaso se chama «meu bloco». */
test('carregar uma definição não renomeia os usos de outra', () => {
  const ws = carregar([ensinar('meu bloco', null, 'velha'), noPlay(usar('meu bloco', 'u'))]);
  Blockly.Events.disable();
  try {
    Blockly.serialization.blocks.append(ensinar('outro', null, 'nova'), ws);
  } finally {
    Blockly.Events.enable();
  }
  assert.strictEqual(ws.getBlockById('nova').getFieldValue('NOME'), 'outro');
  assert.strictEqual(ws.getBlockById('u').getFieldValue('NOME'), 'meu bloco');
});

test('carregar numa tela vazia de usos também não renomeia ninguém', () => {
  const ws = carregar([noPlay(usar('meu bloco', 'u'))]);
  Blockly.Events.disable();
  try {
    Blockly.serialization.blocks.append(ensinar('dançar', null, 'def'), ws);
  } finally {
    Blockly.Events.enable();
  }
  assert.strictEqual(ws.getBlockById('u').getFieldValue('NOME'), 'meu bloco');
});

test('nome repetido vira dançar2', () => {
  const ws = carregar([ensinar('dançar', null, 'a'), ensinar('outro', null, 'b')]);
  ws.getBlockById('b').getField('NOME').setValue('Dançar');
  assert.strictEqual(ws.getBlockById('b').getFieldValue('NOME'), 'Dançar2');
});

test('o nome da peça de usar volta igual depois de salvar e carregar', () => {
  const ws = carregar([ensinar('dançar'), noPlay(usar('dançar', 'u'))]);
  const salvo = Blockly.serialization.workspaces.save(ws);
  const outro = new Blockly.Workspace();
  Blockly.Events.disable();
  try { Blockly.serialization.workspaces.load(salvo, outro); }
  finally { Blockly.Events.enable(); }
  assert.strictEqual(outro.getBlockById('u').getFieldValue('NOME'), 'dançar');
});

test('vinte definições em cadeia traduzem em milissegundos', () => {
  const estados = [ensinar('b0', { type: 'parar' })];
  for (let i = 1; i <= 20; i++) {
    const anterior = 'b' + (i - 1);
    estados.push(ensinar('b' + i, usar(anterior, 'u' + i + 'a', usar(anterior, 'u' + i + 'b'))));
  }
  estados.push(noPlay(usar('b20', 'fora')));
  const ws = carregar(estados);
  const t0 = Date.now();
  const ast = Blocos.workspaceParaAst(ws);
  assert.ok(Date.now() - t0 < 500, 'demorou ' + (Date.now() - t0) + ' ms');
  assert.strictEqual(ast[0].corpo[0].corpo, ast[0].corpo[1].corpo);
});

test('acertarUsos esmaece quem perdeu a definição e acende quem a tem', () => {
  const ws = carregar([ensinar('d', null, 'def'), noPlay(usar('d', 'u'))]);
  Blocos.acertarUsos(ws);
  assert.strictEqual(ws.getBlockById('u').getColour(), Blocos.COR_BLOCO);
  ws.getBlockById('def').dispose(false);
  Blocos.acertarUsos(ws);
  assert.strictEqual(ws.getBlockById('u').getColour(), Blocos.COR_SEM_DEFINICAO);
});

/* ---------- entradas dos blocos inventados ---------- */

function cabecaCom(entradas) {
  const ws = carregar([{ type: 'bloco_ensinar', fields: { NOME: 'quadrado' },
                         extraState: { entradas: entradas } }]);
  return ws.getBlocksByType('bloco_ensinar', false)[0];
}

test('a cabeça guarda as entradas e as devolve na ordem', () => {
  const b = cabecaCom([{ id: 'e1', nome: 'lado' }, { id: 'e2', nome: 'cor' }]);
  assert.deepStrictEqual(Blocos.entradasDe(b),
    [{ id: 'e1', nome: 'lado' }, { id: 'e2', nome: 'cor' }]);
});

test('cada entrada vira um campo editável na cabeça', () => {
  const b = cabecaCom([{ id: 'e1', nome: 'lado' }]);
  assert.strictEqual(b.getFieldValue('ENT_e1'), 'lado');
});

test('getProcedureDef leva os nomes das entradas', () => {
  const b = cabecaCom([{ id: 'e1', nome: 'lado' }]);
  assert.deepStrictEqual(b.getProcedureDef(), ['quadrado', ['lado'], false]);
});

test('as entradas voltam iguais depois de salvar e carregar', () => {
  const b = cabecaCom([{ id: 'e1', nome: 'lado' }]);
  const estado = Blockly.serialization.blocks.save(b);
  const ws2 = carregar([estado]);
  const b2 = ws2.getBlocksByType('bloco_ensinar', false)[0];
  assert.deepStrictEqual(Blocos.entradasDe(b2), [{ id: 'e1', nome: 'lado' }]);
  assert.strictEqual(b2.getFieldValue('ENT_e1'), 'lado');
});

test('o ➕ some na terceira entrada', () => {
  const tres = [{ id: 'a', nome: 'x' }, { id: 'b', nome: 'y' },
                { id: 'c', nome: 'z' }];
  assert.ok(!cabecaCom(tres).getField('MAIS'), 'o ➕ não devia existir com 3');
  assert.ok(cabecaCom(tres.slice(0, 2)).getField('MAIS'), 'faltou o ➕ com 2');
});

test('esvaziar o nome de uma entrada apaga a entrada', async () => {
  const b = cabecaCom([{ id: 'e1', nome: 'lado' }, { id: 'e2', nome: 'cor' }]);
  b.setFieldValue('', 'ENT_e1');
  /* O validador remonta a fileira fora do próprio validador: o campo que está
     sendo validado morre junto com ela. */
  await new Promise((r) => setTimeout(r, 0));
  assert.deepStrictEqual(Blocos.entradasDe(b), [{ id: 'e2', nome: 'cor' }]);
  assert.ok(!b.getField('ENT_e1'), 'o campo da entrada apagada devia sumir');
});

test('renomear a entrada troca o nome e mantém o id', () => {
  const b = cabecaCom([{ id: 'e1', nome: 'lado' }]);
  b.setFieldValue('tamanho', 'ENT_e1');
  assert.deepStrictEqual(Blocos.entradasDe(b), [{ id: 'e1', nome: 'tamanho' }]);
});

/* O id nunca se repete dentro de uma cabeça: se «e1» fosse apagada e o próximo
   id voltasse a ser «e1», um uso que ficou para trás teria o buraco ENT_e1
   apontando calado para uma entrada nova. */
test('o id de uma entrada nova não reaproveita o de uma apagada', async () => {
  const b = cabecaCom([{ id: 'e1', nome: 'lado' }]);
  b.setFieldValue('', 'ENT_e1');
  await new Promise((r) => setTimeout(r, 0));
  b.novaEntrada_();
  assert.strictEqual(Blocos.entradasDe(b).length, 1);
  assert.notStrictEqual(Blocos.entradasDe(b)[0].id, 'e1');
});

/* ---------- a peça que lê a entrada ---------- */

/* Uma cabeça com entradas e uma peça roxa encaixada no girar de dentro. */
function ensinarComPecaRoxa(entradas, idDaPeca) {
  return {
    type: 'bloco_ensinar', id: 'def', fields: { NOME: 'quadrado' },
    extraState: { entradas: entradas },
    inputs: { CORPO: { block: {
      type: 'girar', id: 'g',
      inputs: { GRAUS: { block: {
        type: 'bloco_entrada', id: 'roxa',
        extraState: { id: idDaPeca, nome: 'lado' },
      } } },
    } } },
  };
}

test('a peça roxa dentro da cabeça vira nó de entrada', () => {
  const ws = carregar([ensinarComPecaRoxa([{ id: 'e1', nome: 'lado' }], 'e1')]);
  const ast = Blocos.pilhaDoBloco(ws.getBlockById('def')).ast;
  assert.strictEqual(ast[0].graus.op, 'entrada');
  assert.strictEqual(ast[0].graus.id, 'e1');
  assert.strictEqual(ast[0].graus.nome, 'lado');
  assert.strictEqual(ast[0].graus.blockId, 'roxa');
});

/* Fora da cabeça não há argumento nenhum para ler. Virar zero em silêncio
   esconderia da criança que a peça está no lugar errado. */
test('a peça roxa fora de qualquer cabeça é erro', () => {
  const ws = carregar([noPlay({
    type: 'girar', id: 'g',
    inputs: { GRAUS: { block: {
      type: 'bloco_entrada', id: 'roxa',
      extraState: { id: 'e1', nome: 'lado' },
    } } },
  })]);
  const e = erroDe(() => Blocos.workspaceParaAst(ws));
  assert.match(e.message, /só funciona dentro do bloco que você ensinou/);
  assert.strictEqual(e.blockId, 'roxa');
});

test('a peça roxa de uma entrada apagada é erro nela', () => {
  const ws = carregar([ensinarComPecaRoxa([], 'e1')]);
  const e = erroDe(() => Blocos.pilhaDoBloco(ws.getBlockById('def')));
  assert.match(e.message, /Essa entrada não existe mais/);
  assert.strictEqual(e.blockId, 'roxa');
});

/* Renomear a entrada não pode fazer a peça perder de quem ela é: ela guarda o
   id, e o nome que mostra vem da cabeça na hora de traduzir. */
test('a peça roxa segue a entrada renomeada, porque guarda o id', () => {
  const ws = carregar([ensinarComPecaRoxa([{ id: 'e1', nome: 'tamanho' }], 'e1')]);
  const ast = Blocos.pilhaDoBloco(ws.getBlockById('def')).ast;
  assert.strictEqual(ast[0].graus.nome, 'tamanho');
});
