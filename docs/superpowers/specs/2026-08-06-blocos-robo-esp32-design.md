# Programação em blocos para robô ESP32 — design

Data: 2026-08-06

## Objetivo

Uma criança monta blocos numa tela, aperta PLAY, e o robô executa imediatamente.
Sem compilar, sem gravar, sem esperar. O robô guarda e roda o programa sozinho.

O sistema precisa funcionar hoje, sem hardware, e continuar funcionando sem
alteração de lógica quando a ESP32 chegar.

## Decisão central

A lógica de execução mora num único arquivo C (`core/vm.c`) que não conhece
hardware. Ele conversa com o mundo por três funções:

```c
void     hal_motors(int16_t esq, int16_t dir);   /* -255..255 */
uint16_t hal_distancia_cm(void);
uint32_t hal_millis(void);
```

Existem duas implementações dessa camada:

| implementação   | motores               | sensor              | onde roda |
|-----------------|-----------------------|---------------------|-----------|
| `hal_sim.c`     | entrada da física     | raycast na arena    | PC (gcc)  |
| `hal_esp32.cpp` | PWM → TB6612FNG       | HC-SR04             | ESP32     |

Isso é o que garante que o robô virtual e o robô real se comportem igual: não há
duas VMs. Há uma VM e duas camadas de hardware.

### Topologia — hoje, sem placa

```
navegador ──WebSocket binário──► bridge Node ──stdio texto──► robo_host (C)
Blockly + arena canvas           sem dependências            vm.c + física + hal_sim
```

### Topologia — com a ESP32

```
navegador ──WebSocket binário──► ESP32 (modo AP, 192.168.4.1)
Blockly                          vm.c + hal_esp32
```

A página é a mesma. O protocolo é o mesmo. O `vm.c` é o mesmo arquivo. Só muda o
endereço para onde o navegador aponta, e o painel da arena some (o robô real se
move no mundo real).

## Bytecode

Instrução de 7 bytes, todos os campos little-endian:

```
byte 0    : op   (uint8)
bytes 1-2 : a    (int16)
bytes 3-4 : b    (int16)
bytes 5-6 : c    (int16)
```

| op | nome        | semântica                                    |
|----|-------------|----------------------------------------------|
| 0  | `HALT`      | `hal_motors(0,0)`; para a execução           |
| 1  | `MOTOR`     | `hal_motors(a, b)`                           |
| 2  | `WAIT`      | espera `a` ms sem bloquear                   |
| 3  | `TURN`      | gira `a` graus (positivo = direita)          |
| 4  | `SET_REG`   | `r[a] = b`                                   |
| 5  | `DEC_JNZ`   | `if (--r[a] != 0) pc = b;` senão `pc++`      |
| 6  | `JMP`       | `pc = a`                                     |
| 7  | `JMP_IF_GE` | `if (sensor[a] >= b) pc = c;` senão `pc++`   |

Quatro registradores (`r0`..`r3`), o que permite laços aninhados até 4 níveis.
Um programa é no máximo 256 instruções (1792 bytes). O exemplo acima compila
para 7 instruções, 49 bytes.

IDs de sensor: `0` = distância em cm (ultrassônico). Único sensor da v1.

### Constantes de calibração (`core/vm.h`)

```c
#define VEL_FRENTE   200   /* PWM usado pelos blocos de movimento */
#define VEL_GIRO     180   /* PWM usado durante TURN              */
#define MS_POR_GRAU    5   /* 90° ≈ 450 ms                        */
```

`MS_POR_GRAU` é o ponto de calibração real quando o robô físico existir. A
física do simulador usa as mesmas constantes de motor, então o giro virtual e o
giro real divergem apenas na medida em que a física estiver mal calibrada — e
essa divergência é visível e ajustável num único lugar.

## A VM não bloqueia

`vm_tick()` executa no máximo uma instrução e retorna. É o que faz o botão STOP
responder na hora e, na ESP32, o que impede o Wi-Fi de travar.

```c
void vm_tick(VM *vm) {
    if (!vm->rodando) return;
    uint32_t agora = hal_millis();
    if (agora < vm->esperar_ate) return;
    if (vm->parar_ao_fim) { hal_motors(0, 0); vm->parar_ao_fim = 0; }
    if (vm->pc >= vm->n_instr) { vm_halt(vm); return; }
    Instr *i = &vm->prog[vm->pc];
    switch (i->op) { /* ... */ }
}
```

