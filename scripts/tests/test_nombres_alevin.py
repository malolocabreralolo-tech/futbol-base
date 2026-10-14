"""Los nombres de equipo de la Fase Previa alevín de Gran Canaria 2026-27.

teams.name es único y lo comparten todas las categorías: la activación (activate_season.known_names)
casó mal varios clubes y mezcló sus fichas ('MESAS HURACAN, U.D. LAS "B"' en 'Huracán B', el B de AD
Huracán; 'FUNDACION GUINIGUADA' en Guiniguada; dos equipos de Las Palmas en una fila…). Aquí: la lógica
que ya no lo hace, el paso del bot que corrige la base (migrate_team_names) y el bot, que al leer de
nuevo los grupos no recrea los nombres malos ni repite partidos.
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


def test_a_filial_with_its_row_keeps_it_even_if_it_is_called_like_its_pretty_name():
    """El último paso de known_names nombra el filial de un club nuevo como su primer equipo más la letra
    cuando su nombre es el de pretty_name. 'Atalaya B' (la ficha de 2026-27 de 'ATALAYA, U.D. "B"', o la
    fila que casa por palabras) se llama como su pretty_name, y lo reescribía a 'UD Atalaya B', una fila
    que no existe: con --add, la ficha de la temporada no mandaba; sin ella, lo mismo con 'Arinaga B'."""
    conn = base()
    put(conn, 3, 1, "FF1", "grancanaria", ["UD Atalaya", "Atalaya B", "CD Arinaga", "Arinaga B"],
        fed={"UD Atalaya": "ATALAYA, U.D.", "Atalaya B": 'ATALAYA, U.D. "B"'})
    crudos = raw(['ATALAYA, U.D. "A"', 'ATALAYA, U.D. "B"', "ARINAGA, C.D.", 'ARINAGA, C.D. "B"'])
    for season in ("2026-2027", None):
        names = known_names(crudos, conn, season=season)
        assert names == {'ATALAYA, U.D. "A"': "UD Atalaya", 'ATALAYA, U.D. "B"': "Atalaya B",
                         "ARINAGA, C.D.": "CD Arinaga", 'ARINAGA, C.D. "B"': "Arinaga B"}, season
    # El filial que la base no tiene, como antes: su primer equipo más la letra (el de la base, o el nuevo).
    put(conn, 3, 1, "FF2", "grancanaria", ["CD Tinajo"])
    names = known_names(raw(["TINAJO, C.D.", 'TINAJO, C.D. "B"', "NUEVO HORIZONTE, U.D.",
                             'NUEVO HORIZONTE, U.D. "B"']), conn)
    assert names == {"TINAJO, C.D.": "CD Tinajo", 'TINAJO, C.D. "B"': "CD Tinajo B",
                     "NUEVO HORIZONTE, U.D.": "Nuevo Horizonte", 'NUEVO HORIZONTE, U.D. "B"': "Nuevo Horizonte B"}


def test_a_spaced_abbreviation_is_not_a_filial_of_its_own_club():
    """Con el raw de benjamín y el de alevín juntos, 'SIMUSETTI C. F.' (benjamín) era el filial F de
    'SIMUSETTI C. F. "A"' (alevín): 'Simusetti F', una fila nueva que club_id no salvaba. Y 'TEGUINTE, C.D',
    el filial D: no casaba con su ficha ('CD Teguinte') y salía 'Teguinte'."""
    conn = base()
    put(conn, 3, 1, "FF11", "grancanaria", ["Simusetti"], fed={"Simusetti": "SIMUSETTI C. F."})
    put(conn, 3, 4, "AL13", "grancanaria", ["Simusetti B"])
    put(conn, 3, 1, "LZ2", "lanzarote", ["CD Teguinte"], fed={"CD Teguinte": "TEGUINTE, C.D"})
    crudos = (raw(["SIMUSETTI C. F."], cat="benjamin") + raw(['SIMUSETTI C. F. "A"', 'SIMUSETTI C. F. "B"'])
              + raw(["TEGUINTE, C.D"], island="lanzarote", cat="benjamin"))
    for season in ("2026-2027", None):
        assert known_names(crudos, conn, season=season) == {
            "SIMUSETTI C. F.": "Simusetti", 'SIMUSETTI C. F. "A"': "Simusetti", 'SIMUSETTI C. F. "B"': "Simusetti B",
            "TEGUINTE, C.D": "CD Teguinte"}, season


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
    assert alias("PALMAS, U.D. LAS") == alias('PALMAS, U.D. LAS "A"') == "Las Palmas"
    assert alias('PALMAS, U.D. LAS "B"') is None and alias("VALLESECO, U.D.") is None


def test_ud_las_palmas_keeps_its_row_when_the_foundation_has_one(monkeypatch):
    """'Fundación UD Las Palmas' y 'Las Palmas' tienen la misma clave para el emparejamiento por palabras
    (FUNDACION, UD y LAS son ruido: las dos son PALMAS) y en el empate gana la Fundación por orden
    alfabético. Cuando el bot crea su fila (AL5), la activación de la temporada siguiente, con un raw solo
    de benjamín (sin la Fundación, que se llevaría la fila por la tabla), llevaba a UD Las Palmas a ella:
    la tabla del proyecto fija 'PALMAS, U.D. LAS' en 'Las Palmas'."""
    monkeypatch.setattr(fiflp_names, "FED_NAMES_PATH", str(ROOT / "scripts" / "fiflp_team_names.json"))
    fiflp_names.fed_alias.cache_clear()
    assert fiflp_names.team_key("Fundación UD Las Palmas") == fiflp_names.team_key("Las Palmas")
    conn = base()
    put(conn, 3, 1, "FF8", "grancanaria", ["Las Palmas"], fed={"Las Palmas": "PALMAS, U.D. LAS"})
    put(conn, 3, 2, "PG3", "grancanaria", ["Las Palmas"])
    put(conn, 3, 4, "AL5", "grancanaria", ["Fundación UD Las Palmas"])
    put(conn, 3, 4, "AL13", "grancanaria", ["Las Palmas"])
    for cat in ("benjamin", "prebenjamin", "alevin"):
        names = known_names(raw(["PALMAS, U.D. LAS"], cat=cat), conn)
        assert names == {"PALMAS, U.D. LAS": "Las Palmas"}, cat
    both = known_names(raw(["PALMAS, U.D. LAS"], ["FUNDACION CANARIA U.D. LAS PALMAS, C.D."]), conn)
    assert both == {"PALMAS, U.D. LAS": "Las Palmas", "FUNDACION CANARIA U.D. LAS PALMAS, C.D.": "Fundación UD Las Palmas"}
    assert name_clashes(both) == []


# ── El paso del bot: migrate_team_names ─────────────────────────────────────

FIXES = {("2026-2027", "ALEVIN", "AL20"): {"Huracán B": "Las Mesas Hu. B", "Puertos de": "Puertos LP"},
         ("2026-2027", "ALEVIN", "AL19"): {"Alcotan Canarias": "Alcotán Can."}}


def mixed_base():
    """AL16 y AL20 con la misma fila 'Huracán B' (la de benjamín FF12, con su ficha), AL20 con 'Puertos
    de' (solo alevín, con la ficha que leyó el bot del directorio del grupo) y un partido con acta."""
    conn = base()
    put(conn, 1, 1, "GC6", "grancanaria", ["Huracán B"])                                     # 2022-23
    put(conn, 3, 1, "FF12", "grancanaria", ["Huracán B"], fed={"Huracán B": 'HURACAN, A.D. "B"'})
    put(conn, 3, 1, "FF11", "grancanaria", ["Puertos LP"], fed={"Puertos LP": 'PUERTOS DE L.P., C.E.F. "A"'})
    put(conn, 2, 1, "B2", "grancanaria", ["Alcotán Can."])
    put(conn, 3, 4, "AL16", "grancanaria", ["Huracán B", "Las Torres B"])
    al20 = put(conn, 3, 4, "AL20", "grancanaria", ["Unión Viera C", "Puertos de", "Huracán B"],
               fed={"Puertos de": 'PUERTOS DE L.P., C.E.F. "A"'})
    al19 = put(conn, 3, 4, "AL19", "grancanaria", ["Atl. Angostura", "Alcotan Canarias"],
               fed={"Alcotan Canarias": "ALCOTAN CANARIAS, C.D."})
    hb, pd, uv = tid(conn, "Huracán B"), tid(conn, "Puertos de"), tid(conn, "Unión Viera C")
    conn.executescript(f"""
      INSERT INTO matches(id, group_id, jornada, home_team_id, away_team_id, home_score, away_score)
        VALUES (1, {al20}, 'Jornada 1', {hb}, {pd}, 2, 1), (2, {al20}, 'Jornada 2', {uv}, {hb}, NULL, NULL);
      INSERT INTO players(id, full_name, norm_name) VALUES (1, 'Jugador Uno', 'jugador uno'), (2, 'Jugador Dos', 'jugador dos');
      INSERT INTO appearances(match_id, team_id, player_id, role) VALUES (1, {hb}, 1, 'starter'), (1, {pd}, 2, 'starter');
      INSERT INTO match_events(match_id, team_id, player_id, kind, minute) VALUES (1, {hb}, 1, 'goal', 10);
      INSERT INTO match_staff(match_id, team_id, kind, name) VALUES (1, {hb}, 'coach', 'Entrenador');
      INSERT INTO match_staff_all(match_id, team_id, role, name, ord) VALUES (1, {pd}, 'Delegado', 'Delegado', 1);
      INSERT INTO scorers(group_id, player_name, team_id, goals, games) VALUES ({al20}, 'Jugador Uno', {hb}, 1, 1);
      INSERT INTO standings_detail(group_id, team_id, fiflp_code) VALUES ({al20}, {hb}, 1), ({al20}, {pd}, 2);
    """)
    return conn, al20, al19


