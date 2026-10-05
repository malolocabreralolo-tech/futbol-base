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


def test_a_goal_without_its_minute_keeps_the_scorers_name_clean():
    # La federación a veces publica «(')» sin el minuto: el nombre no la arrastra.
    html = (FIX / SBD).read_text(encoding="utf-8")
    events = parse_flat_acta(re.sub(r"\((\d+)'\)", "(')", html))["events"]
    assert [e["player_name"] for e in events] == [e["player_name"] for e in acta(SBD)["events"]]
    assert all(e["minute"] is None for e in events if e["kind"] == "goal")


def test_an_old_raw_with_the_empty_minute_mark_credits_the_lineup_player():
    import import_fiflp_actas as I
    conn = base()
    a = acta(SBD)
    a["events"] = [{**e, "player_name": "(') " + e["player_name"]} if e.get("player_name") else e
                   for e in a["events"]]
    assert U.apply_acta(conn, 1, 280291, a, log=lambda *_: None)
    assert conn.execute("SELECT count(*) FROM players WHERE full_name LIKE '(%'").fetchone()[0] == 0
    assert conn.execute("SELECT count(*) FROM appearances").fetchone()[0] == 22
    assert conn.execute("SELECT sum(goals) FROM appearances WHERE team_id=2").fetchone()[0] == 18
    # Los jugadores que dejó una importación anterior y ya no salen en ningún acta se borran.
    conn.execute("INSERT INTO players(full_name, norm_name) VALUES (?, ?)", ("(') FANTASMA, NIÑO", "(') FANTASMA, NINO"))
    assert I.prune_players(conn, log=lambda *_: None) == 1
    assert I.prune_players(conn, log=lambda *_: None) == 0


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


# ── Segunda pasada: dentro del grupo de su grupo de la federación ──

def test_a_yearless_calendar_date_is_compared_by_day_and_month():
    from acta_reconciler import _contradicts
    row = lambda date: (1, "A", "B", date, 2, 1)
    assert _contradicts({"date": "19-10-2024", "home_score": 2, "away_score": 1}, row("05/04"))
    assert not _contradicts({"date": "19-10-2024", "home_score": 2, "away_score": 1}, row("20/10"))
    assert not _contradicts({"date": "01-01-2025", "home_score": 2, "away_score": 1}, row("31/12"))   # cambio de año


