"""Actas y goleadores de la federación (FIFLP), 2026-10.

Las páginas de FIFLP esconden marcadores, parciales y minutos tras varias capas
de ofuscación; fiflp_render.FLATTEN_JS las deja como se ven y fiflp_acta lee el
acta visible. Fixtures: actas reales de 2026-27 (Lanzarote, Fase 1) y 2025-26
ya aplanadas, más una sin aplanar para la prueba con navegador, y la página de
goleadores de un grupo de 2025-26.
"""
import json
import re
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
FIX = ROOT / "scripts" / "tests" / "fixtures"
sys.path.insert(0, str(ROOT / "scripts"))
from fiflp_acta import parse_flat_acta
from db import SCHEMA
from migrate_actas_schema import migrate
import update_fiflp as U


def acta(name):
    return parse_flat_acta((FIX / name).read_text(encoding="utf-8"))


SBD = "acta_flat_2627_sanbartolomeD_puertocarmen.html"
HARIA = "acta_flat_2627_haria_lanzarote.html"
TAMA = "acta_flat_2526_tamaraceite_huracan.html"


# ── Lector del acta aplanada ─────────────────────────────────────────────

def test_header_and_score_agree_with_every_partial_score():
    a = acta(SBD)
    h = a["header"]
    assert (h["home_team"], h["away_team"]) == ("SAN BARTOLOME, C.F D", "PUERTO DEL CARMEN, F.C. A")
    assert (h["home_score"], h["away_score"]) == (3, 21)      # la cabecera sin aplanar decía 3-1
    assert (h["season"], h["jornada"], h["date"], h["time"]) == ("2026/2027", "1", "03-10-2026", "09:00")
    assert h["venue"] == 'PEDRO ESPINOSA DE LEON "COLON"' and h["city"] == "San Bartolomé"
    assert a["consistent"] and len(a["events"]) == 24
    assert [e["score"] for e in a["events"]][-1] == [3, 21]


def test_own_goal_is_credited_to_the_other_side_and_marked():
    events = acta(SBD)["events"]
    second = events[1]
    # 0-2 a los 4': lo marca un jugador del San Bartolomé en su portería.
    assert second["score"] == [0, 2] and second["goal_type"] == "own"
    assert second["side"] == "home" and second["player_name"] == "ESCALANTE FLORES, MAXIMO ALEJANDRO"


def test_lineups_carry_dorsal_role_and_federation_id():
    a = acta(SBD)
    first = a["lineups"]["home"][0]
    assert first == {"dorsal": 13, "name": "SERRANO DOMINGUEZ, LEYRE", "role": "starter", "fiflp_id": 55181078}
    assert [p["role"] for p in a["lineups"]["home"]].count("sub") == 5
    assert all(p["fiflp_id"] for side in ("home", "away") for p in a["lineups"][side])


def test_staff_referee_coaches_and_delegates():
    s = acta(SBD)["staff"]
    assert s["referee"] == "ÁLVAREZ NAVARRO, VÍCTOR"
    assert (s["coach_home"], s["coach_away"]) == ("VIERA RATA, CRISTHOFER", "RAMIREZ GONZALEZ, HECTOR JOSE")
    assert s["delegates_home"] == {"campo": "FRANCISCO CONCEPCIÓN, MAURO JESUS", "equipo": "TORRES RODRIGUEZ, DIEGO"}
    assert acta(HARIA)["staff"]["coach_home"] is None          # «No presenta»


def test_an_acta_whose_partials_do_not_add_up_is_inconsistent():
    def mini(header, partials):
        rows = "".join(f'<tr><td><a class="img lgol" title="Gol normal"></a> {h} - {a}</td><td>({m}\') X, Y</td></tr>'
                       for m, (h, a) in enumerate(partials, 1))
        team = lambda n: f'<div class="number">{n}</div><div><h5>Titulares</h5><table><tr><td>1</td><td>P, {n}</td></tr></table></div>'
        return (f"<div>Temporada 2026-2027 Jornada 1 03-10-2026 09:00 h</div><div>LIGA X (GRUPO 1)</div>"
                f"<div>{header}</div><div class=\"number\">Goles</div><div><table>{rows}</table></div>{team('A')}{team('B')}")
    assert parse_flat_acta(mini("2 - 1", [(1, 0), (1, 1), (2, 1)]))["consistent"]
    assert not parse_flat_acta(mini("2 - 1", [(1, 0), (1, 1)]))["consistent"]        # falta un gol
    assert not parse_flat_acta(mini("21 - 1", [(1, 0), (1, 1), (2, 1)]))["consistent"]  # cifra de más
    assert not parse_flat_acta(mini("2 - 1", [(1, 0), (11, 1), (2, 1)]))["consistent"]  # salto


