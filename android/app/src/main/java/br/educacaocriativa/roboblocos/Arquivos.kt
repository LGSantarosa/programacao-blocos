package br.educacaocriativa.roboblocos

import android.content.ContentValues
import android.content.Context
import android.os.Environment
import android.provider.MediaStore

object Arquivos {
    /* MediaStore, e não um caminho: a partir do Android 10 o app não escreve
       em Downloads por caminho, e é justamente o minSdk deste projeto. */
    fun salvarEmDownloads(ctx: Context, nome: String, texto: String): String {
        val valores = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, nome)
            put(MediaStore.Downloads.MIME_TYPE, "text/plain")
            put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
        }
        val destino = ctx.contentResolver.insert(
            MediaStore.Downloads.EXTERNAL_CONTENT_URI, valores) ?: return ""
        ctx.contentResolver.openOutputStream(destino)?.use {
            it.write(texto.toByteArray(Charsets.UTF_8))
        } ?: return ""
        return nome
    }
}
