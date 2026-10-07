# Datos de la federación (FIFLP)

Desde 2026/27 la temporada, las actas, los goleadores, los directorios de equipos y de campos y el detalle de las clasificaciones salen de la web de la Real Federación Interinsular de Fútbol de Las Palmas (www.fiflp.com, plataforma NFG). futbolaspalmas.com se nutre de ella, y en octubre de 2026 no publicaba benjamín ni prebenjamín (ver [temporada-nueva.md](temporada-nueva.md)).

FIFLP contesta vacío a las IPs domésticas: todo lo que lee la federación corre en GitHub Actions. Lo que se escribe en la base se prueba en local con fixtures reales (`scripts/tests/fixtures/acta_*`, `goleadores_2526_A2.html`, `campos_fiflp_p1.html`).

## Páginas públicas que se usan

| Página | Para qué |
|---|---|
| `NFG_CmpJornada?…&CodCompeticion=C&CodGrupo=G&CodJornada=N` | Partidos de una jornada (fecha, hora, campo, marcador) y el `CodActa` de cada uno. Siempre por URL: `BuscarPartidos()` navega leyendo un formulario **oculto** que el aplanado quita. |
| `NFG_VisClasificacion?…&codjornada=99` | Clasificación oficial (no está ofuscada: es la referencia de los goles). |
| `NFG_CmpPartido?cod_primaria=1000120&CodActa=N` | Acta: alineaciones (dorsal, titular/suplente, id del jugador), cada gol con marcador parcial, minuto y tipo, árbitro, entrenadores, delegados de campo y de equipo, estadio. |
| `NFG_CMP_Goleadores?…&codgrupo=G&CodJornada=` | Goleadores del grupo: jugador, equipo, partidos y goles (`38 (1 P)` = 1 de penalti). |
| `NFG_LstCampos?cod_primaria=1000122&NPcd_Page=N&NPcd_PageLines=100` | Directorio de campos: dirección, localidad, superficie, tipo. |
| `NFG_LstDirectorioEquipos?cod_primaria=1000117&search=1&Buscar=1&Sch_Cod_Temporada=S&Sch_Codigo_Delegacion=&Sch_Tipo_Juego=&Sch_CodCompeticion=C&Sch_CodGrupo=G` | Directorio de equipos de un grupo (por GET, desde 2015-16): código de cada equipo, escudo, colores de la equipación y su campo (código, nombre y superficie). También trae el contacto del club (persona, dirección y teléfono), que **no se lee**: son datos personales y la base y los raws van a un repositorio público. |
| `NFG_VisCampos?cod_primaria=1000122&Codigo_Campo=N` | Ficha de un campo: coordenadas (`q=loc:LAT+LON` en `VerMapa()`), dirección, código postal, superficie, instalaciones (vallado, sala antidopaje, despacho arbitral, internet) y equipos que juegan o entrenan allí. |

`probe-fiflp.yml` vuelca cualquier página como artefacto (`gh run download <id> -n probe-fiflp`) y `debug-fiflp-copa.yml -f scores=1` imprime en el log los estilos de cada dígito de un marcador.

## La ofuscación y el aplanado

Marcadores, marcadores parciales y minutos llevan varias capas: texto visible, dígitos pintados por CSS (glifos `.fa-N::before` de FontAwesome y reglas `<style>#idh…:before{content:"\0032"}</style>`), señuelos ocultos (`display:none`, también en pseudo-elementos) y el 4.º argumento de `ntype()`. Varía por partido y por carga. `scripts/fiflp_render.py` (`FLATTEN_JS`) deja la página como se ve: materializa el contenido de los `::before`/`::after` visibles y quita todo lo que no se ve. Después, `scripts/fiflp_acta.py` lee el acta como texto y marca `consistent` si los marcadores parciales suben de uno en uno hasta el resultado. Aun así, alguna lectura de jornada cuela una cifra de más o de menos: por eso manda el acta coherente, y `reconcile_with_table` corrige con la clasificación oficial los marcadores que no tienen acta.

## Privacidad de los menores

La federación no publica el nombre de algunos niños (en 2025/26, por ejemplo, ninguno de Las Mesas Huracán ni de AD Huracán): en goleadores la celda va vacía, y en el acta el niño falta o sale solo con el nombre de pila. No hay otra fuente oficial. Esos goleadores van en la lista con la clave `#<grupo>-<n>` (el frontend dice «Sin nombre publicado») para que el puesto y el máximo goleador de cada equipo sean los reales; sus goles en el acta cuentan para el marcador y salen sin nombre en la cronología.

