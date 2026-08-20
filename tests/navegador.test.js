'use strict';
/* Sobe o bridge, dirige um Chromium headless e confere o que a criança veria.
   É o único nível em que dá para testar o diálogo de troca de nível: ele é
   DOM, evento e Blockly ao mesmo tempo. Pula sozinho se não houver Chromium. */

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

test('a criança monta, roda, e trocar de nível pergunta antes de apagar',
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

    /* Arrastar de verdade, com o mouse. É o único jeito de exercitar o que a
       criança faz — e foi arrastando que apareceu o defeito de reaplicar o
       nível no meio do gesto. */
    const mouse = (type, x, y) => cdp.envia('Input.dispatchMouseEvent', {
      type, x, y, button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1,
    });

    const arrastar = async (de, para) => {
      await mouse('mousePressed', de.x, de.y);
      for (let k = 1; k <= 12; k++) {
        await mouse('mouseMoved', de.x + (para.x - de.x) * k / 12,
                                  de.y + (para.y - de.y) * k / 12);
        await espera(30);
      }
      await mouse('mouseReleased', para.x, para.y);
      await espera(500);
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
          type: 'mover_frente',
          inputs: { SEG: { shadow: { type: 'numero', fields: { NUM: 0.5 } } } },
          next: { block: { type: 'girar',
            inputs: { GRAUS: { shadow: { type: 'numero', fields: { NUM: 90 } } } } } }
        } } }
      }] } }, ws);
      Niveis.aplicar(ws, 'pequeno');
      return 1;
    })()`);

    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace()
        .getBlocksByType('mover_frente', false)[0].getInput('SEG').isVisible()`),
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
        return b ? b.getInput('SEG').isVisible() : 'sem bloco na paleta';
      })()`),
      false, 'no Pequeno a paleta não deveria mostrar o número');

    assert.strictEqual(
      await aval(`(() => {
        const f = Blockly.getMainWorkspace().getFlyout();
        const b = f && f.getWorkspace().getBlocksByType('mover_frente', false)[0];
        return b ? b.getField('T1').isVisible() : 'sem bloco na paleta';
      })()`),
      false, 'no Pequeno a paleta não deveria mostrar a palavra');

    /* A aba está aberta desde a checagem da paleta, logo acima. Trocar de nível
       com trabalho montado tem que perguntar antes — e, até responder, nada
       pode ter mudado. */
    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=medio]').click();
      return 1;
    })()`);
    await espera(300);

    assert.strictEqual(await aval(`document.getElementById('confirma').hidden`),
      false, 'trocar de nível com trabalho montado deveria perguntar');
    assert.strictEqual(
      await aval(`document.getElementById('confirma-titulo').textContent`),
      'Trocar para Médio?', 'o título deveria nomear o destino');
    assert.strictEqual(
      await aval(`document.querySelector('#niveis button[data-nivel=pequeno]')
        .getAttribute('aria-pressed')`),
      'true', 'o botão do nível não pode afundar antes de confirmar');
    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace().getBlocksByType('mover_frente', false).length`),
      1, 'nada pode ser apagado antes de confirmar');

    /* "Não" desfaz tudo: continua no Pequeno, com o programa intacto. */
    await aval(`(() => {
      document.getElementById('confirma-nao').click();
      return 1;
    })()`);
    await espera(300);

    assert.strictEqual(await aval(`document.getElementById('confirma').hidden`),
      true, 'o diálogo deveria ter fechado');
    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace().getBlocksByType('mover_frente', false).length`),
      1, 'dizer não apagou o programa');
    assert.strictEqual(
      await aval(`document.querySelector('#niveis button[data-nivel=pequeno]')
        .getAttribute('aria-pressed')`),
      'true', 'dizer não trocou o nível assim mesmo');

    /* Clicar no nível em que já está não é troca: não pergunta e não apaga. */
    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=pequeno]').click();
      return 1;
    })()`);
    await espera(300);

    assert.strictEqual(await aval(`document.getElementById('confirma').hidden`),
      true, 'clicar no nível ativo não deveria perguntar nada');
    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace().getBlocksByType('mover_frente', false).length`),
      1, 'clicar no nível ativo apagou o programa');

    /* Agora confirma de verdade: troca, esvazia e fecha a aba. */
    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=medio]').click();
      return 1;
    })()`);
    await espera(300);
    await aval(`(() => {
      document.getElementById('confirma-sim').click();
      return 1;
    })()`);
    await espera(500);

    assert.strictEqual(
      await aval(`document.querySelector('#niveis button[data-nivel=medio]')
        .getAttribute('aria-pressed')`),
      'true', 'o nível não trocou depois de confirmar');
    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace().getBlocksByType('mover_frente', false).length`),
      0, 'confirmar deveria ter apagado o programa');
    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace().getAllBlocks(false).length`),
      1, 'deveria sobrar só a raiz');
    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace().getAllBlocks(false)[0].type`),
      'quando_play', 'o que sobrou não é a raiz');

    /* O defeito que começou tudo: a aba aberta continuava oferecendo as peças
       do nível anterior, e dava para arrastar uma delas para dentro do
       Pequeno. */
    assert.strictEqual(
      await aval(`(() => {
        const f = Blockly.getMainWorkspace().getFlyout();
        return !!(f && f.isVisible());
      })()`),
      false, 'a aba de blocos continuou aberta depois de trocar de nível');

    /* Com o workspace vazio não há o que perder, e um diálogo que aparece sem
       precisar ensina a criança a atravessá-lo sem ler. */
    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=grande]').click();
      return 1;
    })()`);
    await espera(300);

    assert.strictEqual(await aval(`document.getElementById('confirma').hidden`),
      true, 'workspace vazio não deveria perguntar nada');
    assert.strictEqual(
      await aval(`document.querySelector('#niveis button[data-nivel=grande]')
        .getAttribute('aria-pressed')`),
      'true', 'a troca sem diálogo não aconteceu');

    /* O .ino é o degrau seguinte ao teto: só quem chegou no Grande vê. */
    assert.strictEqual(await aval(`document.getElementById('codigo').hidden`),
      false, 'no Grande o botão de ver código deveria aparecer');

    await aval(`(() => { document.getElementById('codigo').click(); return 1; })()`);
    await espera(300);

    assert.strictEqual(
      await aval(`document.getElementById('painel-codigo').hidden`),
      false, 'o painel de código não abriu');
    assert.ok(
      (await aval(`document.getElementById('codigo-texto').textContent`))
        .includes('void setup()'),
      'o painel abriu sem o código dentro');

    await aval(`(() => {
      document.getElementById('codigo-fechar').click();
      return 1;
    })()`);
    await espera(200);
    assert.strictEqual(
      await aval(`document.getElementById('painel-codigo').hidden`),
      true, 'o painel de código não fechou');

    /* No Gigante, a criança arrasta uma conta para dentro do encaixe do tempo.
       Este é o teste que faltava quando a conta não encaixava: reaplicar o
       nível durante o arrasto tirava o encaixe debaixo do dedo dela. */
    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=gigante]').click();
      return 1;
    })()`);
    await espera(400);

    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      Blocos.limpar(ws);
      const b = ws.newBlock('mover_frente');
      const sh = ws.newBlock('numero'); sh.setShadow(true);
      b.getInput('SEG').connection.connect(sh.outputConnection);
      b.initSvg(); sh.initSvg(); b.render();
      b.moveBy(260, 260);
      return 1;
    })()`);
    await espera(400);

    await aval(`(() => {
      const tb = Blockly.getMainWorkspace().getToolbox();
      const c = tb.getToolboxItems().find(i => i.getName && i.getName() === 'Contas');
      tb.setSelectedItem(c);
      return 1;
    })()`);
    await espera(700);

    const daCaixa = JSON.parse(await aval(`(() => {
      const f = Blockly.getMainWorkspace().getFlyout();
      const b = f.getWorkspace().getTopBlocks(false).find(x => x.type === 'conta_mais');
      const r = b.getSvgRoot().getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.left + 14),
                              y: Math.round(r.top + r.height / 2) });
    })()`));

    const noEncaixe = JSON.parse(await aval(`(() => {
      const mf = Blockly.getMainWorkspace().getBlocksByType('mover_frente', false)[0];
      const r = mf.getInputTargetBlock('SEG').getSvgRoot().getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.left + r.width / 2),
                              y: Math.round(r.top + r.height / 2) });
    })()`));

    await arrastar(daCaixa, noEncaixe);

    assert.strictEqual(
      await aval(`(() => {
        const mf = Blockly.getMainWorkspace().getBlocksByType('mover_frente', false)[0];
        const dentro = mf && mf.getInputTargetBlock('SEG');
        return dentro ? dentro.type : 'nada';
      })()`),
      'conta_mais', 'a conta arrastada não entrou no encaixe do tempo');

    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace()
        .getBlocksByType('conta_mais', false).filter(b => !b.getParent()).length`),
      0, 'sobrou uma conta solta no espaço de trabalho');

    /* O Gigante: uma conta de verdade dentro de um bloco de movimento. É o
       degrau que este ciclo abriu, e o teste só vale se o robô rodar com ela. */
    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=gigante]').click();
      const ws = Blockly.getMainWorkspace();
      Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
        type: 'quando_play', x: 40, y: 30,
        inputs: { CORPO: { block: {
          type: 'mover_frente',
          inputs: { SEG: { block: {
            type: 'conta_vezes',
            inputs: {
              A: { shadow: { type: 'numero', fields: { NUM: 0.25 } } },
              B: { shadow: { type: 'numero', fields: { NUM: 2 } } },
            },
          } } },
          fields: { VEL: '200' },
        } } }
      }] } }, ws);
      Niveis.aplicar(ws, 'gigante');
      return 1;
    })()`);
    await espera(300);

    assert.strictEqual(
      await aval(`document.getElementById('codigo').hidden`), false,
      'o ver código deveria aparecer no Gigante também');

    /* Aperta PLAY: se a conta não compilasse, o #erro mostraria a mensagem. */
    await aval(`(() => { document.getElementById('play').click(); return 1; })()`);
    await espera(500);
    assert.strictEqual(await aval(`document.getElementById('erro').textContent`), '',
      'a conta do Gigante não compilou');

    await aval(`(() => { document.getElementById('parar').click(); return 1; })()`);
    await espera(300);

    /* Esvazia antes de descer de nível: com trabalho montado, trocar abre o
       diálogo de confirmação — que é justamente o comportamento testado mais
       acima, e aqui só atrapalharia. */
    await aval(`(() => { Blocos.limpar(Blockly.getMainWorkspace()); return 1; })()`);
    await espera(200);

    /* Volta para o Médio e remonta, porque o resto do teste roda um programa. */
    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=medio]').click();
      const ws = Blockly.getMainWorkspace();
      Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
        type: 'quando_play', x: 40, y: 30,
        inputs: { CORPO: { block: {
          type: 'mover_frente',
          inputs: { SEG: { shadow: { type: 'numero', fields: { NUM: 0.5 } } } },
          next: { block: { type: 'girar',
            inputs: { GRAUS: { shadow: { type: 'numero', fields: { NUM: 90 } } } } } }
        } } }
      }] } }, ws);
      Niveis.aplicar(ws, 'medio');
      return 1;
    })()`);
    await espera(300);

    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace()
        .getBlocksByType('mover_frente', false)[0].getInput('SEG').isVisible()`),
      true, 'no Médio o número deveria aparecer');

    assert.strictEqual(await aval(`document.getElementById('codigo').hidden`),
      true, 'fora do Grande o botão de ver código deveria sumir');

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

test('a peça já sai da caixa vestida do nível, antes de ser solta',
  { skip: CHROMIUM ? false : 'sem Chromium nesta máquina', timeout: 120000 },
  async (t) => {
    /* No Pequeno as palavras somem e a peça de andar é só uma seta. Mas o
       nível era aplicado quando o arrasto terminava, então ela atravessava a
       tela na mão da criança escrita "andar frente 1 s" e encolhia ao ser
       solta. O que se afirma aqui é o meio do gesto: com o dedo ainda em cima,
       a peça já tem que estar no nível certo.

       Reaplicar o nível durante o arrasto não serve — derruba o encaixe, e o
       teste acima guarda isso. Por isso a peça é vestida no createBlock, antes
       de o gesto anotar as conexões. */
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 2) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-arrasto-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 2}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 2}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 2}/json/list`);
    const cdp = new Ws(alvos.find((a) => a.type === 'page').webSocketDebuggerUrl);
    await cdp.pronto;
    await cdp.envia('Runtime.enable');
    await cdp.envia('Page.enable');
    const aval = async (expr) => {
      const r = await cdp.envia('Runtime.evaluate',
        { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(expr + ' -> ' + JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };
    const mouse = (type, x, y) => cdp.envia('Input.dispatchMouseEvent', {
      type, x, y, button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1,
    });

    await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 2}/` });
    await espera(3000);

    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=pequeno]').click();
      return 1;
    })()`);
    await espera(600);

    /* Abre a categoria de movimento e mira a primeira peça da gaveta. */
    const cat = await aval(`(() => {
      const r = document.querySelectorAll('.blocklyTreeRow')[0].getBoundingClientRect();
      return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()`);
    const c = JSON.parse(cat);
    await mouse('mousePressed', c.x, c.y);
    await mouse('mouseReleased', c.x, c.y);
    await espera(800);

    const alvo = JSON.parse(await aval(`(() => {
      const b = document.querySelectorAll('.blocklyFlyout .blocklyDraggable')[0];
      const r = b.getBoundingClientRect();
      return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()`));

    /* Segura e leva para o meio da bancada, SEM soltar. */
    await mouse('mousePressed', alvo.x, alvo.y);
    for (let k = 1; k <= 8; k++) {
      await mouse('mouseMoved', alvo.x + (700 - alvo.x) * k / 8,
                                alvo.y + (400 - alvo.y) * k / 8);
      await espera(40);
    }

    const naMao = JSON.parse(await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      const b = ws.getAllBlocks(false).filter((x) => x.type === 'mover_frente')[0];
      if (!b) return JSON.stringify({ achou: false });
      return JSON.stringify({
        achou: true,
        t1: b.getField('T1') ? b.getField('T1').isVisible() : null,
        icone: b.getField('ICONE') ? b.getField('ICONE').isVisible() : null,
        seg: b.getInput('SEG') ? b.getInput('SEG').isVisible() : null
      });
    })()`));

    await mouse('mouseReleased', 700, 400);
    await espera(500);

    assert.ok(naMao.achou, 'a peça não chegou à bancada durante o arrasto');
    assert.strictEqual(naMao.t1, false,
      'no Pequeno a peça viaja na mão da criança escrita "andar frente"');
    assert.strictEqual(naMao.seg, false,
      'no Pequeno a peça viaja na mão da criança mostrando o campo de segundos');
    assert.strictEqual(naMao.icone, true,
      'a seta some justamente enquanto a criança olha para a peça');

    cdp.fechar();
  });
