'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RAIZ_WEB = path.join(__dirname, '..', 'web');
const BIN_HOST = path.join(__dirname, '..', 'host', 'robo_host');
const PORTA = Number(process.env.PORTA || 8080);

const GUID_WS = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const T_LOAD = 0x01, T_RUN = 0x02, T_STOP = 0x03;
const T_PC = 0x81, T_STATE = 0x82, T_TELEM = 0x83;

/* Carimbo de versão: um resumo do estado real dos arquivos servidos. Injetado
   no HTML na hora de servir, então o número na tela é sempre o do arquivo que
   acabou de sair daqui — se a tela mostra um e o servidor diz outro, é cache. */
function versao() {
  const alvos = ['index.html'].concat(
    fs.readdirSync(RAIZ_WEB).filter((f) => f.endsWith('.js')).sort());
  const h = crypto.createHash('sha1');
  for (const f of alvos) {
    try {
      const st = fs.statSync(path.join(RAIZ_WEB, f));
      h.update(f + st.size + st.mtimeMs);
    } catch (_) { /* arquivo sumiu entre listar e medir */ }
  }
  return h.digest('hex').slice(0, 7);
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

/* ---------- HTTP: arquivos estáticos ---------- */

const servidor = http.createServer((req, res) => {
  /* Tira a query ANTES de decidir: "/?diag" não é igual a "/", e comparar
     antes fazia a raiz com query cair no ramo de arquivo e tentar ler o
     diretório web/ — 404 em algo que existe. */
  const semQuery = req.url.split('?')[0];
  const caminho = (semQuery === '/' || semQuery === '') ? '/index.html' : semQuery;
  const arquivo = path.join(RAIZ_WEB, path.normalize(decodeURIComponent(caminho)));
  if (!arquivo.startsWith(RAIZ_WEB)) {
    res.writeHead(403).end('proibido');
    return;
  }
  fs.readFile(arquivo, (erro, dados) => {
    if (erro) {
      res.writeHead(404).end('não encontrado');
      return;
    }
    if (path.extname(arquivo) === '.html') {
      dados = Buffer.from(dados.toString().replace(/%VERSAO%/g, versao()));
    }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream',
      /* Sem cache: este servidor existe para desenvolver e para a sala de aula,
         onde recarregar precisa mesmo trazer o arquivo novo. O Safari guarda
         JavaScript com unhas e dentes — um iPad chegou a rodar por horas uma
         versão antiga e quebrada, enquanto o servidor já servia a corrigida. */
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.end(dados);
  });
});

/* ---------- WebSocket ---------- */

function montarQuadro(carga, opcode = 0x2) {
  const n = carga.length;
  let cabecalho;
  if (n < 126) {
    cabecalho = Buffer.from([0x80 | opcode, n]);
  } else {
    cabecalho = Buffer.alloc(4);
    cabecalho[0] = 0x80 | opcode;
    cabecalho[1] = 126;
    cabecalho.writeUInt16BE(n, 2);
  }
  return Buffer.concat([cabecalho, carga]);
}

function lerQuadros(socket, aoReceber) {
  let buf = Buffer.alloc(0);
  socket.on('data', (pedaco) => {
    buf = Buffer.concat([buf, pedaco]);
    for (;;) {
      if (buf.length < 2) return;
      const fim = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      const mascarado = (buf[1] & 0x80) !== 0;
      let tam = buf[1] & 0x7f;
      let off = 2;

      if (tam === 126) {
        if (buf.length < 4) return;
        tam = buf.readUInt16BE(2);
        off = 4;
      } else if (tam === 127) {
        socket.destroy();               // acima de 64 KB não é usado aqui
        return;
      }
      if (mascarado && buf.length < off + 4) return;
      const mascara = mascarado ? buf.subarray(off, off + 4) : null;
      if (mascarado) off += 4;
      if (buf.length < off + tam) return;

      const carga = Buffer.from(buf.subarray(off, off + tam));
      if (mascara) {
        for (let i = 0; i < carga.length; i++) carga[i] ^= mascara[i % 4];
      }
      buf = buf.subarray(off + tam);

      if (opcode === 0x8) { socket.end(); return; }
      if (opcode === 0x9) { socket.write(montarQuadro(carga, 0xa)); continue; }
      if (opcode === 0xa) continue;
      if (!fim) { socket.destroy(); return; }   // não lidamos com fragmentação
      if (opcode === 0x1 || opcode === 0x2) aoReceber(carga);
    }
  });
}

servidor.on('upgrade', (req, socket) => {
  const chave = req.headers['sec-websocket-key'];
  if (!chave) { socket.destroy(); return; }
  const aceite = crypto.createHash('sha1').update(chave + GUID_WS).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${aceite}\r\n\r\n`
  );
  socket.setNoDelay(true);
  ligarRobo(socket);
});

/* ---------- tradução binário <-> texto ---------- */

function paraLinhaDoRobo(carga) {
  if (carga.length === 0) return null;
  switch (carga[0]) {
    case T_LOAD: {
      if (carga.length < 3) return null;
      const n = carga.readUInt16LE(1);
      if (carga.length !== 3 + n * 7) return null;
      return `L ${carga.subarray(3).toString('hex')}`;
    }
    case T_RUN:  return 'R';
    case T_STOP: return 'S';
    default:     return null;
  }
}

function paraQuadroDoNavegador(linha) {
  const p = linha.split(' ');
  if (p[0] === 'P') {
    const q = Buffer.alloc(3);
    q[0] = T_PC;
    q.writeUInt16LE(Number(p[1]) & 0xffff, 1);
    return q;
  }
  if (p[0] === 'E') {
    return Buffer.from([T_STATE, Number(p[1]) ? 1 : 0]);
  }
  if (p[0] === 'T') {
    const q = Buffer.alloc(10);
    q[0] = T_TELEM;
    q.writeInt16LE(Number(p[1]) | 0, 1);
    q.writeInt16LE(Number(p[2]) | 0, 3);
    q.writeInt16LE(Number(p[3]) | 0, 5);
    q.writeUInt16LE(Number(p[4]) & 0xffff, 7);
    q[9] = Number(p[5]) ? 1 : 0;      /* ausente vira 0 */
    return q;
  }
  return null;
}

/* ---------- um robô por conexão ---------- */

function ligarRobo(socket) {
  const proc = spawn(BIN_HOST, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  let pendente = '';

  proc.stdout.on('data', (pedaco) => {
    pendente += pedaco.toString();
    let i;
    while ((i = pendente.indexOf('\n')) >= 0) {
      const linha = pendente.slice(0, i).trim();
      pendente = pendente.slice(i + 1);
      const quadro = paraQuadroDoNavegador(linha);
      if (quadro && !socket.destroyed) socket.write(montarQuadro(quadro));
    }
  });

  lerQuadros(socket, (carga) => {
    const linha = paraLinhaDoRobo(carga);
    if (linha && proc.stdin.writable) proc.stdin.write(linha + '\n');
  });

  const encerrar = () => { try { proc.kill(); } catch (_) {} };
  socket.on('close', encerrar);
  socket.on('error', encerrar);
  proc.on('exit', () => socket.destroy());
}

if (require.main === module) {
  servidor.listen(PORTA, () => {
    console.log(`robô virtual em http://localhost:${PORTA}`);
  });
}

module.exports = { servidor, versao, paraLinhaDoRobo, paraQuadroDoNavegador, montarQuadro };
