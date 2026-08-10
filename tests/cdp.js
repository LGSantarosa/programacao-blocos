'use strict';
/* Cliente WebSocket mínimo para falar Chrome DevTools Protocol. Sem npm, igual
   ao resto do projeto — o bridge já provou que dá para escrever WebSocket à mão. */

const net = require('net');
const http = require('http');
const crypto = require('crypto');

function pegarJson(url) {
  return new Promise((ok, erro) => {
    http.get(url, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => { try { ok(JSON.parse(d)); } catch (e) { erro(e); } });
    }).on('error', erro);
  });
}

class Ws {
  constructor(url) {
    const u = new URL(url);
    this.prox = 1;
    this.pend = new Map();
    this.buf = Buffer.alloc(0);
    this.apertou = false;
    this.pronto = new Promise((ok) => (this._ok = ok));
    this.sock = net.connect(Number(u.port), u.hostname, () => {
      this.sock.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\n` +
        'Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\n' +
        `Sec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\n\r\n`);
    });
    this.sock.on('data', (p) => this._dados(p));
  }

  _dados(pedaco) {
    this.buf = Buffer.concat([this.buf, pedaco]);
    if (!this.apertou) {
      const i = this.buf.indexOf('\r\n\r\n');
      if (i < 0) return;
      this.buf = this.buf.subarray(i + 4);
      this.apertou = true;
      this._ok();
    }
    for (;;) {
      if (this.buf.length < 2) return;
      let tam = this.buf[1] & 0x7f, off = 2;
      if (tam === 126) {
        if (this.buf.length < 4) return;
        tam = this.buf.readUInt16BE(2); off = 4;
      } else if (tam === 127) {
        if (this.buf.length < 10) return;
        tam = Number(this.buf.readBigUInt64BE(2)); off = 10;
      }
      if (this.buf.length < off + tam) return;
      const carga = this.buf.subarray(off, off + tam).toString();
      this.buf = this.buf.subarray(off + tam);
      let m;
      try { m = JSON.parse(carga); } catch (_) { continue; }
      if (m.id && this.pend.has(m.id)) {
        const { ok, erro } = this.pend.get(m.id);
        this.pend.delete(m.id);
        m.error ? erro(new Error(JSON.stringify(m.error))) : ok(m.result);
      } else if (m.method && this.aoEvento) {
        /* Mensagem sem id é evento do navegador, não resposta nossa. */
        this.aoEvento(m);
      }
    }
  }

  envia(metodo, params = {}) {
    const id = this.prox++;
    const carga = Buffer.from(JSON.stringify({ id, method: metodo, params }));
    const mascara = crypto.randomBytes(4);
    const n = carga.length;
    let cab;
    if (n < 126) cab = Buffer.from([0x81, 0x80 | n]);
    else if (n < 65536) {
      cab = Buffer.alloc(4); cab[0] = 0x81; cab[1] = 0xfe; cab.writeUInt16BE(n, 2);
    } else {
      cab = Buffer.alloc(10); cab[0] = 0x81; cab[1] = 0xff;
      cab.writeBigUInt64BE(BigInt(n), 2);
    }
    const corpo = Buffer.from(carga);
    for (let i = 0; i < corpo.length; i++) corpo[i] ^= mascara[i % 4];
    this.sock.write(Buffer.concat([cab, mascara, corpo]));
    return new Promise((ok, erro) => this.pend.set(id, { ok, erro }));
  }

  fechar() { this.sock.destroy(); }
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { Ws, pegarJson, espera };
