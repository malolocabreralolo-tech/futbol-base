"""Alevín no se mezcla con benjamín (riesgo nº 1 de traer una tercera categoría).

Los clubes son los mismos en las tres categorías ('Arucas' juega en alevín, en benjamín
y en prebenjamín, con el mismo nombre en la base), así que todo lo que casa un grupo o un
partido por sus equipos podía llevar datos de alevín a un grupo de benjamín: un acta al
partido del mismo cruce y el mismo fin de semana, los goleadores o el detalle de un grupo
alevín al grupo de benjamín de los mismos clubes, una liga alevín de la app al grupo FF
con los mismos equipos. Cada prueba reproduce uno de esos choques con una base sintética.
"""
import json
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from db import SCHEMA  # noqa: E402
from migrate_actas_schema import migrate  # noqa: E402

TEAMS = ["Arucas", "Moya", "Gáldar", "Tablero", "Guía", "Firgas"]
FED = ["ARUCAS, C.F.", "MOYA, U.D.", "GALDAR, C.F.", 'TABLERO, C.D. "A"', "GUIA, U.D.", "FIRGAS, C.D."]
ALEVIN_COMP = "LIGA ALEVIN GRAN CANARIA FASE PREVIA"
BENJAMIN_COMP = "LIGA BENJAMIN GRAN CANARIA FASE PREVIA"


def base(alevin_group=False, season="2026-2027", current=1):
    """Una temporada con un grupo FF1 de benjamín (los seis clubes) y, si se pide, un AL1 de alevín
    con los mismos clubes; en cada uno, Arucas–Moya 3-1 el 3/10 (jornada 1)."""
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    start = int(season[:4])
    conn.execute("INSERT INTO seasons(id,name,start_year,end_year,is_current) VALUES (1,?,?,?,?)",
                 (season, start, start + 1, current))
    conn.executescript("INSERT INTO categories(id,name) VALUES (1,'BENJAMIN'),(2,'PREBENJAMIN'),(3,'ALEVIN');")
    for i, t in enumerate(TEAMS, 1):
        conn.execute("INSERT INTO teams(id,name) VALUES (?,?)", (i, t))
    groups = [(1, 1, "FF1", "Primera Fase GC")] + ([(2, 3, "AL1", "Primera Fase GC")] if alevin_group else [])
    for gid, cat, code, phase in groups:
        conn.execute("""INSERT INTO groups(id,season_id,category_id,code,name,full_name,phase,island)
                        VALUES (?,1,?,?,'Grupo 1',?,?,'grancanaria')""", (gid, cat, code, f"{code} GRUPO 1", phase))
        for pos, tid in enumerate(range(1, 7), 1):
            conn.execute("""INSERT INTO standings(group_id,team_id,position,points,played,won,drawn,lost,gf,gc,gd)
                            VALUES (?,?,?,0,0,0,0,0,0,0,0)""", (gid, tid, pos))
        conn.execute("""INSERT INTO matches(group_id,jornada,date,home_team_id,away_team_id,home_score,away_score)
                        VALUES (?,'Jornada 1',?,1,2,3,1)""", (gid, f"{start}-10-03"))
        conn.execute("""INSERT INTO matches(group_id,jornada,date,home_team_id,away_team_id,home_score,away_score)
                        VALUES (?,'Jornada 1',?,3,4,0,2)""", (gid, f"{start}-10-03"))
    conn.commit()
    return conn


def match_of(conn, code):
    return conn.execute("""SELECT m.id FROM matches m JOIN groups g ON g.id=m.group_id
                           WHERE g.code=? AND m.home_team_id=1""", (code,)).fetchone()[0]


# ── Actas: reconcile_acta ────────────────────────────────────────────────────

def header(comp, season="2026/2027"):
    return {"season": season, "jornada": "1", "date": "03-10-2026", "competition": f"{comp} (GRUPO 1)",
            "home_score": 3, "away_score": 1, "home_team": "ARUCAS, C.F.", "away_team": "MOYA, U.D."}


def test_an_alevin_acta_never_lands_on_the_benjamin_match_of_the_same_clubs():
    from acta_reconciler import reconcile_acta
    conn = base()
    # Mismo cruce, misma fecha y mismo marcador: antes casaba con el partido de FF1.
    assert reconcile_acta(conn, header(ALEVIN_COMP)) is None
    assert reconcile_acta(conn, header(BENJAMIN_COMP)) == match_of(conn, "FF1")


def test_with_both_groups_each_acta_goes_to_its_own_category():
    from acta_reconciler import reconcile_acta
    conn = base(alevin_group=True)
    assert reconcile_acta(conn, header(ALEVIN_COMP)) == match_of(conn, "AL1")
    assert reconcile_acta(conn, header(BENJAMIN_COMP)) == match_of(conn, "FF1")


