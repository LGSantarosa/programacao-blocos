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
        registro?.let {
            try { cm.unregisterNetworkCallback(it) } catch (e: IllegalArgumentException) { }
        }
        registro = null
        cm.bindProcessToNetwork(null)
    }

    companion object {
        const val SENHA = "robo1234"
        const val IP = "192.168.4.1"
    }
}
