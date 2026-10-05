"""Goleadores de temporadas pasadas desde la federación (2026-10): el raw que
descarga goleadores-federacion.yml y su importación en los grupos de la base."""
import json
import pytest
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from db import SCHEMA
from migrate_actas_schema import migrate
import import_fiflp_goleadores as G


def base():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2024-2025', 2024, 2025, 0);
      INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN'), (2, 'PREBENJAMIN');
      INSERT INTO groups(id, season_id, category_id, code, name) VALUES
        (1, 1, 2, 'P1', 'Grupo 1'), (2, 1, 2, 'P2', 'Grupo 2'), (3, 1, 1, 'A1', 'Grupo A1');
      INSERT INTO teams(id, name) VALUES (1, 'Tamaraceite'), (2, 'AD Huracán'), (3, 'Moya'), (4, 'Arucas'),
        (5, 'Guía'), (6, 'Gáldar'), (7, 'Firgas'), (8, 'Teror');
      INSERT INTO standings(group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd) VALUES
        (1, 1, 1, 9, 3, 3, 0, 0, 9, 1, 8), (1, 2, 2, 6, 3, 2, 0, 1, 5, 3, 2), (1, 3, 3, 3, 3, 1, 0, 2, 2, 5, -3), (1, 4, 4, 0, 3, 0, 0, 3, 1, 8, -7),
        (2, 5, 1, 9, 3, 3, 0, 0, 9, 1, 8), (2, 6, 2, 6, 3, 2, 0, 1, 5, 3, 2), (2, 7, 3, 3, 3, 1, 0, 2, 2, 5, -3), (2, 8, 4, 0, 3, 0, 0, 3, 1, 8, -7),
        (3, 1, 1, 9, 3, 3, 0, 0, 9, 1, 8), (3, 2, 2, 6, 3, 2, 0, 1, 5, 3, 2), (3, 3, 3, 3, 3, 1, 0, 2, 2, 5, -3), (3, 4, 4, 0, 3, 0, 0, 3, 1, 8, -7);
      INSERT INTO matches(id, group_id, jornada, date, home_team_id, away_team_id, home_score, away_score, cod_acta) VALUES
        (1, 2, 'Jornada 1', '2024-10-05', 5, 6, 2, 1, 501), (2, 2, 'Jornada 1', '2024-10-05', 7, 8, 1, 0, 502),
        (3, 2, 'Jornada 2', '2024-10-12', 5, 7, 3, 0, 503);
      INSERT INTO scorers(group_id, player_name, team_id, goals, games) VALUES (3, 'PEREZ, JUAN', 1, 7, 3);
    """)
    return conn


def entry(comp, grupo, comp_name, teams, scorers):
    return {"comp": comp, "grupo": grupo, "comp_name": comp_name, "grupo_name": "GRUPO 1", "ok": True,
            "standings": [{"pos": i + 1, "team": t} for i, t in enumerate(teams)], "scorers": scorers}


FED_P1 = ["TAMARACEITE, U.D. A", "HURACAN, A.D. A", "MOYA, U.D.", "ARUCAS, C.F."]


def write(tmp_path, raw, index=None):
    (tmp_path / "fiflp_goleadores_2024-2025_raw.json").write_text(json.dumps(raw), encoding="utf-8")
    if index is not None:
        (tmp_path / "fiflp_actas_2024-2025_index.json").write_text(json.dumps(index), encoding="utf-8")


def test_groups_match_by_their_teams_or_their_actas_and_scorers_land_with_base_names(tmp_path):
    conn = base()
    write(tmp_path, {
        # Prebenjamín, por sus equipos: P1 (el A1 de benjamín tiene los mismos, pero es otra categoría).
        "900:1": entry("900", "1", "LIGA PREBENJAMIN GRAN CANARIA", FED_P1,
                       [["GARCIA, LUIS", "TAMARACEITE, U.D. A", 3, 5, 1], ["", "HURACAN, A.D. A", 3, 4, 0]]),
        # Sin clasificación ni equipos que casen, por sus actas (501-503 están en P2).
        "900:2": {**entry("900", "2", "LIGA PREBENJAMIN GRAN CANARIA", [], [["DIAZ, ANA", "GUIA, U.D.", 2, 3, 0]]),
                  "standings": []},
        # Benjamín A1: ya tiene los goleadores de futbolaspalmas, que se quedan.
        "901:1": entry("901", "1", "LIGA BENJAMIN FASE A", FED_P1, [["OTRO, NIÑO", "MOYA, U.D.", 3, 2, 0]]),
        # Un grupo que no casa con ninguno de la base.
        "902:1": entry("902", "1", "COPA PREBENJAMIN", ["X, C.D.", "Y, C.D.", "Z, C.D."], [["A, B", "X, C.D.", 1, 1, 0]]),
    }, index={"501": {"comp_id": "900", "grupo": "2"}, "502": {"comp_id": "900", "grupo": "2"},
              "503": {"comp_id": "900", "grupo": "2"}})
    lines = []
    reports = G.import_changed_goleadores(conn, str(tmp_path), log=lines.append)
    assert reports["fiflp_goleadores_2024-2025_raw.json"] == {"written": 2, "unmatched": 1, "kept": 1, "tables": 2}
    rows = lambda gid: conn.execute("""SELECT s.player_name, t.name, s.goals, s.games FROM scorers s
        JOIN teams t ON t.id=s.team_id WHERE s.group_id=? ORDER BY s.goals DESC""", (gid,)).fetchall()
    assert rows(1) == [("GARCIA, LUIS", "Tamaraceite", 5, 3), ("#1", "AD Huracán", 4, 3)]
    assert rows(2) == [("DIAZ, ANA", "Guía", 3, 2)]
    assert rows(3) == [("PEREZ, JUAN", "Tamaraceite", 7, 3)]
    assert "goleadores de 2 grupos" in lines[0]
    # Sin cambios, nada; con el raw cambiado (otra tanda), los grupos de aquí se reescriben.
    assert G.import_changed_goleadores(conn, str(tmp_path), log=lines.append) == {}
    raw = json.loads((tmp_path / "fiflp_goleadores_2024-2025_raw.json").read_text())
    raw["900:1"]["scorers"][0][3] = 6
    write(tmp_path, raw)
    G.import_changed_goleadores(conn, str(tmp_path), log=lines.append)
    assert rows(1)[0] == ("GARCIA, LUIS", "Tamaraceite", 6, 3)
    assert rows(3) == [("PEREZ, JUAN", "Tamaraceite", 7, 3)]


def test_a_tie_between_two_groups_matches_none():
    conn = base()
    conn.execute("UPDATE groups SET category_id=2 WHERE id=3")    # A1 pasa a prebenjamín: empata con P1
    e = entry("900", "1", "LIGA PREBENJAMIN", FED_P1, [["GARCIA, LUIS", "TAMARACEITE, U.D. A", 3, 5, 1]])
    assert G.by_teams(conn, 1, e) is None


# ── El descargador (goleadores-federacion.yml), con una página falsa ──

class FakePage:
    def __init__(self, html):
        self.html, self.url = html, ""

    def evaluate(self, script):
        if 'select[name="grupo"]' in script and "o.text" in script:
            return [["11", "GRUPO 1"], ["12", "GRUPO 2"]]
        if 'select[name="grupo"]' in script:
            return ["11", "12"]
        return 0                                  # el aplanado

    def content(self):
        return self.html


class FakeF:
    BASE = "https://fiflp.test/NPcd"

    def __init__(self):
        self.visited = []

    def goto(self, page, url):
        self.visited.append(url)
        return "codgrupo=12" not in url or "Goleadores" not in url   # los goleadores del grupo 2 no cargan

    def delay(self):
        pass

    def parse_standings(self, page):
        return [{"pos": 1, "team": "TAMARACEITE, U.D. A"}]


def test_the_scraper_saves_standings_and_scorers_and_resumes(tmp_path, monkeypatch):
    import time
    import fetch_fiflp_goleadores as S
    monkeypatch.setattr(S, "catalog_comps", lambda season: ["900"])
    monkeypatch.setattr(S, "comp_names", lambda season: {"900": "LIGA BENJAMIN FASE A"})
    monkeypatch.setattr(S, "raw_path", lambda season: tmp_path / "raw.json")
    html = (ROOT / "scripts/tests/fixtures/goleadores_2526_A2.html").read_text(encoding="utf-8")
    F = FakeF()
    assert S.run(FakePage(html), F, ["20"], time.monotonic() + 60, log=lambda *_: None)
    raw = json.loads((tmp_path / "raw.json").read_text())
    assert sorted(raw) == ["900:11", "900:12"]
    g1 = raw["900:11"]
    assert g1["ok"] and g1["grupo_name"] == "GRUPO 1" and g1["comp_name"] == "LIGA BENJAMIN FASE A"
    assert g1["standings"] == [{"pos": 1, "team": "TAMARACEITE, U.D. A"}] and len(g1["scorers"]) > 10
    assert raw["900:12"]["ok"] is False and raw["900:12"]["scorers"] == []
    # Otra tanda: solo vuelve a pedir el grupo que falló.
    F.visited.clear()
    S.run(FakePage(html), F, ["20"], time.monotonic() + 60, log=lambda *_: None)
    assert [u for u in F.visited if "Goleadores" in u] == [F.BASE + S.GOLEADORES_URL.format(comp="900", season="20", group="12")]


def test_the_scraper_starts_as_actions_runs_it():
    """Sin PYTHONPATH, desde la raíz (el paso del workflow): los imports cargan."""
    import os
    import subprocess
    env = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    out = subprocess.run([sys.executable, "scripts/fetch_fiflp_goleadores.py", "--help"], cwd=ROOT, env=env,
                         capture_output=True, text=True)
    assert out.returncode == 0, out.stderr


def test_finals_and_closing_tournaments_are_never_recomputed_as_leagues():
    from generate_js import _is_league_group
    for phase in ("Final Liga Primera Lanzarote", "Semifinal Copa Cabildo Primera Lanzarote",
                  "Torneo Cierre Prebenjamín", "Clausura Benjamín"):
        assert not _is_league_group("X1", phase), phase
    assert _is_league_group("GC1", "Primera Fase GC") and _is_league_group("FV21", "Fase 2 Fuerteventura")
    # Las semifinales que se juegan aparte (Lanzarote, 2017-18 y 2018-19), en singular y en plural.
    assert _is_league_group("LZ1S1", "Semifinales Liga Primera Lanzarote") is False
    assert _is_league_group("LZ1S1", "Semifinal Liga Primera Lanzarote") is False
    assert _is_league_group("FVS1", "Superliga Fuerteventura") is True


def test_filial_letters_and_cups_without_standings_match_their_group():
    conn = base()
    conn.executescript("""
      INSERT INTO teams(id, name) VALUES (9, 'Tamaraceite B'), (10, 'Moya B'), (11, 'Arucas B'), (12, 'Gáldar B');
      INSERT INTO groups(id, season_id, category_id, code, name, phase) VALUES
        (4, 1, 2, 'P3', 'Grupo 3', 'Primera Fase GC'), (5, 1, 2, 'PCC1', 'Grupo 1', 'Copa de Campeones');
      INSERT INTO standings(group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd) VALUES
        (4, 9, 1, 9, 3, 3, 0, 0, 9, 1, 8), (4, 10, 2, 6, 3, 2, 0, 1, 5, 3, 2), (4, 11, 3, 3, 3, 1, 0, 2, 2, 5, -3);
      INSERT INTO matches(group_id, jornada, date, home_team_id, away_team_id, home_score, away_score) VALUES
        (5, 'Ronda 1', '2025-06-01', 1, 5, 2, 0), (5, 'Ronda 1', '2025-06-01', 6, 7, 1, 0),
        (5, 'Ronda 1', '2025-06-01', 3, 8, 3, 1), (5, 'Ronda 1', '2025-06-01', 4, 12, 0, 1);
    """)
    filiales = entry("900", "3", "LIGA PREBENJAMIN", ['TAMARACEITE, U.D. "B"', 'MOYA, U.D. "B"', 'ARUCAS, C.F. "B"'], [])
    assert G.by_teams(conn, 1, filiales) == 4                     # P3, no P1 (los primeros equipos)
    copa = {**entry("901", "1", "COPA CAMPEONES PREBENJAMIN", [], [["A, B", "TAMARACEITE, U.D. A", 1, 2, 0],
            ["C, D", "GUIA, U.D.", 1, 1, 0], ["E, F", "MOYA, U.D.", 1, 3, 0]]), "standings": []}
    assert G.by_teams(conn, 1, copa) == 5                         # 3 de sus 8 equipos: basta, son los de los goleadores


def test_scorer_teams_cross_by_their_standings_row_when_names_do_not_match(tmp_path):
    """El archivo antiguo abrevia ('Muelle Mesa Lz.'): la fila de la clasificación, igual en las dos
    fuentes, dice qué equipo es."""
    conn = base()
    conn.executescript("""
      INSERT INTO teams(id, name) VALUES (20, 'Muelle Mesa Lz.');
      UPDATE standings SET team_id=20 WHERE group_id=1 AND team_id=4;
    """)
    fed = entry("900", "1", "LIGA PREBENJAMIN", ["TAMARACEITE, U.D. A", "HURACAN, A.D. A", "MOYA, U.D.",
                "MUELLE MESA Y LOPEZ, U.D."], [["RUIZ, PEPE", "MUELLE MESA Y LOPEZ, U.D.", 3, 1, 0]])
    for i, (pts, w, l) in enumerate([(9, 3, 0), (6, 2, 1), (3, 1, 2), (0, 0, 3)]):
        fed["standings"][i].update(pts=pts, j=3, g=w, e=0, p=l)
    bridge = G.team_bridge(conn, 1, fed)
    assert bridge["MUELLE MESA Y LOPEZ, U.D."] == "Muelle Mesa Lz."
    assert bridge["TAMARACEITE, U.D. A"] == "Tamaraceite"
    write(tmp_path, {"900:1": fed})
    G.import_changed_goleadores(conn, str(tmp_path), log=lambda *_: None)
    assert conn.execute("""SELECT t.name FROM scorers s JOIN teams t ON t.id=s.team_id WHERE s.group_id=1""").fetchall() == [("Muelle Mesa Lz.",)]


def test_crests_are_read_from_the_team_cell_in_a_real_browser():
    pytest = __import__("pytest")
    pw = pytest.importorskip("playwright.sync_api")
    import fetch_fiflp_goleadores as S
    html = """<table><tr>
      <td><img src="https://laspalmas.filesnovanet.es/pnfg/pimg/Clubes/00100_1_haria.jpg"> HARIA C.F.</td>
      <td>4 - 2</td>
      <td>LANZAROTE, U.D. "A" <img src="https://laspalmas.filesnovanet.es/pnfg/pimg/Clubes/00100_2_lanza.png">
          <script>eval("x")</script></td></tr></table>"""
    try:
        with pw.sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.set_content(html)
            crests = page.evaluate(S.CRESTS_JS)
            browser.close()
    except Exception as exc:          # sin Chromium en este entorno
        pytest.skip(f"sin navegador: {exc}")
    assert crests == {"HARIA C.F.": "https://laspalmas.filesnovanet.es/pnfg/pimg/Clubes/00100_1_haria.jpg",
                      'LANZAROTE, U.D. "A"': "https://laspalmas.filesnovanet.es/pnfg/pimg/Clubes/00100_2_lanza.png"}


def test_crests_only_mode_fills_crests_of_groups_already_read(tmp_path, monkeypatch):
    import time
    import fetch_fiflp_goleadores as S
    monkeypatch.setattr(S, "catalog_comps", lambda season: ["900"])
    monkeypatch.setattr(S, "comp_names", lambda season: {"900": "LIGA"})
    monkeypatch.setattr(S, "raw_path", lambda season: tmp_path / "raw.json")
    (tmp_path / "raw.json").write_text(json.dumps({"900:11": {"comp": "900", "grupo": "11", "ok": True,
        "standings": [{"team": "HARIA C.F."}], "scorers": []}}), encoding="utf-8")
    monkeypatch.setattr(S, "scrape_crests", lambda page, F, season, comp, grupo, teams: {"HARIA C.F.": "u"})
    monkeypatch.setattr(S, "scrape_group", lambda *a: pytest.fail("no vuelve a leer goleadores"))
    S.run(FakePage(""), FakeF(), ["20"], time.monotonic() + 60, log=lambda *_: None, crests_only=True)
    raw = json.loads((tmp_path / "raw.json").read_text())
    assert raw["900:11"]["crests"] == {"HARIA C.F.": "u"} and "900:12" not in raw


def test_teams_without_crest_get_the_federation_one(tmp_path, monkeypatch):
    import escudos_federacion as E
    conn = base()
    monkeypatch.setattr(E, "load_shields", lambda: {"Tamaraceite": "tama.png"})
    raw = {"900:1": {**entry("900", "1", "LIGA PREBENJAMIN", FED_P1, []),
                     "crests": {"TAMARACEITE, U.D. A": "https://x/t.png", "HURACAN, A.D. A": "https://x/h.png",
                                "MOYA, U.D.": "https://x/m.png", "ARUCAS, C.F.": "https://x/a.png"}}}
    (tmp_path / "fiflp_goleadores_2024-2025_raw.json").write_text(json.dumps(raw), encoding="utf-8")
    found = E.candidates(conn, tmp_path)
    # Tamaraceite ya tiene; los demás, el de la federación con su nombre de la base.
    assert found == {"AD Huracán": "https://x/h.png", "Moya": "https://x/m.png", "Arucas": "https://x/a.png"}


def test_a_team_written_with_the_letter_elsewhere_is_the_same_team():
    bridge = {'PLAYAS DE SOTAVENTO A, U.D. "A"': "UD Sotavento", 'PLAYAS DE SOTAVENTO C, U.D. "C"': "UD Sotavento C"}
    assert G.scorer_team('PLAYAS DE SOTAVENTO "C", U.D. "C"', bridge) == "UD Sotavento C"
    assert G.scorer_team('PLAYAS DE SOTAVENTO "A", U.D. "A"', bridge) == "UD Sotavento"
    assert G.scorer_team("OTRO, C.D.", bridge) == "OTRO, C.D."



def test_a_group_created_later_gets_its_scorers_without_the_raw_changing(tmp_path):
    """Una final que crea import_fiflp_grupos.py cuando llegan sus actas, después de importar los
    goleadores: el raw no cambia, pero los grupos de la temporada sí, y se vuelve a importar."""
    conn = base()
    raw = {"902:1": entry("902", "1", "COPA PREBENJAMIN", ["X, C.D.", "Y, C.D.", "Z, C.D."], [["A, B", "X, C.D.", 1, 1, 0]])}
    write(tmp_path, raw)
    assert G.import_changed_goleadores(conn, str(tmp_path), log=lambda *_: None)["fiflp_goleadores_2024-2025_raw.json"]["unmatched"] == 1
    assert G.import_changed_goleadores(conn, str(tmp_path), log=lambda *_: None) == {}
    # Se crea el grupo de esa copa (como haría import_fiflp_grupos.py) y queda en fiflp_groups.
    conn.executescript("""
      INSERT INTO teams(id, name) VALUES (30, 'X'), (31, 'Y'), (32, 'Z');
      INSERT INTO groups(id, season_id, category_id, code, name, phase) VALUES (9, 1, 2, 'CP1', 'Grupo 1', 'Copa X');
      CREATE TABLE IF NOT EXISTS fiflp_groups (group_id INTEGER PRIMARY KEY, season_id INTEGER NOT NULL, comp TEXT NOT NULL, grupo TEXT NOT NULL);
      INSERT INTO fiflp_groups VALUES (9, 1, '902', '1');
      INSERT INTO matches(group_id, jornada, date, home_team_id, away_team_id, home_score, away_score) VALUES (9, '1', '01-06-2025', 30, 31, 1, 0);
    """)
    report = G.import_changed_goleadores(conn, str(tmp_path), log=lambda *_: None)["fiflp_goleadores_2024-2025_raw.json"]
    assert report["written"] == 1
    assert conn.execute("SELECT player_name FROM scorers WHERE group_id=9").fetchall() == [("A, B",)]


def test_a_season_not_in_the_base_leaves_no_fingerprint_and_groups_redone_reimport(tmp_path):
    conn = base()
    raw = {"471:1": entry("471", "1", "LIGA BENJAMIN F-8 FUERTEVENTURA", ["X, C.D.", "Y, C.D.", "Z, C.D."],
                          [["A, B", "X, C.D.", 1, 1, 0]])}
    # 2019-20 todavía no está en la base (la da de alta import_fiflp_grupos): ni importación ni huella.
    (tmp_path / "fiflp_goleadores_2019-2020_raw.json").write_text(json.dumps(raw), encoding="utf-8")
    assert G.import_changed_goleadores(conn, str(tmp_path), log=lambda *_: None) == {}
    assert not conn.execute("SELECT 1 FROM raw_imports WHERE path='fiflp_goleadores_2019-2020_raw.json'").fetchone()
    # La huella de una temporada que sí está lleva la de sus grupos (grupos:<S>): al rehacerlos, se reimporta.
    write(tmp_path, {"900:1": entry("900", "1", "LIGA PREBENJAMIN GRAN CANARIA", FED_P1, [["GARCIA, LUIS",
                                                                                       "TAMARACEITE, U.D. A", 3, 5, 1]])})
    assert list(G.import_changed_goleadores(conn, str(tmp_path), log=lambda *_: None)) == ["fiflp_goleadores_2024-2025_raw.json"]
    assert G.import_changed_goleadores(conn, str(tmp_path), log=lambda *_: None) == {}
    conn.execute("INSERT INTO raw_imports(path, sha1, imported_at) VALUES ('grupos:2024-2025', 'otra', datetime('now'))")
    assert list(G.import_changed_goleadores(conn, str(tmp_path), log=lambda *_: None)) == ["fiflp_goleadores_2024-2025_raw.json"]


def test_a_retired_team_of_an_archived_season_gets_a_portal_name():
    """Un equipo que se retira (en los goleadores, no en la clasificación) de una temporada archivada:
    el nombre de un equipo de esa temporada si casa, con la misma letra; si no, con forma de portal."""
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2020-2021', 2020, 2021, 0);
      INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN'), (2, 'PREBENJAMIN');
      INSERT INTO groups(id, season_id, category_id, code, name, phase) VALUES
        (1, 1, 1, 'GC1', 'Grupo 1', 'Primera Fase GC'), (2, 1, 2, 'PGC1', 'Grupo 1', 'Primera Fase GC');
      INSERT INTO teams(id, name) VALUES (1, 'Moya'), (2, 'CD Firgas'), (3, 'UD Teror'), (4, 'Guía B');
      INSERT INTO standings(group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd) VALUES
        (1, 1, 1, 3, 1, 1, 0, 0, 2, 0, 2), (1, 2, 2, 0, 1, 0, 0, 1, 0, 2, -2), (2, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0),
        (2, 4, 2, 0, 0, 0, 0, 0, 0, 0, 0);
      CREATE TABLE fiflp_groups (group_id INTEGER PRIMARY KEY, season_id INTEGER NOT NULL, comp TEXT NOT NULL,
                                 grupo TEXT NOT NULL);
      INSERT INTO fiflp_groups VALUES (1, 1, '618', '1');
    """)
    raw = {"618:1": {"comp": "618", "grupo": "1", "comp_name": "LIGA PRIMERA BENJAMIN F-8 GRAN CANARIA",
                     "grupo_name": "GRUPO 1", "ok": True,
                     "standings": [{"pos": 1, "team": "MOYA, U.D.", "pts": 3, "j": 1, "g": 1, "e": 0, "p": 0},
                                   {"pos": 2, "team": "FIRGAS, C.D.", "pts": 0, "j": 1, "g": 0, "e": 0, "p": 1}],
                     # Teror (del grupo prebenjamín) y Guía A se retiraron del grupo: solo están aquí.
                     "scorers": [["P, UNO", "MOYA, U.D.", 1, 2, 0], ["P, DOS", "TEROR BALOMPIE, U.D.", 3, 4, 0],
                                 ["P, TRES", "GUIA A, U.D. A", 2, 1, 0], ["P, CUATRO", "SAN ISIDRO B, C.D. B", 1, 1, 0]]}}
    import tempfile
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "fiflp_goleadores_2020-2021_raw.json"
        path.write_text(json.dumps(raw), encoding="utf-8")
        G.import_raw(conn, str(path), log=lambda *_: None)
    teams = dict(conn.execute("""SELECT sc.player_name, t.name FROM scorers sc JOIN teams t ON t.id=sc.team_id
                                 WHERE sc.group_id=1""").fetchall())
    # 'Guía B' es de otra letra: no es el Guía A retirado.
    assert teams == {"P, UNO": "Moya", "P, DOS": "UD Teror", "P, TRES": "Guía", "P, CUATRO": "San Isidro B"}
