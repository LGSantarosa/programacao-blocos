# Entradas nos blocos inventados — design

Data: 2026-09-16

Sexto da série iniciada em
[`2026-08-17-numeros-que-se-calculam-design.md`](2026-08-17-numeros-que-se-calculam-design.md).
Os cinco anteriores — números que se calculam, execução viva, tarefas e eventos,
caixas com nome, blocos que ela inventa — estão no master.

## Objetivo

O ciclo 5 deu à criança o «dançar»: um nome para um pedaço de programa. Mas o
bloco inventado não recebe nada, então «quadrado» só sabe fazer quadrado de um
tamanho. Para fazer um quadrado de 30 e outro de 50, ela ensina dois blocos.

Este ciclo deixa o bloco **receber números**: 🧩 ensinar quadrado (lado), e na
hora de usar, um buraco onde ela põe 30 ou 50 — ou uma conta.

A resposta — o relator «dobro de [n]», que encaixa onde um número encaixa —
**não** entra aqui. Fica para o degrau seguinte.

## As decisões, e de onde vieram

Todas dele, em 2026-09-16.

**Até três entradas, criadas por um ➕ na cabeça.** Três é teto pequeno e
assumido: é o que cabe na largura de uma peça num tablet, e cobre «quadrado
[lado]» e «retângulo [largura] [altura]». O mutator do Blockly — que não teria
teto nenhum — foi recusado: é a peça mais complicada do Blockly de fazer
funcionar no toque, e o projeto não usa nenhum.

**A peça de ler a entrada só vive dentro da cabeça.** «🧩 lado» é um relator
roxo que ela arrasta da própria cabeça `ensinar`, como no Scratch. Fora da
definição é erro com bolha. Não vai para a gaveta: uma peça na gaveta que só
funciona num lugar é uma peça que promete o que não cumpre.

**Renomear espalha; apagar esmaece.** Renomear «lado» troca o nome em toda peça
roxa daquela cabeça e no rótulo do buraco de todos os usos. Apagar a entrada
deixa as peças roxas órfãs cinzas, com bolha ao rodar — a mesma regra que o
ciclo 5 deu à definição apagada. Nada some sem a criança ver.

**O argumento é re-avaliado a cada leitura, e isso fica escrito.** Ver a seção
«O preço, medido». A alternativa — guardar o valor num lugar de caixa — foi
recusada porque gasta um dos 16 lugares que são dela e porque caixa é da VM e
não da tarefa: duas tarefas usando o mesmo bloco ao mesmo tempo embaralhariam o
argumento uma da outra, e o ciclo 3 pagou caro justamente para as tarefas não se
embaralharem.

**O `.ino` recusa exportar o caso que ele não sabe contar.** Ver «O `.ino`».

## O caminho: o ambiente empilhado

O ciclo 5 escolheu a cópia: a árvore já traz, dentro de cada uso, as peças da
definição, e o compilador as gera no lugar. Este ciclo continua nela. O que
entra é um **ambiente**: ao gerar o corpo de um uso, o compilador empilha os
argumentos daquele uso; ao encontrar a peça roxa, gera ali a subárvore do
argumento.

**Nenhum arquivo em `core/` ou `firmware/` muda. Não se regrava a placa.** A VM
não sabe que blocos inventados existem, e continua sem saber.

O caminho da VM — opcodes de chamar e voltar, com quadro e locais por tarefa —
foi recusado de novo, pelo mesmo motivo do ciclo 5: a vantagem de verdade dele é
a recursão, e a recursão continua fora. Quem um dia a trouxer traz o caminho da
VM junto.

**O corpo compartilhado nunca é reescrito.** A tradução do ciclo 5 entrega o
mesmo array de nós a todos os usos de uma definição, e é isso que impede a
explosão de fan-out — vinte definições encadeadas dariam mais de um milhão de
nós. Substituir o argumento *dentro* do array refaria essa explosão, uma cópia
por uso. Por isso a substituição acontece na **geração**, contra um ambiente, e
a árvore fica como está.

