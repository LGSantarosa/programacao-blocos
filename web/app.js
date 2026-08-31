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
  var caixaConfirma = document.getElementById('confirma');
  var tituloConfirma = document.getElementById('confirma-titulo');
  var btConfirmaNao = document.getElementById('confirma-nao');
  var btConfirmaSim = document.getElementById('confirma-sim');
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
  var tentativas = 0;
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
  mostrarMissao();

  /* ---------- missão ---------- */

  function mostrarMissao() {
    /* A ESP32 não manda posição: nesse caso o desenho continua sendo a planta
       da missão, com o robô parado no ponto de partida. No simulador esta pose
       dura só até chegar o primeiro pacote de telemetria. */
    poseAtual = { x: missao.inicio.x, y: missao.inicio.y,
                  theta: missao.inicio.theta, dist: 0, colidiu: false };
    txtMissao.textContent = missao.texto;
    caixaMissao.className = '';
    btProxima.hidden = true;
    btGabarito.hidden = tentativas < Missoes.TENTATIVAS_ATE_AJUDA;
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
    tentativas = 0;
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

  function desenharConfete() {
    var c = confete.getContext('2d');
    c.clearRect(0, 0, confete.width, confete.height);
    if (confetes.length === 0) return;
    var vivos = 0;
    for (var p of confetes) {
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
    if (poseAtual) {
      var qual = Robo.reacao({
        msDesdeColisao: agora - tColisao,
        msDesdeFim: agora - tFim,
        msParado: rodando ? 0 : agora - tParado,
      });
      Robo.desenhar(ctx, poseAtual, qual, agora);
    }
    desenharConfete();
    requestAnimationFrame(quadro);
  }
  requestAnimationFrame(quadro);

  /* ---------- a bolha ---------- */

  function esconderBolha() {
    divBolha.hidden = true;
    if (tempoBolha) { clearTimeout(tempoBolha); tempoBolha = null; }
  }

  /* Sobre a peça, e um pouco acima dela. A medida sai do SVG do próprio
     bloco, que é quem sabe onde ele está depois de qualquer zoom ou
     rolagem. */
  function mostrarBolha(bloco, texto) {
    var r = bloco.getSvgRoot().getBoundingClientRect();
    divBolha.textContent = texto;
    divBolha.hidden = false;
    divBolha.style.left = Math.round(r.left) + 'px';
    divBolha.style.top = Math.round(r.top - 38) + 'px';
    if (tempoBolha) clearTimeout(tempoBolha);
    tempoBolha = setTimeout(esconderBolha, 4000);
  }

  /* ---------- estado ---------- */

  function definirRodando(estaRodando) {
    if (rodando && !estaRodando) {
      /* Rodou e não chegou: uma tentativa. Depois de algumas, a ajuda aparece
         sozinha — sem a criança precisar pedir, que é justamente o que quem
         travou não faz.

         Só o programa da âncora conta. Uma pilha solta rodada com o dedo é
         exploração, não tentativa: contá-la ofereceria o gabarito a quem está
         se divertindo, dizendo que fracassou. */
      if (!cumpriu && contarTentativa) {
        tentativas++;
        if (tentativas >= Missoes.TENTATIVAS_ATE_AJUDA) btGabarito.hidden = false;
      }
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
    robo = Rede.conectar(Rede.url(alvo || location.host, location.protocol), {
      aoConectar: function () {
        spEstado.textContent = 'parado';
        btPlay.disabled = false;
        /* Cada conexão sobe um robô virtual novo, com a arena padrão: ele
           precisa saber em que fase estamos. */
        enviarArena();
      },
      aoDesconectar: function () {
        spEstado.textContent = 'desconectado';
        /* Cair a conexão no meio de uma execução não é terminar o programa. */
        rodando = false;
        btPlay.disabled = true;
        btParar.disabled = true;
        setTimeout(conectar, 1500);
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
      aoTelem: function (t) {
        poseAtual = t;
        if (t.colidiu && Date.now() - tColisao > Robo.MS_TONTO) {
          tColisao = Date.now();
          Som.tocar('batida');
        }
        divLeitura.textContent = 'distância: ' + t.dist + ' cm';
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
      spErro.textContent = e.message;
      return;
    }
    contarTentativa = ehPrograma;
    mapaPc = compilado.pcMap;
    robo.carregar(compilado.bytes);
    robo.rodar();
  }

  btPlay.addEventListener('click', function () {
    rodar(Blocos.workspaceParaAst(workspace), true);
  });

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
        spErro.textContent = err.message;
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
    for (var b of botoesNivel) {
      b.setAttribute('aria-pressed', String(b.dataset.nivel === nivel));
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
    tentativas = 0;
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
  var podeBaixar = typeof Blob !== 'undefined' &&
    'download' in document.createElement('a');
  if (!podeBaixar && btCodigoBaixar.parentNode) {
    btCodigoBaixar.parentNode.removeChild(btCodigoBaixar);
  }

  function fecharCodigo() { caixaCodigo.hidden = true; }

  /* Não depende do robô, diferente do PLAY: gerar código é operação de papel, e
     ela pode olhar com a placa desligada. */
  btCodigo.addEventListener('click', function () {
    try {
      preCodigo.textContent = Arduino.gerar(Blocos.workspaceParaAst(workspace));
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

  /* Só dentro do app: no navegador não há como entrar na rede do robô, e um
     botão que não faz nada é pior que botão nenhum. É o mesmo teste de
     capacidade que decide se o .ino pode ser baixado. */
  if (typeof Android !== 'undefined' && Android.temApp) {
    btProcurar.hidden = false;
    btProcurar.onclick = function () {
      spEstado.textContent = 'procurando o robô…';
      Android.procurarRobo();
    };
  }

  /* A ponte do app: o Kotlin diz para onde apontar, e a página reconecta sem
     recarregar — recarregar apagaria o programa que a criança montou. */
  window.App = {
    alvo: function () { return alvo; },
    irPara: function (host) {
      alvo = host || null;
      if (robo && robo.pronto()) robo.parar();
      conectar();
    },
  };

  conectar();
})();
