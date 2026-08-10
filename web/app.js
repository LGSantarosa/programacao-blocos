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

  var mapaPc = [];
  var blocoAceso = null;
  var robo = null;
  var viuTelemetria = false;
  var poseAtual = null;
  var rodando = false;

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
    fontStyle: { family: 'system-ui, sans-serif', weight: 'bold', size: 11 },
  });

  var workspace = Blockly.inject('editor', {
    theme: tema,
    toolbox: Niveis.caixaXml(nivel),
    trashcan: true,
    zoom: { controls: true, startScale: 1.0 },
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
  function ajustarTamanho() {
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
        y: -20 - Math.random() * confete.height * 0.4,
        vx: (Math.random() - 0.5) * 2,
        vy: 2 + Math.random() * 3,
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
      p.x += p.vx; p.y += p.vy; p.giro += 0.1;
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
    Arena.desenhar(ctx, poseAtual);
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
