#!/usr/bin/env python3
"""Regression tests for the actas/importers fixes (agente PY-ACTAS, 2026-06-11).

All tests use SYNTHETIC SQLite DBs built in tmp_path — never the repo
futbolbase.db. Schema comes from scripts/db.py (init_db) plus
scripts/migrate_actas_schema.py (actas tables).

Covers:
  1. acta_reconciler: single-candidate acceptance must validate date/score;
     _names_match requires >= 2 common tokens (except 1-token names).
  2. fetch_fiflp_actas: empty-parse actas are not persisted as done and are
     purged from the resume state; purge_empty_actas CLI cleans raw JSONs.
  3. import_fiflp / import_fiflp_2425 / import_wayback_2425: FK-safe
     transactional group reimport (children deleted first, single commit,
     rollback on failure, skip on empty scrape).
  4. import_fiflp_actas: CLI works without PYTHONPATH; duplicate cod_acta
     detection; orphan cod_acta cleanup.
  5. synth_copa_campeones: J counts only played matches.
"""
import json
import os
import sqlite3
import subprocess
import sys

import pytest

from scripts.acta_reconciler import reconcile_acta, normalize_team_name, _names_match
from scripts.db import (init_db, get_or_create_season, get_or_create_category,
                        get_or_create_team, get_or_create_group)
from scripts.migrate_actas_schema import migrate
from scripts.import_fiflp_actas import import_raw
from scripts.synth_copa_campeones import synth_group
import scripts.fetch_fiflp_actas as ffa
import scripts.import_fiflp as imp_2526
import scripts.import_fiflp_2425 as imp_2425
import scripts.import_wayback_2425 as imp_wb

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ---------------------------------------------------------------------------
# Synthetic DB helpers
# ---------------------------------------------------------------------------

def _mk_db(tmp_path, name="synth.db", fk=True):
    conn = sqlite3.connect(str(tmp_path / name))
    if fk:
        conn.execute("PRAGMA foreign_keys=ON")
    init_db(conn)
    migrate(conn)
    return conn


