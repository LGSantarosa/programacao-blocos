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
const Missoes_TENTATIVAS = require('../web/missoes.js').TENTATIVAS_ATE_AJUDA;

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

/* Este arquivo só roda quando pedido. Ele sozinho leva uns cinco minutos, e
   não deveria estar no caminho de quem acabou de mexer numa cor. Mesmo truque
   do arduino.test.js, que se pula sem g++: `TESTES_LENTOS=1 node --test tests/`
   liga, e o `make test-lento` da raiz é o atalho. Rodar tudo antes de commitar
   continua sendo a regra. */
const LENTOS = process.env.TESTES_LENTOS === '1';
const PULAR = !LENTOS
  ? 'teste lento: ligue com TESTES_LENTOS=1, ou rode make test-lento'
  : (CHROMIUM ? false : 'sem Chromium nesta máquina');

async function esperarPorta(url, limiteMs) {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    try { await pegarJson(url); return true; } catch (_) { await espera(300); }
  }
  return false;
}

test('a criança monta, roda, e trocar de nível pergunta antes de apagar',
  { skip: PULAR, timeout: 120000 },
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

    assert.strictEqual(await aval('document.title'), 'Programação Criativa');
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
      'Trocar para Básico?', 'o título deveria nomear o destino');
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


/* ---------- a tela estreita ---------- */

test('nada escapa pela lateral num celular nem num tablet em pé',
  { skip: PULAR, timeout: 120000 },
  async (t) => {
    /* O cabeçalho já teve dez itens numa faixa que não dobrava, somando 904px
       de conteúdo. Qualquer tela mais estreita que isso — um iPad em pé tem
       768 — perdia o PARAR para fora do alcance: a criança só chegava nele
       arrastando a página para o lado, e uma criança não descobre isso. O que
       se afirma aqui não é o desenho, é a regra: o que serve para apertar
       precisa estar onde o dedo alcança. */
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 1) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-estreito-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 1}`,
      '--window-size=1000,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 1}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 1}/json/list`);
    const cdp = new Ws(alvos.find((a) => a.type === 'page').webSocketDebuggerUrl);
    await cdp.pronto;
    await cdp.envia('Runtime.enable');
    await cdp.envia('Page.enable');
    /* Imita a ESP32: a conexão existe, mas não chega telemetria de posição.
       A interface escondia o painel inteiro depois de dois segundos nesse
       caso, fazendo missão, arena e robô sumirem justamente no tablet real. */
    await cdp.envia('Page.addScriptToEvaluateOnNewDocument', { source: `
      (function () {
        function WebSocketSemTelemetria() { this.readyState = 1; }
        WebSocketSemTelemetria.OPEN = 1;
        WebSocketSemTelemetria.prototype.send = function () {};
        WebSocketSemTelemetria.prototype.close = function () {};
        window.WebSocket = WebSocketSemTelemetria;
      })();
    ` });
    const aval = async (expr) => {
      const r = await cdp.envia('Runtime.evaluate',
        { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(expr + ' -> ' + JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };

    for (const [larg, alt, apelido] of [[360, 800, 'celular em pé'],
                                        [768, 1024, 'tablet em pé']]) {
      await cdp.envia('Emulation.setDeviceMetricsOverride',
        { width: larg, height: alt, deviceScaleFactor: 1, mobile: true });
      await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 1}/` });
      /* Passa do antigo temporizador de dois segundos. */
      await espera(3000);

      const rola = await aval('document.documentElement.scrollWidth');
      assert.strictEqual(rola, larg,
        `${apelido}: a página tem ${rola}px de largura numa tela de ${larg} — ` +
        'alguma coisa está empurrando o resto para fora');

      const naTela = (id) => aval(`(function () {
        var e = document.getElementById('${id}');
        if (!e) return 'sumiu';
        var c = e.getBoundingClientRect();
        if (c.width === 0 && c.height === 0) return 'sem tamanho';
        var larg = document.documentElement.clientWidth;
        return (c.left >= -1 && c.right <= larg + 1) ? '' :
          'esq=' + Math.round(c.left) + ' dir=' + Math.round(c.right);
      })()`);

      /* Um a um, porque saber QUAL escapou é metade do conserto.

         Esta lista é o cabeçalho depois do corte: fica à vista o que a criança
         usa o tempo todo. O nível, o som, o código e a versão passaram para
         trás do ⚙ — são de quem acompanha, e são conferidos logo abaixo, com o
         painel aberto. */
      for (const id of ['play', 'parar', 'desfazer', 'refazer', 'ajustes',
                        'missao', 'arena']) {
        const fora = await naTela(id);
        assert.strictEqual(fora, '',
          `${apelido}: #${id} está fora da tela (${fora})`);
      }

      /* O que foi para trás do ⚙ continua alcançável, e continua cabendo. Um
         controle escondido atrás de um botão que abre um painel torto não é
         melhor que um controle fora da tela. */
      assert.strictEqual(await aval(`document.getElementById('painel-ajustes').hidden`),
        true, `${apelido}: o painel de ajustes nasceu aberto`);
      await aval(`document.getElementById('ajustes').click()`);
      await espera(300);
      for (const id of ['niveis', 'mudo', 'versao', 'ajustes-fechar']) {
        const fora = await naTela(id);
        assert.strictEqual(fora, '',
          `${apelido}: #${id} está fora da tela dentro do painel (${fora})`);
      }
      /* Os quatro níveis continuam sendo quatro alvos de toque de verdade. */
      const menorNivel = await aval(`(function () {
        var bs = document.querySelectorAll('#niveis button'), m = 1e9;
        for (var i = 0; i < bs.length; i++) {
          m = Math.min(m, bs[i].getBoundingClientRect().width);
        }
        return Math.round(m);
      })()`);
      assert.ok(menorNivel >= 44,
        `${apelido}: botão de nível com ${menorNivel}px, estreito demais para um dedo`);
      await aval(`document.getElementById('ajustes-fechar').click()`);
      await espera(200);
      assert.strictEqual(await aval(`document.getElementById('painel-ajustes').hidden`),
        true, `${apelido}: o painel de ajustes não fechou`);

      /* Sem telemetria ainda precisa haver personagem. O centro do robô na
         primeira missão é (1,00 m; 0,40 m), isto é, (200, 320) no canvas de
         400px. Sem pose esse ponto tem apenas o bege do chão. */
      const pixelRobo = JSON.parse(await aval(`(function () {
        var c = document.getElementById('arena');
        return JSON.stringify(Array.prototype.slice.call(
          c.getContext('2d').getImageData(200, 320, 1, 1).data));
      })()`));
      assert.deepStrictEqual(pixelRobo.slice(0, 3), [55, 194, 107],
        `${apelido}: a arena apareceu, mas o robô não foi desenhado nela`);
    }

    cdp.fechar();
  });


