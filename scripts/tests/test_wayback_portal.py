"""Las temporadas antiguas de futbolaspalmas.com desde Wayback (2026-10): los lectores de sus
tres formatos (páginas reales en fixtures/wayback/) y su importación."""
import gzip
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import wayback_portal as W
import import_wayback_portal as P
from db import SCHEMA
from migrate_actas_schema import migrate

FIX = Path(__file__).parent / "fixtures" / "wayback"


def page(name):
    return W.decode(gzip.decompress((FIX / name).read_bytes()))


def test_pagina_de_grupo_2015_16_con_la_clasificacion_en_tabla():
    html = page("f2015_tabla_1516_GC1.html.gz")
    jornadas = W.matches_f2015(html)
    assert len(jornadas) == 30 and sum(len(ms) for ms in jornadas.values()) == 210
    assert jornadas[1][0] == {"date": "2015-10-02", "time": "19:00", "home": "CD Becerril", "away": "CD San Isidro",
                              "hs": 7, "as": 4, "venue": "LA ATALAYA"}
    assert W.season_of_matches(jornadas) == "2015-2016"
    table = W.standings_f2015(html)
    assert table[0] == [1, "UD Moya A", 69, 28, 22, 3, 3, 120, 33, 87]
    assert len(table) == 15 and [r[0] for r in table] == list(range(1, 16))


def test_pagina_de_grupo_2018_19_con_la_clasificacion_en_divs():
    html = page("f2015_divs_1819_GC1.html.gz")
    jornadas = W.matches_f2015(html)
    assert len(jornadas) == 30 and sum(len(ms) for ms in jornadas.values()) == 240
    assert jornadas[30][-1]["home"] == "Santidad" and jornadas[30][-1]["time"] == "18:00"
    assert W.season_of_matches(jornadas) == "2018-2019"
    table = W.standings_f2015(html)
    assert table[0] == [1, "Goleta Lab.", 84, 30, 28, 0, 2, 295, 30, 265] and len(table) == 16


def test_calendario_y_clasificacion_de_2013_14():
    jornadas = W.matches_calendar(page("calendario_1314_GC9.html.gz"))
    assert len(jornadas) == 30 and sum(len(ms) for ms in jornadas.values()) == 210
    assert jornadas[1][0]["home"] == "CD Pl. del Hombre A" and jornadas[1][0]["date"] == "2013-10-05"
    admin = [m for m in jornadas[1] if m.get("admin")]
    assert admin[0] == {"date": "2013-10-05", "time": "09:00", "home": "Estrella CF C", "away": "CD Longueras B",
                        "hs": 0, "as": 3, "venue": None, "admin": True}
    table = W.standings_old(page("ztorneo_1314_GC7.html.gz"))
    assert table[0] == [1, "Acodetti CF A", 84, 28, 28, 0, 0, 294, 22, 272] and len(table) == 15


def test_nombres_del_portal():
    assert W.team_name("Goleta Labr.B *") == "Goleta Labr.B"
    assert W.team_name("*Las Majoreras B") == "Las Majoreras B"
    assert P.portal_name("Atlco.Fomento A") == "Atlético Fomento"
    assert P.portal_name("Estrella A C.f.") == "Estrella"
    assert P.portal_name("A.D. Huracán ®") == "A.D. Huracán"
    assert P.is_placeholder("EXCLUIDO ®") and not P.is_placeholder("Excelsior")
    assert P.portal_alias("CD Veteranos del Pilar C") == "Veteranos C"
    assert P.portal_alias("UD Las Mesas Ba.") == "Las Mesas Hu."
    assert W.season_of("2015-08-30") == "2015-2016" and W.season_of("2016-05-21") == "2015-2016"


