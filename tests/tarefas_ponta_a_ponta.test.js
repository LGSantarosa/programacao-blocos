'use strict';
/* A prova que nenhum dos outros dá: o compilador de verdade, o bytecode de
   verdade e a VM de verdade, no robô virtual inteiro.

   Os testes em C provam a VM com bytecode montado à mão; os de JavaScript
   provam o compilador lendo os bytes que ele gerou. Nenhum dos dois pega um
   desencontro entre os dois lados — um número de opcode diferente aqui e ali,
   um cabeçalho que a VM lê de um jeito e o compilador escreve de outro. Este
   pega: o programa sai do compilador e entra no robô.

   Fala com o `host/robo_host` pela mesma porta que o bridge usa: "L <hex>"
   carrega, "R" roda, e o robô responde em linhas de texto. */

const test = require('node:test');
const assert = require('node:assert');
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const { compilar, compilarTarefas, compilarValor } = require('../web/compilador.js');

const RAIZ = path.join(__dirname, '..');
const ROBO = path.join(RAIZ, 'host', 'robo_host');

function hex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

/* Carrega, roda, e devolve tudo que o robô falou em `ms` milissegundos. */
function rodar(bytes, ms) {
  return new Promise((resolve, reject) => {
    const robo = spawn(ROBO, [], { cwd: path.join(RAIZ, 'host') });
    let saida = '';
    robo.stdout.on('data', (d) => { saida += d.toString(); });
    robo.on('error', reject);
    robo.stdin.write('L ' + hex(bytes) + '\nR\n');
    setTimeout(() => {
      robo.kill();
      resolve(saida.split('\n').filter((l) => l.length));
    }, ms);
  });
}

/* As linhas de telemetria são "T x y theta dist colidiu", em milímetros e
   décimos de grau. O y do começo é 400. */
function ys(linhas) {
  return linhas.filter((l) => l[0] === 'T')
               .map((l) => Number(l.split(' ')[2]));
}

function estados(linhas) {
  return linhas.filter((l) => l.startsWith('E ')).map((l) => l.slice(2));
}

test.before(() => {
  const r = spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });
  assert.strictEqual(r.status, 0, 'o robô virtual precisa compilar');
});

test('sem tarefas, o robô anda como sempre', { timeout: 20000 }, async () => {
  /* A régua: o mesmo andar, no caminho de antes. Se este falhar, o problema
     não é das tarefas. */
  const { bytes } = compilar([{ op: 'frente', segundos: 0.5, blockId: 'b' }]);
  const linhas = await rodar(bytes, 2500);
  const y = ys(linhas);
  assert.ok(y.length > 5, 'devia haver telemetria');
  assert.ok(y[y.length - 1] > y[0] + 50,
    `o robô devia ter andado; foi de ${y[0]} a ${y[y.length - 1]}`);
  assert.strictEqual(estados(linhas)[estados(linhas).length - 1], '0',
    'o programa termina sozinho');
});

/* O número que a criança põe no buraco chega ao robô. Se o argumento não
   chegasse, o girar receberia 0 e a pose final seria a de partida — este teste
   é o único que prova isso com o compilador, o bytecode e a VM de verdade. */
test('um bloco com entrada gira o que a criança pediu',
  { timeout: 20000 }, async () => {
    const { bytes } = compilarTarefas([
      { quando: 'play', blockId: 'p', corpo: [
        { op: 'usar', nome: 'vira', blockId: 'u',
          corpo: [{ op: 'girar',
                    graus: { op: 'entrada', id: 'e1', nome: 'g' },
                    blockId: 'g' }],
          args: [{ id: 'e1', nome: 'g', valor: 90 }] }] },
    ]);
    const linhas = await rodar(bytes, 2500);
    /* A telemetria é "T x y theta dist colidiu", com theta em décimos de grau:
       90° são 900, e o limite de 600 dá folga para a física. */
    const thetas = linhas.filter((l) => l[0] === 'T')
                         .map((l) => Number(l.split(' ')[3]));
    assert.ok(thetas.length > 5, 'devia haver telemetria');
    assert.ok(Math.abs(thetas[thetas.length - 1] - thetas[0]) > 600,
      `o robô devia ter girado; foi de ${thetas[0]} a ${thetas[thetas.length - 1]}`);
  });

test('a espera de uma tarefa não congela a outra', { timeout: 20000 }, async () => {
  /* Este é o ciclo inteiro numa frase. Com um pc só — como era até aqui — a
     espera de 3 s da primeira pilha seguraria a segunda, e o robô não sairia
     do lugar durante ela. */
  const { bytes } = compilarTarefas([
    { quando: 'play', blockId: 'p',
      corpo: [{ op: 'esperar', segundos: 3, blockId: 'e' }] },
    { quando: 'play', blockId: 'q',
      corpo: [{ op: 'frente', segundos: 0.5, blockId: 'f' }] },
  ]);
  const linhas = await rodar(bytes, 1500);   /* olha antes dos 3 s */
  const y = ys(linhas);
  assert.ok(y.length > 5, 'devia haver telemetria');
  assert.ok(y[y.length - 1] > y[0] + 50,
    `o robô devia ter andado durante a espera da outra pilha; ` +
    `foi de ${y[0]} a ${y[y.length - 1]}`);
  /* E ainda está rodando: a pilha que dorme continua viva. */
  assert.strictEqual(estados(linhas)[estados(linhas).length - 1], '1');
});

