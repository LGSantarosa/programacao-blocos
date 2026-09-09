#ifndef PHYSICS_H
#define PHYSICS_H

#include <stdint.h>

/* Derivados da calibração da VM — ver o spec. Mexer aqui exige recalcular
   MS_POR_GRAU em core/vm.h. */
#define V_MAX        0.30   /* m/s com PWM 255       */
#define ENTRE_EIXOS  0.12   /* m                     */
#define RAIO_ROBO    0.08   /* m                     */
#define ARENA_LADO   2.00   /* m                     */

/* Um obstáculo retangular, em metros. */
typedef struct { double x0, y0, x1, y1; } FisRect;

#define MAX_OBSTACULOS 24

/* Troca a arena inteira: onde o robô nasce e o que há no caminho. Sem isto a
   arena seria constante compilada, e cada fase precisaria de outro binário.
   Passar n = 0 deixa a arena vazia, só com as paredes. */
void     fis_definir_arena(double x, double y, double theta,
                           const FisRect *obst, int n);

void     fis_init(void);
void     fis_set_motores(int16_t esq, int16_t dir);
/* Avança o mundo em dt segundos. Subdivide sozinho: a colisão é testada na
   posição de chegada de cada fatia, então um dt grande sem fatiar faria o robô
   pular por cima de uma parede inteira e chegar do outro lado sem colidir. */
void     fis_passo(double dt);

/* O maior salto que a física dá de uma vez. A 0,30 m/s são 1,5 mm por fatia,
   contra os 8 cm de raio do robô — folga de cinquenta vezes. O número não é
   escolha de precisão, é o teto que garante que nada é atravessado. */
#define FIS_PASSO_MAX_S  0.005
void     fis_pose(double *x, double *y, double *theta);
void     fis_set_pose(double x, double y, double theta);
uint16_t fis_distancia_cm(void);
/* 1 se o último fis_passo() foi bloqueado por parede ou obstáculo, 0 se não. */
int      fis_colidiu(void);

#endif
