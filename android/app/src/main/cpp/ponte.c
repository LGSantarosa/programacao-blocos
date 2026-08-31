#include <jni.h>

#include "laco.h"

/* Uma VM só, estática, como na ESP32 — e ao contrário do bridge/server.js, que
   sobe um processo por conexão. Aqui há um robô e uma criança. */

JNIEXPORT void JNICALL
Java_br_educacaocriativa_roboblocos_Vm_iniciarNativo(JNIEnv *e, jobject o) {
    (void)e; (void)o;
    laco_init();
}

JNIEXPORT void JNICALL
Java_br_educacaocriativa_roboblocos_Vm_linhaNativa(JNIEnv *e, jobject o,
                                                   jstring l) {
    (void)o;
    const char *s = (*e)->GetStringUTFChars(e, l, NULL);
    if (s == NULL) return;
    laco_linha(s);
    (*e)->ReleaseStringUTFChars(e, l, s);
}

JNIEXPORT void JNICALL
Java_br_educacaocriativa_roboblocos_Vm_passoNativo(JNIEnv *e, jobject o) {
    (void)e; (void)o;
    laco_passo();
}

JNIEXPORT jstring JNICALL
Java_br_educacaocriativa_roboblocos_Vm_proximaSaidaNativa(JNIEnv *e, jobject o) {
    (void)o;
    char linha[128];
    if (!laco_proxima_saida(linha, (int)sizeof(linha))) return NULL;
    return (*e)->NewStringUTF(e, linha);
}
