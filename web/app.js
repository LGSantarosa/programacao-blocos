(function () {
  'use strict';

  var btPlay = document.getElementById('play');
  var btParar = document.getElementById('parar');
  var btMudo = document.getElementById('mudo');
  var botoesNivel = Array.prototype.slice.call(
    document.querySelectorAll('#niveis button'));
  var spEstado = document.getElementById('estado');
  var btProcurar = document.getElementById('procurar');
  var spErro = document.getElementById('erro');
  var divLeitura = document.getElementById('leitura');
  var ctx = document.getElementById('arena').getContext('2d');
  var painel = document.getElementById('painel');
  var confete = document.getElementById('confete');
  var caixaMissao = document.getElementById('missao');
  var txtMissao = document.getElementById('missao-texto');
  var btProxima = document.getElementById('proxima');
  var btGabarito = document.getElementById('gabarito');
  var caixaFases = document.getElementById('fases');
  /* Aqui em cima, e não junto do montarFases lá embaixo: o `var` iça a
     declaração mas não o valor, e o montarFases() é chamado antes daquela
     linha. Declarado lá, ele rodava com botoesFase indefinido e a página
     inteira morria na entrada — o window.onerror do index.html pegou e
     escreveu "não abriu", que é exatamente o trabalho dele. */
  var botoesFase = [];
  var caixaConfirma = document.getElementById('confirma');
  var tituloConfirma = document.getElementById('confirma-titulo');
  var btConfirmaNao = document.getElementById('confirma-nao');
  var btConfirmaSim = document.getElementById('confirma-sim');
  var btDesfazer = document.getElementById('desfazer');
  var btRefazer = document.getElementById('refazer');
  var btAjustes = document.getElementById('ajustes');
  var caixaAjustes = document.getElementById('painel-ajustes');
  var btAjustesFechar = document.getElementById('ajustes-fechar');
  var btCodigo = document.getElementById('codigo');
  var caixaCodigo = document.getElementById('painel-codigo');
  var preCodigo = document.getElementById('codigo-texto');
  var btCodigoBaixar = document.getElementById('codigo-baixar');
  var btCodigoFechar = document.getElementById('codigo-fechar');
  var nivelPendente = null;

  var mapaPc = [];
  var blocoAceso = null;
  var divBolha = document.getElementById('bolha');
  var relatorEsperado = null;   /* o bloco cuja resposta estamos aguardando */
  var tempoBolha = null;
  var robo = null;
  /* Quem é a conexão da vez e quando tentar de novo: reconexao.js. */
  var conexoes = Reconexao.criar();
  /* null = a origem que serviu a página, que é o caso do navegador. O app
     Android chama App.irPara() para apontar para o simulador de dentro dele
     ou para a placa. */
  var alvo = null;
  /* A execução em curso conta como tentativa da missão? Só quando o que rodou
     foi o programa da âncora. Ver definirRodando. */
  var contarTentativa = true;
  var poseAtual = null;
  var rodando = false;

  var missao = Missoes.daVez(Missoes.atual());
  var cumpriu = false;
  var tentativas = Tentativas.criar(Missoes.TENTATIVAS_ATE_AJUDA);
  var tColisao = -Infinity, tFim = -Infinity, tParado = Date.now();
  var confetes = [];

  Campos.registrar();
  Blocos.definir();

  var nivel = Niveis.atual();
  marcarNivel();
  atualizarBotaoCodigo();

  /* A fonte dos blocos vai pelo tema, não pelo CSS: o Blockly mede o texto
     para dimensionar o bloco, e trocar a família por fora estoura a borda. */
  /* Num celular a gaveta de blocos tem uns 230px, e com fonte 15 as peças saem
     com 277 — a criança vê o bloco decapitado. Encolher só por CSS não adianta:
     o Blockly mede o texto para dimensionar a peça antes de qualquer folha de
     estilo valer, então a régua é esta linha. Medido uma vez, na entrada: girar
     o aparelho não remonta o workspace, e uma peça que muda de tamanho no meio
     do arrasto é pior que uma peça um pouco menor. */
  var telaEstreita = window.innerWidth <= 560;

  var tema = Blockly.Theme.defineTheme('robo', {
    base: Blockly.Themes.Classic,
    /* 15 e não 11: o Blockly dimensiona o bloco a partir do texto medido,
       então a fonte é o que engorda a peça toda — e peça grande é o que um
       dedo de criança acerta. */
    fontStyle: { family: 'system-ui, sans-serif', weight: 'bold',
                 size: telaEstreita ? 12 : 15 },
  });

  var workspace = Blockly.inject('editor', {
    theme: tema,
    /* Sem isto o Blockly busca lixeira, lupas e cursores no site dele. Aqui há
       internet e elas aparecem; na ESP32 não há, e a criança vê uma lixeira
       invisível. O vendor/media/ é a mesma pasta da versão 8.0.5 que já está
       em vendor/, e a barra final é obrigatória — o Blockly concatena cru. */
    media: 'vendor/media/',
    toolbox: Niveis.caixaXml(nivel),
    trashcan: true,
    /* 0.9 no celular: com 1.1 o bloco raiz nasce em 158px e mede 227, numa
       faixa de 350 úteis — a criança abre a página e vê a peça cortada.
       As lupas continuam ali para quem quiser aproximar. */
    zoom: { controls: true, startScale: telaEstreita ? 0.9 : 1.1,
            minScale: 0.6, maxScale: 2.0 },
    grid: { spacing: 22, length: 3, colour: '#dde3ea', snap: true },
  });

  /* O bloco raiz nasce fixo: a criança não precisa saber que ele existe. A
     regra mora no blocos.js porque o "limpar" precisa exatamente dela, e duas
     cópias da mesma regra é como elas divergem. */
  Blocos.criarRaiz(workspace);

  /* ---------- o programa da criança volta como ela deixou ---------- */

  /* Enquanto isto está ligado, nada é gravado: carregar o programa dispara os
     mesmos eventos que montá-lo, e sem a trava a restauração ficaria gravando
     por cima de si mesma no meio do caminho. */
  var restaurando = false;
  var tempoGravar = null;

  function gravarPrograma() {
    if (restaurando) return;
    Guardar.gravar(Blockly.serialization.workspaces.save(workspace), nivel);
  }

  /* Um segundo de silêncio antes de gravar. O Blockly dispara um evento por
     pixel de arrasto; gravar em cada um seria serializar o workspace inteiro
     dezenas de vezes por segundo num iPad de 2011, e para nada — o que importa
     é o estado em que a mão parou. */
  function agendarGravacao() {
    if (restaurando) return;
    if (tempoGravar) clearTimeout(tempoGravar);
    tempoGravar = setTimeout(function () {
      tempoGravar = null;
      gravarPrograma();
    }, 1000);
  }

  /* Gravar agora, sem esperar o segundo de silêncio. A espera existe para não
     serializar o workspace a cada pixel de arrasto, mas quando a página está
     indo embora não há próximo evento: o que estiver pendente tem que ir para o
     disco agora ou não vai nunca.

     São os três jeitos de a página sumir sem avisar direito: a aba fechando, o
     iPad dormindo e o Safari descartando a página, e — dentro do app Android —
     o botão "voltar" matando a Activity. Nos três o navegador dispara um destes
     dois eventos antes de soltar a página, e é a última chance que temos. */
  function gravarAgora() {
    if (tempoGravar) { clearTimeout(tempoGravar); tempoGravar = null; }
    gravarPrograma();
  }

  window.addEventListener('pagehide', gravarAgora);
  /* pagehide não existe em tudo, e o visibilitychange chega antes dele quando o
     aparelho vai dormir ou o app vai para segundo plano. Os dois, de propósito:
     gravar duas vezes o mesmo estado não custa nada, e perder o programa da
     criança custa a tarde dela. */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') gravarAgora();
  });
  /* O unload é o último recurso, para o navegador velho que não tem nenhum dos
     dois — é o caso do Safari do iOS 9, que é justamente o tablet onde a página
     mais some sozinha. */
  window.addEventListener('unload', gravarAgora);

  function restaurarPrograma() {
    var salvo = Guardar.ler(nivel);
    if (!salvo) return false;
    restaurando = true;
    try {
      Blockly.serialization.workspaces.load(salvo, workspace);
      /* Mesma razão do gabarito: o load traz uma âncora nova, vinda de um JSON
         que não carrega deletable nem movable. Sem isto, quem fechasse e
         reabrisse a página ganharia um "▶ quando apertar PLAY" que dá para
         apagar. */
      Blocos.fixarRaiz(workspace);
    } catch (e) {
      /* Um programa guardado por uma versão anterior pode citar um bloco que
         não existe mais. Melhor começar do zero e esquecer o que não abre do
         que deixar a criança olhando uma tela quebrada para sempre. */
      Guardar.esquecer();
      Blocos.limpar(workspace);
      restaurando = false;
      return false;
    }
    restaurando = false;
    return true;
  }

  restaurarPrograma();

  /* ---------- desfazer e refazer ---------- */

  /* A pilha é do Blockly; estes botões só a mostram. O menu de toque longo
     continua funcionando — não trocamos um caminho pelo outro, demos ao que
     já existia uma porta que dá para ver. */

  /* O tamanho das pilhas não tem API pública no Blockly 8, e ler campo interno
     é aposta: se um dia o nome mudar, `tamanhoDaPilha` devolve null e os botões
     ficam sempre ligados. Apertar um botão sem nada para desfazer não faz mal
     nenhum — o Blockly ignora —, então a falha desta leitura custa um botão
     acinzentado a menos, e nunca uma tela quebrada. */
  function tamanhoDaPilha(nome) {
    var p = workspace[nome];
    return (p && typeof p.length === 'number') ? p.length : null;
  }

  function atualizarHistorico() {
    var d = tamanhoDaPilha('undoStack_');
    var r = tamanhoDaPilha('redoStack_');
    btDesfazer.disabled = (d === 0);
    btRefazer.disabled = (r === 0);
  }

  btDesfazer.addEventListener('click', function () {
    workspace.undo(false);
    /* O nível de novo depois de desfazer: o que voltou à tela pode ter voltado
       vestido do jeito que estava guardado no evento, e não do jeito que este
       nível desenha. */
    aplicarNivel();
    atualizarHistorico();
  });

  btRefazer.addEventListener('click', function () {
    workspace.undo(true);
    aplicarNivel();
    atualizarHistorico();
  });

  workspace.addChangeListener(function (e) {
    /* Eventos de interface — rolar, dar zoom, selecionar — não mudam o
       programa, e gravar por causa deles gastaria bateria sem guardar nada
       novo. */
    if (e.isUiEvent) return;
    agendarGravacao();
    atualizarHistorico();
  });

  atualizarHistorico();

  /* A caixa de blocos é um workspace à parte do principal, e é reconstruída
     toda vez que a criança abre uma categoria. Sem reaplicar o nível ali, a
     paleta mostra número e texto mesmo no Pequeno: a criança escolhe a peça
     vendo o que ela não deveria ver, e o bloco só simplifica depois de solto. */
  function aplicarNaPaleta() {
    var f = workspace.getFlyout && workspace.getFlyout();
    if (f) Niveis.aplicar(f.getWorkspace(), nivel);
  }

  function aplicarNivel() {
    Niveis.aplicar(workspace, nivel);
    aplicarNaPaleta();
  }

  /* O Blockly se redimensiona sozinho via ResizeObserver, que não existe no
     Safari do iOS 9. Sem isso o workspace nasce com tamanho zero — e um
     workspace de tamanho zero não desenha caixa de blocos nenhuma, sem dar
     erro. Avisar na mão é o remédio, e não custa nada em navegador novo. */
  /* O Safari do iOS 9 tem flexbox de primeira geração e não dá tamanho a um
     item aninhado como o editor: ele nasce com zero, o Blockly não tem onde
     desenhar e não reclama — a tela fica sem blocos, sem erro nenhum.

     Só intervimos quando o layout falhou de fato. Em navegador moderno o flex
     resolve sozinho e cravar medida aqui só atrapalharia. */
  function medirSvg() {
    var ed = document.getElementById('editor');
    var svg = ed ? ed.getElementsByTagName('svg')[0] : null;
    if (!svg) return { l: 0, a: 0 };
    var r = svg.getBoundingClientRect();
    return { l: Math.round(r.width), a: Math.round(r.height) };
  }

  function ajustarTamanho() {
    var ed = document.getElementById('editor');
    if (ed) {
      /* O SVG que o Blockly injeta tem height:100%. No Safari 9 uma
         porcentagem não resolve contra altura vinda do flexbox — só contra
         altura escrita em pixel — e o SVG cai no padrão de 150px: a caixa de
         blocos aparece, mas não sobra espaço para desenhar bloco nenhum.
         Limpar, deixar o flex calcular, e congelar o resultado em pixel
         resolve, e não muda nada em navegador moderno. */
      ed.style.height = '';
      ed.style.width = '';
      var alt = ed.offsetHeight, larg = ed.offsetWidth;
      if (alt > 100) ed.style.height = alt + 'px';
      if (larg > 100) ed.style.width = larg + 'px';
    }
    /* Mede o SVG do Blockly, não a div: a div tem min-height no CSS e reporta
       altura mesmo quando o flex não lhe deu espaço de verdade. */
    var m = medirSvg();
    if (ed && (m.l < 100 || m.a < 100)) {
      var cab = document.getElementsByTagName('header')[0];
      var painelLado = (painel && window.innerWidth > 900) ? painel.offsetWidth + 16 : 0;
      var altura = window.innerHeight - (cab ? cab.offsetHeight : 0) - 32;
      var largura = window.innerWidth - 32 - painelLado;
      ed.style.height = (altura > 320 ? altura : 320) + 'px';
      if (largura > 200) ed.style.width = largura + 'px';
    }
    if (Blockly.svgResize) Blockly.svgResize(workspace);
  }
  window.addEventListener('resize', ajustarTamanho);
  window.addEventListener('orientationchange', ajustarTamanho);
  /* Depois do layout assentar: na hora do inject o div ainda pode medir zero. */
  setTimeout(ajustarTamanho, 0);
  setTimeout(ajustarTamanho, 300);

  aplicarNivel();
  /* Bloco novo arrastado da caixa também precisa nascer no nível certo — mas
     não no meio do gesto.

     O BLOCK_CREATE de uma peça vinda da caixa chega enquanto o dedo ainda está
     arrastando. Reaplicar o nível ali redesenha os blocos e mexe no banco de
     conexões do Blockly, e o encaixe que a criança estava mirando some debaixo
     do dedo: a conta não encaixa e o desenho embaralha. Enquanto nenhum bloco
     tinha encaixe de valor isso não aparecia, porque arrastar só fazia conexão
     de empilhamento. Agora aparece, então o nível espera o arrasto acabar. */
  workspace.addChangeListener(function (e) {
    if (e.type === Blockly.Events.BLOCK_DRAG && !e.isStart) {
      Niveis.aplicar(workspace, nivel);
      return;
    }
    if (e.type !== Blockly.Events.BLOCK_CREATE) return;
    if (workspace.isDragging && workspace.isDragging()) return;
    Niveis.aplicar(workspace, nivel);
  });

  var paleta = workspace.getFlyout && workspace.getFlyout();
  if (paleta) {
    paleta.getWorkspace().addChangeListener(function (e) {
      if (e.type === Blockly.Events.BLOCK_CREATE) aplicarNaPaleta();
    });

    /* A peça precisa nascer no nível certo, e o evento BLOCK_CREATE chega
       tarde demais para isso: quando ele sai da fila, o gesto já anotou quais
       conexões existem, e mexer nelas ali derruba o encaixe — foi o que o teste
       do arrasto pegou. Aqui é o instante anterior: o createBlock devolve a
       peça já posta no workspace principal e ainda não arrastada. Vestir o
       nível neste ponto é a diferença entre a criança ver uma seta atravessar a
       tela e ver "andar frente 1 s" encolher na mão dela ao soltar. */
    if (paleta.createBlock) {
      var criarDaCaixa = paleta.createBlock;
      paleta.createBlock = function (blocoOriginal) {
        var nova = criarDaCaixa.call(this, blocoOriginal);
        if (nova) Niveis.aplicarEmUm(nova, nivel);
        return nova;
      };
    }
  }

  atualizarMudo();
  montarFases();
  mostrarMissao();

  /* ---------- missão ---------- */

  /* ---------- a trilha de fases ---------- */

  function montarFases() {
    var total = Missoes.quantas();
    for (var i = 0; i < total; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      /* O número mora aqui e no title: a bolinha diz "quantas" para quem não
         lê, e o rótulo diz "qual" para quem lê ou para quem ouve a tela. */
      b.setAttribute('aria-label', 'fase ' + (i + 1) + ' de ' + total);
      b.title = 'fase ' + (i + 1);
      b.setAttribute('data-fase', String(i));
      caixaFases.appendChild(b);
      botoesFase.push(b);
    }
    caixaFases.addEventListener('click', function (e) {
      var qual = e.target && e.target.getAttribute
        ? e.target.getAttribute('data-fase') : null;
      if (qual === null) return;
      irParaFase(Number(qual));
    });
  }

  function marcarFases() {
    var atual = Missoes.atual();
    for (var i = 0; i < botoesFase.length; i++) {
      botoesFase[i].setAttribute('aria-pressed', String(i === atual));
    }
  }

  /* Voltar para uma fase já vencida é coisa que a criança quer fazer — refazer
     o labirinto é metade da graça. O programa montado não se perde: só muda a
     planta da arena, como no "próxima". */
  function irParaFase(i) {
    if (i === Missoes.atual() && !cumpriu) return;
    missao = Missoes.daVez(Missoes.definir(i));
    cumpriu = false;
    tentativas.zerar();
    mostrarMissao();
  }

  function mostrarMissao() {
    /* A ESP32 não manda posição: nesse caso o desenho continua sendo a planta
       da missão, com o robô parado no ponto de partida. No simulador esta pose
       dura só até chegar o primeiro pacote de telemetria. */
    poseAtual = { x: missao.inicio.x, y: missao.inicio.y,
                  theta: missao.inicio.theta, dist: 0, colidiu: false };
    txtMissao.textContent = missao.texto;
    caixaMissao.className = '';
    btProxima.hidden = true;
    btGabarito.hidden = !tentativas.ajuda();
    marcarFases();
    enviarArena();
  }

  /* A física precisa saber a fase, senão o robô atravessa parede desenhada. */
  function enviarArena() {
    if (robo && robo.arena) robo.arena(missao.inicio, missao.obstaculos);
  }

  function cumprirMissao() {
    if (cumpriu) return;
    cumpriu = true;
    txtMissao.textContent = 'Conseguiu!';
    caixaMissao.className = 'cumprida';
    btProxima.hidden = false;
    tFim = Date.now();            /* o pulinho do robô */
    Som.tocar('fim');
    soltarConfete();
  }

  btProxima.addEventListener('click', function () {
    missao = Missoes.daVez(Missoes.avancar());
    cumpriu = false;
    tentativas.zerar();
    mostrarMissao();
  });

  /* Monta o gabarito no espaço de trabalho em vez de descrever em palavras: a
     criança que ainda não lê precisa ver a peça, não a instrução. Ela aperta
     PLAY e assiste — depois pode desmontar e mexer.

     A trilha é uma só; quem a desenha na língua do nível é o web/gabarito.js,
     que fica separado justamente para poder ser testado sem navegador. */
  btGabarito.addEventListener('click', function () {
    Blockly.serialization.workspaces.load(
      Gabarito.montar(missao.gabarito || [], nivel, Missoes.PASSO_S), workspace);
    /* O load troca o workspace inteiro, e a âncora que nasce dele vem do JSON
       do gabarito — sem deletable nem movable, que por padrão são os dois
       verdadeiros. Sem esta linha, pedir o gabarito destravava o
       "▶ quando apertar PLAY": ele passava a poder ser arrastado e apagado,
       e sem ele o PLAY não tem por onde começar. Justo para quem já falhou
       três vezes, que é quem aperta este botão. */
    Blocos.fixarRaiz(workspace);
    aplicarNivel();
    Som.tocar('play');
  });

  /* Abrir com ?diag mostra as medidas da página REAL na tela. Num tablet não
     há console, e medir a página de teste já provou não bastar: ela difere da
     real justamente no layout. */
  /* Uma peça por linha, dizendo onde está e se dá para ver. É o substituto do
     console num tablet: sem isto a única informação disponível é alguém dizendo
     "sumiu", e sumir tem causas diferentes — não existir, ter tamanho zero,
     estar com display:none, ou existir inteira fora da área visível. */
  function medirPeca(id) {
    var e = document.getElementById(id);
    if (!e) return id + ': NAO EXISTE';
    var c = e.getBoundingClientRect();
    var st = window.getComputedStyle ? window.getComputedStyle(e) : null;
    if (st && st.display === 'none') return id + ': display:none';
    if (c.width === 0 && c.height === 0) return id + ': TAMANHO ZERO';
    var vw = window.innerWidth, vh = window.innerHeight;
    var dentro = c.right > 0 && c.left < vw && c.bottom > 0 && c.top < vh;
    return id + ': ' + Math.round(c.width) + 'x' + Math.round(c.height) +
           ' em ' + Math.round(c.left) + ',' + Math.round(c.top) +
           (dentro ? ' ok' : ' FORA DA TELA');
  }

  if (location.search.indexOf('diag') >= 0) {
    var cx = document.createElement('div');
    cx.setAttribute('style',
      'position:fixed;left:0;bottom:0;right:0;z-index:99;background:#1b3a57;' +
      'color:#fff;font:13px monospace;padding:8px;white-space:pre-wrap;' +
      'line-height:1.45;max-height:62%;overflow:auto');
    document.body.appendChild(cx);

    /* Repetido, e não uma foto só: o defeito que trouxe esta barra até aqui é
       uma peça que aparece no carregamento e some depois. Um retrato tirado a
       1200ms mostraria justamente o instante em que ainda estava tudo bem. */
    var conta = 0;
    var medir = function () {
      conta++;
      var m = medirSvg();
      var d = document.documentElement;
      var linhas = [
        't=' + conta + 's   janela ' + window.innerWidth + 'x' + window.innerHeight +
          '   pagina ' + d.scrollWidth + 'x' + d.scrollHeight +
          (d.scrollWidth > window.innerWidth + 1 ? '   <<< TRANSBORDA DE LADO' : ''),
        medirPeca('editor') + '   svg ' + m.l + 'x' + m.a,
        medirPeca('painel'),
        medirPeca('missao'),
        medirPeca('arena'),
        medirPeca('leitura'),
        'nivel ' + nivel +
          '   categorias ' + document.querySelectorAll('.blocklyTreeRow').length +
          '   blocos ' + document.querySelectorAll('#editor .blocklyDraggable').length +
          '   estado ' + spEstado.textContent
      ];
      while (cx.firstChild) cx.removeChild(cx.firstChild);
      cx.appendChild(document.createTextNode(linhas.join('\n')));
    };
    medir();
    setInterval(medir, 1000);
  }

  /* ---------- destaque ---------- */

  function acender(id) {
    if (blocoAceso === id) return;
    if (blocoAceso) marcar(blocoAceso, false);
    blocoAceso = id;
    if (id) marcar(id, true);
  }

  /* Duas armadilhas do Safari antigo, as duas neste ponto:
     - classList não existe em elemento SVG antes do Safari 10, e getSvgRoot()
       devolve um <g>;
     - o segundo argumento de toggle() também só chegou no Safari 10.
     Mexer no atributo class na mão funciona em qualquer navegador. */
  function marcarClasse(el, nome, ligado) {
    if (!el) return;
    var atual = el.getAttribute('class') || '';
    var partes = atual.split(/\s+/);
    var fora = [];
    for (var i = 0; i < partes.length; i++) {
      if (partes[i] && partes[i] !== nome) fora.push(partes[i]);
    }
    if (ligado) fora.push(nome);
    el.setAttribute('class', fora.join(' '));
  }

  function marcar(id, ligado) {
    var b = workspace.getBlockById(id);
    if (!b || !b.getSvgRoot) return;
    marcarClasse(b.getSvgRoot(), 'aceso', ligado);
  }

  /* ---------- confete ---------- */

  function soltarConfete() {
    confete.width = window.innerWidth;
    confete.height = window.innerHeight;
    var cores = ['#ffb703', '#1f9d4d', '#1f6feb', '#e0533d', '#a855f7'];
    confetes = [];
    for (var i = 0; i < 90; i++) {
      confetes.push({
        x: Math.random() * confete.width,
        y: -20 - Math.random() * confete.height * 0.22,
        vx: (Math.random() - 0.5) * 3,
        /* Rápido e acelerando. Antes caíam a 2-5px por quadro de até 280px
           acima da tela: 3 a 8 segundos num navegador rápido, e mais ainda no
           iPad, que roda menos quadros. A festa tem que caber na alegria. */
        vy: 7 + Math.random() * 7,
        cor: cores[i % cores.length],
        giro: Math.random() * Math.PI,
      });
    }
  }

  /* A limpeza da tela inteira era feita a cada quadro, mesmo sem confete
     nenhum na lista — e sem confete é 99% do tempo. Um clearRect do tamanho da
     janela sessenta vezes por segundo para não desenhar pixel algum é caro num
     iPad 2. Agora sai antes, e a última limpeza acontece uma vez só, quando o
     último confete morre. */
  var confeteSujo = false;

  function desenharConfete() {
    if (confetes.length === 0) {
      if (!confeteSujo) return;
      confeteSujo = false;
      confete.getContext('2d').clearRect(0, 0, confete.width, confete.height);
      return;
    }
    confeteSujo = true;
    var c = confete.getContext('2d');
    c.clearRect(0, 0, confete.width, confete.height);
    var vivos = 0;
    for (var i = 0; i < confetes.length; i++) {
      var p = confetes[i];
      p.vy += 0.35;                    /* gravidade */
      p.x += p.vx; p.y += p.vy; p.giro += 0.16;
      if (p.y < confete.height + 20) vivos++;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.giro);
      c.fillStyle = p.cor;
      c.fillRect(-4, -6, 8, 12);
      c.restore();
    }
    if (vivos === 0) confetes = [];
  }

  /* ---------- laço de desenho ---------- */

  function quadro() {
    var agora = Date.now();
    /* Some ao ser pega: é a única confirmação que a criança vê no momento
       exato em que o robô encosta, antes mesmo de ler o painel. */
    Arena.desenhar(ctx, poseAtual, cumpriu ? null : missao, missao.obstaculos);
    ultimaReacao = 'normal';
    if (poseAtual) {
      ultimaReacao = Robo.reacao({
        msDesdeColisao: agora - tColisao,
        msDesdeFim: agora - tFim,
        msParado: rodando ? 0 : agora - tParado,
      });
      Robo.desenhar(ctx, poseAtual, ultimaReacao, agora);
    }
    desenharConfete();
    agendarQuadro();
  }

  /* Parado é o estado normal da tela: nenhum programa rodando e nenhum confete
     caindo. Aí o que sobra de movimento é a animação ociosa do bichinho — o z
     do «dormindo», o piscar — e dez quadros por segundo bastam para ela.
     Sessenta quadros por segundo para mexer um z é bateria de tablet de sala
     de aula indo embora. O setTimeout entrega ao requestAnimationFrame em vez
     de desenhar direto, para a aba escondida continuar sem desenhar nada.

     O «tonto» e o «feliz» ficam de fora do descanso: o pulo do feliz tem
     período de uns 750 ms, e a dez quadros por segundo ele picota. O
     «dormindo» pode descansar — o z sobe devagar de propósito. */
  var MS_OCIOSO = 100;
  var ultimaReacao = 'normal';

  function agendarQuadro() {
    var animando = ultimaReacao === 'tonto' || ultimaReacao === 'feliz';
    if (rodando || confetes.length > 0 || animando) requestAnimationFrame(quadro);
    else setTimeout(function () { requestAnimationFrame(quadro); }, MS_OCIOSO);
  }
  requestAnimationFrame(quadro);

  /* ---------- a bolha ---------- */

  function esconderBolha() {
    divBolha.hidden = true;
    marcarClasse(divBolha, 'erro', false);
    if (tempoBolha) { clearTimeout(tempoBolha); tempoBolha = null; }
  }

  /* Sobre a peça, e um pouco acima dela. A medida sai do SVG do próprio
     bloco, que é quem sabe onde ele está depois de qualquer zoom ou
     rolagem. */
  function mostrarBolha(bloco, texto, ehErro) {
    var r = bloco.getSvgRoot().getBoundingClientRect();
    divBolha.textContent = texto;
    marcarClasse(divBolha, 'erro', !!ehErro);
    divBolha.hidden = false;
    divBolha.style.left = Math.round(r.left) + 'px';
    /* Erro sobe um pouco mais: a bolha é mais alta que a de um número, e
       colada demais ela taparia o próprio bloco que está apontando. */
    divBolha.style.top = Math.round(r.top - (ehErro ? 60 : 38)) + 'px';
    if (tempoBolha) clearTimeout(tempoBolha);
    /* Uma frase leva mais tempo para ser lida que um número — e por quem ainda
       está aprendendo a ler, muito mais. */
    tempoBolha = setTimeout(esconderBolha, ehErro ? 7000 : 4000);
  }

  /* Onde o erro aparece. A frase ia para um <span> de 14px no cabeçalho, longe
     de onde a criança estava olhando e longe da peça que a causou — e é ali que
     caem as três coisas mais importantes que o compilador tem a dizer.

     Quando o erro sabe de qual bloco veio, ele sobe numa bolha em cima dele. O
     cabeçalho continua recebendo a frase: é o que sobra quando a culpa não tem
     endereço, e é o que um adulto olhando de longe consegue ler. */
  function mostrarErro(e) {
    spErro.textContent = e.message;
    var bloco = e.blockId ? workspace.getBlockById(e.blockId) : null;
    if (bloco && bloco.getSvgRoot) {
      mostrarBolha(bloco, e.message, true);
      Som.tocar('batida');
    }
  }

  /* ---------- estado ---------- */

  /* A leitura do painel tem duas origens e uma função só: no robô virtual ela
     vem junto da pose, dentro da telemetria; na placa vem sozinha, no 0x85,
     porque lá não há pose para acompanhar. Quem lê o painel não precisa saber
     em qual dos dois está — o número quer dizer a mesma coisa. */
  function mostrarDistancia(cm) {
    divLeitura.textContent = 'distância: ' + cm + ' cm';
  }

  function limparDistancia() {
    divLeitura.textContent = 'distância: —';
  }

  function definirRodando(estaRodando) {
    /* Rodou e não chegou: uma tentativa. Depois de algumas, a ajuda aparece
       sozinha — sem a criança precisar pedir, que é justamente o que quem
       travou não faz. A regra inteira mora no tentativas.js, com teste. */
    if (tentativas.mudouRodando(rodando, estaRodando, cumpriu, contarTentativa)) {
      btGabarito.hidden = false;
    }
    if (rodando && !estaRodando) {
      /* Sem festa aqui. O programa acabar não é vencer: vencer é chegar na
         estrela, e quem comemora é cumprirMissao(). Comemorar todo fim de
         execução premiaria rodar qualquer coisa e esvaziaria o sentido da
         festa — o mesmo motivo pelo qual o PARAR também não comemora. */
      tParado = Date.now();
    }
    rodando = estaRodando;
    btPlay.disabled = estaRodando || !robo || !robo.pronto();
    btParar.disabled = !estaRodando;
    spEstado.textContent = estaRodando ? 'rodando' : 'parado';
    if (!estaRodando) acender(null);
  }

  function conectar() {
    /* Cada conexão leva um crachá. Uma reconexão já agendada por um soquete
       velho acorda depois da troca de alvo, e sem isto abriria uma conexão a
       mais — que abre outra ao morrer, e mais outra. */
    var minha = conexoes.nova();
    function souAtual() { return minha.souAtual(); }

    robo = Rede.conectar(Rede.url(alvo || location.host, location.protocol), {
      aoConectar: function () {
        if (!souAtual()) return;
        spEstado.textContent = 'parado';
        btPlay.disabled = false;
        /* Cada conexão sobe um robô virtual novo, com a arena padrão: ele
           precisa saber em que fase estamos. */
        enviarArena();
      },
      aoDesconectar: function () {
        if (!souAtual()) return;
        spEstado.textContent = 'desconectado';
        /* O último número lido não vale mais nada: ele veio de um robô com
           quem não falamos mais. Deixá-lo na tela é mentir devagar. */
        limparDistancia();
        /* Cair a conexão no meio de uma execução não é terminar o programa. */
        rodando = false;
        btPlay.disabled = true;
        btParar.disabled = true;
        minha.aoCair(conectar);
      },
      aoPc: function (pc) {
        var id = pc < mapaPc.length ? mapaPc[pc] : null;
        if (id && id !== blocoAceso) Som.tocar('comando');
        acender(id);
      },
      aoValor: function (n) {
        if (!relatorEsperado) return;
        var bloco = workspace.getBlockById(relatorEsperado);
        relatorEsperado = null;
        if (bloco) mostrarBolha(bloco, String(n));
      },
      aoEstado: function (estado) {
        definirRodando(estado === 1);
      },
      /* O que a placa manda no lugar da telemetria. Chega sozinho, umas dez
         vezes por segundo, sem ninguém tocar em bloco nenhum: é o painel
         virando bancada de sensor. */
      aoDistancia: function (cm) {
        mostrarDistancia(cm);
      },
      aoTelem: function (t) {
        poseAtual = t;
        if (t.colidiu && Date.now() - tColisao > Robo.MS_TONTO) {
          tColisao = Date.now();
          Som.tocar('batida');
        }
        mostrarDistancia(t.dist);
        /* A estrela não existe na física: quem decide a chegada é aqui, com a
           posição que a telemetria já traz. */
        if (Missoes.chegou(t, missao)) cumprirMissao();
      },
    });
  }

  /* ---------- controles ---------- */

  /* O corpo do PLAY, agora com dois chamadores: o botão e o dedo.

     ehPrograma diz o que rodou, não por onde foi pedido — é essa distinção
     que a contagem de tentativas usa. */
  function rodar(ast, ehPrograma) {
    spErro.textContent = '';
    esconderBolha();
    relatorEsperado = null;
    Som.tocar('play');
    var compilado;
    try {
      compilado = Compilador.compilar(ast);
    } catch (e) {
      mostrarErro(e);
      return;
    }
    contarTentativa = ehPrograma;
    mapaPc = compilado.pcMap;
    robo.carregar(compilado.bytes);
    robo.rodar();
  }

  /* O PLAY manda tudo que tem cabeça, e não só a âncora: com «quando» ou
     «quando chegar o aviso» na tela, são várias pilhas rodando ao mesmo tempo.

     Enquanto não houver cabeça nova nenhuma, o caminho é o de sempre e o
     bytecode sai idêntico ao de antes — o programa que a criança guardou não
     muda de forma por causa de um bloco que ela ainda não usou. */
  function rodarPrograma() {
    if (!Blocos.temTarefas(workspace)) {
      rodar(Blocos.workspaceParaAst(workspace), true);
      return;
    }
    spErro.textContent = '';
    esconderBolha();
    relatorEsperado = null;
    Som.tocar('play');
    var compilado;
    try {
      compilado = Compilador.compilarTarefas(Blocos.workspaceParaTarefas(workspace));
    } catch (e) {
      mostrarErro(e);
      return;
    }
    contarTentativa = true;
    mapaPc = compilado.pcMap;
    robo.carregar(compilado.bytes);
    robo.rodar();
  }

  btPlay.addEventListener('click', rodarPrograma);

  /* Tocar numa peça roda a peça. O evento vem do próprio Blockly, e é por isso
     que ele acerta o gesto: o handleUp do Gesture despacha em cadeia
     exclusiva — arrastar vence campo, que vence bloco — então arrastar não
     chega aqui, e tocar no número abre o editor sem chegar aqui. Um ouvinte
     próprio, com raio de arrasto na mão, erraria as duas coisas.

     O flyout tem workspace próprio, então a gaveta de blocos não dispara. */
  workspace.addChangeListener(function (e) {
    if (e.type !== Blockly.Events.CLICK || e.targetType !== 'block') return;
    if (!robo || !robo.pronto()) return;
    var bloco = workspace.getBlockById(e.blockId);
    if (!bloco) return;
    var pilha = Blocos.pilhaDoBloco(bloco);
    if (!pilha) {
      /* Relator: não roda, relata. */
      var no = Blocos.valorDoBloco(bloco);
      if (no === null) return;
      var perg;
      try {
        perg = Compilador.compilarValor(no);
      } catch (err) {
        mostrarErro(err);
        return;
      }
      esconderBolha();
      relatorEsperado = bloco.id;
      contarTentativa = false;
      mapaPc = perg.pcMap;
      robo.carregar(perg.bytes);
      robo.rodar();
      return;
    }
    esconderBolha();
    /* Tocar no programa da âncora é o mesmo que apertar PLAY — e com tarefas
       na tela, PLAY quer dizer todas elas. Sem isto, tocar no programa rodaria
       só a pilha do PLAY e a criança veria o «quando» ficar de fora sem
       explicação nenhuma. */
    if (pilha.ehPrograma && Blocos.temTarefas(workspace)) {
      rodarPrograma();
      return;
    }
    if (!pilha.ast.length) return;
    rodar(pilha.ast, pilha.ehPrograma);
  });

  btParar.addEventListener('click', function () { robo.parar(); });

  function atualizarMudo() {
    var m = Som.mudo();
    btMudo.textContent = m ? '🔇' : '🔊';
    marcarClasse(btMudo, 'silenciado', m);
  }

  btMudo.addEventListener('click', function () {
    Som.alternarMudo();
    atualizarMudo();
  });

  /* Três botões em vez de um menu suspenso: criança de quatro anos não abre
     dropdown. O botão do nível ativo fica afundado, como uma tecla apertada. */
  function marcarNivel() {
    for (var i = 0; i < botoesNivel.length; i++) {
      botoesNivel[i].setAttribute('aria-pressed',
        String(botoesNivel[i].dataset.nivel === nivel));
    }
  }

  /* Só o Grande. É o degrau seguinte ao teto dos blocos — nos outros níveis
     seria mais uma escolha na tela de quem ainda está aprendendo a ler, e o
     código mostraria números que aqueles níveis escondem de propósito. */
  function atualizarBotaoCodigo() {
    btCodigo.hidden = (nivel !== 'grande' && nivel !== 'gigante');
  }

  /* A aba de blocos é um workspace à parte, e o updateToolbox reconstrói a
     caixa sem fechá-la: sem isto ela continua oferecendo as peças do nível que
     se acabou de sair, e dá para arrastar um se…senão para dentro do Pequeno. */
  function fecharPaleta() {
    var f = workspace.getFlyout && workspace.getFlyout();
    if (f && f.isVisible && f.isVisible()) f.hide();
    /* A categoria selecionada também precisa soltar: só esconder o flyout
       deixa a aba marcada como aberta, e o toque seguinte nela não faz nada. */
    var tb = workspace.getToolbox && workspace.getToolbox();
    if (tb && tb.clearSelection) tb.clearSelection();
  }

  function aplicarTroca(novo) {
    /* Escolheu, acabou: deixar o painel aberto por cima do trabalho novo faria
       a criança ter de fechá-lo para ver o que mudou. */
    fecharAjustes();
    /* Trocar de nível no meio de uma execução deixaria o robô andando na arena
       com um programa que não existe mais na tela. */
    if (rodando && robo && robo.parar) robo.parar();
    nivel = Niveis.definir(novo);
    marcarNivel();
    atualizarBotaoCodigo();
    workspace.updateToolbox(Niveis.caixaXml(nivel));
    fecharPaleta();
    Blocos.limpar(workspace);
    /* A fase fica: o nível decide como os blocos são desenhados, não quais
       fases já foram vencidas. Mas as tentativas dela naquela fase eram de um
       programa que não existe mais. */
    tentativas.zerar();
    btGabarito.hidden = true;
    aplicarNivel();
  }

  function perguntarTroca(novo) {
    nivelPendente = novo;
    tituloConfirma.textContent = 'Trocar para ' + Niveis.NOMES[novo] + '?';
    caixaConfirma.hidden = false;
    btConfirmaNao.focus();
  }

  function fecharConfirma() {
    caixaConfirma.hidden = true;
    nivelPendente = null;
  }

  function trocarNivel(novo) {
    /* Clicar no nível em que já está não é troca. Sem esta guarda, apagaria o
       trabalho sem que nada mudasse na tela. */
    if (novo === nivel) return;
    /* Nada montado, nada a perder — e um diálogo que aparece sem precisar
       ensina a criança a atravessá-lo sem ler, e aí ele para de proteger. */
    if (!Blocos.temTrabalho(workspace)) { aplicarTroca(novo); return; }
    perguntarTroca(novo);
  }

  /* ---------- o painel de ajustes ---------- */

  function fecharAjustes() { caixaAjustes.hidden = true; }

  btAjustes.addEventListener('click', function () {
    caixaAjustes.hidden = false;
    /* O foco vai para o "fechar", como no painel do código: quem chegou aqui
       por teclado tem a saída debaixo do dedo, e não precisa atravessar quatro
       botões de nível para desistir. */
    btAjustesFechar.focus();
  });
  btAjustesFechar.addEventListener('click', fecharAjustes);
  caixaAjustes.addEventListener('click', function (e) {
    if (e.target === caixaAjustes) fecharAjustes();
  });

  btConfirmaNao.addEventListener('click', fecharConfirma);
  btConfirmaSim.addEventListener('click', function () {
    var novo = nivelPendente;
    fecharConfirma();
    if (novo) aplicarTroca(novo);
  });
  /* Tocar no fundo é o mesmo que "Não" — só no fundo, não na caixa. */
  caixaConfirma.addEventListener('click', function (e) {
    if (e.target === caixaConfirma) fecharConfirma();
  });
  /* keyCode além de key: o Safari do iOS 9 não tem event.key confiável. */
  document.addEventListener('keydown', function (e) {
    if (!(e.key === 'Escape' || e.keyCode === 27)) return;
    if (!caixaConfirma.hidden) fecharConfirma();
    else if (!caixaCodigo.hidden) fecharCodigo();
    else if (!caixaAjustes.hidden) fecharAjustes();
  });

  /* forEach, e não for: com var o laço não cria escopo, e todos os botões
     acabariam apontando para o último. */
  botoesNivel.forEach(function (b) {
    b.addEventListener('click', function () { trocarNivel(b.dataset.nivel); });
  });

  /* ---------- o código Arduino ---------- */

  /* O download precisa de Blob e do atributo download, e o Safari do iOS 9 não
     tem nenhum dos dois. Botão que não faz nada ensina a criança a desconfiar
     da tela: no tablet velho ele não nasce, e sobra o texto para selecionar. */
  var podeBaixar = (typeof Android !== 'undefined' && Android.salvarIno) ||
    (typeof Blob !== 'undefined' && 'download' in document.createElement('a'));
  if (!podeBaixar && btCodigoBaixar.parentNode) {
    btCodigoBaixar.parentNode.removeChild(btCodigoBaixar);
  }

  function fecharCodigo() { caixaCodigo.hidden = true; }

  /* Não depende do robô, diferente do PLAY: gerar código é operação de papel, e
     ela pode olhar com a placa desligada. */
  btCodigo.addEventListener('click', function () {
    try {
      /* Recusar e explicar, em vez de exportar só a pilha do PLAY: um código
         que sai pela metade sem avisar é o tipo de mentira que só aparece com
         o robô montado na mesa e o programa pela metade rodando nele. */
      if (Blocos.temTarefas(workspace)) {
        preCodigo.textContent =
          'Este programa tem mais de uma pilha rodando ao mesmo tempo, e o ' +
          'código do Arduino roda uma só — ele tem um setup() e um loop(), e ' +
          'mais nada.\n\nPara ver o código, deixe na tela só o ' +
          '▶ quando apertar PLAY.';
      } else {
        preCodigo.textContent = Arduino.gerar(Blocos.workspaceParaAst(workspace));
      }
    } catch (e) {
      preCodigo.textContent = e.message;
    }
    caixaCodigo.hidden = false;
    btCodigoFechar.focus();
  });

  btCodigoFechar.addEventListener('click', fecharCodigo);
  caixaCodigo.addEventListener('click', function (e) {
    if (e.target === caixaCodigo) fecharCodigo();
  });

  if (podeBaixar) {
    btCodigoBaixar.addEventListener('click', function () {
      /* Dentro do app o Blob não vira arquivo: blob: nem chega no
         DownloadListener do WebView. O texto atravessa para o Kotlin, que
         escreve em Downloads pelo MediaStore. */
      if (typeof Android !== 'undefined' && Android.salvarIno) {
        var nome = Android.salvarIno(preCodigo.textContent);
        spEstado.textContent = nome ? 'salvo em Downloads/' + nome
                                    : 'não deu para salvar';
        return;
      }
      var blob = new Blob([preCodigo.textContent], { type: 'text/plain' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'robo.ino';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      /* Revogar na hora cancelaria o download que acabou de começar. */
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  }

  /* A ponte do app: o Kotlin diz para onde apontar, e a página reconecta sem
     recarregar — recarregar apagaria o programa que a criança montou. */
  window.App = {
    alvo: function () { return alvo; },
    /* O Kotlin chama isto antes de deixar o "voltar" fechar o app: a Activity
       morre com o WebView dentro, e pode chegar dentro do segundo de espera da
       gravação. Ver MainActivity.sairGuardando(). */
    gravarAgora: function () { gravarAgora(); },
    irPara: function (host) {
      alvo = host || null;
      /* Trocar de robô apaga a leitura do anterior: o fechar() desliga o
         aoDesconectar, então ninguém mais faria isso. */
      limparDistancia();
      /* Parar antes de fechar, para o robô que estamos deixando não seguir
         andando sozinho. Fechar é obrigatório: um soquete abandonado prende o
         servidor local, que atende um cliente por vez. */
      if (robo) {
        if (robo.pronto()) robo.parar();
        robo.fechar();
        robo = null;
      }
      conectar();
    },
    /* O Kotlin avisa onde estamos depois de cada troca. A página não descobre
       isso sozinha: entrar na rede do robô é ato do sistema. Um lugar só
       decide o texto e o gesto, para os dois nunca discordarem. */
    aoTrocarDeRobo: function (onde) {
      var noRobo = onde === 'robo';
      btProcurar.textContent = noRobo ? '🔌 voltar para o ensaio'
                                      : '🤖 procurar o robô';
      btProcurar.onclick = noRobo
        ? function () { Android.voltarParaEnsaio(); }
        : function () {
            spEstado.textContent = 'procurando o robô…';
            Android.procurarRobo();
          };
    },
  };

  /* Só dentro do app: no navegador não há como entrar na rede do robô, e um
     botão que não faz nada é pior que botão nenhum. É o mesmo teste de
     capacidade que decide se o .ino pode ser baixado. */
  if (typeof Android !== 'undefined' && Android.temApp) {
    btProcurar.hidden = false;
    window.App.aoTrocarDeRobo('ensaio');
  }

  conectar();
})();
