package br.educacaocriativa.roboblocos

import android.content.ContentValues
import android.content.Context
import android.net.Uri
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
        /* O nome de volta é o que o MediaStore ficou usando, e não o que
           pedimos: quando já existe um robo.ino, ele grava "robo (1).ino" sem
           avisar. Devolver o nome pedido faria a tela dizer "salvo em
           Downloads/robo.ino" apontando para um arquivo velho — e a criança
           procuraria o programa dela dentro do arquivo errado. */
        return nomeGravado(ctx, destino) ?: nome
    }

    private fun nomeGravado(ctx: Context, destino: Uri): String? {
        val colunas = arrayOf(MediaStore.Downloads.DISPLAY_NAME)
        ctx.contentResolver.query(destino, colunas, null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                val i = c.getColumnIndex(MediaStore.Downloads.DISPLAY_NAME)
                if (i >= 0) return c.getString(i)
            }
        }
        return null
    }
}