`WAIT` apenas anota `esperar_ate = agora + a` e avança o `pc`. `TURN` liga os
motores em sentidos opostos, anota o prazo e marca `parar_ao_fim`, de modo que o
tick seguinte ao prazo desliga os motores antes de executar a próxima instrução.

### Segurança

**Watchdog de motor.** A VM grava o instante do último `vm_tick()`. A função
`vm_watchdog_check(uint32_t agora)` corta os motores e para a execução se
passaram mais de 500 ms desde então.

O ponto essencial é que essa função é chamada por um caminho **independente do
laço da VM**, senão o watchdog morre junto com o que deveria vigiar:

| camada     | quem chama `vm_watchdog_check`         |
|------------|----------------------------------------|
| `hal_sim`  | laço de física, a 50 Hz                |
| `hal_esp32`| timer de hardware, a 20 Hz             |

**PC fora de faixa** ou **opcode desconhecido** param a execução com os motores
desligados, em vez de comportamento indefinido.

## Destaque do bloco em execução

O gerador do Blockly roda **no navegador** e produz duas saídas:

1. o array de bytes enviado ao robô;
2. um mapa `pc → blockId`, que **fica só no navegador**.

Por isso o firmware devolve apenas o número do `pc`. O navegador consulta o mapa
e chama `workspace.highlightBlock(id)`. Menos bytes no fio, e o firmware não
precisa saber nada sobre Blockly.

Para não inundar o WebSocket, o pacote `PC` só é enviado quando o `pc` muda, e no
máximo a cada 30 ms.

## Protocolo WebSocket

Binário, idêntico no simulador e na ESP32. Primeiro byte é o tipo.

**Navegador → robô**

| byte | nome   | payload                                    |
|------|--------|--------------------------------------------|
| 0x01 | `LOAD` | `n` (uint16) + `n`×7 bytes de instrução    |
| 0x02 | `RUN`  | —                                          |
| 0x03 | `STOP` | —                                          |

`LOAD` implica `STOP`: carregar um programa novo sempre interrompe o anterior e
zera os motores. `LOAD` com `n > 256` ou com tamanho de payload inconsistente é
descartado, e o programa anterior permanece intacto.

**Robô → navegador**

| byte | nome    | payload                                              |
|------|---------|------------------------------------------------------|
| 0x81 | `PC`    | `pc` (uint16)                                        |
| 0x82 | `STATE` | `estado` (uint8: 0 parado, 1 rodando)                |
| 0x83 | `TELEM` | `x`,`y` (int16, mm), `theta` (int16, décimos de grau), `dist` (uint16, cm) |

`TELEM` existe apenas no simulador — é o que desenha a arena. O firmware da
ESP32 não envia esse pacote, e o navegador simplesmente esconde o painel da
arena quando nenhum `TELEM` chega.

### Ponte bridge ↔ host (texto, só no modo de teste)

Linhas terminadas em `\n`, para ser legível e depurável no terminal:

```
bridge → host:   L <hex>      carrega programa
                 R            roda
                 S            para
host → bridge:   P <pc>
                 T <x> <y> <theta> <dist>
                 E <0|1>
```

O bridge traduz entre esse texto e o WebSocket binário. O navegador nunca vê a
diferença — é essa a razão de o protocolo binário existir mesmo no modo de teste.

## Blocos da v1

```
▶ quando apertar PLAY
  ┌─ repetir [4] vezes
  │   andar frente [1] s
  │   ┌─ se obstáculo a menos de [20] cm
  │   │    girar direita
  │   └─
  └─
```

| bloco                        | bytecode gerado                                    |
|------------------------------|----------------------------------------------------|
| `andar frente [n] s`         | `MOTOR 200,200` ; `WAIT n*1000` ; `MOTOR 0,0`       |
| `andar trás [n] s`           | `MOTOR -200,-200` ; `WAIT n*1000` ; `MOTOR 0,0`     |
| `girar direita`              | `TURN 90`                                          |
| `girar esquerda`             | `TURN -90`                                         |
| `esperar [n] s`              | `WAIT n*1000`                                      |
| `repetir [n] vezes { corpo }`| `SET_REG rk,n` ; corpo ; `DEC_JNZ rk,inicio_corpo`  |
| `se obstáculo < [n] cm { c }`| `JMP_IF_GE 0,n,depois` ; corpo ; `depois:`          |

