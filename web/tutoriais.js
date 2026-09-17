/* Tutoriais curtos para as ideias que aparecem em cada dificuldade.

   A biblioteca acompanha a caixa de blocos: no Iniciante só ensina as peças
   do Iniciante; ao subir, conserva o que a criança já conhecia e acrescenta
   as ideias novas. Assim «Aprender» nunca promete uma peça que não está na
   tela, mas o Avançado ainda serve como consulta de tudo.

   O conteúdo fica separado da tela para poder ser conferido sem navegador. A
   função criar só liga esse conteúdo ao painel que já existe no index.html. */
(function (raiz) {
  'use strict';

  var AZUL = '#0050f0';
  var VERDE = '#37c26b';
  var AMARELO = '#d4aa00';
  var CIANO = '#109bcf';
  var LARANJA = '#e06000';
  var ROXO = '#a040c0';
  var NAVY = '#002080';

  var ORDEM = ['pequeno', 'medio', 'grande', 'gigante'];
  var NOMES = { pequeno: 'Iniciante', medio: 'Básico',
                grande: 'Intermediário', gigante: 'Avançado' };

  /* `nivel` é o primeiro nível em que todas as peças do assunto existem.
     `blocos` não desenha nada: é uma lista de conferência para uma peça nova
     não nascer sem explicação e para os testes provarem a cobertura. */
  var TOPICOS = [
    {
      id: 'mover', nivel: 'pequeno', categoria: 'Mover',
      blocos: ['mover_frente', 'mover_tras', 'girar'],
      icone: '↕', titulo: 'Mover e girar',
      resumo: 'Fazer o robô andar e virar para cada lado.', cor: AZUL,
      animacao: {
        tipo: 'mover',
        fala: 'Olha só. A peça azul entra embaixo do PLAY. Aperta PLAY e o robô anda.',
      },
      passos: [
        {
          titulo: 'As setas fazem o robô andar',
          texto: 'A seta para cima anda para frente. A seta para baixo anda de ré. Encaixe uma delas embaixo do PLAY e experimente.',
          dica: 'No Iniciante o tempo já vem pronto. Nos outros níveis, o número diz por quantos segundos o robô anda.',
          desenho: [
            { texto: '▶ quando apertar PLAY', cor: VERDE, recuo: 0 },
            { texto: '⬆ andar frente  [ 1 ]  s', cor: AZUL, recuo: 1 },
          ],
        },
        {
          titulo: 'A seta redonda faz virar',
          texto: 'Escolha direita ou esquerda. O robô gira no lugar; ele não anda para frente enquanto vira.',
          dica: 'Junte andar, girar, andar e girar para desenhar um caminho.',
          desenho: [
            { texto: '⬆ andar frente  [ 1 ]  s', cor: AZUL, recuo: 0 },
            { texto: 'girar  ↻', cor: AZUL, recuo: 0 },
          ],
        },
      ],
    },
    {
      id: 'repetir', nivel: 'pequeno', categoria: 'Repetir',
      blocos: ['repetir'], icone: '🔁', titulo: 'Repetir',
      resumo: 'Fazer a mesma sequência mais de uma vez.', cor: AMARELO,
      animacao: {
        tipo: 'repetir',
        fala: 'A peça amarela leva a peça azul dentro dela. Aperta PLAY e o robô faz o caminho quatro vezes.',
      },
      passos: [
        {
          titulo: 'O que fica dentro acontece de novo',
          texto: 'Encaixe os blocos na boca do repetir. O número escolhe quantas vezes o grupo inteiro será feito.',
          dica: 'Os blocos depois do repetir só começam quando todas as voltas terminam.',
          desenho: [
            { texto: '🔁 repetir 4 vezes', cor: AMARELO, recuo: 0 },
            { texto: '⬆ andar frente  [ 1 ]  s', cor: AZUL, recuo: 1 },
            { texto: 'girar  [ 90 ]  graus', cor: AZUL, recuo: 1 },
          ],
        },
        {
          titulo: 'Um quadrado tem quatro voltas',
          texto: 'Repita quatro vezes: andar e girar 90 graus. O robô faz os quatro lados sem você copiar a mesma dupla.',
          dica: 'Se algo aparece igual várias vezes, tente colocá-lo dentro de repetir.',
          desenho: [
            { texto: '🔁 repetir 4 vezes', cor: AMARELO, recuo: 0 },
            { texto: 'andar + girar', cor: AZUL, recuo: 1 },
          ],
        },
      ],
    },
    {
      id: 'esperar-parar', nivel: 'medio', categoria: 'Mover',
      blocos: ['esperar', 'parar'], icone: '⏸', titulo: 'Esperar e parar',
      resumo: 'Dar uma pausa ou encerrar o programa.', cor: AZUL,
      passos: [
        {
          titulo: 'Esperar é uma pausa',
          texto: 'O robô fica quieto pelo tempo escolhido e depois continua no próximo bloco.',
          dica: 'Use esperar entre dois movimentos para enxergar melhor cada parte.',
          desenho: [
            { texto: '⏸ esperar  [ 1 ]  s', cor: AZUL, recuo: 0 },
            { texto: '⬆ andar frente  [ 1 ]  s', cor: AZUL, recuo: 0 },
          ],
        },
        {
          titulo: 'Parar tudo encerra o programa',
          texto: 'Parar tudo não é uma pausa. O programa acaba ali, até mesmo quando o bloco está dentro de um repetir.',
          dica: 'Nada encaixa embaixo de parar tudo porque nada depois dele seria feito.',
          desenho: [
            { texto: '🛑 parar tudo', cor: AZUL, recuo: 0 },
          ],
        },
      ],
    },
    {
      id: 'para-sempre', nivel: 'medio', categoria: 'Repetir',
      blocos: ['repetir_sempre'], icone: '♾', titulo: 'Repetir para sempre',
      resumo: 'Continuar até alguém apertar PARAR.', cor: AMARELO,
      passos: [
        {
          titulo: 'Para sempre não termina sozinho',
          texto: 'Tudo dentro dele volta ao começo sem parar. Use o botão PARAR quando quiser encerrar.',
          dica: 'Não há encaixe embaixo: esse bloco nunca chega a um próximo passo.',
          desenho: [
            { texto: '🔁 repetir para sempre', cor: AMARELO, recuo: 0 },
            { texto: '⬆ andar frente  [ 1 ]  s', cor: AZUL, recuo: 1 },
          ],
        },
      ],
    },
    {
      id: 'obstaculo', nivel: 'medio', categoria: 'Sentir',
      blocos: ['se_obstaculo'], icone: '👁', titulo: 'Sentir obstáculos',
      resumo: 'Agir somente quando houver algo perto.', cor: CIANO,
      passos: [
        {
          titulo: 'O olho mede o que está na frente',
          texto: 'Escolha uma distância em centímetros. Os blocos de dentro só acontecem quando existe um obstáculo mais perto que esse número.',
          dica: 'Se não houver nada perto, o programa pula o que está dentro e continua.',
          desenho: [
            { texto: '👁 se obstáculo a menos de  [ 20 ]  cm', cor: CIANO, recuo: 0 },
            { texto: '🛑 parar tudo', cor: AZUL, recuo: 1 },
          ],
        },
      ],
    },
    {
      id: 'dois-caminhos', nivel: 'grande', categoria: 'Sentir',
      blocos: ['se_senao'], icone: '↔', titulo: 'Dois caminhos',
      resumo: 'Fazer uma coisa se houver obstáculo e outra se não houver.', cor: CIANO,
      passos: [
        {
          titulo: 'Se escolhe o primeiro caminho',
          texto: 'Quando existe algo mais perto que a distância escolhida, o robô faz os blocos do primeiro espaço.',
          dica: 'Somente um dos dois espaços roda a cada passagem.',
          desenho: [
            { texto: '👁 se obstáculo a menos de  [ 20 ]  cm', cor: CIANO, recuo: 0 },
            { texto: 'girar  [ 90 ]  graus', cor: AZUL, recuo: 1 },
            { texto: 'senão', cor: CIANO, recuo: 0 },
            { texto: '⬆ andar frente  [ 1 ]  s', cor: AZUL, recuo: 1 },
          ],
        },
      ],
    },
    {
      id: 'ate-chegar', nivel: 'grande', categoria: 'Repetir',
      blocos: ['repetir_ate_perto'], icone: '🔁👁', titulo: 'Repetir até chegar',
      resumo: 'Continuar uma ação enquanto o caminho estiver livre.', cor: AMARELO,
      passos: [
        {
          titulo: 'Repete enquanto ainda está longe',
          texto: 'O robô confere a distância antes de cada volta. Quando chega mais perto que o número escolhido, sai do repetir.',
          dica: 'Coloque andar dentro para ele avançar aos poucos até o obstáculo.',
          desenho: [
            { texto: '🔁👁 repetir até chegar a menos de  [ 20 ]  cm', cor: AMARELO, recuo: 0 },
            { texto: '⬆ andar frente  [ 0,5 ]  s', cor: AZUL, recuo: 1 },
          ],
        },
      ],
    },
    {
      id: 'contas', nivel: 'gigante', categoria: 'Contas',
      blocos: ['conta_mais', 'conta_menos', 'conta_vezes', 'conta_dividir',
               'aleatorio', 'conta_menor', 'conta_maior', 'conta_igual',
               'conta_e', 'conta_ou', 'conta_nao'],
      icone: '➗', titulo: 'Contas e perguntas',
      resumo: 'Calcular números e montar respostas de sim ou não.', cor: NAVY,
      passos: [
        {
          titulo: 'Uma conta cabe no lugar de um número',
          texto: 'As peças de somar, tirar, multiplicar e dividir devolvem um número. Encaixe a conta em qualquer buraco que pede número.',
          dica: 'A conta é resolvida primeiro; o bloco azul recebe o resultado.',
          desenho: [
            { texto: '⬆ andar frente  [ 2 + 1 ]  s', cor: AZUL, recuo: 0 },
          ],
        },
        {
          titulo: 'Comparar faz uma pergunta',
          texto: 'As peças <, > e = respondem sim ou não. Elas entram nos blocos “se” e “repetir até”, que precisam tomar uma decisão.',
          dica: '“3 < 5” responde sim. “3 > 5” responde não.',
          desenho: [
            { texto: '[ 3 ]  <  [ 5 ]', cor: NAVY, recuo: 0 },
          ],
        },
        {
          titulo: 'E, ou e não juntam perguntas',
          texto: '“E” pede duas respostas sim. “Ou” aceita que apenas uma seja sim. “Não” troca sim por não e não por sim.',
          dica: 'Essas peças juntam perguntas; elas não somam números.',
          desenho: [
            { texto: '[ distância < 20 ]  e  [ distância > 5 ]', cor: NAVY, recuo: 0 },
          ],
        },
        {
          titulo: 'Aleatório sorteia um número',
          texto: 'Escolha o menor e o maior valor. Cada vez que a peça for usada, ela pode devolver um número diferente entre os dois.',
          dica: 'Use no giro para o robô escolher um ângulo novo.',
          desenho: [
            { texto: '🎲 aleatório de  [ 1 ]  a  [ 5 ]', cor: NAVY, recuo: 0 },
          ],
        },
      ],
    },
    {
      id: 'decidir', nivel: 'gigante', categoria: 'Repetir',
      blocos: ['distancia', 'se', 'se_entao_senao', 'repetir_ate'],
      icone: '◆', titulo: 'Decidir com perguntas',
      resumo: 'Usar qualquer pergunta para escolher ou repetir.', cor: AMARELO,
      passos: [
        {
          titulo: 'Distância é um número do mundo',
          texto: 'A peça “👁 distância cm” lê quantos centímetros existem até o objeto da frente. Ela cabe dentro de uma comparação.',
          dica: 'A leitura é feita na hora; se o robô andar, o próximo valor pode mudar.',
          desenho: [
            { texto: '[ 👁 distância cm ]  <  [ 20 ]', cor: NAVY, recuo: 0 },
          ],
        },
        {
          titulo: 'Se faz algo quando a resposta é sim',
          texto: 'Encaixe uma pergunta no “se”. Se a resposta for sim, o espaço de dentro roda; se for não, ele é pulado.',
          dica: '“Se…senão” oferece um segundo espaço para a resposta não.',
          desenho: [
            { texto: 'se  [ distância < 20 ]  então', cor: AMARELO, recuo: 0 },
            { texto: '🛑 parar tudo', cor: AZUL, recuo: 1 },
          ],
        },
        {
          titulo: 'Repetir até espera a resposta virar sim',
          texto: 'O grupo roda enquanto a pergunta responde não. Assim que ela responde sim, o programa segue depois do repetir.',
          dica: 'A pergunta é conferida antes de cada volta.',
          desenho: [
            { texto: '🔁 repetir até  [ distância < 20 ]', cor: AMARELO, recuo: 0 },
            { texto: '⬆ andar frente  [ 0,5 ]  s', cor: AZUL, recuo: 1 },
          ],
        },
      ],
    },
    {
      id: 'ao-mesmo-tempo', nivel: 'gigante', categoria: 'Ao mesmo tempo',
      blocos: ['quando_condicao', 'quando_aviso', 'avisar'],
      icone: '📣', titulo: 'Ao mesmo tempo',
      resumo: 'Começar outras pilhas por pergunta ou aviso.', cor: VERDE,
      passos: [
        {
          titulo: 'Cada cabeça começa uma pilha',
          texto: 'Uma pilha “quando” fica atenta enquanto o PLAY roda. Quando sua pergunta vira sim, ela começa os blocos de dentro.',
          dica: 'Duas pilhas podem estar vivas ao mesmo tempo.',
          desenho: [
            { texto: '🔁 quando  [ distância < 20 ]', cor: VERDE, recuo: 0 },
            { texto: '🛑 parar tudo', cor: AZUL, recuo: 1 },
          ],
        },
        {
          titulo: 'Um aviso acorda outra pilha',
          texto: '“Avisar 1” acorda toda pilha “quando chegar o aviso 1”. Os números precisam ser iguais.',
          dica: 'Avisar não espera a outra pilha terminar; as duas podem continuar juntas.',
          desenho: [
            { texto: '📣 avisar 1', cor: VERDE, recuo: 0 },
            { texto: '📣 quando chegar o aviso 1', cor: VERDE, recuo: 0 },
            { texto: 'girar  [ 90 ]  graus', cor: AZUL, recuo: 1 },
          ],
        },
      ],
    },
    {
      id: 'caixas', nivel: 'gigante', categoria: 'Caixas',
      blocos: ['caixa_guardar', 'caixa_mudar', 'caixa_ler'],
      icone: '📦', titulo: 'Caixas',
      resumo: 'Guardar, mudar e usar um número depois.', cor: LARANJA,
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
            { texto: '📦 guardar  [ 0 ]  na caixa voltas', cor: LARANJA, recuo: 1 },
          ],
        },
        {
          titulo: 'Mudar soma ao que já estava lá',
          texto: 'Mudar por 1 aumenta a caixa em um. Mudar por 2 aumenta em dois. Dentro de um repetir, isso vira um contador.',
          dica: 'Mudar não troca pelo número 1: ele soma 1 ao valor antigo.',
          desenho: [
            { texto: '🔁 repetir 4 vezes', cor: AMARELO, recuo: 0 },
            { texto: '📦 mudar voltas por  [ 1 ]', cor: LARANJA, recuo: 1 },
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
            { texto: '📦 guardar  [ 0 ]  na caixa voltas', cor: LARANJA, recuo: 0 },
            { texto: '🔁 repetir 4 vezes', cor: AMARELO, recuo: 0 },
            { texto: '📦 mudar voltas por  [ 1 ]', cor: LARANJA, recuo: 1 },
            { texto: 'resultado: 4', cor: VERDE, recuo: 0 },
          ],
        },
      ],
    },
    {
      id: 'meus-blocos', nivel: 'gigante', categoria: 'Meus blocos',
      blocos: ['bloco_ensinar', 'bloco_usar', 'bloco_entrada'],
      icone: '🧩', titulo: 'Meus blocos',
      resumo: 'Ensinar uma sequência e usá-la quantas vezes quiser.', cor: ROXO,
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
            { texto: 'girar  [ 90 ]  graus', cor: AZUL, recuo: 1 },
            { texto: 'girar  [ -90 ]  graus', cor: AZUL, recuo: 1 },
          ],
        },
        {
          titulo: 'Use a nova peça no PLAY',
          texto: 'Volte à gaveta Meus blocos. Agora existe uma peça “🧩 dançar”. Arraste essa peça para o PLAY toda vez que quiser fazer a receita.',
          dica: 'Mudar a receita muda todos os lugares que usam dançar.',
          desenho: [
            { texto: '▶ quando apertar PLAY', cor: VERDE, recuo: 0 },
            { texto: '🧩 dançar', cor: ROXO, recuo: 1 },
            { texto: '🧩 dançar', cor: ROXO, recuo: 1 },
          ],
        },
        {
          titulo: 'O ➕ cria uma entrada',
          texto: 'Quer usar um número diferente a cada vez? Toque no ➕ da cabeça ensinar e dê um nome à entrada, como tempo. Toque no ícone de soltar ao lado do nome para tirar a peça roxa que lê essa entrada.',
          dica: 'A entrada só vale dentro do bloco que a criou.',
          desenho: [
            { texto: '🧩 ensinar dançar   tempo  ⇩', cor: ROXO, recuo: 0 },
            { texto: '⬆ andar frente  [ 🧩 tempo ]  s', cor: AZUL, recuo: 1 },
          ],
        },
        {
          titulo: 'Cada uso entrega seu número',
          texto: 'A peça de usar ganha um buraco chamado tempo. Um uso pode entregar 1 e outro pode entregar 3; a mesma receita trabalha com os dois valores.',
          dica: 'Primeiro aprenda sem entradas. Use o ➕ quando a receita simples já estiver funcionando.',
          desenho: [
            { texto: '🧩 dançar   tempo [ 1 ]', cor: ROXO, recuo: 0 },
            { texto: '🧩 dançar   tempo [ 3 ]', cor: ROXO, recuo: 0 },
          ],
        },
      ],
    },
  ];

  function indiceNivel(nivel) {
    var i = ORDEM.indexOf(nivel);
    return i < 0 ? ORDEM.indexOf('medio') : i;
  }

  function buscar(id) {
    for (var i = 0; i < TOPICOS.length; i++) {
      if (TOPICOS[i].id === id) return TOPICOS[i];
    }
    return null;
  }

  function disponiveis(nivel) {
    var limite = indiceNivel(nivel), lista = [];
    for (var i = 0; i < TOPICOS.length; i++) {
      if (indiceNivel(TOPICOS[i].nivel) <= limite) lista.push(TOPICOS[i]);
    }
    return lista;
  }

  function disponivel(id, nivel) {
    var topico = buscar(id);
    return !!topico && indiceNivel(topico.nivel) <= indiceNivel(nivel);
  }

  function criar(opcoes) {
    opcoes = opcoes || {};
    var doc = opcoes.documento || document;
    var painel = doc.getElementById('painel-tutorial');
    var menu = doc.getElementById('tutorial-menu');
    var intro = doc.getElementById('tutorial-menu-intro');
    var temas = doc.getElementById('tutorial-temas');
    var licao = doc.getElementById('tutorial-licao');
    var animacao = doc.getElementById('tutorial-animacao');
    var palco = doc.getElementById('tutorial-palco');
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
    var btAnimacaoDeNovo = doc.getElementById('tutorial-animacao-denovo');
    var btAnimacaoPraticar = doc.getElementById('tutorial-animacao-praticar');
    var nivel = ORDEM.indexOf(opcoes.nivel) >= 0 ? opcoes.nivel : 'medio';
    var topico = null;
    var indice = 0;
    var focoAnterior = null;

    function esvaziar(no) {
      while (no.firstChild) no.removeChild(no.firstChild);
    }

    function montarTemas() {
      var lista = disponiveis(nivel);
      esvaziar(temas);
      menu.className = nivel === 'pequeno' ? 'iniciante' : '';
      intro.textContent = 'Blocos do ' + NOMES[nivel] +
        '. Escolha uma ideia para ver uma explicação curta e um exemplo.';
      for (var i = 0; i < lista.length; i++) {
        var t = lista[i];
        var botao = doc.createElement('button');
        botao.type = 'button';
        botao.className = 'tutorial-tema' + (t.cor === AMARELO ? ' claro' : '');
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
      animacao.hidden = true;
      palco.className = 'tutorial-palco';
      progresso.textContent = NOMES[nivel];
    }

    function iniciarAnimacao() {
      if (!topico || !topico.animacao) return;
      palco.className = 'tutorial-palco tipo-' + topico.animacao.tipo;
      /* Ler uma medida entre tirar e pôr a classe obriga o navegador a
         recomeçar os keyframes. É o replay que funciona também no Safari 9. */
      palco.offsetWidth;
      palco.className += ' rodando';
      if (opcoes.aoNarrar) opcoes.aoNarrar(topico.animacao.fala);
    }

    function desenharAnimacao() {
      titulo.textContent = topico.icone + ' ' + topico.titulo;
      progresso.textContent = '';
      menu.hidden = true;
      licao.hidden = true;
      animacao.hidden = false;
      iniciarAnimacao();
    }

    function desenharPasso() {
      var passo = topico.passos[indice];
      animacao.hidden = true;
      titulo.textContent = topico.icone + ' ' + topico.titulo;
      progresso.textContent = NOMES[nivel] + ' · passo ' + (indice + 1) +
                              ' de ' + topico.passos.length;
      passoTitulo.textContent = passo.titulo;
      texto.textContent = passo.texto;
      dica.textContent = passo.dica || '';
      dica.hidden = !passo.dica;
      esvaziar(desenho);
      for (var i = 0; i < passo.desenho.length; i++) {
        var parte = passo.desenho[i];
        var bloco = doc.createElement('div');
        bloco.className = 'tutorial-bloco' + (parte.recuo ? ' dentro' : '') +
                          (parte.cor === AMARELO ? ' claro' : '');
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
      if (!achado || !disponivel(id, nivel)) { mostrarMenu(); return; }
      topico = achado;
      indice = 0;
      btVoltar.hidden = false;
      menu.hidden = true;
      if (nivel === 'pequeno' && achado.animacao) desenharAnimacao();
      else {
        licao.hidden = false;
        desenharPasso();
      }
    }

    function definirNivel(novo) {
      if (ORDEM.indexOf(novo) < 0 || novo === nivel) return;
      nivel = novo;
      montarTemas();
      if (topico && disponivel(topico.id, nivel)) {
        if (nivel === 'pequeno' && topico.animacao) desenharAnimacao();
        else { licao.hidden = false; desenharPasso(); }
      }
      else mostrarMenu();
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
      palco.className = 'tutorial-palco';
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
    btAnimacaoDeNovo.addEventListener('click', iniciarAnimacao);
    btAnimacaoPraticar.addEventListener('click', function () {
      if (!topico) return;
      var id = topico.id;
      fechar();
      if (opcoes.aoPraticar) opcoes.aoPraticar(id);
    });

    return { abrir: abrir, fechar: fechar, aberto: aberto,
             definirNivel: definirNivel };
  }

  var api = { TOPICOS: TOPICOS, ORDEM: ORDEM, NOMES: NOMES,
              buscar: buscar, disponiveis: disponiveis,
              disponivel: disponivel, criar: criar };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Tutoriais = api;
})(typeof self !== 'undefined' ? self : globalThis);
