# Revisão de código — 09/09/2026

Varredura do projeto inteiro (`core/`, `host/`, `bridge/`, `web/`, `firmware/`,
`android/`, `tests/`) procurando duas coisas: defeito que a criança encontra, e
atrito que atrapalha quem mexe no código.

Conferida contra o commit `0728410` («Alinha a numeração do relatório…»). Cada
achado foi revalidado nesse código — a primeira passagem foi escrita contra o
`1591fd1` e alguns já tinham sido consertados no meio do caminho; eles estão no
fim, na seção **G**, para não voltarem à lista por engano.

Cada item traz **onde**, **como reproduzir** e **o que fazer**. Ordenado por
prioridade, não por arquivo. O que foi provado rodando está marcado
**(provado)**; o que saiu da leitura está marcado **(por leitura)**.

Números: 280 testes JS + os quatro binários em C passam. A suíte leva 293 s, dos
quais 292,65 s são o `tests/gabaritos.test.js` sozinho.

> **Segunda passagem.** Este documento levou uma auditoria depois de escrito, e
> ela achou seis coisas: uma correção proposta que abria um defeito pior (B1),
> um limite recomendado que quebraria o giro e ainda assim não protegia o
> bytecode (A1), uma descrição errada do sintoma do dado (A2), um «não dá para
> desfazer» que era «não dá para descobrir» (C2), uma cobertura de teste
> exagerada (E5), e a contagem de testes carregada da passagem anterior sem
> refazer a conta. Os seis estão corrigidos abaixo, e o que foi corrigido está
> marcado no lugar. As correções valem a leitura por si: são o tipo de erro que
> passa quando se lê código sem rodá-lo.

---

## A. Defeitos que a criança encontra

### A1. Um número grande no campo vira silêncio — (provado)

`web/compilador.js:290-292` escreve o operando da instrução com `dv.setInt16`.
O campo `numero` (`web/campos.js:131`) não tem `min` nem `max`. Então:

```
andar frente [100] s  →  msDe(100) = 100000  →  PUSH -31072  →  WAIT ms<0 → 0
```

Provado agora, contra o `0728410`:

| o que a criança monta | o que o robô recebe | o que acontece |
|---|---|---|
| `andar frente 100 s` | `PUSH -31072` | não anda nada |
| `esperar 40 s` | `PUSH -25536` | não espera nada |
| `repetir 50000` | `PUSH -15536` → `SET_REG` corta em 1 | repete uma vez |

O teto real é 32,7 s para qualquer campo de segundos, e 32767 para o `repetir` —
e nada na tela diz isso. É o pior tipo de defeito para este projeto: a criança
pediu uma coisa, o robô fez outra, e a conclusão dela é que ela errou.

**Isto ficou mais fácil de alcançar, não menos.** O `web/teclado.js` novo existe
justamente para a criança conseguir digitar 6 no lugar de encaixar `2 × 3`, e ele
não tem limite de algarismos (`apertar()`, linha 124: `texto = texto + tecla`,
sem teto). Quem ganhou o teclado ganhou também o caminho curto para 100.

**O que fazer — e aqui a primeira versão desta revisão errou duas vezes.**

Ela recomendava `min=0, max=30` no bloco `numero` e um teto de quatro algarismos
no teclado. As duas estão erradas, e a auditoria pegou as duas:

- **O `numero` é um bloco só, compartilhado.** Ele mora no `SEG`, no `CM`, no
  `N`, no `GRAUS` e dentro de toda conta do Gigante (`web/niveis.js:38-55`).
  `max=30` mataria o giro de 90°, e `min=0` mataria o giro à esquerda — que a
  caixa do Pequeno entrega pronto com `-90` (`niveis.js:138-140`). Um limite no
  bloco é um limite em todos os encaixes ao mesmo tempo, e eles não querem a
  mesma faixa.
- **Quatro algarismos não protegem nada.** Provado: `esperar 9999 s` →
  `PUSH -28008`. O estouro não é de dígitos, é de milissegundos — o `msDe`
  multiplica por 1000, então qualquer coisa acima de 32,7 s estoura, e 33 já
  basta (`esperar 33 s` → `PUSH -32536`).

O que vale, então:

