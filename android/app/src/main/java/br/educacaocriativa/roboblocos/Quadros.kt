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
       veio algo que este servidor não trata; devolve vazio para quadro de
       controle que se ignora. */
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
            for (i in carga.indices) {
                carga[i] = (carga[i].toInt() xor mascara[i % 4].toInt()).toByte()
            }
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
