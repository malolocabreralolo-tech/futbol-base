"""Los nombres de equipo de la Fase Previa alevín de Gran Canaria 2026-27.

teams.name es único y lo comparten todas las categorías: la activación (activate_season.known_names)
casó mal varios clubes y mezcló sus fichas ('MESAS HURACAN, U.D. LAS "B"' en 'Huracán B', el B de AD
Huracán; 'FUNDACION GUINIGUADA' en Guiniguada; dos equipos de Las Palmas en una fila…). Aquí: la lógica
que ya no lo hace.
"""
import json
import re
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import fiflp_names  # noqa: E402
from activate_season import known_names, name_clashes, pretty_name  # noqa: E402
from db import SCHEMA  # noqa: E402


@pytest.fixture
def table(tmp_path, monkeypatch):
    """La tabla de nombres revisados (fiflp_team_names.json) de la prueba."""
    def write(entries):
        path = tmp_path / "fiflp_team_names.json"
        path.write_text(json.dumps(entries, ensure_ascii=False), encoding="utf-8")
        monkeypatch.setattr(fiflp_names, "FED_NAMES_PATH", str(path))
        fiflp_names.fed_alias.cache_clear()
    return write


def base():
    from import_fiflp_detalle import migrate as detalle
    from import_fp_app import migrate as fp_app
    from migrate_actas_schema import migrate as actas
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    actas(conn)
    detalle(conn)
    fp_app(conn)
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES
        (1, '2022-2023', 2022, 2023, 0), (2, '2025-2026', 2025, 2026, 0), (3, '2026-2027', 2026, 2027, 1);
      INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN'), (2, 'PREBENJAMIN'), (4, 'ALEVIN');
    """)
    return conn


def put(conn, season_id, cat, code, island, teams, fed=None):
    """Un grupo con su clasificación (y la ficha de la federación de cada equipo, si `fed` la trae)."""
    gid = conn.execute("INSERT INTO groups(season_id, category_id, code, island) VALUES (?,?,?,?)",
                       (season_id, cat, code, island)).lastrowid
    for pos, name in enumerate(teams, 1):
        row = conn.execute("SELECT id FROM teams WHERE name=?", (name,)).fetchone()
        tid = row[0] if row else conn.execute("INSERT INTO teams(name) VALUES (?)", (name,)).lastrowid
        conn.execute("""INSERT INTO standings(group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd)
                        VALUES (?,?,?,0,0,0,0,0,0,0,0)""", (gid, tid, pos))
        if fed and name in fed:
            conn.execute("INSERT OR REPLACE INTO team_seasons(team_id, season_id, fiflp_name) VALUES (?,?,?)",
                         (tid, season_id, fed[name]))
    return gid


def raw(*groups, island="grancanaria", cat="alevin"):
    return [{"island": island, "cat": cat, "standings": [{"team": t} for t in teams], "jornadas": []}
            for teams in groups]


def tid(conn, name):
    row = conn.execute("SELECT id FROM teams WHERE name=?", (name,)).fetchone()
    return row[0] if row else None


# ── La lógica: activate_season.known_names ──────────────────────────────────

def test_a_filial_goes_with_its_club_not_with_another_club_s_filial():
    """'MESAS HURACAN, U.D. LAS "B"' y '"C"' casaban por palabras (HURACAN) con 'Huracán B' y 'AD
    Huracán C', los de AD Huracán, otro club: su primer equipo es Las Mesas Hu."""
    conn = base()
    put(conn, 3, 1, "FF5", "grancanaria", ["Las Mesas Hu.", "AD Huracán"])
    put(conn, 3, 1, "FF12", "grancanaria", ["Huracán B"])
    put(conn, 3, 1, "FF14", "grancanaria", ["AD Huracán C"])
    put(conn, 1, 1, "GC5", "grancanaria", ["Las Mesas Hu. B"])          # su B, en 2022-23
    names = known_names(raw(['MESAS HURACAN, U.D. LAS "A"', 'MESAS HURACAN, U.D. LAS "C"'],
                            ['MESAS HURACAN, U.D. LAS "B"', 'MESAS HURACAN, U.D. LAS "D"'],
                            ['HURACAN, A.D. "A"', 'HURACAN, A.D. "B"']), conn)
    assert names['MESAS HURACAN, U.D. LAS "A"'] == "Las Mesas Hu."
    assert names['MESAS HURACAN, U.D. LAS "B"'] == "Las Mesas Hu. B", "el de su familia, que la base ya tiene"
    assert names['MESAS HURACAN, U.D. LAS "C"'] == "Las Mesas Hu. C"
    assert names['MESAS HURACAN, U.D. LAS "D"'] == "Las Mesas Hu. D"
    assert names['HURACAN, A.D. "A"'] == "AD Huracán"
    assert names['HURACAN, A.D. "B"'] == "Huracán B"
    assert name_clashes(names) == []


