package br.educacaocriativa.roboblocos

import android.webkit.JavascriptInterface

/* Tudo que a página só consegue fazer por estar dentro do app. No navegador
   window.Android não existe, e a página tem que continuar funcionando assim —
   é o mesmo teste de capacidade que o app.js já faz para o download. */
class PonteJs(private val tela: MainActivity) {
    @JavascriptInterface
    fun temApp(): Boolean = true

    /* Chamada de uma thread do WebView, não da principal: quem toca em View
       tem que voltar para a principal, e MainActivity.procurarRobo faz isso. */
    @JavascriptInterface
    fun procurarRobo() = tela.procurarRobo()

    @JavascriptInterface
    fun voltarParaEnsaio() = tela.voltarParaEnsaio()

    /* O Blob do navegador não vira arquivo aqui: blob: nem chega no
       DownloadListener do WebView. Devolve o nome salvo, ou vazio se falhou. */
    @JavascriptInterface
    fun salvarIno(texto: String): String =
        Arquivos.salvarEmDownloads(tela, "robo.ino", texto)
}
