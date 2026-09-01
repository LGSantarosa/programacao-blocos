/* O teclado numérico da página.

   Ele existe por um defeito com nome. Em aparelho de toque, o editor de número
   do Blockly não é o campo em linha: é um window.prompt. Dentro do WebView do
   app, que não tem WebChromeClient, o prompt não abre nada e devolve null na
   hora — tocar no número do "andar frente 1 s" não fazia coisa nenhuma, e a
   única saída para chegar em 6 segundos era encaixar uma conta (2 × 3) no lugar
   do número.

   Trocar o prompt por um teclado nosso conserta os dois lados. O do app, que é
   o defeito; e o da criança, que é o teclado do sistema: doze teclas grandes
   num telefone deitado valem mais que um teclado inteiro cobrindo a tela, e não
   pedem que ela já saiba onde moram os algarismos.

   Este arquivo não conhece Blockly. Ele mostra uma caixa e devolve um texto —
   quem liga as duas coisas é o web/campos.js, que é onde os campos moram. */
(function (raiz) {
  'use strict';

  /* A vírgula é a do português: a criança escreve 0,5 porque é assim que ela vê
     meio escrito na escola. Quem converte para o ponto que o Number() entende é
     o texto(), na saída. */
  var VIRGULA = ',';

  /* Não há tecla de menos. Nenhum bloco deste projeto aceita número negativo —
     girar tem o menu direita/esquerda, e a velocidade é uma lista — então um
     sinal ali só ofereceria à criança um valor que o robô recusaria depois. */

  var caixa = null, elValor = null, elTitulo = null, elTeclas = null;
  var elNao = null, elSim = null;
  var texto = '';
  var recomecar = true;
  var responder = null;

  /* O toque fantasma, e por que estas três variáveis existem.

     Num aparelho de toque, o dedo que abre o teclado bate nele. A sequência é
     esta: o dedo encosta no número, o Blockly abre o editor no touchend, a
     caixa aparece embaixo do dedo — e o clique que o navegador sintetiza a
     partir daquele mesmo touchend é entregue a quem estiver no ponto agora,
     que passou a ser uma tecla, o "Deixa" ou o escuro em volta.

     No aparelho isso parecia outra coisa: trocar o número de um bloco dentro do
     ▶ quando apertar PLAY "não fazia nada", enquanto o mesmo bloco solto num
     canto funcionava. Não era o bloco estar dentro do verde — era o número
     ficar, ali, num ponto da tela onde a caixa nasce com o escuro ou o "Deixa"
     debaixo do dedo, e o fantasma fechava o teclado no instante em que ele
     abria. Solto noutro canto, o fantasma calhava de cair numa tecla, e aí
     mudava — só que mudava sozinho, digitando um algarismo que ninguém pediu.

     Como se reconhece um fantasma: o dedo dele encostou na tela ANTES de a
     caixa existir. Um toque de verdade numa tecla começa depois. Só isso, e
     nada de contar milissegundos.

     O jaHouveToque protege o contrário: num computador não existe fantasma
     nenhum, e sem ele um clique de mouse — ou o .click() de um teste — cairia
     na regra por nunca ter havido touchstart algum.

     É por isso que existe o preparar(): o ouvinte de toque tem de estar de pé
     ANTES do primeiro dedo. Pendurado só na primeira abertura ele chegava tarde
     — o toque que abriu a caixa já tinha passado, o jaHouveToque ainda era
     false, e o fantasma da primeira edição escapava inteiro. */
  var abertoEm = 0;
  var toqueComecouEm = 0;
  var jaHouveToque = false;

  function pegar(doc) {
    if (caixa) return true;
    if (!doc || !doc.getElementById) return false;
    caixa    = doc.getElementById('teclado');
    elValor  = doc.getElementById('teclado-valor');
    elTitulo = doc.getElementById('teclado-titulo');
    elTeclas = doc.getElementById('teclado-teclas');
    elNao    = doc.getElementById('teclado-nao');
    elSim    = doc.getElementById('teclado-sim');
    if (!caixa || !elValor || !elTeclas || !elNao || !elSim) {
      caixa = null;
      return false;
    }
    /* Um ouvinte na grade inteira, e não um por tecla: as teclas são fixas, e
       doze ouvintes seriam doze lugares para esquecer de tirar. */
    elTeclas.addEventListener('click', function (ev) {
      if (fantasma()) return;
      var alvo = ev.target;
      var tecla = alvo && alvo.getAttribute ? alvo.getAttribute('data-tecla') : null;
      if (tecla) apertar(tecla);
    });
    elNao.addEventListener('click', function () {
      if (fantasma()) return;
      fechar(null);
    });
    elSim.addEventListener('click', function () {
      if (fantasma()) return;
      fechar(texto);
    });
    /* Tocar no escuro em volta desiste, como nos outros diálogos da página. */
    caixa.addEventListener('click', function (ev) {
      if (fantasma()) return;
      if (ev.target === caixa) fechar(null);
    });
    /* Na captura, e no documento: o dedo que interessa é o que encosta em
       qualquer lugar, inclusive fora da caixa, e precisa ser anotado antes de
       qualquer manipulador de clique rodar. */
    if (doc.addEventListener) {
      doc.addEventListener('touchstart', function () {
        jaHouveToque = true;
        toqueComecouEm = Date.now();
      }, true);
    }
    return true;
  }

  /* Este clique é do dedo que abriu a caixa? Ver o comentário lá em cima. */
  function fantasma() {
    return jaHouveToque && toqueComecouEm <= abertoEm;
  }

  function desenhar() {
    /* Vazio mostra o zero em vez de uma caixa muda: a criança que apagou tudo
       precisa ver que o lugar continua ali esperando um número. */
    elValor.textContent = texto === '' ? '0' : texto;
  }

  function apertar(tecla) {
    if (tecla === 'apaga') {
      texto = texto.slice(0, -1);
      recomecar = false;
    } else if (tecla === VIRGULA) {
      if (recomecar) { texto = '0'; recomecar = false; }
      if (texto.indexOf(VIRGULA) < 0) texto += VIRGULA;
    } else {
      /* O primeiro algarismo troca o número inteiro, como numa calculadora.
         Quem toca no 5 querendo cinco não espera quinze. */
      if (recomecar) { texto = ''; recomecar = false; }
      /* Sem zero à esquerda: "05" é o mesmo cinco escrito de um jeito que a
         criança não escreveria. */
      texto = texto === '0' ? tecla : texto + tecla;
    }
    desenhar();
  }

  function aoTeclado(ev) {
    var k = ev.key;
    if (k >= '0' && k <= '9') apertar(k);
    else if (k === ',' || k === '.') apertar(VIRGULA);
    else if (k === 'Backspace') apertar('apaga');
    else if (k === 'Enter') fechar(texto);
    else if (k === 'Escape') fechar(null);
    else return;
    ev.preventDefault();
  }

  function fechar(resposta) {
    if (!caixa || caixa.hidden) return;
    caixa.hidden = true;
    if (raiz.document && raiz.document.removeEventListener) {
      raiz.document.removeEventListener('keydown', aoTeclado);
    }
    var quem = responder;
    responder = null;
    if (quem) {
      /* Desistir e apagar tudo dão no mesmo: o número de antes fica. Aceitar o
         vazio seria escrever nada dentro de um bloco que precisa de um
         número. */
      quem(resposta === null || resposta === '' ? null
                                                : resposta.replace(VIRGULA, '.'));
    }
  }

  /* opcoes: { valor, titulo }. O valor chega como texto porque é o que o campo
     do Blockly tem para dar, e porque 0,5 e 0.5 são o mesmo número escrito em
     duas línguas — a conversão mora nas bordas, aqui e no fechar(). */
  function pedir(opcoes, aoResponder) {
    if (!pegar(raiz.document)) {
      if (aoResponder) aoResponder(null);
      return false;
    }
    opcoes = opcoes || {};
    texto = String(opcoes.valor === undefined || opcoes.valor === null
                   ? '' : opcoes.valor).replace('.', VIRGULA);
    recomecar = true;
    responder = aoResponder || null;
    if (elTitulo) elTitulo.textContent = opcoes.titulo || 'Qual número?';
    desenhar();
    abertoEm = Date.now();
    caixa.hidden = false;
    if (raiz.document && raiz.document.addEventListener) {
      raiz.document.addEventListener('keydown', aoTeclado);
    }
    return true;
  }

  /* Chamado no arranque da página, pelo web/campos.js. Achar os elementos aqui
     não é adiantar trabalho: é pendurar o ouvinte de toque antes de a criança
     encostar na tela pela primeira vez. */
  function preparar() {
    return pegar(raiz.document);
  }

  function aberto() { return !!caixa && !caixa.hidden; }

  /* Só os testes precisam disto: uma caixa que ficou aberta de um teste vaza
     para o seguinte, e o estado mora em variáveis do módulo. */
  function esquecer() {
    caixa = elValor = elTitulo = elTeclas = elNao = elSim = null;
    texto = '';
    recomecar = true;
    responder = null;
    abertoEm = 0;
    toqueComecouEm = 0;
    jaHouveToque = false;
  }

  var api = { pedir, preparar, aberto, esquecer, VIRGULA };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Teclado = api;
})(typeof self !== 'undefined' ? self : globalThis);
