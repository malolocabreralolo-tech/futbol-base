"""Todo el cuerpo técnico del acta (2.º entrenador, entrenador en prácticas…), el
código del campo y la relectura de las actas ya descargadas (--refrescar), 2026-10."""
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(1, str(ROOT))
from fiflp_acta import STAFF_VERSION, parse_flat_acta, staff_lines
from db import SCHEMA
from migrate_actas_schema import migrate
import import_fiflp_actas as I
from scripts.fetch_fiflp_actas import keep_old_on_refresh, needs_refresh

FIX = ROOT / "scripts" / "tests" / "fixtures"
SBD = "acta_flat_2627_sanbartolomeD_puertocarmen.html"


def test_el_cuerpo_tecnico_entero_en_su_orden():
    text = ("Cuerpo Técnico\nDEL. Campo: GUTIERREZ SANTANA, JOSE AITOR\nDEL. Equipo: GUTIERREZ SANTANA, JOSE AITOR\n"
            "Entrenador: DAMASO SANCHEZ, JUAN MANUEL\n2ºEntrenador: MORALES CEDRES, BORJA\n"
            "ENTRENADOR EN PRACTICAS : HERRERA SANTANA, IVAN FRANCISCO\nPreparador Físico: No presenta")
    assert staff_lines(text) == [
        ["DEL. Campo", "GUTIERREZ SANTANA, JOSE AITOR"], ["DEL. Equipo", "GUTIERREZ SANTANA, JOSE AITOR"],
        ["Entrenador", "DAMASO SANCHEZ, JUAN MANUEL"], ["2ºEntrenador", "MORALES CEDRES, BORJA"],
        ["ENTRENADOR EN PRACTICAS", "HERRERA SANTANA, IVAN FRANCISCO"]]


def test_el_acta_aplanada_trae_cuerpo_tecnico_y_codigo_de_campo():
    a = parse_flat_acta((FIX / SBD).read_text(encoding="utf-8"))
    assert a["staff_v"] == STAFF_VERSION
    assert a["header"]["venue_code"] == 257
    assert a["staff"]["all_home"] == [["DEL. Campo", "FRANCISCO CONCEPCIÓN, MAURO JESUS"],
                                      ["DEL. Equipo", "TORRES RODRIGUEZ, DIEGO"],
                                      ["Entrenador", "VIERA RATA, CRISTHOFER"]]
    assert ["Entrenador", "RAMIREZ GONZALEZ, HECTOR JOSE"] in a["staff"]["all_away"]
    # Lo de siempre no cambia.
    assert a["staff"]["coach_home"] == "VIERA RATA, CRISTHOFER"


def test_cargos_de_un_acta_vieja_y_de_una_nueva():
    old = {"staff": {"referee": "PEREZ, ANA", "referees": ["Árbitro/a Principal PEREZ, ANA"],
                     "coach_home": "GIL, LUIS", "coach_away": None,
                     "delegates_home": {"campo": "RUIZ, EVA", "equipo": None}, "delegates_away": {}}}
    assert I.staff_rows(old) == [(None, "Árbitro/a Principal", "PEREZ, ANA"),
                                 ("home", "DEL. Campo", "RUIZ, EVA"), ("home", "Entrenador", "GIL, LUIS")]
    new = {"staff": {"referees": ["Árbitro/a Principal PEREZ, ANA"],
                     "all_home": [["2ºEntrenador", "MORA, BEA"]], "all_away": []}}
    assert I.staff_rows(new) == [(None, "Árbitro/a Principal", "PEREZ, ANA"), ("home", "2ºEntrenador", "MORA, BEA")]


def base():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2026-2027', 2026, 2027, 1);
      INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN');
      INSERT INTO groups(id, season_id, category_id, code, name) VALUES (1, 1, 1, 'LZ3', 'Grupo 3');
      INSERT INTO teams(id, name) VALUES (1, 'San Bartolomé D'), (2, 'Puerto del Carmen');
      INSERT INTO matches(id, group_id, jornada, date, home_team_id, away_team_id) VALUES
        (1, 1, 'Jornada 1', '2026-10-03', 1, 2);
    """)
    return conn


def test_importar_guarda_todo_el_cuerpo_tecnico_y_el_campo():
    conn = base()
    a = parse_flat_acta((FIX / SBD).read_text(encoding="utf-8"))
    assert I._import_one(conn, 280001, a, mid=1)
    rows = conn.execute("SELECT team_id, role, name FROM match_staff_all WHERE match_id=1 ORDER BY ord").fetchall()
    assert rows[0] == (None, "Árbitro/a Principal", "ÁLVAREZ NAVARRO, VÍCTOR")
    assert (1, "Entrenador", "VIERA RATA, CRISTHOFER") in rows and (2, "Entrenador", "RAMIREZ GONZALEZ, HECTOR JOSE") in rows
    assert conn.execute("SELECT venue_code FROM matches WHERE id=1").fetchone() == (257,)
    # Reimportar no duplica.
    I._import_one(conn, 280001, a, mid=1)
    assert conn.execute("SELECT count(*) FROM match_staff_all").fetchone()[0] == len(rows)


def test_relleno_desde_match_staff():
    conn = base()
    conn.executescript("""
      INSERT INTO match_staff(match_id, team_id, kind, name) VALUES
        (1, 1, 'coach', 'GIL, LUIS'), (1, NULL, 'referee', 'PEREZ, ANA'), (1, 2, 'delegate_team', 'RUIZ, EVA');
    """)
    assert I.backfill_staff_all(conn) == 1
    assert conn.execute("SELECT team_id, role, name FROM match_staff_all ORDER BY ord").fetchall() == [
        (None, "Árbitro/a Principal", "PEREZ, ANA"), (1, "Entrenador", "GIL, LUIS"), (2, "DEL. Equipo", "RUIZ, EVA")]
    assert I.backfill_staff_all(conn) == 0


def test_refrescar_solo_actas_aplanadas_y_nunca_a_peor():
    vieja = {"consistent": True, "header": {}}
    assert needs_refresh(vieja)
    assert not needs_refresh({**vieja, "staff_v": STAFF_VERSION})
    assert not needs_refresh({**vieja, "staff_refresh_failed": True})
    assert not needs_refresh({"header": {}})              # sin aplanar: eso es needs_rescrape
    assert keep_old_on_refresh(vieja, {"header": {}})    # la relectura no se dejó aplanar
    assert keep_old_on_refresh(vieja, {"consistent": False})
    assert not keep_old_on_refresh(vieja, {"consistent": True, "staff_v": STAFF_VERSION})
    assert not keep_old_on_refresh({"consistent": False}, {"consistent": False, "staff_v": STAFF_VERSION})
    assert not keep_old_on_refresh(None, {"consistent": True})
