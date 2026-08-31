# App Android — análise

Data: 2026-08-31

**Isto não é um design aprovado.** É o relatório de uma sondagem: a pergunta era
"quanto custa transformar isso num app Android", e a saída é uma resposta, não
código. Nada foi escrito, nada foi montado. Quando o desenho for aprovado, ele
vira um `-design.md` próprio e um plano.

## A pergunta

O app faz o que a tela faz hoje, só que instalado num celular ou tablet Android.
Inclui uma tela de conexão — *"clique aqui e vamos procurar o robô"* — e o estado
oposto, *"não estamos no wifi do robô"*.

Duas decisões já foram tomadas e valem para tudo que segue:

- **O robô virtual continua funcionando sem robô nenhum por perto.** O ensaio
  antes de mandar no robô de verdade é a pedagogia do projeto; um app que só
  funciona com a placa na mesa não é o mesmo produto.
- **Android 10 (API 29) para cima.** Um caminho só de Wi-Fi, sem o segundo
  código para tablets de 2016.

## O veredito

Menor do que parece, e o caro não é o Android.

O caro é que **hoje o robô virtual mora no `bridge/server.js`**, e não dentro do
navegador. O bridge faz `spawn(host/robo_host)` — um processo C por conexão — e
traduz linhas de stdio para os quadros binários do WebSocket. No celular não
existe `spawn`, não existe Node, não existe processo filho.

Essa é a obra. O resto é encanamento.

E o que não muda é mais do que o que muda: **`core/`, `firmware/`, o protocolo
binário e praticamente todo o `web/` ficam intocados.** O app é uma casca nova
em volta do mesmo `web/`, mais uma reescrita do `bridge/server.js` em Kotlin.

---

## 1. O robô virtual dentro do app

É a peça do meio, e a única com trabalho de verdade.

O que salva é o tamanho: são **cerca de 700 linhas de C** — `core/vm.c` (197),
`host/physics.c` (122), `host/hal_sim.c` (23), mais os headers — e esse código
**já compila para dois alvos**, x86 no `host/Makefile` e xtensa no PlatformIO.
Um terceiro alvo é barato justamente porque o segundo já obrigou o código a ser
portátil.

O caminho recomendado tem duas camadas:

- **NDK + CMake** compilam `core/` e `host/` num `.so`, com um shim JNI no lugar
  do laço de stdio do `host/main.c`. O `main.c` é o único arquivo que não
  atravessa — ele é a casca de linha de comando, e a casca é o que estamos
  trocando.
- Por cima, **um servidor WebSocket minúsculo em `127.0.0.1`, dentro do app**.
  É uma porta do `bridge/server.js`: mesmo handshake, mesmos oito tipos de
  quadro, na ordem de 200 linhas de Kotlin.

### Por que o servidor local, e não uma ponte JavaScript direta

Seria mais curto expor a VM ao WebView por `@JavascriptInterface` e mandar o
`web/rede.js` falar com ela. Seria também uma segunda implementação do
protocolo, que passa a poder divergir da primeira em silêncio.

Com o servidor local, o `web/` **não muda nada** no caminho do simulador: ele
abre um WebSocket como sempre abriu, e o app vira um drop-in do bridge. O
protocolo continua tendo uma definição só.

### A alternativa que ficou de fora

Compilar o mesmo C para **WASM** com emscripten é tentador, e traria um prêmio:
o *navegador* também ganharia simulador offline, sem servidor nenhum. Mas WASM
não existe no Safari do iOS 9, e o projeto segura ES5 exatamente por causa do
iPad 2. Dá para fazer condicional — e talvez valha um dia —, mas é escopo novo,
e não é o que está sendo pedido agora.

Portar a VM para JavaScript à mão está descartado: seria uma segunda
implementação da mesma máquina, garantida a divergir.

---

## 2. O fluxo do Wi-Fi

Pouco código, muita cascalho de aparelho. A tela pedida existe pronta no Android.

### O gesto

No Android 10+, um `WifiNetworkSpecifier` com
`setSsidPattern("Robo-", PATTERN_PREFIX)` e `setWpa2Passphrase("robo1234")`,
entregue ao `ConnectivityManager.requestNetwork()`, faz o **próprio sistema**
abrir um diálogo listando os robôs por perto. A criança toca no nome, conecta.

É literalmente a tela que se quer, e o Android a desenha por nós. O padrão por
prefixo (`Robo-`) em vez do nome exato já deixa a porta aberta para uma sala com
`Robo-01`, `Robo-02`, `Robo-03`.

Permissões: `CHANGE_NETWORK_STATE`, mais `ACCESS_FINE_LOCATION` no Android 10–12
e `NEARBY_WIFI_DEVICES` (com `neverForLocation`) no 13+.

### A armadilha número um, e ela é silenciosa

A rede do robô não tem internet. O Android percebe isso e **mantém o 4G como
rota padrão** — o `ws://192.168.4.1` do WebView sai pela operadora e morre sem
dizer por quê.

