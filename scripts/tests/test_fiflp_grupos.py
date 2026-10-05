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
    assert reports["2021-2022"] == {"created": 2, "redone": 0, "existing": 1, "no_meta": 1, "clash": 0, "empty": 0}
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


def test_two_clubs_never_share_a_name():
    conn = base()
    conn.execute("INSERT INTO teams(name) VALUES ('UD Tarajalejo')")
    names = GR.unique_names({"TARAJALEJO, U.D.": "UD Tarajalejo",
                             "GRAN TARAJAL SOC. TAMAS., U.D.": "UD Tarajalejo",
                             'INGENIO "B", C.D. "B"': "Ingenio B", 'INGENIO B, C.D. "B"': "Ingenio B"}, conn)
    assert names["TARAJALEJO, U.D."] == "UD Tarajalejo"
    assert names["GRAN TARAJAL SOC. TAMAS., U.D."] not in ("UD Tarajalejo",)
    # Las variantes del mismo club sí comparten nombre.
    assert names['INGENIO "B", C.D. "B"'] == names['INGENIO B, C.D. "B"'] == "Ingenio B"


def test_a_failing_import_never_stops_the_bot_update(monkeypatch):
    import fetch_futbolaspalmas as FB
    import import_fiflp_actas
    import import_fiflp_goleadores
    import import_fiflp_grupos
    conn = base()
    lines, done = [], []
    def boom(conn):
        raise RuntimeError("roto")
    # Nada de leer los raws de verdad: cada paso, sustituido.
    monkeypatch.setattr(import_fiflp_actas, "import_changed_raws", lambda conn: done.append("actas"))
    monkeypatch.setattr(import_fiflp_grupos, "import_changed_grupos", boom)
    monkeypatch.setattr(import_fiflp_goleadores, "import_changed_goleadores", lambda conn: done.append("goleadores"))
    FB.import_past_seasons(conn, log=lines.append)
    assert any("ERROR" in line and "roto" in line for line in lines)
    assert done == ["actas", "goleadores"]                  # el paso siguiente se hace igual



def test_pretty_names_without_the_federation_letter_marks():
    from activate_season import pretty_name
    assert pretty_name('PEÑA DE LA AMISTAD "A", C.D. A') == "Peña de La Amistad"
    assert pretty_name('35600 "A", C.D. A') == "35600"
    assert pretty_name('PLAYAS DE SOTAVENTO "A", U.D A') == "Playas de Sotavento"
    assert pretty_name('PLAYAS DE SOTAVENTO B, U.D. "B"') == "Playas de Sotavento B"
    assert pretty_name('INTERNACIONAL PH D "DB"') == "Internacional Ph D"
    assert pretty_name("COSTA AYALA, UNION JUVENIL") == "Unión Juvenil Costa Ayala"


def test_pretty_names_capitalise_every_part_of_a_hyphenated_word():
    from activate_season import pretty_name
    assert pretty_name("MAJORERAS-GUAYADEQUE, C.F. LAS") == "Las Majoreras-Guayadeque"
    assert pretty_name("SAN ANTONIO-MARPE, U.D.") == "San Antonio-Marpe"
    assert pretty_name("JOVERO-LAS ROSAS, C.D.") == "Jovero-Las Rosas"



def test_a_team_written_two_ways_in_one_group_gets_one_name():
    """'TINAJOB "B"' en la clasificación y 'TINAJO "B"' en las actas: el mismo equipo, un nombre."""
    name = lambda raw: {"TINAJOB, C.D. \"B\"": "Tinajob B", "TINAJO \"B\", C.D. B": "Tinajo B"}.get(raw, raw.title())
    entry = {"standings": [{"team": 'TINAJOB, C.D. "B"'}, {"team": "HARIA, C.F."}]}
    matches = [("1", 'TINAJO "B", C.D. B', "HARIA, C.F.", 1, 0, "", "", "", 1, {})]
    fixed = GR._same_team_in_group(name, entry, matches)
    assert fixed('TINAJOB, C.D. "B"') == "Tinajo B" and fixed("HARIA, C.F.") == "Haria, C.F."


# ── Temporadas archivadas (2017-18 a 2020-21): alta perezosa desde la federación ──

