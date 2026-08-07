/* Compila a árvore de blocos em bytecode. Roda no navegador e no Node,
   sem depender de Blockly nem do DOM — é o que permite testá-lo. */
(function (raiz) {
  'use strict';

  const OP = {
    HALT: 0, MOTOR: 1, WAIT: 2, TURN: 3,
    SET_REG: 4, DEC_JNZ: 5, JMP: 6, JMP_IF_GE: 7,
  };

  const VEL_FRENTE = 200;
  const MAX_INSTR = 256;
  const N_REGS = 4;
  const SENSOR_DISTANCIA = 0;

  function compilar(ast) {
    const instrucoes = [];
    let profundidade = 0;

    function emitir(op, a, b, c, blockId) {
      instrucoes.push({ op, a: a | 0, b: b | 0, c: c | 0, blockId: blockId || null });
    }

    function gerar(nos) {
      for (const no of nos) {
        switch (no.op) {
          case 'frente':
            emitir(OP.MOTOR, VEL_FRENTE, VEL_FRENTE, 0, no.blockId);
            emitir(OP.WAIT, Math.round(no.segundos * 1000), 0, 0, no.blockId);
            emitir(OP.MOTOR, 0, 0, 0, no.blockId);
            break;

          case 'tras':
            emitir(OP.MOTOR, -VEL_FRENTE, -VEL_FRENTE, 0, no.blockId);
            emitir(OP.WAIT, Math.round(no.segundos * 1000), 0, 0, no.blockId);
            emitir(OP.MOTOR, 0, 0, 0, no.blockId);
            break;

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
            const registrador = profundidade++;
            /* Zero viraria laço infinito: DEC_JNZ nunca chegaria a zero. */
            const vezes = Math.max(1, Math.round(no.vezes));
            emitir(OP.SET_REG, registrador, vezes, 0, no.blockId);
            const inicio = instrucoes.length;
            gerar(no.corpo || []);
            emitir(OP.DEC_JNZ, registrador, inicio, 0, no.blockId);
            profundidade--;
            break;
          }

          case 'se_obstaculo': {
            const salto = instrucoes.length;
            emitir(OP.JMP_IF_GE, SENSOR_DISTANCIA, Math.round(no.cm), 0, no.blockId);
            gerar(no.corpo || []);
            instrucoes[salto].c = instrucoes.length;
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

    const bytes = new Uint8Array(instrucoes.length * 7);
    const dv = new DataView(bytes.buffer);
    instrucoes.forEach((it, k) => {
      const o = k * 7;
      dv.setUint8(o, it.op);
      dv.setInt16(o + 1, it.a, true);
      dv.setInt16(o + 3, it.b, true);
      dv.setInt16(o + 5, it.c, true);
    });

    return { bytes, pcMap: instrucoes.map((it) => it.blockId) };
  }

  const api = { compilar, OP, MAX_INSTR };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Compilador = api;
})(typeof self !== 'undefined' ? self : globalThis);
