'use strict';
/* Um protocolo, quatro casas que o escrevem: o firmware da placa
   (`firmware/src/protocolo.h`), o bridge do robô virtual
   (`bridge/server.js`), a página (`web/rede.js`) e o app
   (`android/.../Traducao.kt`). Duplicação assumida e justificada — quatro
   linguagens, um protocolo — mas duplicação livre para divergir em silêncio.

   Os bytes de cada quadro do firmware são conferidos no
   `tests/protocolo_test.c`. O que se confere aqui é o que nenhum teste de uma
   casa só alcança: que as quatro concordam sobre o número de cada tipo. Um
   `T_DIST` que virasse 0x86 num lado só passaria em todos os testes existentes
   e falharia com a criança na frente do robô. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leia = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');

/* A verdade combinada. Mudar um número aqui é mudar o protocolo: quem fizer
   isso tem de mexer nas quatro casas, e é esse o ponto do teste. */
const TIPOS = {
  T_LOAD: 0x01,
  T_RUN: 0x02,
  T_STOP: 0x03,
  T_ARENA: 0x04,     /* só o robô virtual tem arena para trocar */
  T_PC: 0x81,
  T_STATE: 0x82,
  T_TELEM: 0x83,     /* pose; a placa não emite, por não ter física */
  T_VALOR: 0x84,
  T_DIST: 0x85,
};

/* Cada casa declara os seus com uma sintaxe diferente; o que muda é só o que
   vem antes do nome. */
const CASAS = [
  { nome: 'firmware/src/protocolo.h', fonte: 'firmware/src/protocolo.h',
    re: (n) => new RegExp(`#define\\s+${n}\\s+(0x[0-9A-Fa-f]+)`),
    tem: ['T_LOAD', 'T_RUN', 'T_STOP', 'T_PC', 'T_STATE', 'T_VALOR', 'T_DIST'] },
  { nome: 'bridge/server.js', fonte: 'bridge/server.js',
    re: (n) => new RegExp(`${n}\\s*=\\s*(0x[0-9A-Fa-f]+)`),
    tem: ['T_LOAD', 'T_RUN', 'T_STOP', 'T_ARENA', 'T_PC', 'T_STATE', 'T_TELEM',
          'T_VALOR'] },
  { nome: 'web/rede.js', fonte: 'web/rede.js',
    re: (n) => new RegExp(`${n}\\s*=\\s*(0x[0-9A-Fa-f]+)`),
    tem: ['T_LOAD', 'T_RUN', 'T_STOP', 'T_ARENA', 'T_PC', 'T_STATE', 'T_TELEM',
          'T_VALOR', 'T_DIST'] },
  { nome: 'android Traducao.kt',
    fonte: 'android/app/src/main/java/br/educacaocriativa/roboblocos/Traducao.kt',
    re: (n) => new RegExp(`const val ${n}\\s*=\\s*(0x[0-9A-Fa-f]+)`),
    tem: ['T_LOAD', 'T_RUN', 'T_STOP', 'T_ARENA', 'T_PC', 'T_STATE', 'T_TELEM',
          'T_VALOR'] },
];

for (const casa of CASAS) {
  test(`${casa.nome} usa os números combinados do protocolo`, () => {
    const src = leia(casa.fonte);
    for (const nome of casa.tem) {
      const achado = src.match(casa.re(nome));
      assert.ok(achado, `${casa.nome} não declara ${nome}`);
      assert.strictEqual(parseInt(achado[1], 16), TIPOS[nome],
        `${casa.nome}: ${nome} vale ${achado[1]}, e o combinado é ` +
        '0x' + TIPOS[nome].toString(16));
    }
  });
}

test('a placa não sabe emitir pose', () => {
  /* O 0x83 leva x, y e theta. A ESP32 não tem física: pose inventada faria o
     desenho do robô saltar para a origem e a missão se dar por cumprida
     sozinha. O protocolo.h nem declara o tipo, e o protocolo_test.c prova que
     nenhum montador dele o emite. */
  const h = leia('firmware/src/protocolo.h');
  assert.ok(!/#define\s+T_TELEM/.test(h),
    'o firmware não deve declarar T_TELEM');
  assert.ok(/0x83/.test(h),
    'mas o porquê deve estar escrito lá, senão alguém acrescenta de volta');
});

test('o firmware da placa lê o protocolo pelo protocolo.h, e não à mão', () => {
  /* Foi assim que o buraco nasceu: os bytes eram montados soltos dentro do
     main.cpp, onde nenhum teste os alcançava. */
  const main = leia('firmware/src/main.cpp');
  assert.match(main, /#include "protocolo\.h"/);
  assert.ok(!/uint8_t\s+q\[\d\]\s*=\s*\{\s*T_/.test(main),
    'quadro montado à mão no main.cpp: passe pelo protocolo.h');
});
