#!/usr/bin/env python3
"""import_torneos.py — Los torneos que no son de la federación (la Maspalomas Cup), en la base.

La web los publica desde su propio fichero (data-maspalomas-cup-<año>.js, fetch_maspalomas_cup.py)
y no pasaban por futbolbase.db. Aquí se guarda TODO lo que da su API (scripts/maspalomas_cup_<año>_raw.json),
también las categorías que la web no enseña (alevín), en tablas propias: sus equipos no son los de la
federación ('UD Las Mesas Huracán', 'CD Maspa Training A') y no se mezclan con `teams`.

  tournaments           (id): nombre, edición, organizador, web, primer y último día.
  tournament_matches    (id de la API): categoría, número, fase (fase de grupos o la copa),
                        grupo, ronda, día, hora, campo, equipos (y su id en la API), marcador,
                        estado y penaltis.
  tournament_standings  (torneo, categoría, grupo, equipo): la clasificación de cada grupo de la
                        fase de grupos, la misma que publica la web.

La fase, el grupo y la ronda de benjamín y prebenjamín salen de la estructura que deduce
fetch_maspalomas_cup.build_all (la API no la da); los de alevín quedan sin ella.
"""
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_FILE = re.compile(r"^maspalomas_cup_(\d{4})_raw\.json$")
TORNEOS_VERSION = "1"

SCHEMA = (
    """CREATE TABLE IF NOT EXISTS tournaments (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE,
        edition     TEXT,
        organizer   TEXT,
        url         TEXT,
        first_day   TEXT,
        last_day    TEXT)""",
    """CREATE TABLE IF NOT EXISTS tournament_matches (
        id            TEXT PRIMARY KEY,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
        category      TEXT,
        match_number  INTEGER,
        phase         TEXT,
        group_name    TEXT,
        round         TEXT,
        date          TEXT,
        time          TEXT,
        field         TEXT,
        home          TEXT, away TEXT,
        home_ext_id   INTEGER, away_ext_id INTEGER,
        home_score    INTEGER, away_score INTEGER,
        status        TEXT,
        penalty_winner TEXT, penalty_home INTEGER, penalty_away INTEGER)""",
    """CREATE INDEX IF NOT EXISTS idx_tournament_matches_t ON tournament_matches(tournament_id, category)""",
    """CREATE TABLE IF NOT EXISTS tournament_standings (
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
        category      TEXT NOT NULL,
        group_name    TEXT NOT NULL,
        position      INTEGER,
        team          TEXT NOT NULL,
        points INTEGER, played INTEGER, won INTEGER, drawn INTEGER, lost INTEGER,
        gf INTEGER, gc INTEGER,
        PRIMARY KEY (tournament_id, category, group_name, team))""",
)


def migrate(conn):
    for sql in SCHEMA:
        conn.execute(sql)


def structure(raw):
    """{(categoría, día 'dd/mm', hora, local, visitante): (fase, grupo, ronda)} y las
    clasificaciones [(categoría, grupo, fila)] de benjamín y prebenjamín (build_all)."""
    import fetch_maspalomas_cup as M
    where, tables = {}, []
    names = {var: cat for cat, _, var in M.CATEGORIES}
    for var, groups in M.build_all(raw).items():
        cat = names[var]
        for g in groups:
            if g.get("jornadas"):          # una copa (cuadro): cada ronda
                for label, rows in g["jornadas"].items():
                    rnd = re.sub(r"^.*\(\s*(.*?)\s*\)\s*$", r"\1", label)
                    for r in rows:
                        where[(cat, r[0][:5] if "-" not in r[0][:5] else f"{r[0][:2]}/{r[0][3:5]}",
                               r[6], r[1], r[2])] = (g["name"], None, rnd)
            else:                          # la fase de grupos
                for r in g.get("matches") or []:
                    where[(cat, r[0], r[1], r[2], r[3])] = ("Fase de Grupos", g["name"], None)
                tables += [(cat, g["name"], row) for row in g.get("standings") or []]
    return where, tables


