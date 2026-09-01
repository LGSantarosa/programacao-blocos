# Programação Criativa

Uma criança monta blocos na tela, aperta PLAY, e o robô executa na hora. Hoje
num robô virtual no navegador; amanhã numa ESP32, sem mudar a lógica.

A tela serve dos 4 aos 12 anos: quem ainda não lê vê só setas, quem já lê vê
números, quem quer mais vê ângulo livre e velocidade, e quem chegou ao teto
começa a fazer contas. O robô virtual é o ensaio — a criança vê o que vai
acontecer antes de mandar no robô de verdade.

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
4. **Toque numa peça e ela roda na hora** — sem passar pelo PLAY. Uma pilha
   solta no canto é um rascunho que funciona; tocar no programa dentro do
   `▶ quando apertar PLAY` é o mesmo que apertar PLAY.
5. **Toque num relator** — uma conta, o `👁 distância cm` — e o valor aparece
   numa bolha. O número não é calculado pelo navegador: ele desce até a VM e
   volta de lá, então é o mesmo número que o robô usaria. Na ESP32 isso lê o
   HC-SR04 de verdade, o que faz do dedo a melhor ferramenta de bancada que o
   projeto tem.

Tocar no campo de um número não roda nada: abre o **teclado numérico da
página** — doze teclas grandes, o número em cima, "Deixa" e "Pronto" embaixo. O
primeiro algarismo troca o número inteiro, como numa calculadora: quem toca no 5
querendo cinco não espera quinze. Quem separa tocar-no-número de tocar-na-peça é
o próprio Blockly, e não um raio de arrasto nosso.

> **Por que um teclado nosso, e não o do sistema.** Em aparelho de toque, o
> editor de número do Blockly é um `window.prompt`. Dentro do WebView do app,
> que não tinha `WebChromeClient`, o prompt não abre nada e devolve `null` na
> mesma hora — sem erro, sem aviso. Tocar no `andar frente 1 s` simplesmente não
> fazia coisa alguma, e a única forma de chegar a seis segundos era encaixar uma
> conta `2 × 3` no lugar do número. O teclado da página conserta isso e é melhor
> pelo mesmo preço: doze teclas grandes num telefone deitado valem mais que um
> teclado inteiro cobrindo a tela, e não pedem que a criança já saiba onde moram
> os algarismos. O `WebChromeClient` entrou junto, para o próximo diálogo que
> aparecer falhar à vista e não em segredo.

> **Um clique interrompe o que estiver rodando.** A VM tem um `pc` e um
> programa só, então tocar em qualquer peça — inclusive no `👁 distância cm`
> para espiar a leitura no meio de uma execução — para o que estava rodando e
> começa o que foi tocado. Não é defeito: é o teto desta versão da VM, e é
> exatamente o que o próximo ciclo, tarefas e eventos, existe para levantar.

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

