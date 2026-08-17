'use strict';
/* O gerador do .ino. Roda em Node porque ele não conhece DOM nem Blockly —
   mesma razão que separou o compilador.js e o gabarito.js. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { gerar, PINOS, VEL_GIRO, MS_POR_GRAU } = require('../web/arduino.js');

const RAIZ = path.join(__dirname, '..');

/* Só o corpo do programa(), sem o resto do arquivo: é ali que mora a tradução,
   e comparar o arquivo inteiro faria cada teste falhar por causa do cabeçalho.

   O ^\}$ com a flag m é obrigatório: sem ele o [\s\S]*? pararia na primeira
   chave fechada que aparecesse, que é a de um laço lá dentro. */
function programa(ast) {
  const m = gerar(ast).match(/void programa\(\) \{\n([\s\S]*?)^\}$/m);
  assert.ok(m, 'não achei o programa() no arquivo gerado');
  return m[1].replace(/\n$/, '');
}

test('programa vazio gera um programa() de corpo vazio', () => {
  assert.strictEqual(programa([]), '');
});

test('andar frente vira andarFrente com segundos e velocidade', () => {
  assert.strictEqual(
    programa([{ op: 'frente', segundos: 1, velocidade: 200 }]),
    '  andarFrente(1.0, 200);');
});

test('andar trás vira andarTras', () => {
  assert.strictEqual(
    programa([{ op: 'tras', segundos: 2.5, velocidade: 120 }]),
    '  andarTras(2.5, 120);');
});

/* O Pequeno e o Médio não mostram o menu de velocidade. Sem ele vale a
   calibração da v1 — a mesma regra do web/compilador.js. */
test('sem velocidade vale 200, igual ao compilador', () => {
  assert.strictEqual(
    programa([{ op: 'frente', segundos: 0.5 }]),
    '  andarFrente(0.5, 200);');
});

test('velocidade acima de 255 satura, igual ao compilador', () => {
  assert.strictEqual(
    programa([{ op: 'frente', segundos: 1, velocidade: 400 }]),
    '  andarFrente(1.0, 255);');
});

test('segundos saem sempre com uma casa, que é a precisão do campo', () => {
  assert.strictEqual(
    programa([{ op: 'esperar', segundos: 2 }]),
    '  esperar(2.0);');
});

test('girar sai inteiro e com sinal', () => {
  assert.strictEqual(programa([{ op: 'girar', graus: -90 }]), '  girar(-90);');
});

test('o arquivo tem sempre o esqueleto do sketch', () => {
  const txt = gerar([]);
  for (const pedaco of ['void fiacao()', 'void motores(', 'void parar()',
                        'void programa()', 'void setup()', 'void loop()']) {
    assert.ok(txt.includes(pedaco), 'faltou ' + pedaco);
  }
});

/* Não há botão PLAY na placa: o RESET é que vira o PLAY, e os 3 s são o tempo
   de pôr o robô no chão e tirar a mão. */
test('setup espera, roda uma vez, e o loop fica vazio', () => {
  const txt = gerar([]);
  assert.ok(/void setup\(\) \{\n  fiacao\(\);\n  delay\(3000\);/.test(txt),
    'o setup não espera antes de rodar');
  assert.ok(/  programa\(\);\n  parar\(\);\n\}/.test(txt),
    'o setup não roda o programa uma vez');
  assert.ok(/void loop\(\) \{\n\}/.test(txt), 'o loop deveria estar vazio');
});

test('um programa sem giro não carrega girar()', () => {
  const txt = gerar([{ op: 'frente', segundos: 1 }]);
  assert.ok(!txt.includes('void girar('), 'sobrou a função de girar');
});

test('um programa sem espera não carrega esperar()', () => {
  const txt = gerar([{ op: 'frente', segundos: 1 }]);
  assert.ok(!txt.includes('void esperar('), 'sobrou a função de esperar');
});

test('quem anda para trás carrega andarTras, e só ele', () => {
  const txt = gerar([{ op: 'tras', segundos: 1 }]);
  assert.ok(txt.includes('void andarTras('), 'faltou andarTras');
  assert.ok(!txt.includes('void andarFrente('), 'sobrou andarFrente');
});

test('bloco desconhecido é erro, não silêncio', () => {
  assert.throws(() => gerar([{ op: 'voar' }]), /voar/);
});

test('repetir vira for com o número de vezes', () => {
  assert.strictEqual(
    programa([{ op: 'repetir', vezes: 3, corpo: [{ op: 'girar', graus: 90 }] }]),
    ['  for (int i = 0; i < 3; i++) {',
     '    girar(90);',
     '  }'].join('\n'));
});

