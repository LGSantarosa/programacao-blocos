# Exportar o programa para `.ino` — design

Data: 2026-08-17

Continuação de
[`2026-08-11-troca-de-nivel-design.md`](2026-08-11-troca-de-nivel-design.md),
que está implementado e no ar.

## Objetivo

Os três níveis crescem com a criança e o Grande é o teto: acabaram os blocos. Este
ciclo abre a porta de saída. O programa montado na tela vira um arquivo `.ino` que
ela **lê** — e se reconhece nele — e depois **grava** num robô de verdade.

A ordem importa e é a decisão de partida: legível primeiro, gravável em seguida. O
arquivo não pode ser um despejo de máquina que por acaso compila; ele tem que ser o
programa dela, escrito em outra língua. Mas também não pode ser pseudocódigo
bonito que não anda — porque a promessa é justamente sair do brinquedo e entrar na
ferramenta dos adultos, e ferramenta que não funciona não é ferramenta.

## A terceira saída da mesma AST

`web/blocos.js` traduz o workspace do Blockly numa árvore. Hoje ela alimenta dois
consumidores; passa a alimentar três:

```
                          ┌─► web/compilador.js ─► bytecode de 7 bytes ─► a VM
web/blocos.js ─► AST ─────┼─► web/gabarito.js   ─► blocos, na língua do nível
                          └─► web/arduino.js    ─► texto C++            (novo)
```

`web/arduino.js` recebe a AST e devolve uma string. Sem DOM, sem Blockly, ES5,
IIFE com `module.exports` — igual aos irmãos, e pelo mesmo motivo: assim ele se
testa em Node em milissegundos, e não só no Chromium quatro minutos depois.

Duas alternativas foram descartadas:

- **Gerar a partir do bytecode.** Seria fiel ao que a placa executa, e produziria
  rótulos e `goto`. O ponto do ciclo é ela se reconhecer no texto; uma tradução
  fiel da máquina não se parece com o que ela montou.
- **Um `.ino` com mini-interpretador e tabela de instruções.** É a VM outra vez,
  agora dentro do sketch. Ela veria o motor, não o programa dela.

## O arquivo gerado

Ordem fixa: cabeçalho, pinos, `fiacao()`, as funções de apoio que o programa usa,
`programa()`, `setup()`, `loop()`.

Exemplo completo, para `repetir 3 { andar 1 s; girar 90 }` seguido de
`se obstáculo < 20 cm { parar tudo }`:

```cpp
/* Robô de Blocos — o seu programa, virado código Arduino.
   Placa: ESP32 dev  •  Motores: TB6612FNG  •  Sensor: HC-SR04

   Salve este arquivo numa pasta chamada robo/ — o Arduino IDE pede isso, e
   oferece criar a pasta sozinho quando você abre. Pode dizer que sim.

   Gravar este arquivo APAGA a tela de blocos que mora na placa.
   Para voltar aos blocos: grave o firmware de novo (pasta firmware/).

   Ao ligar, o robô espera 3 segundos e roda o programa uma vez. */

const int PWMA = 25, AIN1 = 26, AIN2 = 27;   /* motor esquerdo */
const int PWMB = 33, BIN1 = 14, BIN2 = 12;   /* motor direito  */
const int STBY = 13;
const int TRIG = 5, ECHO = 18;               /* sensor de distância */

void fiacao() {
  pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT);
  pinMode(BIN1, OUTPUT); pinMode(BIN2, OUTPUT);
  pinMode(STBY, OUTPUT); digitalWrite(STBY, HIGH);
  pinMode(TRIG, OUTPUT); digitalWrite(TRIG, LOW);
  pinMode(ECHO, INPUT);
}

/* Velocidade de -255 a 255. Negativo é para trás. */
void motores(int esq, int dir) {
  digitalWrite(AIN1, esq >= 0 ? HIGH : LOW);
  digitalWrite(AIN2, esq >= 0 ? LOW : HIGH);
  analogWrite(PWMA, abs(esq));
  digitalWrite(BIN1, dir >= 0 ? HIGH : LOW);
  digitalWrite(BIN2, dir >= 0 ? LOW : HIGH);
  analogWrite(PWMB, abs(dir));
}

void parar() { motores(0, 0); }

void andarFrente(float segundos, int velocidade) {
  motores(velocidade, velocidade);
  delay(segundos * 1000);
  parar();
}

/* Gira no lugar: um motor para frente, o outro para trás. 5 ms por grau,
   a 180 de velocidade — a mesma conta que o robô de blocos usa. */
void girar(int graus) {
  int v = graus >= 0 ? 180 : -180;
  motores(v, -v);
  delay(abs(graus) * 5);
  parar();
}

int distanciaCm() {
  digitalWrite(TRIG, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long us = pulseIn(ECHO, HIGH, 25000UL);
  if (us == 0) return 400;              /* não voltou eco: nada por perto */
  int cm = us / 58;
  if (cm < 2) cm = 2;
  if (cm > 400) cm = 400;
  return cm;
}

void programa() {
  for (int i = 0; i < 3; i++) {
    andarFrente(1.0, 200);
    girar(90);
  }
  if (distanciaCm() < 20) {
    parar();
    return;
  }
}

void setup() {
  fiacao();
  delay(3000);        /* tempo de pôr o robô no chão e tirar a mão */
  programa();
  parar();
}

void loop() {
}
```

