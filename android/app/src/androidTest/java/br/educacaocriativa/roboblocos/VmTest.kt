package br.educacaocriativa.roboblocos

import org.junit.Assert.assertTrue
import org.junit.Test

class VmTest {

    /* O mesmo programa curto do tests/laco_test.c: anda 1 s e para. */
    private val progAndar =
        "08c80000000000" + "08c80000000000" + "01000000000000" +
        "08e80300000000" + "02000000000000" + "08000000000000" +
        "08000000000000" + "01000000000000" + "00000000000000"

    @Test fun andaEDepoisPara() {
        Vm.iniciar()
        Vm.linha("L $progAndar")
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
