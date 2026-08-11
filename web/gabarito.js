/* Monta o gabarito de uma missão como blocos, no vocabulário do nível.

   Está separado do app.js por um motivo prático: aqui não há DOM nem Blockly,
   então dá para conferir em Node, em milissegundos, que nenhuma fase monta uma
   peça que a criança daquele nível não sabe ler. Antes isso só apareceria no
   Chromium, quatro minutos depois — ou não apareceria, que foi o que
   aconteceu. */
(function (raiz) {
  'use strict';

  /* O teto das bolinhas. Acima disso o campo desiste do desenho e mostra o
     algarismo, e o clique nele volta para 1 em vez de passar de cinco: no
     Pequeno a criança não teria como construir a peça que o gabarito mostra.
     Tem que bater com CASAS em web/campos.js — há um teste guardando. */
  var MAX_BOLINHAS = 5;

  /* A velocidade da v1, a mesma que o compilador assume quando o nível não
     mostra o menu. */
  var VEL_PADRAO = '200';

  /* Enche de cinco em cinco e sobra o que sobrar: 12 = 5 + 5 + 2.
     Guloso e não equilibrado (6 vira 5 + 1, não 3 + 3) porque a regra precisa
     caber numa frase. Um "andar" solto no fim é legível; uma regra que às vezes
     divide bonito e às vezes não, não é. */
  function pedacos(n) {
    var v = Math.round(Number(n));
    var fora = [];
    if (!isFinite(v) || v < 1) return fora;
    while (v > MAX_BOLINHAS) {
      fora.push(MAX_BOLINHAS);
      v -= MAX_BOLINHAS;
    }
    fora.push(v);
    return fora;
  }

  function blocoAndar(segundos) {
    return { type: 'mover_frente',
             fields: { SEG: segundos, VEL: VEL_PADRAO } };
  }

  /* No Pequeno o caminho vira pilha de passos curtos, que é o vocabulário
     dela; nos outros vira um bloco só com os segundos somados, que é como
     alguém que lê número escreveria. Mesma distância, escrita na língua de quem
     está olhando. */
  function blocosDeAndar(passos, nivel, passoS) {
    var fora = [];
    var i, n;
    if (nivel !== 'pequeno') {
      /* Arredonda para o décimo, que é a precisão do campo. */
      fora.push(blocoAndar(Math.round(passos * passoS * 10) / 10));
      return fora;
    }
    var lista = pedacos(passos);
    for (i = 0; i < lista.length; i++) {
      n = lista[i];
      fora.push(n > 1
        ? { type: 'repetir', fields: { N: n },
            inputs: { CORPO: { block: blocoAndar(passoS) } } }
        : blocoAndar(passoS));
    }
    return fora;
  }

  /* Preenche DIR junto com GRAUS: o menu é o que a criança lê por ícone nos
     dois primeiros níveis, e deixá-lo no padrão faria um giro para a esquerda
     aparecer com a seta da direita. */
  function blocoGirar(graus) {
    return { type: 'girar',
             fields: { DIR: String(graus), GRAUS: graus } };
  }

  function blocosDoPasso(passo, nivel, passoS) {
    if (passo.girar !== undefined) return [blocoGirar(passo.girar)];
    return blocosDeAndar(passo.andar, nivel, passoS);
  }

  function montar(passos, nivel, passoS) {
    var lista = [];
    var i, j, blocos;
    for (i = 0; i < (passos || []).length; i++) {
      blocos = blocosDoPasso(passos[i], nivel, passoS);
      for (j = 0; j < blocos.length; j++) lista.push(blocos[j]);
    }

    /* Encadeia de trás para frente: cada bloco carrega o seguinte em "next". */
    var corpo = null;
    for (i = lista.length - 1; i >= 0; i--) {
      if (corpo) lista[i].next = { block: corpo };
      corpo = lista[i];
    }

    var raizNova = { type: 'quando_play', x: 40, y: 30 };
    if (corpo) raizNova.inputs = { CORPO: { block: corpo } };
    return { blocks: { languageVersion: 0, blocks: [raizNova] } };
  }

  var api = { montar: montar, pedacos: pedacos, MAX_BOLINHAS: MAX_BOLINHAS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Gabarito = api;
})(typeof self !== 'undefined' ? self : globalThis);
