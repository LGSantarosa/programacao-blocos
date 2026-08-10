(function () {
  'use strict';

  var btPlay = document.getElementById('play');
  var btParar = document.getElementById('parar');
  var btMudo = document.getElementById('mudo');
  var botoesNivel = Array.prototype.slice.call(
    document.querySelectorAll('#niveis button'));
  var spEstado = document.getElementById('estado');
  var spErro = document.getElementById('erro');
  var divLeitura = document.getElementById('leitura');
  var ctx = document.getElementById('arena').getContext('2d');
  var painel = document.getElementById('painel');
  var confete = document.getElementById('confete');
  var caixaMissao = document.getElementById('missao');
  var txtMissao = document.getElementById('missao-texto');
  var btProxima = document.getElementById('proxima');

  var mapaPc = [];
  var blocoAceso = null;
  var robo = null;
  var viuTelemetria = false;
  var poseAtual = null;
  var rodando = false;

  var missao = Missoes.daVez(Missoes.atual());
  var cumpriu = false;
  var tColisao = -Infinity, tFim = -Infinity, tParado = Date.now();
  var pediuParar = false;
  var confetes = [];

  Campos.registrar();
  Blocos.definir();

  var nivel = Niveis.atual();
  marcarNivel();

  /* A fonte dos blocos vai pelo tema, não pelo CSS: o Blockly mede o texto
     para dimensionar o bloco, e trocar a família por fora estoura a borda. */
  var tema = Blockly.Theme.defineTheme('robo', {
    base: Blockly.Themes.Classic,
    /* 15 e não 11: o Blockly dimensiona o bloco a partir do texto medido,
       então a fonte é o que engorda a peça toda — e peça grande é o que um
       dedo de criança acerta. */
    fontStyle: { family: 'system-ui, sans-serif', weight: 'bold', size: 15 },
  });

  var workspace = Blockly.inject('editor', {
    theme: tema,
    toolbox: Niveis.caixaXml(nivel),
    trashcan: true,
    zoom: { controls: true, startScale: 1.1, minScale: 0.6, maxScale: 2.0 },
    grid: { spacing: 22, length: 3, colour: '#dde3ea', snap: true },
  });

  /* O bloco raiz nasce fixo: a criança não precisa saber que ele existe. */
  var raiz = Blockly.serialization.blocks.append(
    { type: 'quando_play', x: 40, y: 30 }, workspace);
  raiz.setDeletable(false);
  raiz.setMovable(false);

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
  /* Bloco novo arrastado da caixa também precisa nascer no nível certo. */
  workspace.addChangeListener(function (e) {
    if (e.type === Blockly.Events.BLOCK_CREATE) Niveis.aplicar(workspace, nivel);
  });

  var paleta = workspace.getFlyout && workspace.getFlyout();
  if (paleta) {
    paleta.getWorkspace().addChangeListener(function (e) {
      if (e.type === Blockly.Events.BLOCK_CREATE) aplicarNaPaleta();
    });
  }

  atualizarMudo();
  mostrarMissao();

  /* ---------- missão ---------- */

  function mostrarMissao() {
    txtMissao.textContent = missao.texto;
    caixaMissao.className = '';
    btProxima.hidden = true;
  }

  function cumprirMissao() {
    if (cumpriu) return;
    cumpriu = true;
    txtMissao.textContent = 'Conseguiu!';
    caixaMissao.className = 'cumprida';
    btProxima.hidden = false;
    Som.tocar('fim');
    soltarConfete();
  }

  btProxima.addEventListener('click', function () {
    missao = Missoes.daVez(Missoes.avancar());
    cumpriu = false;
    mostrarMissao();
  });

  /* Abrir com ?diag mostra as medidas da página REAL na tela. Num tablet não
     há console, e medir a página de teste já provou não bastar: ela difere da
     real justamente no layout. */
  if (location.search.indexOf('diag') >= 0) {
    setTimeout(function () {
      var ed = document.getElementById('editor');
      var m = medirSvg();
      var linhas = [
        'janela ' + window.innerWidth + 'x' + window.innerHeight,
        'editor ' + (ed ? ed.offsetWidth + 'x' + ed.offsetHeight : 'sem div'),
        'svg ' + m.l + 'x' + m.a,
        'categorias ' + document.querySelectorAll('.blocklyTreeRow').length,
        'blocos ' + document.querySelectorAll('#editor .blocklyDraggable').length,
        'flyout ' + (workspace.getFlyout && workspace.getFlyout() ? 'sim' : 'nao'),
        'nivel ' + nivel,
        'estado ' + spEstado.textContent
      ];
      var cx = document.createElement('div');
      cx.setAttribute('style',
        'position:fixed;left:0;bottom:0;right:0;z-index:99;background:#1b3a57;' +
        'color:#fff;font:14px monospace;padding:8px;white-space:pre-wrap');
      cx.appendChild(document.createTextNode(linhas.join('  |  ')));
      document.body.appendChild(cx);
    }, 1200);
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
    Arena.desenhar(ctx, poseAtual, missao);
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

  /* ---------- estado ---------- */

  function definirRodando(estaRodando) {
    if (rodando && !estaRodando) {
      tParado = Date.now();
      /* O robô para do mesmo jeito quando o programa acaba e quando a criança
         aperta PARAR — o protocolo manda o mesmo E 0 nos dois casos. Só o
         navegador sabe a diferença, e ela importa: comemorar uma desistência
         premia desistir e esvazia o sentido da festa. */
      if (!pediuParar) {
        tFim = Date.now();
        Som.tocar('fim');
        soltarConfete();
      }
    }
    pediuParar = false;
    rodando = estaRodando;
    btPlay.disabled = estaRodando || !robo || !robo.pronto();
    btParar.disabled = !estaRodando;
    spEstado.textContent = estaRodando ? 'rodando' : 'parado';
    if (!estaRodando) acender(null);
  }

  function conectar() {
    var protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:';
    robo = Rede.conectar(protocolo + '//' + location.host + '/', {
      aoConectar: function () {
        spEstado.textContent = 'parado';
        btPlay.disabled = false;
      },
      aoDesconectar: function () {
        spEstado.textContent = 'desconectado';
        /* Cair a conexão no meio de uma execução não é terminar o programa. */
        rodando = false;
        pediuParar = false;
        btPlay.disabled = true;
        btParar.disabled = true;
        setTimeout(conectar, 1500);
      },
      aoPc: function (pc) {
        var id = pc < mapaPc.length ? mapaPc[pc] : null;
        if (id && id !== blocoAceso) Som.tocar('comando');
        acender(id);
      },
      aoEstado: function (estado) {
        definirRodando(estado === 1);
      },
      aoTelem: function (t) {
        if (!viuTelemetria) { viuTelemetria = true; painel.style.display = 'flex'; }
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

  /* Sem telemetria por 2 s significa robô real: esconde a arena. */
  setTimeout(function () { if (!viuTelemetria) painel.style.display = 'none'; }, 2000);

  /* ---------- controles ---------- */

  btPlay.addEventListener('click', function () {
    spErro.textContent = '';
    Som.tocar('play');
    var compilado;
    try {
      compilado = Compilador.compilar(Blocos.workspaceParaAst(workspace));
    } catch (e) {
      spErro.textContent = e.message;
      return;
    }
    mapaPc = compilado.pcMap;
    robo.carregar(compilado.bytes);
    robo.rodar();
  });

  btParar.addEventListener('click', function () {
    pediuParar = true;
    robo.parar();
  });

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

  function trocarNivel(novo) {
    nivel = Niveis.definir(novo);
    marcarNivel();
    /* A caixa muda, o programa montado não. */
    workspace.updateToolbox(Niveis.caixaXml(nivel));
    aplicarNivel();
  }

  /* forEach, e não for: com var o laço não cria escopo, e todos os botões
     acabariam apontando para o último. */
  botoesNivel.forEach(function (b) {
    b.addEventListener('click', function () { trocarNivel(b.dataset.nivel); });
  });

  conectar();
})();
