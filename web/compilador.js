/* Compila a árvore de blocos em bytecode. Roda no navegador e no Node,
   sem depender de Blockly nem do DOM — é o que permite testá-lo.

   Todo valor passa pela pilha da VM: um número vira PUSH, uma conta vira a
   subárvore inteira. Caminho único de propósito — a alternativa era literal
   quando dá e pilha quando precisa, e duas regras por bloco é o dobro de jeitos
   de errar. */
(function (raiz) {
  'use strict';

  var OP = {
    HALT: 0, MOTOR: 1, WAIT: 2, TURN: 3,
    SET_REG: 4, DEC_JNZ: 5, JMP: 6,
    PUSH: 8, SENSOR: 9, BIN: 10, UN: 11, JMP_FALSE: 12, REPORT: 13,
  };

  /* Um opcode com seletor em vez de um por conta: o campo "a" da instrução já
     existe e está sobrando. Precisa bater com core/bytecode.h. */
  var BIN = {
    MAIS: 0, MENOS: 1, VEZES: 2, DIVIDIR: 3,
    MENOR: 4, MAIOR: 5, IGUAL: 6, E: 7, OU: 8, ALEATORIO: 9,
  };

  var UN = { NAO: 0 };

  var BINARIOS = {
    mais: BIN.MAIS, menos: BIN.MENOS, vezes: BIN.VEZES, dividir: BIN.DIVIDIR,
    aleatorio: BIN.ALEATORIO, menor: BIN.MENOR, maior: BIN.MAIOR,
    igual: BIN.IGUAL, e: BIN.E, ou: BIN.OU,
  };

  var VEL_FRENTE = 200;
  var MAX_INSTR = 1024;
  var N_REGS = 4;
  var SENSOR_DISTANCIA = 0;

  /* Precisa bater com PILHA_MAX em core/bytecode.h — é a mesma pilha, e quem
     confere se a conta cabe nela é este arquivo. */
  var PILHA_MAX = 16;

  /* opcoes.reportar, quando vem, é um nó de valor: compila-se a subárvore
     dele e relata-se o resultado, em vez de gerar o programa. É o mesmo
     compilador de propósito — o navegador não calcula nada por conta
     própria, senão passariam a existir duas aritméticas no projeto (o
     int32 da VM e o double do JS) divergindo justamente onde é difícil
     perceber. */
  function compilar(ast, opcoes) {
    var instrucoes = [];
    var profundidade = 0;

    function emitir(op, a, b, c, blockId) {
      instrucoes.push({ op: op, a: a | 0, b: b | 0, c: c | 0,
                        blockId: blockId || null });
    }

    /* O nível Pequeno e o Médio não expõem velocidade; sem ela, vale a
       calibração da v1. Acima de 255 o driver satura, então cortamos aqui. */
    function velocidadeDe(no) {
      var v = Math.round(Number(no.velocidade));
      if (!isFinite(v) || v <= 0) return VEL_FRENTE;
      return v > 255 ? 255 : v;
    }

    /* Segundos viram milissegundos. Se for número, a conta é aqui e sai um
       PUSH só; se for uma conta da criança, multiplica-se em tempo de
       execução. */
    function msDe(segundos) {
      if (typeof segundos === 'number') return Math.round(segundos * 1000);
      return { op: 'vezes', a: segundos, b: 1000 };
    }

    /* Zero viraria laço infinito no DEC_JNZ. Com número dá para resolver aqui;
       com conta, quem garante o mínimo é o SET_REG da VM, que corta em 1. */
    function vezesDe(v) {
      if (typeof v === 'number') return Math.max(1, Math.round(v));
      return v;
    }

    /* A pilha da VM tem fundo. Uma conta funda demais estouraria em tempo de
       execução, e a criança veria o robô parar sem explicação — então a
       profundidade sai da árvore antes de emitir byte nenhum. */
    function profundidadeDe(v) {
      if (!v || typeof v === 'number') return 1;
      if (v.op === 'distancia') return 1;
      if (v.op === 'nao') return profundidadeDe(v.a);
      /* O lado esquerdo fica na pilha enquanto o direito é calculado. */
      var ea = profundidadeDe(v.a), eb = profundidadeDe(v.b);
      return Math.max(ea, eb + 1);
    }

    /* ">=" e não ">": o MOTOR calcula o valor da direita com o da esquerda já
       na pilha, então sempre pode haver um a mais em cima do que a conta
       sozinha pede. Um lugar de folga cobre isso. */
    function conferirProfundidade(v) {
      if (profundidadeDe(v) >= PILHA_MAX) {
        throw new Error('Essa conta ficou complicada demais para o robô. ' +
                        'Tente quebrá-la em partes menores.');
      }
    }

    /* Um valor é um número ou um nó de conta. Sempre deixa exatamente um valor
       na pilha. */
    function gerarValor(v, blockId) {
      conferirProfundidade(v);
      gerarValorInterno(v, blockId);
    }

    function gerarValorInterno(v, blockId) {
      if (v === null || v === undefined) {
        emitir(OP.PUSH, 0, 0, 0, blockId);
        return;
      }
      if (typeof v === 'number') {
        emitir(OP.PUSH, Math.round(v), 0, 0, blockId);
        return;
      }
      var id = v.blockId || blockId;
      if (v.op === 'distancia') {
        emitir(OP.SENSOR, SENSOR_DISTANCIA, 0, 0, id);
        return;
      }
      if (v.op === 'nao') {
        gerarValorInterno(v.a, id);
        emitir(OP.UN, UN.NAO, 0, 0, id);
        return;
      }
      var sel = BINARIOS[v.op];
      if (sel === undefined) throw new Error('Conta desconhecida: ' + v.op);
      gerarValorInterno(v.a, id);
      gerarValorInterno(v.b, id);
      emitir(OP.BIN, sel, 0, 0, id);
    }

    /* JMP_FALSE salta quando a condição é falsa, então o alvo é o "senão" — ou
       o fim, quando não há senão. */
    function gerarCondicional(cond, entao, senao, blockId) {
      gerarValor(cond, blockId);
      var salto = instrucoes.length;
      emitir(OP.JMP_FALSE, 0, 0, 0, blockId);
      gerar(entao);
      if (senao && senao.length) {
        var pula = instrucoes.length;
        emitir(OP.JMP, 0, 0, 0, blockId);
        instrucoes[salto].a = instrucoes.length;
        gerar(senao);
        instrucoes[pula].a = instrucoes.length;
      } else {
        instrucoes[salto].a = instrucoes.length;
      }
    }

    /* Testa antes de rodar: o bloco diz "até", não "pelo menos uma vez". O
       laço roda enquanto a condição é falsa, daí o "não". */
    function gerarLacoAte(cond, corpo, blockId) {
      var inicio = instrucoes.length;
      gerarValor(cond, blockId);
      emitir(OP.UN, UN.NAO, 0, 0, blockId);
      var saida = instrucoes.length;
      emitir(OP.JMP_FALSE, 0, 0, 0, blockId);
      gerar(corpo);
      emitir(OP.JMP, inicio, 0, 0, blockId);
      instrucoes[saida].a = instrucoes.length;
    }

    /* O sensor comparado com um limite: é o que os três blocos prontos do
       Grande querem dizer, e agora é escrito com as mesmas peças que a criança
       usa à mão no Gigante. */
    function perto(cm) {
      return { op: 'menor', a: { op: 'distancia' }, b: Math.round(cm) };
    }

    function motor(esq, dir, blockId) {
      gerarValor(esq, blockId);
      gerarValor(dir, blockId);
      emitir(OP.MOTOR, 0, 0, 0, blockId);
    }

    function negar(v) {
      if (typeof v === 'number') return -v;
      return { op: 'menos', a: 0, b: v };
    }

    function andar(no, sinal) {
      var v = velocidadeDe(no);
      var vel = sinal < 0 ? -v : v;
      motor(vel, vel, no.blockId);
      gerarValor(msDe(no.segundos), no.blockId);
      emitir(OP.WAIT, 0, 0, 0, no.blockId);
      motor(0, 0, no.blockId);
    }

    function gerar(nos) {
      for (var no of nos) {
        switch (no.op) {
          case 'frente':
            andar(no, 1);
            break;

          case 'tras':
            andar(no, -1);
            break;

          case 'girar':
            gerarValor(no.graus, no.blockId);
            emitir(OP.TURN, 0, 0, 0, no.blockId);
            break;

          case 'esperar':
            gerarValor(msDe(no.segundos), no.blockId);
            emitir(OP.WAIT, 0, 0, 0, no.blockId);
            break;

          case 'repetir': {
            if (profundidade >= N_REGS) {
              throw new Error(
                'Tem blocos "repetir" aninhados demais — o máximo é ' + N_REGS + '.');
            }
            var registrador = profundidade++;
            gerarValor(vezesDe(no.vezes), no.blockId);
            emitir(OP.SET_REG, registrador, 0, 0, no.blockId);
            var inicio = instrucoes.length;
            gerar(no.corpo || []);
            emitir(OP.DEC_JNZ, registrador, inicio, 0, no.blockId);
            profundidade--;
            break;
          }

          case 'se_obstaculo':
            gerarCondicional(perto(no.cm), no.corpo || [], null, no.blockId);
            break;

          case 'se':
            gerarCondicional(no.cond, no.corpo || [], null, no.blockId);
            break;

          case 'se_senao':
            gerarCondicional(perto(no.cm), no.entao || [], no.senao || [],
                             no.blockId);
            break;

          case 'se_entao_senao':
            gerarCondicional(no.cond, no.entao || [], no.senao || [], no.blockId);
            break;

          case 'repetir_ate_perto':
            gerarLacoAte(perto(no.cm), no.corpo || [], no.blockId);
            break;

          case 'repetir_ate':
            gerarLacoAte(no.cond, no.corpo || [], no.blockId);
            break;

          case 'parar':
            emitir(OP.HALT, 0, 0, 0, no.blockId);
            break;

          case 'repetir_sempre': {
            var inicioSempre = instrucoes.length;
            gerar(no.corpo || []);
            emitir(OP.JMP, inicioSempre, 0, 0, no.blockId);
            break;
          }

          default:
            throw new Error('Bloco desconhecido: ' + no.op);
        }
      }
    }

    if (opcoes && opcoes.reportar !== undefined) {
      var idValor = (opcoes.reportar && opcoes.reportar.blockId) || null;
      gerarValor(opcoes.reportar, idValor);
      emitir(OP.REPORT, 0, 0, 0, idValor);
    } else {
      gerar(ast);
    }
    emitir(OP.HALT, 0, 0, 0, null);

    if (instrucoes.length > MAX_INSTR) {
      throw new Error(
        'O programa ficou grande demais: ' + instrucoes.length +
        ' instruções, e o robô só guarda ' + MAX_INSTR + '.');
    }

    var bytes = new Uint8Array(instrucoes.length * 7);
    var dv = new DataView(bytes.buffer);
    instrucoes.forEach(function (it, k) {
      var o = k * 7;
      dv.setUint8(o, it.op);
      dv.setInt16(o + 1, it.a, true);
      dv.setInt16(o + 3, it.b, true);
      dv.setInt16(o + 5, it.c, true);
    });

    return { bytes: bytes, pcMap: instrucoes.map(function (it) { return it.blockId; }) };
  }

  /* Um programa que existe só para responder uma pergunta: calcula o
     valor, relata, e para. */
  function compilarValor(no) {
    return compilar([], { reportar: no });
  }

  var api = { compilar: compilar, compilarValor: compilarValor,
              OP: OP, BIN: BIN, UN: UN, MAX_INSTR: MAX_INSTR };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Compilador = api;
})(typeof self !== 'undefined' ? self : globalThis);
