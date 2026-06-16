"""TDD — guard de NO-REGRESIÓN en import_fiflp_2425.import_group.

Al re-scrapear comps FIFLP cuyos grupos ya tienen datos buenos en la DB
(p.ej. P*/PGC* rellenados antes desde Wayback), un scrape FIFLP MÁS POBRE
(menos partidos jugados, por timeout o sub-lectura de marcador) NO debe
sobrescribir y empeorar lo existente. import_group debe saltar cuando el
scrape trae menos jugados que lo ya almacenado para ese (temporada, code).
Cuando trae igual o más, sí sobrescribe (asume lectura nueva ≥ antigua).
"""
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))


def _conn():
    import db
    conn = sqlite3.connect(":memory:")
    db.init_db(conn)
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _season(conn):
    return conn.execute(
        "INSERT INTO seasons (name,start_year,end_year,is_current) "
        "VALUES ('2024-2025',2024,2025,0)"
    ).lastrowid


def _g(comp_id, group_name, matches):
    """Construye un grupo en formato raw FIFLP. matches = [(home,away,hs,as)]."""
    return {
        "competition_id": comp_id,
        "group_name": group_name,
        "cat": "benjamin",
        "island": "grancanaria",
        "phase": "Primera Fase",
        "standings": [],
        "jornadas": [{
            "num": "J1",
            "matches": [
                {"home": h, "away": a, "hs": hs, "as": as_,
                 "date": "", "time": "", "venue": ""}
                for (h, a, hs, as_) in matches
            ],
        }],
    }


def _played(conn, code):
    return conn.execute(
        """SELECT COUNT(*) FROM matches m JOIN groups g ON g.id=m.group_id
           WHERE g.code=? AND m.home_score IS NOT NULL""", (code,)
    ).fetchone()[0]


def test_existing_played_count_zero_for_missing_group():
    import import_fiflp_2425 as imp
    conn = _conn(); sid = _season(conn)
    assert imp.existing_played_count(conn, sid, "P1") == 0


def test_existing_played_count_counts_only_scored():
    import import_fiflp_2425 as imp
    conn = _conn(); sid = _season(conn)
    imp.import_group(conn, _g("1576", "GRUPO 1",
                               [("A", "B", 2, 0), ("C", "D", None, None)]), sid)
    assert imp.existing_played_count(conn, sid, "P1") == 1


def test_import_does_not_regress_when_scrape_sparser():
    import import_fiflp_2425 as imp
    conn = _conn(); sid = _season(conn)
    imp.import_group(conn, _g("1576", "GRUPO 1",
                               [("A", "B", 2, 0), ("C", "D", 1, 1), ("E", "F", 3, 2)]), sid)
    assert _played(conn, "P1") == 3
    # scrape más pobre (1 jugado) — NO debe sobrescribir
    imp.import_group(conn, _g("1576", "GRUPO 1", [("A", "B", 2, 0)]), sid)
    assert _played(conn, "P1") == 3


def test_import_overwrites_when_scrape_fuller():
    import import_fiflp_2425 as imp
    conn = _conn(); sid = _season(conn)
    imp.import_group(conn, _g("1576", "GRUPO 1", [("A", "B", 2, 0)]), sid)
    assert _played(conn, "P1") == 1
    imp.import_group(conn, _g("1576", "GRUPO 1",
                               [("A", "B", 2, 0), ("C", "D", 1, 1), ("E", "F", 3, 2)]), sid)
    assert _played(conn, "P1") == 3


def test_import_keeps_existing_when_scrape_equal_count():
    # mismo nº de jugados → CONSERVA lo existente (política conservadora): no
    # reemplazar dato limpio de Wayback por una re-lectura FIFLP que solo empata
    # en completitud (puede sub-leer marcadores ofuscados). Solo gana si trae más.
    import import_fiflp_2425 as imp
    conn = _conn(); sid = _season(conn)
    imp.import_group(conn, _g("1576", "GRUPO 1", [("A", "B", 9, 9)]), sid)
    imp.import_group(conn, _g("1576", "GRUPO 1", [("A", "B", 2, 0)]), sid)
    row = conn.execute(
        """SELECT m.home_score, m.away_score FROM matches m JOIN groups g ON g.id=m.group_id
           WHERE g.code='P1'""").fetchone()
    assert row == (9, 9)  # conserva el primero