ARCHIVE_COMPS = [
    # (nombre en el catálogo, código, fase, isla), los 14 de CodTemporada 13 a 16.
    ("LIGA PREFERENTE BENJAMIN F-8 GRAN CANARIA", "BPGC", "Preferente GC", "grancanaria"),
    ("LIGA PRIMERA BENJAMIN F-8 GRAN CANARIA", "GC", "Primera Fase GC", "grancanaria"),
    ("LIGA PREFERENTE BENJAMIN F-8 DE LANZAROTE", "LZP", "Preferente Lanzarote", "lanzarote"),
    ("LIGA PRIMERA BENJAMIN F-8 DE LANZAROTE", "LZ1", "Primera Lanzarote", "lanzarote"),
    ("SEMIFINALES LIGA PRIMERA BENJAMIN LANZAROTE", "LZ1S", "Semifinal Liga Primera Lanzarote", "lanzarote"),
    ("FINAL LIGA PRIMERA BENJAMIN LANZAROTE", "LZ1F", "Final Liga Primera Lanzarote", "lanzarote"),
    ("LIGA BENJAMIN F-8 FUERTEVENTURA", "FV1", "Fuerteventura", "fuerteventura"),
    ("COPA BENJAMIN F-8 FUERTEVENTURA", "CFV", "Copa Fuerteventura", "fuerteventura"),
    ("FINAL COPA BENJAMIN FUERTEVENTURA", "CFVF", "Final Copa Fuerteventura", "fuerteventura"),
    ("SUPERLIGA BENJAMIN FUERTEVENTURA", "FVS", "Superliga Fuerteventura", "fuerteventura"),
    ("COPA DE CAMPEONES BENJAMIN GRAN CANARIA", "BC", "Copa de Campeones", "grancanaria"),
    ("COPA DE CAMPEONES PREBENJAMIN GRAN CANARIA", "PCC", "Copa de Campeones", "grancanaria"),
    ("LIGA PREBENJAMIN DE GRAN CANARIA", "PGC", "Primera Fase GC", "grancanaria"),
    ("COPA PREBENJAMIN", "PCGC", "Copa Gran Canaria", "grancanaria"),
]


def test_archive_competitions_get_their_code_phase_and_island_from_the_name():
    for name, prefix, phase, island in ARCHIVE_COMPS:
        assert GR.meta_by_name(name) == (prefix, phase, island), name
    # Fútbol sala, una copa prebenjamín de otra isla o un formato que no se conoce: sin código.
    assert GR.meta_by_name("LIGA BENJAMIN FUTBOL SALA GRAN CANARIA") is None
    assert GR.meta_by_name("COPA PREBENJAMIN LANZAROTE") is None
    assert GR.meta_by_name("TORNEO RARO") is None
    # Las finales y semifinales, las de su competición base con F o S detrás.
    assert GR.meta_by_name("FINAL LIGA PREFERENTE BENJAMIN F-8 DE LANZAROTE") == (
        "LZPF", "Final Liga Preferente Lanzarote", "lanzarote")
    assert GR.meta_by_name("SEMIFINAL COPA BENJAMIN F-8 FUERTEVENTURA") == (
        "CFVS", "Semifinal Copa Fuerteventura", "fuerteventura")
    assert GR.meta_by_name("FINAL LIGA FUTBOL SALA") is None


def test_comp_meta_reads_the_name_only_for_archived_seasons_and_last():
    conn = base()
    name = "LIGA PRIMERA BENJAMIN F-8 GRAN CANARIA"
    assert GR.comp_meta(conn, "174", [], name) is None                      # 2021-26: nunca por nombre
    assert GR.comp_meta(conn, "174", [], name, by_name=True) == ("GC", "Primera Fase GC", "grancanaria")
    # Antes que el nombre: los hermanos, EXTRA_META y COMP_META.
    sibling = ({"grupo_name": "GRUPO 1"}, 1)
    assert GR.comp_meta(conn, "174", [sibling], "COPA PREBENJAMIN", by_name=True) == (
        "GC", "Primera Fase GC", "grancanaria")
    assert GR.comp_meta(conn, "956", [], "COPA PREBENJAMIN", by_name=True) == GR.EXTRA_META["956"]
    assert GR.comp_meta(conn, "892", [], "COPA PREBENJAMIN", by_name=True) == (
        "LZP", "Preferente Lanzarote", "lanzarote")


ARCHIVED = "2018-2019"