test('a peça já sai da caixa vestida do nível, antes de ser solta',
  { skip: PULAR, timeout: 120000 },
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

/* ---------- o toque que roda ---------- */

test('tocar no corpo da peça roda; tocar no número só abre o editor',
  { skip: PULAR, timeout: 120000 },
  async (t) => {
    /* As duas metades do mesmo gesto, e a segunda é a que mais importa: a
       criança toca no "1" para trocar o número dezenas de vezes por sessão, e
       se isso ligasse os motores a execução viva seria um perigo em vez de um
       presente.

       Não precisamos de raio de arrasto próprio para isso. O handleUp do
       Gesture do Blockly despacha em cadeia exclusiva — arrastar, depois
       campo, depois bloco — então tocar num campo nunca emite CLICK. Este
       teste é o que avisa se alguém um dia trocar o ouvinte por um próprio e
       perder essa garantia. */
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 4) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-toque-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 4}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 4}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 4}/json/list`);
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
    const clicar = async (x, y) => {
      await mouse('mousePressed', x, y);
      await mouse('mouseReleased', x, y);
    };

    await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 4}/` });
    await espera(3000);

    /* Uma pilha solta no canto, longe da âncora: é o rascunho da criança. */
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      const b = Blockly.serialization.blocks.append(
        { type: 'mover_frente',
          inputs: { SEG: { shadow: { type: 'numero', fields: { NUM: 2 } } } },
          fields: { VEL: '200' } }, ws);
      b.moveBy(60, 320);
      window.__b = b.id;
      return 1;
    })()`);
    await espera(600);

    /* O canto de cima à esquerda do bloco é corpo, nunca campo: os campos
       ficam depois do ícone, mais para dentro. */
    const alvo = await aval(`(() => {
      const b = Blockly.getMainWorkspace().getBlockById(window.__b);
      const r = b.getSvgRoot().getBoundingClientRect();
      return JSON.stringify({ corpo: { x: r.left + 6, y: r.top + r.height / 2 } });
    })()`);
    const p = JSON.parse(alvo);

    assert.strictEqual(await aval('document.getElementById("estado").textContent'),
      'parado', 'não devia estar rodando antes de ninguém tocar em nada');

    await clicar(p.corpo.x, p.corpo.y);
    await espera(700);
    assert.strictEqual(await aval('document.getElementById("estado").textContent'),
      'rodando', 'tocar no corpo da peça tinha que rodar a pilha');

    /* Para, e limpa o rastro, para a segunda metade começar do zero. */
    await aval('document.getElementById("parar").click()');
    await espera(700);
    assert.strictEqual(await aval('document.getElementById("estado").textContent'),
      'parado');

    /* Agora o campo do número. O centro do encaixe é onde mora o "2". */
    const campo = await aval(`(() => {
      const b = Blockly.getMainWorkspace().getBlockById(window.__b);
      const alvo = b.getInputTargetBlock('SEG');
      const r = alvo.getSvgRoot().getBoundingClientRect();
      return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()`);
    const c = JSON.parse(campo);
    await clicar(c.x, c.y);
    await espera(700);

    assert.strictEqual(await aval('document.getElementById("estado").textContent'),
      'parado',
      'tocar no número ligou os motores — a criança troca esse número o tempo todo');

    /* E abre o teclado da página. Em aparelho de toque o editor do Blockly é um
       window.prompt, que dentro do WebView do app não abre nada e devolve null
       na hora: tocar no número não fazia coisa alguma, e a única saída para
       chegar a seis segundos era encaixar uma conta (2 × 3) no lugar. */
    assert.strictEqual(await aval('document.getElementById("teclado").hidden'), false,
      'tocar no número não abriu o teclado');
    assert.strictEqual(
      await aval('document.getElementById("teclado-titulo").textContent'),
      'Quantos segundos?',
      'o teclado precisa dizer o que se está trocando');
    assert.strictEqual(
      await aval('document.getElementById("teclado-valor").textContent'), '2',
      'o teclado tinha que abrir com o número que já estava no bloco');

    /* Seis, que é justamente o número que antes só se alcançava com uma conta. */
    await aval(`document.querySelector('#teclado-teclas [data-tecla="6"]').click()`);
    await aval('document.getElementById("teclado-sim").click()');
    await espera(400);

    assert.strictEqual(await aval('document.getElementById("teclado").hidden'), true,
      'o teclado não fechou depois do pronto');
    assert.strictEqual(await aval(`(() => {
      const b = Blockly.getMainWorkspace().getBlockById(window.__b);
      return b.getInputTargetBlock('SEG').getFieldValue('NUM');
    })()`), 6, 'o número do bloco não mudou');

    /* Desistir devolve o bloco intacto: a criança que abriu sem querer não
       pode perder o número que estava lá. */
    await aval(`(() => {
      const b = Blockly.getMainWorkspace().getBlockById(window.__b);
      b.getInputTargetBlock('SEG').getField('NUM').showEditor_();
      return 1;
    })()`);
    await espera(300);
    await aval(`document.querySelector('#teclado-teclas [data-tecla="9"]').click()`);
    await aval('document.getElementById("teclado-nao").click()');
    await espera(300);
    assert.strictEqual(await aval(`(() => {
      const b = Blockly.getMainWorkspace().getBlockById(window.__b);
      return b.getInputTargetBlock('SEG').getFieldValue('NUM');
    })()`), 6, 'o "Deixa" trocou o número mesmo assim');

    cdp.fechar();
  });

test('rodar uma pilha solta não gasta tentativa da missão',
  { skip: PULAR, timeout: 120000 },
  async (t) => {
    /* O botão "me mostra como faz" aparece sozinho depois de algumas
       execuções sem chegar na estrela, e existe para quem travou. Uma criança
       explorando com o dedo não travou: se cada toque contasse tentativa, a
       oferta de ajuda apareceria no meio da brincadeira, dizendo a ela que
       fracassou justamente quando estava se divertindo. */
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 5) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-tent-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 5}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 5}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 5}/json/list`);
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

    await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 5}/` });
    await espera(3000);

    /* Uma pilha solta que dura pouco: assim dá para rodá-la várias vezes
       dentro do tempo do teste. */
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      const b = Blockly.serialization.blocks.append(
        { type: 'esperar',
          inputs: { SEG: { shadow: { type: 'numero', fields: { NUM: 0 } } } } }, ws);
      b.moveBy(60, 320);
      window.__b = b.id;
      return 1;
    })()`);
    await espera(600);

    const ponto = await aval(`(() => {
      const b = Blockly.getMainWorkspace().getBlockById(window.__b);
      const r = b.getSvgRoot().getBoundingClientRect();
      return JSON.stringify({ x: r.left + 6, y: r.top + r.height / 2 });
    })()`);
    const p = JSON.parse(ponto);

    /* Bem mais toques do que TENTATIVAS_ATE_AJUDA. */
    for (let i = 0; i < Missoes_TENTATIVAS + 3; i++) {
      await mouse('mousePressed', p.x, p.y);
      await mouse('mouseReleased', p.x, p.y);
      await espera(400);
    }

    assert.strictEqual(await aval('document.getElementById("gabarito").hidden'), true,
      'o gabarito se ofereceu sozinho para quem só estava explorando');

    cdp.fechar();
  });

