"""Publish source-check timestamps separately from changes to sporting data."""
from datetime import datetime, timezone
import json
from pathlib import Path
import re
from portal_config import load_config

ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "data-health.json"
_report = None


def begin(season):
    global _report
    previous = json.loads(REPORT_PATH.read_text()) if REPORT_PATH.exists() else {}
    _report = {"version": 1, "season": season, "groups": {},
               "nextSeason": previous.get("nextSeason", {"name": load_config()["nextSeason"], "status": "pending"})}


def record(code, url, status, message=""):
    if _report is None:
        return
    _report["groups"][code] = {
        "url": url, "status": status, "message": str(message)[:350],
        "checkedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def finish():
    if _report is None:
        return
    _report["checkedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    text = (ROOT / "index.html").read_text()
    match = re.search(r"Última actualización: (\d{2})/(\d{2})/(\d{4})", text)
    if match:
        day, month, year = match.groups()
        _report["lastDataChange"] = f"{year}-{month}-{day}"
    _report["summary"] = {status: sum(g["status"] == status for g in _report["groups"].values())
                          for status in ["ok", "rejected", "error"]}
    REPORT_PATH.write_text(json.dumps(_report, ensure_ascii=False, indent=2) + "\n")