def group_base():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2025-2026', 2025, 2026, 0);
      INSERT INTO categories(id, name) VALUES (1, 'PREBENJAMIN');
      INSERT INTO groups(id, season_id, category_id, code, name, phase) VALUES
        (1, 1, 1, 'PG1', 'Grupo 1', 'Gran Canaria'), (2, 1, 1, 'CP1', 'Grupo 1', 'Copa X');
      INSERT INTO teams(id, name) VALUES (1, 'Valkyrias Bec.'), (2, 'Moya'), (3, 'Tamaraceite'), (4, 'Arucas');
      INSERT INTO standings(group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd) VALUES
        (1, 1, 1, 9, 3, 3, 0, 0, 30, 2, 28), (1, 3, 2, 6, 3, 2, 0, 1, 9, 5, 4),
        (1, 2, 3, 3, 3, 1, 0, 2, 4, 20, -16), (1, 4, 4, 0, 3, 0, 0, 3, 1, 17, -16);
      INSERT INTO matches(id, group_id, jornada, date, home_team_id, away_team_id, home_score, away_score) VALUES
        (1, 1, 'Jornada 1', '04/10', 2, 3, 1, 2), (2, 1, 'Jornada 1', '04/10', 4, 1, 0, 9),
        (3, 1, 'Jornada 2', '11/10', 3, 4, 3, 0), (4, 1, 'Jornada 2', '11/10', 1, 2, 6, 0),
        (5, 1, 'Jornada 3', '18/10', 2, 4, 3, 1),
        (6, 2, 'Ronda 1', '07/06', 3, 4, 3, 0);
    """)
    return conn


def flat(home, away, hs, as_, date, comp="9", grupo="1", consistent=True):
    return {"header": {"season": "2025/2026", "date": date, "home_team": home, "away_team": away,
                       "home_score": hs, "away_score": as_},
            "lineups": {"home": [{"dorsal": 1, "name": f"H, {home[:4]}", "role": "starter"}],
                        "away": [{"dorsal": 1, "name": f"A, {away[:4]}", "role": "starter"}]},
            "events": [], "staff": {}, "consistent": consistent,
            "enumeration": {"comp_id": comp, "grupo": grupo, "jornada": "1"}}


def test_unmatched_names_are_found_in_their_group_and_a_consistent_acta_fixes_a_misread_score(tmp_path):
    import import_fiflp_actas as I
    I.UNMATCHED_PATH = str(tmp_path / "unmatched.json")
    conn = group_base()
    raw = {
        "1": flat("MOYA, U.D.", "TAMARACEITE, U.D. A", 1, 2, "04-10-2025"),
        "3": flat("TAMARACEITE, U.D. A", "ARUCAS C.F. A", 3, 0, "11-10-2025"),
        "5": flat("MOYA, U.D.", "ARUCAS C.F. A", 3, 1, "18-10-2025"),
        # 'BECERRIL VALKYRIAS' no casa por nombres con 'Valkyrias Bec.'; el calendario dice 9 y el acta 19.
        "2": flat("ARUCAS C.F. A", "BECERRIL VALKYRIAS, C.D.", 0, 19, "04-10-2025"),
        "4": flat("BECERRIL VALKYRIAS, C.D.", "MOYA, U.D.", 6, 0, "11-10-2025"),
        # Una copa con los mismos equipos y el mismo marcador que un partido de liga: no se casa con él.
        "6": flat("TAMARACEITE, U.D. A", "ARUCAS C.F. A", 3, 0, "07-06-2026", comp="77"),
    }
    (tmp_path / "fiflp_actas_2025-2026_raw.json").write_text(json.dumps(raw), encoding="utf-8")
    # La clasificación oficial, la del calendario con el marcador del acta (Arucas 0-19 Valkyrias).
    row = lambda pos, team, pts, j, g, e, p, gf, gc: {"pos": pos, "team": team, "pts": pts, "j": j, "g": g, "e": e,
                                                      "p": p, "gf": gf, "gc": gc}
    gol = {"9:1": {"comp": "9", "grupo": "1", "comp_name": "LIGA PREBENJAMIN", "grupo_name": "GRUPO 1", "ok": True,
                   "standings": [row(1, "BECERRIL VALKYRIAS, C.D.", 6, 2, 2, 0, 0, 25, 0),
                                 row(2, "TAMARACEITE, U.D. A", 6, 2, 2, 0, 0, 5, 1),
                                 row(3, "MOYA, U.D.", 3, 3, 1, 0, 2, 4, 9),
                                 row(4, "ARUCAS C.F. A", 0, 3, 0, 0, 3, 1, 25)],
                   "scorers": []}}
    (tmp_path / "fiflp_goleadores_2025-2026_raw.json").write_text(json.dumps(gol), encoding="utf-8")
    report = I.import_raw(conn, str(tmp_path / "fiflp_actas_2025-2026_raw.json"), only=I.flattened)
    assert report["matched"] == 6 and report["unmatched"] == 0 and report["scores_fixed"] == 1
    assert conn.execute("SELECT id, cod_acta, home_score, away_score FROM matches ORDER BY id").fetchall() == [
        (1, 1, 1, 2), (2, 2, 0, 19), (3, 3, 3, 0), (4, 4, 6, 0), (5, 5, 3, 1), (6, 6, 3, 0)]


def test_an_inconsistent_acta_never_overwrites_the_calendar_score(tmp_path):
    import import_fiflp_actas as I
    I.UNMATCHED_PATH = str(tmp_path / "unmatched.json")
    conn = group_base()
    raw = {"1": flat("MOYA, U.D.", "TAMARACEITE, U.D. A", 1, 2, "04-10-2025"),
           "3": flat("TAMARACEITE, U.D. A", "ARUCAS C.F. A", 3, 0, "11-10-2025"),
           "5": flat("MOYA, U.D.", "ARUCAS C.F. A", 3, 1, "18-10-2025"),
           "2": flat("ARUCAS C.F. A", "BECERRIL VALKYRIAS, C.D.", 0, 19, "04-10-2025", consistent=False)}
    (tmp_path / "fiflp_actas_2025-2026_raw.json").write_text(json.dumps(raw), encoding="utf-8")
    report = I.import_raw(conn, str(tmp_path / "fiflp_actas_2025-2026_raw.json"), only=I.flattened)
    # Se vincula por sus alineaciones (mismo cruce, mismo día), pero su marcador no manda.
    assert report["scores_fixed"] == 0
    assert conn.execute("SELECT home_score, away_score, cod_acta FROM matches WHERE id=2").fetchone() == (0, 9, 2)


def test_a_first_pass_match_with_a_dropped_digit_is_fixed_when_the_table_agrees(tmp_path):
    """La ofuscación antigua perdía cifras (1-11 guardado como 1-1). El acta coherente casa por
    nombres y fecha; la clasificación guardada (de la federación, sin ofuscar) dice 1-11."""
    import import_fiflp_actas as I
    I.UNMATCHED_PATH = str(tmp_path / "unmatched.json")
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2024-2025', 2024, 2025, 0);
      INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN');
      INSERT INTO groups(id, season_id, category_id, code, name, phase, island) VALUES (1, 1, 1, 'LZ11', 'Grupo 1', 'Primera Lanzarote', 'lanzarote');
      INSERT INTO teams(id, name) VALUES (1, 'San Bartolomé D'), (2, 'UD Lanzarote B');
      INSERT INTO standings(group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd) VALUES
        (1, 2, 1, 10, 4, 3, 1, 0, 21, 4, 17), (1, 1, 2, 1, 4, 0, 1, 3, 4, 21, -17);
      INSERT INTO matches(id, group_id, jornada, date, home_team_id, away_team_id, home_score, away_score) VALUES
        (1, 1, '1', '23/02', 1, 2, 1, 1), (2, 1, '2', '02/03', 2, 1, 3, 0),
        (3, 1, '3', '09/03', 1, 2, 2, 2), (4, 1, '4', '16/03', 2, 1, 5, 1);
    """)
    raw = {"190958": flat("SAN BARTOLOME D, C.F", "LANZAROTE, U.D. B", 1, 11, "23-02-2025"),
           "190960": flat("LANZAROTE, U.D. B", "SAN BARTOLOME D, C.F", 3, 0, "02-03-2025"),
           "190962": flat("SAN BARTOLOME D, C.F", "LANZAROTE, U.D. B", 2, 2, "09-03-2025"),
           "190964": flat("LANZAROTE, U.D. B", "SAN BARTOLOME D, C.F", 5, 1, "16-03-2025")}
    for a in raw.values():
        a["header"]["season"] = "2024/2025"
    (tmp_path / "fiflp_actas_2024-2025_raw.json").write_text(json.dumps(raw), encoding="utf-8")
    report = I.import_raw(conn, str(tmp_path / "fiflp_actas_2024-2025_raw.json"), only=I.flattened)
    assert report["scores_fixed"] == 1 and report["matched"] == 4
    assert conn.execute("SELECT home_score, away_score, cod_acta FROM matches WHERE id=1").fetchone() == (1, 11, 190958)


