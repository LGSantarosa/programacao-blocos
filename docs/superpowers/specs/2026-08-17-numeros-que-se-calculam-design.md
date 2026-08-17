# Números que se calculam — design

Data: 2026-08-17

Continuação de
[`2026-08-17-exportar-ino-design.md`](2026-08-17-exportar-ino-design.md),
que está implementado e no ar.

Primeiro de uma série. O alvo da série não é paridade com o MicroBlocks: é que a
criança **nunca esbarre num teto**. Cada família de blocos entra quando ela
precisar dela, e a série para quando o bloco deixar de dizer alguma coisa sobre
um robô.

## Objetivo

Hoje todo número num bloco é uma constante que a criança digita. `andar frente
[1] s` só sabe andar um segundo. Este ciclo faz um número poder ser **uma conta**
— `andar frente (aleatório de 1 a 3) s`, `se ((distância cm) < 20)` — e abre um
quarto nível para quem chegou ao teto do Grande.

O bloco que carrega a lição toda é um só: `distância cm` como **valor**. Com ele,
o `se obstáculo a menos de [20] cm`, que ela usa desde os sete anos, deixa de ser
mágica e vira um caso particular de `se ((distância cm) < (20))`.

## De onde veio a lista

Do `microBlocksSpecs` do compilador do MicroBlocks — a fonte da paleta, não a
documentação. São ~100 blocos embutidos mais bibliotecas, em nove categorias.
Descontando o que não existe num robô de dois motores e um sensor de distância
(i2c, spi, serial, display do micro:bit, NeoPixel, BLE, acelerômetro), sobram uns
60. Deste ciclo saem 15.

O critério de corte, para os ciclos seguintes: **entra quando ela precisar, e só
o que fala de robô.**

## A VM ganha pilha

`core/vm.c` passa a ter uma pilha de valores e a ler dela os argumentos que hoje
vêm no corpo da instrução. O formato de 7 bytes não muda: `op` mais três `int16`.

Três caminhos foram considerados:

- **Pilha aditiva, mesmo formato** — escolhido. Caminho único no compilador: todo
  slot de valor vira `PUSH`; `MOTOR 200,200` vira `PUSH 200; PUSH 200; MOTOR`.
- **Dois caminhos** — literal quando dá, pilha quando precisa. Bytecode menor, e
  duas regras por bloco no compilador. Duas regras é o dobro de jeitos de errar.
- **Bytecode de tamanho variável, ao estilo MicroBlocks** — refaz `vm.c`,
  `bytecode.h`, o compilador e o teste dourado de uma vez, e joga fora os testes
  que hoje passam.

### Os opcodes novos

| opcode | efeito |
|---|---|
| `PUSH a` | empilha o literal `a` |
| `SENSOR a` | empilha a leitura do sensor `a` (hoje só `SENSOR_DISTANCIA`) |
| `BIN a` | desempilha dois, empilha um; `a` escolhe a operação |
| `UN a` | desempilha um, empilha um; `a` escolhe a operação |
| `JMP_FALSE a` | desempilha; se falso, salta para `a` |

As operações de `BIN a`: `+ − × ÷ < > = e ou aleatório`. A única de `UN a`: `não`.
O `aleatório de ( ) a ( )` é binário como as outras — desempilha o mínimo e o
máximo. Um opcode com seletor em vez de um por conta: o campo `a` já existe e está
sobrando, e onze opcodes novos por onze contas engordariam a tabela sem ganhar
nada.

`MOTOR`, `WAIT`, `TURN` e `SET_REG` continuam existindo com o mesmo número; passam
a desempilhar os argumentos em vez de lê-los de `a`/`b`. O `SET_REG` entra nessa
lista porque o `repetir [n] vezes` também ganhou encaixe: `n` pode ser uma conta.

`JMP_IF_GE` **sai**. Ele era o sensor embutido num salto; agora o sensor é um
valor e a comparação é um `BIN`. Isso significa que os três blocos de sensor do
Grande — `se obstáculo`, `se…senão` e `repetir até perto` — passam a compilar pelo
mesmo caminho de todo mundo:

