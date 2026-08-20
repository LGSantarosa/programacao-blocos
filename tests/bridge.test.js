'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { servidor, versao, paraLinhaDoRobo, paraQuadroDoNavegador, montarQuadro } =
  require('../bridge/server.js');

test('LOAD vira uma linha L com o programa em hex', () => {
  const carga = Buffer.alloc(3 + 7);
  carga[0] = 0x01;
  carga.writeUInt16LE(1, 1);
  carga[3] = 0x00;                        // HALT, resto zerado
  assert.strictEqual(paraLinhaDoRobo(carga), 'L 00000000000000');
});

test('LOAD com tamanho inconsistente é descartado', () => {
  const carga = Buffer.alloc(3 + 7);
  carga[0] = 0x01;
  carga.writeUInt16LE(5, 1);              // diz 5 instruções, traz 1
  assert.strictEqual(paraLinhaDoRobo(carga), null);
});

test('ARENA vira a linha A, em milímetros', () => {
  /* 0x04 x y theta n, depois n retângulos. Tudo int16 little-endian. */
  const c = Buffer.alloc(8 + 8);
  c[0] = 0x04;
  c.writeInt16LE(1000, 1);   /* x = 1,000 m */
  c.writeInt16LE(400, 3);    /* y = 0,400 m */
  c.writeInt16LE(900, 5);    /* 90,0 graus  */
  c.writeUInt8(1, 7);
  c.writeInt16LE(800, 8); c.writeInt16LE(1400, 10);
  c.writeInt16LE(1200, 12); c.writeInt16LE(1600, 14);
  assert.strictEqual(paraLinhaDoRobo(c), 'A 1000 400 900 1 800 1400 1200 1600');
});

test('ARENA sem obstáculo nenhum é válida', () => {
  const c = Buffer.alloc(8);
  c[0] = 0x04;
  c.writeInt16LE(220, 1); c.writeInt16LE(220, 3); c.writeInt16LE(900, 5);
  c.writeUInt8(0, 7);
  assert.strictEqual(paraLinhaDoRobo(c), 'A 220 220 900 0');
});

test('ARENA com tamanho inconsistente é descartada', () => {
  const c = Buffer.alloc(8 + 8);
  c[0] = 0x04;
  c.writeUInt8(5, 7);        /* diz 5 retângulos, traz 1 */
  assert.strictEqual(paraLinhaDoRobo(c), null);
});

test('RUN e STOP viram R e S', () => {
  assert.strictEqual(paraLinhaDoRobo(Buffer.from([0x02])), 'R');
  assert.strictEqual(paraLinhaDoRobo(Buffer.from([0x03])), 'S');
});

test('tipo desconhecido é descartado', () => {
  assert.strictEqual(paraLinhaDoRobo(Buffer.from([0x77])), null);
});

test('P vira quadro de pc', () => {
  const q = paraQuadroDoNavegador('P 300');
  assert.strictEqual(q[0], 0x81);
  assert.strictEqual(q.readUInt16LE(1), 300);
});

test('E vira quadro de estado', () => {
  assert.deepStrictEqual([...paraQuadroDoNavegador('E 1')], [0x82, 1]);
  assert.deepStrictEqual([...paraQuadroDoNavegador('E 0')], [0x82, 0]);
});

test('T vira quadro de telemetria com sinal preservado', () => {
  const q = paraQuadroDoNavegador('T 1000 400 2700 92 0');
  assert.strictEqual(q.length, 10);
  assert.strictEqual(q[0], 0x83);
  assert.strictEqual(q.readInt16LE(1), 1000);
  assert.strictEqual(q.readInt16LE(3), 400);
  assert.strictEqual(q.readInt16LE(5), 2700);
  assert.strictEqual(q.readUInt16LE(7), 92);
  assert.strictEqual(q[9], 0);
});

test('T carrega o byte de colisão', () => {
  assert.strictEqual(paraQuadroDoNavegador('T 1000 400 2700 92 1')[9], 1);
});

test('T sem o campo de colisão assume que não bateu', () => {
  const q = paraQuadroDoNavegador('T 1000 400 2700 92');
  assert.strictEqual(q.length, 10);
  assert.strictEqual(q[9], 0);
});

test('quadro curto usa cabeçalho de 2 bytes', () => {
  const q = montarQuadro(Buffer.alloc(10));
  assert.strictEqual(q.length, 12);
  assert.strictEqual(q[0], 0x82);         // FIN + binário
  assert.strictEqual(q[1], 10);
});

test('quadro longo usa cabeçalho estendido de 4 bytes', () => {
  const q = montarQuadro(Buffer.alloc(1794));   // LOAD cheio: 256 instruções
  assert.strictEqual(q.length, 1798);
  assert.strictEqual(q[1], 126);
  assert.strictEqual(q.readUInt16BE(2), 1794);
});

/* O servidor de arquivos nunca tinha teste, e escondia um defeito: a raiz com
   query string caía no ramo de arquivo e tentava ler o diretório web/, dando
   404 em algo que existe. Aconteceu de verdade com "/?diag". */
test('a raiz responde, com ou sem query string', async () => {
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  const porta = servidor.address().port;

  const pegar = (caminho) => new Promise((ok) => {
    http.get({ host: '127.0.0.1', port: porta, path: caminho }, (r) => {
      r.resume();
      ok(r.statusCode);
    });
  });

  try {
    assert.strictEqual(await pegar('/'), 200, 'a raiz nua deveria abrir');
    assert.strictEqual(await pegar('/?diag'), 200, 'a raiz com query deveria abrir');
    assert.strictEqual(await pegar('/index.html'), 200);
    assert.strictEqual(await pegar('/app.js?v=2'), 200, 'arquivo com query deveria abrir');
    assert.strictEqual(await pegar('/nao-existe.js'), 404);
  } finally {
    await new Promise((ok) => servidor.close(ok));
  }
});

test('o HTML sai carimbado com a versão, e o carimbo muda com os arquivos', async () => {
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  const porta = servidor.address().port;

  const corpo = (caminho) => new Promise((ok) => {
    http.get({ host: '127.0.0.1', port: porta, path: caminho }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => ok(d));
    });
  });

  try {
    const html = await corpo('/');
    assert.ok(!html.includes('%VERSAO%'), 'o marcador ficou sem substituir');
    assert.ok(html.includes(versao()), 'o HTML não trouxe a versão atual');
    assert.match(versao(), /^[a-f0-9]{7}$/);
  } finally {
    await new Promise((ok) => servidor.close(ok));
  }
});

test('a linha V vira o quadro T_VALOR, em int32', () => {
  const q = paraQuadroDoNavegador('V 42');
  assert.strictEqual(q.length, 5);
  assert.strictEqual(q[0], 0x84);
  assert.strictEqual(q.readInt32LE(1), 42);
});

test('o valor relatado passa dos 16 bits sem estragar', () => {
  /* A pilha da VM é int32, e 100 x 100 já não caberia em int16. Cortar aqui
     faria a bolha mentir para a criança justamente na conta grande, que é a
     que ela quis conferir. */
  const q = paraQuadroDoNavegador('V 100000');
  assert.strictEqual(q.readInt32LE(1), 100000);
});

test('valor negativo atravessa como negativo', () => {
  const q = paraQuadroDoNavegador('V -7');
  assert.strictEqual(q.readInt32LE(1), -7);
});
