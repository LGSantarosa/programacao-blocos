/* O robô virtual como personagem. A decisão de qual reação mostrar é função
   pura, para poder ser testada fora do navegador; o desenho é a casca. */
(function (raiz) {
  'use strict';

  var RAIO_M = 0.08;
  var MS_TONTO = 1200;
  var MS_FELIZ = 2000;
  var MS_SONO  = 20000;

  /* Ordem de prioridade: o susto ganha da festa, que ganha do sono. */
  function reacao(estado) {
    var e = estado || {};
    var num = function (v) { return (typeof v === 'number' && isFinite(v)) ? v : Infinity; };
    if (num(e.msDesdeColisao) < MS_TONTO) return 'tonto';
    if (num(e.msDesdeFim) < MS_FELIZ) return 'feliz';
    if (typeof e.msParado === 'number' && e.msParado > MS_SONO) return 'dormindo';
    return 'normal';
  }

  function desenhar(ctx, pose, qual, ms) {
    var px = ctx.canvas.width;
    var LADO_M = 2.0;
    var m = function (v) { return (v / LADO_M) * px; };
    var my = function (v) { return px - (v / LADO_M) * px; };

    var cx = m(pose.x), cy = my(pose.y), r = m(RAIO_M);
    var pulo = qual === 'feliz' ? Math.abs(Math.sin(ms / 120)) * r * 0.35 : 0;

    ctx.save();
    ctx.translate(cx, cy - pulo);

    /* corpo */
    ctx.fillStyle = qual === 'dormindo' ? '#8fb8dd' : '#37c26b';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    /* Os olhos ficam do lado para onde ele aponta — é o que dá a leitura
       imediata de "para onde esse bicho vai". */
    var dx = Math.cos(pose.theta), dy = -Math.sin(pose.theta);
    var ox = dx * r * 0.38, oy = dy * r * 0.38;
    var perpX = -dy * r * 0.34, perpY = dx * r * 0.34;

    for (var s of [1, -1]) {
      var ex = ox + perpX * s, ey = oy + perpY * s;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.26, 0, Math.PI * 2);
      ctx.fill();

      if (qual === 'dormindo' || qual === 'feliz') {
        /* olho fechado: um traço */
        ctx.strokeStyle = '#1b3a57';
        ctx.lineWidth = Math.max(2, r * 0.1);
        ctx.beginPath();
        ctx.moveTo(ex - r * 0.16, ey);
        ctx.lineTo(ex + r * 0.16, ey);
        ctx.stroke();
      } else {
        var tremor = qual === 'tonto' ? Math.sin(ms / 40 + s) * r * 0.08 : 0;
        ctx.fillStyle = '#1b3a57';
        ctx.beginPath();
        ctx.arc(ex + dx * r * 0.08 + tremor, ey + dy * r * 0.08, r * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (qual === 'tonto') {
      ctx.fillStyle = '#ffc53d';
      ctx.font = 'bold ' + Math.round(r * 0.75) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (var k = 0; k < 3; k++) {
        var a = ms / 220 + (k * Math.PI * 2) / 3;
        ctx.fillText('✦', Math.cos(a) * r * 1.5, -r * 1.25 + Math.sin(a) * r * 0.35);
      }
    }

    if (qual === 'dormindo') {
      ctx.fillStyle = '#6c8aa5';
      ctx.font = 'bold ' + Math.round(r * 0.7) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      var sobe = (ms / 22) % (r * 2.2);
      ctx.fillText('z', r * 0.9, -r * 1.1 - sobe);
    }

    ctx.restore();
  }

  var api = { reacao: reacao, desenhar: desenhar, RAIO_M: RAIO_M,
              MS_TONTO: MS_TONTO, MS_FELIZ: MS_FELIZ, MS_SONO: MS_SONO };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Robo = api;
})(typeof self !== 'undefined' ? self : globalThis);
