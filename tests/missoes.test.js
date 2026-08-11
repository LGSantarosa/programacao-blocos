'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Missoes = require('../web/missoes.js');

/* A arena tem 2 x 2 m e o robô tem 8 cm de raio. Cada missão traz a própria
   arena e o próprio ponto de partida, então tudo aqui se verifica por missão:
   uma estrela dentro de uma parede é impossível de alcançar, e um robô que
   nasce dentro de uma parede não sai do lugar. */
const RAIO_ROBO = 0.08;

function dentro(p, o) {
  return p.x >= o.x0 && p.x <= o.x1 && p.y >= o.y0 && p.y <= o.y1;
}

/* Distância do ponto ao retângulo: zero se estiver dentro. */
function folga(p, o) {
  const dx = Math.max(o.x0 - p.x, 0, p.x - o.x1);
  const dy = Math.max(o.y0 - p.y, 0, p.y - o.y1);
  return Math.sqrt(dx * dx + dy * dy);
}

test('toda missão cabe dentro da arena, longe da parede', () => {
  for (const m of Missoes.LISTA) {
    assert.ok(m.x > 0.15 && m.x < 1.85, `${m.texto}: x=${m.x} colado na parede`);
    assert.ok(m.y > 0.15 && m.y < 1.85, `${m.texto}: y=${m.y} colado na parede`);
  }
});

test('nenhuma estrela nasce dentro de uma parede', () => {
  for (const m of Missoes.LISTA) {
    for (const o of m.obstaculos) {
      assert.ok(!dentro(m, o),
        `${m.texto}: estrela dentro de uma parede, impossível de alcançar`);
    }
  }
});

test('o robô cabe onde nasce, em toda missão', () => {
  for (const m of Missoes.LISTA) {
    assert.ok(m.inicio, `${m.texto}: sem ponto de partida`);
    assert.ok(m.inicio.x - RAIO_ROBO > 0 && m.inicio.x + RAIO_ROBO < 2,
      `${m.texto}: nasce atravessando a parede lateral`);
    assert.ok(m.inicio.y - RAIO_ROBO > 0 && m.inicio.y + RAIO_ROBO < 2,
      `${m.texto}: nasce atravessando a parede de cima ou de baixo`);
    for (const o of m.obstaculos) {
      assert.ok(folga(m.inicio, o) > RAIO_ROBO,
        `${m.texto}: nasce encostado numa parede e não sai do lugar`);
    }
  }
});

test('nenhuma missão já nasce cumprida', () => {
  for (const m of Missoes.LISTA) {
    assert.ok(!Missoes.chegou(m.inicio, m),
      `${m.texto}: o robô já começa em cima da estrela`);
  }
});

test('a estrela dá para alcançar sem raspar na parede', () => {
  for (const m of Missoes.LISTA) {
    for (const o of m.obstaculos) {
      assert.ok(folga(m, o) > RAIO_ROBO,
        `${m.texto}: a estrela está colada numa parede; o robô não encosta nela`);
    }
  }
});

test('os corredores do labirinto são mais largos que o robô', () => {
  /* Um corredor da largura do robô é intransitável na prática: o giro erra
     alguns graus e ele raspa. */
  const paredes = Missoes.LABIRINTO;
  const diametro = RAIO_ROBO * 2;
  for (let i = 0; i < paredes.length; i++) {
    for (let j = i + 1; j < paredes.length; j++) {
      const a = paredes[i], b = paredes[j];
      /* só compara paredes que se enfrentam no eixo x */
      const sobrepoemY = a.y0 < b.y1 && b.y0 < a.y1;
      if (!sobrepoemY) continue;
      const vao = (b.x0 > a.x1) ? b.x0 - a.x1 : (a.x0 > b.x1 ? a.x0 - b.x1 : null);
      if (vao === null) continue;
      assert.ok(vao > diametro + 0.06,
        `corredor de ${(vao * 100).toFixed(0)} cm entre as paredes ${i} e ${j}; ` +
        `o robô tem ${(diametro * 100).toFixed(0)} cm e precisa de folga`);
    }
  }
});

/* A pergunta que mais importa numa fase: dá para chegar? Nenhuma das outras
   verificações responde isso — a estrela pode estar em espaço livre, o robô
   pode nascer em espaço livre, e ainda assim as paredes selarem o caminho
   entre os dois. Aqui varremos a arena numa grade de 2 cm e espalhamos a partir
   do robô, andando só por onde o corpo dele cabe. */
function alcanca(missao) {
  const PASSO = 0.02;
  const N = Math.round(2.0 / PASSO);
  const livre = (cx, cy) => {
    if (cx - RAIO_ROBO < 0 || cx + RAIO_ROBO > 2) return false;
    if (cy - RAIO_ROBO < 0 || cy + RAIO_ROBO > 2) return false;
    for (const o of missao.obstaculos) {
      if (folga({ x: cx, y: cy }, o) < RAIO_ROBO) return false;
    }
    return true;
  };
  const chave = (i, j) => i * N + j;
  const iDe = (v) => Math.min(N - 1, Math.max(0, Math.round(v / PASSO)));

  const inicio = [iDe(missao.inicio.x), iDe(missao.inicio.y)];
  const alvo = [iDe(missao.x), iDe(missao.y)];
  if (!livre(inicio[0] * PASSO, inicio[1] * PASSO)) return 'o robô nasce preso';

  const visto = new Set([chave(inicio[0], inicio[1])]);
  const fila = [inicio];
  while (fila.length) {
    const [i, j] = fila.shift();
    /* Perto o bastante da estrela conta, igual à regra do jogo. */
    const dx = i * PASSO - missao.x, dy = j * PASSO - missao.y;
    if (Math.sqrt(dx * dx + dy * dy) <= Missoes.RAIO) return true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const k = chave(ni, nj);
      if (visto.has(k)) continue;
      if (!livre(ni * PASSO, nj * PASSO)) continue;
      visto.add(k);
      fila.push([ni, nj]);
    }
  }
  void alvo;
  return 'as paredes selam o caminho até a estrela';
}

