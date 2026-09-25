# Arranque de una temporada nueva

`src/config.js` contiene la configuración compartida por navegador e importador: temporada, siguiente temporada, equipo inicial y zona horaria. El importador exige que esa temporada coincida con la única fila `is_current=1` de SQLite.

## Estado a 9 de septiembre de 2026

La temporada publicada es 2025/26. Las URLs revisadas siguen ofreciendo calendarios de esa temporada; un encabezado «2026/27» no prueba que los partidos correspondan a ella. El portal indica que los grupos de 2026/27 están pendientes de verificación.

## Descubrir y comprobar candidatos

```bash
python3 scripts/discover_temporada.py --todas
```

La sonda no escribe en la base. Compara equipos y muestra enlaces candidatos. Una tabla ausente o unos equipos diferentes requieren contraste; no activan automáticamente ninguna temporada.

Crear un JSON con los grupos reales encontrados. Este ejemplo solo ilustra el formato; el nombre, equipo, categoría, fase y URL deben contrastarse antes de usarlo:

```json
{
  "season": "2026-2027",
  "defaultTeam": { "cat": "prebenjamin", "groupId": "PG1", "name": "NOMBRE EXACTO VERIFICADO" },
  "groups": [
    { "id": "PG1", "cat": "prebenjamin", "name": "Grupo 1", "phase": "Gran Canaria", "island": "grancanaria", "url": "https://futbolaspalmas.com/1prebenjamin1/" }
  ]
}
```

Los códigos deben ser únicos entre categorías, porque el historial se consulta por código. Las categorías admitidas son `benjamin` y `prebenjamin`; las islas son `grancanaria`, `lanzarote` y `fuerteventura`. Incluir todos los grupos confirmados que se vayan a publicar, con las fases y nombres reales de la fuente.

```bash
python3 scripts/activate_season.py temporada-2026-2027.json
```

Este comando verifica sin modificar archivos ni base. Descarga clasificación y calendario de cada grupo y exige:

- Temporada inmediatamente posterior a la publicada.
- Clasificación y partidos con año explícito.
- Todas las fechas entre julio del primer año y junio del segundo.
- Equipos coincidentes entre calendario y clasificación.
- Equipo inicial presente en el grupo y categoría indicados.

Un calendario vacío, mezclado con otro año o aún de 2025/26 impide continuar.

## Activar y publicar

Ejecutar cuando no haya otra importación en curso:

```bash
python3 scripts/activate_season.py temporada-2026-2027.json --apply
python3 -m pytest scripts/tests/ -q
node --test scripts/tests/test_*.mjs
node scripts/tests/render-smoke.mjs
node scripts/tests/interaction-smoke.mjs
```

`--apply` cambia `src/config.js`, que es código, y recalcula él solo `CODIGO` (con la función de `scripts/codigo.py`), la versión del código que lee el arranque de `index.html` (Plan B3, decisión 156): ya no hace falta ejecutar `scripts/codigo.py` a mano después de activar. `pytest` y `node --test` se ejecutan, y tienen que salir en verde, antes de empujar la activación: el bot (`update.yml`) los ejecuta antes de comitear los datos y, si alguno falla, se para en rojo sin avisar y deja de publicar. Una activación por partes (solo una categoría, como en el ejemplo, que solo trae prebenjamín) es válida, y la suite tiene que seguir en verde con ella.

Después de activar, fija la línea base de desvío de marcadores para que la temporada que acaba de cerrarse quede protegida por el vigilante `test_score_deviation_does_not_regress`:

```bash
python3 scripts/score_deviation.py --write-baseline
```

Comprueba también, a mano, que ninguna fase de la temporada nueva cae en «otra-…», la clave que da `competitionKey` (`src/model.js`) a una fase que no reconoce. Ninguna prueba lo detecta, y a propósito: `phases.json` está congelada, y una fase nueva de la fuente no debe bloquear al bot. Pero una fase sin clasificar recibe en `src/myteam.js` el nivel de la Primera Fase, así que una «Tercera Fase» nunca provocaría un cambio de fase:

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { PORTAL } from './src/config.js';
import { buildSeason } from './src/model.js';
const data = vm.createContext({});
for (const file of ['data-benjamin.js', 'data-prebenjamin.js', 'data-history.js'])
  vm.runInContext(readFileSync(file, 'utf8').replace(/^const /gm, 'var '), data);
const season = buildSeason({ name: PORTAL.season, current: true, benjamin: data.BENJAMIN, prebenjamin: data.PREBENJAMIN, history: data.HISTORY });
const otras = season.groups.filter(group => /(^|-)otra-/.test(group.compKey));
for (const group of otras) console.log(group.cat, group.id, group.phase, '→', group.compKey);
console.log(season.name + ':', season.groups.length, 'grupos,', otras.length, 'en otra-…');
"
```

La última línea debe acabar en «0 en otra-…». Si sale algún grupo (fuera de Gran Canaria, la clave lleva delante la isla, como `lanzarote-otra-…`), añade su fase a `PHASE_TABLE` en `src/model.js` y, si va después de la Primera Fase, a `PHASE_LEVEL` en `src/myteam.js`, con sus pruebas.

La activación vuelve a verificar las fuentes. Guarda una copia en `backups/temporada-FECHA/`, prepara la nueva base y genera los archivos en un directorio temporal. Solo tras completar esa generación reemplaza los archivos de trabajo. No publica ni hace push por su cuenta.

Se conservan partidos, clasificaciones, goleadores y actas anteriores. Se crea `data-season-2025-2026.js` y la Copa Maspalomas 2026 permanece asociada a 2025/26, también al consultar el archivo. Los favoritos siguen guardados: si un equipo cambia de grupo o categoría, la portada permite elegir su nueva ubicación.

Comprobar ambas categorías, el equipo inicial y al menos un partido del archivo en el navegador. Incorporar los archivos generados, `src/config.js`, `data-health.json`, `index.html`, `sw.js` y la base al commit de publicación. No incorporar las copias de seguridad. GitHub Pages publica desde `main`.

## Protecciones de la actualización habitual

El importador rechaza clasificaciones vacías, retrocesos grandes de jornada y cambios fuertes de equipos. Conserva marcadores conocidos si la fuente difiere y señala la discrepancia en el informe. Las etiquetas `3` y `Jornada 3` comparten la identidad ya guardada para evitar duplicar encuentros.

El informe distingue la última consulta de fuentes del último cambio en datos deportivos. `data-health.json` solo se reescribe si cambia algo con significado (estado o mensaje de un grupo, versión de los datos publicados) o si su última comprobación publicada tiene más de 24 horas; sin eso, una ejecución sin marcadores nuevos no genera commit. Las pruebas de la actualización automática bloquean la publicación de datos incoherentes.
