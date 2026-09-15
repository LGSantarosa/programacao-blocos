# Blocos que ela inventa — design

Data: 2026-09-15

Quinto da série iniciada em
[`2026-08-17-numeros-que-se-calculam-design.md`](2026-08-17-numeros-que-se-calculam-design.md).
Os quatro anteriores — números que se calculam, execução viva, tarefas e
eventos, caixas com nome — estão no master.

## Objetivo

Hoje, para o robô dançar três vezes em três lugares do programa, a criança monta
a dança três vezes. Não há como dar nome a um pedaço de programa e usá-lo como
se fosse uma peça pronta — e é esse o teto que o Avançado encontra depois das
caixas.

Este ciclo deixa a criança **ensinar um bloco novo ao robô**: ela dá um nome,
monta as peças embaixo dele, e a partir daí «dançar» aparece na gaveta como uma
peça como as outras.

## As decisões, e de onde vieram

Todas dele, em 2026-09-15.

**Sem entrada.** O bloco inventado não recebe números na hora de usar: é um
nome para um pedaço de programa. Entradas («quadrado [lado]») e resposta
(«dobro de [n]») são degraus seguintes, quando a criança pedir.

**Pode usar outro bloco inventado, mas não a si mesmo.** «dançar» pode usar
«girar duas vezes»; «dançar» dentro de «dançar» — ou «a» usa «b» e «b» usa
«a» — vira bolha. Para repetir, existe o repetir.

**Apagar a definição não apaga os usos.** As peças «dançar» ficam na tela,
esmaecidas, e rodar mostra a bolha dizendo que aquele bloco não existe mais.
Desfazer traz a definição de volta e elas acendem. Nada some sem a criança ver.

## O caminho: o compilador copia as peças

A árvore que chega ao compilador já traz, dentro de cada uso, as peças da
definição. O compilador as gera no lugar do uso, como se a criança as tivesse
montado ali.

**A VM, o protocolo, o firmware e o app não mudam.** Não há regravar placa.

O outro caminho — opcodes de chamar e voltar, com pilha de retorno por tarefa —
foi recusado. Ele gasta uma instrução por uso em vez de uma cópia inteira, mas a
vantagem de verdade dele é permitir recursão, e a recursão ficou de fora. Sem
ela, mexer na VM de novo e regravar a placa não compram nada.

O preço da cópia fica escrito: «dançar» de 30 instruções usado dez vezes gasta
300 das 1024 que o robô guarda. O teto já existe e já tem frase
(`naoPassaDoTeto`, em `web/compilador.js`); este ciclo não o muda.

É a recusa da recursão que torna a cópia possível: sem ela, copiar um bloco que
usa a si mesmo nunca terminaria. As duas decisões andam juntas, e quem um dia
trouxer a recursão traz o caminho da VM junto.

---

## As peças — `web/blocos.js`

Cor nova, roxa, `#a040c0` — nenhuma família usa, e um bloco inventado não é
movimento, nem laço, nem conta: é da criança. Precisa bater com `web/niveis.js`.

| bloco | forma |
|---|---|
| `bloco_ensinar` | 🧩 ensinar [dançar] — cabeça, com `CORPO` embaixo |
| `bloco_usar` | 🧩 dançar — comando, encaixa em pilha |

### `bloco_ensinar`

Cabeça sem conexão de cima, como `quando_aviso`: as peças penduram num
`input_statement` `CORPO`. O nome é um `field_input` `NOME`.

O validador do `NOME` é o `Blockly.Procedures.rename` do núcleo, posto por
extensão — o JSON do Blockly não aceita validador, e é o mesmo jeito que o
`girar` já usa (`girar_dir_escreve_graus`). O `rename` do núcleo
(`web/vendor/blockly_compressed.js` 8.0.5) faz as duas coisas que o ciclo
precisa:

- recusa nome repetido com `findLegalName`, que vira «dançar2»;
- chama `renameProcedure(antigo, novo)` em todo bloco da tela — e a peça de
  usar responde trocando o próprio nome.

Para o núcleo reconhecê-la, a cabeça tem `getProcedureDef()`, que devolve
`[nome, [], false]`: nome, nenhuma entrada, sem resposta.

A biblioteca de blocos de procedimento do Blockly (`procedures_defnoreturn` e
companhia) não é carregada pelo projeto, e é ela que apaga os usos quando a
definição some. Usando só o núcleo, apagar a definição não leva ninguém junto
— que é a decisão acima.