def archive_base():
    """La base de hoy en miniatura: 2021-22 (con UD Guía, Teror y Arucas B) y la temporada en curso;
    ninguna archivada."""
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES
        (1, '2021-2022', 2021, 2022, 0), (2, '2026-2027', 2026, 2027, 1);
      INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN'), (2, 'PREBENJAMIN');
      INSERT INTO groups(id, season_id, category_id, code, name, full_name, phase, island) VALUES
        (1, 1, 1, 'GC1', 'Grupo 1', 'BENJAMIN PRIMERA FASE GC - Grupo 1', 'Primera Fase GC', 'grancanaria');
      INSERT INTO teams(id, name) VALUES (1, 'UD Guía'), (2, 'Teror'), (3, 'Arucas B'), (4, 'Moya');
      INSERT INTO standings(group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd) VALUES
        (1, 1, 1, 9, 3, 3, 0, 0, 9, 1, 8), (1, 2, 2, 6, 3, 2, 0, 1, 5, 3, 2),
        (1, 3, 3, 3, 3, 1, 0, 2, 2, 5, -3), (1, 4, 4, 0, 3, 0, 0, 3, 1, 8, -7);
    """)
    return conn


def archive_acta(cod, jornada, date, home, away, hs, as_, scorer):
    a = acta(cod, jornada, date, home, away, hs, as_, scorer)
    a["header"]["season"] = "2018/2019"
    return a


def write_archive(folder, raw, actas, status="complete", season=ARCHIVED):
    """Los raws de una temporada archivada con los formatos de la federación de 2017-2021 y, según
    `status`, su _status.json: 'complete' (pending 0), 'pending' (quedan actas) o None (sin él)."""
    (folder / f"fiflp_goleadores_{season}_raw.json").write_text(json.dumps(raw), encoding="utf-8")
    index = {cod: {"comp_id": "303", "grupo": "11", "jornada": a["header"]["jornada"]} for cod, a in actas.items()}
    (folder / f"fiflp_actas_{season}_index.json").write_text(json.dumps(index), encoding="utf-8")
    (folder / f"fiflp_actas_{season}_raw.json").write_text(json.dumps(actas), encoding="utf-8")
    path = folder / f"fiflp_actas_{season}_status.json"
    if status is None:
        path.unlink(missing_ok=True)
    else:
        pending = 0 if status == "complete" else 12
        path.write_text(json.dumps({"season": season, "pending": pending, "fetched": 40, "unenumerated_comps": 0}),
                        encoding="utf-8")


def archive_raw():
    name = "LIGA PRIMERA BENJAMIN F-8 GRAN CANARIA"
    return {"303:11": entry("303", "11", name, "GRUPO 1", ["GUIAA, U.D. \"A\"", "TEROR BALOMPIE A, U.D.",
                                                          "FIRGAS, C.D.", "GALDAR, C.D."]),
            "303:12": entry("303", "12", name, "GRUPO 2", ["ARUCAS B, C.F. \"B\"", "MOYA, U.D.", "VALLESECO, U.D."])}


def archive_actas():
    return {"901": archive_acta(901, "1", "06-10-2018", 'GUIAA, U.D. "A"', "FIRGAS, C.D.", 3, 0, "PEREZ, LUIS"),
            "902": archive_acta(902, "1", "06-10-2018", "TEROR BALOMPIE A, U.D.", "GALDAR, C.D.", 1, 1, None)}


def test_an_archived_season_is_created_with_its_first_group_once_its_actas_are_downloaded(tmp_path):
    conn = archive_base()
    write_archive(tmp_path, archive_raw(), archive_actas())
    lines = []
    report = GR.import_changed_grupos(conn, str(tmp_path), log=lines.append)[ARCHIVED]
    assert report["created"] == 2 and report["season_created"] and report["clash"] == 0
    assert any("temporada nueva" in line for line in lines)
    assert conn.execute("SELECT start_year, end_year, is_current FROM seasons WHERE name=?",
                        (ARCHIVED,)).fetchone() == (2018, 2019, 0)
    groups = conn.execute("""SELECT g.code, g.phase, g.island, g.name FROM groups g JOIN seasons s ON s.id=g.season_id
                             WHERE s.name=? ORDER BY g.code""", (ARCHIVED,)).fetchall()
    assert groups == [("GC1", "Primera Fase GC", "grancanaria", "Grupo 1"),
                      ("GC2", "Primera Fase GC", "grancanaria", "Grupo 2")]
    # Los partidos de sus actas aplanadas, con su cod_acta y sus alineaciones.
    rows = conn.execute("""SELECT t1.name, t2.name, m.home_score, m.away_score, m.cod_acta FROM matches m
        JOIN teams t1 ON t1.id=m.home_team_id JOIN teams t2 ON t2.id=m.away_team_id JOIN groups g ON g.id=m.group_id
        JOIN seasons s ON s.id=g.season_id WHERE s.name=? ORDER BY m.cod_acta""", (ARCHIVED,)).fetchall()
    assert rows == [("UD Guía", "Firgas", 3, 0, 901), ("Teror", "Gáldar", 1, 1, 902)]
    assert conn.execute("""SELECT a.goals FROM appearances a JOIN players p ON p.id=a.player_id
                           WHERE p.full_name='PEREZ, LUIS'""").fetchone()[0] == 1
    # Los nombres de 2021-22 a pesar de los formatos de entonces ('GUIAA', 'TEROR BALOMPIE A').
    gc2 = {r[0] for r in conn.execute("""SELECT t.name FROM standings st JOIN teams t ON t.id=st.team_id
        JOIN groups g ON g.id=st.group_id JOIN seasons s ON s.id=g.season_id WHERE s.name=? AND g.code='GC2'""",
        (ARCHIVED,))}
    assert gc2 == {"Arucas B", "Moya", "Valleseco"}
    assert conn.execute("SELECT 1 FROM raw_imports WHERE path=?", (f"grupos:{ARCHIVED}",)).fetchone()
    # Sin cambios, nada; con un acta más, los mismos grupos y los mismos nombres.
    ids = conn.execute("SELECT id, code FROM groups ORDER BY id").fetchall()
    teams = conn.execute("SELECT id, name FROM teams ORDER BY id").fetchall()
    assert GR.import_changed_grupos(conn, str(tmp_path), log=lines.append) == {}
    actas = archive_actas()
    actas["903"] = archive_acta(903, "2", "13-10-2018", "FIRGAS, C.D.", "TEROR BALOMPIE A, U.D.", 0, 2, None)
    write_archive(tmp_path, archive_raw(), actas)
    again = GR.import_changed_grupos(conn, str(tmp_path), log=lines.append)[ARCHIVED]
    assert again["redone"] == 2 and again["created"] == 0 and not again.get("season_created")
    assert conn.execute("SELECT id, code FROM groups ORDER BY id").fetchall() == ids
    assert conn.execute("SELECT id, name FROM teams ORDER BY id").fetchall() == teams
    assert conn.execute("SELECT count(*) FROM matches WHERE cod_acta IS NOT NULL").fetchone()[0] == 3


def test_an_archived_season_waits_for_its_actas_and_leaves_no_fingerprint(tmp_path):
    conn = archive_base()
    lines = []
    for status in ("pending", None):
        write_archive(tmp_path, archive_raw(), archive_actas(), status=status)
        assert GR.import_changed_grupos(conn, str(tmp_path), log=lines.append) == {}
        assert not conn.execute("SELECT 1 FROM seasons WHERE name=?", (ARCHIVED,)).fetchone()
        assert not conn.execute("SELECT 1 FROM raw_imports WHERE path LIKE 'grupos:%'").fetchone()
    assert any("esperando a que acabe la descarga de sus actas" in line for line in lines)
    # Un raw suelto de una temporada que no está en la lista (2016-17) no da de alta nada.
    write_archive(tmp_path, archive_raw(), archive_actas(), season="2016-2017")
    GR.import_changed_grupos(conn, str(tmp_path), log=lines.append)
    assert not conn.execute("SELECT 1 FROM seasons WHERE name='2016-2017'").fetchone()
    assert not conn.execute("SELECT 1 FROM raw_imports WHERE path='grupos:2016-2017'").fetchone()


def test_an_old_fingerprint_of_a_missing_archived_season_does_not_block_it(tmp_path):
    """La base de hoy ya tiene huellas grupos:2017-2018…2020-2021, de cuando esas temporadas se
    saltaban: una archivada que falta se evalúa siempre, sin mirar su huella."""
    conn = archive_base()
    write_archive(tmp_path, archive_raw(), archive_actas())
    conn.execute("CREATE TABLE IF NOT EXISTS raw_imports (path TEXT PRIMARY KEY, sha1 TEXT NOT NULL, imported_at TEXT NOT NULL)")
    conn.execute("INSERT INTO raw_imports VALUES (?, ?, datetime('now'))",
                 (f"grupos:{ARCHIVED}", GR.sources_digest(str(tmp_path), ARCHIVED)))
    assert GR.import_changed_grupos(conn, str(tmp_path), log=lambda *_: None)[ARCHIVED]["created"] == 2
    assert conn.execute("SELECT 1 FROM seasons WHERE name=?", (ARCHIVED,)).fetchone()


def test_an_archived_season_without_any_group_created_is_removed(tmp_path):
    conn = archive_base()
    # 'GUIA, U.D.' y 'GUIAA, U.D. "A"' son el mismo equipo (la A es el primer equipo): el grupo se salta.
    raw = {"303:11": entry("303", "11", "LIGA PRIMERA BENJAMIN F-8 GRAN CANARIA", "GRUPO 1",
                           ["GUIA, U.D.", "GUIAA, U.D. \"A\"", "FIRGAS, C.D."])}
    write_archive(tmp_path, raw, {})
    lines = []
    report = GR.import_changed_grupos(conn, str(tmp_path), log=lines.append)[ARCHIVED]
    assert report["created"] == 0 and report["clash"] == 1
    assert not conn.execute("SELECT 1 FROM seasons WHERE name=?", (ARCHIVED,)).fetchone()
    assert not conn.execute("SELECT 1 FROM raw_imports WHERE path=?", (f"grupos:{ARCHIVED}",)).fetchone()
    assert any("la temporada no se queda en la base" in line for line in lines)


def test_empty_federation_groups_are_counted(tmp_path):
    conn = archive_base()
    raw = archive_raw()
    raw["258:1"] = entry("258", "1", "FINAL LIGA PRIMERA BENJAMIN LANZAROTE", "GRUPO 1", [])
    write_archive(tmp_path, raw, archive_actas())
    report = GR.import_changed_grupos(conn, str(tmp_path), log=lambda *_: None)[ARCHIVED]
    assert report["created"] == 2 and report["empty"] == 1


def test_the_sources_fingerprint_ignores_the_folder_and_follows_the_import_version(tmp_path, monkeypatch):
    import import_fiflp_actas
    one, two = tmp_path / "uno", tmp_path / "dos"
    for folder in (one, two):
        folder.mkdir()
        write_archive(folder, archive_raw(), archive_actas())
    assert GR.sources_digest(str(one), ARCHIVED) == GR.sources_digest(str(two), ARCHIVED)
    before = GR.sources_digest(str(one), ARCHIVED)
    monkeypatch.setattr(import_fiflp_actas, "IMPORT_VERSION", import_fiflp_actas.IMPORT_VERSION + "x")
    assert GR.sources_digest(str(one), ARCHIVED) != before


def test_an_archived_season_prefers_the_names_of_2021_onwards_to_those_invented_by_another():
    conn = archive_base()
    # 2017-18 ya archivada, con un nombre inventado (pretty_name) para el mismo club.
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (3, '2017-2018', 2017, 2018, 0);
      INSERT INTO groups(id, season_id, category_id, code, name, full_name, phase, island) VALUES
        (2, 3, 1, 'GC1', 'Grupo 1', 'BENJAMIN PRIMERA FASE GC - Grupo 1', 'Primera Fase GC', 'grancanaria');
      INSERT INTO teams(id, name) VALUES (5, 'Guia Inventado');
      INSERT INTO standings(group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd) VALUES
        (2, 5, 1, 3, 1, 1, 0, 0, 3, 0, 3);
    """)
    raw = {"303:11": entry("303", "11", "LIGA PRIMERA BENJAMIN F-8 GRAN CANARIA", "GRUPO 1",
                           ["GUIA, U.D.", "FIRGAS, C.D.", "GALDAR, C.D."])}
    import tempfile
    with tempfile.TemporaryDirectory() as folder:
        write_archive(Path(folder), raw, {})
        GR.import_changed_grupos(conn, folder, log=lambda *_: None)
    names = {r[0] for r in conn.execute("""SELECT t.name FROM standings st JOIN teams t ON t.id=st.team_id
        JOIN groups g ON g.id=st.group_id JOIN seasons s ON s.id=g.season_id WHERE s.name=?""", (ARCHIVED,))}
    assert "UD Guía" in names and "Guia Inventado" not in names


