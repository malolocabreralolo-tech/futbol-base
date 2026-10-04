#!/usr/bin/env python3
"""import_fiflp_goleadores.py — Los goleadores de temporadas pasadas que descarga
goleadores-federacion.yml (scripts/fiflp_goleadores_<S>_raw.json), en la base.

Cada grupo de la federación se casa con un grupo de la base de la misma
temporada (match_group):
  1. por sus actas: las del índice de la temporada (fiflp_actas_<S>_index.json,
     cod_acta → competición y grupo) ya importadas en un partido de la base; el
     grupo de la mayoría, si son al menos 3 y dos tercios;
  2. si no, por sus equipos (match_teams: uno a uno, con la letra de filial):
     los de su clasificación contra los de cada grupo de la base de la misma
     categoría; el que más comparte, si son al menos 3, dos tercios de los de
     los dos lados, y ningún otro grupo empata. Sin clasificación (una copa),
     los equipos de sus goleadores, que deben estar en el grupo.

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
from fiflp_names import match_teams, team_key, team_score  # noqa: E402
from import_fiflp_cups_2324 import clean_team_name  # noqa: E402
from update_fiflp import write_scorers  # noqa: E402
from fiflp_tables import official_rows, settle  # noqa: E402

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_FILE = re.compile(r"^fiflp_goleadores_(\d{4}-\d{4})_raw\.json$")
GOLEADORES_VERSION = "3"   # en la huella: subirla reimporta los goleadores de todas las temporadas


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
    """(parejas, puntuación) de los equipos de la federación en el grupo de la base,
    uno a uno (match_teams). La puntuación desempata: 'TITE, C.D. "B"' casa mejor
    con 'Tite B' que con 'CD Tite' (la letra de filial)."""
    pairs = match_teams(sorted({clean_team_name(t) for t in fiflp_teams} - {""}), db_teams)
    return len(pairs), round(sum(team_score(team_key(a), team_key(b)) for a, b in pairs.items()), 6)


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


def _is_cup(text):
    t = (text or "").upper()
    return any(w in t for w in ("COPA", "CAMPEON", "FINAL", "TORNEO", "CLAUSURA"))


def by_teams(conn, season_id, entry):
    """Con clasificación, sus equipos deben estar en los dos lados (dos tercios de
    cada uno); sin ella (una copa: solo los equipos de sus goleadores, que no son
    todos), basta con que los de los goleadores estén en el grupo."""
    standings = [r["team"] for r in entry.get("standings") or []]
    teams = standings or sorted({r[1] for r in entry.get("scorers") or []})
    if len(teams) < 3:
        return None
    # Desempates (una copa insular con los mismos equipos que un grupo de su liga): el mismo tipo
    # de competición (copa o liga), el tamaño más parecido y la puntuación de los nombres.
    cup = _is_cup(entry.get("comp_name"))
    phases = dict(conn.execute("SELECT id, phase FROM groups WHERE season_id=?", (season_id,)).fetchall())
    scored = []
    for gid, db_teams in _db_groups(conn, season_id, _category(entry.get("comp_name"))).items():
        n, quality = _overlap(teams, db_teams)
        if n >= 3 and n * 3 >= len(teams) * 2 and (not standings or n * 3 >= len(db_teams) * 2):
            same_kind = _is_cup(phases.get(gid)) == cup
            scored.append(((n, same_kind, -abs(len(db_teams) - len(teams)), quality), gid))
    scored.sort(reverse=True)
    if not scored or (len(scored) > 1 and scored[1][0] == scored[0][0]):
        return None
    return scored[0][1]


def by_owner(conn, season_id, entry):
    """El grupo que creó import_fiflp_grupos.py para ese grupo de la federación."""
    try:
        row = conn.execute("SELECT group_id FROM fiflp_groups WHERE season_id=? AND comp=? AND grupo=?",
                           (season_id, str(entry["comp"]), str(entry["grupo"]))).fetchone()
    except Exception:            # sin la tabla todavía
        return None
    return row[0] if row else None


def match_group(conn, season_id, index, entry):
    return (by_owner(conn, season_id, entry) or by_actas(conn, index, entry["comp"], entry["grupo"])
            or by_teams(conn, season_id, entry))


def team_bridge(conn, group_id, entry):
    """{nombre de la federación: nombre en la base} de los equipos de un grupo ya
    casado. Primero por su fila de la clasificación oficial, que es la misma en
    las dos fuentes (puntos, partidos, victorias, empates y derrotas iguales, y
    única en los dos lados); después por el nombre (match_teams); y lo que quede,
    por el puesto. Así casan 'MUELLE MESA Y LOPEZ, U.D.' y 'Muelle Mesa Lz.' del
    archivo antiguo."""
    from fetch_futbolaspalmas import stored_standings
    db_rows = stored_standings(conn, group_id)
    fed = {clean_team_name(r.get("team")): r for r in entry.get("standings") or [] if clean_team_name(r.get("team"))}
    stats = lambda r: (r.get("pts"), r.get("j"), r.get("g"), r.get("e"), r.get("p"))
    out, used = {}, set()
    for name, row in fed.items():
        same = [d for d in db_rows if tuple(d[2:7]) == stats(row)]
        twins = [n for n, r in fed.items() if stats(r) == stats(row)]
        if len(same) == 1 and len(twins) == 1 and same[0][1] not in used:
            out[name] = same[0][1]
            used.add(same[0][1])
    rest = sorted((set(fed) | {clean_team_name(r[1]) for r in entry.get("scorers") or []}) - set(out) - {""})
    free = sorted(set(_db_groups_one(conn, group_id)) - used)
    for name, db_name in match_teams(rest, free).items():
        out[name] = db_name
        used.add(db_name)
    # Lo que sobra de los dos lados en un grupo ya casado: el nombre más parecido letra a letra
    # ('MUELLE MESA Y LOPEZ, U.D.' y 'Muelle Mesa Lz.', 'GUINIGUADA APOLINARIO' y 'Guniguada').
    import difflib
    letters = lambda t: re.sub(r"[^a-z]", "", fold(re.sub(r"\b(?:C\.?\s?[DF]|U\.?\s?D|A\.?\s?D|S\.?\s?D)\.?", " ", t.upper())))
    pairs = sorted(((difflib.SequenceMatcher(None, letters(a), letters(b)).ratio(), a, b)
                    for a in fed if a not in out for b in set(_db_groups_one(conn, group_id)) - used), reverse=True)
    for ratio, a, b in pairs:
        if ratio >= 0.5 and a not in out and b not in used:
            out[a] = b
            used.add(b)
    for name, row in fed.items():
        if name not in out:
            pick = next((d for d in db_rows if d[1] not in used and d[0] == row.get("pos")), None)
            if pick:
                out[name] = pick[1]
                used.add(pick[1])
    return out


def fold(text):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", text or "") if unicodedata.category(c) != "Mn").lower()


def scorer_team(name, bridge):
    """El nombre en la base del equipo de un goleador: la página de goleadores escribe a veces el
    nombre sin las comillas de la letra ('ATLETICO G.C. A, C.F. A' por '… C.F. "A"')."""
    clean = clean_team_name(name)
    if clean in bridge:
        return bridge[clean]
    key = lambda t: re.sub(r"\s+", " ", t.replace('"', "")).strip().upper()
    return next((v for k, v in bridge.items() if key(k) == key(clean)), name)


def import_raw(conn, path, log=print):
    """Escribe los goleadores de cada grupo del raw que case con uno de la base
    sin goleadores (o con los de aquí). Devuelve {escritos, sin_grupo, ya_tenían}."""
    season = RAW_FILE.match(os.path.basename(path)).group(1)
    row = conn.execute("SELECT id FROM seasons WHERE name=?", (season,)).fetchone()
    report = {"written": 0, "unmatched": 0, "kept": 0, "tables": 0}
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
        # La clasificación oficial, si no aleja el grupo de su calendario (fiflp_tables.settle).
        if settle(conn, gid, {}, official_rows(conn, gid, entry)).startswith("official"):
            report["tables"] += 1
        mine = conn.execute("SELECT 1 FROM fiflp_scorer_groups WHERE group_id=?", (gid,)).fetchone()
        has = conn.execute("SELECT 1 FROM scorers WHERE group_id=? LIMIT 1", (gid,)).fetchone()
        if has and not mine:
            report["kept"] += 1
            continue
        teams = sorted(_db_groups_one(conn, gid))
        bridge = team_bridge(conn, gid, entry)
        rows = [(r[0], scorer_team(r[1], bridge), *r[2:]) for r in entry["scorers"]]
        write_scorers(conn, gid, rows, group_teams=teams)
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
            digest = hashlib.sha1(GOLEADORES_VERSION.encode() + f.read()).hexdigest()
        row = conn.execute("SELECT sha1 FROM raw_imports WHERE path=?", (name,)).fetchone()
        if row and row[0] == digest:
            continue
        report = import_raw(conn, path, log=log)
        conn.execute("INSERT OR REPLACE INTO raw_imports(path, sha1, imported_at) VALUES (?, ?, datetime('now'))",
                     (name, digest))
        conn.commit()
        log(f"  {name}: goleadores de {report['written']} grupos; {report['unmatched']} grupos sin pareja en la base; "
            f"{report['kept']} ya tenían los de futbolaspalmas; {report['tables']} clasificaciones oficiales")
        reports[name] = report
    return reports


if __name__ == "__main__":
    from db import get_connection
    c = get_connection()
    import_changed_goleadores(c)
    c.close()
