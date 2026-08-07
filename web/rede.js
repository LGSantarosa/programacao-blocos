/* Fala o protocolo binário. É o mesmo código para o robô virtual e para a
   ESP32 — só muda a URL. */
(function (raiz) {
  'use strict';

  const T_LOAD = 0x01, T_RUN = 0x02, T_STOP = 0x03;
  const T_PC = 0x81, T_STATE = 0x82, T_TELEM = 0x83;

  function conectar(url, manipuladores) {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => manipuladores.aoConectar && manipuladores.aoConectar();
    ws.onclose = () => manipuladores.aoDesconectar && manipuladores.aoDesconectar();
    ws.onerror = () => manipuladores.aoDesconectar && manipuladores.aoDesconectar();

    ws.onmessage = (ev) => {
      const d = new DataView(ev.data);
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
        default:
          break;
      }
    };

    function pronto() { return ws.readyState === WebSocket.OPEN; }

    return {
      pronto,
      carregar(bytes) {
        if (!pronto()) return;
        const quadro = new Uint8Array(3 + bytes.length);
        new DataView(quadro.buffer).setUint8(0, T_LOAD);
        new DataView(quadro.buffer).setUint16(1, bytes.length / 7, true);
        quadro.set(bytes, 3);
        ws.send(quadro);
      },
      rodar() { if (pronto()) ws.send(new Uint8Array([T_RUN])); },
      parar() { if (pronto()) ws.send(new Uint8Array([T_STOP])); },
    };
  }

  raiz.Rede = { conectar };
})(typeof self !== 'undefined' ? self : globalThis);
