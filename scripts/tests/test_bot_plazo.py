"""El bot de la federación cabe siempre en su job (update_fiflp.py, octubre de 2026).

Con 33 grupos la primera pasada eran 19 min sin plazo, la segunda tenía lo que quedara de 25 y los
grupos iban por orden alfabético: PG2, el de la familia, el último. Con la Segunda Fase (+12-16
grupos) y alevín (+32, códigos AL…) no cabría en los 45 min del job. Ahora:
  - cada página cuesta menos (fiflp_carga: sin esperas fijas; test_fiflp_carga.py);
  - el orden es por prioridad: los grupos de los equipos prioritarios, prebenjamín, benjamín y al
    final alevín; dentro, el comprobado hace más tiempo primero (checkedAt de data-health.json);
  - un plazo GLOBAL cubre las dos pasadas y reserva tiempo para las actas y los goleadores de los
    prioritarios; lo que no cabe queda para la pasada siguiente (rotación), sin marcarlo como error;
  - un grupo cerrado (todo jugado, última jornada hace más de 21 días) solo se refresca una vez al día.
Sin red: páginas y raspador falsos.
"""
from datetime import date, datetime, timedelta, timezone
import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import SCHEMA  # noqa: E402
from migrate_actas_schema import migrate  # noqa: E402
import update_fiflp as U  # noqa: E402

TODAY = date(2026, 10, 14)
NOW = datetime(2026, 10, 14, 4, 0, tzinfo=timezone.utc)


# ── El navegador del bot ───────────────────────────────────────────────────────

def test_the_bot_browser_uses_the_ready_wait_and_the_short_delay(monkeypatch):
    import fiflp_carga
    import playwright.sync_api as sync_api
    seen = {}

    class Page:
        def route(self, *a):
            seen["route"] = True
        def set_default_timeout(self, ms):
            pass

    class Browser:
        def new_page(self, user_agent=None):
            return Page()
        def close(self):
            seen["closed"] = True

    class Playwright:
        class chromium:
            @staticmethod
            def launch(headless=True):
                return Browser()
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False

    monkeypatch.setattr(sync_api, "sync_playwright", lambda: Playwright())
    deadline = 12345.0
    U._with_browser(lambda page, F: seen.update(F=F), deadline=deadline)
    assert isinstance(seen["F"], fiflp_carga.Federacion) and seen["F"].deadline == deadline
    assert seen["F"].BASE.startswith("https://www.fiflp.com/") and seen["route"] and seen["closed"]


# ── La temporada de prueba ─────────────────────────────────────────────────────

def url(n):
    return ("https://www.fiflp.com/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22"
            f"&CodCompeticion=900&CodGrupo={n}")


# (código, categoría, equipos): Las Mesas Hu. juega en FF5 y PG2, y su filial alevín en AL3.
GROUPS = [("FF1", "BENJAMIN", ["Arucas", "Tablero"]), ("FF10", "BENJAMIN", ["Moya", "Firgas"]),
          ("FF2", "BENJAMIN", ["Teror", "Valsequillo"]), ("FF5", "BENJAMIN", ["Las Mesas Hu.", "Tamaraceite"]),
          ("LZ1", "BENJAMIN", ["Haría", "Tías"]), ("PG1", "PREBENJAMIN", ["Unión Viera", "Pedro Hidalgo"]),
          ("PG2", "PREBENJAMIN", ["Las Mesas Hu.", "Atlético Bachicán Las Mesas"]),
          ("AL1", "ALEVIN", ["Arucas B", "Moya B"]), ("AL3", "ALEVIN", ["Las Mesas Hu. C", "Carnevali"]),
          ("ALX1", "ALEVIN", ["Guiniguada", "Lomo Blanco"])]


