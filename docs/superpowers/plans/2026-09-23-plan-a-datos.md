# Plan A: capa de datos del rediseño «Acta» — plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** Publicar los datos que el rediseño necesita sin cambiar la interfaz actual:
- hora y campo de las temporadas pasadas;
- cronología y actas sin colisiones entre grupos, con enlace al acta oficial;
- tandas de penaltis de la Maspalomas Cup;
- Lanzarote benjamín 2025-26 sin el grupo duplicado.

**Arquitectura:**
- Todo pasa por `scripts/generate_js.py` y los scripts de datos existentes. `futbolbase.db` sigue siendo la fuente de verdad.
- Los `data-*.js` cambian de forma, pero la interfaz actual (`src/*.js`) los sigue leyendo sin cambios, o con guardas mínimas probadas.
- Un fixer de un solo uso en `scripts/_archive/` corrige el duplicado de Lanzarote, y un guardián en `test_db_sanity.py` impide que vuelva.

**Stack:** Python 3 (sqlite3, pytest), Node 22 (`node --test`), Chrome sin interfaz con Playwright 1.58 para las pruebas de navegador, y GitHub Actions (`update.yml`, `tests.yml`).

**Spec:** `docs/superpowers/specs/2026-09-23-rediseno-acta-design.md`, §9 (Plan A), con §5.3 (formato de fila y desambiguación de la cronología).

## Restricciones globales

- **Las suites bloquean al bot.** `update.yml` ejecuta `python3 -m pytest scripts/tests/ -q` y `node --test scripts/tests/test_*.mjs` antes de commitear datos cada 6 h. Todo commit que llegue a `main` lleva las dos suites en verde.
- **Nunca se hace push con un workflow en marcha.** Antes de cada push, `gh run list --workflow=update.yml --limit 1` no debe mostrar `in_progress` ni `queued`.
- **Los tests nunca dependen de una clave concreta de la base viva** que una fusión, un renombrado o una reimportación pueda hacer desaparecer. Si el dato falta, `pytest.skip` con motivo; nunca `KeyError` ni fallo.
- **La interfaz actual no cambia de comportamiento.** Todo consumidor de un dato que cambie de forma se comprueba con un test o con las pruebas de navegador (`render-smoke`, `interaction-smoke` y `pwa-smoke`).
- **Formato único de fila de partido (spec §5.3):** `[fecha, local, visitante, gl, gv, pen, hora, campo, tanda?]`.
  - `pen` es `'home'`, `'away'` o `null`.
  - `tanda` es `'h-a'` y solo se usa en los cuadros de la Maspalomas.
- **Los ficheros generados no se editan a mano:** `data-*.js`, `index.html` (`?v=` y pie) y `sw.js` (`CACHE_NAME`) salen de `python3 scripts/generate_js.py` (o de `fetch_maspalomas_cup.py --from-raw` en el caso de la Maspalomas).
- **Cualquier limpieza de `futbolbase.db` se prueba ejecutando después `python3 scripts/fetch_futbolaspalmas.py`** (regla del proyecto: la fuente no debe deshacerla).
- **Mensajes de commit:** en español. Terminan con estas dos líneas:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
  ```
- **Estado de la shell:** las variables y el directorio de trabajo **no persisten entre bloques**. Cada bloque de órdenes empieza con `cd /home/manolo/claude/futbol-base` y redefine lo que use; por ejemplo `S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planA`.
- **Sin `sleep` en primer plano.** Para esperar a CI se usa `gh run watch <id>` con `timeout`, o la herramienta Monitor.
- **Playwright** para las pruebas de navegador en local: `NODE_PATH=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/pw/node_modules`.

## Focos de revisión

Son los casos que la spec implica y que ningún test de tarea cubre por sí solo. Cada uno tiene su test en la tarea que lo posee.

1. **El bot empuja mientras se ejecuta el plan.** Los commits locales chocan en `futbolbase.db`, `data-*.js`, `index.html` y `sw.js`. Lo esperado: rebase con regeneración y sin perder ningún cambio no generado. Lo cubre la Tarea 5, en el bucle de conflictos que se detiene ante un fichero no generado o ante suites en rojo.
2. **La base viva cambia (fusión o renombrado de equipos, reimportación) y un test de datos reales pierde su clave.** Lo esperado: `skip`, nunca bloquear al bot. Lo cubre la Tarea 2 con el test de Calero y `.get()` + skip.
3. **Un navegador con la PWA vieja en caché** (módulos de `src/` anteriores) recibe los datos nuevos: entradas `dup` sin `.g`, `.home` ni `.away`, filas de 8 o 9 columnas. Lo esperado: la app no se rompe y omite lo que no entiende. Lo cubren las Tareas 2 y 3, con tests de tolerancia de los consumidores actuales, y las pruebas de navegador de la Tarea 5.
4. **Se activa 2026/27** (aparecen `data-lineups-2026-2027.js` y `data-season-2025-2026.js`). Lo esperado: ningún test lanza `TypeError` por un fichero de temporada que su lista no conoce. Lo cubre la Tarea 2, con `if (!Lin) continue;` en los tests de `LINEUPS_*`.
5. **Una reimportación manual de FIFLP vuelve a crear LZS1-4.** Lo esperado: el guardián de la Tarea 4 lo detecta. Lo cubren la Tarea 4, con el guardián y un test positivo, y el importador `import_fiflp_islas.py`, que deja de asignar la competición 54422886 a LZS para que falle el importador y no el bot.

---

## Orden de ejecución

Las tareas se ejecutan en este orden, sobre `main` y sin ramas:

1. **Paso previo** (abajo): ningún workflow en marcha, `git fetch` y, si `main` va por detrás, `git rebase origin/main`.
2. **Tarea 1 → Tarea 2 → Tarea 3 → Tarea 4.** Cada una termina en un único commit local, con `python3 -m pytest scripts/tests/ -q` y `node --test scripts/tests/test_*.mjs` en verde. No se hace push hasta la Tarea 5.
3. **Tarea 5:** verificación local completa, rebase sobre lo que haya publicado el bot y publicación.

**Por qué la Tarea 4 va la última.** Es el único commit que cambia `futbolbase.db`, un binario que el bot también commitea cada 6 h. Es, por tanto, el único conflicto con el bot que no se resuelve regenerando ficheros de texto. Si va la última, en el rebase de la Tarea 5 solo esa parada necesita volver a pasar el fixer sobre la base del bot. Las Tareas 1-3 solo pueden chocar en `data-*.js`, `index.html` y `sw.js`, que se regeneran.

Las cuatro tareas de datos son independientes: tocan regiones distintas de los ficheros de test que comparten (`test_pygen_fixes.py`, `test_js_modules.mjs` y `test_db_sanity.py`). Aun así, los recuentos «Esperado» de cada tarea son los de este orden, que es el que se verificó de principio a fin. Las referencias de línea son orientativas (`≈`): las ediciones se anclan siempre por el texto citado.

**Nota sobre `interaction-smoke`.** En este equipo falla de vez en cuando, también sobre `main` sin el Plan A (2 de 6 ejecuciones el 23/09), con `locator.click: Target page, context or browser has been closed` o `locator.innerText: …` en la navegación por jornadas (`interaction-smoke.mjs` ≈231-232). Si sale exactamente ese error, se repite la prueba. Cualquier otro error, o el mismo tres veces seguidas, es un fallo real y se para.

### Paso previo: partir de lo último publicado

- [ ] **Step 1: Ningún workflow en marcha y `main` al día**

```bash
cd /home/manolo/claude/futbol-base
gh run list --workflow=update.yml --limit 1
git fetch origin
git status --porcelain
git rev-list --left-right --count origin/main...HEAD
```
Esperado:
- La primera línea empieza por `completed`. Si pone `in_progress` o `queued`, se espera con `timeout 900 gh run watch "$(gh run list --workflow=update.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --compact --interval 30` y se repite el paso.
- `status` solo muestra `?? HANDOFF.md` y `?? docs/mejoras-2026-09.md`.
- `rev-list` da `<N> 1`. El `1` es el commit de la spec (`63c5aff docs: spec del rediseño total «Acta»…`), que va por delante de `origin/main`. `N` son los commits del bot que faltan en local; el 23/09 a mediodía ya había al menos uno.

Si `N` es mayor que 0:
```bash
cd /home/manolo/claude/futbol-base
git rebase origin/main
git log --oneline -3
```
Esperado: `Successfully rebased and updated refs/heads/main.` El commit de la spec solo toca `docs/`, así que no hay conflictos: queda encima de lo último del bot, con otro hash.

- [ ] **Step 2: Playwright para las pruebas de navegador**

```bash
cd /home/manolo/claude/futbol-base
PW=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/pw/node_modules
ls "$PW/playwright/package.json" 2>/dev/null || npm install --prefix "$(dirname "$PW")" --no-save --package-lock=false playwright@1.58.0
NODE_PATH="$PW" node -e "console.log(require('playwright/package.json').version)"
```
Esperado: `1.58.0`.
- `render-smoke.mjs` lanza Chrome directamente.
- `interaction-smoke.mjs`, `pwa-smoke.mjs` y los scripts de captura resuelven `playwright` por `NODE_PATH`.
- Nada se instala dentro del repo.

---

### Task 1: Hora y campo en temporadas pasadas (spec §9.1)

**Contexto**
- **Qué falla hoy.** `generate_js.py` ya añade `[None, hora, campo]` a cada fila cuando `get_historical_jornadas` recibe `include_details` (≈956). Pero `generate_seasons_js` solo lo activa desde 2025-26 (`include_details=season_name >= '2025-2026'`, ≈1009), y es el único sitio que llama a esa función.
- **La base** (temporadas con `is_current=0`):
  - `time` vale `''` (5.740 filas) o `HH:MM` (5.618), nunca NULL;
  - `time` y `venue` aparecen siempre juntos;
  - hay 195 campos distintos, de 49 caracteres como máximo;
  - no hay ningún `\n`, `\r`, `\t`, U+2028 ni U+2029.
- **Recuentos (hora, campo)** por temporada: 2021-22 (90, 90), 2022-23 (641, 641), 2023-24 (2147, 2147) y 2024-25 (2740, 2740). Hay 11.358 filas históricas en total.
- **Sin cambios ajenos.** Los ficheros publicados están sincronizados con la base: regenerar sin el cambio da «sin cambios». La única diferencia que produce esta tarea es la de §9.1.
- **Consumidores de las filas históricas en la interfaz actual.** Todos toleran las 8 columnas:
  - `render.js`:
    - `getHistoricalJornadaMatches` (≈529-534) lee `m[6] || ''` y `m[7] || ''`;
    - el cuadro de copa desestructura `[, home, away, hs, as]`, y `matchAdvancer` lee `row[5]`, donde `null` se comporta igual que `undefined` (`state.js` ≈183-187);
    - `calcHistoricalStats` usa `m[0..4]`.
  - `init.js` ≈97-103 lee `time: row[6], venue: row[7]`; `''` es falso, así que no cambia nada frente a `undefined`.
  - `state.js`: `getTeamForm`, `countMatches` e `isRoundRobinCup` solo usan `m[0..4]` o longitudes.
  - `modals.js`: el cara a cara y la ficha de equipo usan `m[0..4]`.
  - `links.js` ≈127: `buildCalendar` valida la hora con `/^([01]\d|2[0-3]):[0-5]\d$/`, y todas las horas históricas son `HH:MM`.
  - `favorites.js`, `plantilla.js` y `matchdetail-rich.js` no leen `jornadas`.
  - Probado en Chrome con datos viejos y nuevos, sin errores de JavaScript:
    - clasificación, estadísticas y ficha de equipo: texto idéntico;
    - tarjetas: idénticas, salvo la hora y el campo.
- **Cambios visibles**, los que busca la spec:
  - las tarjetas de jornada histórica añaden «· HH:MM h» y «📍 campo»;
  - los partidos históricos sin jugar pero con hora muestran «VS» más la hora: 85 en 24-25, 7 en 23-24 y 2 en 22-23;
  - por enlace directo, el partido muestra «· 20:00 h · Canarias» y «Ver campo ↗»;
  - el `.ics` de una jornada histórica pasa de eventos de día completo a eventos con hora y `LOCATION`. Por ejemplo, `DTSTART:20250117T200000Z`, o `DTSTART:20230608T194000Z` en verano (UTC+1).
- **Tamaño.** Los 4 `data-season-*.js` crecen 294.987 bytes sin comprimir (+46,2 %) y 27.106 bytes con gzip (+22,2 %: de 121.835 a 148.941).
  - El SW los precarga (`SEASON_FILES`), así que cada actualización de la PWA descarga unos 27 KB comprimidos más.
  - No hay ningún test de presupuesto de tamaño.
- **`''` frente a `null`.**
  - En 2021-22 a 2024-25, las 5.740 filas sin detalle llevan `''` en hora y campo, porque la base guarda `''`.
  - `HISTORY` (2025-26) mezcla las dos formas: a 23/09, antes de la Tarea 4, lleva `''` en 55 horas y 55 campos, y `null` en 2 horas y 2.549 campos.
  - El `model.js` del Plan B tiene que tratar `''` y `null` igual.
- **Atomicidad.** El cambio del generador y los `data-season-*.js` regenerados van en el mismo commit.
  - Si llegaran a `main` solo los datos, el bot los devolvería a 5 columnas y los tests nuevos lo bloquearían.
  - Publicar solo el generador sí sería seguro.
- **Suelo de 5.400 y no el valor exacto de 5.618.** Deja margen a `fetch-fiflp.yml`, que reimporta 2024-25 a mano.
  - La comprobación exacta por temporada (`test_time_and_venue_counts_match_db`) sigue detectando cualquier desfase entre base y ficheros.
  - Esa comprobación solo cuenta BENJAMIN y PREBENJAMIN, las categorías que exporta el generador. Así, importar otra categoría en una temporada pasada no bloquea al bot.
- **Otros scripts.**
  - `activate_season.py` ≈150-155 llama a `generate_js.main()`, y el archivo de 2025-26 ya salía con 8 columnas: `test_season_preparation.py` pasa sin cambios.
  - `check_missing_shields.py` solo lee nombres.
- **Para el Plan B.**
  - `model.js` debe seguir aceptando filas de 5 columnas: un SW viejo puede servir ficheros antiguos.
  - `pen` (índice 5) siempre es `null` en las temporadas archivadas, así que el cuadro de las copas históricas sigue deduciendo quién pasó con `bracketDrawAdvancer`.

**Files:**
- Modify: `scripts/generate_js.py`: el docstring de `get_historical_jornadas` (≈936-941) y la llamada `include_details=season_name >= '2025-2026'` de `generate_seasons_js` (≈1009).
- Modify: `scripts/tests/test_js_modules.mjs` (≈140-148): las filas pueden tener 5 u 8 columnas.
- Modify (regenerados): `data-season-2021-2022.js`, `data-season-2022-2023.js`, `data-season-2023-2024.js`, `data-season-2024-2025.js`, `index.html` (`?v=` y pie oculto) y `sw.js` (línea 1, `CACHE_NAME`).
- Test: `scripts/tests/test_pygen_fixes.py`: clase nueva justo antes de `# ─── Fix 4: stale standings recompute…` (≈261).
- Test: `scripts/tests/test_data_integrity.py`: bloque nuevo justo antes de `# ─── Actas pipeline schema` (≈230).

**Interfaces:**
- Consumes: `futbolbase.db` → `matches.time` y `matches.venue` de las temporadas con `is_current=0`, a través de `get_historical_jornadas(conn, gid, include_details=True)`.
- Produces: `SEASON_YYYY_YYYY.{benjamin|prebenjamin}[i].jornadas[clave]` con filas de 8 columnas `[fecha, local, visitante, gl, gv, null, hora, campo]`, el mismo orden que `HISTORY`.
  - La columna 5 siempre es `null`.
  - En 2021-22 a 2024-25, `hora` y `campo` son `"HH:MM"` y el texto del campo, o `""` cuando no se conocen. Cuando se archive 2025-26 también puede salir `null`.
  - Lo leen sin cambios `render.js` ≈532 (`getHistoricalJornadaMatches`) e `init.js` ≈101 (enlace directo a un partido).

- [ ] **Step 1: Write the failing test**

Se tocan tres ficheros de test.

1. En `scripts/tests/test_pygen_fixes.py`, insertar este bloque entre el final de `TestScoreRangeGuard` (su última línea es `        assert capsys.readouterr().err == ""`, ≈258) y el comentario `# ─── Fix 4: stale standings recompute (current season, league groups) ───────`. Deben quedar dos líneas en blanco antes y después:

```python
# ─── Plan A §9.1: hora y campo en temporadas pasadas ────────────────────────

class TestHistoricalMatchDetails:
    """Las temporadas pasadas salían en filas de 5 columnas aunque la base
    tenga su hora y su campo (unos 5.600 partidos de 2021-22 a 2024-25): solo
    2025-26 en adelante pasaba include_details. Ahora todas las temporadas usan
    las 8 columnas de HISTORY: [fecha, local, visitante, gl, gv, null, hora, campo]."""

    def _seed_past_season(self, conn):
        conn.executescript("""
          INSERT INTO seasons (id, name, start_year, end_year, is_current)
            VALUES (2, '2021-2022', 2021, 2022, 0);
          INSERT INTO groups (id, season_id, category_id, code, name, phase, current_jornada)
            VALUES (7, 2, 2, 'PG2', 'Grupo 2', 'Gran Canaria', '1');
          INSERT INTO teams (id, name) VALUES (1, 'Las Mesas Hu.'), (2, 'Huracan');
          INSERT INTO matches (id, group_id, jornada, date, time, home_team_id, away_team_id,
                               home_score, away_score, venue)
            VALUES (1, 7, '1', '06/11', '10:30', 1, 2, 2, 7, 'ANEXO GRAN CANARIA F8(1)'),
                   (2, 7, '1', '06/11', '', 2, 1, NULL, NULL, '');
        """)

    def test_past_season_rows_carry_time_and_venue(self):
        from scripts.generate_js import generate_seasons_js
        conn = _synth_conn()
        self._seed_past_season(conn)
        _, seasons = generate_seasons_js(conn)
        past = next(s for s in seasons if s["name"] == "2021-2022")
        assert past["prebenjamin"][0]["jornadas"] == {"1": [
            ["06/11", "Huracan", "Las Mesas Hu.", None, None, None, "", ""],
            ["06/11", "Las Mesas Hu.", "Huracan", 2, 7, None, "10:30", "ANEXO GRAN CANARIA F8(1)"],
        ]}
```

2. En `scripts/tests/test_data_integrity.py`, insertar este bloque entre el final de `test_standings_canonical_format` (el `)` que cierra su último assert, ≈227) y `# ─── Actas pipeline schema ───────────────────────────────────────────────────`, también con dos líneas en blanco antes y después:

```python
# ─── Plan A §9.1: hora y campo en temporadas pasadas ────────────────────────

# Suelo de filas históricas con hora y campo. En futbolbase.db, el 23/09/2026,
# hay 5.618 (2021-22: 90, 2022-23: 641, 2023-24: 2.147, 2024-25: 2.740); el
# suelo deja margen para que una reimportación manual (fetch-fiflp.yml) que
# pierda algún horario no bloquee la publicación. Al archivar 2025-26 solo sube.
MIN_HISTORICAL_ROWS_WITH_DETAILS = 5400


def _historical_match_rows():
    """(temporada, grupo, jornada, fila) de cada partido de los data-season-*.js."""
    for entry in _load_seasons_js():
        if entry.get("current"):
            continue
        per_season = _load_per_season_js(entry["name"])
        if per_season is None:
            pytest.fail(f"data-season-{entry['name']}.js missing")
        for cat in ("benjamin", "prebenjamin"):
            for g in per_season.get(cat, []):
                for jornada, rows in (g.get("jornadas") or {}).items():
                    for row in rows:
                        yield entry["name"], g["id"], jornada, row


class TestHistoricalMatchRows:
    def test_every_historical_row_has_eight_columns(self):
        """[fecha, local, visitante, gl, gv, null, hora, campo], como HISTORY.

        Además, ningún data-season-*.js lleva U+2028 ni U+2029: la interfaz los
        lee con una expresión regular (ensureSeasonData en state.js y
        loadAllHistoricalSeasons en modals.js) cuyo `.` no casa esos dos
        separadores en JavaScript. El `.` de Python sí los casa, así que
        _load_per_season_js no lo detectaría."""
        bad = [f"{s}/{gid}/{j}: {row}" for s, gid, j, row in _historical_match_rows()
               if not isinstance(row, list) or len(row) != 8 or row[5] is not None]
        assert not bad, f"{len(bad)} filas históricas sin 8 columnas: {bad[:5]}"
        for entry in _load_seasons_js():
            if entry.get("current"):
                continue
            with open(os.path.join(ROOT, f"data-season-{entry['name']}.js"),
                      encoding="utf-8") as f:
                texto = f.read()
            assert "\u2028" not in texto and "\u2029" not in texto, (
                f"data-season-{entry['name']}.js lleva U+2028/U+2029")

    def test_time_and_venue_counts_match_db(self):
        """Cada temporada publica todas las horas y campos que tiene la base."""
        c = _conn()
        published = {}
        for season, _gid, _j, row in _historical_match_rows():
            t, v = published.get(season, (0, 0))
            detailed = len(row) == 8
            published[season] = (t + bool(detailed and row[6]),
                                 v + bool(detailed and row[7]))
        assert published, "no hay temporadas históricas publicadas"
        for season, got in sorted(published.items()):
            expected = c.execute(
                """SELECT COUNT(CASE WHEN m.time <> '' THEN 1 END),
                          COUNT(CASE WHEN m.venue <> '' THEN 1 END)
                   FROM matches m
                   JOIN groups g ON g.id = m.group_id
                   JOIN seasons se ON se.id = g.season_id
                   JOIN categories c ON c.id = g.category_id
                   JOIN teams h ON h.id = m.home_team_id
                   JOIN teams a ON a.id = m.away_team_id
                   WHERE se.name = ?
                     AND UPPER(c.name) IN ('BENJAMIN', 'PREBENJAMIN')""",
                (season,)).fetchone()
            assert got == tuple(expected), (
                f"{season}: publicado (hora, campo)={got}, en la base={tuple(expected)}")

    def test_at_least_n_historical_rows_with_time_and_venue(self):
        n = sum(1 for *_, row in _historical_match_rows()
                if len(row) == 8 and row[6] and row[7])
        assert n >= MIN_HISTORICAL_ROWS_WITH_DETAILS, (
            f"solo {n} partidos históricos con hora y campo "
            f"(mínimo {MIN_HISTORICAL_ROWS_WITH_DETAILS})")
```

3. En `scripts/tests/test_js_modules.mjs` (≈140-148, dentro de `'per-season groups have valid standings + jornadas shape'`).

Antes:
```js
        // jornadas: object {num: [[date,home,away,hs,as], ...]}
        if (g.jornadas) {
          for (const [num, matches] of Object.entries(g.jornadas)) {
            assert.ok(Array.isArray(matches), `${name}/${g.id}/J${num}: matches not array`);
            for (const m of matches) {
              assert.ok(Array.isArray(m) && m.length === 5,
                `${name}/${g.id}/J${num}: match shape ${JSON.stringify(m)}`);
            }
          }
        }
```
Después:
```js
        // jornadas: object {num: [[date,home,away,hs,as,pen,hora,campo], ...]}
        // (5 columnas en ficheros generados antes de Plan A §9.1; 8 desde entonces)
        if (g.jornadas) {
          for (const [num, matches] of Object.entries(g.jornadas)) {
            assert.ok(Array.isArray(matches), `${name}/${g.id}/J${num}: matches not array`);
            for (const m of matches) {
              assert.ok(Array.isArray(m) && (m.length === 5 || m.length === 8),
                `${name}/${g.id}/J${num}: match shape ${JSON.stringify(m)}`);
            }
          }
        }
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_pygen_fixes.py::TestHistoricalMatchDetails scripts/tests/test_data_integrity.py::TestHistoricalMatchRows -q
node --test scripts/tests/test_js_modules.mjs 2>&1 | grep -E '^# (pass|fail)'
```
Salida esperada de pytest: `4 failed`, con estos mensajes:
```
E       AssertionError: assert {'1': [['06/1...acan', 2, 7]]} == {'1': [['06/1..., None, ...]]}
E       AssertionError: 11358 filas históricas sin 8 columnas: ["2024-2025/A1/1: ['17/01', 'UD Barrial', 'AD Huracán', 1, 11]", ...
E       AssertionError: 2021-2022: publicado (hora, campo)=(0, 0), en la base=(90, 90)
E       AssertionError: solo 0 partidos históricos con hora y campo (mínimo 5400)
```
Salida esperada de node: `# pass 28` y `# fail 0`. El test de node ya acepta 5 columnas, así que sigue en verde.

