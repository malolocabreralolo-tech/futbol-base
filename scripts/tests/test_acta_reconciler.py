#!/usr/bin/env python3
"""Tests for acta_reconciler: map an acta header to a matches.id."""
import sqlite3
import pytest
import os
import shutil

from scripts.acta_reconciler import reconcile_acta, normalize_team_name

# Match the path-resolution pattern used in scripts/tests/test_data_integrity.py
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(ROOT, "futbolbase.db")


def test_normalize_team_name_strips_decoration():
    assert normalize_team_name('Las Mesas Huracan "A"') == normalize_team_name("Las Mesas Huracán")
    assert normalize_team_name("REAL CLUB 'B'") == normalize_team_name("real club b")


@pytest.fixture
def db(tmp_path):
    if not os.path.exists(DB_PATH):
        pytest.skip("futbolbase.db not present")
    dst = tmp_path / "fb.db"
    shutil.copy(DB_PATH, dst)
    conn = sqlite3.connect(str(dst))
    from scripts.migrate_actas_schema import migrate
    migrate(conn)
    return conn


def test_reconcile_match_via_real_db(db):
    cur = db.cursor()
    row = cur.execute("""
      SELECT m.id, s.name, t1.name, t2.name, m.date, m.home_score, m.away_score
        FROM matches m
        JOIN groups g ON g.id=m.group_id
        JOIN seasons s ON s.id=g.season_id
        JOIN teams t1 ON t1.id=m.home_team_id
        JOIN teams t2 ON t2.id=m.away_team_id
       WHERE m.home_score IS NOT NULL
       LIMIT 1
    """).fetchone()
    assert row, "no matches in DB to test against"
    mid, season, h, a, date, hs, asc_ = row
    header = {
        "season": season.replace("-", "/"),
        "home_team": h.upper(),
        "away_team": a.upper(),
        "date": date,
        "home_score": hs,
        "away_score": asc_,
    }
    matched = reconcile_acta(db, header)
    assert matched == mid


def test_reconcile_returns_none_when_ambiguous(db):
    header = {
        "season": "9999/9999",
        "home_team": "DOES NOT EXIST",
        "away_team": "NEITHER",
        "date": "01/01/1900",
        "home_score": 0,
        "away_score": 0,
    }
    assert reconcile_acta(db, header) is None