test('o aviso acorda a pilha que estava dormindo', { timeout: 20000 }, async () => {
  /* A pilha do PLAY não anda: ela só avisa. Quem anda é a que estava
     dormindo — então qualquer movimento aqui só pode ter vindo do aviso. */
  const { bytes } = compilarTarefas([
    { quando: 'play', blockId: 'p',
      corpo: [{ op: 'avisar', aviso: 2, blockId: 'a' }] },
    { quando: 'aviso', aviso: 2, blockId: 'q',
      corpo: [{ op: 'frente', segundos: 0.5, blockId: 'f' }] },
  ]);
  const linhas = await rodar(bytes, 2500);
  const y = ys(linhas);
  assert.ok(y[y.length - 1] > y[0] + 50,
    `o aviso devia ter posto o robô para andar; ` +
    `foi de ${y[0]} a ${y[y.length - 1]}`);
});

test('um aviso que ninguém escuta não trava o programa', { timeout: 20000 },
  async () => {
    const { bytes } = compilarTarefas([
      { quando: 'play', blockId: 'p',
        corpo: [{ op: 'avisar', aviso: 5, blockId: 'a' },
                { op: 'frente', segundos: 0.3, blockId: 'f' }] },
      { quando: 'aviso', aviso: 1, blockId: 'q',
        corpo: [{ op: 'girar', graus: 90, blockId: 'g' }] },
    ]);
    const linhas = await rodar(bytes, 2500);
    assert.strictEqual(estados(linhas)[estados(linhas).length - 1], '0',
      'o programa termina, mesmo com uma pilha que nunca acordou');
  });

test('«quando <condição>» fica de olho e dispara quando dá verdade',
  { timeout: 20000 }, async () => {
    /* A arena padrão tem parede: andando reto, a distância cai. A pilha do
       «quando» só faz sentido se ela realmente disparar sozinha — aqui ela
       manda o robô girar quando chega perto, sem ninguém tocar em nada. */
    const { bytes } = compilarTarefas([
      { quando: 'play', blockId: 'p',
        corpo: [{ op: 'frente', segundos: 5, blockId: 'f' }] },
      { quando: 'condicao', blockId: 'q',
        cond: { op: 'menor', a: { op: 'distancia' }, b: 40, blockId: 'c' },
        corpo: [{ op: 'girar', graus: 90, blockId: 'g' }] },
    ]);
    const linhas = await rodar(bytes, 4000);
    const thetas = linhas.filter((l) => l[0] === 'T')
                         .map((l) => Number(l.split(' ')[3]));
    const girou = thetas.some((t) => Math.abs(t - thetas[0]) > 300);
    assert.ok(girou,
      'o «quando» devia ter feito o robô girar ao chegar perto da parede');
  });

/* Carrega e roda um programa, e depois — no mesmo robô, sem reiniciar o
   processo — um segundo. É a execução viva: a caixa tem que atravessar a
   troca de programa. */
function rodarDois(primeiro, segundo, msPrimeiro, msSegundo) {
  return new Promise((resolve, reject) => {
    const robo = spawn(ROBO, [], { cwd: path.join(RAIZ, 'host') });
    let saida = '';
    robo.stdout.on('data', (d) => { saida += d.toString(); });
    robo.on('error', reject);
    robo.stdin.write('L ' + hex(primeiro) + '\nR\n');
    setTimeout(() => {
      robo.stdin.write('L ' + hex(segundo) + '\nR\n');
      setTimeout(() => {
        robo.kill();
        resolve(saida.split('\n').filter((l) => l.length));
      }, msSegundo);
    }, msPrimeiro);
  });
}

test('uma pilha conta na caixa, outra lê e responde', { timeout: 20000 }, async () => {
  const conta = compilarTarefas([
    { quando: 'play', corpo: [
      { op: 'repetir', vezes: 5, corpo: [
        { op: 'mudar', indice: 0, nome: 'voltas', valor: 1 },
        { op: 'esperar', segundos: 0.05 } ] } ] },
    { quando: 'condicao',
      cond: { op: 'igual', a: { op: 'caixa', indice: 0, nome: 'voltas' }, b: 5 },
      corpo: [{ op: 'guardar', indice: 1, nome: 'pronto', valor: 42 }] },
  ], { zerarCaixas: true });
  const pergunta = compilarValor({ op: 'caixa', indice: 1, nome: 'pronto' });
  const linhas = await rodarDois(conta.bytes, pergunta.bytes, 1500, 800);
  assert.ok(linhas.includes('V 42'),
    'a pilha do «quando» devia ter visto a conta da outra; o robô disse:\n' +
    linhas.filter((l) => l[0] !== 'T').join('\n'));
});

test('um bloco inventado anda dentro de uma pilha «quando»', { timeout: 20000 }, async () => {
  /* O mesmo «quando perto, gira» do teste acima, com o giro dentro de um bloco
     inventado. Se a cópia do corpo errar um salto dentro da tarefa, o robô não
     gira. */
  const girarUmPouco = [{ op: 'girar', graus: 90, blockId: 'g' }];
  const { bytes } = compilarTarefas([
    { quando: 'play', blockId: 'p',
      corpo: [{ op: 'frente', segundos: 5, blockId: 'f' }] },
    { quando: 'condicao', blockId: 'q',
      cond: { op: 'menor', a: { op: 'distancia' }, b: 40, blockId: 'c' },
      corpo: [{ op: 'usar', nome: 'desviar', corpo: girarUmPouco, blockId: 'u' }] },
  ]);
  const linhas = await rodar(bytes, 4000);
  const thetas = linhas.filter((l) => l[0] === 'T')
                       .map((l) => Number(l.split(' ')[3]));
  assert.ok(thetas.some((t) => Math.abs(t - thetas[0]) > 300),
    'o bloco inventado devia ter feito o robô girar ao chegar perto da parede');
});