1. **A guarda obrigatória é no compilador, e ela é a única que não pode
   faltar.** No `emitir` (`compilador.js:51`), recusar operando fora de
   −32768..32767 com a mesma frase gentil do `conferirProfundidade`: *«Esse
   número é grande demais para o robô.»* Um `PUSH` que não cabe é defeito de
   compilador, e compilador que trunca em silêncio é o que nos trouxe aqui.
   Esta sozinha já transforma «o robô não anda» em «o robô explica».
2. **O limite amigável, se houver, é por encaixe e não por bloco.** O
   `web/campos.js` já sabe de qual encaixe o número veio — é exatamente o que o
   `tituloDoCampo()` faz para escolher entre «Quantos segundos?» e «Quantos
   graus?». A mesma tabela pode carregar a faixa: `SEG` 0..30, `CM` 0..400,
   `GRAUS` −360..360, `N` 1..100. O teclado consulta a faixa do encaixe que
   abriu e recusa a tecla que passaria dela — que é o «não cabe» mais suave que
   existe para quem tem quatro anos.

Testes: um em `tests/compilador.test.js` para o operando fora de faixa (com
`esperar 33` e `esperar 9999`, que são os dois casos provados aqui), e um em
`tests/teclado.test.js` por encaixe se a faixa contextual for feita.

### A2. O `🎲 aleatório` não é aleatório — (por leitura, mecanismo claro)

`core/vm.c:142`:

```c
r = lo + (int32_t)(hal_millis() % (uint32_t)(hi - lo + 1));
```

`hal_millis()` é monotônico, e o sintoma real é pior do que a primeira versão
desta revisão descreveu. Ela dizia que os sorteios saem «em sequência»
(1, 2, 3, 4, 5…). Saem, sim, mas só quando estão separados por um `esperar` ou
um `andar` que deixe o relógio andar. **Num laço apertado eles saem
constantes**: o `host/laco.c:155` executa até 256 instruções no mesmo quadro,
todas dentro do mesmo milissegundo, então o `%` devolve sempre o mesmo número.
Duzentos sorteios seguidos de `aleatorio(1,5)` deram o mesmo valor, todos.

Pelo mesmo motivo, `aleatorio(1,6) + aleatorio(1,6)` tem os dois dados sempre
caindo iguais: os dois `BIN` acontecem no mesmo milissegundo.

Ironia registrada: o `.ino` gerado faz certo (`randomSeed(micros())`,
`web/arduino.js`). O robô de blocos é o que sorteia mal.

**O que fazer:** um LCG de quatro linhas no `vm.c`, semeado no `vm_run` com
`hal_millis()`:

```c
static uint32_t semente;
static uint32_t proximo(void) { semente = semente * 1103515245u + 12345u; return semente >> 16; }
```

Determinístico por semente — o que mantém `tests/vm_test.c` possível — e
aleatório o bastante para um dado.

**O teste precisa de três coisas, e «saiu mais de um valor» não é nenhuma
delas** — esse critério passa por acidente assim que dois sorteios calham de cair
em milissegundos diferentes, que é justamente o caso que já funciona hoje. Com o
relógio falso do `tests/` na mão, dá para exigir o que importa:

1. com o relógio **parado**, dois sorteios seguidos dão valores independentes —
   é este que falha contra a VM de hoje, e é o teste que prova o conserto;
2. a mesma semente produz a mesma sequência, byte a byte — é o que mantém o
   resto da suíte determinístico;
3. sementes diferentes produzem sequências diferentes.

### A3. Pedir o gabarito destrava o bloco `▶ quando apertar PLAY` — (por leitura)

`web/blocos.js:557-563` cria a âncora e a fixa com `setDeletable(false)` e
`setMovable(false)`. Mas `web/app.js:258-262` monta o gabarito com

```js
Blockly.serialization.workspaces.load(Gabarito.montar(...), workspace);
```

que **substitui o workspace inteiro**. O `quando_play` que nasce daí vem do JSON
de `gabarito.js:133`, que não carrega `deletable` nem `movable` — e o padrão dos
dois é `true`. Depois de apertar «me mostra como faz», a criança consegue
arrastar e apagar a âncora, e aí o PLAY não tem por onde começar.

Vale lembrar quem aperta esse botão: é a criança que já falhou três vezes.

**O que fazer:** refixar depois do load, uma linha:

```js
var raiz = workspace.getBlocksByType('quando_play', false)[0];
if (raiz) { raiz.setDeletable(false); raiz.setMovable(false); }
```

Vale um teste no `navegador.test.js`, que é onde a âncora já é olhada.

### A4. Uma URL torta derruba o servidor da sala inteira — (provado)

`bridge/server.js:49` chama `decodeURIComponent` sem guarda. Provado:

```
$ curl 'http://127.0.0.1:8199/%E0%A4%A'
URIError: URI malformed
    at Server.<anonymous> (bridge/server.js:49:54)
[processo morre]
```

Não é hipótese de segurança: é um tablet de criança com um caractere estranho na
barra de endereço tirando o robô virtual de todo mundo do ar.

**O que fazer:** envolver em `try/catch` e responder 400. E, no mesmo lugar
(linha 50), apertar a guarda de travessia — `arquivo.startsWith(RAIZ_WEB)` deixa
passar um irmão chamado `web-outro`; o certo é `startsWith(RAIZ_WEB + path.sep)`.

### A5. Na ESP32 a versão na tela é literalmente `%VERSAO%` — (por leitura)

`android/preparar_assets.sh` troca o carimbo pelo commit; `bridge/server.js:21`
o calcula na hora de servir. `firmware/preparar_data.sh` **não faz nem um nem
outro** — copia o HTML cru e gzipa. (`grep -c VERSAO firmware/preparar_data.sh`
→ 0.)

Justo no lugar onde o carimbo mais serve. O README conta a história do iPad que
rodou por horas uma versão velha em cache; na placa, que é onde não há
ferramenta de diagnóstico nenhuma, o campo que responderia essa pergunta mostra
um marcador não substituído.

**O que fazer:** as duas linhas do script do Android, antes do `gzip`:

```bash
VERSAO=$(git -C .. rev-parse --short HEAD 2>/dev/null || echo "solto")
sed -i "s/%VERSAO%/$VERSAO/g" data/*.html
```

### A6. O botão «voltar» do Android joga fora o programa da criança — (por leitura)

`MainActivity.kt` não trata `onBackPressed` (`grep` → 0 ocorrências). Um toque no
«voltar» fecha a Activity, o WebView some, e o programa montado se perde —
exatamente a perda que `App.irPara` foi escrita para evitar («recarregar
apagaria o programa que a criança montou», `web/app.js:760-761`).

**O que fazer:** um `OnBackPressedCallback` que peça confirmação com a mesma
caixa `#confirma` que já existe, ou que só deixe sair com a tela vazia. O gesto
de sair não deveria ser mais barato que o de trocar de nível.

### A7. `setWebContentsDebuggingEnabled(true)` sem condição — (por leitura)

`MainActivity.kt:48`. Vale muito agora, enquanto o app está sendo provado no
aparelho. Mas precisa sair antes de qualquer APK que saia da sua mão: envolver
em `if (BuildConfig.DEBUG)`.

Na mesma linha, `PonteJs.salvarIno` devolve sempre `"robo.ino"`, mas o
MediaStore renomeia para `robo (1).ino` quando já existe. A tela diz «salvo em
Downloads/robo.ino» e o arquivo tem outro nome. O `insert` devolve a URI real —
dá para ler o `DISPLAY_NAME` de volta dela e devolver o nome verdadeiro.

### A8. Uma queda de conexão chama o `aoDesconectar` duas vezes — (por leitura, hoje inofensivo)

`web/rede.js:14-15` liga `onclose` **e** `onerror` ao mesmo tratador, e uma
conexão que falha dispara os dois. O `geracaoDaConexao` (`app.js:480`) segura o
estrago: o primeiro `setTimeout` que acorda chama `conectar()`, que incrementa a
geração, e o segundo se descarta sozinho no `souAtual()`. Não há avalanche.

Mas o corpo do `aoDesconectar` roda duas vezes — mexe na tela, limpa a distância,
agenda um temporizador extra — e a proteção mora longe da causa, no chamador.
Uma trava de reentrada dentro do `rede.js` custa três linhas e faz o contrato
ficar honesto: «cai uma vez, avisa uma vez».

```js
var caiu = false;
function avisarQueda() { if (caiu) return; caiu = true; if (manipuladores.aoDesconectar) manipuladores.aoDesconectar(); }
ws.onclose = avisarQueda;
ws.onerror = avisarQueda;
```

