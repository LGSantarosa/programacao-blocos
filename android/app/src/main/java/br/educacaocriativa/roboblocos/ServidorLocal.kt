package br.educacaocriativa.roboblocos

import android.util.Base64
import java.io.InputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.concurrent.thread

/* O bridge/server.js dentro do app, sem a parte de servir arquivos: aqui os
   arquivos vêm dos assets. Só 127.0.0.1, e só um cliente por vez — há um robô
   e uma criança. */
class ServidorLocal {

    private var tomada: ServerSocket? = null
    private var vivo = false

    /* Porta zero: quem escolhe é o sistema, e o número volta daqui. Porta fixa
       brigaria com qualquer outro app que já a tivesse tomado. */
    fun iniciar(): Int {
        val s = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
        tomada = s
        vivo = true
        thread(name = "servidor-local") {
            while (vivo) {
                val cliente = try { s.accept() } catch (e: Exception) { break }
                try { atender(cliente) } catch (e: Exception) { }
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

        val chave = lerAperto(entrada)
        if (chave == null) { cliente.close(); return }
        saida.write(respostaDoAperto(chave).toByteArray(Charsets.US_ASCII))
        saida.flush()

        Vm.iniciar()

        /* Uma thread empurra a VM e escreve; esta aqui lê. Só a thread da VM
           chama Vm.*, e os comandos chegam nela por esta fila — a VM é uma só
           e não tem trava. */
        val comandos = ConcurrentLinkedQueue<String>()

        val motor = thread(name = "vm") {
            while (!cliente.isClosed) {
                while (true) Vm.linha(comandos.poll() ?: break)
                Vm.passo()
                while (true) {
                    val l = Vm.proximaSaida() ?: break
                    val q = Traducao.paraQuadroDoNavegador(l) ?: continue
                    try {
                        synchronized(saida) {
                            saida.write(Quadros.montar(q))
                            saida.flush()
                        }
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
            /* conexão caiu no meio; o finally limpa */
        } finally {
            comandos.add("S")
            try { cliente.close() } catch (e: Exception) { }
            motor.join(500)
        }
    }

    private fun lerAperto(entrada: InputStream): String? {
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
