#ifndef PHYSICS_H
#define PHYSICS_H

#include <stdint.h>

/* Derivados da calibração da VM — ver o spec. Mexer aqui exige recalcular
   MS_POR_GRAU em core/vm.h. */
#define V_MAX        0.30   /* m/s com PWM 255       */
#define ENTRE_EIXOS  0.12   /* m                     */
#define RAIO_ROBO    0.08   /* m                     */
#define ARENA_LADO   2.00   /* m                     */

void     fis_init(void);
void     fis_set_motores(int16_t esq, int16_t dir);
void     fis_passo(double dt);
void     fis_pose(double *x, double *y, double *theta);
void     fis_set_pose(double x, double y, double theta);
uint16_t fis_distancia_cm(void);
/* 1 se o último fis_passo() foi bloqueado por parede ou obstáculo. */
int      fis_colidiu(void);

#endif