- [ ] **Step 3: Write minimal implementation**

En `scripts/generate_js.py`, docstring de `get_historical_jornadas` (≈936-941).

Antes:
```python
def get_historical_jornadas(conn, group_id, include_details=False):
    """Return matches grouped by jornada num for historical groups.
    Format: {jornada_num: [[date, home, away, hs, as_], ...]}
    Only includes jornadas with at least one match.
    """
```
Después:
```python
def get_historical_jornadas(conn, group_id, include_details=False):
    """Return matches grouped by jornada num for historical groups.
    Format: {jornada_num: [[date, home, away, hs, as_], ...]}; with
    include_details, the 8 columns of HISTORY:
    [date, home, away, hs, as_, None, time, venue]. Every per-season file
    uses include_details (Plan A §9.1).
    Only includes jornadas with at least one match.
    """
```

En `scripts/generate_js.py`, dentro de `generate_seasons_js` (≈1009; ≈1012 tras el cambio anterior).

Antes:
```python
                    hist_jornadas = get_historical_jornadas(conn, gid, include_details=season_name >= '2025-2026')
```
Después:
```python
                    hist_jornadas = get_historical_jornadas(conn, gid, include_details=True)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_pygen_fixes.py::TestHistoricalMatchDetails -q
```
Esperado: `1 passed`. Los tres tests de `TestHistoricalMatchRows` siguen en rojo hasta que se regeneren los datos en el paso 5.

- [ ] **Step 5: Regenerar los datos**

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/generate_js.py
git status --short
for f in data-season-*.js; do echo "$f $(stat -c%s $f) $(gzip -9c $f | wc -c)"; done
```
Salida esperada de `generate_js.py`. El generador imprime caracteres, no bytes:
```
9. data-season-*.js (per-season lazy-loaded files)
  data-season-2024-2025.js: 308,972 bytes
  data-season-2023-2024.js: 305,574 bytes
  data-season-2022-2023.js: 198,054 bytes
  data-season-2021-2022.js: 115,314 bytes
...
11. Cache version (only if data changed — C4)
  index.html cache version bumped to ?v=<AAAAMMDD[b-z]>
  sw.js CACHE_NAME bumped to futbolbase-v<AAAAMMDD[b-z]>
```
`git status --short` debe mostrar exactamente estos 10 ficheros con `M`, además de los dos `??` preexistentes (`HANDOFF.md` y `docs/mejoras-2026-09.md`):
- `data-season-2021-2022.js`, `data-season-2022-2023.js`, `data-season-2023-2024.js` y `data-season-2024-2025.js`;
- `index.html`;
- `scripts/generate_js.py`;
- `scripts/tests/test_data_integrity.py`, `scripts/tests/test_js_modules.mjs` y `scripts/tests/test_pygen_fixes.py`;
- `sw.js`.

Si cambia otro `data-*.js`, la base ya no estaba sincronizada con los ficheros publicados. Hay que parar y averiguar por qué antes de seguir.

Tamaños esperados en bytes (y comprimidos con gzip -9):
```
data-season-2021-2022.js 116194 19990
data-season-2022-2023.js 199264 32069
data-season-2023-2024.js 307205 48769
data-season-2024-2025.js 310416 48113
```

- [ ] **Step 6: Run the new tests on the regenerated data**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_pygen_fixes.py::TestHistoricalMatchDetails scripts/tests/test_data_integrity.py::TestHistoricalMatchRows -q
node --test scripts/tests/test_js_modules.mjs 2>&1 | grep -E '^# (pass|fail)'
```
Esperado: `4 passed`; `# pass 28` y `# fail 0`.

Sin el cambio del paso 1 en `test_js_modules.mjs`, este test fallaría así:
```
not ok 9 - per-season groups have valid standings + jornadas shape
  error: '2024-2025/A1/J1: match shape ["17/01","UD Barrial","AD Huracán",1,11,null,"20:00","ANTONIO CASTILLO"]'
```

- [ ] **Step 7: Suites completas (las que bloquean al bot)**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- pytest: `377 passed, 5 skipped`, es decir, los 373 de antes más los 4 nuevos. Los 5 omitidos son de `test_fiflp_parser.py` y se omiten porque no existe `fiflp_raw.json`.
- node: `# tests 232`, `# pass 232` y `# fail 0`.

- [ ] **Step 8: La interfaz actual con los datos nuevos (navegador)**

```bash
cd /home/manolo/claude/futbol-base
PW=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/pw/node_modules
node scripts/tests/render-smoke.mjs
NODE_PATH="$PW" node scripts/tests/interaction-smoke.mjs
NODE_PATH="$PW" node scripts/tests/pwa-smoke.mjs
```
Esperado:
- `PASS: render smoke OK — MI EQUIPO rendered (DOM …)`.
- `interaction-smoke` solo imprime líneas `PASS:`, entre ellas `PASS: navigation, categories and historical return …`. La última es `PASS: future date/time/venue, maps, downloaded ICS and explicit source statuses`.
- `PASS: previous PWA cache replaced by futbolbase-v<versión>; dashboard and team search work offline`.

Comprobación visual de una jornada histórica. El script se escribe en el scratchpad y se ejecuta desde la raíz del repo; las capturas van a `$S/shots-t1`:
```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planA
cat > "$S/fb-hist-visual.mjs" <<'EOF'
// Comprobación visual de §9.1 con la interfaz ACTUAL. Ejecutar desde la raíz del repo.
// Uso: OUT=<directorio de capturas> NODE_PATH=<node_modules con playwright> node fb-hist-visual.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const out = process.env.OUT;
if (!out) { console.error('Falta OUT=<directorio de capturas>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const root = process.cwd();
const { startServer, findChrome } = await import(pathToFileURL(root + '/scripts/tests/render-smoke.mjs').href);
const { chromium } = createRequire(root + '/scripts/tests/x.mjs')('playwright');
const server = await startServer();
const url = `http://127.0.0.1:${server.address().port}/index.html#section=jornadas&cat=benjamin&season=2024-2025&group=A1&round=1`;
const browser = await chromium.launch({ executablePath: findChrome() });
const errors = [];
for (const [w, h, theme] of [[390, 844, 'light'], [390, 844, 'dark'], [1440, 900, 'light']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block',
    locale: 'es-ES', timezoneId: 'Atlantic/Canary', reducedMotion: 'reduce' });
  await ctx.addInitScript(t => localStorage.setItem('theme', t), theme);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  const card = page.locator('#sec-jornadas .match-card').first();
  await card.waitFor();
  console.log(`${w}px ${theme}:`, JSON.stringify(await card.innerText()));
  await page.locator('#sec-jornadas .match-grid').screenshot({ path: `${out}/fb-historica-${w}-${theme}.png` });
  await ctx.close();
}
await browser.close(); server.close();
console.log(errors.length ? 'ERRORES: ' + errors.join(' | ') : `sin errores de JavaScript; capturas en ${out}/fb-historica-*.png`);
process.exit(errors.length ? 1 : 0);
EOF
OUT="$S/shots-t1" NODE_PATH=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/pw/node_modules node "$S/fb-hist-visual.mjs"
```
Esperado:
```
390px light: "UD Barrial \n1\n-\n11\n AD Huracán\nvie, 17 ene · 20:00 h\n📍 ANTONIO CASTILLO"
390px dark: "UD Barrial \n1\n-\n11\n AD Huracán\nvie, 17 ene · 20:00 h\n📍 ANTONIO CASTILLO"
1440px light: "UD Barrial \n1\n-\n11\n AD Huracán\nvie, 17 ene · 20:00 h\n📍 ANTONIO CASTILLO"
sin errores de JavaScript; capturas en /tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planA/shots-t1/fb-historica-*.png
```
Hay que abrir las tres capturas (Read) y comprobar que cada tarjeta lleva «fecha · HH:MM h» y «📍 campo», sin desbordes. Antes de este cambio, la línea terminaba en «vie, 17 ene» y no había campo.

- [ ] **Step 9: Commit**

Sin push: se publica en la Tarea 5.

```bash
cd /home/manolo/claude/futbol-base
git add scripts/generate_js.py scripts/tests/test_pygen_fixes.py scripts/tests/test_data_integrity.py scripts/tests/test_js_modules.mjs data-season-2021-2022.js data-season-2022-2023.js data-season-2023-2024.js data-season-2024-2025.js index.html sw.js
git commit -F - <<'EOF'
feat(datos): hora y campo en las temporadas pasadas (Plan A §9.1)

generate_js.py exporta en todas las temporadas las filas de 8 columnas
que ya usaba 2025-26: [fecha, local, visitante, gl, gv, null, hora, campo].
Publica 5.618 partidos de 2021-22 a 2024-25 con hora y campo que estaban
en la base. La interfaz actual ya lee m[6] y m[7] (render.js:532,
init.js:101): las tarjetas, la ficha y el .ics históricos ganan hora y
campo sin cambiar nada más.

- test_pygen_fixes: generate_seasons_js con temporada pasada sintética.
- test_data_integrity: 8 columnas en cada fila histórica y ningún
  U+2028/U+2029 en los data-season-*.js; recuento de hora/campo
  (benjamín y prebenjamín) igual al de la base; suelo de 5.400 filas
  con ambos.
- test_js_modules: las filas de data-season-*.js pueden tener 5 u 8 columnas.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat HEAD | tail -12
```
Esperado: los 10 ficheros en el commit. `futbolbase.db` no se añade porque no cambia ningún dato.

---

### Task 2: MATCH_DETAIL y LINEUPS con temporada y grupo, sin sobrescribir claves repetidas (spec §9.2)

**Contexto**
- **El ejemplo de la spec no está en la base.** §9.2 da por hecho que 'CD Calero|La Garita|1-11' tiene «una cronología en FF15 y otra en PG2». En la base solo FF15 tiene goles:
  - partido 687244, FF15 BENJAMIN, J3, 2025-10-24: 12 goles;
  - partido 2256, PG2 PREBENJAMIN, J27, 2026-05-14: 0 goles y sin `cod_acta`.

  Por eso el `dup` de Calero se prueba con una base sintética, con los mismos ids y grupos y goles en los dos partidos. Contra la base real se comprueba lo que hay:
  - la entrada sale con `gr='FF15'`;
  - el test acepta un `dup` FF15/PG2 si algún día llegan goles de PG2;
  - se salta (`pytest.skip`) si una fusión o un renombrado de equipos hace desaparecer la clave.
- **Hoy no hay ninguna clave repetida.**
  - `MATCH_DETAIL`: 1.222 partidos con goles, 1.222 claves y 0 repetidas; todos los goles son de 2025-26.
  - `LINEUPS`, por temporada: 2021-22 85/85, 2022-23 21/21, 2023-24 28/28, 2024-25 77/77 y 2025-26 51/51, sin repetidas.

  Por tanto:
  - el `dup` protege el futuro (2026/27 y actas nuevas);
  - `s` y `gr` le sirven ya al Plan B para desambiguar;
  - la interfaz actual recibe exactamente las mismas claves y el mismo contenido (paso 16).
- **Queda un fallo previo que el Plan A no toca**, porque la interfaz actual no debe cambiar.
  - Hay 67 claves con goles que chocan con otro partido:
    - 43 son el mismo partido en LZ y en LZS, y desaparecen con la Tarea 4;
    - 21 son de otra temporada: un partido histórico con la misma clave muestra la cronología de 2025-26;
    - 3 son de otro grupo de la misma temporada: el partido de PG2 Calero–La Garita, A2 'RC Victoria|AD Huracán|0-6' (con la de FF9) y B1 'UD Guía|UD Barrial|3-3' (con la de FF1).
  - En esos casos, la interfaz actual muestra ⚽ y la cronología de otro grupo. Lo corrige `timelineFor` en el Plan B, con `(s, gr)`.
- **La guarda de la interfaz actual hace falta de verdad.**
  - Sin ella, una entrada `dup` en LINEUPS es un valor verdadero. `openMatchDetail` llamaría a `renderLineupsAndTimeline` con ella y pintaría «No hay alineaciones disponibles para este partido.», «Cronología» y «No hay eventos registrados.».
  - Con la guarda no se pinta nada, igual que con una clave inexistente.
  - Verificado con Playwright, inyectando entradas `dup` en las cachés de `ensureLineups` y `ensureMatchDetail`. Con datos reales, la cronología de FF15 sale con 12 `goal-event` y la alineación de A1 'Unión Viera|Goleta|19-0' con 16 `match-tl-row`, sin errores de página.
- **`singleEntry` vive en `src/modals.js` y no en `matchdetail-rich.js`.**
  - Los módulos de `src/` se sirven sin `?v=` y con stale-while-revalidate (`sw.js`, `classifyRequest`).
  - Un `modals.js` nuevo que importara un export nuevo de un `matchdetail-rich.js` viejo de la caché daría `SyntaxError`, y la app entera se quedaría en blanco.
  - Definida en el propio `modals.js` no hay dependencia cruzada. `modals.js` se puede importar en Node: `test_femodals_fixes.mjs` ya lo hace.
- **La (i) de `test_db_sanity`** (`test_published_lineups_match_the_database`) comparaba el número de claves con los partidos con acta de la base. Con un `dup` habría bloqueado al bot aunque no se perdiera nada. Pasa a contar partidos.
- **Tamaños:**
  - `data-matchdetail.js`: 359.235 → 391.859 bytes (+9 %);
  - `data-lineups-*`: entre +1 % y +3 % (por ejemplo, 2025-26: 136.492 → 138.794 bytes).
- **Orden.**
  - `MATCH_DETAIL_KEYS` cambia de orden (`ORDER BY m.id`) pero conserva el mismo conjunto.
  - `LINEUPS` gana `ORDER BY m.id`: antes no tenía orden y ahora es determinista (C4).
- **Consumidores revisados:**
  - `state.js`: `ensureMatchDetail` (≈454-474) y `ensureLineups` (≈628-649) solo hacen una expresión regular y `JSON.parse`; el `true` literal es JSON válido.
  - `modals.js`: `buildGoalsHtml` (≈188-215) lee `.v`, `.r` y `.g`, y los campos nuevos no chocan con ellos.
  - `renderLineupsAndTimeline` lee `home`, `away`, `events`, `coachH`, `coachA` y `ref`.
  - `plantilla.js`: `aggregatePlayerFromLineups` (≈83-117) usa `m.home || []`, así que se salta un `dup` (hay test). Le llega desde `modals.js` ≈641-658 y `miequipo.js` ≈320-325.
  - `render.js` ≈575 y `miequipo.js` ≈107-110 solo usan `MATCH_DETAIL_KEYS`, con el mismo conjunto de claves.
  - `init.js` y `favorites.js` no leen estos datos.
  - `scripts/import_existing.py` es un importador antiguo de un solo uso, fuera del bot; usa `detail.get("g", [])` y tolera el `dup`.
- **Resistencia al paso de temporada.**
  - Los tests con base real comparan con la propia base, y el de Calero filtra `s == '2025-2026'`.
  - Los tests de `LINEUPS_*` de `test_js_modules.mjs` hacen `if (!Lin) continue;`. `loadDataFile` solo conoce los nombres de su lista, así que al activar 2026/27 `data-lineups-2026-2027.js` daría `undefined`. Comprobado: sin la guarda fallan 2 tests.
- **Tests que no son rojo-verde.** El de `aggregatePlayerFromLineups` es de compatibilidad y ya pasa antes del cambio. El fichero `test_sp2_modules.mjs` falla en el paso 10 solo por el import de `singleEntry`.
- **Para el Plan B.**
  - `timelineFor` usa `s` y `gr` de `MATCH_DETAIL` y `LINEUPS`, y el enlace al acta usa `cod`.
  - `singleEntry` deja de hacer falta cuando `timelineFor` sustituya las búsquedas del modal de partido.
  - Cuando se deje de generar `data-matchdetail-keys.js` (§5.4), se borra `generate_matchdetail_keys_js`, y con ella el filtro de `dup`.

**Files:**
- Modify: `scripts/generate_js.py`:
  - se sustituyen `generate_matchdetail_js` y `generate_matchdetail_keys_js` (≈435-487) y se añaden `_keyed_or_dup` y `_match_details`;
  - en `generate_lineups_js` (≈492-551) cambian el docstring, la consulta con su bucle y la entrada.
- Modify: `src/modals.js`: nuevo `export function singleEntry` después de `fillIfCurrent` (≈169), y las dos búsquedas de `openMatchDetail` (≈430 y ≈436).
- Modify: `scripts/tests/test_db_sanity.py`: helper y test nuevos después de `_lineup_keys` (≈186), y la línea `publicadas = …` de la (i) (≈210).
- Modify: `scripts/tests/test_js_modules.mjs`: test `'actas data files: …'` (≈376-381) y final del fichero.
- Test: `scripts/tests/test_pygen_fixes.py` (añadir al final, tras la ≈732).
- Test: `scripts/tests/test_sp2_modules.mjs` (añadir al final, tras la 202).
- Regenerados: `data-matchdetail.js`, `data-matchdetail-keys.js`, `data-lineups-2021-2022.js` … `data-lineups-2025-2026.js`, `index.html` y `sw.js` (subida de versión C4).

**Interfaces:**
- Consumes: columnas que ya existen: `seasons.name`, `groups.code` y `matches.cod_acta` (INTEGER; 262 filas con valor). También `_match_key(home, away, hs, as_)` y `js_val` de `generate_js.py`.
- Produces:
  - `MATCH_DETAIL[k]`: `{s, gr, g}` si la clave es única, o `{dup: true, list: [{s, gr, g}, …]}` (orden `m.id`) si está repetida.
  - `LINEUPS_<S>[k]`: `{s, gr, cod, home, away, events, coachH, coachA, ref}` si es única, o `{dup: true, list: [{s, gr, cod, home, …}, …]}` si está repetida.
  - `MATCH_DETAIL_KEYS`: deja fuera las claves `dup`.
  - En `generate_js.py`: `_keyed_or_dup(pairs)` y `_match_details(conn)`.
  - En `src/modals.js`: `export function singleEntry(entry)`.
  - Helpers de test: `_parse_tail_const(js, name)` y `_entries(value)` en `test_pygen_fixes.py`; `_lineup_count(texto)` en `test_db_sanity.py`; `entriesOf(v)` en `test_js_modules.mjs`.
  - El Plan B consume `s` y `gr` (`timelineFor`) y `cod` (enlace al acta).

- [ ] **Step 1: Write the failing test.** Añadir al final de `scripts/tests/test_pygen_fixes.py`, dejando dos líneas en blanco antes. El fichero ya importa `json`, `os`, `re`, `sqlite3` y `pytest`, y define `_synth_conn` y `DB_PATH`.

```python
# ─── Plan A §9.2 (2026-09-23): claves repetidas de MATCH_DETAIL / LINEUPS ───

def _parse_tail_const(js, name):
    """Como _parse_const, pero hasta el ÚLTIMO ';' del fichero: los data-*.js
    reales son un único `const X = {...};` y un ';' dentro de un nombre
    cortaría la búsqueda perezosa."""
    m = re.search(rf"const {name}\s*=\s*(.*);\s*$", js, re.DOTALL)
    assert m, f"const {name} not parseable in:\n{js[:500]}"
    return json.loads(m.group(1))


def _entries(value):
    """Entradas de una clave: [entrada] o la lista de un {dup: true, list}."""
    return value["list"] if value.get("dup") else [value]