## El bot (cada 6 h)

`fetch_futbolaspalmas.py` salta los grupos con URL de la federación y, con `FIFLP_UPDATE=1` (lo pone `update.yml`, que instala Playwright), llama a `update_fiflp.update_groups` → `run_passes`:

1. Clasificación y jornadas recientes, próximas, pendientes o nuevas de cada grupo.
2. Con el plazo que quede (25 min): directorio de campos (si falta alguno de la temporada), actas de los partidos jugados (`matches.fiflp_acta` → `cod_acta` al importarla; hasta 60 por pasada; 4 intentos por acta; se relee si la jornada contradice el marcador sin ser una cifra de más) y goleadores de cada grupo con algo jugado.

Actas publicadas: un fichero por grupo, `data-lineups-<S>-<grupo>.js` (`const LINEUPS_<S>_<grupo>`), que la ficha de Equipo y Partido piden con `ensureLineups(temporada, grupo)` (un 404 es «sin actas»). Una temporada entera con todas sus actas pesa ~10 MB; un grupo, unos cientos de KB (comprimidos, decenas). El service worker no las precachea: guarda las que se usan y cada versión nueva vuelve a bajar las de los grupos ya vistos (`lineupsToCarry`, como mucho 12), para que la plantilla de mi equipo siga sin conexión tras una subida de datos.

Jugadores: `players.fiflp_id` es el id de la federación (el mismo niño de prebenjamín a benjamín). Un gol en propia puerta no suma al jugador y en las alineaciones publicadas va del lado al que suma.

## Rellenar temporadas pasadas

`actas-federacion.yml` descarga, en tandas encadenadas que se relanzan solas, las actas de todas las competiciones de benjamín y prebenjamín de una temporada (y sigue con las de la cola), y solo comitea el raw (`scripts/fiflp_actas_<S>_raw.json`). El bot las importa en su pasada siguiente (`import_changed_raws`: los raws cuyo sha1 no está en la tabla `raw_imports`), solo las leídas aplanadas (traen `consistent`); las de antes de octubre de 2026 se quedan como estén hasta que una tanda las vuelve a descargar.

```bash
gh workflow run actas-federacion.yml -f temporada=20 -f cola=19,18,17,21 -f tandas=40
```

```bash
# Actas de una competición entera o de unos grupos (resumible; importa, genera y publica)
gh workflow run fetch-fiflp-actas.yml -f temporada=21 -f comps=54422888 -f do_import=true
gh workflow run fetch-fiflp-actas.yml -f temporada=21 -f comps=54422885,54422953 \
   -f "grupos=54422885:GRUPO 5,54422885:GRUPO 13,54422953:GRUPO 2" -f do_import=true
```

Goleadores de temporadas pasadas: `goleadores-federacion.yml` (`fetch_fiflp_goleadores.py`) guarda la clasificación oficial y los goleadores de cada grupo del catálogo en `scripts/fiflp_goleadores_<S>_raw.json` (reanudable). El bot los importa (`import_fiflp_goleadores.py`): cada grupo de la federación casa con uno de la base por sus actas importadas (índice de actas) o por sus equipos (dos tercios de los de los dos lados, sin empate), y solo se escriben en grupos sin goleadores o que ya rellenó él (`fiflp_scorer_groups`); los de futbolaspalmas se quedan.

```bash
gh workflow run goleadores-federacion.yml -f temporadas=17,18,19,20,21
```

Grupos que la base no tiene (`import_fiflp_grupos.py`, también en el bot): un grupo del raw de goleadores que no casa con ninguno de la base se crea con el código de sus grupos hermanos (o de `COMP_META`/`EXTRA_META`: finales, semifinales y torneos de cierre o clausura, que la web trata como copas con su nombre), su clasificación oficial y sus partidos desde las cabeceras de sus actas aplanadas. Si el código ya es de otro grupo, se salta. Quedan en `fiflp_groups` y se rehacen cuando cambian sus fuentes.

Las actas de temporadas pasadas se emparejan con su partido por nombres, fecha y marcador (`acta_reconciler.py`); las que no casan quedan en `scripts/fiflp_actas_unmatched.json`. Una competición completa de benjamín son ~2.500 actas: mejor por grupos, para no cargar la web de la federación.

## El detalle (desde octubre de 2026)