def test_an_acta_of_a_competition_that_is_not_published_is_not_reconciled():
    from acta_reconciler import reconcile_acta
    conn = base(alevin_group=True)
    assert reconcile_acta(conn, header("LIGA ALEVIN LANZAROTE FASE 1")) is None
    assert reconcile_acta(conn, header("LIGA ALEVIN FUTBOL SALA GRAN CANARIA")) is None
    # Sin competición en la cabecera (actas muy antiguas): como siempre, sin filtro.
    h = header(BENJAMIN_COMP)
    del h["competition"]
    assert reconcile_acta(conn, h) is None          # dos candidatos idénticos: ninguno
    conn2 = base()
    assert reconcile_acta(conn2, h) == match_of(conn2, "FF1")


def test_import_raw_keeps_alevin_actas_out_of_benjamin(tmp_path, monkeypatch):
    """El camino del bot (import_changed_raws → import_raw): el acta alevín se queda sin casar."""
    import import_fiflp_actas as A
    monkeypatch.setattr(A, "UNMATCHED_PATH", str(tmp_path / "unmatched.json"))
    conn = base()
    acta = {"header": header(ALEVIN_COMP), "lineups": {"home": [], "away": []}, "events": [], "staff": {},
            "consistent": True, "cod_acta": 777, "enumeration": {"comp_id": "54976940", "grupo": "1", "jornada": "1"}}
    raw = tmp_path / "fiflp_actas_2026-2027_raw.json"
    raw.write_text(json.dumps({"777": acta}), encoding="utf-8")
    A.import_raw(conn, str(raw))
    assert conn.execute("SELECT count(*) FROM matches WHERE cod_acta=777").fetchone()[0] == 0


# ── App de futbolaspalmas: match_liga ────────────────────────────────────────

def liga(name):
    return {"name": name, "tabla": [{"nombre": t} for t in TEAMS]}


def test_an_alevin_league_of_the_app_does_not_match_the_ff_group_with_the_same_clubs():
    from import_fp_app import match_liga
    conn = base()
    assert match_liga(conn, 1, liga("Liga Alevin Gran Canaria Grupo 5")) is None
    assert match_liga(conn, 1, liga("Liga Benjamín Gran Canaria Grupo 1")) == 1


def test_with_both_groups_each_league_of_the_app_goes_to_its_category():
    from import_fp_app import match_liga
    conn = base(alevin_group=True)
    # Antes, FF1 y AL1 empataban (mismos equipos) y la liga de benjamín se quedaba sin grupo.
    assert match_liga(conn, 1, liga("Liga Benjamín Gran Canaria Grupo 1")) == 1
    assert match_liga(conn, 1, liga("Liga Alevin Gran Canaria Grupo 5")) == 2
    assert match_liga(conn, 1, liga("Alevin eliminatorias Grupo 1")) == 2
    assert match_liga(conn, 1, liga("Liga Alevin Fuerteventura Grupo 1")) is None


# ── Goleadores y clasificaciones de la federación: match_group ──────────────

def entry(comp_name, comp="54976940", grupo="1", standings=True):
    return {"comp": comp, "grupo": grupo, "comp_name": comp_name, "grupo_name": "GRUPO 1", "ok": True,
            "standings": [{"pos": i + 1, "team": t, "pts": 0, "j": 0, "g": 0, "e": 0, "p": 0, "gf": 0, "gc": 0}
                          for i, t in enumerate(FED)] if standings else [],
            "scorers": [["GARCIA, LUIS", "ARUCAS, C.F.", 1, 2, 0], ["", "MOYA, U.D.", 1, 1, 0],
                        ["DIAZ, ANA", "GALDAR, C.F.", 1, 1, 0]]}


def test_scorers_of_an_alevin_group_never_match_the_benjamin_group_by_teams():
    import import_fiflp_goleadores as G
    conn = base()
    assert G.match_group(conn, 1, {}, entry(ALEVIN_COMP)) is None
    assert G.match_group(conn, 1, {}, entry(BENJAMIN_COMP, comp="54976988")) == 1
    # Sin clasificación (una copa: solo los equipos de sus goleadores), tampoco.
    assert G.match_group(conn, 1, {}, entry("COPA CAMPEONES ALEVÍN", standings=False)) is None


def test_with_both_groups_scorers_go_to_their_category():
    import import_fiflp_goleadores as G
    conn = base(alevin_group=True)
    assert G.match_group(conn, 1, {}, entry(ALEVIN_COMP)) == 2
    assert G.match_group(conn, 1, {}, entry(BENJAMIN_COMP, comp="54976988")) == 1


