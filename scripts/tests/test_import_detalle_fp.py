"""Importación del detalle de la federación (import_fiflp_detalle.py) y de la app
de futbolaspalmas (import_fp_app.py) en la base (2026-10)."""
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from db import SCHEMA
from migrate_actas_schema import migrate
from fiflp_detalle import parse_clasificacion, parse_directorio
import import_fiflp_detalle as D
import import_fp_app as A

FIX = Path(__file__).parent / "fixtures" / "detalle"

# Los equipos del grupo 2 de la Fase Liga A de 2025-26 con el nombre de la base.
BASE_NAMES = {
    "PALMAS, U.D. LAS": "Las Palmas", 'TAMARACEITE, U.D. "A"': "Tamaraceite",
    'HURACAN, A.D. "A"': "AD Huracán", 'MESAS HURACAN, U.D. LAS "A"': "Las Mesas Hu.",
    'VICTORIA, REAL CLUB "A"': "RC Victoria", 'CORAZON DE MARIA, C.D. "A"': "Corazón Mª",
    'VETERANOS DEL PILA., C.D. "A"': "Veteranos", 'HEIDELBERG, C.F. "A"': "Heidelberg",
    'UNION VIERA, C.F. "B"': "Unión Viera B", 'SIMUSETTI C. F. "A"': "Simusetti",
    'GUINIGUADA APOLINARIO, C.D. "A"': "Guiniguada", "MARZASPORT, ATLETICO": "Atl. Marzasport",
}


def base_2526():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2025-2026', 2025, 2026, 0);
      INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN'), (2, 'PREBENJAMIN');
      INSERT INTO groups(id, season_id, category_id, code, name, phase) VALUES (1, 1, 1, 'A2', 'Grupo 2', 'Fase Liga A');
    """)
    rows = parse_clasificacion((FIX / "clasificacion_2526_A2.html").read_text(encoding="utf-8"))
    for i, r in enumerate(rows, start=1):
        conn.execute("INSERT INTO teams(id, name) VALUES (?, ?)", (i, BASE_NAMES[r["team"]]))
        conn.execute("""INSERT INTO standings(group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd)
                        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                     (i, r["pos"], r["pts"], r["j"], r["g"], r["e"], r["p"], r["gf"], r["gc"], r["gf"] - r["gc"]))
    return conn, rows


def detalle_raw(rows, extra=None):
    entry = {"comp": "54422953", "comp_name": "LIGA BENJAMIN F7 GRAN CANARIA FASE LIGA A", "grupo": "54828309",
             "grupo_name": "GRUPO 2", "ok": True, "fetched": "2026-10-07", "clasificacion": rows,
             "directorio": parse_directorio((FIX / "directorio_2526_A2.html").read_text(encoding="utf-8"))}
    entry.update(extra or {})
    return {"_grupos": {"54422953": [["54828309", "GRUPO 2"]]}, "54422953:54828309": entry}


def test_detalle_casa_fuera_y_ficha_de_cada_equipo(tmp_path):
    conn, rows = base_2526()
    (tmp_path / "fiflp_detalle_2025-2026_raw.json").write_text(json.dumps(detalle_raw(rows)), encoding="utf-8")
    (tmp_path / "fiflp_campos_raw.json").write_text(json.dumps({
        "148": {"ok": True, "code": 148, "name": "PEPE GONÇALVEZ", "lat": 28.07, "lon": -15.45,
                "teams": ["MESAS HURACAN, U.D. LAS (BEN)"], "training": [], "fenced": True}}), encoding="utf-8")
    reports = D.import_changed_detalle(conn, folder=str(tmp_path), log=lambda *a: None)
    assert reports["fiflp_detalle_2025-2026_raw.json"]["groups"] == 1
    mesas = conn.execute("SELECT id FROM teams WHERE name='Las Mesas Hu.'").fetchone()[0]
    det = conn.execute("""SELECT fiflp_code, home_played, home_won, away_played, away_drawn, sanction, form
                          FROM standings_detail WHERE group_id=1 AND team_id=?""", (mesas,)).fetchone()
    assert det == (62744, 11, 7, 11, 1, 0, "PGGPG")
    assert conn.execute("SELECT count(*) FROM standings_detail").fetchone()[0] == 12
    ficha = conn.execute("""SELECT fiflp_code, shirt, shorts, socks, venue_code, venue_name FROM team_seasons
                            WHERE team_id=? AND season_id=1""", (mesas,)).fetchone()
    assert ficha == (62744, "BLANCA CON FRANJA ROJA", "BLANCO", "BLANCAS", 148, "PEPE GONÇALVEZ")
    udlp = conn.execute("""SELECT ts.shirt FROM team_seasons ts JOIN teams t ON t.id=ts.team_id
                           WHERE t.name='Las Palmas'""").fetchone()
    assert udlp == ("AMARILLA",)
    assert conn.execute("SELECT count(*) FROM team_seasons").fetchone()[0] == 12
    campo = conn.execute("SELECT name, lat, lon, fenced, teams FROM venue_details WHERE code=148").fetchone()
    assert campo[:4] == ("PEPE GONÇALVEZ", 28.07, -15.45, 1)
    assert json.loads(campo[4]) == ["MESAS HURACAN, U.D. LAS (BEN)"]
    # Ni un equipo nuevo: todo casa con los de la base.
    assert conn.execute("SELECT count(*) FROM teams").fetchone()[0] == 12
    # Sin cambios, la segunda pasada no hace nada.
    assert D.import_changed_detalle(conn, folder=str(tmp_path), log=lambda *a: None) == {}