/* Reusar "i" no laço de dentro zeraria o contador do de fora. */
test('repetir aninhado troca de variável', () => {
  assert.strictEqual(
    programa([{ op: 'repetir', vezes: 2, corpo: [
      { op: 'repetir', vezes: 3, corpo: [{ op: 'girar', graus: 90 }] }] }]),
    ['  for (int i = 0; i < 2; i++) {',
     '    for (int j = 0; j < 3; j++) {',
     '      girar(90);',
     '    }',
     '  }'].join('\n'));
});

/* Zero viraria um laço que nunca roda. O compilador força 1 pela mesma razão,
   e o bloco tem que significar a mesma coisa nos dois mundos. */
test('repetir zero vezes vira uma, igual ao compilador', () => {
  assert.strictEqual(
    programa([{ op: 'repetir', vezes: 0, corpo: [{ op: 'girar', graus: 90 }] }]),
    ['  for (int i = 0; i < 1; i++) {',
     '    girar(90);',
     '  }'].join('\n'));
});

test('repetir para sempre vira while (true)', () => {
  assert.strictEqual(
    programa([{ op: 'repetir_sempre', corpo: [{ op: 'girar', graus: 90 }] }]),
    ['  while (true) {',
     '    girar(90);',
     '  }'].join('\n'));
});

/* O bloco diz "repetir até chegar a menos de", então o laço roda enquanto a
   leitura ainda é maior ou igual — e testa antes de dar o primeiro passo. */
test('repetir até perto testa antes de rodar', () => {
  assert.strictEqual(
    programa([{ op: 'repetir_ate_perto', cm: 20,
                corpo: [{ op: 'frente', segundos: 0.5 }] }]),
    ['  while (distanciaCm() >= 20) {',
     '    andarFrente(0.5, 200);',
     '  }'].join('\n'));
});

test('se obstáculo vira if com a comparação do bloco', () => {
  assert.strictEqual(
    programa([{ op: 'se_obstaculo', cm: 15, corpo: [{ op: 'parar' }] }]),
    ['  if (distanciaCm() < 15) {',
     '    parar();',
     '    return;',
     '  }'].join('\n'));
});

test('se…senão vira if/else', () => {
  assert.strictEqual(
    programa([{ op: 'se_senao', cm: 20,
                entao: [{ op: 'girar', graus: 90 }],
                senao: [{ op: 'frente', segundos: 1 }] }]),
    ['  if (distanciaCm() < 20) {',
     '    girar(90);',
     '  } else {',
     '    andarFrente(1.0, 200);',
     '  }'].join('\n'));
});

/* "parar tudo" acaba o programa mesmo lá do fundo de dois laços — é o que o
   HALT faz na VM, e é o que a criança espera do bloco. */
test('parar dentro de dois laços sai do programa inteiro', () => {
  assert.strictEqual(
    programa([{ op: 'repetir', vezes: 2, corpo: [
      { op: 'repetir_sempre', corpo: [{ op: 'parar' }] }] }]),
    ['  for (int i = 0; i < 2; i++) {',
     '    while (true) {',
     '      parar();',
     '      return;',
     '    }',
     '  }'].join('\n'));
});

test('quem usa sensor carrega distanciaCm e os pinos dele', () => {
  const txt = gerar([{ op: 'se_obstaculo', cm: 20, corpo: [{ op: 'parar' }] }]);
  assert.ok(txt.includes('int distanciaCm()'), 'faltou distanciaCm');
  assert.ok(txt.includes('pulseIn(ECHO'), 'faltou a leitura do sensor');
  assert.ok(txt.includes('const int TRIG'), 'faltaram os pinos do sensor');
  assert.ok(txt.includes('pinMode(ECHO, INPUT);'), 'faltou a fiação do sensor');
});

test('um programa sem sensor não carrega o HC-SR04', () => {
  const txt = gerar([{ op: 'repetir', vezes: 2,
                       corpo: [{ op: 'frente', segundos: 1 }] }]);
  assert.ok(!txt.includes('distanciaCm'), 'sobrou a função do sensor');
  assert.ok(!txt.includes('pulseIn'), 'sobrou a leitura do sensor');
  assert.ok(!txt.includes('TRIG'), 'sobraram os pinos do sensor');
});

/* O sensor pode estar só no fundo de um ramo, e a varredura tem que descer
   até lá — inclusive pelo "senão", que não se chama "corpo". */
test('sensor escondido dentro de um senão também conta', () => {
  const txt = gerar([{ op: 'se_senao', cm: 20,
                       entao: [{ op: 'frente', segundos: 1 }],
                       senao: [{ op: 'repetir_ate_perto', cm: 10,
                                 corpo: [{ op: 'girar', graus: 90 }] }] }]);
  assert.ok(txt.includes('int distanciaCm()'), 'faltou distanciaCm');
  assert.ok(txt.includes('void girar('), 'faltou girar, que está dentro do senão');
});