---

## As peças — `web/blocos.js`

`N_ENTRADAS = 3`, constante deste arquivo. Não vai para `core/bytecode.h`: a VM
não precisa saber.

### A cabeça `bloco_ensinar`

Ganha até três rótulos de entrada ao lado do nome:

> 🧩 ensinar [quadrado] ➕ (lado)

**Cada entrada tem um id que nunca muda; o nome é só o que aparece.** É a lição
do `web/caixas.js`: lá, contar a caixa pela posição na lista fazia «pontos»
mostrar o número de «voltas» quando outra era apagada. Aqui, amarrar o argumento
ao nome faria renomear «lado» jogar fora o número que a criança já digitou no
buraco. O id amarra as duas pontas.

O id e os nomes vivem no `saveExtraState` / `loadExtraState` da cabeça — os
ganchos que o serializador JSON usa, que é o que o projeto usa em
`Blockly.serialization.blocks.append` e o que o desfazer atravessa.

`getProcedureDef()` passa a devolver `[nome, ['lado'], false]` em vez de
`[nome, [], false]`. O núcleo continua dando de graça o `findLegalName` e o
renomear espalhado, e o validador que ignora a primeira atribuição do nome —
a armadilha paga no ciclo 5 — fica exatamente como está.

### O ➕ é um campo, não o corpo do bloco

Um `field_image` na cabeça, com clique próprio.

Isto não é detalhe de implementação: no projeto, **tocar no corpo de um bloco
roda a pilha dele**. Um ➕ desenhado no corpo faria a dança inteira rodar toda
vez que ela quisesse uma entrada. Tocar num *campo* abre o editor do campo — é
por isso que tocar no número abre o teclado em vez de o robô sair andando. Ver a
memória do gesto de clique do Blockly.

### O rótulo da entrada é campo de texto, e faz as três coisas

- O ➕ cria a entrada já com um nome livre («entrada», «entrada2»…). Com três
  entradas, o ➕ some.
- O nome de cada entrada é um **`field_input`** na cabeça — exatamente o que o
  campo `NOME` do bloco já é hoje. Tocar edita ali mesmo: trocar renomeia,
  **deixar vazio apaga**.

Decidido assim em 2026-09-16, contra o primeiro desenho, que mandava abrir o
`Blockly.dialog.prompt` ao tocar no rótulo. O impedimento é real e vale
escrever: `field_label_serializable` herda `EDITABLE = false` e **não é
clicável**, então a janelinha exigiria um ícone de lápis por entrada — dois
campos por entrada na largura de uma peça, num tablet. O campo de texto dá o
mesmo comportamento com um campo só, e já está provado no WebView do app, que
é onde o `window.prompt` falha.

O ➕ continua sendo **campo**, e não corpo de bloco: `Blockly.FieldImage` aceita
o clique pelo quinto parâmetro do construtor. Tocar no corpo de um bloco roda a
pilha dele — um ➕ desenhado no corpo faria a dança inteira rodar toda vez que
ela quisesse uma entrada.

### A peça de usar `bloco_usar`

Ganha um `input_value` por entrada, com shadow `numero` dentro, como todo
encaixe de número do projeto.

**O nome do encaixe é o id, não o nome da entrada:** `ENT_e7`. É isso que faz
renomear preservar o número que já estava no buraco — renomear mexe só no
rótulo. Apagar a entrada tira aquele encaixe, e o que estava dentro dele vai
junto, que é o que se espera.

A biblioteca de procedimentos do Blockly não é carregada pelo projeto, então
quem acerta os usos quando a lista de entradas muda é este arquivo: uma função
que varre `getBlocksByType('bloco_usar')`, escolhe os do nome daquela definição
— sem maiúscula e minúscula, como o `Names.equals` do núcleo compara — e
acrescenta, renomeia ou tira encaixes. É chamada do ➕ e da janelinha do rótulo.

