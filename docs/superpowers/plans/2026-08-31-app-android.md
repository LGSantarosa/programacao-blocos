# App Android — plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA — use
> `superpowers:subagent-driven-development` (recomendado) ou
> `superpowers:executing-plans` para implementar tarefa a tarefa. Os passos usam
> caixinha (`- [ ]`) para marcar o andamento.

**Objetivo:** empacotar a tela de blocos num app Android que roda o robô virtual
sem robô por perto e, com um toque, procura o `Robo-01` e passa a mandar na
placa de verdade.

**Arquitetura:** o app é um WebView carregando o mesmo `web/` de hoje a partir
dos assets, sobre uma origem `http://` local. O robô virtual vira uma
biblioteca nativa — o mesmo `core/vm.c` e `host/physics.c` que já rodam na mesa
e na ESP32 — atrás de um servidor WebSocket local em Kotlin que fala o mesmo
protocolo binário do `bridge/server.js`. O `web/` não sabe com quem fala: só
muda o alvo do WebSocket.

**Tecnologias:** Kotlin, Gradle 8.7 / AGP 8.5, `androidx.webkit` (WebViewAssetLoader),
NDK + CMake, JNI, C11.

**Spec:** [`docs/superpowers/specs/2026-08-31-app-android-analise.md`](../specs/2026-08-31-app-android-analise.md)

## Restrições globais

- **minSdk 29** (Android 10). Decisão do dono do projeto: um caminho só de Wi-Fi.
  `compileSdk` e `targetSdk` 34.
- **O `web/` continua ES5.** Nada de `let`, `const`, arrow function, `gap`,
  `aspect-ratio` ou `var()`. A página tem que continuar abrindo num iPad 2 com
  iOS 9 pelo `bridge/server.js`. O código Kotlin e C não tem essa restrição.
- **Origem do WebView é `http://`, nunca `https://`.** Página HTTPS não abre
  `ws://` — é a mesma parede documentada no README para o site hospedado.
- **Um cliente por vez.** O app tem um robô virtual e uma criança. O
  `bridge/server.js` sobe um processo por conexão; aqui a VM é uma só, estática,
  como na ESP32.
- **Enquanto o processo está preso à rede do robô, o simulador local não é
  alcançável, e não precisa ser.** `bindProcessToNetwork` só fica ativo quando o
  alvo é a placa; voltar para o ensaio desfaz o bind. Invariante, não detalhe.
- **Sem dependência nova no `web/`, no `core/` e no `host/`.** Toda dependência
  nova vive dentro de `android/`.
- **Nomes em português**, como o resto do repositório. Pacote:
  `br.educacaocriativa.roboblocos`.
- SSID do robô: prefixo **`Robo-`**, senha **`robo1234`**, IP **`192.168.4.1`**.
- Commit ao fim de cada tarefa. Sem assinatura de IA na mensagem.

## Etapa 1 — o app dirige o robô de verdade (tarefas 1 a 5)

Ao fim da etapa 1 existe um APK instalável que abre a tela de blocos, acha o
`Robo-01` com um toque e manda o robô andar. Sem robô por perto ele ainda não
faz nada — é a etapa 2 que resolve isso.

## Etapa 2 — o robô virtual no bolso (tarefas 6 a 9)

Ao fim da etapa 2 o app funciona sozinho, na mesa da sala, sem placa nenhuma.

## Fora do escopo deste plano

O **layout de celular**. É design aberto, é o maior desconhecido da análise, e
merece o próprio ciclo de brainstorming. Este plano entrega o app rodando com o
layout que já existe — que funciona em tablet e aperta no celular.

---

### Tarefa 1: O esqueleto do app, com o `web/` dentro

Um APK que abre e mostra a tela de blocos. Ainda não conversa com robô nenhum:
o cabeçalho vai dizer "desconectado", e está certo.

**Arquivos:**
- Criar: `android/settings.gradle.kts`
- Criar: `android/build.gradle.kts`
- Criar: `android/gradle.properties`
- Criar: `android/app/build.gradle.kts`
- Criar: `android/app/src/main/AndroidManifest.xml`
- Criar: `android/app/src/main/res/values/strings.xml`
- Criar: `android/app/src/main/res/xml/rede_permitida.xml`
- Criar: `android/app/src/main/java/br/educacaocriativa/roboblocos/MainActivity.kt`
- Criar: `android/preparar_assets.sh`
- Modificar: `.gitignore`

**Interfaces:**
- Consome: nada.
- Produz: `MainActivity`, com um campo `private lateinit var webView: WebView`.
  As tarefas seguintes penduram coisas nela.

- [ ] **Passo 1: `android/settings.gradle.kts`**

```kotlin
pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositories { google(); mavenCentral() }
}
rootProject.name = "RoboDeBlocos"
include(":app")
```

- [ ] **Passo 2: `android/build.gradle.kts` e `android/gradle.properties`**

```kotlin
// android/build.gradle.kts
plugins {
    id("com.android.application") version "8.5.0" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}
```

```properties
# android/gradle.properties
org.gradle.jvmargs=-Xmx2048m
android.useAndroidX=true
kotlin.code.style=official
```

- [ ] **Passo 3: `android/app/build.gradle.kts`**

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "br.educacaocriativa.roboblocos"
    compileSdk = 34

    defaultConfig {
        applicationId = "br.educacaocriativa.roboblocos"
        minSdk = 29
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
    testImplementation("junit:junit:4.13.2")
}
```

- [ ] **Passo 4: `android/app/src/main/AndroidManifest.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.CHANGE_NETWORK_STATE" />

    <application
        android:label="@string/app_name"
        android:networkSecurityConfig="@xml/rede_permitida"
        android:supportsRtl="false"
        android:theme="@style/Theme.AppCompat.NoActionBar">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="landscape"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

Sem permissão de localização, e sem `NEARBY_WIFI_DEVICES`: o app **não faz
varredura de Wi-Fi**. Quem varre é o diálogo do próprio sistema, na tarefa 4, e
para isso `CHANGE_NETWORK_STATE` basta. Se na tarefa 4 o diálogo aparecer vazio
num aparelho real, aí sim acrescente `NEARBY_WIFI_DEVICES` com
`android:usesPermissionFlags="neverForLocation"` — e não antes.

`screenOrientation="landscape"`: a tela tem editor à esquerda e arena à direita,
e é assim que ela foi desenhada. Revisitar quando o layout de celular tiver o
próprio ciclo.

- [ ] **Passo 5: `res/values/strings.xml` e `res/xml/rede_permitida.xml`**

```xml
<!-- res/values/strings.xml -->
<resources>
    <string name="app_name">Robô de Blocos</string>
</resources>
```

```xml
<!-- res/xml/rede_permitida.xml -->
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Nada aqui é internet: é a própria placa, e o servidor dentro do app.
         Cleartext liberado só para estes três nomes, e para mais nenhum. -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">appassets.androidplatform.net</domain>
        <domain includeSubdomains="false">192.168.4.1</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
    </domain-config>
</network-security-config>
```

- [ ] **Passo 6: `MainActivity.kt`**

```kotlin
package br.educacaocriativa.roboblocos

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    /* http, e não https: uma página https não consegue abrir ws:// para a
       ESP32 nem para o servidor local. É a mesma parede que o README descreve
       para o site hospedado, e é por isso que o app carrega a interface de
       dentro em vez de pegar da placa. */
    private val carregadorDeAssets by lazy {
        WebViewAssetLoader.Builder()
            .setHttpAllowed(true)
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(estado: Bundle?) {
        super.onCreate(estado)
        webView = WebView(this)
        setContentView(webView)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = false
        WebView.setWebContentsDebuggingEnabled(true)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                v: WebView, pedido: WebResourceRequest
            ): WebResourceResponse? = carregadorDeAssets.shouldInterceptRequest(pedido.url)
        }

        webView.loadUrl("http://appassets.androidplatform.net/index.html")
    }
}
```

- [ ] **Passo 7: `android/preparar_assets.sh`**

Mesmo molde do `firmware/preparar_data.sh`, que já existe e é a referência.
Duas diferenças: não comprime (o WebViewAssetLoader não serve `.gz`
automaticamente) e **substitui o `%VERSAO%`** — que hoje só o
`bridge/server.js` substitui, e que na ESP32 aparece cru na tela.

```bash
#!/usr/bin/env bash
# Copia web/ para android/app/src/main/assets/. Roda antes de todo build.
set -eu

cd "$(dirname "$0")"
ALVO=app/src/main/assets
rm -rf "$ALVO"
mkdir -p "$ALVO/vendor/media" "$ALVO/img"

cp ../web/*.html ../web/*.js "$ALVO"/
cp ../web/vendor/*.js "$ALVO"/vendor/
cp ../web/vendor/media/* "$ALVO"/vendor/media/
cp ../web/img/* "$ALVO"/img/

# O %VERSAO% do cabeçalho: no bridge é o hash dos arquivos servidos, aqui é o
# commit. Sem isto a tela mostra "%VERSAO%" cru, que é o que a ESP32 faz hoje.
VERSAO=$(git -C .. rev-parse --short HEAD 2>/dev/null || echo "solto")
sed -i.bak "s/%VERSAO%/$VERSAO/g" "$ALVO"/*.html
rm -f "$ALVO"/*.html.bak

echo "assets prontos em $ALVO ($VERSAO)"
```

`chmod +x android/preparar_assets.sh`.

- [ ] **Passo 8: acrescentar ao `.gitignore`**

```
android/.gradle/
android/build/
android/app/build/
android/local.properties
android/app/src/main/assets/
android/.cxx/
```

- [ ] **Passo 9: montar e instalar**

```bash
./android/preparar_assets.sh
cd android && ./gradlew installDebug
```

