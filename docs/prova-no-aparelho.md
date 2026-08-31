# Prova no aparelho — o que falta fazer, e como

Data: 2026-08-31. Escrito para a sessão do Claude **no notebook**, que tem o
repositório mas não a conversa em que isto foi construído.

## Em uma frase

O app Android está inteiro no `master` e compila, mas **nunca foi aberto num
aparelho**. Sua tarefa é instalar no celular, rodar dois testes, e registrar no
`README.md` o que realmente aconteceu — inclusive se der errado.

O celular vai plugado no notebook porque a máquina onde o app foi escrito não
tem entrada USB-C.

## Por que isto importa

O segundo teste é o **portão de risco** do projeto inteiro. A rede do robô não
tem internet; o Android mantém os dados móveis como rota padrão, e o
`ws://192.168.4.1` do WebView sai pela operadora e morre calado. O conserto é o
`bindProcessToNetwork` em `android/app/src/main/java/br/educacaocriativa/roboblocos/RedeDoRobo.kt`,
e o que **ninguém provou ainda** é que ele alcança o WebView, que tem processo
próprio desde o Android 8.

Se falhar, não é beco sem saída — tem caminho de recuo, descrito lá embaixo.

## Antes de tudo

```bash
git pull
```

Confirme que o `README.md` tem a seção "No celular e no tablet Android". Se não
tiver, você está num commit velho.

## Passo 1 — pôr o APK no celular

Duas rotas. Tente a primeira.

### Rota A: o APK já está no notebook

O dono do projeto recebeu o `app-debug.apk` (7,8 MB) na conversa da outra
máquina e pode tê-lo salvo no notebook. **Pergunte a ele onde está.** Se
existir:

```bash
adb devices                      # tem que listar o aparelho
adb install -r /caminho/app-debug.apk
```

Se o `adb` não existir no notebook, ele vem no platform-tools do SDK — ver
rota B, ou instale só o platform-tools.

### Rota B: montar o APK aqui

O `android/app/build/` é ignorado pelo git, então o APK **não** vem no clone.
Se o notebook não tiver o SDK, instale — os comandos abaixo são exatamente os
que funcionaram na outra máquina, com cmdline-tools e sem Android Studio:

```bash
mkdir -p ~/Android/Sdk/cmdline-tools
cd /tmp
curl -fsSL -o cli.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip -q cli.zip
mv cmdline-tools ~/Android/Sdk/cmdline-tools/latest

export ANDROID_HOME="$HOME/Android/Sdk"
SM="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
yes | "$SM" --licenses > /dev/null
"$SM" "platform-tools" "platforms;android-34" "build-tools;34.0.0" \
      "ndk;26.1.10909125" "cmake;3.22.1"
```

São uns 3 GB. Depois, no repositório:

```bash
echo "sdk.dir=$HOME/Android/Sdk" > android/local.properties   # ignorado pelo git
./android/preparar_assets.sh
cd android && ./gradlew installDebug
```

O wrapper do Gradle já está versionado; não precisa de `gradle` no PATH. Se o
`installDebug` reclamar que não há aparelho, é o passo seguinte.

### No celular, antes de instalar

Ajustes → Sobre o telefone → tocar 7× em "Número da versão" para liberar as
Opções do desenvolvedor. Lá dentro, ligar **Depuração USB**. Plugar e aceitar o
diálogo de autorização que aparece na tela do celular — sem aceitar, o
`adb devices` mostra `unauthorized` e nada funciona.

O app é **paisagem fixa** e o layout ainda é o de tablet. Num celular vai
apertar, e isso é esperado: o layout de celular ficou fora do plano de
propósito, com o motivo escrito em
`docs/superpowers/plans/2026-08-31-app-android.md`.

## Passo 2 — o primeiro teste: o ensaio, sem rede nenhuma

**Desligue Wi-Fi e dados móveis.** Abra o app.

Esperado:

1. O cabeçalho sai de `conectando…` e vira `parado` **sozinho**, sem tocar em nada.
2. Arraste `andar frente` para dentro do `▶ quando apertar PLAY` e aperte PLAY.
   O robô desenhado na arena anda.
