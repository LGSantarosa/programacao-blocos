CC     ?= cc
CFLAGS  = -std=gnu11 -Wall -Wextra -Werror -g -I../core -I../host -I.
LDLIBS  = -lm

.PHONY: test clean

test: vm_test physics_test quadros_test laco_test
	./vm_test
	./physics_test
	./quadros_test
	./laco_test

# Ver o comentário no host/Makefile: sem os .h aqui, um teste pode passar
# contra o binário anterior à mudança que ele deveria estar provando.
CABECALHOS = fake_hal.h ../core/vm.h ../core/hal.h ../core/bytecode.h \
             ../host/physics.h ../host/laco.h

vm_test: vm_test.c fake_hal.c ../core/vm.c $(CABECALHOS)
	$(CC) $(CFLAGS) -o $@ $(filter %.c,$^) $(LDLIBS)

physics_test: physics_test.c ../host/physics.c $(CABECALHOS)
	$(CC) $(CFLAGS) -o $@ $(filter %.c,$^) $(LDLIBS)

# O montador é C puro e sem Arduino de propósito: é o que permite testá-lo aqui
# na mesa, sem placa.
quadros_test: quadros_test.c ../firmware/src/quadros.h
	$(CC) $(CFLAGS) -I../firmware/src -o $@ $(filter %.c,$^) $(LDLIBS)

# O laço do robô virtual sem a casca de stdio: física e VM de verdade, só o
# relógio é falso.
laco_test: laco_test.c relogio_falso.c ../host/laco.c ../host/hal_sim.c \
           ../host/physics.c ../core/vm.c $(CABECALHOS)
	$(CC) $(CFLAGS) -o $@ $(filter %.c,$^) $(LDLIBS)

clean:
	rm -f vm_test physics_test quadros_test laco_test