def season(groups=GROUPS, played="2026-10-10"):
    """Una jornada por grupo, jugada el día `played` (None: sin jugar, el 24/10)."""
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.execute("INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2026-2027', 2026, 2027, 1)")
    cats = {}
    for i, (code, cat, teams) in enumerate(groups, 1):
        if cat not in cats:
            cats[cat] = conn.execute("INSERT INTO categories(name) VALUES (?)", (cat,)).lastrowid
        conn.execute("INSERT INTO groups(id, season_id, category_id, code, url) VALUES (?, 1, ?, ?, ?)",
                     (i, cats[cat], code, url(i)))
        ids = []
        for t in teams:
            row = conn.execute("SELECT id FROM teams WHERE name=?", (t,)).fetchone()
            ids.append(row[0] if row else conn.execute("INSERT INTO teams(name) VALUES (?)", (t,)).lastrowid)
        score = (1, 0) if played else (None, None)
        conn.execute("""INSERT INTO matches(group_id, jornada, date, home_team_id, away_team_id, home_score, away_score)
                        VALUES (?, 'Jornada 1', ?, ?, ?, ?, ?)""", (i, played or "2026-10-24", ids[0], ids[1], *score))
    conn.commit()
    return conn


def checked(hours_ago, status="ok"):
    return {"status": status, "message": "3 jornadas leídas", "checkedAt": (NOW - timedelta(hours=hours_ago)).isoformat()}


def plan(conn, checks=None, **kw):
    kw.setdefault("priority", ["Las Mesas Hu."])
    kw.setdefault("pinned", ())
    return U.plan_groups(conn, U.fiflp_groups(conn, 1), checks or {}, NOW, TODAY, **kw)


def codes(rows):
    return [code for _, code, _ in rows]


ALL = [code for code, _, _ in GROUPS]


# ── Prioridad ──────────────────────────────────────────────────────────────────

def test_priority_teams_come_from_the_portal_or_the_environment():
    assert U.priority_teams({}) == ["Las Mesas Hu."]                 # defaultTeam de src/config.js
    assert U.priority_teams({"FIFLP_PRIORITY_TEAMS": "Las Mesas Hu., Arucas"}) == ["Las Mesas Hu.", "Arucas"]
    assert U.priority_teams({"FIFLP_PRIORITY_TEAMS": ""}) == []
    assert U.pinned_groups() == {"PG2"}                                # su grupo en src/config.js


def test_a_priority_team_includes_its_club_filials_and_not_a_namesake_club():
    keys = U.priority_keys(["Las Mesas Hu."])
    for mine in ("Las Mesas Hu.", "Las Mesas Hu. B", "Las Mesas Huracán C", "UD Las Mesas Huracán", "LAS MESAS HU. D"):
        assert U.is_priority(mine, keys), mine
    for other in ("Atlético Bachicán Las Mesas", "Atlético Bachicán Las Mesas B", "Mesas", ""):
        assert not U.is_priority(other, keys), other


def test_order_is_priority_then_prebenjamin_benjamin_and_alevin_last():
    order = codes(plan(season()).order)
    assert order[:3] == ["PG2", "FF5", "AL3"]                         # los de Las Mesas, por categoría
    assert order[3:] == ["PG1", "FF1", "FF2", "FF10", "LZ1", "AL1", "ALX1"]


def test_the_portal_group_is_a_priority_even_before_it_has_teams():
    conn = season([("FF1", "BENJAMIN", ["Arucas", "Tablero"]), ("PG4", "PREBENJAMIN", ["Unión Viera", "Moya"])])
    assert codes(plan(conn, priority=[], pinned={"PG4"}).order) == ["PG4", "FF1"]
    assert codes(plan(conn, priority=[], pinned=()).order) == ["PG4", "FF1"]     # prebenjamín antes, igualmente
    conn = season([("FF1", "BENJAMIN", ["Arucas", "Tablero"]), ("FF7", "BENJAMIN", ["Unión Viera", "Moya"])])
    assert codes(plan(conn, priority=[], pinned={"FF7"}).order) == ["FF7", "FF1"]


def test_within_a_level_the_longest_unchecked_goes_first():
    checks = {code: checked(1) for code in ALL}
    checks.update(FF1=checked(3), LZ1=checked(5), AL1=checked(2), ALX1=checked(4, "error"), PG2=checked(2))
    order = codes(plan(season(), checks).order)
    assert order == ["PG2", "FF5", "AL3", "PG1", "LZ1", "FF1", "FF2", "FF10", "ALX1", "AL1"]


