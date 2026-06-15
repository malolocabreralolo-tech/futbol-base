"""Regression tests — revisión 2026-06-15 #12.

import_wayback_2122/2223/2324.py hacían `DELETE FROM matches WHERE group_id=?`
directo. Con FK ON (db.get_connection lo activa) y filas hijas (goals/appearances/
match_events/match_staff) referenciando esos matches, ese DELETE CRASHEA. Deben
limpiar las tablas hijas ANTES, vía el helper compartido db.delete_group_matches
(patrón ACTA_CHILD_TABLES, ya usado por import_fiflp.py).
"""
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))


def _conn():
    import db
    conn = sqlite3.connect(":memory:")
    db.init_db(conn)  # base schema: goals.match_id REFERENCES matches(id)
    # tabla de actas que añade migrate_actas_schema.py (también con FK a matches)
    conn.execute(
        """CREATE TABLE appearances (
             id INTEGER PRIMARY KEY, match_id INTEGER NOT NULL REFERENCES matches(id),
             team_id INTEGER, player_id INTEGER, dorsal INTEGER, role TEXT)"""
    )
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _seed(conn):
    sid = conn.execute(
        "INSERT INTO seasons (name,start_year,end_year,is_current) VALUES ('2023-2024',2023,2024,0)"
    ).lastrowid
    cid = conn.execute("INSERT INTO categories (name) VALUES ('BENJAMIN')").lastrowid
    gid = conn.execute(
        "INSERT INTO groups (season_id,category_id,code) VALUES (?,?,'GC1')", (sid, cid)
    ).lastrowid
    t1 = conn.execute("INSERT INTO teams (name) VALUES ('A')").lastrowid
    t2 = conn.execute("INSERT INTO teams (name) VALUES ('B')").lastrowid
    mid = conn.execute(
        "INSERT INTO matches (group_id,jornada,home_team_id,away_team_id,home_score,away_score) "
        "VALUES (?,?,?,?,?,?)", (gid, "J1", t1, t2, 2, 0)
    ).lastrowid
    conn.execute("INSERT INTO goals (match_id,minute,player_name,side,type) VALUES (?,10,'X','h','goal')", (mid,))
    conn.execute("INSERT INTO appearances (match_id,team_id,player_id,dorsal,role) VALUES (?,?,1,7,'starter')", (mid, t1))
    conn.commit()
    return gid


def test_direct_delete_matches_crashes_with_fk_on():
    """Premisa: con FK ON, borrar matches con hijas referenciándolos revienta."""
    conn = _conn()
    gid = _seed(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("DELETE FROM matches WHERE group_id=?", (gid,))


def test_delete_group_matches_cleans_children_first():
    from db import delete_group_matches
    conn = _conn()
    gid = _seed(conn)
    delete_group_matches(conn, gid)  # no debe crashear
    assert conn.execute("SELECT COUNT(*) FROM matches").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM goals").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM appearances").fetchone()[0] == 0


@pytest.mark.parametrize("fname", [
    "import_wayback_2122.py", "import_wayback_2223.py", "import_wayback_2324.py",
])
def test_wayback_importer_uses_shared_delete(fname):
    src = (ROOT / "scripts" / fname).read_text(encoding="utf-8")
    assert "delete_group_matches" in src, f"{fname} debe usar delete_group_matches"
    assert "DELETE FROM matches" not in src, f"{fname} no debe hacer DELETE FROM matches directo"
