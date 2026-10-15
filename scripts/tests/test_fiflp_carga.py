"""Cuándo está lista una página de la federación y cuánto espera el bot entre una y otra (fiflp_carga.py).

Hasta octubre de 2026 cada página costaba ~6,8 s en el bot (2,5 s fijos tras cargar y 2-3,5 s de
pausa): 33 grupos eran 19 min de primera pasada. Ahora la carga espera a lo que el lector necesita
(las hojas de estilo de la federación, de las que salen las cifras que lee el aplanado, y el
desplegable que rellena su JS), con tope, y la pausa es menor y configurable (FIFLP_DELAY).
Sin red: una página falsa o un servidor local con Chromium (si no está, esas pruebas se saltan).
"""
from datetime import datetime, timedelta, timezone
import http.server
import sys
import threading
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import fiflp_carga as C  # noqa: E402

BASE = "https://www.fiflp.com/pnfg/NPcd"
GROUP = f"{BASE}/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22&CodCompeticion=54976988&CodGrupo=55234218"


# ── La pausa entre peticiones ─────────────────────────────────────────────────

def test_the_delay_is_shorter_by_default_and_set_by_environment():
    assert C.delay_range({}) == (1.0, 1.5)
    assert C.delay_range({"FIFLP_DELAY": "2-3.5"}) == (2.0, 3.5)
    assert C.delay_range({"FIFLP_DELAY": "1.2"}) == (1.2, 1.2)
    assert C.delay_range({"FIFLP_DELAY": " 0,8 - 1,1 "}) == (0.8, 1.1)
    # Un valor que no se entiende, al revés o negativo no deja al bot sin pausa: el de siempre.
    for wrong in ("deprisa", "3-1", "-1", ""):
        assert C.delay_range({"FIFLP_DELAY": wrong}) == (1.0, 1.5), wrong


def test_the_ready_cap_is_set_by_environment_and_never_unbounded():
    assert C.ready_timeout_ms({}) == 5000
    assert C.ready_timeout_ms({"FIFLP_READY_MS": "3000"}) == 3000
    for wrong in ("0", "-5", "rápido", ""):                 # 0, para Playwright, es esperar sin tope
        assert C.ready_timeout_ms({"FIFLP_READY_MS": wrong}) == 5000, wrong


def test_pause_sleeps_a_jittered_time_within_the_range():
    slept = []
    C.pause(rng=lambda a, b: (a + b) / 2, sleep=slept.append, env={"FIFLP_DELAY": "1-2"})
    C.pause(extra=2, rng=lambda a, b: a, sleep=slept.append, env={})
    assert slept == [1.5, 3.0]


# ── Qué necesita cada página ──────────────────────────────────────────────────

def test_ready_selector_waits_for_the_dropdown_the_reader_uses():
    opt = ' option:not([value=""]):not([value="0"])'
    assert C.ready_selector(GROUP) == 'select[name="jornada"]' + opt
    assert C.ready_selector(GROUP + "&CodJornada=3") == 'select[name="jornada"]' + opt
    assert C.ready_selector(f"{BASE}/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22&CodCompeticion=1") == 'select[name="grupo"]' + opt
    assert C.ready_selector(f"{BASE}/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22") == 'select[name="competicion"]' + opt
    # El resto llega entero en el HTML: basta con sus hojas de estilo.
    for page in ("NFG_VisClasificacion?codjornada=99", "NFG_CmpPartido?CodActa=1", "NFG_CMP_Goleadores?x=1",
                 "NFG_LstCampos?NPcd_Page=1", "NFG_VisCampos?Codigo_Campo=75"):
        assert C.ready_selector(f"{BASE}/{page}") is None


class Response:
    def __init__(self, status):
        self.status = status


class FakePage:
    """goto que falla `fails` veces (o responde con los estados de `statuses`); registra lo que espera."""
    def __init__(self, fails=0, ready=True, statuses=(), empties=0):
        self.fails, self.ready, self.gotos, self.waits = fails, ready, [], []
        self.statuses = list(statuses)
        self.empties = empties          # cargas seguidas que la federación sirve vacías

    def evaluate(self, js, *a):
        if js == C.EMPTY_JS:
            empty = self.empties > 0
            self.empties -= empty
            return empty
        return None

    def goto(self, url, wait_until=None, timeout=None):
        self.gotos.append((url, wait_until))
        if self.fails:
            self.fails -= 1
            raise TimeoutError("503")
        return Response(self.statuses.pop(0)) if self.statuses else None

    def wait_for_function(self, js, arg=None, timeout=None, polling=None):
        self.waits.append((arg, timeout))
        if not self.ready:
            raise TimeoutError("sin desplegable")

    def wait_for_timeout(self, ms):
        raise AssertionError("nada de esperas fijas")


