# Execução viva — design

Data: 2026-08-20

Segundo da série iniciada em
[`2026-08-17-numeros-que-se-calculam-design.md`](2026-08-17-numeros-que-se-calculam-design.md),
que está implementado e no ar.

A ordem combinada naquele ciclo era outra — variáveis primeiro. Esta é a quinta
da lista, trazida para a frente por um motivo: as quatro anteriores mexem na VM,
e esta é a única que muda como o projeto **parece** em vez de o que ele sabe. O
robô de verdade acabou de responder pela primeira vez, e é agora que esse gesto
vale mais.

## Objetivo

Hoje só existe uma maneira de o robô se mexer: montar o programa dentro do
`▶ quando apertar PLAY` e apertar PLAY. Um bloco solto no canto é papel — não faz
nada até ser encaixado.

Este ciclo faz **tocar numa peça rodar aquela peça na hora**, e **tocar num
relator mostrar o valor dele numa bolha**. É o gesto central do MicroBlocks, e é
o que troca o ciclo "monto tudo, mando, vejo, conserto" por "toco, vejo".

O bloco que carrega a lição toda é o `👁 distância cm`. Tocar nele com a ESP32
ligada lê o HC-SR04 de verdade e mostra o número — a criança descobre o sensor
com o dedo, e o adulto ganha a melhor ferramenta de bancada que o projeto vai
ter.

## O gesto já vem certo de fábrica

Foi a verificação que decidiu o desenho, e está no
`web/vendor/blockly_compressed.js` 8.0.5, no `Gesture.prototype.handleUp`:

```js
isDraggingBlock_ ? endDrag() :
isFieldClick_()  ? doFieldClick_()  :   // abre o editor, NÃO emite evento
isBlockClick_()  ? doBlockClick_()  :   // emite CLICK targetType:'block'
isWorkspaceClick_() && doWorkspaceClick_()
```

A cadeia é exclusiva, e é ela que responde a única pergunta perigosa deste ciclo:
*a criança toca no `1` para trocar o número — o robô sai andando?* Não. Tocar num
campo é `doFieldClick_`, que abre o editor e não emite evento nenhum. Arrastar
tampouco. Só o toque no corpo da peça vira `CLICK`.

Não precisamos de raio de arrasto próprio, nem de temporizador, nem de distinguir
toque de arraste na mão: o Blockly já fez isso, e melhor do que faríamos.

Uma ressalva medida no mesmo arquivo: `setStartBlock` guarda o bloco original
mesmo quando ele é *shadow* — só o `targetBlock_` sobe para o pai. O `blockId`
que chega no evento pode ser o do numerinho dentro do encaixe, e não o do bloco
que o contém.

## Quem decide é a peça tocada, não a pilha dela

A regra tem que ser lida no **bloco clicado**, e não na raiz da pilha dele:

- o bloco tocado tem `outputConnection` → é **relator**: mostra o valor
- não tem → é **comando**: roda a pilha inteira a que ele pertence

Escrever a regra na raiz seria errado, e de um jeito que só aparece em uso: um
relator encaixado num soquete tem como raiz a pilha que o contém. Tocar no
`(2 + 3)` dentro de `andar frente [(2 + 3)] s` faria o robô **andar** em vez de
mostrar `5` — bem no caso em que a criança está tentando entender o que aquele
pedaço vale.

Com a regra na peça tocada, a ressalva do shadow se resolve sozinha: o numerinho
`1` do encaixe é um relator como qualquer outro, e tocar no corpo dele mostra
`1`. Não é preciso subir para o pai em lugar nenhum.

Enquanto só a etapa 1 existir, tocar num relator não faz nada — nem roda, nem
mostra. É o que mantém a etapa 1 honesta: ela não pode fingir que sabe um valor
que ainda não tem como pedir.

## Duas etapas, e a primeira serve sozinha

**Etapa 1 — rodar uma pilha.** Não toca em `core/`, em `firmware/` nem em
`bridge/`. Funciona na placa que já está gravada, porque não inventa nada: compila
a pilha clicada e usa o `T_LOAD` + `T_RUN` que já existem. O `vm_load` já
documenta que "aceitar sempre interrompe a execução em curso", que é exatamente a
semântica desejada.

**Etapa 2 — relatar um valor.** Esta pede opcode novo, mensagem nova e regravar a
placa.

A etapa 1 fica utilizável antes de a 2 começar. Se a 2 atrasar, o ciclo entregou
alguma coisa.

---

## Etapa 1 — rodar uma pilha

### `web/blocos.js`

Uma função nova, `pilhaDoBloco(b)`:

```js
{ ast: [...], ehPrograma: false }
```

Recebe um bloco de **comando** (quem separa comando de relator é o ouvinte de
clique, pela regra acima) e sobe até `getRootBlock()`:

- raiz é `quando_play` → `pilhaParaAst(raiz.getInputTargetBlock('CORPO'))`,
  `ehPrograma: true`
- qualquer outra raiz → `pilhaParaAst(raiz)`, `ehPrograma: false`

`pilhaParaAst` já existe e já aceita qualquer bloco — este ciclo não escreve
tradução nova, só expõe um caminho que já estava lá.

### `web/app.js`

O corpo do ouvinte do PLAY vira uma função `rodar(ast, ehPrograma)`, e o PLAY
passa a ser um chamador dela como qualquer outro. O ouvinte de clique é o
segundo chamador.

**Tocar no programa da âncora é o mesmo que apertar PLAY.** Não há razão para
serem gestos diferentes: é o mesmo programa e o mesmo robô.

### O que não conta tentativa

`definirRodando` incrementa `tentativas`, e é o contador que faz o botão do
gabarito aparecer sozinho depois de algumas execuções sem chegar na estrela.