class TestMatchKeyCollisions:
    """MATCH_DETAIL y LINEUPS_<S> se indexan por `local|visitante|gl-gv`, que no
    es única: 'CD Calero|La Garita|1-11' es un partido de FF15 (benjamín) y
    otro de PG2 (prebenjamín), y al activar 2026/27 chocarán claves entre
    temporadas (la consulta de MATCH_DETAIL no filtra temporada). Antes ganaba
    el último partido y el otro desaparecía en silencio. Ahora cada entrada
    lleva s (temporada) y gr (código de grupo), LINEUPS además cod
    (matches.cod_acta), y una clave repetida sale como {dup: true, list: [...]}."""

    KEY = "CD Calero|La Garita|1-11"

    def _seed_calero(self, conn, cod_pg2=None, cod_ff15=None):
        # Mismos ids y grupos que en la base real (el partido de PG2 es el de
        # id menor), pero aquí los DOS tienen goles para forzar el choque.
        conn.executescript("""
          INSERT INTO groups (id, season_id, category_id, code, name, phase)
            VALUES (10, 1, 1, 'FF15', 'Grupo 15', 'Primera Fase'),
                   (20, 1, 2, 'PG2', 'Grupo 2', 'Liga');
          INSERT INTO teams (id, name) VALUES (1, 'CD Calero'), (2, 'La Garita');
          INSERT INTO players (id, full_name, norm_name)
            VALUES (1, 'PEREZ, JUAN', 'perez juan'), (2, 'GOMEZ, RAUL', 'gomez raul');
        """)
        conn.execute("""INSERT INTO matches (id, group_id, jornada, date, home_team_id,
                          away_team_id, home_score, away_score, cod_acta)
                        VALUES (2256, 20, 'Jornada 27', '2026-05-14', 1, 2, 1, 11, ?)""",
                     (cod_pg2,))
        conn.execute("""INSERT INTO matches (id, group_id, jornada, date, home_team_id,
                          away_team_id, home_score, away_score, cod_acta)
                        VALUES (687244, 10, 'Jornada 3', '2025-10-24', 1, 2, 1, 11, ?)""",
                     (cod_ff15,))
        conn.executescript("""
          INSERT INTO goals (match_id, minute, player_name, running_score, side, type)
            VALUES (2256, 5, 'Pepe', '0-1', 'a', 'r'),
                   (687244, 54, 'Ylian Jose', '1-11', 'a', 'r');
          INSERT INTO appearances (match_id, team_id, player_id, dorsal, role)
            VALUES (2256, 1, 1, 7, 'starter'), (687244, 1, 2, 9, 'starter');
        """)

    def test_matchdetail_entry_carries_season_and_group(self):
        from scripts.generate_js import generate_matchdetail_js
        conn = _synth_conn()
        conn.executescript("""
          INSERT INTO groups (id, season_id, category_id, code, name, phase)
            VALUES (1, 1, 1, 'A1', 'Grupo 1', 'Segunda Fase A');
          INSERT INTO teams (id, name) VALUES (1, 'Home FC'), (2, 'Away FC');
          INSERT INTO matches (id, group_id, jornada, date, home_team_id, away_team_id,
                               home_score, away_score)
            VALUES (1, 1, 'Jornada 1', '06/06', 1, 2, 1, 0);
          INSERT INTO goals (match_id, minute, player_name, running_score, side, type)
            VALUES (1, 10, 'X', '1-0', 'h', 'r');
        """)
        md = _parse_tail_const(generate_matchdetail_js(conn), "MATCH_DETAIL")
        assert md == {"Home FC|Away FC|1-0":
                      {"s": "2025-2026", "gr": "A1", "g": [[10, "X", "1-0", "h", "r"]]}}

    def test_same_key_in_two_groups_is_a_dup_list_not_an_overwrite(self):
        from scripts.generate_js import generate_matchdetail_js
        conn = _synth_conn()
        self._seed_calero(conn)
        md = _parse_tail_const(generate_matchdetail_js(conn), "MATCH_DETAIL")
        assert md[self.KEY] == {"dup": True, "list": [
            {"s": "2025-2026", "gr": "PG2", "g": [[5, "Pepe", "0-1", "a", "r"]]},
            {"s": "2025-2026", "gr": "FF15", "g": [[54, "Ylian Jose", "1-11", "a", "r"]]},
        ]}
        # La interfaz actual lee detail.g: con una clave repetida recibe
        # undefined y no pinta cronología (no la de otro partido).
        assert "g" not in md[self.KEY]

    def test_same_key_in_two_seasons_is_a_dup_list(self):
        """Lo que pasará al activar 2026/27: mismo cruce y mismo marcador."""
        from scripts.generate_js import generate_matchdetail_js
        conn = _synth_conn()
        conn.executescript("""
          INSERT INTO seasons (id, name, start_year, end_year, is_current)
            VALUES (2, '2026-2027', 2026, 2027, 0);
          INSERT INTO groups (id, season_id, category_id, code, name, phase)
            VALUES (1, 1, 2, 'PG2', 'Grupo 2', 'Liga'),
                   (2, 2, 2, 'PG2', 'Grupo 2', 'Liga');
          INSERT INTO teams (id, name) VALUES (1, 'Home FC'), (2, 'Away FC');
          INSERT INTO matches (id, group_id, jornada, date, home_team_id, away_team_id,
                               home_score, away_score)
            VALUES (1, 1, 'Jornada 1', '2025-10-04', 1, 2, 1, 0),
                   (2, 2, 'Jornada 1', '2026-10-03', 1, 2, 1, 0);
          INSERT INTO goals (match_id, minute, player_name, running_score, side, type)
            VALUES (1, 3, 'A', '1-0', 'h', 'r'), (2, 7, 'C', '1-0', 'h', 'r');
        """)
        md = _parse_tail_const(generate_matchdetail_js(conn), "MATCH_DETAIL")
        entry = md["Home FC|Away FC|1-0"]
        assert entry["dup"] is True
        assert [(e["s"], e["gr"]) for e in entry["list"]] == [
            ("2025-2026", "PG2"), ("2026-2027", "PG2")]

    def test_keys_index_skips_dup_keys(self):
        """MATCH_DETAIL_KEYS == claves con .g (invariante de test_js_modules):
        una clave repetida no tiene .g, así que el ⚽ no debe prometer una
        cronología que el modal no va a pintar."""
        from scripts.generate_js import generate_matchdetail_keys_js
        conn = _synth_conn()
        self._seed_calero(conn)
        conn.executescript("""
          INSERT INTO teams (id, name) VALUES (3, 'UD Guía');
          INSERT INTO matches (id, group_id, jornada, date, home_team_id, away_team_id,
                               home_score, away_score)
            VALUES (3, 10, 'Jornada 4', '2025-10-31', 3, 1, 1, 0);
          INSERT INTO goals (match_id, minute, player_name, running_score, side, type)
            VALUES (3, 11, 'Z', '1-0', 'h', 'r');
        """)
        keys = _parse_tail_const(generate_matchdetail_keys_js(conn), "MATCH_DETAIL_KEYS")
        assert keys == {"UD Guía|CD Calero|1-0": 1}

    def test_lineups_entry_carries_season_group_and_cod(self):
        from scripts.generate_js import generate_lineups_js
        conn = _synth_conn()
        self._seed_calero(conn, cod_ff15=258611)
        lin = _parse_tail_const(generate_lineups_js(conn, "2025-2026"), "LINEUPS_2025_2026")
        entry = lin[self.KEY]
        assert (entry["s"], entry["gr"], entry["cod"]) == ("2025-2026", "FF15", 258611)
        assert entry["home"][0]["n"] == "GOMEZ, RAUL"
        assert set(entry) == {"s", "gr", "cod", "home", "away", "events",
                              "coachH", "coachA", "ref"}

    def test_lineups_same_key_twice_in_a_season_is_a_dup_list(self):
        from scripts.generate_js import generate_lineups_js
        conn = _synth_conn()
        self._seed_calero(conn, cod_pg2=125782, cod_ff15=258611)
        lin = _parse_tail_const(generate_lineups_js(conn, "2025-2026"), "LINEUPS_2025_2026")
        entry = lin[self.KEY]
        assert entry["dup"] is True and "home" not in entry
        assert [(e["s"], e["gr"], e["cod"]) for e in entry["list"]] == [
            ("2025-2026", "PG2", 125782), ("2025-2026", "FF15", 258611)]
        assert [e["home"][0]["n"] for e in entry["list"]] == ["PEREZ, JUAN", "GOMEZ, RAUL"]

    def _real_conn(self, tmp_path):
        if not os.path.exists(DB_PATH):
            pytest.skip("futbolbase.db not present")
        src = sqlite3.connect(DB_PATH)
        conn = sqlite3.connect(str(tmp_path / "fb.db"))
        src.backup(conn)
        src.close()
        return conn

    def test_real_db_no_key_is_silently_overwritten(self, tmp_path):
        """Base real: cada partido con goles sale UNA vez en MATCH_DETAIL y cada
        partido con acta UNA vez en el LINEUPS_<S> de su temporada, con su
        (s, gr[, cod]), sea como entrada suelta o dentro de un dup."""
        from scripts.generate_js import generate_matchdetail_js, generate_lineups_js
        conn = self._real_conn(tmp_path)
        md = _parse_tail_const(generate_matchdetail_js(conn), "MATCH_DETAIL")
        got = sorted((e["s"], e["gr"]) for v in md.values() for e in _entries(v))
        want = sorted(conn.execute("""
            SELECT s.name, gr.code FROM matches m
              JOIN groups gr ON gr.id = m.group_id
              JOIN seasons s ON s.id = gr.season_id
             WHERE m.id IN (SELECT match_id FROM goals)""").fetchall())
        assert got == want, "MATCH_DETAIL perdió o duplicó partidos con goles"
        for sid, sname in conn.execute("SELECT id, name FROM seasons").fetchall():
            lin = _parse_tail_const(generate_lineups_js(conn, sname),
                                    "LINEUPS_" + sname.replace("-", "_"))
            got = sorted((e["s"], e["gr"], e["cod"]) for v in lin.values() for e in _entries(v))
            want = sorted(conn.execute("""
                SELECT ?, gr.code, m.cod_acta FROM matches m
                  JOIN groups gr ON gr.id = m.group_id
                 WHERE gr.season_id = ? AND m.cod_acta IS NOT NULL""",
                (sname, sid)).fetchall())
            assert got == want, f"LINEUPS_{sname} perdió o duplicó actas"

    def test_real_db_calero_timeline_is_tagged_ff15(self, tmp_path):
        """En la base real solo el partido de FF15 (12 goles) tiene cronología;
        el de PG2 no tiene goles. La entrada sale con gr='FF15', así que el
        rediseño sabrá que no es la del partido de PG2. Si algún día PG2 trae
        goles, la clave pasa a dup con FF15 y PG2: el test lo acepta. Si una
        fusión o un renombrado de equipos hace desaparecer la clave, se salta:
        la invariante general la vigila test_real_db_no_key_is_silently_overwritten."""
        from scripts.generate_js import generate_matchdetail_js
        conn = self._real_conn(tmp_path)
        md = _parse_tail_const(generate_matchdetail_js(conn), "MATCH_DETAIL")
        entry = md.get(self.KEY)
        if entry is None:
            pytest.skip("la clave de Calero ya no está en la base")
        entries = [e for e in _entries(entry) if e["s"] == "2025-2026"]
        grs = {e["gr"] for e in entries}
        assert "FF15" in grs and grs <= {"FF15", "PG2"}, grs
        ff15 = next(e for e in entries if e["gr"] == "FF15")
        assert len(ff15["g"]) == 12 and ff15["g"][-1][2] == "1-11"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_pygen_fixes.py -q -k TestMatchKeyCollisions
```
Esperado: `8 failed, 39 deselected`. Los errores:
- `KeyError: 's'` y `KeyError: 'dup'`, porque las entradas actuales son solo `{g}`;
- `AssertionError` en los tests que comparan la entrada entera, porque le faltan `s`, `gr` o `dup`;
- `AssertionError: assert {'CD Calero|L...alero|1-0': 1} == {'UD Guía|CD Calero|1-0': 1}`: hoy el índice incluye la clave repetida.

- [ ] **Step 3: Write minimal implementation (generador).** En `scripts/generate_js.py`, sustituir todo el bloque que va desde `def generate_matchdetail_js(conn):` (≈435) hasta la línea anterior a `def _season_const_suffix(season_name):` (≈488) por:

```python
def _keyed_or_dup(pairs):
    """[(clave, entrada), …] → {clave: entrada}; si dos o más partidos producen
    la misma clave `local|visitante|gl-gv`, {clave: {"dup": True, "list":
    [entrada, …]}} en el orden recibido. Nunca sobrescribe: antes ganaba el
    último partido y el otro desaparecía sin aviso (la clave
    'CD Calero|La Garita|1-11' la comparten un partido de FF15 y otro de PG2).
    Una entrada dup no lleva .g/.home: la interfaz actual lee undefined y no
    pinta nada, en vez de los datos de otro partido."""
    buckets = {}
    for key, entry in pairs:
        buckets.setdefault(key, []).append(entry)
    return {k: v[0] if len(v) == 1 else {"dup": True, "list": v}
            for k, v in buckets.items()}


def _match_details(conn):
    """{clave: {s, gr, g}} (o dup) con la cronología de goles de TODAS las
    temporadas. s = temporada y gr = código de grupo, para que la interfaz
    distinga dos partidos con la misma clave."""
    rows = conn.execute(
        """SELECT DISTINCT m.id, h.name, a.name, m.home_score, m.away_score,
                  s.name, gr.code
           FROM matches m
           JOIN teams h ON m.home_team_id = h.id
           JOIN teams a ON m.away_team_id = a.id
           JOIN groups gr ON gr.id = m.group_id
           JOIN seasons s ON s.id = gr.season_id
           JOIN goals g ON g.match_id = m.id
           ORDER BY m.id""",
    ).fetchall()

    pairs = []
    for match_id, home, away, hs, as_, season, code in rows:
        goals = conn.execute(
            """SELECT minute, player_name, running_score, side, type
               FROM goals WHERE match_id = ? ORDER BY minute, id""",
            (match_id,),
        ).fetchall()
        pairs.append((_match_key(home, away, hs, as_),
                      {"s": season, "gr": code, "g": [list(g) for g in goals]}))
    return _keyed_or_dup(pairs)


def generate_matchdetail_js(conn):
    """Generate data-matchdetail.js with goal details per match."""
    header = (
        "// data-matchdetail.js — generado por scripts/generate_js.py\n"
        "// NO editar manualmente — usar scripts/update.sh para regenerar\n\n"
    )
    js = header + "const MATCH_DETAIL=" + js_val(_match_details(conn)) + ";"
    return js


def generate_matchdetail_keys_js(conn):
    """Generate data-matchdetail-keys.js: an O(1) presence map of the match
    keys that have a goal timeline, so the ⚽ badge can render without loading
    the full (~359 KB) data-matchdetail.js. Built from the same entries as
    generate_matchdetail_js, minus the dup keys: a dup entry has no .g, so the
    badge would promise a timeline the modal does not paint."""
    header = (
        "// data-matchdetail-keys.js — generado por scripts/generate_js.py\n"
        "// NO editar manualmente — usar scripts/update.sh para regenerar\n\n"
    )
    keys = {k: 1 for k, v in _match_details(conn).items() if not v.get("dup")}
    return header + "const MATCH_DETAIL_KEYS=" + js_val(keys) + ";"


```

En `generate_lineups_js` hay tres cambios.

(a) Docstring (≈493-495). Antes:
```python
    """Emit data-lineups-<season>.js with shape:
       const LINEUPS_<YYYY_YYYY> = { "<home>|<away>|<hs>-<as>": { home:[...], away:[...], events:[...], coachH, coachA, ref } };
    """
```
Después:
```python
    """Emit data-lineups-<season>.js with shape:
       const LINEUPS_<YYYY_YYYY> = { "<home>|<away>|<hs>-<as>": { s, gr, cod, home:[...], away:[...], events:[...], coachH, coachA, ref } };
       s = season name, gr = group code, cod = matches.cod_acta. A key shared by
       two or more matches is { dup: true, list: [ {s, gr, cod, home, ...}, ... ] }.
    """
```
(b) Consulta y bucle (≈500-505). Antes:
```python
      SELECT m.id, t1.name, t2.name, m.home_score, m.away_score
        FROM matches m JOIN groups g ON g.id=m.group_id
        JOIN teams t1 ON t1.id=m.home_team_id JOIN teams t2 ON t2.id=m.away_team_id
       WHERE g.season_id=? AND m.cod_acta IS NOT NULL""", (season_id[0],)).fetchall()
    obj = {}
    for mid, h, a, hs, asc in rows:
```
Después:
```python
      SELECT m.id, t1.name, t2.name, m.home_score, m.away_score, g.code, m.cod_acta
        FROM matches m JOIN groups g ON g.id=m.group_id
        JOIN teams t1 ON t1.id=m.home_team_id JOIN teams t2 ON t2.id=m.away_team_id
       WHERE g.season_id=? AND m.cod_acta IS NOT NULL
       ORDER BY m.id""", (season_id[0],)).fetchall()
    pairs = []
    for mid, h, a, hs, asc, code, cod in rows:
```
(c) Entrada (≈545-550). Antes:
```python
        obj[key] = {"home": home, "away": away, "events": events,
                    "coachH": ch[0] if ch else None,
                    "coachA": ca[0] if ca else None,
                    "ref":    ref[0] if ref else None}
    suffix = _season_const_suffix(season_name)
```
Después:
```python
        pairs.append((key, {"s": season_name, "gr": code, "cod": cod,
                            "home": home, "away": away, "events": events,
                            "coachH": ch[0] if ch else None,
                            "coachA": ca[0] if ca else None,
                            "ref":    ref[0] if ref else None}))
    obj = _keyed_or_dup(pairs)
    suffix = _season_const_suffix(season_name)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_pygen_fixes.py -q -k TestMatchKeyCollisions
python3 -m pytest scripts/tests/test_pygen_fixes.py -q
```
Esperado: `8 passed, 39 deselected` y después `47 passed`. `TestMatchKeySanitize`, `TestLineupsSubstitutions` y `TestHistoricalMatchDetails` (Tarea 1) siguen en verde.

- [ ] **Step 5: Write the failing test (auditoría de actas publicadas).** La (i), `test_published_lineups_match_the_database`, compara el número de **claves** con los partidos con acta de la base. Con un `dup`, esa comparación fallaría y bloquearía al bot aunque no se hubiera perdido nada. En `scripts/tests/test_db_sanity.py`, añadir justo después de la función `_lineup_keys` (que termina en `    return list(json.loads(m.group(1))) if m else []`, ≈185), con dos líneas en blanco antes y después:

```python
def test_lineup_count_counts_every_match_of_a_dup_key():
    """(i) cuenta partidos: una clave repetida no descuadra la comparación."""
    texto = ('// Auto-generated by scripts/generate_js.py — do not edit\n'
             'const LINEUPS_2025_2026 = {"A|B|1-0": {"s": "2025-2026", "gr": "A1"}, '
             '"CD Calero|La Garita|1-11": {"dup": true, "list": ['
             '{"s": "2025-2026", "gr": "PG2"}, {"s": "2025-2026", "gr": "FF15"}]}};\n')
    assert _lineup_keys(texto) == ["A|B|1-0", "CD Calero|La Garita|1-11"]
    assert _lineup_count(texto) == 3
```

- [ ] **Step 6: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_db_sanity.py -q -k lineup_count
```
Esperado: `1 failed`, con `NameError: name '_lineup_count' is not defined`.

- [ ] **Step 7: Write minimal implementation (helper y uso en la i).** En `scripts/tests/test_db_sanity.py`, insertar entre `_lineup_keys` y el test del paso 5:

```python
def _lineup_count(texto):
    """Partidos publicados en un data-lineups-*.js (no claves).

    Desde el Plan A (§9.2) dos partidos con la misma clave `local|visitante|gl-gv`
    salen como {"dup": true, "list": [...]} en vez de pisarse, así que una clave
    repetida vale tantos partidos como su lista.
    """
    import json
    import re as _re
    m = _re.search(r"const LINEUPS_\d{4}_\d{4}\s*=\s*(\{[\s\S]*?\});\s*$", texto.strip())
    if not m:
        return 0
    return sum(len(v["list"]) if v.get("dup") else 1
               for v in json.loads(m.group(1)).values())


```
Y en `test_published_lineups_match_the_database` (≈210). Antes:
```python
            publicadas = len(_lineup_keys(f.read()))
```
Después:
```python
            publicadas = _lineup_count(f.read())
```

- [ ] **Step 8: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_db_sanity.py -q
```
Esperado: `11 passed`.

- [ ] **Step 9: Write the failing test (interfaz actual frente a claves dup).** Añadir al final de `scripts/tests/test_sp2_modules.mjs`, dejando una línea en blanco antes. `test`, `assert` y `aggregatePlayerFromLineups` ya están importados en el fichero; `readFileSync` lo importa el propio bloque.

```js
// ─── Plan A §9.2: claves repetidas {dup:true, list:[…]} ─────────────────────
// Desde el Plan A, MATCH_DETAIL y LINEUPS_<S> exportan como {dup:true, list}
// las claves `local|visitante|gl-gv` que comparten dos partidos. La interfaz
// actual no sabe elegir entre ellos: los trata como si no hubiera datos.
import { singleEntry } from '../../src/modals.js';
import { readFileSync } from 'node:fs';

const DUP = { dup: true, list: [
  { s: '2025-2026', gr: 'PG2', cod: 125782, events: [],
    home: [{ n: 'PEREZ, JUAN', r: 'starter', g: 1, y: 0, rd: 0 }], away: [] },
  { s: '2025-2026', gr: 'FF15', cod: 258611, events: [],
    home: [{ n: 'PEREZ, JUAN', r: 'starter', g: 2, y: 0, rd: 0 }], away: [] },
] };

test('singleEntry: deja pasar la entrada normal y trata la repetida como ausente', () => {
  const one = { s: '2025-2026', gr: 'FF15', g: [[54, 'Ylian Jose', '1-11', 'a', 'r']] };
  assert.equal(singleEntry(one), one);
  assert.equal(singleEntry(DUP), undefined);
  assert.equal(singleEntry(undefined), undefined);
  assert.equal(singleEntry(null), undefined);
});

test('aggregatePlayerFromLineups salta una clave repetida sin romperse', () => {
  const L = {
    'CD Calero|La Garita|1-11': DUP,
    'CD Calero|Moya|2-0': { s: '2025-2026', gr: 'FF15', cod: 258700, events: [],
      home: [{ n: 'PEREZ, JUAN', r: 'starter', g: 1, y: 0, rd: 0 }], away: [] },
  };
  const agg = aggregatePlayerFromLineups(L, 'PEREZ, JUAN', 'CD Calero');
  assert.equal(agg.appearances, 1);
  assert.equal(agg.goals, 1);
  assert.deepEqual(agg.matches.map(m => m.matchKey), ['CD Calero|Moya|2-0']);
});

test('openMatchDetail pasa las dos búsquedas por singleEntry', () => {
  const src = readFileSync(new URL('../../src/modals.js', import.meta.url), 'utf8');
  assert.match(src, /const m = singleEntry\(lineups && lineups\[matchKey\]\);/);
  assert.match(src, /const detail = singleEntry\(details && details\[matchKey\]\);/);
});
```

- [ ] **Step 10: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_sp2_modules.mjs 2>&1 | grep -E "SyntaxError|^# (pass|fail)"
```
Esperado: `SyntaxError: The requested module '../../src/modals.js' does not provide an export named 'singleEntry'`, `# pass 0` y `# fail 1`. Falla el fichero entero.

- [ ] **Step 11: Write minimal implementation (guarda en la interfaz actual).** Todo va en `src/modals.js`; `src/matchdetail-rich.js` no se toca.

Dentro de `openMatchDetail` (≈430). Antes:
```js
    const m = lineups && lineups[matchKey];
```
Después:
```js
    const m = singleEntry(lineups && lineups[matchKey]);
```
Dentro de `openMatchDetail` (≈436). Antes:
```js
        const detail = details && details[matchKey];
```
Después:
```js
        const detail = singleEntry(details && details[matchKey]);
```
Y la función, justo después de `fillIfCurrent` (≈165-169) y antes de `export function closeModal()`. Antes:
```js
export function fillIfCurrent(slot, key, render) {
  if (!slot || !slot.dataset || slot.dataset.key !== key) return false;
  render(slot);
  return true;
}

export function closeModal() {
```
Después:
```js
export function fillIfCurrent(slot, key, render) {
  if (!slot || !slot.dataset || slot.dataset.key !== key) return false;
  render(slot);
  return true;
}

/* Entrada de MATCH_DETAIL / LINEUPS_<S> para una clave `local|visitante|gl-gv`.
 * Desde el Plan A (§9.2) la clave que comparten dos partidos llega como
 * {dup: true, list: [...]}. Esta interfaz no sabe elegir entre ellos, así que
 * la trata como ausente: ni alineación ni cronología, antes que las de otro
 * partido. Vive en este módulo (y no en matchdetail-rich.js) para que un
 * modals.js nuevo nunca dependa de un export que un matchdetail-rich.js viejo
 * de la caché del service worker no tenga. */
export function singleEntry(entry) {
  return entry && !entry.dup ? entry : undefined;
}

export function closeModal() {
```

- [ ] **Step 12: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_sp2_modules.mjs 2>&1 | grep -E '^# (pass|fail)'
```
Esperado: `# pass 17` y `# fail 0`.

- [ ] **Step 13: Write the failing test (invariantes de forma sobre los data-*.js).** Dos cambios en `scripts/tests/test_js_modules.mjs`.

(a) Dentro de `test('actas data files: lineups events reference players in the same match', …)` (≈376-381). Antes:
```js
    const Lin = loadDataFile(f)[linVar];
    const Pla = loadDataFile(playersFile)[plaVar];
    assert.ok(Lin && typeof Lin === 'object', `${linVar} must load`);
    assert.ok(Pla && typeof Pla === 'object', `${plaVar} must load`);
    // Invariant 1: every event in LINEUPS references a player in the same match's lineup
    for (const [matchKey, match] of Object.entries(Lin)) {
```
Después:
```js
    const Lin = loadDataFile(f)[linVar];
    // Una temporada que la lista de loadDataFile aún no conoce (p. ej.
    // data-lineups-2026-2027.js al activarla) se salta en vez de bloquear al bot.
    if (!Lin) continue;
    const Pla = loadDataFile(playersFile)[plaVar];
    assert.ok(Lin && typeof Lin === 'object', `${linVar} must load`);
    assert.ok(Pla && typeof Pla === 'object', `${plaVar} must load`);
    // Invariant 1: every event in LINEUPS references a player in the same match's lineup
    // Una clave repetida ({dup:true, list}) se comprueba partido a partido.
    const partidos = Object.entries(Lin).flatMap(([k, v]) => entriesOf(v).map(e => [k, e]));
    for (const [matchKey, match] of partidos) {
```
(b) Al final del fichero, dejando una línea en blanco antes. `entriesOf` es una declaración de función, así que se eleva y el test de actas ya la ve:
```js
// ─── Plan A §9.2: s/gr (y cod) en MATCH_DETAIL y LINEUPS_<S> ─────────────────
// Cada entrada lleva s (temporada) y gr (código de grupo); LINEUPS además cod
// (matches.cod_acta). Una clave que comparten dos partidos es
// {dup:true, list:[≥2 entradas]} y no lleva .g/.home: la interfaz actual lee
// undefined y no pinta nada, en vez de la cronología de otro partido.
function entriesOf(v) { return v && v.dup ? v.list : [v]; }

test('MATCH_DETAIL: cada entrada lleva s y gr; las claves repetidas van en list', () => {
  const { MATCH_DETAIL } = loadDataFile('data-matchdetail.js');
  for (const [k, v] of Object.entries(MATCH_DETAIL)) {
    if (v.dup) {
      assert.ok(Array.isArray(v.list) && v.list.length >= 2, `${k}: dup con 2 o más entradas`);
      assert.ok(!('g' in v), `${k}: una clave dup no lleva .g`);
    }
    for (const e of entriesOf(v)) {
      assert.match(e.s, /^\d{4}-\d{4}$/, `${k}: s`);
      assert.ok(typeof e.gr === 'string' && e.gr.length > 0, `${k}: gr`);
      assert.ok(Array.isArray(e.g) && e.g.length > 0, `${k}: g`);
    }
  }
});

test('LINEUPS_<S>: cada entrada lleva s de su fichero, gr y cod', () => {
  const files = readdirSync(ROOT).filter(f => /^data-lineups-\d{4}-\d{4}\.js$/.test(f));
  assert.ok(files.length > 0, 'hay ficheros data-lineups-*.js');
  for (const f of files) {
    const season = f.match(/data-lineups-(\d{4}-\d{4})\.js/)[1];
    const Lin = loadDataFile(f)[`LINEUPS_${season.replace('-', '_')}`];
    if (!Lin) continue;   // temporada que loadDataFile aún no conoce (2026-2027…)
    for (const [k, v] of Object.entries(Lin)) {
      if (v.dup) {
        assert.ok(Array.isArray(v.list) && v.list.length >= 2, `${f} ${k}: dup con 2 o más entradas`);
        assert.ok(!('home' in v), `${f} ${k}: una clave dup no lleva .home`);
      }
      for (const e of entriesOf(v)) {
        assert.equal(e.s, season, `${f} ${k}: s`);
        assert.ok(typeof e.gr === 'string' && e.gr.length > 0, `${f} ${k}: gr`);
        assert.ok(Number.isInteger(e.cod) && e.cod > 0, `${f} ${k}: cod`);
      }
    }
  }
});
```

