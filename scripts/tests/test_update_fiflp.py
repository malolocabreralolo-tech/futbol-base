"""Grupos de la federación en la temporada en curso: activación desde el raw de
FIFLP (activate_season --fiflp-raw) y puesta al día (update_fiflp.py).

futbolaspalmas.com migró en 2026/27 a una app nueva y no publicó benjamín ni
prebenjamín; la federación sí. FIFLP solo responde desde GitHub Actions, así que
el scrape va allí y todo lo que escribe en la base se prueba aquí, sin red.
"""
from datetime import date
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import activate_season
from activate_season import fiflp_evidence, verify_sources, validate_manifest, seed_season
from db import SCHEMA
import update_fiflp as U

URL = ("https://www.fiflp.com/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120"
       "&CodTemporada=22&CodCompeticion=900&CodGrupo=901")
GROUP = {"id": "PG1", "cat": "prebenjamin", "name": "Grupo 1", "phase": "Gran Canaria",
         "island": "grancanaria", "url": URL}
MANIFEST = {"season": "2026-2027", "defaultTeam": {"cat": "prebenjamin", "groupId": "PG1", "name": "Las Mesas Hu."},
            "groups": [GROUP]}


def raw(standings=(), played=False):
    return [{"competition_id": "900", "group_id": "901", "group_name": "GRUPO 1",
             "standings": list(standings),
             "jornadas": [
                 {"num": "1", "date": "03-10-2026", "matches": [
                     {"home": 'MESAS HURACAN, U.D. LAS "A"', "away": 'TABLERO, C.D. "A"',
                      "hs": 3 if played else None, "as": 1 if played else None,
                      "date": "03-10-2026", "time": "10:00", "venue": "LAS MESAS"},
                     {"home": "DESCANSA", "away": 'ARUCAS, C.F. "A"', "hs": None, "as": None,
                      "date": "", "time": "", "venue": ""}]},
                 {"num": "2", "date": "10-10-2026", "matches": [
                     {"home": 'ARUCAS, C.F. "A"', "away": 'MESAS HURACAN, U.D. LAS "A"', "hs": None, "as": None,
                      "date": "10-10-2026", "time": "", "venue": ""}]}]}]


NAMES = {'MESAS HURACAN, U.D. LAS "A"': "Las Mesas Hu.", 'TABLERO, C.D. "A"': "Tablero",
         'ARUCAS, C.F. "A"': "Arucas"}


def db():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    conn.execute("INSERT INTO seasons(name,start_year,end_year,is_current) VALUES('2025-2026',2025,2026,1)")
    conn.execute("INSERT INTO categories(name) VALUES('BENJAMIN'),('PREBENJAMIN')")
    conn.commit()
    return conn


# ── Activación desde el raw de la federación ───────────────────────────────

def test_federation_url_is_a_valid_source_but_needs_its_group_ids():
    validate_manifest(MANIFEST, "2025-2026")
    bad = {**MANIFEST, "groups": [{**GROUP, "url": URL.replace("&CodGrupo=901", "")}]}
    with pytest.raises(ValueError, match="CodGrupo"):
        validate_manifest(bad, "2025-2026")
    other = {**MANIFEST, "groups": [{**GROUP, "url": "https://example.com/x"}]}
    with pytest.raises(ValueError):
        validate_manifest(other, "2025-2026")


def test_evidence_from_the_raw_uses_iso_dates_base_names_and_skips_byes():
    rounds, standings = fiflp_evidence(GROUP, raw(), NAMES)
    assert rounds == {
        "Jornada 1": [["2026-10-03", "Las Mesas Hu.", "Tablero", None, None, "10:00", "LAS MESAS"]],
        "Jornada 2": [["2026-10-10", "Arucas", "Las Mesas Hu.", None, None, None, None]]}
    # Antes de la jornada 1 la federación no publica tabla: sale del calendario, a cero.
    assert standings == [[1, "Arucas", 0, 0, 0, 0, 0, 0, 0, 0], [2, "Las Mesas Hu.", 0, 0, 0, 0, 0, 0, 0, 0],
                         [3, "Tablero", 0, 0, 0, 0, 0, 0, 0, 0]]