test('dá para chegar na estrela em toda missão', () => {
  for (const m of Missoes.LISTA) {
    const r = alcanca(m);
    assert.strictEqual(r, true, `${m.texto}: ${r}`);
  }
});

test('o labirinto tem paredes, senão não é labirinto', () => {
  /* Achado pelas paredes, não pela posição na lista: a fase do labirinto era a
     última até a da parede entrar depois dela, e amarrar o teste à ordem faz
     ele quebrar toda vez que uma fase nova é acrescentada — sem que nada do
     que ele afirma tenha deixado de valer. */
  const maze = Missoes.LISTA.find((m) => m.obstaculos === Missoes.LABIRINTO);
  assert.ok(maze, 'nenhuma fase usa o labirinto');
  assert.ok(maze.obstaculos.length >= 2, 'o labirinto precisa de paredes');
  assert.notStrictEqual(maze.obstaculos, Missoes.BLOCO);
});

test('encostar na estrela conta, passar longe não', () => {
  const m = { x: 1.0, y: 1.0 };
  assert.ok(Missoes.chegou({ x: 1.0, y: 1.0 }, m), 'em cima deveria contar');
  assert.ok(Missoes.chegou({ x: 1.0, y: 1.0 + Missoes.RAIO - 0.01 }, m),
    'dentro do raio deveria contar');
  assert.ok(!Missoes.chegou({ x: 1.0, y: 1.0 + Missoes.RAIO + 0.05 }, m),
    'fora do raio não deveria contar');
});

test('o raio é generoso, porque o giro do robô erra alguns graus', () => {
  assert.ok(Missoes.RAIO >= 0.12,
    'raio apertado transformaria a missão em sorte');
  assert.ok(Missoes.RAIO <= 0.30,
    'raio largo demais faria a criança acertar sem querer');
});

test('pose ou missão faltando não estoura', () => {
  assert.doesNotThrow(() => Missoes.chegou(null, null));
  assert.strictEqual(Missoes.chegou(null, Missoes.daVez(0)), false);
  assert.strictEqual(Missoes.chegou(Missoes.LISTA[0].inicio, null), false);
});

test('daVez dá a volta em vez de sair da lista', () => {
  assert.strictEqual(Missoes.daVez(0), Missoes.LISTA[0]);
  assert.strictEqual(Missoes.daVez(Missoes.quantas()), Missoes.LISTA[0]);
  assert.strictEqual(Missoes.daVez(-5), Missoes.LISTA[0]);
  assert.strictEqual(Missoes.daVez('abacaxi'), Missoes.LISTA[0]);
});

test('avançar caminha pela lista e volta ao começo no fim', () => {
  Missoes.definir(0);
  assert.strictEqual(Missoes.atual(), 0);
  assert.strictEqual(Missoes.avancar(), 1);
  Missoes.definir(Missoes.quantas() - 1);
  assert.strictEqual(Missoes.avancar(), 0, 'depois da última, recomeça');
  Missoes.definir(0);
});

test('toda missão tem um texto curto, que criança lê', () => {
  for (const m of Missoes.LISTA) {
    assert.ok(m.texto && m.texto.length > 0, 'missão sem texto');
    assert.ok(m.texto.length <= 40,
      `"${m.texto}" tem ${m.texto.length} letras; não cabe no painel`);
  }
});

test('a fase da parede existe, em arena vazia', () => {
  const m = Missoes.daVez(5);
  assert.strictEqual(Missoes.quantas(), 6);
  assert.deepStrictEqual(m.obstaculos, []);
  assert.strictEqual(m.inicio.x, 1.00);
  assert.strictEqual(m.inicio.y, 0.25);
  assert.strictEqual(m.x, 1.00);
  assert.strictEqual(m.y, 1.70);
});

test('a trilha da parede guarda a condição e os passos cegos', () => {
  const passo = Missoes.daVez(5).gabarito[0];
  assert.strictEqual(passo.ate_perto, 20);
  assert.strictEqual(passo.andar, 13);
});

test('bater na parede não cumpre a fase da parede', () => {
  /* colide limita o centro do robô a y <= 1,92. Se a estrela estivesse colada
     em 2,00, bater seria uma forma de vencer — e a fase perderia o sentido. */
  const m = Missoes.daVez(5);
  assert.ok(!Missoes.chegou({ x: 1.00, y: 1.92 }, m),
    'bater na parede está cumprindo a missão');
  assert.ok(Missoes.chegou({ x: 1.00, y: 1.771 }, m),
    'parar pelo sensor deveria cumprir');
});