O bloco raiz `quando apertar PLAY` fecha o programa com `HALT`.

Giro é fixo em 90°. A VM aceita qualquer ângulo; a v1 simplesmente não expõe
isso na interface.

## Física do simulador

Tração diferencial, integrada a 50 Hz:

```
v     = (vE + vD) / 2 · k
omega = (vD - vE) / L · k
```

- entre-eixos `L` = 0,12 m
- velocidade máxima (PWM 255) = 0,30 m/s

Esses dois valores não são livres: junto com `VEL_GIRO = 180`, eles determinam a
velocidade angular do giro (3,53 rad/s), e é ela que precisa bater com
`MS_POR_GRAU = 5`. Com esses números, `TURN 90` gira 91° — 1% de erro, dentro do
que um robô real entrega. Mexer em um exige recalcular os outros.
- arena 2 m × 2 m com paredes e obstáculos retangulares, definida como constante
  em `physics.c` (v1 não tem editor de arena)
- ultrassônico = raio a partir da frente do robô até a parede ou obstáculo mais
  próximo, limitado a 2–400 cm
- colisão: o robô para ao encostar numa parede ou obstáculo e não a atravessa

Sem ruído no sensor: a simulação precisa ser determinística para os testes
serem confiáveis.

## Estrutura de arquivos

```
core/       vm.c  vm.h  hal.h  bytecode.h     compartilhado entre PC e ESP32
host/       main.c  physics.c  physics.h  hal_sim.c  Makefile
firmware/   src/main.cpp  src/hal_esp32.cpp  platformio.ini
bridge/     server.js                        WS + arquivos estáticos, zero deps
web/        index.html  blocks.js  generator.js  arena.js  net.js  vendor/blockly.min.js
tests/      vm_test.c  fake_hal.c
```

`bridge/server.js` usa apenas `http`, `crypto` e `net` — módulos embutidos do
Node. Não há `npm install`, o que mantém o projeto funcionando offline.

Blockly é **vendorizado** em `web/vendor/`, nunca por CDN: a ESP32 vai servir
esses arquivos sem acesso à internet. Precisa ser baixado uma única vez durante a
implementação.

## Testes

`tests/vm_test.c` liga a VM a um HAL falso que grava um trace de chamadas, com
relógio controlado pelo teste e leituras de sensor roteirizadas. Compila com
`gcc`, roda em milissegundos.

Os testes são escritos antes da VM.

Casos:

1. programa vazio → `HALT` imediato, motores em zero
2. sequência linear produz o trace esperado
3. `repetir 3×` executa o corpo exatamente 3 vezes
4. laço aninhado (2× dentro de 3×) → 6 execuções, registradores independentes
5. `JMP_IF_GE` com sensor abaixo do limiar → entra no corpo
6. `JMP_IF_GE` com sensor acima do limiar → pula o corpo
7. `WAIT` não avança o `pc` antes do prazo, e avança depois
8. `TURN` desliga os motores ao fim do prazo
9. `STOP` no meio da execução zera os motores imediatamente
10. watchdog corta os motores após 500 ms sem tick
11. `pc` fora de faixa e opcode desconhecido param com segurança
12. programa dourado: o exemplo `repetir 4 { frente 1s; girar direita }` produz o
    trace completo esperado

O caso 12 é o contrato do sistema. Se ele passar, o robô real anda igual ao
virtual.

## Fora de escopo nesta versão

Deliberadamente adiado para um ciclo seguinte, depois que blocos → PLAY → robô
estiver de pé:

- salvar e carregar projetos da criança
- persistência em NVS e autostart ao ligar o robô
- sensor seguidor de linha (TCRT5000)
- variáveis e contadores expostos como blocos
- design visual definitivo da interface

## Hardware alvo

ESP32 DevKit, driver TB6612FNG, dois motores DC com caixa de redução, roda boba,
2× 18650, HC-SR04. A ESP32 opera em modo AP: cria a rede do próprio robô, sem
depender de roteador, e serve a interface por HTTP puro em `192.168.4.1` com os
arquivos gzipados no LittleFS.

Servir a interface a partir da própria placa evita o bloqueio de *mixed content*
— um site HTTPS não consegue abrir uma conexão `ws://` insegura para a ESP32.
