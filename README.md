# Fútbol Base Las Palmas

[Ver el portal](https://malolocabreralolo-tech.github.io/futbol-base/)

Resultados y seguimiento de Benjamín y Prebenjamín de Gran Canaria, Lanzarote y Fuerteventura. Sin publicidad.

## Para las familias

- Varios equipos favoritos guardados en el dispositivo.
- Próximo partido con fecha, hora canaria y campo cuando la fuente los publica; último resultado, posición y racha.
- Últimos cinco encuentros y calendario completo desplegable.
- Clasificaciones y jornadas con búsqueda por equipo, isla y fase.
- Enlaces directos a equipo, partido y jornada; copia y WhatsApp.
- Calendario `.ics` y enlace al mapa para campos conocidos.
- Goleadores, detalles disponibles y archivo desde 2021/22.
- Temas claro y oscuro, navegación móvil, teclado y PWA instalable.
- Información de cobertura y fuentes, con fechas separadas de comprobación y de cambio de datos.

Los marcadores ausentes se muestran como «sin resultado». La clasificación puede incluir partidos que no aparecen en el calendario. Las discrepancias entre la fuente y los resultados ya registrados se señalan en «Datos y fuentes».

## Desarrollo

HTML, módulos JavaScript y CSS, sin compilación. Python y SQLite generan los datos estáticos.

```bash
python3 -m http.server 8080
# Abrir http://localhost:8080
python3 -m pytest scripts/tests/ -q
node --test scripts/tests/test_*.mjs
node scripts/tests/render-smoke.mjs
npm install --no-save --package-lock=false playwright@1.58.0
node scripts/tests/interaction-smoke.mjs
node scripts/tests/pwa-smoke.mjs
```

Las pruebas de navegador usan Chrome instalado; se puede indicar su ruta con `CHROME`.

```text
src/                         Interfaz, favoritos, rutas, calendario y fuentes
src/config.js                Temporada y equipo inicial compartidos con Python
scripts/fetch_futbolaspalmas.py Importación con protección de temporada
scripts/generate_js.py        Generador de archivos publicados
data-*.js                    Datos actuales e históricos
futbolbase.db                 Base de datos
data-health.json             Estado y fecha de comprobación de las fuentes
sw.js                        Caché y actualización de la PWA
```

## Actualización y publicación

GitHub Actions comprueba los datos cada seis horas. Ejecuta las pruebas antes de publicar cambios deportivos. Si falla la fuente, conserva los datos publicados y publica únicamente el diagnóstico. GitHub Pages sirve la raíz de `main`.

```bash
bash scripts/update.sh          # importar, probar y publicar
bash scripts/update.sh --local  # importar, probar y crear commit local
```

La [guía de nueva temporada](docs/temporada-nueva.md) explica la verificación y activación, con copia de seguridad y conservación del archivo. La configuración de 2026/27 está preparada; sus grupos se activarán cuando haya calendarios fechados verificables.

Los cambios solo de interfaz requieren actualizar el parámetro `?v=` de `index.html` y `CACHE_NAME` de `sw.js`, además de mantener la lista de módulos precargados.