def test_calendario_de_un_grupo_sin_partidos(tmp_path):
    conn, rows = base_2526()
    jornadas = {"Jornada 1": [
        {"home": 'MESAS HURACAN, U.D. LAS "A"', "away": 'UNION VIERA, C.F. "B"', "hs": 9, "as": 1,
         "date": "2025-11-30", "time": "10:30", "venue": "PEPE GONÇALVEZ", "referee": "", "fiflp_acta": None},
        {"home": "PALMAS, U.D. LAS", "away": 'SIMUSETTI C. F. "A"', "hs": 5, "as": 0,
         "date": "2025-11-29", "time": "10:30", "venue": "ANEXO GRAN CANARIA F8", "referee": "", "fiflp_acta": None},
        {"home": "DESCANSA", "away": 'HURACAN, A.D. "A"', "hs": None, "as": None, "date": "", "time": "",
         "venue": "", "referee": "", "fiflp_acta": None}]}
    (tmp_path / "fiflp_detalle_2025-2026_raw.json").write_text(
        json.dumps(detalle_raw(rows, {"jornadas": jornadas})), encoding="utf-8")
    # Fuera de CALENDAR_SEASONS no entra; dentro, sí.
    report = D.import_changed_detalle(conn, folder=str(tmp_path), log=lambda *a: None, calendar_seasons=())
    assert report["fiflp_detalle_2025-2026_raw.json"]["matches"] == 0
    report = D.import_changed_detalle(conn, folder=str(tmp_path), log=lambda *a: None,
                                      calendar_seasons=("2025-2026",))
    assert report["fiflp_detalle_2025-2026_raw.json"]["matches"] == 2
    got = conn.execute("""SELECT h.name, a.name, m.home_score, m.away_score, m.date, m.time, m.venue, m.jornada
                          FROM matches m JOIN teams h ON h.id=m.home_team_id JOIN teams a ON a.id=m.away_team_id
                          ORDER BY m.date""").fetchall()
    assert got == [("Las Palmas", "Simusetti", 5, 0, "2025-11-29", "10:30", "ANEXO GRAN CANARIA F8", "Jornada 1"),
                   ("Las Mesas Hu.", "Unión Viera B", 9, 1, "2025-11-30", "10:30", "PEPE GONÇALVEZ", "Jornada 1")]
    assert conn.execute("SELECT current_jornada FROM groups WHERE id=1").fetchone() == ("Jornada 1",)


def test_un_grupo_con_partidos_no_recibe_el_calendario(tmp_path):
    conn, rows = base_2526()
    conn.execute("""INSERT INTO matches(group_id, jornada, date, home_team_id, away_team_id, home_score, away_score)
                    VALUES (1, 'Jornada 1', '2025-11-30', 1, 2, 3, 1)""")
    jornadas = {"Jornada 1": [{"home": "PALMAS, U.D. LAS", "away": 'SIMUSETTI C. F. "A"', "hs": 5, "as": 0,
                               "date": "2025-11-29", "time": "", "venue": "", "referee": "", "fiflp_acta": None}]}
    (tmp_path / "fiflp_detalle_2025-2026_raw.json").write_text(
        json.dumps(detalle_raw(rows, {"jornadas": jornadas})), encoding="utf-8")
    D.import_changed_detalle(conn, folder=str(tmp_path), log=lambda *a: None, calendar_seasons=("2025-2026",))
    assert conn.execute("SELECT count(*) FROM matches").fetchone()[0] == 1


# ── App de futbolaspalmas ─────────────────────────────────────────────────────

def test_goleadores_de_la_app():
    text = "22&#039; - Adrian \r\n45&#039; - Zullivan \r\n81&#039; - Hector"
    assert A.parse_goleadores(text) == [(22, "Adrian"), (45, "Zullivan"), (81, "Hector")]
    assert A.parse_goleadores("") == [] and A.parse_goleadores(None) == []
    assert A.parse_goleadores("Pablo") == [(None, "Pablo")]


