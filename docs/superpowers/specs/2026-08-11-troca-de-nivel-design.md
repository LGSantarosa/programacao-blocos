# Trocar de nível: fechar a aba, confirmar e limpar — design

Data: 2026-08-11

Continuação de
[`2026-08-11-blocos-de-controle-design.md`](2026-08-11-blocos-de-controle-design.md),
que está implementado e no ar.

## Objetivo

Um defeito e uma reversão, e eles têm a mesma causa.

O defeito: trocar de nível não fecha a aba de blocos aberta. A aba continua
mostrando as peças do nível anterior, e dá para arrastar um `se…senão` do Grande
para dentro do Pequeno.

A reversão: trocar de nível passa a **perguntar** e, confirmado, **apagar** o que
estava montado.

## A reversão, escrita por extenso

O design do ciclo A tem como decisão central:

> Um bloco nunca troca de tipo entre níveis. Ele ganha controles. […] Isso tem uma
> consequência que é o ponto todo: **a criança nunca perde trabalho ao subir de
> nível.**

Isto aqui desfaz essa consequência. Vale registrar por que, porque daqui a seis
meses a contradição vai parecer descuido:

**A causa é nova.** Quando existiam só os seis blocos da v1, todo bloco tinha
representação honesta em todo nível — um `andar frente 2 s` do Grande vira um `⬆`
no Pequeno, e o valor fica guardado. Os blocos de controle quebraram isso. Um
`se…senão` no Pequeno não tem desenho simplificado possível: ele não é o `se
obstáculo` com menos campos, é outra coisa. Um `repetir até chegar perto`
tampouco. A promessa de que nada se perde só era sustentável enquanto todo bloco
cabia nos três níveis.

**O que sobrevive da decisão do ciclo A.** A máquina de esconder campo e preservar
valor (`Niveis.aplicar`) continua inteira e continua necessária: é ela que desenha
o mesmo bloco de três jeitos, e é dela que o gabarito depende para se escrever na
língua do nível. O que sai é só a garantia de que um programa montado atravessa
uma troca de nível.

**O que se perde de verdade.** Uma criança no Médio que monta algo e quer ver como
ficaria no Grande agora paga o preço de remontar. É um custo real. A alternativa
— deixar passar peças ilegíveis para baixo — foi julgada pior: um bloco que a
criança não consegue ler nem apagar com confiança é pior que uma tela limpa.

## Escopo do reset

Confirmada a troca:

| | |
|---|---|
| blocos montados | apagados; volta ao `quando apertar PLAY` vazio |
| fase atual | **fica** |
| tentativas na fase | zeradas; o botão `me mostra como faz` some |
| aba de blocos | fecha |
| robô rodando | para, como se tivesse apertado PARAR |

A fase fica porque o nível decide **como os blocos são desenhados**, não **quais
fases já foram vencidas**. Perder cinco fases por espiar o nível de cima é castigo
pesado para uma criança curiosa — e curiosidade sobre o nível de cima é
exatamente o que o seletor sem trava existe para permitir.

Parar o robô não foi pedido; é consequência. Trocar de nível no meio de uma
execução deixaria o robô andando na arena com um programa que não existe mais na
tela.

## Quando **não** perguntar

Duas guardas antes do diálogo. Ambas existem para o mesmo fim: um diálogo que
aparece quando não precisa treina a criança a atravessá-lo sem ler, e aí ele
deixa de proteger.

1. **Nível igual ao atual.** Hoje `trocarNivel` re-executa tudo mesmo clicando no
   botão já afundado. Com reset, isso apagaria o trabalho sem que nada mudasse.
   Passa a sair sem fazer nada.
2. **Espaço de trabalho sem trabalho.** Se só existe a raiz fixa com o corpo
   vazio, não há o que perder. Troca direto.

## O diálogo

Marcação escondida em `web/index.html`, ligada no `web/app.js` — mesmo padrão do
`#missao` e do `#gabarito`, que já são markup mais fiação.

```
Trocar para Pequeno?

Os blocos que você montou vão ser apagados.

[ Não ]                              [ Trocar ]
```

- O título nomeia o **destino**, para o adulto ver o que apertou.
- Tocar fora da caixa, ou `Esc`, equivale a "Não".
- O foco nasce no "Não": o que escapar por teclado escapa para o lado seguro.
- Botões no tamanho dos outros da tela — o projeto inteiro foi ajustado para dedo
  de criança, e um diálogo com botão pequeno seria o único lugar que não foi.