def test_goto_waits_for_the_page_state_not_a_fixed_time():
    page = FakePage()
    assert C.goto(page, GROUP, ready_ms=4000, log=lambda *_: None)
    assert page.gotos == [(GROUP, "domcontentloaded")]
    (selector, hosts), timeout = page.waits[0]
    assert selector.startswith('select[name="jornada"]') and timeout == 4000
    assert "fiflp.com" in hosts
    # Si lo que espera no llega a tiempo, la página vale igual: los lectores ya saben qué hacer.
    assert C.goto(FakePage(ready=False), GROUP, ready_ms=10, log=lambda *_: None)


def test_goto_retries_with_backoff_but_never_past_the_deadline():
    slept = []
    page = FakePage(fails=1)
    assert C.goto(page, GROUP, sleep=slept.append, log=lambda *_: None)
    assert slept == [15] and len(page.gotos) == 2
    # Sin plazo para la espera siguiente, se rinde: la página queda para la próxima pasada.
    slept.clear()
    page = FakePage(fails=5)
    assert not C.goto(page, GROUP, deadline=time.monotonic() + 10, sleep=slept.append, log=lambda *_: None)
    assert slept == [] and len(page.gotos) == 1
    # Tres intentos como mucho, y sin esperar después del último.
    slept.clear()
    page = FakePage(fails=5)
    assert not C.goto(page, GROUP, sleep=slept.append, log=lambda *_: None)
    assert slept == [15, 30] and len(page.gotos) == 3


def test_an_error_status_is_a_page_that_did_not_load():
    """page.goto no lanza con un 503 o un 429: la página de error de la federación (un bloqueo, una
    caída) no es una página cargada. Se reintenta con las mismas esperas y, si sigue, no carga: el
    acta no gasta un intento y el bot puede cortar la pasada."""
    slept, said = [], []
    page = FakePage(statuses=[503, 200])
    assert C.goto(page, GROUP, sleep=slept.append, log=said.append)
    assert slept == [15] and len(page.gotos) == 2 and "503" in said[0]
    for status in (503, 429, 500):
        slept.clear()
        page = FakePage(statuses=[status] * 3)
        assert not C.goto(page, GROUP, sleep=slept.append, log=lambda *_: None), status
        assert slept == [15, 30] and len(page.gotos) == 3 and page.waits == []
    # Lo demás es una página: un 404 (la lee el lector) o sin respuesta.
    for statuses in ([404], [200], []):
        assert C.goto(FakePage(statuses=statuses), GROUP, sleep=slept.append, log=lambda *_: None)


def test_an_empty_page_is_the_federation_braking_and_not_a_loaded_page():
    """14/10/2026 (ejecución 38581710573): tras unas 20 páginas seguidas a buen ritmo, la federación
    sirve un 200 con «<html><head></head><body></body></html>». El bot lo tomó por página cargada y
    63 de 69 grupos dieron «no sirvió las jornadas». Una página vacía no carga: se reintenta UNA vez,
    tras una espera larga (el freno dura), y si sigue vacía se deja para la próxima pasada."""
    slept, said = [], []
    page = FakePage(empties=1)
    assert C.goto(page, GROUP, sleep=slept.append, log=said.append)
    assert slept == [C.EMPTY_WAIT] and len(page.gotos) == 2 and "vacía" in said[0]
    slept.clear()
    page = FakePage(empties=5)
    assert not C.goto(page, GROUP, sleep=slept.append, log=lambda *_: None)
    assert slept == [C.EMPTY_WAIT] and len(page.gotos) == 2 and page.waits == []
    # Sin plazo para esa espera, se rinde sin esperar.
    slept.clear()
    page = FakePage(empties=5)
    assert not C.goto(page, GROUP, deadline=time.monotonic() + 10, sleep=slept.append, log=lambda *_: None)
    assert slept == [] and len(page.gotos) == 1