Os usos guardam a própria lista de encaixes no `saveExtraState`, e não a
derivam da definição na hora de carregar: uma peça de usar cuja definição foi
apagada continua desenhando os buracos que tinha, esmaecida, em vez de encolher
sozinha na tela. Nada some sem a criança ver.

### A gaveta «Meus blocos»

Como hoje, montada na hora de abrir, com o botão em cima e uma peça de usar por
definição — agora com os buracos e os shadows já dentro. A peça roxa **não**
entra na gaveta.

---

## A tradução — `web/blocos.js`

### Os nós

```js
{ op: 'usar', nome: 'quadrado', corpo: [...], args: [{ id: 'e7', nome: 'lado', valor: <nó> }], blockId }
{ op: 'entrada', id: 'e7', nome: 'lado', blockId }
```

O `args` é uma **lista na ordem das entradas da definição**, e não um objeto: a
ordem é o que o `.ino` usa para montar a chamada. O id é o que o compilador usa
para achar o argumento.

O corpo continua traduzido uma vez por tradução e compartilhado entre os usos,
como no ciclo 5 — e continua sendo o corpo **sem** argumento nenhum dentro.

### Os erros

Dois novos, `Error` com `blockId`, como os do ciclo 5:

- peça roxa fora de qualquer cabeça `ensinar`:

  > Esta peça só funciona dentro do bloco que você ensinou.

- peça roxa de uma entrada que foi apagada (órfã):

  > Essa entrada não existe mais. Desfaça para trazê-la de volta, ou tire esta
  > peça.

O uso a que falte argumento não é erro de tradução: o buraco vazio já vira `0`
pelo caminho que o `gerarValorInterno` tem para `null`, como qualquer encaixe
vazio do projeto.

---

## O compilador — `web/compilador.js`

### O ambiente

`case 'usar'` empilha um quadro antes de gerar o corpo e desempilha depois. O
quadro é `id → { no, quadroDeOrigem }`.

`gerarValorInterno` ganha `case 'entrada'`: acha o id no quadro do topo, e gera
a subárvore do argumento **com o quadro de origem no topo**, restaurando o
quadro corrente depois.

**O argumento pertence a quem chamou.** Se «quadrado» usa «linha» passando
`lado` adiante, ao gerar o corpo de «linha» o nó `entrada` do `lado` tem de ser
resolvido no quadro **do uso de fora**. Sem isso, blocos encadeados leem o
argumento errado — e calados, que é o pior jeito de errar. É por isso que cada
entrada do quadro carrega a sua origem, e não só o nó.

Peça roxa sem quadro nenhum, ou com um id que o quadro não conhece, é erro com
`blockId` — não pode virar `PUSH 0` em silêncio.

**Buraco vazio e encaixe que não existe são coisas diferentes**, e é fácil
confundi-las ao implementar:

- o encaixe existe e está vazio — ela tirou o shadow — vale `0`, pelo caminho
  que o `gerarValorInterno` já tem para `null`, como qualquer encaixe vazio do
  projeto;
- o encaixe **não existe** no uso, e o corpo lê aquela entrada: é um uso que
  ficou para trás da definição (desfazer pode produzir isso), e vira erro na
  peça de usar. Cair no `0` aqui esconderia da criança que aquela peça está
  desencontrada da definição.

### A profundidade da pilha

`conferirProfundidade` mede hoje a árvore de um valor e a compara com
`PILHA_MAX = 16`. Com substituição, **uma folha vira uma árvore inteira**: uma
conta funda passada a um bloco que a usa dentro de outra conta pode estourar a
pilha sem ninguém perceber.

A função que mede aprende a mesma regra de resolução do gerador: ao chegar num
nó `entrada`, mede o argumento no quadro de origem. Assim o que é medido é o que
vai ser gerado, que é a única medida que vale.

### O teto

