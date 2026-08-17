/* Os três níveis. Um bloco nunca troca de tipo entre eles — muda quais campos
   ficam visíveis e o que a caixa oferece. É isso que faz a criança nunca perder
   trabalho ao subir de nível. */
(function (raiz) {
  'use strict';

  var LISTA = ['pequeno', 'medio', 'grande', 'gigante'];
  var NOMES = { pequeno: 'Pequeno', medio: 'Médio', grande: 'Grande',
                gigante: 'Gigante' };

  /* Precisa bater com web/blocos.js: a cor da categoria na caixa e a cor do
     bloco que sai dela são a mesma coisa para a criança. */
  var COR_MOVIMENTO = '#0050f0', COR_LACO = '#f0c000', COR_SENSOR = '#20b0f0';
  var COR_CONTA = '#002080';

  /* T1 e T2 são as palavras dos blocos. Elas são campos justamente para poderem
     sumir no Pequeno — se fossem texto cru do message0, sobrariam na tela
     coisas como "⬆ andar frente  s" depois de esconder o número. */
  /* Cada encaixe nasce com o seu shadow, senão a peça sai da paleta com um
     buraco no lugar do número. O valor padrão é o que o campo tinha antes. */
  function encaixe(nome, tipo, valor) {
    return '<value name="' + nome + '">' +
           '<shadow type="' + tipo + '"><field name="NUM">' + valor +
           '</field></shadow></value>';
  }

  /* Quais encaixes cada bloco leva prontos ao sair da caixa, e com que número
     dentro. Escrito aqui e não deduzido do bloco porque a caixa é XML montado
     à mão, sem Blockly por perto.

     Os encaixes de verdadeiro/falso — a condição do "se", os lados do "e" —
     não aparecem: ali um número não responde pergunta nenhuma, e um shadow
     seria uma peça que não serve para nada. */
  var ENCAIXES = {
    mover_frente:      [['SEG', 'numero', 1]],
    mover_tras:        [['SEG', 'numero', 1]],
    girar:             [['GRAUS', 'numero', 90]],
    esperar:           [['SEG', 'numero', 1]],
    repetir:           [['N', 'numero_bolinhas', 4]],
    se_obstaculo:      [['CM', 'numero', 20]],
    se_senao:          [['CM', 'numero', 20]],
    repetir_ate_perto: [['CM', 'numero', 20]],
    conta_mais:        [['A', 'numero', 1], ['B', 'numero', 1]],
    conta_menos:       [['A', 'numero', 10], ['B', 'numero', 1]],
    conta_vezes:       [['A', 'numero', 2], ['B', 'numero', 3]],
    conta_dividir:     [['A', 'numero', 10], ['B', 'numero', 2]],
    aleatorio:         [['A', 'numero', 1], ['B', 'numero', 5]],
    conta_menor:       [['A', 'numero', 10], ['B', 'numero', 20]],
    conta_maior:       [['A', 'numero', 20], ['B', 'numero', 10]],
    conta_igual:       [['A', 'numero', 10], ['B', 'numero', 10]],
  };

  function bloco(tipo, dentro) {
    var partes = ENCAIXES[tipo] || [];
    var xml = '';
    for (var i = 0; i < partes.length; i++) {
      /* O que veio pronto (o passo fixo do Pequeno) manda; o resto vem no
         padrão. */
      if (!dentro || dentro.indexOf('name="' + partes[i][0] + '"') < 0) {
        xml += encaixe(partes[i][0], partes[i][1], partes[i][2]);
      }
    }
    return '<block type="' + tipo + '">' + (dentro || '') + xml + '</block>';
  }

  var DEFINICOES = {
    pequeno: {
      blocos: ['mover_frente', 'mover_tras', 'girar', 'repetir'],
      /* campo -> visível neste nível? */
      campos: { T1: false, T2: false, SEG: false, VEL: false,
                DIR: true, GRAUS: false, N: true, CM: true },
      bolinhas: true,
    },
    medio: {
      blocos: ['mover_frente', 'mover_tras', 'girar', 'esperar', 'parar',
               'repetir', 'repetir_sempre', 'se_obstaculo'],
      campos: { T1: true, T2: true, SEG: true, VEL: false,
                DIR: true, GRAUS: false, N: true, CM: true },
      bolinhas: false,
    },
    grande: {
      blocos: ['mover_frente', 'mover_tras', 'girar', 'esperar', 'parar',
               'repetir', 'repetir_sempre', 'repetir_ate_perto',
               'se_obstaculo', 'se_senao'],
      campos: { T1: true, T2: true, SEG: true, VEL: true,
                DIR: false, GRAUS: true, N: true, CM: true },
      bolinhas: false,
    },
  };

  /* O Gigante é o Grande mais as contas. Escrito a partir dele, e não como
     lista própria, porque um bloco novo no Grande tem que aparecer no Gigante
     — do contrário o degrau de cima teria menos peças que o de baixo. */
  DEFINICOES.gigante = {
    blocos: DEFINICOES.grande.blocos.concat([
      'conta_mais', 'conta_menos', 'conta_vezes', 'conta_dividir',
      'conta_menor', 'conta_maior', 'conta_igual',
      'conta_e', 'conta_ou', 'conta_nao', 'aleatorio',
      'distancia', 'se', 'se_entao_senao', 'repetir_ate',
    ]),
    campos: DEFINICOES.grande.campos,
    bolinhas: false,
  };

  function definicao(nivel) {
    return DEFINICOES[nivel] || DEFINICOES.medio;
  }

  /* No Pequeno os blocos saem da caixa já preenchidos: meio segundo de
     movimento e um quarto de volta para cada lado. */
  var PRE_PREENCHIDO = {
    pequeno: {
      mover_frente: encaixe('SEG', 'numero', '0.5'),
      mover_tras:   encaixe('SEG', 'numero', '0.5'),
    },
  };

  function caixaXml(nivel) {
    var def = definicao(nivel);
    var tem = function (t) { return def.blocos.indexOf(t) >= 0; };
    var pre = PRE_PREENCHIDO[nivel] || {};

    var movimento = '';
    if (tem('mover_frente')) movimento += bloco('mover_frente', pre.mover_frente);
    if (tem('mover_tras'))   movimento += bloco('mover_tras', pre.mover_tras);
    if (tem('girar')) {
      if (nivel === 'pequeno') {
        /* Duas entradas do mesmo bloco, uma por lado. Preenchemos DIR, não
           GRAUS: o validador de DIR escreve GRAUS, então uma fonte de verdade
           só. Preencher GRAUS deixaria o menu no padrão e as duas entradas
           apareceriam idênticas na tela — dois blocos iguais que viram para
           lados opostos. */
        movimento += bloco('girar',
          '<field name="DIR">90</field>' + encaixe('GRAUS', 'numero', 90));
        movimento += bloco('girar',
          '<field name="DIR">-90</field>' + encaixe('GRAUS', 'numero', -90));
      } else {
        movimento += bloco('girar');
      }
    }
    if (tem('esperar')) movimento += bloco('esperar');
    /* Azul, junto do movimento: é controle de fluxo e por essa lógica seria
       amarelo, mas o modelo mental de quem tem quatro anos é «blocos azuis são
       o que o robô faz», e parar é o que o robô faz. */
    if (tem('parar')) movimento += bloco('parar');

    var xml = '<xml id="caixa" style="display: none">';
    /* Nomes curtos e em verbo: cabem na aba, e uma criança de quatro anos lê
       "Mover" antes de ler "Movimento". */
    xml += '<category name="Mover" colour="' + COR_MOVIMENTO + '">' + movimento + '</category>';
    var laco = '';
    if (tem('repetir')) laco += bloco('repetir');
    if (tem('repetir_sempre')) laco += bloco('repetir_sempre');
    if (tem('repetir_ate_perto')) laco += bloco('repetir_ate_perto');
    /* O "se" e o "se…senão" gerais moram aqui, e não em Sentir: quem sente é o
       👁 ciano; estes decidem o caminho, que é o que a família amarela faz. */
    if (tem('se')) laco += bloco('se');
    if (tem('se_entao_senao')) laco += bloco('se_entao_senao');
    if (tem('repetir_ate')) laco += bloco('repetir_ate');
    if (laco) {
      xml += '<category name="Repetir" colour="' + COR_LACO + '">' +
             laco + '</category>';
    }

    var sentir = '';
    if (tem('se_obstaculo')) sentir += bloco('se_obstaculo');
    if (tem('se_senao')) sentir += bloco('se_senao');
    /* O distância mora aqui, com os olhos: a família que lê o mundo. */
    if (tem('distancia')) sentir += bloco('distancia');

    if (sentir) {
      xml += '<category name="Sentir" colour="' + COR_SENSOR + '">' +
             sentir + '</category>';
    }

    var contas = '';
    if (tem('conta_mais')) {
      contas += bloco('conta_mais') + bloco('conta_menos') +
                bloco('conta_vezes') + bloco('conta_dividir') +
                bloco('aleatorio') +
                bloco('conta_menor') + bloco('conta_maior') +
                bloco('conta_igual') +
                bloco('conta_e') + bloco('conta_ou') + bloco('conta_nao');
    }
    if (contas) {
      xml += '<category name="Contas" colour="' + COR_CONTA + '">' +
             contas + '</category>';
    }
    xml += '</xml>';
    return xml;
  }

  /* Esconder um campo do Blockly não apaga o valor dele — é exatamente por
     isso que subir e descer de nível não perde nada. */
  function aplicar(workspace, nivel) {
    var def = definicao(nivel);
    var campos = def.campos;
    for (var b of workspace.getAllBlocks(false)) {
      /* Duas passadas, e a ordem é o que faz funcionar. O Blockly guarda os
         campos que vêm antes de um encaixe na fileira daquele encaixe, então
         esconder o encaixe esconde o rótulo e o menu vizinhos — e mostrá-lo
         traz os dois de volta. Encaixes primeiro, campos depois: assim quem dá
         a palavra final sobre cada campo é a tabela do nível.

         É o encaixe que se esconde, e não o campo lá dentro: um campo
         escondido dentro do shadow deixaria o encaixe vazio aparecendo — um
         buraco na peça, pior que o número. */
      var nome;
      for (nome of Object.keys(campos)) {
        var entrada = b.getInput(nome);
        if (entrada) entrada.setVisible(campos[nome]);
      }
      for (nome of Object.keys(campos)) {
        if (b.getInput(nome)) continue;
        var campo = b.getField(nome);
        if (campo) campo.setVisible(campos[nome]);
      }
      /* O "repetir" é sempre o mesmo campo, com a mesma faixa de 1 a 100. Só
         o desenho muda: bolinhas para quem não lê, algarismo para quem lê. */
      var alvoN = b.getInput('N') && b.getInputTargetBlock('N');
      var n = alvoN ? alvoN.getField('NUM') : null;
      if (n && n.setModoBolinhas) n.setModoBolinhas(def.bolinhas);

      /* O girar tem dois controles para o mesmo valor. O menu é o que a
         criança lê por ícone, mas ele só sabe dizer 90 e -90. Um ângulo
         qualquer, herdado do nível Grande, não cabe nele — e mostrar
         "direita" num bloco que vira 45 graus seria mentira. Mesma regra das
         bolinhas: quando o controle simples não representa o valor, mostra o
         honesto. */
      var dir = b.getField('DIR'), entradaG = b.getInput('GRAUS');
      if (dir && entradaG) {
        /* Uma conta não cabe no menu de dois itens — do mesmo jeito que 45° não
           cabia. A regra não precisou de cláusula nova: quando o controle
           simples não representa o valor, aparece o honesto. */
        var dentro = b.getInputTargetBlock('GRAUS');
        var ehNumero = !!dentro && dentro.type === 'numero';
        var g = ehNumero ? Number(dentro.getFieldValue('NUM')) : NaN;
        var cabeNoMenu = (g === 90 || g === -90);
        if (cabeNoMenu && dir.getValue() !== String(g)) dir.setValue(String(g));
        if (!campos.GRAUS) {          /* Pequeno e Médio: o menu é o normal */
          /* Encaixe antes do menu, de novo: o menu mora na fileira do encaixe,
             e mostrá-lo depois é o que faz a escolha do menu valer. */
          entradaG.setVisible(!cabeNoMenu);
          dir.setVisible(cabeNoMenu);
        }
        /* "graus" é a unidade do número. Sem o número na tela vira texto solto:
           o bloco leria "girar direita graus". */
        var t2 = b.getField('T2');
        if (t2 && campos.T2) t2.setVisible(entradaG.isVisible());
      }
      if (b.render) b.render();
    }
  }

  var CHAVE = 'robo_nivel';
  var temArmazenamento = typeof localStorage !== 'undefined';

  var emMemoria = null;

  function atual() {
    var v = null;
    try {
      if (temArmazenamento) v = localStorage.getItem(CHAVE);
    } catch (e) { /* sem acesso */ }
    if (LISTA.indexOf(v) >= 0) return v;
    return LISTA.indexOf(emMemoria) >= 0 ? emMemoria : 'medio';
  }

  function definir(nivel) {
    var v = LISTA.indexOf(nivel) >= 0 ? nivel : 'medio';
    emMemoria = v;
    /* O Safari em navegação privada tem localStorage mas lança ao gravar. */
    try {
      if (temArmazenamento) localStorage.setItem(CHAVE, v);
    } catch (e) { /* só a memória, e tudo bem */ }
    return v;
  }

  var api = { LISTA: LISTA, NOMES: NOMES, definicao: definicao,
              caixaXml: caixaXml, aplicar: aplicar,
              atual: atual, definir: definir };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Niveis = api;
})(typeof self !== 'undefined' ? self : globalThis);