```
se obstáculo a menos de [20] cm  →  SENSOR 0 ; PUSH 20 ; BIN <  ; JMP_FALSE depois
```

Eles não mudam na tela e não mudam de comportamento. O que muda é que deixam de
ter um opcode só deles — e é essa unificação que faz o `distância cm` do Gigante
ser o mesmo mecanismo, não um segundo.

### Três decisões que precisam estar escritas

**Dividir por zero dá zero.** Não trava, não para o programa, não mostra erro.
Uma criança vai dividir por zero, e um robô que morre no meio da sala ensina
menos que um que anda estranho.

**Pilha e limites são conferidos ao compilar**, não ao rodar. A profundidade
máxima (`PILHA = 16`) sai da árvore antes de emitir byte nenhum, e estourá-la dá
a mesma classe de mensagem em português que hoje diz «o programa ficou grande
demais».

**A pilha nasce e morre dentro do cálculo de um valor.** Nenhuma instrução que
devolve o controle ao `loop()` — `WAIT`, `TURN` — deixa coisa pendurada nela. É
isso que mantém o watchdog e a não-bloqueância intactos, e é a razão de a pilha
poder ser pequena.

### O teto de instruções

`MAX_INSTR` sobe de 256 para 1024. A pilha aditiva gasta mais instruções por
bloco, e 256 ficaria apertado. O custo é 7 KB no `prog` da VM, contra 320 KB de
RAM na ESP32 — irrelevante.

## O quarto nível: Gigante

Pequeno, Médio, Grande, **Gigante**. A metáfora que já está lá continua sozinha, e
uma criança entende a ordem sem ninguém explicar.

O Gigante herda tudo do Grande e acrescenta as Contas, o `distância cm` e as três
formas gerais de controle. O Grande fica intacto — é o que permite cada ciclo
seguinte pousar sem apertar quem já está lá.

## Os blocos novos

**Contas** — categoria nova, navy `#002080`:

| bloco | forma |
|---|---|
| `( ) + ( )` `( ) − ( )` `( ) × ( )` `( ) ÷ ( )` | valor |
| `aleatório de ( ) a ( )` | valor |
| `( ) < ( )` `( ) > ( )` `( ) = ( )` | verdadeiro/falso |
| `( ) e ( )` `( ) ou ( )` `não ( )` | verdadeiro/falso |

**Sentir** — a família ciano que já existe, um bloco a mais:

| bloco | forma |
|---|---|
| `distância cm` | valor |

**Repetir** — a família amarela que já existe, as versões gerais:

| bloco | forma |
|---|---|
| `se ( ) então { }` | comando |
| `se ( ) então { } senão { }` | comando |
| `repetir até ( ) { }` | comando |

O navy é da paleta da marca e é a única cor dela que ainda não virou bloco. O
risco assumido: é também a cor do cabeçalho, e um bloco navy arrastado por cima
dele pode sumir por um instante. Se ficar ruim na tela, a alternativa é sair da
paleta e usar um verde de operador como o do Scratch — o que o projeto já fez uma
vez, com o verde do PLAY.

### O par que ensina a lição

No Gigante convivem, lado a lado:

```
👁 se obstáculo a menos de [20] cm      ← ciano, herdado do Grande
   { … }

🔁 se ( (distância cm) < (20) ) então   ← amarelo, novo
   { … }
```

O primeiro **sente**; o segundo **decide**. A cor diz isso antes da palavra: o
ciano é da família que lê o mundo, o amarelo é da que escolhe o caminho. E ela vê
que o bloco pronto que usava desde os sete anos era um caso particular — que é
exatamente o momento em que um teto vira degrau.

A redundância é de propósito e não se resolve escondendo um dos dois.

## Os campos viram encaixes

`SEG`, `GRAUS`, `N` e `CM` deixam de ser `field_number` e viram encaixes de valor
com **shadow block** dentro. O shadow desenha e se comporta como o campo de
antes: nos três níveis de baixo, nada muda na tela.