def import_raw(conn, path, log=print):
    import fetch_maspalomas_cup as M
    year = RAW_FILE.match(os.path.basename(path)).group(1)
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    name = f"Maspalomas Cup {year}"
    days = sorted(M.normalize(m)["kickoff"].date().isoformat() for m in raw if m.get("date"))
    conn.execute("""INSERT INTO tournaments(name, edition, organizer, url, first_day, last_day) VALUES (?,?,?,?,?,?)
                    ON CONFLICT(name) DO UPDATE SET first_day=excluded.first_day, last_day=excluded.last_day""",
                 (name, year, "Maspalomas Cup", "https://www.maspalomascup.es", days[0] if days else None,
                  days[-1] if days else None))
    tid = conn.execute("SELECT id FROM tournaments WHERE name=?", (name,)).fetchone()[0]
    try:
        where, tables = structure(raw)
    except Exception as e:           # una edición con otro formato: los partidos, sin estructura
        log(f"    sin estructura de grupos y rondas: {e}")
        where, tables = {}, []
    conn.execute("DELETE FROM tournament_matches WHERE tournament_id=?", (tid,))
    conn.execute("DELETE FROM tournament_standings WHERE tournament_id=?", (tid,))
    placed = 0
    for m in raw:
        n = M.normalize(m)
        cat = m.get("categoryName")
        phase, group, rnd = where.get((cat, n["day"], n["time"], n["home"], n["away"]), (None, None, None))
        placed += phase is not None
        conn.execute("""INSERT OR REPLACE INTO tournament_matches(id, tournament_id, category, match_number, phase,
                            group_name, round, date, time, field, home, away, home_ext_id, away_ext_id, home_score,
                            away_score, status, penalty_winner, penalty_home, penalty_away)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                     (m.get("id"), tid, cat, m.get("matchNumber"), phase, group, rnd,
                      n["kickoff"].date().isoformat(), n["time"], n["field"] or None, n["home"], n["away"],
                      m.get("homeTeamExternalId"), m.get("awayTeamExternalId"), n["hs"], n["as"], m.get("status"),
                      m.get("penaltyWinner"), m.get("penaltyHomeScore"), m.get("penaltyAwayScore")))
    for cat, group, r in tables:
        conn.execute("""INSERT OR REPLACE INTO tournament_standings(tournament_id, category, group_name, position, team,
                            points, played, won, drawn, lost, gf, gc) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                     (tid, cat, group, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]))
    conn.commit()
    return {"matches": len(raw), "placed": placed, "standings": len(tables)}


def import_changed_torneos(conn, folder=SCRIPTS_DIR, log=print):
    """import_raw de cada maspalomas_cup_<año>_raw.json cuya huella haya cambiado."""
    migrate(conn)
    conn.execute("""CREATE TABLE IF NOT EXISTS raw_imports (
        path TEXT PRIMARY KEY, sha1 TEXT NOT NULL, imported_at TEXT NOT NULL)""")
    reports = {}
    for name in sorted(os.listdir(folder)):
        if not RAW_FILE.match(name):
            continue
        with open(os.path.join(folder, name), "rb") as f:
            digest = hashlib.sha1(TORNEOS_VERSION.encode() + f.read()).hexdigest()
        row = conn.execute("SELECT sha1 FROM raw_imports WHERE path=?", (name,)).fetchone()
        if row and row[0] == digest:
            continue
        report = import_raw(conn, os.path.join(folder, name), log=log)
        conn.execute("INSERT OR REPLACE INTO raw_imports(path, sha1, imported_at) VALUES (?, ?, datetime('now'))",
                     (name, digest))
        conn.commit()
        log(f"  {name}: {report['matches']} partidos ({report['placed']} con su fase, grupo o ronda), "
            f"{report['standings']} filas de clasificación")
        reports[name] = report
    return reports


if __name__ == "__main__":
    from db import get_connection
    c = get_connection()
    import_changed_torneos(c)
