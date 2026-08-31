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
                for (i in 3 until carga.size) hex.append("%02x".format(carga[i]))
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
