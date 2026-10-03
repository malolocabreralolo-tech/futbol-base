#!/usr/bin/env python3
"""import_fiflp_goleadores.py — Los goleadores de temporadas pasadas que descarga
goleadores-federacion.yml (scripts/fiflp_goleadores_<S>_raw.json), en la base.

Cada grupo de la federación se casa con un grupo de la base de la misma
temporada (match_group):
  1. por sus actas: las del índice de la temporada (fiflp_actas_<S>_index.json,
     cod_acta → competición y grupo) ya importadas en un partido de la base; el
     grupo de la mayoría, si son al menos 3 y dos tercios;
  2. si no, por sus equipos: los de su clasificación (o, sin ella, los de sus
     goleadores) contra los de cada grupo de la base de la misma categoría; el
     que más comparte, si son al menos 3, dos tercios de los de los dos lados, y
     ningún otro grupo empata.

Solo se escriben los goleadores de un grupo de la base que no tenga ninguno o
cuyos goleadores vengan de aquí (tabla fiflp_scorer_groups): los que ya trae
futbolaspalmas se quedan. El bot (fetch_futbolaspalmas.py) llama a
import_changed_goleadores: solo los raws cuyo sha1 no está en raw_imports.
"""
import hashlib
import json
import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from acta_reconciler import normalize_team_name, _names_match  # noqa: E402
from update_fiflp import write_scorers  # noqa: E402

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_FILE = re.compile(r"^fiflp_goleadores_(\d{4}-\d{4})_raw\.json$")


def _category(comp_name):
    fold = (comp_name or "").upper().replace("-", "").replace(" ", "")
    return "PREBENJAMIN" if "PREBENJAMIN" in fold else "BENJAMIN"


def _db_groups(conn, season_id, category):
    """{group_id: [nombres de sus equipos]} (clasificación y calendario)."""
    out = {}
    for gid, name in conn.execute("""
        SELECT g.id, t.name FROM groups g JOIN categories c ON c.id=g.category_id
          JOIN standings s ON s.group_id=g.id JOIN teams t ON t.id=s.team_id
         WHERE g.season_id=? AND c.name=?
        UNION
        SELECT g.id, t.name FROM groups g JOIN categories c ON c.id=g.category_id
          JOIN matches m ON m.group_id=g.id JOIN teams t ON t.id IN (m.home_team_id, m.away_team_id)
         WHERE g.season_id=? AND c.name=?""", (season_id, category, season_id, category)):
        out.setdefault(gid, []).append(name)
    return out


def _db_groups_one(conn, gid):
    """Los nombres de los equipos de un grupo de la base (clasificación y calendario)."""
    return [r[0] for r in conn.execute("""
        SELECT t.name FROM standings s JOIN teams t ON t.id=s.team_id WHERE s.group_id=?
        UNION
        SELECT t.name FROM matches m JOIN teams t ON t.id IN (m.home_team_id, m.away_team_id) WHERE m.group_id=?""",
        (gid, gid))]


def _overlap(fiflp_teams, db_teams):
    """Cuántos equipos de la federación tienen su pareja en el grupo de la base."""
    norm_db = [normalize_team_name(t) for t in db_teams]
    return sum(1 for t in fiflp_teams if any(_names_match(normalize_team_name(t), d) for d in norm_db))


def by_actas(conn, index, comp, grupo):
    """El grupo de la base de las actas de ese grupo de la federación ya importadas."""
    cods = [int(cod) for cod, e in index.items() if str(e.get("comp_id")) == str(comp) and str(e.get("grupo")) == str(grupo)]
    if not cods:
        return None
    votes = Counter()
    for i in range(0, len(cods), 500):
        chunk = cods[i:i + 500]
        for (gid,) in conn.execute(f"SELECT group_id FROM matches WHERE cod_acta IN ({','.join('?' * len(chunk))})", chunk):
            votes[gid] += 1
    if not votes:
        return None
    gid, n = votes.most_common(1)[0]
    total = sum(votes.values())
    return gid if n >= 3 and n * 3 >= total * 2 else None