def in_group(conn, gid):
    return {r[0] for r in conn.execute(
        """SELECT t.name FROM teams t WHERE t.id IN (SELECT team_id FROM standings WHERE group_id=?
           UNION SELECT home_team_id FROM matches WHERE group_id=? UNION SELECT away_team_id FROM matches WHERE group_id=?)""",
        (gid, gid, gid))}


def test_the_bot_step_moves_only_the_rows_of_the_group_and_is_idempotent():
    from migrate_team_names import migrate
    conn, al20, al19 = mixed_base()
    hb = tid(conn, "Huracán B")
    others = conn.execute("SELECT group_id, team_id, position FROM standings WHERE group_id NOT IN (?, ?) ORDER BY 1, 2",
                          (al20, al19)).fetchall()
    done = migrate(conn, FIXES, log=lambda *_: None)
    assert sorted(d[2:] for d in done) == [("Alcotan Canarias", "Alcotán Can."), ("Huracán B", "Las Mesas Hu. B"),
                                           ("Puertos de", "Puertos LP")]
    assert in_group(conn, al20) == {"Unión Viera C", "Las Mesas Hu. B", "Puertos LP"}
    assert in_group(conn, al19) == {"Atl. Angostura", "Alcotán Can."}
    # Todo lo del grupo, con el equipo bueno: partidos, alineaciones, eventos, cuerpo técnico, goleadores, detalle.
    mesas, puertos = tid(conn, "Las Mesas Hu. B"), tid(conn, "Puertos LP")
    assert conn.execute("SELECT home_team_id, away_team_id FROM matches WHERE id=1").fetchone() == (mesas, puertos)
    assert sorted(conn.execute("SELECT team_id FROM appearances")) == sorted([(mesas,), (puertos,)])
    for table in ("match_events", "match_staff", "scorers"):
        assert conn.execute(f"SELECT DISTINCT team_id FROM {table}").fetchall() == [(mesas,)], table
    assert conn.execute("SELECT team_id FROM match_staff_all").fetchall() == [(puertos,)]
    assert sorted(conn.execute("SELECT team_id FROM standings_detail WHERE group_id=?", (al20,))) == sorted(
        [(mesas,), (puertos,)])
    # 'Huracán B' sigue en AL16, en benjamín y en 2022-23, con su ficha; el resto de grupos, igual.
    assert conn.execute("SELECT fiflp_name FROM team_seasons WHERE team_id=?", (hb,)).fetchall() == [('HURACAN, A.D. "B"',)]
    assert conn.execute("SELECT group_id, team_id, position FROM standings WHERE group_id NOT IN (?, ?) ORDER BY 1, 2",
                        (al20, al19)).fetchall() == others
    # La fila que se queda sin uso, fuera; su ficha pasa a la buena si esta no tiene (Alcotán Can.), y si
    # tiene, se queda la suya (Puertos LP, la de benjamín).
    assert tid(conn, "Puertos de") is None and tid(conn, "Alcotan Canarias") is None
    assert conn.execute("SELECT fiflp_name FROM team_seasons WHERE team_id=?", (puertos,)).fetchall() == [
        ('PUERTOS DE L.P., C.E.F. "A"',)]
    assert conn.execute("SELECT fiflp_name FROM team_seasons WHERE team_id=? AND season_id=3",
                        (tid(conn, "Alcotán Can."),)).fetchall() == [("ALCOTAN CANARIAS, C.D.",)]
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    # Otra pasada, en la base ya corregida: nada.
    assert migrate(conn, FIXES, log=lambda *_: None) == []


