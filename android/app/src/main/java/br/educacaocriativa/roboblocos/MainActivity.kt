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

    /* Provisório: o IP da máquina onde roda o bridge/server.js. A tarefa 8
       troca isto pelo servidor local do próprio app. */
    private val ALVO_INICIAL = "192.168.18.9:8080"

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
        webView.addJavascriptInterface(PonteJs(), "Android")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                v: WebView, pedido: WebResourceRequest
            ): WebResourceResponse? = carregadorDeAssets.shouldInterceptRequest(pedido.url)

            override fun onPageFinished(v: WebView, url: String) {
                irPara(ALVO_INICIAL)
            }
        }

        webView.loadUrl("http://appassets.androidplatform.net/index.html")
    }

    fun irPara(host: String) {
        webView.evaluateJavascript("App.irPara('$host')", null)
    }
}