def _seed_match(conn, season="2025-2026", code="A1", home="Unión Viera",
                away="CD Goleta", date="2025-11-29", hs=19, as_=0, jornada="1"):
    """Create season/category/group/teams and one match. Returns match id."""
    sid = get_or_create_season(conn, season, int(season[:4]), int(season[5:9]))
    cid = get_or_create_category(conn, "BENJAMIN")
    gid = get_or_create_group(conn, sid, cid, code, name="Grupo 1")
    hid = get_or_create_team(conn, home)
    aid = get_or_create_team(conn, away)
    cur = conn.execute(
        """INSERT INTO matches (group_id, jornada, date, time, home_team_id,
                                away_team_id, home_score, away_score, venue)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (gid, jornada, date, "", hid, aid, hs, as_, ""),
    )
    conn.commit()
    return cur.lastrowid


def _add_acta_children(conn, mid, team_id, player="PEREZ, JUAN"):
    """Insert appearances/match_events/match_staff/goals referencing a match."""
    norm = player.upper()
    r = conn.execute("SELECT id FROM players WHERE norm_name=?", (norm,)).fetchone()
    if r:
        pid = r[0]
    else:
        pid = conn.execute(
            "INSERT INTO players (full_name, norm_name) VALUES (?,?)", (player, norm)
        ).lastrowid
    conn.execute(
        "INSERT INTO appearances (match_id, team_id, player_id, role) VALUES (?,?,?,'starter')",
        (mid, team_id, pid),
    )
    conn.execute(
        "INSERT INTO match_events (match_id, team_id, player_id, kind) VALUES (?,?,?,'goal')",
        (mid, team_id, pid),
    )
    conn.execute(
        "INSERT INTO match_staff (match_id, team_id, kind, name) VALUES (?,?,'coach','COACH X')",
        (mid, team_id),
    )
    conn.execute(
        "INSERT INTO goals (match_id, minute, player_name, side) VALUES (?,10,?,'home')",
        (mid, player),
    )
    conn.commit()
    return pid


# ===========================================================================
# Fix 1 — acta_reconciler: single candidate must not contradict date/score
# ===========================================================================

def test_reconcile_rejects_single_candidate_with_contradictory_header(tmp_path):
    """Repro from the review: header date 01/01/1999 and score 99-99 matched a
    real 2025-11-29 19-0 game just because the names matched uniquely."""
    conn = _mk_db(tmp_path)
    _seed_match(conn)  # Unión Viera 19-0 CD Goleta, 2025-11-29
    header = {
        "season": "2025/2026",
        "home_team": "UNION VIERA",
        "away_team": "GOLETA, C.D.",
        "date": "01/01/1999",
        "home_score": 99,
        "away_score": 99,
    }
    assert reconcile_acta(conn, header) is None


def test_reconcile_rejects_on_score_contradiction_when_date_unparseable(tmp_path):
    """DB dates are often 'DD/MM' (unparseable): the score check alone must
    still reject a contradictory single candidate."""
    conn = _mk_db(tmp_path)
    _seed_match(conn, date="29/11")  # DD/MM date — cannot be compared
    header = {
        "season": "2025/2026",
        "home_team": "UNION VIERA",
        "away_team": "GOLETA, C.D.",
        "date": "01/01/1999",
        "home_score": 99,
        "away_score": 99,
    }
    assert reconcile_acta(conn, header) is None


def test_reconcile_accepts_legit_acta(tmp_path):
    """A consistent acta (date and score agree) must still reconcile."""
    conn = _mk_db(tmp_path)
    mid = _seed_match(conn)
    header = {
        "season": "2025/2026",
        "home_team": "UNION VIERA",
        "away_team": "GOLETA, C.D.",
        "date": "29/11/2025",
        "home_score": 19,
        "away_score": 0,
    }
    assert reconcile_acta(conn, header) == mid


def test_reconcile_accepts_unique_candidate_without_date_or_score(tmp_path):
    """No validating info in the header -> single candidate is still accepted
    (previous behaviour preserved when nothing contradicts)."""
    conn = _mk_db(tmp_path)
    mid = _seed_match(conn)
    header = {
        "season": "2025/2026",
        "home_team": "UNION VIERA",
        "away_team": "GOLETA, C.D.",
        "date": None,
        "home_score": None,
        "away_score": None,
    }
    assert reconcile_acta(conn, header) == mid


def test_names_match_requires_two_common_tokens():
    """'viera' vs 'garepa viera' (different clubs) must NOT match: the token
    subset rule requires >= 2 tokens, as its own comment always claimed."""
    assert not _names_match("viera", "garepa viera")
    assert not _names_match("sporting", "real sporting")
    # >= 2 common tokens still matches (word-order / subset rescue)
    assert _names_match("la garita", "garita la")
    assert _names_match("las mesas huracan", "mesas huracan")


def test_one_token_names_still_match(tmp_path):
    """1-token names keep working via the equality path."""
    assert normalize_team_name("ARUCAS, C.F.") == normalize_team_name("Arucas CF") == "arucas"
    conn = _mk_db(tmp_path)
    mid = _seed_match(conn, home="Arucas CF", away="UD Moya", date="29/11", hs=2, as_=1)
    header = {
        "season": "2025/2026",
        "home_team": "ARUCAS, C.F.",
        "away_team": "MOYA, U.D.",
        "date": None,
        "home_score": 2,
        "away_score": 1,
    }
    assert reconcile_acta(conn, header) == mid


# ===========================================================================
# Fix 2 — fetch_fiflp_actas: empty parses must not be persisted as done
# ===========================================================================

_EMPTY_ACTA = {
    "header": {"season": None, "jornada": None, "date": None, "home_team": None,
               "away_team": None, "home_score": None, "away_score": None,
               "competition": None},
    "lineups": {"home": [], "away": []},
    "events": [],
    "staff": {"referee": None, "coach_home": None, "coach_away": None},
    "cod_acta": 125781,
    "enumeration": {"comp_id": "891", "grupo": "125780", "jornada": "1"},
}

_GOOD_ACTA = {
    "header": {"season": "2025/2026", "jornada": "1", "date": "29/11/2025",
               "home_team": "UNION VIERA", "away_team": "GOLETA, C.D.",
               "home_score": 19, "away_score": 0, "competition": "test"},
    "lineups": {"home": [{"name": "PEREZ, JUAN", "dorsal": 1, "role": "starter"}],
                "away": []},
    "events": [],
    "staff": {"referee": None, "coach_home": None, "coach_away": None},
    "cod_acta": 240000,
    "enumeration": {"comp_id": "1", "grupo": "2", "jornada": "1"},
}


def test_is_empty_acta_predicate():
    from scripts.fetch_fiflp_actas import is_empty_acta
    assert is_empty_acta(_EMPTY_ACTA)
    assert is_empty_acta(None)
    assert not is_empty_acta(_GOOD_ACTA)


def test_load_raw_purges_empty_entries(tmp_path, monkeypatch):
    """Resume state must NOT treat empty actas as done: load_raw drops them so
    they are re-enumerated as pending."""
    raw_file = tmp_path / "fiflp_actas_2025-2026_raw.json"
    raw_file.write_text(json.dumps({"125781": _EMPTY_ACTA, "240000": _GOOD_ACTA}),
                        encoding="utf-8")
    monkeypatch.setattr(ffa, "raw_path", lambda sc: raw_file)
    raw = ffa.load_raw("21")
    assert "240000" in raw
    assert "125781" not in raw, "empty acta must be purged from resume state"


def test_purge_empty_actas_cli(tmp_path):
    import importlib
    purge = importlib.import_module("scripts.purge_empty_actas")
    raw_file = tmp_path / "raw.json"
    raw_file.write_text(json.dumps({"125781": _EMPTY_ACTA, "240000": _GOOD_ACTA}),
                        encoding="utf-8")
    n = purge.purge_file(str(raw_file))
    assert n == 1
    data = json.loads(raw_file.read_text(encoding="utf-8"))
    assert list(data.keys()) == ["240000"]
    # Idempotent
    assert purge.purge_file(str(raw_file)) == 0


# ===========================================================================
# Fix 3 — importers: FK-safe transactional reimport per group
# ===========================================================================

def _g_2425(jornadas=None, standings=None):
    return {
        "competition_id": "1576", "group_name": "GRUPO 1", "cat": "benjamin",
        "phase": "Primera Fase", "island": "gran_canaria",
        "standings": standings if standings is not None else [
            {"team": "Equipo Uno", "pos": 1, "pts": 3, "j": 1, "g": 1, "e": 0,
             "p": 0, "gf": 2, "gc": 1, "df": 1},
        ],
        "jornadas": jornadas if jornadas is not None else [
            {"num": "1", "matches": [
                {"home": "Equipo Uno", "away": "Equipo Dos", "hs": 2, "as": 1,
                 "date": "15-12-2024", "time": "10:00", "venue": "Campo"},
            ]},
        ],
    }


def _g_2526(jornadas=None, standings=None):
    g = _g_2425(jornadas, standings)
    g["competition_id"] = "54422885"  # -> prefix P (Fase Previa GC)
    return g


def _g_wayback(jornadas=None, standings=None):
    return {
        "slug": "1benjamin1", "category": "benjamin", "phase": "Primera Fase GC",
        "island": "gran_canaria", "url": "",
        "standings": standings if standings is not None else [
            {"team": "Equipo Uno", "pos": 1, "pts": 3, "j": 1, "g": 1, "e": 0,
             "p": 0, "gf": 2, "gc": 1, "df": 1},
        ],
        "jornadas": jornadas if jornadas is not None else [
            {"num": "1", "matches": [
                {"home": "Equipo Uno", "away": "Equipo Dos", "hs": 2, "as_": 1,
                 "date": "2024-12-15", "time": "10:00", "venue": "Campo"},
            ]},
        ],
    }


def _seed_for_importer(conn, season, code, with_children=True):
    mid = _seed_match(conn, season=season, code=code, home="Equipo Uno",
                      away="Equipo Dos", date="01/01", hs=3, as_=2)
    gid, hid = conn.execute(
        "SELECT group_id, home_team_id FROM matches WHERE id=?", (mid,)
    ).fetchone()
    conn.execute(
        """INSERT INTO standings (group_id, team_id, position, points, played,
                                  won, drawn, lost, gf, gc, gd)
           VALUES (?,?,1,3,1,1,0,0,3,2,1)""",
        (gid, hid),
    )
    if with_children:
        _add_acta_children(conn, mid, hid)
    conn.commit()
    sid = conn.execute("SELECT season_id FROM groups WHERE id=?", (gid,)).fetchone()[0]
    return sid, gid, mid


@pytest.mark.parametrize("mod,gmaker,season,code", [
    (imp_2425, _g_2425, "2024-2025", "P1"),
    (imp_2526, _g_2526, "2025-2026", "P1"),
    (imp_wb,   _g_wayback, "2024-2025", "P1"),
])
def test_import_group_with_acta_children_does_not_crash(tmp_path, mod, gmaker, season, code):
    """With FK ON and appearances/events/staff/goals referencing the group's
    matches, reimporting the group must not raise IntegrityError."""
    conn = _mk_db(tmp_path)
    sid, gid, _mid = _seed_for_importer(conn, season, code, with_children=True)
    mod.import_group(conn, gmaker(), sid)  # must NOT raise
    # children of the old (replaced) matches are gone
    for tbl in ("appearances", "match_events", "match_staff", "goals"):
        n = conn.execute(
            f"SELECT COUNT(*) FROM {tbl} WHERE match_id NOT IN (SELECT id FROM matches)"
        ).fetchone()[0]
        assert n == 0, f"orphaned rows left in {tbl}"
    # new match data present
    n = conn.execute("SELECT COUNT(*) FROM matches WHERE group_id=?", (gid,)).fetchone()[0]
    assert n == 1


@pytest.mark.parametrize("mod,gmaker,season,code", [
    (imp_2425, _g_2425, "2024-2025", "P1"),
    (imp_2526, _g_2526, "2025-2026", "P1"),
])
def test_import_group_rolls_back_on_midway_failure(tmp_path, monkeypatch, mod, gmaker, season, code):
    """A crash between the DELETE and the INSERTs must leave the group intact
    (single transaction per group; the DELETE is not committed on its own)."""
    conn = _mk_db(tmp_path)
    sid, gid, mid = _seed_for_importer(conn, season, code, with_children=False)

    def boom(_):
        raise RuntimeError("simulated crash mid-import")
    monkeypatch.setattr(mod, "fmt_date", boom)

    with pytest.raises(RuntimeError):
        mod.import_group(conn, gmaker(), sid)

    rows = conn.execute(
        "SELECT id FROM matches WHERE group_id=?", (gid,)
    ).fetchall()
    assert rows == [(mid,)], "original matches must survive a mid-import crash"
    n = conn.execute("SELECT COUNT(*) FROM standings WHERE group_id=?", (gid,)).fetchone()[0]
    assert n == 1, "original standings must survive a mid-import crash"


@pytest.mark.parametrize("mod,gmaker,season,code", [
    (imp_2425, _g_2425, "2024-2025", "P1"),
    (imp_2526, _g_2526, "2025-2026", "P1"),
    (imp_wb,   _g_wayback, "2024-2025", "P1"),
])
def test_import_group_skips_empty_scrape(tmp_path, capsys, mod, gmaker, season, code):
    """A scrape with 0 matches (partial-timeout signature) must NOT wipe the
    group's existing data; it skips with a warning."""
    conn = _mk_db(tmp_path)
    sid, gid, mid = _seed_for_importer(conn, season, code, with_children=False)
    mod.import_group(conn, gmaker(jornadas=[]), sid)
    rows = conn.execute("SELECT id FROM matches WHERE group_id=?", (gid,)).fetchall()
    assert rows == [(mid,)], "existing matches must be preserved on empty scrape"
    n = conn.execute("SELECT COUNT(*) FROM standings WHERE group_id=?", (gid,)).fetchone()[0]
    assert n == 1, "existing standings must be preserved on empty scrape"
    assert "SKIP" in capsys.readouterr().out


def test_delete_group_matches_helper_clears_children(tmp_path):
    """Shared helper (also used by the legacy fiflp_A2 cleanup in
    import_fiflp_2425.main) deletes children before matches, without commit."""
    conn = _mk_db(tmp_path)
    sid, gid, mid = _seed_for_importer(conn, "2024-2025", "P1", with_children=True)
    imp_2425.delete_group_matches(conn, gid)  # must not raise with FK ON
    assert conn.execute("SELECT COUNT(*) FROM matches WHERE group_id=?", (gid,)).fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM appearances").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM goals").fetchone()[0] == 0
    # caller controls the transaction: rollback restores everything
    conn.rollback()
    assert conn.execute("SELECT COUNT(*) FROM matches WHERE group_id=?", (gid,)).fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM appearances").fetchone()[0] == 1


