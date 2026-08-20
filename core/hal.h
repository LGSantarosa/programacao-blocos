#ifndef HAL_H
#define HAL_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Liga os motores. Valores de -255 a 255; negativo é ré. */
void hal_motors(int16_t esq, int16_t dir);

/* Distância lida pelo ultrassônico, em centímetros. */
uint16_t hal_distancia_cm(void);

/* Milissegundos desde o início. Pode dar a volta em 32 bits. */
uint32_t hal_millis(void);

/* Entrega um valor calculado a quem estiver ouvindo: a linha "V n" no robô
   virtual, um quadro no WebSocket na placa. Diferente dos outros hal_*, este
   não fala com um pino — fala com quem está olhando. */
void hal_report(int32_t valor);

#ifdef __cplusplus
}
#endif

#endif