Nada muda. O `emitir` já confere `MAX_INSTR = 1024` na hora, com
`codigo: 'programa_grande'`, e a regra do ciclo 5 continua: só esse erro troca
de dono ao subir pelos usos, e cai na peça de usar mais de fora. Substituição só
acrescenta instruções — está coberto.

### O preço, medido

Cada leitura da peça roxa gera o argumento de novo. Medido hoje contra o
`1a88fce`, com dois usos do mesmo nó de valor numa árvore:

```
0 PUSH a=1      3 TURN           6 BIN ALEATORIO
1 PUSH a=10     4 PUSH a=1       7 TURN
2 BIN ALEATORIO 5 PUSH a=10      8 HALT
>> sorteios gerados: 2
```

São **3 instruções por leitura** — o argumento inteiro — em vez de 1, e com `🎲`
ou o sensor **um número diferente a cada leitura**. «quadrado (🎲 1 a 10)»
desenha quatro lados de tamanhos diferentes.

Isso é aceito, e por três razões: a esmagadora maioria dos argumentos é número
digitado no teclado, onde re-avaliar não muda nada; o caso torto é visível e
engraçado, não um erro silencioso; e as duas saídas alternativas custam um lugar
de caixa e uma corrida entre tarefas, ou um teto novo — e teto novo é o que a
série inteira existe para não criar.

---

## O `.ino` — `web/arduino.js`

A entrada vira parâmetro de verdade, e a função continua sendo gerada uma vez:

```cpp
void bloco_quadrado(int p_lado) {
  for (int i = 0; i < 4; i++) {
    andarFrente(p_lado, 200);
    girar(90);
  }
}
...
bloco_quadrado(30);
```

- **`valor()`** ganha o caso `entrada`, devolvendo o nome do parâmetro. Aqui
  **não** há substituição: é o parâmetro que faz o arquivo continuar legível, e
  legibilidade é o alvo declarado deste arquivo.
- **Prefixo próprio, `p_`**, pelo `identificadorDe` que já conta colisão
  separada por prefixo. Sem ele, uma entrada chamada «i» colidiria com o
  contador do `repetir` e uma chamada «delay» com a função do Arduino.
  O `declaracoes()` continua declarando só o que tem prefixo `caixa_`, então
  parâmetro não vira variável global.
- **Todos `int`:** a VM só conhece inteiros, e o `andarFrente` recebe float sem
  reclamar.
- **A chamada** leva os argumentos na ordem do `args`.

### A recusa

A função tem parâmetro por valor: `bloco_quadrado(aleatorio(1, 10))` sorteia
**uma vez**. A VM sorteia a cada leitura. Para argumento constante — quase tudo
— não há diferença nenhuma; a divergência só existe quando o argumento **não é
constante** e a peça roxa é lida **mais de uma vez** no corpo.

Nesse caso, e só nele, o `.ino` recusa:

> O 🎲 e o 👁 dentro de um bloco com entrada fazem o robô sortear de novo a cada
> vez que ele lê a entrada, e o código do Arduino sorteia uma vez só. Ponha o
> número direto para ver o código.

É o caminho que o `📣 avisar` já usa hoje («Tire os avisos para ver o código»):
o arquivo nunca mente sobre o robô. Recusar é melhor que gerar um código que
compila, parece certo e anda diferente.

A conta é por uso — o argumento pode ser constante num uso e não no outro — e
por entrada: quantas vezes aquela entrada é lida no corpo da definição.

---

## Testes

| arquivo | o que prova |
|---|---|
| `tests/blocos.test.js` | o nó `usar` leva `args` na ordem da definição, com id e nome; a peça roxa vira nó `entrada`; renomear a entrada troca o rótulo e **preserva o número já digitado no buraco**; apagar deixa a peça roxa órfã e tira o encaixe dos usos; peça roxa fora da cabeça dá erro no `blockId` dela; os ids sobrevivem a salvar, carregar e desfazer; a peça de usar de uma definição apagada continua desenhando os buracos que tinha |
| `tests/compilador.test.js` | o argumento é gerado onde a peça roxa está; lido duas vezes, gera duas vezes; «a» passa o argumento para «b» e o nó resolve **no quadro de quem chamou**; conta funda passada a um bloco que a usa dentro de outra conta dá o erro do `PILHA_MAX`; peça roxa com id desconhecido dá erro com `blockId`; a cadeia de vinte definições continua dando o erro do teto **sem explodir**, medido por contagem e não por relógio |

