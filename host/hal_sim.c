#include <time.h>
#include "hal.h"
#include "physics.h"

void hal_motors(int16_t esq, int16_t dir) {
    fis_set_motores(esq, dir);
}

uint16_t hal_distancia_cm(void) {
    return fis_distancia_cm();
}

uint32_t hal_millis(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint32_t)((uint64_t)ts.tv_sec * 1000u + (uint64_t)ts.tv_nsec / 1000000u);
}