test('tocar num relator mostra o valor numa bolha',
  { skip: PULAR, timeout: 120000 },
  async (t) => {
    /* A metade do encanto que custou o opcode novo. O número não é calculado
       aqui: ele desce até a VM como qualquer outra coisa e volta de lá, para
       não existirem duas aritméticas no projeto. */
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 6) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-bolha-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 6}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 6}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 6}/json/list`);
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

    await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 6}/` });
    await espera(3000);

    /* O Gigante é o nível onde as contas existem. */
    await aval(`(() => {
      document.querySelector('#niveis button[data-nivel=gigante]').click();
      return 1;
    })()`);
    await espera(800);

    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      const b = Blockly.serialization.blocks.append(
        { type: 'conta_mais',
          inputs: { A: { shadow: { type: 'numero', fields: { NUM: 40 } } },
                    B: { shadow: { type: 'numero', fields: { NUM: 2 } } } } }, ws);
      b.moveBy(60, 340);
      window.__b = b.id;
      return 1;
    })()`);
    await espera(600);

    /* O vão entre os dois encaixes: ali só existe o rótulo "+", que é
       field_label e portanto não clicável — então o toque vira clique de
       bloco. A borda esquerda não serve: naquele ponto está o recorte do
       encaixe de saída, que fica fora do traçado da peça, e o clique cai no
       workspace. */
    const ponto = await aval(`(() => {
      const b = Blockly.getMainWorkspace().getBlockById(window.__b);
      const r = b.getSvgRoot().getBoundingClientRect();
      const a = b.getInputTargetBlock('A').getSvgRoot().getBoundingClientRect();
      const c = b.getInputTargetBlock('B').getSvgRoot().getBoundingClientRect();
      return JSON.stringify({ x: (a.right + c.left) / 2, y: r.top + r.height / 2 });
    })()`);
    const p = JSON.parse(ponto);

    await mouse('mousePressed', p.x, p.y);
    await mouse('mouseReleased', p.x, p.y);
    await espera(1200);

    assert.strictEqual(await aval('document.getElementById("bolha").hidden'), false,
      'a bolha não apareceu');
    assert.strictEqual(await aval('document.getElementById("bolha").textContent'),
      '42', 'a conta voltou errada do robô');

    cdp.fechar();
  });

/* O celular deitado é o pior caso de altura do projeto: 411px de janela, e o
   README conta a sessão inteira que custou fazer o painel caber neles. Um
   teclado que nasce sem essa régua repete a história — com as teclas de baixo,
   o 0 e o apagar, fora da tela, e o "pronto" junto com elas. */
test('o teclado cabe inteiro num celular deitado',
  { skip: PULAR, timeout: 120000 },
  async (t) => {
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 7) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-teclado-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 7}`,
      '--window-size=1000,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 7}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 7}/json/list`);
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

    /* 808x411 é a medida do aparelho de teste deitado, a mesma do README. */
    await cdp.envia('Emulation.setDeviceMetricsOverride',
      { width: 808, height: 411, deviceScaleFactor: 1, mobile: true });
    await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 7}/` });
    await espera(3000);

    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      const b = Blockly.serialization.blocks.append(
        { type: 'mover_frente',
          inputs: { SEG: { shadow: { type: 'numero', fields: { NUM: 2 } } } } }, ws);
      b.getInputTargetBlock('SEG').getField('NUM').showEditor_();
      return 1;
    })()`);
    await espera(500);

    assert.strictEqual(await aval('document.getElementById("teclado").hidden'), false,
      'o teclado nem abriu');

    /* Uma medida por peça: saber QUAL escapou é metade do conserto. */
    for (const id of ['teclado-titulo', 'teclado-valor', 'teclado-teclas',
                      'teclado-sim', 'teclado-nao']) {
      const fora = await aval(`(function () {
        var e = document.getElementById('${id}');
        if (!e) return 'sumiu';
        var c = e.getBoundingClientRect();
        if (c.width === 0 && c.height === 0) return 'sem tamanho';
        var alt = document.documentElement.clientHeight;
        var larg = document.documentElement.clientWidth;
        return (c.top >= -1 && c.bottom <= alt + 1 &&
                c.left >= -1 && c.right <= larg + 1) ? '' :
          'topo=' + Math.round(c.top) + ' base=' + Math.round(c.bottom) +
          ' numa janela de ' + alt;
      })()`);
      assert.strictEqual(fora, '', `#${id} está fora da tela (${fora})`);
    }

    /* A última tecla é a que some primeiro, e é a que apaga: sem ela a criança
       fica presa no número que digitou errado. */
    const apaga = await aval(`(function () {
      var e = document.querySelector('#teclado-teclas [data-tecla="apaga"]');
      var c = e.getBoundingClientRect();
      return c.bottom <= document.documentElement.clientHeight + 1;
    })()`);
    assert.strictEqual(apaga, true, 'a tecla de apagar ficou fora da tela');

    cdp.fechar();
  });

/* O toque fantasma, que só existe no dedo: a caixa nasce embaixo do dedo que a
   abriu, e o clique sintetizado daquele mesmo toque é entregue a quem estiver
   no ponto agora — uma tecla, o "Deixa", ou o escuro em volta. No aparelho isso
   se disfarçava de outra coisa: "o número dentro do verde não muda, solto
   muda". Não era o verde; era a posição na tela.

   Só o Chromium com toque de verdade pega isto. Com mouse não acontece. */
test('o dedo que abre o teclado não aperta tecla nenhuma',
  { skip: PULAR, timeout: 120000 },
  async (t) => {
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 8) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-fantasma-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 8}`,
      '--window-size=1000,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 8}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 8}/json/list`);
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

    /* Dedo, e não mouse: é a diferença que faz o defeito existir. */
    const tocar = async (x, y) => {
      await cdp.envia('Input.dispatchTouchEvent',
        { type: 'touchStart', touchPoints: [{ x, y }] });
      await espera(60);
      await cdp.envia('Input.dispatchTouchEvent',
        { type: 'touchEnd', touchPoints: [] });
      await espera(400);
    };

    await cdp.envia('Emulation.setDeviceMetricsOverride',
      { width: 808, height: 411, deviceScaleFactor: 2.5, mobile: true });
    await cdp.envia('Emulation.setTouchEmulationEnabled',
      { enabled: true, maxTouchPoints: 5 });
    await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 8}/` });
    await espera(4000);

    /* O caso que o usuário viu: o bloco dentro do ▶ quando apertar PLAY. */
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      ws.clear();
      Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
        type: 'quando_play', x: 60, y: 40,
        inputs: { CORPO: { block: {
          type: 'mover_frente',
          fields: { VEL: '200' },
          inputs: { SEG: { shadow: { type: 'numero', fields: { NUM: 1 } } } } } } },
      }]}}, ws);
      window.__b = ws.getBlocksByType('mover_frente')[0].id;
      return 1;
    })()`);
    await espera(800);

    const c = JSON.parse(await aval(`(() => {
      const b = Blockly.getMainWorkspace().getBlockById(window.__b);
      const r = b.getInputTargetBlock('SEG').getSvgRoot().getBoundingClientRect();
      return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()`));

    await tocar(c.x, c.y);

    assert.strictEqual(await aval('document.getElementById("teclado").hidden'), false,
      'o teclado fechou sozinho — o fantasma caiu no "Deixa" ou no escuro');
    assert.strictEqual(
      await aval('document.getElementById("teclado-valor").textContent'), '1',
      'o teclado abriu com outro número — o fantasma apertou uma tecla');

    /* E o dedo de verdade, agora, muda o número. */
    const seis = JSON.parse(await aval(`(() => {
      const r = document.querySelector('#teclado-teclas [data-tecla="6"]')
        .getBoundingClientRect();
      return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()`));
    await tocar(seis.x, seis.y);
    assert.strictEqual(
      await aval('document.getElementById("teclado-valor").textContent'), '6');

    const pronto = JSON.parse(await aval(`(() => {
      const r = document.getElementById('teclado-sim').getBoundingClientRect();
      return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()`));
    await tocar(pronto.x, pronto.y);

    assert.strictEqual(await aval(`(() => {
      const b = Blockly.getMainWorkspace().getBlockById(window.__b);
      return b.getInputTargetBlock('SEG').getFieldValue('NUM');
    })()`), 6, 'o número do bloco dentro do verde não mudou');

    cdp.fechar();
  });