---

## B. Fidelidade: o ensaio anda menos que o robô

### B1. O tempo simulado atrasa em relação ao relógio da VM — (por leitura)

Dois relógios convivem no robô virtual e não estão de acordo:

- a VM mede espera com `hal_millis()`, que é o `CLOCK_MONOTONIC` de verdade
  (`host/relogio.c`);
- a física anda um passo **fixo** de 5 ms por volta do laço
  (`host/laco.c:166`, `fis_passo(LACO_FRAME_MS / 1000.0)`);
- e o laço dorme 5 ms **além** do trabalho que fez (`host/main.c:46`).

Cada volta gasta 5 ms + trabalho de relógio, mas só 5 ms de mundo. Num
`andar frente 1 s`, a VM solta os motores depois de 1000 ms reais enquanto a
física andou o equivalente a uns 950. O robô virtual percorre sistematicamente
**menos** do que a calibração diz — e a calibração é justamente o contrato que
faz o ensaio valer para o robô real.

Isso importa mais agora que as velocidades foram medidas no robô de verdade: um
ensaio 5% curto é 5% de erro que não vem do robô, vem do laço.

Hoje o desvio está escondido pela folga do `RAIO = 0.16` das missões, que é por
onde `tests/gabaritos.test.js` passa. Mas é a mesma família de erro que o README
descreve nos vãos do labirinto: no papel cabe, na prática raspa.

**O que fazer — e aqui a primeira versão desta revisão propôs uma correção que
abria um defeito pior que o que fechava.** Ela era isto:

```c
static uint32_t anterior;              /* ERRADO: ver abaixo */
uint32_t agora = hal_millis();
fis_passo((agora - anterior) / 1000.0);
anterior = agora;
```

Dois furos, os dois confirmados:

- **O robô atravessa parede.** O `host/physics.c:89` testa a colisão só na
  posição **final** do passo: `if (!colide(nx, ny))`. Com `dt` grande — uma
  máquina carregada, o app em segundo plano, um `nanosleep` que dormiu demais —
  o salto passa por cima do obstáculo inteiro e a chegada é do outro lado.
  Reproduzido com `dt = 5.5`: o robô atravessou a parede de `y = 1,40..1,60`,
  parou em `y = 1,694` e relatou `colidiu = 0`. Trocar um erro de 5% de distância
  por um robô que atravessa o labirinto é péssimo negócio.
- **O primeiro passo depende do tempo desde o boot.** `anterior` começa em zero
  e `hal_millis()` não, então o primeiro `fis_passo` recebe o *uptime* inteiro.
  Precisa ser inicializado no `laco_init()`, junto com o resto do estado.

A correção certa tem três partes:

1. inicializar `anterior = hal_millis()` no `laco_init()`;
2. **limitar** o `dt` a um teto (uns 20 ms) — um quadro perdido não é motivo
   para teletransportar o robô, e prender o tempo simulado é mais honesto que
   inventar movimento que ninguém viu;
3. **subdividir** o passo: `fis_passo` avança em fatias de no máximo
   `LACO_FRAME_MS`, testando colisão em cada uma. Isso conserta o furo do
   `dt` grande *e* o furo que já existe hoje — a 0,30 m/s um passo de 5 ms anda
   1,5 mm, folgado contra o raio de 8 cm, mas nada no código garante isso, e o
   próximo aumento de `V_MAX` o gastaria em silêncio.

O item 3 vale por si, independente do resto de B1: é uma guarda que hoje não
existe, e o `tests/physics_test.c` é o lugar dela — um caso que manda o robô
contra a parede com `dt` grande e exige `colidiu = 1`.

Cuidado com o resto: `tests/laco_test.c` usa relógio falso, então isso passa a
exigir que o falso avance — o que é uma melhora, porque hoje ele testa a física
com um `dt` que não tem relação com o relógio que a VM lê. E `ServidorLocal.kt`
(`Thread.sleep(Vm.FRAME_MS)`) herda a correção de graça, porque ela mora no
`laco.c` que os dois usam.

---

## C. Uso: o que deixaria a tela mais lisa

Nada aqui é defeito. É o que falta para a tela ser gostosa de usar.

### C1. Recarregar a página apaga tudo