def test_by_actas_and_by_owner_never_cross_categories():
    """Aunque un acta alevín hubiera caído antes en FF1 (o fiflp_groups apuntara mal), el grupo
    de otra categoría no se acepta."""
    import import_fiflp_goleadores as G
    conn = base()
    for i, mid in enumerate([r[0] for r in conn.execute("SELECT id FROM matches WHERE group_id=1")], 1):
        conn.execute("UPDATE matches SET cod_acta=? WHERE id=?", (900 + i, mid))
    conn.execute("INSERT INTO matches(group_id,jornada,date,home_team_id,away_team_id,home_score,away_score,cod_acta)"
                 " VALUES (1,'Jornada 2','2026-10-10',5,6,1,1,903)")
    index = {str(c): {"comp_id": "54976940", "grupo": "1"} for c in (901, 902, 903)}
    assert G.by_actas(conn, index, "54976940", "1") == 1                  # el voto, tal cual
    assert G.match_group(conn, 1, index, entry(ALEVIN_COMP)) is None      # pero no es de su categoría
    conn.execute("CREATE TABLE IF NOT EXISTS fiflp_groups (group_id INTEGER PRIMARY KEY, season_id INTEGER NOT NULL,"
                 " comp TEXT NOT NULL, grupo TEXT NOT NULL)")
    conn.execute("INSERT INTO fiflp_groups VALUES (1, 1, '54976940', '1')")
    assert G.match_group(conn, 1, {}, entry(ALEVIN_COMP)) is None


def test_import_of_an_alevin_scorers_raw_leaves_benjamin_alone(tmp_path):
    import import_fiflp_goleadores as G
    conn = base(season="2025-2026", current=0)
    conn.execute("INSERT INTO scorers(group_id,player_name,team_id,goals,games) VALUES (1,'PEREZ, JUAN',1,7,3)")
    conn.commit()
    path = tmp_path / "fiflp_goleadores_2025-2026_raw.json"
    path.write_text(json.dumps({"54422881:1": entry(ALEVIN_COMP, comp="54422881")}), encoding="utf-8")
    report = G.import_raw(conn, str(path))
    assert report["written"] == 0 and report["unmatched"] == 1
    assert conn.execute("SELECT player_name, goals FROM scorers").fetchall() == [("PEREZ, JUAN", 7)]


# ── Detalle de la federación ────────────────────────────────────────────────

def test_detail_of_an_alevin_group_is_not_written_into_benjamin(tmp_path):
    import import_fiflp_detalle as D
    conn = base(season="2025-2026", current=0)
    D.migrate(conn)
    det = {"comp": "54422881", "grupo": "1", "comp_name": ALEVIN_COMP, "grupo_name": "GRUPO 1", "ok": True,
           "clasificacion": [{"pos": i + 1, "team": t, "pts": 0, "j": 0, "g": 0, "e": 0, "p": 0, "gf": 0, "gc": 0,
                              "codequipo": 100 + i, "home": [0, 0, 0, 0], "away": [0, 0, 0, 0]}
                             for i, t in enumerate(FED)],
           "directorio": [{"team": t, "codequipo": 100 + i, "shirt": "Roja"} for i, t in enumerate(FED)]}
    path = tmp_path / "fiflp_detalle_2025-2026_raw.json"
    path.write_text(json.dumps({"54422881:1": det}), encoding="utf-8")
    report = D.import_raw(conn, str(path))
    assert report["groups"] == 0
    assert conn.execute("SELECT count(*) FROM standings_detail").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM team_seasons").fetchone()[0] == 0


def test_a_cup_of_an_archived_season_is_created_in_its_category_with_its_code():
    """create_cup_group (finales y copas de las archivadas, desde su calendario): la copa alevín
    va a ALEVIN con su código ALCC1, no a BENJAMIN con BC1."""
    import import_fiflp_detalle as D
    conn = base(season="2018-2019", current=0)
    D.migrate(conn)
    det = {"comp": "398", "grupo": "1", "comp_name": "COPA DE CAMPEONES ALEVIN GRAN CANARIA", "grupo_name": "GRUPO 1",
           "ok": True, "jornadas": {"Final": [{"home": "ARUCAS, C.F.", "away": "MOYA, U.D.", "hs": 2, "as": 1,
                                                "date": "2019-06-01", "time": "", "venue": ""}]}}
    assert D.create_cup_group(conn, 1, "2018-2019", det, log=lambda *a: None) == 1
    assert conn.execute("""SELECT g.code, c.name, g.phase FROM groups g JOIN categories c ON c.id=g.category_id
                           WHERE g.code LIKE 'AL%'""").fetchall() == [("ALCC1", "ALEVIN", "Copa de Campeones")]


# ── Grupos de la federación que faltan: import_fiflp_grupos ─────────────────

