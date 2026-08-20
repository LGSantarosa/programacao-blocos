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

# O ESPAsyncWebServer serve o .gz automaticamente quando só ele existe.
# PNG já vem comprimido; gzipar de novo só gasta CPU da placa para reexpandir.
find data \( -name '*.js' -o -name '*.html' \) | while read -r f; do
    gzip -9 "$f"
done

echo "tamanho total:"
du -sh data
