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


def _cup(comp, comp_name, matches):
    return {"comp": comp, "comp_name": comp_name, "grupo": "1" + comp, "grupo_name": "GRUPO 1", "ok": True,
            "fetched": "2026-10-07", "clasificacion": [], "directorio": [], "jornadas": {"Jornada 26-05-2019 ( Ronda 1 )": [
                {"home": h, "away": a, "hs": hs, "as": as_, "date": "2019-05-26", "time": "11:00", "venue": "LOS VOLCANES",
                 "referee": "", "fiflp_acta": None} for h, a, hs, as_ in matches]}}


def test_las_finales_y_copas_de_una_archivada_entran_con_sus_equipos(tmp_path):
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    D.migrate(conn)
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2018-2019', 2018, 2019, 0);
      INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN'), (2, 'PREBENJAMIN');
      INSERT INTO groups(id, season_id, category_id, code, name, phase) VALUES
        (1, 1, 1, 'LZ1', 'Grupo 1', 'Liga Primera Lanzarote'), (2, 1, 2, 'PGC1', 'Grupo 1', 'Primera Fase GC');
      INSERT INTO teams(id, name) VALUES (1, 'CD Tinajo'), (2, 'Tite B'), (3, 'Altavista'), (4, 'O. Marítima B'),
                                         (5, 'San Isidro'), (6, 'Veteranos');
      INSERT INTO standings(group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd) VALUES
        (1, 1, 1, 9, 3, 3, 0, 0, 9, 1, 8), (1, 2, 2, 6, 3, 2, 0, 1, 6, 3, 3), (1, 3, 3, 3, 3, 1, 0, 2, 3, 6, -3),
        (1, 4, 4, 0, 3, 0, 0, 3, 1, 9, -8), (2, 5, 1, 3, 1, 1, 0, 0, 2, 1, 1), (2, 6, 2, 0, 1, 0, 0, 1, 1, 2, -1);
      INSERT INTO team_seasons(team_id, season_id, fiflp_code, fiflp_name) VALUES
        (1, 1, 11, 'TINAJO A, U.D. "A"'), (2, 1, 12, 'TITE B, C.D. "B"');
    """)
    raw = {"385:70605": _cup("385", "SEMIFINALES LIGA PRIMERA BENJAMIN LANZAROTE", [
               ('TITE "B", C.D. "B"', 'TINAJO"A", U.D. "A"', 2, 3),
               ('ORIENTACION MARITIMA "B", C.D. "B"', "ALTAVISTA C.F.", 6, 6),
               ("EQUIPO QUE NO ESTA, C.D.", "ALTAVISTA C.F.", 1, 0)]),
           "400:70735": _cup("400", "COPA DE CAMPEONES PREBENJAMIN GRAN CANARIA", [
               ("SAN ISIDRO, S.D.", 'VETERANOS DEL PILA "A", C.D. "A"', 0, 0)]),
           "401:70740": _cup("401", "COPA DE CAMPEONES BENJAMIN GRAN CANARIA", [])}
    (tmp_path / "fiflp_detalle_2018-2019_raw.json").write_text(json.dumps(raw), encoding="utf-8")
    report = D.import_changed_detalle(conn, folder=str(tmp_path), log=lambda *a: None)["fiflp_detalle_2018-2019_raw.json"]
    # La copa sin partidos jugados no se crea.
    assert report["matches"] == 3 and report["unmatched"] == 1
    groups = conn.execute("""SELECT g.code, c.name, g.phase, g.island, count(m.id) FROM groups g JOIN categories c
                             ON c.id=g.category_id JOIN matches m ON m.group_id=g.id
                             WHERE g.id IN (SELECT group_id FROM detalle_groups) GROUP BY g.id ORDER BY g.code""").fetchall()
    assert groups == [("LZ1S1", "BENJAMIN", "Semifinal Liga Primera Lanzarote", "lanzarote", 2),
                      ("PCC1", "PREBENJAMIN", "Copa de Campeones", "grancanaria", 1)]
    got = conn.execute("""SELECT g.code, h.name, a.name, m.home_score, m.away_score FROM matches m
                          JOIN groups g ON g.id=m.group_id JOIN teams h ON h.id=m.home_team_id
                          JOIN teams a ON a.id=m.away_team_id ORDER BY g.code, h.name""").fetchall()
    # Tinajo por su ficha (el calendario lo escribe pegado); la copa prebenjamín, todo 0-0 y sin
    # actas, sin resultado; el equipo que no es de la temporada no entra.
    assert got == [("LZ1S1", "O. Marítima B", "Altavista", 6, 6), ("LZ1S1", "Tite B", "CD Tinajo", 2, 3),
                   ("PCC1", "San Isidro", "Veteranos", None, None)]
    assert conn.execute("SELECT count(*) FROM teams").fetchone()[0] == 6
    # Otra pasada (con la huella borrada) no duplica nada.
    conn.execute("DELETE FROM raw_imports")
    D.import_changed_detalle(conn, folder=str(tmp_path), log=lambda *a: None)
    assert conn.execute("SELECT count(*) FROM matches").fetchone()[0] == 3
    assert conn.execute("SELECT count(*) FROM groups").fetchone()[0] == 4


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


# ── El bot completa la ficha de los equipos nuevos de la temporada en curso ───

class _Page:
    def __init__(self):
        self.url = ""

    def content(self):
        name = "directorio_2526_A2.html" if "LstDirectorioEquipos" in self.url else "campo_75.html"
        return (FIX / name).read_text(encoding="utf-8")


class _F:
    BASE = "https://fed"

    def goto(self, page, url):
        page.url = url
        return True

    def delay(self):
        pass


def test_el_bot_pone_la_ficha_de_los_equipos_que_no_la_tienen():
    import update_fiflp as U
    conn, rows = base_2526()
    url = ("https://www.fiflp.com/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=21"
           "&CodCompeticion=54422953&CodGrupo=54828309")
    conn.execute("UPDATE groups SET url=? WHERE id=1", (url,))
    cards, fields = U.update_directorio(_Page(), _F(), conn, 1, [(1, "A2", url)])
    assert cards >= 10            # los del grupo que casan por nombre
    assert conn.execute("""SELECT ts.shirt, ts.venue_code FROM team_seasons ts JOIN teams t ON t.id=ts.team_id
                           WHERE t.name='Las Mesas Hu.'""").fetchone() == ("BLANCA CON FRANJA ROJA", 148)
    assert fields >= 1 and conn.execute("SELECT count(*) FROM venue_details").fetchone()[0] >= 1
    # Con todos los equipos ya con ficha, no vuelve a pedir el directorio.
    page = _Page()
    U.update_directorio(page, _F(), conn, 1, [(1, "A2", url)])
    assert "LstDirectorioEquipos" not in page.url or cards < 12


# ── Goles de la app en la cronología (generate_js._fp_goal_entries) ───────────

def test_los_goles_de_la_app_ponen_nombre_a_los_que_el_acta_no_publica(tmp_path):
    import generate_js as G
    conn = base_2627()
    (tmp_path / "fp_app_2026-2027_raw.json").write_text(json.dumps(fp_raw()), encoding="utf-8")
    A.import_changed_fp_app(conn, folder=str(tmp_path), log=lambda *a: None)
    # Sin acta: la cronología de la app, con el marcador parcial.
    pairs = G._fp_goal_entries(conn)
    assert len(pairs) == 1
    key, entry = pairs[0]
    assert key == "Las Mesas Hu.|Acodetti B|3-1"
    assert entry["src"] == "fp" and entry["gr"] == "FF5" and entry["s"] == "2026-2027"
    assert entry["g"] == [[5, "Dylan", "1-0", "h", "r"], [12, "Hugo", "1-1", "a", "r"],
                          [20, "Leo", "2-1", "h", "r"], [31, "Dylan", "3-1", "h", "r"]]
    # Con acta: si trae todos los nombres, manda el acta (no sale aquí)…
    from import_fiflp_actas import _anonymous_player
    conn.execute("UPDATE matches SET cod_acta=1 WHERE id=1")
    conn.executescript("""INSERT INTO players(id, full_name, norm_name) VALUES (50, 'GIL, DYLAN', 'gil dylan'),
        (51, 'RUIZ, LEO', 'ruiz leo'), (52, 'PEREZ, HUGO', 'perez hugo');""")
    for pid, team, minute in ((50, 1, 5), (52, 2, 12), (51, 1, 20), (50, 1, 31)):
        conn.execute("INSERT INTO match_events(match_id, team_id, player_id, kind, minute, goal_type) VALUES (1,?,?,'goal',?,'normal')",
                     (team, pid, minute))
    assert G._fp_goal_entries(conn) == []
    # …y si alguno va sin nombre (un niño que la federación no publica), se le pone el de la app.
    anon = _anonymous_player(conn)
    conn.execute("UPDATE match_events SET player_id=? WHERE minute IN (5, 31)", (anon,))
    (_, entry), = G._fp_goal_entries(conn)
    assert [g[1] for g in entry["g"]] == ["Dylan", "PEREZ, HUGO", "RUIZ, LEO", "Dylan"]
    assert [g[2] for g in entry["g"]] == ["1-0", "1-1", "2-1", "3-1"]
