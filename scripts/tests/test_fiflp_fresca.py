"""Lo que se repite, a la red (fiflp_render.goto y fresh, 15/10/2026).

La federación da sus documentos (NFG_*) con «Cache-Control: private, max-age=300»: con la caché HTTP
(fiflp_launch_args, sin ruta), la misma URL otra vez antes de 5 min sale de la caché de disco sin pedirle
nada. Y las URLs que se repiten son las del freno: los reintentos de fiflp_carga.goto (tras
un 503, un corte), la otra página de Federacion._serving, los sondeos de la espera del freno, la recarga
del calendario y la clasificación otra vez de update_fiflp.scrape_group, y los reintentos de las tandas.
fiflp_render.goto las pide frescas (fresh: el documento a la red, por CDP), exactamente las repeticiones y
no la primera vez de cada URL (con la caché, que sirve los scripts y las hojas).

Sin red ni navegador: páginas falsas con una sesión CDP falsa, que apuntan en cada carga si iba fresca
(Fetch habilitado). Con el Chromium de verdad y un servidor en 127.0.0.1: test_fiflp_lanzamiento.
"""
from datetime import date, datetime, timezone
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import fiflp_carga as C  # noqa: E402
import fiflp_render as R  # noqa: E402

BASE = "https://www.fiflp.com/pnfg/NPcd"
TODAY = date(2026, 10, 15)


def group(n):
    return f"{BASE}/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22&CodCompeticion=900&CodGrupo={n}"


class CDP:
    """Una sesión CDP falsa: apunta lo que se le manda y si Fetch está habilitado."""

    def __init__(self, fail=()):
        self.sent, self.handlers, self.fetch, self.fail = [], {}, False, set(fail)

    def on(self, event, handler):
        self.handlers[event] = handler

    def send(self, method, params=None):
        self.sent.append((method, params))
        if method in self.fail:
            raise RuntimeError(f"{method}: falla")
        if method == "Fetch.enable":
            self.fetch = True
        elif method == "Fetch.disable":
            self.fetch = False
        return {}


class Context:
    """El contexto del navegador (la caché HTTP es por contexto): abre las sesiones CDP."""

    def __init__(self, fail=()):
        self.sessions, self.fail = [], fail

    def new_cdp_session(self, page):
        self.sessions.append(CDP(self.fail))
        return self.sessions[-1]


class Response:
    def __init__(self, status):
        self.status = status


class Page:
    """Una página falsa de Chromium: cada carga apunta (url, ¿fresca?) y hace lo que diga
    `outcome(url, n)` (n: la vez que se pide esa URL): "ok", "empty" (la página vacía del freno), un estado
    HTTP (503, 500) o una excepción, que lanza. `options(url, n)`: el desplegable de jornadas."""

    def __init__(self, outcome=None, options=None, context=None):
        self.context = context or Context()
        self.loads, self.url, self.empty = [], "", False
        self.outcome = outcome or (lambda url, n: "ok")
        self.options = options or (lambda url, n: [])
        self.frames, self.main_frame = [], None

    @property
    def fetch(self):
        return any(session.fetch for session in self.context.sessions)

    def times(self, url):
        return sum(u == url for u, _ in self.loads)

    def fresh_loads(self, url):
        """¿Fresca? cada vez que se pidió `url`, en orden."""
        return [fresh for u, fresh in self.loads if u == url]

    def goto(self, url, wait_until=None, timeout=None):
        self.loads.append((url, self.fetch))
        self.url = url
        outcome = self.outcome(url, self.times(url))
        if isinstance(outcome, Exception):
            raise outcome
        self.empty = outcome == "empty"
        return Response(outcome if isinstance(outcome, int) else 200)

    def evaluate(self, js, *a):
        if js == C.EMPTY_JS:
            return self.empty
        if 'select[name="jornada"]' in js:
            return self.options(self.url, self.times(self.url))
        return 0

    def wait_for_function(self, js, arg=None, timeout=None, polling=None):
        pass

    def wait_for_timeout(self, ms):
        pass

    def content(self):
        return "<html><body>acta</body></html>" + " " * 300


# ── fiflp_render ──────────────────────────────────────────────────────────────

def test_goto_is_fresh_exactly_on_the_repeats():
    page = Page()
    a, b = group(1), group(2)
    for url in (a, b, a, a, b):
        assert R.goto(page, url, wait_until="domcontentloaded").status == 200
    # La primera vez de cada URL, como siempre (la caché sirve los scripts y las hojas); cada vez
    # siguiente, fresca. Fetch solo mientras dura la carga.
    assert page.loads == [(a, False), (b, False), (a, True), (a, True), (b, True)]
    assert not page.fetch and R.requested(page) == {a, b}
    # Una sesión CDP para toda la página (no una por carga), y Fetch solo para los documentos.
    [cdp] = page.context.sessions
    assert [m for m, _ in cdp.sent] == ["Fetch.enable", "Fetch.disable"] * 3
    assert cdp.sent[0][1] == {"patterns": [{"urlPattern": "*", "resourceType": "Document", "requestStage": "Request"}]}


