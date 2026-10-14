"""Cuándo está lista una página de la federación y cuánto espera el bot entre una y otra (fiflp_carga.py).

Hasta octubre de 2026 cada página costaba ~6,8 s en el bot (2,5 s fijos tras cargar y 2-3,5 s de
pausa): 33 grupos eran 19 min de primera pasada. Ahora la carga espera a lo que el lector necesita
(las hojas de estilo de la federación, de las que salen las cifras que lee el aplanado, y el
desplegable que rellena su JS), con tope, y la pausa es menor y configurable (FIFLP_DELAY).
Sin red: una página falsa o un servidor local con Chromium (si no está, esas pruebas se saltan).
"""
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
    BLOCKED_AFTER, blocked; una que carga lo deshace."""
    import fetch_fiflp_2425 as F
    monkeypatch.setattr(C, "goto", lambda page, url, deadline=None: page.statuses.pop(0) == 200)
    fed = C.Federacion(F, interval=0)
    page = FakePage(statuses=[503, 503, 200] + [503] * C.BLOCKED_AFTER)
    for _ in range(3):
        fed.goto(page, GROUP)
        assert not fed.blocked
    for n in range(C.BLOCKED_AFTER):
        fed.goto(page, GROUP)
    assert fed.blocked and fed.failures == C.BLOCKED_AFTER and fed.pages == 3 + C.BLOCKED_AFTER


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
