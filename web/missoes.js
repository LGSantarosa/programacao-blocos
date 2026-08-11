/* Missões: leve o robô até a estrela.

   A estrela não existe na física. O navegador já recebe a posição do robô pela
   telemetria e já sabe onde desenhou a estrela, então a chegada se decide aqui
   — sem tocar no core/vm.c, sem byte novo no protocolo, sem mexer na ESP32.

   Consequência assumida: missão é coisa do robô virtual. O robô real não manda
   telemetria, e ninguém sabe onde ele está na sala. Ensaiar é o que o virtual
   faz de melhor. */
(function (raiz) {
  'use strict';

  /* Metros, na arena de 2 x 2. O robô nasce em (1.0, 0.40) apontando para
     cima, e o obstáculo ocupa de (0.80, 1.40) a (1.20, 1.60) — nenhuma estrela
     cai em cima dele nem em cima do robô. */
  /* O bloco do meio, que era a arena única do projeto. */
  var BLOCO = [{ x0: 0.80, y0: 1.40, x1: 1.20, y1: 1.60 }];

  /* Labirinto em S: duas paredes compridas, uma com passagem em cima e outra
     com passagem embaixo. Obriga a planejar um caminho de quatro pernas.

     As passagens têm 60 cm de vão contra os 16 cm de diâmetro do robô. A
     primeira versão tinha quatro paredes e vãos de 28 cm — no papel cabia, na
     prática o robô raspava, porque cada giro erra alguns graus e o erro se
     acumula. Folga generosa não é desperdício aqui, é o que separa desafio de
     loteria. */
  var LABIRINTO = [
    { x0: 0.50, y0: 0.00, x1: 0.66, y1: 1.40 },
    { x0: 1.10, y0: 0.60, x1: 1.26, y1: 2.00 }
  ];

  var INICIO_PADRAO = { x: 1.00, y: 0.40, theta: Math.PI / 2 };
  var INICIO_LABIRINTO = { x: 0.25, y: 0.25, theta: Math.PI / 2 };

  /* A fase da parede não tem obstáculo desenhado: o alvo é a borda da arena,
     que o sensor já enxerga — ponto_bloqueado trata a borda como obstáculo
     (host/physics.c). Arena vazia porque encostar no bloco vindo de baixo é a
     mesma foto da fase 1. */
  var SEM_OBSTACULOS = [];
  var INICIO_PAREDE = { x: 1.00, y: 0.25, theta: Math.PI / 2 };

  /* O gabarito é feito do mesmo passo curto que o nível Pequeno usa: 0,5 s de
     movimento, ~11,7 cm. Assim ele funciona igual nos três níveis, e ensina de
     passagem que mais blocos é mais longe — em vez de esconder a resposta num
     número que a criança de quatro anos não lê.

     Cada passo é { andar: n } ou { girar: graus }. Um "andar" com n > 1 vira um
     bloco repetir; com n = 1 vira um bloco só. */
  var LISTA = [
    { texto: 'Leve o robô até a estrela', x: 1.00, y: 1.15,
      inicio: INICIO_PADRAO, obstaculos: BLOCO,
      gabarito: [{ andar: 6 }] },

    { texto: 'Agora a estrela está do lado', x: 1.60, y: 0.40,
      inicio: INICIO_PADRAO, obstaculos: BLOCO,
      gabarito: [{ girar: 90 }, { andar: 5 }] },

    { texto: 'Chegue no cantinho de cima', x: 1.62, y: 1.62,
      inicio: INICIO_PADRAO, obstaculos: BLOCO,
      gabarito: [{ girar: 90 }, { andar: 5 }, { girar: -90 }, { andar: 10 }] },

    { texto: 'A estrela está atrás do bloco', x: 1.00, y: 1.82,
      inicio: INICIO_PADRAO, obstaculos: BLOCO,
      gabarito: [{ girar: 90 }, { andar: 5 }, { girar: -90 }, { andar: 12 },
                 { girar: -90 }, { andar: 5 }] },

    { texto: 'Saia do labirinto', x: 1.75, y: 1.75,
      inicio: INICIO_LABIRINTO, obstaculos: LABIRINTO,
      gabarito: [{ andar: 12 }, { girar: 90 }, { andar: 5 }, { girar: 90 },
                 { andar: 11 }, { girar: -90 }, { andar: 7 }, { girar: -90 },
                 { andar: 12 }] },

    /* A estrela fica em 1,70 e não colada em 2,00 de propósito: colide limita o
       centro do robô a y <= 1,92, então bater na parede fica a 0,22 da estrela
       e falha, enquanto parar pelo sensor para em ~1,77 e cumpre.

       O passo "ate_perto" guarda as duas leituras do mesmo caminho: a condição,
       para quem tem sensor, e o equivalente em passos cegos, para o Pequeno,
       que não tem. Fonte de verdade única, como as outras trilhas. */
    { texto: 'Chegue bem pertinho da parede', x: 1.00, y: 1.70,
      inicio: INICIO_PAREDE, obstaculos: SEM_OBSTACULOS,
      gabarito: [{ ate_perto: 20, andar: 13 }] }
  ];

  /* Quantos passos em falso antes de oferecer o gabarito. Três é o número que
     separa "ainda tentando" de "travou": duas tentativas ainda é exploração. */
  var TENTATIVAS_ATE_AJUDA = 3;

  /* O passo curto do gabarito, em segundos. Bate com o do nível Pequeno. */
  var PASSO_S = 0.5;

  /* Perto o bastante para valer. Generoso de propósito: o robô real erra
     alguns graus por giro, e o virtual imita esse erro — exigir precisão de
     centímetro transformaria a missão em sorte. */
  var RAIO = 0.16;

  var CHAVE = 'robo_missao';
  /* Guarda em memória sempre, e no localStorage quando dá. O Safari em
     navegação privada tem localStorage mas lança ao gravar — sem o try, a
     página inteira cairia na primeira troca de missão. */
  var emMemoria = 0;

  function ler() {
    try {
      if (typeof localStorage !== 'undefined') {
        var v = parseInt(localStorage.getItem(CHAVE), 10);
        if (isFinite(v)) return v;
      }
    } catch (e) { /* sem acesso: vale a memória */ }
    return emMemoria;
  }

  function gravar(n) {
    emMemoria = n;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(CHAVE, String(n));
    } catch (e) { /* navegação privada: só a memória, e tudo bem */ }
  }

  function quantas() { return LISTA.length; }

  function daVez(i) {
    var n = Math.round(Number(i));
    if (!isFinite(n) || n < 0) n = 0;
    return LISTA[n % LISTA.length];
  }

  /* Distância do centro do robô à estrela. Sem raiz quadrada seria mais
     rápido, mas isto roda 20 vezes por segundo num iPad de 2011 e nem aparece
     no perfil — clareza vale mais. */
  function chegou(pose, missao) {
    if (!pose || !missao) return false;
    var dx = pose.x - missao.x;
    var dy = pose.y - missao.y;
    return Math.sqrt(dx * dx + dy * dy) <= RAIO;
  }

  function atual() {
    var v = ler();
    if (!isFinite(v) || v < 0) v = 0;
    return v % LISTA.length;
  }

  function definir(i) {
    var n = Math.round(Number(i));
    if (!isFinite(n) || n < 0) n = 0;
    n = n % LISTA.length;
    gravar(n);
    return n;
  }

  function avancar() { return definir(atual() + 1); }

  var api = { LISTA: LISTA, RAIO: RAIO, BLOCO: BLOCO, LABIRINTO: LABIRINTO,
              TENTATIVAS_ATE_AJUDA: TENTATIVAS_ATE_AJUDA, PASSO_S: PASSO_S, quantas: quantas, daVez: daVez,
              chegou: chegou, atual: atual, definir: definir, avancar: avancar };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Missoes = api;
})(typeof self !== 'undefined' ? self : globalThis);