def test_the_bot_adapter_keeps_a_minimum_interval_between_requests():
    """El ritmo que la federación tolera: el de antes de octubre (~6,8 s por página, unas 9 por
    minuto), no el de las esperas recortadas (~5,2 s, 11-12 por minuto), que la hizo frenar."""
    import fetch_fiflp_2425 as F
    now, slept = [100.0], []
    clock = lambda: now[0]
    def sleep(s):
        slept.append(round(s, 2))
        now[0] += s
    fed = C.Federacion(F, interval=7.0, clock=clock, sleep=sleep)
    page = FakePage()
    fed.goto(page, GROUP)                 # la primera, sin esperar
    now[0] += 2.0                         # el lector y la pausa gastan 2 s
    fed.goto(page, GROUP)
    now[0] += 9.0                         # más que el intervalo: sin esperar
    fed.goto(page, GROUP)
    assert slept == [5.0] and fed.pages == 3


def test_the_minimum_interval_is_set_by_environment():
    assert C.min_interval({}) == C.DEFAULT_INTERVAL >= 6.5
    assert C.min_interval({"FIFLP_MIN_INTERVAL": "8,5"}) == 8.5
    for bad in ("", "x", "-1"):
        assert C.min_interval({"FIFLP_MIN_INTERVAL": bad}) == C.DEFAULT_INTERVAL


def test_the_bot_adapter_knows_when_the_federation_stops_serving(monkeypatch):
    """Federacion cuenta las páginas seguidas que no cargan (cada una tras sus reintentos): con
    BLOCKED_AFTER, blocked; una que carga lo deshace. Sin pausas largas (max_pauses=0, FIFLP_BRAKE_PAUSES=0:
    lo de antes del 15/10/2026); con ellas, test_a_streak_of_error_pages_pauses_before_blocking."""
    import fetch_fiflp_2425 as F
    monkeypatch.setattr(C, "goto", lambda page, url, **kw: page.statuses.pop(0) == 200)
    fed = C.Federacion(F, interval=0, max_pauses=0, log=lambda *_: None)
    page = FakePage(statuses=[503, 503, 200] + [503] * C.BLOCKED_AFTER)
    for _ in range(3):
        fed.goto(page, GROUP)
        assert not fed.blocked
    for n in range(C.BLOCKED_AFTER):
        fed.goto(page, GROUP)
    assert fed.blocked and fed.failures == C.BLOCKED_AFTER and fed.pages == 3 + C.BLOCKED_AFTER
    assert fed.served == 1 and fed.pauses == 0
    # Bloqueada, no se le pide nada más.
    assert not fed.goto(page, GROUP) and fed.pages == 3 + C.BLOCKED_AFTER


# ── El freno: la pausa larga y la misma página otra vez ──────────────────────

class Brake:
    """La federación frena entre `start` y `end` (en el reloj falso; end None: no se pasa) y sirve vacías
    sus páginas. Cada carga cuesta `cost` s. Apunta cuándo empezó cada petición y cuánto durmió el bot."""

    def __init__(self, start=0.0, end=None, cost=2.0, now=1000.0):
        self.start, self.end, self.cost, self.t = start, end, cost, now
        self.starts, self.slept, self.said = [], [], []

    def clock(self):
        return self.t

    def sleep(self, s):
        self.slept.append(round(s, 2))
        self.t += s

    def braking(self):
        return self.t >= self.start and (self.end is None or self.t < self.end)

    def page(self):
        brake = self

        class Page(FakePage):
            def goto(self, url, wait_until=None, timeout=None):
                brake.starts.append(brake.t)
                self.served_empty = brake.braking()
                brake.t += brake.cost
                return super().goto(url, wait_until, timeout)

            def evaluate(self, js, *a):
                return self.served_empty if js == C.EMPTY_JS else None
        return Page()

    def fed(self, **kw):
        import fetch_fiflp_2425 as F
        kw.setdefault("interval", 7.0)
        kw.setdefault("pause_seconds", 300)
        kw.setdefault("max_pauses", 3)
        return C.Federacion(F, clock=self.clock, sleep=self.sleep, log=self.said.append,
                            wall=lambda: datetime(2026, 10, 15, 3, 29, tzinfo=timezone.utc)
                            + timedelta(seconds=self.t - 1000), **kw)


