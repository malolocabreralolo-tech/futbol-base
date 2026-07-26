#!/bin/bash
# update.sh — Actualización manual del portal Fútbol Base Las Palmas
#
# Uso:
#   bash scripts/update.sh            # scrapea, comprueba y publica
#   bash scripts/update.sh --local    # todo menos el push
#
# Hace lo mismo que el workflow «Actualización automática» (update.yml), que es
# quien lo hace de verdad cada ~5 horas. Esto es la vía manual para cuando hace
# falta empujar una actualización sin esperar al cron.
#
# La versión anterior de este script llevaba tiempo muerta: llamaba a
# scripts/build_matchdetail.py, que ya no existe, y publicaba un app.js que
# ahora vive en src/, sin la base de datos ni el service worker.

set -e
cd "$(dirname "$0")/.."

PUBLICAR=1
[ "$1" = "--local" ] && PUBLICAR=0

echo "=== Fútbol Base Las Palmas — Actualización ==="

# 1. Scrapear la temporada en curso y regenerar los data-*.js.
#    fetch_futbolaspalmas.py llama a generate_js.py al terminar, así que este
#    paso deja la base y los ficheros publicados al día.
#    Si la fuente ha cambiado de temporada, el guard de standings_regression
#    aborta aquí a propósito: ver docs/temporada-nueva.md.
echo ""
echo "► 1/3 Scrapeando futbolaspalmas.com y regenerando…"
python3 scripts/fetch_futbolaspalmas.py

# 2. Las suites ANTES de publicar, igual que en el workflow: una suite roja
#    tiene que impedir la publicación, no descubrirse después.
echo ""
echo "► 2/3 Comprobando (pytest + node)…"
python3 -m pytest scripts/tests/ -q
node --test scripts/tests/test_*.mjs

# 3. Publicar. La lista de ficheros es la misma que la de update.yml: la base
#    solo se commitea si además cambió algo publicado, para no llenar el
#    historial de commits de cabecera SQLite sin cambio lógico (contrato C4).
echo ""
echo "► 3/3 Publicando…"
git add 'data-*.js' index.html sw.js
if git diff --cached --quiet; then
  echo "  Sin cambios que publicar."
  git reset -q
  exit 0
fi
git add futbolbase.db
git commit -q -m "Actualización $(date '+%d/%m/%Y %H:%M')"
if [ "$PUBLICAR" = "1" ]; then
  git pull --rebase -q origin main
  git push -q
  echo "  ✓ Publicado en https://malolocabreralolo-tech.github.io/futbol-base/"
else
  echo "  ✓ Commit local hecho (sin push, --local)."
fi
