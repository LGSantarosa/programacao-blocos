# Exportar o programa para `.ino` — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No nível Grande, a criança aperta `{ } ver código` e lê o programa que montou escrito em C++, pronto para gravar num Arduino de verdade.

**Architecture:** Um módulo novo, `web/arduino.js`, recebe a mesma AST que o `web/compilador.js` recebe e devolve o texto de um sketch. Sem DOM e sem Blockly, como os irmãos, para ser testável em Node em milissegundos — e, aqui, para o texto gerado poder ser jogado num `g++ -fsyntax-only` dentro do próprio teste. A interface é um botão no cabeçalho mais um painel escondido no `index.html`, no mesmo padrão do diálogo de troca de nível.

**Tech Stack:** JavaScript ES5 sem transpilador (módulos UMD), Blockly 8 compilado, `node:test`, `g++` para conferir o C++ gerado, Chromium headless via CDP.

**Spec:** [`docs/superpowers/specs/2026-08-17-exportar-ino-design.md`](../specs/2026-08-17-exportar-ino-design.md)

## Global Constraints

Valem para **todas** as tarefas.

- **ES5 estrito em tudo dentro de `web/`.** Nada de `let`, `const`, arrow function, template literal, `class`, spread/rest, `**`, nem método abreviado em objeto (`{ m() {} }` → `{ m: function () {} }`). O alvo é o Safari do iOS 9 num iPad 2, que dá erro ao **carregar** o arquivo: uma arrow function perdida mata a página antes da primeira linha rodar. `tests/es5.test.js` é o guarda, e ele varre todo `web/*.js` — o `arduino.js` entra na varredura sozinho. Arquivos em `tests/` rodam em Node e **não** têm essa restrição.
- **CSS sem `var()`, sem `gap`, sem `aspect-ratio`, sem `inset`, e sem `<dialog>`.** Mesma razão. Sobreposição se faz com `position: fixed` mais `top/right/bottom/left`.
- **Comentários em português**, explicando *por que*, não *o quê*. Siga a densidade dos arquivos vizinhos.
- **Nenhuma mudança em `core/`, `host/` ou `firmware/src/`.** Se um passo parecer exigir isso, pare e reporte. Esses três arquivos são **lidos** pela guarda de constantes da Task 3, nunca escritos.
- **Cores exatas do projeto:** azul royal `#0050f0`, ciano `#20b0f0`, navy `#002080`, amarelo `#f0c000`, verde do PLAY `#37c26b`, vermelho do PARAR `#f25c4a`.
- **Commits em português, no imperativo**, descrevendo a intenção e não o diff.
- **Como rodar os testes:**
  - Tudo: `node --test tests/` (leva ~5 min por causa dos testes de Chromium)
  - Tudo menos os lentos: `node --test $(ls tests/*.test.js | grep -v gabaritos.test.js | grep -v navegador.test.js)`. Nada de `--test-skip-pattern`: esta máquina tem Node 18 e a flag só existe da 20 em diante.
  - Um arquivo: `node --test tests/arduino.test.js`
  - C: `make -C tests test`

---

## Estrutura de arquivos

| arquivo | responsabilidade | tarefa |
|---|---|---|
| `web/arduino.js` | **Novo.** AST → texto C++. Dono da tradução, das normalizações e do formato do arquivo. | 1, 2 |
| `tests/arduino.test.js` | **Novo.** A tradução bloco a bloco, as normalizações, a guarda das constantes e a compilação de verdade. | 1, 2, 3 |
| `tests/fake_arduino.h` | **Novo.** Stubs vazios do Arduino, só para o `g++` ter o que resolver. | 3 |
| `web/index.html` | Botão no cabeçalho, marcação e CSS do painel, `<script>` do arduino.js. | 4 |
| `web/app.js` | Fiação do botão, do painel e do download; visibilidade por nível. | 4 |
| `tests/navegador.test.js` | O botão só existe no Grande, e abrir mostra código. | 4 |
| `README.md` | A saída `.ino` na seção dos níveis e a tabela bloco → C++. | 5 |

---

## Task 1: `web/arduino.js` — o esqueleto do arquivo e os blocos de movimento

Entrega sozinha: um programa só de andar, virar e esperar já gera um `.ino` completo e gravável. Os blocos de controle vêm na Task 2.

**Files:**
- Create: `web/arduino.js`
- Test: `tests/arduino.test.js`

