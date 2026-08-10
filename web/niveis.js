/* Os três níveis. Um bloco nunca troca de tipo entre eles — muda quais campos
   ficam visíveis e o que a caixa oferece. É isso que faz a criança nunca perder
   trabalho ao subir de nível. */
(function (raiz) {
  'use strict';

  var LISTA = ['pequeno', 'medio', 'grande'];
  var NOMES = { pequeno: 'Pequeno', medio: 'Médio', grande: 'Grande' };

  /* Precisa bater com web/blocos.js: a cor da categoria na caixa e a cor do
     bloco que sai dela são a mesma coisa para a criança. */
  var COR_MOVIMENTO = '#0050f0', COR_LACO = '#f0c000', COR_SENSOR = '#20b0f0';

  /* T1 e T2 são as palavras dos blocos. Elas são campos justamente para poderem
     sumir no Pequeno — se fossem texto cru do message0, sobrariam na tela
     coisas como "⬆ andar frente  s" depois de esconder o número. */
  var DEFINICOES = {
    pequeno: {
      blocos: ['mover_frente', 'mover_tras', 'girar', 'repetir'],
      /* campo -> visível neste nível? */
      campos: { T1: false, T2: false, SEG: false, VEL: false,
                DIR: true, GRAUS: false, N: true, CM: true },
      bolinhas: true,
    },
    medio: {
      blocos: ['mover_frente', 'mover_tras', 'girar', 'esperar', 'repetir', 'se_obstaculo'],
      campos: { T1: true, T2: true, SEG: true, VEL: false,
                DIR: true, GRAUS: false, N: true, CM: true },
      bolinhas: false,
    },
    grande: {
      blocos: ['mover_frente', 'mover_tras', 'girar', 'esperar', 'repetir', 'se_obstaculo'],
      campos: { T1: true, T2: true, SEG: true, VEL: true,
                DIR: false, GRAUS: true, N: true, CM: true },
      bolinhas: false,
    },
  };

  function definicao(nivel) {
    return DEFINICOES[nivel] || DEFINICOES.medio;
  }

  /* No Pequeno os blocos saem da caixa já preenchidos: meio segundo de
     movimento e um quarto de volta para cada lado. */
  var PRE_PREENCHIDO = {
    pequeno: {
      mover_frente: '<field name="SEG">0.5</field>',
      mover_tras:   '<field name="SEG">0.5</field>',
    },
  };

  function bloco(tipo, campos) {
    return '<block type="' + tipo + '">' + (campos || '') + '</block>';
  }

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
        movimento += bloco('girar', '<field name="DIR">90</field>');
        movimento += bloco('girar', '<field name="DIR">-90</field>');
      } else {
        movimento += bloco('girar');
      }
    }
    if (tem('esperar')) movimento += bloco('esperar');

    var xml = '<xml id="caixa" style="display: none">';
    /* Nomes curtos e em verbo: cabem na aba, e uma criança de quatro anos lê
       "Mover" antes de ler "Movimento". */
    xml += '<category name="Mover" colour="' + COR_MOVIMENTO + '">' + movimento + '</category>';
    if (tem('repetir')) {
      xml += '<category name="Repetir" colour="' + COR_LACO + '">' +
             bloco('repetir') + '</category>';
    }
    if (tem('se_obstaculo')) {
      xml += '<category name="Sentir" colour="' + COR_SENSOR + '">' +
             bloco('se_obstaculo') + '</category>';
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
      for (var nome of Object.keys(campos)) {
        var campo = b.getField(nome);
        if (campo) campo.setVisible(campos[nome]);
      }
      /* O "repetir" é sempre o mesmo campo, com a mesma faixa de 1 a 100. Só
         o desenho muda: bolinhas para quem não lê, algarismo para quem lê. */
      var n = b.getField('N');
      if (n && n.setModoBolinhas) n.setModoBolinhas(def.bolinhas);

      /* O girar tem dois controles para o mesmo valor. O menu é o que a
         criança lê por ícone, mas ele só sabe dizer 90 e -90. Um ângulo
         qualquer, herdado do nível Grande, não cabe nele — e mostrar
         "direita" num bloco que vira 45 graus seria mentira. Mesma regra das
         bolinhas: quando o controle simples não representa o valor, mostra o
         honesto. */
      var dir = b.getField('DIR'), graus = b.getField('GRAUS');
      if (dir && graus) {
        var g = Number(b.getFieldValue('GRAUS'));
        var cabeNoMenu = (g === 90 || g === -90);
        if (cabeNoMenu && dir.getValue() !== String(g)) dir.setValue(String(g));
        if (!campos.GRAUS) {          /* Pequeno e Médio: o menu é o normal */
          dir.setVisible(cabeNoMenu);
          graus.setVisible(!cabeNoMenu);
        }
        /* "graus" é a unidade do número. Sem o número na tela vira texto solto:
           o bloco leria "girar direita graus". */
        var t2 = b.getField('T2');
        if (t2 && campos.T2) t2.setVisible(graus.isVisible());
      }
      if (b.render) b.render();
    }
  }

  var CHAVE = 'robo_nivel';
  var temArmazenamento = typeof localStorage !== 'undefined';

  function atual() {
    var v = temArmazenamento ? localStorage.getItem(CHAVE) : null;
    return LISTA.indexOf(v) >= 0 ? v : 'medio';
  }

  function definir(nivel) {
    var v = LISTA.indexOf(nivel) >= 0 ? nivel : 'medio';
    if (temArmazenamento) localStorage.setItem(CHAVE, v);
    return v;
  }

  var api = { LISTA: LISTA, NOMES: NOMES, definicao: definicao,
              caixaXml: caixaXml, aplicar: aplicar,
              atual: atual, definir: definir };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Niveis = api;
})(typeof self !== 'undefined' ? self : globalThis);
