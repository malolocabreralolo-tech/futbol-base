"""Cómo se lanza Chromium para leer la federación (fiflp_render.fiflp_launch_args, 15/10/2026).

Hasta el 15/10/2026 el bot y las tandas bloqueaban lo ajeno a la federación (publicidad, medición) con
page.route (fiflp_render.fiflp_only), y una ruta de Playwright DESACTIVA LA CACHÉ HTTP: cada página
volvía a pedir los ~20 scripts, las hojas, las fuentes y las imágenes de la federación, ~45-52
peticiones a la red por página (22-24 a www.fiflp.com). Medido por el controlador con Chromium de
verdad, sin ruta y con estos argumentos: 34 la primera página y 5 las siguientes (3 a www.fiflp.com).
Desde el 14/10 la federación frena al bot tras unas decenas de páginas: lo que cuenta su freno son,
muy probablemente, las peticiones. Aquí:
  - los argumentos (--host-resolver-rules y --blink-settings), sacados de FIFLP_HOSTS, y que dejan
    pasar justo lo que fiflp_request da por de la federación (también lo de las páginas guardadas);
  - la guarda: ningún lector de la federación usa una ruta y todo Chromium que la lee se lanza con
    ellos;
  - con un Chromium de verdad (si no está, se salta) y un servidor en 127.0.0.1: un host ajeno no
    carga (tampoco una IP), las imágenes no se piden, la caché sirve los scripts y las hojas desde la
    segunda página, y los documentos se piden siempre (también el mismo otra vez: el «¿sirve otra
    página?» de fiflp_carga.Federacion._serving pide de nuevo la última que cargó).
Sin red: los hosts de la prueba son *.localhost, que Chromium resuelve a 127.0.0.1 sin DNS.
"""
import ast
import fnmatch
import http.server
import re
import sys
import threading
from pathlib import Path
from urllib.parse import urlparse

import pytest

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
import fiflp_render as R  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"


# ── Los argumentos ────────────────────────────────────────────────────────────

def _switch(args, name):
    values = [a.split("=", 1)[1] for a in args if a.startswith(f"--{name}=")]
    assert len(values) == 1, (name, args)       # Chromium se queda con el último de cada uno: uno solo
    return values[0]


def test_the_launch_args_come_from_the_federation_hosts():
    args = R.fiflp_launch_args()
    assert args == [
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE fiflp.com, EXCLUDE *.fiflp.com, "
        "EXCLUDE filesnovanet.es, EXCLUDE *.filesnovanet.es",
        "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,"
        "availablePointerTypes=4,imagesEnabled=false"]
    # Una sola lista de hosts: cada dominio de FIFLP_HOSTS, a secas y con sus subdominios.
    rules = _switch(args, "host-resolver-rules")
    assert rules == R.host_resolver_rules(R.FIFLP_HOSTS)
    for host in R.FIFLP_HOSTS:
        assert f"EXCLUDE {host}" in rules.split(", ") and f"EXCLUDE *.{host}" in rules.split(", ")
    assert R.fiflp_launch_args(("uno.test",))[0] == \
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE uno.test, EXCLUDE *.uno.test"
    # Sin imágenes, y con los ajustes de ratón que Playwright pone sin ventana (los pisaría el nuestro).
    blink = _switch(args, "blink-settings").split(",")
    assert "imagesEnabled=false" in blink
    assert set(R.PLAYWRIGHT_HEADLESS_BLINK.split(",")) <= set(blink)
    # Los args no pueden llevar comillas: Playwright los pasa tal cual, sin shell.
    assert not any('"' in a or "'" in a for a in args)


def resolves(host, rules):
    """Lo que hace Chromium con `host` según `rules` (net/base/host_mapping_rules.cc): la primera regla
    MAP cuyo patrón (un glob: `*` vale por cualquier cosa, puntos incluidos) casa con el host y que
    ninguna EXCLUDE excluye le da su destino; «~NOTFOUND» es que no se resuelve. Sin regla, el host."""
    parsed = [r.strip().split() for r in rules.split(",") if r.strip()]
    excludes = [p[1].lower() for p in parsed if len(p) == 2 and p[0].upper() == "EXCLUDE"]
    host = host.lower()
    for p in parsed:
        if len(p) == 3 and p[0].upper() == "MAP" and fnmatch.fnmatchcase(host, p[1].lower()):
            if any(fnmatch.fnmatchcase(host, e) for e in excludes):
                continue
            return p[2]
    return host


