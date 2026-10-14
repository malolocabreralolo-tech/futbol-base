# Alevín de Gran Canaria (tercera categoría)

El canal federación → base → JS está preparado para alevín de Gran Canaria (fútbol 7/8) y para la Segunda Fase de 2026-27, pero **la base no tiene todavía ningún dato alevín**: se activa desde GitHub Actions y en local con los pasos de abajo. La web (lectura perezosa de `data-alevin.js`, la categoría en `CATEGORIES`, los enlaces…) va en su propia rama.

## Alcance

- Solo **Gran Canaria**, fútbol 7/8. Nunca fútbol sala (tampoco la liga «LPFS»).
- Alevín de **Lanzarote y Fuerteventura queda fuera**, a propósito: `categorias.category_of` devuelve `None` para sus competiciones («LIGA ALEVIN LANZAROTE FASE 1», «LIGA ALEVIN FUERTEVENTURA F7 1ª FASE»…), y ningún importador ni descargador las toma.
- Las Mesas Huracán tiene cuatro equipos alevín (A, B, C y D) en la Fase Previa de 2026-27.

## Contrato común (datos ↔ web)

1. **Categoría.** En la base, la fila `ALEVIN` (mayúsculas) de `categories`. En la web, la clave `alevin`; nombres «Alevín» / «alevín» / «alev.» (`CAT_NAMES`, `CAT_WORDS`, `CAT_SHORT`), al final de `CATEGORIES`.
2. **Códigos de grupo de alevín:** únicos en la temporada, alfanuméricos y con prefijo `AL`:

   | Competición | Código | Fase |
   |---|---|---|
   | Fase Previa / Primera Fase | `AL1`…`ALn` | `Primera Fase GC` |
   | Segunda Fase X (letras A-Z; «FASE LIGA X» o «SEGUNDA FASE X») | `ALX1`…`ALXn` | `Segunda Fase X` |
   | Preferente F-8 (temporadas antiguas) | `ALP1`… | `Preferente GC` |
   | Primera F-8 antigua | `AL1`… | `Primera Fase GC` |
   | Copa de Campeones | `ALCC1`… (2024-25, una por fase: `ALCCA1`…`ALCCE1`) | `Copa de Campeones` (`Copa de Campeones A`…) |
   | Clausura | `ALCL1` | `Clausura Alevín` |
   | Eliminatorias | `ALEL1`… | `Eliminatorias` |

   Benjamín y prebenjamín: las eliminatorias son `EL1`… y `PEL1`…, con la fase `Eliminatorias`; la Segunda Fase de benjamín admite cualquier letra (`A1`…, `F1`…). Las finales y semifinales de alevín no tienen convenio (`ALF` es la Segunda Fase F): no se crean.
3. **Eliminatorias** (de cualquier categoría): fase que empieza por `Eliminatorias`. La web las trata como copa (pantalla Copa, `isCupGroup`), y `generate_js` nunca recalcula su clasificación como una liga.
4. **`data-alevin.js`** (temporada en curso): se genera **siempre**, aunque esté vacío; **no** va en `index.html` ni en `STATIC_ASSETS` de `sw.js` (se carga de forma perezosa). Lleva exactamente estas constantes, en este orden:

   ```js
   const ALEVIN=[…];        // misma forma que BENJAMIN
   const ALEV_STATS={groups,teams};
   const HISTORY_ALEV={…};  // misma forma que HISTORY, solo códigos alevín
   const GOL_ALEV=[…];      // misma forma que GOL_BENJ
   const ESTADOS_ALEV={…};  // misma forma que ESTADOS, solo códigos alevín
   const EQUIPOS_ALEV={…};  // misma forma que EQUIPOS, equipos que juegan en alevín esta temporada
   ```

   `data-history.js` (carga inicial) lleva **solo benjamín y prebenjamín** en `HISTORY`, `HIST_MATCHES`, `ESTADOS` y `EQUIPOS` (sin los equipos que solo juegan en alevín). `CAMPOS` sigue siendo de toda la temporada.
5. **Temporadas pasadas:** el alevín nunca va dentro de `data-season-<S>.js`, sino en `data-season-<S>-alevin.js` (perezoso, fuera de `SEASON_FILES` del SW):

   ```js
   const SEASON_<S con _>_ALEVIN={name, alevin:[…], gol:{alevin:[…]}, equipos?, campos?};
   ```

   `alevin` tiene el formato de la clave `benjamin` de `data-season-<S>.js`. El fichero solo existe si la temporada tiene grupos alevín (`generate_js` borra el de una que ya no tiene); la web trata su 404 como «sin alevín».
6. **Actas:** `data-lineups-<S>-<código>.js`, como siempre (los códigos `AL…` no chocan con ninguno).

## Quién decide la categoría