O nível fica no `localStorage` (`niveis.js:274`), o mudo fica (`som.js:17`), a
fase fica (`missoes.js:97`). **O programa da criança não fica** (`grep robo_programa`
→ nada). Fechar a aba sem querer, o iPad dormir e o Safari descartar a aba, o
Android matar o app, o «voltar» do A6: em todos, o trabalho some.

É a melhoria de maior retorno da lista, e a peça mais difícil já existe:
`Blockly.serialization.workspaces.save/load` é o mesmo par que o gabarito usa.

**Como:** gravar num `robo_programa` com um atraso de ~1 s no
`addChangeListener` que o `app.js:177` já tem, e carregar na entrada — depois do
`Blocos.criarRaiz`, refixando a âncora (é o mesmo cuidado do A3). Guardar o
nível junto, e ignorar o programa salvo se o nível gravado não for o atual, que
é a mesma regra que a troca de nível já aplica.

### C2. Desfazer existe, mas nenhuma criança vai encontrar

A primeira versão desta revisão dizia que apagar um bloco é irreversível no
tablet. **Não é** — a auditoria mostrou o caminho: o Blockly traz «Desfazer» e
«Refazer» no menu do workspace (estão traduzidos em `web/vendor/pt-br.js`), e
num aparelho de toque esse menu abre com um toque longo de 750 ms
(`LONGPRESS=750` no `blockly_compressed.js`).

O problema é outro, e continua valendo: **um gesto que só existe se você já
souber que existe não protege ninguém.** Segurar o dedo por três quartos de
segundo em cima do nada, para ler duas palavras num menu cinza, não é uma coisa
que uma criança de seis anos descubra — nem que um adulto pense em ensinar antes
de o bloco já ter sumido.

Dois botões `↶ ↷` no cabeçalho chamando `workspace.undo(false)` e
`workspace.undo(true)` custam quatro linhas, não inventam mecânica nenhuma (a
pilha já está lá, e o menu continua funcionando) e mudam a sensação da tela: dá
para experimentar sem medo.

### C3. A criança não sabe em que fase está nem quantas faltam

`Missoes.quantas()` existe, é exportado, e **ninguém chama** — só o teste
(`grep quantas() web/` só acha a definição). A caixa `#missao` mostra o texto e
nada mais. «Fase 3 de 6» é uma linha em `mostrarMissao()`, e é o que transforma
seis missões soltas numa trilha com fim visível.

Na mesma caixa: não há como voltar para uma fase anterior, nem escolher. Depois
da última, `avancar()` volta para a primeira sem avisar. Uma fileira de seis
bolinhas — o mesmo desenho que o `field_bolinhas` já usa, o vocabulário já é da
casa — resolveria as duas coisas de uma vez.

### C4. O erro aparece onde ninguém olha

`spErro` (`app.js:11`) é um `<span>` de 14 px em amarelo claro no cabeçalho azul.
É lá que caem as três frases mais importantes que o compilador escreve —
*«Essa conta ficou complicada demais»*, *«repetir aninhados demais»*, *«o
programa ficou grande demais»* — e também o aviso de navegador velho. E é onde
cairia a frase nova do A1.

A criança está olhando para os blocos e para a arena. O erro precisa aparecer
perto de onde ela agiu. A **bolha** (`#bolha`, `mostrarBolha`) já faz exatamente
isso: flutua sobre a peça tocada, some sozinha em 4 s. E quase todo `throw` do
`compilador.js` acontece com um `blockId` à mão. Mostrar a frase na bolha, sobre
o bloco culpado e em vermelho, é a mesma mecânica já escrita.

### C5. O cabeçalho está cheio

Em pé num tablet de 768 px o cabeçalho já quebra em duas linhas, e a regra de
950 px existe só para escolher onde. Hoje moram lá: marca, erro, quatro níveis,
`{ } ver código`, mudo, PLAY, PARAR, procurar robô, estado, versão. E os pedidos
acima (desfazer, refazer) querem entrar.

Vale um ciclo de desenho: PLAY e PARAR são os dois botões que a criança usa o
tempo todo e merecem lugar fixo e grande; nível, som, código e versão são
controles de quem acompanha, e cabem atrás de um `⚙`. Isso é decisão sua, não
minha — anoto porque o próximo botão vai doer.

### C6. Nada anuncia mudança de estado para leitor de tela