O conserto é chamar `bindProcessToNetwork(network)` no `onAvailable` e desfazer
no `onLost`. É o bug clássico desse tipo de app, e é a **única coisa nesta
análise que não afirmo de cadeira**: que o `bindProcessToNetwork` alcança o
WebView é o que se relata na prática, mas o WebView tem processo próprio desde o
Android 8.

**Isto é o primeiro a provar, num aparelho real, antes de escrever qualquer
outra coisa.** Se falhar, todo o desenho do app muda — a VM nativa ainda
serviria, mas a conversa com a placa precisaria sair do WebView e subir para o
Kotlin, e aí o `web/rede.js` deixa de ser o cliente.

### Como saber se estamos no robô

Não lendo o SSID: é permissão chata e mente em vários aparelhos. **Tenta falar
com o `192.168.4.1`.** Alcançabilidade é a verdade, e dá os dois estados da tela
de graça — o mesmo `aoDesconectar` que o `web/app.js:468` já tem.

---

## 3. A casca WebView

Pequena, com uma pegadinha que este projeto já conhece de outro ângulo.

- Carregar o `web/` dos assets com `WebViewAssetLoader` **em `http://`**
  (`setHttpAllowed(true)`), **nunca em `https://`**. É a mesma parede que o
  README já documenta: página HTTPS não abre `ws://` para a ESP32. Uma origem
  `http` local resolve, sem conteúdo misto.
- `networkSecurityConfig` liberando cleartext para `192.168.4.1`.
- O `conectar()` do `web/app.js:458` assume `location.host`. Precisa aceitar um
  alvo — `127.0.0.1:porta` para o simulador, `192.168.4.1` para o robô. **É a
  única mudança real no `web/`**, na ordem de cinco linhas.
- **O `.ino` some se ninguém lembrar dele.** O `web/app.js:704` monta um `Blob`
  e clica num `a[download]`; num WebView isso não faz nada, e `blob:` nem chega
  ao `DownloadListener`. O texto precisa atravessar para o Kotlin por
  `@JavascriptInterface` e ser gravado via SAF/MediaStore. Pequeno, mas quebra
  calado.
- Um `preparar_assets.sh` copiando `web/` para `app/src/main/assets/`, no mesmo
  molde do `firmware/preparar_data.sh` que já existe.

---

## 4. O layout de celular

O maior desconhecido, e não é problema de Android.

Já está na lista de pendências do projeto, e o app **não resolve — só expõe**: o
motivo de querer um app é o celular, e Blockly com caixa de blocos, arena e
cabeçalho numa tela de seis polegadas é apertado de verdade. Tablet já está
provado, num iPad 2.

Esta peça é design aberto, e pode facilmente ser maior que todo o encanamento
das outras três somado.

---

## 5. O custo cultural

O projeto hoje tem **zero dependência e zero build step**, e isso é uma escolha
escrita no README, não um acaso. Um app Android traz Gradle, o SDK do Android e
a toolchain do NDK. Não tem como fugir disso, e vale saber que é o preço antes
de pagar.

Distribuição: sideload de APK numa escola é provavelmente mais simples que a
Play Store, que pede conta paga, declaração das permissões de Wi-Fi e
localização, e target API em dia.

Efeito colateral bom: se o app carrega a interface, a placa não precisa mais
servir o LittleFS no caminho do app — sobra flash, hoje em 66,7%. Manteria o
LittleFS mesmo assim, para o navegador continuar funcionando sem app.

E um risco a nomear: interface no app e interface na placa passam a ser **duas
cópias**, que podem divergir. O que segura é que o contrato real são os oito
tipos de quadro do protocolo, não os arquivos — e o protocolo não mudou desde
que nasceu.

---

## Tamanho relativo

| Peça | Tamanho |
| --- | --- |
| Casca WebView, assets, download do `.ino` | pequena |
| VM nativa via NDK + servidor WS local | **média — é o núcleo** |
| Fluxo de Wi-Fi, bind e tela dos dois estados | pouco código, muito teste em aparelho |
| Layout de celular | aberto |

Sem mudança nenhuma em `core/`, no `firmware/`, no protocolo binário, e no
`web/` fora das cinco linhas do alvo da conexão.

## Ordem sugerida

1. **Provar o `bindProcessToNetwork` num aparelho real.** Uma tela, um botão, um
   `ws://192.168.4.1`. É o único risco que pode redesenhar o resto, e custa uma
   tarde descobrir.
2. Casca WebView com o `web/` nos assets, falando com o bridge da máquina de
   desenvolvimento pela rede local — separa o problema da casca do problema da VM.
3. VM nativa no NDK e o servidor WS local; o app fica autônomo.
4. Fluxo de Wi-Fi de verdade, com a tela dos dois estados.
5. Layout de celular, que é onde o trabalho deixa de ser previsível.