def test_a_missing_match_of_a_clear_group_is_created_from_its_acta(tmp_path):
    """LZ12 2024-25 tenía 90 de sus 132 partidos: el acta coherente de un cruce que no está en el
    grupo crea el partido, con la jornada y la fecha con la forma de las del grupo."""
    import import_fiflp_actas as I
    I.UNMATCHED_PATH = str(tmp_path / "unmatched.json")
    conn = group_base()
    conn.execute("DELETE FROM matches WHERE id=5")          # Moya–Arucas no está en el calendario
    conn.execute("UPDATE groups SET current_jornada='Jornada 2' WHERE id=1")
    # La clasificación, la del calendario completo (con Moya–Arucas 3-1).
    for team, played, gf, gc in ((1, 2, 15, 0), (2, 3, 4, 9), (3, 2, 5, 1), (4, 3, 1, 15)):
        conn.execute("UPDATE standings SET played=?, gf=?, gc=? WHERE group_id=1 AND team_id=?", (played, gf, gc, team))
    raw = {"1": flat("MOYA, U.D.", "TAMARACEITE, U.D. A", 1, 2, "04-10-2025"),
           "3": flat("TAMARACEITE, U.D. A", "ARUCAS C.F. A", 3, 0, "11-10-2025"),
           "2": flat("ARUCAS C.F. A", "VALKYRIAS BEC.", 0, 9, "04-10-2025"),
           "5": flat("MOYA, U.D.", "ARUCAS C.F. A", 3, 1, "18-10-2025")}
    raw["5"]["header"]["jornada"] = "3"
    (tmp_path / "fiflp_actas_2025-2026_raw.json").write_text(json.dumps(raw), encoding="utf-8")
    report = I.import_raw(conn, str(tmp_path / "fiflp_actas_2025-2026_raw.json"), only=I.flattened)
    assert report["gaps_filled"] == 1 and report["unmatched"] == 0
    row = conn.execute("""SELECT m.jornada, m.date, m.home_score, m.away_score, m.cod_acta FROM matches m
        JOIN teams t1 ON t1.id=m.home_team_id JOIN teams t2 ON t2.id=m.away_team_id
        WHERE t1.name='Moya' AND t2.name='Arucas'""").fetchone()
    assert row == ("Jornada 3", "18/10", 3, 1, 5)
    # Temporada cerrada: su jornada «en curso» pasa a ser la última.
    assert conn.execute("SELECT current_jornada FROM groups WHERE id=1").fetchone()[0] == "Jornada 3"