# ===========================================================================
# Fix 4 — import_fiflp_actas: CLI sys.path, duplicate detection, orphans
# ===========================================================================

def test_cli_runs_without_modulenotfounderror():
    """`python3 scripts/import_fiflp_actas.py` (docstring usage) must reach
    main() and print usage — not die with ModuleNotFoundError."""
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    res = subprocess.run(
        [sys.executable, os.path.join("scripts", "import_fiflp_actas.py")],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=60,
    )
    combined = res.stdout + res.stderr
    assert "ModuleNotFoundError" not in combined, combined
    assert "usage" in combined.lower()


def _write_raw(tmp_path, actas: dict):
    p = tmp_path / "raw.json"
    p.write_text(json.dumps(actas), encoding="utf-8")
    return str(p)


def _acta_for(home, away, date, hs, as_, season="2025/2026"):
    return {
        "header": {"season": season, "jornada": "1", "date": date,
                   "home_team": home, "away_team": away,
                   "home_score": hs, "away_score": as_, "competition": "t"},
        "lineups": {"home": [{"name": "PEREZ, JUAN", "dorsal": 1, "role": "starter"}],
                    "away": [{"name": "GOMEZ, RAUL", "dorsal": 2, "role": "starter"}]},
        "events": [],
        "staff": {},
    }


