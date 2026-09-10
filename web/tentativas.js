/* Quantas vezes a criança rodou o programa sem chegar na estrela, e quando a
   ajuda aparece sozinha por causa disso.

   Saiu do app.js porque é uma regra, não um desenho: dá para provar em
   milissegundos aqui, e só o Chromium a alcançava lá dentro — que custa
   minutos. Mesmo caminho que o gabarito.js, o compilador.js e o teclado.js já
   fizeram. */
(function (raiz) {
  'use strict';

  /* limite: quantas tentativas até a ajuda aparecer sem ser pedida. Vem de
     fora (Missoes.TENTATIVAS_ATE_AJUDA) para este arquivo não depender de
     ninguém e poder ser testado sozinho. */
  function criar(limite) {
    var n = 0;

    /* Uma execução terminou. Só conta como tentativa se:

       - de fato terminou (estava rodando e parou; ligar não conta);
       - a criança ainda não cumpriu a missão — chegar não é fracassar;
       - o que rodou foi o programa da âncora. Uma pilha solta rodada com o
         dedo é exploração, não tentativa: contá-la ofereceria o gabarito a
         quem está se divertindo, dizendo que fracassou.

       Devolve true quando esta execução foi a que destravou a ajuda, para
       quem chama saber que tem algo novo a mostrar. */
    function mudouRodando(antes, agora, cumpriu, ehPrograma) {
      if (!(antes && !agora)) return false;
      if (cumpriu || !ehPrograma) return false;
      var antesDaAjuda = n < limite;
      n++;
      return antesDaAjuda && n >= limite;
    }

    function zerar() { n = 0; }
    function quantas() { return n; }
    /* A ajuda uma vez destravada continua à mão: quem travou de novo não
       precisa travar tudo de novo para reencontrá-la. */
    function ajuda() { return n >= limite; }

    return { mudouRodando: mudouRodando, zerar: zerar,
             quantas: quantas, ajuda: ajuda };
  }

  var api = { criar: criar };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Tentativas = api;
})(typeof self !== 'undefined' ? self : globalThis);
