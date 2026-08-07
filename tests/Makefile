CC     ?= cc
CFLAGS  = -std=gnu11 -Wall -Wextra -Werror -g -I../core -I../host -I.
LDLIBS  = -lm

.PHONY: test clean

test: vm_test physics_test
	./vm_test
	./physics_test

vm_test: vm_test.c fake_hal.c ../core/vm.c
	$(CC) $(CFLAGS) -o $@ $^ $(LDLIBS)

physics_test: physics_test.c ../host/physics.c
	$(CC) $(CFLAGS) -o $@ $^ $(LDLIBS)

clean:
	rm -f vm_test physics_test
