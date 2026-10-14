"""El bot de la federación cabe siempre en su job (update_fiflp.py, octubre de 2026).

Con 33 grupos la primera pasada eran 19 min sin plazo, la segunda tenía lo que quedara de 25 y los
grupos iban por orden alfabético: PG2, el de la familia, el último. Con la Segunda Fase (+12-16
grupos) y alevín (+32, códigos AL…) no cabría en los 45 min del job. Ahora:
  - cada página cuesta menos (fiflp_carga: sin esperas fijas; test_fiflp_carga.py);
  - el orden es por prioridad: los grupos de los equipos prioritarios, los cerrados que tocan, una
    cuota de alevín y el turno de prebenjamín y de benjamín, el turno siguiente de cada nivel (el
    margen) y el resto, intercalados;
  - la rotación NO tiene estado: cada nivel tiene cuatro turnos fijos y la pasada lee primero el de su
    número (run_number), no según nada guardado (update.yml no sube la base ni data-health.json en una
    pasada sin cambios publicados); dentro del turno, el inicio cambia de una época a otra (spin);
  - un plazo GLOBAL cubre las dos pasadas y reserva tiempo para las actas y los goleadores; lo que no
    cabe queda para otra pasada, sin marcarlo como error;
  - un grupo cerrado (todo jugado, última jornada hace más de 21 días) solo se refresca una de cada
    cuatro pasadas, en una que salta dos puestos de una época a otra. La simulación de muchas
    pasadas con 81 grupos está en test_bot_rotacion.py.
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
    """Sin Playwright instalado también (tests.yml solo instala pytest y pyyaml): el módulo es falso."""
    import types
    import fiflp_carga
    sync_api = types.ModuleType("playwright.sync_api")
    monkeypatch.setitem(sys.modules, "playwright.sync_api", sync_api)
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

    sync_api.sync_playwright = lambda: Playwright()
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


def plan(conn, checks=None, number=0, **kw):
    kw.setdefault("priority", ["Las Mesas Hu."])
    kw.setdefault("pinned", ())
    kw.setdefault("env", {})
    return U.plan_groups(conn, U.fiflp_groups(conn, 1), checks or {}, TODAY, number, **kw)


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


def test_order_is_priority_then_the_turns_then_the_rest_by_level():
    """Los prioritarios; el turno de cada nivel (la cuota de alevín, prebenjamín, benjamín: ceil(N/4)
    de cada uno); el turno siguiente de cada nivel (el margen); y el resto, intercalados (interleave)."""
    order = codes(plan(season(), env={"FIFLP_ALEVIN_MIN": "1"}).order)
    assert order[:3] == ["PG2", "FF5", "AL3"]                         # los de Las Mesas, por categoría
    assert order[3:] == ["AL1", "PG1", "FF1",                         # los turnos
                         "ALX1", "FF2",                               # los siguientes
                         "FF10", "LZ1"]                               # el resto
    # Por defecto la cuota es de 8: aquí, todo alevín va delante de prebenjamín y benjamín.
    assert codes(plan(season()).order)[3:] == ["AL1", "ALX1", "PG1", "FF1", "FF2", "FF10", "LZ1"]


def test_the_portal_group_is_a_priority_even_before_it_has_teams():
    conn = season([("FF1", "BENJAMIN", ["Arucas", "Tablero"]), ("PG4", "PREBENJAMIN", ["Unión Viera", "Moya"])])
    assert codes(plan(conn, priority=[], pinned={"PG4"}).order) == ["PG4", "FF1"]
    assert codes(plan(conn, priority=[], pinned=()).order) == ["PG4", "FF1"]     # prebenjamín antes, igualmente
    conn = season([("FF1", "BENJAMIN", ["Arucas", "Tablero"]), ("FF7", "BENJAMIN", ["Unión Viera", "Moya"])])
    assert codes(plan(conn, priority=[], pinned={"FF7"}).order) == ["FF7", "FF1"]


def test_each_level_starts_further_on_in_each_pass():
    """La rotación sale del número de la pasada: cada nivel tiene cuatro turnos fijos (aquí, de un grupo)
    y la pasada lee primero el de su número; en cuatro pasadas seguidas, cada uno el suyo. Los
    prioritarios, siempre delante."""
    conn = season()
    env = {"FIFLP_ALEVIN_MIN": "1"}
    orders = [codes(plan(conn, number=n, env=env).order) for n in range(812, 817)]
    assert all(o[:3] == ["PG2", "FF5", "AL3"] for o in orders)
    benjamin = [[c for c in o if c in ("FF1", "FF2", "FF10", "LZ1")] for o in orders]
    assert [b[0] for b in benjamin] == ["FF1", "FF2", "FF10", "LZ1", "FF1"]
    assert benjamin[1] == ["FF2", "FF10", "LZ1", "FF1"]                # sigue el orden, desde su turno
    # Alevín (AL1 y ALX1): turnos [AL1], [ALX1], [] y []. Con el suyo vacío, la cuota (1) toma el
    # primero de los siguientes.
    assert [o[3] for o in orders] == ["AL1", "ALX1", "AL1", "AL1", "AL1"]


def test_the_turns_are_four_fixed_blocks_whatever_the_size():
    """Cuatro turnos siempre (24 h con el cron cada 6 h), aunque el nivel tenga menos de cuatro grupos o
    no sea múltiplo de cuatro: con tres prebenjamín, tres turnos de uno y uno vacío (un ciclo de tres
    pasadas se desacompasaba de los saltos del número de ejecución)."""
    assert U.turn_blocks(["PG1", "PG3", "PG4"]) == [["PG1"], ["PG3"], ["PG4"], []]
    assert [len(b) for b in U.turn_blocks(list(range(43)))] == [11, 11, 11, 10]
    assert [len(b) for b in U.turn_blocks(list(range(28)))] == [7, 7, 7, 7]
    assert U.turn_blocks([]) == [[], [], [], []]
    # rotate: el turno de la pasada y después los siguientes, cada uno girado según su época.
    assert U.rotate(list("abcdefgh"), 0) == list("abcdefgh")
    assert U.rotate(list("abcdefgh"), 1) == list("cdefgh") + U.spin(list("ab"), 1) == list("cdefghba")
    assert U.rotate([], 5) == []
    for n in range(40):
        assert sorted(U.rotate(list(range(43)), n)) == list(range(43))
        block = U.turn_blocks(list(range(43)))[n % 4]
        assert set(U.rotate(list(range(43)), n)[:len(block)]) == set(block)


def test_the_part_of_a_turn_left_out_changes_from_one_day_to_the_next():
    """spin: si el plazo solo deja leer el principio de un turno, lo que queda fuera cambia de una época
    (cuatro pasadas) a otra; con hasta un tercio fuera, ningún grupo se queda fuera dos seguidas. Antes
    el corte caía siempre en la cola de un turno que avanzaba un puesto cada cuatro pasadas."""
    assert U.spin(list("abcde"), 0) == list("abcde") and U.spin([], 7) == []
    for size in range(1, 40):
        items = list(range(size))
        for out in range(1, size // 3 + 1):
            for epoch in range(2000):
                left = set(U.spin(items, epoch)[size - out:])
                assert sorted(U.spin(items, epoch)) == items
                assert not left & set(U.spin(items, epoch + 1)[size - out:]), (size, out, epoch)


def test_the_margin_and_the_rest_are_interleaved():
    """Si el plazo corta el margen (el turno siguiente), corta a todos los niveles por igual y el primero
    de cada uno entra antes que el segundo de ninguno: con una pasada perdida cada día, el margen de la
    anterior lee algo de cada nivel (antes, la cuota de alevín se lo llevaba todo y benjamín no se
    recuperaba)."""
    assert U.interleave([list("abc"), ["x"], list("123456")]) == ["a", "x", "1", "2", "b", "3", "4", "c", "5", "6"]
    assert U.interleave([[], ["x"], []]) == ["x"] and U.interleave([]) == []


def test_the_order_depends_on_the_pass_number_and_not_on_what_was_published():
    """Sin estado: dos pasadas con el mismo número dan el mismo orden aunque data-health.json diga otra
    cosa (una pasada sin cambios publicados no lo sube), y dos números seguidos, órdenes distintos."""
    conn = season()
    fresh = {code: checked(1) for code in ALL}
    stale = {code: checked(30) for code in ALL}
    assert plan(conn, fresh, number=7).order == plan(conn, stale, number=7).order == plan(conn, {}, number=7).order
    assert plan(conn, fresh, number=7).order != plan(conn, fresh, number=8).order


def test_the_pass_number_is_the_run_number_or_the_6_hour_slot():
    assert U.run_number({"GITHUB_RUN_NUMBER": "812"}) == 812
    a = U.run_number({}, NOW)
    assert U.run_number({"GITHUB_RUN_NUMBER": "x"}, NOW) == a
    assert U.run_number({}, NOW + timedelta(hours=1)) == a and U.run_number({}, NOW + timedelta(hours=2)) == a + 1


def test_alevin_keeps_its_quota_even_when_benjamin_would_fill_the_pass():
    """Alevín, el último nivel, no se queda sin leer aunque benjamín y prebenjamín llenen el plazo: su
    cuota (FIFLP_ALEVIN_MIN, 8 por defecto, y nunca menos que su turno) va delante de ellos. Los
    prioritarios, delante de todo, también de la cuota."""
    groups = ([("PG2", "PREBENJAMIN", ["Las Mesas Hu.", "Moya"])]
              + [(f"FF{i}", "BENJAMIN", [f"Local {i}", f"Visitante {i}"]) for i in range(1, 31)]
              + [(f"AL{i}", "ALEVIN", [f"Alevín {i}", f"Alevín R{i}"]) for i in range(1, 33)])
    conn = season(groups)
    turns = [len(b) for b in U.turn_blocks(list(range(30)))]           # benjamín: 8, 8, 8 y 6
    for number in range(4):
        order = codes(plan(conn, number=number).order)
        own, after = turns[number], turns[(number + 1) % 4]
        assert order[0] == "PG2"
        assert all(code.startswith("AL") for code in order[1:9]), order[:10]       # 8, antes que benjamín
        assert all(code.startswith("FF") for code in order[9:9 + own])             # su turno
        margin = order[9 + own:9 + own + 8 + after]                                 # los siguientes, intercalados
        assert sum(c.startswith("AL") for c in margin) == 8 and sum(c.startswith("FF") for c in margin) == after
        assert margin[0].startswith("AL") and margin[1].startswith("FF")
        assert len(order) == 63 and sorted(order) == sorted(c for c, _, _ in groups)
    seen = {c for n in range(4) for c in codes(plan(conn, number=n).order)[1:9]}
    assert seen == {f"AL{i}" for i in range(1, 33)}                     # en cuatro pasadas, los 32
    assert {c for n in range(4) for c in codes(plan(conn, number=n).order)[9:9 + turns[n]]} == {
        f"FF{i}" for i in range(1, 31)}                                  # y los 30 de benjamín
    assert U.alevin_quota(list(range(32)), {"FIFLP_ALEVIN_MIN": "12"}) == 12
    assert U.alevin_quota(list(range(48)), {"FIFLP_ALEVIN_MIN": "0"}) == 12  # nunca menos que su turno
    assert U.alevin_quota(list(range(48)), {"FIFLP_ALEVIN_MIN": "0"}, 11) == 11
    assert U.alevin_quota(list(range(5)), {}) == 5 and U.alevin_quota([], {}) == 0


# ── Grupos cerrados ────────────────────────────────────────────────────────────

def turn_of(code):
    """Un número de pasada en la que le toca a ese grupo cerrado."""
    return next(n for n in range(4) if U.closed_turn(code, n))


def test_a_closed_group_is_refreshed_once_every_four_passes():
    """Una vez en cada época de cuatro pasadas, en una que salta dos puestos de una época a otra: con un
    turno fijo (crc32 % 4), una pasada perdida cada día a la misma hora dejaba sin leer, para siempre,
    a los cerrados de esa hora."""
    conn = season(played="2026-09-19")                 # todo jugado hace 25 días
    all_ok = {code: checked(6) for code in ALL}
    for number in range(8):
        p = plan(conn, all_ok, number=number)
        assert set(codes(p.order)) == {c for c in ALL if U.closed_turn(c, number)}, number
        assert set(codes(p.order)) | set(codes(p.resting)) == set(ALL)
    for code in ALL:
        turns = [n for n in range(40, 64) if U.closed_turn(code, n)]
        assert [n // 4 for n in turns] == list(range(10, 16)), code         # una vez por época
        assert {(b - a) for a, b in zip(turns, turns[1:])} <= {2, 6}, code  # dos puestos más allá o más acá
        assert len({n % 4 for n in turns}) == 2, code
        for lost in range(4):                     # una pasada perdida al día: se lee al menos en cada 8
            kept = [n for n in turns if n % 4 != lost]
            assert all(b - a <= 8 for a, b in zip(kept, kept[1:])) and kept, (code, lost)


def test_a_closed_group_with_something_to_do_is_not_left_resting():
    conn = season(played="2026-09-19")
    all_ok = {code: checked(6) for code in ALL}
    number = next(n for n in range(100) if not any(U.closed_turn(c, n) for c in ("FF1", "FF2", "LZ1")))
    # La última comprobación falló o no está: se vuelve a mirar.
    p = plan(conn, {**all_ok, "FF1": checked(6, "error"), "FF2": None}, number=number)
    assert {"FF1", "FF2"} <= set(codes(p.order))
    # Un acta pendiente (o que hay que releer) también es algo que cambia.
    conn.execute("UPDATE matches SET fiflp_acta=280300 WHERE group_id=5")        # LZ1
    assert "LZ1" in codes(plan(conn, all_ok, number=number).order)


def test_a_group_is_not_closed_with_a_result_missing_or_a_recent_round():
    all_ok = {code: checked(6) for code in ALL}
    assert codes(plan(season(played="2026-09-24"), all_ok).resting) == []      # hace 20 días
    conn = season(played="2026-09-19")
    conn.execute("UPDATE matches SET home_score=NULL WHERE group_id=1")         # FF1, sin un resultado
    assert all("FF1" in codes(plan(conn, all_ok, number=n).order) for n in range(4))     # en todas las pasadas


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


class CalendarPage:
    """El calendario de un grupo: el desplegable de jornadas sale a la lectura `ready_on` (None: nunca)."""
    url = ""

    def __init__(self, ready_on=None):
        self.ready_on, self.reads, self.waits = ready_on, 0, []

    def evaluate(self, js, *a):
        if 'select[name="jornada"]' not in js:
            return []
        self.reads += 1
        return [{"value": "1", "text": "1 - 10-10-2026"}] if self.ready_on and self.reads >= self.ready_on else []

    def wait_for_function(self, js, arg=None, timeout=None, polling=None):
        self.waits.append((arg[0], timeout))

    def wait_for_timeout(self, ms):
        raise AssertionError("nada de esperas fijas")

    def content(self):
        return "<html></html>"


def test_a_calendar_without_rounds_costs_no_fixed_waits(monkeypatch):
    """La carga (fiflp_carga.goto) ya espera, con tope, al desplegable de jornadas: un grupo cuyo
    calendario aún no tiene jornadas (una fase recién dada de alta) no paga además 4 × 3 s fijos."""
    monkeypatch.setattr(U, "flatten", lambda page, selector=None: 0)
    stored = {"Jornada 1": ("2026-10-10", False)}
    page = CalendarPage()
    assert U.scrape_group(page, Fed(Clock()), url(1), {}, TODAY) == ([], {})
    assert page.reads == 1 and page.waits == []
    # Un grupo con jornadas cuyo desplegable tarda («0J»): hasta dos esperas más, al desplegable y con
    # tope (antes de octubre eran 4 × 3 s fijos; con una sola espera, 14/10, fallaban grupos sanos).
    page = CalendarPage(ready_on=3)
    assert list(U.scrape_group(page, Fed(Clock()), url(1), stored, TODAY)[1]) == ["Jornada 1"]
    assert len(page.waits) == 2
    assert all(sel.startswith('select[name="jornada"]') and 0 < cap <= 5000 for sel, cap in page.waits)
    # Y si aún no llega, se recarga el calendario una vez: la federación a veces lo sirve a medias.
    page = CalendarPage(ready_on=4)
    fed = Fed(Clock())
    assert list(U.scrape_group(page, fed, url(1), stored, TODAY)[1]) == ["Jornada 1"]
    assert len(page.waits) == 2
    # Si tampoco, el grupo falla como antes.
    page = CalendarPage()
    with pytest.raises(RuntimeError, match="jornadas"):
        U.scrape_group(page, Fed(Clock()), url(1), stored, TODAY)
    assert page.reads == 4 and len(page.waits) == 2


@pytest.fixture
def health(tmp_path, monkeypatch):
    """data-health.json de verdad (source_health) en un directorio de prueba."""
    import source_health
    (tmp_path / "index.html").write_text('<script src="./data-seasons.js?v=20261014a"></script>')
    monkeypatch.setattr(source_health, "ROOT", tmp_path)
    monkeypatch.setattr(source_health, "REPORT_PATH", tmp_path / "data-health.json")
    monkeypatch.setattr(source_health, "_report", None)

    def run(previous, conn, budget, checks_now=NOW, make_fed=Fed, number=0):
        import json
        source_health.REPORT_PATH.write_text(json.dumps(previous))
        source_health.begin("2026-2027")
        clock = Clock()
        monkeypatch.setattr(U, "clock", clock)
        monkeypatch.setattr(U, "flatten", lambda page, selector=None: 0)
        fed = make_fed(clock)
        groups = U.fiflp_groups(conn, 1)
        pending = {code: u for _, code, u in groups}
        U.run_passes(Page(), fed, conn, 1, groups, TODAY, pending, deadline_seconds=budget, now=checks_now,
                     number=number)
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


def read_groups(fed):
    """Los códigos de los grupos cuya clasificación y jornadas leyó la pasada, en orden."""
    numbers = {str(i): code for i, (code, _, _) in enumerate(GROUPS, 1)}
    return [numbers[u.rsplit("CodGrupo=", 1)[1]] for u in fed.urls if "CodGrupo=" in u and "CodJornada" not in u]


def scorers_read(fed):
    numbers = {str(i): code for i, (code, _, _) in enumerate(GROUPS, 1)}
    return [numbers[u.rsplit("=", 1)[1]] for u in fed.urls if "NFG_CMP_Goleadores" in u]


def test_what_does_not_fit_waits_for_the_next_pass_without_an_error(health):
    previous = report({code: checked(6) for code in ALL})
    data, fed = health(previous, season(), budget=80)
    groups = data["groups"]
    deferred = data["run"]["deferred"]
    assert deferred and set(deferred) <= {"FF1", "FF2", "FF10", "LZ1"}  # benjamín, tras la cuota de alevín
    for code in ("PG2", "FF5", "AL3", "AL1", "ALX1", "PG1"):               # prioritarios y cuota, dentro
        assert groups[code]["checkedAt"] > previous["groups"][code]["checkedAt"], code
    for code in deferred:                                                 # lo demás, como estaba
        assert groups[code] == previous["groups"][code], code
    assert data["summary"] == {"ok": len(ALL), "rejected": 0, "error": 0}
    assert data["run"]["pass"] == 0
    # Las actas y los goleadores de los prioritarios caben en la reserva (tras una página de
    # competiciones nuevas); los demás, si queda.
    scorers = [u for u in fed.urls if "NFG_CMP_Goleadores" in u]
    assert scorers_read(fed)[:3] == ["PG2", "FF5", "AL3"]
    # Las competiciones nuevas, una página entre las dos pasadas.
    catalog = [i for i, u in enumerate(fed.urls) if u.endswith("NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22")]
    last_group = max(i for i, u in enumerate(fed.urls) if "CodGrupo=" in u)
    assert len(catalog) == 1 and last_group < catalog[0] < fed.urls.index(scorers[0])


@pytest.mark.parametrize("commits", [True, False])
def test_the_rotation_reaches_every_group_without_any_saved_state(health, commits, monkeypatch):
    """Con plazo para 6 de 10 grupos (3 prioritarios), la pasada siguiente lee primero otro turno y en
    cuatro pasadas seguidas (24 h) todos se refrescan, alevín también. Igual si ninguna pasada sube nada
    (commits=False: cada una arranca del mismo data-health.json): el orden sale del número de la pasada.
    (Con la cuota de alevín por defecto, 8, los dos grupos alevín irían siempre y no quedaría sitio
    para benjamín: aquí, la cuota es su turno, 1 de 2.)"""
    monkeypatch.setenv("FIFLP_ALEVIN_MIN", "0")
    conn = season()
    base = report({code: checked(6) for code in ALL})
    previous, refreshed = base, []
    for n in range(8):
        data, fed = health(previous, conn, budget=60, checks_now=NOW + timedelta(hours=6 * n), number=500 + n)
        refreshed.append(set(read_groups(fed)))
        previous = data if commits else base
    mine = {"PG2", "FF5", "AL3"}
    assert all(mine <= done for done in refreshed)
    assert all(len(done) < len(ALL) for done in refreshed)               # el plazo corta siempre
    for i in range(len(refreshed) - 3):
        assert set().union(*refreshed[i:i + 4]) == set(ALL), i


@pytest.mark.parametrize("commits", [True, False])
def test_the_second_pass_rotates_too(health, commits):
    """Con la primera pasada entera y plazo para unas pocas segundas (actas y goleadores), la siguiente
    empieza, tras los prioritarios, por otro turno (en el orden de la primera, que rota): en cuatro
    pasadas seguidas todos tienen sus goleadores, alevín también, se suba algo o no."""
    conn = season()
    base = report({code: checked(6) for code in ALL})
    previous, read = base, []
    for n in range(8):
        data, fed = health(previous, conn, budget=112, checks_now=NOW + timedelta(hours=6 * n), number=900 + n)
        assert data["run"]["deferred"] == []
        read.append(scorers_read(fed))
        previous = data if commits else base
    assert all(got[:3] == ["PG2", "FF5", "AL3"] for got in read)
    assert all(len(got) < len(ALL) for got in read)                       # el plazo la corta siempre
    for i in range(len(read) - 3):
        assert set().union(*map(set, read[i:i + 4])) == set(ALL), i


class BlockedFed(Fed):
    """Tras `serve` páginas la federación deja de servir (un 503, tras los reintentos de cada página):
    blocked, como fiflp_carga.Federacion, con tres seguidas."""

    def __init__(self, clock, serve):
        super().__init__(clock)
        self.serve, self.failures = serve, 0

    @property
    def blocked(self):
        return self.failures >= 3

    def goto(self, page, url):
        ok = len(self.urls) < self.serve
        super().goto(page, url)
        self.failures = 0 if ok else self.failures + 1
        return ok


def test_a_federation_that_stops_serving_cuts_the_pass(health):
    """Tres páginas seguidas sin cargar: la federación bloquea o se ha caído. No se le piden más (el
    resto de grupos, a otra pasada, sin marcarlos como error), y lo que se leyó, se queda."""
    previous = report({code: checked(6) for code in ALL})
    data, fed = health(previous, season(), budget=600, make_fed=lambda clock: BlockedFed(clock, serve=9))
    assert len(fed.urls) == 9 + 4                                         # PG2, FF5 y AL3; AL1 y ALX1 fallan
    groups = data["groups"]
    assert [groups[c]["status"] for c in ("PG2", "FF5", "AL3", "AL1", "ALX1")] == ["ok", "ok", "ok", "error", "error"]
    assert data["run"]["deferred"] == ["PG1", "FF1", "FF2", "FF10", "LZ1"] and data["run"]["blocked"]
    for code in data["run"]["deferred"]:
        assert groups[code] == previous["groups"][code], code
    assert data["run"]["extrasDeferred"] == ["PG2", "FF5", "AL3"]         # sus actas, en otra pasada


def test_venues_and_team_cards_are_read_even_when_the_second_pass_runs_out(health):
    """El directorio de campos (si falta uno de la temporada) y las fichas de los equipos que no la
    tienen van tras las actas y los goleadores de los prioritarios y antes de los demás: si el plazo
    corta la segunda pasada en todas (lo previsto con alevín), se leen igual."""
    conn = season()
    conn.execute("UPDATE matches SET venue='CAMPO NUEVO' WHERE group_id=8")                 # AL1
    for position, name in enumerate(["Arucas", "Tablero"], 1):                               # FF1, sin fichas
        conn.execute("INSERT INTO standings(group_id, team_id, position) SELECT 1, id, ? FROM teams WHERE name=?",
                     (position, name))
    conn.commit()
    data, fed = health(report({code: checked(6) for code in ALL}), conn, budget=112)
    assert data["run"]["extrasDeferred"]                                                     # el plazo la cortó
    pages = [u.split("NPcd/")[1].split("?")[0] for u in fed.urls]
    scorers = [i for i, name in enumerate(pages) if name == "NFG_CMP_Goleadores"]
    assert "NFG_LstCampos" in pages and "NFG_LstDirectorioEquipos" in pages
    assert scorers[2] < pages.index("NFG_LstCampos") < pages.index("NFG_LstDirectorioEquipos")   # tras PG2, FF5 y AL3


def test_a_closed_group_is_refreshed_once_every_four_passes_and_the_rest_carry_their_check(health):
    """Todo cerrado: cada pasada lee solo los cerrados a los que les toca (closed_turn); los demás
    descansan con su última comprobación. En cada época de cuatro pasadas, todos una vez, sin estado:
    igual si ninguna pasada sube data-health.json."""
    conn = season(played="2026-09-19")
    base = report({code: checked(24) for code in ALL})
    visited = []
    for n in range(8):
        data, fed = health(base, conn, budget=600, checks_now=NOW + timedelta(hours=6 * n), number=40 + n)
        visited.append(set(read_groups(fed)))
        assert visited[-1] == {c for c in ALL if U.closed_turn(c, 40 + n)}
        assert sorted(data["run"]["resting"]) == sorted(set(ALL) - visited[-1])
        for code in set(ALL) - visited[-1]:
            assert data["groups"][code] == base["groups"][code]
    assert all(sum(code in v for v in visited) == 2 for code in ALL)     # en 8 pasadas, dos veces cada uno
    assert set().union(*visited[:4]) == set().union(*visited[4:]) == set(ALL)    # una vez en cada época


def test_a_pass_with_nothing_new_does_not_rewrite_the_report(health):
    """Sin nada nuevo, ni la hora de cada grupo ni las notas de la pasada reescriben data-health.json:
    no hay commit solo por la hora (la rotación no la necesita)."""
    conn = season(played="2026-09-19")
    first, _ = health(report({code: checked(24) for code in ALL}, at=NOW - timedelta(hours=1)), conn, budget=600,
                      number=7)
    data, fed = health(first, conn, budget=600, checks_now=NOW + timedelta(hours=6), number=7)
    assert data == first and read_groups(fed)                             # leyó, pero no cambió nada