### A tabela de tradução

| bloco | C++ |
|---|---|
| `andar frente [n] s [v]` | `andarFrente(n, v);` |
| `andar trás [n] s [v]` | `andarTras(n, v);` |
| `girar [g] graus` | `girar(g);` |
| `esperar [n] s` | `esperar(n);` |
| `repetir [n] vezes { c }` | `for (int i = 0; i < n; i++) { c }` |
| `repetir para sempre { c }` | `while (true) { c }` |
| `repetir até < [n] cm { c }` | `while (distanciaCm() >= n) { c }` |
| `se obstáculo < [n] cm { c }` | `if (distanciaCm() < n) { c }` |
| `se…senão < [n] cm` | `if (…) { … } else { … }` |
| `parar tudo` | `parar(); return;` |

As funções de apoio, e quando cada uma é emitida:

| função | emitida quando |
|---|---|
| `motores`, `parar` | sempre — `setup()` chama `parar()` |
| `fiacao` | sempre |
| `andarFrente` | há `frente` |
| `andarTras` | há `tras` |
| `girar` | há `girar` |
| `esperar` | há `esperar` |
| `distanciaCm` | há `se_obstaculo`, `se_senao` ou `repetir_ate_perto` |

A única que o exemplo acima não mostra é o `esperar`, que é uma linha:

```cpp
void esperar(float segundos) {
  delay(segundos * 1000);
}
```

Os pinos do sensor (`TRIG`, `ECHO`) e as duas linhas dele no `fiacao()` seguem o
`distanciaCm()`: um programa que não sente nada não carrega o HC-SR04.

## As decisões dentro do arquivo

**`delay()` é a resposta certa, e a tensão guardada some.** A VM é não-bloqueante
porque precisa servir WebSocket e alimentar o vigia enquanto o robô anda. O `.ino`
não tem essas obrigações — `programa()` é a única coisa acontecendo na placa. E o
`delay()` do ESP32 cede o processador ao FreeRTOS, então o watchdog de tarefa fica
satisfeito. Aqui a forma legível e a forma correta são a mesma, o que não era
óbvio quando a dúvida foi anotada.

**`analogWrite`, não `ledcSetup`/`ledcWrite`.** O firmware usa `ledc` porque está
no core 2.x que o PlatformIO fixa. A criança vai abrir isso no Arduino IDE, que
hoje instala o core 3.x, onde aquela API mudou de assinatura e o sketch não
compilaria. `analogWrite` funciona nos dois, tem 8 bits de resolução — 0 a 255,
exatamente a faixa dos blocos — e é o que ela encontra em qualquer tutorial.