def test_las_mesas_with_another_sponsor_is_the_same_club_and_its_b_keeps_its_name(tmp_path):
    """U.D. Las Mesas Bachicao (2017-20) es Las Mesas Hu. (desde 2020-21), y su B, con el mismo nombre
    de la federación en 2018-19 y en 2021-24, Las Mesas B: nunca 'Las Mesas Bachicao B'."""
    conn = archive_base()
    conn.executescript("""
      INSERT INTO groups(id, season_id, category_id, code, name, full_name, phase, island) VALUES
        (2, 1, 1, 'BPGC1', 'Grupo 1', 'BENJAMIN PREFERENTE GC - Grupo 1', 'Preferente GC', 'grancanaria');
      INSERT INTO teams(id, name) VALUES (15, 'Las Mesas Hu.'), (57, 'Las Mesas B');
      INSERT INTO standings(group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd) VALUES
        (2, 15, 1, 3, 1, 1, 0, 0, 3, 0, 3), (1, 57, 5, 0, 3, 0, 0, 3, 0, 9, -9);
    """)
    raw = {"280:1": entry("280", "1", "LIGA PREFERENTE BENJAMIN F-8 GRAN CANARIA", "GRUPO 1",
                          ['MESAS BACHICAO A, U.D. LAS "A"', "FIRGAS, C.D."]),
           "303:12": entry("303", "12", "LIGA PRIMERA BENJAMIN F-8 GRAN CANARIA", "GRUPO 2",
                           ['MESAS B, U.D. LAS "B"', "MOYA, U.D.", "VALLESECO, U.D."])}
    write_archive(tmp_path, raw, {})
    GR.import_changed_grupos(conn, str(tmp_path), log=lambda *_: None)
    rows = dict(conn.execute("""SELECT t.name, t.id FROM standings st JOIN teams t ON t.id=st.team_id
        JOIN groups g ON g.id=st.group_id JOIN seasons s ON s.id=g.season_id WHERE s.name=?""", (ARCHIVED,)))
    assert rows["Las Mesas Hu."] == 15 and rows["Las Mesas B"] == 57
    assert not any("Bachicao" in name for name, in conn.execute("SELECT name FROM teams"))