- [ ] **Step 14: Run test to verify it fails** (los `data-*.js` todavía son los antiguos)

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_js_modules.mjs 2>&1 | grep -E "^# (pass|fail)|^not ok|error: '"
```
Esperado: `# pass 28` y `# fail 2`. Los dos tests nuevos dan `not ok`:
- `MATCH_DETAIL: …`, con `'<primera clave>: s'` (hoy `'Guayarmina|Santidad|8-4: s'`);
- `LINEUPS_<S>: …`, con `data-lineups-2021-2022.js Garepa Viera|La Garita|5-1: s` (`+ undefined - '2021-2022'`).

El invariante de `data-matchdetail-keys.js` y el test de actas siguen en verde.

- [ ] **Step 15: Regenerar los datos**

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/generate_js.py
git status --short
```
Esperado al final de la salida: `11. Cache version (only if data changed — C4)`, seguido de `index.html cache version bumped to ?v=<AAAAMMDD de hoy><letra>` y `sw.js CACHE_NAME bumped to futbolbase-v<misma>`. Ya hubo una subida hoy en la Tarea 1, así que lleva letra (`b`, `c`…).

`git status --short` muestra solo:
- `M` en `data-lineups-2021-2022.js` … `data-lineups-2025-2026.js`, `data-matchdetail-keys.js`, `data-matchdetail.js`, `index.html` y `sw.js`;
- `M` en los 6 ficheros de código y tests de esta tarea: `scripts/generate_js.py`, `scripts/tests/test_pygen_fixes.py`, `scripts/tests/test_db_sanity.py`, `scripts/tests/test_js_modules.mjs`, `scripts/tests/test_sp2_modules.mjs` y `src/modals.js`;
- los dos `??` preexistentes.

Si aparece otro `data-*.js` modificado, la base va por delante de lo publicado. Hay que parar y averiguar por qué antes de seguir.

- [ ] **Step 16: Comprobar que la interfaz actual recibe los mismos datos** (mismas claves y mismo contenido, salvo `s`, `gr` y `cod`)

```bash
cd /home/manolo/claude/futbol-base
node - <<'EOF'
const vm = require('vm'), fs = require('fs'), cp = require('child_process');
const load = (txt, name) => { const c = {}; vm.createContext(c); vm.runInContext(txt + '\nthis.X=' + name + ';', c); return c.X; };
const pair = (f, name) => [load(cp.execSync('git show HEAD:' + f, { maxBuffer: 1 << 26 }).toString(), name), load(fs.readFileSync(f, 'utf8'), name)];
const strip = ({ s, gr, cod, ...rest }) => rest;
const [ok, nk] = pair('data-matchdetail-keys.js', 'MATCH_DETAIL_KEYS');
console.log('MATCH_DETAIL_KEYS mismo conjunto:', JSON.stringify(Object.keys(ok).sort()) === JSON.stringify(Object.keys(nk).sort()));
for (const [f, name] of [['data-matchdetail.js', 'MATCH_DETAIL'],
    ...fs.readdirSync('.').filter(f => /^data-lineups-\d{4}-\d{4}\.js$/.test(f)).sort()
      .map(f => [f, 'LINEUPS_' + f.slice(13, 22).replace('-', '_')])]) {
  const [o, n] = pair(f, name);
  const dups = Object.values(n).filter(v => v.dup).length;
  const diff = Object.keys(o).filter(k => !n[k] || (!n[k].dup && JSON.stringify(strip(n[k])) !== JSON.stringify(o[k]))).length;
  console.log(f, 'claves', Object.keys(o).length, '->', Object.keys(n).length, '| distintas (sin s/gr/cod):', diff, '| dup:', dups);
}
EOF
```
Esperado, con la base de hoy:
```
MATCH_DETAIL_KEYS mismo conjunto: true
data-matchdetail.js claves 1222 -> 1222 | distintas (sin s/gr/cod): 0 | dup: 0
data-lineups-2021-2022.js claves 85 -> 85 | distintas (sin s/gr/cod): 0 | dup: 0
data-lineups-2022-2023.js claves 21 -> 21 | distintas (sin s/gr/cod): 0 | dup: 0
data-lineups-2023-2024.js claves 28 -> 28 | distintas (sin s/gr/cod): 0 | dup: 0
data-lineups-2024-2025.js claves 77 -> 77 | distintas (sin s/gr/cod): 0 | dup: 0
data-lineups-2025-2026.js claves 51 -> 51 | distintas (sin s/gr/cod): 0 | dup: 0
```

- [ ] **Step 17: Run test to verify it passes y suites completas**

```bash
cd /home/manolo/claude/futbol-base
node --test scripts/tests/test_js_modules.mjs 2>&1 | grep -E '^# (pass|fail)'
python3 -m pytest scripts/tests/ -q
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Esperado:
- `test_js_modules.mjs`: `# pass 30` y `# fail 0`.
- pytest: `386 passed, 5 skipped`, es decir, los 377 de la Tarea 1 más 9.
- node: `# tests 237`, `# pass 237` y `# fail 0`, es decir, los 232 de antes más 5.

- [ ] **Step 18: Pruebas de navegador con los datos y el `modals.js` nuevos**

```bash
cd /home/manolo/claude/futbol-base
PW=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/pw/node_modules
node scripts/tests/render-smoke.mjs
NODE_PATH="$PW" node scripts/tests/interaction-smoke.mjs
```
Esperado: `PASS: render smoke OK — MI EQUIPO rendered (…)` y solo líneas `PASS:` en `interaction-smoke`; la última es `PASS: future date/time/venue, maps, downloaded ICS and explicit source statuses`.

- [ ] **Step 19: Commit**

Sin push: se publica en la Tarea 5.

```bash
cd /home/manolo/claude/futbol-base
git add scripts/generate_js.py scripts/tests/test_pygen_fixes.py scripts/tests/test_db_sanity.py \
  scripts/tests/test_js_modules.mjs scripts/tests/test_sp2_modules.mjs src/modals.js \
  data-matchdetail.js data-matchdetail-keys.js data-lineups-*.js index.html sw.js
git commit -F - <<'EOF'
feat: MATCH_DETAIL y LINEUPS con temporada y grupo, sin pisar claves repetidas (Plan A §9.2)

- Cada entrada de MATCH_DETAIL lleva s (temporada) y gr (código de grupo);
  las de LINEUPS_<S> además cod (matches.cod_acta).
- Si dos partidos producen la misma clave local|visitante|gl-gv, se exporta
  {dup: true, list: [...]} en vez de quedarse con el último.
- MATCH_DETAIL_KEYS deja fuera las claves dup (no tienen .g).
- La interfaz actual trata una clave dup como ausente (singleEntry, definida
  en modals.js para no depender de otro módulo de la caché del SW); con los
  datos de hoy no hay ninguna y todo se ve igual.
- test_db_sanity (i) cuenta partidos, no claves; los tests de LINEUPS_* de
  test_js_modules se saltan una temporada que loadDataFile aún no conoce.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
git show --stat HEAD | tail -16
```
Esperado: 15 ficheros en el commit, entre ellos `src/modals.js`; `src/matchdetail-rich.js` no está.

---

### Task 3: Tanda de penaltis, hora y campo en los cuadros de la Maspalomas Cup (filas de 9 columnas, spec §9.3)

**Contexto**
- **El raw** (`scripts/maspalomas_cup_2026_raw.json`) tiene 464 partidos, todos `FINISHED`: Alevín 238, Benjamín 168 y Prebenjamín 58.
  - 24 tienen `penaltyStatus='saved'` (13 `home` y 11 `away`) y `penaltyHomeScore`/`penaltyAwayScore` enteros.
  - Los otros 440 tienen `'none'` y null. No hay ninguno con marcador de tanda sin `saved`.
  - En los 24, el ganador coincide con el marcador de la tanda y el partido acabó en empate.
  - Solo se publican 14, todos en cuadros: 12 de benjamín y 2 de prebenjamín. La spec dice «24 partidos», que es cierto para el raw completo.
- **Ejemplos:**
  - 1105, Las Mesas–Unión Carrizal: 1-1, tanda 3-2 `home`, 10:00, «CD 4».
  - 2333, final de la Copa Oro benjamín, AD Huracán A–UD Vecindario A: 2-2, tanda 3-4 `away`, 17:00, «CD 1.1».
- **Unicidad.** (día, local, visitante) es único dentro de cada cuadro (11/11 y 33/33), así que el cruce con `matches` no es ambiguo.
- **Estado de partida.**
  - `fetch_maspalomas_cup.py --from-raw --check` da «Al día.»: el test dorado está en verde.
  - Las filas de cuadro son de 5 columnas (74) o de 6 (14).
  - Después del cambio, las 88 tienen 9 columnas, y fuera de las filas de cuadro el fichero es idéntico (paso 5).
- **Por qué no se rompe cada consumidor de la interfaz actual:**
  - `matchAdvancer` (`state.js` ≈182-189) desestructura `[, home, away, hs, as, pen]`. Un `pen` null se comporta igual que el `undefined` de antes, y los 14 empates llevan `pen`.
  - `bracketDrawAdvancer` (≈166-175) solo usa `m[1]` y `m[2]`.
  - `bracketChampion` (≈195-202) da los mismos campeones: MCPK1 CF Unión Viera, MCPK2 AD Huracán, MCBK1 Gáldar CF y MCBK2 UD Vecindario A.
  - `knockoutRoundsSource` (≈157-161) e `isRoundRobinCup` (≈342-357) solo cuentan filas.
  - `countMatches` (≈715-723) usa `g.matches`.
  - `buildKnockoutBracket` (`render.js` ≈185-255) usa `[, home, away, hs, as]`, más `matchAdvancer`.
  - `calcHistoricalStats` (`render.js` ≈838-870) y los modales (`modals.js` ≈338-342 y ≈478-487) leen los índices del 0 al 4.
  - `favorites.js` solo lee `standings`. `plantilla.js` y `matchdetail-rich.js` no leen filas de partido.
- **Probado en Chrome, antes y después:**
  - el HTML de las 27 tarjetas MC* de Clasificación es idéntico byte a byte en las dos categorías: cuadro, campeón y «pen»;
  - también son idénticos las Jornadas de MCPK1/2, MCBK1/2, MCP1/2 y MCB1/2, la ficha de equipo abierta desde el cuadro, Estadísticas y Mi equipo;
  - no hay errores de consola.
- **Única diferencia visible:** en un enlace directo escrito a mano con `round=<clave de ronda>` (del tipo `27-06-2026 ( Final )`) aparece «Ver campo ↗», porque `init.js` ≈97-103 toma `venue` de `row[7]`. La interfaz no genera esos enlaces en la temporada vigente: usa `round=Eliminatorias` y resuelve por `group.matches`, que no cambia.
- **Ruta histórica.** `getHistoricalJornadaMatches` (`render.js` ≈529-534) lee `m[6]` y `m[7]` como hora y campo.
  - Solo se alcanza cuando 2025-26 pase a ser histórica, tras activar 2026/27: `withSeasonCup` (`state.js` ≈540-547) añade las copas solo para `'2025-2026'`, y `S.season` vale `''` en la temporada vigente.
  - Desde ese momento, el archivo mostrará la hora y el campo de los cuadros. Es la mejora buscada.
- **`status: m[8]` en `featuredMatchesFrom`** (`state.js:64`). El índice 8 de estas filas es la tanda (`'3-4'`), no un estado. No afecta:
  - esa función nunca recibe filas de cuadro: lee `HISTORY[FEATURED.groupId] || group.jornadas` del grupo de mi equipo, que necesita una fila de clasificación, y los cuadros tienen `standings: []`;
  - aunque la recibiera, `miequipo.js` ≈291 solo reacciona a `'postponed'` y `'not_played'`.
  - En el Plan B, `model.js` debe leer el 8 como `tanda`. Hoy ninguna fila de `HISTORY` tiene 9 columnas: son 3.559 filas, todas de 8.
- **Hora de la API.** Las fechas del raw traen `Z`, pero representan la hora local: el primer partido es a las 08:00.
  - `normalize` hace `strftime` sin convertir, igual que en las `matches` en línea que ya se publican, y `test_bracket_time_and_field_match_the_inline_list` fija que ambas coinciden.
  - En el Plan B, `model.js` no debe tratar estas horas como UTC.
- **Subida de versión.** `generate_js.py` toma su instantánea C4 al empezar su propio `main()`, y `fetch_maspalomas_cup.py` no pasa por él. Por eso el paso 6 sube la versión a mano; sin ese paso, la PWA seguiría sirviendo el fichero viejo, compatible pero sin el dato nuevo. En secuencia, `_next_version` añade la letra siguiente (`b`, `c`…).
- **El test de Node lee el `data-maspalomas-cup-2026.js` vivo**, en contra de la regla §11, que es para los tests del Plan B. Aquí está justificado:
  - el torneo terminó el 27/06/2026;
  - `update.yml` no ejecuta `fetch_maspalomas_cup.py`;
  - `activate_season.py` (≈118-124 y ≈163-166) solo copia el fichero;
  - `test_maspalomas_cup.py` ya lo lee hoy.
- **Tests que no son rojo-verde.** Los dos tests nuevos de Node son de compatibilidad: pasan con las filas de 5 o 6 columnas y tienen que seguir pasando con las de 9.
- **Otros tests.** `test_data_globals_contract.mjs` (≈95-102) solo comprueba los nombres de las variables, y ningún otro test comprueba la longitud de las filas de la Maspalomas.
- **Tras esta tarea no queda ninguna fila de 6 columnas en el repo:** las temporadas pasadas tienen 8 (Tarea 1), `HISTORY` 8 y los cuadros 9. Aun así, el `model.js` del Plan B debe seguir aceptando 5 y 6 columnas, porque el SW (stale-while-revalidate) puede servir un `data-maspalomas-cup-2026.js` antiguo hasta que rote la caché.
- **Ficheros sin seguimiento.** No hay que usar `git add -A`: en el árbol hay dos que no son de esta tarea, `HANDOFF.md` y `docs/mejoras-2026-09.md`.

**Files:**
- Modify: `scripts/fetch_maspalomas_cup.py`: `normalize` (≈107-122), `_shootout_score` nueva después de `_penalty_winner` (≈130) y `row_short` (≈148-161).
- Modify: `scripts/tests/test_maspalomas_cup.py`: `_match` (≈28-35), los tests de `row_short` y de la final de la Copa Oro (≈58-73) y tests nuevos al final de `TestPublishedContent` (≈264).
- Modify: `scripts/tests/test_review0615_frontend.mjs`: import de `vm` junto a los de `node:fs` y `node:path` (≈14-15), y tests nuevos detrás de `test('bracketChampion: null cuando la última ronda no decide', …)` (≈300).
- Modify: `data-maspalomas-cup-2026.js` (se regenera con `--from-raw`).
- Modify: `index.html` (las 11 `?v=` y `Última actualización`) y `sw.js` (línea 1, `CACHE_NAME`).
- Test: `scripts/tests/test_maspalomas_cup.py` y `scripts/tests/test_review0615_frontend.mjs`.

**Interfaces:**
- Consumes:
  - `scripts/maspalomas_cup_2026_raw.json`, con los campos `date`, `field`, `penaltyStatus`, `penaltyWinner`, `penaltyHomeScore` y `penaltyAwayScore`;
  - `short_field()` y `_penalty_winner()` de `fetch_maspalomas_cup.py`;
  - `generate_js.bump_cache_version()`.
- Produces:
  - `_shootout_score(match) -> 'h-a' | None`;
  - `normalize(match)["shootout"]`;
  - `row_short(m)` → `[día, local, visitante, gl, gv, pen|None, hora, campo corto, tanda|None]`.
  - En `MASPALOMAS_CUP_PREBENJAMIN` y `MASPALOMAS_CUP_BENJAMIN`, cada `jornadas[ronda]` de los 4 cuadros (MCPK1, MCPK2, MCBK1 y MCBK2) pasa a filas de 9 columnas: 88 filas, 14 de ellas con tanda.
  - Las filas en línea de 7 columnas no cambian: las `matches` de la fase de grupos y de los cuadros.

- [ ] **Step 1: Write the failing test**

`scripts/tests/test_maspalomas_cup.py`, helper `_match` (≈28-35). Antes:

```python
def _match(n, day="26/06", time="10:00", home="A", away="B", hs=1, as_=0,
           field="Campo CD 1.1 - Campo Joma 1", pen=None):
    """Partido ya normalizado, como los que manejan los helpers internos."""
    d = datetime.datetime.strptime(f"2026-{day[3:]}-{day[:2]} {time}",
                                   "%Y-%m-%d %H:%M")
    return {"n": n, "kickoff": d, "day": day, "time": time,
            "date_key": d.strftime("%d-%m-%Y"), "home": home, "away": away,
            "hs": hs, "as": as_, "field": field, "pen": pen}
```

Después:

```python
def _match(n, day="26/06", time="10:00", home="A", away="B", hs=1, as_=0,
           field="Campo CD 1.1 - Campo Joma 1", pen=None, shootout=None):
    """Partido ya normalizado, como los que manejan los helpers internos."""
    d = datetime.datetime.strptime(f"2026-{day[3:]}-{day[:2]} {time}",
                                   "%Y-%m-%d %H:%M")
    return {"n": n, "kickoff": d, "day": day, "time": time,
            "date_key": d.strftime("%d-%m-%Y"), "home": home, "away": away,
            "hs": hs, "as": as_, "field": field, "pen": pen,
            "shootout": shootout}
```

Mismo fichero (≈58-73): se sustituyen los tests `test_row_carries_a_sixth_column_only_on_shootouts` y `test_published_final_of_the_gold_cup_names_its_winner` por el bloque siguiente. Las dos clases nuevas quedan entre `TestPenaltyWinner` y `TestShortField`:

```python
    def test_published_final_of_the_gold_cup_names_its_winner(self):
        # Copa Oro benjamín 2026: 2-2 y penaltis 3-4 → gana el visitante.
        src = JS_PATH.read_text(encoding="utf-8")
        m = re.search(r"const MASPALOMAS_CUP_BENJAMIN = (\[.*?\]);", src, re.DOTALL)
        gold = next(g for g in json.loads(m.group(1)) if g["name"] == "Copa Oro")
        final = gold["jornadas"][list(gold["jornadas"])[-1]]
        assert len(final) == 1
        assert final[0][3] == final[0][4], "la final acabó en empate"
        assert final[0][5] == "away", "falta quién ganó la tanda"
        assert final[0][8] == "3-4", "falta el resultado de la tanda"


class TestShootoutScore:
    """La tanda 'h-a' sale de penaltyHomeScore/penaltyAwayScore del raw y solo
    acompaña a un ganador de tanda (spec §9.3): nunca hay índice 8 sin 5."""

    def test_formats_home_dash_away(self):
        from fetch_maspalomas_cup import _shootout_score
        assert _shootout_score({"penaltyStatus": "saved",
                                "penaltyWinner": "away",
                                "penaltyHomeScore": 3,
                                "penaltyAwayScore": 4}) == "3-4"

    def test_none_when_no_shootout(self):
        from fetch_maspalomas_cup import _shootout_score
        assert _shootout_score({"penaltyStatus": "none",
                                "penaltyWinner": None,
                                "penaltyHomeScore": None,
                                "penaltyAwayScore": None}) is None
        assert _shootout_score({}) is None

    def test_none_when_a_score_is_missing(self):
        from fetch_maspalomas_cup import _shootout_score
        assert _shootout_score({"penaltyStatus": "saved",
                                "penaltyWinner": "home",
                                "penaltyHomeScore": 5,
                                "penaltyAwayScore": None}) is None

    def test_none_without_a_valid_winner(self):
        from fetch_maspalomas_cup import _shootout_score
        assert _shootout_score({"penaltyStatus": "saved",
                                "penaltyWinner": "???",
                                "penaltyHomeScore": 3,
                                "penaltyAwayScore": 4}) is None

    def test_normalize_carries_the_shootout(self):
        from fetch_maspalomas_cup import normalize
        m = normalize({"matchNumber": 2333, "date": "2026-06-27T17:00:00.000Z",
                       "homeTeamName": "AD Huracán A",
                       "awayTeamName": "UD Vecindario A",
                       "homeScore": 2, "awayScore": 2, "field": "CD 1.1",
                       "penaltyStatus": "saved", "penaltyWinner": "away",
                       "penaltyHomeScore": 3, "penaltyAwayScore": 4})
        assert (m["pen"], m["shootout"]) == ("away", "3-4")
        sin = normalize({"matchNumber": 1003, "date": "2026-06-23T14:00:00.000Z",
                         "homeTeamName": "X", "awayTeamName": "Y",
                         "homeScore": 1, "awayScore": 4, "field": "CD 1.2",
                         "penaltyStatus": "none", "penaltyWinner": None,
                         "penaltyHomeScore": None, "penaltyAwayScore": None})
        assert (sin["pen"], sin["shootout"]) == (None, None)

    def test_raw_has_shootout_scores_exactly_on_penalty_matches(self):
        raw = json.loads(RAW_PATH.read_text(encoding="utf-8"))
        decided = [m for m in raw
                   if (m.get("penaltyStatus") or "none") != "none"]
        for m in raw:
            has_scores = (isinstance(m.get("penaltyHomeScore"), int)
                          and isinstance(m.get("penaltyAwayScore"), int))
            assert has_scores == (m in decided), m["matchNumber"]
        for m in decided:
            h, a = m["penaltyHomeScore"], m["penaltyAwayScore"]
            assert m["homeScore"] == m["awayScore"], m["matchNumber"]
            assert m["penaltyWinner"] == ("home" if h > a else "away"), \
                m["matchNumber"]
        # 24 tandas en todo el raw; 10 son de Alevín, que no se publica.
        assert len(decided) == 24


class TestBracketRow:
    """Fila de cuadro en `jornadas`, con el mismo orden por posición que
    HISTORY (spec §5.3): [día, local, visitante, gl, gv, pen|null, hora,
    campo corto, tanda|null]. El índice 5 sigue siendo quién pasó."""

    def test_shootout_row_has_nine_columns(self):
        from fetch_maspalomas_cup import row_short
        m = _match(1, time="17:00", hs=2, as_=2, pen="away", shootout="3-4",
                   field="Campo CD 1.1 - Campo Joma 1")
        assert row_short(m) == ["26/06", "A", "B", 2, 2, "away",
                                "17:00", "CD 1.1", "3-4"]

    def test_row_without_shootout_has_nulls_in_5_and_8(self):
        from fetch_maspalomas_cup import row_short
        assert row_short(_match(1, hs=3, as_=1)) == [
            "26/06", "A", "B", 3, 1, None, "10:00", "CD 1.1", None]

    def test_unplayed_row_keeps_nine_columns(self):
        from fetch_maspalomas_cup import row_short
        assert row_short(_match(1, hs=None, as_=None, field="")) == [
            "26/06", "A", "B", None, None, None, "10:00", "", None]
```

Mismo fichero, al final de `TestPublishedContent`, detrás de `test_no_orphan_round_label` (≈264):

```python
    def test_bracket_rows_have_nine_columns_and_group_rows_do_not_change(self):
        for var in ("MASPALOMAS_CUP_BENJAMIN", "MASPALOMAS_CUP_PREBENJAMIN"):
            for g in self._groups(var):
                if g.get("jornadas"):
                    for rows in g["jornadas"].values():
                        for r in rows:
                            assert len(r) == 9, f"{g['id']}: {r}"
                            assert r[5] in ("home", "away", None), r
                            # Quién pasó (5) y la tanda (8) van juntos.
                            assert (r[5] is None) == (r[8] is None), r
                else:
                    # Fase de grupos: [día, hora, local, visitante, gl, gv,
                    # campo], como siempre (la hora va en el índice 1).
                    for r in g["matches"]:
                        assert len(r) == 7, f"{g['id']}: {r}"
                        assert re.fullmatch(r"\d{2}:\d{2}", r[1]), r

    def test_published_shootouts_are_consistent(self):
        seen = 0
        for var in ("MASPALOMAS_CUP_BENJAMIN", "MASPALOMAS_CUP_PREBENJAMIN"):
            for g in self._groups(var):
                for rows in (g.get("jornadas") or {}).values():
                    for r in rows:
                        if r[8] is None:
                            continue
                        seen += 1
                        h, a = (int(x) for x in r[8].split("-"))
                        assert r[3] == r[4], f"tanda sin empate: {r}"
                        assert r[5] == ("home" if h > a else "away"), r
        # 24 tandas en el raw menos las 10 de Alevín.
        assert seen == 14

    def test_bracket_time_and_field_match_the_inline_list(self):
        # Hora y campo corto del cuadro = los de `matches` del mismo cuadro.
        for var in ("MASPALOMAS_CUP_BENJAMIN", "MASPALOMAS_CUP_PREBENJAMIN"):
            for g in self._groups(var):
                if not g.get("jornadas"):
                    continue
                inline = {(r[0], r[2], r[3]): (r[1], r[6])
                          for r in g["matches"]}
                for rows in g["jornadas"].values():
                    for r in rows:
                        assert (r[6], r[7]) == inline[(r[0], r[1], r[2])], \
                            f"{g['id']}: {r}"

    def test_las_mesas_quarterfinal_row(self):
        plata = next(g for g in self._groups("MASPALOMAS_CUP_PREBENJAMIN")
                     if g["name"] == "Copa Plata")
        rows = [r for rs in plata["jornadas"].values() for r in rs
                if r[1] == "UD Las Mesas Huracán" and r[2] == "CF Unión Carrizal"]
        assert rows == [["27/06", "UD Las Mesas Huracán", "CF Unión Carrizal",
                         1, 1, "home", "10:00", "CD 4", "3-2"]]
```