**Interfaces:**
- Consumes: a AST que o `web/blocos.js` produz — uma lista de nós `{ op, ... }`, com `op` em `frente`, `tras`, `girar`, `esperar`, `repetir`, `se_obstaculo`, `parar`, `repetir_sempre`, `se_senao`, `repetir_ate_perto`. Os campos por nó estão em `web/blocos.js:227-280`.
- Produces, exportados em `Arduino`:
  - `gerar(ast)` → `string`, o sketch inteiro, terminado em `\n`.
  - `VEL_GIRO` → `180`, `MS_POR_GRAU` → `5` (cópias de `core/vm.h`).
  - `PINOS` → `{ PWMA, AIN1, AIN2, PWMB, BIN1, BIN2, STBY, TRIG, ECHO }` (cópias de `firmware/src/hal_esp32.cpp`).

- [ ] **Step 1: Escrever os testes que falham**

Crie `tests/arduino.test.js`:

```javascript
'use strict';
/* O gerador do .ino. Roda em Node porque ele não conhece DOM nem Blockly —
   mesma razão que separou o compilador.js e o gabarito.js. */

const test = require('node:test');
const assert = require('node:assert');
const { gerar } = require('../web/arduino.js');

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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/arduino.test.js`
Expected: FAIL — `Cannot find module '../web/arduino.js'`.

- [ ] **Step 3: Escrever o `web/arduino.js`**

Crie `web/arduino.js`. É ES5: nada de `const`, `let`, arrow, template literal.

