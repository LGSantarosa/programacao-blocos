# Ciclo C — blocos de controle e gabarito no vocabulário do nível — design

Data: 2026-08-11

Continuação de
[`2026-08-07-ciclo-a-niveis-carisma-design.md`](2026-08-07-ciclo-a-niveis-carisma-design.md),
que está implementado e funcionando, com cinco fases e gabarito automático.

## Objetivo

Dois assuntos, e eles se encontram no mesmo lugar:

1. Acrescentar os quatro blocos de controle de fluxo que a VM já sabe executar —
   `repetir para sempre`, `parar`, `se…senão` e `repetir até chegar perto`.
2. Corrigir um defeito do gabarito: no nível Pequeno ele monta blocos que a
   criança daquele nível não sabe ler nem construir.

Encontram-se porque o conserto do gabarito é o que abre espaço para a fase nova
que exercita os blocos novos.

## Parte 1 — o defeito do gabarito

### O que acontece

No nível Pequeno, `Campos.paraBolinhas(n)` desiste das bolinhas acima de cinco
casas e mostra o algarismo (`web/campos.js:17`). Os gabaritos das fases pedem
trechos de 6, 7, 10, 11 e 12 passos. Resultado medido:

| fase | passos de `andar` | como aparece no Pequeno |
|---|---|---|
| 1 — Leve o robô até a estrela | 6 | `repetir 6` |
| 2 — Agora a estrela está do lado | 5 | `repetir ●●●●●` |
| 3 — Chegue no cantinho de cima | 5, 10 | `repetir 10` |
| 4 — A estrela está atrás do bloco | 5, 12, 5 | `repetir 12` |
| 5 — Saia do labirinto | 12, 5, 11, 7, 12 | `repetir 12`, `11`, `7`… |

Quatro das cinco fases, incluindo a primeira que a criança encontra.

### Por que é pior do que parece

O `FieldBolinhas.showEditor_` avança de um em um e volta a 1 ao passar de cinco
(`web/campos.js:56`). Uma criança no Pequeno **não tem como** chegar a 6 clicando.
O gabarito estava exibindo uma peça que ela não consegue reproduzir — o que
contradiz o motivo de o botão existir: *«a criança que ainda não lê precisa ver a
peça, não a instrução»*.

O design do ciclo A já dizia, na tabela dos três níveis, `🔁 repetir → ●●● (2 a
5)`. O gabarito violava o desenho do próprio nível.

### A correção: corrente de `repetir` de até 5

No Pequeno, um trecho de `n` passos vira uma sequência de blocos `repetir` com no
máximo 5 cada, guloso da esquerda para a direita:

```
12 = 5 + 5 + 2        repetir ●●●●● { ⬆ andar }
                      repetir ●●●●● { ⬆ andar }
                      repetir ●●○○○ { ⬆ andar }
```

Um trecho de 1 passo continua sendo um `⬆ andar` solto, sem `repetir` em volta,
como já é hoje. Isso vale também para o resto da divisão, que é o caso da fase 1:

```
6 = 5 + 1             repetir ●●●●● { ⬆ andar }
                      ⬆ andar
```

Guloso e não equilibrado (6 = 5 + 1, não 3 + 3) porque a regra tem que ser
explicável em uma frase: *enche de cinco em cinco e sobra o que sobrar.* Um
`andar` solto no fim é legível; uma regra que às vezes divide e às vezes não,
não é.

É a única forma em que **todo bloco do gabarito é um bloco que a criança
conseguiria montar sozinha.** Alternativas descartadas:

- **`repetir` aninhado** (12 = 4 × 3): mais curto e ensina multiplicação de
  passagem, mas 7 e 11 são primos e cairiam na corrente mesmo assim — o gabarito
  mudaria de forma de fase para fase sem motivo visível para a criança.
- **Bolinhas em grupos de cinco**: um bloco só na tela, mas a criança continuaria
  sem conseguir chegar a 12 clicando. Segue impossível de reproduzir.
- **Empilhar 12 `andar`**: legível, mas joga fora a lição do `repetir` — e o
  `repetir` é um dos quatro blocos do Pequeno justamente para ser aprendido.

**`web/campos.js` não muda.** A regra do algarismo acima de cinco continua certa
para um `repetir 20` herdado do nível Grande: ali as bolinhas realmente não
representam o valor, e mostrar o honesto é a mesma regra do par `DIR`/`GRAUS`. O
que estava errado era o gabarito *produzir* valores que o Pequeno não desenha.