`scripts/tests/test_review0615_frontend.mjs`, imports (≈14-15). Antes:

```js
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
```

Después:

```js
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
```

Mismo fichero, detrás del `});` que cierra `test('bracketChampion: null cuando la última ronda no decide', …)` (≈300). Estos dos tests son la red de compatibilidad de la interfaz actual: pasan con los datos de 5 o 6 columnas y tienen que seguir pasando con los de 9.

```js
/* Plan A §9.3: los cuadros de la Maspalomas pasan a filas de 9 columnas
 * [día, local, visitante, gl, gv, pen|null, hora, campo, tanda|null]. La
 * interfaz actual solo lee 0-5 en el cuadro (matchAdvancer, bracketChampion,
 * buildKnockoutBracket) y 6-7 como hora y campo (getHistoricalJornadaMatches,
 * enlace directo de init.js). Estas pruebas fijan que la fila nueva no la
 * rompe. */
test('matchAdvancer/bracketChampion: fila de 9 columnas con pen null y tanda', async () => {
  const { matchAdvancer, bracketChampion, isRoundRobinCup } = await import('../../src/state.js');
  const jornadas = {
    'S': [['27/06', 'A', 'B', 1, 1, null, '09:00', 'CD 1.1', null],
          ['27/06', 'C', 'D', 2, 0, null, '09:00', 'CD 1.2', null]],
    'F': [['27/06', 'B', 'C', 2, 2, 'away', '17:00', 'CD 1.1', '3-4']],
  };
  const rounds = ['S', 'F'];
  // pen null en un empate: se sigue deduciendo del cuadro (B juega la final).
  assert.equal(matchAdvancer(jornadas.S[0], jornadas, rounds, 0), 'away');
  assert.equal(matchAdvancer(jornadas.S[1], jornadas, rounds, 0), 'home');
  // En la final manda el índice 5; la tanda del índice 8 no interfiere.
  assert.equal(matchAdvancer(jornadas.F[0], jornadas, rounds, 1), 'away');
  assert.equal(bracketChampion(jornadas, rounds), 'C');
  assert.equal(isRoundRobinCup(jornadas), false);
});

test('Maspalomas publicada: cada partido de cuadro tiene quién pasó y cada cuadro su campeón', async () => {
  // El torneo terminó el 27/06/2026 y update.yml no regenera este fichero.
  const { matchAdvancer, bracketChampion, isRoundRobinCup, countMatches } = await import('../../src/state.js');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, 'data-maspalomas-cup-2026.js'), 'utf8')
    + ';this.P = MASPALOMAS_CUP_PREBENJAMIN; this.B = MASPALOMAS_CUP_BENJAMIN;', ctx);
  const champions = {};
  for (const g of [...ctx.P, ...ctx.B].filter(x => x.jornadas)) {
    const rounds = Object.keys(g.jornadas);
    assert.equal(isRoundRobinCup(g.jornadas), false, `${g.id} se pintaría como tabla`);
    rounds.forEach((r, i) => g.jornadas[r].forEach(m => {
      assert.ok(matchAdvancer(m, g.jornadas, rounds, i), `${g.id} ${r}: ${JSON.stringify(m)}`);
    }));
    champions[g.id] = bracketChampion(g.jornadas, rounds);
    // El chip «N partidos» cuenta la lista inline del cuadro, que no cambia.
    assert.equal(countMatches([g], {}), g.matches.length);
  }
  assert.deepEqual(champions, {
    MCPK1: 'CF Unión Viera', MCPK2: 'AD Huracán',
    MCBK1: 'Gáldar CF', MCBK2: 'UD Vecindario A',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_maspalomas_cup.py -q
node --test scripts/tests/test_review0615_frontend.mjs 2>&1 | grep -E "^# (tests|pass|fail)"
```

Resultado esperado de pytest: `13 failed, 23 passed`. Los errores son estos:
- `ImportError: cannot import name '_shootout_score' from 'fetch_maspalomas_cup'`, en 4 tests de `TestShootoutScore`;
- `KeyError: 'shootout'`, en `test_normalize_carries_the_shootout`;
- `AssertionError: assert ['26/06', 'A', 'B', 3, 1] == ['26/06', 'A'... 1, None, ...]` y otras parecidas, en `TestBracketRow`;
- `IndexError: list index out of range`, en `test_published_final_of_the_gold_cup_names_its_winner` y en los tests nuevos de `TestPublishedContent`.

Resultado esperado de node: `# pass 48` y `# fail 0`. Los dos tests nuevos son guardianes de compatibilidad y ya pasan con los datos actuales.

- [ ] **Step 3: Write minimal implementation**

`scripts/fetch_maspalomas_cup.py`, final del diccionario que devuelve `normalize` (≈121). Antes:

```python
        "field": match.get("field") or "",
        "pen": _penalty_winner(match),
    }
```

Después:

```python
        "field": match.get("field") or "",
        "pen": _penalty_winner(match),
        "shootout": _shootout_score(match),
    }
```

Mismo fichero, justo después de `_penalty_winner` (tras ≈130) y antes de `def by_kickoff`:

```python
def _shootout_score(match):
    """Resultado de la tanda como 'h-a' (p. ej. '3-4'), si no None.

    Solo acompaña a un ganador de tanda válido: una fila nunca lleva tanda
    (índice 8) sin quién pasó (índice 5).
    """
    if _penalty_winner(match) is None:
        return None
    h, a = match.get("penaltyHomeScore"), match.get("penaltyAwayScore")
    if not (isinstance(h, int) and isinstance(a, int)):
        return None
    return f"{h}-{a}"
```

Mismo fichero, `row_short` completa (≈148-161). Antes:

```python
def row_short(m):
    """Fila de una ronda dentro de `jornadas`.

    5 columnas, más una 6ª OPCIONAL con quién ganó la tanda de penaltis
    ('home'/'away') cuando el partido acabó en empate. El frontend deduce el que
    pasa mirando quién aparece en la ronda siguiente, pero eso no funciona en la
    final: sin este dato la Copa Oro benjamín 2026 (2-2, penaltis 3-4) se queda
    sin campeón visible. Las rondas sin penaltis mantienen las 5 columnas de
    siempre, igual que los datos históricos.
    """
    row = [m["day"], m["home"], m["away"], m["hs"], m["as"]]
    if m["pen"]:
        row.append(m["pen"])
    return row
```

Después:

```python
def row_short(m):
    """Fila de una ronda dentro de `jornadas` (9 columnas, spec §5.3/§9.3):

        [día, local, visitante, gl, gv, pen|None, hora, campo corto, tanda|None]

    El mismo orden por posición que HISTORY. `pen` (índice 5) es quién pasó en
    la tanda ('home'/'away'): el frontend deduce el que pasa mirando quién
    aparece en la ronda siguiente, pero eso no funciona en la final, y sin este
    dato la Copa Oro benjamín 2026 (2-2, penaltis 3-4) se queda sin campeón.
    `tanda` (índice 8) es su resultado, 'h-a'. Hora y campo corto son los
    mismos que los de la lista `matches` del cuadro.
    """
    return [m["day"], m["home"], m["away"], m["hs"], m["as"], m["pen"],
            m["time"], short_field(m["field"]), m["shootout"]]
```

`row_full`, `build_group_stage` y `build_cups` no se tocan, así que la fase de grupos no cambia.

- [ ] **Step 4: Run test to verify it passes (lógica) y detectar el desfase del publicado**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_maspalomas_cup.py -q
python3 scripts/fetch_maspalomas_cup.py --from-raw --check; echo "exit=$?"
```

Resultado esperado de pytest: `6 failed, 30 passed`. Ya pasan todos los tests de lógica (`TestShootoutScore` y `TestBracketRow`). Siguen fallando los que leen el `.js` publicado, que aún no se ha regenerado:
- `test_published_final_of_the_gold_cup_names_its_winner`;
- `TestGoldenRegeneration::test_regenerating_from_raw_matches_published_js`;
- los 4 tests nuevos de `TestPublishedContent`.

Resultado esperado de `--check`: `Raw: 464 partidos desde maspalomas_cup_2026_raw.json`, `DESFASADO: el .js publicado no coincide.` y `exit=1`.

- [ ] **Step 5: Regenerar `data-maspalomas-cup-2026.js` desde el raw y verificar**

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/fetch_maspalomas_cup.py --from-raw
python3 scripts/fetch_maspalomas_cup.py --from-raw --check; echo "exit=$?"
python3 -m pytest scripts/tests/test_maspalomas_cup.py -q
```

Salida esperada del primer comando:

```
Raw: 464 partidos desde maspalomas_cup_2026_raw.json
Guardado: data-maspalomas-cup-2026.js
  Prebenjamín: 6 grupos + 2 cuadros (Copa Plata, Copa Oro)
  Benjamín: 17 grupos + 2 cuadros (Copa Plata, Copa Oro)
```

Después, `Al día.` con `exit=0`, y pytest da `36 passed`. El fichero pasa de 35.717 a 38.451 bytes, y su línea 2 (`// Actualizado: …`) toma la fecha de hoy.

Hay que comprobar que solo cambiaron las filas de cuadro y que el resto del fichero es idéntico a HEAD:

```bash
cd /home/manolo/claude/futbol-base
python3 - <<'EOF'
import json, re, subprocess
def groups(src):
    return {v: json.loads(re.search(r"const " + v + r" = (\[.*?\]);", src, re.DOTALL).group(1))
            for v in ("MASPALOMAS_CUP_PREBENJAMIN", "MASPALOMAS_CUP_BENJAMIN")}
old = groups(subprocess.run(["git", "show", "HEAD:data-maspalomas-cup-2026.js"], capture_output=True, text=True, check=True).stdout)
new = groups(open("data-maspalomas-cup-2026.js", encoding="utf-8").read())
rows = 0
for v in old:
    for go, gn in zip(old[v], new[v], strict=True):
        assert {k: x for k, x in go.items() if k != "jornadas"} == {k: x for k, x in gn.items() if k != "jornadas"}, go["id"]
        for rk, ro in (go.get("jornadas") or {}).items():
            for a, b in zip(ro, gn["jornadas"][rk], strict=True):
                assert b[:5] == a[:5] and b[5] == (a[5] if len(a) > 5 else None), b
                rows += 1
print("solo cambian las filas de cuadro:", rows)
EOF
```

Salida esperada: `solo cambian las filas de cuadro: 88`.

- [ ] **Step 6: Subir `?v=` y `CACHE_NAME`**

`generate_js.py` no detecta este cambio (ver Contexto), y `sw.js` precachea este fichero (≈45).

```bash
cd /home/manolo/claude/futbol-base
python3 -c "import sys; sys.path.insert(0, 'scripts'); import generate_js; generate_js.bump_cache_version()"
grep -o '?v=[0-9a-z]*' index.html | sort | uniq -c
head -1 sw.js
```

Salida esperada:
- `  index.html cache version bumped to ?v=<AAAAMMDD de hoy><letra>` (las Tareas 1 y 2 ya subieron la versión hoy);
- `  sw.js CACHE_NAME bumped to futbolbase-v<misma versión>`;
- una sola línea `     11 ?v=<versión>`;
- `const CACHE_NAME = 'futbolbase-v<versión>';`.

- [ ] **Step 7: Suites completas**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q
node --test scripts/tests/test_*.mjs 2>&1 | grep -E "^# (tests|pass|fail)"
```

Resultado esperado:
- pytest: `398 passed, 5 skipped`: los 386 de la Tarea 2, más 13 tests nuevos y menos 1 sustituido;
- node: `# tests 239`, `# pass 239` y `# fail 0`: los 237 de la Tarea 2 más 2.

- [ ] **Step 8: Verificar la interfaz actual en navegador**

```bash
cd /home/manolo/claude/futbol-base
PW=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/pw/node_modules
node scripts/tests/render-smoke.mjs
NODE_PATH="$PW" node scripts/tests/interaction-smoke.mjs
NODE_PATH="$PW" node scripts/tests/pwa-smoke.mjs
```

Salida esperada:
- `PASS: render smoke OK — MI EQUIPO rendered (DOM … bytes)`;
- solo líneas `PASS:` en `interaction-smoke`;
- `PASS: previous PWA cache replaced by futbolbase-v<versión>; dashboard and team search work offline`.

- [ ] **Step 9: Commit**

Sin push: se publica en la Tarea 5.

```bash
cd /home/manolo/claude/futbol-base
git add scripts/fetch_maspalomas_cup.py scripts/tests/test_maspalomas_cup.py scripts/tests/test_review0615_frontend.mjs data-maspalomas-cup-2026.js index.html sw.js
git commit -m "$(cat <<'EOF'
feat(datos): cuadros de la Maspalomas con hora, campo y tanda (9 columnas)

row_short emite en los cuadros [día, local, visitante, gl, gv, pen|null,
hora, campo corto, tanda|null], el mismo orden por posición que HISTORY
(spec §5.3 y §9.3). La tanda 'h-a' sale de penaltyHomeScore/penaltyAwayScore
del raw y solo acompaña a pen. La fase de grupos y las listas matches no
cambian. data-maspalomas-cup-2026.js regenerado con --from-raw; ?v= y
CACHE_NAME bumpeados porque generate_js no ve este fichero.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
)"
```

Resultado esperado: `6 files changed`.

---

### Task 4: Lanzarote benjamín 2025-26: conservar LZ1-4, copiar el campo de LZS1-4 y borrar LZS1-4, con guardián nuevo (spec §9.4)

**Contexto**
- **Qué se copia y qué no.** El fixer solo copia el campo en los 244 partidos de LZ (de 342) que cumplen dos condiciones:
  - emparejan de forma única por (jornada, fecha ISO, gl, gv);
  - sus equipos cuadran con el mapa de nombres LZ → FIFLP (`split_by_teams`).

  Quedan sin campo 98:
  - 81 en los que FIFLP tiene otro marcador; por ejemplo, LZ «San Bartolomé 4-6 Sporting Tías» frente a FIFLP 4-4;
  - 17 de 9 claves ambiguas.

  El mapa de equipos que sale de los pares es hoy 100 % coherente (0 pares apartados) e inyectivo en LZ1-4, así que `split_by_teams` no cambia nada hoy: protege frente a un par futuro con clave única pero equipos distintos. Emparejando por (jornada, fecha, equipos mapeados) se recuperarían 80 de los 81. Queda fuera de la decisión tomada: los 81 quedan en el log para revisarlos, y sería una mejora posterior si el usuario la quiere.
- **Equipos huérfanos.** Los nombres que solo existían en LZS quedan en `teams` sin partidos: `PUERTO DEL CARMEN, F.C. "A"`, `UNION SUR YAIZA, C.D. "A"`, `UNION SUR YAIZA C.D. "B"` y `PUERTO DEL CARMEN, F.C "B"`.
  - No se publican: `data-shields.js` se mantiene a mano y `TEAMS_` sale de `appearances`.
  - `get_or_create_team` podría reutilizarlos en importaciones futuras, y sería inocuo.
- **El importador deja de crear LZS.** `import_fiflp_islas.py` asignaba la competición 54422886 a `LZS`.
  - Reimportar `21isl` entero ya abortaba por colisión (`assert_no_collisions`), pero `IMPORT_COMPS=54422886` recreaba LZS1-4, y el guardián pondría al bot en rojo.
  - Esta tarea quita esa asignación: el importador aborta con «competiciones sin código asignado en COMP_META» antes de abrir la base. Falla el importador, no el bot.
  - `fetch-fiflp-islas.yml` solo descarga el raw.
- **Guardián sobre la base real** (5 temporadas).
  - Salta solo con LZ1~LZS1 (0,756; 68 partidos comunes), LZ2~LZS2 (0,778; 70), LZ3~LZS3 (0,733; 66) y LZ4~LZS4 (0,792; 57).
  - El siguiente par está en 0,133: FF8~FF16 y FF15~FF22 de 2025-26, y CFV2~CFVD1 de 2022-23. Quitando LZS no salta nada.
  - Simulado en cada fecha de corte de las 5 temporadas y sin LZS, el peor par da 0,30 (GC3~GC4, 2023-24), lejos del umbral de 0,7. No hay falsos positivos a principio de temporada.
- **PLZ 2024-25.** PLZ1 tiene 12 partidos y PLZ2 6, con 1 jugado cada uno, así que el mínimo de 10 los excluye. La clave ingenua, con filas sin marcador, daba 5/6 = 0,83.
  - `test_source_overlap_guard_ignores_plz_2024_25` exige que existan PLZ1/PLZ2 de 2024-25. Es una temporada archivada, y solo la tocan importadores manuales.
  - Un mutante del guardián sin el filtro de marcador hace fallar `test_source_overlap_ignores_shared_dates_without_score`, así que ese test sintético es significativo.
- **Favoritos y enlaces a LZS1-4.** Caen en caminos que ya existen:
  - la tarjeta «Elige el grupo de tu equipo» de `miequipo.js` (≈210-214);
  - `validJorGroup` de `state.js` (≈147), que usa `render.js` (≈367);
  - `notify(…)` en `init.js` (≈93 y ≈112).

  No hay código de la interfaz que cambiar.
- **La fuente no deshace el campo copiado** (`scripts/fetch_futbolaspalmas.py`):
  - ≈586 salta los grupos sin URL (LZS tenía `url ''`);
  - ≈671 solo pisa `venue` si `home_score IS NULL`, y todos los de LZ están jugados;
  - ≈707-709 usa `venue=COALESCE(NULLIF(?,''),venue)`.
  - Hoy la fuente sirve «0 encuentros disponibles» en LZ1-4.
- **Interfaz actual.**
  - Lee `m[6]` y `m[7]` en `render.js` (≈525 y ≈532) y en `state.js:64`.
  - STATS por equipo lleva guarda en `modals.js` (≈563).
  - La vista de isla agrupa por `phase`, sin nombres cableados (`render.js` ≈770-830).
- **Datos tras el arreglo:**
  - STATS de CD Tahiche: de 36 entradas y 102 puntos a 18 y 54.
  - `STATS.benjamin.season.totalMatches`: de 2771 a 2429.
  - `BENJAMIN`: de 53 a 49 grupos. `HIST_MATCHES`: de 3559 a 3217.
  - Claves `local|visitante|marcador` repetidas en `HISTORY`: de 182 a 6.
  - `data-matchdetail*.js`, `data-goleadores.js` y `data-lineups-*` no cambian, porque LZS no tenía goles, goleadores ni actas.
- **WAL.** El repo puede tener `futbolbase.db-wal` y `-shm` (ignorados por git). El paso 6 hace `wal_checkpoint(TRUNCATE)` para que `git add futbolbase.db` lo lleve todo.
- **Ficheros compartidos.** `scripts/tests/test_db_sanity.py` lo tocan dos tareas, en regiones distintas que no chocan en el orden 1→4 (comprobado):
  - la Tarea 2 añadió `_lineup_count`, su test y la línea `publicadas = …` de la (i) (≈176-215);
  - esta tarea toca los imports (≈14-20) y añade el bloque (k) detrás de `test_no_duplicate_groups` (≈122).

  Si se aplicara en otro orden, se ancla por texto.

**Files:**
- Create: `scripts/_archive/fix_lanzarote_lz_lzs_2526.py`
- Create: `scripts/tests/test_fix_lanzarote_lz_lzs.py`
- Modify: `scripts/tests/test_db_sanity.py`: imports (≈14-20) y bloque nuevo tras la última línea de `test_no_duplicate_groups` (≈122).
- Modify: `scripts/import_fiflp_islas.py`: la entrada `"54422886"` de `COMP_META` (≈57-59).
- Modify (los regenera el fixer, no se editan a mano): `futbolbase.db`, `data-benjamin.js`, `data-history.js`, `data-stats.js`, `index.html` (`?v=` y pie) y `sw.js` (`CACHE_NAME`).
- Test: `scripts/tests/test_fix_lanzarote_lz_lzs.py` y `scripts/tests/test_db_sanity.py`.

**Interfaces:**
- Consumes:
  - `db.get_connection()` (`scripts/db.py:100`, activa WAL y FK), `db.delete_group(conn, group_id)` (`scripts/db.py:141`, borra hijas, `standings` y `scorers` sin hacer commit) y `db.init_db` (`scripts/db.py:109`, solo en tests).
  - `generate_js.main()` (`scripts/generate_js.py`, `def main`).
  - Estado de la base a 23/09/2026:
    - temporada `2025-2026`, categoría `BENJAMIN`;
    - LZ1-4 (ids 11-14): URL de futbolaspalmas, 90/90/90/72 partidos, 0 campos, 82/87/92/72 goleadores y 117/152/115/76 goles;
    - LZS1-4 (ids 271-274): `url=''`, campo en el 100 % de los partidos, 0 goleadores y 0 goles;
    - ningún `cod_acta` en ninguno de los dos.
- Produces:
  - Fixer con funciones puras importables. Una fila es `(id, jornada, date, time, home, away, hs, as, venue)`.
    - `jornada_num(label) -> str`
    - `iso_date(raw, start_year, end_year) -> str|None`
    - `match_key(row, sy, ey)`
    - `pair_matches(lz_rows, lzs_rows, sy, ey) -> {'pairs','ambiguous','lz_only','lzs_only'}`
    - `overlap_ratio(...)`, `team_map(pairs)`, `split_by_teams(pairs, names) -> (coherentes, apartados)` y `standings_diff(...)`
    - `build_plan(conn) -> [dict]`: cada dict lleva además `mismatched` (pares apartados); SystemExit si una pareja se solapa menos de 0,7.
    - `apply_plan(conn, plan) -> int` (sin commit) y `report(plan) -> [str]`
  - En `test_db_sanity`: `grupos_repetidos(con) -> [(temporada, código_a, código_b, comunes, proporción)]`, `MIN_JUGADOS_SOLAPE = 10` y `MAX_SOLAPE_FUENTES = 0.7`.
  - `import_fiflp_islas.COMP_META` sin `"54422886"`.
  - Datos:
    - `BENJAMIN` pasa de 53 a 49 grupos, sin LZS;
    - `HISTORY` queda sin LZS; `HIST_MATCHES` pasa de 3559 a 3217;
    - 244 filas de LZ llevan `m[7]` (campo);
    - `STATS.benjamin.teams['CD Tahiche'].pointsHistory` pasa de 36 entradas a 18, con 54 puntos finales.

- [ ] **Step 1: Write the failing test**

Crear `scripts/tests/test_fix_lanzarote_lz_lzs.py`:

```python
"""Fixer de Lanzarote benjamín 2025-26 (spec 2026-09-23 §9.4).

LZ1-4 (futbolaspalmas) y LZS1-4 (FIFLP) son la misma competición. El fixer
conserva LZ, le copia el campo (y la hora si falta) de LZS en los partidos que
emparejan sin ambigüedad por (jornada, fecha ISO, gl, gv) y borra LZS. Aquí se
prueba su lógica sobre una base en memoria: nunca toca futbolbase.db.
"""
import importlib.util
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
FIXER = ROOT / "scripts" / "_archive" / "fix_lanzarote_lz_lzs_2526.py"


def _fixer():
    spec = importlib.util.spec_from_file_location("fix_lanzarote_lz_lzs_2526", FIXER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# (jornada, fecha, hora, local, visitante, gl, gv, campo)
LZ1 = [
    ("Jornada 1", "2026-01-24", "09:00", "Pto.del Carmen", "CD Tinajo", 4, 2, None),      # ambigua
    ("Jornada 1", "2026-01-24", "11:00", "San Bartolomé", "Sporting Tías", 4, 2, None),   # ambigua
    ("Jornada 2", "2026-01-31", "10:00", "CD Tinajo", "San Bartolomé", 1, 3, None),
    ("Jornada 2", "2026-01-31", None, "Sporting Tías", "Pto.del Carmen", 5, 0, None),     # sin hora
    ("Jornada 3", "2026-02-07", "09:00", "Pto.del Carmen", "San Bartolomé", 3, 3, "CAMPO LZ"),
    ("Jornada 3", "2026-02-07", "11:00", "Sporting Tías", "CD Tinajo", 12, 0, None),      # otro marcador
    ("Jornada 4", "2026-02-14", "09:00", "CD Tinajo", "Pto.del Carmen", 2, 2, None),
    ("Jornada 4", "2026-02-14", "11:00", "San Bartolomé", "Sporting Tías", 0, 1, None),
]
PC = 'PUERTO DEL CARMEN, F.C. "A"'
LZS1 = [
    ("1", "24-01-2026", "09:00", PC, "CD Tinajo", 4, 2, "MUNICIPAL ARROCHA"),
    ("1", "24-01-2026", "11:00", "San Bartolomé", "Sporting Tías", 4, 2, "COLON"),
    ("2", "31-01-2026", "10:00", "CD Tinajo", "San Bartolomé", 1, 3, "MUNICIPAL TINAJO"),
    ("2", "31-01-2026", "10:30", "Sporting Tías", PC, 5, 0, "MUNICIPAL TIAS"),
    ("3", "07-02-2026", "09:00", PC, "San Bartolomé", 3, 3, "MUNICIPAL ARROCHA"),
    ("3", "07-02-2026", "11:00", "Sporting Tías", "CD Tinajo", 1, 0, "MUNICIPAL TIAS"),
    ("4", "14-02-2026", "09:00", "CD Tinajo", PC, 2, 2, "MUNICIPAL TINAJO"),
    ("4", "14-02-2026", "11:00", "San Bartolomé", "Sporting Tías", 0, 1, "COLON"),
]
# (equipo, pos, pts, pj, g, e, p, gf, gc)
TABLA_LZ1 = [("San Bartolomé", 1, 7, 4, 2, 1, 1, 8, 7), ("Sporting Tías", 2, 6, 4, 2, 0, 2, 18, 7),
             ("Pto.del Carmen", 3, 5, 4, 1, 2, 1, 9, 10), ("CD Tinajo", 4, 1, 4, 0, 1, 3, 5, 16)]
TABLA_LZS1 = [("San Bartolomé", 1, 7, 4, 2, 1, 1, 8, 7), ("Sporting Tías", 2, 9, 4, 3, 0, 1, 7, 7),
              (PC, 3, 5, 4, 1, 2, 1, 9, 10), ("CD Tinajo", 4, 1, 4, 0, 1, 3, 5, 5)]


def _conn(lzs_rows=LZS1):
    import db
    conn = sqlite3.connect(":memory:")
    db.init_db(conn)
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("INSERT INTO seasons (id,name,start_year,end_year,is_current) "
                 "VALUES (1,'2025-2026',2025,2026,1)")
    conn.execute("INSERT INTO categories (id,name) VALUES (1,'BENJAMIN')")
    conn.execute("INSERT INTO groups (id,season_id,category_id,code,phase,island,url) VALUES "
                 "(1,1,1,'LZ1','Lanzarote','lanzarote','https://futbolaspalmas.com/lz1/'),"
                 "(2,1,1,'LZS1','Lanzarote Fase 2','lanzarote','')")

    def team(name):
        row = conn.execute("SELECT id FROM teams WHERE name=?", (name,)).fetchone()
        return row[0] if row else conn.execute(
            "INSERT INTO teams (name) VALUES (?)", (name,)).lastrowid

    for gid, rows in ((1, LZ1), (2, lzs_rows)):
        for j, d, t, h, a, gl, gv, v in rows:
            conn.execute("INSERT INTO matches (group_id,jornada,date,time,home_team_id,away_team_id,"
                         "home_score,away_score,venue) VALUES (?,?,?,?,?,?,?,?,?)",
                         (gid, j, d, t, team(h), team(a), gl, gv, v))
    for gid, tabla in ((1, TABLA_LZ1), (2, TABLA_LZS1)):
        for name, pos, pts, pj, g, e, p, gf, gc in tabla:
            conn.execute("INSERT INTO standings (group_id,team_id,position,points,played,won,"
                         "drawn,lost,gf,gc,gd) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                         (gid, team(name), pos, pts, pj, g, e, p, gf, gc, gf - gc))
    mid = conn.execute("SELECT id FROM matches WHERE group_id=1 AND jornada='Jornada 2' "
                       "AND time='10:00'").fetchone()[0]
    conn.execute("INSERT INTO goals (match_id,minute,player_name,running_score,side,type) "
                 "VALUES (?,5,'A. Pérez','0-1','a','r')", (mid,))
    conn.execute("INSERT INTO scorers (group_id,player_name,team_id,goals,games) "
                 "VALUES (1,'Pérez, Ana',?,1,1)", (team("San Bartolomé"),))
    conn.commit()
    return conn


def _lz1(conn):
    return {(j, h, a): (t, v) for j, t, h, a, v in conn.execute(
        """SELECT m.jornada, m.time, th.name, ta.name, m.venue FROM matches m
             JOIN teams th ON th.id=m.home_team_id JOIN teams ta ON ta.id=m.away_team_id
            WHERE m.group_id=1""")}


def test_normalizes_jornada_and_date_across_sources():
    fx = _fixer()
    assert fx.jornada_num("Jornada 7") == fx.jornada_num("7") == fx.jornada_num("07") == "7"
    assert fx.jornada_num("06-06-2026 ( Final )") == "06-06-2026 ( Final )"
    assert fx.iso_date("24-01-2026", 2025, 2026) == "2026-01-24"
    assert fx.iso_date("2026-01-24", 2025, 2026) == "2026-01-24"
    assert fx.iso_date("06/11", 2021, 2022) == "2021-11-06"
    assert fx.iso_date("23/02", 2024, 2025) == "2025-02-23"
    assert fx.iso_date("", 2025, 2026) is None and fx.iso_date(None, 2025, 2026) is None


def test_pairs_only_unambiguous_matches_by_jornada_date_and_score():
    fx = _fixer()
    lz = [(i,) + r for i, r in enumerate(LZ1, 1)]
    lzs = [(100 + i,) + r for i, r in enumerate(LZS1, 1)]
    res = fx.pair_matches(lz, lzs, 2025, 2026)
    assert sorted((a[0], b[0]) for a, b in res["pairs"]) == [(3, 103), (4, 104), (5, 105), (7, 107), (8, 108)]
    assert res["ambiguous"] == [("1", "2026-01-24", 4, 2)]
    assert [r[0] for r in res["lz_only"]] == [6] and [r[0] for r in res["lzs_only"]] == [106]
    nombres = fx.team_map(res["pairs"])
    assert nombres["Pto.del Carmen"] == PC
    # Un par cuya clave es única pero cuyos equipos no cuadran con el mapa no
    # es el mismo partido: se aparta (y va al log) en vez de copiar su campo.
    assert fx.split_by_teams(res["pairs"], nombres) == (res["pairs"], [])
    cruzado = (lz[2], lzs[3])        # Tinajo-San Bartolomé con Sporting Tías-Pto. del Carmen
    assert fx.split_by_teams([cruzado], nombres) == ([], [cruzado])


def test_plan_logs_standings_rows_that_differ():
    fx = _fixer()
    plan = fx.build_plan(_conn())
    assert [(p["lz"], p["lzs"]) for p in plan] == [("LZ1", "LZS1")]
    assert plan[0]["ratio"] == pytest.approx(7 / 8)
    assert len(plan[0]["standings"]) == 2
    assert plan[0]["standings"][0].startswith("Sporting Tías")
    assert plan[0]["standings"][1].startswith("CD Tinajo")
    texto = "\n".join(fx.report(plan))
    assert "ambigua ('1', '2026-01-24', 4, 2)" in texto
    assert "solo LZ1:  J3 2026-02-07 Sporting Tías 12-0 CD Tinajo" in texto


def test_apply_copies_venue_and_missing_time_then_deletes_lzs():
    fx = _fixer()
    conn = _conn()
    copiados = fx.apply_plan(conn, fx.build_plan(conn))
    conn.commit()
    assert copiados == 4
    lz1 = _lz1(conn)
    assert lz1[("Jornada 2", "CD Tinajo", "San Bartolomé")] == ("10:00", "MUNICIPAL TINAJO")
    assert lz1[("Jornada 2", "Sporting Tías", "Pto.del Carmen")] == ("10:30", "MUNICIPAL TIAS")
    assert lz1[("Jornada 3", "Pto.del Carmen", "San Bartolomé")] == ("09:00", "CAMPO LZ")
    assert lz1[("Jornada 1", "Pto.del Carmen", "CD Tinajo")] == ("09:00", None)
    assert lz1[("Jornada 3", "Sporting Tías", "CD Tinajo")] == ("11:00", None)
    assert conn.execute("SELECT code FROM groups").fetchall() == [("LZ1",)]
    for tabla in ("matches", "standings"):
        assert conn.execute(f"SELECT COUNT(*) FROM {tabla} WHERE group_id=2").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM goals").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM scorers WHERE group_id=1").fetchone()[0] == 1
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    assert fx.build_plan(conn) == []          # idempotente: una segunda pasada no hace nada


def test_refuses_to_delete_a_group_that_does_not_overlap():
    fx = _fixer()
    distinto = [(j, d, t, h, a, gl + 20, gv, v) for j, d, t, h, a, gl, gv, v in LZS1]
    conn = _conn(lzs_rows=distinto)
    with pytest.raises(SystemExit, match="LZ1/LZS1: solape 0.00"):
        fx.build_plan(conn)
    assert conn.execute("SELECT COUNT(*) FROM groups").fetchone()[0] == 2
```

Añadir el guardián a `scripts/tests/test_db_sanity.py`. Primero, las importaciones (≈14-20).

Antes:
```python
import os
import sqlite3

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(ROOT, "futbolbase.db")
```
Después:
```python
import os
import re
import sqlite3
import sys
from collections import Counter

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(ROOT, "futbolbase.db")
sys.path.insert(0, os.path.join(ROOT, "scripts"))
```

Después, insertar este bloque justo detrás de `    assert not duplicados, "Grupos duplicados: " + "; ".join(duplicados)` (≈122), que cierra `test_no_duplicate_groups`, y antes de `def test_lineup_keys_point_at_teams_that_played`:

```python


# ─── (k) El mismo grupo sacado de dos fuentes ────────────────────────────────
# test_no_duplicate_groups compara (jornada, local, visitante) con ids de
# equipo, y eso solo caza la copia que llega dos veces de UNA fuente. FIFLP y
# futbolaspalmas escriben los nombres cada una a su manera ('Pto.del Carmen' /
# 'PUERTO DEL CARMEN, F.C. "A"') y la jornada también ('7' / 'Jornada 7'), así
# que entre fuentes se compara lo que las dos comparten: número de jornada,
# fecha ISO y marcador.
MIN_JUGADOS_SOLAPE = 10
MAX_SOLAPE_FUENTES = 0.7


def _jornada_num(label):
    """'Jornada 7' y '7' son la misma jornada; una ronda de copa se queda tal cual."""
    s = (label or "").strip()
    m = re.fullmatch(r"(?:Jornada\s+)?(\d+)", s, re.IGNORECASE)
    return str(int(m.group(1))) if m else s


def _iso_date(raw, start_year, end_year):
    """YYYY-MM-DD, DD-MM-YYYY o DD/MM (año según la temporada) -> ISO; si no, None."""
    s = (raw or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return s
    m = re.fullmatch(r"(\d{2})-(\d{2})-(\d{4})", s)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    m = re.fullmatch(r"(\d{2})/(\d{2})", s)
    if m:
        year = start_year if int(m.group(2)) >= 7 else end_year
        return f"{year}-{m.group(2)}-{m.group(1)}"
    return None


def _claves_jugadas(con, group_id, start_year, end_year):
    """Multiconjunto (jornada, fecha ISO, gl, gv) de los partidos con fecha y marcador."""
    claves = Counter()
    for jornada, fecha, gl, gv in con.execute(
            """SELECT jornada, date, home_score, away_score FROM matches
               WHERE group_id=? AND home_score IS NOT NULL AND away_score IS NOT NULL""",
            (group_id,)):
        iso = _iso_date(fecha, start_year, end_year)
        if iso:
            claves[(_jornada_num(jornada), iso, gl, gv)] += 1
    return claves


def grupos_repetidos(con):
    """Parejas de grupos de la misma temporada, categoría e isla que comparten al
    menos un 70 % de sus partidos jugados. Solo entran grupos con al menos 10
    partidos con fecha y marcador, y el denominador es el grupo menor.
    Devuelve [(temporada, código_a, código_b, comunes, proporción)]."""
    por_contexto = {}
    for gid, code, season, sy, ey, cat, island in con.execute(
            """SELECT g.id, g.code, s.name, s.start_year, s.end_year, UPPER(c.name),
                      COALESCE(g.island, '')
               FROM groups g JOIN seasons s ON s.id=g.season_id
               JOIN categories c ON c.id=g.category_id
               ORDER BY s.name, g.code"""):
        claves = _claves_jugadas(con, gid, sy, ey)
        if sum(claves.values()) >= MIN_JUGADOS_SOLAPE:
            por_contexto.setdefault((season, cat, island), []).append((code, claves))
    repetidos = []
    for (season, _cat, _island), grupos in sorted(por_contexto.items()):
        for i, (code_a, a) in enumerate(grupos):
            for code_b, b in grupos[i + 1:]:
                comunes = sum((a & b).values())
                ratio = comunes / min(sum(a.values()), sum(b.values()))
                if ratio >= MAX_SOLAPE_FUENTES:
                    repetidos.append((season, code_a, code_b, comunes, round(ratio, 2)))
    return repetidos


def test_no_group_repeats_another_source(conn):
    """(k) Ningún grupo es otro de su misma temporada, categoría e isla sacado de
    otra fuente.

    Pasó en 2025-26 con Lanzarote benjamín: LZ1-4 (futbolaspalmas) y LZS1-4
    (FIFLP) eran la misma liga, la web la publicaba dos veces y STATS sumaba
    los partidos de las dos (CD Tahiche: 36 entradas de pointsHistory para 18
    partidos). Coincidían entre el 73 y el 79 % de los partidos jugados; el
    siguiente par de toda la base se queda en el 13 %.
    """
    repetidos = grupos_repetidos(conn)
    assert not repetidos, "Grupos repetidos entre fuentes: " + "; ".join(
        f"{s}: {a} ~ {b} ({n} partidos comunes, {r:.0%})" for s, a, b, n, r in repetidos)


def test_source_overlap_guard_ignores_plz_2024_25(conn):
    """(k) Negativo real: PLZ1 y PLZ2 de 2024-25 son grupos distintos que
    comparten jornadas y fechas SIN marcador. Contando esas filas, 5 de las 6
    de PLZ2 coinciden con PLZ1 (83 %); el guardián no debe saltar."""
    codigos = {r[0] for r in conn.execute(
        """SELECT g.code FROM groups g JOIN seasons s ON s.id=g.season_id
           WHERE s.name='2024-2025' AND g.code IN ('PLZ1', 'PLZ2')""")}
    assert codigos == {"PLZ1", "PLZ2"}, "faltan PLZ1/PLZ2 de 2024-25 en la base"
    assert not [r for r in grupos_repetidos(conn) if {r[1], r[2]} == {"PLZ1", "PLZ2"}]


def _base_dos_grupos(filas_a, filas_b, isla_b="lanzarote"):
    """Base en memoria con LZ1 y LZS1. Cada fila es (jornada, fecha, gl, gv) y
    cada partido lleva equipos propios, como pasa entre fuentes distintas."""
    import db
    con = sqlite3.connect(":memory:")
    db.init_db(con)
    con.execute("INSERT INTO seasons (id,name,start_year,end_year,is_current) "
                "VALUES (1,'2025-2026',2025,2026,1)")
    con.execute("INSERT INTO categories (id,name) VALUES (1,'BENJAMIN')")
    con.execute("INSERT INTO groups (id,season_id,category_id,code,island) VALUES "
                "(1,1,1,'LZ1','lanzarote'),(2,1,1,'LZS1',?)", (isla_b,))
    for gid, filas in ((1, filas_a), (2, filas_b)):
        for i, (jornada, fecha, gl, gv) in enumerate(filas):
            h = con.execute("INSERT INTO teams (name) VALUES (?)", (f"L{gid}-{i}",)).lastrowid
            a = con.execute("INSERT INTO teams (name) VALUES (?)", (f"V{gid}-{i}",)).lastrowid
            con.execute("INSERT INTO matches (group_id,jornada,date,home_team_id,away_team_id,"
                        "home_score,away_score) VALUES (?,?,?,?,?,?,?)",
                        (gid, jornada, fecha, h, a, gl, gv))
    return con


_FUTBOLASPALMAS = [(f"Jornada {j}", f"2026-02-{j:02d}", j, j % 3) for j in range(1, 13)]
_FIFLP = [(str(j), f"{j:02d}-02-2026", j, j % 3) for j in range(1, 13)]


def test_source_overlap_flags_same_league_from_two_sources():
    con = _base_dos_grupos(_FUTBOLASPALMAS, _FIFLP)
    assert grupos_repetidos(con) == [("2025-2026", "LZ1", "LZS1", 12, 1.0)]


def test_source_overlap_ignores_shared_dates_without_score():
    """Como PLZ1/PLZ2 2024-25: dos grupos distintos (marcadores distintos) que
    comparten 30 jornadas y fechas sin resultado. Contando esas filas saldría
    30/40 = 75 % y el guardián saltaría."""
    jugados_b = [(j, d, gl + 20, gv) for j, d, gl, gv in _FIFLP[:10]]
    pendientes_a = [(f"Jornada {j}", "2026-05-02", None, None) for j in range(13, 43)]
    pendientes_b = [(str(j), "02-05-2026", None, None) for j in range(13, 43)]
    con = _base_dos_grupos(_FUTBOLASPALMAS[:10] + pendientes_a, jugados_b + pendientes_b)
    assert grupos_repetidos(con) == []


def test_source_overlap_needs_ten_played_matches_in_both_groups():
    assert grupos_repetidos(_base_dos_grupos(_FUTBOLASPALMAS, _FIFLP[:9])) == []


def test_source_overlap_only_compares_the_same_island():
    assert grupos_repetidos(_base_dos_grupos(_FUTBOLASPALMAS, _FIFLP, "fuerteventura")) == []
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_db_sanity.py scripts/tests/test_fix_lanzarote_lz_lzs.py -q
grep -c '"54422886"' scripts/import_fiflp_islas.py
```
Resultado esperado: `6 failed, 16 passed`, y `1` en el `grep`: el importador todavía asigna la competición a LZS.
- Los 5 tests de `test_fix_lanzarote_lz_lzs.py` fallan con `FileNotFoundError: [Errno 2] No such file or directory: '/home/manolo/claude/futbol-base/scripts/_archive/fix_lanzarote_lz_lzs_2526.py'`.
- `test_no_group_repeats_another_source` falla, y su mensaje prueba que hoy el guardián solo salta con LZ y LZS en las 5 temporadas:
  ```
  AssertionError: Grupos repetidos entre fuentes: 2025-2026: LZ1 ~ LZS1 (68 partidos comunes, 76%); 2025-2026: LZ2 ~ LZS2 (70 partidos comunes, 78%); 2025-2026: LZ3 ~ LZS3 (66 partidos comunes, 73%); 2025-2026: LZ4 ~ LZS4 (57 partidos comunes, 79%)
  ```
- Pasan el negativo real de PLZ1/PLZ2, los 4 sintéticos y los 11 tests que ya había en `test_db_sanity.py`.

- [ ] **Step 3: Write minimal implementation**

Crear `scripts/_archive/fix_lanzarote_lz_lzs_2526.py`:

```python
#!/usr/bin/env python3
"""Fixer one-shot: Lanzarote benjamín 2025-26 sale dos veces (LZ1-4 y LZS1-4).

Es la misma competición sacada de dos fuentes, pero NO son copias exactas:

    LZ1-4   futbolaspalmas: URL viva (la refresca update.yml), goleadores y
            cronología de goles; campo en ningún partido.
    LZS1-4  FIFLP: sin URL, sin goleadores; campo en el 100 % de los partidos.

Solo coinciden unos 261 de 342 partidos por (jornada, fecha, marcador) y las
clasificaciones difieren en algún puesto. Publicar las dos duplicaba el
calendario en la web y las estadísticas de STATS (CD Tahiche: 36 entradas en
pointsHistory para 18 partidos y 102 puntos en vez de 54).

Decisión (spec 2026-09-23, §9.4): se conserva LZ1-4. Este script
  1. copia `venue` (y `time` si falta) de LZSn a LZn en los partidos que
     emparejan SIN AMBIGÜEDAD por (número de jornada, fecha ISO, gl, gv) y
     cuyos equipos cuadran con el mapa de nombres LZ -> FIFLP;
  2. deja en el log los partidos y las filas de clasificación que difieren, y
     los pares apartados porque sus equipos no cuadran;
  3. borra LZS1-4 con db.delete_group;
  4. regenera la web con generate_js.py.

    python3 scripts/_archive/fix_lanzarote_lz_lzs_2526.py            # informe
    python3 scripts/_archive/fix_lanzarote_lz_lzs_2526.py --write

El log se escribe también en scripts/_archive/fix_lanzarote_lz_lzs_2526.log
(ignorado por git). El guardián permanente es
test_db_sanity.py::test_no_group_repeats_another_source.
"""
import argparse
import os
import re
import sys
from collections import Counter

_AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_AQUI))
from db import get_connection, delete_group          # noqa: E402

SEASON = "2025-2026"
CATEGORY = "BENJAMIN"
PAIRS = [("LZ1", "LZS1"), ("LZ2", "LZS2"), ("LZ3", "LZS3"), ("LZ4", "LZS4")]
MIN_SOLAPE = 0.7          # el mismo umbral que el guardián de test_db_sanity
LOG_PATH = os.path.join(_AQUI, "fix_lanzarote_lz_lzs_2526.log")


def jornada_num(label):
    """'Jornada 7' (futbolaspalmas) y '7' (FIFLP) son la misma jornada."""
    s = (label or "").strip()
    m = re.fullmatch(r"(?:Jornada\s+)?(\d+)", s, re.IGNORECASE)
    return str(int(m.group(1))) if m else s


def iso_date(raw, start_year, end_year):
    """YYYY-MM-DD, DD-MM-YYYY o DD/MM (año según la temporada) -> ISO; si no, None."""
    s = (raw or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return s
    m = re.fullmatch(r"(\d{2})-(\d{2})-(\d{4})", s)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    m = re.fullmatch(r"(\d{2})/(\d{2})", s)
    if m:
        year = start_year if int(m.group(2)) >= 7 else end_year
        return f"{year}-{m.group(2)}-{m.group(1)}"
    return None


def match_key(row, start_year, end_year):
    """Clave entre fuentes de una fila de load_rows(); None si no se jugó o no
    tiene fecha. Los ids de equipo no sirven: cada fuente escribe los nombres
    a su manera ('Pto.del Carmen' / 'PUERTO DEL CARMEN, F.C. "A"')."""
    _id, jornada, date, _time, _home, _away, hs, as_, _venue = row
    iso = iso_date(date, start_year, end_year)
    if hs is None or as_ is None or iso is None:
        return None
    return (jornada_num(jornada), iso, hs, as_)


def pair_matches(lz_rows, lzs_rows, start_year, end_year):
    """Empareja partidos de las dos fuentes. Solo se empareja una clave que
    aparece EXACTAMENTE una vez en cada lado; el resto va al informe.

    Devuelve {'pairs': [(lz_row, lzs_row)], 'ambiguous': [clave],
              'lz_only': [row], 'lzs_only': [row]}."""
    def index(rows):
        by_key = {}
        for row in rows:
            by_key.setdefault(match_key(row, start_year, end_year), []).append(row)
        return by_key

    lz, lzs = index(lz_rows), index(lzs_rows)
    pairs, ambiguous, lz_only, lzs_only = [], [], [], []
    for key in sorted(set(lz) | set(lzs), key=repr):
        a, b = lz.get(key, []), lzs.get(key, [])
        if key is not None and len(a) == 1 and len(b) == 1:
            pairs.append((a[0], b[0]))
        elif key is not None and a and b:
            ambiguous.append(key)
        else:
            lz_only.extend(a)
            lzs_only.extend(b)
    return {"pairs": pairs, "ambiguous": ambiguous, "lz_only": lz_only, "lzs_only": lzs_only}


def overlap_ratio(lz_rows, lzs_rows, start_year, end_year):
    """Solape del guardián: claves comunes / partidos jugados del grupo menor."""
    a = Counter(k for k in (match_key(r, start_year, end_year) for r in lz_rows) if k)
    b = Counter(k for k in (match_key(r, start_year, end_year) for r in lzs_rows) if k)
    menor = min(sum(a.values()), sum(b.values()))
    return sum((a & b).values()) / menor if menor else 0.0


def team_map(pairs):
    """Nombre LZ -> nombre LZS, por mayoría de los partidos emparejados."""
    votos = {}
    for lz_row, lzs_row in pairs:
        for i in (4, 5):
            votos.setdefault(lz_row[i], Counter())[lzs_row[i]] += 1
    return {lz: c.most_common(1)[0][0] for lz, c in votos.items()}


def split_by_teams(pairs, names):
    """Separa los pares cuyos equipos cuadran con `names` (team_map) de los que
    no. Una clave única con otros equipos no es el mismo partido: no se le
    copia el campo y va al log. Devuelve (coherentes, apartados)."""
    ok, bad = [], []
    for lz_row, lzs_row in pairs:
        same = (names.get(lz_row[4]) == lzs_row[4]
                and names.get(lz_row[5]) == lzs_row[5])
        (ok if same else bad).append((lz_row, lzs_row))
    return ok, bad


def load_rows(conn, group_id):
    return conn.execute(
        """SELECT m.id, m.jornada, m.date, m.time, h.name, a.name,
                  m.home_score, m.away_score, m.venue
             FROM matches m JOIN teams h ON h.id=m.home_team_id
             JOIN teams a ON a.id=m.away_team_id
            WHERE m.group_id=? ORDER BY m.id""", (group_id,)).fetchall()


def load_standings(conn, group_id):
    return {r[0]: r[1:] for r in conn.execute(
        """SELECT t.name, s.position, s.points, s.played, s.won, s.drawn, s.lost,
                  s.gf, s.gc FROM standings s JOIN teams t ON t.id=s.team_id
            WHERE s.group_id=? ORDER BY s.position""", (group_id,))}


def standings_diff(lz_table, lzs_table, names):
    """Filas de LZ cuya pareja en LZS (vía `names`) no dice lo mismo."""
    out = []
    for team, row in lz_table.items():
        other = names.get(team)
        if other not in lzs_table:
            out.append(f"{team}: sin fila equivalente en FIFLP")
        elif lzs_table[other] != row:
            out.append(f"{team} {row} | FIFLP {other} {lzs_table[other]}")
    return out


def _group(conn, code):
    return conn.execute(
        """SELECT g.id, s.start_year, s.end_year FROM groups g
             JOIN seasons s ON s.id=g.season_id JOIN categories c ON c.id=g.category_id
            WHERE s.name=? AND UPPER(c.name)=? AND g.code=?""",
        (SEASON, CATEGORY, code)).fetchone()


def build_plan(conn):
    """Un plan por pareja LZn/LZSn presente. Aborta (SystemExit) si una pareja
    no se solapa lo bastante para ser el mismo grupo: nunca se borra a ciegas."""
    plan = []
    for lz_code, lzs_code in PAIRS:
        lz, lzs = _group(conn, lz_code), _group(conn, lzs_code)
        if not lz or not lzs:
            continue
        sy, ey = lz[1], lz[2]
        lz_rows, lzs_rows = load_rows(conn, lz[0]), load_rows(conn, lzs[0])
        ratio = overlap_ratio(lz_rows, lzs_rows, sy, ey)
        if ratio < MIN_SOLAPE:
            raise SystemExit(f"{lz_code}/{lzs_code}: solape {ratio:.2f} < {MIN_SOLAPE}; "
                             "no parecen el mismo grupo. No se toca nada.")
        res = pair_matches(lz_rows, lzs_rows, sy, ey)
        names = team_map(res["pairs"])
        res["pairs"], res["mismatched"] = split_by_teams(res["pairs"], names)
        plan.append({
            "lz": lz_code, "lzs": lzs_code, "lz_id": lz[0], "lzs_id": lzs[0],
            "ratio": ratio, **res,
            "standings": standings_diff(load_standings(conn, lz[0]),
                                        load_standings(conn, lzs[0]),
                                        names),
        })
    return plan


def apply_plan(conn, plan):
    """Copia campo (y hora si falta) a LZ y borra LZS. No hace commit."""
    copiados = 0
    for p in plan:
        for lz_row, lzs_row in p["pairs"]:
            cur = conn.execute(
                """UPDATE matches
                      SET venue=COALESCE(NULLIF(venue,''), ?),
                          time=COALESCE(NULLIF(time,''), ?)
                    WHERE id=? AND (COALESCE(venue,'')='' OR COALESCE(time,'')='')""",
                (lzs_row[8] or None, lzs_row[3] or None, lz_row[0]))
            copiados += cur.rowcount
        delete_group(conn, p["lzs_id"])
    return copiados


def report(plan):
    lines = []
    for p in plan:
        lines.append(f"{SEASON} {p['lz']} ~ {p['lzs']}: solape {p['ratio']:.2f} · "
                     f"{len(p['pairs'])} emparejados · {len(p['ambiguous'])} claves ambiguas · "
                     f"{len(p['lz_only'])} solo en {p['lz']} · {len(p['lzs_only'])} solo en {p['lzs']}")
        for key in p["ambiguous"]:
            lines.append(f"    ambigua {key}")
        for lz_row, lzs_row in p["mismatched"]:
            lines.append(f"    equipos distintos: J{jornada_num(lz_row[1])} {lz_row[2]} "
                         f"{lz_row[4]} {lz_row[6]}-{lz_row[7]} {lz_row[5]} | "
                         f"FIFLP {lzs_row[4]} - {lzs_row[5]}")
        for r in p["lz_only"]:
            lines.append(f"    solo {p['lz']}:  J{jornada_num(r[1])} {r[2]} {r[4]} {r[6]}-{r[7]} {r[5]}")
        for r in p["lzs_only"]:
            lines.append(f"    solo {p['lzs']}: J{jornada_num(r[1])} {r[2]} {r[4]} {r[6]}-{r[7]} {r[5]}")
        for s in p["standings"]:
            lines.append(f"    tabla {s}")
    return lines


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    conn = get_connection()
    plan = build_plan(conn)
    if not plan:
        print("LZS1-4 ya no existen. Nada que hacer.")
        conn.close()
        return
    lines = report(plan)
    with open(LOG_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"\nLog: {LOG_PATH}")
    if not args.write:
        print("Informe: repite con --write para aplicarlo.")
        conn.close()
        return
    copiados = apply_plan(conn, plan)
    conn.commit()
    conn.close()
    print(f"\n{copiados} partidos de LZ con campo/hora de FIFLP; "
          f"borrados {', '.join(p['lzs'] for p in plan)}.")
    from generate_js import main as generate_main
    generate_main()


if __name__ == "__main__":
    main()
```

En `scripts/import_fiflp_islas.py`, dentro de `COMP_META` (≈57-59). Antes:
```python
    # 2025-26: competiciones insulares que futbolaspalmas no publica (el portal
    # solo sirve una fase por isla y el prebenjamin solo de Gran Canaria).
    "54422886": ("LZS", "Lanzarote Fase 2"),
```
Después:
```python
    # 2025-26: competiciones insulares que futbolaspalmas no publica (el portal
    # solo sirve una fase por isla y el prebenjamin solo de Gran Canaria).
    # 54422886 (Benjamín Lanzarote Fase 2) NO tiene código a propósito: es la
    # misma liga que LZ1-4 de futbolaspalmas y la importamos dos veces como
    # LZS1-4 (spec 2026-09-23 §9.4). Sin código, main() aborta con
    # «competiciones sin código asignado» antes de tocar la base; para
    # importar las demás de 21isl, IMPORT_COMPS sin 54422886.
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_db_sanity.py scripts/tests/test_fix_lanzarote_lz_lzs.py -q
grep -c '"54422886"' scripts/import_fiflp_islas.py
ISLAS_SEASON=21isl IMPORT_COMPS=54422886 python3 scripts/import_fiflp_islas.py; echo "exit $?"
```
Resultado esperado:
- `1 failed, 21 passed`. Pasan los 5 del fixer. Solo sigue en rojo `test_no_group_repeats_another_source`, con el mismo mensaje del paso 2, porque la base todavía no está arreglada.
- `0` en el `grep`.
- `competiciones sin código asignado en COMP_META: ['54422886']` y `exit 1`. El importador sale antes de abrir la base, así que no toca `futbolbase.db`.

- [ ] **Step 5: Informe en seco del fixer (no se escribe nada)**

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/_archive/fix_lanzarote_lz_lzs_2526.py | grep -E "^2025-2026|^Log:|^Informe"
wc -l < scripts/_archive/fix_lanzarote_lz_lzs_2526.log
grep -c "^    tabla" scripts/_archive/fix_lanzarote_lz_lzs_2526.log
grep -c "equipos distintos" scripts/_archive/fix_lanzarote_lz_lzs_2526.log
git status --porcelain
```
Resultado esperado (base del 23/09/2026):
```
2025-2026 LZ1 ~ LZS1: solape 0.76 · 64 emparejados · 2 claves ambiguas · 22 solo en LZ1 · 22 solo en LZS1
2025-2026 LZ2 ~ LZS2: solape 0.78 · 63 emparejados · 4 claves ambiguas · 20 solo en LZ2 · 19 solo en LZS2
2025-2026 LZ3 ~ LZS3: solape 0.73 · 62 emparejados · 2 claves ambiguas · 24 solo en LZ3 · 24 solo en LZS3
2025-2026 LZ4 ~ LZS4: solape 0.79 · 55 emparejados · 1 claves ambiguas · 15 solo en LZ4 · 15 solo en LZS4
Log: /home/manolo/claude/futbol-base/scripts/_archive/fix_lanzarote_lz_lzs_2526.log
Informe: repite con --write para aplicarlo.
187
13
0
```
- Las 13 líneas `tabla …` son 5 de LZ1, 0 de LZ2, 6 de LZ3 y 2 de LZ4.
- Ningún par apartado por equipos distintos.
- `git status --porcelain` no muestra el log (`*.log` está en `.gitignore`). Muestra ` M scripts/import_fiflp_islas.py`, ` M scripts/tests/test_db_sanity.py`, los dos ficheros nuevos como `??` y los dos `??` preexistentes.

- [ ] **Step 6: Aplicar el fixer (copia, borra LZS1-4 y regenera)**

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/_archive/fix_lanzarote_lz_lzs_2526.py --write | grep -E "partidos de LZ|bumped|Done"
python3 -c "import sqlite3; c=sqlite3.connect('futbolbase.db'); print(c.execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone())"
python3 -c "
import sqlite3
c = sqlite3.connect('file:futbolbase.db?mode=ro', uri=True)
print(c.execute(\"SELECT COUNT(*) FROM groups WHERE code LIKE 'LZS%'\").fetchone()[0])
print(c.execute(\"SELECT g.code, COUNT(*), SUM(COALESCE(m.venue,'')!='') FROM matches m JOIN groups g ON g.id=m.group_id JOIN seasons s ON s.id=g.season_id WHERE s.name='2025-2026' AND g.code IN ('LZ1','LZ2','LZ3','LZ4') GROUP BY g.code\").fetchall())
print(c.execute('PRAGMA foreign_key_check').fetchall())
"
git status --porcelain
```
Resultado esperado:
```
244 partidos de LZ con campo/hora de FIFLP; borrados LZS1, LZS2, LZS3, LZS4.
  index.html cache version bumped to ?v=<AAAAMMDD de hoy, con letra si ya hubo subida hoy>
  sw.js CACHE_NAME bumped to futbolbase-v<la misma versión>
Done!
(0, 0, 0)
0
[('LZ1', 90, 64), ('LZ2', 90, 63), ('LZ3', 90, 62), ('LZ4', 72, 55)]
[]
```
`git status --porcelain` debe mostrar exactamente:
- modificados: `data-benjamin.js`, `data-history.js`, `data-stats.js`, `futbolbase.db`, `index.html`, `scripts/import_fiflp_islas.py`, `scripts/tests/test_db_sanity.py` y `sw.js`;
- sin seguimiento: `scripts/_archive/fix_lanzarote_lz_lzs_2526.py` y `scripts/tests/test_fix_lanzarote_lz_lzs.py`, además de los preexistentes `HANDOFF.md` y `docs/mejoras-2026-09.md`.

- [ ] **Step 7: Guardián en verde y suites completas**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/test_db_sanity.py scripts/tests/test_fix_lanzarote_lz_lzs.py -q
python3 -m pytest scripts/tests/ -q
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Resultado esperado:
- `22 passed`.
- pytest: `409 passed, 5 skipped` (los 398 de la Tarea 3 más 11).
- node: `# tests 239`, `# pass 239` y `# fail 0`.

- [ ] **Step 8: Datos regenerados e interfaz actual sin cambios de código**

```bash
cd /home/manolo/claude/futbol-base
node -e "
const fs=require('fs'),vm=require('vm'),ctx={};vm.createContext(ctx);
for (const f of ['data-stats.js','data-benjamin.js','data-history.js'])
  vm.runInContext(fs.readFileSync(f,'utf8').replace(/^const /mg,'this.').replace(/;const /g,';this.'),ctx);
const t=ctx.STATS.benjamin.teams['CD Tahiche'];
console.log('Tahiche', t.pointsHistory.length, t.pointsHistory.at(-1));
console.log('Lanzarote', ctx.BENJAMIN.filter(g=>g.island==='lanzarote').map(g=>g.id).join(','));
console.log('LZS en HISTORY', Object.keys(ctx.HISTORY).filter(k=>k.startsWith('LZS')).length);
const rows=['LZ1','LZ2','LZ3','LZ4'].flatMap(id=>Object.values(ctx.HISTORY[id]).flat());
console.log('LZ con campo', rows.filter(r=>r[7]).length, 'de', rows.length);
"
node scripts/tests/render-smoke.mjs
NODE_PATH=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/pw/node_modules node scripts/tests/interaction-smoke.mjs
```
Resultado esperado:
```
Tahiche 18 54
Lanzarote LZ1,LZ2,LZ3,LZ4
LZS en HISTORY 0
LZ con campo 244 de 342
PASS: render smoke OK — MI EQUIPO rendered (DOM …)
```
- `interaction-smoke` imprime solo líneas `PASS:`; la última es `PASS: future date/time/venue, maps, downloaded ICS and explicit source statuses`.
- Antes del fixer, la misma consulta de Node daba `Tahiche 36 102`, 8 grupos en Lanzarote y 4 LZS.

- [ ] **Step 9: Commit**

Sin push: se publica en la Tarea 5.

```bash
cd /home/manolo/claude/futbol-base
git add scripts/_archive/fix_lanzarote_lz_lzs_2526.py scripts/tests/test_fix_lanzarote_lz_lzs.py \
        scripts/tests/test_db_sanity.py scripts/import_fiflp_islas.py futbolbase.db 'data-*.js' index.html sw.js
git status --porcelain
git commit -F - <<'EOF'
fix(datos): Lanzarote benjamín 2025-26 una sola vez (LZ1-4), con el campo de FIFLP

- LZ1-4 (futbolaspalmas) y LZS1-4 (FIFLP) eran la misma liga sacada de dos
  fuentes: la web la publicaba dos veces y STATS sumaba las dos (CD Tahiche:
  36 entradas de pointsHistory y 102 puntos para 18 partidos y 54 puntos).
- Fixer scripts/_archive/fix_lanzarote_lz_lzs_2526.py: copia el campo de FIFLP
  a 244 partidos de LZ que emparejan sin ambigüedad por jornada, fecha y
  marcador y cuyos equipos cuadran; deja en su log los 81 partidos con otro
  marcador, 9 claves ambiguas y 13 filas de clasificación que difieren;
  borra LZS1-4 con delete_group y regenera.
- Guardián nuevo en test_db_sanity: grupos de la misma temporada, categoría e
  isla con al menos un 70 % de partidos jugados en común por (jornada, fecha
  ISO, marcador), con 10 jugados como mínimo en cada uno. Antes del fixer solo
  saltaba con LZ~LZS en las 5 temporadas; PLZ1/PLZ2 2024-25 no lo disparan.
- import_fiflp_islas.py deja de asignar la competición 54422886 a LZS: una
  reimportación manual falla en el importador en vez de en el bot.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
```
Resultado esperado:
- Antes del commit, `git status --porcelain` solo muestra ficheros preparados (`M ` o `A `) y los dos `??` preexistentes.
- El commit se crea en `main`, con 10 ficheros.

---

### Task 5: Verificación local y publicación del Plan A

**Contexto**
- **Rebase con `--ours`, no con `--theirs`.**
  - En un rebase, `--ours` es la rama sobre la que se reaplica (`origin/main`, lo que publicó el bot) y `--theirs` es el commit local que se está reaplicando.
  - Partiendo de la base y de la `?v=` publicadas, regenerar sube la versión a una posterior a la publicada.
  - Con `--theirs`, la subida partiría de la versión local y podría repetir una `?v=` que el bot ya publicó ese día.
  - Aun sin conflictos puede haber colisión de versión el mismo día; por eso el paso 11 compara versiones.
- **Visto bueno para publicar.** El push publica en la web pública los cuatro commits y el de la spec. Hace falta el visto bueno del usuario: si la aprobación del plan no incluye publicar, se pregunta antes del paso 12.
- **Formas que exige el comprobador `verify-plan-a.cjs`**, sacadas de la spec y de las Tareas 1-3:
  - todas las filas de `data-season-*.js` con 8 columnas;
  - `MATCH_DETAIL` con `{s, gr, g}` o `{dup: true, list}`;
  - 'CD Calero|La Garita|1-11' etiquetada con `gr='FF15'`. El partido de PG2 (id 2256) no tiene goles, así que hoy la clave es una entrada suelta de FF15; el comprobador solo acepta PG2 dentro de un `dup` y nunca exige que lo haya;
  - `LINEUPS_2025_2026` con `cod` entero;
  - cuadros `MC?K*` con 9 columnas, y la tanda `"h-a"` en el índice 8 cuando el 5 es `home` o `away` (hoy son 14 filas);
  - Lanzarote sin LZS, CD Tahiche con 18 partidos y 54 puntos, y al menos 244 filas de LZ con campo.
- **CI.** `tests.yml` ejecuta pytest, las pruebas de Node y el job `render-smoke`, que incluye `interaction-smoke` y `pwa-smoke`. `update.yml` ejecuta las dos suites antes de commitear datos.

**Files:**
- Create (fuera del repo), en `/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planA/` (`$S`):
  - `verify-plan-a.cjs` y `shot-plan-a.mjs`;
  - las descargas en `antes/` y `publicado/`, y las capturas en `shots-local/` y `shots-publicado/`.
- Modify: ninguno en el camino normal. Solo si el rebase choca o hay que subir la versión de caché: `futbolbase.db`, `data-*.js`, `index.html` y `sw.js`, siempre regenerados y nunca editados a mano.
- Test:
  - `python3 -m pytest scripts/tests/ -q` y `node --test scripts/tests/test_*.mjs`;
  - `scripts/tests/render-smoke.mjs`, `interaction-smoke.mjs` y `pwa-smoke.mjs`;
  - `verify-plan-a.cjs`, en local y contra la web publicada.

**Interfaces:**
- Consumes:
  - los commits de las tareas 1-4 en `main` local, más el commit de la spec, que va por delante de `origin/main`;
  - el fixer, `generate_js.py`, `fetch_futbolaspalmas.py` y `fetch_maspalomas_cup.py --from-raw`;
  - `startServer()` y `findChrome()` de `scripts/tests/render-smoke.mjs`;
  - `gh` autenticado;
  - Playwright en `/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/pw/node_modules`.
- Produces:
  - `origin/main` con el Plan A;
  - los workflows Tests y `pages-build-deployment` en verde;
  - https://malolocabreralolo-tech.github.io/futbol-base/ sirviendo:
    - filas de 8 columnas en todas las temporadas;
    - cronología con `s`, `gr` y `dup`;
    - actas con `cod`;
    - cuadros de la Maspalomas con 9 columnas;
    - Lanzarote sin LZS.

- [ ] **Step 1: Write the failing test (comprobador del Plan A y capturas, fuera del repo)**

