# Ciclo A — níveis e carisma — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** A mesma tela serve uma criança de 4 anos que não lê e uma de 10 que quer complexidade, e o robô virtual vira um personagem que a criança quer olhar.

**Arquitetura:** Um bloco nunca troca de tipo entre níveis — ele ganha controles. O nível decide quais campos ficam visíveis e o que a caixa de blocos oferece; o compilador nunca sabe em que nível está, porque cada bloco tem um campo único como fonte de verdade. O robô virtual ganha reações derivadas de dados que já chegam, exceto colisão, que custa um byte novo na telemetria.

**Stack:** O mesmo da v1 — C11, Node.js 18 sem dependências, Blockly 11 vendorizado. Acrescenta Web Audio (nativo do navegador) e o Chrome DevTools Protocol para o teste de navegador.

## Restrições globais

Herdadas do [spec da v1](../specs/2026-08-06-blocos-robo-esp32-design.md) e continuam valendo:

- **Zero dependências npm.** Bridge e testes usam só módulos embutidos do Node.
- **Zero CDN.** Tudo vendorizado; a ESP32 serve offline.
- **A VM nunca bloqueia.** Nenhum `delay()` ou laço de espera em `core/`.
- **`core/` é C portátil.** Sem `malloc`, sem `printf`.
- **Toda mensagem visível para a criança é em português.**
- **Constantes de calibração** (`core/vm.h`): `VEL_FRENTE 200`, `VEL_GIRO 180`, `MS_POR_GRAU 5`, `WATCHDOG_MS 500`.
- **Formato de instrução:** 7 bytes, `op(uint8) a(int16) b(int16) c(int16)`, little-endian. Máximo 256 instruções.
- **Compilar com `-std=gnu11`**, não `-std=c11`.
- Commits em português, no presente ("Adiciona", "Implementa").

Novas deste ciclo:

- **Nenhum arquivo de áudio.** Som só por síntese Web Audio. O flash da ESP32 está em 66,6% com 220 KB de interface; assets de som não cabem no orçamento.
- **`core/` e `firmware/` não são tocados.** Este ciclo é navegador e simulador. O firmware precisa continuar compilando ao fim (`cd firmware && pio run`), nada além disso.
- **Nenhum bloco novo.** Os seis blocos da v1 continuam sendo seis; o que muda é quais campos aparecem.

## Mapa de arquivos

| arquivo | responsabilidade |
|---|---|
| `host/physics.h` `.c` | acrescenta `fis_colidiu()` |
| `host/main.c` | quinto campo na linha `T` |
| `bridge/server.js` | décimo byte no quadro `0x83` |
| `web/rede.js` | lê o byte de colisão |
| `web/som.js` | **novo** — tabela de sons e síntese Web Audio |
| `web/campos.js` | **novo** — `FieldBolinhas` |
| `web/compilador.js` | velocidade nos blocos de movimento |
| `web/blocos.js` | ícones, campo `GRAUS` como fonte de verdade, campo `VEL` |
| `web/niveis.js` | **novo** — os três níveis, caixa de blocos, aplicação ao workspace |
| `web/robo.js` | **novo** — o personagem: reação e desenho |
| `web/arena.js` | passa a desenhar só o mundo |
| `web/app.js` | fiação do seletor, do mudo e das reações |
| `web/index.html` | seletor de nível, botão de mudo |
| `tests/physics_test.c` | testes de `fis_colidiu()` |
| `tests/host_test.sh` | linha `T` com cinco campos |
| `tests/bridge.test.js` | quadro de telemetria com dez bytes |
| `tests/som.test.js` | **novo** |
| `tests/campos.test.js` | **novo** |
| `tests/compilador.test.js` | velocidade e ângulo livre |
| `tests/niveis.test.js` | **novo** |
| `tests/robo.test.js` | **novo** |
| `tests/navegador.test.js` | **novo** — dirige o Chromium por CDP |

---

### Tarefa 1: A física conta que bateu

`colide()` já sabe. Ninguém pergunta.

**Arquivos:**
- Modificar: `host/physics.h`, `host/physics.c`
- Modificar: `tests/physics_test.c`

**Interfaces:**
- Produz: `int fis_colidiu(void)` — devolve 1 se o último `fis_passo()` foi bloqueado por parede ou obstáculo, 0 caso contrário. Zera a cada `fis_passo()` e a cada `fis_init()`.

- [ ] **Passo 1: Escrever os testes que devem falhar**

Adicionar em `tests/physics_test.c`, antes de `main`:

```c
static void teste_colidiu_e_zero_andando_livre(void) {
    printf("teste_colidiu_e_zero_andando_livre\n");
    fis_init();
    fis_set_pose(1.0, 0.40, M_PI / 2);
    CHECK(fis_colidiu() == 0);
    fis_set_motores(255, 255);
    avancar(0.5);
    CHECK(fis_colidiu() == 0);
}

static void teste_colidiu_marca_ao_bater_na_parede(void) {
    printf("teste_colidiu_marca_ao_bater_na_parede\n");
    fis_init();
    fis_set_pose(1.0, 1.90, M_PI / 2);   /* colado na parede de cima */
    fis_set_motores(255, 255);
    avancar(1.0);
    CHECK(fis_colidiu() == 1);
}

static void teste_colidiu_volta_a_zero_ao_se_afastar(void) {
    printf("teste_colidiu_volta_a_zero_ao_se_afastar\n");
    fis_init();
    fis_set_pose(1.0, 1.90, M_PI / 2);
    fis_set_motores(255, 255);
    avancar(1.0);
    CHECK(fis_colidiu() == 1);

    fis_set_motores(-255, -255);          /* de ré, sai de perto */
    avancar(0.5);
    CHECK(fis_colidiu() == 0);
}
```

Registrar em `main`, antes do `if (falhas == 0)`:

```c
    teste_colidiu_e_zero_andando_livre();
    teste_colidiu_marca_ao_bater_na_parede();
    teste_colidiu_volta_a_zero_ao_se_afastar();
```

- [ ] **Passo 2: Rodar para confirmar que falham**

Rodar: `cd tests && make test`
Esperado: erro de compilação — `fis_colidiu` não declarado. Isso é aceitável aqui porque a função é nova e o passo 3 a cria; o RED por asserção vem no passo 4.

- [ ] **Passo 3: Declarar a função e devolver sempre 0**

Em `host/physics.h`, depois de `fis_distancia_cm`:

```c
/* 1 se o último fis_passo() foi bloqueado por parede ou obstáculo. */
int      fis_colidiu(void);
```

Em `host/physics.c`, junto das outras variáveis de estado:

```c
static int bateu;
```

E a função, depois de `fis_pose`:

```c
int fis_colidiu(void) { return bateu; }
```

Zerar em `fis_init`, junto de `mot_esq = mot_dir = 0;`:

```c
    bateu = 0;
```

- [ ] **Passo 4: Rodar para confirmar o RED por asserção**

Rodar: `cd tests && make test`
Esperado: compila limpo, e `teste_colidiu_marca_ao_bater_na_parede` falha em `fis_colidiu() == 1`. Os outros dois passam contra o stub, porque esperam zero — é esperado e correto.

- [ ] **Passo 5: Fazer `fis_passo` registrar a colisão**

Em `host/physics.c`, substituir o fim de `fis_passo`:

```c
    double nx = pos_x + v * cos(ang) * dt;
    double ny = pos_y + v * sin(ang) * dt;
    /* Bateu: gira mas não translada. É o comportamento de um robô real
       encostado numa parede. */
    if (!colide(nx, ny)) { pos_x = nx; pos_y = ny; bateu = 0; }
    else                 { bateu = 1; }
```

- [ ] **Passo 6: Rodar para confirmar que passam**

Rodar: `cd tests && make test`
Esperado: `todos os testes passaram` nos dois binários.

- [ ] **Passo 7: Commit**

```bash
git add host/physics.h host/physics.c tests/physics_test.c
git commit -m "Expõe colisão na física do robô virtual"
```

---

### Tarefa 2: A colisão chega ao navegador

O byte novo atravessa `robo_host` → bridge → `rede.js`.

**Arquivos:**
- Modificar: `host/main.c`, `bridge/server.js`, `web/rede.js`
- Modificar: `tests/host_test.sh`, `tests/bridge.test.js`

**Interfaces:**
- Consome: `fis_colidiu()` da Tarefa 1.
- Produz: linha `T <x_mm> <y_mm> <theta_decigraus> <dist_cm> <colidiu>`; quadro `0x83` de 10 bytes com `colidiu` em `byte 9`; `aoTelem` recebe `{x, y, theta, dist, colidiu}` com `colidiu` booleano.

- [ ] **Passo 1: Escrever o teste do bridge que deve falhar**

Substituir, em `tests/bridge.test.js`, o teste `'T vira quadro de telemetria com sinal preservado'` por:

```js
test('T vira quadro de telemetria com sinal preservado', () => {
  const q = paraQuadroDoNavegador('T 1000 400 2700 92 0');
  assert.strictEqual(q.length, 10);
  assert.strictEqual(q[0], 0x83);
  assert.strictEqual(q.readInt16LE(1), 1000);
  assert.strictEqual(q.readInt16LE(3), 400);
  assert.strictEqual(q.readInt16LE(5), 2700);
  assert.strictEqual(q.readUInt16LE(7), 92);
  assert.strictEqual(q[9], 0);
});

test('T carrega o byte de colisão', () => {
  assert.strictEqual(paraQuadroDoNavegador('T 1000 400 2700 92 1')[9], 1);
});

test('T sem o campo de colisão assume que não bateu', () => {
  const q = paraQuadroDoNavegador('T 1000 400 2700 92');
  assert.strictEqual(q.length, 10);
  assert.strictEqual(q[9], 0);
});
```

