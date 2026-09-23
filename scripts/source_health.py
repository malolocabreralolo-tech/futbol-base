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
_report = None
_previous = None


def _stamp(now=None):
    return (now or datetime.now(timezone.utc)).isoformat(timespec="seconds")


def _read_previous():
    try:
        return json.loads(REPORT_PATH.read_text())
    except (OSError, ValueError):
        return {}


def begin(season):
    global _report, _previous
    _previous = _read_previous()
    _report = {"version": 1, "season": season, "groups": {},
               "nextSeason": _previous.get("nextSeason", {"name": load_config()["nextSeason"], "status": "pending"})}


def record(code, url, status, message="", now=None):
    if _report is None:
        return
    _report["groups"][code] = {
        "url": url, "status": status, "message": str(message)[:350],
        "checkedAt": _stamp(now),
    }


def meaningful(report):
    """The report without its check timestamps: what a visitor would see change."""
    view = {k: v for k, v in report.items() if k != "checkedAt"}
    view["groups"] = {code: {k: v for k, v in (group or {}).items() if k != "checkedAt"}
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
    if meaningful(_report) == meaningful(_previous or {}) and _is_recent(_previous, now):
        return
    REPORT_PATH.write_text(json.dumps(_report, ensure_ascii=False, indent=2) + "\n")