### Explosão se prova por contagem, não por cronômetro

O ciclo 5 provou a árvore compartilhada com limites de tempo — «traduz em
milissegundos». O limite pega a explosão exponencial, mas é medida de relógio
num projeto que já tem uma falha intermitente sem reprodução (o F3), e máquina
ocupada derruba teste certo.

Então cada prova de explosão neste ciclo tem três camadas, nesta ordem de
importância:

1. **estrutural** — dois usos da mesma definição recebem **o mesmo array**
   (identidade, `assert.strictEqual`), que é a propriedade de que tudo depende;
2. **contagem** — número de nós, de funções geradas e de instruções emitidas
   fica abaixo de um teto escrito no teste; é o que distingue linear de
   exponencial sem olhar o relógio;
3. **tempo** — um limite folgado, só como rede: se as duas de cima passarem e
   esta falhar, é máquina ocupada, e o teste diz isso na mensagem.
| `tests/arduino.test.js` | `void bloco_quadrado(int p_lado)` com a chamada `bloco_quadrado(30)`; entrada chamada «i» ou «delay» não colide e não vira global; a recusa sai com `🎲` lido duas vezes e **não** sai com `🎲` lido uma vez nem com argumento constante; o sketch com entrada compila no g++ |
| `tests/niveis.test.js` | a peça roxa não aparece na gaveta, e o Avançado continua sendo o único nível com os blocos inventados |
| `tests/tarefas_ponta_a_ponta.test.js` | «quadrado 30» dentro de uma pilha «quando» anda no robô virtual |
| `tests/navegador.test.js` | o ➕ cria a entrada e o buraco aparece no uso; arrastar a peça roxa de dentro da cabeça; tocar no rótulo renomeia e o número do buraco fica; esvaziar o nome apaga e esmaece a peça roxa |
| `tests/navegador.test.js` (ciclo de vida) | **com a gaveta «Meus blocos» aberta**, criar entrada, renomear e apagar mudam o que está à vista sem fechar e reabrir; desfazer e refazer cada uma das três; copiar e colar um uso preserva os ids dos encaixes; recarregar a página traz cabeça, entradas e usos com os números nos buracos |

### Por que uma linha só para o ciclo de vida

O ciclo 5 passou em tudo que planejou e mesmo assim precisou do commit
corretivo `1a88fce`, por duas falhas que os testes planejados não alcançavam: o
validador do nome espalhava renomeação na **carga** (porque o campo nasce «meu
bloco» e recebe o nome salvo depois), e a gaveta ficava desatualizada **enquanto
aberta** — que é o estado real, já que o botão de criar mora dentro dela. O
teste planejado criava a definição e só então abria a gaveta, mascarando
exatamente o caso que quebrava.

As duas eram falhas de ciclo de vida do Blockly, não de lógica. Por isso, neste
ciclo, criação com a gaveta aberta, carga, desfazer/refazer e copiar/colar são
**provas exigidas**, e não consequências que se espera que apareçam.

No teste de navegador, todo toque confere com `elementFromPoint` que caiu na
peça, e as peças ficam em y ≤ ~460 — lição do ciclo 4.

## Fora deste ciclo

- **Resposta** — o relator «dobro de [n]». É o degrau seguinte, e é o que pede
  decidir o que «parar» faz dentro de um relator.
- **Recursão** — pede chamar e voltar na VM.
- **Mais de três entradas** — pede o mutator.
- **Entrada que não seja número** — não há texto nem lista no projeto ainda.
- **Caixa local do bloco** — com substituição não há quadro onde ela moraria.
