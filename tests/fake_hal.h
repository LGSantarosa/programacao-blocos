#ifndef FAKE_HAL_H
#define FAKE_HAL_H

#include <stdint.h>

void        fake_clock_set(uint32_t ms);
void        fake_clock_advance(uint32_t ms);
void        fake_dist_set(uint16_t cm);
void        fake_trace_reset(void);
int         fake_trace_count(void);
const char *fake_trace_get(int i);

#endif