- [ ] **Passo 2: Rodar para confirmar que falham**

Rodar: `node --test tests/bridge.test.js`
Esperado: FALHA nos três — o quadro ainda tem 9 bytes.

- [ ] **Passo 3: Ampliar o quadro no bridge**

Em `bridge/server.js`, dentro de `paraQuadroDoNavegador`, substituir o bloco `if (p[0] === 'T')`:

```js
  if (p[0] === 'T') {
    const q = Buffer.alloc(10);
    q[0] = T_TELEM;
    q.writeInt16LE(Number(p[1]) | 0, 1);
    q.writeInt16LE(Number(p[2]) | 0, 3);
    q.writeInt16LE(Number(p[3]) | 0, 5);
    q.writeUInt16LE(Number(p[4]) & 0xffff, 7);
    q[9] = Number(p[5]) ? 1 : 0;      /* ausente vira 0 */
    return q;
  }
```

- [ ] **Passo 4: Rodar para confirmar que passam**

Rodar: `node --test tests/bridge.test.js`
Esperado: 11 testes passando.

- [ ] **Passo 5: Escrever o teste do host que deve falhar**

Em `tests/host_test.sh`, acrescentar antes da linha `[ "$falhas" -eq 0 ]`:

```bash
# A linha T precisa trazer cinco campos: x, y, theta, distância e colisão.
CAMPOS_T=$(printf '%s\n' "$SAIDA" | grep '^T ' | head -n 1 | wc -w)
if [ "$CAMPOS_T" -eq 6 ]; then
    echo "  ok: linha T tem os cinco campos mais o prefixo"
else
    echo "  FALHOU: linha T tem $CAMPOS_T palavras, esperava 6"
    falhas=$((falhas + 1))
fi
```

- [ ] **Passo 6: Rodar para confirmar que falha**

Rodar: `./tests/host_test.sh`
Esperado: `FALHOU: linha T tem 5 palavras, esperava 6`.

- [ ] **Passo 7: Emitir o campo no host**

Em `host/main.c`, substituir `emitir_telem`:

```c
static void emitir_telem(void) {
    double x, y, th;
    fis_pose(&x, &y, &th);
    double graus = th * 180.0 / M_PI;
    if (graus < 0.0) graus += 360.0;
    printf("T %d %d %d %u %d\n",
           (int)(x * 1000.0 + 0.5),
           (int)(y * 1000.0 + 0.5),
           (int)(graus * 10.0 + 0.5),
           (unsigned)fis_distancia_cm(),
           fis_colidiu());
}
```

- [ ] **Passo 8: Rodar para confirmar que passa**

Rodar: `./tests/host_test.sh`
Esperado: `todos os testes passaram`.

- [ ] **Passo 9: Ler o byte no navegador**

Em `web/rede.js`, dentro de `ws.onmessage`, substituir o `case T_TELEM`:

```js
        case T_TELEM:
          if (manipuladores.aoTelem) {
            manipuladores.aoTelem({
              x: d.getInt16(1, true) / 1000,
              y: d.getInt16(3, true) / 1000,
              theta: (d.getInt16(5, true) / 10) * Math.PI / 180,
              dist: d.getUint16(7, true),
              colidiu: d.byteLength > 9 && d.getUint8(9) === 1,
            });
          }
          break;
```

`d.byteLength > 9` deixa a página tolerar um servidor antigo que ainda mande 9 bytes, em vez de estourar.

- [ ] **Passo 10: Commit**

```bash
git add host/main.c bridge/server.js web/rede.js tests/host_test.sh tests/bridge.test.js
git commit -m "Leva a colisão da física até o navegador"
```

---

### Tarefa 3: Som sintetizado

Tabela de sons como dado puro, testável no Node; a síntese é uma casca fina em cima.

**Arquivos:**
- Criar: `web/som.js`, `tests/som.test.js`

**Interfaces:**
- Produz: `Som.SONS` (objeto de nome → array de `{hz, ms, tipo}`), `Som.tocar(nome)`, `Som.mudo()` (devolve booleano), `Som.alternarMudo()` (inverte e devolve o novo estado).

- [ ] **Passo 1: Escrever os testes que devem falhar**

`tests/som.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Som = require('../web/som.js');

test('existe um som para cada evento da interface', () => {
  for (const nome of ['play', 'comando', 'batida', 'fim']) {
    assert.ok(Array.isArray(Som.SONS[nome]), `faltou o som "${nome}"`);
    assert.ok(Som.SONS[nome].length > 0, `o som "${nome}" está vazio`);
  }
});

test('toda nota tem frequência audível e duração curta', () => {
  for (const [nome, notas] of Object.entries(Som.SONS)) {
    for (const n of notas) {
      assert.ok(n.hz >= 100 && n.hz <= 4000, `${nome}: ${n.hz} Hz fora da faixa`);
      assert.ok(n.ms > 0 && n.ms <= 400, `${nome}: ${n.ms} ms fora da faixa`);
    }
  }
});

test('o som de fim sobe, que é o que soa como vitória', () => {
  const hz = Som.SONS.fim.map((n) => n.hz);
  assert.strictEqual(hz.length, 3);
  assert.ok(hz[0] < hz[1] && hz[1] < hz[2], `esperava subida, veio ${hz}`);
});

test('a batida é mais grave que o comando', () => {
  assert.ok(Som.SONS.batida[0].hz < Som.SONS.comando[0].hz);
});

test('tocar um som que não existe não estoura', () => {
  assert.doesNotThrow(() => Som.tocar('inexistente'));
});

test('alternarMudo inverte o estado', () => {
  const antes = Som.mudo();
  assert.strictEqual(Som.alternarMudo(), !antes);
  assert.strictEqual(Som.mudo(), !antes);
  Som.alternarMudo();
  assert.strictEqual(Som.mudo(), antes);
});
```

- [ ] **Passo 2: Rodar para confirmar que falham**

Rodar: `node --test tests/som.test.js`
Esperado: FALHA — `Cannot find module '../web/som.js'`.

- [ ] **Passo 3: Implementar**

`web/som.js`:

```js
/* Bipes sintetizados por Web Audio. Nenhum arquivo de áudio: o flash da ESP32
   não tem orçamento para asset de som, e síntese custa zero byte. */
(function (raiz) {
  'use strict';

  /* Cada som é uma sequência de notas. Dado puro, para poder ser testado
     fora do navegador — a síntese abaixo é uma casca fina em cima disto. */
  const SONS = {
    play:    [{ hz: 660, ms: 60,  tipo: 'square' }],
    comando: [{ hz: 880, ms: 45,  tipo: 'square' }],
    batida:  [{ hz: 160, ms: 140, tipo: 'sawtooth' }],
    fim:     [{ hz: 523, ms: 110, tipo: 'square' },
              { hz: 659, ms: 110, tipo: 'square' },
              { hz: 784, ms: 200, tipo: 'square' }],
  };

  const CHAVE = 'robo_mudo';
  let mudoAgora = false;
  let ctx = null;

  const temArmazenamento = typeof localStorage !== 'undefined';
  if (temArmazenamento) mudoAgora = localStorage.getItem(CHAVE) === '1';

  function mudo() { return mudoAgora; }

  function alternarMudo() {
    mudoAgora = !mudoAgora;
    if (temArmazenamento) localStorage.setItem(CHAVE, mudoAgora ? '1' : '0');
    return mudoAgora;
  }

  function contexto() {
    if (ctx) return ctx;
    const Classe = typeof AudioContext !== 'undefined' ? AudioContext
                 : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
    if (!Classe) return null;
    ctx = new Classe();
    return ctx;
  }

  function tocar(nome) {
    const notas = SONS[nome];
    if (!notas || mudoAgora) return;
    const c = contexto();
    if (!c) return;                       /* fora do navegador: silêncio */
    /* O navegador só libera áudio depois de um gesto do usuário. */
    if (c.state === 'suspended') c.resume();

    let quando = c.currentTime;
    for (const n of notas) {
      const osc = c.createOscillator();
      const vol = c.createGain();
      osc.type = n.tipo;
      osc.frequency.value = n.hz;
      /* Rampa curta nas pontas: sem ela, cada nota estala. */
      vol.gain.setValueAtTime(0.0001, quando);
      vol.gain.exponentialRampToValueAtTime(0.2, quando + 0.01);
      vol.gain.exponentialRampToValueAtTime(0.0001, quando + n.ms / 1000);
      osc.connect(vol).connect(c.destination);
      osc.start(quando);
      osc.stop(quando + n.ms / 1000 + 0.02);
      quando += n.ms / 1000;
    }
  }

  const api = { SONS, tocar, mudo, alternarMudo };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Som = api;
})(typeof self !== 'undefined' ? self : globalThis);
```

- [ ] **Passo 4: Rodar para confirmar que passam**

Rodar: `node --test tests/som.test.js`
Esperado: 6 testes passando.

- [ ] **Passo 5: Commit**

```bash
git add web/som.js tests/som.test.js
git commit -m "Adiciona som sintetizado sem arquivo de áudio"
```

---

### Tarefa 4: O campo de bolinhas

A única peça de Blockly sob medida do ciclo.

**Arquivos:**
- Criar: `web/campos.js`, `tests/campos.test.js`

**Interfaces:**
- Produz: `Campos.paraBolinhas(n)` — devolve a string de bolinhas; `Campos.registrar()` — registra o campo `field_bolinhas` no Blockly, idempotente.

- [ ] **Passo 1: Escrever os testes que devem falhar**