Esperado: instala. Abrir o app mostra a tela de blocos com o cabeçalho azul, a
caixa de blocos e a arena. O `estado` no cabeçalho fica em `conectando…` e
depois `desconectado`, porque ainda não há WebSocket nenhum — **é o resultado
correto desta tarefa.**

Se a tela vier em branco: `chrome://inspect` no desktop com o aparelho plugado
mostra o console do WebView. `setWebContentsDebuggingEnabled(true)` já está
ligado acima justamente para isso.

- [ ] **Passo 10: commit**

```bash
git add android .gitignore
git commit -m "Põe a tela de blocos dentro de um app Android"
git push
```

---

### Tarefa 2: O `web/` aprende a falar com um alvo que não é a própria origem

Hoje `web/app.js:459` monta a URL do WebSocket a partir de `location.host`. No
app a origem é o carregador de assets, que não serve WebSocket nenhum: o alvo
tem que vir de fora.

**Arquivos:**
- Modificar: `web/rede.js` (acrescenta `url()` e o idioma de `module.exports`)
- Modificar: `web/app.js:458-462` (usa `Rede.url`) e o fim do arquivo (expõe `App`)
- Criar: `tests/rede.test.js`

**Interfaces:**
- Consome: nada.
- Produz:
  - `Rede.url(host, protocoloDaPagina)` → `string` — `'ws://host/'`, ou
    `'wss://host/'` só quando a página veio de `https:`.
  - `window.App.irPara(host)` — troca o alvo e reconecta. `host` é
    `'192.168.4.1'` ou `'127.0.0.1:8080'`; passar `null` volta para a origem da
    página. É o que o Kotlin chama.
  - `window.App.alvo()` → `string|null` — o alvo em vigor.

- [ ] **Passo 1: escrever o teste que falha — `tests/rede.test.js`**

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Rede = require('../web/rede.js');

test('no navegador comum, o alvo é a própria origem em ws://', () => {
  assert.strictEqual(Rede.url('localhost:8080', 'http:'), 'ws://localhost:8080/');
});

test('página servida por https usa wss', () => {
  assert.strictEqual(Rede.url('exemplo.org', 'https:'), 'wss://exemplo.org/');
});

test('a placa é sempre ws: não existe certificado em 192.168.4.1', () => {
  assert.strictEqual(Rede.url('192.168.4.1', 'http:'), 'ws://192.168.4.1/');
});