### Módulo novo: `web/gabarito.js`

O `blocoAndar` mora hoje dentro do `app.js`, que tem 463 linhas e não é testável
em Node — precisa de DOM. Com corrente de `repetir`, três formas por nível e um
tipo de passo novo, essa função triplica de tamanho.

Extrair para `web/gabarito.js`:

```
Gabarito.montar(passos, nivel) -> JSON de serialização do Blockly
```

Função pura, sem Blockly e sem DOM, no mesmo padrão UMD dos outros módulos
(`module.exports` no Node, `raiz.Gabarito` no navegador). O `app.js` passa a só
chamá-la e entregar o resultado a
`Blockly.serialization.workspaces.load`.

O ganho concreto: dá para verificar em milissegundos, em Node, que nenhum
gabarito de nenhuma fase em nenhum nível produz um `N` maior que 5 — em vez de
descobrir isso no Chromium depois de quatro minutos, ou não descobrir, que foi o
que aconteceu.

## Parte 2 — os quatro blocos

### Escopo

Entram os quatro que a VM já executa. **Nenhum opcode novo, nenhuma mudança em
`core/`, `host/` ou no firmware C.**

Fora de escopo, explicitamente:

- **Variáveis e contadores** — exigem aritmética nos quatro registradores, ou
  seja, opcodes novos, e portanto mexer em C, no protocolo e no que já está
  gravado na ESP32. Outro ciclo.
- **Som e luz no robô** — não há buzzer nem LED no HAL. Não é questão de
  software.

### As peças

| tipo | cara na tela | categoria / cor | encaixe |
|---|---|---|---|
| `repetir_sempre` | `🔁 repetir para sempre` + corpo | Repetir, `#f0c000` | topo sim, **base não** |
| `parar` | `🛑 parar tudo` | Mover, `#0050f0` | topo sim, **base não** |
| `se_senao` | `👁 se obstáculo a menos de [20] cm` / corpo / `senão` / corpo | Sentir, `#20b0f0` | normal |
| `repetir_ate_perto` | `🔁👁 repetir até chegar a menos de [20] cm` + corpo | Repetir, `#f0c000` | normal |

Três decisões que valem registrar:

**Sem encaixe de baixo no `para sempre` e no `parar`.** Nada depois deles jamais
roda. Deixar o bump seria mentir com a geometria da peça: a criança encaixaria um
bloco ali e ficaria esperando que ele acontecesse. Sem bump, ela não consegue nem
tentar. Mesma escolha do Scratch, pelo mesmo motivo.

**`parar tudo` em azul, na aba Mover.** É controle de fluxo e por essa lógica
seria amarelo. Mas o modelo mental de quem tem quatro anos é «blocos azuis são o
que o robô faz», e parar é o que o robô faz. A palavra *tudo* e o sinal de pare
carregam o alcance dele, inclusive matar um laço por fora.

**`repetir até` é amarelo com ícone de olho.** A forma e a cor dizem *laço*, que é
o conceito sendo ensinado; o olho diz *sensor*. Colorir de ciano ensinaria a coisa
errada — o que o bloco faz é repetir.

Os campos reaproveitam os nomes existentes (`CM`, `T1`, `T2`), então o mapa de
visibilidade de `niveis.js` cobre os blocos novos **sem nenhum campo novo e sem
nenhuma linha nova no mapa.**

Três textos ficam de propósito como texto cru do `message`, não como
`field_label`: `repetir para sempre`, `parar tudo` e o `senão`. Rótulo virou campo
no ciclo A por um motivo único — precisar sumir no Pequeno, junto com o número que
ele acompanha. Nenhum destes três acompanha número, e nenhum dos três blocos é
oferecido no Pequeno. Mas um bloco montado no Grande continua no espaço de
trabalho quando se desce de nível, e aí a diferença aparece: como texto cru eles
seguem legíveis, enquanto como campo o `se…senão` viraria `👁 20` com os dois
ramos indistinguíveis, e o `parar tudo` viraria um `🛑` mudo.

### Compilação — zero opcode novo