3. Toque no bloco `👁 distância cm`. Uma bolha mostra a distância da parede
   simulada.

Isso prova, de uma vez, a VM nativa (`librobo.so`, o mesmo `core/vm.c` de
sempre) e o servidor WebSocket local em Kotlin.

**Se falhar:** rode `adb logcat | grep -iE "robo|chromium|AndroidRuntime"` e leia
o erro. Tela branca costuma ser JavaScript quebrado — a página tem um
`window.onerror` que escreve o motivo no próprio cabeçalho, então olhe a tela
antes de olhar o log.

## Passo 3 — o segundo teste: o robô de verdade. **Este é o portão.**

Precisa da ESP32 ligada, com o `Robo-01` no ar.

**Ligue os dados móveis de propósito.** É esse o caso que quebra — com dados
desligados o teste passa mesmo se o `bindProcessToNetwork` não funcionar, e aí
você não provou nada.

1. No app, toque em **🤖 procurar o robô**.
2. O Android abre o diálogo dele listando as redes `Robo-*`. Toque no `Robo-01`.
3. Esperado: o cabeçalho vira `parado`, o botão vira **🔌 voltar para o ensaio**.
4. Aperte PLAY com um `andar frente 1s` montado. **Esperado: o robô de verdade anda.**
5. Toque em `👁 distância cm`. Esperado: a bolha mostra a leitura do HC-SR04.
6. Toque em **🔌 voltar para o ensaio**. Esperado: volta ao robô da arena, e o
   programa continua montado na tela.

### Se o diálogo do Android vier vazio

O app não pede permissão de localização de propósito, porque não varre Wi-Fi —
quem varre é o sistema. Se mesmo assim a lista vier vazia, e **só nesse caso**,
acrescente ao `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES"
    android:usesPermissionFlags="neverForLocation" />
```

Reinstale e tente de novo. Registre que foi preciso.

### Se conectar mas o PLAY não mexer o robô

Confira se funciona **com os dados móveis desligados**. Se funcionar assim e
não com eles ligados, você encontrou exatamente o risco previsto: o
`bindProcessToNetwork` não alcançou o WebView.

**Não tente consertar por tentativa e erro.** Registre o achado, e o caminho de
recuo já está desenhado: tirar a conversa com a placa de dentro do WebView e
subir para o Kotlin — o `ServidorLocal.kt` vira um proxy para o `192.168.4.1`, e
o `web/rede.js` deixa de falar com a placa direto. Isso é um ciclo de trabalho
novo, com brainstorming próprio, não um remendo.

## Passo 4 — registrar

Isto não é opcional, e é a parte que sobrevive.

No `README.md`, na seção "No celular e no tablet Android", existe um bloco de
citação que hoje diz que nada foi aberto num aparelho. **Reescreva-o com o que
de fato aconteceu**, no mesmo tom do bloco que já existe na seção da ESP32
("Onde o hardware foi provado, e onde não foi"): o que funcionou, o que não, e
o que ficou por provar. Escreva o que aconteceu, nunca o que deveria acontecer.

Se algum teste falhou, descreva o sintoma exato e o que apareceu no `logcat`.

## Regras da casa

- **Commit e push sempre**, ao terminar. Direto no `master`, que é como o
  repositório inteiro sempre foi. Não crie branch.
- Mensagem de commit **em português**, no presente, uma linha de assunto e o
  corpo explicando o porquê. Veja o `git log`.
- **Nunca** assine commit com `Co-Authored-By` ou qualquer marca de IA. Os
  commits são do dono do projeto.
- Não commite `android/app/build/`, `android/app/.cxx/` nem
  `android/local.properties` — todos já estão no `.gitignore`.

## Onde ler mais

- `docs/superpowers/specs/2026-08-31-app-android-analise.md` — por que o app foi
  desenhado assim
- `docs/superpowers/plans/2026-08-31-app-android.md` — as nove tarefas; a
  **tarefa 4** é este portão, com os detalhes
- `README.md`, seção "No celular e no tablet Android"