def test_duplicate_actas_pointing_to_same_match_are_detected(tmp_path, monkeypatch, capsys):
    """Two different cod_acta reconciling to the same match: first wins, the
    second is reported as duplicate (and warned), not silently clobbered."""
    monkeypatch.setattr("scripts.import_fiflp_actas.UNMATCHED_PATH",
                        str(tmp_path / "unmatched.json"))
    conn = _mk_db(tmp_path)
    _seed_match(conn, date="29/11", hs=2, as_=1)
    acta = _acta_for("UNION VIERA", "GOLETA, C.D.", "29/11/2025", 2, 1)
    raw_path = _write_raw(tmp_path, {"111": acta, "222": json.loads(json.dumps(acta))})
    rpt = import_raw(conn, raw_path)
    assert rpt["matched"] == 1
    assert rpt["duplicates"] == 1
    out = capsys.readouterr().out
    assert "duplicate" in out.lower() or "duplicado" in out.lower()
    # first acta wins
    cod = conn.execute("SELECT cod_acta FROM matches WHERE cod_acta IS NOT NULL").fetchone()[0]
    assert cod == 111


def test_orphan_cod_acta_is_cleared(tmp_path, monkeypatch):
    """A match holding a cod_acta that no longer exists in the season's raw
    gets its cod_acta cleared (and its stale acta rows removed)."""
    monkeypatch.setattr("scripts.import_fiflp_actas.UNMATCHED_PATH",
                        str(tmp_path / "unmatched.json"))
    conn = _mk_db(tmp_path)
    mid_a = _seed_match(conn, code="A1", home="Arucas CF", away="UD Moya",
                        date="29/11", hs=1, as_=1)
    mid_b = _seed_match(conn, code="A2", home="Unión Viera", away="CD Goleta",
                        date="29/11", hs=2, as_=1)
    hid_a = conn.execute("SELECT home_team_id FROM matches WHERE id=?", (mid_a,)).fetchone()[0]
    conn.execute("UPDATE matches SET cod_acta=111 WHERE id=?", (mid_a,))
    _add_acta_children(conn, mid_a, hid_a)
    conn.commit()
    # raw only contains acta 222 (for match B) — 111 is orphaned
    raw_path = _write_raw(
        tmp_path, {"222": _acta_for("UNION VIERA", "GOLETA, C.D.", "29/11/2025", 2, 1)}
    )
    import_raw(conn, raw_path)
    assert conn.execute("SELECT cod_acta FROM matches WHERE id=?", (mid_a,)).fetchone()[0] is None
    assert conn.execute(
        "SELECT COUNT(*) FROM appearances WHERE match_id=?", (mid_a,)
    ).fetchone()[0] == 0
    assert conn.execute("SELECT cod_acta FROM matches WHERE id=?", (mid_b,)).fetchone()[0] == 222