def test_a_created_match_that_would_part_the_group_from_its_table_is_undone(tmp_path):
    import import_fiflp_actas as I
    I.UNMATCHED_PATH = str(tmp_path / "unmatched.json")
    conn = group_base()
    conn.execute("DELETE FROM matches WHERE id=5")
    for team, played, gf, gc in ((1, 2, 15, 0), (2, 3, 4, 9), (3, 2, 5, 1), (4, 3, 1, 15)):
        conn.execute("UPDATE standings SET played=?, gf=?, gc=? WHERE group_id=1 AND team_id=?", (played, gf, gc, team))
    raw = {"1": flat("MOYA, U.D.", "TAMARACEITE, U.D. A", 1, 2, "04-10-2025"),
           "3": flat("TAMARACEITE, U.D. A", "ARUCAS C.F. A", 3, 0, "11-10-2025"),
           "2": flat("ARUCAS C.F. A", "VALKYRIAS BEC.", 0, 9, "04-10-2025"),
           "5": flat("MOYA, U.D.", "ARUCAS C.F. A", 7, 1, "18-10-2025")}     # 7-1: no cuadra con la tabla
    (tmp_path / "fiflp_actas_2025-2026_raw.json").write_text(json.dumps(raw), encoding="utf-8")
    report = I.import_raw(conn, str(tmp_path / "fiflp_actas_2025-2026_raw.json"), only=I.flattened)
    assert report["gaps_filled"] == 0 and report["unmatched"] == 1
    assert conn.execute("SELECT count(*) FROM matches").fetchone()[0] == 5
    assert conn.execute("SELECT count(*) FROM appearances a JOIN players p ON p.id=a.player_id WHERE p.full_name LIKE 'H, MOYA%'").fetchone()[0] == 1   # la del acta deshecha, fuera


# ── Sin la publicidad de la federación ──

def test_only_federation_requests_go_through():
    from fiflp_render import fiflp_request
    for url in ("https://www.fiflp.com/pnfg/NPcd/NFG_CmpPartido?CodActa=1",
                "https://files.fiflp.com/pnfg/css/web_responsive_2/nova_marco/nova2/fontawesome-6/css/all.css",
                "https://laspalmas.filesnovanet.es/pnfg/pimg/Clubes/00100_1.jpg", "/pnfg/script/nova2/nova.js"
                .replace("/pnfg", "https://www.fiflp.com/pnfg")):
        assert fiflp_request(url), url
    for url in ("https://securepubads.g.doubleclick.net/tag/js/gpt.js", "https://tags.refinery89.com/fiflpcom.js",
                "https://cdn.consentmanager.net/delivery/js/cmp_final.min.js", "https://fiflp.com.evil.net/x.js"):
        assert not fiflp_request(url), url


