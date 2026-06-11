#!/usr/bin/env python3
"""
DB sanity tests — regressions for the 2026-06-11 data cleanup:
  (a) no score > 50 (parser once captured DOM ids like 41736 as away_score)
  (b) no duplicate matches per group once the jornada label is normalized
      ('Jornada 5' vs '5' — double import of FF1-FF23 in 2025-2026)
  (c) no team-against-itself matches (STEAUA vs STEAUA, id=724079)
  (d) no duplicate cod_acta across matches
  (e) referential integrity (PRAGMA foreign_key_check comes back empty)

Run: python3 -m pytest scripts/tests/test_db_sanity.py -v
"""

import os
import sqlite3

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(ROOT, "futbolbase.db")

MAX_SANE_SCORE = 50


@pytest.fixture(scope="module")
def conn():
    if not os.path.exists(DB_PATH):
        pytest.skip("futbolbase.db not present")
    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA foreign_keys=ON")
    yield con
    con.close()


def test_no_absurd_scores(conn):
    """(a) No home/away score above MAX_SANE_SCORE (legit max in DB is 41)."""
    rows = conn.execute(
        """SELECT m.id, m.home_score, m.away_score
           FROM matches m
           WHERE m.home_score > ? OR m.away_score > ?""",
        (MAX_SANE_SCORE, MAX_SANE_SCORE),
    ).fetchall()
    assert rows == [], (
        f"{len(rows)} matches with score > {MAX_SANE_SCORE} "
        f"(corrupt parser output): {rows[:10]}"
    )


def test_no_duplicate_matches_normalized_jornada(conn):
    """(b) No two matches in the same group with the same home/away pair once
    the jornada label is normalized ('Jornada N' -> 'N')."""
    rows = conn.execute(
        """SELECT group_id,
                  TRIM(REPLACE(jornada, 'Jornada ', '')) AS jnorm,
                  home_team_id, away_team_id, COUNT(*) AS n
           FROM matches
           GROUP BY group_id, jnorm, home_team_id, away_team_id
           HAVING n > 1"""
    ).fetchall()
    assert rows == [], (
        f"{len(rows)} duplicated (group, jornada, home, away) tuples "
        f"after normalizing jornada label: {rows[:10]}"
    )


def test_no_self_matches(conn):
    """(c) No match where a team plays against itself."""
    rows = conn.execute(
        "SELECT id, group_id, home_team_id FROM matches WHERE home_team_id = away_team_id"
    ).fetchall()
    assert rows == [], f"team-against-itself matches found: {rows}"


def test_no_duplicate_cod_acta(conn):
    """(d) Each acta code is attached to at most one match."""
    rows = conn.execute(
        """SELECT cod_acta, COUNT(*) AS n FROM matches
           WHERE cod_acta IS NOT NULL
           GROUP BY cod_acta HAVING n > 1"""
    ).fetchall()
    assert rows == [], f"cod_acta values shared by several matches: {rows[:10]}"


def test_foreign_key_integrity(conn):
    """(e) PRAGMA foreign_key_check returns no violations."""
    rows = conn.execute("PRAGMA foreign_key_check").fetchall()
    assert rows == [], f"foreign key violations: {rows[:10]}"