`tests/campos.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Campos = require('../web/campos.js');

test('a quantidade vira bolinhas cheias e vazias', () => {
  assert.strictEqual(Campos.paraBolinhas(2), '●●○○○');
  assert.strictEqual(Campos.paraBolinhas(3), '●●●○○');
  assert.strictEqual(Campos.paraBolinhas(5), '●●●●●');
});

test('a faixa é de 2 a 5, e valores fora dela são trazidos para dentro', () => {
  assert.strictEqual(Campos.paraBolinhas(0), '●●○○○');
  assert.strictEqual(Campos.paraBolinhas(99), '●●●●●');
});

test('valor não numérico não estoura', () => {
  assert.doesNotThrow(() => Campos.paraBolinhas(undefined));
  assert.strictEqual(Campos.paraBolinhas(undefined), '●●○○○');
});
```

- [ ] **Passo 2: Rodar para confirmar que falham**

Rodar: `node --test tests/campos.test.js`
Esperado: FALHA — `Cannot find module '../web/campos.js'`.

- [ ] **Passo 3: Implementar**

`web/campos.js`:

```js
/* FieldBolinhas: o mesmo campo numérico do "repetir", desenhado como bolinhas
   em vez de algarismo. É o que permite o bloco existir no nível Pequeno sem
   virar um bloco diferente. */
(function (raiz) {
  'use strict';

  /* Cinco casas fixas: as vazias mostram à criança que dá para pedir mais.
     A largura não muda com o valor, senão o bloco pularia de tamanho a cada
     clique. */
  const MIN = 2, MAX = 5;

  function paraBolinhas(n) {
    let v = Math.round(Number(n));
    if (!isFinite(v)) v = MIN;
    if (v < MIN) v = MIN;
    if (v > MAX) v = MAX;
    return '●'.repeat(v) + '○'.repeat(MAX - v);
  }

  /* Só faz sentido no navegador, onde Blockly existe. */
  function registrar() {
    if (typeof Blockly === 'undefined') return false;
    if (Blockly.fieldRegistry.hasOwnProperty &&
        raiz.__bolinhasRegistrado) return true;

    class FieldBolinhas extends Blockly.FieldNumber {
      constructor(valor, opcoes) {
        super(valor, MIN, MAX, 1, undefined, opcoes);
      }
      static fromJson(opcoes) {
        return new FieldBolinhas(opcoes.value, opcoes);
      }
      /* É isto que troca o algarismo pelas bolinhas na tela. */
      getText() {
        return paraBolinhas(this.getValue());
      }
      /* Clicar avança a quantidade em vez de abrir teclado numérico —
         criança de 4 anos não digita. */
      showEditor_() {
        const v = Math.round(Number(this.getValue()));
        this.setValue(v >= MAX ? MIN : v + 1);
      }
    }

    Blockly.fieldRegistry.register('field_bolinhas', FieldBolinhas);
    raiz.__bolinhasRegistrado = true;
    return true;
  }

  const api = { paraBolinhas, registrar, MIN, MAX };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Campos = api;
})(typeof self !== 'undefined' ? self : globalThis);
```

- [ ] **Passo 4: Rodar para confirmar que passam**

Rodar: `node --test tests/campos.test.js`
Esperado: 3 testes passando.

- [ ] **Passo 5: Commit**

```bash
git add web/campos.js tests/campos.test.js
git commit -m "Adiciona campo de bolinhas para o nível Pequeno"
```

---

### Tarefa 5: Velocidade no compilador

O `MOTOR` sempre aceitou qualquer valor. Só faltava o compilador passar.

**Arquivos:**
- Modificar: `web/compilador.js`
- Modificar: `tests/compilador.test.js`

**Interfaces:**
- Consome: nada novo.
- Produz: os nós `frente` e `tras` da AST aceitam `velocidade` opcional; sem ela, continua `VEL_FRENTE` (200).

- [ ] **Passo 1: Escrever os testes que devem falhar**

Adicionar em `tests/compilador.test.js`:

```js
test('velocidade escolhida vira o MOTOR com aquele valor', () => {
  const { bytes } = compilar([
    { op: 'frente', segundos: 1, velocidade: 255, blockId: 'b1' },
  ]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(dv.getInt16(1, true), 255);
  assert.strictEqual(dv.getInt16(3, true), 255);
});

test('velocidade também vale para trás, com sinal negativo', () => {
  const { bytes } = compilar([
    { op: 'tras', segundos: 1, velocidade: 120, blockId: 'b1' },
  ]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(dv.getInt16(1, true), -120);
});

test('sem velocidade continua usando 200, como a v1', () => {
  const { bytes } = compilar([{ op: 'frente', segundos: 1, blockId: 'b1' }]);
  assert.strictEqual(new DataView(bytes.buffer).getInt16(1, true), 200);
});

test('velocidade absurda é trazida para a faixa do motor', () => {
  const { bytes } = compilar([
    { op: 'frente', segundos: 1, velocidade: 9999, blockId: 'b1' },
  ]);
  assert.strictEqual(new DataView(bytes.buffer).getInt16(1, true), 255);
});

test('o passo fixo do Pequeno gera o mesmo bytecode que andar frente 0.5 s', () => {
  const pequeno = compilar([{ op: 'frente', segundos: 0.5, blockId: 'p' }]);
  const medio   = compilar([{ op: 'frente', segundos: 0.5, blockId: 'm' }]);
  assert.deepStrictEqual([...pequeno.bytes], [...medio.bytes]);
  assert.strictEqual(new DataView(pequeno.bytes.buffer).getInt16(8, true), 500);
});

test('ângulo livre vira TURN com o ângulo pedido, não 90 fixo', () => {
  const { bytes } = compilar([{ op: 'girar', graus: 45, blockId: 'g' }]);
  const dv = new DataView(bytes.buffer);
  assert.strictEqual(bytes[0], OP.TURN);
  assert.strictEqual(dv.getInt16(1, true), 45);
});
```

- [ ] **Passo 2: Rodar para confirmar que falham**

Rodar: `node --test tests/compilador.test.js`
Esperado: FALHA nos quatro primeiros. O do passo fixo e o do ângulo livre já
passam — a v1 já fazia isso certo. São testes de regressão que travam o
comportamento, e é esperado que passem desde já.

- [ ] **Passo 3: Implementar**

Em `web/compilador.js`, dentro de `gerar`, substituir os casos `frente` e `tras`:

```js
          case 'frente': {
            const v = velocidadeDe(no);
            emitir(OP.MOTOR, v, v, 0, no.blockId);
            emitir(OP.WAIT, Math.round(no.segundos * 1000), 0, 0, no.blockId);
            emitir(OP.MOTOR, 0, 0, 0, no.blockId);
            break;
          }

          case 'tras': {
            const v = velocidadeDe(no);
            emitir(OP.MOTOR, -v, -v, 0, no.blockId);
            emitir(OP.WAIT, Math.round(no.segundos * 1000), 0, 0, no.blockId);
            emitir(OP.MOTOR, 0, 0, 0, no.blockId);
            break;
          }
```

E acrescentar, logo acima de `function gerar(nos) {`:

```js
    /* O nível Pequeno e o Médio não expõem velocidade; sem ela, vale a
       calibração da v1. Acima de 255 o driver satura, então cortamos aqui. */
    function velocidadeDe(no) {
      const v = Math.round(Number(no.velocidade));
      if (!isFinite(v) || v <= 0) return VEL_FRENTE;
      return v > 255 ? 255 : v;
    }
```

- [ ] **Passo 4: Rodar para confirmar que passam**

Rodar: `node --test tests/compilador.test.js`
Esperado: 18 testes passando.

- [ ] **Passo 5: Commit**

```bash
git add web/compilador.js tests/compilador.test.js
git commit -m "Aceita velocidade escolhida nos blocos de movimento"
```

---

### Tarefa 6: Blocos com ícone, palavras escondíveis e campo único de verdade

Duas mudanças que andam juntas.

A primeira: o `girar` passa a ter `GRAUS` como fonte de verdade e o menu
direita/esquerda vira só um editor amigável dela. É isso que deixa o compilador
ignorar o nível.

A segunda: **as palavras dos blocos viram campos `field_label` nomeados.** Sem
isso, esconder o número no nível Pequeno deixaria `⬆ andar frente  s` na tela —
texto solto justamente no nível de quem não lê. Só um campo pode receber
`setVisible(false)`; texto cru no `message0` fica para sempre.

O ícone (`⬆`, `⏸`, `🔁`) continua sendo texto cru do `message0`, porque ele deve
aparecer em todos os níveis.

Uma exceção assumida: no Pequeno, o menu `DIR` do `girar` **continua visível**,
mostrando `↷ direita`. Esconder tudo deixaria o bloco sem nada que diga para que
lado ele vira, e o ícone lidera a leitura. É a única palavra que sobra no nível
Pequeno.

**Arquivos:**
- Modificar: `web/blocos.js`
- Criar: `tests/blocos.test.js`

**Interfaces:**
- Consome: `Campos.registrar()` da Tarefa 4.
- Produz: blocos com os campos `T1`/`T2` (rótulos de palavra), `SEG` e `VEL` (movimento), `DIR` e `GRAUS` (girar), `N` (repetir, do tipo `field_bolinhas`), `CM` (sensor). `Blocos.workspaceParaAst` lê `GRAUS` e `VEL`. O módulo passa a exportar por `module.exports` no Node, mantendo `raiz.Blocos` no navegador.

- [ ] **Passo 1: Escrever os testes que devem falhar**

