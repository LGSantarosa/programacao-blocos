cmake_minimum_required(VERSION 3.22)
project(robo C)

set(RAIZ ${CMAKE_CURRENT_SOURCE_DIR}/../../../../..)

# O mesmo C que roda na mesa e na ESP32. Nenhum arquivo daqui é cópia:
# são os originais, compilados para um terceiro alvo.
add_library(robo SHARED
    ponte.c
    ${RAIZ}/core/vm.c
    ${RAIZ}/host/laco.c
    ${RAIZ}/host/hal_sim.c
    ${RAIZ}/host/relogio.c
    ${RAIZ}/host/physics.c
)

target_include_directories(robo PRIVATE ${RAIZ}/core ${RAIZ}/host)
target_compile_options(robo PRIVATE -std=gnu11 -Wall -Wextra -Werror -O2)

# Alinha os segmentos do .so a 16 KB. O NDK 26 ainda alinha a 4 KB, e os
# aparelhos novos usam página de 16 KB: sem isto a biblioteca simplesmente não
# carrega neles. O Android 16 já avisa disso na abertura. A partir do NDK 27
# este é o padrão e a linha vira supérflua — mas não atrapalha.
target_link_options(robo PRIVATE "-Wl,-z,max-page-size=16384")

target_link_libraries(robo m)
