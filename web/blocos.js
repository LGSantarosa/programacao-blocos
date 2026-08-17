/* Os blocos e a tradução do workspace para a AST do compilador. */
(function (raiz) {
  'use strict';

  /* Paleta da Educação Criativa, medida do logo da própria plataforma:
     azul royal #0050f0, ciano #20b0f0, navy #002080 e amarelo #f0c000.

     Mover em azul e Sentir em ciano é a mesma escolha do Scratch, onde
     movimento e sensores são dois azuis vizinhos — perto o bastante para
     parecerem família, distintos o bastante para não confundir.

     O "quando apertar PLAY" fica verde, igual ao botão PLAY: liga o bloco ao
     gesto. Verde de partida é convenção que a criança encontra em todo lugar,
     então não vale trocar por cor de marca. */
  var COR_MOVIMENTO = '#0050f0';
  var COR_LACO      = '#f0c000';
  var COR_SENSOR    = '#20b0f0';
  var COR_INICIO    = '#37c26b';

  /* Num lugar só: os dois blocos de movimento oferecem as mesmas opções, e
     duplicá-las é como elas divergiriam. */
  var VELOCIDADES = [['normal', '200'], ['devagar', '120'], ['rápido', '255']];

  var extensaoPronta = false;

  /* GRAUS é a fonte de verdade; o menu direita/esquerda é só um editor
     amigável dela. É isso que deixa o compilador ignorar o nível. */
  function registrarExtensao() {
    if (extensaoPronta || typeof Blockly === 'undefined') return;
    if (Blockly.Extensions.isRegistered &&
        Blockly.Extensions.isRegistered('girar_dir_escreve_graus')) {
      extensaoPronta = true;
      return;
    }
    Blockly.Extensions.register('girar_dir_escreve_graus', function () {
      var bloco = this;
      bloco.getField('DIR').setValidator(function (novo) {
        /* O menu escreve no shadow que mora no encaixe. Se a criança soltou
           uma conta ali, não há o que escrever — e nem faria sentido: o menu
           já não representa aquele valor, e o Niveis.aplicar esconde o menu. */
        var dentro = bloco.getInputTargetBlock('GRAUS');
        if (dentro && dentro.type === 'numero') {
          dentro.setFieldValue(Number(novo), 'NUM');
        }
        return novo;
      });
    });
    extensaoPronta = true;
  }

  function definir() {
    registrarExtensao();
    Blockly.defineBlocksWithJsonArray([
      {
        type: 'quando_play',
        message0: '▶ quando apertar PLAY',
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        colour: COR_INICIO,
        tooltip: 'Tudo que estiver aqui dentro roda quando a criança apertar PLAY.',
      },
      {
        type: 'mover_frente',
        /* O ícone é texto cru porque aparece em todos os níveis; as palavras
           são campos porque precisam sumir no Pequeno. */
        message0: '⬆ %1 %2 %3 %4',
        args0: [
          { type: 'field_label', name: 'T1', text: 'andar frente' },
          { type: 'input_value', name: 'SEG', check: 'Number' },
          { type: 'field_label', name: 'T2', text: 's' },
          { type: 'field_dropdown', name: 'VEL', options: VELOCIDADES },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        colour: COR_MOVIMENTO,
        tooltip: 'O robô anda para frente pelo tempo escolhido.',
      },
      {
        type: 'mover_tras',
        message0: '⬇ %1 %2 %3 %4',
        args0: [
          { type: 'field_label', name: 'T1', text: 'andar trás' },
          { type: 'input_value', name: 'SEG', check: 'Number' },
          { type: 'field_label', name: 'T2', text: 's' },
          { type: 'field_dropdown', name: 'VEL', options: VELOCIDADES },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        colour: COR_MOVIMENTO,
        tooltip: 'O robô anda de ré pelo tempo escolhido.',
      },
      {
        type: 'girar',
        message0: '%1 %2 %3 %4',
        args0: [
          { type: 'field_label', name: 'T1', text: 'girar' },
          /* Só a seta. É o único texto que sobrava no nível Pequeno, e a
             seta de rotação diz sozinha para que lado o robô vira. */
          { type: 'field_dropdown', name: 'DIR', options: [
            ['↻', '90'], ['↺', '-90'],
          ] },
          { type: 'input_value', name: 'GRAUS', check: 'Number' },
          { type: 'field_label', name: 'T2', text: 'graus' },
        ],
        inputsInline: true,
        extensions: ['girar_dir_escreve_graus'],
        previousStatement: null,
        nextStatement: null,
        colour: COR_MOVIMENTO,
        tooltip: 'O robô gira no lugar.',
      },
      {
        type: 'esperar',
        message0: '⏸ %1 %2 %3',
        args0: [
          { type: 'field_label', name: 'T1', text: 'esperar' },
          { type: 'input_value', name: 'SEG', check: 'Number' },
          { type: 'field_label', name: 'T2', text: 's' },
        ],
        inputsInline: true,
        previousStatement: null,
        nextStatement: null,
        colour: COR_MOVIMENTO,
        tooltip: 'O robô fica parado pelo tempo escolhido.',
      },
      {
        type: 'repetir',
        message0: '🔁 %1 %2 %3',
        args0: [
          { type: 'field_label', name: 'T1', text: 'repetir' },
          { type: 'input_value', name: 'N', check: 'Number' },
          { type: 'field_label', name: 'T2', text: 'vezes' },
        ],
        inputsInline: true,
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_LACO,
        tooltip: 'Repete os blocos de dentro o número de vezes escolhido.',
      },
      {
        type: 'se_obstaculo',
        message0: '👁 %1 %2 %3',
        args0: [
          { type: 'field_label', name: 'T1', text: 'se obstáculo a menos de' },
          { type: 'input_value', name: 'CM', check: 'Number' },
          { type: 'field_label', name: 'T2', text: 'cm' },
        ],
        inputsInline: true,
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_SENSOR,
        tooltip: 'Só faz os blocos de dentro se tiver algo perto na frente.',
      },
      {
        type: 'repetir_sempre',
        /* Texto cru, não campo: não acompanha número nenhum, então não tem
           motivo para sumir no Pequeno — e um bloco herdado do Grande que
           descesse de nível viraria um 🔁 mudo, igual ao repetir comum. */
        message0: '🔁 repetir para sempre',
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        previousStatement: null,
        /* Sem nextStatement de propósito: nada depois dele jamais roda, e o
           encaixe de baixo seria uma promessa falsa. */
        colour: COR_LACO,
        tooltip: 'Repete os blocos de dentro sem parar, até apertar PARAR.',
      },
      {
        type: 'parar',
        message0: '🛑 parar tudo',
        previousStatement: null,
        /* Idem: o programa acaba aqui. */
        colour: COR_MOVIMENTO,
        tooltip: 'O robô para e o programa acaba, mesmo dentro de um repetir.',
      },
      {
        type: 'se_senao',
        message0: '👁 %1 %2 %3',
        args0: [
          { type: 'field_label', name: 'T1', text: 'se obstáculo a menos de' },
          { type: 'input_value', name: 'CM', check: 'Number' },
          { type: 'field_label', name: 'T2', text: 'cm' },
        ],
        inputsInline: true,
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        /* Texto cru: é o que separa os dois ramos, e um bloco herdado do
           Grande precisa continuar legível num nível abaixo. */
        message2: 'senão',
        message3: '%1',
        args3: [{ type: 'input_statement', name: 'SENAO' }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_SENSOR,
        tooltip: 'Faz uns blocos se tiver algo perto na frente, e outros se não tiver.',
      },
      {
        type: 'repetir_ate_perto',
        /* Amarelo com olho: a forma e a cor dizem laço, que é o conceito; o
           ícone diz sensor. Ciano ensinaria a coisa errada — o que ele faz é
           repetir. */
        message0: '🔁👁 %1 %2 %3',
        args0: [
          { type: 'field_label', name: 'T1', text: 'repetir até chegar a menos de' },
          { type: 'input_value', name: 'CM', check: 'Number' },
          { type: 'field_label', name: 'T2', text: 'cm' },
        ],
        inputsInline: true,
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_LACO,
        tooltip: 'Repete os blocos de dentro até o robô chegar perto de alguma coisa.',
      },
    ]);
  }

  var CAIXA_XML =
    '<xml id="caixa" style="display: none">' +
    '  <category name="Movimento" colour="' + COR_MOVIMENTO + '">' +
    '    <block type="mover_frente"></block>' +
    '    <block type="mover_tras"></block>' +
    '    <block type="girar"></block>' +
    '    <block type="esperar"></block>' +
    '  </category>' +
    '  <category name="Repetir" colour="' + COR_LACO + '">' +
    '    <block type="repetir"></block>' +
    '  </category>' +
    '  <category name="Sentidos" colour="' + COR_SENSOR + '">' +
    '    <block type="se_obstaculo"></block>' +
    '  </category>' +
    '</xml>';

  /* O que está dentro de um encaixe: o número do shadow, ou a conta que a
     criança soltou em cima dele. Encaixe vazio vale zero — acontece quando ela
     arranca o shadow, e um programa que explode por isso seria pior. */
  function valorDe(bloco, nome) {
    var dentro = bloco.getInputTargetBlock(nome);
    if (!dentro) return 0;
    if (dentro.type === 'numero' || dentro.type === 'numero_bolinhas') {
      return Number(dentro.getFieldValue('NUM'));
    }
    return blocoParaNo(dentro);
  }

  function blocoParaNo(b) {
    var id = b.id;
    switch (b.type) {
      case 'mover_frente':
        return { op: 'frente', segundos: valorDe(b, 'SEG'),
                 velocidade: Number(b.getFieldValue('VEL')), blockId: id };
      case 'mover_tras':
        return { op: 'tras', segundos: valorDe(b, 'SEG'),
                 velocidade: Number(b.getFieldValue('VEL')), blockId: id };
      case 'girar':
        return { op: 'girar', graus: valorDe(b, 'GRAUS'), blockId: id };
      case 'esperar':
        return { op: 'esperar', segundos: valorDe(b, 'SEG'), blockId: id };
      case 'repetir':
        return {
          op: 'repetir',
          vezes: valorDe(b, 'N'),
          corpo: pilhaParaAst(b.getInputTargetBlock('CORPO')),
          blockId: id,
        };
      case 'se_obstaculo':
        return {
          op: 'se_obstaculo',
          cm: valorDe(b, 'CM'),
          corpo: pilhaParaAst(b.getInputTargetBlock('CORPO')),
          blockId: id,
        };
      case 'parar':
        return { op: 'parar', blockId: id };
      case 'repetir_sempre':
        return {
          op: 'repetir_sempre',
          corpo: pilhaParaAst(b.getInputTargetBlock('CORPO')),
          blockId: id,
        };
      case 'se_senao':
        return {
          op: 'se_senao',
          cm: valorDe(b, 'CM'),
          entao: pilhaParaAst(b.getInputTargetBlock('CORPO')),
          senao: pilhaParaAst(b.getInputTargetBlock('SENAO')),
          blockId: id,
        };
      case 'repetir_ate_perto':
        return {
          op: 'repetir_ate_perto',
          cm: valorDe(b, 'CM'),
          corpo: pilhaParaAst(b.getInputTargetBlock('CORPO')),
          blockId: id,
        };
      default:
        throw new Error('Bloco sem tradução: ' + b.type);
    }
  }

  function pilhaParaAst(bloco) {
    var nos = [];
    while (bloco) {
      if (bloco.isEnabled() && !bloco.isInsertionMarker()) {
        nos.push(blocoParaNo(bloco));
      }
      bloco = bloco.getNextBlock();
    }
    return nos;
  }

  function workspaceParaAst(workspace) {
    var raizes = workspace.getBlocksByType('quando_play', false);
    if (raizes.length === 0) return [];
    return pilhaParaAst(raizes[0].getInputTargetBlock('CORPO'));
  }

  /* A raiz nasce fixa: a criança não precisa saber que ela existe, e não pode
     apagá-la sem querer — sem ela o PLAY não tem por onde começar. */
  function criarRaiz(workspace) {
    var raiz = Blockly.serialization.blocks.append(
      { type: 'quando_play', x: 40, y: 30 }, workspace);
    raiz.setDeletable(false);
    raiz.setMovable(false);
    return raiz;
  }

  /* Tem alguma coisa além da raiz fixa? Conta bloco solto também: um bloco
     arrastado para o canto e nunca encaixado continua sendo trabalho dela, e
     apagá-lo sem avisar seria a mesma perda. */
  function temTrabalho(workspace) {
    var todos = workspace.getAllBlocks(false);
    for (var i = 0; i < todos.length; i++) {
      if (todos[i].type !== 'quando_play') return true;
    }
    return false;
  }

  /* setDeletable(false) impede a criança de apagar, não o programa: o clear do
     Blockly leva a raiz junto, por isso ela é recriada aqui. */
  function limpar(workspace) {
    workspace.clear();
    return criarRaiz(workspace);
  }

  var api = { definir: definir, workspaceParaAst: workspaceParaAst,
              valorDe: valorDe,
              criarRaiz: criarRaiz, temTrabalho: temTrabalho, limpar: limpar,
              CAIXA_XML: CAIXA_XML };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Blocos = api;
})(typeof self !== 'undefined' ? self : globalThis);