Uma execução viva de **pilha solta** não conta. Sem isso, uma criança explorando
com o dedo faria a oferta de ajuda aparecer como se ela tivesse falhado cinco
vezes — e a oferta existe justamente para quem travou, não para quem está se
divertindo.

Rodar o programa da âncora conta, tenha vindo do PLAY ou do dedo. O que decide é
**o que rodou**, não por onde foi pedido.

### O que continua igual

- O `T_PC` acende o bloco sozinho, porque o `pcMap` sai do mesmo compilador.
- O PARAR corta na hora, porque é o mesmo `T_STOP`.
- A missão é cumprida por telemetria. Se uma pilha solta levar o robô à estrela,
  ele chegou na estrela — a física não sabe de onde veio o comando, e não deve
  saber.

---

## Etapa 2 — relatar um valor

### O opcode

`OP_REPORT = 13` em `core/bytecode.h`. Desempilha o topo e entrega a
`hal_report`. Desempilhar com a pilha vazia já para a VM pelo caminho que existe
(`desempilhar` faz `vm_stop`) — nenhuma regra nova.

O 7 continua vago, pelo motivo já escrito lá: reusá-lo faria bytecode antigo
rodar errado.

### O caminho de volta, ponta a ponta

| onde | o que |
|---|---|
| `core/bytecode.h` | `OP_REPORT = 13` |
| `core/vm.c` | desempilha, `hal_report(v)`, `pc++` |
| `core/hal.h` | `void hal_report(int32_t valor)` |
| `host/hal_sim.c` | `printf("V %d\n", v)` |
| `bridge/server.js` | linha `V n` → quadro `T_VALOR`, `int32` LE |
| `firmware/src/main.cpp` | `hal_report` monta o quadro `T_VALOR` e o envia |
| `web/rede.js` | `T_VALOR = 0x84` → `aoValor(n)` |
| `web/compilador.js` | `compilarValor(no)`: subárvore do valor, `REPORT`, `HALT` |
| `web/app.js` | a bolha |

Duas escolhas de lugar, com motivo:

**`hal_report` no `main.cpp`, e não no `hal_esp32.cpp`.** Todos os outros
`hal_*` falam com um pino. Este fala com um socket, e o `ws` mora no `main.cpp`,
ao lado de `enviar_estado` e `enviar_pc`. Relatar é ato de protocolo, não de
hardware.

**`V` no protocolo de uma letra.** O robô virtual já responde `P`, `E` e `T` em
linhas de texto. Uma letra nova cabe sem inventar nada.

### `int32`, e não `int16`

A pilha da VM é `int32_t`, e uma conta da criança chega lá: `100 × 100` já não
cabe num `int16`. O quadro carrega `int32` LE. É o primeiro campo do protocolo
com essa largura, e é de propósito.

### Uma aritmética só

O navegador **não** calcula. `2 + 3` desce até a VM como qualquer outra coisa e
o número volta de lá.

A alternativa — o JS resolver as contas e só o sensor descer — daria bolha
instantânea e menos firmware, e foi recusada: passariam a existir duas
aritméticas no projeto, o `int32` da VM e o `double` do JS, e elas divergiriam
exatamente onde é mais difícil de perceber (divisão, estouro). O compilador já é
a fonte única de verdade sobre o que uma conta significa; a bolha não vai ser a
segunda.

### A bolha

Um `div` posicionado sobre a peça pelo `getBoundingClientRect()` do SVG dela.
ES5, sem `gap`, sem `aspect-ratio`, sem `var()` — as mesmas regras do resto da
interface, pelo mesmo motivo (o iPad 2 com iOS 9).

Some no clique seguinte, no PLAY, ou sozinha depois de alguns segundos.

---

## O limite conhecido

A VM tem **um** `pc` e **um** programa. Então qualquer clique interrompe o que
estiver rodando — inclusive tocar no `👁 distância` no meio de uma execução para
espiar a leitura.

Não é contornável neste ciclo, e não se tenta contornar. É exatamente o que
**tarefas e eventos** — o próximo da série — existe para resolver: mais de um
`pc` na VM. Vai para o README como limite conhecido, escrito, e não como um
defeito a ser descoberto por quem usar.

## Testes

| arquivo | o que prova |
|---|---|
| `tests/vm_test.c` | `REPORT` desempilha e relata; com a pilha vazia, para a VM |
| `tests/compilador.test.js` | `compilarValor` emite a subárvore, `REPORT`, `HALT` |
| `tests/blocos.test.js` | `pilhaDoBloco` em pilha solta e dentro da âncora; e que um relator encaixado num soquete é lido como relator, não como a pilha que o contém |
| `tests/bridge.test.js` | linha `V 42` vira quadro `T_VALOR` com `int32` |
| `tests/navegador.test.js` | **tocar no número não move o robô**; tocar no corpo move; tocar num relator mostra a bolha |

O teste de navegador é o que importa. Os outros conferem peças; ele confere o
gesto, que é o ciclo inteiro. E a primeira linha dele é a que guarda o defeito
que não chegou a existir: se um dia alguém trocar o ouvinte de clique por um
próprio, com raio de arrasto na mão, é esse teste que avisa.

## Fora deste ciclo

- **Rodar sem interromper** — pede mais de um `pc`. É o ciclo seguinte.
- **Halo em volta da pilha que roda**, ao estilo MicroBlocks. O `T_PC` já acende
  o bloco corrente, que diz a mesma coisa com o que já existe.
- **Clicar num bloco na caixa de blocos** para experimentar antes de arrastar.
  O flyout tem workspace próprio e ficaria de graça, mas rodar o robô a partir
  da gaveta confunde a gaveta com a mesa.
- **`arduino.js`** não muda: a exportação compila o programa da âncora, onde
  `REPORT` nunca aparece.