def test_a_group_left_out_twice_jumps_ahead_of_the_levels():
    """Si el plazo no da para todos, alevín (el último nivel) no se queda sin refrescar nunca: un grupo
    sin comprobar desde hace dos pasadas (o nunca) pasa delante de los niveles, el más viejo primero."""
    checks = {code: checked(1) for code in ALL}
    checks.update(AL1=checked(13), FF2=checked(30), PG1=None)
    order = codes(plan(season(), checks).order)
    assert order == ["PG2", "FF5", "AL3", "PG1", "FF2", "AL1", "FF1", "FF10", "LZ1", "ALX1"]


# ── Grupos cerrados ────────────────────────────────────────────────────────────

def test_a_closed_group_is_refreshed_once_a_day():
    conn = season(played="2026-09-19")                 # todo jugado hace 25 días
    all_ok = {code: checked(6) for code in ALL}
    assert sorted(codes(plan(conn, all_ok).resting)) == sorted(ALL) and codes(plan(conn, all_ok).order) == []
    p = plan(conn, {**all_ok, "FF1": checked(25)})
    assert codes(p.order) == ["FF1"] and p.due_closed == {"FF1"}        # pasó un día: se refresca
    assert "FF1" not in codes(p.resting)


def test_a_closed_group_with_something_to_do_is_not_left_resting():
    conn = season(played="2026-09-19")
    all_ok = {code: checked(6) for code in ALL}
    # La última comprobación falló o no está: se vuelve a mirar (y eso no fuerza nada más).
    p = plan(conn, {**all_ok, "FF1": checked(6, "error"), "FF2": None})
    assert set(codes(p.order)) == {"FF1", "FF2"} and p.due_closed == {"FF2"}
    # Un acta pendiente (o que hay que releer) también es algo que cambia.
    conn.execute("UPDATE matches SET fiflp_acta=280300 WHERE group_id=5")        # LZ1
    assert codes(plan(conn, all_ok).order) == ["LZ1"]


def test_a_group_is_not_closed_with_a_result_missing_or_a_recent_round():
    all_ok = {code: checked(6) for code in ALL}
    assert codes(plan(season(played="2026-09-24"), all_ok).resting) == []      # hace 20 días
    conn = season(played="2026-09-19")
    conn.execute("UPDATE matches SET home_score=NULL WHERE group_id=1")         # FF1, sin un resultado
    assert codes(plan(conn, all_ok).order) == ["FF1"]


# ── El plazo global y la rotación, con un reloj falso ──────────────────────────

class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


class Page:
    """Una jornada en el desplegable (la del 10/10, que entra en la ventana) y nada que leer."""
    url = ""

    def evaluate(self, js, *a):
        return [{"value": "1", "text": "1 - 10-10-2026"}] if 'select[name="jornada"]' in js else []

    def wait_for_timeout(self, ms):
        pass

    def content(self):
        return "<html></html>"


class Fed:
    """La federación falsa: cada página cuesta `cost` segundos del reloj."""
    BASE = "https://www.fiflp.com/pnfg/NPcd"

    def __init__(self, clock, cost=3):
        self.clock, self.cost, self.urls = clock, cost, []

    def goto(self, page, url):
        self.urls.append(url)
        page.url = url
        self.clock.t += self.cost
        return True

    def delay(self, *a):
        pass

    def parse_standings(self, page):
        return []

    def parse_matches(self, page):
        return []


@pytest.fixture
def health(tmp_path, monkeypatch):
    """data-health.json de verdad (source_health) en un directorio de prueba."""
    import source_health
    (tmp_path / "index.html").write_text('<script src="./data-seasons.js?v=20261014a"></script>')
    monkeypatch.setattr(source_health, "ROOT", tmp_path)
    monkeypatch.setattr(source_health, "REPORT_PATH", tmp_path / "data-health.json")
    monkeypatch.setattr(source_health, "_report", None)

    def run(previous, conn, budget, checks_now=NOW):
        import json
        source_health.REPORT_PATH.write_text(json.dumps(previous))
        source_health.begin("2026-2027")
        clock = Clock()
        monkeypatch.setattr(U, "clock", clock)
        monkeypatch.setattr(U, "flatten", lambda page, selector=None: 0)
        fed = Fed(clock)
        groups = U.fiflp_groups(conn, 1)
        pending = {code: u for _, code, u in groups}
        U.run_passes(Page(), fed, conn, 1, groups, TODAY, pending, deadline_seconds=budget, now=checks_now)
        source_health.finish(now=checks_now + timedelta(minutes=30))
        assert pending == {}, "ningún grupo queda como error si la pasada termina"
        return json.loads(source_health.REPORT_PATH.read_text()), fed
    return run