# ── Importación ──────────────────────────────────────────────────────────

def base():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2026-2027', 2026, 2027, 1);
      INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN');
      INSERT INTO groups(id, season_id, category_id, code, island, full_name, url) VALUES (1, 1, 1, 'LZ3', 'lanzarote',
        'BENJAMIN LANZAROTE FASE 1 - GRUPO 3',
        'https://www.fiflp.com/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22&CodCompeticion=54976982&CodGrupo=55141374');
      INSERT INTO teams(id, name) VALUES (1, 'San Bartolomé D'), (2, 'Puerto del Carmen');
      INSERT INTO matches(id, group_id, jornada, date, home_team_id, away_team_id, home_score, away_score, fiflp_acta)
        VALUES (1, 1, 'Jornada 1', '2026-10-03', 1, 2, 3, 1, 280291);
    """)
    return conn


def test_the_acta_fixes_the_score_and_fills_lineups_scorers_and_staff():
    conn = base()
    assert U.pending_actas(conn, 1) == [(1, 280291)]
    assert U.apply_acta(conn, 1, 280291, acta(SBD), log=lambda *_: None)
    assert conn.execute("SELECT home_score, away_score, cod_acta FROM matches").fetchone() == (3, 21, 280291)
    assert U.pending_actas(conn, 1) == []
    assert conn.execute("SELECT count(*) FROM appearances").fetchone()[0] == 22
    assert conn.execute("SELECT fiflp_id FROM players WHERE full_name='SERRANO DOMINGUEZ, LEYRE'").fetchone()[0] == 55181078
    # El gol en propia puerta queda en los eventos, pero no en la ficha del jugador.
    own = conn.execute("""SELECT a.goals FROM appearances a JOIN players p ON p.id=a.player_id
                          WHERE p.full_name='ESCALANTE FLORES, MAXIMO ALEJANDRO'""").fetchone()[0]
    assert own == 0
    # 21 goles del Puerto del Carmen, 3 de ellos en propia puerta del San Bartolomé.
    assert conn.execute("SELECT sum(goals) FROM appearances WHERE team_id=2").fetchone()[0] == 18
    kinds = {k for (k,) in conn.execute("SELECT kind FROM match_staff")}
    assert kinds == {"referee", "coach", "delegate_field", "delegate_team"}


def test_an_acta_with_the_teams_swapped_or_incoherent_is_not_imported():
    conn = base()
    conn.execute("UPDATE matches SET home_team_id=2, away_team_id=1")
    assert not U.apply_acta(conn, 1, 280291, acta(SBD), log=lambda *_: None)
    conn = base()
    bad = acta(SBD)
    bad["consistent"] = False
    assert not U.apply_acta(conn, 1, 280291, bad, log=lambda *_: None)
    assert conn.execute("SELECT home_score, away_score, cod_acta FROM matches").fetchone() == (3, 1, None)


def test_a_round_read_never_overwrites_a_score_checked_against_the_acta():
    conn = base()
    U.apply_acta(conn, 1, 280291, acta(SBD), log=lambda *_: None)
    U.write_round(conn, 1, "Jornada 1", [{"home": "San Bartolomé D", "away": "Puerto del Carmen", "hs": 3, "as": 1,
                                          "date": "2026-10-03", "time": "", "venue": "", "fiflp_acta": 280291}],
                  log=lambda *_: None)
    assert conn.execute("SELECT home_score, away_score FROM matches").fetchone() == (3, 21)


def test_the_same_child_keeps_one_player_row_across_seasons_and_homonyms_do_not_merge():
    from import_fiflp_actas import _get_or_create_player
    conn = base()
    a = _get_or_create_player(conn, "PEREZ, GAEL", 101)
    assert _get_or_create_player(conn, "PÉREZ, GAEL", 101) == a        # mismo niño, otra grafía
    b = _get_or_create_player(conn, "PEREZ, GAEL", 202)                 # otro niño, mismo nombre
    assert a != b
    assert _get_or_create_player(conn, "PEREZ, GAEL", 202) == b


# ── Goleadores del grupo ─────────────────────────────────────────────────

def test_goleadores_page_rows_including_the_players_without_a_published_name():
    rows = U.parse_goleadores((FIX / "goleadores_2526_A2.html").read_text(encoding="utf-8"))
    assert len(rows) == 142
    assert rows[0] == ("MORENO MEDEROS, JAVIER", "PALMAS, U.D. LAS", 21, 47, 0)
    assert ("SANTANA RUIZ, ENZO", "VICTORIA, REAL CLUB A", 22, 38, 1) in rows   # «38 (1 P)»
    # La federación no publica el nombre de algunos niños (todos los de Las Mesas Huracán ahí).
    anon = [r for r in rows if not r[0]]
    assert len(anon) == 23 and ("", "MESAS HURACAN, U.D. LAS A", 23, 27, 1) in anon


def test_scorers_take_the_base_team_names():
    conn = base()
    conn.execute("""INSERT INTO standings(group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd)
                    VALUES (1, 1, 1, 0, 1, 0, 0, 1, 3, 21, -18), (1, 2, 2, 3, 1, 1, 0, 0, 21, 3, 18)""")
    n = U.write_scorers(conn, 1, [("DONNELLY, ALFIE LIAM", 'PUERTO DEL CARMEN, F.C. "A"', 1, 5, 0)])
    assert n == 1
    assert conn.execute("""SELECT s.player_name, t.name, s.goals, s.games FROM scorers s
                           JOIN teams t ON t.id=s.team_id""").fetchone() == ("DONNELLY, ALFIE LIAM", "Puerto del Carmen", 5, 1)


# ── Publicación ──────────────────────────────────────────────────────────

def test_published_lineup_has_ids_delegates_and_the_own_goal_on_the_right_side():
    from generate_js import generate_lineups_js
    conn = base()
    U.apply_acta(conn, 1, 280291, acta(SBD), log=lambda *_: None)
    js = generate_lineups_js(conn, "2026-2027", conn.execute("SELECT code FROM groups WHERE id=1").fetchone()[0])
    obj = json.loads(re.search(r"= (\{.*\});", js, re.S).group(1))
    entry = next(iter(obj.values()))
    assert next(p for p in entry["home"] if p["n"] == "SERRANO DOMINGUEZ, LEYRE")["id"] == 55181078
    assert entry["delH"] == {"campo": "FRANCISCO CONCEPCIÓN, MAURO JESUS", "equipo": "TORRES RODRIGUEZ, DIEGO"}
    goals = [e for e in entry["events"] if e["t"] == "goal"]
    own = next(e for e in goals if e["gt"] == "own")
    assert own["s"] == "a"                     # suma al Puerto del Carmen
    assert (sum(e["s"] == "h" for e in goals), sum(e["s"] == "a" for e in goals)) == (3, 21)


# ── El aplanador con un navegador de verdad ──────────────────────────────

def _render(html_text):
    """Aplana `html_text` en un Chromium sin red. Las hojas externas se quitan y
    los glifos de dígitos de FontAwesome (.fa-N::before) van en línea: así la
    prueba es hermética y un fallo del aplanador falla, no se salta."""
    sync_api = pytest.importorskip("playwright.sync_api")
    from fiflp_render import flatten
    html_text = re.sub(r'<script[^>]+src="[^"]*"[^>]*>\s*</script>', "", html_text)
    html_text = re.sub(r'<link[^>]+stylesheet[^>]*>', "", html_text)
    css = "".join(f'.fa-{d}::before{{content:"\\3{d}"}}' for d in range(10))
    html_text = html_text.replace("</head>", f"<style>{css}</style></head>", 1)
    try:
        p = sync_api.sync_playwright().start()
        browser = p.chromium.launch(headless=True)
    except Exception as e:                       # sin Chromium instalado
        pytest.skip(f"sin navegador: {e}")
    try:
        page = browser.new_page()
        page.route("**/*", lambda r: r.abort() if r.request.url.startswith("http") else r.continue_())
        page.set_content(html_text, wait_until="load", timeout=30000)
        flatten(page)
        return page.content()
    finally:
        browser.close()
        p.stop()


def test_flatten_reads_the_raw_acta_as_it_is_painted():
    flat = _render((FIX / "acta_raw_2627_sanbartolomeD_puertocarmen.html").read_text(encoding="utf-8"))
    parsed = parse_flat_acta(flat)
    assert (parsed["header"]["home_score"], parsed["header"]["away_score"]) == (3, 21)
    assert parsed["consistent"] and len(parsed["events"]) == 24
    assert len(parsed["lineups"]["home"]) == 12


def test_players_without_a_published_name_stay_in_the_list_under_an_internal_key():
    from generate_js import generate_goleadores_js
    conn = base()
    conn.execute("""INSERT INTO standings(group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd)
                    VALUES (1, 1, 1, 0, 1, 0, 0, 1, 3, 21, -18), (1, 2, 2, 3, 1, 1, 0, 0, 21, 3, 18)""")
    U.write_scorers(conn, 1, [("DONNELLY, ALFIE LIAM", 'PUERTO DEL CARMEN, F.C. "A"', 1, 5, 0),
                              ("", "SAN BARTOLOME, C.F D", 1, 2, 0), ("", "SAN BARTOLOME, C.F D", 1, 1, 0),
                              ("HUGO", 'PUERTO DEL CARMEN, F.C. "A"', 1, 1, 0), ("HUGO", 'PUERTO DEL CARMEN, F.C. "A"', 1, 1, 0)])
    js = generate_goleadores_js(conn)
    benj = json.loads(re.search(r"const GOL_BENJ=(\[.*?\]);", js, re.S).group(1))
    names = [s[0] for s in benj[0]["s"]]
    # Cuentan en el puesto y en el máximo goleador; el frontend los dice «Sin nombre publicado».
    assert names[:3] == ["DONNELLY, ALFIE LIAM", "#LZ3-1", "#LZ3-2"]
    assert "HUGO" in names and "HUGO (2)" in names            # dos niños con el mismo nombre de pila


# ── Arreglos de la revisión adversarial ──────────────────────────────────

def test_an_acta_without_both_lineups_or_blank_against_a_real_score_is_not_imported():
    conn = base()
    empty = acta(SBD)
    empty["lineups"]["away"] = []
    assert not U.apply_acta(conn, 1, 280291, empty, log=lambda *_: None)
    blank = acta(SBD)
    blank["events"], blank["header"]["home_score"], blank["header"]["away_score"] = [], 0, 0
    assert not U.apply_acta(conn, 1, 280291, blank, log=lambda *_: None)
    assert conn.execute("SELECT home_score, away_score, cod_acta FROM matches").fetchone() == (3, 1, None)


def test_a_goal_by_a_child_without_a_published_name_still_counts():
    html = (FIX / TAMA).read_text(encoding="utf-8")
    hidden = html.replace("HENRIQUEZ RODRIGUEZ, MAEL", "")      # el 2-1 sin nombre
    a = parse_flat_acta(hidden)
    assert a["consistent"]
    assert a["events"][-1]["player_name"] is None and a["events"][-1]["score"] == [2, 1]


def test_failed_actas_are_spaced_out_and_dropped_and_new_ones_go_first():
    conn = base()
    conn.execute("""INSERT INTO matches(id, group_id, jornada, date, home_team_id, away_team_id, home_score, away_score, fiflp_acta)
                    VALUES (2, 1, 'Jornada 2', '2026-10-10', 2, 1, 1, 0, 280300)""")
    conn.execute("UPDATE matches SET acta_tries=2 WHERE id=1")
    assert [m for m, _ in U.pending_actas(conn, 1)] == [2, 1]     # la nunca intentada primero
    conn.execute(f"UPDATE matches SET acta_tries={U.MAX_ACTA_TRIES} WHERE id=1")
    assert [m for m, _ in U.pending_actas(conn, 1)] == [2]


def test_a_round_that_contradicts_a_checked_score_asks_for_the_acta_again():
    conn = base()
    U.apply_acta(conn, 1, 280291, acta(SBD), log=lambda *_: None)
    row = lambda hs, as_: [{"home": "San Bartolomé D", "away": "Puerto del Carmen", "hs": hs, "as": as_,
                            "date": "2026-10-03", "time": "", "venue": "", "fiflp_acta": 280291}]
    U.write_round(conn, 1, "Jornada 1", row(3, 1), log=lambda *_: None)    # 21 leído como 1: cifra de menos/más
    assert U.pending_actas(conn, 1) == []
    U.write_round(conn, 1, "Jornada 1", row(0, 3), log=lambda *_: None)    # resultado de mesa
    assert U.pending_actas(conn, 1) == [(1, 280291)]
    assert conn.execute("SELECT home_score, away_score FROM matches").fetchone() == (3, 21)


def test_a_first_name_alone_does_not_inherit_an_old_players_history():
    from import_fiflp_actas import _get_or_create_player
    conn = base()
    old = conn.execute("INSERT INTO players(full_name, norm_name) VALUES ('LUCAS', 'LUCAS')").lastrowid
    assert _get_or_create_player(conn, "LUCAS", 555) != old
    full = conn.execute("INSERT INTO players(full_name, norm_name) VALUES ('PEREZ, ANA', 'PEREZ, ANA')").lastrowid
    assert _get_or_create_player(conn, "PEREZ, ANA", 777) == full


class _Page:
    """Página de Playwright mínima: registra las URLs y devuelve el desplegable."""
    def __init__(self, options):
        self.urls, self.options = [], options
    def evaluate(self, js, *a):
        if "select[name=" in js:
            return self.options
        if "BuscarPartidos" in js:
            raise AssertionError("BuscarPartidos navega con un formulario oculto que flatten() quita")
        return 0
    def wait_for_timeout(self, ms):
        pass


class _F:
    BASE = "https://www.fiflp.com/pnfg/NPcd"
    def __init__(self, page, ok=True):
        self.page, self.ok = page, ok
    def goto(self, page, url):
        page.urls.append(url)
        return self.ok if not callable(self.ok) else self.ok(url)
    def parse_standings(self, page):
        return []
    def parse_matches(self, page):
        return []
    def delay(self, *a):
        pass


def test_each_round_is_loaded_by_its_own_url(monkeypatch):
    from datetime import date
    monkeypatch.setattr(U, "flatten", lambda page, selector=None: 0)
    page = _Page([{"value": "1", "text": "1 - 03-10-2026"}, {"value": "2", "text": "2 - 10-10-2026"}])
    url = ("https://www.fiflp.com/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120"
           "&CodTemporada=22&CodCompeticion=900&CodGrupo=901")
    U.scrape_group(page, _F(page), url, {}, date(2026, 10, 5))
    assert [u for u in page.urls if "CodJornada=" in u] == [url.replace("NFG_CmpJornada", "NFG_CmpJornada") + "&CodJornada=1",
                                                           url + "&CodJornada=2"]


def test_actas_stop_when_the_federation_does_not_serve_them(monkeypatch):
    monkeypatch.setattr(U, "flatten", lambda page, selector=None: 0)
    conn = base()
    for i in range(2, 7):
        conn.execute(f"""INSERT INTO matches(id, group_id, jornada, date, home_team_id, away_team_id, home_score, away_score, fiflp_acta)
                         VALUES ({i}, 1, 'Jornada {i}', '2026-10-1{i}', 2, 1, 1, 0, {280300 + i})""")
    page = _Page([])
    done, read = U.import_actas(page, _F(page, ok=False), conn, 1, 60, log=lambda *_: None)
    assert (done, read) == (0, 3)                                  # tres páginas sin cargar cortan
    assert conn.execute("SELECT max(acta_tries) FROM matches").fetchone()[0] == 0   # la red no gasta intentos


# ── Pruebas reforzadas tras la lente de pruebas (mutaciones que sobrevivían) ──

def _table(conn, sbd, pdc):
    """Clasificación del grupo de base(): (J, GF, GC) de San Bartolomé D y Puerto del Carmen."""
    conn.execute("DELETE FROM standings")
    for pos, (tid, (pj, gf, gc)) in enumerate(((1, sbd), (2, pdc)), 1):
        conn.execute("""INSERT INTO standings(group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd)
                        VALUES (1, ?, ?, 0, ?, 0, 0, 0, ?, ?, ?)""", (tid, pos, pj, gf, gc, gf - gc))


def test_the_checked_score_guard_holds_even_when_the_table_would_back_the_round():
    conn = base()
    U.apply_acta(conn, 1, 280291, acta(SBD), log=lambda *_: None)
    _table(conn, (1, 3, 1), (1, 1, 3))          # una tabla atrasada o mal leída que «respalda» el 3-1
    U.write_round(conn, 1, "Jornada 1", [{"home": "San Bartolomé D", "away": "Puerto del Carmen", "hs": 3, "as": 1,
                                          "date": "2026-10-03", "time": "", "venue": ""}], log=lambda *_: None)
    assert conn.execute("SELECT home_score, away_score FROM matches").fetchone() == (3, 21)
    assert U.reconcile_with_table(conn, 1, log=lambda *_: None) == 0     # tampoco la conciliación lo toca
    assert conn.execute("SELECT home_score, away_score FROM matches").fetchone() == (3, 21)


def test_the_acta_code_travels_from_the_round_to_the_pending_list():
    conn = base()
    conn.execute("UPDATE matches SET fiflp_acta=NULL")
    _table(conn, (0, 0, 0), (0, 0, 0))          # la plantilla del grupo traduce los nombres de FIFLP
    U.update_group(conn, 1, "LZ3", [], {"Jornada 1": [
        {"home": "SAN BARTOLOME, C.F D", "away": 'PUERTO DEL CARMEN, F.C. "A"', "hs": 3, "as": 21,
         "date": "2026-10-03", "time": "09:00", "venue": "COLON", "fiflp_acta": 280291}],
        "Jornada 2": [{"home": 'PUERTO DEL CARMEN, F.C. "A"', "away": "SAN BARTOLOME, C.F D", "hs": None, "as": None,
                       "date": "2026-10-10", "time": "", "venue": "", "fiflp_acta": 280295}]},
        log=lambda *_: None)
    assert conn.execute("SELECT fiflp_acta FROM matches WHERE id=1").fetchone()[0] == 280291        # actualizado
    assert conn.execute("SELECT fiflp_acta FROM matches WHERE jornada='Jornada 2'").fetchone()[0] == 280295  # nuevo
    assert U.pending_actas(conn, 1) == [(1, 280291)]       # solo el jugado


def test_a_failed_acta_spends_one_try_and_the_budget_is_respected(monkeypatch):
    monkeypatch.setattr(U, "flatten", lambda page, selector=None: 0)
    conn = base()
    for i in range(2, 5):
        conn.execute(f"""INSERT INTO matches(id, group_id, jornada, date, home_team_id, away_team_id, home_score, away_score, fiflp_acta)
                         VALUES ({i}, 1, 'Jornada {i}', '2026-10-1{i}', 2, 1, 1, 0, {280300 + i})""")

    class Page(_Page):
        def content(self):
            return "<html><body>vacía</body></html>"
    page = Page([])
    done, read = U.import_actas(page, _F(page), conn, 1, 2, log=lambda *_: None)
    assert (done, read) == (0, 2)
    assert conn.execute("SELECT sum(acta_tries) FROM matches").fetchone()[0] == 2


def test_parser_fields_minutes_penalty_referees_and_away_delegates():
    a = acta(TAMA)
    assert [e["minute"] for e in a["events"]] == [9, 39, 61]
    assert a["events"][1]["goal_type"] == "own" and a["events"][1]["side"] == "home"
    assert a["staff"]["delegates_away"] == {"campo": None, "equipo": "VELÁZQUEZ GARCÍA, ALBERTO"}
    assert a["staff"]["referees"] == ["Árbitro/a Principal SANTANA ALEMÁN, NÉSTOR"]
    assert a["header"]["competition"] == "LIGA BENJAMIN F7 GRAN CANARIA FASE LIGA A (GRUPO 2)"
    penalty = (FIX / TAMA).read_text(encoding="utf-8").replace('title="Gol normal"', 'title="Gol de penalti"', 1)
    assert parse_flat_acta(penalty)["events"][0]["goal_type"] == "penalty"


def test_migration_rebuilds_an_old_match_staff_without_losing_rows():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    conn.executescript("""
      CREATE TABLE players (id INTEGER PRIMARY KEY, full_name TEXT NOT NULL, norm_name TEXT NOT NULL UNIQUE);
      CREATE TABLE match_staff (id INTEGER PRIMARY KEY, match_id INTEGER NOT NULL REFERENCES matches(id),
        team_id INTEGER, kind TEXT NOT NULL CHECK(kind IN ('coach','referee')), name TEXT NOT NULL,
        UNIQUE(match_id, team_id, kind, name));
      INSERT INTO match_staff(id, match_id, team_id, kind, name) VALUES (7, 1, NULL, 'referee', 'X'), (8, 1, 2, 'coach', 'Y');
    """)
    migrate(conn)
    migrate(conn)                                           # idempotente
    assert conn.execute("SELECT id, kind, name FROM match_staff ORDER BY id").fetchall() == [(7, "referee", "X"), (8, "coach", "Y")]
    conn.execute("INSERT INTO match_staff(match_id, team_id, kind, name) VALUES (1, 2, 'delegate_team', 'Z')")
    assert "fiflp_id" in [r[1] for r in conn.execute("PRAGMA table_info(players)")]


# ── Directorio de campos ─────────────────────────────────────────────────

def test_campos_directory_page_and_venue_matching():
    from generate_js import venue_key, generate_campos_js
    rows, pages = U.parse_campos((FIX / "campos_fiflp_p1.html").read_text(encoding="utf-8", errors="replace"))
    assert len(rows) == 20 and pages == 13
    assert ("AGAPITO REYES VIERA", "C. Mosta, 1B", "Arrecife", "Hierba Artificial", "Fútbol 11", 222) in rows
    assert venue_key("Cirilo Lorenzo Alonso F-8") == "CIRILO LORENZO ALONSO"
    assert venue_key("JAVIER ARMAS REYES (F8)") == venue_key("Javier Armas Reyes")
    conn = base()
    conn.execute("UPDATE matches SET venue='Agapito Reyes Viera F-8'")
    assert U.missing_venues(conn, 1) == ["Agapito Reyes Viera F-8"]
    conn.executemany("INSERT INTO venues(name, norm, address, city, surface, kind, code) VALUES (?,?,?,?,?,?,?)",
                     [(r[0], venue_key(r[0]), *r[1:]) for r in rows])
    assert U.missing_venues(conn, 1) == []
    js = generate_campos_js(conn)
    assert json.loads(js[len("const CAMPOS="):-1]) == {
        "Agapito Reyes Viera F-8": ["C. Mosta, 1B", "Arrecife", "Hierba Artificial", "Fútbol 11"]}


def test_both_passes_end_to_end_with_a_simulated_federation(monkeypatch):
    """run_passes entero: jornada → acta (marcador y alineaciones) → goleadores →
    directorio de campos → estado por grupo. Sin red: una página falsa sirve las
    fixtures reales según la URL."""
    from datetime import date
    monkeypatch.setattr(U, "flatten", lambda page, selector=None: 0)
    recorded = []
    monkeypatch.setattr(U.source_health, "record", lambda *a: recorded.append(a))
    conn = base()
    _table(conn, (0, 0, 0), (0, 0, 0))

    class Page:
        url = ""
        def evaluate(self, js, *a):
            return [{"value": "1", "text": "1 - 03-10-2026"}] if "select[name=" in js else 0
        def wait_for_timeout(self, ms):
            pass
        def content(self):
            if "NFG_CmpPartido" in self.url:
                return (FIX / SBD).read_text(encoding="utf-8")
            if "NFG_CMP_Goleadores" in self.url:
                return (FIX / "goleadores_2526_A2.html").read_text(encoding="utf-8")
            if "NFG_LstCampos" in self.url:
                return (FIX / "campos_fiflp_p1.html").read_text(encoding="utf-8", errors="replace")
            return "<html></html>"

    class Fed(_F):
        def goto(self, page, url):
            page.url = url
            return True
        def parse_matches(self, page):
            return [{"home": "SAN BARTOLOME, C.F D", "away": 'PUERTO DEL CARMEN, F.C. "A"', "hs": 3, "as": 1,
                     "date": "03-10-2026", "time": "09:00", "venue": "AGAPITO REYES VIERA F-8", "fiflp_acta": 280291}]
    page = Page()
    groups = U.fiflp_groups(conn, 1)
    U.run_passes(page, Fed(page), conn, 1, groups, date(2026, 10, 5), {g[1]: g[2] for g in groups})
    assert conn.execute("SELECT home_score, away_score, cod_acta FROM matches WHERE id=1").fetchone() == (3, 21, 280291)
    assert conn.execute("SELECT count(*) FROM appearances").fetchone()[0] == 22
    assert conn.execute("SELECT count(*) FROM scorers WHERE group_id=1").fetchone()[0] == 142
    assert conn.execute("SELECT address FROM venues WHERE name='AGAPITO REYES VIERA'").fetchone() == ("C. Mosta, 1B",)
    assert U.missing_venues(conn, 1) == []
    (code, url, status, msg), = recorded
    assert code == "LZ3" and status == "ok" and "1/1 actas" in msg and "142 goleadores" in msg


# ── El bot importa las actas que descargan las tandas (actas-federacion.yml) ──

def past_base():
    """2025-26 con el Tamaraceite–Huracán del acta TAMA y otro partido con un acta
    importada antes de octubre de 2026 (sin aplanar)."""
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2025-2026', 2025, 2026, 0);
      INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN');
      INSERT INTO groups(id, season_id, category_id, code, island, full_name) VALUES (1, 1, 1, 'A2', 'grancanaria', 'SEGUNDA FASE BENJAMIN A-G2');
      INSERT INTO teams(id, name) VALUES (1, 'Tamaraceite'), (2, 'AD Huracán'), (3, 'Moya');
      INSERT INTO matches(id, group_id, jornada, date, home_team_id, away_team_id, home_score, away_score, cod_acta)
        VALUES (1, 1, 'Jornada 1', '2025-11-30', 1, 2, 2, 1, NULL),
               (2, 1, 'Jornada 2', '2025-12-06', 3, 1, 0, 4, 100);
    """)
    return conn


