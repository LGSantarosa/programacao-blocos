#!/usr/bin/env bash
# Copia web/ para firmware/data/ e comprime, para caber no LittleFS.
set -eu

cd "$(dirname "$0")"
rm -rf data
mkdir -p data/vendor

cp ../web/*.html ../web/*.js data/
cp ../web/vendor/*.js data/vendor/

# O ESPAsyncWebServer serve o .gz automaticamente quando só ele existe.
find data -name '*.js' -o -name '*.html' | while read -r f; do
    gzip -9 "$f"
done

echo "tamanho total:"
du -sh data
