/* O bastante para o g++ conferir a sintaxe de um sketch gerado. Não simula
   nada e não roda nada: só existe para o compilador ter o que resolver, do
   mesmo jeito que o fake_hal.c deixa a VM ser testada sem hardware.

   Se o gerador passar a emitir uma função do Arduino que não esteja aqui, o
   teste falha — e é para falhar mesmo: cada função nova merece uma linha
   nova. */
#ifndef FAKE_ARDUINO_H
#define FAKE_ARDUINO_H

#include <stdlib.h>   /* abs */

#define OUTPUT 1
#define INPUT  0
#define HIGH   1
#define LOW    0

inline void pinMode(int, int) {}
inline void digitalWrite(int, int) {}
inline void analogWrite(int, int) {}
inline void delay(unsigned long) {}
inline void delayMicroseconds(unsigned long) {}
inline unsigned long pulseIn(int, int, unsigned long) { return 0; }
inline long random(long, long) { return 0; }
inline void randomSeed(unsigned long) {}
inline unsigned long micros() { return 0; }

#endif
