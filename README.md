# Robô de Blocos

Uma criança monta blocos na tela, aperta PLAY, e o robô executa na hora. Hoje
num robô virtual no navegador; amanhã numa ESP32, sem mudar a lógica.

A tela serve dos 4 aos 10 anos: quem ainda não lê vê só setas, quem já lê vê
números, e quem quer mais vê ângulo livre e velocidade. O robô virtual é o
ensaio — a criança vê o que vai acontecer antes de mandar no robô de verdade.

---

## Como subir

Nada de `npm install`. O projeto não tem uma dependência sequer.

```bash
cd host && make && cd ..     # compila o robô virtual (uma vez, ou após mexer no C)
node bridge/server.js        # sobe o servidor
```

Abra **http://localhost:8080**.

Se reclamar de `EADDRINUSE`, já tem algo na porta:

```bash
lsof -ti:8080 -sTCP:LISTEN | xargs -r kill
```

Outra porta, se preferir: `PORTA=9000 node bridge/server.js`.

### Como usar

1. O bloco `▶ quando apertar PLAY` já nasce fixo — é a âncora, não dá para apagar.
2. Arraste blocos da caixa à esquerda para dentro dele.
3. Aperte **▶ PLAY**. **■ PARAR** corta na hora.

O seletor **nível** no cabeçalho troca entre Pequeno, Médio e Grande. Trocar de
nível nunca desmonta o programa: os campos somem e voltam com os valores
intactos. O botão 🔊 corta o som e lembra a escolha.

### Funciona em

Navegador moderno, e também em **tablet antigo**: a interface inteira é ES5 e o
Blockly é a versão 8, a última compilada sem `let`, `const` ou arrow function.
Testado num **iPad 2 com iOS 9** — o Safari dele não lê sintaxe moderna, e uma
versão mais nova do Blockly nem chega a carregar.

O mesmo vale para o CSS: nada de `gap` em flexbox (iOS 14.5+), `aspect-ratio`
(iOS 15+) ou `var()`. Se for mexer no visual, vale conferir em
`http://localhost:8080/ipad.html`, uma página de diagnóstico que roda no
aparelho e diz na tela o que aquele navegador tem — útil porque num tablet você
não tem console.

### Precisa de

- **Node.js 18+** — só módulos embutidos
- **gcc ou clang** — para o robô virtual
- **PlatformIO** — só se for gravar a ESP32
- **Chromium** — só para o teste de navegador, que se pula sozinho sem ele

---

## Como subir na ESP32

```bash
./firmware/preparar_data.sh          # copia web/ para firmware/data/ e comprime
cd firmware
pio run --target uploadfs            # grava a interface no LittleFS
pio run --target upload              # grava o firmware
```

A placa cria a própria rede Wi-Fi — **`Robo-01`**, senha `robo1234` — e serve a
interface em **http://192.168.4.1**. Sem roteador, sem internet.

A interface é servida pela própria placa de propósito: um site HTTPS não
consegue abrir `ws://` para a ESP32, então hospedar fora quebraria a conexão.

> **Ainda não rodou em hardware.** O firmware compila (`pio run` passa, RAM 14,5%,
> flash 66,6%) e reusa o mesmo `core/vm.c` já coberto por testes, mas nunca foi
> gravado numa placa de verdade. Espere acertar detalhes no primeiro contato —
> pinagem, sentido dos motores, leitura do HC-SR04.

### Primeira vez, passo a passo

Os quatro comandos acima são o resumo. Abaixo é a versão para quem nunca gravou
uma placa, na ordem em que vale fazer — e ela começa com a placa **sozinha, sem
nada ligado nela**. Não é excesso de cuidado: gravar a placa nua valida o
software inteiro sem que nenhum fio errado possa queimar nada, e quando os
motores entrarem você já saberá que o problema não está no código.

**1. O cabo.** A causa número um de "não funciona" é cabo USB só de carga, sem os
fios de dados. Se ao plugar não aparecer nada, troque o cabo antes de investigar
qualquer outra coisa.

**2. Achar a porta.** Plugue e rode:

```bash
ls /dev/ttyUSB* /dev/ttyACM*
```

Tem que aparecer `/dev/ttyUSB0` ou parecido. Não apareceu? `dmesg | tail -20`
logo depois de plugar conta o que houve:

- Nenhuma linha nova: é o cabo ou a porta USB.
- Aparece `ch341-uart converter now attached` e o dispositivo **some em seguida**:
  é o `brltty`, o leitor de braile que o Ubuntu instala por padrão e que sequestra
  adaptadores CH340. `sudo apt remove brltty`, desplugar e plugar de novo.