def test_the_memory_is_the_browser_context_and_both_module_names_share_it():
    """La caché HTTP es del contexto: otra página del mismo contexto también la pide fresca; una de otro
    contexto, no. Y fiflp_render y scripts.fiflp_render (fetch_fiflp_actas lo importa así) recuerdan lo
    mismo: lo guardan la página y su contexto, no el módulo."""
    from scripts import fiflp_render as other
    assert other is not R
    first = Page()
    R.goto(first, group(1))
    second = Page(context=first.context)
    other.goto(second, group(1))
    elsewhere = Page()
    R.goto(elsewhere, group(1))
    assert first.loads == [(group(1), False)]
    assert second.loads == [(group(1), True)]
    assert elsewhere.loads == [(group(1), False)]
    # Una sesión CDP por página (la de second y la de first, que es la misma en sus dos cargas frescas).
    other.goto(first, group(1))
    assert first.loads[-1] == (group(1), True) and len(first.context.sessions) == 2


def test_without_cdp_it_is_the_plain_goto():
    """Otro navegador o una página de prueba sin contexto: goto es page.goto, y fresh no hace nada."""
    class Plain:
        def __init__(self):
            self.urls = []

        def goto(self, url, **kwargs):
            self.urls.append((url, kwargs))
            return "respuesta"

    page = Plain()
    assert R.goto(page, group(1), timeout=5) == "respuesta"
    assert R.goto(page, group(1)) == "respuesta"
    assert page.urls == [(group(1), {"timeout": 5}), (group(1), {})]
    with R.fresh(page) as on:
        assert on is False

    class Slotted:                        # sin __dict__: ni memoria ni sesión, y no rompe
        __slots__ = ("urls",)

        def __init__(self):
            self.urls = []

        def goto(self, url, **kwargs):
            self.urls.append(url)

    page = Slotted()
    R.goto(page, group(1))
    R.goto(page, group(1))
    assert page.urls == [group(1)] * 2 and R.requested(page) is None

    # Un contexto sin CDP (Firefox: «CDP session is only available in Chromium»): ni lo intenta otra vez.
    class NoCDP:
        calls, sessions = 0, []

        def new_cdp_session(self, page):
            NoCDP.calls += 1
            raise RuntimeError("CDP session is only available in Chromium")

    page = Page(context=NoCDP())
    for _ in range(3):
        R.goto(page, group(1))
    assert page.loads == [(group(1), False)] * 3 and NoCDP.calls == 1


def test_fresh_ends_even_if_the_navigation_throws_and_nests():
    page = Page(outcome=lambda url, n: TimeoutError("30 s"))
    with pytest.raises(TimeoutError):
        with R.fresh(page) as on:
            assert on and page.fetch
            page.goto(group(1))
    assert not page.fetch
    # Anidada (un lector que envuelve una carga que ya es fresca): Fetch se quita al salir de la de fuera.
    page = Page()
    with R.fresh(page):
        with R.fresh(page):
            page.goto(group(1))
        assert page.fetch
        page.goto(group(2))
    assert page.loads == [(group(1), True), (group(2), True)] and not page.fetch
    assert [m for m, _ in page.context.sessions[0].sent] == ["Fetch.enable", "Fetch.disable"]


def test_if_fetch_cannot_be_enabled_the_page_still_loads():
    """Si no se puede habilitar Fetch (la página se está cerrando), la carga va como siempre: lo que
    tenga que decir el navegador (cerrado) lo dice la navegación, y fiflp_carga lo atiende."""
    page = Page(context=Context(fail={"Fetch.enable"}))
    R.goto(page, group(1))
    R.goto(page, group(1))
    assert page.loads == [(group(1), False)] * 2
    assert [m for m, _ in page.context.sessions[0].sent] == ["Fetch.enable"]


