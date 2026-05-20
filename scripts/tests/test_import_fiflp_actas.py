#!/usr/bin/env python3
"""Tests for import_fiflp_actas: raw JSON -> DB (idempotent)."""
import sqlite3
import shutil
import json
import pytest
import os

from scripts.import_fiflp_actas import import_raw
from scripts.migrate_actas_schema import migrate

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(ROOT, "futbolbase.db")


@pytest.fixture
def db(tmp_path):
    if not os.path.exists(DB_PATH):
        pytest.skip("futbolbase.db not present")
    dst = tmp_path / "fb.db"
    shutil.copy(DB_PATH, dst)
    conn = sqlite3.connect(str(dst))
    migrate(conn)
    return conn


def _real_match(db):
    return db.execute("""
      SELECT m.id, s.name, t1.name, t2.name, m.date, m.home_score, m.away_score
        FROM matches m
        JOIN groups g ON g.id=m.group_id
        JOIN seasons s ON s.id=g.season_id
        JOIN teams t1 ON t1.id=m.home_team_id
        JOIN teams t2 ON t2.id=m.away_team_id
       WHERE m.home_score IS NOT NULL
       LIMIT 1
    """).fetchone()


def _raw_for(real, cod_acta=999991):
    mid, season, h, a, date, hs, asc_ = real
    return {str(cod_acta): {
        "cod_acta": cod_acta,
        "header": {
            "season": season.replace("-", "/"),
            "jornada": "1",
            "date": date,
            "home_team": h,
            "away_team": a,
            "home_score": hs,
            "away_score": asc_,
            "competition": "test",
        },
        "lineups": {
            "home": [
                {"name": "PEREZ, JUAN", "dorsal": 1, "role": "starter"},
                {"name": "LOPEZ, LUIS", "dorsal": 2, "role": "sub"},
            ],
            "away": [
                {"name": "GOMEZ, RAUL", "dorsal": 1, "role": "starter"},
            ],
        },
        "events": [
            {"kind": "goal", "side": "home", "player_name": "PEREZ, JUAN",
             "minute": 12, "goal_type": "normal"},
            {"kind": "yellow", "side": "away", "player_name": "GOMEZ, RAUL",
             "minute": 40},
        ],
        "staff": {
            "referee": "ARBITRO TEST",
            "coach_home": "COACH H",
            "coach_away": "COACH A",
        },
    }}


def test_import_inserts_and_reconciles(db, tmp_path):
    real = _real_match(db)
    assert real
    raw = _raw_for(real)
    raw_path = tmp_path / "raw.json"
    raw_path.write_text(json.dumps(raw), encoding="utf-8")
    report = import_raw(db, str(raw_path))
    assert report["matched"] == 1 and report["unmatched"] == 0
    mid = real[0]
    # cod_acta set on the match
    assert db.execute(
        "SELECT cod_acta FROM matches WHERE id=?", (mid,)
    ).fetchone()[0] == 999991
    # appearances inserted (3 players total)
    n = db.execute(
        "SELECT COUNT(*) FROM appearances WHERE match_id=?", (mid,)
    ).fetchone()[0]
    assert n == 3
    # goal event present
    g = db.execute(
        "SELECT COUNT(*) FROM match_events WHERE match_id=? AND kind='goal'", (mid,)
    ).fetchone()[0]
    assert g == 1
    # staff present (referee + 2 coaches = 3)
    s = db.execute(
        "SELECT COUNT(*) FROM match_staff WHERE match_id=?", (mid,)
    ).fetchone()[0]
    assert s == 3
    # invariant: appearances.goals == count of goal events for each player
    rows = db.execute("""
      SELECT p.norm_name, a.goals,
             (SELECT COUNT(*) FROM match_events me
               WHERE me.match_id=a.match_id
                 AND me.player_id=a.player_id
                 AND me.kind='goal')
        FROM appearances a
        JOIN players p ON p.id=a.player_id
       WHERE a.match_id=?
    """, (mid,)).fetchall()
    for nm, ag, eg in rows:
        assert ag == eg, f"{nm}: appearances.goals={ag} but events={eg}"


def test_import_is_idempotent(db, tmp_path):
    real = _real_match(db)
    assert real
    raw_path = tmp_path / "raw.json"
    raw_path.write_text(json.dumps(_raw_for(real)), encoding="utf-8")
    r1 = import_raw(db, str(raw_path))
    r2 = import_raw(db, str(raw_path))
    assert r1["matched"] == r2["matched"] == 1
    mid = real[0]
    # No duplicate rows on re-import
    assert db.execute(
        "SELECT COUNT(*) FROM appearances WHERE match_id=?", (mid,)
    ).fetchone()[0] == 3
    assert db.execute(
        "SELECT COUNT(*) FROM match_events WHERE match_id=?", (mid,)
    ).fetchone()[0] == 2
