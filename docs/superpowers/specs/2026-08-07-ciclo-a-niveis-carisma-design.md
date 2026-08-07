# Ciclo A — níveis e carisma — design

Data: 2026-08-07

Continuação de [`2026-08-06-blocos-robo-esp32-design.md`](2026-08-06-blocos-robo-esp32-design.md),
que está implementado e funcionando.

## Objetivo

A mesma tela precisa servir uma criança de 4 anos que não lê e uma de 10 que
quer complexidade. E o robô virtual precisa deixar de ser um círculo azul: ele é
onde a criança **ensaia** antes de mandar no robô de verdade, então vale a pena
que ela queira ficar ali.

## Decisão central

Um bloco nunca troca de tipo entre níveis. Ele ganha controles.

O `⬆` que a criança de 4 anos empilha é literalmente o mesmo bloco Blockly que a
de 9 usa como `andar frente [1] s` — só com o campo escondido e fixo. Subir de
nível revela o número com o valor que já estava em uso; descer esconde de novo e
guarda o valor.

Isso tem uma consequência que é o ponto todo: **a criança nunca perde trabalho ao
subir de nível.** O programa dela vira o ponto de partida do próximo nível, em
vez de um rascunho abandonado.

A alternativa — blocos simplificados próprios do nível Pequeno — foi descartada
porque produz telas com dois estilos misturados e não dá esse caminho de
crescimento.

## Os três níveis

| | Pequeno (4-6) | Médio (7-9) | Grande (10+) |
|---|---|---|---|
| `⬆` `⬇` | passo fixo de 0,5 s | `[1] s` | `[1] s` + velocidade |
| `↷` `↶` | 90°, fixo | menu direita/esquerda, 90° | `[90]` graus livres |
| `⏸` esperar | — | `[1] s` | `[1] s` |
| `🔁` repetir | `●●●` (2 a 5) | `[4] vezes` | `[4] vezes` |
| `👁` se obstáculo | — | `[20] cm` | `[20] cm` |

A velocidade do nível Grande é um menu de três opções, não um número solto:
`devagar` (120), `normal` (200) e `rápido` (255), em PWM. Número livre aqui não
ajudaria ninguém — abaixo de ~90 o motor não vence o próprio atrito e o robô só
faz barulho parado, o que pareceria defeito.

O nível fica no `localStorage` e é escolhido por um seletor no cabeçalho, sem
travas: quem estiver na frente da tela troca. Não há nível "certo" por idade, só
um ponto de partida — e uma criança que quer ver o que tem no próximo nível deve
poder olhar.

### Por que o Pequeno não tem número

No Pequeno a linguagem é a **sequência**, não a quantidade: `⬆ ⬆ ↷ ⬆` anda,
anda, vira, anda. Cada `⬆` é meio segundo de movimento; para ir mais longe,
empilha outro. A relação entre o bloco e o que acontece na tela fica direta, sem
passar por algarismo nenhum — que é o que uma criança de 4 anos normalmente
ainda não lê.

### A exceção: repetir

`repetir` é o único bloco do Pequeno que precisa de quantidade, porque
repetição não se expressa empilhando. Ficou dentro mesmo assim: é o primeiro
conceito de programação de verdade do conjunto, e tirá-lo esvaziaria o nível.

A quantidade aparece como bolinhas clicáveis, de 2 a 5. Isso custa a única peça
de Blockly sob medida do ciclo: um `FieldBolinhas` estendendo `FieldNumber`,
que desenha `●●●` em vez de `3`. O campo é o mesmo objeto em todos os níveis —
só muda como ele se pinta.

### O que o nível Grande não ganha

**Variáveis ficam de fora**, apesar de estarem na lista de adiados do spec da v1.
Os quatro registradores da VM só sabem `SET_REG` e `DEC_JNZ`; não há aritmética,
nem comparação entre registradores, nem leitura de sensor para dentro de um
deles. Variável de verdade exige opcodes novos, o que é um ciclo próprio.

Velocidade e ângulo livre, ao contrário, **não custam nada na VM**: `MOTOR a,b`
sempre aceitou qualquer valor e `TURN a` sempre aceitou qualquer ângulo. A v1
apenas não expunha isso na interface. Só o compilador muda.

## O robô como personagem

Sai o círculo azul de `arena.js`, entra um bichinho desenhado em `robo.js`.

| reação | gatilho | origem do dado |
|---|---|---|
| olhos olham pra frente | sempre | `theta`, já na telemetria |
| tonto, estrelinhas girando | bateu em parede ou obstáculo | **byte novo** |
| pulinho de comemoração | programa terminou sozinho | `E 0`, já existe |
| cochila, sobe um `z` | 20 s parado | relógio do navegador |

Três das quatro saem de dados que o navegador já recebe.

### A única mudança de protocolo

O pacote de telemetria vai de 9 para 10 bytes:

```
byte 0    : 0x83
bytes 1-2 : x em mm            (int16)
bytes 3-4 : y em mm            (int16)
bytes 5-6 : theta em decigraus (int16)
bytes 7-8 : distância em cm    (uint16)
byte 9    : colidiu (0 ou 1)   ← novo
```

No texto do `robo_host`, a linha `T` ganha um quinto campo.

A física já sabe da colisão — `colide()` devolve 1 e o robô não transla — ela só
não conta para ninguém. `physics.c` passa a expor `fis_colidiu()`, que devolve se
o último `fis_passo()` foi bloqueado.

