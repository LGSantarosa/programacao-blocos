#!/usr/bin/env bash
# Alimenta o robo_host com o programa dourado e confere a saída.
set -u

cd "$(dirname "$0")/../host" || exit 1
make --silent || exit 1

# repetir 4 { frente 1s; girar direita } — o mesmo programa do teste dourado.
# Montado instrução por instrução de propósito: um literal de 98 dígitos é
# fácil demais de digitar errado, e o erro só aparece como "não rodou nada".
PROG=""
PROG="$PROG""04000004000000"   # SET_REG r0, 4
PROG="$PROG""01c800c8000000"   # MOTOR 200, 200
PROG="$PROG""02e80300000000"   # WAIT 1000
PROG="$PROG""01000000000000"   # MOTOR 0, 0
PROG="$PROG""035a0000000000"   # TURN 90
PROG="$PROG""05000001000000"   # DEC_JNZ r0, 1
PROG="$PROG""00000000000000"   # HALT

if [ "${#PROG}" -ne 98 ]; then
    echo "  FALHOU: programa tem ${#PROG} dígitos hex, esperava 98"
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

# O robô precisa ter saído do lugar.
PRIMEIRO_Y=$(printf '%s\n' "$SAIDA" | grep '^T ' | head -n 1 | cut -d' ' -f3)
MAIOR_Y=$(printf '%s\n' "$SAIDA" | grep '^T ' | cut -d' ' -f3 | sort -n | tail -n 1)
if [ "$MAIOR_Y" -gt "$((PRIMEIRO_Y + 100))" ]; then
    echo "  ok: robô andou (y foi de ${PRIMEIRO_Y}mm a ${MAIOR_Y}mm)"
else
    echo "  FALHOU: robô mal saiu do lugar (${PRIMEIRO_Y}mm -> ${MAIOR_Y}mm)"
    falhas=$((falhas + 1))
fi

[ "$falhas" -eq 0 ] && echo "todos os testes passaram" && exit 0
echo "$falhas verificacao(oes) falharam"
exit 1