def _fixture_urls():
    """Las URLs absolutas de los recursos de las páginas guardadas de la federación (scripts, hojas,
    imágenes, iframes): las de la federación y toda su publicidad."""
    urls = set()
    for path in sorted(FIXTURES.glob("*.html")):
        html = path.read_text(encoding="utf-8", errors="replace")
        for tag in re.findall(r"(?is)<(?:script|link|img|iframe|source)\b[^>]*>", html):
            for url in re.findall(r'(?i)\b(?:src|href)\s*=\s*["\'](https?:)?(//[^"\'\s]+)["\']', tag):
                urls.add("https:" + url[1])
    return urls


def test_the_rules_let_through_exactly_what_fiflp_request_lets_through():
    rules = R.host_resolver_rules()
    urls = _fixture_urls()
    hosts = {urlparse(u).hostname for u in urls}
    # Las páginas guardadas cargan de la federación (sus scripts, de www.fiflp.com con rutas relativas;
    # sus hojas y fuentes, de files.fiflp.com) y de decenas de hosts de publicidad. Los escudos
    # (laspalmas.filesnovanet.es) están en los raws y en el src de sus <img>.
    assert "files.fiflp.com" in hosts
    assert {"securepubads.g.doubleclick.net", "tags.refinery89.com", "cdn.consentmanager.net"} <= hosts
    extra = ["https://www.fiflp.com/pnfg/script/nova2/nova.js", "https://fiflp.com/", "https://a.b.fiflp.com/x.css",
             "https://laspalmas.filesnovanet.es/pnfg/pimg/Clubes/00100_1_haria.jpg",
             "https://fiflp.com.evil.net/x.js", "https://evilfiflp.com/x.js", "https://filesnovanet.es.ads.net/x.js",
             "https://weblaspalmas.novanet.es/pnfg/NBdd_LstDocumentos", "http://127.0.0.1/x.js"]
    for url in sorted(urls) + extra:
        blocked = resolves(urlparse(url).hostname, rules) == "~NOTFOUND"
        assert blocked == (not R.fiflp_request(url)), url
    for host in ("www.fiflp.com", "files.fiflp.com", "laspalmas.filesnovanet.es", "fiflp.com"):
        assert resolves(host, rules) == host, host


def test_fiflp_only_no_longer_routes():
    class Page:
        def route(self, *a, **k):
            raise AssertionError("una ruta desactiva la caché HTTP")
    page = Page()
    assert R.fiflp_only(page) is page


# ── La guarda: ningún lector de la federación con ruta, todos con los argumentos ──

ROUTES = {"route", "route_from_har", "route_web_socket"}
LAUNCHES = {"launch", "launch_persistent_context"}


def _federation_scripts():
    """Los scripts (no las pruebas ni el archivo) que leen la federación: los que la nombran."""
    return [p for p in sorted(SCRIPTS.glob("*.py"))
            if "fiflp" in p.name.lower() or re.search(r"(?i)fiflp|filesnovanet", p.read_text(encoding="utf-8"))]


def test_no_federation_reader_routes_and_every_chromium_takes_the_launch_args():
    routes, bare, launches = [], [], {}
    for path in _federation_scripts():
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
                continue
            where = f"{path.name}:{node.lineno}"
            if node.func.attr in ROUTES:
                routes.append(where)
            owner = node.func.value
            if node.func.attr in LAUNCHES and isinstance(owner, ast.Attribute) and owner.attr == "chromium":
                launches[where] = True
                args = [k.value for k in node.keywords if k.arg == "args"]
                if not args or "fiflp_launch_args(" not in ast.unparse(args[0]):
                    bare.append(where)
    assert not routes, ("una ruta de Playwright desactiva la caché HTTP (~10 veces más peticiones por "
                        f"página a la federación): bloquear con fiflp_launch_args al lanzar: {routes}")
    assert not bare, f"Chromium para la federación sin fiflp_render.fiflp_launch_args(): {bare}"
    # La guarda mira de verdad: el bot y las tandas lanzan su Chromium.
    for name in ("update_fiflp.py", "fetch_fiflp_actas.py", "fetch_fiflp_goleadores.py",
                 "fetch_fiflp_detalle.py", "fetch_fiflp_2425.py", "probe_fiflp.py"):
        assert any(w.startswith(name + ":") for w in launches), name