```javascript
/* Gera o texto de um sketch Arduino a partir da mesma árvore que o compilador
   recebe. Roda no navegador e no Node, sem Blockly nem DOM — é o que permite
   testá-lo, e é a mesma razão que separou o compilador.js e o gabarito.js.

   O alvo não é fidelidade à VM, é legibilidade: quem vai ler isto é uma criança
   que acabou de sair dos blocos. Onde as duas brigam, ganha a leitura — desde
   que o robô ande igual. */
(function (raiz) {
  'use strict';

  /* Cópias, e cópia precisa de guarda. Os originais moram em core/vm.h
     (VEL_GIRO, MS_POR_GRAU) e em firmware/src/hal_esp32.cpp (os pinos).
     tests/arduino.test.js lê os dois arquivos e falha se algum divergir: se a
     calibração mudar de um lado só, o .ino gira diferente do robô, e a criança
     conclui que o código é que está errado. */
  var VEL_GIRO = 180;
  var MS_POR_GRAU = 5;
  var PINOS = {
    PWMA: 25, AIN1: 26, AIN2: 27,
    PWMB: 33, BIN1: 14, BIN2: 12,
    STBY: 13, TRIG: 5, ECHO: 18
  };

  /* A velocidade da v1, a mesma que o compilador assume quando o nível não
     mostra o menu. */
  var VEL_PADRAO = 200;
  var ESPERA_MS = 3000;

  /* Um nome por profundidade: reusar "i" dentro de outro "i" faria o laço de
     dentro zerar o contador do de fora, e o robô andaria errado sem que nada
     na tela dissesse por quê. */
  var NOMES_LACO = ['i', 'j', 'k', 'l'];

  function recuo(n) {
    var s = '', i;
    for (i = 0; i < n; i++) s += '  ';
    return s;
  }

  /* Sempre com uma casa, que é a precisão do campo: "1" vira "1.0", e o
     parâmetro é float dos dois lados. */
  function seg(v) {
    var n = Number(v);
    if (!isFinite(n) || n < 0) n = 0;
    return n.toFixed(1);
  }

  function inteiro(v, padrao) {
    var n = Math.round(Number(v));
    return isFinite(n) ? n : padrao;
  }

  /* Mesma regra do web/compilador.js, de propósito: o .ino tem que andar como
     o robô de blocos anda. */
  function velocidadeDe(no) {
    var v = Math.round(Number(no.velocidade));
    if (!isFinite(v) || v <= 0) return VEL_PADRAO;
    return v > 255 ? 255 : v;
  }

  function nomeLaco(profundidade) {
    return profundidade < NOMES_LACO.length
      ? NOMES_LACO[profundidade]
      : 'i' + (profundidade + 1);
  }

  /* Quais funções de apoio este programa precisa. Um programa que não sente
     nada não carrega o HC-SR04: tudo que está no arquivo tem uso visível. */
  function usoDe(nos, uso) {
    var i, no;
    uso = uso || {};
    for (i = 0; i < nos.length; i++) {
      no = nos[i];
      if (no.op === 'frente') uso.frente = true;
      if (no.op === 'tras') uso.tras = true;
      if (no.op === 'girar') uso.girar = true;
      if (no.op === 'esperar') uso.esperar = true;
      if (no.corpo) usoDe(no.corpo, uso);
    }
    return uso;
  }

  function gerarNos(nos, nivel, profundidade, linhas) {
    var i, no, r;
    for (i = 0; i < nos.length; i++) {
      no = nos[i];
      r = recuo(nivel);
      switch (no.op) {
        case 'frente':
          linhas.push(r + 'andarFrente(' + seg(no.segundos) + ', ' +
                      velocidadeDe(no) + ');');
          break;
        case 'tras':
          linhas.push(r + 'andarTras(' + seg(no.segundos) + ', ' +
                      velocidadeDe(no) + ');');
          break;
        case 'girar':
          linhas.push(r + 'girar(' + inteiro(no.graus, 0) + ');');
          break;
        case 'esperar':
          linhas.push(r + 'esperar(' + seg(no.segundos) + ');');
          break;
        default:
          throw new Error('Bloco desconhecido: ' + no.op);
      }
    }
  }

  var CABECALHO = [
    '/* Robô de Blocos — o seu programa, virado código Arduino.',
    '   Placa: ESP32 dev, motores TB6612FNG, sensor HC-SR04.',
    '',
    '   Salve numa pasta chamada robo/ — o Arduino IDE pede isso, e oferece',
    '   criar a pasta sozinho quando você abre. Pode dizer que sim.',
    '',
    '   Gravar este arquivo APAGA a tela de blocos que mora na placa.',
    '   Para voltar aos blocos, grave o firmware de novo (pasta firmware/).',
    '',
    '   Ao ligar, o robô espera 3 segundos e roda o programa uma vez. */',
    ''
  ];

  function pinos(uso) {
    var fora = [
      'const int PWMA = ' + PINOS.PWMA + ', AIN1 = ' + PINOS.AIN1 +
        ', AIN2 = ' + PINOS.AIN2 + ';   /* motor esquerdo */',
      'const int PWMB = ' + PINOS.PWMB + ', BIN1 = ' + PINOS.BIN1 +
        ', BIN2 = ' + PINOS.BIN2 + ';   /* motor direito  */',
      'const int STBY = ' + PINOS.STBY + ';'
    ];
    if (uso.sensor) {
      fora.push('const int TRIG = ' + PINOS.TRIG + ', ECHO = ' + PINOS.ECHO +
                ';               /* sensor de distância */');
    }
    fora.push('');
    return fora;
  }

  function fiacao(uso) {
    var fora = [
      'void fiacao() {',
      '  pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT);',
      '  pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);',
      '  pinMode(STBY, OUTPUT); digitalWrite(STBY, HIGH);'
    ];
    if (uso.sensor) {
      fora.push('  pinMode(TRIG, OUTPUT); digitalWrite(TRIG, LOW);');
      fora.push('  pinMode(ECHO, INPUT);');
    }
    fora.push('}');
    fora.push('');
    return fora;
  }

  var MOTORES = [
    '/* Velocidade de -255 a 255. Negativo é para trás.',
    '',
    '   O robô chia um pouco: o analogWrite liga e desliga o motor umas mil',
    '   vezes por segundo, e isso o ouvido escuta. O programa de blocos usa',
    '   vinte mil vezes, rápido demais para ouvir. */',
    'void motores(int esq, int dir) {',
    '  digitalWrite(AIN1, esq >= 0 ? HIGH : LOW);',
    '  digitalWrite(AIN2, esq >= 0 ? LOW : HIGH);',
    '  analogWrite(PWMA, abs(esq));',
    '  digitalWrite(BIN1, dir >= 0 ? HIGH : LOW);',
    '  digitalWrite(BIN2, dir >= 0 ? LOW : HIGH);',
    '  analogWrite(PWMB, abs(dir));',
    '}',
    '',
    'void parar() { motores(0, 0); }',
    ''
  ];

  var ANDAR_FRENTE = [
    'void andarFrente(float segundos, int velocidade) {',
    '  motores(velocidade, velocidade);',
    '  delay(segundos * 1000);',
    '  parar();',
    '}',
    ''
  ];

  var ANDAR_TRAS = [
    'void andarTras(float segundos, int velocidade) {',
    '  motores(-velocidade, -velocidade);',
    '  delay(segundos * 1000);',
    '  parar();',
    '}',
    ''
  ];

  var GIRAR = [
    '/* Gira no lugar: um motor para frente, o outro para trás. ' +
      MS_POR_GRAU + ' ms por grau,',
    '   a ' + VEL_GIRO + ' de velocidade — a mesma conta que o robô de blocos usa. */',
    'void girar(int graus) {',
    '  int v = graus >= 0 ? ' + VEL_GIRO + ' : -' + VEL_GIRO + ';',
    '  motores(v, -v);',
    '  delay(abs(graus) * ' + MS_POR_GRAU + ');',
    '  parar();',
    '}',
    ''
  ];

  var ESPERAR = [
    'void esperar(float segundos) {',
    '  delay(segundos * 1000);',
    '}',
    ''
  ];

  var FIM = [
    'void setup() {',
    '  fiacao();',
    '  delay(' + ESPERA_MS + ');        /* tempo de pôr o robô no chão e tirar a mão */',
    '  programa();',
    '  parar();',
    '}',
    '',
    'void loop() {',
    '}'
  ];

  /* A ordem é de uso: cada função aparece antes de quem a chama. O Arduino IDE
     gera protótipos sozinho e perdoaria qualquer ordem; o g++ do teste não
     perdoa — e o arquivo que compila nos dois é o que se lê de cima para
     baixo. */
  function gerar(ast) {
    var nos = ast || [];
    var uso = usoDe(nos);
    var corpo = [];
    var linhas = [];

    gerarNos(nos, 1, 0, corpo);

    linhas = linhas.concat(CABECALHO, pinos(uso), fiacao(uso), MOTORES);
    if (uso.frente) linhas = linhas.concat(ANDAR_FRENTE);
    if (uso.tras) linhas = linhas.concat(ANDAR_TRAS);
    if (uso.girar) linhas = linhas.concat(GIRAR);
    if (uso.esperar) linhas = linhas.concat(ESPERAR);
    linhas.push('void programa() {');
    linhas = linhas.concat(corpo);
    linhas.push('}');
    linhas.push('');
    linhas = linhas.concat(FIM);

    return linhas.join('\n') + '\n';
  }

  var api = { gerar: gerar, VEL_GIRO: VEL_GIRO, MS_POR_GRAU: MS_POR_GRAU,
              PINOS: PINOS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Arduino = api;
})(typeof self !== 'undefined' ? self : globalThis);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/arduino.test.js`
Expected: PASS, 13 testes.