def test_federation_groups_need_the_raw_and_the_group_must_be_in_it():
    with pytest.raises(ValueError, match="--fiflp-raw"):
        verify_sources(MANIFEST)
    with pytest.raises(ValueError, match="no tiene ese grupo"):
        verify_sources(MANIFEST, fiflp_raw=[], names=NAMES)


def test_old_calendar_under_the_new_season_is_still_rejected():
    old = raw()
    for j in old[0]["jornadas"]:
        for m in j["matches"]:
            m["date"] = m["date"].replace("2026", "2025") if m["date"] else ""
    with pytest.raises(ValueError, match="otra temporada"):
        verify_sources(MANIFEST, fiflp_raw=old, names=NAMES)


def test_current_round_is_the_last_played_or_the_first():
    rounds, _ = fiflp_evidence(GROUP, raw(), NAMES)
    assert activate_season.current_round(rounds) == "Jornada 1"
    rounds, _ = fiflp_evidence(GROUP, raw(played=True), NAMES)
    rounds["Jornada 2"][0][3:5] = [2, 2]
    assert activate_season.current_round(rounds) == "Jornada 2"


def test_seeding_reuses_the_club_already_in_the_base():
    conn = db()
    conn.execute("INSERT INTO teams(name) VALUES('Las Mesas Hu.')")
    evidence = verify_sources(MANIFEST, fiflp_raw=raw(), names={**NAMES, 'TABLERO, C.D. "A"': "CD Tablero"})
    conn.execute("INSERT INTO teams(name) VALUES('Tablero')")   # misma clave de club que 'CD Tablero'
    seed_season(conn, MANIFEST, evidence)
    names = {r[0] for r in conn.execute("SELECT name FROM teams")}
    assert names == {"Las Mesas Hu.", "Tablero", "Arucas"}
    assert conn.execute("SELECT current_jornada, url FROM groups").fetchone() == ("Jornada 1", URL)
    assert conn.execute("SELECT count(*) FROM matches").fetchone()[0] == 2


# ── Puesta al día ────────────────────────────────────────────────────────

def seeded():
    conn = db()
    seed_season(conn, MANIFEST, verify_sources(MANIFEST, fiflp_raw=raw(), names=NAMES))
    gid = conn.execute("SELECT id FROM groups WHERE code='PG1'").fetchone()[0]
    return conn, gid


def table(rows):
    return [{"pos": p, "team": t, "pts": pts, "j": j, "g": g, "e": e, "p": l, "gf": gf, "gc": gc, "df": gf - gc}
            for p, t, pts, j, g, e, l, gf, gc in rows]


def scraped_round(hs, as_):
    return {"Jornada 1": [{"home": 'MESAS HURACAN, U.D. LAS "A"', "away": 'TABLERO, C.D. "A"',
                           "hs": hs, "as": as_, "date": "2026-10-03", "time": "10:15", "venue": "LAS MESAS"}]}


def test_rounds_to_refresh_recent_new_and_overdue_only():
    today = date(2026, 10, 20)
    stored = {"Jornada 1": ("2026-10-03", False), "Jornada 2": ("2026-06-01", True),
              "Jornada 3": ("2026-10-17", True), "Jornada 9": ("2027-03-01", True)}
    options = [{"value": "1", "text": "1 - 03/10/2026"}, {"value": "2", "text": "2 - 01/09/2026"},
               {"value": "3", "text": "3 - 17/10/2026"}, {"value": "9", "text": "9 - 01/03/2027"},
               {"value": "10", "text": "10 - 08/03/2027"}]
    picked = [o["value"] for o in U.rounds_to_refresh(options, stored, today)]
    # 1 y 3: recientes; 2: resultado pendiente desde hace 49 días; 10: nueva; 9: lejana y ya guardada.
    assert picked == ["1", "2", "3", "10"]