### `bloco_usar`

Comando com `previousStatement` e `nextStatement`. O nome é um `field_label`
`NOME` — não editável na peça: renomear é na cabeça, e o `rename` espalha.

Métodos para o núcleo: `getProcedureCall()` devolve o nome;
`renameProcedure(antigo, novo)` troca o rótulo quando o antigo é o dela.

O rótulo é `field_label`, e não clicável: tocar no nome roda a peça (ver a
memória do gesto do Blockly).

### A gaveta «Meus blocos»

Categoria `custom="MEUS_BLOCOS"`, só no Avançado, montada na hora de abrir, como
a das caixas:

- em cima, o botão **«🧩 Criar bloco»**;
- embaixo, uma peça `bloco_usar` para cada definição na tela, em ordem de nome.

Sem definição nenhuma, só o botão.

O botão pede o nome pela mesma janelinha das caixas (`Blockly.dialog.prompt`,
que no app é o `WebChromeClient`), passa o nome pelo `findLegalName` e põe uma
`bloco_ensinar` na tela, no canto visível de cima à esquerda da área rolada,
com a seleção nela. Nome vazio ou cancelado não cria nada.

---

## A tradução — `web/blocos.js`

### O nó

```js
{ op: 'usar', nome: 'dançar', corpo: [ ...nós da definição... ], blockId }
```

O `corpo` é a pilha da definição traduzida pelo mesmo `pilhaParaAst` de sempre.
Os nós de dentro carregam os `blockId` das peças **da definição**, não do uso —
então, com o robô rodando «dançar», o `T_PC` acende as peças dentro da cabeça
`ensinar`, que é onde a criança montou a dança.

O `blockId` do nó `usar` é o da peça de usar. É nele que caem os dois erros
abaixo.

### Os dois erros

Traduzir guarda a lista dos nomes que estão sendo traduzidos agora. Chegar num
`bloco_usar` cujo nome já está na lista é ciclo:

> Um bloco não pode usar a si mesmo. Para fazer de novo, use o repetir.

Com o `blockId` da peça de usar que fechou o ciclo — a mais funda. Em «a» usa
«b» usa «a», a bolha cai no «a» de dentro de «b», que é a peça que a criança
precisa tirar.

Chegar num `bloco_usar` sem definição na tela (`Procedures.getDefinition`
devolve `null`):

> Esse bloco não existe mais. Desfaça para trazê-lo de volta, ou tire esta peça.

Os dois são `Error` com `blockId`, como o `noDeCaixa` do ciclo 4, e o `app.js`
já os mostra na bolha (a árvore é montada dentro do `try` desde aquele ciclo).

### O que roda o quê

- **PLAY:** a cabeça `ensinar` não é tarefa. `workspaceParaTarefas` e
  `temTarefas` não a olham, e o bytecode de um programa sem bloco inventado é o
  de hoje, byte por byte.
- **Tocar na cabeça `ensinar`**, ou numa peça dentro dela: roda o corpo uma vez,
  com `ehPrograma: false` — como já acontece com as cabeças «quando».
  `pilhaDoBloco` ganha o caso.
- **Tocar numa peça de usar solta:** roda a pilha dela, com a cópia.
- **Cabeça `ensinar` vazia:** usar é não fazer nada, e não é erro.

---

## As peças esmaecidas

Um ouvinte no `app.js`, em todo evento que não é de interface, passa pelas
peças `bloco_usar` da tela e acerta a cor: com definição, `#a040c0`; sem,
cinza `#b0b0b0`. `setColour` não dispara evento, então o ouvinte não se chama
de novo.

**Não se usa o "desligar" do Blockly.** O `pilhaParaAst` pula peça desligada em
silêncio (`isEnabled()`), e a criança apertaria PLAY num programa com «dançar»
quebrado sem ver aviso nenhum — o robô só não dançaria. Esmaecer é aparência;
o aviso vem da tradução.

A gaveta também é montada na hora, então uma definição apagada some da gaveta
sem regra nova.

---

## O compilador — `web/compilador.js`

Um caso a mais no `gerar`:

```js
case 'usar':
  gerar(no.corpo || []);
  break;
```

É tudo. O `repetir` de dentro da definição continua contando a profundidade dos
registradores (`N_REGS = 4`) a partir de onde o uso está: «dançar» com um
repetir, usado dentro de outro repetir, são dois níveis. O erro «repetir
aninhados demais» que já existe cobre, e aponta o repetir de dentro da
definição.