@pytest.mark.parametrize("name, meta", [
    ("LIGA ALEVIN GRAN CANARIA FASE PREVIA", ("AL", "Primera Fase GC", "grancanaria")),
    ("LIGA PRIMERA ALEVIN F-8 GRAN CANARIA", ("AL", "Primera Fase GC", "grancanaria")),
    ("LIGA PREFERENTE ALEVIN F-8 GRAN CANARIA", ("ALP", "Preferente GC", "grancanaria")),
    ("LIGA ALEVIN F8 GRAN CANARIA SEGUNDA FASE A", ("ALA", "Segunda Fase A", "grancanaria")),
    ("LIGA ALEVIN F7 GRAN CANARIA FASE LIGA C", ("ALC", "Segunda Fase C", "grancanaria")),
    ("LIGA ALEVIN GRAN CANARIA SEGUNDA FASE F", ("ALF", "Segunda Fase F", "grancanaria")),
    ("COPA DE CAMPEONES ALEVIN GRAN CANARIA", ("ALCC", "Copa de Campeones", "grancanaria")),
    ("COPA CAMPEONES ALEVÍN", ("ALCC", "Copa de Campeones", "grancanaria")),
    ("copa de campeones categoria alevin fase d", ("ALCCD", "Copa de Campeones D", "grancanaria")),
    ("CLAUSURA ALEVÍN", ("ALCL", "Clausura Alevín", "grancanaria")),
    ("ALEVIN ELIMINATORIAS", ("ALEL", "Eliminatorias", "grancanaria")),
    ("LIGA BENJAMIN GRAN CANARIA ELIMINATORIAS", ("EL", "Eliminatorias", "grancanaria")),
    ("ELIMINATORIAS PREBENJAMIN", ("PEL", "Eliminatorias", "grancanaria")),
    # Fuera: alevín de Lanzarote y Fuerteventura, sala, y finales alevín (sin convenio: ALF es la fase F).
    ("LIGA PREFERENTE ALEVIN F-8 DE LANZAROTE", None),
    ("LIGA ALEVIN F-8 FUERTEVENTURA", None),
    ("LIGA ALEVIN FUTBOL SALA GRAN CANARIA", None),
    ("FINAL LIGA PRIMERA ALEVIN GRAN CANARIA", None),
])
def test_meta_by_name_alevin_codes_never_collide(name, meta):
    import import_fiflp_grupos as GR
    assert GR.meta_by_name(name) == meta


def test_the_benjamin_conventions_did_not_move():
    import import_fiflp_grupos as GR
    assert GR.meta_by_name("LIGA PRIMERA BENJAMIN F-8 GRAN CANARIA") == ("GC", "Primera Fase GC", "grancanaria")
    assert GR.meta_by_name("LIGA PREFERENTE BENJAMIN F-8 GRAN CANARIA") == ("BPGC", "Preferente GC", "grancanaria")
    assert GR.meta_by_name("COPA DE CAMPEONES BENJAMIN GRAN CANARIA") == ("BC", "Copa de Campeones", "grancanaria")
    assert GR.meta_by_name("LIGA PREBENJAMIN DE GRAN CANARIA") == ("PGC", "Primera Fase GC", "grancanaria")


def test_comp_meta_reads_the_name_of_alevin_competitions_also_outside_the_archive():
    import import_fiflp_grupos as GR
    conn = base(season="2025-2026", current=0)
    assert GR.comp_meta(conn, "54422881", [], ALEVIN_COMP) == ("AL", "Primera Fase GC", "grancanaria")
    assert GR.comp_meta(conn, "54422885", [], BENJAMIN_COMP) is None       # benjamín 2021-26: nunca por nombre


def test_import_season_creates_the_alevin_group_in_its_category_beside_benjamin(tmp_path):
    """Una temporada no archivada (2025-26) con un grupo alevín en el raw de goleadores: se crea
    AL1 en ALEVIN, sin tocar FF1 (antes: «competición sin código», o el grupo de benjamín)."""
    import import_fiflp_grupos as GR
    conn = base(season="2025-2026", current=0)
    (tmp_path / "fiflp_goleadores_2025-2026_raw.json").write_text(
        json.dumps({"54422881:1": entry(ALEVIN_COMP, comp="54422881", grupo="1")}), encoding="utf-8")
    ff1 = conn.execute("SELECT count(*) FROM standings WHERE group_id=1").fetchone()[0]
    report = GR.import_season(conn, str(tmp_path), "2025-2026", log=lambda *a: None)
    assert report["created"] == 1, report
    assert conn.execute("""SELECT g.code, c.name, g.phase FROM groups g JOIN categories c ON c.id=g.category_id
                           WHERE g.id<>1""").fetchall() == [("AL1", "ALEVIN", "Primera Fase GC")]
    assert conn.execute("SELECT count(*) FROM standings WHERE group_id=1").fetchone()[0] == ff1