def test_a_brake_that_passes_after_a_long_pause_resumes_the_same_page_and_slows_down():
    """La pasada 1103 (15/10/2026): la federación frena (página vacía, y otra tras la espera de 60 s) y,
    en vez de rendirse, el bot espera FIFLP_BRAKE_PAUSE_MIN (5) y vuelve a pedir LA MISMA página. Si
    carga, sigue, y más despacio (×1,5 el intervalo) el resto de la pasada."""
    b = Brake(start=1000.0, end=1000.0 + 4 * 60)           # frena 4 min desde la primera petición
    fed, page = b.fed(deadline=1000.0 + 25 * 60), b.page()
    assert fed.goto(page, GROUP)
    assert page.gotos == [(GROUP, "domcontentloaded")] * 3                 # la misma página, tres veces
    assert b.slept == [C.EMPTY_WAIT, 300]
    assert fed.pauses == 1 and fed.resumed == 1 and fed.paused == 300 and not fed.blocked
    assert fed.served == 1 and fed.unserved == 0 and fed.failures == 0 and fed.pages == 2
    assert "      la federación frena: pausa de 5 min (1/3), hasta las 03:35 UTC" in b.said
    assert "      la federación vuelve a servir: se sigue, una página cada 10.5 s" in b.said
    fed.goto(page, GROUP)
    fed.goto(page, GROUP)
    assert b.starts[-1] - b.starts[-2] == 10.5 and fed.interval == 10.5
    # Si vuelve a frenar y a servir, el doble del intervalo de partida, y no más.
    b.start, b.end = b.t, b.t + 3 * 60
    assert fed.goto(page, GROUP) and fed.interval == 14.0 and fed.resumed == 2
    b.start, b.end = b.t, b.t + 3 * 60
    assert fed.goto(page, GROUP) and fed.interval == 14.0 and fed.pauses == 3


def test_a_brake_that_does_not_pass_uses_up_the_pauses_and_blocks():
    """Si tras la pausa sigue vacía, otra, hasta FIFLP_BRAKE_PAUSES (3) por pasada; agotadas, blocked como
    antes, y no se le pide nada más. La página cuenta como no servida por el freno (unserved)."""
    b = Brake(start=1000.0)
    fed, page = b.fed(deadline=1000.0 + 25 * 60), b.page()
    assert not fed.goto(page, GROUP)
    assert b.slept == [C.EMPTY_WAIT, 300, 300, 300] and len(page.gotos) == 5
    assert fed.pauses == 3 and fed.resumed == 0 and fed.blocked and fed.halted
    assert fed.unserved == 1 and fed.served == 0
    assert [s for s in b.said if "frena" in s] == [
        "      página vacía (la federación frena) (1/3), se reintenta en 60 s",
        "      la federación frena: pausa de 5 min (1/3), hasta las 03:35 UTC",
        "      la federación sigue frenando",
        "      la federación frena: pausa de 5 min (2/3), hasta las 03:40 UTC",
        "      la federación sigue frenando",
        "      la federación frena: pausa de 5 min (3/3), hasta las 03:45 UTC",
        "      la federación sigue frenando",
        "      la federación sigue frenando tras 3 pausas: nada más en esta pasada"]
    assert not fed.goto(page, GROUP) and len(page.gotos) == 5               # nada más
    # Las pausas son por pasada: si ya se gastaron, el siguiente freno para la pasada sin esperar.
    b = Brake(start=1000.0, end=1000.0 + 4 * 60)
    fed, page = b.fed(deadline=1000.0 + 25 * 60, max_pauses=1), b.page()
    assert fed.goto(page, GROUP) and fed.pauses == 1
    b.start, b.end = b.t, None
    assert not fed.goto(page, GROUP) and fed.blocked and fed.pauses == 1 and b.slept[-1] == C.EMPTY_WAIT


def test_the_long_pause_is_only_taken_if_it_fits_before_the_deadline():
    """Tras la pausa tiene que quedar BRAKE_ROOM (2 min) antes del plazo global para leer algo: si no,
    blocked sin esperar. Ninguna página empieza pasado el plazo."""
    for room, paused in ((C.BRAKE_ROOM - 1, False), (C.BRAKE_ROOM + 1, True)):
        b = Brake(start=1000.0)
        # El freno se confirma a los 2 + 60 + 2 s: el plazo deja `room` tras una pausa de 5 min.
        fed, page = b.fed(deadline=1000.0 + 64 + 300 + room), b.page()
        assert not fed.goto(page, GROUP)
        assert fed.blocked and fed.pauses == int(paused), room
        assert b.slept == ([C.EMPTY_WAIT, 300] if paused else [C.EMPTY_WAIT]), room
        assert all(t <= fed.deadline for t in b.starts)
        if not paused:
            assert "      la federación frena y no queda plazo para una pausa de 5 min: nada más en esta pasada" in b.said
    # Pasado el plazo, ni se pide (y no cuenta como fallo de la federación).
    b = Brake(start=10 ** 9)
    fed, page = b.fed(deadline=1010.0), b.page()
    assert fed.goto(page, GROUP)
    b.t = 1010.5
    assert not fed.goto(page, GROUP) and len(page.gotos) == 1 and fed.failures == 0 and not fed.blocked