/* O .ino repete números que moram em arquivos C. Se um mudar sozinho, o robô
   de blocos e o .ino passam a girar diferente, e a criança conclui que o
   código é que está errado. Estes dois testes são o que impede isso. */

test('os pinos do .ino são os mesmos do firmware', () => {
  const hal = fs.readFileSync(
    path.join(RAIZ, 'firmware/src/hal_esp32.cpp'), 'utf8');
  for (const nome of Object.keys(PINOS)) {
    const m = hal.match(new RegExp('PIN_' + nome + '\\s*=\\s*(\\d+)'));
    assert.ok(m, 'não achei PIN_' + nome + ' no hal_esp32.cpp');
    assert.strictEqual(Number(m[1]), PINOS[nome],
      'o pino ' + nome + ' divergiu entre o firmware e o .ino');
  }
});

test('a calibração do giro é a mesma da VM', () => {
  const vm = fs.readFileSync(path.join(RAIZ, 'core/vm.h'), 'utf8');
  const vel = vm.match(/#define\s+VEL_GIRO\s+(\d+)/);
  const ms = vm.match(/#define\s+MS_POR_GRAU\s+(\d+)/);
  assert.ok(vel && ms, 'não achei a calibração no core/vm.h');
  assert.strictEqual(Number(vel[1]), VEL_GIRO, 'VEL_GIRO divergiu do vm.h');
  assert.strictEqual(Number(ms[1]), MS_POR_GRAU, 'MS_POR_GRAU divergiu do vm.h');
});

function temGpp() {
  return spawnSync('which', ['g++'], { encoding: 'utf8' }).status === 0;
}

/* Um programa que usa todo bloco existente, para o compilador ver o arquivo
   inteiro de uma vez. */
const TUDO = [
  { op: 'repetir', vezes: 3, corpo: [
    { op: 'frente', segundos: 1, velocidade: 255 },
    { op: 'tras', segundos: 0.5 },
    { op: 'girar', graus: -45 },
    { op: 'esperar', segundos: 2 },
    { op: 'repetir', vezes: 2, corpo: [
      { op: 'se_senao', cm: 20,
        entao: [{ op: 'repetir_ate_perto', cm: 10,
                  corpo: [{ op: 'frente', segundos: 0.2 }] }],
        senao: [{ op: 'se_obstaculo', cm: 30, corpo: [{ op: 'parar' }] }] }] }] },
  { op: 'repetir_sempre', corpo: [{ op: 'girar', graus: 90 }] },
  /* E o vocabulário do Gigante, para o compilador ver as contas também. */
  { op: 'frente', segundos: { op: 'aleatorio', a: 1, b: 3 }, velocidade: 200 },
  { op: 'girar', graus: { op: 'vezes', a: { op: 'distancia' }, b: 2 } },
  { op: 'repetir', vezes: { op: 'mais', a: 2, b: 1 }, corpo: [
    { op: 'esperar', segundos: { op: 'dividir', a: 4, b: 2 } } ] },
  { op: 'se_entao_senao',
    cond: { op: 'e',
            a: { op: 'nao', a: { op: 'menor', a: { op: 'distancia' }, b: 20 } },
            b: { op: 'ou', a: { op: 'maior', a: 3, b: 4 },
                           b: { op: 'igual', a: 5, b: 5 } } },
    entao: [{ op: 'repetir_ate',
              cond: { op: 'menor', a: { op: 'distancia' }, b: 10 },
              corpo: [{ op: 'frente', segundos: 0.2 }] }],
    senao: [{ op: 'se', cond: { op: 'maior', a: { op: 'distancia' }, b: 100 },
              corpo: [{ op: 'parar' }] }] },
];

/* Sintaxe errada no texto gerado só apareceria com a criança na frente do
   Arduino IDE. Um g++ resolve isso em milissegundos. Mesmo truque do
   fake_hal.c, que deixa a VM ser testada sem hardware. */
test('o sketch gerado compila',
  { skip: temGpp() ? false : 'sem g++ nesta máquina' }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ino-'));
    const arq = path.join(dir, 'robo.cpp');
    fs.writeFileSync(arq, '#include "fake_arduino.h"\n' + gerar(TUDO));
    const r = spawnSync('g++', ['-fsyntax-only', '-Wall', '-I', __dirname, arq],
      { encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    assert.strictEqual(r.status, 0, 'o sketch não compilou:\n' + r.stderr);
  });

test('o sketch mais simples possível também compila',
  { skip: temGpp() ? false : 'sem g++ nesta máquina' }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ino-'));
    const arq = path.join(dir, 'vazio.cpp');
    fs.writeFileSync(arq, '#include "fake_arduino.h"\n' + gerar([]));
    const r = spawnSync('g++', ['-fsyntax-only', '-Wall', '-I', __dirname, arq],
      { encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    assert.strictEqual(r.status, 0, 'o sketch vazio não compilou:\n' + r.stderr);
  });

/* ---------- as contas do Gigante viram expressão ---------- */

test('uma conta vira expressão em C++', () => {
  assert.strictEqual(
    programa([{ op: 'girar', graus: { op: 'vezes', a: 45, b: 2 } }]),
    '  girar(45 * 2);');
});

/* Parênteses em toda conta composta: depender da precedência do C++ é apostar
   que a criança entende precedência antes de entender conta. */
test('as contas põem parênteses para não depender de precedência', () => {
  assert.strictEqual(
    programa([{ op: 'girar',
                graus: { op: 'mais', a: 1, b: { op: 'vezes', a: 2, b: 3 } } }]),
    '  girar(1 + (2 * 3));');
});

test('o distância vira a chamada da função, e ela é emitida', () => {
  const txt = gerar([{ op: 'se', cond: { op: 'menor', a: { op: 'distancia' }, b: 20 },
                       corpo: [{ op: 'parar' }] }]);
  assert.ok(txt.includes('if (distanciaCm() < 20) {'), txt);
  assert.ok(txt.includes('int distanciaCm()'), 'faltou a função do sensor');
});

test('o aleatório sai como função nomeada, e ela é emitida', () => {
  const txt = gerar([{ op: 'esperar', segundos: { op: 'aleatorio', a: 1, b: 3 } }]);
  assert.ok(txt.includes('esperar(aleatorio(1, 3));'), txt);
  assert.ok(txt.includes('int aleatorio(int menor, int maior)'), 'faltou aleatorio');
  assert.ok(txt.includes('randomSeed'), 'sem semente, sorteia igual toda ligada');
});

test('um programa sem aleatório não carrega aleatorio()', () => {
  const txt = gerar([{ op: 'frente', segundos: 1 }]);
  assert.ok(!txt.includes('int aleatorio('), 'sobrou aleatorio');
  assert.ok(!txt.includes('randomSeed'), 'sobrou a semente');
});

test('repetir até do Gigante vira while com a condição negada', () => {
  assert.strictEqual(
    programa([{ op: 'repetir_ate',
                cond: { op: 'maior', a: { op: 'distancia' }, b: 50 },
                corpo: [{ op: 'frente', segundos: 0.5 }] }]),
    ['  while (!(distanciaCm() > 50)) {',
     '    andarFrente(0.5, 200);',
     '  }'].join('\n'));
});

test('se e se…senão do Gigante viram if e if/else', () => {
  assert.strictEqual(
    programa([{ op: 'se_entao_senao',
                cond: { op: 'igual', a: 1, b: 1 },
                entao: [{ op: 'parar' }],
                senao: [{ op: 'girar', graus: 90 }] }]),
    ['  if (1 == 1) {',
     '    parar();',
     '    return;',
     '  } else {',
     '    girar(90);',
     '  }'].join('\n'));
});

test('e, ou e não saem legíveis', () => {
  assert.strictEqual(
    programa([{ op: 'se',
                cond: { op: 'e',
                        a: { op: 'nao', a: { op: 'menor', a: 1, b: 2 } },
                        b: { op: 'ou', a: { op: 'maior', a: 3, b: 4 },
                                       b: { op: 'igual', a: 5, b: 5 } } },
                corpo: [{ op: 'parar' }] }]),
    ['  if (!(1 < 2) && ((3 > 4) || (5 == 5))) {',
     '    parar();',
     '    return;',
     '  }'].join('\n'));
});

/* Uma conta dentro do tempo continua sendo tempo: o .ino tem que multiplicar
   por mil como o compilador faz. */
test('segundos que são conta viram multiplicação por mil', () => {
  assert.strictEqual(
    programa([{ op: 'frente', segundos: { op: 'mais', a: 1, b: 2 },
                velocidade: 200 }]),
    '  andarFrente(1 + 2, 200);');
});

test('o sensor escondido dentro de uma conta também é encontrado', () => {
  const txt = gerar([{ op: 'girar',
    graus: { op: 'vezes', a: { op: 'distancia' }, b: 2 } }]);
  assert.ok(txt.includes('int distanciaCm()'), 'faltou distanciaCm');
  assert.ok(txt.includes('girar(distanciaCm() * 2);'), txt);
});