def by_teams(conn, season_id, entry):
    teams = [r["team"] for r in entry.get("standings") or []] or sorted({r[1] for r in entry.get("scorers") or []})
    if len(teams) < 3:
        return None
    scored = []
    for gid, db_teams in _db_groups(conn, season_id, _category(entry.get("comp_name"))).items():
        n = _overlap(teams, db_teams)
        if n >= 3 and n * 3 >= len(teams) * 2 and n * 3 >= len(db_teams) * 2:
            scored.append((n, gid))
    scored.sort(reverse=True)
    if not scored or (len(scored) > 1 and scored[1][0] == scored[0][0]):
        return None
    return scored[0][1]


def match_group(conn, season_id, index, entry):
    return by_actas(conn, index, entry["comp"], entry["grupo"]) or by_teams(conn, season_id, entry)


def import_raw(conn, path, log=print):
    """Escribe los goleadores de cada grupo del raw que case con uno de la base
    sin goleadores (o con los de aquí). Devuelve {escritos, sin_grupo, ya_tenían}."""
    season = RAW_FILE.match(os.path.basename(path)).group(1)
    row = conn.execute("SELECT id FROM seasons WHERE name=?", (season,)).fetchone()
    report = {"written": 0, "unmatched": 0, "kept": 0}
    if not row:
        return report
    season_id = row[0]
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    index_path = os.path.join(os.path.dirname(path), f"fiflp_actas_{season}_index.json")
    index = {}
    if os.path.exists(index_path):
        with open(index_path, encoding="utf-8") as f:
            data = json.load(f)
        # El índice es una lista de {cod_acta, comp_id, grupo, jornada} o un dict por cod_acta.
        index = {str(e["cod_acta"]): e for e in data} if isinstance(data, list) else data
    conn.execute("""CREATE TABLE IF NOT EXISTS fiflp_scorer_groups (
        group_id INTEGER PRIMARY KEY, comp TEXT NOT NULL, grupo TEXT NOT NULL)""")
    claimed = set()
    for key in sorted(raw):
        entry = raw[key]
        if not entry.get("ok") or not entry.get("scorers"):
            continue
        gid = match_group(conn, season_id, index, entry)
        if not gid or gid in claimed:
            report["unmatched"] += 1
            continue
        claimed.add(gid)
        mine = conn.execute("SELECT 1 FROM fiflp_scorer_groups WHERE group_id=?", (gid,)).fetchone()
        has = conn.execute("SELECT 1 FROM scorers WHERE group_id=? LIMIT 1", (gid,)).fetchone()
        if has and not mine:
            report["kept"] += 1
            continue
        teams = sorted(_db_groups_one(conn, gid))
        write_scorers(conn, gid, [tuple(r) for r in entry["scorers"]], group_teams=teams)
        conn.execute("INSERT OR REPLACE INTO fiflp_scorer_groups(group_id, comp, grupo) VALUES (?, ?, ?)",
                     (gid, str(entry["comp"]), str(entry["grupo"])))
        report["written"] += 1
    conn.commit()
    return report


def import_changed_goleadores(conn, folder=SCRIPTS_DIR, log=print):
    """import_raw de cada fiflp_goleadores_<S>_raw.json que haya cambiado desde la
    última vez (sha1 en raw_imports)."""
    conn.execute("""CREATE TABLE IF NOT EXISTS raw_imports (
        path TEXT PRIMARY KEY, sha1 TEXT NOT NULL, imported_at TEXT NOT NULL)""")
    reports = {}
    for name in sorted(os.listdir(folder)):
        if not RAW_FILE.match(name):
            continue
        path = os.path.join(folder, name)
        with open(path, "rb") as f:
            digest = hashlib.sha1(f.read()).hexdigest()
        row = conn.execute("SELECT sha1 FROM raw_imports WHERE path=?", (name,)).fetchone()
        if row and row[0] == digest:
            continue
        report = import_raw(conn, path, log=log)
        conn.execute("INSERT OR REPLACE INTO raw_imports(path, sha1, imported_at) VALUES (?, ?, datetime('now'))",
                     (name, digest))
        conn.commit()
        log(f"  {name}: goleadores de {report['written']} grupos; {report['unmatched']} grupos sin pareja en la base; "
            f"{report['kept']} ya tenían los de futbolaspalmas")
        reports[name] = report
    return reports


if __name__ == "__main__":
    from db import get_connection
    c = get_connection()
    import_changed_goleadores(c)
    c.close()
