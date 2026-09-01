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
  /* Navy: a última cor da marca que ainda não era bloco. Contas são a família
     nova, e precisavam de uma cor que não fosse nem movimento, nem laço, nem
     sensor. */
  var COR_CONTA     = '#002080';

  /* Num lugar só: os dois blocos de movimento oferecem as mesmas opções, e
     duplicá-las é como elas divergiriam. */
  /* Medidos no robô, e não escolhidos na régua: 120 e 150 não tiravam o chassi
     da inércia — a fonte mostrava corrente e as rodas ficavam paradas, que é
     motor travado puxando sem girar. Ver a seção Calibração do README. */
  var VELOCIDADES = [['normal', '200'], ['devagar', '180'], ['rápido', '225']];

  /* Os ícones que carregam sentido sozinhos são desenhados, não escritos.
     Eram caracteres — ⬆ ⬇ ↻ ↺ — e um caractere só existe se a fonte do
     aparelho tiver aquele desenho. As setas de rotação não estão na Roboto,
     que é a fonte do Android: num Galaxy o menu do girar virava um retângulo
     vazio, e no nível Pequeno, onde as palavras somem, a peça inteira ficava
     sem sinal nenhum. As setas de andar tinham a doença irmã: quando o
     aparelho as troca por emoji colorido, a largura muda depois de o Blockly
     já ter medido a peça, e ela sai torta.

     SVG embutido resolve os dois: desenho idêntico em qualquer aparelho, e
     medida que o Blockly conhece antes de montar o bloco. */
  function icone(desenho) {
    return 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      desenho + '</svg>');
  }

  var LADO_ICONE = 20;

  /* Seta grossa: haste larga e cabeça grande, para ler a 20px num tablet. */
  var SETA_CIMA  = icone('<path d="M12 2 L22 13 L16 13 L16 22 L8 22 L8 13 L2 13 Z" fill="#fff"/>');
  var SETA_BAIXO = icone('<path d="M12 22 L22 11 L16 11 L16 2 L8 2 L8 11 L2 11 Z" fill="#fff"/>');

  /* Volta de 270°, aberta em cima, com a ponta indicando para onde o giro vai.
     O anti-horário é o mesmo desenho espelhado — duas cópias divergiriam. */
  var VOLTA = '<path d="M12 4.5 A 7.5 7.5 0 1 1 4.5 12" fill="none"' +
              ' stroke="#fff" stroke-width="3" stroke-linecap="round"/>' +
              '<path d="M4.5 5.5 L9 13 L0 13 Z" fill="#fff"/>';
  var GIRO_HORARIO = icone(VOLTA);
  var GIRO_ANTI    = icone('<g transform="translate(24,0) scale(-1,1)">' +
                           VOLTA + '</g>');

  /* Nomeado, e não anônimo. O Blockly guarda os campos que vêm antes de um
     encaixe na fileira daquele encaixe: o ícone vem antes do SEG, e no Pequeno
     o SEG está escondido — a fileira some e leva o desenho junto. Quem reacende
     campo escondido é a tabela do nível, e ela só enxerga campo com nome. Por
     isso ICONE aparece no campos de todos os níveis, sempre true. */
  function imagem(src, alt) {
    return { type: 'field_image', name: 'ICONE', src: src,
             width: LADO_ICONE, height: LADO_ICONE, alt: alt };
  }

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
        message0: '%1 %2 %3 %4 %5',
        args0: [
          imagem(SETA_CIMA, 'para frente'),
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
        message0: '%1 %2 %3 %4 %5',
        args0: [
          imagem(SETA_BAIXO, 'para trás'),
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
        /* Cinco pedaços e não quatro: o LINHA_DIR existe só para dar ao menu
           uma fileira própria. O Blockly guarda os campos que vêm antes de um
           encaixe na fileira daquele encaixe, e o Pequeno e o Médio escondem o
           encaixe GRAUS para mostrar o menu no lugar do número. Sem esta
           divisão, esconder o encaixe demolia a fileira onde o menu morava: o
           corpo do bloco encolhia para 39px e o ícone continuava desenhado em
           x=75, boiando fora da peça. */
        message0: '%1 %2 %3 %4 %5',
        args0: [
          { type: 'field_label', name: 'T1', text: 'girar' },
          /* Só a seta. É o único texto que sobrava no nível Pequeno, e a
             seta de rotação diz sozinha para que lado o robô vira. */
          /* O menu aceita imagem no lugar do rótulo, e é o mesmo desenho
             que o resto dos blocos usa. O alt não é decoração: é o que o
             getText() devolve, e é por ele que o teste pergunta para que
             lado a peça diz que vira. */
          { type: 'field_dropdown', name: 'DIR', options: [
            [{ src: GIRO_HORARIO, width: LADO_ICONE, height: LADO_ICONE,
               alt: 'direita' }, '90'],
            [{ src: GIRO_ANTI, width: LADO_ICONE, height: LADO_ICONE,
               alt: 'esquerda' }, '-90'],
          ] },
          { type: 'input_dummy', name: 'LINHA_DIR' },
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
        type: 'conta_nao',
        message0: 'não %1',
        args0: [{ type: 'input_value', name: 'A', check: 'Boolean' }],
        inputsInline: true,
        output: 'Boolean',
        colour: COR_CONTA,
        tooltip: 'Vira o contrário: o que era sim vira não.',
      },
      {
        type: 'aleatorio',
        message0: '🎲 aleatório de %1 a %2',
        args0: [
          { type: 'input_value', name: 'A', check: 'Number' },
          { type: 'input_value', name: 'B', check: 'Number' },
        ],
        inputsInline: true,
        output: 'Number',
        colour: COR_CONTA,
        tooltip: 'Sorteia um número entre os dois, incluindo os dois.',
      },
      {
        /* Ciano, não navy: quem lê o mundo é a família do sensor. É este bloco
           que transforma o "se obstáculo" num caso particular. */
        type: 'distancia',
        message0: '👁 distância cm',
        output: 'Number',
        colour: COR_SENSOR,
        tooltip: 'Quantos centímetros até a coisa mais próxima na frente.',
      },
      {
        /* Amarelo: este decide o caminho, e decidir é da família do laço. O
           "se obstáculo" continua ciano porque ele sente. Os dois convivem no
           Gigante de propósito — o pronto e o geral do qual ele é exemplo. */
        type: 'se',
        message0: 'se %1 então',
        args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_LACO,
        tooltip: 'Faz os blocos de dentro só se a resposta for sim.',
      },
      {
        type: 'se_entao_senao',
        message0: 'se %1 então',
        args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        message2: 'senão',
        message3: '%1',
        args3: [{ type: 'input_statement', name: 'SENAO' }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_LACO,
        tooltip: 'Faz uns blocos se for sim, e outros se for não.',
      },
      {
        type: 'repetir_ate',
        message0: '🔁 repetir até %1',
        args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_LACO,
        tooltip: 'Repete os blocos de dentro até a resposta virar sim.',
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

    /* Nove contas com a mesma forma: dois encaixes e um símbolo no meio. Um
       laço em vez de nove objetos iguais — nove cópias é como elas divergem.

       Cada uma diz o que aceita e o que devolve, e isso não é burocracia: sem
       o tipo no encaixe, "andar frente (3 < 4) s" e "5 e 3" viram peças que
       encaixam e não querem dizer nada. O Blockly recusa antes de a criança
       apertar PLAY, que é o melhor momento para recusar.

                         entra      sai */
    var pares = [
      ['conta_mais',    '+',  'Number',  'Number'],
      ['conta_menos',   '−',  'Number',  'Number'],
      ['conta_vezes',   '×',  'Number',  'Number'],
      ['conta_dividir', '÷',  'Number',  'Number'],
      ['conta_menor',   '<',  'Number',  'Boolean'],
      ['conta_maior',   '>',  'Number',  'Boolean'],
      ['conta_igual',   '=',  'Number',  'Boolean'],
      ['conta_e',       'e',  'Boolean', 'Boolean'],
      ['conta_ou',      'ou', 'Boolean', 'Boolean'],
    ];
    var defs = [];
    for (var k = 0; k < pares.length; k++) {
      defs.push({
        type: pares[k][0],
        message0: '%1 ' + pares[k][1] + ' %2',
        args0: [
          { type: 'input_value', name: 'A', check: pares[k][2] },
          { type: 'input_value', name: 'B', check: pares[k][2] },
        ],
        inputsInline: true,
        output: pares[k][3],
        colour: COR_CONTA,
      });
    }
    Blockly.defineBlocksWithJsonArray(defs);
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

  function conta(nome, b) {
    return { op: nome, a: valorDe(b, 'A'), b: valorDe(b, 'B'), blockId: b.id };
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
      case 'conta_mais':    return conta('mais', b);
      case 'conta_menos':   return conta('menos', b);
      case 'conta_vezes':   return conta('vezes', b);
      case 'conta_dividir': return conta('dividir', b);
      case 'conta_menor':   return conta('menor', b);
      case 'conta_maior':   return conta('maior', b);
      case 'conta_igual':   return conta('igual', b);
      case 'conta_e':       return conta('e', b);
      case 'conta_ou':      return conta('ou', b);
      case 'aleatorio':     return conta('aleatorio', b);
      case 'conta_nao':
        return { op: 'nao', a: valorDe(b, 'A'), blockId: id };
      case 'distancia':
        return { op: 'distancia', blockId: id };
      case 'se':
        return { op: 'se', cond: valorDe(b, 'COND'),
                 corpo: pilhaParaAst(b.getInputTargetBlock('CORPO')), blockId: id };
      case 'se_entao_senao':
        return { op: 'se_entao_senao', cond: valorDe(b, 'COND'),
                 entao: pilhaParaAst(b.getInputTargetBlock('CORPO')),
                 senao: pilhaParaAst(b.getInputTargetBlock('SENAO')), blockId: id };
      case 'repetir_ate':
        return { op: 'repetir_ate', cond: valorDe(b, 'COND'),
                 corpo: pilhaParaAst(b.getInputTargetBlock('CORPO')), blockId: id };
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

  /* A peça que a criança tocou, traduzida em "o que rodar".

     A regra se lê no bloco tocado, e não na raiz da pilha dele. Um relator
     encaixado num soquete tem como raiz a pilha que o contém: lida pela raiz,
     tocar no (2 + 3) dentro de "andar frente [(2+3)] s" faria o robô andar em
     vez de dizer quanto aquilo vale — bem no caso em que a criança está
     tentando entender o pedaço.

     Devolve null para relator. Relator não roda, relata: quem trata é a
     bolha. */
  function pilhaDoBloco(bloco) {
    if (!bloco || bloco.outputConnection) return null;
    var raiz = bloco.getRootBlock();
    if (raiz.type === 'quando_play') {
      return { ast: pilhaParaAst(raiz.getInputTargetBlock('CORPO')),
               ehPrograma: true };
    }
    return { ast: pilhaParaAst(raiz), ehPrograma: false };
  }

  /* O nó de valor de um relator, para a bolha compilar a pergunta.

     O shadow de número não tem case no blocoParaNo — ele é o campo, não um
     bloco traduzível — então sai daqui direto como número. É o que faz tocar
     no "7" do encaixe responder 7. */
  function valorDoBloco(bloco) {
    if (!bloco || !bloco.outputConnection) return null;
    if (bloco.type === 'numero' || bloco.type === 'numero_bolinhas') {
      return Number(bloco.getFieldValue('NUM'));
    }
    return blocoParaNo(bloco);
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
              pilhaDoBloco: pilhaDoBloco,
              valorDoBloco: valorDoBloco,
              valorDe: valorDe,
              criarRaiz: criarRaiz, temTrabalho: temTrabalho, limpar: limpar,
              CAIXA_XML: CAIXA_XML };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Blocos = api;
})(typeof self !== 'undefined' ? self : globalThis);