- [ ] **Step 5: Conferir o ES5**

Run: `node --test tests/es5.test.js`
Expected: PASS. Ele varre `web/*.js` e pega o `arduino.js` sozinho.

- [ ] **Step 6: Commit**

```bash
git add web/arduino.js tests/arduino.test.js
git commit -m "Traduz os blocos de movimento para código Arduino"
```

---

## Task 2: os blocos de controle e o sensor

**Files:**
- Modify: `web/arduino.js` (a função `usoDe` e o `switch` de `gerarNos`)
- Test: `tests/arduino.test.js`

**Interfaces:**
- Consumes: `gerar(ast)`, `usoDe`, `gerarNos`, `nomeLaco`, `inteiro`, `recuo` — todos da Task 1.
- Produces: nada novo na API. `gerar` passa a aceitar `repetir`, `repetir_sempre`, `repetir_ate_perto`, `se_obstaculo`, `se_senao` e `parar`, e a emitir `int distanciaCm()` quando algum bloco de sensor aparece.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao fim de `tests/arduino.test.js`:

```javascript
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/arduino.test.js`
Expected: FAIL, onze testes novos, com `Bloco desconhecido: repetir`.

- [ ] **Step 3: Fazer a varredura de uso descer pelos dois ramos**

Em `web/arduino.js`, substitua o corpo de `usoDe` por:

```javascript
  function usoDe(nos, uso) {
    var i, no;
    uso = uso || {};
    for (i = 0; i < nos.length; i++) {
      no = nos[i];
      if (no.op === 'frente') uso.frente = true;
      if (no.op === 'tras') uso.tras = true;
      if (no.op === 'girar') uso.girar = true;
      if (no.op === 'esperar') uso.esperar = true;
      if (no.op === 'se_obstaculo' || no.op === 'se_senao' ||
          no.op === 'repetir_ate_perto') {
        uso.sensor = true;
      }
      /* Os três ramos possíveis. O "senão" não se chama "corpo", e esquecê-lo
         geraria um arquivo sem a função que o próprio arquivo chama. */
      if (no.corpo) usoDe(no.corpo, uso);
      if (no.entao) usoDe(no.entao, uso);
      if (no.senao) usoDe(no.senao, uso);
    }
    return uso;
  }
```

- [ ] **Step 4: Acrescentar os seis casos ao `switch`**

Em `gerarNos`, antes do `default:`:

