#include "hal.h"
#include "physics.h"

void hal_motors(int16_t esq, int16_t dir) {
    fis_set_motores(esq, dir);
}

uint16_t hal_distancia_cm(void) {
    return fis_distancia_cm();
}
