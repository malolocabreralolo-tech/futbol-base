# Datos de la federación (FIFLP)

Desde 2026/27 la temporada, las actas, los goleadores y el directorio de campos salen de la web de la Real Federación Interinsular de Fútbol de Las Palmas (www.fiflp.com, plataforma NFG). futbolaspalmas.com se nutre de ella, y en octubre de 2026 no publicaba benjamín ni prebenjamín (ver [temporada-nueva.md](temporada-nueva.md)).

FIFLP contesta vacío a las IPs domésticas: todo lo que lee la federación corre en GitHub Actions. Lo que se escribe en la base se prueba en local con fixtures reales (`scripts/tests/fixtures/acta_*`, `goleadores_2526_A2.html`, `campos_fiflp_p1.html`).

## Páginas públicas que se usan

| Página | Para qué |
|---|---|
| `NFG_CmpJornada?…&CodCompeticion=C&CodGrupo=G&CodJornada=N` | Partidos de una jornada (fecha, hora, campo, marcador) y el `CodActa` de cada uno. Siempre por URL: `BuscarPartidos()` navega leyendo un formulario **oculto** que el aplanado quita. |
| `NFG_VisClasificacion?…&codjornada=99` | Clasificación oficial (no está ofuscada: es la referencia de los goles). |
| `NFG_CmpPartido?cod_primaria=1000120&CodActa=N` | Acta: alineaciones (dorsal, titular/suplente, id del jugador), cada gol con marcador parcial, minuto y tipo, árbitro, entrenadores, delegados de campo y de equipo, estadio. |
| `NFG_CMP_Goleadores?…&codgrupo=G&CodJornada=` | Goleadores del grupo: jugador, equipo, partidos y goles (`38 (1 P)` = 1 de penalti). |
| `NFG_LstCampos?cod_primaria=1000122&NPcd_Page=N&NPcd_PageLines=100` | Directorio de campos: dirección, localidad, superficie, tipo. |

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

```bash
# Actas de una competición entera o de unos grupos (resumible; importa, genera y publica)
gh workflow run fetch-fiflp-actas.yml -f temporada=21 -f comps=54422888 -f do_import=true
gh workflow run fetch-fiflp-actas.yml -f temporada=21 -f comps=54422885,54422953 \
   -f "grupos=54422885:GRUPO 5,54422885:GRUPO 13,54422953:GRUPO 2" -f do_import=true
```

Las actas de temporadas pasadas se emparejan con su partido por nombres, fecha y marcador (`acta_reconciler.py`); las que no casan quedan en `scripts/fiflp_actas_unmatched.json`. Una competición completa de benjamín son ~2.500 actas: mejor por grupos, para no cargar la web de la federación.
