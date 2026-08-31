#!/usr/bin/env bash
# Copia web/ para android/app/src/main/assets/. Roda antes de todo build.
set -eu

cd "$(dirname "$0")"
ALVO=app/src/main/assets
rm -rf "$ALVO"
mkdir -p "$ALVO/vendor/media" "$ALVO/img"

cp ../web/*.html ../web/*.js "$ALVO"/
cp ../web/vendor/*.js "$ALVO"/vendor/
cp ../web/vendor/media/* "$ALVO"/vendor/media/
cp ../web/img/* "$ALVO"/img/

# O %VERSAO% do cabeçalho: no bridge é o hash dos arquivos servidos, aqui é o
# commit. Sem isto a tela mostra "%VERSAO%" cru, que é o que a ESP32 faz hoje.
VERSAO=$(git -C .. rev-parse --short HEAD 2>/dev/null || echo "solto")
sed -i.bak "s/%VERSAO%/$VERSAO/g" "$ALVO"/*.html
rm -f "$ALVO"/*.html.bak

echo "assets prontos em $ALVO ($VERSAO)"