test('pedir o gabarito não destrava a âncora do PLAY',
  { skip: PULAR, timeout: 120000 },
  async (t) => {
    /* O botão "me mostra como faz" carrega o gabarito com
       Blockly.serialization.workspaces.load, que troca o workspace inteiro. O
       "▶ quando apertar PLAY" que nasce daí vem do JSON do gabarito, e JSON não
       carrega deletable nem movable: os dois voltam ao padrão, que é
       verdadeiro. Sem refixar, a criança passava a poder arrastar e apagar a
       âncora — e sem ela o PLAY não tem por onde começar.

       Quem aperta este botão é justamente quem já falhou três vezes. */
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 5) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-gabarito-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 5}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 5}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 5}/json/list`);
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

    await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 5}/` });

    const prontaEm = Date.now() + 30000;
    let pronta = false;
    while (Date.now() < prontaEm && !pronta) {
      pronta = await aval(`document.readyState === 'complete'
        && typeof Blockly !== 'undefined'
        && !!Blockly.getMainWorkspace()
        && !!document.getElementById('gabarito')`).catch(() => false);
      if (!pronta) await espera(250);
    }
    assert.ok(pronta, 'a página não ficou pronta em 30 s');

    const estadoDaAncora = `(() => {
      const r = Blockly.getMainWorkspace().getBlocksByType('quando_play', false);
      if (r.length !== 1) return JSON.stringify({ quantas: r.length });
      return JSON.stringify({ quantas: 1,
        apagavel: r[0].isDeletable(), movivel: r[0].isMovable() });
    })()`;

    /* Antes: a âncora nasce fixa. Se isto falhar, o teste seguinte não prova
       nada — estaria comparando com um estado que já estava errado. */
    const antes = JSON.parse(await aval(estadoDaAncora));
    assert.deepStrictEqual(antes, { quantas: 1, apagavel: false, movivel: false },
      'a âncora já nasceu destravada');

    /* O botão só aparece depois de algumas tentativas, mas o .click() dispara o
       mesmo tratador que o dedo dispararia — e é o tratador que está sob
       teste, não a regra que revela o botão. */
    await aval(`document.getElementById('gabarito').click()`);
    await espera(1200);

    /* O gabarito realmente montou alguma coisa? Sem isto, uma falha silenciosa
       no load faria o teste passar por não ter mexido em nada. */
    const pecas = await aval(
      `Blockly.getMainWorkspace().getAllBlocks(false).length`);
    assert.ok(pecas > 1, 'o gabarito não montou peça nenhuma (' + pecas + ')');

    const depois = JSON.parse(await aval(estadoDaAncora));
    assert.deepStrictEqual(depois, { quantas: 1, apagavel: false, movivel: false },
      'depois do gabarito a âncora do PLAY ficou apagável ou arrastável');

    cdp.fechar();
  });

