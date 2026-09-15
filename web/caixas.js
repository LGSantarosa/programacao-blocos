/* Onde cada caixa da criança mora na VM.

   A VM guarda 16 números e não sabe nome nenhum; o Blockly sabe os nomes e não
   sabe de VM. Este arquivo é o endereço entre os dois: o id da variável do
   Blockly vira um lugar de 0 a 15, e o lugar não muda enquanto a caixa
   existir — nem quando outra é apagada, nem quando ela é renomeada.

   Contar pela posição na lista de variáveis foi o primeiro desenho, e errava
   de dois jeitos: apagar uma caixa deslocava as de depois (e «pontos» passava
   a mostrar o número de «voltas»), e o limite de 16 contava caixa que nem
   estava em uso.

   "Sujo" é o lugar que pode ter número na VM: toda caixa que existe, e toda
   que existiu desde o último ZERAR. É o que diz ao app.js se o PLAY precisa
   zerar — olhar só as caixas da tela esqueceria a que foi apagada com número
   dentro.

   Sem Blockly e sem DOM, como o guardar.js e o compilador.js: assim dá para
   provar em Node, em milissegundos, que o endereço não troca. */
(function (raiz) {
  'use strict';

  /* Precisa bater com N_CAIXAS em core/bytecode.h e em web/compilador.js. */
  var N_CAIXAS = 16;

  function lugarValido(n) {
    return typeof n === 'number' && Math.floor(n) === n && n >= 0 && n < N_CAIXAS;
  }

  function temDono(obj, chave) {
    return Object.prototype.hasOwnProperty.call(obj, chave);
  }

  function Mapa() {
    this.lugar = {};
    /* Onde cada caixa apagada estava. É o que faz desfazer funcionar: o
       Blockly recria a variável com o mesmo id, e ela volta para casa. */
    this.antigo = {};
    this.sujo = [];
    for (var k = 0; k < N_CAIXAS; k++) this.sujo.push(false);
  }

  Mapa.prototype.lugarDe = function (id) {
    return temDono(this.lugar, id) ? this.lugar[id] : null;
  };

  Mapa.prototype.ocupado = function (n) {
    for (var id in this.lugar) {
      if (temDono(this.lugar, id) && this.lugar[id] === n) return true;
    }
    return false;
  };

  Mapa.prototype.temLugar = function () {
    for (var k = 0; k < N_CAIXAS; k++) if (!this.ocupado(k)) return true;
    return false;
  };

  /* Idempotente: o app.js reconcilia a cada evento, e chamar de novo para
     quem já tem lugar tem que dar o mesmo lugar. */
  Mapa.prototype.criada = function (id) {
    var ja = this.lugarDe(id);
    if (ja !== null) return ja;
    var n = null;
    if (temDono(this.antigo, id) && !this.ocupado(this.antigo[id])) n = this.antigo[id];
    for (var k = 0; n === null && k < N_CAIXAS; k++) {
      if (!this.ocupado(k)) n = k;
    }
    if (n === null) return null;
    this.lugar[id] = n;
    delete this.antigo[id];
    /* Quem lembrava deste lugar perde a lembrança: desfazer depois disso cai
       no menor livre, que é a regra de sempre, e a lista nunca passa de
       N_CAIXAS entradas — senão cresceria no localStorage a cada troca de
       nível. */
    for (var velho in this.antigo) {
      if (temDono(this.antigo, velho) && this.antigo[velho] === n) delete this.antigo[velho];
    }
    this.sujo[n] = true;
    return n;
  };

  /* O lugar fica livre, mas sujo: o número que a caixa tinha continua na VM
     até um programa com ZERAR chegar lá. */
  Mapa.prototype.apagada = function (id) {
    var n = this.lugarDe(id);
    if (n === null) return;
    delete this.lugar[id];
    this.antigo[id] = n;
  };

  /* Acerta o mapa com as variáveis que existem na tela, nos dois sentidos.

     Existe porque os eventos não bastam: o workspace.clear() do Blockly — que o
     Blocos.limpar usa ao trocar de nível, e que o load usa ao restaurar e ao
     abrir o gabarito — esvazia as variáveis sem disparar VAR_DELETE. Contando
     só com eventos, as caixas da tela apagada segurariam lugar para sempre.

     Primeiro solta quem sumiu, depois dá lugar a quem chegou: assim quem
     chegou pode usar o lugar que acabou de ser solto. */
  Mapa.prototype.reconciliar = function (ids) {
    var existe = {}, sumiram = [], id, k;
    for (k = 0; k < ids.length; k++) existe[' ' + ids[k]] = true;
    for (id in this.lugar) {
      if (temDono(this.lugar, id) && !existe[' ' + id]) sumiram.push(id);
    }
    for (k = 0; k < sumiram.length; k++) this.apagada(sumiram[k]);
    for (k = 0; k < ids.length; k++) this.criada(ids[k]);
  };

  Mapa.prototype.temSujo = function () {
    for (var k = 0; k < N_CAIXAS; k++) if (this.sujo[k]) return true;
    return false;
  };

  /* Chamado depois de mandar um programa com ZERAR. A caixa que existe
     continua suja: o próprio programa pode escrever nela. */
  Mapa.prototype.zerou = function () {
    for (var k = 0; k < N_CAIXAS; k++) this.sujo[k] = this.ocupado(k);
  };

  Mapa.prototype.exportar = function () {
    var lugar = {}, antigo = {}, sujo = [], id, k;
    for (id in this.lugar) if (temDono(this.lugar, id)) lugar[id] = this.lugar[id];
    for (id in this.antigo) if (temDono(this.antigo, id)) antigo[id] = this.antigo[id];
    for (k = 0; k < N_CAIXAS; k++) if (this.sujo[k]) sujo.push(k);
    return { lugar: lugar, antigo: antigo, sujo: sujo };
  };

  function ehObjeto(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  /* Lê o que veio do localStorage. Qualquer entrada ruim sai sozinha, e
     nunca lança: um mapa quebrado que derrubasse a página tiraria da criança
     o programa inteiro por causa de uma caixa. */
  function importar(dados) {
    var m = new Mapa();
    if (!ehObjeto(dados)) return m;
    var usados = {}, id, n, k;

    if (ehObjeto(dados.lugar)) {
      for (id in dados.lugar) {
        if (!temDono(dados.lugar, id) || id === '') continue;
        n = dados.lugar[id];
        /* Dois ids no mesmo lugar: fica o primeiro. */
        if (!lugarValido(n) || usados[n]) continue;
        usados[n] = true;
        m.lugar[id] = n;
      }
    }

    if (ehObjeto(dados.antigo)) {
      for (id in dados.antigo) {
        if (!temDono(dados.antigo, id) || id === '' || temDono(m.lugar, id)) continue;
        n = dados.antigo[id];
        /* Uma lembrança por lugar, e nenhuma para lugar que já tem dono, como
           em tempo de uso: é o que segura a lista em N_CAIXAS entradas mesmo
           com um estado gravado torto. */
        if (lugarValido(n) && !usados[n]) {
          usados[n] = true;
          m.antigo[id] = n;
        }
      }
    }

    if (Array.isArray(dados.sujo)) {
      for (k = 0; k < dados.sujo.length; k++) {
        if (lugarValido(dados.sujo[k])) m.sujo[dados.sujo[k]] = true;
      }
    }
    for (id in m.lugar) if (temDono(m.lugar, id)) m.sujo[m.lugar[id]] = true;

    return m;
  }

  var api = { importar: importar, N_CAIXAS: N_CAIXAS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Caixas = api;
})(typeof self !== 'undefined' ? self : globalThis);
