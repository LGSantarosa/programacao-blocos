CC     ?= cc
CFLAGS  = -std=gnu11 -Wall -Wextra -Werror -O2 -I../core -I.
LDLIBS  = -lm

.PHONY: all clean

all: robo_host

robo_host: main.c laco.c hal_sim.c relogio.c physics.c ../core/vm.c
	$(CC) $(CFLAGS) -o $@ $^ $(LDLIBS)

clean:
	rm -f robo_host
