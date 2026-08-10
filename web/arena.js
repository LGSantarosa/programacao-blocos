/* Desenha o mundo virtual: o chão, os obstáculos e o feixe do ultrassônico.
   Só existe no modo de teste: com a ESP32 nenhum pacote de telemetria chega
   e este painel some. */
(function (raiz) {
  'use strict';

  var LADO_M = 2.0;           /* precisa bater com ARENA_LADO em physics.h */
  var RAIO_M = 0.08;
  var OBSTACULOS = [{ x0: 0.80, y0: 1.40, x1: 1.20, y1: 1.60 }];

  function desenhar(ctx, estado) {
    var px = ctx.canvas.width;
    var m = function (v) { return (v / LADO_M) * px; };
    /* y do canvas cresce para baixo; y da arena cresce para cima */
    var my = function (v) { return px - (v / LADO_M) * px; };

    ctx.clearRect(0, 0, px, px);

    ctx.fillStyle = '#e4eef7';
    ctx.fillRect(0, 0, px, px);
    ctx.strokeStyle = '#a9c6de';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, px - 4, px - 4);

    ctx.fillStyle = '#b7cee0';
    for (var o of OBSTACULOS) {
      ctx.fillRect(m(o.x0), my(o.y1), m(o.x1 - o.x0), m(o.y1 - o.y0));
    }

    if (!estado) return;

    /* feixe do ultrassônico */
    var alcance = Math.min(estado.dist / 100, 4);
    ctx.strokeStyle = 'rgba(255, 197, 61, .75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(m(estado.x), my(estado.y));
    ctx.lineTo(
      m(estado.x + (RAIO_M + alcance) * Math.cos(estado.theta)),
      my(estado.y + (RAIO_M + alcance) * Math.sin(estado.theta))
    );
    ctx.stroke();
  }

  raiz.Arena = { desenhar };
})(typeof self !== 'undefined' ? self : globalThis);