def test_a_streak_of_error_pages_pauses_before_blocking():
    """Lo que antes acababa en blocked (BLOCKED_AFTER páginas seguidas sin cargar: un 503 tras otro, el
    Apache de la federación cuando bloquea) también hace la pausa larga antes de rendirse, en la página
    que la dejaría bloqueada; si tras ella carga, sigue."""
    b = Brake(start=10 ** 9)
    fed = b.fed(deadline=1000.0 + 25 * 60)
    page = b.page()
    page.statuses = [503] * 3 * (C.BLOCKED_AFTER - 1) + [503] * 3 + [200]
    for n in range(C.BLOCKED_AFTER - 1):
        assert not fed.goto(page, GROUP) and fed.pauses == 0
    assert fed.goto(page, GROUP)
    assert fed.pauses == 1 and fed.resumed == 1 and fed.failures == 0 and not fed.blocked
    assert b.slept.count(300) == 1 and fed.unserved == 0


def test_a_streak_of_dead_pages_while_another_page_loads_is_not_the_brake():
    """Dos URLs muertas seguidas (un 500 tras otro, cada una tras sus reintentos) también son tres páginas
    seguidas sin cargar, y no son el freno (antes: tres pausas de 5 min, la pasada perdida y sus grupos sin
    error). Antes de la pausa larga, el bot vuelve a pedir la última página que cargó: si carga, la
    federación sirve; ni pausa ni bloqueo, la racha se deshace y esta página no carga (su grupo, un error).
    Si esa tampoco carga, sí es el freno (o una caída): la pausa, y tras ella lo mismo (si sirve otras y no
    esta, sin más pausas)."""
    b = Brake(start=10 ** 9)
    fed, page = b.fed(deadline=1000.0 + 25 * 60), b.page()
    good = GROUP + "&CodJornada=3"
    page.statuses = [200] + [500] * 3 * C.BLOCKED_AFTER + [200]
    assert fed.goto(page, good)
    for n in range(C.BLOCKED_AFTER):
        assert not fed.goto(page, GROUP)
    assert [u for u, _ in page.gotos] == [good] + [GROUP] * 3 * C.BLOCKED_AFTER + [good]
    assert fed.pauses == 0 and fed.brakes == 0 and fed.brake_marks == [] and not fed.blocked
    assert fed.failures == 1 and fed.served == 2 and fed.unserved == 0 and 300 not in b.slept
    assert "      3 páginas seguidas sin cargar, pero la federación sirve otra: no es el freno, es esta página" in b.said
    page.statuses = [200]
    assert fed.goto(page, good) and fed.failures == 0
    # La otra tampoco carga: el freno (o una caída), la pausa; tras ella sirve otras y no esta: se sigue.
    b = Brake(start=10 ** 9)
    fed, page = b.fed(deadline=1000.0 + 25 * 60), b.page()
    page.statuses = [200] + [500] * 3 * C.BLOCKED_AFTER + [500] + [500, 200]
    assert fed.goto(page, good)
    for n in range(C.BLOCKED_AFTER):
        assert not fed.goto(page, GROUP)
    assert [u for u, _ in page.gotos][-4:] == [GROUP, good, GROUP, good]
    assert fed.pauses == 1 and fed.resumed == 1 and fed.brakes == 1 and fed.brake_marks == [1]
    assert not fed.blocked and fed.failures == 1 and fed.unserved == 0 and fed.interval == 10.5
    assert "      la federación vuelve a servir, pero no esta página: se sigue, una página cada 10.5 s" in b.said


def test_with_no_page_loaded_yet_the_season_catalog_tells_dead_pages_from_the_brake():
    """Las dos URLs muertas, las primeras de la pasada: aún no ha cargado ninguna página que volver a pedir.
    El bot prueba la de competiciones de la temporada (CATALOG_URL, que existe siempre): si carga, no es el
    freno (antes: «como el freno», tres pausas de 5 min y sus grupos sin error, en cada pasada)."""
    b = Brake(start=10 ** 9)
    fed, page = b.fed(deadline=1000.0 + 25 * 60), b.page()
    catalog = BASE + "/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22"
    page.statuses = [500] * 3 * C.BLOCKED_AFTER + [200]
    for n in range(C.BLOCKED_AFTER):
        assert not fed.goto(page, GROUP)
    assert [u for u, _ in page.gotos] == [GROUP] * 3 * C.BLOCKED_AFTER + [catalog]
    assert fed.pauses == 0 and fed.brakes == 0 and not fed.blocked and fed.failures == 1
    # Si esa tampoco carga, el freno (o una caída): la pausa.
    b = Brake(start=10 ** 9)
    fed, page = b.fed(deadline=1000.0 + 25 * 60), b.page()
    page.statuses = [500] * 3 * C.BLOCKED_AFTER + [500, 200]
    for n in range(C.BLOCKED_AFTER - 1):
        assert not fed.goto(page, GROUP)
    assert fed.goto(page, GROUP)
    assert [u for u, _ in page.gotos][-2:] == [catalog, GROUP] and fed.pauses == 1 and fed.brakes == 1


