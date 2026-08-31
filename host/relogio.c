/* Só o relógio, num arquivo só dele: é o que deixa o tests/laco_test.c pôr o
   seu no lugar sem símbolo duplicado, e ficar com a física de verdade. */
#include <time.h>
#include "hal.h"

uint32_t hal_millis(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint32_t)((uint64_t)ts.tv_sec * 1000u + (uint64_t)ts.tv_nsec / 1000000u);
}
