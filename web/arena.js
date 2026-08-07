/* Desenha o robô virtual. Só existe no modo de teste: com a ESP32 nenhum
   pacote de telemetria chega e este painel some. */
(function (raiz) {
  'use strict';

  const LADO_M = 2.0;           /* precisa bater com ARENA_LADO em physics.h */
  const RAIO_M = 0.08;
  const OBSTACULOS = [{ x0: 0.80, y0: 1.40, x1: 1.20, y1: 1.60 }];

  function desenhar(ctx, estado) {
    const px = ctx.canvas.width;
    const m = (v) => (v / LADO_M) * px;
    /* y do canvas cresce para baixo; y da arena cresce para cima */
    const my = (v) => px - (v / LADO_M) * px;

    ctx.clearRect(0, 0, px, px);

    ctx.fillStyle = '#e9edf2';
    ctx.fillRect(0, 0, px, px);
    ctx.strokeStyle = '#9aa5b1';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, px - 4, px - 4);

    ctx.fillStyle = '#b0bac5';
    for (const o of OBSTACULOS) {
      ctx.fillRect(m(o.x0), my(o.y1), m(o.x1 - o.x0), m(o.y1 - o.y0));
    }

    if (!estado) return;

    /* feixe do ultrassônico */
    const alcance = Math.min(estado.dist / 100, 4);
    ctx.strokeStyle = 'rgba(224, 138, 30, .55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(m(estado.x), my(estado.y));
    ctx.lineTo(
      m(estado.x + (RAIO_M + alcance) * Math.cos(estado.theta)),
      my(estado.y + (RAIO_M + alcance) * Math.sin(estado.theta))
    );
    ctx.stroke();

    /* corpo */
    ctx.fillStyle = '#1f6feb';
    ctx.beginPath();
    ctx.arc(m(estado.x), my(estado.y), m(RAIO_M), 0, Math.PI * 2);
    ctx.fill();

    /* nariz, para a criança ver para onde ele aponta */
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(m(estado.x), my(estado.y));
    ctx.lineTo(
      m(estado.x + RAIO_M * Math.cos(estado.theta)),
      my(estado.y + RAIO_M * Math.sin(estado.theta))
    );
    ctx.stroke();
  }

  raiz.Arena = { desenhar };
})(typeof self !== 'undefined' ? self : globalThis);
