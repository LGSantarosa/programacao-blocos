CC     ?= cc
CFLAGS  = -std=gnu11 -Wall -Wextra -Werror -O2 -I../core -I.
LDLIBS  = -lm

.PHONY: all clean

all: robo_host

# Os .h entram como dependência: sem eles, mexer no ENTRE_EIXOS ou na
# calibração da VM não recompila nada, e o binário velho responde como se
# a mudança não existisse. Custou uma medição errada nesta investigação.
# O filter %.c na receita existe por causa disto: o $^ traz os .h junto, e o
# compilador tratado assim gera .gch em vez de compilar o programa.
CABECALHOS = physics.h laco.h ../core/vm.h ../core/hal.h ../core/bytecode.h

robo_host: main.c laco.c hal_sim.c relogio.c physics.c ../core/vm.c $(CABECALHOS)
	$(CC) $(CFLAGS) -o $@ $(filter %.c,$^) $(LDLIBS)

clean:
	rm -f robo_host
