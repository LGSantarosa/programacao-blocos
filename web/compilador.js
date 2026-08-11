/* Compila a árvore de blocos em bytecode. Roda no navegador e no Node,
   sem depender de Blockly nem do DOM — é o que permite testá-lo. */
(function (raiz) {
  'use strict';

  var OP = {
    HALT: 0, MOTOR: 1, WAIT: 2, TURN: 3,
    SET_REG: 4, DEC_JNZ: 5, JMP: 6, JMP_IF_GE: 7,
  };

  var VEL_FRENTE = 200;
  var MAX_INSTR = 256;
  var N_REGS = 4;
  var SENSOR_DISTANCIA = 0;

  function compilar(ast) {
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

    function gerar(nos) {
      for (var no of nos) {
        switch (no.op) {
          case 'frente': {
            var v = velocidadeDe(no);
            emitir(OP.MOTOR, v, v, 0, no.blockId);
            emitir(OP.WAIT, Math.round(no.segundos * 1000), 0, 0, no.blockId);
            emitir(OP.MOTOR, 0, 0, 0, no.blockId);
            break;
          }

          case 'tras': {
            var v = velocidadeDe(no);
            emitir(OP.MOTOR, -v, -v, 0, no.blockId);
            emitir(OP.WAIT, Math.round(no.segundos * 1000), 0, 0, no.blockId);
            emitir(OP.MOTOR, 0, 0, 0, no.blockId);
            break;
          }

          case 'girar':
            emitir(OP.TURN, no.graus, 0, 0, no.blockId);
            break;

          case 'esperar':
            emitir(OP.WAIT, Math.round(no.segundos * 1000), 0, 0, no.blockId);
            break;

          case 'repetir': {
            if (profundidade >= N_REGS) {
              throw new Error(
                'Tem blocos "repetir" aninhados demais — o máximo é ' + N_REGS + '.');
            }
            var registrador = profundidade++;
            /* Zero viraria laço infinito: DEC_JNZ nunca chegaria a zero. */
            var vezes = Math.max(1, Math.round(no.vezes));
            emitir(OP.SET_REG, registrador, vezes, 0, no.blockId);
            var inicio = instrucoes.length;
            gerar(no.corpo || []);
            emitir(OP.DEC_JNZ, registrador, inicio, 0, no.blockId);
            profundidade--;
            break;
          }

          case 'se_obstaculo': {
            var salto = instrucoes.length;
            emitir(OP.JMP_IF_GE, SENSOR_DISTANCIA, Math.round(no.cm), 0, no.blockId);
            gerar(no.corpo || []);
            instrucoes[salto].c = instrucoes.length;
            break;
          }

          case 'parar':
            emitir(OP.HALT, 0, 0, 0, no.blockId);
            break;

          case 'repetir_sempre': {
            /* Primeiro uso real do OP_JMP: ele existe na VM desde a v1 e nunca
               tinha sido emitido por ninguém. */
            var inicioSempre = instrucoes.length;
            gerar(no.corpo || []);
            emitir(OP.JMP, inicioSempre, 0, 0, no.blockId);
            break;
          }

          case 'se_senao': {
            /* JMP_IF_GE salta quando a leitura é maior ou igual, isto é quando
               NÃO há obstáculo dentro da distância. Por isso o alvo do salto é
               o ramo "senão", e não o "então". */
            var testeSe = instrucoes.length;
            emitir(OP.JMP_IF_GE, SENSOR_DISTANCIA, Math.round(no.cm), 0, no.blockId);
            gerar(no.entao || []);
            var pulaSenao = instrucoes.length;
            emitir(OP.JMP, 0, 0, 0, no.blockId);
            instrucoes[testeSe].c = instrucoes.length;
            gerar(no.senao || []);
            instrucoes[pulaSenao].a = instrucoes.length;
            break;
          }

          case 'repetir_ate_perto': {
            /* Testa antes de rodar, não depois. Um do-while custaria duas
               instruções a menos, mas daria um passo mesmo já estando colado na
               parede — e o bloco diz "até chegar", não "pelo menos uma vez". */
            var inicioAte = instrucoes.length;
            emitir(OP.JMP_IF_GE, SENSOR_DISTANCIA, Math.round(no.cm), 0, no.blockId);
            var saidaAte = instrucoes.length;
            emitir(OP.JMP, 0, 0, 0, no.blockId);
            instrucoes[inicioAte].c = instrucoes.length;
            gerar(no.corpo || []);
            emitir(OP.JMP, inicioAte, 0, 0, no.blockId);
            instrucoes[saidaAte].a = instrucoes.length;
            break;
          }

          default:
            throw new Error('Bloco desconhecido: ' + no.op);
        }
      }
    }

    gerar(ast);
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

  var api = { compilar: compilar, OP: OP, MAX_INSTR: MAX_INSTR };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Compilador = api;
})(typeof self !== 'undefined' ? self : globalThis);