`#estado`, `#leitura` e `#erro` mudam de texto sem `aria-live`. Um
`aria-live="polite"` em cada um é um atributo e faz o VoiceOver do iPad ler
«rodando», «parado», «distância: 34 cm». Barato demais para não fazer.

---

## D. Desempenho no tablet velho

### D1. A tela inteira é limpa 60 vezes por segundo para não desenhar nada

`web/app.js:377-380`:

```js
function desenharConfete() {
  var c = confete.getContext('2d');
  c.clearRect(0, 0, confete.width, confete.height);
  if (confetes.length === 0) return;
```

O `#confete` é um canvas do tamanho da janela. Fora dos poucos segundos de festa
— que é 99% do tempo — isso é um `clearRect` de tela cheia por quadro sem nenhum
pixel para mostrar. Num iPad 2 isso é caro de verdade.

**O que fazer:** sair antes. Limpar uma vez quando o último confete morre, e
manter o canvas com `hidden` enquanto `confetes.length === 0` — o navegador nem
compõe a camada. Enquanto estiver nisso: `getContext` uma vez, guardado, em vez
de por quadro.

### D2. O laço de desenho nunca dorme

`quadro()` (`app.js:398-414`) reagenda `requestAnimationFrame` para sempre,
redesenhando arena, obstáculos, estrela e robô mesmo com tudo parado. O robô tem
animação ociosa (o `z` do «dormindo», o pulo do «feliz»), então não dá para
parar de todo — mas dá para cair para uns 10 quadros por segundo quando
`!rodando && confetes.length === 0`, o que basta para um `z` subindo. Bateria de
tablet de sala de aula é recurso escasso.

---

## E. Código: limpeza e consistência

### E1. Código morto

- `web/blocos.js:394-408` — `CAIXA_XML` inteiro, e o `CAIXA_XML` do `api` na
  linha 588. Quem monta a caixa hoje é `Niveis.caixaXml`, por nível. A versão
  velha ainda cita categorias «Movimento» e «Sentidos», nomes que a `niveis.js`
  já trocou por «Mover» e «Sentir» — é uma segunda verdade sobre a caixa, livre
  para divergir em silêncio. Apagar.
- `web/blocos.js:586` — `valorDe` é exportado e ninguém de fora chama, nem
  teste. Tirar do `api` (a função continua, é usada internamente).
- `web/arena.js:13` — `OBSTACULOS` é `[]` e só serve de padrão para um argumento
  que sempre chega. Tirar o padrão e o `var`.

### E2. `arena.js` é o único módulo sem `module.exports`

Todos os outros arquivos de `web/` terminam com o mesmo par `module.exports` /
`raiz.X`. O `arena.js` só faz `raiz.Arena = { desenhar: desenhar };`.

Consequência prática: é o único que não pode ser testado em Node, e é o único
sem teste. `desenharEstrela` e a conversão metro→pixel são geometria pura e
mereciam um `tests/arena.test.js` — o `robo.test.js` já mostra como se testa
desenho sem navegador (testando a função pura e deixando a casca de lado).

### E3. O guarda de ES5 não guarda o que promete

`tests/es5.test.js` existe porque a página já morreu duas vezes num iPad 2, e é
uma boa ideia. Mas a lista de `PROIBIDO` (linha 34) não pega o que o próprio
código usa hoje:

| construção ES6 | onde |
|---|---|
| `for…of` | `app.js:382,619`, `niveis.js:201,222,226`, `compilador.js:193`, `robo.js:45`, `arena.js:31` |
| propriedade abreviada | `rede.js:57,112`, `som.js:84`, `campos.js:150`, `teclado.js:214` |
| `String.prototype.repeat` | `campos.js:19,21` |

Nenhuma delas quebra o Safari 9 — ele tem as três. Mas o teste se chama «é ES5» e
o código não é, e é assim que um guarda vira ruído: o `teclado.js`, escrito esta
semana, já entrou na lista sem ninguém notar. Da próxima vez que alguém escrever
`for…of` num arquivo novo, o teste vai passar do mesmo jeito, e a régua de
verdade continua sendo a lembrança de quem já foi ao tablet.

**O que fazer — escolher um dos dois, e escrever no cabeçalho do arquivo:**

