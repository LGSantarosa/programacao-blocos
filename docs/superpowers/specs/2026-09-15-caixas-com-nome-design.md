# Caixas com nome — design

Data: 2026-09-15 · revisada duas vezes no mesmo dia, depois de uma revisão com
sete achados e uma segunda com três (ver
[O que a revisão mudou](#o-que-a-revisão-mudou))

Quarto da série iniciada em
[`2026-08-17-numeros-que-se-calculam-design.md`](2026-08-17-numeros-que-se-calculam-design.md).
Os três anteriores — números que se calculam, execução viva, tarefas e eventos —
estão no master.

## Objetivo

Hoje a criança calcula, mas não guarda. Uma conta vale no instante em que é
feita e some. «Conte quantas vezes o robô chegou perto da parede» não tem como
ser montado, e é o primeiro teto que o Avançado encontra depois das tarefas: uma
pilha que conta e outra que lê a conta precisam de um lugar em comum.

Este ciclo dá à criança **caixas com nome**: ela cria a caixa, dá o nome que
quiser, guarda um número nela, soma e lê.

O nome é da criança, e não uma caixa fixa `A`, `B`, `C`. Foi escolha feita no
começo da série: dar nome é metade da lição.

## As decisões, e de onde vieram

**As caixas são de todas as pilhas.** Uma caixa por programa, vista igual por
toda tarefa. É o que dá sentido às tarefas do ciclo 3, e é o que o MicroBlocks
faz.

**«Mudar por» não perde conta.** Duas pilhas mudando a mesma caixa por 1 somam
2. Guardar é diferente: duas pilhas guardando na mesma caixa, vale a última —
mesma regra do motor.

**A caixa guarda entre um toque e outro.** Tocar em «mudar voltas por 1» e depois
tocar em «voltas» mostra `1`, e não `0`. Decisão dele, em 2026-09-15. Sem isso,
tocar na caixa para ver quanto tem sempre daria zero, e a execução viva — o gesto
do ciclo 2 — perderia a graça justamente com a peça nova.

**Só o PLAY zera — e zera todas.** Rodar o programa começa do zero, inclusive a
caixa que só uma pilha solta tocou, e inclusive o lugar de uma caixa que já foi
apagada. Tocar numa peça solta, ou numa cabeça de evento, não zera.

**O `.ino` anda como o robô.** Onde a VM arredonda, o código arredonda; onde a
caixa da VM dá a volta, a do código também dá.

**Uma caixa ocupa sempre o mesmo lugar.** Criar, renomear, apagar ou desfazer
não fazem uma caixa passar a mostrar o número de outra.

**O protocolo não muda.** As regras acima vivem dentro do bytecode e do
navegador, e não num quadro novo: o protocolo tem três implementações
(`firmware/src/protocolo.h`, `bridge/server.js`, `android/.../Traducao.kt`), e
mexer nelas para dizer "zera antes" é três lugares para errar em troca de nada.

---

## A VM — `core/`

### Onde a caixa mora

```c
#define N_CAIXAS 16

typedef struct {
    ...
    int32_t caixa[N_CAIXAS];
} VM;
```

Na `VM`, e não na `Tarefa`: é isso que faz a caixa ser de todas as pilhas.
`int32_t` porque é a largura da pilha — guardar numa caixa não pode cortar um
número que a conta já tinha feito caber.

Dezesseis custa 64 bytes na placa. É mais do que uma criança dá nome numa tela de
tablet.

### Quem toca nela

| função | caixas |
|---|---|
| `vm_init` | zera (já zera, pelo `memset`) |
| `vm_load` | não toca |
| `vm_run` | zera **só quando** `prog[0].op == OP_ZERAR_CAIXAS` |
| `vm_stop` | não toca |
| `OP_ZERAR_CAIXAS` executada | zera |

É o `vm_load` que não pode zerar: a execução viva carrega um programa novo a cada
toque, e é por ele que a caixa sobrevive de um toque para o seguinte.

### Os opcodes

Quatro números novos. O 7 continua vago, pelo motivo já escrito em `bytecode.h`.

```c
OP_PUSH_VAR      = 16,   /* empilha caixa[a] */
OP_STORE_VAR     = 17,   /* desempilha e guarda em caixa[a] */
OP_CHANGE_VAR    = 18,   /* desempilha n e soma n a caixa[a] */
OP_ZERAR_CAIXAS  = 19    /* zera todas */
```

Índice fora de `0..N_CAIXAS-1` para a VM inteira, pela mesma regra do registrador
fora da faixa: programa torto para.

### Por que `CHANGE_VAR` existe

A primeira versão desta spec expandia «mudar» em `PUSH_VAR ; valor ; BIN MAIS ;
STORE_VAR`, com o argumento de que as peças já existiam. Está errado, e o erro não
aparece com uma pilha só.

O `vm_tick` executa **uma** instrução e passa a vez (`proxima`, em
`core/vm.c`). Duas tarefas fazendo «mudar x por 1» podem se intercalar assim:

```
A: PUSH_VAR x   → 0
B: PUSH_VAR x   → 0
A: BIN MAIS     → 1
B: BIN MAIS     → 1
A: STORE_VAR x  → x = 1
B: STORE_VAR x  → x = 1
```

Dois blocos mudaram a caixa, e ela diz 1. É exatamente o programa que motiva o
ciclo — uma pilha conta, outra também conta — dando o número errado de um jeito
que a criança não tem como descobrir.

`OP_CHANGE_VAR` lê, soma e grava dentro de uma instrução só, e uma instrução não
é interrompida. Não é "mais um opcode de conta", que o `OP_BIN` com seletor
evitou: é a operação sobre estado dividido, e ela precisa ser uma.

A soma passa por `uint32_t` e volta, para dar a volta em vez de ser comportamento
indefinido do C quando a caixa estoura.

Metade disso é garantida pelo padrão e metade não. A soma em `uint32_t` é
definida: dá a volta módulo 2³². A conversão de volta para `int32_t`, quando o
resultado passa de `INT32_MAX`, é **definida pela implementação** em C e em C++
antes do C++20. A garantia vale para os compiladores que o projeto usa — o GCC do
host e da ESP32, e o Clang do NDK —, que documentam essa conversão como módulo
2³², e é o que os testes conferem rodando. Uma conversão escrita só com o que o
padrão garante existe, mas é uma linha que ninguém lê de primeira; entre ela e
um compilador documentado, fica o compilador.

O «guardar [conta com a própria caixa]» que a criança montar à mão — `guardar
(voltas + 1) na caixa voltas` — continua não sendo atômico. É o programa dela, e
ele é tão atômico quanto ela o escreveu; quem quer somar tem o bloco de somar.

### O `ZERAR` e o cabeçalho de tarefas

`OP_ZERAR_CAIXAS`, quando existe, é **a primeira instrução do programa**, antes
de qualquer `OP_TASK`.

- `vm_run` zera as caixas quando `prog[0]` é um `ZERAR`, e `montar_tarefas`
  começa a ler o cabeçalho na instrução 1.
- Executado como instrução comum — o programa de uma pilha só, sem cabeçalho,
  começa em zero e passa por ele — também zera. Zerar duas vezes não muda nada.

As duas leituras dizem a mesma coisa de propósito: não existe um jeito de o
`ZERAR` chegar à VM em que ele signifique outra coisa.

---

## Um lugar por caixa — `web/caixas.js`

### O problema de contar pela posição

A primeira versão tirava o índice da posição da caixa em
`workspace.getAllVariables()`. Isso quebra de dois jeitos:

- **O limite mente.** Criadas 17 caixas e usada só a última, ela tem índice 16 e
  falha como se fossem usadas 17.
- **Apagar troca números.** A caixa apagada desloca as de depois, e `pontos`
  passa a mostrar o que era de `voltas` até o próximo PLAY.

Compactar só as caixas que a pilha usa também não serve: cada toque compila um
pedaço diferente, e `a` e `b` acabariam no mesmo lugar em toques seguidos.

### Um mapa estável

Um arquivo novo, `web/caixas.js`, sem Blockly nem DOM — a mesma separação do
`compilador.js`, do `gabarito.js` e do `guardar.js`, e pela mesma razão: prova-se
em Node, em milissegundos.

Ele guarda `id da variável → lugar`, de 0 a 15, e responde a quatro eventos:

| evento | o que acontece |
|---|---|
| caixa criada | ganha o lugar que já foi dela, se ainda estiver livre; senão, o menor livre; o lugar fica **sujo** |
| caixa renomeada | nada: o id é o mesmo |
| caixa apagada | o lugar fica livre, e o mapa lembra que foi dela; **continua sujo** |
| programa rodado com `ZERAR` | só os lugares ocupados continuam sujos |
| programa carregado | o mapa e os sujos voltam como foram gravados |
| `reconciliar(ids)` | id do mapa que não está em `ids` é tratado como apagado (livre, sujo, lembrado); id de `ids` sem lugar é tratado como criado |

Quando uma caixa toma um lugar, o mapa esquece qualquer lembrança antiga que
apontava para ele. Desfazer uma exclusão depois disso cai no menor livre — que é
a regra de sempre — e a lista de lembranças nunca passa de 16 entradas, em vez
de crescer no `localStorage` a cada troca de nível.

"Sujo" quer dizer "pode ter número na VM". É o que responde se o PLAY precisa
zerar (ver o compilador).

"O lugar que já foi dela" é o que faz desfazer funcionar: o `VarCreate` do
Blockly recria a variável **com o mesmo id** (`Events.VarCreate.prototype.run`,
em `web/vendor/blockly_compressed.js`), e ela cai no lugar de onde saiu.

O que sobra, e fica escrito: apagar `voltas` e criar `pontos` logo depois, **sem
PLAY no meio**, dá a `pontos` o lugar livre e o número que `voltas` tinha deixado
na VM. É uma caixa nova mostrando sobra, e não uma caixa existente trocando de
número; zerar um lugar pede instrução, e instrução só chega com um programa. Um
PLAY entre apagar e criar já limpa, porque o lugar apagado continua sujo e o PLAY
zera.

### A 17ª caixa não nasce

O botão «Criar caixa» reconcilia e pergunta ao mapa antes de abrir a janelinha.
Cheio, a janela não abre, soa a batida, e o cabeçalho diz:

> O robô guarda 16 caixas. Apague uma para criar outra.

A primeira versão desta spec prometia uma bolha. A troca para o cabeçalho é
decisão de produto, e foi dele, em 2026-09-15, escolhida contra a outra saída —
uma bolha nova presa ao botão «Criar caixa», onde o dedo está, que pediria
código de interface a mais e um teste medindo a posição dela.

No cabeçalho, e não numa bolha: a bolha do `mostrarErro` se ancora num bloco, e
aqui não há bloco culpado — é o mesmo lugar onde já aparece "o programa ficou
grande demais", que também é um limite do robô sem peça para apontar.

O menu do `field_variable` do Blockly 8 só oferece renomear e apagar, então o
botão é a única porta de criação. Mesmo assim o `blocos.js` confere: um bloco
cuja caixa não tem lugar vira erro no bloco dele, e não índice inventado.

### Onde o mapa é gravado

Junto com o programa. `Guardar.gravar(estado, nivel, caixas)` grava
`{ nivel, blocos, caixas }` — `caixas` levando o mapa, a lembrança dos lugares
apagados e os sujos — e `Guardar.ler` devolve os dois. Gravado e lido na
mesma chave, o mapa não tem como voltar de um programa e os blocos de outro.

Um programa guardado antes deste ciclo não tem `caixas` — e também não tem
caixa nenhuma. O mapa começa vazio.

O robô de verdade continua com os números na RAM depois que a página recarrega.
Com o mapa gravado, `voltas` volta para o mesmo lugar, e tocar nela mostra o
número que ela tinha.

O robô virtual não: o `bridge/server.js` sobe um `robo_host` por conexão, e a
página recarregada fala com uma VM nova, de caixas zeradas. O mapa volta igual
mesmo assim — o que some é só o número, e o próximo PLAY zeraria de qualquer
jeito. O teste de navegador prova o nome e o lugar; o número atravessando a
recarga se prova na placa.

---

## O compilador — `web/compilador.js`

### Os nós

```js
{ op: 'caixa',   indice: 0, nome: 'voltas', blockId }            // valor
{ op: 'guardar', indice: 0, nome: 'voltas', valor: v, blockId }  // comando
{ op: 'mudar',   indice: 0, nome: 'voltas', valor: v, blockId }  // comando
```

O compilador usa `indice` e ignora `nome`; o `arduino.js` usa `nome` e ignora
`indice`. Quem traduz o bloco em nó é o `blocos.js`, com o lugar tirado do
`caixas.js` — o compilador continua sem saber que Blockly existe.

| nó | instruções |
|---|---|
| `caixa` | `PUSH_VAR i` |
| `guardar` | `<valor> ; STORE_VAR i` |
| `mudar` | `<valor> ; CHANGE_VAR i` |

### Profundidade

`caixa` conta 1 em `profundidadeDe`, igual ao sensor.

`guardar` e `mudar` pedem `profundidadeDe(valor)` e nada além: a caixa não é
empilhada antes do valor, e o `CHANGE_VAR` lê a caixa por dentro. Os dois passam
pelo `conferirProfundidade` que já existe, e há teste no limite.

(A versão anterior dizia "profundidade 2 no pior caso". Com a expansão em quatro
instruções seria `1 + profundidadeDe(valor)`; com `CHANGE_VAR` a pergunta some.)

### Quando o `ZERAR` sai

Uma opção nova, `zerarCaixas: true`. Com ela, o `ZERAR` sai **sempre** — use a
pilha caixa ou não.

Quem decide passá-la é o `app.js`: quando roda o programa (o PLAY, ou o dedo na
pilha da âncora — `ehPrograma` do ciclo 2) **e o `caixas.js` tem algum lugar
sujo**. Depois de mandar o programa, o `app.js` avisa o `caixas.js`, que limpa os
lugares livres.

A regra não olha a árvore, e também não olha as caixas que existem na tela. Dois
casos, cada um derrubando um dos jeitos:

```
tocar em «mudar x por 1» solto    → x = 1
PLAY num programa que só anda     → a árvore não tem caixa
tocar em «x»                      → tem que mostrar 0
```

O PLAY compila só o que tem cabeça (`rodarPrograma`, em `web/app.js`), e a pilha
solta que mexeu na caixa está fora da árvore. Decidido pela árvore, o PLAY não
zeraria.

```
guardar 5 em x, apagar x          → a tela não tem caixa, a VM tem 5
PLAY num programa que só anda
criar y, que cai no lugar de x
tocar em «y»                      → tem que mostrar 0
```

Decidido pelas caixas da tela, este PLAY também não zeraria.

Um workspace que nunca teve caixa não tem lugar sujo, a opção não vai, e o
bytecode é o de hoje, byte por byte — a regra que o ciclo 3 seguiu com o
cabeçalho, e pela mesma razão.

### O deslocamento

Nenhum dos opcodes novos carrega endereço, então a costura do `compilarTarefas`
não ganha regra nova. O que muda é a base: com `ZERAR`, o cabeçalho começa na
instrução 1 e todo `inicio` de tarefa soma 1.

É o lugar deste ciclo onde a armadilha do ciclo 3 volta — um deslocamento
esquecido manda a pilha para o meio de outra, e isso não dá erro. Tem teste
próprio.

---

## Os blocos — `web/blocos.js`, `web/niveis.js`, `web/app.js`

### Três blocos do projeto

Não os `variables_get` / `variables_set` do Blockly: esses vêm com a cor, o texto
e o jeito do Blockly, e o resto da caixa de blocos tem emoji, cor por família e
encaixe com shadow de número.

| bloco | forma |
|---|---|
| `caixa_guardar` | 📦 guardar [n] na caixa [voltas ▾] |
| `caixa_mudar` | 📦 mudar [voltas ▾] por [1] |
| `caixa_ler` | 📦 voltas ▾ — relator |

O `[voltas ▾]` é um `field_variable`. É ele que traz de graça o menu com
renomear e apagar, e que faz o `serialization.workspaces.save` gravar as
variáveis junto com os blocos.

### Onde aparece

Categoria **«Caixas»**, só no Avançado, entrando em `DEFINICOES.gigante.blocos`.
A categoria é `custom`, registrada no `app.js` com
`registerToolboxCategoryCallback`: um botão **«Criar caixa»** em cima, e os três
blocos abaixo, já apontando para a última caixa criada. Sem caixa nenhuma, só o
botão.

O botão abre a janelinha de nome do Blockly (`Blockly.dialog.prompt`). No app
Android ela aparece porque o `MainActivity.kt` já instala um `WebChromeClient`.

O `app.js` não confia em evento de variável para manter o mapa em dia. O
`workspace.clear()` do Blockly — que o `Blocos.limpar` usa ao trocar de nível, e
que o `serialization.workspaces.load` usa ao restaurar e ao abrir o gabarito —
troca o mapa de variáveis por um vazio **sem disparar `VAR_DELETE`**
(`VariableMap.prototype.clear`, em `web/vendor/blockly_compressed.js`). Contando
só com os eventos, as caixas da tela apagada ficariam ocupando lugar para
sempre: novas caixas pulariam posições, trocar de nível algumas vezes batia no
limite de 16 sem caixa nenhuma na tela, e o PLAY zeraria para sempre por causa
de fantasmas.

Por isso o mapa é **reconciliado** com `workspace.getAllVariables()`, nos dois
sentidos (ver `reconciliar`), em todo evento que não é de interface e, de novo,
imediatamente antes de cada decisão que depende dele: criar caixa, rodar e
gravar. Recomeçar o mapa do zero, em vez de reconciliar, esqueceria os sujos e
reabriria o caso do PLAY que não zera.

A reaplicação do nível durante um arrasto (memória do ciclo 1) vale para os
blocos novos sem regra nova: eles não têm campo escondido por nível.

---

## A execução viva

- **Tocar no relator** 📦 `voltas` mostra o valor guardado. Sai de graça:
  `compilarValor` carrega um programa sem `ZERAR`, e o `vm_load` não apaga caixa.
- **Tocar em «guardar» ou «mudar»** solto roda a pilha dele e a caixa fica com o
  resultado.
- **Tocar na pilha da âncora** zera, porque é o programa.

## O `.ino` — `web/arduino.js`

### Sempre com prefixo

Cada caixa usada vira uma global, declarada **antes da primeira função do
arquivo** — antes de `fiacao()` e de `programa()`, e não só antes de `setup()`:

```cpp
int32_t caixa_voltas = 0;
```

A primeira versão mantinha o nome puro e reservava palavras do C++ e as funções
do arquivo. Não fecha: o arquivo também declara `PWMA`, `TRIG`, `STBY` como
globais, chama `delay`, `random`, `pinMode` e `digitalWrite`, usa as macros
`HIGH`, `LOW`, `INPUT`, `OUTPUT` — e o C++ reserva todo nome com `__` ou que
começa por `_` e maiúscula. Uma lista que precisa acompanhar o arquivo inteiro e
a API do Arduino é uma lista que vai ficar para trás.

`caixa_` na frente fecha todas de uma vez, e ainda diz a quem lê de onde aquilo
veio: é a caixa que ela criou.

`int32_t`, e não `int` nem `long`: a linguagem não garante a largura de nenhum
dos dois, e a caixa da VM tem 32 bits exatos. O nome do tipo diz isso a quem lê.

### A limpeza do nome

A criança escreve `número de voltas`:

1. letra acentuada vira a sem acento, **por tabela própria** (`á`→`a`, `ç`→`c`,
   ...) — `String.prototype.normalize` não existe no Safari do iOS 9, e o
   `tests/es5.test.js` passa a proibi-lo;
2. o que não é letra ASCII, dígito ou `_` vira `_`;
3. `_` repetido vira um só, e `_` nas pontas sai — o que também impede o `__` que
   o C++ reserva;
4. sobrou nada → `caixa`;
5. prefixo: `caixa_` + o resultado (`caixa_numero_de_voltas`);
6. dois nomes que dão no mesmo → o segundo ganha `_2`, o terceiro `_3`.

Começar por dígito deixa de ser caso: depois do prefixo, nunca começa.

### Os comandos

`guardar` vira `caixa_voltas = <valor>;`.

`mudar` vira `caixa_voltas = somar(caixa_voltas, <valor>);`, com a função de
apoio declarada só quando algum «mudar» existe — mesma regra do sensor e do
aleatório:

```cpp
/* Soma que dá a volta, como a caixa do robô: passar de 2147483647 volta
   para -2147483648, em vez de fazer o que o C++ quiser. */
int32_t somar(int32_t caixa, int32_t n) {
  return (int32_t)((uint32_t)caixa + (uint32_t)n);
}
```

A soma direta, `caixa_voltas + <valor>`, era a mais legível, e foi recusada:
estouro de inteiro com sinal é comportamento indefinido no C++, e a VM passou a
garantir a volta. Um `.ino` que anda igual ao robô até o dia em que a conta
estoura é um `.ino` que não anda igual. O nome `somar` fica fora do alcance das
caixas, porque toda caixa começa por `caixa_`.

A conversão final para `int32_t` tem a mesma ressalva escrita na VM: definida
pela implementação, e módulo 2³² no GCC da ESP32, que é o compilador do Arduino
IDE para essa placa.

O `.ino` roda um programa só, então lá não há duas pilhas para se atropelar.

### Os números, arredondados como na VM

A VM só conhece inteiros: o compilador faz `Math.round` em todo número solto que
vira `PUSH` (`gerarValorInterno`, em `web/compilador.js`). O `valor()` do
`arduino.js` escreve o número como veio (`String(v)`). Com caixas:

```
guardar 1.6 em x
VM:   x = 2
.ino: caixa_x = 1.6;   → 1, porque int32_t trunca
```

O `valor()` passa a escrever `String(Math.round(v))` para todo número solto,
o mesmo arredondamento do compilador — `Math.round`, e não o do C++, porque os
dois discordam nos negativos (`Math.round(-1.5)` é `-1`; `lround(-1.5)` é `-2`),
e quem manda é a VM.

Isso também fecha uma divergência que já existia antes das caixas: um número
decimal dentro de uma conta em segundos, `andar frente (1.5 + 1) s`, anda 3 s no
robô (o compilador arredonda cada parte) e 2,5 s no `.ino`. O número sozinho
num campo de segundos continua saindo com uma casa pelo `seg()`, porque ali a VM
multiplica por 1000 antes de arredondar e a casa decimal é de verdade.

---

## Testes

| arquivo | o que prova |
|---|---|
| `tests/vm_test.c` | `STORE_VAR`, `PUSH_VAR` e `CHANGE_VAR` guardam, leem e somam; `CHANGE_VAR` estourando dá a volta; índice fora da faixa para a VM nos três; a caixa sobrevive a `vm_load` + `vm_run`; `ZERAR` zera como instrução e como primeira do programa |
| `tests/tarefas_test.c` | **duas tarefas fazendo «mudar x por 1» num laço de N voltas terminam com 2N**; `ZERAR` antes do cabeçalho não desloca as tarefas |
| `tests/compilador.test.js` | programa sem `zerarCaixas` gera bytecode idêntico ao de antes; o bytecode de `caixa`, `guardar` e `mudar`; `zerarCaixas` emite `ZERAR` mesmo sem caixa na árvore; os `inicio` somam 1 com `ZERAR`; conta de profundidade máxima dentro de `mudar` passa, e uma a mais dá o erro no bloco |
| `tests/caixas.test.js` | criar dá o menor livre; renomear não mexe; apagar libera; **apagar e desfazer volta ao mesmo lugar**; a 17ª é recusada; **lugar apagado continua sujo, e só o aviso de programa com `ZERAR` o limpa**; mapa e sujos voltam iguais depois de gravados e lidos; **estado corrompido não quebra a página**: id que não é texto, lugar fora de 0..15 ou não inteiro, e dois ids no mesmo lugar (fica o primeiro) são descartados, e um `caixas` que nem é objeto vira mapa vazio; **`reconciliar` tira fantasma e dá lugar a quem está na tela; cinco trocas de tela sem evento nenhum não prendem lugar; 16 fantasmas gravados não impedem a caixa de verdade; a lembrança de um lugar some quando outra caixa o toma; várias lembranças gravadas no mesmo lugar voltam como uma só** |
| `tests/guardar.test.js` | `{ nivel, blocos, caixas }` vai e volta; programa antigo sem `caixas` lê com mapa vazio |
| `tests/blocos.test.js` | o nó leva o lugar do mapa e o nome; bloco com caixa sem lugar vira erro no bloco |
| `tests/arduino.test.js` | as seis regras de limpeza; nomes `PWMA`, `delay`, `HIGH`, `__x`, `_Nome`, `3voltas`, `número de voltas` e dois nomes colidindo geram identificadores válidos e distintos; a global é `int32_t` e aparece antes de `fiacao()` e de `programa()`; `mudar` gera `somar(...)` e a função só existe quando há «mudar»; `guardar 1.6` e `guardar -1.6` escrevem `2` e `-2`, `-1.5` escreve `-1`, igual ao bytecode; `andar (1.5 + 1)` escreve os números arredondados; **um sketch gerado com «mudar», com um `main()` colado no fim, compila com `g++ -fsanitize=undefined -fno-sanitize-recover`, roda, e `somar(INT32_MAX, 1)` dá `INT32_MIN`** — o mesmo caminho do teste de sintaxe que já existe, agora linkando, porque o `fake_arduino.h` implementa as funções como `inline`. O fake ganha `#include <stdint.h>`, que o `Arduino.h` de verdade já traz |
| `tests/es5.test.js` | `.normalize(` entra em `PROIBIDO` |
| `tests/tarefas_ponta_a_ponta.test.js` | uma pilha conta, outra lê, no robô virtual |
| `tests/navegador.test.js` | criar caixa pelo botão; tocar em «mudar» duas vezes e no relator mostra `2`; **PLAY de um programa sem caixa zera a caixa tocada por pilha solta**; **guardar 5, apagar a caixa, PLAY, criar outra e tocar nela mostra 0**; apagar e desfazer mantém o número; recarregar a página mantém nome e lugar; **trocar de nível três vezes com dez caixas na tela e depois criar 16 pelo botão dá certo, e a 17ª não abre a janelinha e escreve no cabeçalho; um mapa gravado com 16 fantasmas não impede criar e usar uma caixa depois de recarregar** |

O de navegador e o firmware entram no `make test-lento` e no `make test-tudo`, e
ele confere depois. A prova no S24 FE também é dele.

## Fora deste ciclo

- **Caixa com texto ou lista** — é o ciclo de dados, o último da série.
- **Zerar o lugar de uma caixa apagada** — pede instrução na VM fora de um
  programa; a sobra aparece só numa caixa recém-criada e só até o PLAY.
- **Caixa local de uma pilha** — só faz sentido quando existirem blocos que a
  criança inventa, que é o próximo ciclo.
- **Ver as caixas mudando enquanto o programa roda**, como o MicroBlocks mostra.
  Pede um quadro novo no protocolo, e o toque no relator já responde a pergunta.

## O que a revisão mudou

| achado | o que mudou |
|---|---|
| «mudar» não era atômico entre tarefas | `OP_CHANGE_VAR`; teste com duas tarefas |
| PLAY podia não zerar caixa tocada fora da árvore | `zerarCaixas` emite sempre; `app.js` decide pelo workspace |
| limite de 16 contado pela posição | `web/caixas.js`, mapa estável gravado com o programa; a 17ª não nasce |
| limpeza de nome deixava código inválido | prefixo `caixa_` sempre; global antes da primeira função |
| tabela do `vm_run` contradizia o texto | tabela corrigida |
| profundidade de «mudar» mal descrita | com `CHANGE_VAR`, é a do valor; teste no limite |
| faltavam testes de regressão | todos os pedidos, na tabela acima |

Segunda revisão:

| achado | o que mudou |
|---|---|
| PLAY sem caixa na tela deixava número no lugar de uma caixa apagada | `caixas.js` guarda lugares sujos, apagados inclusive, e grava junto; o PLAY zera quando há sujo |
| `.ino` não arredondava como a VM | `valor()` faz `Math.round` em todo número solto; teste com 1.6, -1.6 e -1.5 |
| estouro do «mudar» indefinido no `.ino` | `somar()` por `uint32_t`, compilada num teste de mesa; `int32_t` no lugar de `long` |

Terceira revisão (aprovada, com ajustes de teste):

| achado | o que mudou |
|---|---|
| `uint32_t` → `int32_t` fora da faixa é definido pela implementação | a spec diz que a garantia é dos compiladores usados (GCC e Clang), e não do padrão |
| `somar_test.c` não testaria o texto que o `arduino.js` escreve | saiu; o `arduino.test.js` compila e roda o sketch gerado, com UBSan |
| estado `caixas` corrompido no `localStorage` | descartado entrada por entrada, com teste |

Revisão do plano:

| achado | o que mudou |
|---|---|
| `workspace.clear()` não dispara `VAR_DELETE`, e a spec dizia que disparava | `reconciliar(ids)` nos dois sentidos, em todo evento não visual e antes de criar, rodar e gravar |
| restaurar não tirava caixa fantasma do mapa | a mesma reconciliação; 16 ids inexistentes no estado gravado não seguram lugar |
| a 17ª caixa prometia bolha, mas bolha precisa de bloco | mensagem no cabeçalho, com a batida — decisão de produto dele, não correção interna; teste de navegador criando 16 e tentando a 17ª |

Segunda revisão do plano:

| achado | o que mudou |
|---|---|
| o teste do mapa corrompido adulterava só no `pagehide`, e o `unload` do app gravava por cima | a adulteração escuta `visibilitychange`, `pagehide` e `unload`, registrada depois do app; se ainda perder, o teste falha em vez de passar |
| `importar` não marcava o lugar de uma lembrança aceita, e centenas podiam apontar para o mesmo | marca; teste com 300 lembranças no mesmo lugar |
