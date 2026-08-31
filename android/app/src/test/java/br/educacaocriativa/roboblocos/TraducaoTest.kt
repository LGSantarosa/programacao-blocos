package br.educacaocriativa.roboblocos

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/* Espelha o tests/bridge.test.js, que é o teste do original. O protocolo tem
   uma definição só, e as duas pontas têm que concordar byte a byte. */
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
        assertEquals(0, q[9].toInt())
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
        /* and 0xFF nos dois: Byte em Kotlin é com sinal, e 200 sozinho vale
           -56. Sem isto o teste falha num código que está certo. */
        assertEquals(200, ((q[2].toInt() and 0xFF) shl 8) or (q[3].toInt() and 0xFF))
        assertEquals(4 + 200, q.size)
    }

    /* O navegador mascara toda mensagem que manda. Sem desmascarar, o
       primeiro byte viraria lixo e todo comando seria descartado. */
    @Test fun quadroDoNavegadorVemMascaradoEEDesmascarado() {
        val mascara = byteArrayOf(0x11, 0x22, 0x33, 0x44)
        val carga = byteArrayOf(0x02)
        val mascarada = ByteArray(1) { (carga[it].toInt() xor mascara[it].toInt()).toByte() }
        val quadro = byteArrayOf(0x82.toByte(), (0x80 or 1).toByte()) + mascara + mascarada
        val lido = Quadros.ler(quadro.inputStream())!!
        assertArrayEquals(carga, lido)
    }

    @Test fun quadroDeFechamentoDerrubaOLaco() {
        assertNull(Quadros.ler(byteArrayOf(0x88.toByte(), 0).inputStream()))
    }
}
