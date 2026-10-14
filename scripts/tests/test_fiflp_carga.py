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


class FakePage:
    """goto que falla `fails` veces; registra lo que espera."""
    def __init__(self, fails=0, ready=True):
        self.fails, self.ready, self.gotos, self.waits = fails, ready, [], []

    def goto(self, url, wait_until=None, timeout=None):
        self.gotos.append((url, wait_until))
        if self.fails:
            self.fails -= 1
            raise TimeoutError("503")

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


def test_the_bot_adapter_keeps_the_readers_and_counts_pages(monkeypatch):
    import fetch_fiflp_2425 as F
    monkeypatch.setattr(C, "pause", lambda extra=0: None)
    fed = C.Federacion(F, deadline=time.monotonic() + 60)
    assert fed.BASE == F.BASE
    assert fed.parse_standings is F.parse_standings and fed.parse_matches is F.parse_matches
    page = FakePage()
    assert fed.goto(page, GROUP)
    fed.delay()
    assert fed.pages == 1 and page.waits


# ── Con un navegador de verdad ────────────────────────────────────────────────

sync_api = pytest.importorskip("playwright.sync_api")

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


def test_the_page_is_flattened_only_after_the_federation_stylesheets(server):
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


def test_a_stylesheet_that_never_loads_only_costs_the_cap(server):
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