def test_moved_acta_clears_stale_assignment_on_old_match(tmp_path, monkeypatch):
    """If an acta now reconciles to a different match, the old match must not
    keep the stale cod_acta (nor its stale acta rows)."""
    monkeypatch.setattr("scripts.import_fiflp_actas.UNMATCHED_PATH",
                        str(tmp_path / "unmatched.json"))
    conn = _mk_db(tmp_path)
    mid_old = _seed_match(conn, code="A1", home="Arucas CF", away="UD Moya",
                          date="29/11", hs=1, as_=1)
    mid_new = _seed_match(conn, code="A2", home="Unión Viera", away="CD Goleta",
                          date="29/11", hs=2, as_=1)
    hid_old = conn.execute("SELECT home_team_id FROM matches WHERE id=?", (mid_old,)).fetchone()[0]
    conn.execute("UPDATE matches SET cod_acta=333 WHERE id=?", (mid_old,))
    _add_acta_children(conn, mid_old, hid_old)
    conn.commit()
    # acta 333 now reconciles to match B (header names point at B's teams)
    raw_path = _write_raw(
        tmp_path, {"333": _acta_for("UNION VIERA", "GOLETA, C.D.", "29/11/2025", 2, 1)}
    )
    import_raw(conn, raw_path)
    assert conn.execute("SELECT cod_acta FROM matches WHERE id=?", (mid_old,)).fetchone()[0] is None
    assert conn.execute(
        "SELECT COUNT(*) FROM appearances WHERE match_id=?", (mid_old,)
    ).fetchone()[0] == 0
    assert conn.execute("SELECT cod_acta FROM matches WHERE id=?", (mid_new,)).fetchone()[0] == 333


