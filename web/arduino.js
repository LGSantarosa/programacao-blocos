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

  /* Um valor vira texto. Parênteses em toda subexpressão composta: depender da
     precedência do C++ para o código sair certo é apostar que a criança entende
     precedência antes de entender conta. */
  var SIMBOLO = {
    mais: '+', menos: '-', vezes: '*', dividir: '/',
    menor: '<', maior: '>', igual: '==', e: '&&', ou: '||'
  };

  function valor(v) {
    if (v === null || v === undefined) return '0';
    if (typeof v === 'number') return String(v);
    if (v.op === 'distancia') return 'distanciaCm()';
    if (v.op === 'nao') return '!(' + valor(v.a) + ')';
    if (v.op === 'aleatorio') {
      return 'aleatorio(' + valor(v.a) + ', ' + valor(v.b) + ')';
    }
    var s = SIMBOLO[v.op];
    if (!s) throw new Error('Conta desconhecida: ' + v.op);
    return parte(v.a) + ' ' + s + ' ' + parte(v.b);
  }

  /* Número e chamada não precisam de parênteses; conta precisa. */
  function parte(v) {
    if (v === null || v === undefined || typeof v === 'number') return valor(v);
    if (v.op === 'distancia' || v.op === 'nao' || v.op === 'aleatorio') {
      return valor(v);
    }
    return '(' + valor(v) + ')';
  }

  function ehNumero(v) {
    return v === null || v === undefined || typeof v === 'number';
  }

  /* Número continua saindo com uma casa, que é a precisão do campo. Conta sai
     como expressão, e aí a casa decimal não faz sentido. */
  function segOuConta(v) {
    return ehNumero(v) ? seg(v) : valor(v);
  }

  function inteiroOuConta(v, padrao) {
    return ehNumero(v) ? String(inteiro(v, padrao)) : valor(v);
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
  /* O sensor e o aleatório podem estar escondidos dentro de uma conta, e a
     varredura tem que alcançá-los — senão o arquivo chama uma função que ele
     não define. */
  function usoDeValor(v, uso) {
    if (!v || typeof v === 'number') return;
    if (v.op === 'distancia') uso.sensor = true;
    if (v.op === 'aleatorio') uso.aleatorio = true;
    usoDeValor(v.a, uso);
    usoDeValor(v.b, uso);
  }

  function usoDe(nos, uso) {
    var i, no;
    uso = uso || {};
    for (i = 0; i < nos.length; i++) {
      no = nos[i];
      usoDeValor(no.segundos, uso);
      usoDeValor(no.graus, uso);
      usoDeValor(no.vezes, uso);
      usoDeValor(no.cm, uso);
      usoDeValor(no.cond, uso);
      if (no.op === 'frente') uso.frente = true;
      if (no.op === 'tras') uso.tras = true;
      if (no.op === 'girar') uso.girar = true;
      if (no.op === 'esperar') uso.esperar = true;
      if (no.op === 'se_obstaculo' || no.op === 'se_senao' ||
          no.op === 'repetir_ate_perto') {
        uso.sensor = true;
      }
      if (no.op === 'se' || no.op === 'se_entao_senao' ||
          no.op === 'repetir_ate') {
        /* A condição já foi varrida acima; aqui não se assume sensor, porque
           "se (voltas > 3)" não olha para o mundo. */
        uso.temControle = true;
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
          linhas.push(r + 'andarFrente(' + segOuConta(no.segundos) + ', ' +
                      velocidadeDe(no) + ');');
          break;
        case 'tras':
          linhas.push(r + 'andarTras(' + segOuConta(no.segundos) + ', ' +
                      velocidadeDe(no) + ');');
          break;
        case 'girar':
          linhas.push(r + 'girar(' + inteiroOuConta(no.graus, 0) + ');');
          break;
        case 'esperar':
          linhas.push(r + 'esperar(' + segOuConta(no.segundos) + ');');
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
          var vezes = ehNumero(no.vezes)
            ? Math.max(1, inteiro(no.vezes, 1)) : valor(no.vezes);
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
          linhas.push(r + 'while (distanciaCm() >= ' + inteiroOuConta(no.cm, 20) + ') {');
          gerarNos(no.corpo || [], nivel + 1, profundidade, linhas);
          linhas.push(r + '}');
          break;
        case 'se_obstaculo':
          linhas.push(r + 'if (distanciaCm() < ' + inteiroOuConta(no.cm, 20) + ') {');
          gerarNos(no.corpo || [], nivel + 1, profundidade, linhas);
          linhas.push(r + '}');
          break;
        case 'se':
          linhas.push(r + 'if (' + valor(no.cond) + ') {');
          gerarNos(no.corpo || [], nivel + 1, profundidade, linhas);
          linhas.push(r + '}');
          break;
        case 'se_entao_senao':
          linhas.push(r + 'if (' + valor(no.cond) + ') {');
          gerarNos(no.entao || [], nivel + 1, profundidade, linhas);
          linhas.push(r + '} else {');
          gerarNos(no.senao || [], nivel + 1, profundidade, linhas);
          linhas.push(r + '}');
          break;
        case 'repetir_ate':
          /* "até" é "enquanto não": o laço roda enquanto a condição é falsa. */
          linhas.push(r + 'while (!(' + valor(no.cond) + ')) {');
          gerarNos(no.corpo || [], nivel + 1, profundidade, linhas);
          linhas.push(r + '}');
          break;
        case 'se_senao':
          linhas.push(r + 'if (distanciaCm() < ' + inteiroOuConta(no.cm, 20) + ') {');
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

  /* O comentário do topo é curto de propósito: quem abre este arquivo veio
     ler o próprio programa, não um manual. Fica só o que ele não tem como
     descobrir sozinho — a pasta que o IDE exige, e que gravar isto apaga a
     tela de blocos. */
  var CABECALHO = [
    '/* Robô de Blocos — o seu programa, virado código Arduino.',
    '   ESP32 dev, motores TB6612FNG, sensor HC-SR04.',
    '',
    '   Salve numa pasta chamada robo/ — o Arduino IDE oferece criar sozinho.',
    '   Gravar isto apaga a tela de blocos da placa; para voltar, grave o',
    '   firmware de novo (pasta firmware/). */',
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
    if (uso.aleatorio) {
      /* Sem semente o Arduino sorteia a mesma sequência a cada ligada, e o
         robô faria sempre a mesma dança "aleatória". */
      fora.push('  randomSeed(micros());');
    }
    fora.push('}');
    fora.push('');
    return fora;
  }

  var MOTORES = [
    '/* Velocidade de -255 a 255. Negativo é para trás.',
    '   O robô chia: o analogWrite liga e desliga o motor mil vezes por',
    '   segundo, e o ouvido escuta. */',
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
    '/* Gira no lugar: um motor para frente, o outro para trás. */',
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

  var ALEATORIO = [
    '/* Sorteia entre os dois, incluindo os dois. */',
    'int aleatorio(int menor, int maior) {',
    '  if (menor > maior) { int t = menor; menor = maior; maior = t; }',
    '  return random(menor, maior + 1);',
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
    if (uso.aleatorio) linhas = linhas.concat(ALEATORIO);
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
