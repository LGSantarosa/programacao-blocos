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
  /* A compensação de partida do chassi. Sem ela o .ino exportado guinaria onde
     o robô anda reto, e a criança concluiria que o código é que está errado. */
  var TRIM_DIR = 6;
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

  /* Tirar acento por tabela, e não por String.prototype.normalize: o Safari do
     iOS 9 não tem, e o tests/es5.test.js o proíbe. */
  var SEM_ACENTO = {
    'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a',
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
    'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
    'ç': 'c', 'ñ': 'n'
  };

  /* O nome que a criança deu vira identificador de C++.

     Sempre com "caixa_" na frente. Guardar só as palavras reservadas não
     fecha: o arquivo declara PWMA e TRIG, chama delay e pinMode, usa HIGH e
     OUTPUT, e o C++ reserva todo nome com "__" ou começado por "_" e
     maiúscula. Uma lista que acompanhasse tudo isso ficaria para trás no
     primeiro bloco novo; o prefixo fecha tudo de uma vez, e ainda diz a quem
     lê que aquilo é a caixa que ela criou. */
  function limparNome(nome, prefixo) {
    var s = String(nome === null || nome === undefined ? '' : nome);
    var fora = '', i, c, baixo, troca;
    for (i = 0; i < s.length; i++) {
      c = s.charAt(i);
      baixo = c.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(SEM_ACENTO, baixo)) {
        troca = SEM_ACENTO[baixo];
        fora += (c === baixo) ? troca : troca.toUpperCase();
      } else {
        fora += c;
      }
    }
    fora = fora.replace(/[^A-Za-z0-9_]/g, '_')
               .replace(/_+/g, '_')
               .replace(/^_+|_+$/g, '');
    return (prefixo || 'caixa_') + (fora || 'caixa');
  }

  /* Nome → identificador, para o gerar() em curso. Refeito a cada gerar(), na
     ordem em que aparecem, para que dois nomes que dão no mesmo virem _2, _3
     sempre na mesma ordem. Caixas e blocos contam colisão separado: o prefixo
     já os separa. */
  var identificadores = {};
  var identificadoresUsados = {};

  function identificadorDe(nome, prefixo) {
    prefixo = prefixo || 'caixa_';
    var chave = prefixo + ' ' + nome;   /* o espaço impede "constructor" e parentes */
    if (Object.prototype.hasOwnProperty.call(identificadores, chave)) {
      return identificadores[chave];
    }
    var base = limparNome(nome, prefixo), ident = base, k = 2;
    while (Object.prototype.hasOwnProperty.call(identificadoresUsados, ident)) {
      ident = base + '_' + k;
      k++;
    }
    identificadores[chave] = ident;
    identificadoresUsados[ident] = prefixo;
    return ident;
  }

  /* As funções dos blocos inventados, em ordem de dependência: uma entra na
     lista depois de todas as que ela usa. Sem ciclo (a tradução já recusou),
     essa ordem sempre existe. Cada nome é visitado uma vez só: a árvore
     compartilha o corpo de uma definição em todos os usos, e visitá-lo em cada
     um refaria a explosão que a tradução evitou. */
  var funcoes = [];
  var funcoesVistas = {};

  /* Dentro de bloco_x(), o return do «parar» só sairia da função, e o robô
     seguiria para o bloco seguinte — onde a VM parou tudo. */
  var emFuncao = false;

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
    /* Arredondado como o compilador arredonda cada PUSH: a VM só conhece
       inteiros, e um .ino que faz conta com 1.5 anda diferente do robô. O
       Math.round e não o round do C++, porque os dois discordam nos
       negativos (-1.5 dá -1 aqui e -2 lá), e quem manda é a VM. O número
       sozinho num campo de segundos não passa por aqui: vai pelo seg(),
       porque ali a VM multiplica por 1000 antes de arredondar. */
    if (typeof v === 'number') return String(Math.round(v));
    if (v.op === 'distancia') return 'distanciaCm()';
    if (v.op === 'caixa') return identificadorDe(v.nome);
    /* Aqui não há substituição: a função é gerada uma vez, com o parâmetro de
       verdade, que é o que faz o arquivo continuar legível. */
    if (v.op === 'entrada') return parametroDe(v.id, v.nome);
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
    if (v.op === 'distancia' || v.op === 'nao' || v.op === 'aleatorio' ||
        v.op === 'caixa' || v.op === 'entrada') {
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
    /* Parâmetro não pede função de apoio nenhuma: quem pede é o argumento, e
       ele é varrido no uso, na tela de quem chamou. */
    if (v.op === 'entrada') return;
    if (v.op === 'distancia') uso.sensor = true;
    if (v.op === 'aleatorio') uso.aleatorio = true;
    if (v.op === 'caixa') identificadorDe(v.nome);
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
      usoDeValor(no.valor, uso);
      if (no.op === 'guardar' || no.op === 'mudar') identificadorDe(no.nome);
      if (no.op === 'mudar') uso.somar = true;
      if (no.op === 'usar') {
        /* Fora da guarda de nome visto: a função é gerada uma vez, mas cada uso
           tem os seus argumentos, e um 🎲 que só apareça no segundo uso também
           precisa do aleatorio() declarado. */
        var ar;
        for (ar = 0; ar < (no.args || []).length; ar++) {
          usoDeValor(no.args[ar].valor, uso);
        }
        var chaveFn = ' ' + String(no.nome).toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(funcoesVistas, chaveFn)) {
          funcoesVistas[chaveFn] = true;
          /* A de dentro primeiro: é o que põe a função usada antes de quem usa.
             E marcando que está dentro de função, para o «parar» de lá pedir
             o fim(). */
          var antes = uso.dentroDeFuncao;
          uso.dentroDeFuncao = true;
          usoDe(no.corpo || [], uso);
          uso.dentroDeFuncao = antes;
          funcoes.push(no);
          identificadorDe(no.nome, 'bloco_');
        }
      }
      if (no.op === 'parar' && uso.dentroDeFuncao) uso.fim = true;
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
      /* O corpo de um «usar» já foi visitado acima, uma vez por nome. Entrar
         nele de novo aqui, a cada uso, refaria a explosão que a árvore
         compartilhada evita. */
      if (no.corpo && no.op !== 'usar') usoDe(no.corpo, uso);
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
          linhas.push(r + (emFuncao ? 'fim();' : 'return;'));
          break;
        case 'usar': {
          /* A recusa não mora aqui: esta função gera também o corpo das funções,
             onde não há quadro e um «entrada» não tem como ser resolvido. Quem
             confere é o conferirArgumentosVivos, sobre a árvore de fora. */
          var partes = [], iA;
          for (iA = 0; iA < (no.args || []).length; iA++) {
            partes.push(valor(no.args[iA].valor));
          }
          linhas.push(r + identificadorDe(no.nome, 'bloco_') +
                      '(' + partes.join(', ') + ');');
          break;
        }
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
        case 'guardar':
          linhas.push(r + identificadorDe(no.nome) + ' = ' + valor(no.valor) + ';');
          break;
        case 'mudar': {
          var caixa = identificadorDe(no.nome);
          linhas.push(r + caixa + ' = somar(' + caixa + ', ' + valor(no.valor) + ');');
          break;
        }
        /* O .ino é um programa só, com um setup() e um loop(): não há pc
           extra para dar a uma segunda pilha. Traduzir o aviso sem ter para
           quem avisar geraria um código que compila e não faz nada — pior que
           recusar. */
        case 'avisar':
          throw new Error(
            'O 📣 avisar só faz sentido com mais de uma pilha rodando ao ' +
            'mesmo tempo, e o código do Arduino roda uma só. Tire os avisos ' +
            'para ver o código.');

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
    '/* Programação Criativa — o seu programa, virado código Arduino.',
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
    '/* Os dois motores não arrancam no mesmo PWM: sem os ' + TRIM_DIR +
      ' pontos a mais',
    '   no direito, o robô sai torto. Parado continua parado. */',
    'int comTrim(int v) {',
    '  if (v == 0) return 0;',
    '  int m = abs(v) + ' + TRIM_DIR + ';',
    '  if (m > 255) m = 255;',
    '  return v > 0 ? m : -m;',
    '}',
    '',
    'void motores(int esq, int dir) {',
    '  dir = comTrim(dir);',
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

  /* A soma direta, "x = x + n", era a mais legível, e foi recusada: estouro de
     inteiro com sinal é comportamento indefinido em C++, e a caixa da VM dá a
     volta. A conversão final para int32_t é definida pela implementação, e
     módulo 2^32 no GCC da ESP32 — que é o compilador do Arduino IDE para
     esta placa. */
  var SOMAR = [
    '/* Soma que dá a volta, como a caixa do robô: passar de 2147483647 volta',
    '   para -2147483648, em vez de fazer o que o C++ quiser. */',
    'int32_t somar(int32_t caixa, int32_t n) {',
    '  return (int32_t)((uint32_t)caixa + (uint32_t)n);',
    '}',
    ''
  ];

  function declaracoes() {
    var fora = [], ident;
    for (ident in identificadoresUsados) {
      if (Object.prototype.hasOwnProperty.call(identificadoresUsados, ident) &&
          identificadoresUsados[ident] === 'caixa_') {
        fora.push('int32_t ' + ident + ' = 0;');
      }
    }
    if (!fora.length) return [];
    return ['/* As caixas que você criou. */'].concat(fora, ['']);
  }

  /* delay e não laço vazio: o delay do ESP32 cede a vez, e um while (true) {}
     seco dispara o watchdog da tarefa e reinicia a placa. */
  var FIM_FN = [
    '/* O robô para aqui, e não volta para quem chamou: é o que o parar faz nos',
    '   blocos. */',
    'void fim() {',
    '  while (true) delay(1000);',
    '}',
    ''
  ];

  function argDoQuadro(quadro, id) {
    for (var k = 0; k < quadro.args.length; k++) {
      if (quadro.args[k].id === id) return quadro.args[k];
    }
    return null;
  }

  /* «Vivo» é o que muda a cada leitura: só o 🎲 e o 👁. Uma conta determinística
     dá sempre o mesmo número, e recusá-la seria um teto inventado.

     O nó «entrada» se resolve no quadro de quem chamou, como no compilador: o
     p_lado de dentro pode valer 30 lá fora, e aí não há mentira nenhuma. */
  function ehVivo(v, quadro) {
    if (!v || typeof v === 'number') return false;
    /* A caixa entra aqui junto do 🎲 e do 👁: ela muda entre leituras, ainda
       mais com um «mudar» no meio do corpo. A VM relê a caixa a cada leitura da
       entrada; o .ino guarda o valor da primeira. */
    if (v.op === 'aleatorio' || v.op === 'distancia' || v.op === 'caixa') return true;
    if (v.op === 'entrada') {
      var arg = quadro && argDoQuadro(quadro, v.id);
      /* Sem quadro não há o que afirmar. Quem sabe é o uso de fora, e é lá que
         a conferência acontece. */
      if (!arg) return false;
      return ehVivo(arg.valor, arg.origem);
    }
    return ehVivo(v.a, quadro) || ehVivo(v.b, quadro);
  }

  /* Laços: uma leitura só, escrita uma vez na árvore, é executada muitas vezes.
     Contar ocorrências deixava passar «quadrado(🎲) { repetir 4 { girar(lado) } }»,
     que a VM sorteia quatro vezes e o .ino uma. */
  var LACOS = { repetir: 1, repetir_sempre: 1, repetir_ate: 1,
                repetir_ate_perto: 1 };

  /* Memoriza por (corpo, id, dentro-de-laço). Sem isto, descer nos corpos
     aninhados para contar a entrada passada adiante dobra por nível com
     fan-out 2 — a mesma explosão que a árvore compartilhada existe para evitar,
     e que já foi medida aqui (20 níveis em 1066 ms contra 1 ms). */
  function lidaComMemo(corpo, id, emLaco, memo) {
    var k = memo.corpos.indexOf(corpo);
    if (k < 0) { k = memo.corpos.length; memo.corpos.push(corpo); }
    var chave = k + '|' + id + '|' + (emLaco ? 1 : 0);
    if (Object.prototype.hasOwnProperty.call(memo.valores, chave)) {
      return memo.valores[chave];
    }
    /* Zero antes de descer corta ciclo; a tradução já os recusa antes daqui. */
    memo.valores[chave] = 0;
    memo.valores[chave] = lidaQuantasVezes(corpo, id, emLaco, memo);
    return memo.valores[chave];
  }

  function lidaQuantasVezes(nos, id, emLaco, memo) {
    memo = memo || { corpos: [], valores: {} };
    var n = 0, i, no, dentro, peso, args, a, quantas;

    function emValor(v, p) {
      if (!v || typeof v === 'number') return;
      if (v.op === 'entrada') { if (v.id === id) n += p; return; }
      emValor(v.a, p);
      emValor(v.b, p);
    }

    /* Só conta ocorrências; quem multiplica pelas leituras de lá é o laço
       abaixo. */
    function ocorrencias(v) {
      if (!v || typeof v === 'number') return 0;
      if (v.op === 'entrada') return v.id === id ? 1 : 0;
      return ocorrencias(v.a) + ocorrencias(v.b);
    }

    for (i = 0; i < nos.length; i++) {
      no = nos[i];
      /* Calculado ANTES de varrer os valores: a condição de um «repetir até» é
         reavaliada a cada volta, então ela pesa como o corpo do laço e não como
         uma linha solta. Era isto que deixava passar o dado lido só na
         condição. */
      dentro = emLaco || !!LACOS[no.op];
      peso = emLaco ? 2 : 1;
      emValor(no.segundos, peso); emValor(no.graus, peso);
      emValor(no.vezes, peso); emValor(no.cm, peso);
      emValor(no.valor, peso);
      emValor(no.cond, dentro ? 2 : 1);

      if (no.op === 'usar') {
        /* Os argumentos de um uso de dentro são da tela de quem chama, então a
           nossa entrada pode estar ali. E cada ocorrência é avaliada uma vez
           por leitura que o bloco de destino faz do parâmetro que a recebe:
           passar `n` a um bloco que o lê duas vezes são duas avaliações, e
           passar a um que nunca o lê é nenhuma. O corpo de lá não é varrido
           atrás da NOSSA entrada — lá as entradas são outras. */
        args = no.args || [];
        for (a = 0; a < args.length; a++) {
          quantas = ocorrencias(args[a].valor);
          if (!quantas) continue;
          n += quantas * peso *
               lidaComMemo(no.corpo || [], args[a].id, dentro, memo);
        }
      } else if (no.corpo) {
        n += lidaComMemo(no.corpo, id, dentro, memo);
      }
      if (no.entao) n += lidaComMemo(no.entao, id, dentro, memo);
      if (no.senao) n += lidaComMemo(no.senao, id, dentro, memo);
    }
    return n;
  }

  /* A função do .ino tem parâmetro por valor: o 🎲 do argumento é sorteado uma
     vez e reusado. A VM sorteia a cada leitura. Gerar assim mentiria sobre o
     robô — e o arquivo já recusa o 📣 avisar pelo mesmo motivo.

     Roda sobre a árvore de fora, com cadeia de quadros, e não dentro do
     gerarNos: o corpo de uma função é gerado uma vez e sem quadro. */
  function conferirArgumentosVivos(nos, quadro, semVivoVistos) {
    for (var i = 0; i < nos.length; i++) {
      var no = nos[i];
      if (no.op === 'usar') {
        var args = no.args || [], a, temVivo = false;
        var novo = { args: [] };
        for (a = 0; a < args.length; a++) {
          novo.args.push({ id: args[a].id, valor: args[a].valor, origem: quadro });
          if (ehVivo(args[a].valor, quadro)) temVivo = true;
        }
        for (a = 0; a < args.length; a++) {
          if (!ehVivo(args[a].valor, quadro)) continue;
          if (lidaQuantasVezes(no.corpo || [], args[a].id, false) > 1) {
            throw new Error(
              'O 🎲, o 👁 e a 📦 caixa dão um número que muda entre uma leitura ' +
              'e outra — o robô pode sortear de novo, ou achar outro valor na ' +
              'caixa, a cada vez que lê a entrada. O código do Arduino lê uma ' +
              'vez só. Ponha o número direto para ver o código.');
          }
        }
        /* Memoriza por nome **e pelo padrão de quais argumentos são vivos**.

           Antes o memo era desligado quando havia argumento vivo, e aí cada uso
           recursava no corpo compartilhado: com fan-out 2 isso dobra por nível
           (medido: 20 níveis em 1066 ms, contra 0 ms com argumento constante) —
           a mesma explosão que a árvore compartilhada existe para evitar.

           A chave é sã porque o que se decide lá dentro só depende de quais
           argumentos chegam vivos: a contagem de leituras é do corpo, que é o
           mesmo para todos os usos daquele nome. Com no máximo três entradas,
           são no máximo oito padrões por definição. */
        var vivos = '';
        for (a = 0; a < args.length; a++) {
          vivos += ehVivo(args[a].valor, quadro) ? '1' : '0';
        }
        var chave = ' ' + String(no.nome).toLowerCase() + '|' + vivos;
        if (!Object.prototype.hasOwnProperty.call(semVivoVistos, chave)) {
          semVivoVistos[chave] = true;
          conferirArgumentosVivos(no.corpo || [], novo, semVivoVistos);
        }
      }
      if (no.corpo && no.op !== 'usar') {
        conferirArgumentosVivos(no.corpo, quadro, semVivoVistos);
      }
      if (no.entao) conferirArgumentosVivos(no.entao, quadro, semVivoVistos);
      if (no.senao) conferirArgumentosVivos(no.senao, quadro, semVivoVistos);
    }
  }

  /* Os parâmetros da função que está sendo gerada agora, por id de entrada.

     Por função, e não pelo identificadorDe global: aquele memoriza por nome, e
     duas entradas chamadas «x» na mesma cabeça devolveriam o mesmo «p_x» —
     «void bloco_f(int p_x, int p_x)», que não compila. E não basta o editor
     impedir nomes repetidos: «lado» e «lådo» são nomes diferentes na tela e o
     mesmo p_lado depois do limparNome, que tira acento. Quem garante nome único
     na assinatura é quem escreve a assinatura. */
  var paramsDaFuncao = null;

  function parametroDe(id, nome) {
    if (paramsDaFuncao && Object.prototype.hasOwnProperty.call(paramsDaFuncao, id)) {
      return paramsDaFuncao[id];
    }
    /* Fora de função não há parâmetro; o nome cru serve de última linha. */
    return limparNome(nome, 'p_');
  }

  function nomearParametros(args) {
    var mapa = {}, usados = {}, p, base, ident, n;
    for (p = 0; p < (args || []).length; p++) {
      base = limparNome(args[p].nome, 'p_');
      ident = base;
      n = 2;
      while (Object.prototype.hasOwnProperty.call(usados, ident)) {
        ident = base + '_' + n;
        n++;
      }
      usados[ident] = true;
      mapa[args[p].id] = ident;
    }
    return mapa;
  }

  function gerarFuncoes() {
    var fora = [], k, no, corpo;
    for (k = 0; k < funcoes.length; k++) {
      no = funcoes[k];
      corpo = [];
      /* Nomeados antes de gerar o corpo: é o corpo que lê o mapa pelo valor(). */
      paramsDaFuncao = nomearParametros(no.args || []);
      emFuncao = true;
      gerarNos(no.corpo || [], 1, 0, corpo);
      emFuncao = false;
      var params = [], p;
      for (p = 0; p < (no.args || []).length; p++) {
        params.push('int ' + paramsDaFuncao[no.args[p].id]);
      }
      paramsDaFuncao = null;
      fora.push('void ' + identificadorDe(no.nome, 'bloco_') +
                '(' + params.join(', ') + ') {');
      fora = fora.concat(corpo);
      fora.push('}');
      fora.push('');
    }
    return fora;
  }

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
    identificadores = {};
    identificadoresUsados = {};
    funcoes = [];
    funcoesVistas = {};
    emFuncao = false;
    /* Zerado aqui também, e não só ao fim de cada função: um estouro no meio de
       um corpo (o 📣 avisar faz isso) deixaria o mapa pendurado, e o gerar()
       seguinte começaria sujo — os testes dividem o mesmo módulo. */
    paramsDaFuncao = null;
    var uso = usoDe(nos);
    var corpo = [];
    var linhas = [];

    /* Antes de gerar linha nenhuma: recusar no meio deixaria metade do arquivo
       escrito. Aqui o quadro é nulo porque este é o programa de fora. */
    conferirArgumentosVivos(nos, null, {});

    gerarNos(nos, 1, 0, corpo);

    linhas = linhas.concat(CABECALHO, pinos(uso), declaracoes(), fiacao(uso), MOTORES);
    if (uso.frente) linhas = linhas.concat(ANDAR_FRENTE);
    if (uso.tras) linhas = linhas.concat(ANDAR_TRAS);
    if (uso.girar) linhas = linhas.concat(GIRAR);
    if (uso.esperar) linhas = linhas.concat(ESPERAR);
    if (uso.aleatorio) linhas = linhas.concat(ALEATORIO);
    if (uso.sensor) linhas = linhas.concat(SENSOR);
    if (uso.somar) linhas = linhas.concat(SOMAR);
    if (uso.fim) linhas = linhas.concat(FIM_FN);
    linhas = linhas.concat(gerarFuncoes());
    linhas.push('void programa() {');
    linhas = linhas.concat(corpo);
    linhas.push('}');
    linhas.push('');
    linhas = linhas.concat(FIM);

    return linhas.join('\n') + '\n';
  }

  var api = { gerar: gerar, limparNome: limparNome,
              VEL_GIRO: VEL_GIRO, MS_POR_GRAU: MS_POR_GRAU,
              TRIM_DIR: TRIM_DIR,
              PINOS: PINOS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Arduino = api;
})(typeof self !== 'undefined' ? self : globalThis);