- `Permission denied` na hora de gravar: falta estar no grupo `dialout`
  (`sudo usermod -aG dialout $USER`). O grupo só vale em sessão nova — deslogue e
  relogue, ou use `newgrp dialout`.

Os drivers dos dois chips USB comuns em placas ESP32, CP2102 e CH340, já vêm no
kernel do Linux. Não há nada para instalar.

**3. São duas gravações, não uma.** A flash da placa tem duas áreas, e cada uma
tem seu comando:

| área | o que vai lá | comando |
|---|---|---|
| programa | o firmware C++ — a VM, o Wi-Fi, o servidor | `pio run --target upload` |
| arquivos (LittleFS) | a interface: `index.html`, os `.js`, o Blockly | `pio run --target uploadfs` |

Gravar só o firmware faz a placa subir, criar o Wi-Fi e servir **página em
branco** — os arquivos não estão lá. É a confusão mais comum de primeira vez.

E `firmware/data/` não vive no git: é gerado do `web/` pelo `preparar_data.sh`,
que também comprime tudo com gzip. Por isso ele vem antes de qualquer gravação.

**4. Gravar.** O PlatformIO acha a porta sozinho. O `uploadfs` leva uns 10
segundos, o `upload` uns 20.

Se travar em `Connecting........_____`, a placa não entrou em modo de gravação
sozinha: segure o botão **BOOT** (às vezes marcado `IO0`), dê um toque no **EN**
(ou `RST`) sem soltar o BOOT, e solte quando a barra começar a andar. Placas com
CP2102 costumam dispensar isso; as com CH340, nem sempre.

**5. Ouvir a placa.**

```bash
pio device monitor          # 115200, já configurado no platformio.ini
```

Aperte **EN/RST** para ver o boot desde o começo. Tem que aparecer:

```
rede Robo-01  ->  http://192.168.4.1
```

`LittleFS falhou` significa que faltou o `uploadfs`. Sai do monitor com `Ctrl+C`.

**6. Abrir a interface.** No tablet: Wi-Fi → rede **`Robo-01`**, senha
`robo1234` → abrir **`http://192.168.4.1`**. Escreva o `http://` na frente, senão
o Safari trata como busca. O iOS avisa que a rede não tem internet e às vezes
volta sozinho para o 4G — desligar os dados móveis enquanto brinca resolve.

Com a placa ainda nua, aperte PLAY: os blocos **acendem um a um** na tela, na
ordem da execução. Isso prova o caminho inteiro — o navegador compila, manda pelo
WebSocket, a VM roda na placa e devolve o ponteiro. Os motores não giram porque
ainda não existem. Chegou aqui, o software está validado.