`tests/blocos.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Blockly = require('../web/vendor/blockly_compressed.js');
globalThis.Blockly = Blockly;
const Campos = require('../web/campos.js');
const Blocos = require('../web/blocos.js');

Campos.registrar();
Blocos.definir();

/* Monta um workspace headless com um programa e devolve a AST. */
function astDe(estado) {
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [estado] } }, ws);
  return Blocos.workspaceParaAst(ws);
}

test('girar lê o campo GRAUS, não o menu', () => {
  const ast = astDe({
    type: 'quando_play',
    inputs: { CORPO: { block: { type: 'girar', fields: { GRAUS: 45 } } } },
  });
  assert.strictEqual(ast.length, 1);
  assert.strictEqual(ast[0].op, 'girar');
  assert.strictEqual(ast[0].graus, 45);
});

test('escolher esquerda no menu escreve -90 em GRAUS', () => {
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(
    { blocks: { languageVersion: 0, blocks: [{ type: 'girar' }] } }, ws);
  const b = ws.getBlocksByType('girar', false)[0];
  b.setFieldValue('-90', 'DIR');
  assert.strictEqual(Number(b.getFieldValue('GRAUS')), -90);
});

test('o bloco de movimento carrega a velocidade para a AST', () => {
  const ast = astDe({
    type: 'quando_play',
    inputs: { CORPO: { block: {
      type: 'mover_frente', fields: { SEG: 2, VEL: '255' },
    } } },
  });
  assert.strictEqual(ast[0].segundos, 2);
  assert.strictEqual(ast[0].velocidade, 255);
});

test('repetir usa o campo de bolinhas', () => {
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(
    { blocks: { languageVersion: 0, blocks: [{ type: 'repetir' }] } }, ws);
  const campo = ws.getBlocksByType('repetir', false)[0].getField('N');
  assert.strictEqual(campo.constructor.name, 'FieldBolinhas');
});

test('os seis blocos continuam sendo seis', () => {
  for (const t of ['mover_frente', 'mover_tras', 'girar', 'esperar',
                   'repetir', 'se_obstaculo', 'quando_play']) {
    assert.ok(Blockly.Blocks[t], `faltou o bloco ${t}`);
  }
});

test('as palavras dos blocos são campos, para poderem sumir no Pequeno', () => {
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [
    { type: 'mover_frente' }, { type: 'girar' },
  ] } }, ws);
  const m = ws.getBlocksByType('mover_frente', false)[0];
  assert.ok(m.getField('T1'), 'faltou o rótulo "andar frente" como campo');
  assert.ok(m.getField('T2'), 'faltou o rótulo "s" como campo');
  const g = ws.getBlocksByType('girar', false)[0];
  assert.ok(g.getField('T1'), 'faltou o rótulo "girar" como campo');
  assert.ok(g.getField('T2'), 'faltou o rótulo "graus" como campo');
});

test('definir() duas vezes não estoura por extensão repetida', () => {
  assert.doesNotThrow(() => Blocos.definir());
});
```

- [ ] **Passo 2: Rodar para confirmar que falham**

Rodar: `node --test tests/blocos.test.js`
Esperado: FALHA — não existe campo `GRAUS`, nem `VEL`, e `N` ainda é `FieldNumber`.

- [ ] **Passo 3: Implementar**

Em `web/blocos.js`, substituir os seis blocos dentro de `Blockly.defineBlocksWithJsonArray` (o `quando_play` fica como está):

```js
      {
        type: 'mover_frente',
        /* O ícone é texto cru porque aparece em todos os níveis; as palavras
           são campos porque precisam sumir no Pequeno. */
        message0: '⬆ %1 %2 %3 %4',
        args0: [
          { type: 'field_label', name: 'T1', text: 'andar frente' },
          { type: 'field_number', name: 'SEG', value: 1, min: 0.1, max: 10, precision: 0.1 },
          { type: 'field_label', name: 'T2', text: 's' },
          { type: 'field_dropdown', name: 'VEL', options: [
            ['normal', '200'], ['devagar', '120'], ['rápido', '255'],
          ] },
        ],
        previousStatement: null,
        nextStatement: null,
        colour: COR_MOVIMENTO,
        tooltip: 'O robô anda para frente pelo tempo escolhido.',
      },
      {
        type: 'mover_tras',
        message0: '⬇ %1 %2 %3 %4',
        args0: [
          { type: 'field_label', name: 'T1', text: 'andar trás' },
          { type: 'field_number', name: 'SEG', value: 1, min: 0.1, max: 10, precision: 0.1 },
          { type: 'field_label', name: 'T2', text: 's' },
          { type: 'field_dropdown', name: 'VEL', options: [
            ['normal', '200'], ['devagar', '120'], ['rápido', '255'],
          ] },
        ],
        previousStatement: null,
        nextStatement: null,
        colour: COR_MOVIMENTO,
        tooltip: 'O robô anda de ré pelo tempo escolhido.',
      },
      {
        type: 'girar',
        message0: '%1 %2 %3 %4',
        args0: [
          { type: 'field_label', name: 'T1', text: 'girar' },
          { type: 'field_dropdown', name: 'DIR', options: [
            ['↷ direita', '90'], ['↶ esquerda', '-90'],
          ] },
          { type: 'field_number', name: 'GRAUS', value: 90, min: -180, max: 180, precision: 5 },
          { type: 'field_label', name: 'T2', text: 'graus' },
        ],
        extensions: ['girar_dir_escreve_graus'],
        previousStatement: null,
        nextStatement: null,
        colour: COR_MOVIMENTO,
        tooltip: 'O robô gira no lugar.',
      },
      {
        type: 'esperar',
        message0: '⏸ %1 %2 %3',
        args0: [
          { type: 'field_label', name: 'T1', text: 'esperar' },
          { type: 'field_number', name: 'SEG', value: 1, min: 0.1, max: 10, precision: 0.1 },
          { type: 'field_label', name: 'T2', text: 's' },
        ],
        previousStatement: null,
        nextStatement: null,
        colour: COR_MOVIMENTO,
        tooltip: 'O robô fica parado pelo tempo escolhido.',
      },
      {
        type: 'repetir',
        message0: '🔁 %1 %2 %3',
        args0: [
          { type: 'field_label', name: 'T1', text: 'repetir' },
          { type: 'field_bolinhas', name: 'N', value: 4 },
          { type: 'field_label', name: 'T2', text: 'vezes' },
        ],
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_LACO,
        tooltip: 'Repete os blocos de dentro o número de vezes escolhido.',
      },
      {
        type: 'se_obstaculo',
        message0: '👁 %1 %2 %3',
        args0: [
          { type: 'field_label', name: 'T1', text: 'se obstáculo a menos de' },
          { type: 'field_number', name: 'CM', value: 20, min: 2, max: 400, precision: 1 },
          { type: 'field_label', name: 'T2', text: 'cm' },
        ],
        message1: '%1',
        args1: [{ type: 'input_statement', name: 'CORPO' }],
        previousStatement: null,
        nextStatement: null,
        colour: COR_SENSOR,
        tooltip: 'Só faz os blocos de dentro se tiver algo perto na frente.',
      },
```

Registrar a extensão **fora** de `definir()`, no corpo do módulo, logo antes da
declaração de `definir`. Fora, e não dentro, porque `Blockly.Extensions.register`
estoura se o mesmo nome for registrado duas vezes, e `definir()` é chamada de
novo pelos testes:

```js
  let extensaoPronta = false;

  /* GRAUS é a fonte de verdade; o menu direita/esquerda é só um editor
     amigável dela. É isso que deixa o compilador ignorar o nível. */
  function registrarExtensao() {
    if (extensaoPronta || typeof Blockly === 'undefined') return;
    if (Blockly.Extensions.isRegistered &&
        Blockly.Extensions.isRegistered('girar_dir_escreve_graus')) {
      extensaoPronta = true;
      return;
    }
    Blockly.Extensions.register('girar_dir_escreve_graus', function () {
      const bloco = this;
      bloco.getField('DIR').setValidator(function (novo) {
        bloco.setFieldValue(Number(novo), 'GRAUS');
        return novo;
      });
    });
    extensaoPronta = true;
  }
```

E chamar `registrarExtensao();` como primeira linha de `definir()`.

Por fim, em `blocoParaNo`, substituir os casos de movimento e giro:

```js
      case 'mover_frente':
        return { op: 'frente', segundos: Number(b.getFieldValue('SEG')),
                 velocidade: Number(b.getFieldValue('VEL')), blockId: id };
      case 'mover_tras':
        return { op: 'tras', segundos: Number(b.getFieldValue('SEG')),
                 velocidade: Number(b.getFieldValue('VEL')), blockId: id };
      case 'girar':
        return { op: 'girar', graus: Number(b.getFieldValue('GRAUS')), blockId: id };
```

E, no rodapé do arquivo, exportar também para o Node, trocando a última linha:

```js
  const api = { definir, workspaceParaAst, CAIXA_XML };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Blocos = api;
})(typeof self !== 'undefined' ? self : globalThis);
```

- [ ] **Passo 4: Rodar para confirmar que passam**

Rodar: `node --test tests/blocos.test.js`
Esperado: 5 testes passando.

- [ ] **Passo 5: Rodar a suíte inteira do Node**

Rodar: `node --test tests/`
Esperado: tudo passando. O compilador não muda de comportamento — `girar` já
lia um ângulo, só que do campo `DIR`.

- [ ] **Passo 6: Commit**

```bash
git add web/blocos.js tests/blocos.test.js
git commit -m "Dá ícone aos blocos e campo único de verdade ao girar"
```

---

### Tarefa 7: Os três níveis

**Arquivos:**
- Criar: `web/niveis.js`, `tests/niveis.test.js`

**Interfaces:**
- Consome: os blocos da Tarefa 6.
- Produz: `Niveis.LISTA` (`['pequeno','medio','grande']`), `Niveis.NOMES` (rótulos em português), `Niveis.definicao(nivel)`, `Niveis.caixaXml(nivel)`, `Niveis.aplicar(workspace, nivel)`, `Niveis.atual()`, `Niveis.definir(nivel)`.

