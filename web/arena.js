/* Desenha a planta da missão: chão, obstáculos e feixe do ultrassônico. No
   simulador a pose acompanha a telemetria; com a ESP32 o robô fica desenhado
   no ponto de partida, porque a placa não informa onde está no mundo real. */
(function (raiz) {
  'use strict';

  var LADO_M = 2.0;           /* precisa bater com ARENA_LADO em physics.h */
  var RAIO_M = 0.08;
  /* A arena vem de fora, junto com a missão. Antes esta lista era constante e
     tinha uma gêmea no physics.c — duas cópias da mesma verdade, livres para
     divergirem em silêncio. Agora existe uma só, em missoes.js, e as duas
     pontas a recebem. */
  var OBSTACULOS = [];

  function desenhar(ctx, estado, alvo, obstaculos) {
    var px = ctx.canvas.width;
    var m = function (v) { return (v / LADO_M) * px; };
    /* y do canvas cresce para baixo; y da arena cresce para cima */
    var my = function (v) { return px - (v / LADO_M) * px; };

    ctx.clearRect(0, 0, px, px);

    ctx.fillStyle = '#fdf3dc';
    ctx.fillRect(0, 0, px, px);
    ctx.strokeStyle = '#e3c98a';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, px - 4, px - 4);

    ctx.fillStyle = '#20b0f0';
    var lista = obstaculos || OBSTACULOS;
    for (var o of lista) {
      ctx.fillRect(m(o.x0), my(o.y1), m(o.x1 - o.x0), m(o.y1 - o.y0));
    }

    /* A estrela da missão. Desenhada antes do feixe e do robô para eles
       passarem por cima dela, como um objeto no chão. */
    if (alvo) desenharEstrela(ctx, m(alvo.x), my(alvo.y), m(0.075));

    if (!estado) return;

    /* feixe do ultrassônico */
    var alcance = Math.min(estado.dist / 100, 4);
    ctx.strokeStyle = 'rgba(240, 192, 0, .85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(m(estado.x), my(estado.y));
    ctx.lineTo(
      m(estado.x + (RAIO_M + alcance) * Math.cos(estado.theta)),
      my(estado.y + (RAIO_M + alcance) * Math.sin(estado.theta))
    );
    ctx.stroke();
  }

  /* Cinco pontas, desenhadas por ângulo. Sem imagem: um PNG a mais custaria
     flash na placa, e a estrela precisa poder mudar de tamanho com a tela. */
  function desenharEstrela(ctx, cx, cy, raio) {
    var pontas = 5, giro = -Math.PI / 2, passo = Math.PI / pontas;
    ctx.beginPath();
    for (var i = 0; i < pontas * 2; i++) {
      var r = (i % 2 === 0) ? raio : raio * 0.45;
      ctx.lineTo(cx + Math.cos(giro) * r, cy + Math.sin(giro) * r);
      giro += passo;
    }
    ctx.closePath();
    ctx.fillStyle = '#f0c000';
    ctx.fill();
    ctx.strokeStyle = '#c79f00';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  raiz.Arena = { desenhar: desenhar };
})(typeof self !== 'undefined' ? self : globalThis);
