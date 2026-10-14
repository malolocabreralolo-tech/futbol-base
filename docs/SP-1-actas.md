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
| `scripts/migrate_actas_schema.py` | Migración idempotente. Tablas `players`, `appearances`, `match_events`, `match_staff_all` y la vista `match_staff`; columna `matches.cod_acta`. Una base nueva nace con el esquema compacto (abajo). |
| `scripts/migrate_compactar.py` | Paso idempotente del bot (octubre de 2026): convierte una base del esquema anterior al compacto, con un `VACUUM`. En una base ya compacta no hace nada. |
| `scripts/acta_parser.py` | Parser puro (HTML → dict) con sub-parsers: cabecera, alineaciones, goles, cambios, tarjetas, staff. Cero deps externas. |
| `scripts/acta_reconciler.py` | `reconcile_acta(conn, header)` mapea cabecera de acta a `matches.id` con normalización agresiva de nombres + rescate por prefijo. |
| `scripts/import_fiflp_actas.py` | Importador idempotente raw JSON → DB. Reconcilia, hace DELETE+INSERT por partido, mantiene invariante `appearances.goals == count(match_events.kind='goal')`. Actas no casadas a `scripts/fiflp_actas_unmatched.json`. |
| `scripts/fetch_fiflp_actas.py` | Scraper Playwright headless. Enumera vía 4 estrategias en cascada (comp→grupo→jornada / `NFG_LstPartidos` / página de equipo / barrido por rango). Save progressive cada 25 actas. |
| `scripts/generate_js.py` (extendido) | Emite `data-lineups-<season>.js` y `data-players-<season>.js` por temporada con `cod_acta != NULL`. |
| `.github/workflows/fetch-fiflp-actas.yml` | Workflow_dispatch con inputs `temporada`, `comps`, `do_import`, `max_actas`, `dump_fixture`. Scrape→import→generate→commit con reintentos `pull --rebase + push`. |

## Las tablas de las actas en la base (esquema compacto, octubre de 2026)

`futbolbase.db` va en git y GitHub rechaza un fichero de más de 100 MB. Con el esquema anterior la base ocupaba 71,2 MB el 14/10/2026 y, con el alevín, llegaba a ese límite en 2027. `migrate_compactar.py` la dejó en 37,6 MB (la opción «B5» del estudio de almacenamiento) sin cambiar lo que se publica: los `data-*.js` salen iguales byte a byte, salvo `COBERTURA.mb`, el tamaño de la base que muestra Fuentes (de 70 a 35).

| Objeto | Qué es |
|---|---|
| `appearances` | Una fila por jugador y acta. `WITHOUT ROWID`, con clave primaria `(match_id, team_id, player_id)` (la UNIQUE de antes) y sin `id`. `ord` es el orden del acta (local, visitante y los que solo salen en los sucesos, desde 0). Antes ese orden lo daba el `id`. `generate_js` desempata la alineación por `role DESC, dorsal, ord`. |
| `idx_appearances_player` | Para `prune_players` (en cada pasada del bot) y la clave ajena al borrar jugadores. Sin él, la pasada tarda minutos. Las consultas por `match_id` usan la clave primaria. |
| `match_events` | Sin cambios, salvo los índices: `idx_match_events_match`, `idx_match_events_player` y el parcial `idx_match_events_pair` (`pair_id`, `WHERE pair_id IS NOT NULL`). Sin este último, la clave ajena de `pair_id` recorría la tabla entera por cada suceso borrado al reimportar un acta. |
| `match_staff_all` | Todo el cuerpo técnico y los árbitros del acta, con el cargo que pone la federación y su orden (`ord` desde 0). Una fila con `ord` negativo no es del cuerpo técnico del acta: es uno de los cuatro cargos de siempre que solo constaba en la antigua tabla `match_staff` (abajo). Sale en la vista, pero no en `stH`/`stA`/`refs`. |
| `match_staff` | **Vista** de `match_staff_all` con los cuatro cargos de siempre y su `kind`: «Árbitro/a Principal» → `referee`, «DEL. Campo» → `delegate_field`, «DEL. Equipo» → `delegate_team` y «Entrenador» → `coach`. No se escribe en ella: un INSERT, UPDATE o DELETE falla. Se escribe en `match_staff_all`. |