- [ ] **Passo 1: Escrever os testes que devem falhar**

`tests/niveis.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Blockly = require('../web/vendor/blockly_compressed.js');
globalThis.Blockly = Blockly;
const Campos = require('../web/campos.js');
globalThis.Blocos = require('../web/blocos.js');
const Niveis = require('../web/niveis.js');

Campos.registrar();
Blocos.definir();

test('a caixa do Pequeno oferece só movimento e repetir', () => {
  const xml = Niveis.caixaXml('pequeno');
  for (const t of ['mover_frente', 'mover_tras', 'girar', 'repetir']) {
    assert.ok(xml.includes(t), `faltou ${t} no Pequeno`);
  }
  assert.ok(!xml.includes('esperar'), 'Pequeno não deve ter esperar');
  assert.ok(!xml.includes('se_obstaculo'), 'Pequeno não deve ter o sensor');
});

test('o Pequeno oferece girar já preenchido para os dois lados', () => {
  const xml = Niveis.caixaXml('pequeno');
  assert.ok(xml.includes('>90<'), 'faltou o girar de 90');
  assert.ok(xml.includes('>-90<'), 'faltou o girar de -90');
});

test('Médio e Grande oferecem os seis blocos', () => {
  for (const nivel of ['medio', 'grande']) {
    const xml = Niveis.caixaXml(nivel);
    for (const t of ['mover_frente', 'mover_tras', 'girar', 'esperar',
                     'repetir', 'se_obstaculo']) {
      assert.ok(xml.includes(t), `faltou ${t} no ${nivel}`);
    }
  }
});

/* Cria um workspace com um bloco de movimento e um de giro. */
function bancada() {
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [
    { type: 'mover_frente', fields: { SEG: 0.5, VEL: '200' } },
    { type: 'girar', fields: { GRAUS: 90 } },
  ] } }, ws);
  return ws;
}

test('no Pequeno o tempo e a velocidade ficam escondidos', () => {
  const ws = bancada();
  Niveis.aplicar(ws, 'pequeno');
  const b = ws.getBlocksByType('mover_frente', false)[0];
  assert.strictEqual(b.getField('SEG').isVisible(), false);
  assert.strictEqual(b.getField('VEL').isVisible(), false);
});

test('no Pequeno as palavras somem junto com o número', () => {
  const ws = bancada();
  Niveis.aplicar(ws, 'pequeno');
  const b = ws.getBlocksByType('mover_frente', false)[0];
  assert.strictEqual(b.getField('T1').isVisible(), false,
    'sobrou "andar frente" num nível para quem não lê');
  assert.strictEqual(b.getField('T2').isVisible(), false,
    'sobrou o "s" solto na tela');
});

test('no Médio o tempo aparece e a velocidade continua escondida', () => {
  const ws = bancada();
  Niveis.aplicar(ws, 'medio');
  const b = ws.getBlocksByType('mover_frente', false)[0];
  assert.strictEqual(b.getField('SEG').isVisible(), true);
  assert.strictEqual(b.getField('VEL').isVisible(), false);
});

test('no Grande aparece tudo, e o giro troca o menu pelo ângulo', () => {
  const ws = bancada();
  Niveis.aplicar(ws, 'grande');
  const m = ws.getBlocksByType('mover_frente', false)[0];
  assert.strictEqual(m.getField('VEL').isVisible(), true);
  const g = ws.getBlocksByType('girar', false)[0];
  assert.strictEqual(g.getField('GRAUS').isVisible(), true);
  assert.strictEqual(g.getField('DIR').isVisible(), false);
});

test('subir de nível preserva o valor que estava escondido', () => {
  const ws = bancada();
  Niveis.aplicar(ws, 'pequeno');
  const b = ws.getBlocksByType('mover_frente', false)[0];
  assert.strictEqual(Number(b.getFieldValue('SEG')), 0.5);
  Niveis.aplicar(ws, 'medio');
  assert.strictEqual(Number(b.getFieldValue('SEG')), 0.5);
});

test('descer de nível guarda o valor em vez de perder', () => {
  const ws = bancada();
  Niveis.aplicar(ws, 'medio');
  const b = ws.getBlocksByType('mover_frente', false)[0];
  b.setFieldValue(3, 'SEG');
  Niveis.aplicar(ws, 'pequeno');
  Niveis.aplicar(ws, 'medio');
  assert.strictEqual(Number(b.getFieldValue('SEG')), 3);
});

test('nível desconhecido cai no Médio em vez de quebrar', () => {
  assert.strictEqual(Niveis.definicao('inventado'), Niveis.definicao('medio'));
});
```

- [ ] **Passo 2: Rodar para confirmar que falham**

Rodar: `node --test tests/niveis.test.js`
Esperado: FALHA — `Cannot find module '../web/niveis.js'`.

- [ ] **Passo 3: Implementar**

`web/niveis.js`:

```js
/* Os três níveis. Um bloco nunca troca de tipo entre eles — muda quais campos
   ficam visíveis e o que a caixa oferece. É isso que faz a criança nunca perder
   trabalho ao subir de nível. */
(function (raiz) {
  'use strict';

  const LISTA = ['pequeno', 'medio', 'grande'];
  const NOMES = { pequeno: 'Pequeno', medio: 'Médio', grande: 'Grande' };

  const COR_MOVIMENTO = 210, COR_LACO = 120, COR_SENSOR = 20;

  /* T1 e T2 são as palavras dos blocos. Elas são campos justamente para poderem
     sumir no Pequeno — se fossem texto cru do message0, sobrariam na tela
     coisas como "⬆ andar frente  s" depois de esconder o número. */
  const DEFINICOES = {
    pequeno: {
      blocos: ['mover_frente', 'mover_tras', 'girar', 'repetir'],
      /* campo -> visível neste nível? */
      campos: { T1: false, T2: false, SEG: false, VEL: false,
                DIR: true, GRAUS: false, N: true, CM: true },
    },
    medio: {
      blocos: ['mover_frente', 'mover_tras', 'girar', 'esperar', 'repetir', 'se_obstaculo'],
      campos: { T1: true, T2: true, SEG: true, VEL: false,
                DIR: true, GRAUS: false, N: true, CM: true },
    },
    grande: {
      blocos: ['mover_frente', 'mover_tras', 'girar', 'esperar', 'repetir', 'se_obstaculo'],
      campos: { T1: true, T2: true, SEG: true, VEL: true,
                DIR: false, GRAUS: true, N: true, CM: true },
    },
  };

  function definicao(nivel) {
    return DEFINICOES[nivel] || DEFINICOES.medio;
  }

  /* No Pequeno os blocos saem da caixa já preenchidos: meio segundo de
     movimento e um quarto de volta para cada lado. */
  const PRE_PREENCHIDO = {
    pequeno: {
      mover_frente: '<field name="SEG">0.5</field>',
      mover_tras:   '<field name="SEG">0.5</field>',
      girar:        null,   /* tratado à parte: são duas entradas */
    },
  };

  function bloco(tipo, campos) {
    return '<block type="' + tipo + '">' + (campos || '') + '</block>';
  }

  function caixaXml(nivel) {
    const def = definicao(nivel);
    const tem = (t) => def.blocos.indexOf(t) >= 0;
    const pre = PRE_PREENCHIDO[nivel] || {};

    let movimento = '';
    if (tem('mover_frente')) movimento += bloco('mover_frente', pre.mover_frente);
    if (tem('mover_tras'))   movimento += bloco('mover_tras', pre.mover_tras);
    if (tem('girar')) {
      if (nivel === 'pequeno') {
        /* Duas entradas do mesmo bloco, uma por lado — sem menu para ler. */
        movimento += bloco('girar', '<field name="GRAUS">90</field>');
        movimento += bloco('girar', '<field name="GRAUS">-90</field>');
      } else {
        movimento += bloco('girar');
      }
    }
    if (tem('esperar')) movimento += bloco('esperar');

    let xml = '<xml id="caixa" style="display: none">';
    xml += '<category name="Movimento" colour="' + COR_MOVIMENTO + '">' + movimento + '</category>';
    if (tem('repetir')) {
      xml += '<category name="Repetir" colour="' + COR_LACO + '">' +
             bloco('repetir') + '</category>';
    }
    if (tem('se_obstaculo')) {
      xml += '<category name="Sentidos" colour="' + COR_SENSOR + '">' +
             bloco('se_obstaculo') + '</category>';
    }
    xml += '</xml>';
    return xml;
  }

  /* Esconder um campo do Blockly não apaga o valor dele — é exatamente por
     isso que subir e descer de nível não perde nada. */
  function aplicar(workspace, nivel) {
    const campos = definicao(nivel).campos;
    for (const b of workspace.getAllBlocks(false)) {
      for (const nome of Object.keys(campos)) {
        const campo = b.getField(nome);
        if (campo) campo.setVisible(campos[nome]);
      }
      if (b.render) b.render();
    }
  }

  const CHAVE = 'robo_nivel';
  const temArmazenamento = typeof localStorage !== 'undefined';

  function atual() {
    const v = temArmazenamento ? localStorage.getItem(CHAVE) : null;
    return LISTA.indexOf(v) >= 0 ? v : 'medio';
  }

  function definir(nivel) {
    const v = LISTA.indexOf(nivel) >= 0 ? nivel : 'medio';
    if (temArmazenamento) localStorage.setItem(CHAVE, v);
    return v;
  }

  const api = { LISTA, NOMES, definicao, caixaXml, aplicar, atual, definir };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Niveis = api;
})(typeof self !== 'undefined' ? self : globalThis);
```

- [ ] **Passo 4: Rodar para confirmar que passam**

