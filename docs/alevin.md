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

   Benjamín y prebenjamín: las eliminatorias de Gran Canaria son `EL1`… y `PEL1`…, con la fase `Eliminatorias` (las de Lanzarote y Fuerteventura no tienen convenio: tendrían el mismo código, así que `fiflp_manifest` aborta y `meta_by_name` no les da ninguno); la Segunda Fase de benjamín admite cualquier letra (`A1`…, `F1`…). Las finales y semifinales de alevín no tienen convenio (`ALF` es la Segunda Fase F): no se crean.
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

**Nombres de equipo** (`teams.name` es único y lo comparten las tres categorías: un mal casamiento mezcla dos clubes en la misma ficha; ver `scripts/tests/test_nombres_alevin.py`). `activate_season.known_names`:

- las fichas de la federación (`team_seasons`) de la temporada en curso mandan sobre `fiflp_team_names.json` y sobre el emparejamiento (`raw_team_names`): con `--add`, las de la misma temporada; al activar la siguiente, las de la que se cierra. El club que juega en ella con el mismo nombre de la federación es esa fila: `VICTORIA, REAL CLUB "A"` es `RC Victoria`, como en benjamín, no `Victoria` (la fila de 2014-25 a la que lo lleva la tabla), y `ATCO MARZASPORT, C.D.` es `Atl. Marzasport`;
- cada nombre de la base, de un solo club (el de la ficha, el de `fiflp_team_names.json` o el que se lo llevó en una pasada anterior): `FUNDACION GUINIGUADA` no es `Guiniguada` (GUINIGUADA APOLINARIO), ni `FUNDACION CANARIA U.D. LAS PALMAS` es `Las Palmas`. `Fundación UD Las Palmas` y `Las Palmas` tienen la misma clave para el emparejamiento por palabras (PALMAS): `PALMAS, U.D. LAS` está fijado en `Las Palmas` en la tabla. Filas aparte no es clubes aparte en la web, que une los clubes por el escudo: `Fundación Guini.` es otro club de la federación, con su propio equipo A (AL15, y el de Guiniguada en AL8), pero de la familia de Guiniguada (Lomo Apolinario, y futbolaspalmas.com le ponía su escudo, el de `data-shields.js`): la web lo trata como un club con dos equipos. `Fundación UD Las Palmas` y `Naturaleza Verde-Valleseco`, sin escudo, son clubes aparte hasta que tengan el suyo (`escudos_federacion.py`, con su ficha);
- un filial va con su club: el de su familia si la base lo tiene (`Las Mesas Hu.` → `Las Mesas Hu. B`) y nunca el filial de otro club que comparta una palabra (`Huracán B` y `AD Huracán C` son de AD Huracán). El que ya tiene su fila (ficha, tabla o emparejamiento) se queda con ella: `ATALAYA, U.D. "B"` es `Atalaya B`, no «primer equipo + letra» (`UD Atalaya B`, que no existe); eso, solo para el filial de un club nuevo. Y `C. F.` con espacio o `C.D` sin el último punto son la abreviatura, no la letra del filial (`SIMUSETTI C. F.`, `TEGUINTE, C.D`);
- los candidatos de otra isla no compiten (Puerto del Carmen dejaba a `PUERTOS DE L.P.` sin `Puertos LP`);
- y `activate_season` aborta si dos equipos distintos acabarían con el mismo nombre en grupos distintos (`name_clashes`).

Lo que la activación de la Fase Previa dejó mal en la base lo corrige el bot en cada pasada, antes de leer la federación: `scripts/migrate_team_names.py` (`TEAM_FIXES`, solo en esos grupos alevín de 2026-27; en una base corregida no hace nada). La ficha de 2026-27 que el bot escribió en la fila vieja (si leyó el directorio del grupo antes) va con el equipo que se mueve cuando la fila vieja ya no juega en ningún grupo de la temporada, aunque siga en otras (`UD Valleseco`, `Victoria`). Y el bot casa sus nombres con los de la clasificación **y el calendario** del grupo (un retirado ya no abre un equipo con la grafía de la federación ni repite sus partidos) y con `fiflp_team_names.json` (`FUNDACION GUINIGUADA` es `Fundación Guini.`).

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