Lo que no traen las actas ni los goleadores, de todas las temporadas (2016-17 a 2026-27), con `detalle-federacion.yml` (`fetch_fiflp_detalle.py`, tandas que se relanzan solas) en `scripts/fiflp_detalle_<S>_raw.json` y `scripts/fiflp_campos_raw.json`. Los lectores son puros (`fiflp_detalle.py`, probados con `scripts/tests/fixtures/detalle/`). El bot los importa (`import_fiflp_detalle.py`), casando cada grupo como los goleadores (URL, grupo creado, actas o equipos) y cada equipo con `team_bridge`:

- `standings_detail`: casa y fuera, últimos resultados, puntos de sanción y código del equipo, de la clasificación. El bot lo pone al día en cada pasada para la temporada en curso (`update_fiflp.add_detail`).
- `team_seasons`: equipación (camiseta, pantalón, medias), campo y escudo de cada equipo por temporada. Los equipos nuevos de la temporada en curso (una fase nueva) los completa el bot (`update_directorio`).
- `venue_details`: la ficha de cada campo, con sus coordenadas.
- El calendario completo de las temporadas sin actas (2016-17 a 2018-19) entra en los grupos sin partidos solo si la temporada está en `CALENDAR_SEASONS`, tras revisarlo en local y poner al día la línea base de `score_deviation.py`.

```bash
gh workflow run detalle-federacion.yml -f temporadas=22,21,20,19,18,17,16,15,14,13,12 -f jornadas=12,13,14
```

