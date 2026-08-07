#include <Arduino.h>
extern "C" {
#include "hal.h"
}

/* TB6612FNG */
static const int PIN_PWMA = 25, PIN_AIN1 = 26, PIN_AIN2 = 27;
static const int PIN_PWMB = 33, PIN_BIN1 = 14, PIN_BIN2 = 12;
static const int PIN_STBY = 13;

/* HC-SR04 */
static const int PIN_TRIG = 5, PIN_ECHO = 18;

static const int CANAL_A = 0, CANAL_B = 1;

void hal_esp32_setup() {
    pinMode(PIN_AIN1, OUTPUT); pinMode(PIN_AIN2, OUTPUT);
    pinMode(PIN_BIN1, OUTPUT); pinMode(PIN_BIN2, OUTPUT);
    pinMode(PIN_STBY, OUTPUT); digitalWrite(PIN_STBY, HIGH);

    ledcSetup(CANAL_A, 20000, 8);
    ledcSetup(CANAL_B, 20000, 8);
    ledcAttachPin(PIN_PWMA, CANAL_A);
    ledcAttachPin(PIN_PWMB, CANAL_B);

    pinMode(PIN_TRIG, OUTPUT); digitalWrite(PIN_TRIG, LOW);
    pinMode(PIN_ECHO, INPUT);
}

static void um_motor(int canal, int in1, int in2, int16_t v) {
    if (v > 255) v = 255;
    if (v < -255) v = -255;
    digitalWrite(in1, v >= 0 ? HIGH : LOW);
    digitalWrite(in2, v >= 0 ? LOW : HIGH);
    ledcWrite(canal, (uint32_t)(v >= 0 ? v : -v));
}

extern "C" void hal_motors(int16_t esq, int16_t dir) {
    um_motor(CANAL_A, PIN_AIN1, PIN_AIN2, esq);
    um_motor(CANAL_B, PIN_BIN1, PIN_BIN2, dir);
}

extern "C" uint32_t hal_millis(void) {
    return (uint32_t)millis();
}

/* O HC-SR04 é lento. Ler a cada chamada travaria a VM por até 25 ms, então
   a leitura é feita no máximo a cada 60 ms e o último valor fica em cache. */
extern "C" uint16_t hal_distancia_cm(void) {
    static uint32_t ultima = 0;
    static uint16_t cache = 400;

    uint32_t agora = millis();
    if (agora - ultima < 60) return cache;
    ultima = agora;

    digitalWrite(PIN_TRIG, LOW);  delayMicroseconds(2);
    digitalWrite(PIN_TRIG, HIGH); delayMicroseconds(10);
    digitalWrite(PIN_TRIG, LOW);

    unsigned long us = pulseIn(PIN_ECHO, HIGH, 25000UL);
    if (us == 0) { cache = 400; return cache; }

    long cm = (long)(us / 58);
    if (cm < 2) cm = 2;
    if (cm > 400) cm = 400;
    cache = (uint16_t)cm;
    return cache;
}
