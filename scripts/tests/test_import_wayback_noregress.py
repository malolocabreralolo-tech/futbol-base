"""TDD — guard de NO-REGRESIÓN en import_wayback_2425.import_group.

import_wayback_2425 corre DESPUÉS de import_fiflp en el pipeline de
fetch-fiflp.yml. Sin guard, re-importaría grupos P7/P13/P14/PGC* a sus counts
escasos de Wayback, DESHACIENDO los rellenos que FIFLP (lectura robusta H2)
acaba de aportar. Debe aplicar la misma política conservadora que FIFLP: solo
sobrescribir cuando el scrape trae ESTRICTAMENTE más jugados; igual o menos →
conservar lo existente.
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


def _g(slug, matches):
    """Grupo en formato raw Wayback. matches = [(home,away,hs,as_)].
    OJO: Wayback usa la clave 'as_' (no 'as')."""
    return {
        "slug": slug,
        "category": "benjamin",
        "phase": "Primera Fase",
        "island": "gran_canaria",
        "url": "",
        "standings": [],
        "jornadas": [{
            "num": "1",
            "matches": [
                {"home": h, "away": a, "hs": hs, "as_": as_,
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


def test_wayback_does_not_regress_when_scrape_sparser():
    import import_wayback_2425 as imp
    conn = _conn(); sid = _season(conn)
    # estado existente: 3 jugados (simula relleno FIFLP previo)
    imp.import_group(conn, _g("1benjamin7",
                              [("A", "B", 2, 0), ("C", "D", 1, 1), ("E", "F", 3, 2)]), sid)
    assert _played(conn, "P7") == 3
    # Wayback escaso (1 jugado) — NO debe regresar
    imp.import_group(conn, _g("1benjamin7", [("A", "B", 2, 0)]), sid)
    assert _played(conn, "P7") == 3


def test_wayback_keeps_existing_when_equal_count():
    import import_wayback_2425 as imp
    conn = _conn(); sid = _season(conn)
    imp.import_group(conn, _g("1benjamin7", [("A", "B", 9, 9)]), sid)
    imp.import_group(conn, _g("1benjamin7", [("A", "B", 2, 0)]), sid)
    row = conn.execute(
        """SELECT m.home_score, m.away_score FROM matches m JOIN groups g ON g.id=m.group_id
           WHERE g.code='P7'""").fetchone()
    assert row == (9, 9)  # conserva el primero


def test_wayback_overwrites_when_scrape_fuller():
    import import_wayback_2425 as imp
    conn = _conn(); sid = _season(conn)
    imp.import_group(conn, _g("1benjamin7", [("A", "B", 2, 0)]), sid)
    assert _played(conn, "P7") == 1
    imp.import_group(conn, _g("1benjamin7",
                              [("A", "B", 2, 0), ("C", "D", 1, 1), ("E", "F", 3, 2)]), sid)
    assert _played(conn, "P7") == 3