def test_a_real_browser_aborts_the_ads_and_keeps_the_federation_styles():
    sync_api = pytest.importorskip("playwright.sync_api")
    from fiflp_render import fiflp_only
    seen = {"ok": [], "failed": []}
    try:
        with sync_api.sync_playwright() as p:
            browser = p.chromium.launch()
            page = fiflp_only(browser.new_page())
            page.on("requestfailed", lambda r: seen["failed"].append(r.url))
            page.on("requestfinished", lambda r: seen["ok"].append(r.url))
            page.set_content('<link rel="stylesheet" href="https://files.fiflp.com/pnfg/css/web_responsive_2/nova_marco/nova2/fontawesome-6/css/all.css">'
                             '<script src="https://securepubads.g.doubleclick.net/tag/js/gpt.js"></script><p>x</p>',
                             wait_until="load", timeout=30000)
            browser.close()
    except Exception as exc:          # sin Chromium o sin red en este entorno
        pytest.skip(f"sin navegador o sin red: {exc}")
    assert any("doubleclick" in u for u in seen["failed"])
    assert not any("doubleclick" in u for u in seen["ok"])



def test_a_third_meeting_of_the_same_teams_gets_its_own_match():
    """Ligas a tres vueltas: Moya–Arucas ya está con su acta; otra acta de Moya–Arucas, otro día, es
    otro enfrentamiento y crea su partido (el cruce con un partido sin acta, en cambio, se salta)."""
    import import_fiflp_actas as I
    conn = group_base()
    conn.execute("UPDATE matches SET cod_acta=5 WHERE id=5")       # Moya–Arucas 3-1, con su acta
    for team, played, gf, gc in ((1, 2, 15, 0), (2, 4, 6, 9), (3, 2, 5, 1), (4, 4, 1, 17)):
        conn.execute("UPDATE standings SET played=?, gf=?, gc=? WHERE group_id=1 AND team_id=?", (played, gf, gc, team))
    votes = {("9", "1"): {1: 3}}
    added = I.fill_gaps(conn, "/tmp/fiflp_actas_2025-2026_raw.json",
                        [("50", flat("MOYA, U.D.", "ARUCAS C.F. A", 2, 0, "08-11-2025"))], votes, {})
    assert added == ["50"]
    assert conn.execute("SELECT count(*) FROM matches WHERE home_team_id=2 AND away_team_id=4").fetchone()[0] == 2



def test_a_truncated_old_calendar_is_completed_when_the_official_table_fits(tmp_path):
    """El archivo antiguo guardó media temporada (calendario y tabla): las actas completan el calendario,
    la tabla vieja ya no cuadra, pero la oficial de la federación sí: se quedan los partidos y la oficial."""
    import import_fiflp_actas as I
    conn = group_base()
    conn.execute("DELETE FROM matches WHERE id=5")
    # La tabla vieja (de antes de la jornada 3) y las actas de la jornada 3.
    gol_entry = {"comp": "9", "grupo": "1", "comp_name": "LIGA PREBENJAMIN", "grupo_name": "GRUPO 1", "ok": True,
                 "standings": [{"pos": 1, "team": "VALKYRIAS BEC.", "pts": 6, "j": 2, "g": 2, "e": 0, "p": 0, "gf": 15, "gc": 0},
                               {"pos": 2, "team": "TAMARACEITE, U.D. A", "pts": 6, "j": 2, "g": 2, "e": 0, "p": 0, "gf": 5, "gc": 1},
                               {"pos": 3, "team": "MOYA, U.D.", "pts": 3, "j": 3, "g": 1, "e": 0, "p": 2, "gf": 4, "gc": 9},
                               {"pos": 4, "team": "ARUCAS C.F. A", "pts": 0, "j": 3, "g": 0, "e": 0, "p": 3, "gf": 1, "gc": 15}],
                 "scorers": []}
    (tmp_path / "fiflp_goleadores_2025-2026_raw.json").write_text(json.dumps({"9:1": gol_entry}), encoding="utf-8")
    for team, played, gf, gc in ((1, 2, 15, 0), (2, 2, 1, 8), (3, 2, 5, 1), (4, 2, 0, 12)):
        conn.execute("UPDATE standings SET played=?, gf=?, gc=? WHERE group_id=1 AND team_id=?", (played, gf, gc, team))
    votes = {("9", "1"): {1: 4}}
    from score_deviation import group_deviation
    d_before = group_deviation(conn, 1)["dev"]
    added = I.fill_gaps(conn, str(tmp_path / "fiflp_actas_2025-2026_raw.json"),
                        [("5", flat("MOYA, U.D.", "ARUCAS C.F. A", 3, 1, "18-10-2025"))], votes, {})
    assert added == ["5"]
    assert conn.execute("SELECT played, gf, gc FROM standings WHERE team_id=2").fetchone() == (3, 4, 9)
    assert group_deviation(conn, 1)["dev"] <= d_before


