# Um comando só, para não ter que decorar cinco linhas em cinco pastas.
#
#   make            compila o robô virtual
#   make subir      compila e levanta o servidor em http://localhost:8080
#   make test       o que roda em segundos: C, ponta a ponta e JS
#   make test-lento os dois que sobem Chromium: gabaritos e navegador (~5 min)
#   make test-tudo  tudo acima, mais o firmware e o app Android
#   make limpar     joga fora os binários
#
# O firmware e o Android ficam fora do `make test` de propósito: um precisa do
# PlatformIO e o outro do SDK do Android, e quem chegou agora no projeto não
# tem os dois. Nada aqui usa npm — o projeto não tem uma dependência sequer.

PORTA ?= 8080

.PHONY: all subir test test-lento test-tudo test-firmware test-android limpar

all:
	$(MAKE) -C host

subir: all
	PORTA=$(PORTA) node bridge/server.js

test: all
	$(MAKE) -C tests test
	./tests/host_test.sh
	node --test tests/

# Os dois que sobem Chromium levam uns cinco minutos, quase todos do
# gabaritos.test.js. Ficam fora do `make test` para quem mexeu numa cor não
# esperar por eles — mas rodar isto antes de commitar continua sendo a regra.
test-lento: all
	TESTES_LENTOS=1 node --test tests/gabaritos.test.js tests/navegador.test.js

# O `pio run` e o `gradlew` baixam mundo na primeira vez; por isso separados.
test-tudo: test test-lento test-firmware test-android

test-firmware:
	cd firmware && pio run

test-android:
	cd android && ./gradlew testDebugUnitTest

limpar:
	$(MAKE) -C host clean
	$(MAKE) -C tests clean
