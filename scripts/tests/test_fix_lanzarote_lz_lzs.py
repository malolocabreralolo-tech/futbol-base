"""Fixer de Lanzarote benjamín 2025-26 (spec 2026-09-23 §9.4).

LZ1-4 (futbolaspalmas) y LZS1-4 (FIFLP) son la misma competición. El fixer
conserva LZ, le copia el campo (y la hora si falta) de LZS en los partidos que
emparejan sin ambigüedad por (jornada, fecha ISO, gl, gv) y borra LZS. Aquí se
prueba su lógica sobre una base en memoria: nunca toca futbolbase.db.
"""
import importlib.util
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
FIXER = ROOT / "scripts" / "_archive" / "fix_lanzarote_lz_lzs_2526.py"


def _fixer():
    spec = importlib.util.spec_from_file_location("fix_lanzarote_lz_lzs_2526", FIXER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# (jornada, fecha, hora, local, visitante, gl, gv, campo)
LZ1 = [
    ("Jornada 1", "2026-01-24", "09:00", "Pto.del Carmen", "CD Tinajo", 4, 2, None),      # ambigua
    ("Jornada 1", "2026-01-24", "11:00", "San Bartolomé", "Sporting Tías", 4, 2, None),   # ambigua
    ("Jornada 2", "2026-01-31", "10:00", "CD Tinajo", "San Bartolomé", 1, 3, None),
    ("Jornada 2", "2026-01-31", None, "Sporting Tías", "Pto.del Carmen", 5, 0, None),     # sin hora
    ("Jornada 3", "2026-02-07", "09:00", "Pto.del Carmen", "San Bartolomé", 3, 3, "CAMPO LZ"),
    ("Jornada 3", "2026-02-07", "11:00", "Sporting Tías", "CD Tinajo", 12, 0, None),      # otro marcador
    ("Jornada 4", "2026-02-14", "09:00", "CD Tinajo", "Pto.del Carmen", 2, 2, None),
    ("Jornada 4", "2026-02-14", "11:00", "San Bartolomé", "Sporting Tías", 0, 1, None),
]
PC = 'PUERTO DEL CARMEN, F.C. "A"'
LZS1 = [
    ("1", "24-01-2026", "09:00", PC, "CD Tinajo", 4, 2, "MUNICIPAL ARROCHA"),
    ("1", "24-01-2026", "11:00", "San Bartolomé", "Sporting Tías", 4, 2, "COLON"),
    ("2", "31-01-2026", "10:00", "CD Tinajo", "San Bartolomé", 1, 3, "MUNICIPAL TINAJO"),
    ("2", "31-01-2026", "10:30", "Sporting Tías", PC, 5, 0, "MUNICIPAL TIAS"),
    ("3", "07-02-2026", "09:00", PC, "San Bartolomé", 3, 3, "MUNICIPAL ARROCHA"),
    ("3", "07-02-2026", "11:00", "Sporting Tías", "CD Tinajo", 1, 0, "MUNICIPAL TIAS"),
    ("4", "14-02-2026", "09:00", "CD Tinajo", PC, 2, 2, "MUNICIPAL TINAJO"),
    ("4", "14-02-2026", "11:00", "San Bartolomé", "Sporting Tías", 0, 1, "COLON"),
]
# (equipo, pos, pts, pj, g, e, p, gf, gc)
TABLA_LZ1 = [("San Bartolomé", 1, 7, 4, 2, 1, 1, 8, 7), ("Sporting Tías", 2, 6, 4, 2, 0, 2, 18, 7),
             ("Pto.del Carmen", 3, 5, 4, 1, 2, 1, 9, 10), ("CD Tinajo", 4, 1, 4, 0, 1, 3, 5, 16)]
TABLA_LZS1 = [("San Bartolomé", 1, 7, 4, 2, 1, 1, 8, 7), ("Sporting Tías", 2, 9, 4, 3, 0, 1, 7, 7),
              (PC, 3, 5, 4, 1, 2, 1, 9, 10), ("CD Tinajo", 4, 1, 4, 0, 1, 3, 5, 5)]


def _conn(lzs_rows=LZS1):
    import db
    conn = sqlite3.connect(":memory:")
    db.init_db(conn)
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("INSERT INTO seasons (id,name,start_year,end_year,is_current) "
                 "VALUES (1,'2025-2026',2025,2026,1)")
    conn.execute("INSERT INTO categories (id,name) VALUES (1,'BENJAMIN')")
    conn.execute("INSERT INTO groups (id,season_id,category_id,code,phase,island,url) VALUES "
                 "(1,1,1,'LZ1','Lanzarote','lanzarote','https://futbolaspalmas.com/lz1/'),"
                 "(2,1,1,'LZS1','Lanzarote Fase 2','lanzarote','')")

    def team(name):
        row = conn.execute("SELECT id FROM teams WHERE name=?", (name,)).fetchone()
        return row[0] if row else conn.execute(
            "INSERT INTO teams (name) VALUES (?)", (name,)).lastrowid

    for gid, rows in ((1, LZ1), (2, lzs_rows)):
        for j, d, t, h, a, gl, gv, v in rows:
            conn.execute("INSERT INTO matches (group_id,jornada,date,time,home_team_id,away_team_id,"
                         "home_score,away_score,venue) VALUES (?,?,?,?,?,?,?,?,?)",
                         (gid, j, d, t, team(h), team(a), gl, gv, v))
    for gid, tabla in ((1, TABLA_LZ1), (2, TABLA_LZS1)):
        for name, pos, pts, pj, g, e, p, gf, gc in tabla:
            conn.execute("INSERT INTO standings (group_id,team_id,position,points,played,won,"
                         "drawn,lost,gf,gc,gd) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                         (gid, team(name), pos, pts, pj, g, e, p, gf, gc, gf - gc))
    mid = conn.execute("SELECT id FROM matches WHERE group_id=1 AND jornada='Jornada 2' "
                       "AND time='10:00'").fetchone()[0]
    conn.execute("INSERT INTO goals (match_id,minute,player_name,running_score,side,type) "
                 "VALUES (?,5,'A. Pérez','0-1','a','r')", (mid,))
    conn.execute("INSERT INTO scorers (group_id,player_name,team_id,goals,games) "
                 "VALUES (1,'Pérez, Ana',?,1,1)", (team("San Bartolomé"),))
    conn.commit()
    return conn


def _lz1(conn):
    return {(j, h, a): (t, v) for j, t, h, a, v in conn.execute(
        """SELECT m.jornada, m.time, th.name, ta.name, m.venue FROM matches m
             JOIN teams th ON th.id=m.home_team_id JOIN teams ta ON ta.id=m.away_team_id
            WHERE m.group_id=1""")}


def test_normalizes_jornada_and_date_across_sources():
    fx = _fixer()
    assert fx.jornada_num("Jornada 7") == fx.jornada_num("7") == fx.jornada_num("07") == "7"
    assert fx.jornada_num("06-06-2026 ( Final )") == "06-06-2026 ( Final )"
    assert fx.iso_date("24-01-2026", 2025, 2026) == "2026-01-24"
    assert fx.iso_date("2026-01-24", 2025, 2026) == "2026-01-24"
    assert fx.iso_date("06/11", 2021, 2022) == "2021-11-06"
    assert fx.iso_date("23/02", 2024, 2025) == "2025-02-23"
    assert fx.iso_date("", 2025, 2026) is None and fx.iso_date(None, 2025, 2026) is None


def test_pairs_only_unambiguous_matches_by_jornada_date_and_score():
    fx = _fixer()
    lz = [(i,) + r for i, r in enumerate(LZ1, 1)]
    lzs = [(100 + i,) + r for i, r in enumerate(LZS1, 1)]
    res = fx.pair_matches(lz, lzs, 2025, 2026)
    assert sorted((a[0], b[0]) for a, b in res["pairs"]) == [(3, 103), (4, 104), (5, 105), (7, 107), (8, 108)]
    assert res["ambiguous"] == [("1", "2026-01-24", 4, 2)]
    assert [r[0] for r in res["lz_only"]] == [6] and [r[0] for r in res["lzs_only"]] == [106]
    nombres = fx.team_map(res["pairs"])
    assert nombres["Pto.del Carmen"] == PC
    # Un par cuya clave es única pero cuyos equipos no cuadran con el mapa no
    # es el mismo partido: se aparta (y va al log) en vez de copiar su campo.
    assert fx.split_by_teams(res["pairs"], nombres) == (res["pairs"], [])
    cruzado = (lz[2], lzs[3])        # Tinajo-San Bartolomé con Sporting Tías-Pto. del Carmen
    assert fx.split_by_teams([cruzado], nombres) == ([], [cruzado])


def test_plan_logs_standings_rows_that_differ():
    fx = _fixer()
    plan = fx.build_plan(_conn())
    assert [(p["lz"], p["lzs"]) for p in plan] == [("LZ1", "LZS1")]
    assert plan[0]["ratio"] == pytest.approx(7 / 8)
    assert len(plan[0]["standings"]) == 2
    assert plan[0]["standings"][0].startswith("Sporting Tías")
    assert plan[0]["standings"][1].startswith("CD Tinajo")
    texto = "\n".join(fx.report(plan))
    assert "ambigua ('1', '2026-01-24', 4, 2)" in texto
    assert "solo LZ1:  J3 2026-02-07 Sporting Tías 12-0 CD Tinajo" in texto


def test_apply_copies_venue_and_missing_time_then_deletes_lzs():
    fx = _fixer()
    conn = _conn()
    copiados = fx.apply_plan(conn, fx.build_plan(conn))
    conn.commit()
    assert copiados == 4
    lz1 = _lz1(conn)
    assert lz1[("Jornada 2", "CD Tinajo", "San Bartolomé")] == ("10:00", "MUNICIPAL TINAJO")
    assert lz1[("Jornada 2", "Sporting Tías", "Pto.del Carmen")] == ("10:30", "MUNICIPAL TIAS")
    assert lz1[("Jornada 3", "Pto.del Carmen", "San Bartolomé")] == ("09:00", "CAMPO LZ")
    assert lz1[("Jornada 1", "Pto.del Carmen", "CD Tinajo")] == ("09:00", None)
    assert lz1[("Jornada 3", "Sporting Tías", "CD Tinajo")] == ("11:00", None)
    assert conn.execute("SELECT code FROM groups").fetchall() == [("LZ1",)]
    for tabla in ("matches", "standings"):
        assert conn.execute(f"SELECT COUNT(*) FROM {tabla} WHERE group_id=2").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM goals").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM scorers WHERE group_id=1").fetchone()[0] == 1
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    assert fx.build_plan(conn) == []          # idempotente: una segunda pasada no hace nada


def test_refuses_to_delete_a_group_that_does_not_overlap():
    fx = _fixer()
    distinto = [(j, d, t, h, a, gl + 20, gv, v) for j, d, t, h, a, gl, gv, v in LZS1]
    conn = _conn(lzs_rows=distinto)
    with pytest.raises(SystemExit, match="LZ1/LZS1: solape 0.00"):
        fx.build_plan(conn)
    assert conn.execute("SELECT COUNT(*) FROM groups").fetchone()[0] == 2