```javascript
        case 'parar':
          linhas.push(r + 'parar();');
          linhas.push(r + 'return;');
          break;
        case 'repetir': {
          /* Zero viraria um laço que nunca roda; o compilador força 1 pela
             mesma razão. */
          var v = nomeLaco(profundidade);
          var vezes = Math.max(1, inteiro(no.vezes, 1));
          linhas.push(r + 'for (int ' + v + ' = 0; ' + v + ' < ' + vezes +
                      '; ' + v + '++) {');
          gerarNos(no.corpo || [], nivel + 1, profundidade + 1, linhas);
          linhas.push(r + '}');
          break;
        }
        case 'repetir_sempre':
          linhas.push(r + 'while (true) {');
          gerarNos(no.corpo || [], nivel + 1, profundidade, linhas);
          linhas.push(r + '}');
          break;
        case 'repetir_ate_perto':
          /* Testa antes de rodar: o bloco diz "até chegar", não "pelo menos
             uma vez". Mesma escolha do compilador. */
          linhas.push(r + 'while (distanciaCm() >= ' + inteiro(no.cm, 20) + ') {');
          gerarNos(no.corpo || [], nivel + 1, profundidade, linhas);
          linhas.push(r + '}');
          break;
        case 'se_obstaculo':
          linhas.push(r + 'if (distanciaCm() < ' + inteiro(no.cm, 20) + ') {');
          gerarNos(no.corpo || [], nivel + 1, profundidade, linhas);
          linhas.push(r + '}');
          break;
        case 'se_senao':
          linhas.push(r + 'if (distanciaCm() < ' + inteiro(no.cm, 20) + ') {');
          gerarNos(no.entao || [], nivel + 1, profundidade, linhas);
          linhas.push(r + '} else {');
          gerarNos(no.senao || [], nivel + 1, profundidade, linhas);
          linhas.push(r + '}');
          break;
```

Só o `repetir` incrementa `profundidade`: ele é o único que declara variável, e gastar um nome nos outros faria o segundo `repetir` de um programa começar em `j` sem motivo.

- [ ] **Step 5: Acrescentar a função do sensor**

Depois de `ESPERAR`, no mesmo lugar dos outros blocos de texto:

```javascript
  var SENSOR = [
    'int distanciaCm() {',
    '  digitalWrite(TRIG, LOW);  delayMicroseconds(2);',
    '  digitalWrite(TRIG, HIGH); delayMicroseconds(10);',
    '  digitalWrite(TRIG, LOW);',
    '  unsigned long us = pulseIn(ECHO, HIGH, 25000UL);',
    '  if (us == 0) return 400;              /* não voltou eco: nada por perto */',
    '  int cm = us / 58;',
    '  if (cm < 2) cm = 2;',
    '  if (cm > 400) cm = 400;',
    '  return cm;',
    '}',
    ''
  ];
```

E em `gerar`, logo depois da linha do `ESPERAR`:

```javascript
    if (uso.sensor) linhas = linhas.concat(SENSOR);
```

- [ ] **Step 6: Rodar e ver passar**

Run: `node --test tests/arduino.test.js`
Expected: PASS, 24 testes.

- [ ] **Step 7: Commit**

```bash
git add web/arduino.js tests/arduino.test.js
git commit -m "Traduz os blocos de controle e o sensor para código Arduino"
```

---

## Task 3: as duas guardas — constantes e compilação de verdade

Sem elas o gerador está correto hoje e em silêncio amanhã: a calibração muda num arquivo C, ou uma vírgula se perde no texto emitido, e ninguém descobre até a criança estar na frente do Arduino IDE.

**Files:**
- Create: `tests/fake_arduino.h`
- Modify: `tests/arduino.test.js`
- Read-only: `core/vm.h`, `firmware/src/hal_esp32.cpp`

**Interfaces:**
- Consumes: `Arduino.gerar`, `Arduino.PINOS`, `Arduino.VEL_GIRO`, `Arduino.MS_POR_GRAU` (Task 1); `node:child_process`, `node:fs`, `node:os`, `node:path`.
- Produces: nada consumido por outra tarefa.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/arduino.test.js`, troque a linha
`const { gerar } = require('../web/arduino.js');` por este bloco:

```javascript
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { gerar, PINOS, VEL_GIRO, MS_POR_GRAU } = require('../web/arduino.js');

const RAIZ = path.join(__dirname, '..');
```

E acrescente ao fim do arquivo:

```javascript
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/arduino.test.js`
Expected: FAIL nos dois testes de compilação, com `fake_arduino.h: No such file or directory`. As duas guardas de constantes já devem passar — se alguma falhar, os números do `web/arduino.js` estão errados e é isso que se conserta.

- [ ] **Step 3: Escrever o `tests/fake_arduino.h`**

```c
/* O bastante para o g++ conferir a sintaxe de um sketch gerado. Não simula
   nada e não roda nada: só existe para o compilador ter o que resolver, do
   mesmo jeito que o fake_hal.c deixa a VM ser testada sem hardware.

   Se o gerador passar a emitir uma função do Arduino que não esteja aqui, o
   teste falha — e é para falhar mesmo: cada função nova merece uma linha
   nova. */
#ifndef FAKE_ARDUINO_H
#define FAKE_ARDUINO_H

#include <stdlib.h>   /* abs */

#define OUTPUT 1
#define INPUT  0
#define HIGH   1
#define LOW    0

