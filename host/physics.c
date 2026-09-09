#include <math.h>
#include "physics.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

typedef FisRect Rect;

/* A arena é dado, não constante: o navegador manda a fase antes de rodar.
   Estes valores são só o padrão de quando ninguém mandou nada — um obstáculo
   no meio, que é a arena com que o projeto nasceu. */
static Rect obstaculos[MAX_OBSTACULOS] = {
    { 0.80, 1.40, 1.20, 1.60 }
};
static int n_obstaculos = 1;

/* Onde o robô nasce. fis_init() volta para cá, e um labirinto precisa que a
   entrada dele seja o começo. */
static double ini_x = 1.0, ini_y = 0.40, ini_ang = M_PI / 2;

void fis_definir_arena(double x, double y, double theta,
                       const FisRect *obst, int n) {
    ini_x = x; ini_y = y; ini_ang = theta;
    if (n < 0) n = 0;
    if (n > MAX_OBSTACULOS) n = MAX_OBSTACULOS;
    for (int i = 0; i < n; i++) obstaculos[i] = obst[i];
    n_obstaculos = n;
}

static double  pos_x, pos_y, ang;
static int16_t mot_esq, mot_dir;
static int     bateu;

void fis_init(void) {
    pos_x = ini_x;
    pos_y = ini_y;
    ang   = ini_ang;
    mot_esq = mot_dir = 0;
    bateu = 0;
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

int fis_colidiu(void) { return bateu; }

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

/* Uma fatia. A colisão é testada só na chegada, e é por isso que quem chama
   nunca deve dar um salto maior que FIS_PASSO_MAX_S — ver fis_passo(). */
static void uma_fatia(double dt) {
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
    if (!colide(nx, ny)) { pos_x = nx; pos_y = ny; bateu = 0; }
    else                 { bateu = 1; }
}

/* O intervalo inteiro, em fatias que a colisão consegue enxergar.

   Sem isto, um dt grande — a máquina carregada, o app voltando do segundo
   plano — colocava o robô do outro lado da parede: a posição de chegada estava
   livre, e o caminho até ela nunca era olhado. A 5 ms de laço a folga era de
   cinquenta vezes, mas nada no código a garantia, e o próximo V_MAX maior a
   gastaria em silêncio.

   O bateu que fica é o da última fatia: quem consultar depois quer saber se o
   robô está encostado agora, e não se raspou no meio do caminho. */
void fis_passo(double dt) {
    if (!(dt > 0.0)) return;
    /* Fatias iguais, e não "tira FIS_PASSO_MAX_S até sobrar": o resto de uma
       divisão em ponto flutuante sai quase zero, e uma fatia de tamanho zero
       não colide com nada — ela apagava o bateu que as fatias anteriores tinham
       acabado de levantar. O robô parava na parede e dizia que não tinha
       batido.

       Com n fatias iguais, dt = 1,0 dá exatamente as mesmas 200 fatias de 5 ms
       que o laço daria uma a uma, e o resultado é idêntico ao bit. */
    int n = (int)ceil(dt / FIS_PASSO_MAX_S);
    if (n < 1) n = 1;
    double fatia = dt / n;
    for (int i = 0; i < n; i++) uma_fatia(fatia);
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