def test_update_writes_results_with_the_base_names_and_moves_the_current_round():
    conn, gid = seeded()
    standings = table([(1, 'MESAS HURACAN, U.D. LAS "A"', 3, 1, 1, 0, 0, 3, 1),
                       (2, 'ARUCAS, C.F. "A"', 0, 0, 0, 0, 0, 0, 0),
                       (3, 'TABLERO, C.D. "A"', 0, 1, 0, 0, 1, 1, 3)])
    status, _ = U.update_group(conn, gid, "PG1", standings, scraped_round(3, 1), log=lambda *_: None)
    assert status == "ok"
    assert conn.execute("""SELECT h.name, a.name, home_score, away_score, time FROM matches m
                           JOIN teams h ON h.id=home_team_id JOIN teams a ON a.id=away_team_id
                           WHERE jornada='Jornada 1'""").fetchone() == ("Las Mesas Hu.", "Tablero", 3, 1, "10:15")
    assert conn.execute("SELECT t.name, points FROM standings s JOIN teams t ON t.id=team_id WHERE position=1").fetchone() == ("Las Mesas Hu.", 3)
    assert conn.execute("SELECT count(*) FROM teams").fetchone()[0] == 3, "FIFLP no crea equipos duplicados"
    assert conn.execute("SELECT current_jornada FROM groups").fetchone()[0] == "Jornada 1"


def test_known_score_only_changes_when_the_table_backs_the_new_one():
    conn, gid = seeded()
    standings = table([(1, 'MESAS HURACAN, U.D. LAS "A"', 3, 1, 1, 0, 0, 3, 1),
                       (2, 'ARUCAS, C.F. "A"', 0, 0, 0, 0, 0, 0, 0),
                       (3, 'TABLERO, C.D. "A"', 0, 1, 0, 0, 1, 1, 3)])
    quiet = lambda *_: None
    U.update_group(conn, gid, "PG1", standings, scraped_round(3, 1), log=quiet)
    U.update_group(conn, gid, "PG1", standings, scraped_round(8, 1), log=quiet)   # mala lectura (un dígito de más)
    assert conn.execute("SELECT home_score, away_score FROM matches WHERE jornada='Jornada 1'").fetchone() == (3, 1)
    conn.execute("UPDATE matches SET home_score=1 WHERE jornada='Jornada 1'")    # guardado mal antes
    U.update_group(conn, gid, "PG1", standings, scraped_round(3, 1), log=quiet)
    assert conn.execute("SELECT home_score, away_score FROM matches WHERE jornada='Jornada 1'").fetchone() == (3, 1)


def test_a_table_that_goes_backwards_is_rejected_and_nothing_is_written():
    conn, gid = seeded()
    good = table([(1, 'MESAS HURACAN, U.D. LAS "A"', 6, 2, 2, 0, 0, 6, 1), (2, 'ARUCAS, C.F. "A"', 0, 1, 0, 0, 1, 0, 3),
                  (3, 'TABLERO, C.D. "A"', 0, 1, 0, 0, 1, 1, 3)])
    U.update_group(conn, gid, "PG1", good, {}, log=lambda *_: None)
    worse = table([(1, 'MESAS HURACAN, U.D. LAS "A"', 3, 1, 1, 0, 0, 3, 1)])
    status, reason = U.update_group(conn, gid, "PG1", worse, scraped_round(3, 1), log=lambda *_: None)
    assert status == "rejected" and "retrocede" in reason
    assert conn.execute("SELECT max(played) FROM standings WHERE group_id=?", (gid,)).fetchone()[0] == 2
    assert conn.execute("SELECT home_score FROM matches WHERE jornada='Jornada 1'").fetchone()[0] is None


def test_an_unplayed_match_moved_by_the_federation_changes_round():
    conn, gid = seeded()
    moved = {"Jornada 5": [{"home": 'ARUCAS, C.F. "A"', "away": 'MESAS HURACAN, U.D. LAS "A"', "hs": None, "as": None,
                            "date": "2026-11-07", "time": "", "venue": ""}]}
    U.update_group(conn, gid, "PG1", [], moved, log=lambda *_: None)
    assert conn.execute("""SELECT jornada, date FROM matches m JOIN teams h ON h.id=home_team_id
                           WHERE h.name='Arucas'""").fetchall() == [("Jornada 5", "2026-11-07")]


def test_the_portal_bot_leaves_federation_groups_to_update_fiflp(tmp_path, monkeypatch):
    import fetch_futbolaspalmas as F
    js = tmp_path / "data-prebenjamin.js"
    js.write_text("const PREBENJAMIN=" + '[{"id":"PG1","url":"' + URL + '","name":"Grupo 1"}]' + ";\n")

    def no_fetch(url):
        raise AssertionError(f"no debía descargar {url}")
    monkeypatch.setattr(F, "fetch", no_fetch)
    conn = db()
    F.process_file(conn, str(js), "PREBENJAMIN", "STATS", 1, 2)