`VEL` **não** muda. É um menu de três opções com nome — `normal`, `devagar`,
`rápido` — e virar encaixe trocaria três palavras que ela lê por um número que
ela não tem por que saber.

Dois tipos de shadow, porque o `repetir` desenha bolinhas:

| shadow | campo | onde |
|---|---|---|
| `numero` | `NUM`, `field_number` | `SEG`, `GRAUS`, `CM` |
| `numero_bolinhas` | `NUM`, `field_bolinhas` | `N` |

**O nome do encaixe é o nome do campo de hoje.** `SEG` continua se chamando
`SEG`, e a tabela de visibilidade do `web/niveis.js` sobrevive quase intacta.

**Esconder passa a ser do encaixe, não do campo.** Um campo escondido dentro de
um shadow deixaria o encaixe aparecendo — um buraco na peça, que é pior que o
número. `input.setVisible(false)` some com o conjunto.

### O `girar` e a regra que já existia

O `girar` tem dois controles para o mesmo valor: o menu `DIR` (↻/↺) e o número
`GRAUS`. A extensão `girar_dir_escreve_graus` faz o menu escrever no número, e o
`Niveis.aplicar` já tem a regra: **quando o controle simples não representa o
valor, aparece o honesto** — um giro de 45° mostra o ângulo em vez de mentir
«direita».

Com `GRAUS` virando encaixe, a regra se estende sozinha e sem cláusula nova: se o
encaixe contém uma **conta** em vez de um número, o menu também não a representa,
então o menu some e o encaixe aparece. A extensão passa a escrever no shadow
(`getInputTargetBlock('GRAUS').setFieldValue(…, 'NUM')`) em vez de num campo
próprio.

E uma pergunta que não precisa ser respondida: o que acontece se ela montar uma
conta no Gigante e descer para o Médio? Nada — trocar de nível já apaga o
trabalho desde o ciclo da troca de nível, e a razão dada lá era exatamente esta.

## O que muda por obrigação

**`web/gabarito.js`** monta blocos com `fields: { SEG: 0.5 }` e passa a montar
`inputs` com shadow. Muda o gabarito e os testes dele — inclusive o
`gabaritos.test.js`, o de três minutos.

**`web/arduino.js`** recebe a mesma AST, então uma expressão vira expressão em C++
quase um para um: `andarFrente(aleatorio(1, 3), 200)`. Entra neste ciclo, não no
seguinte — senão ela monta uma conta no Gigante, aperta `{ } ver código` e leva um
«Bloco desconhecido» na cara. As funções `aleatorio` e `distanciaCm` já são
emitidas sob demanda pela máquina que existe.

**`web/missoes.js`** não muda. O gabarito continua sendo montado na língua de cada
nível, e o Gigante usa a do Grande — as fases atuais não pedem conta nenhuma.

## Um defeito que este ciclo torna visível

`firmware/src/main.cpp:69` rejeita quadros WebSocket fragmentados:

```cpp
if (!info->final || info->index != 0 || info->len != tam) return;
```

Um programa de 256 instruções já são 1795 bytes de `T_LOAD`, acima do MTU típico
de 1436 — ou seja, **um programa grande provavelmente já falha ao carregar na
ESP32 hoje**, em silêncio. Nunca apareceu porque nada rodou em hardware e os
programas são curtos. Subir `MAX_INSTR` para 1024 torna o encontro muito mais
provável.

**Entra neste ciclo.** E entra de um jeito que dá para testar sem placa: a
remontagem vira uma função C pura em `firmware/src/quadros.h`, sem uma linha de
Arduino, e o `tests/Makefile` a compila num `quadros_test.c` junto com os outros
testes em C. O `main.cpp` passa a ser só a fiação — recebe o pedaço, entrega ao
montador, e age quando ele disser que a mensagem acabou.

```c
typedef struct {
    uint8_t  buf[3 + MAX_INSTR * INSTR_BYTES];
    uint32_t recebido;
} Montador;

/* Devolve o tamanho da mensagem completa, ou 0 se ainda falta pedaço. */
uint32_t montador_pedaco(Montador *m, const uint8_t *dados, uint32_t tam,
                         uint32_t indice, uint32_t total, int final);
```

