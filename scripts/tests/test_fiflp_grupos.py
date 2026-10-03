"""Grupos de temporadas pasadas que la base no tiene, desde la federación (2026-10):
import_fiflp_grupos.py con el raw de goleadores (grupos y clasificaciones) y las
actas aplanadas (partidos)."""
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from db import SCHEMA
from migrate_actas_schema import migrate
import import_fiflp_grupos as GR


def base():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2021-2022', 2021, 2022, 0);
      INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN'), (2, 'PREBENJAMIN');
      INSERT INTO groups(id, season_id, category_id, code, name, full_name, phase, island) VALUES
        (1, 1, 1, 'GC1', 'Grupo 1', 'BENJAMIN PRIMERA FASE GC - Grupo 1', 'Primera Fase GC', 'grancanaria');
      INSERT INTO teams(id, name) VALUES (1, 'Tamaraceite'), (2, 'AD Huracán'), (3, 'Moya'), (4, 'Arucas'), (5, 'Haría'),
        (6, 'FUTBOL P.D.C. 2016, C.D.');
      INSERT INTO standings(group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd) VALUES
        (1, 1, 1, 9, 3, 3, 0, 0, 9, 1, 8), (1, 2, 2, 6, 3, 2, 0, 1, 5, 3, 2),
        (1, 3, 3, 3, 3, 1, 0, 2, 2, 5, -3), (1, 4, 4, 0, 3, 0, 0, 3, 1, 8, -7);
    """)
    return conn


def acta(cod, jornada, date, home, away, hs, as_, scorer=None):
    goals = [{"kind": "goal", "side": "home", "player_name": scorer, "minute": 10, "goal_type": "normal",
              "score": [1, 0]}] if scorer else []
    return {"header": {"season": "2021/2022", "jornada": jornada, "date": date, "time": "10:00", "home_team": home,
                       "away_team": away, "home_score": hs, "away_score": as_, "venue": "MUNICIPAL"},
            "lineups": {"home": [{"dorsal": 9, "name": scorer or "X, Y", "role": "starter", "fiflp_id": cod}],
                        "away": [{"dorsal": 1, "name": f"P, {cod}", "role": "starter", "fiflp_id": cod + 1}]},
            "events": goals, "staff": {}, "consistent": True}


def write(folder, raw, index, actas):
    (folder / "fiflp_goleadores_2021-2022_raw.json").write_text(json.dumps(raw), encoding="utf-8")
    (folder / "fiflp_actas_2021-2022_index.json").write_text(json.dumps(index), encoding="utf-8")
    (folder / "fiflp_actas_2021-2022_raw.json").write_text(json.dumps(actas), encoding="utf-8")


def entry(comp, grupo, comp_name, grupo_name, teams):
    return {"comp": comp, "grupo": grupo, "comp_name": comp_name, "grupo_name": grupo_name, "ok": True,
            "standings": [{"pos": i + 1, "team": t, "pts": 9 - 3 * i, "j": 3, "g": 3 - i, "e": 0, "p": i,
                           "gf": 9, "gc": 1, "df": 8} for i, t in enumerate(teams)], "scorers": []}


def test_missing_groups_are_created_with_their_matches_lineups_and_table(tmp_path):
    conn = base()
    raw = {
        # Ya está en la base (GC1, por sus equipos).
        "893:1": entry("893", "1", "LIGA PRIMERA BENJAMIN F-8 GRAN CANARIA", "GRUPO 1",
                       ["TAMARACEITE, U.D. A", "HURACAN, A.D. A", "MOYA, U.D.", "ARUCAS, C.F."]),
        # Su hermano no: GC2, con el prefijo, la fase y la isla de GC1.
        "893:2": entry("893", "2", "LIGA PRIMERA BENJAMIN F-8 GRAN CANARIA", "GRUPO 2",
                       ["GUIA, U.D.", "GALDAR, C.D.", "FIRGAS, U.D.", "TEROR, C.F."]),
        # Una final insular (EXTRA_META): LZ1F1, un partido; Haría ya existe en la base.
        "956:7": entry("956", "7", "FINAL LIGA PRIMERA BENJAMIN LANZAROTE", "GRUPO ÚNICO", []),
        # Una competición sin código conocido.
        "999:1": entry("999", "1", "LIGA RARA BENJAMIN", "GRUPO 1", ["A, C.D.", "B, C.D.", "C, C.D."]),
    }
    index = {"699": {"comp_id": "956", "grupo": "7", "jornada": "1"},
             "700": {"comp_id": "893", "grupo": "2", "jornada": "1"},
             "701": {"comp_id": "893", "grupo": "2", "jornada": "1"},
             "702": {"comp_id": "893", "grupo": "2", "jornada": "2"},
             "800": {"comp_id": "956", "grupo": "7", "jornada": "1"}}
    actas = {"699": acta(699, "1", "06-11-2021", "FUTBOL P.D.C. 2016, C.D.", "SAN ISIDRO, U.D.", 2, 1),
             "700": acta(700, "1", "06-11-2021", "GUIA, U.D.", "GALDAR, C.D.", 1, 0, "PEREZ, LUIS"),
             "701": acta(701, "1", "06-11-2021", "FIRGAS, U.D.", "TEROR, C.F.", 0, 0),
             "702": {"header": {"season": "2021/2022"}},          # sin aplanar: no cuenta
             "800": acta(800, "1", "12-06-2022", "HARIA, C.D.", "TEGUISE, U.D.", 1, 0, "LOPEZ, ANA")}
    write(tmp_path, raw, index, actas)
    lines = []
    reports = GR.import_changed_grupos(conn, str(tmp_path), log=lines.append)
    assert reports["2021-2022"] == {"created": 2, "redone": 0, "existing": 1, "no_meta": 1, "clash": 0}
    groups = conn.execute("SELECT code, phase, island, name FROM groups ORDER BY id").fetchall()
    assert groups == [("GC1", "Primera Fase GC", "grancanaria", "Grupo 1"),
                      ("GC2", "Primera Fase GC", "grancanaria", "Grupo 2"),
                      ("LZ1F1", "Final Liga Primera Lanzarote", "lanzarote", "Grupo 1")]
    gc2 = conn.execute("SELECT id FROM groups WHERE code='GC2'").fetchone()[0]
    rows = conn.execute("""SELECT m.jornada, m.date, t1.name, t2.name, m.home_score, m.away_score, m.cod_acta
        FROM matches m JOIN teams t1 ON t1.id=m.home_team_id JOIN teams t2 ON t2.id=m.away_team_id
        WHERE m.group_id=? ORDER BY m.cod_acta""", (gc2,)).fetchall()
    assert rows == [("1", "06-11-2021", "Guía", "Gáldar", 1, 0, 700), ("1", "06-11-2021", "Firgas", "Teror", 0, 0, 701)]
    assert conn.execute("SELECT count(*) FROM standings WHERE group_id=?", (gc2,)).fetchone()[0] == 4
    assert conn.execute("""SELECT a.goals FROM appearances a JOIN players p ON p.id=a.player_id
                           WHERE p.full_name='PEREZ, LUIS'""").fetchone()[0] == 1
    # Haría, con el nombre que ya tiene la base (no 'HARIA, C.D.').
    final = conn.execute("""SELECT t1.name FROM matches m JOIN groups g ON g.id=m.group_id
                            JOIN teams t1 ON t1.id=m.home_team_id WHERE g.code='LZ1F1'""").fetchone()[0]
    assert final == "Haría"
    # Un equipo que la base ya tiene con la grafía de la federación conserva su fila (no se duplica
    # con forma de portal); uno que no tiene, entra con forma de portal.
    names = {r[0] for r in conn.execute("""SELECT DISTINCT t.name FROM matches m JOIN groups g ON g.id=m.group_id
        JOIN teams t ON t.id IN (m.home_team_id, m.away_team_id) WHERE g.code='LZ1F1'""")}
    assert names == {"Haría", "Teguise", "FUTBOL P.D.C. 2016, C.D.", "San Isidro"}
    # Sin cambios en las fuentes, nada; con una acta nueva, el grupo se rehace sin duplicar.
    assert GR.import_changed_grupos(conn, str(tmp_path), log=lines.append) == {}
    index["703"] = {"comp_id": "893", "grupo": "2", "jornada": "2"}
    actas["703"] = acta(703, "2", "13-11-2021", "GALDAR, C.D.", "FIRGAS, U.D.", 2, 2)
    write(tmp_path, raw, index, actas)
    again = GR.import_changed_grupos(conn, str(tmp_path), log=lines.append)["2021-2022"]
    assert again["redone"] == 2 and again["created"] == 0
    assert conn.execute("SELECT count(*) FROM matches WHERE group_id=?", (gc2,)).fetchone()[0] == 3
    assert conn.execute("SELECT count(*) FROM groups").fetchone()[0] == 3


def test_a_missing_group_whose_code_is_taken_is_skipped(tmp_path):
    conn = base()
    # El grupo 1 de la federación con otros equipos: no casa con GC1, pero su código sería GC1.
    raw = {"893:1": entry("893", "1", "LIGA PRIMERA BENJAMIN F-8 GRAN CANARIA", "GRUPO 1",
                          ["GUIA, U.D.", "GALDAR, C.D.", "FIRGAS, U.D."]),
           "893:2": entry("893", "2", "LIGA PRIMERA BENJAMIN F-8 GRAN CANARIA", "GRUPO 2",
                          ["TAMARACEITE, U.D. A", "HURACAN, A.D. A", "MOYA, U.D.", "ARUCAS, C.F."])}
    write(tmp_path, raw, {}, {})
    report = GR.import_changed_grupos(conn, str(tmp_path), log=lambda *_: None)["2021-2022"]
    # El 2 casa con GC1 y da el prefijo «GC» desde el número 2… que no es el de GC1: sin hermano útil,
    # COMP_META no tiene 893 → sin código; nunca se pisa GC1.
    assert report["created"] == 0
    assert conn.execute("SELECT count(*) FROM groups").fetchone()[0] == 1