def test_update_yml_runs_the_federation_update_with_a_browser():
    text = (ROOT / ".github/workflows/update.yml").read_text()
    assert "FIFLP_UPDATE: '1'" in text
    assert "playwright install chromium" in text


# ── Manifiesto desde el raw de la federación (fiflp_manifest.py) ───────────

import fiflp_manifest as M


def test_codes_and_phases_follow_the_2025_26_convention():
    assert M.comp_meta("LIGA BENJAMIN GRAN CANARIA FASE PREVIA") == ("FF", "Primera Fase GC")
    assert M.comp_meta("LIGA BENJAMIN F7 GRAN CANARIA FASE LIGA C") == ("C", "Segunda Fase C")
    assert M.comp_meta("LIGA BENJAMIN DE LANZAROTE FASE 1") == ("LZ", "Lanzarote Fase 1")
    assert M.comp_meta("LIGA BENJAMIN F-7 FUERTEVENTURA 2ª FASE") == ("FV2", "Fuerteventura Fase 2")
    assert M.comp_meta("LIGA PREBENJAMIN DE GRAN CANARIA") == ("PG", "Gran Canaria")
    assert M.comp_meta("LIGA PREBENJAMIN FUERTEVENTURA") == ("PFV", "Fuerteventura")
    for unknown in ("LIGA BENJAMIN FUTBOL SALA GRAN CANARIA", "TORNEO RARO BENJAMIN"):
        with pytest.raises(ValueError):
            M.comp_meta(unknown)


def test_manifest_groups_and_default_team():
    data = raw()
    data[0]["competition_name"] = "LIGA PREBENJAMIN DE GRAN CANARIA"
    second = {**data[0], "group_id": "902", "group_name": "GRUPO 2", "jornadas": [
        {"num": "1", "date": "03-10-2026", "matches": [
            {"home": 'MESAS HURACAN, U.D. LAS "B"', "away": 'GUIA, U.D. "A"', "hs": None, "as": None,
             "date": "03-10-2026", "time": "", "venue": ""}]}]}
    empty = {**data[0], "group_id": "903", "group_name": "GRUPO 3", "jornadas": [], "standings": []}
    groups = M.build(data + [second, empty], "2026-2027", "22")
    assert [(g["id"], g["phase"], g["island"], g["cat"]) for g in groups] == [
        ("PG1", "Gran Canaria", "grancanaria", "prebenjamin"), ("PG2", "Gran Canaria", "grancanaria", "prebenjamin")]
    assert groups[0]["url"] == URL.replace("CodCompeticion=900", "CodCompeticion=900")
    names = {**NAMES, 'MESAS HURACAN, U.D. LAS "B"': "Las Mesas Hu. B"}
    assert M.find_team(data + [second], groups, "las mesas", "prebenjamin", names) == ("PG1", "Las Mesas Hu.")
    manifest = {"season": "2026-2027", "defaultTeam": {"cat": "prebenjamin", "groupId": "PG1", "name": "Las Mesas Hu."},
                "groups": groups}
    validate_manifest(manifest, "2025-2026")


def test_a_new_phase_is_added_to_the_current_season_without_touching_it():
    from activate_season import add_groups
    conn, gid = seeded()                      # 2026-2027 en curso con PG1
    phase2 = {"season": "2026-2027", "groups": [{**GROUP, "id": "A1", "cat": "benjamin", "phase": "Segunda Fase A"}]}
    with pytest.raises(ValueError):
        validate_manifest(phase2, "2025-2026", adding=True)   # solo la temporada en curso
    validate_manifest(phase2, "2026-2027", adding=True)       # sin equipo inicial: no hace falta
    two = {"season": "2026-2027", "groups": [{**GROUP, "id": "A2"}, {**GROUP, "id": "A3"}]}
    assert len(verify_sources(two, fiflp_raw=raw(), names=NAMES)) == 2, "los nombres valen para todos los grupos"
    add_groups(conn, phase2, verify_sources(phase2, fiflp_raw=raw(), names=NAMES))
    assert [r[0] for r in conn.execute("SELECT code FROM groups ORDER BY code")] == ["A1", "PG1"]
    assert conn.execute("SELECT count(*) FROM seasons WHERE is_current=1").fetchone()[0] == 1
    again = {"season": "2026-2027", "groups": [GROUP]}
    with pytest.raises(ValueError, match="ya existen"):
        add_groups(conn, again, verify_sources(again, fiflp_raw=raw(), names=NAMES))


