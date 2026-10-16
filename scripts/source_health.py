"""Publish source-check timestamps separately from changes to sporting data."""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import re
from portal_config import load_config

ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "data-health.json"
# Sin cambios con significado, el informe solo se reescribe una vez al día:
# reescribirlo en cada ejecución (cada ~5 h) generaba un commit y un despliegue
# de Pages solo para mover la hora de comprobación.
HEARTBEAT = timedelta(hours=24)
# Lo que cambia en cada pasada sin que un visitante vea nada distinto: la hora de la comprobación y
# las notas de la pasada del bot de la federación (rotación, grupos que descansan, tiempos).
VOLATILE = ("checkedAt", "run")
# Y en cada grupo: la hora de su comprobación.
GROUP_VOLATILE = ("checkedAt",)
_report = None
_previous = None
# Los grupos cuya hora de comprobación se publica aunque no cambie nada más (record(publish_time=True)): los
# prioritarios del bot de la federación, a los que les vuelve a tocar según ella (update_fiflp.plan_groups).
_timed = set()


def _stamp(now=None):
    return (now or datetime.now(timezone.utc)).isoformat(timespec="seconds")


def _read_previous():
    try:
        return json.loads(REPORT_PATH.read_text())
    except (OSError, ValueError):
        return {}


def begin(season):
    global _report, _previous, _timed
    _previous = _read_previous()
    _timed = set()
    _report = {"version": 1, "season": season, "groups": {},
               "nextSeason": _previous.get("nextSeason", {"name": load_config()["nextSeason"], "status": "pending"})}
    _carry_new_competitions()


def _same_season():
    return bool(_report and _previous and _previous.get("season") == _report["season"])


def _carry_new_competitions():
    """Las competiciones nuevas siguen hasta que el bot vuelva a leer el desplegable (sin
    federación en esta pasada o si falla la lectura, se quedan); con otra temporada, fuera."""
    items = _previous.get("newCompetitions") if _same_season() else None
    if isinstance(items, list) and items:
        _report["newCompetitions"] = items


def new_competitions():
    """[{id, name, firstSeen}]: las competiciones de la federación que la temporada no tiene."""
    return list((_report or {}).get("newCompetitions") or [])


def set_new_competitions(items):
    """Las que acaba de ver update_fiflp.check_competitions (vacía: ninguna)."""
    if _report is None:
        return
    if items:
        _report["newCompetitions"] = list(items)
    else:
        _report.pop("newCompetitions", None)


def previous_groups():
    """Las comprobaciones publicadas de la temporada en curso ({código: entrada}): el bot de la
    federación vuelve a mirar un grupo cerrado cuya última comprobación falló o que no tiene ninguna
    (update_fiflp.plan_groups). Su orden no depende de ellas: no siempre se suben."""
    groups = (_previous or {}).get("groups") if _same_season() else None
    return dict(groups) if isinstance(groups, dict) else {}


def record(code, url, status, message="", now=None, publish_time=False):
    """La comprobación de un grupo. Su hora (checkedAt) no reescribe el informe por sí sola (VOLATILE), salvo
    con `publish_time`: los prioritarios del bot de la federación, a los que les vuelve a tocar según la hora
    de su última comprobación publicada (update_fiflp.plan_groups; sin publicarla, la pasada siguiente los
    leería otra vez, en cada pasada)."""
    if _report is None:
        return
    _report["groups"][code] = {
        "url": url, "status": status, "message": str(message)[:350],
        "checkedAt": _stamp(now),
    }
    if publish_time:
        _timed.add(code)


def carry(code, url=None):
    """El grupo no se comprobó en esta pasada (rotación del bot de la federación, un cerrado que
    descansa, o de una categoría que este workflow no lee: FIFLP_CATS): su última comprobación sigue
    como estaba, sin marcarlo como error. Sin comprobación anterior en la temporada (o, con `url`,
    con otra URL: otro grupo con el mismo código), nada: todavía no sale."""
    if _report is None:
        return
    entry = previous_groups().get(code)
    if isinstance(entry, dict) and (url is None or entry.get("url") == url):
        _report["groups"][code] = dict(entry)


def note_run(info):
    """Las notas de la pasada del bot (VOLATILE: no reescriben el informe por sí solas)."""
    if _report is not None:
        _report["run"] = info


def meaningful(report):
    """The report without its check timestamps: what a visitor would see change."""
    view = {k: v for k, v in report.items() if k not in VOLATILE}
    view["groups"] = {code: {k: v for k, v in (group or {}).items() if k not in GROUP_VOLATILE}
                      for code, group in (report.get("groups") or {}).items()}
    return view


def _is_recent(report, now):
    try:
        checked = datetime.fromisoformat(report["checkedAt"])
    except (KeyError, TypeError, ValueError):
        return False
    return now - checked < HEARTBEAT


def finish(now=None):
    if _report is None:
        return
    now = now or datetime.now(timezone.utc)
    _report["checkedAt"] = _stamp(now)
    text = (ROOT / "index.html").read_text()
    match = re.search(r"Última actualización: (\d{2})/(\d{2})/(\d{4})", text)
    if match:
        day, month, year = match.groups()
        _report["lastDataChange"] = f"{year}-{month}-{day}"
    # La versión de los datos publicados (?v= que generate_js.py solo sube
    # cuando cambia algún data-*.js): si cambia, el informe acompaña al commit.
    version = re.search(r"data-seasons\.js\?v=([0-9a-z]+)", text)
    if version:
        _report["dataVersion"] = version.group(1)
    _report["summary"] = {status: sum(g["status"] == status for g in _report["groups"].values())
                          for status in ["ok", "rejected", "error"]}
    before = (_previous or {}).get("groups") or {}
    timed = any(_report["groups"].get(code, {}).get("checkedAt") != (before.get(code) or {}).get("checkedAt")
                for code in _timed)
    if not timed and meaningful(_report) == meaningful(_previous or {}) and _is_recent(_previous, now):
        return
    REPORT_PATH.write_text(json.dumps(_report, ensure_ascii=False, indent=2) + "\n")
