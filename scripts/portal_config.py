"""Read the configuration shared by the importer and the browser."""
import json
from pathlib import Path
import re

CONFIG_PATH = Path(__file__).resolve().parents[1] / "src" / "config.js"


def load_config(path=CONFIG_PATH):
    match = re.search(r"export const PORTAL\s*=\s*(\{[\s\S]*?\});", Path(path).read_text())
    if not match:
        raise ValueError("PORTAL configuration must contain a JSON object")
    config = json.loads(match.group(1))
    if not re.fullmatch(r"20\d{2}-20\d{2}", config["season"]):
        raise ValueError("Invalid season in PORTAL configuration")
    return config


def active_season(conn):
    rows = conn.execute("SELECT id, name FROM seasons WHERE is_current=1").fetchall()
    if len(rows) != 1 or rows[0][1] != load_config()["season"]:
        raise ValueError("La temporada de src/config.js debe coincidir con la única temporada actual de la base")
    return rows[0]
