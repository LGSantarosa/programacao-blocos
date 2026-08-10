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

  /* Um labirinto de corredores. Cada parede é um retângulo; a largura livre
     entre elas é 0.36 m, contra os 0.16 m de diâmetro do robô — folga para
     uma criança errar alguns graus no giro e ainda passar. */
  var LABIRINTO = [
    { x0: 0.44, y0: 0.00, x1: 0.60, y1: 1.28 },
    { x0: 0.96, y0: 0.44, x1: 1.12, y1: 2.00 },
    { x0: 1.48, y0: 0.00, x1: 1.64, y1: 1.28 },
    { x0: 0.44, y0: 1.56, x1: 1.12, y1: 1.72 }
  ];

  var INICIO_PADRAO = { x: 1.00, y: 0.40, theta: Math.PI / 2 };
  var INICIO_LABIRINTO = { x: 0.22, y: 0.22, theta: Math.PI / 2 };

  var LISTA = [
    { texto: 'Leve o robô até a estrela', x: 1.00, y: 1.15,
      inicio: INICIO_PADRAO, obstaculos: BLOCO },
    { texto: 'Agora a estrela está do lado', x: 1.60, y: 0.40,
      inicio: INICIO_PADRAO, obstaculos: BLOCO },
    { texto: 'Chegue no cantinho de cima', x: 1.62, y: 1.62,
      inicio: INICIO_PADRAO, obstaculos: BLOCO },
    { texto: 'A estrela está atrás do bloco', x: 1.00, y: 1.82,
      inicio: INICIO_PADRAO, obstaculos: BLOCO },
    { texto: 'Saia do labirinto', x: 1.80, y: 1.80,
      inicio: INICIO_LABIRINTO, obstaculos: LABIRINTO }
  ];

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

  var api = { LISTA: LISTA, RAIO: RAIO, BLOCO: BLOCO, LABIRINTO: LABIRINTO, quantas: quantas, daVez: daVez,
              chegou: chegou, atual: atual, definir: definir, avancar: avancar };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Missoes = api;
})(typeof self !== 'undefined' ? self : globalThis);