```
repetir para sempre                  parar
  inicio:                              HALT
    <corpo>
    JMP inicio

se…senão                             repetir até chegar perto
  JMP_IF_GE sens, cm, @senao           inicio:
  <ENTAO>                                JMP_IF_GE sens, cm, @corpo  ; longe → roda
  JMP @fim                               JMP @fim                    ; perto → sai
 senao:                                corpo:
  <SENAO>                                <corpo>
 fim:                                    JMP inicio
                                       fim:
```

`JMP_IF_GE` salta quando a leitura é **maior ou igual** ao limite, isto é, quando
*não* há obstáculo dentro da distância. Por isso o alvo do salto é o `senão` no
condicional, e o corpo no laço.

**`repetir até` testa antes de rodar, não depois.** Um `do-while` custaria duas
instruções a menos, mas daria um passo mesmo já estando colado na parede. O bloco
diz *até chegar*, não *pelo menos uma vez* — a peça tem que fazer o que está
escrito nela.

**Nenhum dos dois laços novos gasta registrador.** Só o `repetir N vezes` usa
`DEC_JNZ`, e o limite de quatro aninhados (`N_REGS`) continua sendo só dele.
`para sempre` e `até perto` aninham à vontade.

Corpo vazio no `para sempre` compila para um `JMP` que aponta para si mesmo. Não
trava nada: a VM executa uma instrução por `vm_tick`, então é um laço ocioso que o
botão PARAR encerra. Não vale proibir.

**`OP_JMP` existe em `core/vm.c` desde a v1 e nunca foi emitido pelo
compilador.** Estes blocos são o primeiro uso real dele.

`tests/vm_test.c` já tem `teste_jmp_incondicional`, mas ele só cobre salto **para
frente** — pular por cima de uma instrução. Os três blocos novos emitem salto
**para trás**, que é o que fecha um laço, e isso a VM nunca executou em teste
nenhum. Entra um caso novo para o salto para trás, não para o `JMP` em geral.

### Distribuição por nível

| | Mover | Repetir | Sentir | total |
|---|---|---|---|---|
| Pequeno | frente, trás, girar | repetir | — | 4 — **intacto** |
| Médio | + esperar, **parar** | + **para sempre** | se obstáculo | 8 |
| Grande | idem Médio | + **até perto** | + **se…senão** | 10 |

O Pequeno não recebe nada. Ele vale justamente por ser pequeno, e cada peça nova
é uma escolha a mais na frente de quem tem quatro anos. `para sempre` ali seria
armadilha: a fase nunca terminaria.

A escada Médio → Grande separa o concreto do condicional. `parar` e `para sempre`
não têm condição embutida; `se…senão` e `até perto` têm.

## Parte 3 — a fase 6

```
texto:       "Chegue bem pertinho da parede"
obstáculos:  []            (arena vazia — sem o bloco)
início:      (1.00, 0.25) olhando para cima
estrela:     (1.00, 1.70)
trilha:      [{ ate_perto: 20, andar: 13 }]
```

Arena vazia e não o bloco porque encostar no bloco vindo de baixo é a mesma foto
da fase 1. A parede do fundo dá um quadro visualmente distinto, e o sensor a vê:
`ponto_bloqueado` já trata a borda da arena como obstáculo
(`host/physics.c:100`).

### O tipo de passo novo

`{ ate_perto: <cm>, andar: <n> }` guarda as duas leituras da mesma trilha: a
condição e o equivalente em passos cegos. Fonte de verdade única, como as trilhas
existentes — um caminho só, desenhado na língua de quem está olhando:

**Pequeno** — 13 = 5 + 5 + 3, sem sensor:

```
repetir ●●●●●  { ⬆ andar }
repetir ●●●●●  { ⬆ andar }
repetir ●●●○○  { ⬆ andar }
```

**Médio** — `para sempre` + `se obstáculo` + `parar`:

```
🔁 repetir para sempre
    👁 se obstáculo a menos de 20 cm
        🛑 parar tudo
    ⬆ andar frente 0,5 s
```

**Grande** — `até perto`:

```
🔁👁 repetir até chegar a menos de 20 cm
    ⬆ andar frente 0,5 s
```

No Médio, o teste vem antes do `andar` dentro do laço — é o que torna as duas
formas equivalentes ao `repetir até`, que também testa antes.

O Pequeno usa passos cegos porque não tem sensor. O Médio compõe `para sempre` +
`se obstáculo` + `parar`, que são os três blocos que ele ganhou. O Grande usa
`até perto`, que é o bloco dele.