def test_a_2021_onwards_season_never_looks_at_archived_names_nor_modernises_them(tmp_path, monkeypatch):
    import fiflp_names
    conn = base()
    # Un club que solo está, con otro nombre, en una temporada archivada.
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (2, '2020-2021', 2020, 2021, 0);
      INSERT INTO groups(id, season_id, category_id, code, name, full_name, phase, island) VALUES
        (2, 2, 1, 'GC1', 'Grupo 1', 'BENJAMIN PRIMERA FASE GC - Grupo 1', 'Primera Fase GC', 'grancanaria');
      INSERT INTO teams(id, name) VALUES (7, 'UD Firgas Viejo');
      INSERT INTO standings(group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd) VALUES
        (2, 7, 1, 3, 1, 1, 0, 0, 3, 0, 3);
    """)
    monkeypatch.setattr(fiflp_names, "modern_fed_name", lambda *a: (_ for _ in ()).throw(AssertionError("2021-26")))
    raw = {"893:2": entry("893", "2", "LIGA PRIMERA BENJAMIN F-8 GRAN CANARIA", "GRUPO 2",
                          ["FIRGAS, U.D.", "GALDAR, C.D.", "TEROR, C.F."])}
    raw["893:1"] = entry("893", "1", "LIGA PRIMERA BENJAMIN F-8 GRAN CANARIA", "GRUPO 1",
                         ["TAMARACEITE, U.D. A", "HURACAN, A.D. A", "MOYA, U.D.", "ARUCAS, C.F."])
    write(tmp_path, raw, {}, {})
    GR.import_changed_grupos(conn, str(tmp_path), log=lambda *_: None)
    names = {r[0] for r in conn.execute("""SELECT t.name FROM standings st JOIN teams t ON t.id=st.team_id
        JOIN groups g ON g.id=st.group_id WHERE g.code='GC2'""")}
    assert names == {"Firgas", "Gáldar", "Teror"}


def test_the_letter_a_is_the_first_team_when_two_clubs_share_a_name():
    conn = base()
    names = GR.unique_names({'UNION VIERA A, C.F. "A"': "Unión Viera", "UNION VIERA, C.F.": "Unión Viera"}, conn)
    assert names == {'UNION VIERA A, C.F. "A"': "Unión Viera", "UNION VIERA, C.F.": "Unión Viera"}