def base_2627():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2026-2027', 2026, 2027, 1);
      INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN'), (2, 'PREBENJAMIN');
      INSERT INTO groups(id, season_id, category_id, code, name) VALUES (1, 1, 1, 'FF5', 'Grupo 5'), (2, 1, 1, 'FF1', 'Grupo 1');
      INSERT INTO teams(id, name) VALUES (1, 'Las Mesas Hu.'), (2, 'Acodetti B'), (3, 'Corazón Mª C'),
        (4, 'Atl. Angostura'), (5, 'Costa Ayala'), (6, 'Arucas'),
        (7, 'Guayarmina'), (8, 'UD Barrial'), (9, 'UD Guía'), (10, 'Arucas C'), (11, 'Atalaya B'), (12, 'San Isidro');
      INSERT INTO standings(group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd) VALUES
        (1,1,1,0,0,0,0,0,0,0,0),(1,2,2,0,0,0,0,0,0,0,0),(1,3,3,0,0,0,0,0,0,0,0),(1,4,4,0,0,0,0,0,0,0,0),
        (1,5,5,0,0,0,0,0,0,0,0),(1,6,6,0,0,0,0,0,0,0,0),
        (2,7,1,0,0,0,0,0,0,0,0),(2,8,2,0,0,0,0,0,0,0,0),(2,9,3,0,0,0,0,0,0,0,0),(2,10,4,0,0,0,0,0,0,0,0),
        (2,11,5,0,0,0,0,0,0,0,0),(2,12,6,0,0,0,0,0,0,0,0);
      INSERT INTO matches(id, group_id, jornada, date, time, home_team_id, away_team_id) VALUES
        (1, 1, 'Jornada 1', '2026-10-10', NULL, 1, 2), (2, 1, 'Jornada 1', '2026-10-10', '11:00', 3, 4);
    """)
    return conn


def fp_raw():
    tabla = lambda names: [{"id": 100 + i, "nombre": n, "escudo": "e.png", "equipacion": f"2026-{i}.png",
                            "banderas": "b.png", "sanciones": 0} for i, n in enumerate(names)]
    return {"ligas": {"125": {"name": "Benjamin Gran Canaria Grupo 5", "fetched": "2026-10-07T13:00:00",
                              "meta": {"plazas_ascenso": 4, "texto_ascenso": "Eliminatorias determinar FASE",
                                       "plazas_copa": 1, "texto_copa": "FASE “F”", "total_jornadas": 5},
                              "tabla": tabla(["Las Mesas Huracán", "Acodetti CF B", "Corazón de María C",
                                              "Atl. Angostura", "Costa Ayala", "Arucas CF"])}},
            "partidos": {
                "1": {"id": 1, "liga_id": 125, "jornada": 1, "estado": "finalizado",
                      "fecha_programada": "2026-10-10 09:30:00", "local": "Las Mesas Huracán",
                      "visitante": "Acodetti CF B", "goles_local": 3, "goles_visitante": 1,
                      "goleadores_local": "5&#039; - Dylan \r\n20&#039; - Leo\r\n31&#039; - Dylan",
                      "goleadores_visitante": "12&#039; - Hugo", "estadio": "Pepe Gonçalvez",
                      "campo_gps": "https://maps.app.goo.gl/x"},
                "2": {"id": 2, "liga_id": 125, "jornada": 1, "estado": "no_iniciado",
                      "fecha_programada": "2026-10-10 12:00:00", "local": "Corazón de María C",
                      "visitante": "Atl. Angostura", "goles_local": 0, "goles_visitante": 0}}}


def test_app_casa_liga_equipos_y_partidos_y_completa_lo_que_falta(tmp_path):
    conn = base_2627()
    (tmp_path / "fp_app_2026-2027_raw.json").write_text(json.dumps(fp_raw()), encoding="utf-8")
    rep = A.import_changed_fp_app(conn, folder=str(tmp_path), log=lambda *a: None)["fp_app_2026-2027_raw.json"]
    assert (rep["ligas"], rep["partidos"], rep["resultados"], rep["goles"]) == (1, 2, 1, 4)
    assert conn.execute("SELECT group_id, texto_ascenso, plazas_copa FROM fp_ligas").fetchone() == \
        (1, "Eliminatorias determinar FASE", 1)
    assert conn.execute("SELECT team_id FROM fp_teams WHERE name='Las Mesas Huracán'").fetchone() == (1,)
    assert conn.execute("SELECT count(team_id) FROM fp_teams").fetchone() == (6,)
    # El resultado finalizado entra; la hora solo donde faltaba.
    assert conn.execute("SELECT home_score, away_score, time FROM matches WHERE id=1").fetchone() == (3, 1, "09:30")
    assert conn.execute("SELECT home_score, time FROM matches WHERE id=2").fetchone() == (None, "11:00")
    goles = conn.execute("""SELECT side, minute, name FROM fp_goals g JOIN fp_matches m ON m.fp_id=g.fp_id
                            WHERE m.match_id=1 ORDER BY ord""").fetchall()
    assert goles == [("h", 5, "Dylan"), ("h", 20, "Leo"), ("h", 31, "Dylan"), ("a", 12, "Hugo")]


def test_app_nunca_cambia_un_marcador_que_ya_esta(tmp_path):
    conn = base_2627()
    conn.execute("UPDATE matches SET home_score=4, away_score=1 WHERE id=1")
    (tmp_path / "fp_app_2026-2027_raw.json").write_text(json.dumps(fp_raw()), encoding="utf-8")
    A.import_changed_fp_app(conn, folder=str(tmp_path), log=lambda *a: None)
    assert conn.execute("SELECT home_score, away_score FROM matches WHERE id=1").fetchone() == (4, 1)