def test_the_card_of_the_season_goes_with_the_team_that_moves_even_if_the_old_row_stays():
    """Si el bot de main lee el directorio de AL3 antes de la corrección, escribe la ficha de NATURALEZA
    VERDE-VALLESECO en 'UD Valleseco' (que no tenía la de 2026-27). La fila vieja sigue en uso en otras
    temporadas, pero en 2026-27 ya no juega: la ficha es del equipo que se mueve. Si la buena ya tiene la
    suya (RC Victoria, la de benjamín), la de la vieja se borra. Y la de una fila que sigue jugando en la
    temporada en otro grupo ('Huracán B', FF12) no se toca."""
    from migrate_team_names import migrate
    conn = base()
    put(conn, 2, 1, "FF3", "grancanaria", ["UD Valleseco", "Victoria"],
        fed={"UD Valleseco": "VALLESECO, U.D.", "Victoria": 'VICTORIA, REAL CLUB "A"'})
    put(conn, 3, 1, "FF9", "grancanaria", ["RC Victoria"], fed={"RC Victoria": "VICTORIA, REAL CLUB"})
    put(conn, 3, 1, "FF12", "grancanaria", ["Huracán B"], fed={"Huracán B": 'HURACAN, A.D. "B"'})
    put(conn, 3, 4, "AL3", "grancanaria", ["UD Valleseco", "Atl. Angostura"],
        fed={"UD Valleseco": "NATURALEZA VERDE-VALLESECO DE G.C., C.D."})
    put(conn, 3, 4, "AL12", "grancanaria", ["Victoria", "Atl. Isleta"], fed={"Victoria": 'VICTORIA, REAL CLUB "A"'})
    put(conn, 3, 4, "AL20", "grancanaria", ["Huracán B", "Puertos LP"])
    fixes = {("2026-2027", "ALEVIN", "AL3"): {"UD Valleseco": "Naturaleza Verde-Valleseco"},
             ("2026-2027", "ALEVIN", "AL12"): {"Victoria": "RC Victoria"},
             ("2026-2027", "ALEVIN", "AL20"): {"Huracán B": "Las Mesas Hu. B"}}
    cards = lambda name: dict(conn.execute("""SELECT s.name, ts.fiflp_name FROM team_seasons ts JOIN seasons s
                                              ON s.id=ts.season_id WHERE ts.team_id=?""", (tid(conn, name),)))
    assert len(migrate(conn, fixes, log=lambda *_: None)) == 3
    assert cards("Naturaleza Verde-Valleseco") == {"2026-2027": "NATURALEZA VERDE-VALLESECO DE G.C., C.D."}
    assert cards("UD Valleseco") == {"2025-2026": "VALLESECO, U.D."}                # la fila sigue, con la suya
    assert cards("RC Victoria") == {"2026-2027": "VICTORIA, REAL CLUB"}
    assert cards("Victoria") == {"2025-2026": 'VICTORIA, REAL CLUB "A"'}
    assert cards("Huracán B") == {"2026-2027": 'HURACAN, A.D. "B"'}
    assert migrate(conn, fixes, log=lambda *_: None) == []