def report(checks, at=NOW - timedelta(hours=1)):
    """Un data-health.json como lo deja source_health.finish (con las URLs de season())."""
    numbers = {code: i for i, (code, _, _) in enumerate(GROUPS, 1)}
    groups = {code: {"url": url(numbers[code]), **entry} for code, entry in checks.items()}
    return {"version": 1, "season": "2026-2027", "groups": groups,
            "nextSeason": {"name": "2027-2028", "status": "pending"}, "checkedAt": at.isoformat(),
            "dataVersion": "20261014a",
            "summary": {s: sum(g["status"] == s for g in groups.values()) for s in ("ok", "rejected", "error")}}


def test_what_does_not_fit_waits_for_the_next_pass_without_an_error(health):
    previous = report({code: checked(6) for code in ALL})
    data, fed = health(previous, season(), budget=60)
    groups = data["groups"]
    deferred = data["run"]["deferred"]
    assert deferred and set(deferred) <= {"AL1", "ALX1", "FF1", "FF2", "FF10", "LZ1"}
    assert "AL1" in deferred and "ALX1" in deferred                       # alevín, lo último
    for code in ("PG2", "FF5", "AL3", "PG1"):                             # lo prioritario, dentro
        assert groups[code]["checkedAt"] > previous["groups"][code]["checkedAt"], code
    for code in deferred:                                                 # lo demás, como estaba
        assert groups[code] == previous["groups"][code], code
    assert data["summary"] == {"ok": len(ALL), "rejected": 0, "error": 0}
    # Las actas y los goleadores de los prioritarios caben en la reserva; los demás, si queda.
    scorers = [u for u in fed.urls if "NFG_CMP_Goleadores" in u]
    assert [u.rsplit("=", 1)[1] for u in scorers[:3]] == ["7", "4", "9"]  # PG2, FF5, AL3


def test_the_rotation_reaches_every_group(health):
    """Con plazo para 6 de 10 grupos (3 prioritarios), la pasada siguiente empieza por los que se
    quedaron fuera y en tres pasadas seguidas (18 h) todos se refrescan, alevín también."""
    conn = season()
    reports = [report({code: checked(6) for code in ALL})]
    for n in range(4):
        data, _ = health(reports[-1], conn, budget=60, checks_now=NOW + timedelta(hours=6 * n))
        reports.append(data)
    runs = [r["run"] for r in reports[1:]]
    refreshed = [set(ALL) - set(r["deferred"]) for r in runs]
    mine = {"PG2", "FF5", "AL3"}
    assert all(mine <= done for done in refreshed)
    left_out = set(runs[0]["deferred"])
    assert left_out and refreshed[1] - mine == left_out - set(runs[1]["deferred"])
    for window in (refreshed[0:3], refreshed[1:4]):
        assert set().union(*window) == set(ALL)


def test_a_closed_group_refreshed_after_a_day_is_published_to_keep_the_rotation(health):
    conn = season(played="2026-09-19")
    previous = report({**{code: checked(6) for code in ALL}, "FF1": checked(25)}, at=NOW - timedelta(hours=1))
    data, fed = health(previous, conn, budget=600)
    assert {u.split("CodGrupo=")[1].split("&")[0] for u in fed.urls if "CodGrupo=" in u} == {"1"}     # solo FF1
    assert data["groups"]["FF1"]["checkedAt"] > previous["groups"]["FF1"]["checkedAt"]
    assert sorted(data["run"]["resting"]) == sorted(set(ALL) - {"FF1"})
    for code in set(ALL) - {"FF1"}:
        assert data["groups"][code] == previous["groups"][code]


def test_nothing_new_and_nothing_left_out_does_not_rewrite_the_report(health):
    conn = season(played="2026-09-19")
    previous = report({code: checked(6) for code in ALL}, at=NOW - timedelta(hours=1))
    data, fed = health(previous, conn, budget=600)
    assert data == previous and fed.urls == []                            # todos descansan
