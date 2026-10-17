#!/usr/bin/env python3
"""reloj_pasadas.py — ¿Toca lanzar una pasada del bot (update.yml)? Lo decide el reloj (reloj.yml, desde el
17/10/2026): cada ~15 min le pasa por la entrada las últimas ejecuciones de update.yml (el JSON de
`gh run list --workflow update.yml --json number,event,status,conclusion,createdAt,startedAt`) y, si toca,
lanza `gh workflow run update.yml --ref main`.

Por qué un reloj y no el cron de update.yml: del 16/10/2026 11:50 UTC al 17/10 12:16, su `'23 */2 * * *'`
disparó 5 veces de las 13 que tocaban (16:48 y 21:24 del 16; 00:36, 07:03 y 12:16 del 17): en la práctica,
una pasada cada 4-6 h. GitHub pierde o retrasa los cron (más los de las :00); con un tick cada 15 min y la
decisión hecha aquí, perder uno solo retrasa la pasada hasta el siguiente que llegue.

Cuándo toca (due): nunca con una ejecución de update.yml sin acabar (en cola, en marcha, esperando…: status
distinto de «completed»), que la siguiente se pondría en fila detrás (concurrency update-data) y otra más
cancelaría la pendiente, gastando un número de pasada sin pasada (update_fiflp.run_number). Si no, cuando no
hay ninguna o desde que empezó la última (cualquier evento: el reloj, una tanda de actas, goleadores o
detalle, una a mano; y cualquier resultado, también fallida o cancelada) han pasado `interval(now)` menos
SLACK. «Empezó»: la más tardía de su createdAt y su startedAt (run_time). Relanzar una ejecución (Re-run)
conserva su createdAt y cambia su startedAt (corrector del 17/10/2026: con solo createdAt, la 1120 creada a
las 10:08 y relanzada a las 11:30 contaba como de las 10:08, y el tick de las 11:52 lanzaba otra pasada
detrás); sin startedAt (o vacío), la de creación. El relanzamiento de una de hace más de 20 ejecuciones
(--limit de reloj.yml) no se ve: como mucho, una pasada de más en fila detrás de él. Los intervalos:
  - 60 min (WINDOW) en las VENTANAS DE PARTIDOS, hora de Canarias (Atlantic/Canary, con su cambio de hora:
    el 25/10/2026 a las 02:00 vuelve a UTC+0): viernes de 18:00 a 24:00 y sábado y domingo de 10:00 a 24:00.
    En la base de 2026-27 (1.638 partidos), el sábado tiene 1.023 (620 a las 9, 260 a las 10, ~100 de 11 a
    13 y 42 de 16 a 18), el viernes 364 (238 a las 17, 109 a las 18, 13 a las 19), el domingo 199 (105 a
    las 9, 41 a las 10, 31 de 11 a 12, 2 a las 17) y entre semana ~52; los equipos de la familia (los
    prioritarios), 57 el sábado, 17 el domingo y 4 el viernes. Cada ventana empieza una hora después de los
    primeros saques (FIRST_KICKOFF + HOT_AFTER): antes, el bot no tiene ningún resultado que buscar
    (update_fiflp.hot_reason calienta un prioritario desde el saque + HOT_AFTER, 60 min);
  - 120 min (BASE) fuera de ellas: update_fiflp.PASS_EVERY, la cadencia base, de la que salen sus turnos,
    priority_slot, los cerrados y los extras (en las ventanas solo se adelantan: van por número de pasada).
SLACK (10 min): un tick que GitHub adelanta o retrasa unos minutos no hace perder una pasada entera (sin él,
una creada a las 10:08 haría esperar a la de las 11:08 hasta el tick de las 11:22).

Sin la base de zonas horarias del sistema (ZoneInfoNotFoundError: en ubuntu-24.04 viene, pero el reloj no
instala tzdata) no hay ventanas: una pasada cada BASE, con un aviso (::warning::) y sin dejar el job en rojo,
que como update.yml ya no tiene cron, sin reloj no habría ninguna pasada (corrector del 17/10/2026).

Puro y sin dependencias (solo la biblioteca estándar): el reloj corre con el python3 del sistema, sin pip ni
el resto del repositorio (checkout disperso de este fichero). Lo prueban test_reloj_pasadas.py y, el
workflow, test_workflows.py.

Uso: gh run list ... --json ... | python3 scripts/reloj_pasadas.py [--now 2026-10-17T10:00:00Z]
Escribe la decisión en la salida y, si existe $GITHUB_OUTPUT, «due=true» o «due=false» en él. Una entrada que
no es la lista de ejecuciones (un fallo de gh) sale con error y sin escribir nada: el job falla a la vista y
no lanza nada.
"""
from datetime import datetime, timedelta, timezone
import json
import os
import sys
from zoneinfo import ZoneInfo