def test_without_ad_huracan_in_the_raw_its_filials_are_still_not_las_mesas():
    conn = base()
    put(conn, 3, 1, "FF5", "grancanaria", ["Las Mesas Hu."])
    put(conn, 3, 1, "FF12", "grancanaria", ["Huracán B", "AD Huracán C"])
    names = known_names(raw(['MESAS HURACAN, U.D. LAS "A"', 'MESAS HURACAN, U.D. LAS "B"',
                             'MESAS HURACAN, U.D. LAS "C"']), conn)
    assert names['MESAS HURACAN, U.D. LAS "B"'] == "Las Mesas Hu. B"
    assert names['MESAS HURACAN, U.D. LAS "C"'] == "Las Mesas Hu. C"


def test_a_base_name_belongs_to_one_club(table):
    """'FUNDACION GUINIGUADA' (su núcleo es GUINIGUADA) se llevaba 'Guiniguada' en la primera pasada y
    GUINIGUADA APOLINARIO, el que lo es, lo recuperaba por la tabla revisada: los dos en una fila. Y
    'FUNDACION CANARIA U.D. LAS PALMAS' casaba con 'Las Palmas' en la pasada siguiente, ya de 'PALMAS,
    U.D. LAS'."""
    table({'GUINIGUADA APOLINARIO, C.D. "A"': "Guiniguada"})
    conn = base()
    put(conn, 3, 1, "FF4", "grancanaria", ["Guiniguada", "Las Palmas"])
    put(conn, 2, 1, "FF11", "grancanaria", ["Fundación Guini.", "Guiniguada", "Las Palmas"])
    crudos = ['GUINIGUADA APOLINARIO, C.D. "A"', 'FUNDACION GUINIGUADA, C.D. DE LA "A"',
              "PALMAS, U.D. LAS", "FUNDACION CANARIA U.D. LAS PALMAS, C.D."]
    names = known_names(raw(crudos[:2], crudos[2:]), conn)
    assert names['GUINIGUADA APOLINARIO, C.D. "A"'] == "Guiniguada"
    assert names["PALMAS, U.D. LAS"] == "Las Palmas"
    assert names['FUNDACION GUINIGUADA, C.D. DE LA "A"'] not in ("Guiniguada", "Las Palmas")
    assert names["FUNDACION CANARIA U.D. LAS PALMAS, C.D."] not in ("Guiniguada", "Las Palmas")
    assert name_clashes(names) == []
    # Con sus nombres revisados, los de la base.
    table({'GUINIGUADA APOLINARIO, C.D. "A"': "Guiniguada", "FUNDACION GUINIGUADA, C.D. DE LA": "Fundación Guini.",
           "FUNDACION CANARIA U.D. LAS PALMAS, C.D.": "Fundación UD Las Palmas"})
    names = known_names(raw(crudos[:2], crudos[2:]), conn)
    assert names['FUNDACION GUINIGUADA, C.D. DE LA "A"'] == "Fundación Guini."
    assert names["FUNDACION CANARIA U.D. LAS PALMAS, C.D."] == "Fundación UD Las Palmas"


def test_in_another_category_the_same_club_may_have_another_federation_name(table):
    """La reserva es por categoría: en 2026-27, Roque Amagro es 'CLARAVISION-ROQUE AMAGRO, C.D.' en benjamín
    y 'ROQUE AMAGRO DE GALDAR, C.D.' en prebenjamín, y los dos son la misma fila. Y dos grafías del mismo
    equipo en un grupo ('MESAS B, U.D. LAS "B"' en la tabla y 'MESAS, U.D. LAS "B"' en el calendario) también."""
    table({"CLARAVISION-ROQUE AMAGRO, C.D.": "Roque Amagro"})
    conn = base()
    put(conn, 3, 1, "FF2", "grancanaria", ["Roque Amagro", "Las Mesas Hu."])
    put(conn, 2, 1, "FF13", "grancanaria", ["Las Mesas B"])
    names = known_names(raw(["CLARAVISION-ROQUE AMAGRO, C.D."], cat="benjamin")
                        + raw(["ROQUE AMAGRO DE GALDAR, C.D.", 'MESAS B, U.D. LAS "B"', 'MESAS, U.D. LAS "B"'],
                              cat="prebenjamin"), conn)
    assert names["CLARAVISION-ROQUE AMAGRO, C.D."] == names["ROQUE AMAGRO DE GALDAR, C.D."] == "Roque Amagro"
    assert names['MESAS B, U.D. LAS "B"'] == names['MESAS, U.D. LAS "B"'] == "Las Mesas B"


def test_a_candidate_of_another_island_never_takes_the_slot():
    """'PUERTOS DE L.P., C.E.F.' empataba (0,75) con Puerto del Carmen, de Lanzarote, que ganaba por orden
    alfabético y después se descartaba por la isla: Puertos LP se quedaba sin casar y salía 'Puertos de'."""
    conn = base()
    put(conn, 3, 1, "FF11", "grancanaria", ["Puertos LP"])
    put(conn, 3, 1, "FF7", "grancanaria", ["Puertos LP B"])
    put(conn, 3, 1, "LZ3", "lanzarote", ["Puerto del Carmen", "Puerto del Carmen B"])
    names = known_names(raw(['PUERTOS DE L.P., C.E.F. "A"', 'PUERTOS DE L.P., C.E.F. "B"']), conn)
    assert names['PUERTOS DE L.P., C.E.F. "A"'] == "Puertos LP"
    assert names['PUERTOS DE L.P., C.E.F. "B"'] == "Puertos LP B"