**7. Só então a fiação.** A pinagem e os três cuidados que a antecedem estão em
[Hardware](#hardware).

O primeiro teste de verdade é um `andar frente 1 s` sozinho. Se um dos lados
girar ao contrário, inverta os dois fios daquele motor no driver — não mexa no
código para isso.

---

## Como funciona

A lógica de execução mora num único arquivo C, `core/vm.c`, que não conhece
hardware. Ele fala com o mundo por três funções:

```c
void     hal_motors(int16_t esq, int16_t dir);   /* -255..255 */
uint16_t hal_distancia_cm(void);
uint32_t hal_millis(void);
```

Duas implementações dessa camada são a única diferença entre o robô virtual e o
real:

| implementação   | motores           | sensor           | onde roda |
|-----------------|-------------------|------------------|-----------|
| `hal_sim.c`     | entrada da física | raycast na arena | PC (gcc)  |
| `hal_esp32.cpp` | PWM → TB6612FNG   | HC-SR04          | ESP32     |

**Não existem duas VMs.** Existe uma VM e duas camadas de hardware. É isso que
garante que o robô virtual e o real se comportem igual — e o teste dourado, que
compara byte a byte o bytecode do compilador JavaScript com o do teste em C,
é o contrato que prova.

### Sem placa

```
navegador ──WebSocket binário──► bridge Node ──stdio texto──► robo_host (C)
Blockly + arena canvas           sem dependências            vm.c + física + hal_sim
```

### Com a ESP32

```
navegador ──WebSocket binário──► ESP32 (modo AP, 192.168.4.1)
Blockly                          vm.c + hal_esp32
```

A página é a mesma, o protocolo é o mesmo, o `vm.c` é o mesmo arquivo. Só muda o
endereço — e o painel da arena some sozinho, porque o robô real se move no mundo
real e não manda telemetria.

### Bytecode

Instrução de 7 bytes, little-endian: `op(uint8) a(int16) b(int16) c(int16)`.
Máximo 256 instruções.

| op | nome        | semântica                                    |
|----|-------------|----------------------------------------------|
| 0  | `HALT`      | `hal_motors(0,0)`; para a execução           |
| 1  | `MOTOR`     | `hal_motors(a, b)`                           |
| 2  | `WAIT`      | espera `a` ms sem bloquear                   |
| 3  | `TURN`      | gira `a` graus (positivo = direita)          |
| 4  | `SET_REG`   | `r[a] = b`                                   |
| 5  | `DEC_JNZ`   | `if (--r[a] != 0) pc = b;` senão `pc++`      |
| 6  | `JMP`       | `pc = a`                                     |
| 7  | `JMP_IF_GE` | `if (sensor[a] >= b) pc = c;` senão `pc++`   |

Quatro registradores, o que permite laços aninhados até quatro níveis. A VM
nunca bloqueia: `vm_tick()` executa no máximo uma instrução e volta.

### Calibração

Em `core/vm.h`: `VEL_FRENTE 200`, `VEL_GIRO 180`, `MS_POR_GRAU 5`,
`WATCHDOG_MS 500`. A física do simulador (`V_MAX 0.30`, `ENTRE_EIXOS 0.12`) é
**derivada** desses valores — juntos eles determinam a velocidade angular do
giro, e é ela que precisa bater com `MS_POR_GRAU`. Mexer num exige recalcular
os outros.

---

## Os blocos e os níveis

Um bloco nunca troca de tipo entre níveis. Ele ganha controles. O `⬆` que a
criança de 4 anos empilha é literalmente o mesmo bloco Blockly que a de 9 vê
como `andar frente [1] s`.

| | Pequeno (4-6) | Médio (7-9) | Grande (10+) |
|---|---|---|---|
| `⬆` `⬇` | passo fixo de 0,5 s | `[1] s` | `[1] s` + velocidade |
| `↷` `↶` | 90°, fixo | menu direita/esquerda | `[90]` graus livres |
| `⏸` esperar | — | `[1] s` | `[1] s` |
| `🔁` repetir | `●●●○○` | `[4] vezes` | `[4] vezes` |
| `👁` se obstáculo | — | `[20] cm` | `[20] cm` |
| `🛑` parar tudo | — | sim | sim |
| `🔁` repetir para sempre | — | sim | sim |
| `👁` se…senão | — | — | `[20] cm` |
| `🔁👁` repetir até perto | — | — | `[20] cm` |

O Pequeno fica nos quatro primeiros de propósito: ele vale por ser pequeno, e
cada peça nova é uma escolha a mais na frente de quem tem quatro anos. O Médio
ganha os dois blocos sem condição embutida; o Grande, os dois com condição.

Uma regra atravessa o desenho todo: **quando o controle simples não representa o
valor, aparece o honesto.** Um `repetir 12` mostra o número em vez de bolinhas;
um giro de 45° mostra o ângulo em vez de mentir "direita".

Dentro de um nível nada se perde: o valor escondido continua guardado, e é isso
que deixa o gabarito se escrever na língua de cada nível. **Trocar** de nível é
outra coisa — ele pergunta antes e apaga o que estava montado, porque os blocos
de controle não têm desenho simplificado possível: um `se…senão` no Pequeno não
é o `se obstáculo` com menos campos, é outra coisa.

Isso vale para um valor herdado de um nível acima. O gabarito nunca produz um:
no Pequeno ele quebra a trilha em corrente de `repetir` de até cinco, porque
naquele nível o clique nas bolinhas volta a 1 depois de cinco — mostrar uma peça
que a criança não consegue construir esvazia o sentido do botão.

No Grande aparece mais um botão: **`{ } ver código`**. Ele mostra o programa
montado escrito em C++, pronto para gravar num Arduino — o degrau seguinte ao
teto dos blocos. O arquivo roda o programa uma vez ao ligar, depois de três
segundos de espera, porque na placa não existe botão PLAY: quem virou PLAY foi
o RESET.

### Como cada bloco vira bytecode

| bloco                        | bytecode                                           |
|------------------------------|----------------------------------------------------|
| `andar frente [n] s`         | `MOTOR v,v` ; `WAIT n*1000` ; `MOTOR 0,0`          |
| `andar trás [n] s`           | `MOTOR -v,-v` ; `WAIT n*1000` ; `MOTOR 0,0`        |
| `girar [g] graus`            | `TURN g`                                           |
| `esperar [n] s`              | `WAIT n*1000`                                      |
| `repetir [n] vezes { corpo }`| `SET_REG rk,n` ; corpo ; `DEC_JNZ rk,início`       |
| `se obstáculo < [n] cm { c }`| `JMP_IF_GE 0,n,depois` ; corpo ; `depois:`         |
| `parar tudo`                 | `HALT`                                             |
| `repetir para sempre { c }`  | `início:` corpo ; `JMP início`                     |
| `se…senão < [n] cm`          | `JMP_IF_GE 0,n,senão` ; então ; `JMP fim` ; `senão:` senão ; `fim:` |
| `repetir até < [n] cm { c }` | `início:` `JMP_IF_GE 0,n,corpo` ; `JMP fim` ; `corpo:` c ; `JMP início` ; `fim:` |

`JMP_IF_GE` salta quando a leitura é **maior ou igual** ao limite, ou seja quando
*não* há obstáculo dentro da distância — por isso o alvo é o `senão` no
condicional e o corpo no laço. Os quatro últimos não precisaram de opcode novo:
`JMP` já existia desde a v1, sem nunca ter sido emitido.

### Como cada bloco vira C++

| bloco                        | C++                                        |
|------------------------------|--------------------------------------------|
| `andar frente [n] s [v]`     | `andarFrente(n, v);`                       |
| `andar trás [n] s [v]`       | `andarTras(n, v);`                         |
| `girar [g] graus`            | `girar(g);`                                |
| `esperar [n] s`              | `esperar(n);`                              |
| `repetir [n] vezes { c }`    | `for (int i = 0; i < n; i++) { c }`        |
| `se obstáculo < [n] cm { c }`| `if (distanciaCm() < n) { c }`             |
| `parar tudo`                 | `parar(); return;`                         |
| `repetir para sempre { c }`  | `while (true) { c }`                       |
| `se…senão < [n] cm`          | `if (…) { … } else { … }`                  |
| `repetir até < [n] cm { c }` | `while (distanciaCm() >= n) { c }`         |

O arquivo carrega só as funções que o programa usa: um programa que não sente
nada não leva o HC-SR04 junto. E o `.ino` não herda os limites da VM — 256
instruções e quatro `repetir` aninhados são restrições dos 7 bytes e dos quatro
registradores, não do C++.

---

## Testes

```bash
cd tests && make test && cd ..      # VM e física (C)
./tests/host_test.sh                # robô virtual de ponta a ponta
node --test tests/                  # compilador, bridge, níveis, som, navegador
cd firmware && pio run && cd ..     # o firmware compila
```

O mais lento deles é `tests/gabaritos.test.js`, uns três minutos: ele monta cada
gabarito, aperta PLAY e vê se a missão é cumprida — as cinco fases nos três
níveis. Vale o tempo. Um gabarito que não resolve é pior que gabarito nenhum,
porque a criança que travou segue a resposta, não funciona, e conclui que o erro
é dela. E isso não dá para conferir no papel: as duas primeiras versões que
escrevi pareciam certas e raspavam na parede.

O `tests/arduino.test.js` faz uma coisa que os outros não fazem: ele **compila**
o C++ que gerou. Um `g++ -fsyntax-only` contra um `fake_arduino.h` de stubs pega
chave não fechada e função com aridade errada em milissegundos — defeitos que de
outro modo só apareceriam com a criança na frente do Arduino IDE. Pula sozinho
se não houver `g++`.

O `node --test tests/` inclui um teste que **dirige um Chromium de verdade** por
CDP, com cliente WebSocket escrito à mão — sem npm, como o resto do projeto. Ele
monta um programa, troca de nível, aperta PLAY e confere quais blocos acendem.
É o único nível em que dá para provar que trocar de nível não desmonta o
programa da criança. Sem Chromium na máquina, ele se pula sozinho.

Três coisas que nenhuma máquina testa: se o bichinho é fofo, se o destaque do
bloco chama atenção, e se arrastar bloco é confortável. Isso é olho humano — e
criança na frente da tela.

---

## Estrutura

```
core/       vm.c vm.h hal.h bytecode.h    compartilhado entre PC e ESP32
host/       main.c physics.c hal_sim.c    o robô virtual
bridge/     server.js                     WebSocket + arquivos estáticos, zero deps
web/        compilador.js niveis.js       compilador, níveis, campo de bolinhas
            campos.js blocos.js           blocos Blockly em português
            robo.js arena.js som.js       personagem, mundo, síntese de áudio
            rede.js app.js index.html     protocolo e fiação
firmware/   src/main.cpp hal_esp32.cpp    a placa
tests/                                    tudo acima
docs/superpowers/                         specs e planos de implementação
```

`web/vendor/` traz o Blockly vendorizado (Google, Apache 2.0 — ver
`web/vendor/README.md`). Nunca por CDN: a ESP32 serve esses arquivos sem
acesso à internet, e a versão 8 é a última que abre em tablet antigo.

`web/img/foguete.png` é a marca da Educação Criativa, e a paleta da interface
sai dela: azul royal `#0050f0`, ciano `#20b0f0`, navy `#002080` e amarelo
`#f0c000`.

---

## Hardware

ESP32 DevKit, driver TB6612FNG, dois motores DC com redução, roda boba,
2× 18650, HC-SR04.

| pino ESP32 | ligação        |
|------------|----------------|
| 25, 26, 27 | PWMA, AIN1, AIN2 |
| 33, 14, 12 | PWMB, BIN1, BIN2 |
| 13         | STBY           |
| 5, 18      | TRIG, ECHO     |

A fonte de verdade dessa tabela é `firmware/src/hal_esp32.cpp`.

Três cuidados antes de encostar um fio:

- **O ECHO do HC-SR04 devolve 5 V**, e a entrada da ESP32 aguenta 3,3 V. Precisa
  de divisor de tensão: 1 kΩ do ECHO para o GPIO18, 2 kΩ do GPIO18 para o GND.
  Sem ele a entrada vai degradando.
- **Os motores não podem sair do USB.** O `VM` do TB6612 vai nas 18650, o `VCC`
  (lógica) no 3V3 da placa, e todos os GND juntos. Motor puxando corrente pelo
  USB derruba a ESP32 no meio da execução.
- **Se a placa parar de bootar depois de ligar o driver**, o suspeito é o `BIN2`
  no GPIO12: esse pino é lido no reset para escolher a voltagem da flash, e em
  nível alto naquele instante a placa não sobe. A saída é mover o `BIN2` para
  outro GPIO livre — o 15 serve — e trocar a constante no `hal_esp32.cpp`.

---

## Missões

Uma estrela aparece na arena e a missão é levar o robô até ela. São cinco, em
ordem crescente de dificuldade, e a última leva de volta à primeira.

**A estrela não existe na física.** O navegador já recebe a posição do robô pela
telemetria e já sabe onde desenhou a estrela, então a chegada se decide em
`web/missoes.js` — sem tocar em `core/vm.c`, sem byte novo no protocolo, sem
mexer na ESP32.

A consequência é assumida: missão é coisa do robô virtual. O robô real não manda
telemetria, e ninguém sabe onde ele está na sala. Ensaiar é o que o virtual faz
de melhor.

O raio de acerto é generoso (16 cm) de propósito: o robô real erra alguns graus
por giro e o virtual imita esse erro, então exigir precisão de centímetro
transformaria a missão em sorte.

Depois de três tentativas sem chegar, aparece **"me mostra como faz"**: o
gabarito se monta sozinho no espaço de trabalho, e a criança aperta PLAY e
assiste. Vem montado em bloco, e não descrito em palavras, porque quem ainda
não lê precisa ver a peça.

O gabarito é uma trilha só, desenhada conforme o nível: no Pequeno vira pilha de
passos curtos dentro de um `repetir`, que é o vocabulário dele; no Médio e no
Grande vira um bloco com os segundos somados, que é como alguém que lê número
escreveria.

**Cada missão traz a própria arena** — onde o robô nasce e o que há no caminho —
e a última é um labirinto. A arena deixou de ser constante compilada: o
navegador manda a fase pelo protocolo (quadro `0x04`, linha `A` no texto) e a
física troca de cenário sem recompilar.

O teste que mais importa aqui não é o de geometria, é o de **alcance**: ele varre
a arena numa grade de 2 cm e espalha a partir do robô, andando só por onde o
corpo dele cabe. Estrela em espaço livre e robô em espaço livre não garantem
nada — as paredes podem selar o caminho entre os dois, e nenhuma outra
verificação pega isso.

## O que vem depois

- **Rastro do caminho percorrido**, para a criança ver por onde o robô passou.
- **Mais fases**, agora que a arena é dado: acrescentar uma é uma entrada em
  `web/missoes.js`, e o teste de alcance diz na hora se ela tem solução.
- **A ponte para o real** — trocar de alvo na interface, persistência em NVS e
  autostart ao ligar a placa. Espera o hardware existir.
- **Salvar e carregar projetos da criança.**
- **Variáveis como blocos** — precisa de opcodes novos: os quatro registradores
  hoje só sabem `SET_REG` e `DEC_JNZ`, sem aritmética.
