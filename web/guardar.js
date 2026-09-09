/* Guarda o programa da criança entre uma visita e outra.

   O nível já ficava (niveis.js), o mudo já ficava (som.js), a fase já ficava
   (missoes.js). O trabalho dela, que é a única coisa na tela que ela fez com as
   próprias mãos, era o que se perdia: fechar a aba sem querer, o iPad dormir e
   o Safari descartar a página, o Android matar o app, o botão "voltar". Em
   todos, recomeçar do zero.

   Este arquivo não conhece Blockly nem DOM. Ele recebe um objeto já
   serializado e devolve um objeto — quem traduz workspace em objeto é o
   app.js, que é onde o Blockly mora. É a mesma separação do gabarito.js e do
   compilador.js, e pela mesma razão: assim dá para provar em Node, em
   milissegundos, que o programa volta como saiu. */
(function (raiz) {
  'use strict';

  var CHAVE = 'robo_programa';

  /* Consultado a cada chamada, e não uma vez na carga: o armazenamento pode
     simplesmente não existir, e é isso que permite ao teste ligá-lo e
     desligá-lo para provar os dois caminhos. */
  function caixa() {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch (e) {
      /* Alguns navegadores lançam só de tocar no nome, com cookies bloqueados. */
      return null;
    }
  }

  /* O nível vai junto com o programa, e não por organização: um programa do
     Grande não se desenha no Pequeno. Os blocos de controle não têm versão
     simplificada — um "se…senão" no Pequeno não é o "se obstáculo" com menos
     campos, é outra coisa — e é exatamente por isso que trocar de nível
     pergunta antes de apagar. Ressuscitar um programa de outro nível seria
     fazer em silêncio o que a troca de nível não se permite fazer sem
     perguntar. */
  function gravar(estado, nivel) {
    var c = caixa();
    if (!c) return false;
    try {
      c.setItem(CHAVE, JSON.stringify({ nivel: nivel, blocos: estado }));
      return true;
    } catch (e) {
      /* Navegação privada do Safari lança ao gravar; cota cheia também. Perder
         o backup é ruim, derrubar a página no meio da brincadeira é pior. */
      return false;
    }
  }

  /* Devolve o programa guardado, ou null — e null é resposta legítima em quatro
     casos: nunca houve nada, o armazenamento não existe, o que estava lá é
     ilegível, ou era de outro nível. Quem chama não precisa distinguir: em
     todos, a tela começa como sempre começou. */
  function ler(nivel) {
    var c = caixa();
    if (!c) return null;
    var cru;
    try {
      cru = c.getItem(CHAVE);
    } catch (e) {
      return null;
    }
    if (!cru) return null;
    var dados;
    try {
      dados = JSON.parse(cru);
    } catch (e) {
      /* Meia gravação, ou lixo de uma versão antiga do formato. */
      return null;
    }
    if (!dados || typeof dados !== 'object') return null;
    if (dados.nivel !== nivel) return null;
    if (!dados.blocos || typeof dados.blocos !== 'object') return null;
    return dados.blocos;
  }

  function esquecer() {
    var c = caixa();
    if (!c) return;
    try {
      c.removeItem(CHAVE);
    } catch (e) { /* não deu, e não faz mal */ }
  }

  var api = { gravar: gravar, ler: ler, esquecer: esquecer, CHAVE: CHAVE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Guardar = api;
})(typeof self !== 'undefined' ? self : globalThis);