1. **A régua é ES5 mesmo:** converter as ocorrências acima (`for…of` vira
   `for (var i = 0; ...)`, abreviada vira `nome: nome`, `repeat` vira um laço) e
   acrescentar os padrões à lista. Fica coerente e cabe numa tarde.
2. **A régua é «o que o Safari 9 tem»:** renomear o teste e o comentário, e
   completar a lista com o que o Safari 9 realmente não tem e ainda falta ali:
   parâmetro com valor padrão, desestruturação, `Object.assign`,
   `Array.prototype.includes`, `Array.from`, `Promise` sem polyfill.

A opção 2 é mais honesta com o código que existe. A 1 é mais fácil de defender
daqui a um ano.

### E4. `app.js` é o arquivo maior e o menos testável

804 linhas, e a única coisa que o alcança fora do navegador são os 6 testes de
`app_botao.test.js`. Todo o resto — contagem de tentativas, troca de nível,
reconexão e geração, a decisão entre rodar e relatar ao tocar numa peça — só é
olhado pelo Chromium, que leva minutos.

O projeto já sabe o remédio e o aplicou quatro vezes: `gabarito.js`,
`compilador.js`, `arduino.js` e agora `teclado.js` foram separados exatamente
para poderem ser testados em milissegundos. As duas peças mais óbvias para sair
do `app.js` pela mesma porta:

- **a máquina de tentativas** (`definirRodando`, `contarTentativa`,
  `tentativas`, `TENTATIVAS_ATE_AJUDA`): é uma função pura de
  `(rodando antes, rodando agora, cumpriu, ehPrograma) → tentativas`;
- **a reconexão** (a geração, o atraso, a regra de «uma queda, um agendamento»
  do A8): estado puro, e hoje só provável pelo navegador.

### E5. Três coisas certas que vale registrar

Para o revisor seguinte não gastar tempo checando de novo:

- **Não há uma segunda VM.** `core/vm.c` é literalmente o mesmo arquivo nos
  quatro alvos (PC, ESP32, NDK, testes), e as duas cópias de calibração que
  existem — as constantes no topo de `web/arduino.js` — têm um teste que lê os
  originais e falha se divergirem. O contrato do README se sustenta.
- **A tradução do protocolo tem três implementações** (`bridge/server.js`,
  `Traducao.kt`, `firmware/src/main.cpp`) e as três batem. Duplicação assumida e
  justificada — três linguagens, um protocolo.

  Mas **conferi lendo, não rodando, e a diferença importa**: o `bridge.test.js`
  cobre a do Node e o `TraducaoTest.kt` cobre a do Kotlin; a terceira, que é a
  que roda na placa, não tem teste nenhum. O `T_DIST` que o firmware emite é
  exercitado só do lado do JavaScript que o lê (`tests/rede.test.js`). Se a
  ordem dos bytes na placa saísse trocada, nada na suíte notaria — só um olho
  humano na frente do robô. É um buraco de cobertura real, e o
  `tests/quadros_test.c` já prova que dá para testar código do firmware na mesa:
  a tradução podia sair do `main.cpp` para um arquivo C puro pelo mesmo caminho.
- **O 0x85 novo foi introduzido do jeito certo:** número próprio em vez de
  reusar o 0x83, comentado dos dois lados explicando por que a placa não manda
  pose. É a mesma disciplina do opcode 7 vago.

---

## F. Ferramenta de trabalho

### F1. Cinco minutos para saber se quebrou alguma coisa

`node --test tests/` leva ~4,5 min, dos quais 292 s são `gabaritos.test.js`
sozinho (medido). Ele merece o tempo — o argumento do README está certo, e um
gabarito que não resolve é pior que gabarito nenhum. Mas ele não deveria estar no
caminho de quem acabou de mexer numa cor.

**O que fazer:** separar em dois comandos. `gabaritos.test.js` e
`navegador.test.js` passam a rodar só quando pedidos (por variável de ambiente,
como o `arduino.test.js` já faz com a ausência do `g++`), e o comando do dia a
dia fica em segundos. Rodar tudo antes de commitar continua sendo a regra.

### F2. Não há um comando só que rode tudo

O README lista cinco linhas e cada uma entra numa pasta diferente. Um `Makefile`
na raiz com `make test` chamando as cinco na ordem é meia hora de trabalho e tira
uma decisão de cima de quem chega. Ele também é o lugar natural para o
`make subir` (compilar o host e levantar o bridge), que hoje são duas linhas
decoradas.