test('o alvo pode trazer porta junto', () => {
  assert.strictEqual(Rede.url('127.0.0.1:53411', 'http:'), 'ws://127.0.0.1:53411/');
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `node --test tests/rede.test.js`
Esperado: FALHA — `Rede.url is not a function` (o `require` devolve `{}`, porque
o `web/rede.js` ainda só escreve em `raiz.Rede`).

- [ ] **Passo 3: implementar em `web/rede.js`**

Acrescentar a função, antes do bloco final do arquivo:

```js
  /* Onde está o robô. No navegador é sempre a origem que serviu a página; no
     app Android a origem é um carregador de assets local, e o alvo vem de fora
     — o simulador em 127.0.0.1 ou a placa em 192.168.4.1. Só o esquema é
     decidido aqui, e ele segue a página: wss só existe se a página veio de
     https, e nenhum dos dois alvos locais vem. */
  function url(host, protocoloDaPagina) {
    var esquema = protocoloDaPagina === 'https:' ? 'wss:' : 'ws:';
    return esquema + '//' + host + '/';
  }
```

E trocar a última linha do arquivo, hoje `raiz.Rede = { conectar };`, pelo mesmo
idioma que `web/som.js` e `web/campos.js` já usam:

```js
  var api = { conectar, url };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Rede = api;
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `node --test tests/rede.test.js`
Esperado: PASSA, 4 testes.

- [ ] **Passo 5: usar em `web/app.js`**

Acrescentar perto do topo do IIFE, junto das outras variáveis de estado:

```js
  /* null = a origem que serviu a página, que é o caso do navegador. O app
     Android chama App.irPara() para apontar para o simulador de dentro dele ou
     para a placa. */
  var alvo = null;
```

Trocar as duas primeiras linhas de `conectar()` (`web/app.js:458-460`):

```js
  function conectar() {
    robo = Rede.conectar(Rede.url(alvo || location.host, location.protocol), {
```

E acrescentar, logo antes da chamada `conectar();` no fim do arquivo:

```js
  /* A ponte do app: o Kotlin diz para onde apontar, e a página reconecta sem
     recarregar — recarregar apagaria o programa que a criança montou. */
  raiz.App = {
    alvo: function () { return alvo; },
    irPara: function (host) {
      alvo = host || null;
      if (robo && robo.pronto()) robo.parar();
      conectar();
    },
  };
```

Onde `raiz` é o mesmo `self`/`globalThis` do topo do arquivo. Se o `app.js` não
tiver um `raiz`, use `window`.

- [ ] **Passo 6: conferir que nada quebrou no navegador**

```bash
node --test tests/
```

Esperado: tudo passa, incluindo `tests/navegador.test.js`, que dirige um
Chromium de verdade e é quem prova que a página ainda conecta como antes.

- [ ] **Passo 7: commit**

```bash
git add web/rede.js web/app.js tests/rede.test.js
git commit -m "Deixa a página apontar para um robô que não é a origem dela"
git push
```

---

### Tarefa 3: O WebView conversa com o bridge da máquina de desenvolvimento

Prova que WebSocket sai de dentro do WebView com a configuração da tarefa 1 —
antes de existir VM nativa ou Wi-Fi. Se isto não funcionar, nada adiante
funciona, e o motivo será de configuração, não de rede de robô.

**Arquivos:**
- Modificar: `android/app/src/main/java/br/educacaocriativa/roboblocos/MainActivity.kt`
- Criar: `android/app/src/main/java/br/educacaocriativa/roboblocos/PonteJs.kt`

**Interfaces:**
- Consome: `window.App.irPara(host)` da tarefa 2.
- Produz: `PonteJs`, exposta ao JavaScript como `window.Android`, com
  `fun temApp(): Boolean = true`. As tarefas 4 e 5 acrescentam métodos nela.

- [ ] **Passo 1: `PonteJs.kt`**

```kotlin
package br.educacaocriativa.roboblocos

import android.webkit.JavascriptInterface

/* Tudo que a página só consegue fazer por estar dentro do app. No navegador
   window.Android não existe, e a página tem que continuar funcionando assim —
   é o mesmo teste de capacidade que o app.js já faz para o download. */
class PonteJs {
    @JavascriptInterface
    fun temApp(): Boolean = true
}
```

- [ ] **Passo 2: pendurar a ponte e apontar o alvo em `MainActivity.kt`**

Dentro de `onCreate`, antes do `loadUrl`:

```kotlin
        webView.addJavascriptInterface(PonteJs(), "Android")
```

E acrescentar `onPageFinished` no `WebViewClient` já existente:

```kotlin
            override fun onPageFinished(v: WebView, url: String) {
                irPara(ALVO_INICIAL)
            }
```

Com, na classe:

```kotlin
    /* Provisório: o IP da máquina onde roda o bridge/server.js. A tarefa 8
       troca isto pelo servidor local do próprio app. */
    private val ALVO_INICIAL = "192.168.0.10:8080"

    fun irPara(host: String) {
        webView.evaluateJavascript("App.irPara('$host')", null)
    }
```

- [ ] **Passo 3: provar no aparelho**

Na máquina de desenvolvimento, com o aparelho na **mesma rede Wi-Fi de casa**:

```bash
ip -4 addr show | grep 'inet '          # descobre o IP a pôr em ALVO_INICIAL
node bridge/server.js
cd android && ./gradlew installDebug
```

Esperado, no aparelho: o cabeçalho sai de `desconectado` e vira `parado`, o
`▶ PLAY` habilita, e a arena desenha o robô. Montar `andar frente` e apertar
PLAY move o robô na arena.

**Se ficar em `desconectado`:** abra `chrome://inspect` no desktop. Erro de
cleartext aparece como `net::ERR_CLEARTEXT_NOT_PERMITTED` e significa que o
`rede_permitida.xml` não pegou — mas note que o IP da sua rede local **não está**
na lista de domínios, e é justamente por isso. Para esta tarefa, e só para ela,
acrescente o seu IP ao `rede_permitida.xml`, e tire quando a tarefa 8 tornar o
alvo local.

- [ ] **Passo 4: commit**

```bash
git add android
git commit -m "Prova que o WebSocket sai de dentro do WebView"
git push
```

---

### Tarefa 4: Procurar o robô — o portão de risco

**Esta é a tarefa que pode redesenhar o plano.** A rede do `Robo-01` não tem
internet; o Android mantém o 4G como rota padrão, e o `ws://192.168.4.1` do
WebView sai pela operadora e morre calado. O conserto conhecido é
`bindProcessToNetwork`, e o que ainda não está provado é que ele alcança o
WebView, que tem processo próprio desde o Android 8.

**Se falhar:** pare e reabra o desenho. O caminho alternativo é tirar a conversa
com a placa de dentro do WebView e subir para o Kotlin — o servidor local da
tarefa 8 passa a ser um proxy para `192.168.4.1`, e o `web/rede.js` deixa de
falar com a placa direto. É trabalho a mais, mas não é beco sem saída.

**Arquivos:**
- Criar: `android/app/src/main/java/br/educacaocriativa/roboblocos/RedeDoRobo.kt`
- Modificar: `android/app/src/main/java/br/educacaocriativa/roboblocos/PonteJs.kt`
- Modificar: `android/app/src/main/java/br/educacaocriativa/roboblocos/MainActivity.kt`
- Modificar: `web/index.html` (o botão), `web/app.js` (o gesto)
- Criar: `tests/app_botao.test.js`

**Interfaces:**
- Consome: `MainActivity.irPara(host)` da tarefa 3.
- Produz:
  - `RedeDoRobo(ctx).procurar(aoConectar: () -> Unit, aoCair: () -> Unit)`
  - `RedeDoRobo.soltar()` — desfaz o bind e larga a rede.
  - `PonteJs.procurarRobo()` — chamada pela página.

- [ ] **Passo 1: `RedeDoRobo.kt`**

```kotlin
package br.educacaocriativa.roboblocos

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiNetworkSpecifier
import android.os.PatternMatcher

/* Pede ao sistema uma rede Wi-Fi que casa com "Robo-*". Quem varre e quem
   desenha a lista é o próprio Android: o diálogo dele é a tela "vamos procurar
   o robô", e é por isso que o app não pede permissão de localização — ele
   nunca chama startScan(). */
class RedeDoRobo(ctx: Context) {

    private val cm = ctx.getSystemService(ConnectivityManager::class.java)
    private var registro: ConnectivityManager.NetworkCallback? = null

    fun procurar(aoConectar: () -> Unit, aoCair: () -> Unit) {
        soltar()

        val especificacao = WifiNetworkSpecifier.Builder()
            .setSsidPattern(PatternMatcher("Robo-", PatternMatcher.PATTERN_PREFIX))
            .setWpa2Passphrase(SENHA)
            .build()

        val pedido = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            /* Sem isto o pedido nunca se satisfaz: a rede do robô não tem
               internet, e o padrão do NetworkRequest exige que tenha. */
            .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .setNetworkSpecifier(especificacao)
            .build()

        val retorno = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(rede: Network) {
                /* A linha que decide tudo. Sem ela o soquete do WebView sai
                   pela rota padrão — o 4G — e o 192.168.4.1 nunca responde. */
                cm.bindProcessToNetwork(rede)
                aoConectar()
            }
            override fun onLost(rede: Network) {
                cm.bindProcessToNetwork(null)
                aoCair()
            }
            override fun onUnavailable() {
                cm.bindProcessToNetwork(null)
                aoCair()
            }
        }
        registro = retorno
        cm.requestNetwork(pedido, retorno)
    }

    /* Solta a rede e devolve o processo à rota padrão. Enquanto o processo
       está preso à rede do robô, 127.0.0.1 pode ficar inalcançável em alguns
       aparelhos — por isso ensaio e robô nunca convivem: um exclui o outro. */
    fun soltar() {
        registro?.let { cm.unregisterNetworkCallback(it) }
        registro = null
        cm.bindProcessToNetwork(null)
    }

    companion object {
        const val SENHA = "robo1234"
        const val IP = "192.168.4.1"
    }
}
```

- [ ] **Passo 2: expor o gesto em `PonteJs.kt`**

Trocar a classe inteira por:

```kotlin
package br.educacaocriativa.roboblocos

import android.webkit.JavascriptInterface

class PonteJs(private val tela: MainActivity) {
    @JavascriptInterface
    fun temApp(): Boolean = true

    /* Chamada de uma thread do WebView, não da principal: quem toca em
       View tem que voltar para a principal, e MainActivity.procurarRobo faz
       isso. */
    @JavascriptInterface
    fun procurarRobo() = tela.procurarRobo()
}
```

E, em `MainActivity.onCreate`, trocar por `webView.addJavascriptInterface(PonteJs(this), "Android")`.

- [ ] **Passo 3: ligar na `MainActivity`**

```kotlin
    private val redeDoRobo by lazy { RedeDoRobo(this) }

    fun procurarRobo() = runOnUiThread {
        redeDoRobo.procurar(
            aoConectar = { runOnUiThread { irPara(RedeDoRobo.IP) } },
            aoCair = { runOnUiThread { irPara(ALVO_INICIAL) } },
        )
    }

    override fun onDestroy() {
        redeDoRobo.soltar()
        super.onDestroy()
    }
```

- [ ] **Passo 4: escrever o teste do botão — `tests/app_botao.test.js`**

O botão só pode aparecer dentro do app. No navegador ele não existe, e a página
tem que continuar idêntica — é o mesmo teste de capacidade que o `app.js:677` já
faz para o download do `.ino`.

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(
  path.join(__dirname, '..', 'web', 'index.html'), 'utf8');
const APP = fs.readFileSync(
  path.join(__dirname, '..', 'web', 'app.js'), 'utf8');

test('o botão de procurar o robô existe e nasce escondido', () => {
  assert.match(HTML, /id="procurar"[^>]*hidden/);
});

test('o botão só se revela quando window.Android existe', () => {
  assert.match(APP, /typeof Android !== 'undefined'/);
});

test('o gesto chama Android.procurarRobo', () => {
  assert.match(APP, /Android\.procurarRobo\(\)/);
});
```

- [ ] **Passo 5: rodar e ver falhar**

Rodar: `node --test tests/app_botao.test.js`
Esperado: FALHA nos três — nada disso existe ainda.

- [ ] **Passo 6: o botão em `web/index.html`**

Acrescentar logo antes de `<span id="estado">`, na linha 405:

```html
    <button id="procurar" type="button" hidden>🤖 procurar o robô</button>
```

- [ ] **Passo 7: o gesto em `web/app.js`**

Junto dos outros `getElementById` do topo:

```js
  var btProcurar = document.getElementById('procurar');
```

E perto de onde `podeBaixar` é decidido, o mesmo teste de capacidade:

```js
  /* Só dentro do app: no navegador não há como entrar na rede do robô, e um
     botão que não faz nada é pior que botão nenhum. */
  if (typeof Android !== 'undefined' && Android.temApp) {
    btProcurar.hidden = false;
    btProcurar.onclick = function () {
      spEstado.textContent = 'procurando o robô…';
      Android.procurarRobo();
    };
  }
```

- [ ] **Passo 8: rodar e ver passar**

Rodar: `node --test tests/`
Esperado: tudo passa.

- [ ] **Passo 9: A PROVA — no aparelho, com a placa ligada**

```bash
./android/preparar_assets.sh
cd android && ./gradlew installDebug
```

Com a ESP32 ligada e o `Robo-01` no ar, e **com dados móveis ligados de
propósito** — é esse o caso que quebra:

1. Abrir o app. Tocar em **🤖 procurar o robô**.
2. Esperado: o Android abre o diálogo dele, listando `Robo-01`. Tocar.
3. Esperado: o cabeçalho vira `parado` e o `▶ PLAY` habilita.
4. Montar `andar frente 1s` e apertar PLAY. **Esperado: o robô anda.**
5. Tocar em `👁 distância cm`. Esperado: a bolha mostra a leitura do HC-SR04.

**Registre o resultado no README**, na mesma seção "Onde o hardware foi provado,
e onde não foi" que já existe. Se o passo 3 não acontecer com dados móveis
ligados mas acontecer com eles desligados, o `bindProcessToNetwork` não alcançou
o WebView: **pare, e volte ao desenho.**

- [ ] **Passo 10: commit**

```bash
git add android web/index.html web/app.js tests/app_botao.test.js README.md
git commit -m "Um toque acha o robô, e o Android desenha a lista"
git push
```

---

### Tarefa 5: O `.ino` volta a baixar

`web/app.js:704` monta um `Blob` e clica num `a[download]`. Num WebView isso não
faz nada: `blob:` nem chega ao `DownloadListener`. O texto tem que atravessar
para o Kotlin.

**Arquivos:**
- Modificar: `android/app/src/main/java/br/educacaocriativa/roboblocos/PonteJs.kt`
- Criar: `android/app/src/main/java/br/educacaocriativa/roboblocos/Arquivos.kt`
- Modificar: `web/app.js:674-713`
- Modificar: `tests/app_botao.test.js`

**Interfaces:**
- Consome: `PonteJs` da tarefa 4.
- Produz: `PonteJs.salvarIno(texto: String): String` — devolve o nome do arquivo
  salvo, ou string vazia se falhou.

- [ ] **Passo 1: acrescentar o teste em `tests/app_botao.test.js`**

```js
test('dentro do app, o download passa pelo Kotlin e não pelo Blob', () => {
  assert.match(APP, /Android\.salvarIno\(/);
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `node --test tests/app_botao.test.js`
Esperado: FALHA no teste novo.

- [ ] **Passo 3: `Arquivos.kt`**

```kotlin
package br.educacaocriativa.roboblocos

import android.content.ContentValues
import android.content.Context
import android.os.Environment
import android.provider.MediaStore

object Arquivos {
    /* MediaStore, e não um caminho: a partir do Android 10 o app não escreve
       em Downloads por caminho, e é justamente o minSdk deste projeto. */
    fun salvarEmDownloads(ctx: Context, nome: String, texto: String): String {
        val valores = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, nome)
            put(MediaStore.Downloads.MIME_TYPE, "text/plain")
            put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
        }
        val destino = ctx.contentResolver.insert(
            MediaStore.Downloads.EXTERNAL_CONTENT_URI, valores) ?: return ""
        ctx.contentResolver.openOutputStream(destino)?.use {
            it.write(texto.toByteArray(Charsets.UTF_8))
        } ?: return ""
        return nome
    }
}
```

- [ ] **Passo 4: expor em `PonteJs.kt`**

```kotlin
    @JavascriptInterface
    fun salvarIno(texto: String): String =
        Arquivos.salvarEmDownloads(tela, "robo.ino", texto)
```

- [ ] **Passo 5: usar em `web/app.js`**

No lugar do corpo do `onclick` do `codigo-baixar` (hoje em `web/app.js:704-712`),
pôr o desvio antes do caminho do `Blob`, deixando o caminho do navegador
intocado:

```js
      /* Dentro do app o Blob não vira arquivo: blob: nem chega no
         DownloadListener do WebView. O texto atravessa para o Kotlin, que
         escreve em Downloads pelo MediaStore. */
      if (typeof Android !== 'undefined' && Android.salvarIno) {
        var nome = Android.salvarIno(preCodigo.textContent);
        spEstado.textContent = nome ? 'salvo em Downloads/' + nome
                                    : 'não deu para salvar';
        return;
      }
```

E, no mesmo bloco onde `podeBaixar` decide se o botão aparece, tratar o app como
podendo baixar:

```js
  var podeBaixar = (typeof Android !== 'undefined' && Android.salvarIno) ||
    (typeof Blob !== 'undefined' && 'download' in document.createElement('a'));
```

- [ ] **Passo 6: rodar e ver passar**

Rodar: `node --test tests/`
Esperado: tudo passa, incluindo o `tests/arduino.test.js`, que compila o `.ino`
de verdade e prova que o conteúdo não mudou.

- [ ] **Passo 7: provar no aparelho**

Abrir o app, `{ } ver código`, **baixar**. Esperado: o cabeçalho diz
`salvo em Downloads/robo.ino`, e o arquivo abre no gerenciador de arquivos.

- [ ] **Passo 8: commit**

```bash
git add android web/app.js tests/app_botao.test.js
git commit -m "Faz o robo.ino sair do app e cair em Downloads"
git push
```

**Fim da etapa 1.** O app dirige o robô de verdade.

---

### Tarefa 6: O robô virtual racha em laço testável e casca de stdio

Hoje o laço do robô virtual está preso ao stdin e ao stdout dentro de
`host/main.c`. Para o Android chamar o mesmo laço, ele precisa virar uma
biblioteca que recebe linha e devolve linha, sem saber de onde vêm nem para
onde vão.

Nada de comportamento muda nesta tarefa, e há uma rede de segurança para provar
isso: `tests/host_test.sh`, o teste dourado de ponta a ponta, tem que continuar
passando **sem uma alteração sequer**.

**Arquivos:**
- Criar: `host/laco.h`, `host/laco.c`
- Criar: `host/relogio.c`
- Modificar: `host/main.c` (encolhe para a casca de stdio)
- Modificar: `host/hal_sim.c` (perde `hal_millis` e `hal_report`)
- Modificar: `host/Makefile`
- Criar: `tests/laco_test.c`, `tests/relogio_falso.c`, `tests/relogio_falso.h`
- Modificar: `tests/Makefile`
- Modificar: `.gitignore`

**Interfaces:**
- Consome: `core/vm.h`, `host/physics.h`, `core/hal.h` — todos como estão.
- Produz, em `host/laco.h`:
  - `void laco_init(void)`
  - `void laco_linha(const char *l)` — uma linha recebida: `"L <hex>"`,
    `"A <mm...>"`, `"R"`, `"S"`.
  - `void laco_passo(void)` — avança `FRAME_MS` e enfileira as linhas de saída.
    Não dorme.
  - `int laco_proxima_saida(char *dest, int tam)` — tira a próxima linha da
    fila, sem `\n`. Devolve 1 se tirou, 0 se a fila está vazia.
  - `#define LACO_FRAME_MS 5`

- [ ] **Passo 1: escrever o teste que falha — `tests/laco_test.c`**

```c
#include <stdio.h>
#include <string.h>
#include "laco.h"
#include "relogio_falso.h"

static int falhas;

#define CHECK(cond)                                                        \
    do {                                                                   \
        if (!(cond)) {                                                     \
            printf("  FALHOU %s:%d  %s\n", __FILE__, __LINE__, #cond);     \
            falhas++;                                                      \
        }                                                                  \
    } while (0)

/* O mesmo programa dourado do tests/host_test.sh, encurtado: anda 1 s e para.
   Sete bytes por instrução, little-endian. */
static const char *PROG_ANDAR =
    "08c80000000000"   /* PUSH 200          */
    "08c80000000000"   /* PUSH 200          */
    "01000000000000"   /* MOTOR             */
    "08e80300000000"   /* PUSH 1000         */
    "02000000000000"   /* WAIT              */
    "08000000000000"   /* PUSH 0            */
    "08000000000000"   /* PUSH 0            */
    "01000000000000"   /* MOTOR             */
    "00000000000000";  /* HALT              */

/* Roda o laço n vezes, avançando o relógio FRAME_MS por vez, e junta tudo o
   que saiu num buffer só. */
static void rodar(char *saida, size_t tam, int n) {
    saida[0] = '\0';
    char linha[128];
    for (int k = 0; k < n; k++) {
        laco_passo();
        while (laco_proxima_saida(linha, sizeof(linha))) {
            if (strlen(saida) + strlen(linha) + 2 < tam) {
                strcat(saida, linha);
                strcat(saida, "\n");
            }
        }
        relogio_avancar(LACO_FRAME_MS);
    }
}

int main(void) {
    char saida[65536];
    char linha[128];

    printf("laco_test\n");

    /* Sem programa e sem RUN, o laço só emite telemetria. */
    relogio_set(1000);
    laco_init();
    rodar(saida, sizeof(saida), 40);
    CHECK(strstr(saida, "\nT ") != NULL || strncmp(saida, "T ", 2) == 0);
    CHECK(strstr(saida, "E 1") == NULL);

    /* Com programa e RUN: anuncia que começou, reporta pc, anda e termina. */
    relogio_set(1000);
    laco_init();
    char carga[512];
    snprintf(carga, sizeof(carga), "L %s", PROG_ANDAR);
    laco_linha(carga);
    laco_linha("R");
    rodar(saida, sizeof(saida), 600);
    CHECK(strstr(saida, "E 1") != NULL);
    CHECK(strstr(saida, "P ")  != NULL);
    CHECK(strstr(saida, "E 0") != NULL);

    /* O robô saiu do lugar: alguma linha T traz y diferente do primeiro. */
    CHECK(strstr(saida, "T ") != NULL);

    /* STOP no meio para a VM. */
    relogio_set(1000);
    laco_init();
    laco_linha(carga);
    laco_linha("R");
    rodar(saida, sizeof(saida), 20);
    laco_linha("S");
    rodar(saida, sizeof(saida), 20);
    CHECK(strstr(saida, "E 0") != NULL);

    /* A fila vazia devolve 0, e não lixo. */
    CHECK(laco_proxima_saida(linha, sizeof(linha)) == 0);

    if (falhas == 0) printf("  todos os testes passaram\n");
    return falhas != 0;
}
```

- [ ] **Passo 2: `tests/relogio_falso.h` e `tests/relogio_falso.c`**

O `tests/fake_hal.c` que já existe finge o HAL inteiro, e aqui a física e os
motores precisam ser os de verdade — é o laço que está em teste. Só o relógio é
falso.

```c
/* tests/relogio_falso.h */
#ifndef RELOGIO_FALSO_H
#define RELOGIO_FALSO_H
#include <stdint.h>
void relogio_set(uint32_t ms);
void relogio_avancar(uint32_t ms);
#endif
```

```c
/* tests/relogio_falso.c */
#include "hal.h"
#include "relogio_falso.h"

static uint32_t agora;

void relogio_set(uint32_t ms)     { agora = ms; }
void relogio_avancar(uint32_t ms) { agora += ms; }
uint32_t hal_millis(void)         { return agora; }
```

- [ ] **Passo 3: rodar e ver falhar**

Acrescentar ao `tests/Makefile`:

```make
test: vm_test physics_test quadros_test laco_test
	./vm_test
	./physics_test
	./quadros_test
	./laco_test

laco_test: laco_test.c relogio_falso.c ../host/laco.c ../host/hal_sim.c \
           ../host/physics.c ../core/vm.c
	$(CC) $(CFLAGS) -o $@ $^ $(LDLIBS)
```

E acrescentar `laco_test` ao `clean`.

Rodar: `make -C tests laco_test`
Esperado: FALHA — `laco.h: No such file or directory`.

- [ ] **Passo 4: `host/laco.h`**

```c
#ifndef LACO_H
#define LACO_H

#include <stdint.h>

/* O robô virtual sem casca. Recebe linhas do protocolo de texto e devolve
   linhas do protocolo de texto, e não sabe se do outro lado tem um stdin, um
   WebSocket ou um WebView. É o que o host/main.c era por dentro, tirado de
   cima do stdio para o app Android poder chamar a mesma coisa. */

#define LACO_FRAME_MS 5

#ifdef __cplusplus
extern "C" {
#endif

void laco_init(void);

/* Uma linha recebida: "L <hex>", "A <mm ...>", "R" ou "S". Sem o \n. */
void laco_linha(const char *l);

/* Avança o mundo em LACO_FRAME_MS e enfileira o que houver para dizer.
   Nunca dorme e nunca bloqueia: quem controla o compasso é o chamador. */
void laco_passo(void);

/* Tira a próxima linha da fila, sem \n. Devolve 1 se tirou, 0 se acabou. */
int laco_proxima_saida(char *dest, int tam);

#ifdef __cplusplus
}
#endif

#endif
```

- [ ] **Passo 5: `host/laco.c`**

É o miolo de `host/main.c` movido inteiro, com três diferenças: `printf` vira
`enfileirar`, `ler_stdin` sai, e `hal_report` passa a morar aqui.

```c
#include <math.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>

#include "hal.h"
#include "laco.h"
#include "physics.h"
#include "vm.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#define TELEM_MS        50
#define PC_MIN_MS       30
#define MAX_INSTR_FRAME 256

#define MAX_SAIDA  64
#define TAM_LINHA  64

static VM       vm;
static uint8_t  prog_bytes[MAX_INSTR * INSTR_BYTES];
/* A instrução que está em efeito agora, que não é a mesma que vm.pc: depois
   de executar um TURN, vm.pc já aponta para a instrução seguinte enquanto o
   robô ainda está girando. É esta que o navegador traduz em bloco aceso. */
static uint16_t pc_exec      = 0;
static uint16_t pc_enviado   = 0xFFFF;
static uint32_t pc_ultimo_ms = 0;
static uint8_t  rodando_ant  = 0;
static uint32_t telem_ultimo = 0;

static char fila[MAX_SAIDA][TAM_LINHA];
static int  fila_ini, fila_n;

/* Fila cheia descarta a linha nova, e não a velha: a antiga já é um fato que
   o outro lado precisa ver na ordem. Com um consumidor que drena a cada passo
   ela não enche — 64 linhas é folga de mais de um segundo. */
static void enfileirar(const char *fmt, ...) {
    if (fila_n >= MAX_SAIDA) return;
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(fila[(fila_ini + fila_n) % MAX_SAIDA], TAM_LINHA, fmt, ap);
    va_end(ap);
    fila_n++;
}

/* Relatar é ato de protocolo, e não de hardware — o mesmo motivo pelo qual
   ele mora no firmware/src/main.cpp e não no hal_esp32.cpp. */
void hal_report(int32_t valor) {
    enfileirar("V %d", (int)valor);
}

static int hex_nib(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

void laco_linha(const char *l) {
    if (l == NULL || l[0] == '\0') return;
    if (l[0] == 'L') {
        const char *h = l + 1;
        while (*h == ' ') h++;
        size_t len = strlen(h);
        if (len % 2 != 0 || len / 2 > sizeof(prog_bytes)) return;
        for (size_t i = 0; i < len / 2; i++) {
            int hi = hex_nib(h[2 * i]), lo = hex_nib(h[2 * i + 1]);
            if (hi < 0 || lo < 0) return;
            prog_bytes[i] = (uint8_t)((hi << 4) | lo);
        }
        vm_load(&vm, prog_bytes, (uint16_t)(len / 2));
        pc_enviado = 0xFFFF;
    } else if (l[0] == 'A') {
        /* A <x_mm> <y_mm> <theta_decigraus> <n> <x0 y0 x1 y1>*n — a fase.
           Tudo em milímetros: inteiro atravessa o protocolo sem arredondar
           diferente dos dois lados. */
        int n = 0, lidos = 0;
        const char *p = l + 1;
        long v[4 + MAX_OBSTACULOS * 4];
        while (lidos < (int)(sizeof(v) / sizeof(v[0]))) {
            char *fim;
            long x = strtol(p, &fim, 10);
            if (fim == p) break;
            v[lidos++] = x;
            p = fim;
        }
        if (lidos < 4) return;
        double px = v[0] / 1000.0, py = v[1] / 1000.0;
        double pt = (v[2] / 10.0) * M_PI / 180.0;
        n = (int)v[3];
        if (n < 0) n = 0;
        if (n > MAX_OBSTACULOS) n = MAX_OBSTACULOS;
        if (lidos < 4 + n * 4) return;      /* mensagem cortada: ignora inteira */
        FisRect r[MAX_OBSTACULOS];
        for (int i = 0; i < n; i++) {
            r[i].x0 = v[4 + i * 4 + 0] / 1000.0;
            r[i].y0 = v[4 + i * 4 + 1] / 1000.0;
            r[i].x1 = v[4 + i * 4 + 2] / 1000.0;
            r[i].y1 = v[4 + i * 4 + 3] / 1000.0;
        }
        fis_definir_arena(px, py, pt, r, n);
        fis_init();
    } else if (l[0] == 'R') {
        fis_init();
        vm_run(&vm);
        pc_exec    = 0;
        pc_enviado = 0xFFFF;
    } else if (l[0] == 'S') {
        vm_stop(&vm);
    }
}

static void emitir_pc(uint32_t agora) {
    if (pc_exec == pc_enviado) return;
    if (agora - pc_ultimo_ms < PC_MIN_MS) return;
    pc_enviado   = pc_exec;
    pc_ultimo_ms = agora;
    enfileirar("P %u", (unsigned)pc_exec);
}

static void emitir_telem(void) {
    double x, y, th;
    fis_pose(&x, &y, &th);
    double graus = th * 180.0 / M_PI;
    if (graus < 0.0) graus += 360.0;
    enfileirar("T %d %d %d %u %d",
               (int)(x * 1000.0 + 0.5),
               (int)(y * 1000.0 + 0.5),
               (int)(graus * 10.0 + 0.5),
               (unsigned)fis_distancia_cm(),
               fis_colidiu());
}

void laco_init(void) {
    fila_ini = 0;
    fila_n   = 0;
    pc_exec      = 0;
    pc_enviado   = 0xFFFF;
    pc_ultimo_ms = 0;
    rodando_ant  = 0;
    telem_ultimo = 0;
    vm_init(&vm);
    fis_init();
}

void laco_passo(void) {
    uint32_t agora = hal_millis();

    /* vm_tick precisa ser chamada mesmo durante um WAIT: ela já devolve sem
       executar instrução, mas é ela que alimenta o ultimo_tick do watchdog.
       Pular a chamada faria a espera matar a própria VM. */
    for (int k = 0; k < MAX_INSTR_FRAME && vm.rodando; k++) {
        uint16_t antes  = vm.pc;
        uint8_t  rodava = vm.rodando;
        vm_tick(&vm);
        /* Executou de fato? O tick não faz nada quando ainda está esperando,
           e aí a instrução em efeito continua a mesma. */
        if (vm.pc != antes || (rodava && !vm.rodando)) pc_exec = antes;
        if (vm_esperando(&vm, hal_millis())) break;
    }
    emitir_pc(agora);

    fis_passo(LACO_FRAME_MS / 1000.0);
    vm_watchdog_check(&vm, agora);

    if (vm.rodando != rodando_ant) {
        rodando_ant = vm.rodando;
        enfileirar("E %u", (unsigned)vm.rodando);
    }

    if (agora - telem_ultimo >= TELEM_MS) {
        telem_ultimo = agora;
        emitir_telem();
    }
}

int laco_proxima_saida(char *dest, int tam) {
    if (fila_n == 0 || tam <= 0) return 0;
    snprintf(dest, (size_t)tam, "%s", fila[fila_ini]);
    fila_ini = (fila_ini + 1) % MAX_SAIDA;
    fila_n--;
    return 1;
}
```

- [ ] **Passo 6: `host/relogio.c`, e `host/hal_sim.c` encolhe**

O relógio sai do `hal_sim.c` para o `tests/laco_test` poder ter o seu sem
símbolo duplicado.

```c
/* host/relogio.c */
#include <time.h>
#include "hal.h"

uint32_t hal_millis(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint32_t)((uint64_t)ts.tv_sec * 1000u + (uint64_t)ts.tv_nsec / 1000000u);
}
```

`host/hal_sim.c` passa a ser, inteiro:

```c
#include "hal.h"
#include "physics.h"

void hal_motors(int16_t esq, int16_t dir) {
    fis_set_motores(esq, dir);
}

uint16_t hal_distancia_cm(void) {
    return fis_distancia_cm();
}
```

- [ ] **Passo 7: `host/main.c` vira a casca de stdio**

```c
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#include "hal.h"
#include "laco.h"

/* Devolve 0 quando a entrada fechou — aí o robô virtual não tem mais com quem
   falar e o processo termina. Sem isso ele giraria para sempre. */
static int ler_stdin(void) {
    static char   buf[8192];
    static size_t usado = 0;
    ssize_t n;

    while ((n = read(0, buf + usado, sizeof(buf) - usado - 1)) != 0) {
        if (n < 0) break;                          /* nada disponível agora */
        usado += (size_t)n;
        char *nl;
        while ((nl = memchr(buf, '\n', usado)) != NULL) {
            *nl = '\0';
            laco_linha(buf);
            size_t resto = usado - (size_t)(nl - buf) - 1;
            memmove(buf, nl + 1, resto);
            usado = resto;
        }
        if (usado >= sizeof(buf) - 1) usado = 0;   /* linha absurda: descarta */
    }
    return n != 0;
}

int main(void) {
    fcntl(0, F_SETFL, O_NONBLOCK);
    setvbuf(stdout, NULL, _IOLBF, 0);
    laco_init();

    char linha[128];
    for (;;) {
        if (!ler_stdin()) { laco_linha("S"); return 0; }
        laco_passo();
        while (laco_proxima_saida(linha, sizeof(linha))) puts(linha);
        struct timespec ts = { 0, LACO_FRAME_MS * 1000000L };
        nanosleep(&ts, NULL);
    }
}
```

- [ ] **Passo 8: `host/Makefile`**

```make
robo_host: main.c laco.c hal_sim.c relogio.c physics.c ../core/vm.c
	$(CC) $(CFLAGS) -o $@ $^ $(LDLIBS)
```

- [ ] **Passo 9: rodar e ver passar — inclusive o teste dourado**

```bash
make -C tests test
./tests/host_test.sh
node --test tests/
```

Esperado: `laco_test` passa; `host_test.sh` diz `todos os testes passaram`, com
as mesmas nove verificações de sempre; `node --test` passa. **O `host_test.sh`
não pode ter sido alterado** — é ele que prova que a refatoração não mudou
comportamento nenhum.

- [ ] **Passo 10: `.gitignore` e commit**

Acrescentar `tests/laco_test` ao `.gitignore`.

```bash
git add host tests .gitignore
git commit -m "Tira o robô virtual de cima do stdio, para ele caber num app"
git push
```

---

### Tarefa 7: A VM nativa no NDK

O mesmo C das tarefas anteriores, compilado para ARM e chamado do Kotlin.

**Arquivos:**
- Criar: `android/app/src/main/cpp/CMakeLists.txt`
- Criar: `android/app/src/main/cpp/ponte.c`
- Criar: `android/app/src/main/java/br/educacaocriativa/roboblocos/Vm.kt`
- Criar: `android/app/src/androidTest/java/br/educacaocriativa/roboblocos/VmTest.kt`
- Modificar: `android/app/build.gradle.kts`

**Interfaces:**
- Consome: `host/laco.h` da tarefa 6.
- Produz, em Kotlin:
  - `Vm.iniciar()`
  - `Vm.linha(l: String)`
  - `Vm.passo()`
  - `Vm.proximaSaida(): String?` — `null` quando a fila esvaziou.
  - `Vm.FRAME_MS: Long` = 5

- [ ] **Passo 1: `CMakeLists.txt`**

```cmake
cmake_minimum_required(VERSION 3.22)
project(robo C)

set(RAIZ ${CMAKE_CURRENT_SOURCE_DIR}/../../../../..)

# O mesmo C que roda na mesa e na ESP32. Nenhum arquivo daqui é cópia:
# são os originais, compilados para um terceiro alvo.
add_library(robo SHARED
    ponte.c
    ${RAIZ}/core/vm.c
    ${RAIZ}/host/laco.c
    ${RAIZ}/host/hal_sim.c
    ${RAIZ}/host/relogio.c
    ${RAIZ}/host/physics.c
)

target_include_directories(robo PRIVATE ${RAIZ}/core ${RAIZ}/host)
target_compile_options(robo PRIVATE -std=gnu11 -Wall -Wextra -Werror -O2)
target_link_libraries(robo m)
```

- [ ] **Passo 2: `ponte.c`**

```c
#include <jni.h>
#include <string.h>

#include "laco.h"

/* Uma VM só, estática, como na ESP32 — e ao contrário do bridge/server.js, que
   sobe um processo por conexão. Aqui há um robô e uma criança. */

JNIEXPORT void JNICALL
Java_br_educacaocriativa_roboblocos_Vm_iniciarNativo(JNIEnv *e, jobject o) {
    (void)e; (void)o;
    laco_init();
}

JNIEXPORT void JNICALL
Java_br_educacaocriativa_roboblocos_Vm_linhaNativa(JNIEnv *e, jobject o,
                                                   jstring l) {
    (void)o;
    const char *s = (*e)->GetStringUTFChars(e, l, NULL);
    if (s == NULL) return;
    laco_linha(s);
    (*e)->ReleaseStringUTFChars(e, l, s);
}

JNIEXPORT void JNICALL
Java_br_educacaocriativa_roboblocos_Vm_passoNativo(JNIEnv *e, jobject o) {
    (void)e; (void)o;
    laco_passo();
}

JNIEXPORT jstring JNICALL
Java_br_educacaocriativa_roboblocos_Vm_proximaSaidaNativa(JNIEnv *e, jobject o) {
    (void)o;
    char linha[128];
    if (!laco_proxima_saida(linha, (int)sizeof(linha))) return NULL;
    return (*e)->NewStringUTF(e, linha);
}
```

- [ ] **Passo 3: `Vm.kt`**

```kotlin
package br.educacaocriativa.roboblocos

/* O robô virtual, o mesmo core/vm.c que roda na ESP32, compilado para o
   aparelho. Só uma thread pode tocar aqui: a VM é uma só e não tem trava. */
object Vm {
    const val FRAME_MS = 5L

    init { System.loadLibrary("robo") }

    fun iniciar() = iniciarNativo()
    fun linha(l: String) = linhaNativa(l)
    fun passo() = passoNativo()
    fun proximaSaida(): String? = proximaSaidaNativa()

    private external fun iniciarNativo()
    private external fun linhaNativa(l: String)
    private external fun passoNativo()
    private external fun proximaSaidaNativa(): String?
}
```

- [ ] **Passo 4: ligar o CMake no `android/app/build.gradle.kts`**

Dentro do bloco `android { }`:

```kotlin
    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }
    defaultConfig {
        // ... o que já está lá ...
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64") }
    }
```

E nas dependências:

```kotlin
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.1")
```

Mais, no `defaultConfig`:

```kotlin
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
```

- [ ] **Passo 5: o teste instrumentado — `VmTest.kt`**

Roda no aparelho, que é onde o `.so` existe.

```kotlin
package br.educacaocriativa.roboblocos

import org.junit.Assert.assertTrue
import org.junit.Test

class VmTest {

    /* O mesmo programa curto do tests/laco_test.c: anda 1 s e para. */
    private val PROG_ANDAR =
        "08c80000000000" + "08c80000000000" + "01000000000000" +
        "08e80300000000" + "02000000000000" + "08000000000000" +
        "08000000000000" + "01000000000000" + "00000000000000"

    @Test fun andaEDepoisPara() {
        Vm.iniciar()
        Vm.linha("L $PROG_ANDAR")
        Vm.linha("R")

        val saida = StringBuilder()
        repeat(600) {
            Vm.passo()
            while (true) { saida.append(Vm.proximaSaida() ?: break).append('\n') }
            Thread.sleep(Vm.FRAME_MS)
        }

        val texto = saida.toString()
        assertTrue("nunca anunciou que começou", texto.contains("E 1"))
        assertTrue("nunca reportou pc", texto.contains("\nP "))
        assertTrue("nunca terminou", texto.contains("E 0"))

        /* Saiu do lugar: o y da telemetria muda. Se a física não estivesse
           ligada, todo T viria igual. */
        val ys = Regex("""^T (-?\d+) (-?\d+) """, RegexOption.MULTILINE)
            .findAll(texto).map { it.groupValues[2].toInt() }.toSet()
        assertTrue("robô não saiu do lugar: $ys", ys.size > 3)
    }
}
```

- [ ] **Passo 6: rodar e ver passar**

```bash
cd android && ./gradlew connectedDebugAndroidTest
```

Esperado: PASSA. Se falhar a compilação nativa com `Werror`, conserte no C — os
mesmos arquivos compilam com `-Wall -Wextra -Werror` no `host/Makefile`, então
um aviso novo é do clang do NDK e vale corrigir para os três alvos.

- [ ] **Passo 7: commit**

```bash
git add android
git commit -m "Leva o robô virtual para dentro do aparelho, no mesmo C de sempre"
git push
```

---

### Tarefa 8: O servidor WebSocket local

Uma porta do `bridge/server.js` para Kotlin: mesmo aperto de mão, mesmo
enquadramento, mesma tradução binário ↔ texto. Com isso o `web/` fala com o
simulador do app exatamente como fala com o bridge — sem saber a diferença.

**Arquivos:**
- Criar: `android/app/src/main/java/br/educacaocriativa/roboblocos/Traducao.kt`
- Criar: `android/app/src/main/java/br/educacaocriativa/roboblocos/Quadros.kt`
- Criar: `android/app/src/main/java/br/educacaocriativa/roboblocos/ServidorLocal.kt`
- Criar: `android/app/src/test/java/br/educacaocriativa/roboblocos/TraducaoTest.kt`
- Modificar: `MainActivity.kt`

**Interfaces:**
- Consome: `Vm` da tarefa 7.
- Produz:
  - `Traducao.paraLinhaDoRobo(carga: ByteArray): String?`
  - `Traducao.paraQuadroDoNavegador(linha: String): ByteArray?`
  - `Quadros.montar(carga: ByteArray, opcode: Int = 0x2): ByteArray`
  - `ServidorLocal.iniciar(): Int` — devolve a porta escolhida.
  - `ServidorLocal.parar()`

- [ ] **Passo 1: escrever o teste que falha — `TraducaoTest.kt`**

Espelha `tests/bridge.test.js`, que é o teste do original.

```kotlin
package br.educacaocriativa.roboblocos

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TraducaoTest {

    @Test fun loadViraLinhaLEmHex() {
        val c = ByteArray(3 + 7)
        c[0] = 0x01
        c[1] = 1; c[2] = 0                      // 1 instrução, little-endian
        assertEquals("L 00000000000000", Traducao.paraLinhaDoRobo(c))
    }

    @Test fun loadComTamanhoInconsistenteEDescartado() {
        val c = ByteArray(3 + 7)
        c[0] = 0x01
        c[1] = 5; c[2] = 0                      // diz 5 instruções, traz 1
        assertNull(Traducao.paraLinhaDoRobo(c))
    }

    @Test fun arenaViraLinhaAEmMilimetros() {
        val c = ByteArray(8)
        c[0] = 0x04
        c[1] = (1000 and 0xFF).toByte(); c[2] = (1000 shr 8).toByte()
        c[3] = (400 and 0xFF).toByte();  c[4] = (400 shr 8).toByte()
        c[5] = (900 and 0xFF).toByte();  c[6] = (900 shr 8).toByte()
        c[7] = 0                                 // zero obstáculos
        assertEquals("A 1000 400 900 0", Traducao.paraLinhaDoRobo(c))
    }

    @Test fun runEStopSaoUmaLetra() {
        assertEquals("R", Traducao.paraLinhaDoRobo(byteArrayOf(0x02)))
        assertEquals("S", Traducao.paraLinhaDoRobo(byteArrayOf(0x03)))
    }

    @Test fun quadroDesconhecidoEDescartado() {
        assertNull(Traducao.paraLinhaDoRobo(byteArrayOf(0x7F)))
        assertNull(Traducao.paraLinhaDoRobo(ByteArray(0)))
    }

    @Test fun pcViraQuadro81ComUint16() {
        assertArrayEquals(
            byteArrayOf(0x81.toByte(), 11, 0),
            Traducao.paraQuadroDoNavegador("P 11"))
    }

    @Test fun estadoViraQuadro82() {
        assertArrayEquals(
            byteArrayOf(0x82.toByte(), 1),
            Traducao.paraQuadroDoNavegador("E 1"))
    }

    @Test fun telemetriaViraQuadro83ComDezBytes() {
        val q = Traducao.paraQuadroDoNavegador("T 1000 400 900 25 0")!!
        assertEquals(10, q.size)
        assertEquals(0x83.toByte(), q[0])
        assertEquals(0, q[9])
    }

    /* int32, e não int16 como os outros campos: a pilha da VM é de 32 bits, e
       uma conta da criança chega lá — 100 × 100 já não caberia. */
    @Test fun valorViraQuadro84ComInt32() {
        val q = Traducao.paraQuadroDoNavegador("V 10000")!!
        assertEquals(5, q.size)
        assertEquals(0x84.toByte(), q[0])
        assertEquals(10000, (q[1].toInt() and 0xFF) or
                            ((q[2].toInt() and 0xFF) shl 8) or
                            ((q[3].toInt() and 0xFF) shl 16) or
                            ((q[4].toInt() and 0xFF) shl 24))
    }

    @Test fun linhaDesconhecidaEDescartada() {
        assertNull(Traducao.paraQuadroDoNavegador("Z 1"))
    }

    @Test fun quadroPequenoNaoLevaTamanhoEstendido() {
        val q = Quadros.montar(byteArrayOf(1, 2, 3))
        assertArrayEquals(byteArrayOf(0x82.toByte(), 3, 1, 2, 3), q)
    }

    @Test fun quadroGrandeUsaTamanhoDeDoisBytes() {
        val q = Quadros.montar(ByteArray(200))
        assertEquals(0x82.toByte(), q[0])
        assertEquals(126, q[1].toInt())
        assertEquals(200, (q[2].toInt() shl 8) or q[3].toInt())
        assertEquals(4 + 200, q.size)
    }
}
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `cd android && ./gradlew testDebugUnitTest`
Esperado: FALHA na compilação — `Traducao` e `Quadros` não existem.

- [ ] **Passo 3: `Traducao.kt`**

```kotlin
package br.educacaocriativa.roboblocos

/* A mesma tradução do bridge/server.js, e é de propósito que ela seja igual:
   o protocolo tem uma definição só, e o web/rede.js não sabe se do outro lado
   está o Node da mesa, esta classe ou a ESP32. */
object Traducao {
    private const val T_LOAD = 0x01
    private const val T_RUN = 0x02
    private const val T_STOP = 0x03
    private const val T_ARENA = 0x04
    private const val T_PC = 0x81
    private const val T_STATE = 0x82
    private const val T_TELEM = 0x83
    private const val T_VALOR = 0x84

    private fun u8(b: ByteArray, i: Int) = b[i].toInt() and 0xFF
    private fun u16(b: ByteArray, i: Int) = u8(b, i) or (u8(b, i + 1) shl 8)
    private fun i16(b: ByteArray, i: Int) = u16(b, i).toShort().toInt()

    fun paraLinhaDoRobo(carga: ByteArray): String? {
        if (carga.isEmpty()) return null
        return when (u8(carga, 0)) {
            T_LOAD -> {
                if (carga.size < 3) return null
                val n = u16(carga, 1)
                if (carga.size != 3 + n * 7) return null
                val hex = StringBuilder("L ")
                for (i in 3 until carga.size) {
                    hex.append("%02x".format(carga[i]))
                }
                hex.toString()
            }
            T_ARENA -> {
                /* 0x04 x(i16) y(i16) theta(i16) n(u8), depois n*4 int16, em mm. */
                if (carga.size < 8) return null
                val n = u8(carga, 7)
                if (carga.size != 8 + n * 8) return null
                val p = mutableListOf(i16(carga, 1), i16(carga, 3), i16(carga, 5), n)
                for (i in 0 until n * 4) p.add(i16(carga, 8 + i * 2))
                "A " + p.joinToString(" ")
            }
            T_RUN -> "R"
            T_STOP -> "S"
            else -> null
        }
    }

    fun paraQuadroDoNavegador(linha: String): ByteArray? {
        val p = linha.split(" ")
        return when (p[0]) {
            "P" -> {
                val v = p.getOrNull(1)?.toIntOrNull() ?: return null
                byteArrayOf(T_PC.toByte(), (v and 0xFF).toByte(),
                            ((v shr 8) and 0xFF).toByte())
            }
            "E" -> {
                val v = p.getOrNull(1)?.toIntOrNull() ?: return null
                byteArrayOf(T_STATE.toByte(), if (v != 0) 1 else 0)
            }
            "T" -> {
                if (p.size < 5) return null
                val q = ByteArray(10)
                q[0] = T_TELEM.toByte()
                for (k in 0 until 4) {
                    val v = p[k + 1].toIntOrNull() ?: return null
                    q[1 + k * 2] = (v and 0xFF).toByte()
                    q[2 + k * 2] = ((v shr 8) and 0xFF).toByte()
                }
                q[9] = if ((p.getOrNull(5)?.toIntOrNull() ?: 0) != 0) 1 else 0
                q
            }
            "V" -> {
                /* int32: a pilha da VM é de 32 bits, e uma conta da criança
                   chega lá. É o único campo do protocolo com essa largura. */
                val v = p.getOrNull(1)?.toIntOrNull() ?: return null
                byteArrayOf(T_VALOR.toByte(), (v and 0xFF).toByte(),
                            ((v shr 8) and 0xFF).toByte(),
                            ((v shr 16) and 0xFF).toByte(),
                            ((v shr 24) and 0xFF).toByte())
            }
            else -> null
        }
    }
}
```

- [ ] **Passo 4: `Quadros.kt`**

```kotlin
package br.educacaocriativa.roboblocos

import java.io.InputStream

/* Enquadramento do WebSocket, a mesma metade que o bridge/server.js
   implementa à mão: sem fragmentação e sem carga acima de 64 KB, porque este
   protocolo não usa nem uma coisa nem outra. */
object Quadros {

    fun montar(carga: ByteArray, opcode: Int = 0x2): ByteArray {
        val n = carga.size
        return if (n < 126) {
            ByteArray(2 + n).also {
                it[0] = (0x80 or opcode).toByte(); it[1] = n.toByte()
                carga.copyInto(it, 2)
            }
        } else {
            ByteArray(4 + n).also {
                it[0] = (0x80 or opcode).toByte(); it[1] = 126
                it[2] = ((n shr 8) and 0xFF).toByte(); it[3] = (n and 0xFF).toByte()
                carga.copyInto(it, 4)
            }
        }
    }

    /* Lê um quadro completo. Devolve null quando a conexão fechou ou quando
       veio algo que este servidor não trata. */
    fun ler(entrada: InputStream): ByteArray? {
        val cab = entrada.lerExato(2) ?: return null
        val fim = (cab[0].toInt() and 0x80) != 0
        val opcode = cab[0].toInt() and 0x0F
        val mascarado = (cab[1].toInt() and 0x80) != 0
        var tam = cab[1].toInt() and 0x7F

        if (tam == 126) {
            val ext = entrada.lerExato(2) ?: return null
            tam = ((ext[0].toInt() and 0xFF) shl 8) or (ext[1].toInt() and 0xFF)
        } else if (tam == 127) return null      // acima de 64 KB não é usado

        val mascara = if (mascarado) entrada.lerExato(4) ?: return null else null
        val carga = entrada.lerExato(tam) ?: return null
        if (mascara != null) {
            for (i in carga.indices) carga[i] = (carga[i].toInt() xor
                mascara[i % 4].toInt()).toByte()
        }
        if (opcode == 0x8) return null           // fechamento: acabou
        if (!fim) return null                    // não lidamos com fragmentação
        return if (opcode == 0x1 || opcode == 0x2) carga else ByteArray(0)
    }

    private fun InputStream.lerExato(n: Int): ByteArray? {
        val b = ByteArray(n)
        var lidos = 0
        while (lidos < n) {
            val k = read(b, lidos, n - lidos)
            if (k < 0) return null
            lidos += k
        }
        return b
    }
}
```

- [ ] **Passo 5: rodar e ver passar**

Rodar: `cd android && ./gradlew testDebugUnitTest`
Esperado: PASSA, 12 testes.

- [ ] **Passo 6: `ServidorLocal.kt`**

```kotlin
package br.educacaocriativa.roboblocos

import android.util.Base64
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import kotlin.concurrent.thread

/* O bridge/server.js dentro do app, sem a parte de servir arquivos: aqui os
   arquivos vêm dos assets. Só 127.0.0.1, e só um cliente por vez — há um robô
   e uma criança. */
class ServidorLocal {

    private var tomada: ServerSocket? = null
    private var vivo = false

    fun iniciar(): Int {
        val s = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
        tomada = s
        vivo = true
        thread(name = "servidor-local") {
            while (vivo) {
                val cliente = try { s.accept() } catch (e: Exception) { break }
                atender(cliente)
            }
        }
        return s.localPort
    }

    fun parar() {
        vivo = false
        try { tomada?.close() } catch (e: Exception) { }
        tomada = null
    }

    private fun atender(cliente: Socket) {
        cliente.tcpNoDelay = true
        val entrada = cliente.getInputStream()
        val saida = cliente.getOutputStream()

        val chave = lerAperto(entrada) ?: return cliente.close()
        saida.write(respostaDoAperto(chave).toByteArray(Charsets.US_ASCII))
        saida.flush()

        Vm.iniciar()

        /* Uma thread empurra o robô e escreve; a principal desta conexão lê.
           A VM não tem trava, e só esta thread a toca — laco_linha entra pela
           fila de comandos abaixo, na mesma thread. */
        val comandos = java.util.concurrent.ConcurrentLinkedQueue<String>()

        val motor = thread(name = "vm") {
            while (!cliente.isClosed) {
                while (true) Vm.linha(comandos.poll() ?: break)
                Vm.passo()
                while (true) {
                    val l = Vm.proximaSaida() ?: break
                    val q = Traducao.paraQuadroDoNavegador(l) ?: continue
                    try {
                        synchronized(saida) { saida.write(Quadros.montar(q)); saida.flush() }
                    } catch (e: Exception) { return@thread }
                }
                Thread.sleep(Vm.FRAME_MS)
            }
        }

        try {
            while (true) {
                val carga = Quadros.ler(entrada) ?: break
                if (carga.isEmpty()) continue
                Traducao.paraLinhaDoRobo(carga)?.let { comandos.add(it) }
            }
        } catch (e: Exception) {
            // conexão caiu; o finally limpa
        } finally {
            comandos.add("S")
            try { cliente.close() } catch (e: Exception) { }
            motor.join(500)
        }
    }

    private fun lerAperto(entrada: java.io.InputStream): String? {
        val cabecalho = StringBuilder()
        while (!cabecalho.endsWith("\r\n\r\n")) {
            val b = entrada.read()
            if (b < 0) return null
            cabecalho.append(b.toChar())
            if (cabecalho.length > 8192) return null
        }
        return Regex("Sec-WebSocket-Key: (.+)\r\n", RegexOption.IGNORE_CASE)
            .find(cabecalho)?.groupValues?.get(1)?.trim()
    }

    private fun respostaDoAperto(chave: String): String {
        val sha = MessageDigest.getInstance("SHA-1").digest((chave + GUID).toByteArray())
        val aceite = Base64.encodeToString(sha, Base64.NO_WRAP)
        return "HTTP/1.1 101 Switching Protocols\r\n" +
               "Upgrade: websocket\r\n" +
               "Connection: Upgrade\r\n" +
               "Sec-WebSocket-Accept: $aceite\r\n\r\n"
    }

    companion object {
        private const val GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
    }
}
```

- [ ] **Passo 7: ligar na `MainActivity`**

Trocar o `ALVO_INICIAL` provisório da tarefa 3 pelo servidor de verdade:

```kotlin
    private val servidor = ServidorLocal()
    private var alvoEnsaio = ""

    // em onCreate, ANTES do loadUrl:
    alvoEnsaio = "127.0.0.1:" + servidor.iniciar()

    // e o onPageFinished passa a chamar:
    irPara(alvoEnsaio)

    override fun onDestroy() {
        redeDoRobo.soltar()
        servidor.parar()
        super.onDestroy()
    }
```

E, na tarefa 4, o `aoCair` volta para `alvoEnsaio` em vez de `ALVO_INICIAL`.
Tirar também o IP da máquina de desenvolvimento do `res/xml/rede_permitida.xml`,
se ele foi acrescentado na tarefa 3.

- [ ] **Passo 8: provar no aparelho, com o Wi-Fi desligado**

```bash
./android/preparar_assets.sh
cd android && ./gradlew installDebug
```

Com o **Wi-Fi e os dados móveis desligados** — é assim que o app vai ser usado
na sala:

1. Abrir. Esperado: o cabeçalho vira `parado` sozinho, sem nenhum toque.
2. Montar `repetir 4 { andar frente 1s; girar direita }` e apertar PLAY.
   Esperado: o robô da arena desenha um quadrado, os blocos acendem em sequência.
3. Tocar em `👁 distância cm`. Esperado: a bolha mostra a distância da parede
   simulada.
4. Trocar de nível, arrastar blocos, apertar PARAR. Esperado: tudo como no
   navegador.

- [ ] **Passo 9: commit**

```bash
git add android
git commit -m "Põe o bridge dentro do app: o ensaio funciona sem rede nenhuma"
git push
```

---

### Tarefa 9: O botão vira uma escolha — ensaio ou robô

Agora que os dois existem, a tela precisa dizer em qual dos dois está e deixar
voltar. É a tela "não estamos no wifi do robô" completa.

**Arquivos:**
- Modificar: `web/index.html` (o botão vira dois estados)
- Modificar: `web/app.js`
- Modificar: `PonteJs.kt`, `MainActivity.kt`
- Modificar: `tests/app_botao.test.js`
- Modificar: `README.md`

**Interfaces:**
- Consome: tudo das tarefas anteriores.
- Produz: `PonteJs.voltarParaEnsaio()`; e a página passa a chamar
  `window.App.aoTrocarDeRobo(ondeEstou)` — `'ensaio'` ou `'robo'` — que o Kotlin
  invoca depois de cada troca.

- [ ] **Passo 1: acrescentar os testes em `tests/app_botao.test.js`**

```js
test('a página sabe dizer se está no ensaio ou no robô', () => {
  assert.match(APP, /aoTrocarDeRobo/);
});

test('existe como voltar para o ensaio', () => {
  assert.match(APP, /Android\.voltarParaEnsaio\(\)/);
});
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `node --test tests/app_botao.test.js`
Esperado: FALHA nos dois testes novos.

- [ ] **Passo 3: `web/app.js`**

Acrescentar ao objeto `raiz.App` criado na tarefa 2:

```js
    /* O Kotlin avisa onde estamos depois de cada troca. A página não descobre
       isso sozinha: entrar na rede do robô é ato do sistema. */
    aoTrocarDeRobo: function (onde) {
      var noRobo = onde === 'robo';
      btProcurar.textContent = noRobo ? '🔌 voltar para o ensaio'
                                      : '🤖 procurar o robô';
      btProcurar.onclick = noRobo
        ? function () { Android.voltarParaEnsaio(); }
        : function () {
            spEstado.textContent = 'procurando o robô…';
            Android.procurarRobo();
          };
    },
```

E, no bloco que revela o botão, chamar `raiz.App.aoTrocarDeRobo('ensaio')` em
vez de pendurar o `onclick` na mão — assim há um lugar só que decide o texto e o
gesto.

- [ ] **Passo 4: `PonteJs.kt` e `MainActivity.kt`**

```kotlin
    @JavascriptInterface
    fun voltarParaEnsaio() = tela.voltarParaEnsaio()
```

```kotlin
    fun voltarParaEnsaio() = runOnUiThread {
        redeDoRobo.soltar()
        irPara(alvoEnsaio)
        webView.evaluateJavascript("App.aoTrocarDeRobo('ensaio')", null)
    }
```

E o `aoConectar` da tarefa 4 passa a fazer também:

```kotlin
                webView.evaluateJavascript("App.aoTrocarDeRobo('robo')", null)
```

- [ ] **Passo 5: rodar e ver passar**

```bash
node --test tests/
cd android && ./gradlew testDebugUnitTest
```

Esperado: tudo passa.

- [ ] **Passo 6: provar o vaivém no aparelho**

Com a placa ligada:

1. Abrir. Esperado: `parado`, ensaio funcionando, botão diz **🤖 procurar o robô**.
2. Montar um programa e rodar no ensaio.
3. Tocar em procurar o robô, escolher `Robo-01`. Esperado: o botão vira
   **🔌 voltar para o ensaio**, e PLAY move o robô de verdade — **com o mesmo
   programa ainda montado na tela**, que é o ponto de não recarregar a página.
4. Tocar em voltar para o ensaio. Esperado: volta ao robô da arena, sem
   recarregar, programa intacto.

- [ ] **Passo 7: contar no README**

Acrescentar uma seção "No celular e no tablet" com: como montar
(`./android/preparar_assets.sh && cd android && ./gradlew installDebug`), o
vaivém ensaio/robô, e — na seção de hardware provado que já existe — o que foi
provado em aparelho de verdade e o que não foi. **Escreva o que aconteceu, não o
que deveria acontecer.**

- [ ] **Passo 8: commit**

```bash
git add android web tests README.md
git commit -m "Deixa a criança ir e voltar entre o ensaio e o robô"
git push
```

---

## Revisão do plano contra a análise

- **Peça 1 da análise (robô virtual no app)** → tarefas 6, 7 e 8. NDK sobre o
  mesmo C, servidor WS local, `web/` intocado no caminho do simulador. ✓
- **Peça 2 (Wi-Fi)** → tarefa 4, com `bindProcessToNetwork` isolado como portão
  de risco e com um caminho de recuo nomeado. ✓
- **Peça 3 (casca WebView)** → tarefas 1, 3 e 5: assets em `http://`, cleartext,
  alvo configurável, `.ino` pelo MediaStore. ✓
- **Peça 4 (layout de celular)** → deliberadamente fora, com o motivo escrito. ✓
- **Peça 5 (custo cultural)** → o Gradle e o NDK vivem inteiros dentro de
  `android/`; `core/`, `host/` e `web/` seguem sem dependência. ✓

Duas coisas que este plano acerta em relação à análise:

1. **Sem permissão de localização.** A análise listou `ACCESS_FINE_LOCATION` e
   `NEARBY_WIFI_DEVICES` por cautela. Como o app não varre — quem varre é o
   diálogo do sistema —, `CHANGE_NETWORK_STATE` basta. A tarefa 4 confirma isso
   num aparelho, e só acrescenta permissão se a lista vier vazia.
2. **A tarefa 6 não estava na análise.** Rachar `host/main.c` em laço e casca é o
   que torna a VM chamável de fora sem duplicar uma linha, e é a peça que faz o
   `tests/host_test.sh` continuar valendo como prova.