def test_a_503_or_a_429_is_a_brake_signal_without_asking_another_page():
    """Un 503 o un 429 es la federación que no sirve («no disponible», «demasiadas peticiones»), no la página:
    señal del freno (`brakes`) en cada página que lo recibe, cargue o no tras sus reintentos, y la racha
    que forman hace la pausa sin probar otra página (su respuesta no distingue nada: el freno puede
    pasarse justo entonces). Un 500 no lo es: puede ser la URL."""
    b = Brake(start=10 ** 9)
    fed, page = b.fed(deadline=1000.0 + 25 * 60), b.page()
    good = GROUP + "&CodJornada=3"
    page.statuses = [200, 503, 200, 429, 429, 429, 500, 500, 500]
    assert fed.goto(page, good) and fed.goto(page, GROUP)
    assert fed.brakes == 1 and fed.brake_marks == [1] and fed.pauses == 0
    assert not fed.goto(page, GROUP) and fed.brakes == 2 and fed.brake_marks == [1, 2]
    assert not fed.goto(page, GROUP) and fed.brakes == 2 and fed.failures == 2
    b = Brake(start=10 ** 9)
    fed, page = b.fed(deadline=1000.0 + 25 * 60), b.page()
    page.statuses = [200] + [503] * 3 * C.BLOCKED_AFTER + [200]
    assert fed.goto(page, good)
    for n in range(C.BLOCKED_AFTER - 1):
        assert not fed.goto(page, GROUP)
    assert fed.goto(page, GROUP)
    assert [u for u, _ in page.gotos] == [good] + [GROUP] * (3 * C.BLOCKED_AFTER + 1)       # sin probar otra
    assert fed.pauses == 1 and fed.resumed == 1 and fed.brakes == C.BLOCKED_AFTER


def test_no_page_starts_past_the_deadline_after_its_interval():
    """El plazo se mira cuando la página EMPEZARÍA, tras la espera del intervalo: con el plazo dentro de esa
    espera, no se pide, y no cuenta como fallo de la federación. Antes se miraba antes de esperar, y una
    página podía empezar hasta un intervalo (7 s, 14 tras frenar) pasado el plazo. La espera sí se hace: el
    bot ve el plazo agotado (clock() > deadline) y deja el resto para otra pasada."""
    b = Brake(start=10 ** 9)
    fed, page = b.fed(deadline=1005.0), b.page()
    assert fed.goto(page, GROUP)          # a las 1000; la página, 2 s
    b.t += 1                              # el lector y la pausa
    assert not fed.goto(page, GROUP)      # empezaría a las 1007
    assert b.starts == [1000.0] and fed.pages == 1 and fed.failures == 0 and not fed.blocked
    assert b.t > fed.deadline and fed.brakes == 0


def test_an_empty_page_is_a_brake_signal_even_if_it_loads_after_its_wait():
    """Cada página vacía es una señal del freno (`brakes`, y en `brake_marks` las páginas servidas hasta
    entonces), también si carga tras su espera de 60 s: el bot (run_passes) no da por error un grupo cuya
    lectura la tuvo."""
    b = Brake(start=1000.0, end=1030.0)
    fed, page = b.fed(deadline=1000.0 + 25 * 60), b.page()
    assert fed.goto(page, GROUP)
    assert b.slept == [C.EMPTY_WAIT] and fed.pauses == 0 and fed.brakes == 1 and fed.brake_marks == [0]
    assert fed.served == 1 and fed.unserved == 0


class TargetClosedError(Exception):
    """La de Playwright cuando la página o el navegador ya se cerraron (Chromium caído)."""


class ClosedPage(FakePage):
    """Una página que se cierra (el navegador cae) tras `serves` cargas."""
    def __init__(self, serves=0, **kw):
        super().__init__(**kw)
        self.serves = serves

    def is_closed(self):
        return len(self.gotos) >= self.serves

    def goto(self, url, wait_until=None, timeout=None):
        if self.is_closed():
            self.gotos.append((url, wait_until))
            raise TargetClosedError("Target page, context or browser has been closed")
        return super().goto(url, wait_until, timeout)