def test_known_names_respect_the_filial_letter_new_clubs_and_the_island():
    from activate_season import known_names
    conn = db()
    conn.execute("INSERT INTO seasons(name,start_year,end_year,is_current) VALUES('2024-2025',2024,2025,0)")
    conn.executescript("""
      INSERT INTO groups(id, season_id, category_id, code, island) VALUES (1, 1, 1, 'FF1', 'grancanaria'), (2, 1, 1, 'LZ1', 'lanzarote');
      INSERT INTO teams(id, name) VALUES (1, 'Arguineguín'), (2, 'Arguineguín B'), (3, 'Las Mesas B'), (4, 'Internacional B'), (5, 'Las Mesas Hu.');
      INSERT INTO standings(group_id, team_id, position) VALUES (1, 1, 1), (1, 2, 2), (1, 3, 3), (2, 4, 1), (1, 5, 4);
    """)
    def group(island, teams):
        return {"island": island, "standings": [], "jornadas": [{"num": "1", "matches": [
            {"home": a, "away": b} for a, b in zip(teams[::2], teams[1::2])]}]}
    raw = [group("grancanaria", ['ARGUINEGUIN, C.D. "A"', 'ARGUINEGUIN, C.D. "B"', 'ARGUINEGUIN, C.D. "C"',
                                 'CF ATLETICO BACHICAN LAS MESAS "A"', 'C.D. DE FUTBOL ATHLETICO BACHICAN LAS MESAS "B"',
                                 'INTERNACIONAL GALDAR "B"', 'MESAS HURACAN, U.D. LAS', 'TABLERO, C.D.'])]
    names = known_names(raw, conn)
    assert names['ARGUINEGUIN, C.D. "A"'] == "Arguineguín"
    assert names['ARGUINEGUIN, C.D. "B"'] == "Arguineguín B"
    assert names['ARGUINEGUIN, C.D. "C"'] == "Arguineguín C", "un filial nunca es su primer equipo"
    # Club nuevo: ni su filial es 'Las Mesas B' (UD Las Mesas), ni lleva la grafía de la federación.
    assert names['CF ATLETICO BACHICAN LAS MESAS "A"'] == "Atlético Bachicán Las Mesas"
    assert names['C.D. DE FUTBOL ATHLETICO BACHICAN LAS MESAS "B"'] == "Atlético Bachicán Las Mesas B"
    assert names['INTERNACIONAL GALDAR "B"'] != "Internacional B", "el Internacional B de la base es de Lanzarote"
    assert names['MESAS HURACAN, U.D. LAS'] == "Las Mesas Hu."


def test_pretty_name_gives_federation_names_the_portal_form():
    from activate_season import pretty_name
    assert pretty_name('ATLETICO FOMENTO, CLUB "A"') == "Atlético Fomento"
    assert pretty_name('UNION SUR YAIZA, C.D. "B"') == "Unión Sur Yaiza B"
    assert pretty_name("CD MIGUEL LEON") == "Miguel León"
    assert pretty_name('PUERTO DEL CARMEN, F.C "B"') == "Puerto del Carmen B"
    assert pretty_name("SIMUSETTI C. F.") == "Simusetti"
    assert pretty_name('GARITA, C.F.S. LA "B"') == "La Garita B"


def test_a_club_stored_with_the_federation_spelling_takes_the_portal_form():
    from activate_season import club_id
    conn = db()
    conn.execute("""INSERT INTO teams(name) VALUES ('ATLETICO FOMENTO, CLUB')""")
    tid = club_id(conn, "Atlético Fomento")
    assert conn.execute("SELECT id, name FROM teams").fetchall() == [(tid, "Atlético Fomento")]