# ── Con un Chromium de verdad ─────────────────────────────────────────────────

HOSTS = ("fiflp.localhost", "filesnovanet.localhost")
CACHED = "public, max-age=15552000"          # el de los scripts y las hojas de la federación

DOC = """<!doctype html><html><head>
<link rel="stylesheet" href="http://files.fiflp.localhost:{port}/pnfg/css/nova.css">
<link rel="stylesheet" href="http://a.b.files.fiflp.localhost:{port}/pnfg/css/dos-niveles.css">
<link rel="stylesheet" href="http://fiflp.localhost:{port}/pnfg/css/raiz.css">
<link rel="stylesheet" href="http://anuncios.localhost:{port}/ajeno.css">
<script src="/pnfg/script/nova.js"></script>
<script src="http://anuncios.localhost:{port}/gpt.js"></script>
<script src="http://127.0.0.1:{port}/ip.js"></script>
<script src="http://fiflp.localhost.evil.localhost:{port}/sufijo.js"></script>
<script src="http://evilfiflp.localhost:{port}/pegado.js"></script>
</head><body>
<select name="jornada"><option value="">Jornada</option></select>
<p id="score"><i class="fa-7"></i> - <i class="fa-2"></i></p>
<table><tr><td><img src="http://laspalmas.filesnovanet.localhost:{port}/pnfg/pimg/Clubes/00100_1.png"> HARIA C.F.</td></tr></table>
</body></html>"""
NOVA_JS = ("fetch('/pnfg/NPcd/opciones').then(r => r.json()).then(o => { const s = document.querySelector("
           "'select[name=\"jornada\"]'); for (const v of o) { const e = document.createElement('option');"
           " e.value = v; e.textContent = 'Jornada ' + v; s.appendChild(e); } });")
DIGITS = "".join(f'.fa-{d}::before{{content:"{d}"}}' for d in range(10))
FOREIGN = {"anuncios.localhost", "127.0.0.1", "fiflp.localhost.evil.localhost", "evilfiflp.localhost"}


@pytest.fixture
def sync_api():
    """Playwright, si está (update.yml lo instala; tests.yml no)."""
    return pytest.importorskip("playwright.sync_api")


@pytest.fixture
def server():
    """Una «federación» en 127.0.0.1: el documento (sin cabeceras de caché, como sus NFG_*), su script
    y sus hojas (con las de caché de los de verdad), el XHR que rellena el desplegable (sin caché), un
    escudo y lo ajeno. Apunta cada petición: (host, ruta)."""
    seen = []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            host = (self.headers.get("Host") or "").rsplit(":", 1)[0]
            seen.append((host, self.path))
            path = self.path.split("?")[0]
            port = self.server.server_address[1]
            if path.startswith("/pnfg/NPcd/NFG_CmpJornada"):
                body, kind, cache = DOC.format(port=port), "text/html", None
            elif path == "/pnfg/script/nova.js":
                body, kind, cache = NOVA_JS, "application/javascript", CACHED
            elif path == "/pnfg/NPcd/opciones":
                body, kind, cache = "[1, 2, 3]", "application/json", None
            elif path.startswith("/pnfg/css/"):
                body, kind, cache = DIGITS, "text/css", CACHED
            elif path.endswith(".png"):
                body, kind, cache = "", "image/png", CACHED
            else:                                         # lo ajeno: cargaría si se resolviera
                body, kind, cache = "window.ajeno = (window.ajeno || 0) + 1;", "application/javascript", CACHED
            data = body.encode()
            self.send_response(200)
            self.send_header("Content-Type", kind)
            if cache:
                self.send_header("Cache-Control", cache)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *a):
            pass

    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield httpd.server_address[1], seen
    httpd.shutdown()


