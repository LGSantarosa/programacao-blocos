package br.educacaocriativa.roboblocos

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var voz: Voz

    private val redeDoRobo by lazy { RedeDoRobo(this) }
    private val servidor = ServidorLocal()

    /* O robô virtual, servido de dentro do próprio app. Sem rede nenhuma
       ligada isto continua funcionando — é o ensaio. */
    private var alvoEnsaio = ""

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

    /* O parâmetro em português, como o resto do repositório. O Kotlin avisa
       que quem chamar com argumento nomeado veria outro nome — ninguém chama
       onCreate assim, e o aviso só sujaria todo build. */
    @SuppressLint("SetJavaScriptEnabled")
    @Suppress("PARAMETER_NAME_CHANGED_ON_OVERRIDE")
    override fun onCreate(estado: Bundle?) {
        super.onCreate(estado)
        webView = WebView(this)
        setContentView(webView)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = false
        /* Só no build de depuração. Ligado sempre, isto abre o console do
           WebView para qualquer um com o aparelho na mão e o cabo — ótimo
           enquanto se prova o app na bancada, e coisa que não deve sair junto
           num APK entregue a uma escola. */
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        /* Quando o motor de fala termina de ligar, a página pode já ter
           perguntado e ouvido "não" — então ela pergunta de novo. Se a página
           ainda nem carregou, o Som não existe e o try engole; ela vai
           perguntar sozinha ao abrir, e a resposta já será a certa. */
        voz = Voz(this) {
            runOnUiThread {
                webView.evaluateJavascript(
                    "try { Som.vozesMudaram(); } catch (e) {}", null)
            }
        }
        webView.addJavascriptInterface(PonteJs(this, voz), "Android")
        /* Sem um WebChromeClient, um alert/confirm/prompt do JavaScript não
           abre nada e devolve null na mesma hora — sem erro, sem aviso. Foi
           esse silêncio que escondeu o defeito do número: em aparelho de
           toque, o editor de campo do Blockly é um prompt, e tocar no
           "andar frente 1 s" simplesmente não fazia nada.

           A página hoje pergunta pelo teclado dela (web/teclado.js) e não
           depende mais disto. Fica assim mesmo assim, para o próximo diálogo
           que aparecer falhar à vista e não em segredo. */
        webView.webChromeClient = WebChromeClient()
        alvoEnsaio = "127.0.0.1:" + servidor.iniciar()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                v: WebView, pedido: WebResourceRequest
            ): WebResourceResponse? = carregadorDeAssets.shouldInterceptRequest(pedido.url)

            override fun onPageFinished(v: WebView, url: String) {
                irPara(alvoEnsaio)
            }
        }

        webView.loadUrl("http://appassets.androidplatform.net/index.html")

        onBackPressedDispatcher.addCallback(this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() = sairGuardando()
            })
    }

    fun irPara(host: String) {
        webView.evaluateJavascript("App.irPara('$host')", null)
    }

    fun procurarRobo() = runOnUiThread {
        redeDoRobo.procurar(
            aoConectar = {
                runOnUiThread {
                    irPara(RedeDoRobo.IP)
                    webView.evaluateJavascript("App.aoTrocarDeRobo('robo')", null)
                }
            },
            aoCair = {
                runOnUiThread {
                    irPara(alvoEnsaio)
                    webView.evaluateJavascript("App.aoTrocarDeRobo('ensaio')", null)
                }
            },
        )
    }

    /* Soltar a rede do robô devolve o processo à rota padrão, e é o que faz o
       127.0.0.1 do ensaio voltar a responder. Um exclui o outro. */
    fun voltarParaEnsaio() = runOnUiThread {
        redeDoRobo.soltar()
        irPara(alvoEnsaio)
        webView.evaluateJavascript("App.aoTrocarDeRobo('ensaio')", null)
    }

    /* O "voltar" mata a Activity, e com ela o WebView. Antes de C1 isso jogava
       fora o programa montado — a mesma perda que o App.irPara() foi escrito
       para evitar quando troca de robô.

       Hoje a página guarda sozinha, um segundo depois da última mudança, e
       grava na hora quando fica escondida. Mas o "voltar" pode chegar dentro
       desse segundo, e a Activity morre antes de o evento de visibilidade dar
       a volta pela ponte. Então pedimos a gravação e só saímos depois que ela
       responde.

       O limite existe porque um pedido que não volta não pode prender a
       criança dentro do app: se em meio segundo o JavaScript não responder, a
       gente sai assim mesmo. */
    private fun sairGuardando() {
        var jaSaiu = false
        val sair = {
            if (!jaSaiu) {
                jaSaiu = true
                finish()
            }
        }
        webView.postDelayed({ runOnUiThread(sair) }, 500)
        webView.evaluateJavascript(
            "(function(){ try { App.gravarAgora(); } catch (e) {} return 1; })()"
        ) { runOnUiThread(sair) }
    }

    override fun onDestroy() {
        redeDoRobo.soltar()
        servidor.parar()
        voz.parar()
        super.onDestroy()
    }
}
