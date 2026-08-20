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

`media/` é a pasta de imagens e sons da mesma versão 8.0.5, tirada do pacote
oficial no npm. Ela ficou de fora na primeira vez, e o efeito só aparecia na
placa: sem a opção `media` apontando para cá, o Blockly busca a lixeira, as
lupas de zoom e os cursores no servidor dele. No computador, que tem internet,
tudo aparecia; na ESP32, que não tem, os ícones sumiam. Quem liga as duas
pontas é o `media: 'vendor/media/'` no `web/app.js`.