def _page_url(port, grupo):
    return (f"http://www.fiflp.localhost:{port}/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120"
            f"&CodTemporada=22&CodCompeticion=1&CodGrupo={grupo}")


STATE_JS = """() => ({
  options: document.querySelectorAll('select[name="jornada"] option').length,
  ajeno: window.ajeno || 0,
  crest: document.querySelector('img').src,
  loaded: document.querySelector('img').complete && document.querySelector('img').naturalWidth > 0,
  hover: matchMedia('(hover: hover)').matches,
  fine: matchMedia('(pointer: fine)').matches })"""


def _read(sync_api, port, args):
    """Tres páginas en el mismo navegador, como el bot: dos grupos y el primero otra vez. Cada una con
    la carga de fiflp_carga (espera las hojas de la federación y el desplegable) y aplanada."""
    import fiflp_carga as C
    states, scores = [], []
    with sync_api.sync_playwright() as p:
        try:
            browser = p.chromium.launch(headless=True, args=args)
        except Exception as e:                      # sin Chromium instalado
            pytest.skip(f"sin navegador: {e}")
        try:
            page = browser.new_page()
            for grupo in (1, 2, 1):
                assert C.goto(page, _page_url(port, grupo), ready_ms=5000, hosts=HOSTS, log=lambda *_: None)
                states.append(page.evaluate(STATE_JS))
                R.flatten(page)
                scores.append(page.inner_text("#score").replace(" ", ""))
        finally:
            browser.close()
    return states, scores


def test_a_real_chromium_with_the_args_skips_the_foreign_and_the_images_and_caches(sync_api, server):
    port, seen = server
    states, scores = _read(sync_api, port, R.fiflp_launch_args(HOSTS))
    requested = lambda path: [h for h, p in seen if p.split("?")[0] == path]
    # Lo ajeno no se pide nunca: ni otro host, ni una IP, ni un host que solo contiene el dominio.
    assert not {h for h, _ in seen} & FOREIGN
    assert all(s["ajeno"] == 0 for s in states)
    # Las imágenes tampoco, y el escudo se lee igual del src.
    assert not [p for _, p in seen if p.endswith(".png")]
    assert all(s["crest"].endswith("/pnfg/pimg/Clubes/00100_1.png") and not s["loaded"] for s in states)
    # Lo de la federación, sí (subdominios de varios niveles y el dominio a secas), y una sola vez: la
    # caché HTTP sirve el script y las hojas desde la segunda página.
    assert requested("/pnfg/script/nova.js") == ["www.fiflp.localhost"]
    assert requested("/pnfg/css/nova.css") == ["files.fiflp.localhost"]
    assert requested("/pnfg/css/dos-niveles.css") == ["a.b.files.fiflp.localhost"]
    assert requested("/pnfg/css/raiz.css") == ["fiflp.localhost"]
    # Cada documento y su XHR, en cambio, se piden siempre: también el mismo grupo otra vez.
    assert len([p for _, p in seen if "NFG_CmpJornada" in p]) == 3
    assert len(requested("/pnfg/NPcd/opciones")) == 3
    # El lector tiene lo que necesita: el desplegable relleno por el JS y las cifras de las hojas.
    assert [s["options"] for s in states] == [4, 4, 4]
    assert scores == ["7-2"] * 3
    # El ratón de Playwright sin ventana sigue ahí (el --blink-settings nuestro pisa el suyo).
    assert all(s["hover"] and s["fine"] for s in states)


def test_without_the_args_the_same_chromium_loads_the_foreign_and_the_images(sync_api, server):
    """El control: lo ajeno sí se resuelve sin los argumentos (*.localhost e IPs), así que lo que lo
    deja fuera arriba son ellos."""
    port, seen = server
    states, _ = _read(sync_api, port, [])
    assert {"anuncios.localhost", "127.0.0.1"} <= {h for h, _ in seen}
    assert [p for _, p in seen if p.endswith(".png")]
    assert all(s["ajeno"] > 0 for s in states)