def test_a_closed_browser_is_not_the_federation_braking():
    """Si Chromium cae (la página o el navegador cerrados), no es la federación: ni reintentos ni pausas
    largas, y nada más en esta pasada (`closed`, `blocked`). Antes: tres páginas «no carga» con sus esperas,
    tres pausas de 5 min («la federación frena») y sus grupos sin error, como un freno."""
    b = Brake(start=10 ** 9)
    fed = b.fed(deadline=1000.0 + 25 * 60)
    page = ClosedPage(serves=2)
    good = GROUP + "&CodJornada=3"
    assert fed.goto(page, good) and fed.goto(page, GROUP)
    assert not fed.goto(page, GROUP + "&CodJornada=4")
    assert fed.closed and fed.blocked and fed.pauses == 0 and fed.brakes == 0 and fed.unserved == 0
    assert len(page.gotos) == 3 and 15 not in b.slept and 300 not in b.slept
    assert "      el navegador se ha cerrado: nada más en esta pasada" in b.said
    assert not any("frena" in s for s in b.said)
    assert not fed.goto(page, GROUP) and len(page.gotos) == 3                # nada más
    # También si se cierra al probar otra página (tras una racha de 500): sin pausa ni señal del freno.
    b = Brake(start=10 ** 9)
    fed = b.fed(deadline=1000.0 + 25 * 60)
    page = ClosedPage(serves=1 + 3 * C.BLOCKED_AFTER, statuses=[200] + [500] * 3 * C.BLOCKED_AFTER)
    assert fed.goto(page, good)
    for n in range(C.BLOCKED_AFTER):
        assert not fed.goto(page, GROUP)
    assert [u for u, _ in page.gotos][-1] == good and fed.closed and fed.pauses == 0 and fed.brakes == 0
    # goto, sin Federacion: tampoco reintenta (el motivo, CLOSED).
    why, slept = [], []
    assert not C.goto(ClosedPage(), GROUP, sleep=slept.append, log=lambda *_: None, why=why)
    assert why == [C.CLOSED] and slept == []


def test_the_long_pause_is_set_by_environment():
    assert C.brake_pause_seconds({}) == C.BRAKE_PAUSE == 300
    assert C.brake_pause_seconds({"FIFLP_BRAKE_PAUSE_MIN": "7,5"}) == 450
    for bad in ("", "x", "-1", "0"):
        assert C.brake_pause_seconds({"FIFLP_BRAKE_PAUSE_MIN": bad}) == 300, bad
    assert C.brake_pauses({}) == C.BRAKE_PAUSES == 3
    assert C.brake_pauses({"FIFLP_BRAKE_PAUSES": "0"}) == 0          # ninguna: como antes
    assert C.brake_pauses({"FIFLP_BRAKE_PAUSES": "5"}) == 5
    for bad in ("x", "-1", "1.5"):
        assert C.brake_pauses({"FIFLP_BRAKE_PAUSES": bad}) == 3, bad
    # Sin pausas: una página vacía tras su espera para la pasada, sin esperar más.
    b = Brake(start=1000.0)
    fed, page = b.fed(deadline=1000.0 + 25 * 60, max_pauses=0), b.page()
    assert not fed.goto(page, GROUP) and fed.blocked and b.slept == [C.EMPTY_WAIT]


def test_the_bot_adapter_keeps_the_readers_and_counts_pages(monkeypatch):
    import fetch_fiflp_2425 as F
    monkeypatch.setattr(C, "pause", lambda extra=0: None)
    fed = C.Federacion(F, deadline=time.monotonic() + 60, interval=0)
    assert fed.BASE == F.BASE
    assert fed.parse_standings is F.parse_standings and fed.parse_matches is F.parse_matches
    page = FakePage()
    assert fed.goto(page, GROUP)
    fed.delay()
    assert fed.pages == 1 and page.waits


# ── Con un navegador de verdad ────────────────────────────────────────────────

@pytest.fixture
def sync_api():
    """Playwright, si está (update.yml lo instala; tests.yml no): sin él solo se saltan estas pruebas,
    no las de arriba."""
    return pytest.importorskip("playwright.sync_api")