Isso toca `host/main.c`, `host/physics.c`, `bridge/server.js` e `web/rede.js`.

**Não toca o firmware.** A ESP32 nunca envia telemetria: o painel da arena só
existe no modo virtual, e `app.js` já o esconde quando nenhum pacote `T` chega
em 2 segundos. O robô real continua sem saber o que é colisão, o que é honesto —
ele não tem sensor de toque. A reação de tontura é uma propriedade do ensaio,
não do robô.

## A resposta

**Destaque do bloco reforçado.** Medimos que o `workspace.highlightBlock()` do
Blockly 11 produz um halo por filtro SVG discreto demais para uma tela de
criança — e que não expõe classe CSS nenhuma, o que impede estilizá-lo por
seletor. `app.js` passa a marcar o bloco por conta própria, com contorno grosso e
pulsação. Este é o elo entre o bloco e o movimento; se ele não se vê, metade do
valor pedagógico se perde.

**Som sintetizado** em `som.js`, via Web Audio:

| evento | som |
|---|---|
| PLAY apertado | clique |
| comando executado | bip curto agudo |
| bateu | bop grave |
| programa terminou | três notas subindo |

Nenhum arquivo de áudio: são osciladores gerados por código. Isso custa **zero
byte** no LittleFS da placa, que hoje está com o flash em 66,6% e 220 KB de
interface. Botão de mudo no cabeçalho, estado no `localStorage`.

**Confete** ao terminar o programa.

## Estrutura de arquivos

```
web/niveis.js      novo       definição dos 3 níveis, caixa de blocos, troca de nível
web/som.js         novo       síntese Web Audio + mudo
web/robo.js        novo       o personagem: olhos, tontura, comemoração, sono
web/campos.js      novo       FieldBolinhas
web/arena.js       modificado passa a desenhar só o mundo
web/blocos.js      modificado ícones nas mensagens, campos cientes de nível
web/compilador.js  modificado velocidade e ângulo livre
web/app.js         modificado fiação do seletor, do mudo e das reações
web/index.html     modificado seletor de nível, botão de mudo
host/physics.[ch]  modificado fis_colidiu()
host/main.c        modificado quinto campo na linha T
bridge/server.js   modificado décimo byte no quadro 0x83
web/rede.js        modificado lê o byte de colisão
```

`arena.js` desenhando só o mundo e `robo.js` só o personagem é o que mantém os
dois testáveis e entendíveis separado — e é o que o Ciclo B vai precisar, quando
a arena virar dado em vez de constante.

## Testes

Seguindo o padrão do projeto: lógica pura no `node --test`, C no `make test`.

**`tests/compilador.test.js`** — os blocos novos:
1. velocidade no bloco de movimento vira o `MOTOR` com o valor certo
2. ângulo livre vira `TURN` com o ângulo, não com 90 fixo
3. o passo fixo do Pequeno gera exatamente o mesmo bytecode que `andar frente 0.5 s`
4. o programa dourado continua batendo byte a byte

O caso 3 é o que prova a decisão central: se o bloco do Pequeno e o do Médio
produzem bytecode idêntico, subir de nível de fato não muda o comportamento.

**`tests/niveis.test.js`** — novo:
5. cada nível oferece exatamente os blocos da tabela
6. subir de nível preserva o valor que o campo escondido tinha
7. descer de nível guarda o valor em vez de perdê-lo

**`tests/physics_test.c`** — colisão:
8. `fis_colidiu()` é 0 andando livre, 1 depois de bater na parede
9. e volta a 0 quando o robô sai de perto

**`tests/host_test.sh`** — a linha `T` traz cinco campos.

**`tests/navegador.test.js`** — novo, e a peça mais valiosa:

O driver CDP escrito durante a validação da v1 vira teste permanente. Ele sobe o
bridge, dirige um Chromium headless por WebSocket cru — sem dependência de npm,
igual ao resto do projeto — monta um programa, aperta PLAY e confere a sequência
de blocos acesos com carimbo de tempo.

Ele já pegou dois defeitos que a suíte inteira deixou passar: o watchdog matando
a VM em toda espera longa, e o destaque acendendo o bloco errado. É o único nível
em que dá para testar que **trocar de nível não desmonta o programa da criança**,
que é a promessa central deste ciclo.

10. montar no Pequeno, subir para Médio, o programa continua lá e roda igual
11. a sequência de blocos acesos bate com o programa
12. o console do navegador não acusa erro

## Fora do alcance dos testes

Se o bichinho é fofo, se o destaque chama atenção o bastante, e se arrastar
blocos é confortável. Isso é olho humano, e criança na frente da tela.

## Fora de escopo neste ciclo

Adiado, com os motivos:

- **Vários cenários, estrelas, rastro** (Ciclo B) — exige antes que a arena vire
  dado. Hoje a lista de obstáculos está duplicada, escrita à mão em `physics.c` e
  em `arena.js`, e as duas podem divergir em silêncio.
- **Missões** (Ciclo C) — depende do mundo ter objetivo e de saber se a criança
  cumpriu.
- **Persistência e autostart na placa** (Ciclo D) — espera o hardware existir.
- **Salvar e carregar projetos** — não pedido ainda.
- **Variáveis como blocos** — precisa de opcodes novos.