- **O botão do nível não afunda antes da confirmação.** Enquanto o diálogo está
  aberto o seletor continua marcando o nível atual: afundar o botão novo e depois
  desafundá-lo no "Não" mostraria uma troca que não aconteceu.

**Restrições de plataforma, herdadas do CSS existente:** sem `<dialog>` (não
existe no Safari do iOS 9), sem `var()`, sem `gap`, sem `aspect-ratio`, sem
`inset`. Sobreposição é `position: fixed` com `top/right/bottom/left`.

## O defeito da aba

`trocarNivel` (`web/app.js:416`) chama `workspace.updateToolbox(...)`, que
reconstrói a caixa mas não fecha o flyout aberto. Conserta com
`workspace.getFlyout().hide()` na troca.

Isto vale por si só e não depende do resto: mesmo sem confirmação e sem reset, a
aba não pode continuar oferecendo peças do nível que se acabou de sair.

## Onde o código mora

Duas funções novas em `web/blocos.js`. Elas são perguntas sobre o conteúdo do
workspace, e o `blocos.js` já é o dono dessa relação — é ele que traduz workspace
em AST. E, principalmente, ali elas são testáveis em Node com o DOM falso, em
milissegundos, em vez de só no Chromium:

```
Blocos.temTrabalho(workspace)  -> boolean
    Verdadeiro se há qualquer bloco além da raiz fixa `quando_play`.

Blocos.criarRaiz(workspace)    -> o bloco raiz
    Cria o `quando_play` em (40, 30), não-apagável e não-movível.

Blocos.limpar(workspace)       -> o bloco raiz novo
    Esvazia o workspace e recria a raiz. Usa criarRaiz.
```

`criarRaiz` não é função nova de comportamento: é o que hoje está solto em
`web/app.js:58-61`. Ela se muda porque o `limpar` precisa exatamente disso, e
duas cópias da mesma regra é como elas divergem.

## Testes

| onde | o quê | custo |
|---|---|---|
| `tests/blocos.test.js` | `temTrabalho` falso na raiz vazia e verdadeiro com um bloco dentro; `limpar` deixa exatamente uma raiz, não-apagável e não-movível | ms |
| `tests/navegador.test.js` | **reescrito** — ver abaixo | ~1 min |

### O teste que vira do avesso

`tests/navegador.test.js` se chama hoje *«a criança monta, roda e sobe de nível
sem perder nada»* e afirma, na linha 154:

```javascript
assert.strictEqual(…getBlocksByType('mover_frente', false).length, 1,
  'o programa sumiu ao trocar de nível');
```

Essa asserção passa a valer ao contrário. O que **não** muda são as outras
afirmações do mesmo teste — que no Pequeno o número não aparece, que a paleta
também respeita o nível, que o valor escondido continua guardado — porque essas
são sobre desenhar um bloco num nível, e isso segue igual.

O teste reescrito precisa cobrir:

1. Trocar de nível com trabalho montado abre o diálogo, e **nada mudou ainda**:
   nível, blocos e aba seguem como estavam.
2. "Não" fecha o diálogo e deixa tudo como estava.
3. "Trocar" muda o nível, esvazia o workspace até só a raiz, e fecha a aba.
4. Clicar no nível **já ativo** não abre diálogo e não apaga nada.
5. Com o workspace vazio, trocar **não** abre diálogo — troca direto.
6. A aba aberta não sobrevive à troca: depois de trocar, o flyout está fechado.

## Arquivos tocados

| arquivo | mudança |
|---|---|
| `web/blocos.js` | `temTrabalho`, `criarRaiz`, `limpar` |
| `web/app.js` | usa `Blocos.criarRaiz`; `trocarNivel` ganha as guardas, o diálogo e o reset; fecha o flyout |
| `web/index.html` | marcação do diálogo e o CSS dele |
| `tests/blocos.test.js` | as três funções novas |
| `tests/navegador.test.js` | reescrito para o comportamento novo |
| `README.md` | a frase «nada se perde ao descer de nível» deixou de ser verdade na troca |
| `core/`, `host/`, `firmware/src/` | **nada** |