PAGE = """<!doctype html><html><head>
<link rel="stylesheet" href="/digits.css">
<link rel="stylesheet" href="http://localhost:{port}/never.css">
</head><body><p id="score"><i class="fa-7"></i> - <i class="fa-2"></i></p></body></html>"""
DIGITS = "".join(f'.fa-{d}::before{{content:"{d}"}}' for d in range(10))


@pytest.fixture
def server():
    """La hoja de las cifras tarda 1,2 s (como files.fiflp.com en un mal momento); otra, de un host
    que no es de la federación, no llega nunca (la publicidad bloqueada)."""
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/digits.css":
                time.sleep(1.2)
                body, kind = DIGITS, "text/css"
            elif self.path == "/never.css":
                time.sleep(8)
                body, kind = "", "text/css"
            else:
                body, kind = PAGE.format(port=self.server.server_address[1]), "text/html"
            data = body.encode()
            self.send_response(200)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            try:
                self.wfile.write(data)
            except OSError:
                pass

        def log_message(self, *a):
            pass

    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}/acta"
    httpd.shutdown()


def _browser_page(p):
    try:
        browser = p.chromium.launch(headless=True)
    except Exception as e:                      # sin Chromium instalado
        pytest.skip(f"sin navegador: {e}")
    return browser, browser.new_page()


def test_the_page_is_flattened_only_after_the_federation_stylesheets(sync_api, server):
    from fiflp_render import flatten
    with sync_api.sync_playwright() as p:
        browser, page = _browser_page(p)
        try:
            start = time.monotonic()
            assert C.goto(page, server, ready_ms=5000, hosts=("127.0.0.1",), log=lambda *_: None)
            took = time.monotonic() - start
            flatten(page)
            score = page.inner_text("#score")
        finally:
            browser.close()
    # Las cifras salen de la hoja que tardaba; la que no es de la federación no se espera.
    assert score.replace(" ", "") == "7-2"
    assert 1.0 < took < 5.0


def test_the_exact_braking_page_in_a_real_browser_is_empty(sync_api):
    """La respuesta del freno, tal cual la guardó la sonda (probe-fiflp, 14/10/2026): 39 bytes."""
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            body = b"<html><head></head><body></body></html>" if self.path == "/vacia" else b"<html><body><p>x</p></body></html>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"
    try:
        with sync_api.sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(base + "/vacia")
            assert C._empty(page)
            page.goto(base + "/llena")
            assert not C._empty(page)
            browser.close()
    finally:
        httpd.shutdown()


def test_a_503_in_a_real_browser_is_not_a_loaded_page(sync_api):
    """Chromium no da error con un 503 de Apache (el bloqueo de la federación): se ve en el estado."""
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            body = b"<html><head><title>503 Service Unavailable</title></head><body></body></html>"
            self.send_response(503)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    slept = []
    try:
        with sync_api.sync_playwright() as p:
            browser, page = _browser_page(p)
            try:
                loaded = C.goto(page, f"http://127.0.0.1:{httpd.server_address[1]}/NFG_CmpPartido?CodActa=1",
                                ready_ms=500, sleep=slept.append, log=lambda *_: None)
            finally:
                browser.close()
    finally:
        httpd.shutdown()
    assert not loaded and slept == [15, 30]


def test_a_closed_page_in_a_real_browser_is_not_a_page_that_does_not_load(sync_api):
    """Con Chromium de verdad: tras page.close(), goto lo ve (TargetClosedError, page.is_closed()) y no
    reintenta: no es la federación."""
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            body = b"<html><body><p>x</p></body></html>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{httpd.server_address[1]}/NFG_CmpPartido?CodActa=1"
    why, slept = [], []
    try:
        with sync_api.sync_playwright() as p:
            browser, page = _browser_page(p)
            try:
                assert C.goto(page, url, ready_ms=500, sleep=slept.append, log=lambda *_: None)
                page.close()
                loaded = C.goto(page, url, ready_ms=500, sleep=slept.append, log=lambda *_: None, why=why)
            finally:
                browser.close()
    finally:
        httpd.shutdown()
    assert not loaded and why == [C.CLOSED] and slept == []


def test_a_stylesheet_that_never_loads_only_costs_the_cap(sync_api, server):
    with sync_api.sync_playwright() as p:
        browser, page = _browser_page(p)
        try:
            start = time.monotonic()
            # Ahora la hoja lenta «es» de la federación y no llega a tiempo: se sigue con el tope.
            assert C.goto(page, server, ready_ms=400, hosts=("127.0.0.1", "localhost"), log=lambda *_: None)
            took = time.monotonic() - start
        finally:
            browser.close()
    assert took < 3.0