Un solo sitio: `scripts/categorias.py`, `category_of(nombre)` → `'ALEVIN' | 'PREBENJAMIN' | 'BENJAMIN' | None`. Lee el nombre del catálogo, el de la cabecera de un acta («… (GRUPO 7)») y el de una liga de la app. Lo usan todos los que eligen o casan por categoría:

- descargadores: `fetch_fiflp_islas.comps_from_catalog`, `fetch_fiflp_actas.catalog_comps`/`discover_comps`, `fetch_fiflp_goleadores`, `fetch_fiflp_detalle.benjamin_comps`, `discover_temporada.app_ligas`;
- importadores: `acta_reconciler.reconcile_acta`, `import_fiflp_goleadores` (`_category`, `match_group`: también lo usan el detalle, los grupos y los escudos), `import_fp_app.match_liga`, `import_fiflp_detalle.create_cup_group`, `import_fiflp_grupos.meta_by_name`, `fiflp_manifest.comp_meta`.

**Protecciones contra mezclar categorías** (los clubes son los mismos en las tres; ver `scripts/tests/test_alevin_aislamiento.py`):

- un acta solo se casa con partidos de la categoría de su competición; una de sala o de alevín de otra isla, con ninguno;
- una liga de la app solo con grupos de su categoría (en 2026-27, 10 de las 32 ligas alevín casaban con un grupo FF);
- goleadores, clasificaciones, detalle y escudos de un grupo de la federación, nunca en un grupo de otra categoría (ni por sus actas ni por `fiflp_groups`);
- la purga de `cod_acta` huérfanos (`import_fiflp_actas`) solo en temporadas cerradas y en las categorías que trae el raw: un raw con solo actas alevín no deja sin acta a los partidos de benjamín. Y nunca las actas que leyó el bot por el código de la jornada (`cod_acta = fiflp_acta`, desde 2026-27): no vienen de ningún raw;
- `import_fiflp_grupos` no crea grupos de la temporada en curso: solo los da de alta `activate_season`, con la URL de la federación que actualiza el bot.

## Activar alevín de Gran Canaria 2026-27

Sin ningún workflow en marcha (`gh run list --limit 5`) antes de empujar nada: `futbolbase.db` es binario y un conflicto obliga a repetirlo todo. Mejor con la rama de la web ya en `main` (si no, los datos se publican pero la web no los enseña).

```bash
# 1. (opcional) Catálogo al día: ¿hay ya Segunda Fase o eliminatorias de alevín?
gh workflow run discover-fiflp.yml
# 2. Grupos, clasificaciones y calendarios de la Fase Previa alevín de Gran Canaria (54976940)
gh workflow run fetch-fiflp-islas.yml -f temporada=22al      # → scripts/fiflp_islas_22al_raw.json
gh run watch                                                 # ~20-25 min; después:
git pull
# 3. Manifiesto: AL1…AL32, cat alevin, «Primera Fase GC»
python3 scripts/fiflp_manifest.py scripts/fiflp_islas_22al_raw.json 2026-2027 --comps 54976940 > docs/temporadas/2026-2027-alevin.json
# 4. Verificar y añadir a la temporada en curso (crea la categoría ALEVIN si falta)
python3 scripts/activate_season.py docs/temporadas/2026-2027-alevin.json --fiflp-raw scripts/fiflp_islas_22al_raw.json --add
python3 scripts/activate_season.py docs/temporadas/2026-2027-alevin.json --fiflp-raw scripts/fiflp_islas_22al_raw.json --add --apply
# 5. Pruebas y publicación (sin workflows en marcha)
python3 -m pytest scripts/tests/ -q && node --test scripts/tests/test_*.mjs
git add docs/temporadas/2026-2027-alevin.json futbolbase.db data-*.js index.html sw.js
git commit -m "Alevín de Gran Canaria 2026-27: Fase Previa" && git push
```

Lo que pasa después, solo:

- `activate_season` guarda el código del acta de cada partido si el raw lo trae (`fiflp_acta`) y marca los grupos nuevos en `fiflp_full_pending`: en su **primera pasada** el bot lee **todas** sus jornadas ya jugadas (no solo las de las últimas tres semanas) y así tiene el código de las actas de la jornada 1. Al quitar la marca deja el fichero `FIFLP_DB_MARK` (en `runner.temp`) y `update.yml` sube la base aunque no cambie nada publicado; si no, la pasada siguiente repetiría la lectura completa. Las actas se leen después, al ritmo del bot.
- El bot (`update_fiflp.run_passes`) hace primero benjamín y prebenjamín, con sus actas y goleadores, y después un **turno de alevín**: `ALEVIN_PER_RUN` (8) grupos, hasta `ALEVIN_STOP_SECONDS` (31 min); los demás conservan su última entrada en `data-health.json`. El turno lo elige el número de la ejecución de `update.yml` (`GITHUB_RUN_NUMBER`, `run_number`), no la base: cada ejecución toma el siguiente, haga commit o no (update.yml solo sube `futbolbase.db` si cambia algo publicado). Con los 32 grupos de la Fase Previa, cuatro turnos: cada grupo se lee una vez cada cuatro ejecuciones (las cuatro del cron, más las que lanzan las tandas de la federación). Un grupo que el tope de 31 min deja sin leer espera a la vuelta siguiente. Si no basta, `FIFLP_CATS` (`benjamin,prebenjamin` / `alevin`) permite repartir las categorías en dos workflows con la misma `concurrency: update-data`.
- Para traer de una vez las actas antiguas de alevín, en lugar de esperar al bot: `gh workflow run actas-federacion.yml -f temporada=22 -f categorias=alevin -f tandas=3` (el raw de 2026-27 no borra las actas que ha leído el bot, ni ahora ni cuando la temporada se archive: la purga de huérfanas no toca las de `cod_acta = fiflp_acta`).

Cuando la federación publique la Segunda Fase alevín (o sus eliminatorias), lo mismo con sus ids: `gh workflow run discover-fiflp.yml` (la tanda `22al` toma las competiciones alevín del catálogo), `gh workflow run fetch-fiflp-islas.yml -f temporada=22al -f ids=<ids>` (se añaden al mismo raw), `fiflp_manifest … --comps <ids>` (códigos `ALA1`…, `ALEL1`…), `activate_season … --add` y `--add --apply`.

## Benjamín de Fuerteventura 2026-27 (1.ª Fase, 54977017)

Apareció en el catálogo después del raw del 3/10. Se baja sola y se añade al raw de la tanda `22`:

```bash
gh workflow run fetch-fiflp-islas.yml -f temporada=22 -f ids=54977017   # → scripts/fiflp_islas_22_raw.json
gh run watch && git pull
python3 scripts/fiflp_manifest.py scripts/fiflp_islas_22_raw.json 2026-2027 --comps 54977017 > docs/temporadas/2026-2027-fv.json
python3 scripts/activate_season.py docs/temporadas/2026-2027-fv.json --fiflp-raw scripts/fiflp_islas_22_raw.json --add
python3 scripts/activate_season.py docs/temporadas/2026-2027-fv.json --fiflp-raw scripts/fiflp_islas_22_raw.json --add --apply
```

Códigos `FV11`…, fase «Fuerteventura Fase 1». Sus actas de antes, como las de alevín: primera pasada completa del bot o `gh workflow run actas-federacion.yml -f temporada=22 -f comps=54977017`.

## La app de futbolaspalmas

La app publica alevín (ligas 77-109 y 120, «Alevin eliminatorias»), pero `fetch_fp_app.py` solo lo baja con `FP_APP_CATS=benjamin,prebenjamin,alevin` en el entorno del bot (`update.yml`). Es una decisión del dueño de la web, no técnica: la app trae el **nombre de pila** de goleadores que la federación no publica, y `_fp_goal_entries` (`generate_js.py`) los completa en la cronología. Con la categoría activada, `match_liga` ya solo casa cada liga alevín con su grupo alevín.

## Histórico (2016-17 a 2025-26)

Los workflows de la federación llevan la entrada `categorias` (por defecto `benjamin,prebenjamin`), que pasa a las tandas encadenadas y, en las actas, a la cola de temporadas:

```bash
gh workflow run goleadores-federacion.yml -f temporadas=12,13,14,15,16,17,18,19,20,21 -f categorias=alevin
gh workflow run detalle-federacion.yml -f temporadas=12,13,14,15,16,17,18,19,20,21 -f jornadas=12,13,14,15,16,17,18,19,20,21 -f categorias=alevin
gh workflow run actas-federacion.yml -f temporada=21 -f cola=20,19,18,17,16,15 -f categorias=alevin
```

El bot los importa solo (`import_past_seasons`): los grupos alevín se crean con los códigos de arriba (`meta_by_name` también fuera de las temporadas archivadas) y su calendario es el de la federación en todas las temporadas pasadas (no hay portal). Después, `python3 scripts/score_deviation.py --write-baseline` y los escudos (`escudos_federacion.py`, `check_missing_shields.py`, que ya leen alevín).

**Antes de las actas históricas, el tamaño.** La base ocupa 71 MB; con unas 13.600 actas alevín pasaría de los 100 MB, el límite duro de GitHub por fichero, y el bot dejaría de poder empujar. Hay que partir la base (o no guardar las alineaciones de alevín) antes de lanzar `actas-federacion.yml` con `categorias=alevin` para temporadas pasadas. Goleadores y detalle añaden poco.