test('o programa da criança volta depois de recarregar a página',
  { skip: PULAR, timeout: 120000 },
  async (t) => {
    /* O nível já ficava, o mudo já ficava, a fase já ficava. O trabalho dela
       era a única coisa da tela que se perdia — e é a única que ela fez com as
       próprias mãos.

       Este teste só existe em navegador porque a metade difícil não é guardar,
       é voltar: o load traz uma âncora nova, os eventos do Blockly são
       assíncronos, e a gravação é adiada em um segundo. O tests/guardar.test.js
       cobre o armazenamento; aqui se prova o caminho inteiro. */
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 6) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-guardar-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 6}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 6}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 6}/json/list`);
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

    const abrir = async () => {
      await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 6}/` });
      const ate = Date.now() + 30000;
      let pronta = false;
      while (Date.now() < ate && !pronta) {
        pronta = await aval(`document.readyState === 'complete'
          && typeof Blockly !== 'undefined'
          && !!Blockly.getMainWorkspace()
          && !!document.getElementById('play')`).catch(() => false);
        if (!pronta) await espera(250);
      }
      assert.ok(pronta, 'a página não ficou pronta em 30 s');
      await espera(600);
    };

    /* Quantos blocos de cada tipo, e o número que está dentro deles: é o
       retrato do trabalho da criança, e é ele que tem que sobreviver. */
    const retrato = `(() => {
      const ws = Blockly.getMainWorkspace();
      const raiz = ws.getBlocksByType('quando_play', false)[0];
      const dentro = [];
      let b = raiz && raiz.getInputTargetBlock('CORPO');
      while (b) {
        const enc = b.getInputTargetBlock('SEG') || b.getInputTargetBlock('GRAUS');
        dentro.push(b.type + ':' + (enc ? enc.getFieldValue('NUM') : '-'));
        b = b.getNextBlock();
      }
      return JSON.stringify({ nivel: Niveis.atual(), dentro: dentro,
        apagavel: raiz ? raiz.isDeletable() : null,
        movivel: raiz ? raiz.isMovable() : null });
    })()`;

    await abrir();
    /* Nível fixado no Médio: o retrato tem que voltar no mesmo nível em que
       foi tirado, e deixar isso ao acaso do que ficou guardado antes tornaria o
       teste dependente da ordem em que ele roda. */
    await aval(`Niveis.definir('medio')`);
    await abrir();

    /* A criança monta: dois passos e um giro, com números que ela escolheu. */
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      const raiz = ws.getBlocksByType('quando_play', false)[0];
      const frente = (s) => ({ type: 'mover_frente', fields: { VEL: '200' },
        inputs: { SEG: { shadow: { type: 'numero', fields: { NUM: s } } } } });
      Blockly.serialization.blocks.append(
        Object.assign(frente(3), { next: { block: Object.assign(
          { type: 'girar', fields: { DIR: '90' },
            inputs: { GRAUS: { shadow: { type: 'numero', fields: { NUM: 90 } } } } },
          { next: { block: frente(2) } }) } }),
        ws).previousConnection.connect(raiz.getInput('CORPO').connection);
      return 1;
    })()`);

    /* A gravação é adiada em um segundo de propósito — o Blockly dispara um
       evento por pixel de arrasto. Esperar mais que isso é o teste respeitando
       a regra, e não contornando-a. */
    await espera(1800);

    const antes = JSON.parse(await aval(retrato));
    assert.deepStrictEqual(antes.dentro,
      ['mover_frente:3', 'girar:90', 'mover_frente:2'],
      'o programa não foi montado como o teste pensa');

    /* Ficou mesmo guardado, e no nível certo? */
    assert.ok(await aval(`!!localStorage.getItem('robo_programa')`),
      'nada foi para o localStorage');

    /* E agora o que importa: fechar e abrir de novo. */
    await abrir();

    const depois = JSON.parse(await aval(retrato));
    assert.deepStrictEqual(depois.dentro, antes.dentro,
      'o programa não voltou como estava');
    assert.strictEqual(depois.nivel, 'medio');
    /* A âncora tem que voltar presa: o load traz uma nova, e JSON não carrega
       deletable nem movable. Mesma armadilha do gabarito. */
    assert.strictEqual(depois.apagavel, false,
      'depois de recarregar, a âncora do PLAY ficou apagável');
    assert.strictEqual(depois.movivel, false,
      'depois de recarregar, a âncora do PLAY ficou arrastável');

    /* Trocar de nível apaga o programa — e o que volta depois de recarregar
       tem que ser a mesa limpa, não o programa do nível anterior. */
    await aval(`document.querySelector('#niveis button[data-nivel="grande"]').click()`);
    await espera(300);
    await aval(`document.getElementById('confirma-sim').click()`);
    await espera(1800);
    await abrir();
    const noGrande = JSON.parse(await aval(retrato));
    assert.strictEqual(noGrande.nivel, 'grande');
    assert.deepStrictEqual(noGrande.dentro, [],
      'o programa do Médio ressuscitou dentro do Grande');

    cdp.fechar();
  });

test('desfazer traz o bloco de volta, e o erro aparece em cima da peça culpada',
  { skip: PULAR, timeout: 120000 },
  async (t) => {
    /* Dois consertos, um navegador só: subir Chromium custa uns vinte segundos
       e os dois exercitam a mesma tela.

       O desfazer já existia no Blockly, escondido atrás de um toque longo de
       750 ms sobre o fundo. Um gesto que só existe para quem já sabe que ele
       existe não protege ninguém — o que está sob teste aqui é a porta, não a
       pilha.

       O erro já existia também, num <span> de 14px no cabeçalho, longe de onde
       a criança estava olhando. */
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 7) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-desfazer-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 7}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 7}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 7}/json/list`);
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
    const clicar = (id) => aval(`document.getElementById('${id}').click()`);
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
    const quantos = () => aval(
      `Blockly.getMainWorkspace().getAllBlocks(false).length`);

    await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 7}/` });
    const ate = Date.now() + 30000;
    let pronta = false;
    while (Date.now() < ate && !pronta) {
      pronta = await aval(`document.readyState === 'complete'
        && typeof Blockly !== 'undefined'
        && !!Blockly.getMainWorkspace()
        && !!document.getElementById('desfazer')`).catch(() => false);
      if (!pronta) await espera(250);
    }
    assert.ok(pronta, 'a página não ficou pronta em 30 s');
    /* Mesa limpa: o programa guardado de outra rodada tornaria a contagem
       de blocos deste teste dependente da ordem em que ele roda. */
    await aval(`localStorage.removeItem('robo_programa')`);
    await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 7}/` });
    await espera(2500);

    /* Sem nada feito, não há o que desfazer — e o botão diz isso apagado, em
       vez de existir e não fazer nada. */
    assert.strictEqual(await aval(`document.getElementById('desfazer').disabled`),
      true, 'o desfazer nasceu ligado sem haver o que desfazer');

    const soARaiz = await quantos();

    /* Arrastando da caixa, com o mouse — e não por serialization.blocks.append,
       que foi a primeira tentativa e não servia: sondei, e o append NÃO entra na
       pilha de desfazer (undoStack fica em 0). O gesto da criança entra. Um
       teste que criasse o bloco pelo caminho programático mediria uma coisa que
       ninguém faz e daria o desfazer por quebrado sem ele estar. */
    await aval(`(() => {
      const tb = Blockly.getMainWorkspace().getToolbox();
      tb.setSelectedItem(tb.getToolboxItems()[0]);
      return 1;
    })()`);
    await espera(700);

    const daCaixa = JSON.parse(await aval(`(() => {
      const f = Blockly.getMainWorkspace().getFlyout();
      const b = f.getWorkspace().getBlocksByType('mover_frente', false)[0];
      const r = b.getSvgRoot().getBoundingClientRect();
      return JSON.stringify({ x: r.left + 12, y: r.top + r.height / 2 });
    })()`));
    await arrastar(daCaixa, { x: 700, y: 500 });
    await espera(700);

    const comOBloco = await quantos();
    assert.ok(comOBloco > soARaiz, 'o bloco não foi criado');
    assert.strictEqual(await aval(`document.getElementById('desfazer').disabled`),
      false, 'depois de montar, o desfazer continuou apagado');

    await clicar('desfazer');
    await espera(600);
    assert.strictEqual(await quantos(), soARaiz,
      'o desfazer não tirou o bloco');

    await clicar('refazer');
    await espera(600);
    assert.strictEqual(await quantos(), comOBloco,
      'o refazer não trouxe o bloco de volta');

    /* Desfazer não pode destravar a âncora: ela entra e sai da pilha como
       qualquer outro bloco. */
    assert.strictEqual(await aval(`(() => {
      const r = Blockly.getMainWorkspace().getBlocksByType('quando_play', false)[0];
      return r.isDeletable();
    })()`), false, 'depois de desfazer, a âncora do PLAY ficou apagável');

    /* ---- e agora o erro ---- */

    /* Cem segundos não cabem no int16 da instrução. Antes isso virava uma
       espera negativa e o robô não saía do lugar, calado. */
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      const raiz = ws.getBlocksByType('quando_play', false)[0];
      const b = Blockly.serialization.blocks.append(
        { type: 'mover_frente', fields: { VEL: '200' },
          inputs: { SEG: { shadow: { type: 'numero', fields: { NUM: 100 } } } } },
        ws);
      b.previousConnection.connect(raiz.getInput('CORPO').connection);
      window.__culpado = b.id;
      return 1;
    })()`);
    await espera(500);

    await clicar('play');
    await espera(700);

    const bolha = JSON.parse(await aval(`(() => {
      const d = document.getElementById('bolha');
      const b = Blockly.getMainWorkspace().getBlockById(window.__culpado);
      const r = b.getSvgRoot().getBoundingClientRect();
      const c = d.getBoundingClientRect();
      return JSON.stringify({
        visivel: !d.hidden,
        vermelha: (d.getAttribute('class') || '').indexOf('erro') >= 0,
        texto: d.textContent,
        /* Em cima da peça: a bolha tem que nascer perto dela, não num canto. */
        perto: Math.abs(c.left - r.left) < 40 && c.top < r.top && r.top - c.top < 130,
      });
    })()`));

    assert.ok(bolha.visivel, 'o erro não apareceu na bolha');
    assert.ok(bolha.vermelha, 'a bolha do erro não veio vermelha');
    assert.match(bolha.texto, /grande demais/);
    assert.ok(bolha.perto, 'a bolha não nasceu em cima do bloco culpado');

    /* O cabeçalho continua recebendo a frase: é o que um adulto olhando de
       longe consegue ler, e é o que sobra quando a culpa não tem endereço. */
    assert.match(await aval(`document.getElementById('erro').textContent`),
      /grande demais/);

    cdp.fechar();
  });

test('a trilha mostra em que fase a criança está, e deixa voltar',
  { skip: PULAR, timeout: 120000 },
  async (t) => {
    /* Missoes.quantas() existia, era exportado, e ninguém chamava: a criança
       via o texto de uma fase e mais nada — nem em qual estava, nem quantas
       faltavam, nem como voltar para uma que quisesse refazer. Seis missões
       soltas em vez de uma trilha com fim à vista. */
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 8) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-fases-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 8}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 8}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 8}/json/list`);
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

    await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 8}/` });
    const ate = Date.now() + 30000;
    let pronta = false;
    while (Date.now() < ate && !pronta) {
      pronta = await aval(`document.readyState === 'complete'
        && typeof Missoes !== 'undefined'
        && !!document.getElementById('fases')`).catch(() => false);
      if (!pronta) await espera(250);
    }
    assert.ok(pronta, 'a página não ficou pronta em 30 s');
    /* Fase 0: a fase fica guardada entre visitas, e sem fixar aqui este teste
       dependeria da ordem em que roda. */
    await aval(`Missoes.definir(0)`);
    await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 8}/` });
    await espera(2500);

    const total = await aval('Missoes.quantas()');
    assert.ok(total >= 2, 'o projeto precisa de mais de uma fase para isto valer');

    /* Uma bolinha por fase, nem mais nem menos. */
    assert.strictEqual(
      await aval(`document.querySelectorAll('#fases button').length`), total,
      'a trilha não tem uma bolinha por fase');

    const acesa = `(() => {
      const bs = document.querySelectorAll('#fases button');
      for (let i = 0; i < bs.length; i++) {
        if (bs[i].getAttribute('aria-pressed') === 'true') return i;
      }
      return -1;
    })()`;
    assert.strictEqual(await aval(acesa), 0, 'nenhuma bolinha, ou a errada, acesa');

    /* O número está no rótulo: a bolinha diz "quantas" para quem não lê, o
       aria-label diz "qual" para quem ouve a tela. */
    assert.match(
      await aval(`document.querySelectorAll('#fases button')[1].getAttribute('aria-label')`),
      /fase 2 de/);

    /* Tocar numa bolinha vai para aquela fase, e o texto da missão acompanha. */
    const textoDe = (i) => aval(`Missoes.daVez(${i}).texto`);
    await aval(`document.querySelectorAll('#fases button')[2].click()`);
    await espera(500);
    assert.strictEqual(await aval(acesa), 2, 'a bolinha tocada não acendeu');
    assert.strictEqual(await aval('Missoes.atual()'), 2);
    assert.strictEqual(
      await aval(`document.getElementById('missao-texto').textContent`),
      await textoDe(2), 'o texto da missão não acompanhou a bolinha');

    /* E dá para VOLTAR, que é a metade que não existia: só havia "próxima". */
    await aval(`document.querySelectorAll('#fases button')[0].click()`);
    await espera(500);
    assert.strictEqual(await aval('Missoes.atual()'), 0, 'não deu para voltar');

    /* Trocar de fase não desmonta o programa: só muda a planta da arena. */
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      const raiz = ws.getBlocksByType('quando_play', false)[0];
      const b = Blockly.serialization.blocks.append(
        { type: 'mover_frente', fields: { VEL: '200' },
          inputs: { SEG: { shadow: { type: 'numero', fields: { NUM: 2 } } } } }, ws);
      b.previousConnection.connect(raiz.getInput('CORPO').connection);
      return 1;
    })()`);
    await espera(400);
    const antes = await aval(`Blockly.getMainWorkspace().getAllBlocks(false).length`);
    await aval(`document.querySelectorAll('#fases button')[1].click()`);
    await espera(500);
    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace().getAllBlocks(false).length`), antes,
      'trocar de fase desmontou o programa da criança');

    /* O "próxima" e a trilha contam a mesma história — duas fontes de verdade
       aqui dariam uma bolinha acesa numa fase e a arena de outra. */
    await aval(`document.getElementById('proxima').click()`);
    await espera(500);
    assert.strictEqual(await aval(acesa), await aval('Missoes.atual()'),
      'depois do "próxima" a bolinha acesa não é a da fase');

    cdp.fechar();
  });

