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


# ── Temporadas archivadas y grupos creados desde la federación (fiflp_groups) ──

def _modules(monkeypatch, tmp_path):
    import sys
    sys.path.insert(0, os.path.join(ROOT, "scripts"))
    import import_fiflp_actas as I
    monkeypatch.setattr(I, "UNMATCHED_PATH", str(tmp_path / "unmatched.json"))
    return I


def _archive_base():
    """2018-19 con la liga de Lanzarote (LZ11, sin el Tinajo–Haría en su calendario) y la final
    (LZ1F1), creada desde la federación (fiflp_groups: competición 258, grupo 1)."""
    from scripts.db import SCHEMA
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2018-2019', 2018, 2019, 0);
      INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN');
      INSERT INTO groups(id, season_id, category_id, code, name, phase, island) VALUES
        (1, 1, 1, 'LZ11', 'Grupo 1', 'Primera Lanzarote', 'lanzarote'),
        (2, 1, 1, 'LZ1F1', 'Grupo 1', 'Final Liga Primera Lanzarote', 'lanzarote');
      INSERT INTO teams(id, name) VALUES (1, 'CD Tinajo'), (2, 'Haría CF'), (3, 'Teguise');
      INSERT INTO matches(id, group_id, jornada, date, home_team_id, away_team_id, home_score, away_score, cod_acta) VALUES
        (1, 1, '1', '06-10-2018', 3, 2, 1, 1, NULL),
        (2, 2, '1', '12-05-2019', 1, 2, 3, 0, 700);
      CREATE TABLE fiflp_groups (group_id INTEGER PRIMARY KEY, season_id INTEGER NOT NULL, comp TEXT NOT NULL,
                                 grupo TEXT NOT NULL);
      INSERT INTO fiflp_groups VALUES (2, 1, '258', '1');
    """)
    return conn


def _flat(home, away, hs, as_, date, comp, grupo):
    return {"header": {"season": "2018/2019", "jornada": "1", "date": date, "home_team": home, "away_team": away,
                       "home_score": hs, "away_score": as_},
            "lineups": {"home": [{"dorsal": 1, "name": f"H, {home[:4]}", "role": "starter"}],
                        "away": [{"dorsal": 1, "name": f"A, {away[:4]}", "role": "starter"}]},
            "events": [], "staff": {}, "consistent": True,
            "enumeration": {"comp_id": comp, "grupo": grupo, "jornada": "1"}}


def test_the_raw_of_a_season_not_yet_in_the_base_is_skipped_without_fingerprint(monkeypatch, tmp_path):
    I = _modules(monkeypatch, tmp_path)
    conn = _archive_base()
    raw = {"800": _flat("TINAJOA, U.D. \"A\"", "HARIA C.F.", 3, 0, "12-05-2018", "258", "1")}
    for a in raw.values():
        a["header"]["season"] = "2017/2018"
    (tmp_path / "fiflp_actas_2017-2018_raw.json").write_text(json.dumps(raw), encoding="utf-8")
    lines = []
    assert I.import_changed_raws(conn, str(tmp_path), log=lines.append) == {}
    assert "no está en la base todavía" in lines[0]
    assert not conn.execute("SELECT 1 FROM raw_imports WHERE path='fiflp_actas_2017-2018_raw.json'").fetchone()


def test_actas_of_groups_created_from_the_federation_are_left_to_import_fiflp_grupos(monkeypatch, tmp_path):
    I = _modules(monkeypatch, tmp_path)
    conn = _archive_base()
    # El acta de la final (la importa import_fiflp_grupos por su cod_acta) y una de liga de los mismos
    # equipos con la fecha y el marcador del partido de la final: casaría con él por nombres.
    raw = {"700": _flat("TINAJOA, U.D. \"A\"", "HARIA C.F.", 3, 0, "12-05-2019", "258", "1"),
           "701": _flat("TINAJOA, U.D. \"A\"", "HARIA C.F.", 3, 0, "12-05-2019", "185", "7")}
    (tmp_path / "fiflp_actas_2018-2019_raw.json").write_text(json.dumps(raw), encoding="utf-8")
    (tmp_path / "unmatched.json").write_text(json.dumps({"700": {"header": {}, "reason": "no candidate match"}}),
                                            encoding="utf-8")
    lines = []
    report = I.import_changed_raws(conn, str(tmp_path), log=lines.append)["fiflp_actas_2018-2019_raw.json"]
    assert report["owned"] == 1 and report["matched"] == 0 and report["unmatched"] == 1
    assert "1 de grupos creados desde la federación (los importa import_fiflp_grupos)" in lines[0]
    # El partido de la final sigue con su acta, sin alineaciones nuevas; la de liga no cae en él.
    assert conn.execute("SELECT cod_acta FROM matches WHERE id=2").fetchone() == (700,)
    assert conn.execute("SELECT count(*) FROM appearances").fetchone()[0] == 0
    unmatched = json.loads((tmp_path / "unmatched.json").read_text(encoding="utf-8"))
    assert "700" not in unmatched and "701" in unmatched
    assert conn.execute("SELECT 1 FROM raw_imports WHERE path='fiflp_actas_2018-2019_raw.json'").fetchone()


def test_without_owned_groups_the_league_acta_would_take_the_final_match(monkeypatch, tmp_path):
    """La protección de arriba sale de `owned`: sin él, el acta de liga cae en el partido de la final
    (lo que hacía import_raw antes de las temporadas archivadas)."""
    I = _modules(monkeypatch, tmp_path)
    conn = _archive_base()
    raw = {"701": _flat("TINAJOA, U.D. \"A\"", "HARIA C.F.", 3, 0, "12-05-2019", "185", "7")}
    path = tmp_path / "fiflp_actas_2018-2019_raw.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    assert I.import_raw(conn, str(path), only=I.flattened)["matched"] == 1
    assert conn.execute("SELECT cod_acta FROM matches WHERE id=2").fetchone() == (701,)
