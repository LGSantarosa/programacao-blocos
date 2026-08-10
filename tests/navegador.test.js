'use strict';
/* Sobe o bridge, dirige um Chromium headless e confere o que a criança veria.
   É o único nível em que dá para testar que trocar de nível não desmonta o
   programa dela. Pula sozinho se não houver Chromium na máquina. */

const test = require('node:test');
const assert = require('node:assert');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Ws, pegarJson, espera } = require('./cdp.js');

const RAIZ = path.join(__dirname, '..');
const PORTA_WEB = 8099, PORTA_CDP = 9333;

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

test('a criança monta, roda e sobe de nível sem perder nada',
  { skip: CHROMIUM ? false : 'sem Chromium nesta máquina', timeout: 120000 },
  async (t) => {
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP}/json/version`, 40000),
      'Chromium não subiu');

    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP}/json/list`);
    const cdp = new Ws(alvos.find((a) => a.type === 'page').webSocketDebuggerUrl);
    await cdp.pronto;
    await cdp.envia('Runtime.enable');
    await cdp.envia('Page.enable');

    /* Uma página pode desenhar a casca inteira e mesmo assim estar quebrada
       por dentro. Recolhemos tudo que for exceção antes de navegar. */
    const erros = [];
    cdp.aoEvento = (m) => {
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        erros.push(d.exception ? (d.exception.description || d.text) : d.text);
      }
    };

    const aval = async (expr) => {
      const r = await cdp.envia('Runtime.evaluate',
        { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(expr + ' -> ' + JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };

    await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB}/` });

    /* Esperar por condição, não por relógio. Tempo fixo ora sobra, ora falta,
       e um teste que falha sozinho de vez em quando é quase tão ruim quanto um
       que passa sem testar nada. */
    const prontaEm = Date.now() + 30000;
    let pronta = false;
    while (Date.now() < prontaEm && !pronta) {
      pronta = await aval(`document.readyState === 'complete'
        && typeof Blockly !== 'undefined'
        && !!Blockly.getMainWorkspace()
        && !!document.getElementById('play')`).catch(() => false);
      if (!pronta) await espera(250);
    }
    assert.ok(pronta, 'a página não ficou pronta em 30 s');

    assert.strictEqual(await aval('document.title'), 'Robô de Blocos');
    assert.strictEqual(await aval('typeof Blockly'), 'object');

    /* Monta no Pequeno: dois passos e um giro, sem número nenhum. */
    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=pequeno]').click();
      const ws = Blockly.getMainWorkspace();
      Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
        type: 'quando_play', x: 40, y: 30,
        inputs: { CORPO: { block: {
          type: 'mover_frente', fields: { SEG: 0.5 },
          next: { block: { type: 'girar', fields: { GRAUS: 90 } } }
        } } }
      }] } }, ws);
      Niveis.aplicar(ws, 'pequeno');
      return 1;
    })()`);

    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace()
        .getBlocksByType('mover_frente', false)[0].getField('SEG').isVisible()`),
      false, 'no Pequeno o número não deveria aparecer');

    /* A paleta é um workspace à parte. Se o nível não for aplicado nela, a
       criança escolhe a peça vendo número e texto que o nível dela esconde. */
    await aval(`(() => {
      const tb = Blockly.getMainWorkspace().getToolbox();
      tb.setSelectedItem(tb.getToolboxItems()[0]);
      return 1;
    })()`);
    await espera(600);

    assert.strictEqual(
      await aval(`(() => {
        const f = Blockly.getMainWorkspace().getFlyout();
        const b = f && f.getWorkspace().getBlocksByType('mover_frente', false)[0];
        return b ? b.getField('SEG').isVisible() : 'sem bloco na paleta';
      })()`),
      false, 'no Pequeno a paleta não deveria mostrar o número');

    assert.strictEqual(
      await aval(`(() => {
        const f = Blockly.getMainWorkspace().getFlyout();
        const b = f && f.getWorkspace().getBlocksByType('mover_frente', false)[0];
        return b ? b.getField('T1').isVisible() : 'sem bloco na paleta';
      })()`),
      false, 'no Pequeno a paleta não deveria mostrar a palavra');

    /* Sobe para Médio: o programa continua, o número aparece com o valor. */
    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=medio]').click();
      return 1;
    })()`);
    await espera(400);

    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace().getBlocksByType('mover_frente', false).length`),
      1, 'o programa sumiu ao trocar de nível');
    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace()
        .getBlocksByType('mover_frente', false)[0].getField('SEG').isVisible()`),
      true, 'no Médio o número deveria aparecer');
    assert.strictEqual(
      await aval(`Number(Blockly.getMainWorkspace()
        .getBlocksByType('mover_frente', false)[0].getFieldValue('SEG'))`),
      0.5, 'o valor escondido não foi preservado');

    /* Roda e confere a sequência de blocos acesos. */
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      window.__seq = [];
      document.getElementById('play').click();
      const alvo = document.getElementById('editor');
      window.__obs = new MutationObserver(() => {
        const el = alvo.querySelector('.aceso');
        const id = el && el.getAttribute('data-id');
        const b = id && ws.getBlockById(id);
        const tipo = b ? b.type : null;
        if (tipo && window.__seq[window.__seq.length - 1] !== tipo) window.__seq.push(tipo);
      });
      window.__obs.observe(alvo, { subtree: true, attributes: true,
                                   attributeFilter: ['class'] });
      return 1;
    })()`);

    /* Esperar começar antes de esperar terminar: um "parado" lido cedo demais
       passaria por "já acabou" e o teste aprovaria um programa que nunca rodou. */
    let comecou = false;
    for (let i = 0; i < 120; i++) {
      const e = await aval(`document.getElementById('estado').textContent`);
      if (e === 'rodando') comecou = true;
      if (comecou && e !== 'rodando') break;
      await espera(200);
    }
    assert.ok(comecou, 'o programa nunca chegou a rodar');

    const seq = await aval('JSON.stringify(window.__seq)');
    const blocos = JSON.parse(seq);
    assert.ok(blocos.includes('mover_frente'), `"andar frente" nunca acendeu: ${seq}`);
    assert.ok(blocos.includes('girar'), `"girar" nunca acendeu: ${seq}`);

    assert.strictEqual(await aval(`document.getElementById('estado').textContent`), 'parado');
    assert.strictEqual(await aval(`document.getElementById('parar').disabled`), true);

    /* O programa acabar não é vencer. Comemorar todo fim de execução premiaria
       rodar qualquer coisa, e a festa perderia o sentido — este programa anda e
       gira, mas não passa perto da estrela da primeira missão. */
    assert.strictEqual(
      await aval(`document.getElementById('missao').className`), '',
      'a missão foi dada como cumprida sem o robô chegar na estrela');
    /* hidden no atributo não basta: uma regra de display no CSS vence a do
       navegador e o botão aparece assim mesmo. Quem decide é o que se vê. */
    assert.strictEqual(
      await aval(`getComputedStyle(document.getElementById('proxima')).display`),
      'none',
      'o botão de próxima missão está visível sem a missão ter sido cumprida');

    assert.deepStrictEqual(erros, [], 'o console do navegador acusou erro');

    cdp.fechar();
  });
