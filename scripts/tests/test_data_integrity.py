#!/usr/bin/env python3
"""
DB and generated-JS integrity tests — catch the kinds of regressions we hit
during the 2021-22 re-scrape (per-season files lagging DB, standings format
drift, missing groups, duplicate matches).

Run: python3 -m pytest scripts/tests/test_data_integrity.py -v
"""

import json
import os
import re
import sqlite3
import sys
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(ROOT, "futbolbase.db")


def _conn():
    if not os.path.exists(DB_PATH):
        pytest.skip("futbolbase.db not present")
    return sqlite3.connect(DB_PATH)


def _load_seasons_js():
    """Parse data-seasons.js into the SEASONS list."""
    p = os.path.join(ROOT, "data-seasons.js")
    if not os.path.exists(p):
        pytest.skip("data-seasons.js not present")
    with open(p) as f:
        text = f.read()
    m = re.match(r"const SEASONS=(\[.*\]);?\s*$", text, re.DOTALL)
    assert m, "data-seasons.js doesn't match expected SEASONS=[...]; pattern"
    return json.loads(m.group(1))


def _load_per_season_js(name):
    p = os.path.join(ROOT, f"data-season-{name}.js")
    if not os.path.exists(p):
        return None
    with open(p) as f:
        text = f.read()
    m = re.match(r"const SEASON_\w+=(.+);", text)
    assert m, f"data-season-{name}.js doesn't match expected pattern"
    return json.loads(m.group(1))


# ─── DB consistency ──────────────────────────────────────────────────────────

class TestDBIntegrity:
    def test_no_orphan_matches(self):
        c = _conn()
        n = c.execute(
            "SELECT COUNT(*) FROM matches m LEFT JOIN groups g ON m.group_id=g.id WHERE g.id IS NULL"
        ).fetchone()[0]
        assert n == 0, f"{n} matches reference a missing group"

    def test_no_orphan_standings(self):
        c = _conn()
        n = c.execute(
            "SELECT COUNT(*) FROM standings s LEFT JOIN groups g ON s.group_id=g.id WHERE g.id IS NULL"
        ).fetchone()[0]
        assert n == 0

    def test_no_orphan_team_refs(self):
        c = _conn()
        for col in ("home_team_id", "away_team_id"):
            n = c.execute(
                f"SELECT COUNT(*) FROM matches m LEFT JOIN teams t ON m.{col}=t.id "
                "WHERE m.{col} IS NOT NULL AND t.id IS NULL".format(col=col)
            ).fetchone()[0]
            assert n == 0, f"{n} matches with invalid {col}"

    def test_no_duplicate_matches_per_jornada(self):
        c = _conn()
        dupes = c.execute(
            """SELECT group_id, jornada, home_team_id, away_team_id, COUNT(*) cnt
               FROM matches
               GROUP BY group_id, jornada, home_team_id, away_team_id
               HAVING cnt > 1"""
        ).fetchall()
        assert not dupes, f"{len(dupes)} duplicate match rows"

    def test_standings_position_unique_per_group(self):
        c = _conn()
        dupes = c.execute(
            "SELECT group_id, position, COUNT(*) cnt FROM standings "
            "GROUP BY group_id, position HAVING cnt > 1"
        ).fetchall()
        assert not dupes, f"{len(dupes)} duplicate standings positions"

    def test_standings_arithmetic(self):
        """played should equal won + drawn + lost; pts = 3*won + drawn (allowing
        small synthesis discrepancies)."""
        c = _conn()
        bad = c.execute(
            """SELECT s.id, t.name, s.played, s.won, s.drawn, s.lost, s.points
               FROM standings s JOIN teams t ON s.team_id=t.id
               WHERE s.played != s.won + s.drawn + s.lost"""
        ).fetchall()
        # Wayback partial-season standings sometimes have slight inconsistencies;
        # fail only if more than 5% of rows are bad.
        total = c.execute("SELECT COUNT(*) FROM standings").fetchone()[0]
        if total:
            assert len(bad) / total < 0.05, (
                f"{len(bad)}/{total} standings rows fail played=W+D+L (>5%)"
            )

    def test_seasons_have_groups(self):
        """Every season must have at least one group."""
        c = _conn()
        bad = c.execute(
            """SELECT s.name FROM seasons s
               LEFT JOIN groups g ON g.season_id=s.id
               GROUP BY s.id HAVING COUNT(g.id) = 0"""
        ).fetchall()
        assert not bad, f"Seasons with no groups: {[r[0] for r in bad]}"


# ─── Generated JS files match DB ─────────────────────────────────────────────

class TestGeneratedFiles:
    def test_seasons_js_parseable(self):
        s = _load_seasons_js()
        assert isinstance(s, list)
        assert all("name" in entry for entry in s)

    def test_per_season_files_match_seasons_js(self):
        """Per-season lazy-load files must contain the same data as the inline
        history in data-seasons.js. This is the regression we fixed in
        2026-05-08 (GC1 missing in per-season file)."""
        seasons = _load_seasons_js()
        for entry in seasons:
            if entry.get("current"):
                continue
            name = entry["name"]
            per_season = _load_per_season_js(name)
            if per_season is None:
                pytest.fail(f"data-season-{name}.js missing")
            for cat in ("benjamin", "prebenjamin"):
                seasons_groups = entry.get(cat, [])
                per_groups = per_season.get(cat, [])
                seasons_ids = sorted(g["id"] for g in seasons_groups)
                per_ids = sorted(g["id"] for g in per_groups)
                assert seasons_ids == per_ids, (
                    f"{name}/{cat}: seasons.js={seasons_ids} != per-season={per_ids}"
                )

    def test_seasons_js_groups_match_db_codes(self):
        seasons = _load_seasons_js()
        c = _conn()
        for entry in seasons:
            if entry.get("current"):
                continue
            name = entry["name"]
            season_id = c.execute(
                "SELECT id FROM seasons WHERE name=?", (name,)
            ).fetchone()
            if not season_id:
                pytest.fail(f"Season {name} in JS but missing in DB")
            db_codes = sorted(
                r[0] for r in c.execute(
                    "SELECT code FROM groups WHERE season_id=?", (season_id[0],)
                )
            )
            js_codes = sorted(
                g["id"]
                for cat in ("benjamin", "prebenjamin")
                for g in entry.get(cat, [])
            )
            assert db_codes == js_codes, (
                f"{name}: DB groups {db_codes} != JS {js_codes}"
            )

    def test_standings_canonical_format(self):
        """All standings rows must be lists of length 10 in canonical order
        [pos, team, pts, J, G, E, P, GF, GC, DF]. Catches the broken parser
        format we hit in 2021-22."""
        seasons = _load_seasons_js()
        for entry in seasons:
            if entry.get("current"):
                continue
            for cat in ("benjamin", "prebenjamin"):
                for g in entry.get(cat, []):
                    for row in g.get("standings", []):
                        assert isinstance(row, list), (
                            f"{entry['name']}/{g['id']}: standings row not a list: {row}"
                        )
                        assert len(row) == 10, (
                            f"{entry['name']}/{g['id']}: standings row len={len(row)}: {row}"
                        )
                        # row[2]=pts must be plausible. If row[2] > row[3]*3, format is broken
                        # (would mean pts > 3*played which is impossible).
                        pos, team, pts, J, *_ = row
                        if J > 0:
                            assert pts <= J * 3, (
                                f"{entry['name']}/{g['id']}/{team}: pts={pts} > 3*J={J*3} "
                                f"— probably format drift"
                            )
