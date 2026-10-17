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
  - un plazo GLOBAL (16 min desde el 16/10/2026: pasadas cortas cada 2 h) cubre la pasada; en su último
    cuarto como mucho (2 min) no empieza ningún grupo; lo que no cabe queda para otra pasada, sin
    marcarlo como error;
  - cada grupo se lee COMPLETO antes del siguiente (desde el 16/10/2026): su calendario y justo después
    sus goleadores, si tocan, y sus actas pendientes (hasta entonces, las actas y los goleadores iban en
    una segunda pasada, y los de los prioritarios, tras todos sus calendarios, a cuenta de su reserva: el
    segundo freno de la federación casi nunca dejaba llegar); cada acta, una vez por pasada, y las que el
    final de una pasada deja a medias, las primeras de la siguiente tras los prioritarios (catch_up);
  - los prioritarios, solo cuando toca (test_bot_prioritarios.py);
  - un grupo cerrado (todo jugado, última jornada hace más de 21 días) solo se refresca una vez al día
    (CLOSED_PASSES: una de cada doce pasadas, cada cuatro con el cron cada 6 h), en una que salta dos
    puestos de un día a otro. La simulación de muchas pasadas con 81 grupos está en test_bot_rotacion.py
    y la de una semana con el cupo de la federación, en test_bot_pasada_corta.py.
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
    """Sin Playwright instalado también (tests.yml solo instala pytest y pyyaml): el módulo es falso.
    Chromium se lanza sin lo ajeno a la federación ni imágenes (fiflp_launch_args) y la página no lleva
    ruta: una ruta de Playwright desactiva la caché HTTP (~10 veces más peticiones por página)."""
    import types
    import fiflp_carga
    from fiflp_render import fiflp_launch_args
    sync_api = types.ModuleType("playwright.sync_api")
    monkeypatch.setitem(sys.modules, "playwright.sync_api", sync_api)
    seen = {}

    class Page:
        def route(self, *a, **k):
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
            def launch(headless=True, args=None):
                seen["args"] = args
                return Browser()
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False

    sync_api.sync_playwright = lambda: Playwright()
    deadline = 12345.0
    U._with_browser(lambda page, F: seen.update(F=F), deadline=deadline)
    assert isinstance(seen["F"], fiflp_carga.Federacion) and seen["F"].deadline == deadline
    assert seen["F"].BASE.startswith("https://www.fiflp.com/") and seen["closed"]
    assert seen["args"] == fiflp_launch_args() and "route" not in seen


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
    kw.setdefault("now", NOW)
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
    de cada uno); el turno siguiente de cada nivel (el margen); y el resto. Los tres, intercalados
    (interleave; el turno, desde el 15/10/2026), cada nivel con la fase de su turno (pass_phase, desde el
    16/10/2026: el primero de cada nivel ya no va siempre antes que el segundo de ninguno; aquí, en la
    pasada 0, prebenjamín tras benjamín)."""
    order = codes(plan(season(), env={"FIFLP_ALEVIN_MIN": "1"}).order)
    assert order[:3] == ["PG2", "FF5", "AL3"]                         # los de Las Mesas, por categoría
    assert order[3:] == ["AL1", "FF1", "PG1",                         # los turnos
                         "ALX1", "FF2",                               # los siguientes
                         "FF10", "LZ1"]                               # el resto
    # Por defecto la cuota es de 8: aquí, los dos alevín, intercalados en el turno con prebenjamín y
    # benjamín. Hasta el 15/10/2026 iban delante de ellos (AL1, ALX1, PG1, FF1): con el cupo de la
    # federación, la cuota se llevaba todos los grupos no prioritarios de la pasada (test_bot_rotacion).
    assert codes(plan(season()).order)[3:] == ["AL1", "FF1", "ALX1", "PG1", "FF2", "FF10", "LZ1"]


def test_the_portal_group_is_a_priority_even_before_it_has_teams():
    """El grupo del equipo del portal va el primero aunque aún no tenga equipos. (Sin él, los dos, en su
    turno: desde el 16/10/2026 cada nivel con su fase, y aquí benjamín va antes.)"""
    conn = season([("FF1", "BENJAMIN", ["Arucas", "Tablero"]), ("PG4", "PREBENJAMIN", ["Unión Viera", "Moya"])])
    assert codes(plan(conn, priority=[], pinned={"PG4"}).order) == ["PG4", "FF1"]
    assert codes(plan(conn, priority=[], pinned=()).order) == ["FF1", "PG4"]
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
    """Sin estado: dos pasadas con el mismo número dan el mismo orden de la rotación aunque data-health.json
    diga otra cosa (una pasada sin cambios publicados no lo sube), y dos números seguidos, órdenes
    distintos. Los prioritarios, desde el 16/10/2026, sí dependen de su última comprobación publicada (solo
    cuando toca: test_bot_prioritarios): comprobados hace 1 h, solo el de su turno; hace 30 h o nunca,
    todos."""
    conn = season()
    fresh = {code: checked(1) for code in ALL}
    stale = {code: checked(30) for code in ALL}
    mine = {"PG2", "FF5", "AL3"}
    rotation = lambda checks, number: [c for c in codes(plan(conn, checks, number=number).order) if c not in mine]
    assert rotation(fresh, 7) == rotation(stale, 7) == rotation({}, 7)
    assert rotation(fresh, 7) != rotation(fresh, 8)
    assert set(codes(plan(conn, stale, number=7).order)) & mine == set(codes(plan(conn, {}, number=7).order)) & mine == mine
    slot = {c for i, c in enumerate(["PG2", "FF5", "AL3"]) if U.priority_slot(i, 7)}
    assert set(codes(plan(conn, fresh, number=7).order)) & mine == slot


def test_the_pass_number_is_the_run_number_or_the_6_hour_slot():
    assert U.run_number({"GITHUB_RUN_NUMBER": "812"}) == 812
    a = U.run_number({}, NOW)
    assert U.run_number({"GITHUB_RUN_NUMBER": "x"}, NOW) == a
    assert U.run_number({}, NOW + timedelta(hours=1)) == a and U.run_number({}, NOW + timedelta(hours=2)) == a + 1


def test_alevin_keeps_its_quota_even_when_benjamin_would_fill_the_pass():
    """Alevín, el último nivel, no se queda sin leer aunque benjamín y prebenjamín llenen el plazo: su
    cuota (FIFLP_ALEVIN_MIN, 8 por defecto, y nunca menos que su turno) es su parte del turno, intercalada
    con el de benjamín y el de prebenjamín (interleave): si el plazo o el cupo de la federación cortan el
    turno, cada nivel conserva su parte (el primero de cada uno antes que el segundo de ninguno). Hasta el
    15/10/2026 la cuota iba delante de ellos: con el cupo (~15 páginas por IP: ~6 grupos no prioritarios
    por pasada) se los llevaba todos y benjamín y prebenjamín no se leían nunca (test_bot_rotacion). Los
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
        turn = order[1:1 + 8 + own]                                     # la cuota (8) y su turno, intercalados
        assert sum(c.startswith("AL") for c in turn) == 8 and sum(c.startswith("FF") for c in turn) == own
        assert turn[0].startswith("AL") and turn[1].startswith("FF")
        for cut in range(1, len(turn) + 1):                             # corte donde corte, cada uno su parte
            assert abs(sum(c.startswith("AL") for c in turn[:cut]) - cut * 8 / (8 + own)) <= 1, (number, cut)
        margin = order[1 + 8 + own:1 + 8 + own + 8 + after]             # los siguientes, intercalados
        assert sum(c.startswith("AL") for c in margin) == 8 and sum(c.startswith("FF") for c in margin) == after
        assert margin[0].startswith("AL") and margin[1].startswith("FF")
        assert len(order) == 63 and sorted(order) == sorted(c for c, _, _ in groups)
    seen = {c for n in range(4) for c in codes(plan(conn, number=n).order)[1:9 + turns[n]] if c.startswith("AL")}
    assert seen == {f"AL{i}" for i in range(1, 33)}                     # en cuatro pasadas, los 32
    assert {c for n in range(4) for c in codes(plan(conn, number=n).order)[1:9 + turns[n]] if c.startswith("FF")} == {
        f"FF{i}" for i in range(1, 31)}                                  # y los 30 de benjamín
    assert U.alevin_quota(list(range(32)), {"FIFLP_ALEVIN_MIN": "12"}) == 12
    assert U.alevin_quota(list(range(48)), {"FIFLP_ALEVIN_MIN": "0"}) == 12  # nunca menos que su turno
    assert U.alevin_quota(list(range(48)), {"FIFLP_ALEVIN_MIN": "0"}, 11) == 11
    assert U.alevin_quota(list(range(5)), {}) == 5 and U.alevin_quota([], {}) == 0


