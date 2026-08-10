'use strict';
/* Um gabarito que não resolve é pior que gabarito nenhum: a criança que travou
   segue a resposta, não funciona, e conclui que o erro é dela.

   Não dá para conferir isso no papel — eu tentei, e errei duas vezes. O que
   decide é rodar: monta o gabarito, aperta PLAY e vê se a missão é cumprida.
   Roda os três níveis porque o desenho muda com eles — no Pequeno o caminho
   vira pilha de passos curtos, nos outros vira um bloco só com os segundos
   somados — e caminho igual em teoria já se provou diferente na prática.

   É o teste mais lento do projeto, alguns minutos. Vale: é o único que
   responde "esta fase tem solução, e a solução que eu dou funciona". */

const test = require('node:test');
const assert = require('node:assert');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Ws, pegarJson, espera } = require('./cdp.js');

const RAIZ = path.join(__dirname, '..');
const PORTA_WEB = 8097, PORTA_CDP = 9331;

function acharChromium() {
  for (const c of ['chromium', 'chromium-browser', 'google-chrome', '/snap/bin/chromium']) {
    const r = spawnSync('which', [c], { encoding: 'utf8' });
    if (r.status === 0) return r.stdout.trim();
  }
  return null;
}
const CHROMIUM = acharChromium();

async function esperarPorta(url, limiteMs) {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    try { await pegarJson(url); return true; } catch (_) { await espera(300); }
  }
  return false;
}

async function conferir(cdp, nivel) {
  await cdp.envia('Runtime.enable');
  await cdp.envia('Page.enable');
  const av = async (e) => {
    const r = await cdp.envia('Runtime.evaluate',
      { expression: e, returnByValue: true, awaitPromise: true });
    return r.exceptionDetails
      ? 'ERRO ' + JSON.stringify(r.exceptionDetails).slice(0, 200)
      : r.result.value;
  };

  await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB}/` });
  for (let i = 0; i < 60; i++) {
    if (await av(`document.readyState==='complete' && typeof Missoes!=='undefined' && !!Blockly.getMainWorkspace()`)) break;
    await espera(250);
  }
  await espera(1200);

  const quantas = await av('Missoes.quantas()');
    const falhou = [];

  for (let i = 0; i < quantas; i++) {
    /* Vai para a missão i e força o gabarito a aparecer. */
    await av(`(function () {
      Missoes.definir(${i});
      Niveis.definir('${nivel}');
      return 1;
    })()`);
    await cdp.envia('Page.reload');
    for (let k = 0; k < 60; k++) {
      if (await av(`document.readyState==='complete' && typeof Missoes!=='undefined' && !!Blockly.getMainWorkspace()`)) break;
      await espera(250);
    }
    await espera(1500);

    /* Espiona a pose sem tocar no código de produção: o desenho da arena
       recebe a pose a cada quadro. */
    await av(`(function () {
      if (!Arena.__orig) {
        Arena.__orig = Arena.desenhar;
        Arena.desenhar = function (c, e, al, ob) {
          window.__pose = e; return Arena.__orig(c, e, al, ob);
        };
      }
      return 1;
    })()`);

    const texto = await av(`document.getElementById('missao-texto').textContent`);
    const alvo = await av(`JSON.stringify({x: Missoes.daVez(${i}).x, y: Missoes.daVez(${i}).y})`);
    await av(`(function () {
      document.getElementById('gabarito').hidden = false;
      document.getElementById('gabarito').click();
      return 1;
    })()`);
    await espera(600);
    const blocos = await av(`Blockly.getMainWorkspace().getAllBlocks(false).length`);

    await av(`document.getElementById('play').click(), 1`);

    let ok = false;
    for (let k = 0; k < 260; k++) {          /* até ~65 s */
      await espera(250);
      if ((await av(`document.getElementById('missao').className`)) === 'cumprida') {
        ok = true;
        break;
      }
      const estado = await av(`document.getElementById('estado').textContent`);
      if (estado !== 'rodando' && k > 8) break;
    }

    const pose = await av(`window.__pose ? (Math.round(window.__pose.x*100)/100) + ',' + (Math.round(window.__pose.y*100)/100) : '?'`);
        if (!ok) falhou.push(`${nivel}/${texto} (parou em ${pose}, alvo ${alvo})`);
  }

    return falhou;
}

test('todo gabarito resolve a própria missão, nos três níveis',
  { skip: CHROMIUM ? false : 'sem Chromium nesta máquina', timeout: 900000 },
  async (t) => {
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });
    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'gab-'));
    const chrome = spawn(CHROMIUM, ['--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP}`, `--user-data-dir=${perfil}`, 'about:blank'],
      { stdio: 'ignore' });
    t.after(() => {
      chrome.kill(); bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });
    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP}/json/version`, 40000),
      'Chromium não subiu');

    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP}/json/list`);
    const cdp = new Ws(alvos.find((x) => x.type === 'page').webSocketDebuggerUrl);
    await cdp.pronto;

    const ruins = [];
    for (const nivel of ['pequeno', 'medio', 'grande']) {
      const r = await conferir(cdp, nivel);
      for (const x of r) ruins.push(x);
    }
    cdp.fechar();
    assert.deepStrictEqual(ruins, [], 'gabaritos que não resolvem');
  });
