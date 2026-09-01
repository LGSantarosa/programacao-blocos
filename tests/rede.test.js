'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Rede = require('../web/rede.js');

test('no navegador comum, o alvo é a própria origem em ws://', () => {
  assert.strictEqual(Rede.url('localhost:8080', 'http:'), 'ws://localhost:8080/');
});

test('página servida por https usa wss', () => {
  assert.strictEqual(Rede.url('exemplo.org', 'https:'), 'wss://exemplo.org/');
});

test('a placa é sempre ws: não existe certificado em 192.168.4.1', () => {
  assert.strictEqual(Rede.url('192.168.4.1', 'http:'), 'ws://192.168.4.1/');
});

test('o alvo pode trazer porta junto', () => {
  assert.strictEqual(Rede.url('127.0.0.1:53411', 'http:'), 'ws://127.0.0.1:53411/');
});

/* Um soquete de mentira, para exercitar o que chega de lá. O construtor
   devolve o objeto que o teste segura: `new` com retorno de objeto entrega
   esse objeto, e é assim que dá para chamar o onmessage à mão. */
function soqueteFalso() {
  const ws = { readyState: 1, send() {}, close() {} };
  global.WebSocket = function () { return ws; };
  global.WebSocket.OPEN = 1;
  return ws;
}

function quadro(bytes) {
  return { data: new Uint8Array(bytes).buffer };
}

test('a placa manda a leitura sozinha, no 0x85, e ela chega inteira', () => {
  const ws = soqueteFalso();
  let visto = null;
  Rede.conectar('ws://192.168.4.1/', { aoDistancia: (cm) => { visto = cm; } });
  /* 300 cm = 0x012C, little-endian. */
  ws.onmessage(quadro([0x85, 0x2c, 0x01]));
  assert.strictEqual(visto, 300);
});

test('o 400 do eco que não voltou atravessa sem virar outra coisa', () => {
  const ws = soqueteFalso();
  let visto = null;
  Rede.conectar('ws://192.168.4.1/', { aoDistancia: (cm) => { visto = cm; } });
  ws.onmessage(quadro([0x85, 0x90, 0x01]));
  assert.strictEqual(visto, 400);
});

/* O robô virtual continua contando a distância dentro da pose: são dois
   caminhos até o mesmo painel, e quebrar um para arrumar o outro seria trocar
   de defeito. */
test('a telemetria do robô virtual continua trazendo a distância', () => {
  const ws = soqueteFalso();
  let visto = null;
  Rede.conectar('ws://127.0.0.1:9/', { aoTelem: (t) => { visto = t.dist; } });
  const q = new Uint8Array(10);
  const d = new DataView(q.buffer);
  d.setUint8(0, 0x83);
  d.setInt16(1, 1000, true);
  d.setInt16(3, 400, true);
  d.setInt16(5, 900, true);
  d.setUint16(7, 42, true);
  ws.onmessage({ data: q.buffer });
  assert.strictEqual(visto, 42);
});

test('quem não escuta distância não quebra quando ela chega', () => {
  const ws = soqueteFalso();
  Rede.conectar('ws://192.168.4.1/', {});
  assert.doesNotThrow(() => ws.onmessage(quadro([0x85, 0x2c, 0x01])));
});