inline void pinMode(int, int) {}
inline void digitalWrite(int, int) {}
inline void analogWrite(int, int) {}
inline void delay(unsigned long) {}
inline void delayMicroseconds(unsigned long) {}
inline unsigned long pulseIn(int, int, unsigned long) { return 0; }

#endif
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/arduino.test.js`
Expected: PASS, 28 testes.

- [ ] **Step 5: Provar que a guarda guarda**

Não basta o teste passar; ele tem que **falhar** quando deve. Mude à mão o `VEL_GIRO` em `web/arduino.js` de `180` para `181`, rode `node --test tests/arduino.test.js`, confirme que `a calibração do giro é a mesma da VM` falha, e desfaça a mudança.

Faça o mesmo com uma chave: apague o `'}'` final do bloco `SENSOR` e confirme que `o sketch gerado compila` falha. Desfaça.

Run: `node --test tests/arduino.test.js`
Expected: PASS, 28 testes, com o arquivo de volta ao original. Confira com `git diff web/arduino.js` que não sobrou nada.

- [ ] **Step 6: Commit**

```bash
git add tests/fake_arduino.h tests/arduino.test.js
git commit -m "Guarda as constantes copiadas e compila o sketch gerado no teste"
```

---

## Task 4: o botão, o painel e o download

**Files:**
- Modify: `web/index.html` (CSS por volta da linha 108, `<button>` no cabeçalho por volta da 271, marcação do painel depois do `#confirma` na 302, `<script>` na 331)
- Modify: `web/app.js` (elementos no topo, fiação no fim, `aplicarTroca` na 432, `keydown` na 482)
- Test: `tests/navegador.test.js`

**Interfaces:**
- Consumes: `Arduino.gerar` (Task 1 e 2), `Blocos.workspaceParaAst`, `Niveis.atual`, as variáveis `nivel` e `workspace` do `app.js`.
- Produces: no `app.js`, a função `atualizarBotaoCodigo()`, chamada na partida e dentro de `aplicarTroca`.

- [ ] **Step 1: Escrever as asserções que falham**

Em `tests/navegador.test.js`, ache o trecho que troca para o Grande com o workspace vazio e termina com a asserção `'a troca sem diálogo não aconteceu'`. Logo **depois** dela, acrescente:

```javascript
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

    /* Esc fecha, como no diálogo de troca de nível — e o de troca continua
       funcionando, que é o que o mesmo handler poderia ter quebrado. */
    await aval(`(() => {
      document.getElementById('codigo-fechar').click();
      return 1;
    })()`);
    await espera(200);
    assert.strictEqual(
      await aval(`document.getElementById('painel-codigo').hidden`),
      true, 'o painel de código não fechou');
```

E logo depois do trecho que volta para o Médio e remonta o programa (a asserção `'no Médio o número deveria aparecer'`), acrescente:

```javascript
    assert.strictEqual(await aval(`document.getElementById('codigo').hidden`),
      true, 'fora do Grande o botão de ver código deveria sumir');
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/navegador.test.js`
Expected: FAIL, com `Cannot read properties of null (reading 'hidden')` — o botão ainda não existe.

- [ ] **Step 3: Marcação no `web/index.html`**

O `<script>`, junto dos outros, antes do `app.js`:

```html
  <script src="arduino.js"></script>
```

O botão, no cabeçalho, logo depois do `</div>` que fecha o `#niveis`:

```html
    <button id="codigo" type="button" hidden>{ } ver código</button>
```

O painel, logo depois do `</div>` que fecha o `#confirma`:

```html
  <div id="painel-codigo" hidden>
    <div id="codigo-caixa" role="dialog" aria-modal="true"
         aria-labelledby="codigo-titulo">
      <h2 id="codigo-titulo">robo.ino</h2>
      <pre id="codigo-texto"></pre>
      <div id="codigo-botoes">
        <button id="codigo-baixar" type="button">baixar</button>
        <button id="codigo-fechar" type="button">fechar</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 4: CSS do botão e do painel**

Depois do bloco do `#confirma`, no `<style>`:

```css
  /* ---------- painel do código ---------- */

  /* Navy como o 🔊 e o "Não" do diálogo: é botão de adulto curioso, não o
     PLAY. As chaves no rótulo dizem "código" antes de a palavra ser lida. */
  #codigo { background: #002080; box-shadow: 0 5px 0 #00185f;
            font-size: 16px; padding: 12px 16px; }
  #codigo:active:not(:disabled) { box-shadow: 0 1px 0 rgba(0,0,0,.25); }
  #codigo[hidden] { display: none; }

  #painel-codigo {
    position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 200;
    background: rgba(0, 32, 128, .55);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  }
  /* Obrigatório, mesmo motivo do #confirma: o display:flex acima vence o
     [hidden] do navegador, e sem esta linha o painel nasce visível. */
  #painel-codigo[hidden] { display: none; }

  #codigo-caixa {
    background: #fff; border-radius: 22px; padding: 22px 24px;
    max-width: 680px; width: 100%; box-sizing: border-box;
    box-shadow: 0 10px 0 rgba(0, 32, 128, .25);
  }
  #codigo-titulo { margin: 0 0 12px; font-size: 20px; font-weight: 800;
                   color: #002080; font-family: monospace; }
  /* A rolagem é do <pre>, não da página: o código é largo e comprido, e a
     página inteira rolando levaria os botões para fora da tela. */
  #codigo-texto {
    margin: 0 0 18px; padding: 14px; background: #f2f5fb;
    border-radius: 12px; max-height: 55vh; overflow: auto;
    font-family: monospace; font-size: 13px; line-height: 1.45;
    color: #002080; text-align: left; white-space: pre;
  }
  #codigo-botoes { display: flex; justify-content: center; }
  #codigo-botoes button { margin: 0 8px; }
  #codigo-baixar { background: #f0c000; color: #002080;
                   box-shadow: 0 5px 0 #c49d00; }
  #codigo-fechar { background: #002080; box-shadow: 0 5px 0 #00185f; }
```

- [ ] **Step 5: Fiação no `web/app.js`**

Junto dos outros `getElementById` do topo do arquivo:

```javascript
  var btCodigo = document.getElementById('codigo');
  var caixaCodigo = document.getElementById('painel-codigo');
  var preCodigo = document.getElementById('codigo-texto');
  var btCodigoBaixar = document.getElementById('codigo-baixar');
  var btCodigoFechar = document.getElementById('codigo-fechar');
```

Logo depois da função `marcarNivel`, acrescente:

```javascript
  /* Só o Grande. É o degrau seguinte ao teto dos blocos — nos outros níveis
     seria mais uma escolha na tela de quem ainda está aprendendo a ler, e o
     código mostraria números que aqueles níveis escondem de propósito. */
  function atualizarBotaoCodigo() {
    btCodigo.hidden = nivel !== 'grande';
  }
```

Na partida, logo depois do `marcarNivel();` que já existe por volta da linha 42, acrescente `atualizarBotaoCodigo();`. Dentro de `aplicarTroca`, logo depois do `marcarNivel();` de lá, acrescente a mesma chamada.

E no fim do arquivo, antes do `conectar();`:

```javascript
  /* O download precisa de Blob e do atributo download, e o Safari do iOS 9 não
     tem nenhum dos dois. Botão que não faz nada ensina a criança a desconfiar
     da tela: no tablet velho ele não nasce, e sobra o texto para selecionar. */
  var podeBaixar = typeof Blob !== 'undefined' &&
    'download' in document.createElement('a');
  if (!podeBaixar && btCodigoBaixar.parentNode) {
    btCodigoBaixar.parentNode.removeChild(btCodigoBaixar);
  }

  function fecharCodigo() { caixaCodigo.hidden = true; }

  /* Não depende do robô, diferente do PLAY: gerar código é operação de papel, e
     ela pode olhar com a placa desligada. */
  btCodigo.addEventListener('click', function () {
    try {
      preCodigo.textContent = Arduino.gerar(Blocos.workspaceParaAst(workspace));
    } catch (e) {
      preCodigo.textContent = e.message;
    }
    caixaCodigo.hidden = false;
    btCodigoFechar.focus();
  });

  btCodigoFechar.addEventListener('click', fecharCodigo);
  caixaCodigo.addEventListener('click', function (e) {
    if (e.target === caixaCodigo) fecharCodigo();
  });

  if (podeBaixar) {
    btCodigoBaixar.addEventListener('click', function () {
      var blob = new Blob([preCodigo.textContent], { type: 'text/plain' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'robo.ino';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      /* Revogar na hora cancelaria o download que acabou de começar. */
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  }
```

Por fim, o `keydown` que hoje só conhece o diálogo de confirmação (por volta da linha 482) passa a atender os dois:

```javascript
  /* keyCode além de key: o Safari do iOS 9 não tem event.key confiável. */
  document.addEventListener('keydown', function (e) {
    if (!(e.key === 'Escape' || e.keyCode === 27)) return;
    if (!caixaConfirma.hidden) fecharConfirma();
    else if (!caixaCodigo.hidden) fecharCodigo();
  });
```

- [ ] **Step 6: Rodar o teste do navegador**

Run: `node --test tests/navegador.test.js`
Expected: PASS. Leva ~1 min.

- [ ] **Step 7: Conferir o ES5 e a bateria rápida**

Run: `node --test $(ls tests/*.test.js | grep -v gabaritos.test.js | grep -v navegador.test.js)`
Expected: PASS. O `es5.test.js` é o que pega uma arrow function esquecida no `app.js`.

