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

La activación vuelve a verificar las fuentes. Guarda una copia en `backups/temporada-FECHA/`, prepara la nueva base y genera los archivos en un directorio temporal. Solo tras completar esa generación reemplaza los archivos de trabajo. No publica ni hace push por su cuenta.

Se conservan partidos, clasificaciones, goleadores y actas anteriores. Se crea `data-season-2025-2026.js` y la Copa Maspalomas 2026 permanece asociada a 2025/26, también al consultar el archivo. Los favoritos siguen guardados: si un equipo cambia de grupo o categoría, la portada permite elegir su nueva ubicación.

Comprobar ambas categorías, el equipo inicial y al menos un partido del archivo en el navegador. Incorporar los archivos generados, `src/config.js`, `data-health.json`, `index.html`, `sw.js` y la base al commit de publicación. No incorporar las copias de seguridad. GitHub Pages publica desde `main`.

## Protecciones de la actualización habitual

El importador rechaza clasificaciones vacías, retrocesos grandes de jornada y cambios fuertes de equipos. Conserva marcadores conocidos si la fuente difiere y señala la discrepancia en el informe. Las etiquetas `3` y `Jornada 3` comparten la identidad ya guardada para evitar duplicar encuentros.

El informe distingue la última consulta de fuentes del último cambio en datos deportivos. Una ejecución sin marcadores nuevos puede actualizar únicamente `data-health.json`. Las pruebas de la actualización automática bloquean la publicación de datos incoherentes.