**As constantes são cópia, e cópia precisa de guarda.** `180` e `5` vivem em
`core/vm.h` (`VEL_GIRO`, `MS_POR_GRAU`); os nove pinos, em
`firmware/src/hal_esp32.cpp`. Se a calibração mudar de um lado só, o `.ino` passa a
girar diferente do robô e a criança conclui que o código está errado — que é o
oposto do que este ciclo quer ensinar. Um teste lê os dois arquivos C e afirma que
os números batem.

**Emitir na ordem de uso.** Helpers antes do `programa()`, `setup()` e `loop()` por
último. O Arduino IDE gera protótipos sozinho e perdoaria qualquer ordem; o `g++`
não perdoa — e é justamente por isso que a regra vale, porque ela deixa o arquivo
ser conferido por um compilador de verdade nos testes. O arquivo que compila nos
dois também é o mais legível dos dois: lê-se de cima para baixo.

**Espelhar os limites do compilador, não os da VM.** O `.ino` aplica as mesmas
normalizações que o `web/compilador.js`, porque elas são sobre o que o bloco
significa:

- velocidade ausente ou inválida vira `200`; acima de `255`, satura em `255`;
- `repetir n` usa `Math.max(1, Math.round(n))`;
- segundos saem sempre com uma casa (`0.5`, `1.0`, `2.5`), que é a precisão do
  campo; centímetros e graus, inteiros.

Mas **não** herda o teto de 256 instruções nem o de 4 `repetir` aninhados: esses
são limites dos 7 bytes e dos 4 registradores da VM, não do C++. Um programa que o
PLAY recusa por tamanho ainda exporta.

**Nomes de laço por profundidade:** `i`, `j`, `k`, `l`, e daí em diante `i5`, `i6`.
Reusar `i` num laço aninhado sombrearia o de fora, e o interno zeraria o contador
do externo — um defeito silencioso que só apareceria no robô andando errado.

**Quando o programa roda.** `setup()` faz a fiação, espera 3 s e chama `programa()`
uma vez; `loop()` fica vazio. Não há botão PLAY na placa: o PLAY hoje chega pela
rede, e gravar o `.ino` apaga justamente o firmware que servia essa rede. O RESET
vira o PLAY, e os 3 s são o tempo de pôr o robô no chão e tirar a mão. Pôr o
programa no `loop()` seria o formato que ela vê em todo tutorial, mas mentiria
sobre o que os blocos dela dizem — eles rodam uma vez.

**Programa vazio gera arquivo mesmo assim**, com um `programa()` de corpo vazio.
Ela montou nada, o código é nada. Erro na tela seria pior.

**O robô vai chiar, e o arquivo avisa.** O firmware configura o PWM em 20 kHz
justamente para ficar acima da audição. O `analogWrite` do Arduino usa ~1 kHz, e
1 kHz num motor pequeno é um apito audível. Dá para corrigir com
`analogWriteFrequency`, mas a assinatura dessa função mudou entre o core 2.x e o
3.x, e resolver isso exigiria `#if` no meio de um arquivo que uma criança de dez
anos vai ler — o remédio custaria mais que a doença. A escolha é aceitar o chiado
e explicá-lo em uma linha de comentário no `fiacao()`, para que o barulho seja uma
diferença compreendida e não um defeito.

## A interface

**Só no nível Grande.** É o degrau seguinte ao teto. No Pequeno e no Médio o botão
seria mais uma escolha na tela de quem ainda está aprendendo a ler — e o código
mostraria números que aqueles níveis escondem de propósito.

**O botão.** `{ } ver código`, no cabeçalho, depois do grupo de níveis e antes do
🔊. Nasce conforme `Niveis.atual()` e é atualizado dentro do `aplicarTroca()`, no
mesmo ponto que já chama `marcarNivel()`.

**Não depende do robô.** Diferente do PLAY, que fica desabilitado sem conexão,
gerar código é operação de papel: roda com a placa desligada, com o robô virtual,
com o que for. Ela pode olhar o código sem ter robô nenhum por perto.

**O painel** reusa o desenho do diálogo de troca de nível (`#confirma`,
`web/index.html:292`): sobreposição `position: fixed`, atributo `hidden`, `Esc`
fecha, clique no fundo fecha. Mesma família visual e mesmo comportamento já
aprendido. Dentro, um `<pre>` monoespaçado com rolagem própria e dois botões,
`baixar` e `fechar`.

