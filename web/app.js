(function () {
  'use strict';

  const btPlay = document.getElementById('play');
  const btParar = document.getElementById('parar');
  const spEstado = document.getElementById('estado');
  const spErro = document.getElementById('erro');
  const divLeitura = document.getElementById('leitura');
  const ctx = document.getElementById('arena').getContext('2d');
  const painel = document.getElementById('painel');

  let mapaPc = [];
  let blocoAceso = null;
  let robo = null;
  let viuTelemetria = false;

  Blocos.definir();

  const workspace = Blockly.inject('editor', {
    toolbox: Blocos.CAIXA_XML,
    trashcan: true,
    zoom: { controls: true, startScale: 1.0 },
    grid: { spacing: 22, length: 3, colour: '#dde3ea', snap: true },
  });

  /* O bloco raiz nasce fixo: a criança não precisa saber que ele existe. */
  const raiz = Blockly.serialization.blocks.append(
    { type: 'quando_play', x: 40, y: 30 }, workspace);
  raiz.setDeletable(false);
  raiz.setMovable(false);

  Arena.desenhar(ctx, null);

  function acender(id) {
    if (blocoAceso === id) return;
    if (blocoAceso) workspace.highlightBlock(null);
    blocoAceso = id;
    if (id) workspace.highlightBlock(id);
  }

  function definirRodando(rodando) {
    btPlay.disabled = rodando || !robo || !robo.pronto();
    btParar.disabled = !rodando;
    spEstado.textContent = rodando ? 'rodando' : 'parado';
    if (!rodando) acender(null);
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
        btPlay.disabled = true;
        btParar.disabled = true;
        setTimeout(conectar, 1500);
      },
      aoPc(pc) {
        acender(pc < mapaPc.length ? mapaPc[pc] : null);
      },
      aoEstado(estado) {
        definirRodando(estado === 1);
      },
      aoTelem(t) {
        if (!viuTelemetria) { viuTelemetria = true; painel.style.display = 'flex'; }
        Arena.desenhar(ctx, t);
        divLeitura.textContent = `distância: ${t.dist} cm`;
      },
    });
  }

  /* Sem telemetria por 2 s significa robô real: esconde a arena. */
  setTimeout(() => { if (!viuTelemetria) painel.style.display = 'none'; }, 2000);

  btPlay.addEventListener('click', () => {
    spErro.textContent = '';
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

  btParar.addEventListener('click', () => robo.parar());

  conectar();
})();
