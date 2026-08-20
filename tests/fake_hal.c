#include <stdio.h>
#include <string.h>
#include "fake_hal.h"
#include "hal.h"

#define MAX_TRACE 512

static uint32_t relogio;
static uint16_t distancia = 400;
static char     trace[MAX_TRACE][32];
static int      n_trace;

void fake_clock_set(uint32_t ms)     { relogio = ms; }
void fake_clock_advance(uint32_t ms) { relogio += ms; }
void fake_dist_set(uint16_t cm)      { distancia = cm; }
void fake_trace_reset(void)          { n_trace = 0; }
int  fake_trace_count(void)          { return n_trace; }

const char *fake_trace_get(int i) {
    if (i < 0 || i >= n_trace) return "<fora de faixa>";
    return trace[i];
}

void hal_motors(int16_t esq, int16_t dir) {
    if (n_trace < MAX_TRACE)
        snprintf(trace[n_trace++], sizeof(trace[0]), "MOTOR %d,%d", esq, dir);
}

uint16_t hal_distancia_cm(void) { return distancia; }
uint32_t hal_millis(void)       { return relogio; }

void hal_report(int32_t valor) {
    if (n_trace < MAX_TRACE)
        snprintf(trace[n_trace++], sizeof(trace[0]), "REPORT %d", (int)valor);
}
