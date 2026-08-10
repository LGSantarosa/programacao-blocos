/* Bipes sintetizados por Web Audio. Nenhum arquivo de áudio: o flash da ESP32
   não tem orçamento para asset de som, e síntese custa zero byte. */
(function (raiz) {
  'use strict';

  /* Cada som é uma sequência de notas. Dado puro, para poder ser testado
     fora do navegador — a síntese abaixo é uma casca fina em cima disto. */
  var SONS = {
    play:    [{ hz: 660, ms: 60,  tipo: 'square' }],
    comando: [{ hz: 880, ms: 45,  tipo: 'square' }],
    batida:  [{ hz: 160, ms: 140, tipo: 'sawtooth' }],
    fim:     [{ hz: 523, ms: 110, tipo: 'square' },
              { hz: 659, ms: 110, tipo: 'square' },
              { hz: 784, ms: 200, tipo: 'square' }],
  };

  var CHAVE = 'robo_mudo';
  var mudoAgora = false;
  var ctx = null;

  var temArmazenamento = typeof localStorage !== 'undefined';
  try {
    if (temArmazenamento) mudoAgora = localStorage.getItem(CHAVE) === '1';
  } catch (e) { /* sem acesso: começa com som */ }

  function mudo() { return mudoAgora; }

  function alternarMudo() {
    mudoAgora = !mudoAgora;
    /* O Safari em navegação privada tem localStorage mas lança ao gravar. */
    try {
      if (temArmazenamento) localStorage.setItem(CHAVE, mudoAgora ? '1' : '0');
    } catch (e) { /* só a memória desta sessão, e tudo bem */ }
    return mudoAgora;
  }

  function contexto() {
    if (ctx) return ctx;
    var Classe = typeof AudioContext !== 'undefined' ? AudioContext
                 : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
    if (!Classe) return null;
    ctx = new Classe();
    return ctx;
  }

  function tocar(nome) {
    var notas = SONS[nome];
    if (!notas || mudoAgora) return;
    var c = contexto();
    if (!c) return;                       /* fora do navegador: silêncio */

    /* Som é enfeite. Se o navegador tiver qualquer implicância com Web Audio,
       ele fica mudo — nunca derruba o robô. Um iPad 2 já quebrou a página
       inteira por causa de uma linha daqui. */
    try {
      /* O navegador só libera áudio depois de um gesto do usuário. */
      if (c.state === 'suspended' && typeof c.resume === 'function') c.resume();

      var quando = c.currentTime;
      for (var i = 0; i < notas.length; i++) {
        var n = notas[i];
        var osc = c.createOscillator();
        var vol = c.createGain();
        osc.type = n.tipo;
        osc.frequency.value = n.hz;
        /* Rampa curta nas pontas: sem ela, cada nota estala. */
        vol.gain.setValueAtTime(0.0001, quando);
        vol.gain.exponentialRampToValueAtTime(0.2, quando + 0.01);
        vol.gain.exponentialRampToValueAtTime(0.0001, quando + n.ms / 1000);
        /* Duas linhas, não encadeado: connect() só devolve o nó de destino em
           navegador novo. No Safari do iOS 9 devolve undefined, e encadear
           estoura. */
        osc.connect(vol);
        vol.connect(c.destination);
        osc.start(quando);
        if (typeof osc.stop === 'function') osc.stop(quando + n.ms / 1000 + 0.02);
        quando += n.ms / 1000;
      }
    } catch (e) {
      /* Mudo é melhor que quebrado. */
    }
  }

  var api = { SONS, tocar, mudo, alternarMudo };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Som = api;
})(typeof self !== 'undefined' ? self : globalThis);