# ── Grupos cerrados ────────────────────────────────────────────────────────────

def test_a_closed_group_is_refreshed_once_every_four_passes():
    """Una vez en cada época de CLOSED_PASSES pasadas, en una que salta dos puestos de una época a otra: con
    un turno fijo (crc32 % 4), una pasada perdida cada día a la misma hora dejaba sin leer, para siempre,
    a los cerrados de esa hora. Desde el 16/10/2026, con una pasada cada 2 h, la época es de 12 pasadas (24 h,
    como antes las 4 cada 6 h; y lo mismo daily_turn con cualquier número de pasadas)."""
    period = U.CLOSED_PASSES
    assert period == 12 and U.PASS_EVERY * period == timedelta(hours=24)
    conn = season(played="2026-09-19")                 # todo jugado hace 25 días
    all_ok = {code: checked(6) for code in ALL}
    for number in range(2 * period):
        p = plan(conn, all_ok, number=number)
        assert set(codes(p.order)) == {c for c in ALL if U.closed_turn(c, number)}, number
        assert set(codes(p.order)) | set(codes(p.resting)) == set(ALL)
    for passes in (period, 4):
        for code in ALL:
            turns = [n for n in range(10 * passes, 16 * passes) if U.daily_turn(code, n, passes)]
            assert [n // passes for n in turns] == list(range(10, 16)), (passes, code)   # una vez por época
            # Una pasada perdida al día: se lee al menos una vez en cada dos días (con 12, y 8 h: su pasada
            # salta dos puestos de un día a otro y la perdida le quita como mucho una de cada seis).
            for lost in range(passes):
                kept = [n for n in turns if n % passes != lost]
                assert all(b - a <= 2 * passes + 4 % passes for a, b in zip(kept, kept[1:])) and kept, (passes, code, lost)
        if passes == 4:                           # con 4: dos puestos más allá o más acá, en dos pasadas del día
            assert all({b - a for a, b in zip(turns, turns[1:])} <= {2, 6} for code in ALL
                       for turns in [[n for n in range(40, 64) if U.daily_turn(code, n, 4)]])


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


def steps(fed):
    """Lo que pidió la pasada, en orden: el calendario de cada grupo ('PG2'; su clasificación y sus
    jornadas no se apuntan), sus goleadores ('PG2 goleadores'), cada acta ('acta 7001') y el desplegable de
    competiciones ('competiciones')."""
    numbers = {str(i): code for i, (code, _, _) in enumerate(GROUPS, 1)}
    out = []
    for u in fed.urls:
        if "NFG_CMP_Goleadores" in u:
            out.append(numbers[u.rsplit("=", 1)[1]] + " goleadores")
        elif "CodActa=" in u:
            out.append("acta " + u.rsplit("=", 1)[1])
        elif "NFG_CmpJornada" in u and "CodGrupo=" in u and "CodJornada" not in u:
            out.append(numbers[u.rsplit("=", 1)[1]])
        elif "NFG_CmpJornada" in u and "CodGrupo=" not in u:
            out.append("competiciones")
    return out


def test_what_does_not_fit_waits_for_the_next_pass_without_an_error(health):
    """Lo que no cabe en el plazo queda para otra pasada, sin error y con su comprobación de antes. Desde el
    16/10/2026 cada grupo se lee completo antes del siguiente (sus goleadores, justo tras su calendario: aquí
    sin goleadores en la base, tocan) y en el último cuarto del plazo (aquí 20 s de 80; por defecto, 2 min:
    RESERVE_SECONDS) no empieza ninguno: ya no hay segunda pasada que reservar. Al acabar, si sobra pasada
    (ni freno ni plazo), la página de competiciones."""
    previous = report({code: checked(6) for code in ALL})
    data, fed = health(previous, season(), budget=80)
    groups = data["groups"]
    deferred = data["run"]["deferred"]
    assert deferred == ["PG1", "FF2", "FF10", "LZ1"]                     # tras los turnos
    for code in ("PG2", "FF5", "AL3", "AL1", "FF1", "ALX1"):             # prioritarios y turnos, dentro
        assert groups[code]["checkedAt"] > previous["groups"][code]["checkedAt"], code
    for code in deferred:                                                 # lo demás, como estaba
        assert groups[code] == previous["groups"][code], code
    assert data["summary"] == {"ok": len(ALL), "rejected": 0, "error": 0}
    assert data["run"]["pass"] == 0
    assert steps(fed) == ["PG2", "PG2 goleadores", "FF5", "FF5 goleadores", "AL3", "AL3 goleadores", "AL1",
                          "AL1 goleadores", "FF1", "FF1 goleadores", "ALX1", "ALX1 goleadores", "competiciones"]
    assert data["run"]["extrasDeferred"] == []                            # todos los leídos, completos


@pytest.mark.parametrize("commits", [True, False])
def test_the_rotation_reaches_every_group_without_any_saved_state(health, commits, monkeypatch):
    """Con plazo para 7 de 10 grupos (3 prioritarios), la pasada siguiente lee primero otro turno y en
    cuatro pasadas seguidas todos se refrescan, alevín también, con sus goleadores (cada grupo, completo:
    desde el 16/10/2026 los goleadores van con cada grupo leído, no en una segunda pasada). Igual si ninguna
    pasada sube nada (commits=False: cada una arranca del mismo data-health.json): el orden sale del número
    de la pasada. (Con la cuota de alevín por defecto, 8, los dos grupos alevín irían siempre y no quedaría
    sitio para benjamín: aquí, la cuota es su turno, 1 de 2. Las pasadas, cada 6 h: los prioritarios, en
    todas.)"""
    monkeypatch.setenv("FIFLP_ALEVIN_MIN", "0")
    conn = season()
    base = report({code: checked(6) for code in ALL})
    previous, refreshed, scored = base, [], []
    for n in range(8):
        data, fed = health(previous, conn, budget=100, checks_now=NOW + timedelta(hours=6 * n), number=500 + n)
        refreshed.append(set(read_groups(fed)))
        scored.append(set(scorers_read(fed)))
        previous = data if commits else base
    mine = {"PG2", "FF5", "AL3"}
    assert all(mine <= done for done in refreshed)
    assert all(len(done) < len(ALL) for done in refreshed)               # el plazo corta siempre
    for i in range(len(refreshed) - 3):
        assert set().union(*refreshed[i:i + 4]) == set(ALL), i
        assert set().union(*scored[i:i + 4]) == set(ALL), i


def test_each_group_read_has_its_scorers_right_after_its_calendar(health):
    """Cada grupo leído, completo antes del siguiente: sus goleadores, si tocan (scorers_due: aquí, sin
    goleadores en la base), justo tras su calendario. Hasta el 16/10/2026 iban en una segunda pasada (los del
    turno y del margen, primero), que el segundo freno de la federación casi nunca dejaba empezar: los grupos
    leídos se quedaban sin goleadores («sin federación: las actas y los goleadores de 3 grupos»)."""
    data, fed = health(report({code: checked(6) for code in ALL}), season(), budget=600)
    s = [x for x in steps(fed) if x != "competiciones"]
    assert s == [x for code in read_groups(fed) for x in (code, f"{code} goleadores")]
    assert data["run"]["deferred"] == [] and data["run"]["extrasDeferred"] == []


class BlockedFed(Fed):
    """Tras `serve` páginas la federación deja de servir (un 503, tras los reintentos de cada página):
    blocked, como fiflp_carga.Federacion sin pausas largas, con tres seguidas; `served`, las que cargaron."""

    def __init__(self, clock, serve):
        super().__init__(clock)
        self.serve, self.failures, self.served = serve, 0, 0

    @property
    def blocked(self):
        return self.failures >= 3

    def goto(self, page, url):
        ok = len(self.urls) < self.serve
        super().goto(page, url)
        self.failures = 0 if ok else self.failures + 1
        self.served += ok
        return ok


# ── Cada grupo, completo: sus goleadores y sus actas justo tras su calendario ──

def with_actas(conn, counts):
    """Partidos jugados (el 10/10) con su acta por leer (fiflp_acta 7001, 7002…) en los grupos de `counts`
    ({código: cuántos})."""
    acta = 7000
    for code, n in counts.items():
        gid = ALL.index(code) + 1
        home, away = conn.execute("SELECT home_team_id, away_team_id FROM matches WHERE group_id=?", (gid,)).fetchone()
        for k in range(n):
            acta += 1
            conn.execute("""INSERT INTO matches(group_id, jornada, date, home_team_id, away_team_id, home_score,
                            away_score, fiflp_acta) VALUES (?, ?, '2026-10-10', ?, ?, 1, 0, ?)""",
                         (gid, f"Jornada {2 + k}", home, away, acta))
    conn.commit()
    return conn


def actas_left(conn, code):
    return U.pending_actas(conn, ALL.index(code) + 1)


@pytest.fixture
def actas_ok(monkeypatch):
    """Un acta que se lee queda importada (con su código): deja de estar pendiente (como en
    test_bot_rotacion)."""
    monkeypatch.setattr(U, "apply_acta", lambda conn, mid, code, acta, log=print: bool(
        conn.execute("UPDATE matches SET cod_acta=? WHERE id=?", (code, mid))))


@pytest.mark.parametrize("actas", [{}, {"PG2": 3, "FF5": 3}], ids=["sin-actas", "con-actas"])
def test_a_federation_that_stops_serving_cuts_the_pass(health, actas_ok, actas):
    """Tres páginas seguidas sin cargar: la federación bloquea o se ha caído. No se le piden más (el resto
    de grupos, a otra pasada, sin marcarlos como error), y lo que se leyó, se queda. Aquí sirve 12 páginas.
    Sin actas, justo los tres prioritarios completos (calendario y goleadores, 4 páginas cada uno); el
    siguiente, AL1, no carga y conserva su comprobación. Con 3 actas en PG2 y en FF5, desde el 16/10/2026
    cada grupo se lee completo antes del siguiente: PG2 entero (7 páginas), FF5 con su calendario, sus
    goleadores y la primera de sus actas, y AL3, a otra pasada con su comprobación de antes; las dos actas
    de FF5 que la federación ya no sirvió, también (run.extrasDeferred). Hasta entonces las actas iban
    tras los tres calendarios: AL3 se leía y las actas se quedaban todas para otra pasada."""
    previous = report({code: checked(6) for code in ALL})
    conn = with_actas(season(), actas)
    data, fed = health(previous, conn, budget=600, make_fed=lambda clock: BlockedFed(clock, serve=12))
    groups = data["groups"]
    assert data["run"]["blocked"] and data["summary"]["error"] == 0
    if not actas:
        # AL1 falla (sin señal de freno: un error, de momento) y FF1 deja a la federación bloqueada: los
        # dos, sin servir por el freno (AL1, justo antes, sin ninguna página servida entre medias).
        assert read_groups(fed) == ["PG2", "FF5", "AL3", "AL1", "FF1"] and scorers_read(fed) == ["PG2", "FF5", "AL3"]
        assert [groups[c]["status"] for c in ("PG2", "FF5", "AL3")] == ["ok", "ok", "ok"]
        assert data["run"]["unserved"] == ["AL1", "FF1"] and data["run"]["extrasDeferred"] == []
        assert data["run"]["deferred"] == ["ALX1", "PG1", "FF2", "FF10", "LZ1"]
    else:
        # Las dos últimas actas de FF5 no cargan; el calendario de AL3 deja a la federación bloqueada.
        assert steps(fed) == ["PG2", "PG2 goleadores", "acta 7001", "acta 7002", "acta 7003", "FF5",
                              "FF5 goleadores", "acta 7004", "acta 7005", "acta 7006", "AL3"]
        assert actas_left(conn, "PG2") == [] and len(actas_left(conn, "FF5")) == 2
        assert [groups[c]["status"] for c in ("PG2", "FF5")] == ["ok", "ok"]
        assert data["run"]["extrasDeferred"] == ["FF5"] and data["run"]["unserved"] == ["AL3"]
        assert data["run"]["deferred"] == ["AL1", "FF1", "ALX1", "PG1", "FF2", "FF10", "LZ1"]
    for code in data["run"]["deferred"]:
        assert groups[code] == previous["groups"][code], code


def test_the_federation_stops_after_the_priority_groups_and_their_actas_and_scorers_are_in(health, actas_ok, capsys):
    """La pasada 1101 (14/10/2026): la federación sirvió los calendarios de los seis grupos prioritarios
    y algunas páginas más, y después páginas vacías (su freno, F.blocked). Sus actas y sus goleadores
    iban en la segunda pasada y se perdían («sin federación: las actas y los goleadores de 6 grupos, en otra
    pasada»), un fin de semana tras otro. Desde el 16/10/2026 cada grupo se lee completo antes del
    siguiente: las páginas que la federación sirve son para los prioritarios enteros (calendario,
    goleadores y actas). AL1 y FF1 (los dos siguientes, que la federación ya no sirve) conservan su última
    comprobación (un freno no es un error): FF1 la deja bloqueada y AL1 falló justo antes, sin ninguna
    página servida entre su fallo y el bloqueo."""
    conn = with_actas(season(), {"PG2": 2, "FF5": 1})
    previous = report({code: checked(6) for code in ALL})
    # PG2 con sus goleadores y sus dos actas (6 páginas), FF5 con los suyos y su acta (5) y AL3 con los suyos
    # (4). Después, nada.
    data, fed = health(previous, conn, budget=600, make_fed=lambda clock: BlockedFed(clock, serve=15))
    assert steps(fed)[:9] == ["PG2", "PG2 goleadores", "acta 7001", "acta 7002", "FF5", "FF5 goleadores",
                              "acta 7003", "AL3", "AL3 goleadores"]
    assert len(fed.urls) == 15 + 4                                        # AL1 y FF1 fallan, y nada más
    assert actas_left(conn, "PG2") == actas_left(conn, "FF5") == []
    groups = data["groups"]
    assert [groups[c]["status"] for c in ("PG2", "FF5", "AL3")] == ["ok", "ok", "ok"]
    assert groups["AL1"] == previous["groups"]["AL1"] and groups["FF1"] == previous["groups"]["FF1"]
    assert data["summary"]["error"] == 0 and data["run"]["unserved"] == ["AL1", "FF1"]
    assert "; 2/2 actas" in groups["PG2"]["message"] and "; 1/1 actas" in groups["FF5"]["message"]
    assert data["run"]["blocked"] and data["run"]["extrasDeferred"] == []
    assert data["run"]["deferred"] == ["ALX1", "PG1", "FF2", "FF10", "LZ1"]
    log = capsys.readouterr().out
    assert log.index("[PG2] 2/2 actas") < log.index("[FF5]\n") < log.index("[FF5] 1/1 actas") < log.index("[AL3]\n")
    assert "(sin federación: las actas" not in log                        # nada de los prioritarios, a otra pasada
    assert "    sin federación: a otra pasada (no carga el calendario de la federación)\n" in log    # FF1


def test_a_federation_that_stops_in_the_priority_actas_stops_everything(health, actas_ok, capsys):
    """Si frena en las actas de un prioritario, como en cualquier otro punto: nada más en esta pasada (ni los
    demás prioritarios ni el resto), sin marcar nada como error; sus actas, a otra pasada (sin gastar
    intentos: una página que no carga no es un acta leída)."""
    conn = with_actas(season(), {"PG2": 5})
    previous = report({code: checked(6) for code in ALL})
    data, fed = health(previous, conn, budget=600, make_fed=lambda clock: BlockedFed(clock, serve=6))
    assert steps(fed) == ["PG2", "PG2 goleadores", "acta 7001", "acta 7002", "acta 7003", "acta 7004", "acta 7005"]
    assert len(actas_left(conn, "PG2")) == 3                              # las tres que no cargaron
    groups = data["groups"]
    assert groups["PG2"]["status"] == "ok"
    assert data["run"]["blocked"] and data["run"]["extrasDeferred"] == ["PG2"]
    assert data["run"]["deferred"] == ["FF5", "AL3", "AL1", "FF1", "ALX1", "PG1", "FF2", "FF10", "LZ1"]
    for code in data["run"]["deferred"]:
        assert groups[code] == previous["groups"][code], code
    log = capsys.readouterr().out
    assert "(sin federación: las actas y los goleadores de 1 grupos, en otra pasada: PG2)" in log


def test_a_group_whose_scorers_the_federation_does_not_serve_is_left_for_another_pass(health, actas_ok, capsys):
    """Si la federación no sirve la página de goleadores de un grupo (aquí frena en ella, tras el calendario
    de PG2), sus goleadores y sus actas quedan para otra pasada: el grupo va en extrasDeferred y el registro
    lo dice («sin federación: …»)."""
    conn = with_actas(season(), {"PG2": 2})
    data, fed = health(report({code: checked(6) for code in ALL}), conn, budget=600,
                       make_fed=lambda clock: BlockedFed(clock, serve=3))
    assert steps(fed) == ["PG2", "PG2 goleadores", "acta 7001", "acta 7002"]
    assert data["run"]["blocked"] and data["run"]["extrasDeferred"] == ["PG2"]
    assert data["groups"]["PG2"]["status"] == "ok" and len(actas_left(conn, "PG2")) == 2
    log = capsys.readouterr().out
    assert "(sin federación: las actas y los goleadores de 1 grupos, en otra pasada: PG2)" in log


def test_a_federation_that_stops_at_the_first_calendar_changes_nothing(health, actas_ok, capsys):
    """Si la federación frena en el primer calendario, ningún grupo se lee: los dos que la pasada intentó
    conservan su comprobación (data-health.json no cambia y no se reescribe; el bloqueo se ve en la
    federación) y no se pide nada más (ni las competiciones)."""
    conn = with_actas(season(), {"PG2": 4})
    previous = report({code: checked(6) for code in ALL})
    data, fed = health(previous, conn, budget=600, make_fed=lambda clock: BlockedFed(clock, serve=1))
    assert read_groups(fed) == ["PG2", "FF5"] and fed.blocked and data == previous
    assert "competiciones" not in steps(fed)
    log = capsys.readouterr().out
    assert "  Sin federación: 2 grupos conservan su última comprobación, a otra pasada (PG2, FF5)\n" in log


@pytest.mark.parametrize("n", [0, 2, 10])
def test_each_group_is_complete_before_the_next_and_the_deadline_cuts_the_rest(health, actas_ok, n):
    """Las actas de PG2 (0, 2 o 10), justo tras su calendario y sus goleadores, antes que el calendario de
    FF5: cada grupo, completo antes del siguiente (desde el 16/10/2026; hasta entonces iban tras los tres
    calendarios de los prioritarios, a cuenta de la reserva de la segunda pasada, y no les quitaban nada a
    los demás). Ahora se las quitan: con más actas, los demás leen menos en esa pasada, y lo que no cabe,
    a otra pasada (en el último cuarto del plazo, 20 s de 80, no empieza ningún grupo). Ninguna página
    empieza pasado el plazo y, si sobra pasada, se leen las competiciones."""
    conn = with_actas(season(), {"PG2": n})
    data, fed = health(report({code: checked(6) for code in ALL}), conn, budget=80)
    s = steps(fed)
    assert s[:2 + n + 1] == ["PG2", "PG2 goleadores"] + [f"acta {7001 + k}" for k in range(n)] + ["FF5"]
    assert data["run"]["seconds"] <= 80 + 3                               # nada empieza pasado el plazo
    read = read_groups(fed)
    assert read == codes(plan(conn, number=0).order)[:len(read)]
    assert data["run"]["deferred"] == codes(plan(conn, number=0).order)[len(read):]
    assert len(read) == {0: 6, 2: 5, 10: 3}[n]                            # las actas, a costa de los demás
    assert actas_left(conn, "PG2") == [] and data["summary"]["error"] == 0


def test_actas_the_end_of_a_pass_leaves_are_caught_up_first_in_the_next(health, actas_ok, capsys, monkeypatch):
    """Las actas que el final de una pasada deja a medias (el último grupo: el segundo freno de la federación
    o el plazo) ya no esperan a la lectura siguiente del grupo, días después: la pasada siguiente las
    recupera (new_actas, catch_up), con los goleadores del grupo, tras los prioritarios que tocan y antes que
    el turno (como mucho CATCHUP_ACTAS). Aquí AL1, el último grupo de la pasada 0, con 12 actas: el plazo
    corta tras la 11.ª; en una pasada siguiente en la que AL1 no va entre los CATCHUP_SKIP primeros grupos
    no prioritarios (esos las leerían tras su calendario), lo que falta va tras AL3. (La cuota de alevín,
    su turno: con la de por defecto, 8, los dos alevín irían siempre entre los primeros.)"""
    monkeypatch.setenv("FIFLP_ALEVIN_MIN", "0")
    conn = with_actas(season(), {"AL1": 12})
    previous = report({code: checked(6) for code in ALL})
    first, fed = health(previous, conn, budget=80)
    assert read_groups(fed)[-1] == "AL1" and first["run"]["extrasDeferred"] == ["AL1"]
    left = actas_left(conn, "AL1")
    assert 0 < len(left) < U.CATCHUP_ACTAS
    soon = lambda n: codes(plan(conn, number=n, env={"FIFLP_ALEVIN_MIN": "0"}).order)[3:3 + U.CATCHUP_SKIP]
    number = next(n for n in range(1, 40) if "AL1" not in soon(n))
    data, fed = health(first, conn, budget=80, checks_now=NOW + timedelta(hours=6), number=number)
    s = steps(fed)
    assert "AL1" not in read_groups(fed)
    at = s.index("AL3 goleadores") + 1
    assert s[at:at + 1 + len(left)] == ["AL1 goleadores"] + [f"acta {code}" for _, code in left]
    assert actas_left(conn, "AL1") == []
    assert "\n  Actas nuevas de otras pasadas\n" in capsys.readouterr().out


def test_an_acta_that_fails_is_read_once_per_pass(health, monkeypatch):
    """Un acta que falla (sin alineaciones aún: «se reintentará») gasta uno de sus MAX_ACTA_TRIES intentos,
    que son para pasadas distintas (la federación tiene tiempo de rellenarla): en una pasada, cada acta una
    vez, también la que se lee de nuevo como acta nueva de otra pasada (catch_up)."""
    def apply(conn, mid, code, acta, log=print):
        if code == 7001:
            return False
        return bool(conn.execute("UPDATE matches SET cod_acta=? WHERE id=?", (code, mid)))
    monkeypatch.setattr(U, "apply_acta", apply)
    conn = with_actas(season(), {"PG2": 30})
    data, fed = health(report({code: checked(6) for code in ALL}), conn, budget=200)
    s = steps(fed)
    assert s.count("acta 7001") == 1 and len([x for x in s if x.startswith("acta")]) == 30
    assert conn.execute("SELECT acta_tries FROM matches WHERE fiflp_acta=7001").fetchone() == (1,)
    assert [code for _, code in actas_left(conn, "PG2")] == [7001]        # para la próxima pasada


def test_a_failed_acta_is_retried_at_the_pace_of_age_not_in_every_pass(health, monkeypatch):
    """Un acta que ya falló se reintenta solo si la última comprobación correcta publicada de su grupo es de
    hace un rato (retry_actas): sus MAX_ACTA_TRIES intentos son para dar tiempo a la federación a rellenarla.
    Con una pasada cada 2 h, un prioritario caliente se lee en todas, y un acta suya que tardaba se quedaba sin
    intentos en ~6-8 h (en la simulación de cuatro semanas, una de AL27); con el cron cada 6 h, ~18 h. Desde
    el 17/10/2026, en dos tramos: la que falló una vez, desde 2 h 45 (ACTA_RETRY_SOON: en las ventanas de
    partidos, con una pasada cada hora, un prioritario frío se lee en su pasada cada ~3 h, y con las 4 h de
    antes no se reintentaba en toda la ventana); las que fallaron más, desde 4 h (ACTA_RETRY_AFTER), como
    antes. Una nueva, siempre; y la que no se reintenta no deja el grupo «a medias»."""
    def apply(conn, mid, code, acta, log=print):
        if code == 7001:
            return False
        return bool(conn.execute("UPDATE matches SET cod_acta=? WHERE id=?", (code, mid)))
    monkeypatch.setattr(U, "apply_acta", apply)
    assert (U.ACTA_RETRY_SOON, U.ACTA_RETRY_AFTER) == (timedelta(hours=2, minutes=45), timedelta(hours=4))
    assert U.ACTA_RETRY_SOON_TRIES == 2 and U.MAX_ACTA_TRIES == 4
    for tries, hours, retried in ((1, 1, False), (1, 2.7, False), (1, 2.75, True), (1, 3, True), (1, 6, True),
                                  (2, 2.75, False), (2, 3.9, False), (2, 4, True), (3, 3, False), (3, 4, True)):
        conn = with_actas(season(), {"PG2": 2})
        conn.execute("UPDATE matches SET acta_tries=? WHERE fiflp_acta=7001", (tries,))     # ya falló
        checks = {code: checked(6) for code in ALL}
        checks["PG2"] = checked(hours)
        number = next(n for n in range(12) if "PG2" in plan(conn, checks, number=n).priority)
        data, fed = health(report(checks), conn, budget=600, number=number)
        s = steps(fed)
        assert "PG2" in s and "acta 7002" in s and ("acta 7001" in s) is retried, (tries, hours, s)
        assert conn.execute("SELECT acta_tries FROM matches WHERE fiflp_acta=7001").fetchone() == (tries + retried,)
        assert "PG2" not in data["run"]["extrasDeferred"]
    assert U.retry_actas(None, NOW) == U.MAX_ACTA_TRIES == U.retry_actas(checked(1, "error"), NOW)
    assert [U.retry_actas(checked(h), NOW) for h in (1, 2.75, 4)] == [1, 2, U.MAX_ACTA_TRIES]


def test_the_retry_cap_of_pending_actas():
    """pending_actas: True, todas las que no se han agotado; False, solo las nunca intentadas; un número
    (retry_actas), las que fallaron menos veces que él, entre 1 y MAX_ACTA_TRIES."""
    conn = with_actas(season(), {"PG2": 5})
    for tries, acta in enumerate(range(7001, 7006)):
        conn.execute("UPDATE matches SET acta_tries=? WHERE fiflp_acta=?", (tries, acta))
    left = lambda retry: sorted(code for _, code in U.pending_actas(conn, ALL.index("PG2") + 1, retry))
    assert left(True) == left(U.MAX_ACTA_TRIES) == left(99) == [7001, 7002, 7003, 7004]
    assert left(False) == left(1) == left(0) == left(None) == [7001]
    assert left(2) == [7001, 7002] and left(3) == [7001, 7002, 7003]


def test_without_priority_groups_the_passes_are_as_before(health, actas_ok, monkeypatch, capsys):
    """Sin equipos prioritarios (FIFLP_PRIORITY_TEAMS vacía y sin grupo del portal), todos los grupos en el
    orden de la rotación, cada uno completo (calendario, goleadores y actas) y, al final, si sobra pasada,
    la página de competiciones. (El acta de PG2 ya se intentó en otra pasada: una nueva iría la primera,
    con las que otra pasada dejó a medias: test_actas_the_end_of_a_pass_leaves_are_caught_up_first_….)"""
    monkeypatch.setenv("FIFLP_PRIORITY_TEAMS", "")
    monkeypatch.delenv("FIFLP_ALEVIN_MIN", raising=False)
    monkeypatch.setattr(U, "pinned_groups", lambda: set())
    conn = with_actas(season(), {"PG2": 1})
    conn.execute("UPDATE matches SET acta_tries=1 WHERE fiflp_acta=7001")
    order = codes(plan(conn, priority=[]).order)
    data, fed = health(report({code: checked(6) for code in ALL}), conn, budget=600)
    s = steps(fed)
    expected = [x for code in order for x in ([code, f"{code} goleadores"] + (["acta 7001"] if code == "PG2" else []))]
    assert s == expected + ["competiciones"]
    assert data["run"]["extrasDeferred"] == [] and actas_left(conn, "PG2") == []
    log = capsys.readouterr().out
    assert "0 de equipos prioritarios primero (—)" in log and "calientes" not in log


def test_venues_and_team_cards_are_read_once_a_day_after_the_priority_groups(health):
    """El directorio de campos (si falta uno de la temporada) y las fichas de los equipos que no la tienen,
    con la página de competiciones, una vez al día (extras_turn) tras los prioritarios que tocan: si el
    segundo freno o el plazo cortan la pasada, se leen igual. Hasta el 16/10/2026 iban en la segunda pasada
    de cada pasada, que el freno casi nunca dejaba empezar. (En las demás pasadas, solo si sobra pasada.)"""
    conn = season()
    conn.execute("UPDATE matches SET venue='CAMPO NUEVO' WHERE group_id=8")                 # AL1
    for position, name in enumerate(["Arucas", "Tablero"], 1):                               # FF1, sin fichas
        conn.execute("INSERT INTO standings(group_id, team_id, position) SELECT 1, id, ? FROM teams WHERE name=?",
                     (position, name))
    conn.commit()
    number = next(n for n in range(100) if U.extras_turn(n))
    data, fed = health(report({code: checked(6) for code in ALL}), conn, budget=112, number=number)
    assert data["run"]["deferred"] and data["run"]["extras"] == ["campos", "competiciones", "directorio"]
    pages = [u.split("NPcd/")[1].split("?")[0] for u in fed.urls]
    scorers = [i for i, name in enumerate(pages) if name == "NFG_CMP_Goleadores"]
    first_other = [i for i, u in enumerate(fed.urls) if "NFG_CmpJornada" in u and "CodGrupo=" in u
                   and "CodJornada" not in u][3]
    assert "NFG_LstCampos" in pages and "NFG_LstDirectorioEquipos" in pages
    assert scorers[2] < pages.index("NFG_LstCampos") < pages.index("NFG_LstDirectorioEquipos") < first_other
    # En una pasada que no es la suya y que la federación corta (su segundo freno), no.
    other = next(n for n in range(100) if not U.extras_turn(n))
    data, fed = health(report({code: checked(6) for code in ALL}), conn, budget=600, number=other,
                       make_fed=lambda clock: BlockedFed(clock, serve=20))
    assert data["run"]["blocked"] and "NFG_LstCampos" not in " ".join(fed.urls) and "extras" not in data["run"]


def test_a_closed_group_is_refreshed_once_every_four_passes_and_the_rest_carry_their_check(health):
    """Todo cerrado: cada pasada lee solo los cerrados a los que les toca (closed_turn); los demás
    descansan con su última comprobación. En cada época de CLOSED_PASSES pasadas (12 con una cada 2 h,
    desde el 16/10/2026; antes 4 cada 6 h: 24 h), todos una vez, sin estado: igual si ninguna pasada sube
    data-health.json."""
    conn = season(played="2026-09-19")
    base = report({code: checked(24) for code in ALL})
    visited, period = [], U.CLOSED_PASSES
    for n in range(2 * period):
        data, fed = health(base, conn, budget=600, checks_now=NOW + timedelta(hours=2 * n), number=120 + n)
        visited.append(set(read_groups(fed)))
        assert visited[-1] == {c for c in ALL if U.closed_turn(c, 120 + n)}
        if not visited[-1]:                     # sin nada que leer, cada uno con su comprobación
            assert data["groups"] == base["groups"]
            continue
        assert sorted(data["run"]["resting"]) == sorted(set(ALL) - visited[-1])
        for code in set(ALL) - visited[-1]:
            assert data["groups"][code] == base["groups"][code]
    assert all(sum(code in v for v in visited) == 2 for code in ALL)     # en dos épocas, dos veces cada uno
    assert set().union(*visited[:period]) == set().union(*visited[period:]) == set(ALL)    # una vez en cada época


def test_a_pass_with_nothing_new_does_not_rewrite_the_report(health):
    """Sin nada nuevo, ni la hora de cada grupo ni las notas de la pasada reescriben data-health.json:
    no hay commit solo por la hora (la rotación no la necesita). (Salvo la de los prioritarios abiertos,
    que deciden cuándo les vuelve a tocar: aquí todo está cerrado.)"""
    conn = season(played="2026-09-19")
    number = next(n for n in range(100) if any(U.closed_turn(c, n) for c in ALL))
    first, _ = health(report({code: checked(24) for code in ALL}, at=NOW - timedelta(hours=1)), conn, budget=600,
                      number=number)
    data, fed = health(first, conn, budget=600, checks_now=NOW + timedelta(hours=6), number=number)
    assert data == first and read_groups(fed)                             # leyó, pero no cambió nada