def test_the_bot_imports_changed_raws_once_and_only_flattened_actas(tmp_path):
    import import_fiflp_actas as I
    I.UNMATCHED_PATH = str(tmp_path / "unmatched.json")
    conn = past_base()
    old = {"header": {"season": "2025/2026", "date": "06-12-2025", "home_team": "MOYA, U.D.", "away_team": "TAMARACEITE, U.D. A",
                      "home_score": 0, "away_score": 4}, "lineups": {"home": [], "away": []}, "events": [], "staff": {}}
    raw = tmp_path / "fiflp_actas_2025-2026_raw.json"
    raw.write_text(json.dumps({"262000": acta(TAMA), "100": old}), encoding="utf-8")
    (tmp_path / "otra_cosa.json").write_text("{}", encoding="utf-8")
    lines = []
    reports = I.import_changed_raws(conn, str(tmp_path), log=lines.append)
    assert reports["fiflp_actas_2025-2026_raw.json"]["matched"] == 1
    assert reports["fiflp_actas_2025-2026_raw.json"]["skipped"] == 1
    assert "1 actas importadas, 0 sin partido, 1 sin aplanar" in lines[0]
    # El acta aplanada, importada; la antigua (sin aplanar) sigue como estaba: ni se reimporta ni se purga.
    assert conn.execute("SELECT cod_acta FROM matches ORDER BY id").fetchall() == [(262000,), (100,)]
    assert conn.execute("SELECT count(*) FROM appearances WHERE match_id=1").fetchone()[0] > 0
    # Sin cambios en el raw, nada que hacer.
    assert I.import_changed_raws(conn, str(tmp_path), log=lines.append) == {}
    # Un raw que cambia (otra tanda) se vuelve a importar entero, sin duplicar nada.
    apps = conn.execute("SELECT count(*) FROM appearances").fetchone()[0]
    raw.write_text(json.dumps({"262000": acta(TAMA), "100": old}, indent=1), encoding="utf-8")
    assert list(I.import_changed_raws(conn, str(tmp_path), log=lines.append)) == ["fiflp_actas_2025-2026_raw.json"]
    assert conn.execute("SELECT count(*) FROM appearances").fetchone()[0] == apps
