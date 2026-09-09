#!/usr/bin/env bash
# Copia web/ para firmware/data/ e comprime, para caber no LittleFS.
set -eu

cd "$(dirname "$0")"
rm -rf data
mkdir -p data/vendor/media data/img

cp ../web/*.html ../web/*.js data/
cp ../web/vendor/*.js data/vendor/
cp ../web/vendor/media/* data/vendor/media/
cp ../web/img/* data/img/

# O %VERSAO% do cabeçalho, como no android/preparar_assets.sh. Sem isto a placa
# mostra o marcador cru — justo onde ele mais serve: num tablet ligado no
# Robo-01 não há console nem jeito de perguntar qual versão está no ar, e a
# pergunta "é cache?" já custou horas neste projeto.
VERSAO=$(git -C .. rev-parse --short HEAD 2>/dev/null || echo "solto")
sed -i "s/%VERSAO%/$VERSAO/g" data/*.html

# O ESPAsyncWebServer serve o .gz automaticamente quando só ele existe.
# PNG já vem comprimido; gzipar de novo só gasta CPU da placa para reexpandir.
find data \( -name '*.js' -o -name '*.html' \) | while read -r f; do
    gzip -9 "$f"
done

echo "tamanho total:"
du -sh data