> **Onde o hardware foi provado, e onde não foi.** A placa já foi gravada e
> sobe: o firmware compila (`pio run` passa, RAM 18,6%, flash 66,7%), o
> LittleFS monta, o AP `Robo-01` aparece e a interface é servida. Os motores já
> responderam a um PLAY.
>
> O sensor de distância foi montado em 31/08/2026 e **lido em 01/09/2026**:
> tocando no `👁 distância cm` com o robô ligado, a bolha traz a leitura do
> HC-SR04 e o número muda quando a mão chega perto. O caminho inteiro — pino,
> opcode `SENSOR`, protocolo, bolha — está provado no hardware.
>
> O `distância:` do painel se atualizando sozinho — o quadro `0x85` — foi
> provado no mesmo dia, com a placa gravada e o app instalado no Galaxy S24 FE:
> no ensaio o painel marcava 92 cm, e depois do **🤖 procurar o robô** passou a
> marcar 10 e depois 29 cm, sem ninguém tocar em bloco nenhum. O número é o do
> HC-SR04, e não o do raycast da arena. Confira também o sentido dos motores no
> primeiro `andar frente`. O roteiro de conferência do sensor, que não precisa
> de motor nem de chassi, está em
> [O sensor de distância](#o-sensor-de-distância).

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

**7. Só então a fiação.** A pinagem, qual sensor comprar e os cuidados que
antecedem o primeiro fio estão em [Hardware](#hardware).

O primeiro teste de verdade é um `andar frente 1 s` sozinho. Se um dos lados
girar ao contrário, inverta os dois fios daquele motor no driver — não mexa no
código para isso.

---

## No celular e no tablet Android

A mesma tela, num app. Ele carrega o `web/` de dentro dele e traz o robô
virtual junto — a mesma `core/vm.c`, compilada para o aparelho pelo NDK. Sem
Wi-Fi, sem internet, sem nada ligado, o ensaio funciona.

```bash
./android/preparar_assets.sh                 # copia web/ para os assets
cd android && ./gradlew installDebug
```

### O nome e o ícone

O app se chama **Programação Criativa** — o rótulo mora em
`android/app/src/main/res/values/strings.xml`, e é o mesmo nome do `<title>` e
do cabeçalho da página. O identificador do pacote continua
`br.educacaocriativa.roboblocos` de propósito: trocá-lo instalaria um segundo
app ao lado do primeiro em vez de renomear este.

O ícone do lançador sai de `web/img/foguete.png`, que é a marca da Educação
Criativa e a mesma arte do cabeçalho — foguete azul sobre branco, porque a marca
é azul e sem o branco por trás ela some em fundo escuro. Os PNGs em
`res/mipmap-*/` são gerados dessa fonte, e não desenhados à mão:

- `ic_launcher_foreground.png` — tela de 108dp por densidade (108, 162, 216,
  324 e 432px), foguete centrado ocupando **55%** da altura. É a margem que o
  mantém dentro do círculo de 72dp que o Android garante ao recortar.
- `ic_launcher.png` e `ic_launcher_round.png` — 48dp por densidade, para o
  lançador que ignora o ícone adaptativo: quadrado de cantos redondos e círculo,
  brancos, com o foguete em 62% e 58%.

O `mipmap-anydpi-v26/ic_launcher.xml` junta as duas camadas, e o branco de trás
é o `fundo_icone` de `values/colors.xml`.

Precisa do SDK do Android (platform 34, build-tools 34) e do NDK 26.1, com o
caminho em `android/local.properties` (`sdk.dir=...`). O wrapper do Gradle já
está no repositório.

### Ensaio e robô, um de cada vez

O botão **🤖 procurar o robô** abre o diálogo do próprio Android, que lista as
redes `Robo-*` por perto. Escolhida uma, o app passa a mandar na placa e o
botão vira **🔌 voltar para o ensaio**. O programa montado na tela **não se
perde na troca**: a página não recarrega, só troca de alvo.

Um exclui o outro de propósito. Entrar na rede do robô prende o processo
àquela rede — é o que faz o `192.168.4.1` responder em vez de o pedido sair
pelo 4G — e enquanto isso o simulador de dentro do app pode ficar
inalcançável. Voltar para o ensaio solta a rede.

O app não pede permissão de localização, porque não varre Wi-Fi: quem varre e
quem desenha a lista é o sistema.

> **O que foi provado, e o que não foi.** O app rodou num aparelho: um Galaxy
> S24 FE (SM-S721B) com Android 16, em 31/08/2026. O APK foi montado do commit
> do dia com SDK 34 e NDK 26.1, e instalado por `adb install`.
>
> **O `bindProcessToNetwork` alcança o WebView.** Era a prova que faltava, e
> ela passou no caso que quebra: com os **dados móveis ligados**, o
> **🤖 procurar o robô** abriu o diálogo do Android, o `Robo-01` estava lá, e
> depois de escolhido o **PLAY moveu o robô de verdade**. O 4G continuou como
> rota padrão do aparelho e o `ws://192.168.4.1` chegou na placa mesmo assim.
> A conversa com o robô pode continuar dentro do WebView; o plano de recuo de
> subir tudo para o Kotlin não foi preciso.
>
> O **🔌 voltar para o ensaio** também funcionou: volta ao robô da arena com o
> programa ainda montado na tela.
>
> Ficaram **sem prova nesta sessão**: a leitura do `👁 distância cm` no robô de
> verdade — provada no dia seguinte, 01/09/2026, como conta a seção da ESP32 — e
> o ensaio rodando sozinho com o aparelho sem rede alguma, que não chegou a ser
> observado isolado.
>
> O Android 16 avisou, na primeira abertura, que **o app não era compatível com
> páginas de 16 KB**: os segmentos LOAD do `librobo.so` saíam alinhados a 4 KB,
> que é o padrão do NDK 26. Neste aparelho a biblioteca carregou assim mesmo,
> mas num aparelho com página de 16 KB ela não carregaria — e esses estão
> chegando.
>
> **Corrigido** com `-Wl,-z,max-page-size=16384` no `CMakeLists.txt`. Os três
> `librobo.so` do APK passaram de `0x1000` para `0x4000` nos LOAD, e dentro do
> zip eles caem em deslocamentos múltiplos de 16 KB — as duas metades do
> requisito. Reinstalado no mesmo aparelho, o aviso não aparece mais.
>
> Para chegar até aqui foi preciso desligar o **Bloqueador automático** da
> Samsung: com ele ligado, a Depuração USB fica em cinza e a instalação por
> fora da Play Store é barrada.
>
> Duas coisas quebravam e foram consertadas depois dessa prova.
>
> **Entrar no robô com o celular já num Wi-Fi travava o app.** A página nunca
> fechava o soquete anterior ao trocar de alvo, e o servidor local atendia um
> cliente por vez dentro do próprio laço de `accept` — então o soquete
> abandonado do ensaio o prendia para sempre, e toda conexão seguinte morria na
> fila. Com dados móveis o problema se escondia: prender o processo à rede do
> robô matava o loopback, o soquete abandonado caía sozinho e o servidor se
> soltava. No Wi-Fi ele não caía. Agora a página fecha o que larga, e o
> servidor aceita sempre — um cliente por vez ainda, mas quem chega manda.
>
> **O layout do celular deitado.** Todas as quebras do CSS olhavam largura, e o
> que falta num telefone deitado é altura: em 808x411 o cabeçalho comia 40% da
> tela e o `#editor`, com `min-height` de 260, empurrava a página para fora de
> si mesma. Existe agora uma regra de altura, e nela o "próxima" e o
> "me mostra como faz" dividem uma linha em vez de empilhar — juntos, eram eles
> que jogavam a arena para fora da tela. O lugar do app segue sendo o tablet,
> mas no telefone ele cabe inteiro: medido no aparelho, o cabeçalho caiu de
> 164px para 86, e a página deixou de transbordar — inclusive no pior caso, com
> os dois botões abertos, em que o painel ainda cabe sem rolar.
>
> O roteiro dessa prova — instalar, o que testar, em que ordem, e o que fazer
> com cada resultado — está em [`docs/prova-no-aparelho.md`](docs/prova-no-aparelho.md).

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
Blockly + arena canvas           vm.c + hal_esp32
```

A página é a mesma, o protocolo é o mesmo, o `vm.c` é o mesmo arquivo. Só muda o
endereço. No robô real a arena continua visível como referência da missão, e o
desenho do robô fica parado na posição inicial: a placa não tem física, e por
isso não manda a telemetria de pose (`0x83`) que o robô virtual manda.

O que ela manda é a **distância** — quadro `0x85`, três bytes, dez vezes por
segundo — e é ela que aparece no `distância:` do painel. Sem pose inventada:
mandar um `0x83` com posição de mentira faria o desenho saltar para a origem e a
missão se dar por cumprida sozinha. A placa conta só o que ela sabe de verdade,
e quem lê o painel não precisa saber com qual dos dois robôs está falando.

### Bytecode

Instrução de 7 bytes, little-endian: `op(uint8) a(int16) b(int16) c(int16)`.
Máximo 1024 instruções.

Os operandos que a instrução consome vêm da **pilha**, não do corpo dela — é o
que deixa qualquer número ser uma conta. Ver "Como uma conta vira bytecode".

| op | nome         | semântica                                        |
|----|--------------|--------------------------------------------------|
| 0  | `HALT`       | `hal_motors(0,0)`; para a execução               |
| 1  | `MOTOR`      | desempilha dir, esq; `hal_motors(esq, dir)`      |
| 2  | `WAIT`       | desempilha ms; espera sem bloquear               |
| 3  | `TURN`       | desempilha graus (positivo = direita)            |
| 4  | `SET_REG`    | desempilha n; `r[a] = max(1, n)`                 |
| 5  | `DEC_JNZ`    | `if (--r[a] != 0) pc = b;` senão `pc++`          |
| 6  | `JMP`        | `pc = a`                                         |
| 8  | `PUSH`       | empilha o literal `a`                            |
| 9  | `SENSOR`     | empilha a leitura do sensor `a`                  |
| 10 | `BIN`        | desempilha dois, empilha um; `a` escolhe a conta |
| 11 | `UN`         | desempilha um, empilha um; `a` escolhe a conta   |
| 12 | `JMP_FALSE`  | desempilha; se falso, `pc = a`                   |
| 13 | `REPORT`     | desempilha e entrega a `hal_report`              |

O **7 está vago de propósito**: era o `JMP_IF_GE`, o sensor embutido num salto,
e reusar o número faria bytecode antigo rodar errado.

Quatro registradores, o que permite laços aninhados até quatro níveis. A pilha
tem 16 lugares, e o compilador recusa uma conta que não caiba nela antes de
emitir byte nenhum. A VM nunca bloqueia: `vm_tick()` executa no máximo uma
instrução e volta.

### Calibração

Em `core/vm.h`: `VEL_FRENTE 200`, `VEL_GIRO 180`, `MS_POR_GRAU 5`,
`WATCHDOG_MS 500`. A física do simulador (`V_MAX 0.30`, `ENTRE_EIXOS 0.12`) é
**derivada** desses valores — juntos eles determinam a velocidade angular do
giro, e é ela que precisa bater com `MS_POR_GRAU`. Mexer num exige recalcular
os outros.

#### As três velocidades, medidas no robô

O menu `devagar / normal / rápido` de `web/blocos.js` não é escolhido na régua:
foi medido em 01/09/2026, no chassi, com fonte de bancada em **7,5 V** — a
tensão nominal de duas 18650.

| | PWM | avanço em 2 s |
|---|---|---|
| devagar | **180** | 17 e 19 cm |
| normal  | **200** | 30 cm (36 já com o trim) |
| rápido  | **225** | acima de 40 cm |

O `devagar` era **120, e não saía do lugar**. Nem 120 nem 150: a fonte mostrava
corrente e as rodas ficavam paradas — motor travado puxando sem girar. Em 170 o
robô andava uma vez e na seguinte não, que é o comportamento de quem está
exatamente no limiar do atrito estático. O primeiro PWM que anda toda vez é 180.

O `rápido` desceu de 255 para 225: 255 é rápido demais para uma criança
acompanhar, e a diferença de velocidade entre os dois é pequena.

#### A compensação de partida

Os dois motores não arrancam no mesmo PWM. O robô guinava, e o conserto é
`TRIM_DIR` em `firmware/src/hal_esp32.cpp`: **6 pontos a mais no motor
direito**. Com ele, o mesmo disparo que andava 30 cm tortos passou a andar 36 cm
reto.

Ele mora na camada de hardware de propósito. A guinada é defeito deste chassi —
motor, redução, atrito da roda boba — e não da lógica do programa: no `core/vm.c`
ela vazaria para o robô virtual, e o simulador passaria a guinar também. O
`web/arduino.js` copia o número para o `.ino` exportado, e
`tests/arduino.test.js` falha se os dois divergirem.

**Trocando de chassi, remeça.** Os números acima valem para este robô e para
esta tensão; um motor diferente, uma roda diferente ou uma bateria descarregando
mudam todos eles.

#### A régua de bancada

`firmware/calibrar/` é o firmware que produziu esta tabela — um robô que não sobe
Wi-Fi nenhum e só obedece a comandos pela serial:

```bash
pio run -d firmware/calibrar -t upload    # grava a régua
pio run -d firmware -t upload             # devolve o robô de verdade
```

Ele reusa o `firmware/src/hal_esp32.cpp` de verdade, e não uma cópia: a
frequência do PWM e o jeito de escrever nos pinos são parte do que se está
medindo. `p<n>` dispara os dois motores por 1 s e diz, **em centímetros pelo
próprio HC-SR04**, quanto o robô andou — quem mede não é o olho de quem está
olhando. `t<n>` e `u<n>` fazem o mesmo com um motor de cada vez, `c<n>` mede o
mínimo que sustenta o movimento depois de um empurrão, e `w<n>` traz o robô de
ré até a marca, para a varredura seguinte começar do mesmo lugar.

> **Ainda por medir: o giro.** `VEL_GIRO` é 180, o mesmo valor que mal tira o
> robô da inércia andando reto — e girar no lugar é mais pesado que andar,
> porque as rodas arrastam de lado. É provável que o bloco `girar` tenha o mesmo
> defeito que o `devagar` tinha, e ninguém tenha notado. Não foi testado nesta
> sessão.

---

## Os blocos e os níveis

Um bloco nunca troca de tipo entre níveis. Ele ganha controles. O `⬆` que a
criança de 4 anos empilha é literalmente o mesmo bloco Blockly que a de 9 vê
como `andar frente [1] s`.

| | Pequeno (4-6) | Médio (7-9) | Grande (10+) | Gigante (12+) |
|---|---|---|---|---|
| `⬆` `⬇` | passo fixo de 0,5 s | `[1] s` | `[1] s` + velocidade | idem |
| `↷` `↶` | 90°, fixo | menu direita/esquerda | `[90]` graus livres | idem |
| `⏸` esperar | — | `[1] s` | `[1] s` | idem |
| `🔁` repetir | `●●●○○` | `[4] vezes` | `[4] vezes` | idem |
| `👁` se obstáculo | — | `[20] cm` | `[20] cm` | idem |
| `🛑` parar tudo | — | sim | sim | idem |
| `🔁` repetir para sempre | — | sim | sim | idem |
| `👁` se…senão | — | — | `[20] cm` | idem |
| `🔁👁` repetir até perto | — | — | `[20] cm` | idem |
| `➕` contas | — | — | — | `+ − × ÷` |
| `🎲` aleatório | — | — | — | `de [1] a [5]` |
| `< > =` comparações | — | — | — | sim |
| `e` `ou` `não` | — | — | — | sim |
| `👁` distância cm | — | — | — | como **valor** |
| `se ( ) então` | — | — | — | sim |
| `se ( ) senão` | — | — | — | sim |
| `🔁` repetir até ( ) | — | — | — | sim |

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

O Gigante é o Grande mais as contas, e existe porque o Grande virou teto. Até
ali todo número é uma constante que a criança digita; no Gigante um número pode
ser **uma conta** — `andar frente (🎲 aleatório de 1 a 3) s`. Todo campo numérico
virou encaixe: o desenho é o mesmo nos três níveis de baixo, e no Gigante ele
recebe uma peça.

O bloco que carrega a lição é o **`👁 distância cm`**. Com ele, o `👁 se obstáculo
a menos de [20] cm`, que ela usa desde os sete anos, vira um caso particular de
`se ((distância cm) < (20))`. Os dois convivem lado a lado no Gigante de
propósito: o ciano **sente**, o amarelo **decide**. E a diferença vale até no
bytecode — os dois compilam exatamente a mesma coisa.

O Blockly recusa o encaixe que não faz sentido antes do PLAY: `andar frente
(3 < 4) s` não entra, porque «três é menor que quatro» não é uma quantidade de
segundos; e `se (5)` não entra, porque um número não responde sim nem não. É
essa exigência que ensina a diferença entre «quanto» e «se».

No Grande e no Gigante aparece mais um botão: **`{ } ver código`**. Ele mostra o programa
montado escrito em C++, pronto para gravar num Arduino — o degrau seguinte ao
teto dos blocos. O arquivo roda o programa uma vez ao ligar, depois de três
segundos de espera, porque na placa não existe botão PLAY: quem virou PLAY foi
o RESET.

### Como cada bloco vira bytecode

Todo valor passa pela pilha: um número vira `PUSH`, uma conta vira a subárvore
inteira. Caminho único de propósito — a alternativa era literal quando dá e
pilha quando precisa, e duas regras por bloco é o dobro de jeitos de errar.

| bloco                        | bytecode                                           |
|------------------------------|----------------------------------------------------|
| `andar frente [n] s`         | `PUSH v` ; `PUSH v` ; `MOTOR` ; `PUSH n*1000` ; `WAIT` ; `PUSH 0` ; `PUSH 0` ; `MOTOR` |
| `girar [g] graus`            | `PUSH g` ; `TURN`                                  |
| `esperar [n] s`              | `PUSH n*1000` ; `WAIT`                             |
| `repetir [n] vezes { corpo }`| `PUSH n` ; `SET_REG rk` ; corpo ; `DEC_JNZ rk,início` |
| `se ( cond ) { c }`          | cond ; `JMP_FALSE depois` ; corpo ; `depois:`      |
| `se…senão`                   | cond ; `JMP_FALSE senão` ; então ; `JMP fim` ; `senão:` senão ; `fim:` |
| `repetir até ( cond ) { c }` | `início:` cond ; `UN não` ; `JMP_FALSE fim` ; corpo ; `JMP início` ; `fim:` |
| `parar tudo`                 | `HALT`                                             |
| `repetir para sempre { c }`  | `início:` corpo ; `JMP início`                     |
| `( a ) + ( b )`              | a ; b ; `BIN +`                                    |
| `👁 distância cm`            | `SENSOR 0`                                         |

**Os três blocos de sensor do Grande não têm opcode próprio.** O `se obstáculo a
menos de [20] cm` é `SENSOR 0` ; `PUSH 20` ; `BIN <` ; `JMP_FALSE` — exatamente o
que a criança monta à mão no Gigante. Era um opcode dedicado, o `JMP_IF_GE`, que
saiu quando o sensor virou valor; o número 7 ficou vago na tabela de propósito,
porque reusá-lo faria bytecode antigo rodar errado.

A pilha nasce e morre dentro do cálculo de um valor: nenhuma instrução que
devolve o controle ao `loop()` deixa coisa pendurada nela. É isso que mantém o
watchdog e a não-bloqueância intactos. Dividir por zero dá zero, de propósito —
uma criança vai dividir por zero, e um robô que morre no meio da sala ensina
menos que um que anda estranho.

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
| `( a ) + ( b )`              | `a + b`, com parênteses em toda conta composta |
| `🎲 aleatório de ( ) a ( )`  | `aleatorio(a, b)`                          |
| `👁 distância cm`            | `distanciaCm()`                            |
| `se ( ) então { c }`         | `if (cond) { c }`                          |
| `repetir até ( ) { c }`      | `while (!(cond)) { c }`                    |

O arquivo carrega só as funções que o programa usa: um programa que não sente
nada não leva o HC-SR04 junto. E o `.ino` não herda os limites da VM — 256
instruções e quatro `repetir` aninhados são restrições dos 7 bytes e dos quatro
registradores, não do C++.

---

## Testes

```bash
cd tests && make test && cd ..      # VM, física, laço e montador (C)
./tests/host_test.sh                # robô virtual de ponta a ponta
node --test tests/                  # compilador, bridge, níveis, som, navegador
cd firmware && pio run && cd ..     # o firmware compila
cd android && ./gradlew testDebugUnitTest && cd ..   # o tradutor do app (JVM)
```

O `tests/host_test.sh` faz mais do que parece: ele é a rede de segurança do
`host/laco.c`. Como o laço e a casca de stdio foram separados para o app
Android caber, é ele que prova que a separação não mudou comportamento — ele
não foi alterado uma linha desde antes disso.

O mais lento deles é `tests/gabaritos.test.js`, uns três minutos: ele monta cada
gabarito, aperta PLAY e vê se a missão é cumprida — as cinco fases nos três
níveis. Vale o tempo. Um gabarito que não resolve é pior que gabarito nenhum,
porque a criança que travou segue a resposta, não funciona, e conclui que o erro
é dela. E isso não dá para conferir no papel: as duas primeiras versões que
escrevi pareciam certas e raspavam na parede.

O `tests/quadros_test.c` cobre o que nenhum outro alcança: a remontagem de uma
mensagem WebSocket partida. O ESPAsyncWebServer entrega mensagem grande em
pedaços, e o firmware descartava tudo que não chegasse inteiro de uma vez — um
programa de 256 instruções já são 1795 bytes, acima do MTU de 1436, então
programa grande nunca carregaria na placa. O montador é C puro e sem Arduino de
propósito, para caber num teste de mesa.

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
host/       laco.c main.c physics.c       o robô virtual: laco.c é o miolo,
            hal_sim.c relogio.c           main.c é só a casca de stdio
bridge/     server.js                     WebSocket + arquivos estáticos, zero deps
web/        compilador.js niveis.js       compilador, níveis, campo de bolinhas
            campos.js blocos.js           blocos Blockly em português
            teclado.js                    o teclado numérico da página
            robo.js arena.js som.js       personagem, mundo, síntese de áudio
            rede.js app.js index.html     protocolo e fiação
firmware/   src/main.cpp hal_esp32.cpp    a placa
android/    app/src/main/java/...         o app: WebView, Wi-Fi, servidor local
            app/src/main/cpp/ponte.c      JNI sobre o mesmo host/laco.c
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
2× 18650, e um sensor de distância **HC-SR04P** ou **RCWL-1601** — os de 3,3 V,
que ligam sem resistor.

| pino ESP32 | ligação        |
|------------|----------------|
| 25, 26, 27 | PWMA, AIN1, AIN2 |
| 33, 14, 12 | PWMB, BIN1, BIN2 |
| 13         | STBY           |
| 5, 18      | TRIG, ECHO     |

A fonte de verdade dessa tabela é `firmware/src/hal_esp32.cpp`.

### O sensor de distância

Compre o **HC-SR04P** (com "P" no fim) ou o **RCWL-1601**. São os dois de
**3,3 V nativo**, custam o mesmo que o comum, e ligam direto — quatro fios, nenhum
componente no meio:

| pino do sensor | vai em            |
|----------------|-------------------|
| `VCC`          | **3V3** da ESP32  |
| `Trig`         | **GPIO 5**        |
| `Echo`         | **GPIO 18**       |
| `GND`          | **GND**           |

É a ligação recomendada aqui, e a razão é uma só: **não precisa de resistor
nenhum**. Um sensor de dez reais resolve no ato o que de outro modo vira um
divisor de tensão soldado no meio do fio.

O **HC-SR04 comum** — sem o "P" — é alimentado com 5 V e por isso devolve 5 V no
`Echo`, enquanto a entrada da ESP32 aguarda 3,3 V. Ligar esse direto no GPIO 18
vai degradando o pino até ele morrer. Quem já tem um em casa e não quer trocar
precisa de um divisor: 1 kΩ do `Echo` para o GPIO 18, e 2 kΩ do GPIO 18 para o
GND. Não há terceiro caminho — ou o sensor é de 3,3 V, ou entram os dois
resistores.

Para conferir que acertou, **sem precisar de motor nem de chassi**: abra a
interface e olhe o `distância:` do painel. Ligado na placa, aquele número é o
HC-SR04 e se atualiza sozinho, dez vezes por segundo — aproxime a mão e ele cai,
sem tocar em bloco nenhum. Se der sempre **400**, é o valor que o firmware
devolve quando o eco não voltou: confira a alimentação, depois se `Trig` e
`Echo` não estão trocados, depois o GND comum.

O `👁 distância cm` continua servindo, e para outra coisa: largue um num canto
solto no nível Gigante e toque nele. A bolha mostra o número que **a VM** leu,
e não o que o painel mostra por fora — é o caminho inteiro, do opcode `SENSOR`
até a tela, provado de uma vez.

### Os outros dois cuidados

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
- **Caixas com nome** — variáveis, com a UI do Blockly. A VM já tem pilha; falta
  o par `PUSH_VAR`/`STORE_VAR` e o `mudar _ por _`.
- **Tarefas e eventos** — `quando começar`, `quando <condição>`, avisos entre
  pedaços do programa. Precisa de mais de um `pc` na VM.
- **Blocos que ela inventa** — funções do usuário.
- **Listas e texto** — o menos urgente para um robô.