Reglas para el código que escribe:

- Todo INSERT en `appearances` lleva `ord` (columna `NOT NULL` sin valor por defecto).
- Al borrar o mover lo que cuelga de un partido o de un equipo, se toca `match_staff_all`, no `match_staff`. Las listas de tablas que comprueban `sqlite_master` con `type='table'` saltan la vista. `match_staff` sigue en ellas por si se trabaja con una base de antes. Estas listas llevan también `match_staff_all`: `import_fiflp_actas._clear_acta_rows`, `update_fiflp.ACTA_CHILDREN`, `migrate_team_names` e `import_fiflp_grupos._move_teams`.
- `db.MATCH_CHILD_TABLES` (`delete_group_matches`) y las `ACTA_CHILD_TABLES` de los importadores antiguos no llevan `match_staff_all`, y tampoco la llevaban antes de la compactación. Con las claves ajenas activas, borrar los partidos de un grupo con cuerpo técnico en `match_staff_all` falla con `FOREIGN KEY constraint failed`. Por eso `import_fiflp_grupos.import_season` salta hoy los grupos con actas que rehace («no se pudo importar … se salta»). Añadirla haría que esos grupos se rehicieran de verdad y cambiaría datos publicados: en 2019-20, por ejemplo, salen equipos con el nombre de la federación. Es una decisión aparte.
- Lo que solo lee puede usar `match_staff` como antes. En un acta importada desde el cambio, `match_staff` sale del cuerpo técnico que lista el acta (`staff_rows`). Antes salía de los campos `referee`, `coach_*` y `delegates_*` del lector. En la base del 14/10/2026 las dos fuentes coincidían en todas las actas salvo una (abajo). Reimportar las temporadas 2023-24 y 2025-26 (6.397 actas) con el código anterior y con el nuevo deja las mismas filas en `match_staff`.
- `generate_js` lee también una base sin compactar: desempata por `id` si no hay `ord`.

La conversión (`migrate_compactar.migrate`) la hace el bot en su pasada: `fetch_futbolaspalmas.main` la llama al arrancar, antes de leer ni importar nada, y `migrate_actas_schema.migrate` la llama al final, así que cualquier camino que escribe actas tiene ya el esquema nuevo. Va en una transacción y sin claves ajenas mientras rehace las tablas. Comprueba que `appearances` conserva todas las filas y que a la vista no le falta ninguna fila de la tabla `match_staff`. Si algo falla, no cambia nada y la pasada se para. Hace el `VACUUM` una sola vez, solo cuando ha convertido algo: un `VACUUM` en cada pasada multiplicaría lo que cada commit del bot añade al historial de git. Deja la marca `FIFLP_DB_MARK` para que `update.yml` suba la base aunque no cambie ningún `data-*.js`.

Lo que tenía la tabla `match_staff` y no `match_staff_all` pasa a `match_staff_all` antes de borrarla:

- **Partidos sin ninguna fila en `match_staff_all`** (actas importadas antes de que existiera): sus cuatro cargos, en el orden del antiguo `backfill_staff_all`: primero el árbitro y después cada equipo por su id, con el delegado de campo, el de equipo y el entrenador. Es lo que hacía el bot en cada pasada. En la base del 14/10/2026 no había ninguno.
- **Filas sueltas**, con `ord` negativo. En la base del 14/10/2026 había una: el «entrenador» del visitante del acta 289289 (FF16 de 2026-27). En su acta, una línea «…Entrenador:» sin nombre va seguida de «ENCARGADO MATERIAL : …», y el lector (`fiflp_acta._team`, la expresión de `grab`, cuyo `\s*` salta el salto de línea) tomó esa línea como nombre. La fila se conserva, y con ella el `coachA` publicado. Desaparece si el acta se vuelve a leer: la vista sale entonces de lo que trae el acta, y el acta no tiene entrenador visitante.

En la base del 14/10/2026, las 65.262 filas de `match_staff` y las 412.520 de `appearances`, con su orden, siguen iguales tras la conversión. Pruebas: `scripts/tests/test_migrate_compactar.py`.

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
