'use strict';
/* O gerador do .ino. Roda em Node porque ele não conhece DOM nem Blockly —
   mesma razão que separou o compilador.js e o gabarito.js. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { gerar, PINOS, VEL_GIRO, MS_POR_GRAU, TRIM_DIR } = require('../web/arduino.js');

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

/* O trim é a única coisa que o .ino precisa copiar do hal e que não é pino nem
   calibração da VM. Sem esta guarda ele divergiria em silêncio, e o sketch
   exportado sairia torto onde o robô anda reto. */
test('a compensação de partida do .ino é a mesma do firmware', () => {
  const hal = fs.readFileSync(
    path.join(RAIZ, 'firmware/src/hal_esp32.cpp'), 'utf8');
  const m = hal.match(/TRIM_DIR\s*=\s*(-?\d+)/);
  assert.ok(m, 'não achei TRIM_DIR no hal_esp32.cpp');
  assert.strictEqual(Number(m[1]), TRIM_DIR,
    'o trim divergiu entre o firmware e o .ino');
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

/* ---------- números arredondados como na VM ---------- */

test('número decimal dentro de uma conta sai arredondado, como no bytecode', () => {
  assert.strictEqual(
    programa([{ op: 'frente', segundos: { op: 'mais', a: 1.5, b: 1 },
                velocidade: 200 }]),
    '  andarFrente(2 + 1, 200);');
});

test('arredonda negativo pelo Math.round, que é o do compilador', () => {
  const texto = gerar([{ op: 'se', cond: { op: 'maior', a: -1.6, b: -1.5 },
                         corpo: [{ op: 'parar' }] }]);
  assert.ok(texto.includes('if (-2 > -1) {'), texto);
});

test('número sozinho no campo de segundos continua com uma casa', () => {
  assert.strictEqual(programa([{ op: 'esperar', segundos: 0.5 }]),
                     '  esperar(0.5);');
});

/* ---------- as caixas ---------- */

const { limparNome } = require('../web/arduino.js');

test('o nome da caixa vira identificador com prefixo', () => {
  assert.strictEqual(limparNome('voltas'), 'caixa_voltas');
  assert.strictEqual(limparNome('número de voltas'), 'caixa_numero_de_voltas');
  assert.strictEqual(limparNome('Ação!'), 'caixa_Acao');
  assert.strictEqual(limparNome('3voltas'), 'caixa_3voltas');
  assert.strictEqual(limparNome('__x'), 'caixa_x');
  assert.strictEqual(limparNome('_Nome'), 'caixa_Nome');
  assert.strictEqual(limparNome('a  --  b'), 'caixa_a_b');
  assert.strictEqual(limparNome('???'), 'caixa_caixa');
  assert.strictEqual(limparNome('PWMA'), 'caixa_PWMA');
});

test('a caixa é int32_t, declarada antes da primeira função', () => {
  const texto = gerar([{ op: 'guardar', indice: 0, nome: 'voltas', valor: 3 }]);
  const decl = texto.indexOf('int32_t caixa_voltas = 0;');
  assert.ok(decl >= 0, texto);
  assert.ok(decl < texto.indexOf('void fiacao()'));
  assert.ok(decl < texto.indexOf('void programa()'));
  assert.ok(texto.includes('  caixa_voltas = 3;'));
});

test('mudar passa pela somar, e a somar só existe quando há mudar', () => {
  const com = gerar([{ op: 'mudar', indice: 0, nome: 'voltas',
                       valor: { op: 'caixa', indice: 1, nome: 'passo' } }]);
  assert.ok(com.includes('  caixa_voltas = somar(caixa_voltas, caixa_passo);'), com);
  assert.ok(com.includes('int32_t somar(int32_t caixa, int32_t n) {'));
  assert.ok(com.includes('int32_t caixa_passo = 0;'), 'caixa só lida também é declarada');
  const sem = gerar([{ op: 'guardar', indice: 0, nome: 'voltas', valor: 1 }]);
  assert.ok(!sem.includes('somar('));
});

test('guardar 1.6 e -1.6 arredondam como o bytecode', () => {
  const texto = gerar([
    { op: 'guardar', indice: 0, nome: 'a', valor: 1.6 },
    { op: 'guardar', indice: 1, nome: 'b', valor: -1.6 },
    { op: 'guardar', indice: 2, nome: 'c', valor: -1.5 },
  ]);
  assert.ok(texto.includes('  caixa_a = 2;'));
  assert.ok(texto.includes('  caixa_b = -2;'));
  assert.ok(texto.includes('  caixa_c = -1;'));
});

test('dois nomes que dão no mesmo identificador ficam distintos', () => {
  const texto = gerar([
    { op: 'guardar', indice: 0, nome: 'número', valor: 1 },
    { op: 'guardar', indice: 1, nome: 'numero', valor: 2 },
    { op: 'guardar', indice: 2, nome: 'número!', valor: 3 },
  ]);
  assert.ok(texto.includes('  caixa_numero = 1;'), texto);
  assert.ok(texto.includes('  caixa_numero_2 = 2;'), texto);
  assert.ok(texto.includes('  caixa_numero_3 = 3;'), texto);
});

test('nomes perigosos geram um sketch que compila',
  { skip: temGpp() ? false : 'sem g++ nesta máquina' }, () => {
    const nomes = ['PWMA', 'delay', 'HIGH', '__x', '_Nome', '3voltas',
                   'número de voltas', 'somar', 'int'];
    const ast = nomes.map((nome, i) => ({ op: 'mudar', indice: i, nome, valor: i }));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ino-'));
    const arq = path.join(dir, 'caixas.cpp');
    fs.writeFileSync(arq, '#include "fake_arduino.h"\n' + gerar(ast));
    const r = spawnSync('g++', ['-fsyntax-only', '-Wall', '-I', __dirname, arq],
      { encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    assert.strictEqual(r.status, 0, 'o sketch não compilou:\n' + r.stderr);
  });

/* Não basta compilar: a somar tem que dar a volta como o CHANGE_VAR da VM, e
   sem comportamento indefinido. O UBSan com -fno-sanitize-recover derruba o
   programa se a soma com sinal estourar. */
test('a somar do sketch gerado dá a volta sem comportamento indefinido',
  { skip: temGpp() ? false : 'sem g++ nesta máquina' }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ino-'));
    const arq = path.join(dir, 'somar.cpp');
    const bin = path.join(dir, 'somar');
    fs.writeFileSync(arq,
      '#include "fake_arduino.h"\n' +
      gerar([{ op: 'mudar', indice: 0, nome: 'x', valor: 1 }]) +
      '\nint main() {\n' +
      '  if (somar(INT32_MAX, 1) != INT32_MIN) return 1;\n' +
      '  if (somar(INT32_MIN, -1) != INT32_MAX) return 2;\n' +
      '  if (somar(40, 2) != 42) return 3;\n' +
      '  return 0;\n}\n');
    const c = spawnSync('g++', ['-fsanitize=undefined', '-fno-sanitize-recover=all',
                                '-I', __dirname, '-o', bin, arq], { encoding: 'utf8' });
    assert.strictEqual(c.status, 0, 'não compilou:\n' + c.stderr);
    const r = spawnSync(bin, [], { encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    assert.strictEqual(r.status, 0, 'a somar errou (código ' + r.status + '):\n' + r.stderr);
  });

/* ---------- os blocos que ela inventa ---------- */

const girar90 = [{ op: 'girar', graus: 90 }];

/* ---------- entradas dos blocos inventados ---------- */

function lerEntrada(id, nome) {
  return { op: 'entrada', id: id || 'e1', nome: nome || 'lado' };
}

/* Um bloco «quadrado (lado)» que gira o que recebeu, usado com o valor dado. */
function quadradoCom(valor, corpo) {
  return [{ op: 'usar', nome: 'quadrado',
            corpo: corpo || [{ op: 'girar', graus: lerEntrada() }],
            args: [{ id: 'e1', nome: 'lado', valor: valor }] }];
}

test('o bloco com entrada vira função com parâmetro', () => {
  const txt = gerar(quadradoCom(30));
  assert.ok(txt.includes('void bloco_quadrado(int p_lado) {'),
    'faltou a assinatura com parâmetro');
  assert.ok(txt.includes('girar(p_lado);'), 'o corpo devia usar o parâmetro');
  assert.ok(txt.includes('bloco_quadrado(30);'), 'faltou a chamada com o 30');
});

/* O prefixo p_ existe para isto: sem ele, uma entrada chamada «i» colidiria com
   o contador do repetir, e uma chamada «delay» com a função do Arduino. */
test('entrada chamada i não colide com o contador do repetir', () => {
  const txt = gerar([{ op: 'usar', nome: 'anda',
    corpo: [{ op: 'repetir', vezes: 2,
              corpo: [{ op: 'girar', graus: lerEntrada('e1', 'i') }] }],
    args: [{ id: 'e1', nome: 'i', valor: 5 }] }]);
  assert.ok(txt.includes('void bloco_anda(int p_i) {'), 'faltou p_i');
  assert.ok(txt.includes('for (int i = 0;'), 'o laço devia continuar com i');
});

test('o parâmetro não vira variável global', () => {
  assert.ok(!gerar(quadradoCom(30)).includes('int32_t p_lado'),
    'p_lado é parâmetro, não caixa');
});

/* A função tem parâmetro por valor: o 🎲 é sorteado uma vez e passado. A VM
   sorteia a cada leitura. Gerar assim mentiria sobre o robô — e o arquivo já
   recusa o 📣 avisar pelo mesmo motivo. */
test('argumento vivo lido duas vezes faz o .ino recusar', () => {
  const ler = lerEntrada();
  const e = erroDoIno(() => gerar(quadradoCom({ op: 'aleatorio', a: 1, b: 10 },
    [{ op: 'girar', graus: ler }, { op: 'girar', graus: ler }])));
  assert.match(e.message, /sortear de novo/);
});

test('argumento vivo lido uma vez só continua exportando', () => {
  assert.doesNotThrow(
    () => gerar(quadradoCom({ op: 'aleatorio', a: 1, b: 10 })));
});

test('argumento constante lido duas vezes continua exportando', () => {
  const ler = lerEntrada();
  assert.doesNotThrow(() => gerar(quadradoCom(30,
    [{ op: 'girar', graus: ler }, { op: 'girar', graus: ler }])));
});

/* Contar ocorrências na árvore não é contar execuções: uma leitura só, dentro
   de um repetir 4, é sorteada quatro vezes pela VM e uma vez pelo .ino. */
test('argumento vivo lido dentro de um repetir faz o .ino recusar', () => {
  const e = erroDoIno(() => gerar(quadradoCom({ op: 'aleatorio', a: 1, b: 10 },
    [{ op: 'repetir', vezes: 4,
       corpo: [{ op: 'girar', graus: lerEntrada() }] }])));
  assert.match(e.message, /sortear de novo/);
});

/* «Vivo» é o que muda a cada leitura — 🎲 e 👁. Uma conta determinística dá
   sempre o mesmo número, e recusá-la é um teto inventado. */
test('conta determinística lida duas vezes continua exportando', () => {
  const ler = lerEntrada();
  assert.doesNotThrow(() => gerar(quadradoCom({ op: 'mais', a: 1, b: 2 },
    [{ op: 'girar', graus: ler }, { op: 'girar', graus: ler }])));
});

/* O argumento de dentro é a entrada de fora, e lá ele vale 30: constante. */
test('bloco encadeado com argumento constante continua exportando', () => {
  const dentroLe = (id) => ({ op: 'entrada', id: id, nome: 'g' });
  const dentro = { op: 'usar', nome: 'dentro',
    args: [{ id: 'd1', nome: 'g', valor: lerEntrada() }],
    corpo: [{ op: 'girar', graus: dentroLe('d1') },
            { op: 'girar', graus: dentroLe('d1') }] };
  assert.doesNotThrow(() => gerar([{ op: 'usar', nome: 'fora',
    args: [{ id: 'e1', nome: 'lado', valor: 30 }], corpo: [dentro] }]));
});

/* Caixa também muda entre leituras — ainda mais com um «mudar» no meio do
   corpo. A VM relê a caixa; o .ino guarda o parâmetro da primeira vez. */
test('argumento que é caixa, relida depois de mudar, faz o .ino recusar', () => {
  const ler = lerEntrada();
  const e = erroDoIno(() => gerar([{ op: 'usar', nome: 'f',
    args: [{ id: 'e1', nome: 'n', valor: { op: 'caixa', indice: 0, nome: 'n' } }],
    corpo: [{ op: 'girar', graus: ler },
            { op: 'mudar', indice: 0, nome: 'n', valor: 1 },
            { op: 'girar', graus: ler }] }]));
  assert.match(e.message, /sortear de novo|muda entre uma leitura/);
});

/* A condição de um «repetir até» roda a cada volta. Contá-la como uma leitura
   deixava passar o dado sorteado uma vez no .ino e muitas na VM. */
test('argumento vivo na condição de um laço faz o .ino recusar', () => {
  const e = erroDoIno(() => gerar([{ op: 'usar', nome: 'f',
    args: [{ id: 'e1', nome: 'n', valor: { op: 'aleatorio', a: 1, b: 10 } }],
    corpo: [{ op: 'repetir_ate',
              cond: { op: 'maior', a: lerEntrada(), b: 5 },
              corpo: [{ op: 'girar', graus: 90 }] }] }]));
  assert.match(e.message, /sortear de novo|muda entre uma leitura/);
});

/* A entrada também é lida quando é passada adiante: «f(🎲)» cujo corpo entrega
   `n` a outro bloco duas vezes é substituído nos dois lugares pela VM — dois
   sorteios — enquanto o .ino passa p_n uma vez. O contador varria os campos de
   valor e não varria os argumentos dos usos de dentro. */
test('entrada passada adiante duas vezes faz o .ino recusar', () => {
  const passaAdiante = () => ({ op: 'usar', nome: 'g',
    args: [{ id: 'g1', nome: 'm', valor: lerEntrada() }],
    corpo: [{ op: 'girar', graus: { op: 'entrada', id: 'g1', nome: 'm' } }] });
  const e = erroDoIno(() => gerar([{ op: 'usar', nome: 'f',
    args: [{ id: 'e1', nome: 'n', valor: { op: 'aleatorio', a: 1, b: 10 } }],
    corpo: [passaAdiante(), passaAdiante()] }]));
  assert.match(e.message, /sortear de novo|muda entre uma leitura/);
});

/* Passada adiante uma vez só, para um bloco que a lê uma vez, não diverge: o
   .ino avalia uma vez e a VM também. Recusar isto seria teto inventado. */
test('entrada passada adiante uma vez só continua exportando', () => {
  assert.doesNotThrow(() => gerar([{ op: 'usar', nome: 'f',
    args: [{ id: 'e1', nome: 'n', valor: { op: 'aleatorio', a: 1, b: 10 } }],
    corpo: [{ op: 'usar', nome: 'g',
              args: [{ id: 'g1', nome: 'm', valor: lerEntrada() }],
              corpo: [{ op: 'girar', graus: { op: 'entrada', id: 'g1', nome: 'm' } }] }] }]));
});

/* Caixa lida uma vez só continua exportando: sem segunda leitura não há
   divergência nenhuma para esconder. */
test('argumento que é caixa, lida uma vez só, continua exportando', () => {
  assert.doesNotThrow(() => gerar([{ op: 'usar', nome: 'f',
    args: [{ id: 'e1', nome: 'n', valor: { op: 'caixa', indice: 0, nome: 'n' } }],
    corpo: [{ op: 'girar', graus: lerEntrada() }] }]));
});

/* Dois parâmetros com o mesmo nome dão «void bloco_f(int p_x, int p_x)», que
   não compila. O nome livre só era procurado ao criar, nunca ao renomear. */
test('duas entradas com o mesmo nome não geram parâmetros repetidos', () => {
  const txt = gerar([{ op: 'usar', nome: 'f',
    args: [{ id: 'e1', nome: 'x', valor: 1 }, { id: 'e2', nome: 'x', valor: 2 }],
    corpo: [{ op: 'girar', graus: { op: 'entrada', id: 'e1', nome: 'x' } }] }]);
  const assinatura = txt.match(/void bloco_f\([^)]*\)/)[0];
  const nomes = assinatura.match(/p_[A-Za-z0-9_]+/g) || [];
  assert.strictEqual(new Set(nomes).size, nomes.length,
    'parâmetros repetidos na assinatura: ' + assinatura);
});

/* O sensor dentro do argumento é da tela de quem chamou: sem varrer os args, o
   arquivo chamaria distanciaCm() sem declará-la. */
test('sensor no argumento declara a função do sensor', () => {
  assert.ok(gerar(quadradoCom({ op: 'distancia' })).includes('int distanciaCm()'),
    'faltou declarar o sensor usado só no argumento');
});

function erroDoIno(fn) {
  try { fn(); } catch (e) { return e; }
  assert.fail('devia ter lançado');
}

test('o sketch com entrada compila',
  { skip: temGpp() ? false : 'sem g++ nesta máquina' }, () => {
    const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ino-')), 'robo.cpp');
    fs.writeFileSync(arq, '#include "fake_arduino.h"\n' + gerar([
      { op: 'usar', nome: 'quadrado',
        corpo: [{ op: 'repetir', vezes: 4, corpo: [
          { op: 'frente', segundos: 1, velocidade: 200 },
          { op: 'girar', graus: lerEntrada() }] }],
        args: [{ id: 'e1', nome: 'lado', valor: 90 }] }]));
    const r = spawnSync('g++', ['-fsyntax-only', '-Wall', '-I', __dirname, arq],
                        { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
  });

test('usar vira chamada, e a função é declarada uma vez', () => {
  const uso = { op: 'usar', nome: 'dançar', corpo: girar90 };
  const texto = gerar([uso, uso]);
  assert.strictEqual(texto.split('void bloco_dancar() {').length - 1, 1, texto);
  assert.ok(texto.includes('  girar(90);\n}'), texto);
  assert.strictEqual(programa([uso, uso]), '  bloco_dancar();\n  bloco_dancar();');
});

test('a função usada por outra vem antes dela', () => {
  const b = { op: 'usar', nome: 'b', corpo: girar90 };
  const a = { op: 'usar', nome: 'a', corpo: [b] };
  const texto = gerar([a]);
  assert.ok(texto.indexOf('void bloco_b()') < texto.indexOf('void bloco_a()'), texto);
  assert.ok(texto.indexOf('void bloco_a()') < texto.indexOf('void programa()'), texto);
});

test('parar dentro de função chama fim(), e fim só existe então', () => {
  const com = gerar([{ op: 'usar', nome: 'x', corpo: [{ op: 'parar' }] }]);
  assert.ok(com.includes('void bloco_x() {\n  parar();\n  fim();\n}'), com);
  assert.ok(com.includes('void fim() {'), com);
  assert.ok(com.indexOf('void fim()') < com.indexOf('void bloco_x()'));
  const sem = gerar([{ op: 'parar' }]);
  assert.ok(!sem.includes('fim()'));
  assert.ok(sem.includes('  parar();\n  return;'), 'fora de função, o parar é o de sempre');
});

test('o sensor lido só dentro de um bloco inventado é declarado', () => {
  const texto = gerar([{ op: 'usar', nome: 'olhar',
    corpo: [{ op: 'se', cond: { op: 'menor', a: { op: 'distancia' }, b: 10 },
              corpo: [{ op: 'parar' }] }] }]);
  assert.ok(texto.includes('int distanciaCm()'), texto);
});

test('o repetir dentro da função recomeça em i', () => {
  const texto = gerar([{ op: 'repetir', vezes: 2, corpo: [
    { op: 'usar', nome: 'volta', corpo: [{ op: 'repetir', vezes: 3, corpo: girar90 }] }] }]);
  assert.ok(texto.includes('void bloco_volta() {\n  for (int i = 0; i < 3; i++) {'), texto);
});

test('bloco e caixa com o mesmo nome não se atropelam', () => {
  const texto = gerar([
    { op: 'guardar', indice: 0, nome: 'x', valor: 1 },
    { op: 'usar', nome: 'x', corpo: girar90 },
  ]);
  assert.ok(texto.includes('int32_t caixa_x = 0;'));
  assert.ok(texto.includes('void bloco_x() {'));
});

test('a cadeia de vinte blocos gera o .ino em milissegundos', () => {
  let corpo = girar90;
  for (let i = 0; i < 20; i++) {
    const uso = { op: 'usar', nome: 'b' + i, corpo };
    corpo = [uso, uso];
  }
  const t0 = Date.now();
  const texto = gerar(corpo);
  assert.ok(Date.now() - t0 < 500, 'demorou ' + (Date.now() - t0) + ' ms');
  assert.strictEqual((texto.match(/^void bloco_b\d+\(\) \{$/gm) || []).length, 20);
});

test('o sketch com dois blocos encadeados e um parar compila',
  { skip: temGpp() ? false : 'sem g++ nesta máquina' }, () => {
    const b = { op: 'usar', nome: 'girar um pouco', corpo: [{ op: 'girar', graus: 10 }] };
    const a = { op: 'usar', nome: 'dançar', corpo: [b, b, { op: 'parar' }] };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ino-'));
    const arq = path.join(dir, 'blocos.cpp');
    fs.writeFileSync(arq, '#include "fake_arduino.h"\n' + gerar([a, { op: 'girar', graus: 5 }]));
    const r = spawnSync('g++', ['-fsyntax-only', '-Wall', '-I', __dirname, arq],
      { encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    assert.strictEqual(r.status, 0, 'o sketch não compilou:\n' + r.stderr);
  });