### F3. Uma falha intermitente na suíte completa

Numa das execuções de `node --test tests/`, a suíte deu **1 falha**. Rodando
arquivo por arquivo, tudo passa — inclusive o `gabaritos.test.js` sozinho. E a
auditoria rodou a suíte inteira depois e teve **280/280 verdes**. Ou seja: é
intermitente, e não reprodutível sob demanda.

As portas não colidem (8097/9331 contra 8099-8101/9333-9335), então o suspeito é
tempo: o `node --test` roda os arquivos em paralelo, dois Chromium sobem juntos,
e algum dos `esperarPorta` / `espera(1200)` fixos não é generoso o bastante numa
máquina carregada. Com o `teclado.test.js` novo entrando no mesmo pente, a
pressão só aumentou.

**Não mexa antes de reproduzir.** O jeito de reproduzir é rodar a suíte umas
vinte vezes seguidas, de preferência com a máquina ocupada, guardando a saída de
cada uma — sem isso não dá para saber se um conserto consertou. Quando o teste
que falha tiver nome, o remédio provável é `--test-concurrency=1` para os dois
de navegador, ou trocar as esperas fixas por espera-até-condição. Um teste que
falha uma vez a cada tantas é pior que teste nenhum, porque ensina a ignorar
vermelho.

---

## G. O que já estava consertado

Estes vieram na primeira passagem, contra o `1591fd1`, e os nove commits do
meio já resolveram. Ficam registrados para não voltarem à lista por engano — e
porque as soluções são boas.

- **O socket abandonado ao trocar de robô.** `Rede.conectar` agora devolve um
  `fechar()` que desliga os quatro manipuladores antes do `close()`
  (`rede.js:90-99`), e `App.irPara` o chama (`app.js:764-778`). O comentário
  ainda anota o motivo que eu não tinha visto: o servidor local do app atende um
  cliente por vez, e um soquete largado o prendia para sempre.
- **A avalanche de reconexões.** O `geracaoDaConexao` (`app.js:480`) resolve o
  caso que importa. Sobrou só a chamada dupla, que virou o A8.
- **O painel de leitura morto na placa.** O quadro `T_DIST` (0x85) leva a
  distância da ESP32 dez vezes por segundo, sem inventar pose
  (`firmware/src/main.cpp:85-101`, `rede.js:42-47`, `app.js:521-523`).
- **O `prompt` que não abria no WebView.** O `web/teclado.js` e o
  `WebChromeClient` do `MainActivity`. Boa dupla: consertou o defeito do app e
  deu à criança um teclado de doze teclas grandes em vez do teclado do sistema.

---

## Sugestão de ordem

**Primeiro, porque a criança encontra:** A1 (número grande — só a guarda do
compilador, que é a que não pode faltar; a chegada do teclado deixou o caminho
até o estouro mais curto), A3 (âncora destravada), A4 (servidor cai), A2 (o dado
viciado).

**Depois, porque é barato e melhora muito:** A5 (`%VERSAO%` na placa), C1
(guardar o programa), C2 (botões de desfazer), C4 (erro na bolha), D1 (confete),
A8 (a trava de reentrada).

**Quando der:** a subdivisão do passo da física (parte 3 do B1 — vale sozinha,
mesmo sem tocar no `dt`, porque é uma guarda que hoje não existe), A6+A7
(Android), o resto do B1 (o tempo do ensaio), C3 (a trilha de fases), C5+C6
(cabeçalho e leitor de tela), E1-E4 (limpeza), F1-F3 (a suíte).

---

## Como ler esta revisão

Metade dela foi provada rodando, metade saiu de leitura de código — e está
marcado em cada item qual é qual. A auditoria que veio depois mostrou onde essa
diferença dói: **das seis correções que ela trouxe, quatro estavam em itens
lidos e não rodados**, e duas delas eram receitas que teriam introduzido defeito
(o `dt` sem teto do B1, o `max=30` do A1).

Isso não invalida os achados lidos — A3, A6 e B1 continuam corretos no
diagnóstico. Mas vale a regra que sai daí, para quem for aplicar: **o defeito
pode ser encontrado lendo; a correção precisa ser provada rodando.**