- `activate_season` guarda el código del acta de cada partido si el raw lo trae (`fiflp_acta`) y marca los grupos nuevos en `fiflp_full_pending`: en su **primera pasada** el bot lee **todas** sus jornadas ya jugadas (no solo las de los últimos 10 días, `BACK_DAYS`) y así tiene el código de las actas de la jornada 1. Al quitar la marca deja el fichero `FIFLP_DB_MARK` (en `runner.temp`) y `update.yml` sube la base aunque no cambie nada publicado; si no, la pasada siguiente repetiría la lectura completa. Las actas se leen justo después de su calendario (cada grupo, completo), hasta el cupo de la pasada; las que no caben, en las pasadas siguientes (las nuevas, las primeras tras los prioritarios).
- El bot (`update_fiflp.run_passes`, [federacion.md](federacion.md)) hace desde el 16/10/2026 pasadas **cortas cada 2 h** (16 min de plazo; una espera del freno de la federación y, en el segundo, nada más: ~30 páginas por pasada), cada grupo **completo** antes del siguiente (su calendario, sus goleadores si tocan y sus actas pendientes), con una rotación **sin estado**: los grupos prioritarios (los cuatro alevín de Las Mesas Huracán, entre ellos) **cuando toca** (en su pasada, una de cada tres, o si pasarían de 6 h sin leerse, o con un partido suyo recién jugado sin resultado o sin acta); después el turno de cada nivel (cada nivel tiene cuatro turnos fijos de un cuarto de sus grupos), con la **cuota de alevín** (`FIFLP_ALEVIN_MIN`, 8 por defecto y nunca menos que su turno) intercalada con el turno de prebenjamín y el de benjamín, cada nivel con la fase de su turno en esa pasada (hasta el 15/10/2026 la cuota iba delante de ellos: con el cupo de la federación, ~15 páginas por IP, se llevaba todos los grupos no prioritarios de la pasada y benjamín y prebenjamín no se leían; con la fase 0, el primero de cada nivel iba siempre delante y prebenjamín se leía cada 12 h); después el turno siguiente de cada nivel; y con lo que quede, el resto, intercalados. El turno lo elige el número de la ejecución de `update.yml` (`GITHUB_RUN_NUMBER`, `run_number`: el turno `número % 4`), no nada guardado en la base ni en `data-health.json`, que `update.yml` solo sube si cambia algo publicado: cada ejecución lee primero otro turno, haga commit o no, y dentro del turno empieza en cada época (4 pasadas) por otro sitio. Con el cupo, cada pasada lee los prioritarios que tocan y ~2 grupos más, y la información completa de un grupo alevín no prioritario llega a tener ~4 días de mediana ([federacion.md](federacion.md), «Lo que da una pasada»). Los que no se leen conservan su última entrada en `data-health.json`. Si un día no basta, `FIFLP_CATS` (`benjamin,prebenjamin` / `alevin`) permite repartir las categorías en dos workflows con la misma `concurrency: update-data`: el de solo alevín lee todos los grupos alevín que quepan en su plazo, empezando cada vez por otro turno, y cada workflow deja en `data-health.json` la última entrada de los grupos de las categorías que no lee.
- Para traer de una vez las actas antiguas de alevín, en lugar de esperar al bot: `gh workflow run actas-federacion.yml -f temporada=22 -f categorias=alevin -f tandas=3` (van a `scripts/fiflp_actas_2026-2027_alevin_raw.json`, aparte: ver «Las actas de alevín, en su propio raw»; el raw no borra las actas que ha leído el bot, ni ahora ni cuando la temporada se archive: la purga de huérfanas no toca las de `cod_acta = fiflp_acta`).

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

### Las actas de alevín, en su propio raw

Las actas de alevín **nunca** van al raw de benjamín y prebenjamín: van a `scripts/fiflp_actas_<S>_alevin_raw.json`, con su índice (`_alevin_index.json`) y su estado (`_alevin_status.json`). El raw de siempre ya pesa unos 20 MB por temporada y con el histórico alevín dentro rondaría los 35-45 MB, al lado del aviso de GitHub (50 MB por fichero). Lo decide `scripts/actas_lotes.py` (el lote de cada competición y de cada acta, por su categoría) y está contado en [federacion.md](federacion.md#las-actas-de-alevín-en-su-propio-raw):

- Una tanda (y una cadena de `actas-federacion.yml`) es de **un solo lote** y solo escribe y sube los ficheros de ese lote: `-f categorias=alevin` (también «alevín») o `-f categorias=benjamin,prebenjamin`, nunca mezcladas (la tanda para sin escribir nada; tampoco con `--comps` del otro lote). Cada temporada tiene una cadena de alevín y otra de benjamín y prebenjamín, que corren a la vez sin tocar los ficheros de la otra. `fetch_fiflp_actas.py` guarda cada acta en el raw de la tanda, también con varios navegadores (`--workers`), en las tandas encadenadas (cada lote con su índice y su estado) y al refrescar (`--refrescar`). Un acta cuya cabecera dice el otro lote se queda en el raw de la tanda con un aviso.
- Las actas de alevín que una tanda de antes de este cambio dejó en el raw de siempre (p. ej. lanzando `-f categorias=alevin` con el código anterior) pasan solas a su raw: la cadena de alevín las **adopta** (las copia sin volver a leerlas) y la de benjamín y prebenjamín las **suelta**. Entretanto están en los dos y la base no cambia. Las cuenta `actas_lotes.misplaced`, y la prueba del repositorio solo avisa: nunca para al bot.
- El bot importa los dos raws (`import_changed_raws`: su huella por fichero, el de siempre primero) y la purga de huérfanas de uno no toca las actas del otro. Grupos, goleadores, detalle y escudos leen los dos índices y raws juntos.
- Goleadores y detalle no se parten: pesan entre 0,1 y 1,3 MB por temporada y alevín los deja en torno a 1 MB y 4-5 MB.

**Antes de las actas históricas, el tamaño.** GitHub no admite ficheros de más de 100 MB: si la base pasara de ahí, el bot dejaría de poder empujar. Con el esquema compacto (`migrate_compactar.py`, en [SP-1-actas.md](SP-1-actas.md), «Las tablas de las actas en la base») la base pasó de 71,2 a 37,6 MB el 14/10/2026. Lo de las actas (alineaciones, sucesos, cuerpo técnico y jugadores, con sus índices) ocupa unos 30 MB para 17.725 actas, unos 1,7 KB por acta. Con unas 13.600 actas alevín, la base quedaría en unos 61 MB, o en unos 68 MB si cada acta alevín pesa un 30 % más (más jugadores por equipo). Desde ahí, cada temporada con alevín añade unas 5.000 actas, unos 9-10 MB, así que el límite queda a tres o cuatro temporadas. Conviene lanzar primero una temporada sola (`-f temporada=21`, sin `cola`), medir la base cuando el bot la importe y, si crece lo previsto, lanzar el resto. Goleadores y detalle añaden poco.
