/* Quem é a conexão da vez, e quando tentar de novo depois de uma queda.

   O problema que isto resolve: uma reconexão já agendada por um soquete velho
   acorda depois de a página trocar de alvo, e sem número de geração abriria uma
   conexão a mais — que abre outra ao morrer, e mais outra. O app Android troca
   de alvo em pleno voo (App.irPara), então isto não é hipótese.

   Saiu do app.js pelo mesmo motivo do tentativas.js: é estado puro, e lá dentro
   só o Chromium o alcançava. Aqui o relógio é injetável e o teste roda em
   milissegundos. */
(function (raiz) {
  'use strict';

  var ATRASO_MS = 1500;

  /* opcoes.agendar: o setTimeout a usar. Existe para o teste poder passar um
     relógio de mentira; no navegador o padrão é o de verdade.
     opcoes.atrasoMs: quanto esperar antes de tentar de novo. */
  function criar(opcoes) {
    var op = opcoes || {};
    var agendar = op.agendar || function (f, ms) { return setTimeout(f, ms); };
    var atrasoMs = op.atrasoMs === undefined ? ATRASO_MS : op.atrasoMs;
    var geracao = 0;

    /* Começa uma conexão e devolve o crachá dela. Quem nasce por último é o
       atual; todos os anteriores viram passado no mesmo instante. */
    function nova() {
      var minha = ++geracao;
      return {
        souAtual: function () { return minha === geracao; },
        /* A queda de uma conexão velha não agenda nada: ela já foi substituída,
           e tentar de novo em nome dela é justamente a conexão a mais. */
        aoCair: function (tentarDeNovo) {
          if (minha !== geracao) return false;
          agendar(function () {
            if (minha === geracao) tentarDeNovo();
          }, atrasoMs);
          return true;
        },
      };
    }

    return { nova: nova, atrasoMs: atrasoMs };
  }

  var api = { criar: criar, ATRASO_MS: ATRASO_MS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Reconexao = api;
})(typeof self !== 'undefined' ? self : globalThis);