test('a página que some sem avisar grava antes de ir',
  { skip: PULAR, timeout: 120000 },
  async (t) => {
    /* A gravação espera um segundo de silêncio de propósito — o Blockly dispara
       um evento por pixel de arrasto. Mas há três jeitos de a página sumir
       dentro desse segundo: a aba fechando, o aparelho dormindo, e o botão
       "voltar" do Android matando a Activity. Nos três, o que estiver pendente
       tem que ir para o disco agora ou não vai nunca. */
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 9) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-sair-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 9}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 9}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 9}/json/list`);
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
    const abrir = async () => {
      await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 9}/` });
      const ate = Date.now() + 30000;
      let pronta = false;
      while (Date.now() < ate && !pronta) {
        pronta = await aval(`document.readyState === 'complete'
          && typeof Blockly !== 'undefined'
          && !!Blockly.getMainWorkspace()`).catch(() => false);
        if (!pronta) await espera(250);
      }
      assert.ok(pronta, 'a página não ficou pronta em 30 s');
      await espera(600);
    };

    await abrir();
    await aval(`localStorage.removeItem('robo_programa'); Niveis.definir('medio')`);
    await abrir();

    const dentroDaRaiz = `(() => {
      const raiz = Blockly.getMainWorkspace()
        .getBlocksByType('quando_play', false)[0];
      const fora = [];
      let b = raiz && raiz.getInputTargetBlock('CORPO');
      while (b) { fora.push(b.type); b = b.getNextBlock(); }
      return JSON.stringify(fora);
    })()`;

    /* O que está no disco ANTES: a página já gravou o programa vazio ao abrir,
       então o que prova a espera é o conteúdo não ter mudado, e não a chave
       estar ausente. Foi o que a primeira versão deste teste errou. */
    const guardadoAntes = await aval(`localStorage.getItem('robo_programa')`);
    assert.ok(guardadoAntes, 'esperava a gravação da abertura');

    /* Monta e sai NA HORA — sem esperar o segundo. É o caso que se perdia. */
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      const raiz = ws.getBlocksByType('quando_play', false)[0];
      const b = Blockly.serialization.blocks.append(
        { type: 'mover_frente', fields: { VEL: '200' },
          inputs: { SEG: { shadow: { type: 'numero', fields: { NUM: 2 } } } } }, ws);
      b.previousConnection.connect(raiz.getInput('CORPO').connection);
      return 1;
    })()`);
    await espera(120);
    assert.deepStrictEqual(JSON.parse(await aval(dentroDaRaiz)), ['mover_frente']);

    /* Ainda dentro do segundo de espera: o bloco novo não chegou ao disco. */
    assert.strictEqual(
      await aval(`localStorage.getItem('robo_programa')`), guardadoAntes,
      'o teste precisa correr contra a espera, e ela já tinha passado');

    /* O aparelho dormindo, ou o app indo para segundo plano. */
    await aval(`(() => {
      window.dispatchEvent(new Event('pagehide'));
      return 1;
    })()`);
    await espera(200);

    assert.notStrictEqual(
      await aval(`localStorage.getItem('robo_programa')`), guardadoAntes,
      'a página sumiu sem gravar o que a criança tinha acabado de montar');

    await abrir();
    assert.deepStrictEqual(JSON.parse(await aval(dentroDaRaiz)), ['mover_frente'],
      'o programa não voltou depois da saída apressada');

    /* A ponte que o Kotlin chama no botão "voltar" existe e faz a mesma coisa —
       o app precisa dela porque a Activity pode morrer antes de o evento de
       visibilidade dar a volta. Ver MainActivity.sairGuardando(). */
    assert.strictEqual(await aval(`typeof App.gravarAgora`), 'function',
      'o Kotlin chama App.gravarAgora() e ela não existe mais');

    cdp.fechar();
  });


test('as pilhas que rodam ao mesmo tempo chegam inteiras ao robô',
  { skip: PULAR, timeout: 120000 },
  async (t) => {
    /* Do bloco na tela até o byte no robô, passando pelo Blockly de verdade.
       O que se afirma aqui é a costura que nenhum teste de mesa alcança: que a
       categoria existe no Gigante, que o PLAY manda TODAS as pilhas com cabeça
       (e não só a âncora), e que o «{ } ver código» recusa em vez de exportar
       o programa pela metade. */
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 10) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-tarefas-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 10}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 10}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 10}/json/list`);
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
    const abrir = async () => {
      await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 10}/` });
      const ate = Date.now() + 30000;
      let pronta = false;
      while (Date.now() < ate && !pronta) {
        pronta = await aval(`document.readyState === 'complete'
          && typeof Blockly !== 'undefined'
          && !!Blockly.getMainWorkspace()`).catch(() => false);
        if (!pronta) await espera(250);
      }
      assert.ok(pronta, 'a página não ficou pronta em 30 s');
      await espera(600);
    };

    await abrir();
    await aval(`localStorage.removeItem('robo_programa'); Niveis.definir('gigante')`);
    await abrir();

    /* A categoria só existe no Gigante: é onde a criança já tem condição. */
    const categorias = JSON.parse(await aval(`(function () {
      var itens = Blockly.getMainWorkspace().getToolbox().getToolboxItems();
      return JSON.stringify(itens.map(function (i) {
        return i.getName ? i.getName() : '';
      }));
    })()`));
    assert.ok(categorias.indexOf('Ao mesmo tempo') >= 0,
      `faltou a categoria no Gigante; vieram ${JSON.stringify(categorias)}`);

    /* Monta na mão: um andar dentro do PLAY, e uma pilha de aviso ao lado. */
    await aval(`(function () {
      var ws = Blockly.getMainWorkspace();
      var raiz = ws.getBlocksByType('quando_play', false)[0];
      var andar = ws.newBlock('mover_frente');
      andar.initSvg(); andar.render();
      raiz.getInput('CORPO').connection.connect(andar.previousConnection);

      var cabeca = ws.newBlock('quando_aviso');
      cabeca.initSvg(); cabeca.render();
      cabeca.moveBy(300, 300);
      var girar = ws.newBlock('girar');
      girar.initSvg(); girar.render();
      cabeca.getInput('CORPO').connection.connect(girar.previousConnection);
      return 1;
    })()`);
    await espera(300);

    assert.strictEqual(await aval(`Blocos.temTarefas(Blockly.getMainWorkspace())`),
      true, 'a página não viu a segunda pilha');

    const tarefas = JSON.parse(await aval(`(function () {
      var t = Blocos.workspaceParaTarefas(Blockly.getMainWorkspace());
      return JSON.stringify(t.map(function (x) { return x.quando; }));
    })()`));
    assert.deepStrictEqual(tarefas, ['play', 'aviso'],
      'o PLAY tem de mandar as duas pilhas, e nesta ordem');

    /* O bytecode que sairia daqui tem cabeçalho: duas linhas de OP_TASK. */
    const cabecalho = JSON.parse(await aval(`(function () {
      var t = Blocos.workspaceParaTarefas(Blockly.getMainWorkspace());
      var b = Compilador.compilarTarefas(t).bytes;
      return JSON.stringify([b[0], b[7]]);
    })()`));
    assert.deepStrictEqual(cabecalho, [14, 14],
      'as duas primeiras instruções tinham de ser OP_TASK');

    /* E o código do Arduino recusa, em português, em vez de exportar só o
       PLAY: o .ino tem um loop() só. */
    await aval(`document.getElementById('codigo').click()`);
    await espera(300);
    const texto = await aval(`document.getElementById('codigo-texto').textContent`);
    assert.match(texto, /mais de uma pilha/,
      `o painel devia explicar a recusa; veio: ${texto.slice(0, 120)}`);

    cdp.fechar();
  });


test('a pergunta de trocar de nível nasce na frente do painel de ajustes',
  { skip: PULAR, timeout: 120000 },
  async (t) => {
    /* Os botões de nível moram dentro do engrenagem desde que o cabeçalho foi
       limpo. Quem abre a pergunta «isto vai apagar o programa» é, portanto,
       sempre o painel de ajustes — e ela aparecia ATRÁS dele: os dois estavam
       empatados em z-index 200 e a ordem do documento decidia.

       O que se afirma aqui não é o número do z-index, é o que o dedo alcança:
       no meio da tela, quem recebe o toque tem de ser o diálogo. */
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 11) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-camadas-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 11}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 11}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 11}/json/list`);
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
    const abrir = async () => {
      await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 11}/` });
      const ate = Date.now() + 30000;
      let pronta = false;
      while (Date.now() < ate && !pronta) {
        pronta = await aval(`document.readyState === 'complete'
          && typeof Blockly !== 'undefined'
          && !!Blockly.getMainWorkspace()`).catch(() => false);
        if (!pronta) await espera(250);
      }
      assert.ok(pronta, 'a página não ficou pronta em 30 s');
      await espera(600);
    };

    await abrir();
    await aval(`localStorage.removeItem('robo_programa'); Niveis.definir('medio')`);
    await abrir();

    /* Um bloco na tela: sem programa montado, trocar de nível não pergunta
       nada — é justamente o caso em que o diálogo não apareceria. */
    await aval(`(function () {
      var ws = Blockly.getMainWorkspace();
      var raiz = ws.getBlocksByType('quando_play', false)[0];
      var andar = ws.newBlock('mover_frente');
      andar.initSvg(); andar.render();
      raiz.getInput('CORPO').connection.connect(andar.previousConnection);
      return 1;
    })()`);
    await espera(300);

    /* O caminho da criança: engrenagem, depois o botão de nível lá dentro. */
    await aval(`document.getElementById('ajustes').click()`);
    await espera(250);
    assert.strictEqual(await aval(`document.getElementById('painel-ajustes').hidden`),
      false, 'o painel de ajustes devia estar aberto');

    await aval(`document.querySelector('#painel-ajustes #niveis button[data-nivel="grande"]').click()`);
    await espera(300);
    assert.strictEqual(await aval(`document.getElementById('confirma').hidden`),
      false, 'a pergunta devia ter aparecido');

    /* Quem está por cima no meio da tela? */
    const quemRecebeOToque = await aval(`(function () {
      var alvo = document.elementFromPoint(
        Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2));
      return alvo && alvo.closest('#confirma') ? 'confirma'
           : alvo && alvo.closest('#painel-ajustes') ? 'ajustes'
           : (alvo ? alvo.id || alvo.tagName : 'nada');
    })()`);
    assert.strictEqual(quemRecebeOToque, 'confirma',
      'a pergunta ficou atrás do painel de ajustes');

    cdp.fechar();
  });


test('a caixa de blocos já abre vestida do nível, sem piscar o desenho cheio',
  { skip: PULAR, timeout: 120000 },
  async (t) => {
    /* A caixa é remontada a cada categoria aberta, e as peças nascem no
       desenho do Grande. Vesti-las pelo ouvinte de BLOCK_CREATE deixava um
       quadro no meio: o Blockly entrega evento por fila assíncrona, então a
       página pintava "andar frente [1] s" antes de o Pequeno chegar.

       A prova é o «no mesmo instante»: abrir a categoria e conferir os campos
       DENTRO DA MESMA expressão, sem devolver o controle ao navegador. Se a
       resposta certa só viesse um quadro depois, este teste falharia — que é
       exatamente o que a criança via. */
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 12) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-caixa-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 12}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 12}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 12}/json/list`);
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
    const abrir = async () => {
      await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 12}/` });
      const ate = Date.now() + 30000;
      let pronta = false;
      while (Date.now() < ate && !pronta) {
        pronta = await aval(`document.readyState === 'complete'
          && typeof Blockly !== 'undefined'
          && !!Blockly.getMainWorkspace()`).catch(() => false);
        if (!pronta) await espera(250);
      }
      assert.ok(pronta, 'a página não ficou pronta em 30 s');
      await espera(600);
    };

    await abrir();
    await aval(`localStorage.removeItem('robo_programa'); Niveis.definir('pequeno')`);
    await abrir();

    /* Abre a primeira categoria (Mover) e lê os campos na mesma tacada. */
    const estado = JSON.parse(await aval(`(function () {
      var ws = Blockly.getMainWorkspace();
      ws.getToolbox().selectItemByPosition(0);
      var peças = ws.getFlyout().getWorkspace().getTopBlocks(false);
      var andar = null;
      for (var i = 0; i < peças.length; i++) {
        if (peças[i].type === 'mover_frente') { andar = peças[i]; break; }
      }
      if (!andar) return JSON.stringify({ achou: false });
      var campo = function (nome) {
        var c = andar.getField(nome);
        return c ? c.isVisible() : null;
      };
      var encaixe = andar.getInput('SEG');
      return JSON.stringify({
        achou: true,
        rotulo: campo('T1'),
        unidade: campo('T2'),
        icone: campo('ICONE'),
        segundos: encaixe ? encaixe.isVisible() : null,
      });
    })()`));

    assert.ok(estado.achou, 'a categoria Mover devia trazer o andar frente');
    assert.strictEqual(estado.rotulo, false,
      'no Pequeno a caixa abriu com o rótulo "andar frente" à mostra');
    assert.strictEqual(estado.unidade, false,
      'no Pequeno a caixa abriu com o "s" à mostra');
    assert.strictEqual(estado.segundos, false,
      'no Pequeno a caixa abriu com o encaixe de segundos à mostra');
    assert.strictEqual(estado.icone, true, 'a seta tem de aparecer');

    cdp.fechar();
  });

/* ---------- a tela de quem ainda não lê ---------- */

test('nos dois primeiros níveis a tela inteira fica em caixa alta',
  { skip: PULAR, timeout: 120000 },
  async (t) => {
    /* Letra de forma é a que a criança aprende primeiro. A prova mede o
       traçado do texto dentro da peça e a largura da peça: no Chromium,
       text-transform no CSS fazia o texto crescer 25px sem a peça crescer
       junto, e "ANDAR FRENTE" invadia o encaixe do número. Medir os dois é o
       que separa "está em caixa alta" de "está em caixa alta e coube". */
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 13) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-alta-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 13}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 13}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 13}/json/list`);
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

    await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 13}/` });
    await espera(3000);

    /* Põe uma peça com palavra na bancada e lê o traçado dela. */
    const medir = `(function () {
      var ws = Blockly.getMainWorkspace();
      var b = ws.getAllBlocks(false).filter(function (x) {
        return x.type === 'mover_frente';
      })[0];
      if (!b) {
        b = ws.newBlock('mover_frente'); b.initSvg(); b.render(); b.moveBy(80, 300);
        Niveis.aplicarEmUm(b, Niveis.atual());
      }
      var maior = 0, texto = '';
      var ts = b.getSvgRoot().querySelectorAll('text');
      for (var i = 0; i < ts.length; i++) {
        var l = ts[i].getBBox().width;
        /* O Blockly pinta espaço como NBSP (Field.NBSP), então o texto do DOM
           não bate com o literal do teste se vier cru daqui. */
        if (l > maior) { maior = l; texto = ts[i].textContent.replace(/\u00a0/g, ' '); }
      }
      var aba = document.querySelectorAll('.blocklyTreeLabel')[0];
      var caixa = function (s) {
        var e = document.querySelector(s);
        return e ? getComputedStyle(e).textTransform : null;
      };
      return JSON.stringify({
        palavra: texto,
        traçado: Math.round(maior),
        peça: Math.round(b.getSvgRoot().getBBox().width),
        aba: aba ? getComputedStyle(aba).textTransform : null,
        missão: caixa('#missao'),
        /* Botão não herda text-transform: a folha do próprio navegador põe
           "none" nos controles de formulário. Sem regra própria, PLAY e os
           botões do painel ficavam em caixa mista no meio de uma tela toda
           em letra de forma. */
        botão: caixa('#ajustes-fechar'),
      });
    })()`;

    await aval(`document.querySelector('#niveis button[data-nivel=medio]').click()`);
    await espera(900);
    const basico = JSON.parse(await aval(medir));

    assert.strictEqual(basico.palavra, 'ANDAR FRENTE',
      'no Básico a peça precisa estar escrita em letra de forma');
    assert.ok(basico.traçado < basico.peça,
      `o texto (${basico.traçado}px) vazou da peça (${basico.peça}px)`);
    assert.strictEqual(basico.aba, 'uppercase',
      'as abas da gaveta ficaram em caixa mista no Básico');
    assert.strictEqual(basico.missão, 'uppercase',
      'o texto da missão ficou em caixa mista no Básico');
    assert.strictEqual(basico.botão, 'uppercase',
      'os botões ficaram em caixa mista no meio de uma tela em letra de forma');

    /* A medição deixou uma peça na bancada, e trocar de nível com trabalho
       montado abre a pergunta em vez de trocar — o nível ficaria no Básico e o
       teste mediria a mesma coisa duas vezes. Esvaziar antes é o que a criança
       faria respondendo "sim". */
    await aval(`(function () { Blocos.limpar(Blockly.getMainWorkspace()); return 1; })()`);
    await espera(300);
    await aval(`document.querySelector('#niveis button[data-nivel=grande]').click()`);
    await espera(900);
    const inter = JSON.parse(await aval(medir));

    assert.strictEqual(inter.palavra, 'andar frente',
      'no Intermediário a caixa alta tinha de sair');
    assert.strictEqual(inter.aba, 'none',
      'as abas continuaram gritando no Intermediário');
    assert.strictEqual(inter.botão, 'none',
      'os botões continuaram gritando no Intermediário');

    cdp.fechar();
  });

test('pegar uma peça da gaveta faz a voz dizer o que ela é',
  { skip: PULAR, timeout: 120000 },
  async (t) => {
    /* Quem ainda não lê precisa saber o que é a peça na hora de escolher. O
       Chromium headless tem a API mas nenhuma voz instalada, então o que se
       prova aqui é o pedido: que o app mande falar "andar para frente" em
       pt-BR no instante em que a peça sai da gaveta. */
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 14) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-voz-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 14}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 14}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 14}/json/list`);
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

    await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 14}/` });
    await espera(3000);

    await aval(`document.querySelector('#niveis button[data-nivel=pequeno]').click()`);
    await espera(800);

    /* Grava o que for pedido ao sintetizador. */
    await aval(`(function () {
      window.__ditas = [];
      speechSynthesis.speak = function (f) { window.__ditas.push(f.lang + ': ' + f.text); };
      speechSynthesis.cancel = function () {};
      return 1;
    })()`);

    const cat = JSON.parse(await aval(`(() => {
      const r = document.querySelectorAll('.blocklyTreeRow')[0].getBoundingClientRect();
      return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()`));
    await mouse('mousePressed', cat.x, cat.y);
    await mouse('mouseReleased', cat.x, cat.y);
    await espera(800);

    const alvo = JSON.parse(await aval(`(() => {
      const b = document.querySelectorAll('.blocklyFlyout .blocklyDraggable')[0];
      const r = b.getBoundingClientRect();
      return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()`));

    await mouse('mousePressed', alvo.x, alvo.y);
    for (let k = 1; k <= 8; k++) {
      await mouse('mouseMoved', alvo.x + (700 - alvo.x) * k / 8,
                                alvo.y + (400 - alvo.y) * k / 8);
      await espera(40);
    }
    await mouse('mouseReleased', 700, 400);
    await espera(600);

    const ditas = await aval(`JSON.stringify(window.__ditas)`);
    assert.ok(JSON.parse(ditas).includes('pt-BR: andar para frente'),
      `a peça saiu da gaveta calada; o que se pediu falar foi ${ditas}`);

    cdp.fechar();
  });

test('sem voz no aparelho, os Ajustes dizem por que os blocos não falam',
  { skip: PULAR, timeout: 120000 },
  async (t) => {
    /* O Chromium headless não tem voz instalada — é o mesmo caso do snap do
       Chromium no desktop, onde a libspeechd não entra no confinamento. Sem
       aviso, o silêncio ao pegar a peça é indistinguível de defeito.

       Só nos níveis que falam: no Intermediário a peça não fala por desenho, e
       avisar ali seria explicar uma ausência que ninguém sentiu. */
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB + 15) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-avisovoz-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP + 15}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP + 15}/json/version`, 40000),
      'Chromium não subiu');
    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP + 15}/json/list`);
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

    await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB + 15}/` });
    await espera(3000);

    assert.strictEqual(await aval(`Som.temVoz()`), false,
      'este Chromium tem voz; o teste precisa de um aparelho mudo');

    const aviso = `(function () {
      document.getElementById('ajustes').click();
      var a = document.getElementById('aviso-voz');
      return JSON.stringify({ existe: !!a, aparece: a ? !a.hidden : null,
                              texto: a ? a.textContent : null });
    })()`;

    await aval(`document.querySelector('#niveis button[data-nivel=pequeno]').click()`);
    await espera(700);
    const noIniciante = JSON.parse(await aval(aviso));
    assert.ok(noIniciante.existe, 'o painel de Ajustes não tem o aviso de voz');
    assert.strictEqual(noIniciante.aparece, true,
      'sem voz no aparelho, o Iniciante precisa dizer por que os blocos calam');
    assert.match(noIniciante.texto, /voz/i, 'o aviso tem de falar de voz');

    await aval(`document.getElementById('ajustes-fechar').click()`);
    await espera(300);
    await aval(`document.querySelector('#niveis button[data-nivel=grande]').click()`);
    await espera(700);
    const noIntermediario = JSON.parse(await aval(aviso));
    assert.strictEqual(noIntermediario.aparece, false,
      'o Intermediário não fala por desenho, e não deveria avisar de voz');

    cdp.fechar();
  });
