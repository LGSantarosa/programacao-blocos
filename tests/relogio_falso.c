/* O tests/fake_hal.c finge o HAL inteiro. Aqui não serve: é o laço que está em
   teste, e ele precisa da física e dos motores de verdade. Só o relógio é
   falso, para o teste não ter que dormir sete segundos. */
#include "hal.h"
#include "relogio_falso.h"

static uint32_t agora;

void relogio_set(uint32_t ms)     { agora = ms; }
void relogio_avancar(uint32_t ms) { agora += ms; }

uint32_t hal_millis(void) { return agora; }
