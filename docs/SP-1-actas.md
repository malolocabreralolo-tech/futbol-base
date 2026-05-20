# SP-1 — Pipeline de datos de actas FIFLP

Spec: `docs/superpowers/specs/2026-05-19-fiflp-actas-pipeline-design.md`
Plan: `docs/superpowers/plans/2026-05-20-fiflp-actas-pipeline.md`

## Qué construye

Pipeline incremental para extraer datos por jugador (alineaciones, goles, cambios,
tarjetas, árbitro, entrenadores) desde las actas FIFLP, normalizarlos a la DB
SQLite, reconciliarlos contra los partidos ya existentes y generar
`data-lineups-<season>.js` / `data-players-<season>.js` listos para que SP-2 los
consuma.

## Componentes

| Fichero | Función |
|---|---|
| `scripts/migrate_actas_schema.py` | Migración idempotente. Tablas nuevas `players`, `appearances`, `match_events`, `match_staff`; columna `matches.cod_acta`. |
| `scripts/acta_parser.py` | Parser puro (HTML → dict) con sub-parsers: cabecera, alineaciones, goles, cambios, tarjetas, staff. Cero deps externas. |
| `scripts/acta_reconciler.py` | `reconcile_acta(conn, header)` mapea cabecera de acta a `matches.id` con normalización agresiva de nombres + rescate por prefijo. |
| `scripts/import_fiflp_actas.py` | Importador idempotente raw JSON → DB. Reconcilia, hace DELETE+INSERT por partido, mantiene invariante `appearances.goals == count(match_events.kind='goal')`. Actas no casadas a `scripts/fiflp_actas_unmatched.json`. |
| `scripts/fetch_fiflp_actas.py` | Scraper Playwright headless. Enumera vía 4 estrategias en cascada (comp→grupo→jornada / `NFG_LstPartidos` / página de equipo / barrido por rango). Save progressive cada 25 actas. |
| `scripts/generate_js.py` (extendido) | Emite `data-lineups-<season>.js` y `data-players-<season>.js` por temporada con `cod_acta != NULL`. |
| `.github/workflows/fetch-fiflp-actas.yml` | Workflow_dispatch con inputs `temporada`, `comps`, `do_import`, `max_actas`, `dump_fixture`. Scrape→import→generate→commit con reintentos `pull --rebase + push`. |

## Cómo lanzar

Solo desde GitHub Actions (FIFLP bloquea la IP local):

```
gh workflow run fetch-fiflp-actas.yml --ref main \
   -f temporada=21 \
   -f comps=54422888 \
   -f do_import=true \
   -f max_actas=0
```

- `temporada`: 17 (2021-22), 18 (2022-23), 19 (2023-24), 20 (2024-25), 21 (2025-26).
- `comps`: opcional, lista de comp ids (anula auto-discover). Auto-descubre filtrando por keyword "BENJAMIN"/"PREBENJAMIN" si se omite.
- `max_actas`: cap para spike runs (0 = sin límite).
- `dump_fixture`: opcional, CodActa cuya HTML guardar a `scripts/tests/fixtures/` (diagnóstico).

Reanudable: cada dispatch carga el raw JSON existente y solo scrapea las actas
nuevas. Para una temporada completa, lanzar varios dispatches sucesivos hasta
que el contador "pending" llegue a 0.

## Cobertura validada

| Temporada | Código | Validación | Notas |
|---|---|---|---|
| 2025-2026 | 21 | Pipeline ejecutado | **Actas devuelven HTML vacío** (FIFLP anti-scrape agresivo). Solo CodActa pre-registrado para partidos ya jugados con acta firmada da contenido. |
| 2024-2025 | 20 | Pendiente de re-scrape masivo | Comp 1581 (Prebenjamin GC) requiere ruta fallback; ver §3.3 spec. Fixtures `acta_modern.html` (CodActa 190080) y `acta_2024_25.html` (CodActa 189453) tienen contenido completo. |
| 2023-2024 | 19 | Pendiente | Camino principal probable. |
| 2022-2023 | 18 | Pendiente | Auto-discover de comps. |
| 2021-2022 | 17 | Pendiente | Auto-discover de comps. |

## Limitación conocida — FIFLP anti-scraping

Tras varios dispatches consecutivos del scraper, FIFLP empezó a devolver
`<html><head></head><body></body></html>` (39 bytes) para las URLs de actas
2025-26. Los fixtures históricos `acta_modern.html` (324KB) y `acta_2024_25.html`
(514KB) — capturados antes del endurecimiento — sí tienen contenido completo y
exercise el parser correctamente.

Los `acta_failed_*.html` que el scraper auto-vuelca en
`scripts/tests/fixtures/` durante un fallo silencioso (header todo `None`)
documentan exactamente qué responde FIFLP en cada caso.

**Mitigaciones posibles** (a implementar si se quiere reactivar la extracción):
1. **Retraso mucho mayor** entre actas (30-60s) — el `delay()` actual es 2-3.5s.
2. **Rotar User-Agent / accept-language** entre peticiones.
3. **Ventanas de tiempo cortas** — varios dispatches con pocas actas espaciados
   por horas/días.
4. **Proxy residencial** — pero requiere infraestructura externa.

El pipeline SP-1 está completo y listo: cuando FIFLP relaje (o se aplique una
de las mitigaciones), el flujo scrape→parse→reconcile→import→generate funcionará
sin cambios de código.

## Validación de invariantes

- `appearances.goals == COUNT(match_events.kind='goal')` por (match_id, player_id).
- Igual para `yellow` y `red`.
- Importer idempotente: re-ejecutar sobre el mismo raw produce el mismo recuento de filas.
- `data-lineups-<season>.js` `events[].n` siempre referencia a un jugador en `home`/`away` del mismo partido.
- Suma de `data-players-<season>.js[team][player].g` == filas en `appearances` para esa temporada.

Tests automatizados:
- pytest (84 + 5 skipped baseline): `python3 -m pytest scripts/tests/ -q`
- Node tests (26): `node --test scripts/tests/test_js_modules.mjs`
- Render smoke en CI (gated en pushes a `src/`/`index.html`).