def _base():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2017-2018', 2017, 2018, 0);
      INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN'), (2, 'PREBENJAMIN');
      INSERT INTO groups(id, season_id, category_id, code, name, phase) VALUES (1, 1, 1, 'GC4', 'Grupo 4', 'Primera Fase GC');
      INSERT INTO teams(id, name) VALUES (1, 'Las Mesas Hu.'), (2, 'Unión Carrizal'), (3, 'Ingenio'), (4, 'Santa Brígida');
      INSERT INTO standings(group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd) VALUES
        (1, 2, 1, 6, 2, 2, 0, 0, 5, 1, 4), (1, 3, 2, 3, 2, 1, 0, 1, 3, 3, 0), (1, 4, 3, 0, 2, 0, 0, 2, 1, 5, -4);
    """)
    return conn


def _write(tmp_path, season, raw):
    (tmp_path / f"wayback_portal_{season}_raw.json").write_text(json.dumps(raw), encoding="utf-8")


def _m(date, home, away, hs, as_):
    return {"date": date, "time": "10:00", "home": home, "away": away, "hs": hs, "as": as_, "venue": "X"}


def test_temporada_nueva_con_sus_grupos_clasificacion_y_partidos(tmp_path):
    conn = _base()
    _write(tmp_path, "2015-2016", {"GC1": {
        "category": "BENJAMIN", "phase": "Primera Fase GC", "island": "grancanaria", "name": "Grupo 1",
        "title": "BENJAMIN PRIMERA GRUPO 1",
        "standings": [[1, "UD Las Mesas Ba.", 3, 1, 1, 0, 0, 4, 1, 3], [2, "Ingenio A", 0, 1, 0, 0, 1, 1, 4, -3],
                      [3, "EXCLUIDO ®", 0, 0, 0, 0, 0, 0, 0, 0]],
        "jornadas": {"Jornada 1": [_m("2015-10-03", "UD Las Mesas Ba.", "Ingenio A", 4, 1),
                                   _m("2015-10-03", "EXCLUIDO ®", "Ingenio A", 0, 3)]}}})
    rep = P.import_changed_portal(conn, folder=str(tmp_path), log=lambda *a: None)["wayback_portal_2015-2016_raw.json"]
    assert rep["mode"] == "season" and rep["groups"] == 1 and rep["matches"] == 1
    sid = conn.execute("SELECT id, is_current FROM seasons WHERE name='2015-2016'").fetchone()
    assert sid[1] == 0
    table = conn.execute("""SELECT st.position, t.name FROM standings st JOIN teams t ON t.id=st.team_id
                            JOIN groups g ON g.id=st.group_id WHERE g.season_id=? ORDER BY st.position""",
                         (sid[0],)).fetchall()
    # Las Mesas con su nombre de la base (tabla revisada); «Ingenio A» es el Ingenio de la base; la plaza
    # «EXCLUIDO» no es un equipo.
    assert table == [(1, "Las Mesas Hu."), (2, "Ingenio")]
    assert conn.execute("SELECT count(*) FROM teams WHERE name LIKE 'EXCLUIDO%'").fetchone()[0] == 0
    # Sin cambios, nada.
    assert P.import_changed_portal(conn, folder=str(tmp_path), log=lambda *a: None) == {}


def test_temporada_de_la_federacion_solo_partidos_entre_sus_equipos(tmp_path):
    conn = _base()
    _write(tmp_path, "2017-2018", {"GC4": {
        "category": "BENJAMIN", "phase": "Primera Fase GC", "island": "grancanaria", "name": "Grupo 4",
        "standings": [[1, "Unión Carrizal", 9, 3, 3, 0, 0, 8, 1, 7], [2, "Ingenio", 3, 3, 1, 0, 2, 3, 3, 0],
                      [3, "Villa", 3, 3, 1, 0, 2, 4, 5, -1], [4, "Yoñé *", 0, 3, 0, 0, 3, 0, 9, -9]],
        "jornadas": {
            "Jornada 1": [_m("2017-10-07", "Unión Carrizal", "Ingenio", 2, 0), _m("2017-10-07", "Villa", "Yoñé *", 3, 0)],
            "Jornada 2": [_m("2017-10-14", "Ingenio", "Villa", 3, 1), _m("2017-10-14", "Yoñé *", "Unión Carrizal", 0, 3)],
            "Jornada 3": [_m("2017-10-21", "Villa", "Unión Carrizal", 0, 3)]}}})
    rep = P.import_changed_portal(conn, folder=str(tmp_path), log=lambda *a: None)["wayback_portal_2017-2018_raw.json"]
    assert rep["mode"] == "matches" and rep["groups"] == 1
    got = conn.execute("""SELECT m.jornada, h.name, a.name, m.home_score, m.away_score FROM matches m
                          JOIN teams h ON h.id=m.home_team_id JOIN teams a ON a.id=m.away_team_id ORDER BY m.jornada""").fetchall()
    # Los del retirado (Yoñé, administrativos) no entran; «Villa» es Santa Brígida.
    assert got == [("Jornada 1", "Unión Carrizal", "Ingenio", 2, 0), ("Jornada 2", "Ingenio", "Santa Brígida", 3, 1),
                   ("Jornada 3", "Santa Brígida", "Unión Carrizal", 0, 3)]
    # La clasificación oficial no se toca.
    assert conn.execute("SELECT count(*) FROM standings").fetchone()[0] == 3
    assert conn.execute("SELECT count(*) FROM teams").fetchone()[0] == 4


def test_una_temporada_de_la_federacion_que_aun_no_esta_espera(tmp_path):
    conn = _base()
    _write(tmp_path, "2016-2017", {"GC1": {"category": "BENJAMIN", "phase": "Primera Fase GC", "island": "grancanaria",
                                            "name": "Grupo 1", "standings": [],
                                            "jornadas": {"Jornada 1": [_m("2016-10-01", "A", "B", 1, 0)]}}})
    assert P.import_changed_portal(conn, folder=str(tmp_path), log=lambda *a: None) == {}
    assert not conn.execute("SELECT 1 FROM seasons WHERE name='2016-2017'").fetchone()
    assert not conn.execute("SELECT 1 FROM raw_imports WHERE path LIKE 'wayback_portal_2016%'").fetchone()


def test_clasificacion_calculada_de_los_partidos():
    rows = P.computed_standings(["A", "B", "C"], {"Jornada 1": [_m("2014-10-04", "A", "B", 3, 1), _m("2014-10-04", "C", "A", 2, 2)],
                                                   "Jornada 2": [_m("2014-10-11", "B", "C", None, None)]})
    assert rows == [[1, "A", 4, 2, 1, 1, 0, 5, 3, 2], [2, "C", 1, 1, 0, 1, 0, 2, 2, 0], [3, "B", 0, 1, 0, 0, 1, 1, 3, -2]]


def test_filas_de_la_tabla_que_no_son_equipos():
    rows = [[1, "UD Moya", 9, 3, 3, 0, 0, 9, 1, 8], [2, "Atlético G.C. B *", 3, 3, 1, 0, 2, 4, 5, -1],
            [3, "Nacional S.b. Cd", 0, 6, 5, 1, 0, 20, 3, 17], [4, "Barrio Atlántico C ®", 0, 0, 0, 0, 0, 0, 0, 0],
            [5, "EXCLUIDO", 0, 0, 0, 0, 0, 0, 0, 0]]
    jornadas = {"Jornada 1": [_m("2015-10-03", "UD Moya", "Atlético G.C. B", 2, 0)]}
    assert [r[:2] for r in P.table_rows(rows, jornadas)] == [[1, "UD Moya"], [2, "Atlético G.C. B *"]]
    # Sin calendario (2012-13), el que no ha jugado se queda; el excluido, no.
    assert [r[1] for r in P.table_rows(rows, {})] == ["UD Moya", "Atlético G.C. B *", "Barrio Atlántico C ®"]


def test_el_mismo_equipo_con_y_sin_marca_casa_una_sola_vez():
    conn = _base()
    names = P.base_names_for(conn, ["Atlético G.C. B *", "Atlético G.C. B", "Ingenio A"])
    assert names["Atlético G.C. B *"] == names["Atlético G.C. B"]
    assert names["Ingenio A"] == "Ingenio"