def test_the_bot_step_moves_a_card_left_behind_in_a_base_already_fixed():
    """Una base corregida por una versión anterior del paso, con la ficha de 2026-27 aún en 'UD Valleseco':
    el paso la pasa a la buena aunque el nombre malo ya no esté en el grupo, y después no hace nada."""
    from migrate_team_names import migrate
    conn = base()
    put(conn, 2, 1, "FF3", "grancanaria", ["UD Valleseco"], fed={"UD Valleseco": "VALLESECO, U.D."})
    put(conn, 3, 4, "AL3", "grancanaria", ["Naturaleza Verde-Valleseco"])
    conn.execute("INSERT INTO team_seasons(team_id, season_id, fiflp_name) VALUES (?, 3, ?)",
                 (tid(conn, "UD Valleseco"), "NATURALEZA VERDE-VALLESECO DE G.C., C.D."))
    fixes = {("2026-2027", "ALEVIN", "AL3"): {"UD Valleseco": "Naturaleza Verde-Valleseco"}}
    assert migrate(conn, fixes, log=lambda *_: None) == [("2026-2027", "AL3", "UD Valleseco", "Naturaleza Verde-Valleseco")]
    assert conn.execute("SELECT team_id, season_id FROM team_seasons ORDER BY season_id").fetchall() == [
        (tid(conn, "UD Valleseco"), 2), (tid(conn, "Naturaleza Verde-Valleseco"), 3)]
    assert migrate(conn, fixes, log=lambda *_: None) == []


