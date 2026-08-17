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
        case 'parar':
          linhas.push(r + 'parar();');
          linhas.push(r + 'return;');
          break;
        case 'repetir': {
          /* Zero viraria um laço que nunca roda; o compilador força 1 pela
             mesma razão. Só o repetir gasta um nome de variável: dar um nome a
             cada laço faria o segundo repetir de um programa começar em "j"
             sem motivo. */
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
    if (uso.sensor) linhas = linhas.concat(SENSOR);
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