def test_a_phase_added_to_the_season_takes_the_row_of_the_other_categories(table):
    """La tabla revisada lleva 'VICTORIA, REAL CLUB' a 'Victoria', la fila de 2014-25; en 2026-27 benjamín
    y prebenjamín usan 'RC Victoria' (su ficha de la federación): al añadir alevín, esa."""
    table({"VICTORIA, REAL CLUB": "Victoria"})
    conn = base()
    put(conn, 2, 1, "B2", "grancanaria", ["Victoria"])
    put(conn, 3, 1, "FF9", "grancanaria", ["RC Victoria", "RC Victoria B"],
        fed={"RC Victoria": "VICTORIA, REAL CLUB", "RC Victoria B": 'VICTORIA, REAL CLUB "B"'})
    crudos = raw(['VICTORIA, REAL CLUB "A"', 'VICTORIA, REAL CLUB "B"'])
    assert known_names(crudos, conn)['VICTORIA, REAL CLUB "A"'] == "Victoria"        # sin temporada: la tabla
    names = known_names(crudos, conn, season="2026-2027")
    assert names == {'VICTORIA, REAL CLUB "A"': "RC Victoria", 'VICTORIA, REAL CLUB "B"': "RC Victoria B"}


def test_the_card_of_the_season_is_ignored_when_two_rows_share_it():
    conn = base()
    put(conn, 3, 1, "FF12", "grancanaria", ["Atlético Fomento", "Otro Fomento"],
        fed={"Atlético Fomento": 'ATLETICO FOMENTO, CLUB "A"', "Otro Fomento": 'ATLETICO FOMENTO, CLUB "A"'})
    names = known_names(raw(['ATLETICO FOMENTO, CLUB "A"']), conn, season="2026-2027")
    assert names['ATLETICO FOMENTO, CLUB "A"'] == "Atlético Fomento"                  # por palabras, como antes


def test_pretty_name_drops_the_preposition_of_a_removed_abbreviation():
    assert pretty_name("PUERTOS DE L.P., C.E.F.") == "Puertos"
    assert pretty_name('PUERTOS DE L.P., C.E.F. "B"') == "Puertos B"
    assert pretty_name("NATURALEZA VERDE-VALLESECO DE G.C., C.D.") == "Naturaleza Verde-Valleseco"
    assert pretty_name('PEÑA DE LA AMISTAD "A", C.D. A') == "Peña de La Amistad"     # en medio, se queda


def test_name_clashes_spots_two_clubs_but_not_two_spellings(table):
    table({"ROQUE AMAGRO-CLARAVISION, C.D.": "Roque Amagro", "CLARAVISION-ROQUE AMAGRO, C.D.": "Roque Amagro"})
    assert name_clashes({'GUINIGUADA APOLINARIO, C.D. "A"': "Guiniguada",
                         'FUNDACION GUINIGUADA, C.D. DE LA "A"': "Guiniguada"}) == [
        ("Guiniguada", ['FUNDACION GUINIGUADA, C.D. DE LA "A"', 'GUINIGUADA APOLINARIO, C.D. "A"'])]
    assert name_clashes({'TINAJOB, C.D. "B"': "Tinajo B", 'TINAJO "B", C.D. B': "Tinajo B",
                         'UNION VIERA A, C.F. "A"': "Unión Viera", "UNION VIERA, C.F.": "Unión Viera",
                         "ROQUE AMAGRO-CLARAVISION, C.D.": "Roque Amagro",
                         "CLARAVISION-ROQUE AMAGRO, C.D.": "Roque Amagro"}) == []


def test_the_real_reviewed_table_keeps_the_four_clubs_apart(monkeypatch):
    """Los nombres de la federación de 2026-27 que la tabla del proyecto (fiflp_team_names.json) lleva a su
    fila, y los dos que deben seguir yendo a la suya."""
    monkeypatch.setattr(fiflp_names, "FED_NAMES_PATH", str(ROOT / "scripts" / "fiflp_team_names.json"))
    fiflp_names.fed_alias.cache_clear()
    alias = fiflp_names.fed_alias
    assert alias('FUNDACION GUINIGUADA, C.D. DE LA "A"') == "Fundación Guini."
    assert alias("FUNDACION CANARIA U.D. LAS PALMAS, C.D.") == "Fundación UD Las Palmas"
    assert alias("NATURALEZA VERDE-VALLESECO DE G.C., C.D.") == "Naturaleza Verde-Valleseco"
    assert alias("ALCOTAN CANARIAS, C.D.") == "Alcotán Can."
    assert alias('GUINIGUADA APOLINARIO, C.D. "A"') == "Guiniguada"
    assert alias("PALMAS, U.D. LAS") is None and alias("VALLESECO, U.D.") is None