```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planA
mkdir -p "$S"
cat > "$S/verify-plan-a.cjs" <<'EOF'
// Comprueba en un directorio (el repo o una descarga de la web publicada) que
// los data-*.js llevan los cambios del Plan A (spec 2026-09-23, §9).
// Uso: node verify-plan-a.cjs <directorio>
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = process.argv[2] || '.';
const ctx = {};
vm.createContext(ctx);
function load(file) {
  const src = fs.readFileSync(path.join(dir, file), 'utf8');
  vm.runInContext(src.replace(/^const /mg, 'this.').replace(/;const /g, ';this.'), ctx);
}
let failed = 0;
function check(label, ok, detail = '') {
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? ' — ' + detail : ''));
  if (!ok) failed++;
}
function lengths(rows) {
  const h = {};
  rows.forEach(r => { h[r.length] = (h[r.length] || 0) + 1; });
  return JSON.stringify(h);
}

// §9.1: hora y campo en todas las temporadas (filas de 8 columnas).
for (const s of ['2021-2022', '2022-2023', '2023-2024', '2024-2025']) {
  load(`data-season-${s}.js`);
  const season = ctx['SEASON_' + s.replace('-', '_')];
  const rows = ['benjamin', 'prebenjamin'].flatMap(cat => (season[cat] || [])
    .flatMap(g => Object.values(g.jornadas || {}).flat()));
  check(`§9.1 data-season-${s}.js: filas de 8 columnas`, rows.length > 0 && rows.every(r => r.length === 8), lengths(rows));
}
load('data-history.js');
const hist = Object.values(ctx.HISTORY).flatMap(g => Object.values(g).flat());
check('§9.1 data-history.js: filas de 8 columnas', hist.every(r => r.length === 8), lengths(hist));

// §9.2: cronología y actas con temporada y grupo, y colisiones explícitas.
load('data-matchdetail.js');
const md = Object.entries(ctx.MATCH_DETAIL);
const okEntry = e => typeof e.s === 'string' && typeof e.gr === 'string' && Array.isArray(e.g);
const badMd = md.filter(([, e]) => !(e.dup === true ? Array.isArray(e.list) && e.list.length > 1 && e.list.every(okEntry) : okEntry(e)));
check('§9.2 MATCH_DETAIL: {s, gr, g} o {dup, list}', badMd.length === 0, `${md.length} claves, ${badMd.length} mal`);
// En la base, el partido de PG2 (id 2256) no tiene goles: la clave es hoy una
// entrada suelta de FF15. Si algún día PG2 trae goles, pasa a dup FF15/PG2.
const calero = ctx.MATCH_DETAIL['CD Calero|La Garita|1-11'];
const cal = calero ? (calero.dup ? calero.list : [calero]).filter(e => e.s === '2025-2026') : [];
check('§9.2 CD Calero|La Garita|1-11 etiquetada con s/gr (FF15; PG2 solo si trae goles)',
  cal.some(e => e.gr === 'FF15') && cal.every(e => ['FF15', 'PG2'].includes(e.gr)));
load('data-lineups-2025-2026.js');
const lu = Object.values(ctx.LINEUPS_2025_2026);
const conCod = e => Number.isInteger(e.cod);
check('§9.2 LINEUPS_2025_2026: cada acta lleva cod',
  lu.length > 0 && lu.every(e => e.dup === true ? e.list.every(conCod) : conCod(e)), `${lu.length} actas`);

// §9.3: cuadros de la Maspalomas con hora, campo y tanda.
load('data-maspalomas-cup-2026.js');
const ko = [...ctx.MASPALOMAS_CUP_PREBENJAMIN, ...ctx.MASPALOMAS_CUP_BENJAMIN]
  .filter(g => /K\d+$/.test(g.id)).flatMap(g => Object.values(g.jornadas || {}).flat());
check('§9.3 cuadros Maspalomas: filas de 9 columnas', ko.length > 0 && ko.every(r => r.length === 9), lengths(ko));
const pen = ko.filter(r => r[5] === 'home' || r[5] === 'away');
check('§9.3 cada pase por penaltis trae tanda "h-a"', pen.length > 0 && pen.every(r => /^\d+-\d+$/.test(r[8])), `${pen.length} partidos`);

// §9.4: Lanzarote benjamín una sola vez.
load('data-benjamin.js');
load('data-stats.js');
const lz = ctx.BENJAMIN.filter(g => g.island === 'lanzarote').map(g => g.id);
check('§9.4 data-benjamin.js: LZ1-4 y ningún LZS', lz.join() === 'LZ1,LZ2,LZ3,LZ4', lz.join());
check('§9.4 data-history.js: ningún LZS', !Object.keys(ctx.HISTORY).some(k => k.startsWith('LZS')));
const tahiche = ctx.STATS.benjamin.teams['CD Tahiche'];
check('§9.4 STATS CD Tahiche: 18 partidos, 54 puntos',
  tahiche.pointsHistory.length === 18 && tahiche.pointsHistory.at(-1) === 54,
  `${tahiche.pointsHistory.length} entradas, ${tahiche.pointsHistory.at(-1)} pts`);
const lzRows = ['LZ1', 'LZ2', 'LZ3', 'LZ4'].flatMap(id => Object.values(ctx.HISTORY[id]).flat());
check('§9.4 LZ1-4 con campo copiado de FIFLP', lzRows.filter(r => r[7]).length >= 244,
  `${lzRows.filter(r => r[7]).length} de ${lzRows.length}`);

console.log(failed ? `\n${failed} comprobaciones fallan` : '\nPlan A: todo en su sitio');
process.exit(failed ? 1 : 0);
EOF
cat > "$S/shot-plan-a.mjs" <<'EOF'
// Capturas a 390 px de las vistas que cambia el Plan A.
// Uso, desde la raíz del repo:
//   node shot-plan-a.mjs local <directorio de salida>    (sirve el repo con startServer())
//   node shot-plan-a.mjs <url de index.html> <directorio de salida>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const PW = '/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/pw/node_modules/playwright';
const { chromium } = createRequire(import.meta.url)(PW);
const { startServer, findChrome } = await import(pathToFileURL(process.cwd() + '/scripts/tests/render-smoke.mjs').href);
const [target, out] = process.argv.slice(2);
if (!target || !out) {
  console.error('Uso: node shot-plan-a.mjs <local | url de index.html> <directorio de salida>');
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const server = target === 'local' ? await startServer() : null;
const base = server ? `http://127.0.0.1:${server.address().port}/index.html` : target;
const routes = {
  'lanzarote-isla': 'section=isla&cat=benjamin&island=lanzarote',
  'lz1-jornada2': 'section=jornadas&cat=benjamin&group=LZ1&round=Jornada%202',
  'a2-2024-25-jornada5': 'section=jornadas&cat=benjamin&season=2024-2025&group=A2&round=5',
};
const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
let total = 0;
for (const [name, hash] of Object.entries(routes)) {
  const page = await browser.newPage({ viewport: { width: 390, height: 1400 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}#${hash}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
  const venues = await page.locator('.match-venue').count();
  const phases = (await page.locator('.phase-header').allTextContents()).map(t => t.trim());
  console.log(`${name}: ${venues} campos visibles, fases [${phases.join(' | ')}], `
    + `${errors.length} errores JS${errors.length ? ' — ' + errors.join(' | ') : ''}`);
  total += errors.length;
  await page.close();
}
await browser.close();
if (server) server.close();
process.exit(total ? 1 : 0);
EOF
```

- [ ] **Step 2: Run test to verify it fails (contra lo publicado)**

```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planA
mkdir -p "$S/antes"
for f in data-season-2021-2022.js data-season-2022-2023.js data-season-2023-2024.js data-season-2024-2025.js data-history.js data-matchdetail.js data-lineups-2025-2026.js data-maspalomas-cup-2026.js data-benjamin.js data-stats.js; do git -C /home/manolo/claude/futbol-base show "origin/main:$f" > "$S/antes/$f"; done
node "$S/verify-plan-a.cjs" "$S/antes"; echo "exit $?"
```
Resultado esperado: `13 comprobaciones fallan` y `exit 1`.
- Solo pasa `§9.1 data-history.js`.
- Entre los fallos: `FAIL §9.2 CD Calero|La Garita|1-11 etiquetada con s/gr (FF15; PG2 solo si trae goles)`, `FAIL §9.4 STATS CD Tahiche: 18 partidos, 54 puntos — 36 entradas, 102 pts` y `FAIL §9.4 LZ1-4 con campo copiado de FIFLP — 0 de 342`.

- [ ] **Step 3: Punto de partida**

```bash
cd /home/manolo/claude/futbol-base
git fetch origin
git status --porcelain
git log --oneline origin/main..HEAD
git log --oneline HEAD..origin/main
```
Resultado esperado:
- `status` solo muestra `?? HANDOFF.md` y `?? docs/mejoras-2026-09.md`.
- `origin/main..HEAD` lista 5 commits: `docs: spec del rediseño total «Acta»…` y los de las Tareas 1-4.
- `HEAD..origin/main` lista los commits que el bot haya publicado desde el paso previo, o sale vacío.

- [ ] **Step 4: Ciclo local, pasos 1 y 2 (fixer y generadores idempotentes)**

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/_archive/fix_lanzarote_lz_lzs_2526.py
python3 scripts/generate_js.py | tail -3
python3 scripts/fetch_maspalomas_cup.py --from-raw --check; echo "exit=$?"
git status --porcelain
```
Resultado esperado:
- `LZS1-4 ya no existen. Nada que hacer.`
- `  data-*.js sin cambios — no se bumpea ?v= / footer / CACHE_NAME (C4)` y `Done!`.
- `Al día.` y `exit=0`.
- El mismo `status` que en el paso 3: lo commiteado cuadra con la base y con los generadores.

- [ ] **Step 5: Ciclo local, paso 3 (la fuente no puede deshacer el arreglo)**

```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planA
python3 scripts/fetch_futbolaspalmas.py > "$S/fetch.log" 2>&1; echo "exit $?"; tail -2 "$S/fetch.log"
grep -A3 "^\s*\[LZ[1-4]\]" "$S/fetch.log" | head -16
python3 -c "
import sqlite3, json
c = sqlite3.connect('file:futbolbase.db?mode=ro', uri=True)
print('LZS', c.execute(\"SELECT COUNT(*) FROM groups WHERE code LIKE 'LZS%'\").fetchone()[0])
print(c.execute(\"SELECT g.code, SUM(COALESCE(m.venue,'')!='') FROM matches m JOIN groups g ON g.id=m.group_id JOIN seasons s ON s.id=g.season_id WHERE s.name='2025-2026' AND g.code IN ('LZ1','LZ2','LZ3','LZ4') GROUP BY g.code\").fetchall())
h = json.load(open('data-health.json'))
print(h['summary'], sorted(k for k in h['groups'] if k.startswith('LZ')))
"
```
Resultado esperado:
- `exit 0` y `Terminado.`.
- Cada `[LZn]` muestra `! sin partidos` y `Clasificacion: 10 equipos` (9 en LZ4), como el 23/09.
- `LZS 0`.
- `[('LZ1', 64), ('LZ2', 63), ('LZ3', 62), ('LZ4', 55)]`.
- Una línea como `{'ok': 44, 'rejected': 1, 'error': 0} ['LZ1', 'LZ2', 'LZ3', 'LZ4']`. El 23/09 el rechazado era PG1; lo que importa es `'error': 0` y que LZ1-4 sigan cubiertos.

Si sale `CAMBIO DE TEMPORADA DETECTADO`, se para aquí sin publicar: ver `docs/temporada-nueva.md`.

- [ ] **Step 6: Ciclo local, paso 4 (las suites del bot sobre el estado tras el scrape)**

```bash
cd /home/manolo/claude/futbol-base
python3 -m pytest scripts/tests/ -q
node --test scripts/tests/test_*.mjs 2>&1 | grep -E '^# (tests|pass|fail)'
```
Resultado esperado: pytest con 0 fallos (`409 passed, 5 skipped` si la fuente no trajo nada que cambie los recuentos) y Node con `# fail 0`.

- [ ] **Step 7: Descartar los efectos del scrape (los publica el bot, no este plan)**

```bash
cd /home/manolo/claude/futbol-base
git status --porcelain
git checkout -- futbolbase.db data-health.json
rm -f futbolbase.db-wal futbolbase.db-shm
git diff --quiet -- 'data-*.js' index.html sw.js || git checkout -- 'data-*.js' index.html sw.js
git status --porcelain
```
Resultado esperado:
- El primer `status` muestra ` M futbolbase.db` y, a veces, ` M data-health.json`. Solo si la fuente trajo datos nuevos aparecen también `data-*.js`, `index.html` y `sw.js`.
- El `rm -f` es defensivo: un `-wal` que quedara del scrape se aplicaría encima del `futbolbase.db` restaurado al abrirlo.
- El segundo `status` vuelve a mostrar solo los dos `??` preexistentes.

- [ ] **Step 8: Pruebas de navegador, comprobador y capturas en local**

```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planA
PW=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/pw/node_modules
node scripts/tests/render-smoke.mjs
NODE_PATH="$PW" node scripts/tests/interaction-smoke.mjs
NODE_PATH="$PW" node scripts/tests/pwa-smoke.mjs
node "$S/verify-plan-a.cjs" .
node "$S/shot-plan-a.mjs" local "$S/shots-local"
```
Resultado esperado:
- `PASS: render smoke OK — MI EQUIPO rendered (…)`.
- `interaction-smoke` solo imprime líneas `PASS:`.
- `PASS: previous PWA cache replaced by futbolbase-v<versión local>; dashboard and team search work offline`.
- Las 14 comprobaciones en `PASS`, entre ellas `PASS §9.2 CD Calero|La Garita|1-11 etiquetada con s/gr (FF15; PG2 solo si trae goles)`, y al final `Plan A: todo en su sitio`.
- Capturas (el script levanta su propio servidor con `startServer()`):
  ```
  lanzarote-isla: 0 campos visibles, fases [⚽ Lanzarote], 0 errores JS
  lz1-jornada2: 5 campos visibles, fases [], 0 errores JS
  a2-2024-25-jornada5: 5 campos visibles, fases [], 0 errores JS
  ```

Después, abrir los tres PNG de `$S/shots-local` (Read) y comprobar:
- Lanzarote solo tiene la fase «Lanzarote», con los grupos 1-4.
- La jornada 2 de LZ1 muestra «📍 campo».
- La jornada 5 de A2 2024-25 muestra hora y campo.

Enseñárselos al usuario antes de publicar.

- [ ] **Step 9: Ningún workflow en marcha (norma: nunca se empuja con un workflow corriendo)**

```bash
cd /home/manolo/claude/futbol-base
gh run list --workflow=update.yml --limit 1
gh run list --limit 20 --json databaseId,status,name --jq '.[] | select(.status != "completed") | "\(.databaseId) \(.name) \(.status)"'
```
Resultado esperado:
- La primera línea empieza por `completed`.
- La segunda orden no imprime nada.
- Si algo está `in_progress` o `queued`, se espera a que termine y se repite este paso. Mientras tanto no se empuja:
  ```bash
  cd /home/manolo/claude/futbol-base
  for id in $(gh run list --limit 20 --json databaseId,status --jq '.[] | select(.status != "completed") | .databaseId'); do timeout 900 gh run watch "$id" --compact --interval 30; done
  ```

- [ ] **Step 10: Rebase sobre lo que haya publicado el bot**

```bash
cd /home/manolo/claude/futbol-base
git pull --rebase origin main
```
Resultado esperado: `Successfully rebased and updated refs/heads/main.` o `Current branch main is up to date.`.

Si el rebase se para con conflictos, en cada parada se ejecuta este bloque. Se repite hasta que el rebase termine:
```bash
cd /home/manolo/claude/futbol-base
CONFL=$(git diff --name-only --diff-filter=U); echo "$CONFL"
[ -n "$CONFL" ] || { echo "PARAR: esta parada no tiene conflictos; revisar git status"; exit 1; }
if echo "$CONFL" | grep -qvE '^(futbolbase\.db|data-[A-Za-z0-9.-]+\.js|index\.html|sw\.js)$'; then echo "PARAR: conflicto en un fichero no generado; resolver a mano"; exit 1; fi
echo "$CONFL" | xargs git checkout --ours --
rm -f futbolbase.db-wal futbolbase.db-shm
if echo "$CONFL" | grep -qx futbolbase.db; then python3 scripts/_archive/fix_lanzarote_lz_lzs_2526.py --write; fi
if echo "$CONFL" | grep -qx data-maspalomas-cup-2026.js; then python3 scripts/fetch_maspalomas_cup.py --from-raw; fi
python3 scripts/generate_js.py | tail -3
python3 -c "import sqlite3; c=sqlite3.connect('futbolbase.db'); print(c.execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone())"
{ python3 -m pytest scripts/tests/ -q && node --test scripts/tests/test_*.mjs; } || { echo "PARAR: suites en rojo; git rebase --abort y revisar"; exit 1; }
git add futbolbase.db 'data-*.js' index.html sw.js
GIT_EDITOR=true git rebase --continue
```
Por qué funciona:
- El bloque se detiene (`exit 1`) sin tocar nada si hay un conflicto en un fichero no generado. También se detiene sin continuar el rebase si las suites salen en rojo.
- `--ours` parte de la base y de la versión `?v=` que publicó el bot (ver Contexto). Al regenerar, `generate_js` sube la versión a la siguiente de la publicada.
- El fixer es idempotente: sobre la base del bot vuelve a copiar los campos, a borrar LZS y a regenerar. Solo hace falta en la parada del commit de la Tarea 4, que es el último.
- El `generate_js.py` final regenera los datos de la parada con el generador de ese commit. Si ya está todo al día, dice «sin cambios».

Resultado esperado: el rebase termina con las suites en verde en cada parada.

- [ ] **Step 11: Commit (solo si la versión de caché coincide con la publicada)**

```bash
cd /home/manolo/claude/futbol-base
PUB=$(git show origin/main:index.html | grep -o 'data-seasons.js?v=[0-9a-z]*')
LOC=$(grep -o 'data-seasons.js?v=[0-9a-z]*' index.html)
echo "publicada: $PUB · local: $LOC"
```
Resultado esperado: dos versiones distintas.

Si son iguales, el bot publicó otros datos con la misma versión del día, y la PWA no pediría los ficheros nuevos. En ese caso:
```bash
cd /home/manolo/claude/futbol-base
python3 -c "import sys; sys.path.insert(0, 'scripts'); from generate_js import bump_cache_version; bump_cache_version()"
node --test scripts/tests/test_*.mjs
git add index.html sw.js
git commit -F - <<'EOF'
chore: versión de caché nueva para los datos del Plan A

El rebase dejó en index.html y sw.js la misma versión que ya había publicado
el bot hoy con otros datos; sin subirla, la PWA no pediría los data-*.js nuevos.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sg56KK3oZgo8Ye7Snj6wG9
EOF
```
Después, con o sin ese commit:
```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planA
python3 -m pytest scripts/tests/ -q && node --test scripts/tests/test_*.mjs && node "$S/verify-plan-a.cjs" .
```
Resultado esperado: todo en verde y `Plan A: todo en su sitio`.

- [ ] **Step 12: Publicar** (con el visto bueno del usuario; ver Contexto)

```bash
cd /home/manolo/claude/futbol-base
EN_MARCHA=$(gh run list --limit 20 --json status,name --jq '.[] | select(.status != "completed") | .name')
if [ -n "$EN_MARCHA" ]; then echo "PARAR: workflows en marcha: $EN_MARCHA (volver al paso 9)"; exit 1; fi
git push origin main
```
Resultado esperado: `git push` termina con `main -> main`. Si sale `PARAR`, se vuelve al paso 9. Si el push se rechaza porque el bot acaba de empujar, se vuelve al paso 9 y se repiten los pasos 10 y 11.

- [ ] **Step 13: Vigilar Tests y Pages del commit publicado**

```bash
cd /home/manolo/claude/futbol-base
SHA=$(git rev-parse HEAD)
gh run list --commit "$SHA" --json databaseId,workflowName,status --jq '.[] | "\(.databaseId) \(.workflowName) \(.status)"'
```
Esperado: una línea de `Tests` y otra de `pages-build-deployment`. GitHub tarda unos segundos en crearlas. Si falta alguna, no se espera con `sleep` en primer plano: se usa la herramienta Monitor con esta condición, y después se repite esta orden:
```bash
cd /home/manolo/claude/futbol-base
until [ "$(gh run list --commit "$(git rev-parse HEAD)" --json databaseId --jq length)" -ge 2 ]; do sleep 10; done
```

Con las dos ejecuciones creadas:
```bash
cd /home/manolo/claude/futbol-base
SHA=$(git rev-parse HEAD)
TESTS=$(gh run list --workflow=tests.yml --commit "$SHA" --json databaseId --jq '.[0].databaseId')
timeout 900 gh run watch "$TESTS" --exit-status --compact --interval 30; echo "exit $?"
```
```bash
cd /home/manolo/claude/futbol-base
SHA=$(git rev-parse HEAD)
PAGES=$(gh run list --workflow=pages-build-deployment --commit "$SHA" --json databaseId --jq '.[0].databaseId')
timeout 900 gh run watch "$PAGES" --exit-status --compact --interval 30; echo "exit $?"
```
Resultado esperado:
- Tests termina con los jobs `pytest`, `node-tests` y `render-smoke` en ✓ y `exit 0`.
- `pages build and deployment` termina en ✓ y `exit 0`.

Qué hacer si no sale así:
- `exit 124`: se agotaron los 15 minutos de `timeout` pero la ejecución sigue. Se repite el `gh run watch`.
- Tests en rojo: se mira `gh run view "$TESTS" --log-failed`.
  - Si el único fallo es `Interaction smoke` con `Target page, context or browser has been closed` (el fallo intermitente de la nota de «Orden de ejecución»), se relanza una vez con `gh run rerun "$TESTS" --failed` y se vuelve a vigilar.
  - Cualquier otro fallo: parar e informar al usuario, sin empujar arreglos a ciegas.

- [ ] **Step 14: Comprobar la web publicada**

```bash
cd /home/manolo/claude/futbol-base
BASE=https://malolocabreralolo-tech.github.io/futbol-base
V=$(grep -o 'data-seasons.js?v=[0-9a-z]*' index.html | cut -d= -f2)
echo "local: $V"
curl -s "$BASE/index.html?nc=$(date +%s)" | grep -o 'data-seasons.js?v=[0-9a-z]*'
```
Esperado: la web sirve `data-seasons.js?v=<la misma versión que la local>`. Si todavía sirve la anterior (la CDN de Pages puede tardar unos minutos), se espera con la herramienta Monitor usando esta condición, y se repite esta orden:
```bash
cd /home/manolo/claude/futbol-base
V=$(grep -o 'data-seasons.js?v=[0-9a-z]*' index.html | cut -d= -f2)
until curl -s "https://malolocabreralolo-tech.github.io/futbol-base/index.html?nc=$(date +%s)" | grep -q "data-seasons.js?v=$V"; do sleep 15; done
```

Con la versión nueva publicada:
```bash
cd /home/manolo/claude/futbol-base
S=/tmp/claude-1000/-home-manolo/db6fd8e0-f1e7-4e94-b6cd-ef7dd5bf6ae9/scratchpad/planA
BASE=https://malolocabreralolo-tech.github.io/futbol-base
V=$(grep -o 'data-seasons.js?v=[0-9a-z]*' index.html | cut -d= -f2)
mkdir -p "$S/publicado"
for f in data-season-2021-2022.js data-season-2022-2023.js data-season-2023-2024.js data-season-2024-2025.js data-history.js data-matchdetail.js data-lineups-2025-2026.js data-maspalomas-cup-2026.js data-benjamin.js data-stats.js; do curl -sf "$BASE/$f?v=$V" -o "$S/publicado/$f" || echo "FALTA $f"; done
node "$S/verify-plan-a.cjs" "$S/publicado"
node "$S/shot-plan-a.mjs" "$BASE/index.html" "$S/shots-publicado"
```
Resultado esperado:
- No sale ningún `FALTA`.
- Las 14 comprobaciones en `PASS` y `Plan A: todo en su sitio`, lo que confirma, entre otras cosas, las filas de 8 columnas en las cuatro temporadas pasadas.
- Las tres líneas de captura son iguales a las del paso 8. Como referencia, antes del Plan A la misma orden contra la web daba `fases [⚽ Lanzarote | ⚽ Lanzarote Fase 2]` en `lanzarote-isla` y `0 campos visibles` en las tres vistas.

Después, abrir los PNG de `$S/shots-publicado` (Read) y enseñárselos al usuario.

- [ ] **Step 15: El bot sigue en verde con los datos nuevos**

En la siguiente ejecución programada de `update.yml`, hasta 6 h después y a menudo con retraso:
```bash
cd /home/manolo/claude/futbol-base
gh run list --workflow=update.yml --limit 1
```
Resultado esperado: `completed	success	Actualización automática …`, con fecha posterior al push. Si sale `failure`, se mira el log; un pytest en rojo bloquea la publicación de datos:
```bash
cd /home/manolo/claude/futbol-base
gh run view "$(gh run list --workflow=update.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --log-failed
```

---

## Autorrevisión

**Cobertura de la spec (§9):**
- **§9.1** (hora y campo en temporadas pasadas) → **Tarea 1**.
- **§9.2** (`s`, `gr` y `cod`; `dup`; guarda en la interfaz actual; la (i) contando partidos) → **Tarea 2**. El ejemplo de Calero de la spec se prueba con datos sintéticos: en la base, el partido de PG2 (id 2256) no tiene goles, así que la clave real es una entrada suelta de FF15. Contra la base real se comprueba esa etiqueta, con `pytest.skip` si la clave desaparece.
- **§9.3** (cuadros de la Maspalomas en 9 columnas con tanda) → **Tarea 3**, incluidos el test dorado (`--from-raw --check`) y los de `row_short`.
- **§9.4** (Lanzarote sin LZS) → **Tarea 4**:
  - fixer con log, `delete_group` y `generate_js`;
  - guardián con el negativo real de PLZ, comprobado en las 5 temporadas antes y después;
  - importador sin LZS.
- **Verificación local** (fixer → `generate_js.py` → `fetch_futbolaspalmas.py` → suites, más `--from-raw --check`) → **Tarea 5**, pasos 4-7. La publicación y la comprobación de la web son los pasos 9-15.

**Focos de revisión → dónde se prueban:**
1. El bot empuja durante el plan → paso previo (rebase inicial) y Tarea 5, paso 10: el bucle se detiene ante un fichero no generado o ante suites en rojo.
2. La base viva pierde una clave → Tarea 2: el test de Calero usa `.get()` + `pytest.skip`.
3. Una PWA vieja recibe datos nuevos:
   - Tarea 2: `singleEntry` en `modals.js`, sin import cruzado, y tests de tolerancia de `aggregatePlayerFromLineups`;
   - Tarea 3: tests de compatibilidad de `matchAdvancer` y `bracketChampion`;
   - Tareas 1-5: pruebas de navegador.
4. Activación de 2026/27 → Tarea 2: `if (!Lin) continue;` en los dos tests de `LINEUPS_*`. Comprobado con un `data-lineups-2026-2027.js` simulado: sin la guarda fallan 2 tests.
5. Reimportación de LZS → Tarea 4: guardián con test positivo, y el importador aborta.

**Verificación del plan.**
- La revisión adversarial aplicó las Tareas 1→4 sobre un clon del repo, con un commit por tarea y las suites en verde en cada commit:

  | Tras | pytest | node |
  |---|---|---|
  | Línea base | 373 passed, 5 skipped | 232 |
  | Tarea 1 | 377 passed, 5 skipped | 232 |
  | Tarea 2 | 386 passed, 5 skipped | 237 |
  | Tarea 3 | 398 passed, 5 skipped | 239 |
  | Tarea 4 | 409 passed, 5 skipped | 239 |

  `render-smoke` e `interaction-smoke` pasaron tras las Tareas 1, 2 y 4, y `pwa-smoke` tras la 4. El fixer dio exactamente el informe, el `--write` y los datos finales que se esperan aquí, y es idempotente.
- Los arreglos de la revisión que cambian código se volvieron a aplicar sobre otro clon, con los mismos recuentos de la tabla:
  - comprobador de Calero;
  - Calero con `.get()`;
  - `JOIN categories`;
  - aserción U+2028/U+2029;
  - `singleEntry` en `modals.js`;
  - `if (!Lin) continue;`;
  - `split_by_teams`;
  - importador sin LZS;
  - capturas con `startServer()`.

  En ese clon:
  - `verify-plan-a.cjs` da 14 `PASS` sobre el repo y 13 fallos sobre `origin/main`;
  - `shot-plan-a.mjs local` y el script visual de la Tarea 1 dan exactamente las salidas esperadas;
  - la prueba de Chrome del modal con entradas `dup` inyectadas no pinta nada;
  - los mismos datos reales siguen pintando la cronología de FF15 (12 goles) y la alineación de A1.
- Las salidas con `<AAAAMMDD…>` o `<versión>` son valores que dependen del día, no huecos por rellenar.
