#!/bin/bash
# update.sh — Actualización semanal del portal Fútbol Base Las Palmas
#
# Uso:
#   ./scripts/update.sh
#
# Requiere: datos-fuente/fiflp_cookies.txt con la cookie de sesión FIFLP
#   1. Abre fiflp.com en Chrome y asegúrate de estar logueado.
#   2. F12 → Application → Cookies → www.fiflp.com
#   3. Copia el valor de PHPSESSID y ponlo en datos-fuente/fiflp_cookies.txt
#      Ejemplo: PHPSESSID=abc123ef4567

set -e
cd "$(dirname "$0")/.."

echo "=== Fútbol Base Las Palmas — Actualización ==="
echo ""

# 1. Descargar nuevas actas de FIFLP
echo "► Paso 1: Descargando actas de FIFLP..."
python3 scripts/fetch_fiflp.py || true   # no abortar si no hay cookie
echo ""

# 2. Regenerar data-matchdetail.js
echo "► Paso 2: Generando data-matchdetail.js..."
python3 scripts/build_matchdetail.py
echo ""

# 3. Actualizar clasificaciones, jornadas y campos desde futbolaspalmas.com
echo "► Paso 3: Actualizando datos desde futbolaspalmas.com..."
python3 scripts/fetch_futbolaspalmas.py
echo ""

# 4. Publicar en GitHub Pages
echo "► Paso 4: Publicando en GitHub..."
git add data-benjamin.js data-prebenjamin.js data-matchdetail.js data-goleadores.js data-history.js app.js style.css index.html
if git diff --cached --quiet; then
  echo "  Sin cambios que publicar."
else
  FECHA=$(date "+%d/%m/%Y %H:%M")
  git commit -m "Actualización $FECHA"
  git push
  echo "  ✓ Publicado en https://malolocabreralolo-tech.github.io/futbol-base/"
fi
echo ""

echo "=== Listo ==="
