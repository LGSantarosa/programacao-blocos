/* Os seis blocos da v1 e a tradução do workspace para a AST do compilador. */
(function (raiz) {
  'use strict';

  const COR_MOVIMENTO = 210;
  const COR_LACO = 120;
  const COR_SENSOR = 20;
  const COR_INICIO = 40;

  function definir() {
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
        message0: 'andar frente %1 s',
        args0: [{ type: 'field_number', name: 'SEG', value: 1, min: 0.1, max: 10, precision: 0.1 }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_MOVIMENTO,
        tooltip: 'O robô anda para frente pelo tempo escolhido.',
      },
      {
        type: 'mover_tras',
        message0: 'andar trás %1 s',
        args0: [{ type: 'field_number', name: 'SEG', value: 1, min: 0.1, max: 10, precision: 0.1 }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_MOVIMENTO,
        tooltip: 'O robô anda de ré pelo tempo escolhido.',
      },
      {
        type: 'girar',
        message0: 'girar %1',
        args0: [{
          type: 'field_dropdown',
          name: 'DIR',
          options: [['direita ↻', '90'], ['esquerda ↺', '-90']],
        }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_MOVIMENTO,
        tooltip: 'O robô gira um quarto de volta.',
      },
      {
        type: 'esperar',
        message0: 'esperar %1 s',
        args0: [{ type: 'field_number', name: 'SEG', value: 1, min: 0.1, max: 10, precision: 0.1 }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_MOVIMENTO,
        tooltip: 'O robô fica parado pelo tempo escolhido.',
      },
      {
        type: 'repetir',
        message0: 'repetir %1 vezes',
        args0: [{ type: 'field_number', name: 'N', value: 4, min: 1, max: 100, precision: 1 }],
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_LACO,
        tooltip: 'Repete os blocos de dentro o número de vezes escolhido.',
      },
      {
        type: 'se_obstaculo',
        message0: 'se obstáculo a menos de %1 cm',
        args0: [{ type: 'field_number', name: 'CM', value: 20, min: 2, max: 400, precision: 1 }],
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_SENSOR,
        tooltip: 'Só faz os blocos de dentro se tiver algo perto na frente.',
      },
    ]);
  }

  const CAIXA_XML =
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

  function blocoParaNo(b) {
    const id = b.id;
    switch (b.type) {
      case 'mover_frente':
        return { op: 'frente', segundos: Number(b.getFieldValue('SEG')), blockId: id };
      case 'mover_tras':
        return { op: 'tras', segundos: Number(b.getFieldValue('SEG')), blockId: id };
      case 'girar':
        return { op: 'girar', graus: Number(b.getFieldValue('DIR')), blockId: id };
      case 'esperar':
        return { op: 'esperar', segundos: Number(b.getFieldValue('SEG')), blockId: id };
      case 'repetir':
        return {
          op: 'repetir',
          vezes: Number(b.getFieldValue('N')),
          corpo: pilhaParaAst(b.getInputTargetBlock('CORPO')),
          blockId: id,
        };
      case 'se_obstaculo':
        return {
          op: 'se_obstaculo',
          cm: Number(b.getFieldValue('CM')),
          corpo: pilhaParaAst(b.getInputTargetBlock('CORPO')),
          blockId: id,
        };
      default:
        throw new Error('Bloco sem tradução: ' + b.type);
    }
  }

  function pilhaParaAst(bloco) {
    const nos = [];
    while (bloco) {
      if (bloco.isEnabled() && !bloco.isInsertionMarker()) {
        nos.push(blocoParaNo(bloco));
      }
      bloco = bloco.getNextBlock();
    }
    return nos;
  }

  function workspaceParaAst(workspace) {
    const raizes = workspace.getBlocksByType('quando_play', false);
    if (raizes.length === 0) return [];
    return pilhaParaAst(raizes[0].getInputTargetBlock('CORPO'));
  }

  raiz.Blocos = { definir, workspaceParaAst, CAIXA_XML };
})(typeof self !== 'undefined' ? self : globalThis);
