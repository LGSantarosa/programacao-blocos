package br.educacaocriativa.roboblocos

/* O robô virtual, o mesmo core/vm.c que roda na ESP32, compilado para o
   aparelho. Só uma thread pode tocar aqui: a VM é uma só e não tem trava. */
object Vm {
    const val FRAME_MS = 5L

    init { System.loadLibrary("robo") }

    fun iniciar() = iniciarNativo()
    fun linha(l: String) = linhaNativa(l)
    fun passo() = passoNativo()
    fun proximaSaida(): String? = proximaSaidaNativa()

    private external fun iniciarNativo()
    private external fun linhaNativa(l: String)
    private external fun passoNativo()
    private external fun proximaSaidaNativa(): String?
}