O buffer é estático e do tamanho máximo que o protocolo permite — 7171 bytes com
`MAX_INSTR` em 1024, contra 320 KB de RAM. Mensagem maior que isso é descartada
inteira, e o montador volta ao zero em vez de guardar meia mensagem para
corromper a próxima.

O `bridge` não muda: ele nunca fragmentou. E fica registrada uma limitação que já
existe hoje e continua existindo — dois editores abertos ao mesmo tempo
embaralham o buffer, porque nem o código de hoje nem este separam mensagem por
cliente. Com um robô e uma criança, não acontece.

## Testes

| onde | o quê |
|---|---|
| `tests/vm_test.c` | os opcodes novos: pilha, `BIN` de cada operação, divisão por zero, `JMP_FALSE`, `SENSOR` |
| `tests/compilador.test.js` | expressão vira `PUSH`/`BIN` na ordem certa; profundidade de pilha; o teto de 1024 |
| `tests/arduino.test.js` | expressão vira expressão em C++; `aleatorio` e `distanciaCm` emitidos sob demanda |
| `tests/blocos.test.js` | a AST de um bloco com encaixe preenchido por conta, e a de um com shadow intacto |
| `tests/niveis.test.js` | `input.setVisible` por nível; bolinhas dentro do shadow; `girar` com conta esconde o menu |
| `tests/gabaritos.test.js` | as cinco fases nos **quatro** níveis |
| `tests/navegador.test.js` | montar uma conta no Gigante, rodar, e ver o robô andar |
| `tests/quadros_test.c` | mensagem inteira, mensagem em dois pedaços, em três quadros, e uma grande demais que é descartada sem estragar a seguinte |

**O teste dourado continua sendo o contrato.** Ele compara byte a byte o bytecode
do compilador JavaScript com o do teste em C, e todo opcode novo entra nele — é o
que garante que a pilha do navegador e a da placa são a mesma pilha.

## Arquivos tocados

| arquivo | mudança |
|---|---|
| `core/bytecode.h` | opcodes novos, `MAX_INSTR` 1024, sai `OP_JMP_IF_GE` |
| `core/vm.h` | a pilha e seu tamanho |
| `core/vm.c` | a pilha, os opcodes novos, `MOTOR`/`WAIT`/`TURN` lendo dela |
| `web/compilador.js` | expressões, e o caminho único por pilha |
| `web/blocos.js` | os 14 blocos novos e a AST deles |
| `web/campos.js` | os dois tipos de shadow |
| `web/niveis.js` | o nível Gigante e a visibilidade por encaixe |
| `web/gabarito.js` | monta `inputs` com shadow em vez de `fields` |
| `web/arduino.js` | expressões em C++ |
| `web/index.html` | a categoria Contas e o quarto botão de nível |
| `web/app.js` | o botão do Gigante |
| `firmware/src/quadros.h` | **novo** — o montador de mensagens fragmentadas, em C puro |
| `firmware/src/main.cpp` | usa o montador em vez de descartar quadro fragmentado |
| `tests/quadros_test.c` | **novo** — o montador, sem placa |
| `tests/Makefile` | alvo do `quadros_test` |
| `README.md` | o quarto nível, os blocos novos, a tabela de bytecode |

## Fora de escopo

Cada um é o seu próprio ciclo, nesta ordem:

1. **Caixas com nome** — variáveis, com a UI do Blockly. Os opcodes
   `PUSH_VAR`/`STORE_VAR`/`INC_VAR` nascem lá, junto de quem os use.
2. **Tarefas e eventos** — `quando começar`, `quando <condição>`, avisos entre
   pedaços do programa. Precisa de mais de um `pc` na VM.
3. **Blocos que ela inventa** — funções do usuário.
4. **Dados** — listas e texto. O maior salto conceitual e o menos urgente para um
   robô.
5. **Execução viva** — clicar num bloco e ele rodar na hora, sem ciclo de envio.
   Independente de todas as outras, e a que mais muda a sensação de usar.
