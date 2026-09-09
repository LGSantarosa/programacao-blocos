'use strict';
/* O programa da criança tem que voltar como ela deixou — e, quando não puder
   voltar, tem que sumir sem levar a página junto. É esta segunda metade que
   justifica o arquivo existir separado do app.js: os quatro jeitos de o
   armazenamento falhar são triviais de encenar aqui e caros de encenar num
   navegador. */

const test = require('node:test');
const assert = require('node:assert');
const Guardar = require('../web/guardar.js');

/* localStorage de mentira, com as manhas dos de verdade. */
function armazenamento(opcoes) {
  const o = opcoes || {};
  const dados = new Map();
  return {
    getItem(k) {
      if (o.lerLanca) throw new Error('sem acesso');
      return dados.has(k) ? dados.get(k) : null;
    },
    setItem(k, v) {
      if (o.gravarLanca) throw new Error('cota cheia');
      dados.set(k, String(v));
    },
    removeItem(k) { dados.delete(k); },
    espiar(k) { return dados.has(k) ? dados.get(k) : null; },
    plantar(k, v) { dados.set(k, v); },
  };
}

function com(caixa, corpo) {
  const antes = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  if (caixa === null) delete globalThis.localStorage;
  else globalThis.localStorage = caixa;
  try {
    corpo();
  } finally {
    delete globalThis.localStorage;
    if (antes) Object.defineProperty(globalThis, 'localStorage', antes);
  }
}

const PROGRAMA = {
  blocks: { languageVersion: 0, blocks: [{ type: 'quando_play', x: 40, y: 30 }] },
};

test('o programa volta como saiu', () => {
  const caixa = armazenamento();
  com(caixa, () => {
    assert.strictEqual(Guardar.gravar(PROGRAMA, 'medio'), true);
    assert.deepStrictEqual(Guardar.ler('medio'), PROGRAMA);
  });
});

test('um programa de outro nível não ressuscita', () => {
  /* Um "se…senão" do Grande não tem desenho possível no Pequeno — é por isso
     que trocar de nível pergunta antes de apagar. Devolver o programa em outro
     nível seria fazer calado o que a troca de nível não se permite fazer sem
     perguntar. */
  const caixa = armazenamento();
  com(caixa, () => {
    Guardar.gravar(PROGRAMA, 'grande');
    assert.strictEqual(Guardar.ler('pequeno'), null);
    assert.strictEqual(Guardar.ler('medio'), null);
    assert.deepStrictEqual(Guardar.ler('grande'), PROGRAMA);
  });
});

test('sem nada guardado, a resposta é null e não um estouro', () => {
  com(armazenamento(), () => {
    assert.strictEqual(Guardar.ler('medio'), null);
  });
});

test('sem localStorage nenhum, ninguém quebra', () => {
  /* Acontece de verdade: iOS com cookies bloqueados, e alguns WebViews. */
  com(null, () => {
    assert.strictEqual(Guardar.gravar(PROGRAMA, 'medio'), false);
    assert.strictEqual(Guardar.ler('medio'), null);
    assert.doesNotThrow(() => Guardar.esquecer());
  });
});

test('gravar que lança não derruba a página', () => {
  /* O Safari em navegação privada TEM localStorage e lança ao gravar. Perder o
     backup é ruim; derrubar a brincadeira no meio é pior. */
  com(armazenamento({ gravarLanca: true }), () => {
    assert.strictEqual(Guardar.gravar(PROGRAMA, 'medio'), false);
  });
});

test('ler que lança devolve null', () => {
  com(armazenamento({ lerLanca: true }), () => {
    assert.strictEqual(Guardar.ler('medio'), null);
  });
});

test('lixo guardado é ignorado, não interpretado', () => {
  /* Meia gravação, ou o formato de uma versão anterior. A criança recomeça do
     zero, que é ruim; a criança abre uma tela quebrada para sempre, que é pior
     e não tem saída pela própria tela. */
  for (const lixo of ['', '{', 'null', '"texto"', '[]', '{"nivel":"medio"}',
                      '{"nivel":"medio","blocos":"nao é objeto"}']) {
    const caixa = armazenamento();
    caixa.plantar(Guardar.CHAVE, lixo);
    com(caixa, () => {
      assert.strictEqual(Guardar.ler('medio'), null, `deixou passar: ${lixo}`);
    });
  }
});

test('esquecer apaga de verdade', () => {
  const caixa = armazenamento();
  com(caixa, () => {
    Guardar.gravar(PROGRAMA, 'medio');
    assert.ok(caixa.espiar(Guardar.CHAVE));
    Guardar.esquecer();
    assert.strictEqual(caixa.espiar(Guardar.CHAVE), null);
    assert.strictEqual(Guardar.ler('medio'), null);
  });
});

test('gravar de novo substitui, não empilha', () => {
  const caixa = armazenamento();
  com(caixa, () => {
    Guardar.gravar(PROGRAMA, 'medio');
    const outro = { blocks: { languageVersion: 0, blocks: [] } };
    Guardar.gravar(outro, 'medio');
    assert.deepStrictEqual(Guardar.ler('medio'), outro);
  });
});

test('o programa vazio também é um estado que vale guardar', () => {
  /* A criança que apagou tudo e fechou a página não quer os blocos de volta:
     ela quer a mesa limpa que deixou. */
  const caixa = armazenamento();
  const vazio = { blocks: { languageVersion: 0, blocks: [] } };
  com(caixa, () => {
    Guardar.gravar(vazio, 'pequeno');
    assert.deepStrictEqual(Guardar.ler('pequeno'), vazio);
  });
});
