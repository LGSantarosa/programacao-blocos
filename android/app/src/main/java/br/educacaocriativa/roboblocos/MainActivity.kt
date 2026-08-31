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
        WebView.setWebContentsDebuggingEnabled(true)
        webView.addJavascriptInterface(PonteJs(this), "Android")
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

    override fun onDestroy() {
        redeDoRobo.soltar()
        servidor.parar()
        super.onDestroy()
    }
}
