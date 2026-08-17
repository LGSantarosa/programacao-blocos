#!/usr/bin/env bash
# Alimenta o robo_host com o programa dourado e confere a saída.
set -u

cd "$(dirname "$0")/../host" || exit 1
make --silent || exit 1

# repetir 4 { frente 1s; girar direita } — o mesmo programa do teste dourado.
# Montado instrução por instrução de propósito: um literal de 196 dígitos é
# fácil demais de digitar errado, e o erro só aparece como "não rodou nada".
PROG=""
PROG="$PROG""08040000000000"   # pc  0: PUSH 4
PROG="$PROG""04000000000000"   # pc  1: SET_REG r0
PROG="$PROG""08c80000000000"   # pc  2: PUSH 200
PROG="$PROG""08c80000000000"   # pc  3: PUSH 200
PROG="$PROG""01000000000000"   # pc  4: MOTOR
PROG="$PROG""08e80300000000"   # pc  5: PUSH 1000
PROG="$PROG""02000000000000"   # pc  6: WAIT
PROG="$PROG""08000000000000"   # pc  7: PUSH 0
PROG="$PROG""08000000000000"   # pc  8: PUSH 0
PROG="$PROG""01000000000000"   # pc  9: MOTOR
PROG="$PROG""085a0000000000"   # pc 10: PUSH 90
PROG="$PROG""03000000000000"   # pc 11: TURN
PROG="$PROG""05000002000000"   # pc 12: DEC_JNZ r0, 2
PROG="$PROG""00000000000000"   # pc 13: HALT

if [ "${#PROG}" -ne 196 ]; then
    echo "  FALHOU: programa tem ${#PROG} dígitos hex, esperava 196"
    exit 1
fi

SAIDA=$( { printf 'L %s\nR\n' "$PROG"; sleep 7; } | ./robo_host )

falhas=0
verificar() {
    if printf '%s\n' "$SAIDA" | grep --quiet "$1"; then
        echo "  ok: $2"
    else
        echo "  FALHOU: $2"
        falhas=$((falhas + 1))
    fi
}

verificar '^E 1$' 'reportou que começou a rodar'
verificar '^P '   'reportou o pc'
verificar '^T '   'enviou telemetria'

# A última linha E precisa ser 0: o programa terminou sozinho.
ULTIMO_E=$(printf '%s\n' "$SAIDA" | grep '^E ' | tail -n 1)
if [ "$ULTIMO_E" = "E 0" ]; then
    echo "  ok: programa terminou sozinho"
else
    echo "  FALHOU: esperava 'E 0' no fim, veio '$ULTIMO_E'"
    falhas=$((falhas + 1))
fi

# O robô precisa ter girado: o dourado tem quatro TURN de 90 graus, então o
# ângulo tem que varrer a volta toda. Sem isto o teste passa mesmo se a VM
# morrer no primeiro WAIT — foi assim que o watchdog matando a espera passou
# despercebido.
N_THETA=$(printf '%s\n' "$SAIDA" | grep '^T ' | cut -d' ' -f4 | sort -un | wc -l)
if [ "$N_THETA" -gt 5 ]; then
    echo "  ok: robô girou ($N_THETA ângulos distintos)"
else
    echo "  FALHOU: robô não girou (só $N_THETA ângulo(s) distinto(s))"
    falhas=$((falhas + 1))
fi

# O pc reportado é o da instrução em efeito, não o da próxima. Enquanto o
# robô gira, quem tem que aparecer é o TURN (pc 11) — é ele que o navegador
# traduz para o bloco "girar" aceso. Reportar a próxima instrução acenderia o
# bloco "repetir" e o "girar" nunca acenderia.
if printf '%s\n' "$SAIDA" | grep --quiet '^P 11$'; then
    echo "  ok: reportou o TURN em efeito (pc 11)"
else
    echo "  FALHOU: nunca reportou o pc 4 — o bloco 'girar' não acenderia"
    falhas=$((falhas + 1))
fi

# E precisa ter chegado no HALT, que é a última instrução (pc 13).
if printf '%s\n' "$SAIDA" | grep --quiet '^P 13$'; then
    echo "  ok: chegou até o HALT"
else
    echo "  FALHOU: nunca chegou no HALT (pc 13) — parou no meio do programa"
    falhas=$((falhas + 1))
fi

# O robô precisa ter saído do lugar.
PRIMEIRO_Y=$(printf '%s\n' "$SAIDA" | grep '^T ' | head -n 1 | cut -d' ' -f3)
MAIOR_Y=$(printf '%s\n' "$SAIDA" | grep '^T ' | cut -d' ' -f3 | sort -n | tail -n 1)
if [ "$MAIOR_Y" -gt "$((PRIMEIRO_Y + 100))" ]; then
    echo "  ok: robô andou (y foi de ${PRIMEIRO_Y}mm a ${MAIOR_Y}mm)"
else
    echo "  FALHOU: robô mal saiu do lugar (${PRIMEIRO_Y}mm -> ${MAIOR_Y}mm)"
    falhas=$((falhas + 1))
fi

# A linha T precisa trazer cinco campos: x, y, theta, distância e colisão.
CAMPOS_T=$(printf '%s\n' "$SAIDA" | grep '^T ' | head -n 1 | wc -w)
if [ "$CAMPOS_T" -eq 6 ]; then
    echo "  ok: linha T tem os cinco campos mais o prefixo"
else
    echo "  FALHOU: linha T tem $CAMPOS_T palavras, esperava 6"
    falhas=$((falhas + 1))
fi

[ "$falhas" -eq 0 ] && echo "todos os testes passaram" && exit 0
echo "$falhas verificacao(oes) falharam"
exit 1