def test_each_paused_document_goes_on_with_no_cache_headers():
    page = Page()
    with R.fresh(page):
        pass
    cdp = page.context.sessions[0]
    paused = cdp.handlers["Fetch.requestPaused"]
    cdp.sent.clear()
    paused({"requestId": "7", "request": {"url": group(1), "headers": {
        "Accept": "text/html", "cache-control": "max-age=0", "Cookie": "s=1", "X-Dos": "uno\ndos"}}})
    [(method, params)] = cdp.sent
    assert method == "Fetch.continueRequest" and params["requestId"] == "7"
    assert params["headers"] == [{"name": "Accept", "value": "text/html"}, {"name": "Cookie", "value": "s=1"},
                                 {"name": "X-Dos", "value": "uno"}, {"name": "X-Dos", "value": "dos"},
                                 {"name": "Cache-Control", "value": "no-cache"}, {"name": "Pragma", "value": "no-cache"}]
    # Si seguir con esas cabeceras falla, sigue tal cual: un documento nunca se queda parado.
    calls = []

    def send(method, params=None):
        calls.append(params)
        if "headers" in params:
            raise RuntimeError("Invalid header")
    cdp.send = send
    paused({"requestId": "8", "request": {"headers": {}}})
    assert calls[-1] == {"requestId": "8"} and len(calls) == 2
    # Y si la petición ya no está (otra navegación la sustituye), nada.
    cdp.send = lambda method, params=None: (_ for _ in ()).throw(RuntimeError("Invalid InterceptionId"))
    paused({"requestId": "9", "request": {"headers": {}}})


# ── fiflp_carga.goto ──────────────────────────────────────────────────────────

def _carga(page, url, **kw):
    slept = []
    loaded = C.goto(page, url, ready_ms=10, sleep=slept.append, log=lambda *_: None, **kw)
    return loaded, slept


def test_carga_retries_are_fresh_and_the_first_attempt_is_not():
    # Un corte, un 503 y, al tercer intento, la página.
    outcomes = {1: TimeoutError("no carga"), 2: 503}
    page = Page(outcome=lambda url, n: outcomes.get(n, "ok"))
    assert _carga(page, group(1)) == (True, [15, 30])
    assert page.fresh_loads(group(1)) == [False, True, True]
    # La página vacía del freno no se reintenta (15/10/2026): la espera y sus sondeos son de Federacion
    # (test_federacion_asks_the_brake_probes_fresh). Antes, un reintento tras EMPTY_WAIT, fresco.
    page = Page(outcome=lambda url, n: "empty" if n == 1 else "ok")
    assert _carga(page, group(2)) == (False, [])
    assert page.fresh_loads(group(2)) == [False]
    # A la primera: ni fresca ni CDP.
    page = Page()
    assert _carga(page, group(3)) == (True, [])
    assert page.loads == [(group(3), False)] and page.context.sessions == []
    # Una URL que el navegador ya pidió, fresca desde el primer intento.
    assert _carga(page, group(3)) == (True, [])
    assert page.fresh_loads(group(3)) == [False, True]


# ── Federacion ────────────────────────────────────────────────────────────────

class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


class Reader:
    BASE = BASE

    @staticmethod
    def parse_standings(page):
        return [{"team": "uno"}] if page.url.endswith("codjornada=99") else []

    @staticmethod
    def parse_matches(page):
        return []


def federacion(monkeypatch, max_pauses=None):
    clock = Clock()

    def sleep(s):
        clock.t += s
    monkeypatch.setattr(C, "pause", lambda extra=0: None)
    return C.Federacion(Reader, deadline=clock() + 3600, interval=7.0, clock=clock, sleep=sleep,
                        pause_seconds=240, probe_seconds=60, cap_seconds=600, max_pauses=max_pauses,
                        wall=lambda: datetime(2026, 10, 15, tzinfo=timezone.utc), log=lambda *_: None)


def test_federacion_asks_fresh_only_what_it_already_asked(monkeypatch):
    """_serving vuelve a pedir la última página que cargó: fresca (si no, saldría de la caché y diría que
    la federación sirve aunque frene). Las URLs muertas, frescas desde su 2.º intento."""
    good, dead = group(1), [group(n) for n in (7, 8, 9)]
    page = Page(outcome=lambda url, n: 500 if url in dead else "ok")
    F = federacion(monkeypatch)
    assert F.goto(page, good)
    for url in dead:
        assert not F.goto(page, url)
    # Tres seguidas sin cargar y sin señal del freno: ¿sirve otra? La última que cargó, fresca, y sí.
    assert page.fresh_loads(good) == [False, True]
    assert all(page.fresh_loads(url) == [False, True, True] for url in dead)
    assert not F.blocked and F.brakes == 0
    # Una URL nueva, a la primera, como siempre.
    assert F.goto(page, group(2)) and page.fresh_loads(group(2)) == [False]