- [ ] **Step 8: Commit**

```bash
git add web/index.html web/app.js tests/navegador.test.js
git commit -m "Mostra o código Arduino do programa no nível Grande"
```

---

## Task 5: README, bateria inteira e os arquivos da placa

**Files:**
- Modify: `README.md`
- Regenerate: `firmware/data/` (gitignore, não entra em commit)

**Interfaces:**
- Consumes: tudo das tarefas anteriores.
- Produces: nada.

- [ ] **Step 1: A saída `.ino` na seção dos níveis**

Em `README.md`, na seção `## Os blocos e os níveis`, depois do parágrafo que começa com "Isso vale para um valor herdado de um nível acima", acrescente:

```markdown
No Grande aparece mais um botão: **`{ } ver código`**. Ele mostra o programa
montado escrito em C++, pronto para gravar num Arduino — o degrau seguinte ao
teto dos blocos. O arquivo roda o programa uma vez ao ligar, depois de três
segundos de espera, porque na placa não existe botão PLAY: quem virou PLAY foi
o RESET.
```

- [ ] **Step 2: A tabela bloco → C++**

Logo depois da seção `### Como cada bloco vira bytecode` e antes do `---` que a fecha, acrescente:

```markdown
### Como cada bloco vira C++

| bloco                        | C++                                        |
|------------------------------|--------------------------------------------|
| `andar frente [n] s [v]`     | `andarFrente(n, v);`                       |
| `andar trás [n] s [v]`       | `andarTras(n, v);`                         |
| `girar [g] graus`            | `girar(g);`                                |
| `esperar [n] s`              | `esperar(n);`                              |
| `repetir [n] vezes { c }`    | `for (int i = 0; i < n; i++) { c }`        |
| `se obstáculo < [n] cm { c }`| `if (distanciaCm() < n) { c }`             |
| `parar tudo`                 | `parar(); return;`                         |
| `repetir para sempre { c }`  | `while (true) { c }`                       |
| `se…senão < [n] cm`          | `if (…) { … } else { … }`                  |
| `repetir até < [n] cm { c }` | `while (distanciaCm() >= n) { c }`         |

O arquivo carrega só as funções que o programa usa: um programa que não sente
nada não leva o HC-SR04 junto. E o `.ino` não herda os limites da VM — 256
instruções e quatro `repetir` aninhados são restrições dos 7 bytes e dos quatro
registradores, não do C++.
```

- [ ] **Step 3: O teste novo na seção de testes**

Na seção `## Testes`, depois do parágrafo sobre o `gabaritos.test.js`, acrescente:

```markdown
O `tests/arduino.test.js` faz uma coisa que os outros não fazem: ele **compila**
o C++ que gerou. Um `g++ -fsyntax-only` contra um `fake_arduino.h` de stubs pega
chave não fechada e função com aridade errada em milissegundos — defeitos que de
outro modo só apareceriam com a criança na frente do Arduino IDE. Pula sozinho
se não houver `g++`.
```

- [ ] **Step 4: Bateria inteira**

```bash
node --test tests/
make -C tests test
bash tests/host_test.sh
```

Expected: as três verdes. A primeira leva ~5 min.

- [ ] **Step 5: Regravar os arquivos servidos pela placa**

```bash
./firmware/preparar_data.sh
```

Confere que `firmware/data/arduino.js.gz` existe. Não entra em commit: `firmware/data/` é gitignore.

- [ ] **Step 6: Conferir que o firmware ainda compila**

```bash
cd firmware && pio run && cd ..
```

Expected: SUCCESS. Nada em `firmware/src/` foi tocado, então é só uma confirmação — mas o arquivo novo no LittleFS mexe no tamanho da imagem de dados.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "Descreve a saída .ino no README"
```

---

## Verificação final

- [ ] `node --test tests/` — verde, incluindo `arduino.test.js`, `navegador.test.js` e `gabaritos.test.js`
- [ ] `make -C tests test` — verde
- [ ] `bash tests/host_test.sh` — verde
- [ ] `node --test tests/es5.test.js` — verde, com o `web/arduino.js` na varredura
- [ ] `cd firmware && pio run` — SUCCESS
- [ ] `git status` — limpo
- [ ] `git diff <commit-da-spec>..HEAD --stat` não mostra nenhum arquivo em `core/`, `host/` ou `firmware/src/`
- [ ] Na tela, no nível Grande: montar um programa com laço e sensor, apertar `{ } ver código`, e conferir a olho que o texto tem cabeçalho, pinos, as funções usadas e nenhuma que não seja usada
- [ ] Baixar o `robo.ino`, abrir no Arduino IDE e confirmar que ele compila para a placa ESP32 de verdade — é a única prova que os testes não dão
