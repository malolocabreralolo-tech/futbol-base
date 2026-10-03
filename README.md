# Fútbol Base Las Palmas

[Ver el portal](https://malolocabreralolo-tech.github.io/futbol-base/)

Resultados y seguimiento de Benjamín y Prebenjamín de Gran Canaria, Lanzarote y Fuerteventura. Sin publicidad.

## Para las familias

- Un equipo, el tuyo: la portada sigue a «mi equipo» (próximo partido con fecha, hora canaria y campo cuando la fuente los publica; último resultado, clasificación y goleadores) y cambia con el momento de la temporada. Los equipos que se miran sin cambiarlo quedan en «Vistos hace poco» (hasta 8).
- Jornada, Tabla (puntos, goles, forma, casa y fuera) y Partido (goles, alineaciones del acta y cara a cara).
- Explorar: buscador de equipos, ligas y copas de las tres islas, goleadores completos, récords y archivo desde 2021/22.
- Enlaces directos a cada pantalla (también los antiguos, de WhatsApp) y botón de compartir.
- Calendario `.ics` y enlace al mapa para campos conocidos.
- Tema claro u oscuro, el del sistema; navegación móvil y con teclado; y PWA instalable, que abre sin conexión la app, sus datos inmediatos, las temporadas anteriores y la plantilla de la actual (precargadas) y los escudos ya vistos; el resto —el detalle de un partido, la plantilla de otra temporada— hay que volver a verlo con conexión tras cada actualización de datos.
- Datos y fuentes: cobertura, y fechas separadas de comprobación y de cambio de datos.

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
src/                         La app, en módulos planos sin compilar: arranque, rutas, modelo, mi equipo y pantallas
acta.css                     La hoja, con los temas claro y oscuro
escudos/, escudos/s/         Los escudos y sus miniaturas (scripts/build_crests.py)
src/config.js                Temporada y equipo inicial compartidos con Python
scripts/fetch_futbolaspalmas.py Importación con protección de temporada (grupos de futbolaspalmas)
scripts/update_fiflp.py      Grupos de la federación (FIFLP): tabla y jornadas, con navegador
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

La [guía de nueva temporada](docs/temporada-nueva.md) explica la verificación y activación, con copia de seguridad y conservación del archivo. La temporada 2026/27 se activó el 3 de octubre de 2026 desde la federación (FIFLP): futbolaspalmas.com migró a una app nueva sin benjamín ni prebenjamín; la guía explica también cómo añadir una fase nueva a mitad de temporada (`activate_season.py --add`).

Un cambio de código (`src/` o `acta.css`) necesita `python3 scripts/codigo.py` antes de las pruebas: escribe en `index.html` `CODIGO`, la versión del código con la que el arranque quita la de la versión anterior de las cachés del SW. `STATIC_ASSETS` de `sw.js` sigue el grafo de imports de `src/app.js` (lo comprueba `scripts/tests/test_sw_fixes.mjs`). Para publicar, `python3 scripts/publicar.py` sube a la vez las `?v=` de `index.html`, `CACHE_NAME` de `sw.js` y `CODIGO`, sin tocar «Última actualización»; el procedimiento completo está en [docs/rediseno-rebase.md](docs/rediseno-rebase.md). Un escudo nuevo se añade como dice la guía de nueva temporada: `scripts/build_crests.py` escribe su miniatura y el sello de `escudos/` en la línea 2 de `sw.js`.
