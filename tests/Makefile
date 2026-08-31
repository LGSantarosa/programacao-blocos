CC     ?= cc
CFLAGS  = -std=gnu11 -Wall -Wextra -Werror -g -I../core -I../host -I.
LDLIBS  = -lm

.PHONY: test clean

test: vm_test physics_test quadros_test laco_test
	./vm_test
	./physics_test
	./quadros_test
	./laco_test

vm_test: vm_test.c fake_hal.c ../core/vm.c
	$(CC) $(CFLAGS) -o $@ $^ $(LDLIBS)

physics_test: physics_test.c ../host/physics.c
	$(CC) $(CFLAGS) -o $@ $^ $(LDLIBS)

# O montador é C puro e sem Arduino de propósito: é o que permite testá-lo aqui
# na mesa, sem placa.
quadros_test: quadros_test.c
	$(CC) $(CFLAGS) -I../firmware/src -o $@ $^ $(LDLIBS)

# O laço do robô virtual sem a casca de stdio: física e VM de verdade, só o
# relógio é falso.
laco_test: laco_test.c relogio_falso.c ../host/laco.c ../host/hal_sim.c \
           ../host/physics.c ../core/vm.c
	$(CC) $(CFLAGS) -o $@ $^ $(LDLIBS)

clean:
	rm -f vm_test physics_test quadros_test laco_test
