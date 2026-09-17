/* Tutoriais dos blocos que pedem uma ideia nova, e não só um gesto novo.

   Caixas introduzem memória. Meus blocos introduzem dar nome a um pedaço de
   programa e, depois, entregar números a esse pedaço. Um tooltip de uma linha
   não ensina nenhuma das duas coisas, por isso as explicações vivem em passos
   curtos, com a mesma aparência e as mesmas palavras das peças de verdade.

   O conteúdo fica separado da tela para poder ser conferido sem navegador. A
   função criar só liga esse conteúdo ao painel que já existe no index.html. */
(function (raiz) {
  'use strict';

  var AZUL = '#0050f0';
  var VERDE = '#37c26b';
  var AMARELO = '#d4aa00';
  var LARANJA = '#e06000';
  var ROXO = '#a040c0';

  var TOPICOS = [
    {
      id: 'caixas',
      icone: '📦',
      titulo: 'Caixas',
      resumo: 'Guardar, mudar e usar um número depois.',
      cor: LARANJA,
      categoria: 'Caixas',
      passos: [
        {
          titulo: 'Uma caixa é a memória do robô',
          texto: 'Ela guarda um número enquanto o programa roda. Dê um nome que conte o que está lá dentro, como voltas, pontos ou passos.',
          dica: 'Abra Caixas e toque em “📦 Criar caixa”.',
          desenho: [
            { texto: '📦 Criar caixa  →  voltas', cor: LARANJA, recuo: 0 },
          ],
        },
        {
          titulo: 'Guardar escolhe o número',
          texto: 'O bloco guardar põe um número na caixa. Se já havia outro, ele sai. Use guardar no começo para escolher de onde a contagem parte.',
          dica: 'Guardar 0 é um bom começo para um contador.',
          desenho: [
            { texto: '▶ quando apertar PLAY', cor: VERDE, recuo: 0 },
            { texto: '📦 guardar 0 na caixa voltas', cor: LARANJA, recuo: 1 },
          ],
        },
        {
          titulo: 'Mudar soma ao que já estava lá',
          texto: 'Mudar por 1 aumenta a caixa em um. Mudar por 2 aumenta em dois. Dentro de um repetir, isso vira um contador.',
          dica: 'Mudar não troca pelo número 1: ele soma 1 ao valor antigo.',
          desenho: [
            { texto: '🔁 repetir 4 vezes', cor: AMARELO, recuo: 0 },
            { texto: '📦 mudar voltas por 1', cor: LARANJA, recuo: 1 },
          ],
        },
        {
          titulo: 'A peça pequena lê a caixa',
          texto: 'A peça “📦 voltas” vale o número guardado naquele instante. Ela cabe em qualquer buraco de número. Toque nela para ver o valor.',
          dica: 'Ler não muda a caixa; só pega o número que está nela.',
          desenho: [
            { texto: '⬆ andar frente  [ 📦 voltas ]  s', cor: AZUL, recuo: 0 },
          ],
        },
        {
          titulo: 'Experimente um contador',
          texto: 'Guarde 0, repita quatro vezes e mude voltas por 1 dentro do laço. Depois do PLAY, toque na peça “📦 voltas”: ela deve mostrar 4.',
          dica: 'Cada PLAY começa as caixas de novo. Assim um teste não estraga o próximo.',
          desenho: [
            { texto: '📦 guardar 0 na caixa voltas', cor: LARANJA, recuo: 0 },
            { texto: '🔁 repetir 4 vezes', cor: AMARELO, recuo: 0 },
            { texto: '📦 mudar voltas por 1', cor: LARANJA, recuo: 1 },
            { texto: 'resultado: 4', cor: VERDE, recuo: 0 },
          ],
        },
      ],
    },
    {
      id: 'meus-blocos',
      icone: '🧩',
      titulo: 'Meus blocos',
      resumo: 'Ensinar uma sequência e usá-la quantas vezes quiser.',
      cor: ROXO,
      categoria: 'Meus blocos',
      passos: [
        {
          titulo: 'Dê um nome a uma ideia',
          texto: 'Um bloco inventado junta várias ações em uma só peça. Crie um chamado dançar, quadrado ou desviar: o nome deve dizer o que ele faz.',
          dica: 'Abra Meus blocos e toque em “🧩 Criar bloco”.',
          desenho: [
            { texto: '🧩 Criar bloco  →  dançar', cor: ROXO, recuo: 0 },
          ],
        },
        {
          titulo: 'Ensine o que ele faz',
          texto: 'Encaixe as ações embaixo da cabeça “ensinar”. Elas ficam fora da pilha do PLAY porque são a receita, não uma ordem para agora.',
          dica: 'Tocar na cabeça ensinar experimenta só aquela receita uma vez.',
          desenho: [
            { texto: '🧩 ensinar dançar', cor: ROXO, recuo: 0 },
            { texto: '↻ girar 90 graus', cor: AZUL, recuo: 1 },
            { texto: '↺ girar -90 graus', cor: AZUL, recuo: 1 },
          ],
        },
        {
          titulo: 'Use a nova peça no PLAY',
          texto: 'Volte à gaveta Meus blocos. Agora existe uma peça “🧩 dançar”. Arraste essa peça para o PLAY toda vez que quiser repetir a receita.',
          dica: 'Mudar a receita muda todos os lugares que usam dançar.',
          desenho: [
            { texto: '▶ quando apertar PLAY', cor: VERDE, recuo: 0 },
            { texto: '🧩 dançar', cor: ROXO, recuo: 1 },
            { texto: '🧩 dançar', cor: ROXO, recuo: 1 },
          ],
        },
        {
          titulo: 'O ➕ cria uma entrada',
          texto: 'Quer usar um número diferente a cada vez? Toque no ➕ da cabeça ensinar e dê um nome à entrada, como tempo. Toque no ícone ao lado do nome para soltar a pecinha roxa que lê essa entrada.',
          dica: 'A entrada só vale dentro do bloco que a criou.',
          desenho: [
            { texto: '🧩 ensinar dançar   tempo', cor: ROXO, recuo: 0 },
            { texto: '⬆ andar frente  [ 🧩 tempo ]  s', cor: AZUL, recuo: 1 },
          ],
        },
        {
          titulo: 'Cada uso entrega seu número',
          texto: 'A peça de usar ganha um buraco chamado tempo. Um uso pode entregar 1 e outro pode entregar 3; a mesma receita trabalha com os dois valores.',
          dica: 'Primeiro aprenda sem entradas. Use o ➕ quando a receita simples já estiver funcionando.',
          desenho: [
            { texto: '🧩 dançar  tempo 1', cor: ROXO, recuo: 0 },
            { texto: '🧩 dançar  tempo 3', cor: ROXO, recuo: 0 },
          ],
        },
      ],
    },
  ];

  function buscar(id) {
    for (var i = 0; i < TOPICOS.length; i++) {
      if (TOPICOS[i].id === id) return TOPICOS[i];
    }
    return null;
  }

  function criar(opcoes) {
    opcoes = opcoes || {};
    var doc = opcoes.documento || document;
    var painel = doc.getElementById('painel-tutorial');
    var menu = doc.getElementById('tutorial-menu');
    var temas = doc.getElementById('tutorial-temas');
    var licao = doc.getElementById('tutorial-licao');
    var titulo = doc.getElementById('tutorial-titulo');
    var progresso = doc.getElementById('tutorial-progresso');
    var passoTitulo = doc.getElementById('tutorial-passo-titulo');
    var texto = doc.getElementById('tutorial-texto');
    var dica = doc.getElementById('tutorial-dica');
    var desenho = doc.getElementById('tutorial-desenho');
    var btVoltar = doc.getElementById('tutorial-voltar');
    var btFechar = doc.getElementById('tutorial-fechar');
    var btAnterior = doc.getElementById('tutorial-anterior');
    var btProximo = doc.getElementById('tutorial-proximo');
    var topico = null;
    var indice = 0;
    var focoAnterior = null;

    function esvaziar(no) {
      while (no.firstChild) no.removeChild(no.firstChild);
    }

    function montarTemas() {
      esvaziar(temas);
      for (var i = 0; i < TOPICOS.length; i++) {
        var t = TOPICOS[i];
        var botao = doc.createElement('button');
        botao.type = 'button';
        botao.className = 'tutorial-tema';
        botao.setAttribute('data-tutorial', t.id);
        botao.style.backgroundColor = t.cor;

        var nome = doc.createElement('span');
        nome.className = 'tutorial-tema-nome';
        nome.textContent = t.icone + ' ' + t.titulo;
        botao.appendChild(nome);

        var resumo = doc.createElement('span');
        resumo.className = 'tutorial-tema-resumo';
        resumo.textContent = t.resumo;
        botao.appendChild(resumo);

        botao.addEventListener('click', (function (id) {
          return function () { escolher(id); };
        })(t.id));
        temas.appendChild(botao);
      }
    }

    function mostrarMenu() {
      topico = null;
      indice = 0;
      titulo.textContent = '📚 Aprender';
      btVoltar.hidden = true;
      menu.hidden = false;
      licao.hidden = true;
      progresso.textContent = '';
    }

    function desenharPasso() {
      var passo = topico.passos[indice];
      titulo.textContent = topico.icone + ' ' + topico.titulo;
      progresso.textContent = 'passo ' + (indice + 1) + ' de ' + topico.passos.length;
      passoTitulo.textContent = passo.titulo;
      texto.textContent = passo.texto;
      dica.textContent = passo.dica || '';
      dica.hidden = !passo.dica;
      esvaziar(desenho);
      for (var i = 0; i < passo.desenho.length; i++) {
        var parte = passo.desenho[i];
        var bloco = doc.createElement('div');
        bloco.className = 'tutorial-bloco' + (parte.recuo ? ' dentro' : '');
        bloco.style.backgroundColor = parte.cor;
        bloco.textContent = parte.texto;
        desenho.appendChild(bloco);
      }
      btAnterior.disabled = indice === 0;
      btProximo.textContent = indice === topico.passos.length - 1
        ? 'experimentar ▸' : 'próximo ▸';
    }

    function escolher(id) {
      var achado = buscar(id);
      if (!achado) { mostrarMenu(); return; }
      topico = achado;
      indice = 0;
      btVoltar.hidden = false;
      menu.hidden = true;
      licao.hidden = false;
      desenharPasso();
    }

    function abrir(id) {
      focoAnterior = doc.activeElement;
      painel.hidden = false;
      if (id) escolher(id);
      else mostrarMenu();
      btFechar.focus();
    }

    function fechar() {
      painel.hidden = true;
      if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
      focoAnterior = null;
    }

    function aberto() { return !painel.hidden; }

    montarTemas();

    btVoltar.addEventListener('click', mostrarMenu);
    btFechar.addEventListener('click', fechar);
    painel.addEventListener('click', function (e) {
      if (e.target === painel) fechar();
    });
    btAnterior.addEventListener('click', function () {
      if (!topico || indice <= 0) return;
      indice--;
      desenharPasso();
    });
    btProximo.addEventListener('click', function () {
      if (!topico) return;
      if (indice < topico.passos.length - 1) {
        indice++;
        desenharPasso();
        return;
      }
      var id = topico.id;
      fechar();
      if (opcoes.aoPraticar) opcoes.aoPraticar(id);
    });

    return { abrir: abrir, fechar: fechar, aberto: aberto };
  }

  var api = { TOPICOS: TOPICOS, buscar: buscar, criar: criar };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Tutoriais = api;
})(typeof self !== 'undefined' ? self : globalThis);
