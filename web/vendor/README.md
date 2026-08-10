# Bibliotecas de terceiros

## Blockly 8.0.5

`blockly_compressed.js` e `pt-br.js` são o [Blockly](https://developers.google.com/blockly),
da Google, sob licença Apache 2.0 — o texto está em `LICENSE-blockly`.

Vendorizado, nunca por CDN, por duas razões:

- A ESP32 serve esses arquivos sem acesso à internet.
- A versão 8 é a **última compilada em ES5**. Da 9 em diante o Blockly usa
  arrow functions e `let`/`const`, que o Safari do iOS 9 não lê — num iPad 2 a
  página nem chega a carregar. Não atualize sem antes decidir que tablets
  antigos deixaram de importar.