# ===========================================================================
# Fix 5 — synth_copa_campeones: J counts only played matches
# ===========================================================================

def test_synth_copa_counts_only_played_matches(tmp_path):
    conn = _mk_db(tmp_path)
    sid = get_or_create_season(conn, "2024-2025", 2024, 2025)
    cid = get_or_create_category(conn, "BENJAMIN")
    gid = get_or_create_group(conn, sid, cid, "BCB1", name="Copa B")
    ta = get_or_create_team(conn, "Alpha")
    tb = get_or_create_team(conn, "Beta")
    tc = get_or_create_team(conn, "Gamma")
    conn.execute(
        """INSERT INTO matches (group_id, jornada, date, time, home_team_id,
           away_team_id, home_score, away_score, venue)
           VALUES (?, '1', '01/05', '', ?, ?, 2, 1, '')""", (gid, ta, tb))
    conn.execute(
        """INSERT INTO matches (group_id, jornada, date, time, home_team_id,
           away_team_id, home_score, away_score, venue)
           VALUES (?, '2', '08/05', '', ?, ?, NULL, NULL, '')""", (gid, ta, tc))
    conn.commit()
    synth_group(conn, gid, "BCB1")
    j_by_team = dict(conn.execute(
        """SELECT t.name, s.played FROM standings s
           JOIN teams t ON t.id=s.team_id WHERE s.group_id=?""", (gid,)
    ).fetchall())
    assert j_by_team["Alpha"] == 1, "unplayed match must not count as played"
    assert j_by_team["Beta"] == 1
    assert j_by_team["Gamma"] == 0, "team with only unplayed matches has J=0"
