#include <math.h>
#include "physics.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

typedef struct { double x0, y0, x1, y1; } Rect;

/* Arena da v1: um obstáculo retangular no meio. Sem editor por enquanto. */
static const Rect obstaculos[] = {
    { 0.80, 1.40, 1.20, 1.60 }
};
static const int n_obstaculos = (int)(sizeof(obstaculos) / sizeof(obstaculos[0]));

static double  pos_x, pos_y, ang;
static int16_t mot_esq, mot_dir;

void fis_init(void) {
    pos_x = 1.0;
    pos_y = 0.40;
    ang   = M_PI / 2;
    mot_esq = mot_dir = 0;
}

void fis_set_motores(int16_t esq, int16_t dir) {
    mot_esq = esq;
    mot_dir = dir;
}

void fis_set_pose(double x, double y, double theta) {
    pos_x = x;
    pos_y = y;
    ang   = theta;
}

void fis_pose(double *x, double *y, double *theta) {
    *x = pos_x; *y = pos_y; *theta = ang;
}

static int dentro_de_retangulo(double x, double y, const Rect *r) {
    return x >= r->x0 && x <= r->x1 && y >= r->y0 && y <= r->y1;
}

/* O centro do robô, com seu raio, encosta em parede ou obstáculo? */
static int colide(double x, double y) {
    if (x - RAIO_ROBO < 0.0 || x + RAIO_ROBO > ARENA_LADO) return 1;
    if (y - RAIO_ROBO < 0.0 || y + RAIO_ROBO > ARENA_LADO) return 1;
    for (int i = 0; i < n_obstaculos; i++) {
        const Rect *r = &obstaculos[i];
        /* ponto do retângulo mais próximo do centro do robô */
        double px = x < r->x0 ? r->x0 : (x > r->x1 ? r->x1 : x);
        double py = y < r->y0 ? r->y0 : (y > r->y1 ? r->y1 : y);
        double dx = x - px, dy = y - py;
        if (dx * dx + dy * dy < RAIO_ROBO * RAIO_ROBO) return 1;
    }
    return 0;
}

void fis_passo(double dt) {
    double vE = (mot_esq / 255.0) * V_MAX;
    double vD = (mot_dir / 255.0) * V_MAX;
    double v     = (vE + vD) / 2.0;
    double omega = (vD - vE) / ENTRE_EIXOS;

    ang += omega * dt;
    if (ang >  M_PI) ang -= 2.0 * M_PI;
    if (ang < -M_PI) ang += 2.0 * M_PI;

    double nx = pos_x + v * cos(ang) * dt;
    double ny = pos_y + v * sin(ang) * dt;
    /* Bateu: gira mas não translada. É o comportamento de um robô real
       encostado numa parede. */
    if (!colide(nx, ny)) { pos_x = nx; pos_y = ny; }
}

/* Um raio a partir da frente do robô, marchando de 5 em 5 mm. Simples e
   determinístico — a repetibilidade importa mais que a elegância aqui. */
static int ponto_bloqueado(double x, double y) {
    if (x < 0.0 || x > ARENA_LADO || y < 0.0 || y > ARENA_LADO) return 1;
    for (int i = 0; i < n_obstaculos; i++)
        if (dentro_de_retangulo(x, y, &obstaculos[i])) return 1;
    return 0;
}

uint16_t fis_distancia_cm(void) {
    const double passo = 0.005;
    const double alcance = 4.00;
    double ox = pos_x + RAIO_ROBO * cos(ang);
    double oy = pos_y + RAIO_ROBO * sin(ang);
    double dx = cos(ang), dy = sin(ang);

    for (double d = 0.0; d <= alcance; d += passo) {
        if (ponto_bloqueado(ox + dx * d, oy + dy * d)) {
            long cm = (long)(d * 100.0 + 0.5);
            if (cm < 2)   cm = 2;
            if (cm > 400) cm = 400;
            return (uint16_t)cm;
        }
    }
    return 400;
}