**O download** é `Blob` + `URL.createObjectURL` + `<a download="robo.ino">`. No
iPad 2 nada disso existe, e a saída não é um botão que finge: faltando
`window.Blob` ou o atributo `download`, o botão `baixar` não é criado. Sobra o
texto na tela para selecionar, que era o plano para o tablet desde o começo. Botão
morto ensina a criança a desconfiar da tela.

**Restrições de plataforma**, herdadas: sem `<dialog>`, sem `var()`, sem `gap`,
sem `aspect-ratio`, sem `inset`. O `web/arduino.js` é ES5 como todo o resto — o
`tests/es5.test.js` já o cobre de graça, porque varre todo `web/*.js`.

## Testes

| onde | o quê | custo |
|---|---|---|
| `tests/arduino.test.js` | a tradução, bloco a bloco | ms |
| `tests/arduino.test.js` | a guarda das constantes contra `core/vm.h` e `firmware/src/hal_esp32.cpp` | ms |
| `tests/arduino.test.js` | `g++ -fsyntax-only` sobre um sketch gerado | ms |
| `tests/navegador.test.js` | o botão só existe no Grande; abrir mostra código | dentro do teste que já existe |

O que `tests/arduino.test.js` precisa cobrir:

1. **Um caso por bloco**, conferindo o texto emitido contra a tabela de tradução.
2. **Aninhamento** de `repetir` dentro de `repetir` usa `i` e depois `j`.
3. **Só o que usa:** programa sem sensor não contém `pulseIn`; sem giro, não
   contém `girar(`.
4. **`parar tudo`** emite `parar(); return;` mesmo dentro de dois laços — é o que
   faz o bloco significar a mesma coisa nos dois mundos.
5. **As normalizações** — velocidade padrão, saturação em 255, `repetir` mínimo 1,
   segundos com uma casa.
6. **A guarda das constantes:** lê os dois arquivos C com regex e afirma que `180`,
   `5` e os nove pinos batem com os do `web/arduino.js`.

### Compilar o código gerado

Um `tests/fake_arduino.h` com os stubs (`pinMode`, `digitalWrite`, `analogWrite`,
`delay`, `delayMicroseconds`, `pulseIn`, as constantes `OUTPUT`, `INPUT`, `HIGH`,
`LOW`; o `abs` vem do `stdlib.h`), e um caso dentro do próprio
`tests/arduino.test.js` que gera um sketch, escreve num arquivo temporário com o
header incluído na frente e chama `g++ -fsyntax-only`.

Fica no teste em Node, e não num alvo do `tests/Makefile`, por dois motivos: o
Makefile compila C com `-std=gnu11` e isto é C++, e o sketch precisa ser gerado
por JavaScript antes de existir. Pula sozinho quando não há `g++`, no mesmo
padrão do teste de navegador sem Chromium.

Pega chave não fechada, vírgula a mais, função chamada com aridade errada — tudo
que de outro modo só apareceria com a criança na frente do Arduino IDE. É o mesmo
truque do `fake_hal.c`, que o projeto já usa para testar a VM sem hardware.

## Arquivos tocados

| arquivo | mudança |
|---|---|
| `web/arduino.js` | **novo** — AST → texto C++ |
| `web/app.js` | botão `ver código`, painel, download; visibilidade por nível |
| `web/index.html` | marcação do painel e o CSS dele |
| `tests/arduino.test.js` | **novo** — tradução, normalizações, guarda das constantes |
| `tests/fake_arduino.h` | **novo** — stubs para o `g++ -fsyntax-only` |
| `tests/navegador.test.js` | o botão por nível, e o painel que abre |
| `README.md` | a saída `.ino` na seção dos níveis, e o novo teste na seção de testes |
| `firmware/data/` | regravar (`preparar_data.sh`) — é gitignore, não entra em commit |
| `core/`, `host/`, `firmware/src/` | **nada** |

A exportação não toca na VM. Ela é uma leitura da mesma árvore, escrita noutra
língua.