A profundidade da pilha de valores não muda: cada conta é conferida no nó dela.

---

## O `.ino` — `web/arduino.js`

Aqui não se copia: o `.ino` é para ler, e uma dança copiada três vezes é o
contrário de ler.

Cada definição usada vira uma função:

```cpp
void bloco_dancar() {
  girar(90);
  girar(-90);
}
```

- **Nome:** `limparNome` ganha o prefixo como parâmetro — `caixa_` para as
  caixas, `bloco_` para os blocos. Mesmas regras de acento, `_` e colisão, com
  a contagem de colisão separada por prefixo.
- **Uso:** `bloco_dancar();`.
- **Ordem:** a função aparece depois das de apoio e antes de quem a usa. Sem
  ciclo, há sempre essa ordem: a função de uma definição vem depois de toda
  função que ela usa. É a mesma regra do arquivo — cada função antes de quem a
  chama —, e é o que o g++ do teste cobra.
- **Laços:** dentro da função o `repetir` recomeça em `i`; as variáveis são
  locais da função.
- **Varredura:** `usoDe` entra no `corpo` de cada `usar`, senão uma dança que
  lê o sensor geraria um arquivo chamando `distanciaCm()` sem declará-la.

### O «parar» dentro de uma função

Em `programa()`, «parar» vira `parar(); return;`, e o `return` acaba o
programa. Dentro de `bloco_dancar()` o mesmo `return` só sairia da função, e o
robô seguiria para o bloco seguinte — onde a VM parou tudo.

Dentro de função, «parar» vira:

```cpp
parar();
fim();
```

com a função de apoio, declarada só quando é usada:

```cpp
/* O robô para aqui, e não volta para quem chamou: é o que o parar faz nos
   blocos. */
void fim() {
  while (true) delay(1000);
}
```

`delay` e não laço vazio: o `delay` do ESP32 cede a vez, e um `while (true) {}`
seco dispara o watchdog da tarefa e reinicia a placa.

---

## Testes

| arquivo | o que prova |
|---|---|
| `tests/blocos.test.js` | `usar` traz o corpo da definição com os `blockId` de dentro dela; «a» usa «b» traduz as duas camadas; usar a si mesmo e ciclo de dois dão erro no `blockId` da peça que fecha o ciclo; peça sem definição dá erro no `blockId` dela; `pilhaDoBloco` numa cabeça `ensinar` roda o corpo com `ehPrograma: false`; renomear a cabeça renomeia os usos; nome repetido vira «dançar2»; `temTarefas` ignora a cabeça `ensinar` |
| `tests/compilador.test.js` | `usar` gera o corpo no lugar; dois usos geram duas cópias; o `pcMap` aponta as peças da definição; repetir dentro de uso dentro de repetir conta dois níveis, e o quinto dá o erro que já existe |
| `tests/arduino.test.js` | `usar` vira `bloco_x();` e a função é declarada uma vez só; a função usada por outra vem antes dela; «parar» dentro de função gera `fim()` e a função `fim` só existe então; sensor lido só dentro de um bloco inventado declara `distanciaCm`; o sketch com dois blocos encadeados e um `parar` compila com g++ |
| `tests/niveis.test.js` | só o Avançado tem os dois blocos e a categoria `custom="MEUS_BLOCOS"` |
| `tests/tarefas_ponta_a_ponta.test.js` | um bloco inventado usado dentro de uma tarefa «quando» anda no robô virtual |
| `tests/navegador.test.js` | criar pelo botão põe a cabeça na tela e a peça na gaveta; tocar na peça de usar roda a dança; apagar a cabeça esmaece a peça e tocar nela mostra «esse bloco não existe mais»; desfazer acende de novo; recarregar a página traz cabeça e usos; usar a si mesmo mostra a bolha na peça certa |

No teste de navegador, todo toque confere com `elementFromPoint` que caiu na
peça, e as peças ficam em y ≤ ~460 — lição do ciclo 4.

## Fora deste ciclo

- **Entradas e resposta** — «quadrado [lado]», «dobro de [n]». Pedem caixa
  local e, provavelmente, o caminho da VM.
- **Recursão** — pede chamar e voltar na VM.
- **Caixa local de um bloco** — sem entrada, não há o que guardar só para ele.
- **Exportar e importar blocos entre programas** — cada programa tem os seus.
- **A peça de usar mostrando por dentro o que ela faz** — tocar na cabeça já
  mostra, e rodando o `T_PC` acende as peças da definição.