def test_the_bot_step_never_puts_a_team_twice_in_a_group():
    from migrate_team_names import migrate
    conn, al20, _ = mixed_base()
    lines = []
    assert migrate(conn, {("2026-2027", "ALEVIN", "AL20"): {"Huracán B": "Unión Viera C"}}, log=lines.append) == []
    assert "Huracán B" in in_group(conn, al20) and any("ya está en el grupo" in line for line in lines)
    # Ni en otra categoría ni en otra temporada con el mismo código.
    assert migrate(conn, {("2026-2027", "BENJAMIN", "AL20"): {"Huracán B": "X"},
                          ("2025-2026", "ALEVIN", "AL20"): {"Huracán B": "X"}}, log=lambda *_: None) == []


def test_the_real_table_on_a_copy_of_the_base(tmp_path):
    """Sobre una copia de la base del repositorio (antes o después de que el bot la corrija): ningún
    equipo en dos grupos de la Fase Previa, los cuatro de Las Mesas Huracán prioritarios, ningún nombre
    malo en su grupo y una segunda pasada que no hace nada."""
    from migrate_team_names import TEAM_FIXES, migrate
    from update_fiflp import is_priority, priority_keys
    db = ROOT / "futbolbase.db"
    if not db.exists():
        pytest.skip("sin futbolbase.db")
    copy = tmp_path / "fb.db"
    src = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    conn = sqlite3.connect(copy)
    src.backup(conn)
    src.close()
    conn.execute("PRAGMA foreign_keys=ON")
    fixed = {code for (_, _, code) in TEAM_FIXES}
    count = lambda: conn.execute("""SELECT g.code, (SELECT count(*) FROM standings WHERE group_id=g.id),
                                    (SELECT count(*) FROM matches WHERE group_id=g.id) FROM groups g ORDER BY g.id""").fetchall()
    before = count()
    migrate(conn, log=lambda *_: None)
    assert migrate(conn, log=lambda *_: None) == []
    assert count() == before
    groups = conn.execute("""SELECT g.id, g.code FROM groups g JOIN seasons s ON s.id=g.season_id
                             JOIN categories c ON c.id=g.category_id WHERE s.name='2026-2027' AND c.name='ALEVIN'""").fetchall()
    previa = {code: in_group(conn, gid) for gid, code in groups if re.fullmatch(r"AL\d+", code)}
    seen = {}
    for code, names in previa.items():
        for name in names:
            seen.setdefault(name, []).append(code)
    assert {n: c for n, c in seen.items() if len(c) > 1} == {}
    for (_, _, code), renames in TEAM_FIXES.items():
        assert not set(renames) & previa[code] and set(renames.values()) <= previa[code], code
    keys = priority_keys(["Las Mesas Hu."])
    assert sorted(code for code, names in previa.items() if any(is_priority(n, keys) for n in names)) == [
        "AL18", "AL20", "AL4", "AL9"]
    assert fixed <= set(previa)
    conn.close()


# ── El bot, al leer otra vez los grupos (update_fiflp) ──────────────────────