LOCAL_ZONE = "Atlantic/Canary"          # la hora de los partidos (update_fiflp.LOCAL_ZONE)
BASE = timedelta(minutes=120)           # fuera de las ventanas (update_fiflp.PASS_EVERY)
WINDOW = timedelta(minutes=60)          # dentro de ellas
SLACK = timedelta(minutes=10)           # lo que puede adelantarse un tick sin perder la pasada
HOT_AFTER = timedelta(minutes=60)       # update_fiflp.HOT_AFTER: un partido de fútbol base dura ~1 h
# Los primeros saques de cada día con partidos (hora de Canarias; weekday: 4 viernes, 5 sábado, 6 domingo).
FIRST_KICKOFF = {4: 17, 5: 9, 6: 9}
# Las ventanas: desde una hora después de los primeros saques hasta las 24:00 de ese día.
WINDOWS = {day: hour + int(HOT_AFTER.total_seconds()) // 3600 for day, hour in FIRST_KICKOFF.items()}
DONE = "completed"                      # el único status de una ejecución acabada (gh run list)
DAYS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
NO_ZONE = "sin ventanas de partidos"
RERUN = timedelta(minutes=1)            # un startedAt más tardío que esto tras su createdAt: un relanzamiento


def _utc(moment):
    """Un instante con zona (sin zona: UTC)."""
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def local_time(now):
    """La hora de Canarias de un instante (con zona), o None sin la base de zonas horarias del sistema
    (ZoneInfoNotFoundError, un KeyError; o un fichero de zona que no se lee): sin ella no hay ventanas, y
    el reloj sigue con BASE (como update_fiflp.local_time, que cae a UTC)."""
    try:
        return _utc(now).astimezone(ZoneInfo(LOCAL_ZONE))
    except Exception:
        return None


def window(now):
    """La ventana de partidos en la que cae `now` («sábado de 10:00 a 24:00»), o None (también sin la hora de
    Canarias: local_time)."""
    local = local_time(now)
    if local is None:
        return None
    start = WINDOWS.get(local.weekday())
    if start is None or local.hour < start:
        return None
    return f"{DAYS[local.weekday()]} de {start:02d}:00 a 24:00"


def interval(now):
    """Cada cuánto toca una pasada a la hora `now`: WINDOW en las ventanas de partidos y BASE fuera."""
    return WINDOW if window(now) else BASE


def _moment(text):
    return _utc(datetime.fromisoformat(text.replace("Z", "+00:00")))


def created_at(run):
    """La hora de creación (UTC) de una ejecución de gh run list; ValueError si no la tiene o no se lee."""
    text = run.get("createdAt") if isinstance(run, dict) else None
    if not isinstance(text, str):
        raise ValueError(f"ejecución sin createdAt: {run!r}")
    return _moment(text)


def started_at(run):
    """La hora (UTC) a la que empezó su último intento (startedAt de gh run list; cambia al relanzarla), o None
    si no la trae (o vacía); ValueError si trae otra cosa."""
    text = run.get("startedAt") if isinstance(run, dict) else None
    if text is None or text == "":
        return None
    if not isinstance(text, str):
        raise ValueError(f"ejecución con un startedAt que no se lee: {run!r}")
    return _moment(text)


def run_time(run):
    """Desde cuándo cuenta una ejecución para el intervalo: la más tardía de su creación y su startedAt (en el
    primer intento, el mismo instante; en un relanzamiento, el del relanzamiento)."""
    return max(t for t in (created_at(run), started_at(run)) if t is not None)


def check_runs(runs):
    """Las ejecuciones tal cual, si son las de gh run list (una lista de objetos con status y createdAt); si
    no, ValueError: mejor un job en rojo que un reloj que decide sobre otra cosa."""
    if not isinstance(runs, list):
        raise ValueError(f"se esperaba la lista de ejecuciones de gh run list, no {type(runs).__name__}")
    for run in runs:
        if not isinstance(run, dict) or not isinstance(run.get("status"), str):
            raise ValueError(f"ejecución sin status: {run!r}")
        run_time(run)
    return runs


def decide(now, runs):
    """(¿toca?, por qué) a la hora `now` (UTC), con las ejecuciones de update.yml `runs` (gh run list)."""
    runs = check_runs(runs)
    now = _utc(now)
    every = interval(now)
    where = window(now)
    local = local_time(now)
    each = f"una pasada cada {int(every.total_seconds() // 60)} min"
    if local is None:
        head = f"{now:%d/%m/%Y %H:%M} UTC, sin la hora de Canarias (no está la base de zonas horarias): {NO_ZONE}, {each}"
    elif where:
        head = f"{local:%d/%m/%Y %H:%M} en Canarias, ventana de partidos ({where}): {each}"
    else:
        head = f"{local:%d/%m/%Y %H:%M} en Canarias, fuera de las ventanas de partidos: {each}"
    busy = [r for r in runs if r["status"] != DONE]
    if busy:
        r = max(busy, key=run_time)
        return False, f"{head}. No toca: la {r.get('number', '?')} ({r.get('event', '?')}) está {r['status']}."
    if not runs:
        return True, f"{head}. Toca: no hay ninguna ejecución de update.yml."
    last = max(runs, key=run_time)
    since = now - run_time(last)
    verb = "se relanzó" if run_time(last) - created_at(last) > RERUN else "se creó"
    when = (f"{verb} hace {int(since.total_seconds() // 60)} min" if since >= timedelta(0)
            else f"{verb} después de ahora (¿un reloj atrasado?)")
    ago = f"la última, la {last.get('number', '?')} ({last.get('event', '?')}, {last.get('conclusion') or '-'}), {when}"
    if since >= every - SLACK:
        return True, f"{head}. Toca: {ago}."
    return False, f"{head}. No toca: {ago} (toca a partir de los {int((every - SLACK).total_seconds() // 60)})."


def due(now, runs):
    """¿Toca lanzar una pasada a la hora `now` (UTC)? (decide)"""
    return decide(now, runs)[0]


def main(argv=None, stdin=None, env=None):
    argv = sys.argv[1:] if argv is None else argv
    env = os.environ if env is None else env
    now = datetime.now(timezone.utc)
    if argv[:1] == ["--now"] and len(argv) == 2:
        now = _utc(datetime.fromisoformat(argv[1].replace("Z", "+00:00")))
    elif argv:
        print("uso: reloj_pasadas.py [--now FECHA_ISO] < ejecuciones.json", file=sys.stderr)
        return 2
    try:
        ok, why = decide(now, json.load(stdin or sys.stdin))
    except ValueError as e:                     # json.JSONDecodeError también es un ValueError
        print(f"reloj_pasadas: no se puede decidir ({e}): no se lanza nada.", file=sys.stderr)
        return 1
    print(why)
    if local_time(now) is None:
        print(f"::warning::reloj_pasadas: no está la zona {LOCAL_ZONE} (la base de zonas horarias del sistema): "
              f"{NO_ZONE}, una pasada cada {int(BASE.total_seconds() // 60)} min.")
    out = env.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"due={'true' if ok else 'false'}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
