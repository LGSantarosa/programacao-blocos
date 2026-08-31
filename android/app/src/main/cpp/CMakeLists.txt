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
target_link_libraries(robo m)