Isso exercita, de ponta a ponta e num teste que aperta PLAY de verdade, três dos
quatro blocos novos. O `se…senão` fica coberto só por teste de unidade do
compilador e da AST — assumido.

### A aritmética, e o aviso

Passo curto de 0,5 s ≈ 11,7 cm. Partindo de y = 0,25:

- O laço para quando `2,00 − (y + 0,08) < 0,20`, ou seja `y > 1,72`.
- Passo 12 → y = 1,654, distância 0,266 ≥ 0,20: continua.
- Passo 13 → y = 1,771, distância 0,149 < 0,20: sai. Fim em **≈ 1,771**.

A estrela fica em 1,70, e não colada em 2,00, para que **bater na parede falhe**.
`colide` limita o centro do robô a `y ≤ 1,92` (`host/physics.c:67`):

| desfecho | y final | distância à estrela (raio 0,16) |
|---|---|---|
| parou pelo sensor | ≈ 1,771 | 0,071 — **cumpre** |
| 12 passos cegos | 1,654 | 0,046 — cumpre |
| 13 passos cegos | 1,771 | 0,071 — cumpre |
| 14 passos cegos | 1,888 | 0,188 — falha |
| bateu na parede | ≈ 1,92 | 0,22 — **falha** |

**Aviso honesto:** isto é conta de papel, e foi conta de papel que errou dois
gabaritos no ciclo passado. Quem decide é o `gabaritos.test.js`. Se não fechar,
ajusto a estrela ou o número de passos — não a expectativa.

### Limitação assumida

A fase **recompensa** o sensor, não o **exige**: contar 13 passos também resolve.
Exigir de verdade pediria geometria sorteada a cada partida, e isso muda o
contrato das fases (o gabarito deixaria de ser uma trilha fixa). Outro ciclo, se
valer.

Verificar na implementação: `fis_arena` com `n = 0` obstáculos. A leitura de
`host/physics.c:26-28` indica que funciona, mas nenhuma fase exercita isso hoje.

## Testes

| onde | o quê | custo |
|---|---|---|
| `tests/gabarito.test.js` *(novo)* | corrente ≤ 5; nenhum `N` > 5 em 6 fases × 3 níveis; formas por nível; trecho de 1 passo sem `repetir` | ms |
| `tests/compilador.test.js` | bytecode dos quatro, alvos de salto, aninhamento, registradores não consumidos, `se…senão` com ramo vazio | ms |
| `tests/blocos.test.js` | AST dos quatro tipos novos | ms |
| `tests/niveis.test.js` | caixa com 4 / 8 / 10 blocos; texto cru sobrevive ao Pequeno | ms |
| `tests/vm_test.c` | **`OP_JMP`** — na VM desde a v1, nunca emitido nem testado | ms |
| `tests/missoes.test.js` | fase 6, arena vazia, tipo de passo `ate_perto` | ms |
| `tests/gabaritos.test.js` | passa de 15 para **18** execuções reais | ~4 min |
| `tests/es5.test.js` | o código novo tem que passar — iPad de 2011 | ms |

Mais `firmware/preparar_data.sh` para regravar os `.gz` servidos pela ESP32, e a
bateria inteira verde antes de commitar: Node, `vm_test`, `physics_test`,
`host_test.sh` e o firmware compilando.

## Arquivos tocados

| arquivo | mudança |
|---|---|
| `web/blocos.js` | 4 definições novas, 4 casos em `blocoParaNo`, `CAIXA_XML` |
| `web/compilador.js` | 4 casos novos em `gerar` |
| `web/niveis.js` | tipos novos nas listas por nível e em `caixaXml` (mapa de campos intacto) |
| `web/gabarito.js` | **novo** — `montar(passos, nivel)`, corrente de `repetir` |
| `web/app.js` | passa a chamar `Gabarito.montar`; sai o `blocoAndar` |
| `web/missoes.js` | fase 6, tipo de passo `ate_perto` |
| `web/index.html` | `<script src="gabarito.js">` depois de `missoes.js` |
| `web/ipad.html` | **nada** — não carrega `app.js` nem `missoes.js`, não tem gabarito |
| `core/`, `host/`, `firmware/src/` | **nada** — só regravar `firmware/data/*.gz` |