# ── Calendarios antiguos: fechas de otro día y calendarios cortados (2021-22) ──

def test_an_old_calendar_date_does_not_hide_the_match_of_the_same_round_and_score(tmp_path):
    """El archivo de 2021-22 trae a veces la fecha de otro día ('22/12' para un partido del 3/12):
    con los mismos equipos, la misma jornada y el mismo marcador, el acta es de ese partido."""
    import import_fiflp_actas as I
    from acta_reconciler import reconcile_acta
    I.UNMATCHED_PATH = str(tmp_path / "unmatched.json")
    conn = group_base()
    header = {"season": "2025/2026", "date": "29-11-2025", "home_team": "MOYA, U.D.", "away_team": "ARUCAS C.F. A",
              "home_score": 3, "away_score": 1, "jornada": "3"}
    assert reconcile_acta(conn, header) == 5
    assert reconcile_acta(conn, {**header, "jornada": "2"}) is None          # otra jornada: no
    assert reconcile_acta(conn, {**header, "home_score": 4}) is None         # otro marcador: no


def truncated_base():
    """Una liga de 4 a una vuelta (6 partidos) con el calendario cortado a media jornada 2 y la
    clasificación oficial final: ningún equipo tiene su calendario completo."""
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2025-2026', 2025, 2026, 0);
      INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN');
      INSERT INTO groups(id, season_id, category_id, code, name, phase, island) VALUES (1, 1, 1, 'LZP1', 'Grupo 1', 'Preferente Lanzarote', 'lanzarote');
      INSERT INTO teams(id, name) VALUES (1, 'Haría'), (2, 'Teguise'), (3, 'Tinajo'), (4, 'Yaiza');
      INSERT INTO matches(id, group_id, jornada, date, home_team_id, away_team_id, home_score, away_score) VALUES
        (1, 1, '1', '04/10', 1, 2, 2, 0), (2, 1, '1', '04/10', 3, 4, 1, 1), (3, 1, '2', '11/10', 1, 3, 3, 1);
    """)
    # J2: Haría 3-1 Tinajo, Teguise 0-0 Yaiza; J3: Haría 1-2 Yaiza, Teguise 2-1 Tinajo.
    for team, pts, played, gf, gc in ((1, 6, 3, 6, 3), (2, 4, 3, 2, 3), (3, 1, 3, 3, 6), (4, 5, 3, 3, 2)):
        conn.execute("INSERT INTO standings(group_id, team_id, position, points, played, gf, gc) VALUES (1, ?, ?, ?, ?, ?, ?)",
                     (team, team, pts, played, gf, gc))
    return conn


def test_a_truncated_calendar_without_any_complete_team_takes_its_consistent_actas_and_the_sure_unsure_ones(tmp_path):
    import import_fiflp_actas as I
    I.UNMATCHED_PATH = str(tmp_path / "unmatched.json")
    conn = truncated_base()
    raw = {"1": flat("HARIA, C.D.", "TEGUISE, C.D.", 2, 0, "04-10-2025"),
           "2": flat("TINAJO, U.D.", "YAIZA, C.D.", 1, 1, "04-10-2025"),
           "3": flat("HARIA, C.D.", "TINAJO, U.D.", 3, 1, "11-10-2025"),
           "4": flat("TEGUISE, C.D.", "YAIZA, C.D.", 0, 0, "11-10-2025"),
           "5": flat("HARIA, C.D.", "YAIZA, C.D.", 1, 2, "18-10-2025"),
           # Incoherente: la cabecera perdió una cifra (1-1); su último gol dice 2-1, lo que da la tabla.
           "6": flat("TEGUISE, C.D.", "TINAJO, U.D.", 1, 1, "18-10-2025", consistent=False)}
    raw["6"]["events"] = [{"kind": "goal", "side": "home", "score": [1, 0], "player_name": "X"},
                          {"kind": "goal", "side": "away", "score": [1, 1], "player_name": "Y"},
                          {"kind": "goal", "side": "home", "score": [2, 1], "player_name": "X"}]
    for k, j in (("1", "1"), ("2", "1"), ("3", "2"), ("4", "2"), ("5", "3"), ("6", "3")):
        raw[k]["header"]["jornada"] = j
    (tmp_path / "fiflp_actas_2025-2026_raw.json").write_text(json.dumps(raw), encoding="utf-8")
    report = I.import_raw(conn, str(tmp_path / "fiflp_actas_2025-2026_raw.json"), only=I.flattened)
    assert report["gaps_filled"] == 3 and report["unmatched"] == 0
    assert conn.execute("""SELECT home_score, away_score FROM matches m JOIN teams t ON t.id=m.home_team_id
                           WHERE t.name='Teguise' AND m.away_team_id=3""").fetchone() == (2, 1)
    from score_deviation import group_deviation
    assert group_deviation(conn, 1) == {"dev": 0, "complete": 4, "teams": 4}


def test_an_unsure_acta_that_never_fits_the_table_leaves_no_match(tmp_path):
    import import_fiflp_actas as I
    I.UNMATCHED_PATH = str(tmp_path / "unmatched.json")
    conn = truncated_base()
    conn.executescript("""INSERT INTO matches(group_id, jornada, date, home_team_id, away_team_id, home_score, away_score) VALUES
        (1, '2', '11/10', 2, 4, 0, 0), (1, '3', '18/10', 1, 4, 1, 2)""")
    raw = {"6": flat("TEGUISE, C.D.", "TINAJO, U.D.", 5, 1, "18-10-2025", consistent=False)}
    raw["6"]["header"]["jornada"] = "3"
    raw.update({"1": flat("HARIA, C.D.", "TEGUISE, C.D.", 2, 0, "04-10-2025"),
                "2": flat("TINAJO, U.D.", "YAIZA, C.D.", 1, 1, "04-10-2025"),
                "3": flat("HARIA, C.D.", "TINAJO, U.D.", 3, 1, "11-10-2025")})
    (tmp_path / "fiflp_actas_2025-2026_raw.json").write_text(json.dumps(raw), encoding="utf-8")
    report = I.import_raw(conn, str(tmp_path / "fiflp_actas_2025-2026_raw.json"), only=I.flattened)
    assert report["gaps_filled"] == 0 and report["unmatched"] == 1
    assert conn.execute("SELECT count(*) FROM matches").fetchone()[0] == 5


def test_an_unsure_acta_fixes_a_dropped_digit_only_when_the_table_agrees(tmp_path):
    """LZP1 2021-22: UD Lanzarote 12-2 UD Palmeiros guardado como 2-2; el acta, incoherente (su último
    gol es el 11-2), dice 12-2 en la cabecera: la clasificación lo confirma."""
    import import_fiflp_actas as I
    I.UNMATCHED_PATH = str(tmp_path / "unmatched.json")
    conn = truncated_base()
    conn.executescript("""INSERT INTO matches(group_id, jornada, date, home_team_id, away_team_id, home_score, away_score) VALUES
        (1, '2', '11/10', 2, 4, 0, 0), (1, '3', '18/10', 1, 4, 1, 2), (1, '3', '18/10', 2, 3, 2, 1)""")
    conn.execute("UPDATE matches SET home_score=2, away_score=0 WHERE id=1")
    conn.execute("UPDATE standings SET gf=16 WHERE team_id=1")      # Haría 12-0 Teguise, no 2-0
    conn.execute("UPDATE standings SET gc=13 WHERE team_id=2")
    raw = {"1": flat("HARIA, C.D.", "TEGUISE, C.D.", 12, 0, "04-10-2025", consistent=False),
           "2": flat("TINAJO, U.D.", "YAIZA, C.D.", 1, 1, "04-10-2025"),
           "3": flat("HARIA, C.D.", "TINAJO, U.D.", 3, 1, "11-10-2025"),
           "5": flat("HARIA, C.D.", "YAIZA, C.D.", 1, 2, "18-10-2025")}
    raw["1"]["events"] = [{"kind": "goal", "side": "home", "score": [11, 0], "player_name": "X"}]
    (tmp_path / "fiflp_actas_2025-2026_raw.json").write_text(json.dumps(raw), encoding="utf-8")
    report = I.import_raw(conn, str(tmp_path / "fiflp_actas_2025-2026_raw.json"), only=I.flattened)
    assert report["scores_fixed"] == 1
    assert conn.execute("SELECT home_score, away_score, cod_acta FROM matches WHERE id=1").fetchone() == (12, 0, 1)
