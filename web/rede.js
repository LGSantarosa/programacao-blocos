/* Fala o protocolo binário. É o mesmo código para o robô virtual e para a
   ESP32 — só muda a URL. */
(function (raiz) {
  'use strict';

  var T_LOAD = 0x01, T_RUN = 0x02, T_STOP = 0x03, T_ARENA = 0x04;
  var T_PC = 0x81, T_STATE = 0x82, T_TELEM = 0x83, T_VALOR = 0x84;

  function conectar(url, manipuladores) {
    var ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    ws.onopen = function () { if (manipuladores.aoConectar) manipuladores.aoConectar(); };
    ws.onclose = function () { if (manipuladores.aoDesconectar) manipuladores.aoDesconectar(); };
    ws.onerror = function () { if (manipuladores.aoDesconectar) manipuladores.aoDesconectar(); };

    ws.onmessage = function (ev) {
      var d = new DataView(ev.data);
      if (d.byteLength === 0) return;
      switch (d.getUint8(0)) {
        case T_PC:
          if (manipuladores.aoPc) manipuladores.aoPc(d.getUint16(1, true));
          break;
        case T_STATE:
          if (manipuladores.aoEstado) manipuladores.aoEstado(d.getUint8(1));
          break;
        case T_TELEM:
          if (manipuladores.aoTelem) {
            manipuladores.aoTelem({
              x: d.getInt16(1, true) / 1000,
              y: d.getInt16(3, true) / 1000,
              theta: (d.getInt16(5, true) / 10) * Math.PI / 180,
              dist: d.getUint16(7, true),
              colidiu: d.byteLength > 9 && d.getUint8(9) === 1,
            });
          }
          break;
        case T_VALOR:
          if (manipuladores.aoValor) manipuladores.aoValor(d.getInt32(1, true));
          break;
        default:
          break;
      }
    };

    function pronto() { return ws.readyState === WebSocket.OPEN; }

    return {
      pronto,
      carregar: function (bytes) {
        if (!pronto()) return;
        var quadro = new Uint8Array(3 + bytes.length);
        new DataView(quadro.buffer).setUint8(0, T_LOAD);
        new DataView(quadro.buffer).setUint16(1, bytes.length / 7, true);
        quadro.set(bytes, 3);
        ws.send(quadro);
      },
      /* Manda a fase: onde o robô nasce e o que há no caminho. Em milímetros,
         porque inteiro atravessa o protocolo sem os dois lados arredondarem
         diferente. */
      arena: function (inicio, obstaculos) {
        if (!pronto()) return;
        var n = obstaculos ? obstaculos.length : 0;
        var q = new Uint8Array(8 + n * 8);
        var d = new DataView(q.buffer);
        d.setUint8(0, T_ARENA);
        d.setInt16(1, Math.round(inicio.x * 1000), true);
        d.setInt16(3, Math.round(inicio.y * 1000), true);
        d.setInt16(5, Math.round(inicio.theta * 180 / Math.PI * 10), true);
        d.setUint8(7, n);
        for (var i = 0; i < n; i++) {
          var o = obstaculos[i], b = 8 + i * 8;
          d.setInt16(b + 0, Math.round(o.x0 * 1000), true);
          d.setInt16(b + 2, Math.round(o.y0 * 1000), true);
          d.setInt16(b + 4, Math.round(o.x1 * 1000), true);
          d.setInt16(b + 6, Math.round(o.y1 * 1000), true);
        }
        ws.send(q);
      },
      rodar: function () { if (pronto()) ws.send(new Uint8Array([T_RUN])); },
      parar: function () { if (pronto()) ws.send(new Uint8Array([T_STOP])); },
    };
  }

  raiz.Rede = { conectar };
})(typeof self !== 'undefined' ? self : globalThis);
