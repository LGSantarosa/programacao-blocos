/* Os três níveis. Um bloco nunca troca de tipo entre eles — muda quais campos
   ficam visíveis e o que a caixa oferece. É isso que faz a criança nunca perder
   trabalho ao subir de nível. */
(function (raiz) {
  'use strict';

  const LISTA = ['pequeno', 'medio', 'grande'];
  const NOMES = { pequeno: 'Pequeno', medio: 'Médio', grande: 'Grande' };

  const COR_MOVIMENTO = 210, COR_LACO = 120, COR_SENSOR = 20;

  /* T1 e T2 são as palavras dos blocos. Elas são campos justamente para poderem
     sumir no Pequeno — se fossem texto cru do message0, sobrariam na tela
     coisas como "⬆ andar frente  s" depois de esconder o número. */
  const DEFINICOES = {
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
  const PRE_PREENCHIDO = {
    pequeno: {
      mover_frente: '<field name="SEG">0.5</field>',
      mover_tras:   '<field name="SEG">0.5</field>',
      girar:        null,   /* tratado à parte: são duas entradas */
    },
  };

  function bloco(tipo, campos) {
    return '<block type="' + tipo + '">' + (campos || '') + '</block>';
  }

  function caixaXml(nivel) {
    const def = definicao(nivel);
    const tem = (t) => def.blocos.indexOf(t) >= 0;
    const pre = PRE_PREENCHIDO[nivel] || {};

    let movimento = '';
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

    let xml = '<xml id="caixa" style="display: none">';
    xml += '<category name="Movimento" colour="' + COR_MOVIMENTO + '">' + movimento + '</category>';
    if (tem('repetir')) {
      xml += '<category name="Repetir" colour="' + COR_LACO + '">' +
             bloco('repetir') + '</category>';
    }
    if (tem('se_obstaculo')) {
      xml += '<category name="Sentidos" colour="' + COR_SENSOR + '">' +
             bloco('se_obstaculo') + '</category>';
    }
    xml += '</xml>';
    return xml;
  }

  /* Esconder um campo do Blockly não apaga o valor dele — é exatamente por
     isso que subir e descer de nível não perde nada. */
  function aplicar(workspace, nivel) {
    const def = definicao(nivel);
    const campos = def.campos;
    for (const b of workspace.getAllBlocks(false)) {
      for (const nome of Object.keys(campos)) {
        const campo = b.getField(nome);
        if (campo) campo.setVisible(campos[nome]);
      }
      /* O "repetir" é sempre o mesmo campo, com a mesma faixa de 1 a 100. Só
         o desenho muda: bolinhas para quem não lê, algarismo para quem lê. */
      const n = b.getField('N');
      if (n && n.setModoBolinhas) n.setModoBolinhas(def.bolinhas);

      /* O girar tem dois controles para o mesmo valor. O menu é o que a
         criança lê por ícone, mas ele só sabe dizer 90 e -90. Um ângulo
         qualquer, herdado do nível Grande, não cabe nele — e mostrar
         "direita" num bloco que vira 45 graus seria mentira. Mesma regra das
         bolinhas: quando o controle simples não representa o valor, mostra o
         honesto. */
      const dir = b.getField('DIR'), graus = b.getField('GRAUS');
      if (dir && graus) {
        const g = Number(b.getFieldValue('GRAUS'));
        const cabeNoMenu = (g === 90 || g === -90);
        if (cabeNoMenu && dir.getValue() !== String(g)) dir.setValue(String(g));
        if (!campos.GRAUS) {          /* Pequeno e Médio: o menu é o normal */
          dir.setVisible(cabeNoMenu);
          graus.setVisible(!cabeNoMenu);
        }
      }
      if (b.render) b.render();
    }
  }

  const CHAVE = 'robo_nivel';
  const temArmazenamento = typeof localStorage !== 'undefined';

  function atual() {
    const v = temArmazenamento ? localStorage.getItem(CHAVE) : null;
    return LISTA.indexOf(v) >= 0 ? v : 'medio';
  }

  function definir(nivel) {
    const v = LISTA.indexOf(nivel) >= 0 ? nivel : 'medio';
    if (temArmazenamento) localStorage.setItem(CHAVE, v);
    return v;
  }

  const api = { LISTA, NOMES, definicao, caixaXml, aplicar, atual, definir };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Niveis = api;
})(typeof self !== 'undefined' ? self : globalThis);
