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
    TASK: 14, BROADCAST: 15,
  };

  /* Quando uma tarefa começa. Precisa bater com core/bytecode.h. */
  var TAREFA = { NO_PLAY: 0, NO_AVISO: 1 };

  /* Quantas pilhas a VM roda ao mesmo tempo. Também de bytecode.h. */
  var N_TAREFAS = 6;

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

  /* Um erro que sabe de qual peça nasceu. A frase sozinha caía num <span> de
     14px no cabeçalho, longe de onde a criança estava olhando; com o blockId
     ela sobe numa bolha em cima do bloco culpado, que é onde a mão dela
     acabou de estar. Quem desenha a bolha é o app.js — aqui só se anota de
     quem é a culpa. */
  function erroNoBloco(mensagem, blockId) {
    var e = new Error(mensagem);
    e.blockId = blockId || null;
    return e;
  }

  /* opcoes.reportar, quando vem, é um nó de valor: compila-se a subárvore
     dele e relata-se o resultado, em vez de gerar o programa. É o mesmo
     compilador de propósito — o navegador não calcula nada por conta
     própria, senão passariam a existir duas aritméticas no projeto (o
     int32 da VM e o double do JS) divergindo justamente onde é difícil
     perceber. */
  /* O compilador de um pedaço: devolve a lista de instruções, sem virar
     bytes. Existe separado porque uma tela com tarefas é vários pedaços
     costurados, e costurar exige mexer nos saltos de cada um antes de fechar.

     opcoes.reportar: compila um valor e o relata (é a bolha do relator).
     opcoes.valor:    compila só o valor, sem relatar (é a condição de um
                      «quando», que a tarefa vai testar sozinha).
     opcoes.semHalt:  não fecha com HALT — quem fecha é quem costura. */
  function compilarPedaco(ast, opcoes) {
    var instrucoes = [];
    var profundidade = 0;

    /* Os três operandos da instrução são int16 no bytecode (ver bytecode.h), e
       era aqui que um número grande demais sumia em silêncio: o `dv.setInt16`
       lá embaixo truncava, e `andar frente 100 s` virava uma espera de -31072
       ms — que a VM lê como zero. A criança pedia cem segundos e o robô não
       saía do lugar, sem uma palavra na tela.

       A conferência vem ANTES do `| 0`, e não depois, porque o `| 0` já é a
       conversão que perde a informação: `NaN | 0` é zero, e todo múltiplo de
       2³² também — `4294967296 | 0` é zero. Conferir o resultado dele
       aprovaria justamente os casos que se quer barrar. */
    function cabeNaInstrucao(v) {
      return typeof v === 'number' && isFinite(v) &&
             Math.floor(v) === v && v >= -32768 && v <= 32767;
    }

    function emitir(op, a, b, c, blockId) {
      if (!cabeNaInstrucao(a) || !cabeNaInstrucao(b) || !cabeNaInstrucao(c)) {
        /* Duas frases, porque são duas coisas diferentes para quem lê: um
           número que não cabe é escolha da criança e ela pode escolher outro;
           um campo sem número é um bloco pela metade. */
        var ehNumero = isFinite(a) && isFinite(b) && isFinite(c);
        throw erroNoBloco(ehNumero
          ? 'Esse número é grande demais para o robô. Tente um menor.'
          : 'Faltou um número em algum bloco.', blockId);
      }
      instrucoes.push({ op: op, a: a | 0, b: b | 0, c: c | 0,
                        blockId: blockId || null });
    }

    /* O nível Iniciante e o Básico não expõem velocidade; sem ela, vale a
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
      /* O × 1000 é nosso, não da criança: ela nunca soltou este bloco. Ele
         herda o blockId da conta que embrulha, senão um erro nascido aqui
         apontaria o bloco de cima — e a bolha acenderia em cima do
         "andar frente" quando quem não cabe é a conta lá dentro. */
      return { op: 'vezes', a: segundos, b: 1000,
               blockId: segundos ? segundos.blockId : null };
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
    function conferirProfundidade(v, blockId) {
      if (profundidadeDe(v) >= PILHA_MAX) {
        throw erroNoBloco('Essa conta ficou complicada demais para o robô. ' +
                          'Tente quebrá-la em partes menores.',
                          (v && v.blockId) || blockId);
      }
    }

    /* Um valor é um número ou um nó de conta. Sempre deixa exatamente um valor
       na pilha. */
    function gerarValor(v, blockId) {
      conferirProfundidade(v, blockId);
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
      if (sel === undefined) throw erroNoBloco('Conta desconhecida: ' + v.op, id);
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
       Intermediário querem dizer, e agora é escrito com as mesmas peças que
       a criança usa à mão no Avançado. */
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
      for (var i = 0; i < nos.length; i++) {
        var no = nos[i];
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
              throw erroNoBloco(
                'Tem blocos "repetir" aninhados demais — o máximo é ' + N_REGS + '.',
                no.blockId);
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

          case 'avisar':
            emitir(OP.BROADCAST, no.aviso, 0, 0, no.blockId);
            break;

          case 'repetir_sempre': {
            var inicioSempre = instrucoes.length;
            gerar(no.corpo || []);
            emitir(OP.JMP, inicioSempre, 0, 0, no.blockId);
            break;
          }

          default:
            throw erroNoBloco('Bloco desconhecido: ' + no.op, no.blockId);
        }
      }
    }

    if (opcoes && opcoes.reportar !== undefined) {
      var idValor = (opcoes.reportar && opcoes.reportar.blockId) || null;
      gerarValor(opcoes.reportar, idValor);
      emitir(OP.REPORT, 0, 0, 0, idValor);
    } else if (opcoes && opcoes.valor !== undefined) {
      gerarValor(opcoes.valor, opcoes.blockId || null);
    } else {
      gerar(ast);
    }
    if (!(opcoes && opcoes.semHalt)) emitir(OP.HALT, 0, 0, 0, null);

    return { instrucoes: instrucoes };
  }

  function montarBytes(instrucoes) {
    var bytes = new Uint8Array(instrucoes.length * 7);
    var dv = new DataView(bytes.buffer);
    instrucoes.forEach(function (it, k) {
      var o = k * 7;
      dv.setUint8(o, it.op);
      dv.setInt16(o + 1, it.a, true);
      dv.setInt16(o + 3, it.b, true);
      dv.setInt16(o + 5, it.c, true);
    });
    return bytes;
  }

  function naoPassaDoTeto(instrucoes) {
    if (instrucoes.length > MAX_INSTR) {
      throw new Error(
        'O programa ficou grande demais: ' + instrucoes.length +
        ' instruções, e o robô só guarda ' + MAX_INSTR + '.');
    }
  }

  /* Uma pilha só, sem cabeçalho de tarefa nenhum: é o que o robô sempre
     recebeu, e o que ele continua recebendo enquanto a criança não usar
     nenhuma cabeça nova. */
  function compilar(ast, opcoes) {
    var pedaco = compilarPedaco(ast, opcoes);
    naoPassaDoTeto(pedaco.instrucoes);
    return {
      bytes: montarBytes(pedaco.instrucoes),
      pcMap: pedaco.instrucoes.map(function (it) { return it.blockId; }),
    };
  }

  /* Um programa que existe só para responder uma pergunta: calcula o
     valor, relata, e para. */
  function compilarValor(no) {
    return compilar([], { reportar: no });
  }

  /* Várias pilhas, cada uma com o seu pc. O formato está em core/bytecode.h:
     um OP_TASK por tarefa, todos antes de qualquer código, e o corpo de cada
     uma depois.

     Um programa que tem só a âncora do PLAY não passa por aqui — quem decide é
     o app.js. É de propósito: sem cabeçalho o bytecode sai idêntico ao de
     antes, e um programa que a criança guardou continua rodando igual. */
  function compilarTarefas(tarefas) {
    if (!tarefas.length) return compilar([]);
    if (tarefas.length > N_TAREFAS) {
      throw new Error(
        'São ' + tarefas.length + ' pilhas com cabeça, e o robô roda ' +
        N_TAREFAS + ' ao mesmo tempo. Junte duas, ou apague uma.');
    }

    /* Cada tarefa vira um pedaço de programa compilado sozinho, e depois os
       pedaços são costurados um atrás do outro. Compilar separado é o que
       permite reusar o compilador inteiro sem reescrevê-lo: o preço é que os
       saltos de dentro de cada pedaço nascem relativos ao pedaço, e precisam
       ser somados ao lugar onde ele acabou caindo. */
    var pedacos = tarefas.map(function (t) {
      if (t.quando === 'condicao') return pedacoDeCondicao(t);
      return compilarPedaco(t.corpo || []);
    });

    var instrucoes = [];
    var mapa = [];
    /* O cabeçalho ocupa uma instrução por tarefa, e o corpo da primeira começa
       logo depois dele. */
    var base = tarefas.length;
    var inicios = [];
    for (var i = 0; i < pedacos.length; i++) {
      inicios.push(base);
      base += pedacos[i].instrucoes.length;
    }

    tarefas.forEach(function (t, k) {
      var quando = t.quando === 'aviso' ? TAREFA.NO_AVISO : TAREFA.NO_PLAY;
      instrucoes.push({ op: OP.TASK, a: quando, b: inicios[k],
                        c: t.quando === 'aviso' ? (t.aviso | 0) : 0,
                        blockId: t.blockId || null });
      mapa.push(t.blockId || null);
    });

    pedacos.forEach(function (pedaco, k) {
      var deslocamento = inicios[k];
      pedaco.instrucoes.forEach(function (it) {
        var novo = { op: it.op, a: it.a, b: it.b, c: it.c, blockId: it.blockId };
        /* Os três saltos que existem carregam endereço: JMP e JMP_FALSE no
           campo a, DEC_JNZ no campo b. Esquecer um deles manda a criança para
           o meio do programa de outra pilha, e isso não dá erro — dá um robô
           fazendo coisa que ninguém montou. */
        if (novo.op === OP.JMP || novo.op === OP.JMP_FALSE) novo.a += deslocamento;
        if (novo.op === OP.DEC_JNZ) novo.b += deslocamento;
        instrucoes.push(novo);
        mapa.push(it.blockId || null);
      });
    });

    naoPassaDoTeto(instrucoes);
    return { bytes: montarBytes(instrucoes), pcMap: mapa };
  }

  /* «quando <condição>» não precisa de nada novo na VM: é uma tarefa que fica
     testando e, quando dá verdade, roda o corpo e volta a testar. O laço é o
     próprio corpo da tarefa.

     Ela nunca termina, de propósito: enquanto o programa roda, esse olho fica
     aberto. É por isso que uma tela com «quando» só para no PARAR. */
  function pedacoDeCondicao(t) {
    var corpo = compilarPedaco(t.corpo || [], { semHalt: true });
    var cond = compilarPedaco([], { valor: t.cond,
                                    blockId: t.blockId, semHalt: true });
    var instrucoes = [];
    cond.instrucoes.forEach(function (it) { instrucoes.push(it); });
    /* Condição falsa: volta ao começo do teste. O zero é o início do pedaço,
       e o compilarTarefas soma o deslocamento depois. */
    instrucoes.push({ op: OP.JMP_FALSE, a: 0, b: 0, c: 0,
                      blockId: t.blockId || null });
    /* O corpo foi compilado sozinho, achando que começava em zero; aqui ele
       cai depois do teste. O deslocamento é onde o corpo começa, e é o mesmo
       para todas as instruções dele — calcular por instrução, com a lista
       crescendo, foi o primeiro jeito de errar isto. */
    var inicioCorpo = instrucoes.length;
    corpo.instrucoes.forEach(function (it) {
      var novo = { op: it.op, a: it.a, b: it.b, c: it.c, blockId: it.blockId };
      if (novo.op === OP.JMP || novo.op === OP.JMP_FALSE) novo.a += inicioCorpo;
      if (novo.op === OP.DEC_JNZ) novo.b += inicioCorpo;
      instrucoes.push(novo);
    });
    instrucoes.push({ op: OP.JMP, a: 0, b: 0, c: 0, blockId: t.blockId || null });
    return { instrucoes: instrucoes };
  }

  var api = { compilar: compilar, compilarValor: compilarValor,
              compilarTarefas: compilarTarefas,
              OP: OP, BIN: BIN, UN: UN, TAREFA: TAREFA,
              MAX_INSTR: MAX_INSTR, N_TAREFAS: N_TAREFAS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Compilador = api;
})(typeof self !== 'undefined' ? self : globalThis);