Actas: además de lo de siempre, el lector guarda todo el cuerpo técnico (`staff.all_home`/`all_away`: «2ºEntrenador», «ENTRENADOR EN PRACTICAS»…) y el código del campo (`header.venue_code`), en `match_staff_all` y `matches.venue_code`; el acta completa el campo y la hora del partido si el calendario no los traía. Un gol del descuento llega como «(60'+1) PEREZ, ANA»: `clean_scorer` quita la marca y `scorer_minute` da 61. Las actas leídas antes se pueden volver a leer sin perder nada (`actas-federacion.yml -f refrescar=true`: la relectura solo sustituye si es igual de buena).

## La app de futbolaspalmas (desde 2026/27)

`fetch_fp_app.py` (en el bot, tras la federación; futbolaspalmas sí contesta desde casa) lee la API de `directo.php`: `get_full_calendar&liga_id=N`, `get_live_data&liga_id=N` (tabla con la equipación de cada equipo, sanciones y qué significa cada puesto) y `get_live_data&liga_id=HOY&fecha_ver=AAAA-MM-DD` (todos los partidos de un día: estado, goleadores con minuto y nombre de pila, hora real, árbitros, técnicos y mapa). `import_fp_app.py` lo guarda en `fp_ligas`, `fp_teams`, `fp_matches` y `fp_goals`, y en las tablas de siempre solo completa: el resultado de un partido finalizado que no lo tiene y la hora que falte; nunca cambia un marcador. Los goles de la app ponen nombre en la cronología a los niños que la federación no publica.

## Torneos

La Maspalomas Cup (no es de la federación) se guarda entera en `tournaments`, `tournament_matches` y `tournament_standings` (`import_torneos.py`, también alevín), además de su `data-maspalomas-cup-<año>.js`.

## Temporadas archivadas (2016-17 a 2020-21)

Las temporadas anteriores a la web (CodTemporada 12 a 16, `ARCHIVE_SEASONS` en `import_fiflp_grupos.py`; la lista es cerrada) entran solas con el bot, sin filas de `seasons` a mano:

- **Alta perezosa.** `import_season` da de alta la temporada (`is_current` 0) junto con su primer grupo, y solo cuando ha terminado la descarga de sus actas (`actas_complete`: raw, índice y `_status.json` con `pending` 0, o una última tanda que no trajo ninguna sin dejar competiciones por enumerar; la regla de `actas-federacion.yml` para pasar a la temporada siguiente). Hasta entonces el bot dice «esperando a que acabe la descarga de sus actas». Si al final no crea ningún grupo, borra la fila. Así nunca hay una temporada vacía (pondría en rojo `test_seasons_have_groups`) ni una que entre mientras se descargan sus actas. Lo que sí puede haber son tablas sin partidos: la federación no publicó las actas de 2018-19 (ninguna) ni las de 2017-18 (cinco, sin aplanar), ni las de Fuerteventura y del prebenjamín de 2020-21, y esa última tanda vacía también cumple `actas_complete`. Esos grupos entran con su clasificación oficial y sin partidos, y la web lo dice: Récords, en una temporada cerrada, «La fuente no publicó los partidos de liga…» con el ataque y la defensa de las tablas (no «aún no se ha jugado»), y una copa con la tabla jugada y sin partidos (la Copa Fuerteventura de 2017-18 y 2018-19, la Copa Gran Canaria prebenjamín) es una liguilla (`groupKind`), con su tabla, y no un cuadro vacío.
- **Huellas.** Ninguna de las tres `import_changed_*` graba la huella de una temporada que no está en `seasons`, y una archivada que falta se evalúa siempre, sin mirar su huella (las viejas `grupos:2017-2018`… no bloquean). La huella de grupos lleva el nombre de los ficheros, no su ruta, y `IMPORT_VERSION`; la de goleadores, la de `grupos:<S>` (un grupo rehecho que cambia el nombre de un equipo reimporta sus goleadores).
- **Código, fase e isla.** Todos sus grupos son de la federación (`fiflp_groups`). Si no hay hermanos ni entrada en `EXTRA_META`/`COMP_META`, salen del nombre de la competición (`meta_by_name`), solo en las archivadas: BPGC «Preferente GC», GC «Primera Fase GC», LZP, LZ1, FV1 «Fuerteventura», CFV, FVS «Superliga Fuerteventura» (en la web, una fase de nivel 2), BC/PCC «Copa de Campeones», PGC, PCGC «Copa Gran Canaria» (la copa prebenjamín de 2018-19) y las finales y semifinales de su competición base con F o S detrás (LZ1F, CFVF y LZ1S, con la fase en singular, «Semifinal Liga Primera Lanzarote», aunque la competición se llame «SEMIFINALES…»: la web solo conoce esa forma).
- **Actas.** Las de los grupos de `fiflp_groups` las importa solo `import_fiflp_grupos`, por su `cod_acta`; `import_changed_raws` las cuenta aparte («de grupos creados desde la federación») y ninguna otra acta cae en sus partidos. Su raw se salta mientras la temporada no está en la base.
- **Nombres.** Los formatos de 2017-2021 ('ARUCAS D CF "DB"', 'GUIAA, U.D. "A"', 'CARRIZAL,CFU', 'PUERTOS DE L.P. A' y, en las cabeceras de las actas, 'CORAZON DE MARIA "D", C.D. DB' o 'VETERANOS DEL PILA."A", C.D. A') pasan antes por `fiflp_names.modern_fed_name`, solo en las archivadas. Una archivada prefiere los nombres de 2021 en adelante a los que haya inventado otra archivada, y una de 2021 en adelante nunca mira las archivadas. Lo que no acierta `known_names` va a `ARCHIVE_NAMES` (nombre ya modernizado → nombre de la base), tras revisar la lista de equipos nuevos de una importación de prueba sobre una copia: clubes distintos que compartían palabras (Siete Palmas y UD Las Palmas, Apolinario y Guiniguada, Polígono de Arinaga y CD Arinaga, Gran Tarajal y UD Tarajalejo), el primer equipo y el «Atlético» del mismo club (team_key no los distingue), el mismo club con otro nombre (Cruz de Barrial es UD Barrial; U.D. Las Mesas Bachicao, Las Mesas Hu., y su B, que la federación llama igual en 2018-19 y en 2021-24, Las Mesas B) y algunas tildes. Ojo con la regla de `known_names` «si el primer equipo es nuevo, su filial también»: un primer equipo con otro patrocinador arrastra a su B, aunque el nombre del B ya esté en la base.
- **Goleadores.** La federación no publicó los de 2017-18 ni 2018-19. Los de un equipo retirado (en los goleadores, no en la clasificación) toman el nombre de un equipo de esa temporada con la misma letra o, si no, uno con forma de portal.
- **Web.** `generate_js.sync_season_files` añade el `data-season-<S>.js` nuevo a `SEASON_FILES` de `sw.js` en la misma pasada que lo publica (sin precachearlo, sin conexión se rompen la Trayectoria y «Ver temporadas anteriores»). La lista de temporadas, el menú de temporada y Explorar («archivo desde …») salen solos.

2016-17 (CodTemporada 12) se añadió así en octubre de 2026: su nombre en `SEASON_NAME` (`fetch_fiflp_actas.py`) y sus competiciones en `fiflp_comps_catalog.json` (`discover_fiflp_comps.py`); goleadores y actas (`goleadores-federacion.yml -f temporadas=12`; `actas-federacion.yml -f temporada=12`); `meta_by_name` da código a sus 11 competiciones (las mismas que en 2017-18); y `ARCHIVE_SEASONS`, con sus fases en `phases-archivo.json`. 2015-16 (11) no tiene benjamín ni prebenjamín en la federación.