def test_federacion_checks_the_catalog_normally_the_first_time(monkeypatch):
    """Sin ninguna página cargada, la otra es la de competiciones: la primera vez, normal; si el bot ya la
    había pedido (check_competitions), fresca."""
    catalog = BASE + C.CATALOG_URL.format(season=22)
    dead = [group(n) for n in (7, 8, 9)]
    page = Page(outcome=lambda url, n: 500 if url in dead else "ok")
    F = federacion(monkeypatch)
    for url in dead:
        F.goto(page, url)
    assert page.fresh_loads(catalog) == [False]
    assert F.goto(page, catalog) and page.fresh_loads(catalog) == [False, True]


def test_federacion_asks_the_brake_probes_fresh(monkeypatch):
    """Los sondeos del freno (la misma página a los 4 min y cada minuto después: dentro del max-age de 5 min
    de la vacía): frescos, no la vacía guardada."""
    url = group(4)
    page = Page(outcome=lambda u, n: "empty" if u == url and n <= 2 else "ok")
    F = federacion(monkeypatch)
    assert F.goto(page, group(1))
    assert F.goto(page, url)
    assert F.pauses == 1 and F.resumed == 1
    assert page.fresh_loads(url) == [False, True, True]


# ── update_fiflp.scrape_group ─────────────────────────────────────────────────

@pytest.fixture
def U(monkeypatch):
    import update_fiflp
    monkeypatch.setattr(update_fiflp, "flatten", lambda page, selector=None: 0)
    return update_fiflp


OPTIONS = [{"value": "1", "text": "1 - 10-10-2026"}]
STORED = {"Jornada 1": ("2026-10-10", False)}


def test_the_calendar_reload_is_fresh(monkeypatch, U):
    """Si el desplegable de jornadas no llega tras sus dos esperas, el calendario se recarga: fresco (la
    copia guardada traería el mismo desplegable vacío sin preguntarle a la federación)."""
    calendar = group(5)
    page = Page(options=lambda url, n: OPTIONS if url == calendar and n >= 2 else [])
    F = federacion(monkeypatch)
    standings, rounds = U.scrape_group(page, F, calendar, STORED, TODAY)
    assert list(rounds) == ["Jornada 1"]
    assert page.fresh_loads(calendar) == [False, True]
    assert page.fresh_loads(calendar + "&CodJornada=1") == [False]
    standings_url = [u for u, _ in page.loads if "NFG_VisClasificacion" in u]
    assert len(standings_url) == 1 and page.fresh_loads(standings_url[0]) == [False]


def test_the_standings_lost_in_the_brake_are_asked_fresh(monkeypatch, U):
    """La clasificación que no cargó (aquí, un 500 en sus tres intentos) se pide otra vez si la federación
    frenó después en el grupo y volvió a servir: fresca, como sus reintentos."""
    calendar = group(6)
    standings_url = f"{BASE}/NFG_VisClasificacion?cod_primaria=1000120&CodTemporada=22&codcompeticion=900&codgrupo=6&codjornada=99"

    def outcome(url, n):
        if url == standings_url:
            return 500 if n <= 3 else "ok"
        if url == calendar:
            return "empty" if n <= 2 else "ok"
        return "ok"
    page = Page(outcome=outcome, options=lambda url, n: OPTIONS if url == calendar else [])
    F = federacion(monkeypatch)
    standings, rounds = U.scrape_group(page, F, calendar, STORED, TODAY)
    assert standings == [{"team": "uno"}] and list(rounds) == ["Jornada 1"]
    assert F.pauses == 1 and F.resumed == 1
    assert page.fresh_loads(standings_url) == [False, True, True, True]
    assert page.fresh_loads(calendar) == [False, True, True]


# ── Las tandas ────────────────────────────────────────────────────────────────

def test_the_batch_readers_retry_fresh(monkeypatch):
    import fetch_fiflp_2425 as F
    monkeypatch.setattr(F.time, "sleep", lambda s: None)
    page = Page(outcome=lambda url, n: TimeoutError("30 s") if n == 1 else "ok")
    assert F.goto(page, group(1))
    assert page.fresh_loads(group(1)) == [False, True]
    # Lo mismo otra vez en la tanda (goleadores y detalle vuelven a pedir la página base): fresca.
    assert F.goto(page, group(1)) and page.fresh_loads(group(1)) == [False, True, True]


def test_an_empty_acta_is_asked_again_fresh(monkeypatch):
    """fetch_and_parse_acta vuelve a pedir un acta vacía (el freno): fresca, o sería la vacía guardada."""
    from scripts import fetch_fiflp_actas as A
    page = Page()
    assert A._fetch_acta_html(page, 125790)
    assert A._fetch_acta_html(page, 125790)
    url = [u for u, _ in page.loads][0]
    assert "CodActa=125790" in url and page.fresh_loads(url) == [False, True]
