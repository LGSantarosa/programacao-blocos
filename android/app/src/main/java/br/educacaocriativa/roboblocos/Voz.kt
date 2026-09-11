package br.educacaocriativa.roboblocos

import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.Locale

/* A voz que descreve os blocos, dentro do app. O WebView do Android não traz o
   speechSynthesis: a página perguntava, ele não existia, e ela ficava quieta —
   no S24 FE, com voz instalada e tudo. O motor de fala do sistema está ali do
   lado, e é ele que a ponte empresta à página.

   O motor liga assíncrono. Até ele responder não há voz, e a página, que já
   perguntou, é avisada pelo aoFicarPronta para perguntar de novo — é o mesmo
   papel do voiceschanged no navegador. */
class Voz(contexto: Context, private val aoFicarPronta: () -> Unit) {

    @Volatile private var pronta = false
    private lateinit var tts: TextToSpeech

    init {
        tts = TextToSpeech(contexto.applicationContext) { status ->
            if (status == TextToSpeech.SUCCESS) {
                /* Aparelho com o motor mas sem o pacote de português responde
                   LANG_MISSING_DATA ou LANG_NOT_SUPPORTED, que são negativos.
                   Aí não há voz — e é o que os Ajustes contam ao adulto. */
                val lingua = tts.setLanguage(Locale.forLanguageTag("pt-BR"))
                pronta = lingua >= TextToSpeech.LANG_AVAILABLE
                /* A mesma razão do rate 0.9 do som.js: no ritmo padrão o nome
                   passa antes de a criança ligar o som à peça na mão. */
                tts.setSpeechRate(0.9f)
            }
            aoFicarPronta()
        }
    }

    fun temVoz(): Boolean = pronta

    /* QUEUE_FLUSH é o cancel() do som.js: arrastar três peças seguidas fala a
       última, e não enfileira três. */
    fun falar(texto: String) {
        if (!pronta || texto.isEmpty()) return
        tts.speak(texto, TextToSpeech.QUEUE_FLUSH, null, "bloco")
    }

    fun parar() = tts.shutdown()
}