Rodar: `node --test tests/niveis.test.js`
Esperado: 10 testes passando.

Se `setVisible` não existir na versão vendorizada do Blockly, conferir com
`node -e "const B=require('./web/vendor/blockly_compressed.js'); console.log(typeof B.Field.prototype.setVisible)"`.
Esperado: `function`.

- [ ] **Passo 5: Commit**

```bash
git add web/niveis.js tests/niveis.test.js
git commit -m "Adiciona os três níveis por idade"
```

---

### Tarefa 8: O robô vira personagem

A decisão de qual reação mostrar é função pura, testável fora do navegador. O desenho é a casca.

**Arquivos:**
- Criar: `web/robo.js`, `tests/robo.test.js`
- Modificar: `web/arena.js`

**Interfaces:**
- Consome: nada.
- Produz: `Robo.reacao(estado)` — devolve `'tonto' | 'feliz' | 'dormindo' | 'normal'`; `Robo.desenhar(ctx, pose, reacao, ms)`. `arena.js` deixa de desenhar o robô e passa a expor só `Arena.desenhar(ctx, estado)` com o mundo e o feixe.

- [ ] **Passo 1: Escrever os testes que devem falhar**

`tests/robo.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Robo = require('../web/robo.js');

const base = { msDesdeColisao: 99999, msDesdeFim: 99999, msParado: 0 };

test('andando sem novidade, o robô fica normal', () => {
  assert.strictEqual(Robo.reacao({ ...base }), 'normal');
});

test('acabou de bater, fica tonto', () => {
  assert.strictEqual(Robo.reacao({ ...base, msDesdeColisao: 200 }), 'tonto');
});

test('a tontura passa', () => {
  assert.strictEqual(Robo.reacao({ ...base, msDesdeColisao: 3000 }), 'normal');
});

test('acabou de terminar o programa, comemora', () => {
  assert.strictEqual(Robo.reacao({ ...base, msDesdeFim: 300 }), 'feliz');
});

test('parado há muito tempo, cochila', () => {
  assert.strictEqual(Robo.reacao({ ...base, msParado: 30000 }), 'dormindo');
});

test('bater ganha da comemoração: o susto é mais recente', () => {
  assert.strictEqual(
    Robo.reacao({ ...base, msDesdeColisao: 100, msDesdeFim: 100 }), 'tonto');
});

test('comemorar ganha do sono', () => {
  assert.strictEqual(
    Robo.reacao({ ...base, msDesdeFim: 300, msParado: 30000 }), 'feliz');
});

test('estado incompleto não estoura', () => {
  assert.doesNotThrow(() => Robo.reacao({}));
  assert.strictEqual(Robo.reacao({}), 'normal');
});
```

- [ ] **Passo 2: Rodar para confirmar que falham**

Rodar: `node --test tests/robo.test.js`
Esperado: FALHA — `Cannot find module '../web/robo.js'`.

- [ ] **Passo 3: Implementar**

`web/robo.js`:

```js
/* O robô virtual como personagem. A decisão de qual reação mostrar é função
   pura, para poder ser testada fora do navegador; o desenho é a casca. */
(function (raiz) {
  'use strict';

  const RAIO_M = 0.08;
  const MS_TONTO = 1200;
  const MS_FELIZ = 2000;
  const MS_SONO  = 20000;

  /* Ordem de prioridade: o susto ganha da festa, que ganha do sono. */
  function reacao(estado) {
    const e = estado || {};
    const num = (v) => (typeof v === 'number' && isFinite(v) ? v : Infinity);
    if (num(e.msDesdeColisao) < MS_TONTO) return 'tonto';
    if (num(e.msDesdeFim) < MS_FELIZ) return 'feliz';
    if (typeof e.msParado === 'number' && e.msParado > MS_SONO) return 'dormindo';
    return 'normal';
  }

  function desenhar(ctx, pose, qual, ms) {
    const px = ctx.canvas.width;
    const LADO_M = 2.0;
    const m = (v) => (v / LADO_M) * px;
    const my = (v) => px - (v / LADO_M) * px;

    const cx = m(pose.x), cy = my(pose.y), r = m(RAIO_M);
    const pulo = qual === 'feliz' ? Math.abs(Math.sin(ms / 120)) * r * 0.35 : 0;

    ctx.save();
    ctx.translate(cx, cy - pulo);

    /* corpo */
    ctx.fillStyle = qual === 'dormindo' ? '#7a9fd4' : '#1f6feb';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    /* Os olhos ficam do lado para onde ele aponta — é o que dá a leitura
       imediata de "para onde esse bicho vai". */
    const dx = Math.cos(pose.theta), dy = -Math.sin(pose.theta);
    const ox = dx * r * 0.38, oy = dy * r * 0.38;
    const perpX = -dy * r * 0.34, perpY = dx * r * 0.34;

    for (const s of [1, -1]) {
      const ex = ox + perpX * s, ey = oy + perpY * s;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.26, 0, Math.PI * 2);
      ctx.fill();

      if (qual === 'dormindo' || qual === 'feliz') {
        /* olho fechado: um traço */
        ctx.strokeStyle = '#123';
        ctx.lineWidth = Math.max(2, r * 0.1);
        ctx.beginPath();
        ctx.moveTo(ex - r * 0.16, ey);
        ctx.lineTo(ex + r * 0.16, ey);
        ctx.stroke();
      } else {
        const tremor = qual === 'tonto' ? Math.sin(ms / 40 + s) * r * 0.08 : 0;
        ctx.fillStyle = '#123';
        ctx.beginPath();
        ctx.arc(ex + dx * r * 0.08 + tremor, ey + dy * r * 0.08, r * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (qual === 'tonto') {
      ctx.fillStyle = '#e0a81e';
      ctx.font = `bold ${Math.round(r * 0.75)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      for (let k = 0; k < 3; k++) {
        const a = ms / 220 + (k * Math.PI * 2) / 3;
        ctx.fillText('✦', Math.cos(a) * r * 1.5, -r * 1.25 + Math.sin(a) * r * 0.35);
      }
    }

    if (qual === 'dormindo') {
      ctx.fillStyle = '#5b7fb0';
      ctx.font = `bold ${Math.round(r * 0.7)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      const sobe = (ms / 22) % (r * 2.2);
      ctx.fillText('z', r * 0.9, -r * 1.1 - sobe);
    }

    ctx.restore();
  }

  const api = { reacao, desenhar, RAIO_M, MS_TONTO, MS_FELIZ, MS_SONO };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Robo = api;
})(typeof self !== 'undefined' ? self : globalThis);
```

- [ ] **Passo 4: Rodar para confirmar que passam**

Rodar: `node --test tests/robo.test.js`
Esperado: 8 testes passando.

- [ ] **Passo 5: Tirar o robô de `arena.js`**

Em `web/arena.js`, apagar os dois blocos finais de `desenhar` — o comentário
`/* corpo */` e o `/* nariz, para a criança ver para onde ele aponta */`, com o
código deles — deixando a função terminar logo depois do `ctx.stroke()` do feixe.
O arquivo passa a desenhar arena, obstáculos e feixe, e nada mais.

- [ ] **Passo 6: Commit**

```bash
git add web/robo.js web/arena.js tests/robo.test.js
git commit -m "Transforma o robô virtual em personagem com reações"
```

---

### Tarefa 9: Fiação

O seletor de nível, o mudo, o destaque reforçado e as reações ligados na página.

**Arquivos:**
- Modificar: `web/index.html`, `web/app.js`

**Interfaces:**
- Consome: `Som`, `Campos`, `Niveis`, `Robo`, `Arena`, `Compilador`, `Blocos`, `Rede`.
- Produz: a página completa do Ciclo A.

- [ ] **Passo 1: Acrescentar os controles no `index.html`**

Substituir o `<header>` inteiro por:

```html
  <header>
    <h1>Robô de Blocos</h1>
    <span id="erro"></span>
    <label id="rotulo-nivel">nível
      <select id="nivel">
        <option value="pequeno">Pequeno</option>
        <option value="medio">Médio</option>
        <option value="grande">Grande</option>
      </select>
    </label>
    <button id="mudo" title="ligar e desligar o som">🔊</button>
    <button id="play">▶ PLAY</button>
    <button id="parar" disabled>■ PARAR</button>
    <span id="estado">conectando…</span>
  </header>
```

Acrescentar os scripts novos, antes de `app.js`:

```html
  <script src="campos.js"></script>
  <script src="som.js"></script>
  <script src="niveis.js"></script>
  <script src="robo.js"></script>
```

Acrescentar ao `<style>`:

```css
  #rotulo-nivel { font-size: 14px; color: #445; }
  #nivel { font-size: 15px; padding: 6px 8px; border-radius: 8px;
           border: 1px solid #ccd3db; }
  #mudo { background: #64748b; font-size: 16px; padding: 8px 12px; }
  #mudo.silenciado { background: #cbd5e1; color: #64748b; }
  /* O halo do Blockly é discreto demais para uma tela de criança, e não expõe
     classe para estilizar. Marcamos o bloco por conta própria. */
  .blocklyDraggable.aceso > .blocklyPath {
    stroke: #ffb703 !important;
    stroke-width: 4px !important;
    animation: pulsar .7s ease-in-out infinite;
  }
  @keyframes pulsar {
    0%, 100% { stroke-opacity: 1; }
    50%      { stroke-opacity: .35; }
  }
  #confete { position: fixed; inset: 0; pointer-events: none; z-index: 50; }
```

E, logo depois de `<main>`, antes de `</body>`:

```html
  <canvas id="confete"></canvas>
```

- [ ] **Passo 2: Reescrever `web/app.js`**

```js
(function () {
  'use strict';

  const btPlay = document.getElementById('play');
  const btParar = document.getElementById('parar');
  const btMudo = document.getElementById('mudo');
  const selNivel = document.getElementById('nivel');
  const spEstado = document.getElementById('estado');
  const spErro = document.getElementById('erro');
  const divLeitura = document.getElementById('leitura');
  const ctx = document.getElementById('arena').getContext('2d');
  const painel = document.getElementById('painel');
  const confete = document.getElementById('confete');

  let mapaPc = [];
  let blocoAceso = null;
  let robo = null;
  let viuTelemetria = false;
  let poseAtual = null;
  let rodando = false;

  let tColisao = -Infinity, tFim = -Infinity, tParado = Date.now();
  let confetes = [];

  Campos.registrar();
  Blocos.definir();

  let nivel = Niveis.atual();
  selNivel.value = nivel;

  const workspace = Blockly.inject('editor', {
    toolbox: Niveis.caixaXml(nivel),
    trashcan: true,
    zoom: { controls: true, startScale: 1.0 },
    grid: { spacing: 22, length: 3, colour: '#dde3ea', snap: true },
  });

  /* O bloco raiz nasce fixo: a criança não precisa saber que ele existe. */
  const raiz = Blockly.serialization.blocks.append(
    { type: 'quando_play', x: 40, y: 30 }, workspace);
  raiz.setDeletable(false);
  raiz.setMovable(false);

  Niveis.aplicar(workspace, nivel);
  /* Bloco novo arrastado da caixa também precisa nascer no nível certo. */
  workspace.addChangeListener((e) => {
    if (e.type === Blockly.Events.BLOCK_CREATE) Niveis.aplicar(workspace, nivel);
  });

  atualizarMudo();

  /* ---------- destaque ---------- */

  function acender(id) {
    if (blocoAceso === id) return;
    if (blocoAceso) marcar(blocoAceso, false);
    blocoAceso = id;
    if (id) marcar(id, true);
  }

  function marcar(id, ligado) {
    const b = workspace.getBlockById(id);
    if (!b || !b.getSvgRoot) return;
    b.getSvgRoot().classList.toggle('aceso', ligado);
  }

  /* ---------- confete ---------- */

  function soltarConfete() {
    confete.width = window.innerWidth;
    confete.height = window.innerHeight;
    const cores = ['#ffb703', '#1f9d4d', '#1f6feb', '#e0533d', '#a855f7'];
    confetes = [];
    for (let i = 0; i < 90; i++) {
      confetes.push({
        x: Math.random() * confete.width,
        y: -20 - Math.random() * confete.height * 0.4,
        vx: (Math.random() - 0.5) * 2,
        vy: 2 + Math.random() * 3,
        cor: cores[i % cores.length],
        giro: Math.random() * Math.PI,
      });
    }
  }

  function desenharConfete() {
    const c = confete.getContext('2d');
    c.clearRect(0, 0, confete.width, confete.height);
    if (confetes.length === 0) return;
    let vivos = 0;
    for (const p of confetes) {
      p.x += p.vx; p.y += p.vy; p.giro += 0.1;
      if (p.y < confete.height + 20) vivos++;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.giro);
      c.fillStyle = p.cor;
      c.fillRect(-4, -6, 8, 12);
      c.restore();
    }
    if (vivos === 0) confetes = [];
  }

  /* ---------- laço de desenho ---------- */

  function quadro() {
    const agora = Date.now();
    Arena.desenhar(ctx, poseAtual);
    if (poseAtual) {
      const qual = Robo.reacao({
        msDesdeColisao: agora - tColisao,
        msDesdeFim: agora - tFim,
        msParado: rodando ? 0 : agora - tParado,
      });
      Robo.desenhar(ctx, poseAtual, qual, agora);
    }
    desenharConfete();
    requestAnimationFrame(quadro);
  }
  requestAnimationFrame(quadro);

  /* ---------- estado ---------- */

  function definirRodando(estaRodando) {
    if (rodando && !estaRodando) {
      tFim = Date.now();
      tParado = Date.now();
      Som.tocar('fim');
      soltarConfete();
    }
    rodando = estaRodando;
    btPlay.disabled = estaRodando || !robo || !robo.pronto();
    btParar.disabled = !estaRodando;
    spEstado.textContent = estaRodando ? 'rodando' : 'parado';
    if (!estaRodando) acender(null);
  }

  function conectar() {
    const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:';
    robo = Rede.conectar(`${protocolo}//${location.host}/`, {
      aoConectar() {
        spEstado.textContent = 'parado';
        btPlay.disabled = false;
      },
      aoDesconectar() {
        spEstado.textContent = 'desconectado';
        btPlay.disabled = true;
        btParar.disabled = true;
        setTimeout(conectar, 1500);
      },
      aoPc(pc) {
        const id = pc < mapaPc.length ? mapaPc[pc] : null;
        if (id && id !== blocoAceso) Som.tocar('comando');
        acender(id);
      },
      aoEstado(estado) {
        definirRodando(estado === 1);
      },
      aoTelem(t) {
        if (!viuTelemetria) { viuTelemetria = true; painel.style.display = 'flex'; }
        poseAtual = t;
        if (t.colidiu && Date.now() - tColisao > Robo.MS_TONTO) {
          tColisao = Date.now();
          Som.tocar('batida');
        }
        divLeitura.textContent = `distância: ${t.dist} cm`;
      },
    });
  }

  /* Sem telemetria por 2 s significa robô real: esconde a arena. */
  setTimeout(() => { if (!viuTelemetria) painel.style.display = 'none'; }, 2000);

  /* ---------- controles ---------- */

  btPlay.addEventListener('click', () => {
    spErro.textContent = '';
    Som.tocar('play');
    let compilado;
    try {
      compilado = Compilador.compilar(Blocos.workspaceParaAst(workspace));
    } catch (e) {
      spErro.textContent = e.message;
      return;
    }
    mapaPc = compilado.pcMap;
    robo.carregar(compilado.bytes);
    robo.rodar();
  });

  btParar.addEventListener('click', () => robo.parar());

  function atualizarMudo() {
    const m = Som.mudo();
    btMudo.textContent = m ? '🔇' : '🔊';
    btMudo.classList.toggle('silenciado', m);
  }

  btMudo.addEventListener('click', () => {
    Som.alternarMudo();
    atualizarMudo();
  });

  selNivel.addEventListener('change', () => {
    nivel = Niveis.definir(selNivel.value);
    selNivel.value = nivel;
    /* A caixa muda, o programa montado não. */
    workspace.updateToolbox(Niveis.caixaXml(nivel));
    Niveis.aplicar(workspace, nivel);
  });

  conectar();
})();
```

- [ ] **Passo 3: Conferir à mão**

```bash
cd host && make && cd ..
node bridge/server.js
```

Abrir `http://localhost:8080` e conferir, em ordem:

1. O seletor mostra `Médio` e os seis blocos aparecem na caixa.
2. Trocar para `Pequeno`: a caixa fica com quatro blocos, e os que já estão na tela perdem os números.
3. Voltar para `Médio`: os números reaparecem com os valores de antes.
4. Montar `repetir` com `andar frente` e `girar`, apertar PLAY: o bloco em execução fica com contorno laranja pulsando, o robô tem olhos que apontam para onde ele anda, e sai som.
5. Deixar o robô bater numa parede: estrelinhas e som grave.
6. Esperar o programa terminar: pulinho, três notas e confete.
7. Apertar o botão de som: ele fica cinza e o som some.

- [ ] **Passo 4: Commit**

```bash
git add web/index.html web/app.js
git commit -m "Liga o seletor de nível, o som e as reações do robô"
```

---

### Tarefa 10: O teste de navegador

Promove a teste permanente o driver que pegou dois defeitos que a suíte inteira deixou passar.

**Arquivos:**
- Criar: `tests/cdp.js`, `tests/navegador.test.js`
- Modificar: `.gitignore`

**Interfaces:**
- Consome: bridge e `robo_host` prontos.
- Produz: `tests/cdp.js` exportando `Ws`, `pegarJson`, `espera`; `tests/navegador.test.js` rodável por `node --test`.

- [ ] **Passo 1: Criar o cliente CDP**

`tests/cdp.js`:

```js
'use strict';
/* Cliente WebSocket mínimo para falar Chrome DevTools Protocol. Sem npm, igual
   ao resto do projeto — o bridge já provou que dá para escrever WebSocket à mão. */

const net = require('net');
const http = require('http');
const crypto = require('crypto');

function pegarJson(url) {
  return new Promise((ok, erro) => {
    http.get(url, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => { try { ok(JSON.parse(d)); } catch (e) { erro(e); } });
    }).on('error', erro);
  });
}

class Ws {
  constructor(url) {
    const u = new URL(url);
    this.prox = 1;
    this.pend = new Map();
    this.buf = Buffer.alloc(0);
    this.apertou = false;
    this.pronto = new Promise((ok) => (this._ok = ok));
    this.sock = net.connect(Number(u.port), u.hostname, () => {
      this.sock.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\n` +
        'Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\n' +
        `Sec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\n\r\n`);
    });
    this.sock.on('data', (p) => this._dados(p));
  }

  _dados(pedaco) {
    this.buf = Buffer.concat([this.buf, pedaco]);
    if (!this.apertou) {
      const i = this.buf.indexOf('\r\n\r\n');
      if (i < 0) return;
      this.buf = this.buf.subarray(i + 4);
      this.apertou = true;
      this._ok();
    }
    for (;;) {
      if (this.buf.length < 2) return;
      let tam = this.buf[1] & 0x7f, off = 2;
      if (tam === 126) {
        if (this.buf.length < 4) return;
        tam = this.buf.readUInt16BE(2); off = 4;
      } else if (tam === 127) {
        if (this.buf.length < 10) return;
        tam = Number(this.buf.readBigUInt64BE(2)); off = 10;
      }
      if (this.buf.length < off + tam) return;
      const carga = this.buf.subarray(off, off + tam).toString();
      this.buf = this.buf.subarray(off + tam);
      let m;
      try { m = JSON.parse(carga); } catch (_) { continue; }
      if (m.id && this.pend.has(m.id)) {
        const { ok, erro } = this.pend.get(m.id);
        this.pend.delete(m.id);
        m.error ? erro(new Error(JSON.stringify(m.error))) : ok(m.result);
      } else if (m.method && this.aoEvento) {
        /* Mensagem sem id é evento do navegador, não resposta nossa. */
        this.aoEvento(m);
      }
    }
  }

  envia(metodo, params = {}) {
    const id = this.prox++;
    const carga = Buffer.from(JSON.stringify({ id, method: metodo, params }));
    const mascara = crypto.randomBytes(4);
    const n = carga.length;
    let cab;
    if (n < 126) cab = Buffer.from([0x81, 0x80 | n]);
    else if (n < 65536) {
      cab = Buffer.alloc(4); cab[0] = 0x81; cab[1] = 0xfe; cab.writeUInt16BE(n, 2);
    } else {
      cab = Buffer.alloc(10); cab[0] = 0x81; cab[1] = 0xff;
      cab.writeBigUInt64BE(BigInt(n), 2);
    }
    const corpo = Buffer.from(carga);
    for (let i = 0; i < corpo.length; i++) corpo[i] ^= mascara[i % 4];
    this.sock.write(Buffer.concat([cab, mascara, corpo]));
    return new Promise((ok, erro) => this.pend.set(id, { ok, erro }));
  }

  fechar() { this.sock.destroy(); }
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { Ws, pegarJson, espera };
```

- [ ] **Passo 2: Escrever o teste**

`tests/navegador.test.js`:

```js
'use strict';
/* Sobe o bridge, dirige um Chromium headless e confere o que a criança veria.
   É o único nível em que dá para testar que trocar de nível não desmonta o
   programa dela. Pula sozinho se não houver Chromium na máquina. */

const test = require('node:test');
const assert = require('node:assert');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Ws, pegarJson, espera } = require('./cdp.js');

const RAIZ = path.join(__dirname, '..');
const PORTA_WEB = 8099, PORTA_CDP = 9333;

function acharChromium() {
  for (const c of ['chromium', 'chromium-browser', 'google-chrome', '/snap/bin/chromium']) {
    const r = spawnSync('which', [c], { encoding: 'utf8' });
    if (r.status === 0) return r.stdout.trim();
  }
  return null;
}

const CHROMIUM = acharChromium();

async function esperarPorta(url, limiteMs) {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    try { await pegarJson(url); return true; } catch (_) { await espera(300); }
  }
  return false;
}

test('a criança monta, roda e sobe de nível sem perder nada',
  { skip: CHROMIUM ? false : 'sem Chromium nesta máquina', timeout: 120000 },
  async (t) => {
    spawnSync('make', ['--silent'], { cwd: path.join(RAIZ, 'host') });

    const bridge = spawn('node', ['bridge/server.js'],
      { cwd: RAIZ, env: { ...process.env, PORTA: String(PORTA_WEB) }, stdio: 'ignore' });
    const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'robo-'));
    const chrome = spawn(CHROMIUM, [
      '--headless', '--disable-gpu', '--no-sandbox',
      `--remote-debugging-port=${PORTA_CDP}`,
      '--window-size=1400,900', `--user-data-dir=${perfil}`, 'about:blank',
    ], { stdio: 'ignore' });

    t.after(() => {
      chrome.kill();
      bridge.kill();
      fs.rmSync(perfil, { recursive: true, force: true });
    });

    assert.ok(await esperarPorta(`http://127.0.0.1:${PORTA_CDP}/json/version`, 40000),
      'Chromium não subiu');

    const alvos = await pegarJson(`http://127.0.0.1:${PORTA_CDP}/json/list`);
    const cdp = new Ws(alvos.find((a) => a.type === 'page').webSocketDebuggerUrl);
    await cdp.pronto;
    await cdp.envia('Runtime.enable');
    await cdp.envia('Page.enable');

    /* Uma página pode desenhar a casca inteira e mesmo assim estar quebrada
       por dentro. Recolhemos tudo que for exceção antes de navegar. */
    const erros = [];
    cdp.aoEvento = (m) => {
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        erros.push(d.exception ? (d.exception.description || d.text) : d.text);
      }
    };

    await cdp.envia('Page.navigate', { url: `http://localhost:${PORTA_WEB}/` });
    await espera(5000);

    const aval = async (expr) => {
      const r = await cdp.envia('Runtime.evaluate',
        { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(expr + ' -> ' + JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };

    assert.strictEqual(await aval('document.title'), 'Robô de Blocos');
    assert.strictEqual(await aval('typeof Blockly'), 'object');

    /* Monta no Pequeno: dois passos e um giro, sem número nenhum. */
    await aval(`(() => {
      document.getElementById('nivel').value = 'pequeno';
      document.getElementById('nivel').dispatchEvent(new Event('change'));
      const ws = Blockly.getMainWorkspace();
      Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
        type: 'quando_play', x: 40, y: 30,
        inputs: { CORPO: { block: {
          type: 'mover_frente', fields: { SEG: 0.5 },
          next: { block: { type: 'girar', fields: { GRAUS: 90 } } }
        } } }
      }] } }, ws);
      Niveis.aplicar(ws, 'pequeno');
      return 1;
    })()`);

    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace()
        .getBlocksByType('mover_frente', false)[0].getField('SEG').isVisible()`),
      false, 'no Pequeno o número não deveria aparecer');

    /* Sobe para Médio: o programa continua, o número aparece com o valor. */
    await aval(`(() => {
      const s = document.getElementById('nivel');
      s.value = 'medio'; s.dispatchEvent(new Event('change')); return 1;
    })()`);
    await espera(400);

    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace().getBlocksByType('mover_frente', false).length`),
      1, 'o programa sumiu ao trocar de nível');
    assert.strictEqual(
      await aval(`Blockly.getMainWorkspace()
        .getBlocksByType('mover_frente', false)[0].getField('SEG').isVisible()`),
      true, 'no Médio o número deveria aparecer');
    assert.strictEqual(
      await aval(`Number(Blockly.getMainWorkspace()
        .getBlocksByType('mover_frente', false)[0].getFieldValue('SEG'))`),
      0.5, 'o valor escondido não foi preservado');

    /* Roda e confere a sequência de blocos acesos. */
    await aval(`(() => {
      const ws = Blockly.getMainWorkspace();
      window.__seq = [];
      if (!ws.__orig) ws.__orig = ws.highlightBlock.bind(ws);
      document.getElementById('play').click();
      const alvo = document.getElementById('editor');
      window.__obs = new MutationObserver(() => {
        const el = alvo.querySelector('.aceso');
        const id = el && el.getAttribute('data-id');
        const b = id && ws.getBlockById(id);
        const tipo = b ? b.type : null;
        if (tipo && window.__seq[window.__seq.length - 1] !== tipo) window.__seq.push(tipo);
      });
      window.__obs.observe(alvo, { subtree: true, attributes: true,
                                   attributeFilter: ['class'] });
      return 1;
    })()`);

    for (let i = 0; i < 60; i++) {
      await espera(200);
      if ((await aval(`document.getElementById('estado').textContent`)) !== 'rodando' && i > 3) break;
    }

    const seq = await aval('JSON.stringify(window.__seq)');
    const blocos = JSON.parse(seq);
    assert.ok(blocos.includes('mover_frente'), `"andar frente" nunca acendeu: ${seq}`);
    assert.ok(blocos.includes('girar'), `"girar" nunca acendeu: ${seq}`);

    assert.strictEqual(await aval(`document.getElementById('estado').textContent`), 'parado');
    assert.strictEqual(await aval(`document.getElementById('parar').disabled`), true);

    assert.deepStrictEqual(erros, [], 'o console do navegador acusou erro');

    cdp.fechar();
  });
```

- [ ] **Passo 3: Rodar o teste**

Rodar: `node --test tests/navegador.test.js`
Esperado: 1 teste passando, ou pulado com `sem Chromium nesta máquina`.

Se o Chromium demorar a subir na primeira vez, o limite de 40 s do
`esperarPorta` cobre. Se falhar por `--no-sandbox` recusado, é ambiente com
sandbox obrigatório: rodar como usuário sem privilégio resolve.

- [ ] **Passo 4: Ignorar o perfil temporário**

Nada a acrescentar ao `.gitignore`: o perfil vai para `os.tmpdir()` e o teste o
apaga no `t.after`. Conferir que `git status` está limpo depois de rodar:

Rodar: `node --test tests/navegador.test.js && git status --short`
Esperado: nenhuma linha.

- [ ] **Passo 5: Commit**

```bash
git add tests/cdp.js tests/navegador.test.js
git commit -m "Adiciona teste que dirige o navegador de verdade"
```

---

## Como saber que acabou

```bash
cd tests && make test && cd ..      # VM, física e colisão
./tests/host_test.sh                # robô virtual de ponta a ponta
node --test tests/                  # compilador, bridge, som, campos, níveis, robô, navegador
cd firmware && pio run && cd ..     # o firmware continua compilando
```

O firmware não foi tocado neste ciclo; ele entra na lista só para provar que
continua de pé.

E o teste que nenhuma máquina faz: uma criança de 4 anos empilhando `⬆ ⬆ ↷` sem
ninguém explicar nada, e a mesma tela ainda interessando a uma de 10.
