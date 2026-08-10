(function () {
  'use strict';

  const btPlay = document.getElementById('play');
  const btParar = document.getElementById('parar');
  const btMudo = document.getElementById('mudo');
  const selNivel = document.getElementById('nivel');
  const spEstado = document.getElementById('estado');
  const spErro = document.getElementById('erro');
  const divLeitura = document.getElementById('leitura');
  const ctx = document.getElementById('arena').getContext('2d');
  const painel = document.getElementById('painel');
  const confete = document.getElementById('confete');

  let mapaPc = [];
  let blocoAceso = null;
  let robo = null;
  let viuTelemetria = false;
  let poseAtual = null;
  let rodando = false;

  let tColisao = -Infinity, tFim = -Infinity, tParado = Date.now();
  let pediuParar = false;
  let confetes = [];

  Campos.registrar();
  Blocos.definir();

  let nivel = Niveis.atual();
  selNivel.value = nivel;

  const workspace = Blockly.inject('editor', {
    toolbox: Niveis.caixaXml(nivel),
    trashcan: true,
    zoom: { controls: true, startScale: 1.0 },
    grid: { spacing: 22, length: 3, colour: '#dde3ea', snap: true },
  });

  /* O bloco raiz nasce fixo: a criança não precisa saber que ele existe. */
  const raiz = Blockly.serialization.blocks.append(
    { type: 'quando_play', x: 40, y: 30 }, workspace);
  raiz.setDeletable(false);
  raiz.setMovable(false);

  /* A caixa de blocos é um workspace à parte do principal, e é reconstruída
     toda vez que a criança abre uma categoria. Sem reaplicar o nível ali, a
     paleta mostra número e texto mesmo no Pequeno: a criança escolhe a peça
     vendo o que ela não deveria ver, e o bloco só simplifica depois de solto. */
  function aplicarNaPaleta() {
    const f = workspace.getFlyout && workspace.getFlyout();
    if (f) Niveis.aplicar(f.getWorkspace(), nivel);
  }

  function aplicarNivel() {
    Niveis.aplicar(workspace, nivel);
    aplicarNaPaleta();
  }

  aplicarNivel();
  /* Bloco novo arrastado da caixa também precisa nascer no nível certo. */
  workspace.addChangeListener((e) => {
    if (e.type === Blockly.Events.BLOCK_CREATE) Niveis.aplicar(workspace, nivel);
  });

  const paleta = workspace.getFlyout && workspace.getFlyout();
  if (paleta) {
    paleta.getWorkspace().addChangeListener((e) => {
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

  function marcar(id, ligado) {
    const b = workspace.getBlockById(id);
    if (!b || !b.getSvgRoot) return;
    b.getSvgRoot().classList.toggle('aceso', ligado);
  }

  /* ---------- confete ---------- */

  function soltarConfete() {
    confete.width = window.innerWidth;
    confete.height = window.innerHeight;
    const cores = ['#ffb703', '#1f9d4d', '#1f6feb', '#e0533d', '#a855f7'];
    confetes = [];
    for (let i = 0; i < 90; i++) {
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
    const c = confete.getContext('2d');
    c.clearRect(0, 0, confete.width, confete.height);
    if (confetes.length === 0) return;
    let vivos = 0;
    for (const p of confetes) {
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
    const agora = Date.now();
    Arena.desenhar(ctx, poseAtual);
    if (poseAtual) {
      const qual = Robo.reacao({
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
    const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:';
    robo = Rede.conectar(`${protocolo}//${location.host}/`, {
      aoConectar() {
        spEstado.textContent = 'parado';
        btPlay.disabled = false;
      },
      aoDesconectar() {
        spEstado.textContent = 'desconectado';
        /* Cair a conexão no meio de uma execução não é terminar o programa. */
        rodando = false;
        pediuParar = false;
        btPlay.disabled = true;
        btParar.disabled = true;
        setTimeout(conectar, 1500);
      },
      aoPc(pc) {
        const id = pc < mapaPc.length ? mapaPc[pc] : null;
        if (id && id !== blocoAceso) Som.tocar('comando');
        acender(id);
      },
      aoEstado(estado) {
        definirRodando(estado === 1);
      },
      aoTelem(t) {
        if (!viuTelemetria) { viuTelemetria = true; painel.style.display = 'flex'; }
        poseAtual = t;
        if (t.colidiu && Date.now() - tColisao > Robo.MS_TONTO) {
          tColisao = Date.now();
          Som.tocar('batida');
        }
        divLeitura.textContent = `distância: ${t.dist} cm`;
      },
    });
  }

  /* Sem telemetria por 2 s significa robô real: esconde a arena. */
  setTimeout(() => { if (!viuTelemetria) painel.style.display = 'none'; }, 2000);

  /* ---------- controles ---------- */

  btPlay.addEventListener('click', () => {
    spErro.textContent = '';
    Som.tocar('play');
    let compilado;
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

  btParar.addEventListener('click', () => {
    pediuParar = true;
    robo.parar();
  });

  function atualizarMudo() {
    const m = Som.mudo();
    btMudo.textContent = m ? '🔇' : '🔊';
    btMudo.classList.toggle('silenciado', m);
  }

  btMudo.addEventListener('click', () => {
    Som.alternarMudo();
    atualizarMudo();
  });

  selNivel.addEventListener('change', () => {
    nivel = Niveis.definir(selNivel.value);
    selNivel.value = nivel;
    /* A caixa muda, o programa montado não. */
    workspace.updateToolbox(Niveis.caixaXml(nivel));
    aplicarNivel();
  });

  conectar();
})();
