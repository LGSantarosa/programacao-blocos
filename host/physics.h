#ifndef PHYSICS_H
#define PHYSICS_H

#include <stdint.h>

/* Derivados da calibração da VM — ver o spec. Mexer aqui exige recalcular
   MS_POR_GRAU em core/vm.h.

   O ENTRE_EIXOS não é uma medida do chassi: é o número que faz a velocidade
   angular do simulador bater com o MS_POR_GRAU do robô de verdade. A conta,
   por inteiro, para quem precisar refazê-la:

       v     = VEL_GIRO / 255 * V_MAX          cada roda, em sentido oposto
       ω     = 2 * v / ENTRE_EIXOS             rad/s girando no lugar
       t(90) = 90 * MS_POR_GRAU / 1000         o que o opcode TURN espera
       exige-se  ω * t(90) = π/2

   Era 0.12, arredondado, e com ele um `girar 90` dava 91,0° — 1° de sobra por
   curva. Passou anos escondido porque a física andava ~3% devagar e os dois
   erros se cancelavam; quando o laço passou a usar o tempo de verdade
   (host/laco.c), o giro ficou exposto e o gabarito do labirinto começou a
   errar a estrela por 1 cm. Medido: com 0.12, um `girar 180` dava 182,6°.
   Com este valor dá 179,6°. */
#define V_MAX        0.30       /* m/s com PWM 255 */
#define ENTRE_EIXOS  0.121332   /* m — ver a conta acima */
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