def test_the_bot_reads_the_group_again_with_the_good_names_and_no_repeated_matches(table):
    """Con los nombres buenos en la base, el bot casa los de la federación con ellos: 'FUNDACION
    GUINIGUADA' es 'Fundación Guini.' por la tabla revisada (las palabras no la casan), y el retirado que
    solo está en el calendario ('SAN JOSE, REAL SPORTING "B"') va con su fila: antes abría un equipo con el
    nombre de la federación y le repetía los partidos."""
    import update_fiflp as U
    table({"FUNDACION GUINIGUADA, C.D. DE LA": "Fundación Guini."})
    conn = base()
    gid = put(conn, 3, 4, "AL15", "grancanaria", ["Fundación Guini.", "Siete Palmas B", "Las Mesas Hu. B"])
    put(conn, 3, 1, "FF10", "grancanaria", ["Real Sporting B"])
    ids = {n: tid(conn, n) for n in ("Fundación Guini.", "Siete Palmas B", "Las Mesas Hu. B", "Real Sporting B")}
    conn.executescript(f"""
      INSERT INTO matches(group_id, jornada, date, home_team_id, away_team_id, home_score, away_score) VALUES
        ({gid}, 'Jornada 1', '2026-10-03', {ids["Fundación Guini."]}, {ids["Siete Palmas B"]}, 3, 1),
        ({gid}, 'Jornada 1', '2026-10-03', {ids["Las Mesas Hu. B"]}, {ids["Real Sporting B"]}, NULL, NULL);
    """)
    teams = conn.execute("SELECT count(*) FROM teams").fetchone()[0]
    standings = [{"pos": 1, "team": 'FUNDACION GUINIGUADA, C.D. DE LA "A"', "pts": 3, "j": 1, "g": 1, "e": 0, "p": 0,
                  "gf": 3, "gc": 1, "df": 2},
                 {"pos": 2, "team": 'MESAS HURACAN, U.D. LAS "B"', "pts": 0, "j": 0, "g": 0, "e": 0, "p": 0,
                  "gf": 0, "gc": 0, "df": 0},
                 {"pos": 3, "team": 'SIETE PALMAS, A.D. "B"', "pts": 0, "j": 1, "g": 0, "e": 0, "p": 1,
                  "gf": 1, "gc": 3, "df": -2}]
    rounds = {"Jornada 1": [
        {"home": 'FUNDACION GUINIGUADA, C.D. DE LA "A"', "away": 'SIETE PALMAS, A.D. "B"', "hs": 3, "as": 1,
         "date": "2026-10-03", "time": "", "venue": ""},
        {"home": 'MESAS HURACAN, U.D. LAS "B"', "away": 'SAN JOSE, REAL SPORTING "B"', "hs": 0, "as": 3,
         "date": "2026-10-03", "time": "", "venue": ""}]}
    assert U.update_group(conn, gid, "AL15", standings, rounds, log=lambda *_: None)[0] == "ok"
    assert conn.execute("SELECT count(*) FROM teams").fetchone()[0] == teams
    assert conn.execute("SELECT count(*) FROM matches WHERE group_id=?", (gid,)).fetchone()[0] == 2
    assert conn.execute("""SELECT home_score, away_score FROM matches WHERE group_id=? AND away_team_id=?""",
                        (gid, ids["Real Sporting B"])).fetchone() == (0, 3)
    assert in_group(conn, gid) == set(ids)
    names = U.name_map(['FUNDACION GUINIGUADA, C.D. DE LA "A"', 'SAN JOSE, REAL SPORTING "B"'],
                       U.group_team_names(conn, gid))
    assert names == {'FUNDACION GUINIGUADA, C.D. DE LA "A"': "Fundación Guini.",
                     'SAN JOSE, REAL SPORTING "B"': "Real Sporting B"}


def test_the_bot_fixes_the_names_before_reading_the_federation():
    text = (ROOT / "scripts" / "fetch_futbolaspalmas.py").read_text(encoding="utf-8")
    main = text[text.index("def main():"):]
    assert main.index("migrate_categories(conn)") < main.index("migrate_team_names(conn)") < main.index("update_groups(")


def test_the_new_filials_have_their_club_shield():
    text = (ROOT / "data-shields.js").read_text(encoding="utf-8")
    shields = json.loads(re.search(r"const SHIELDS=(\{.*?\});", text, re.S).group(1))
    for name in ("Las Mesas Hu. B", "Las Mesas Hu. C", "Las Mesas Hu. D"):
        assert shields[name] == shields["Las Mesas Hu."], name
    assert shields["Atlético D"] == shields["Atlético"] and shields["Guiniguada E"] == shields["Guiniguada"]
    # Los dos clubes que no son filiales de nadie no toman escudo de otro.
    assert "Fundación UD Las Palmas" not in shields and "Naturaleza Verde-Valleseco" not in shields
