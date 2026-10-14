"""fiflp_carga.py — Cuándo está lista una página de la federación y cuánto espera el bot entre una y otra.

Hasta octubre de 2026 cada página le costaba al bot ~6,8 s (ejecución 38507981984): la carga
(domcontentloaded), 2,5 s FIJOS (fetch_fiflp_2425.goto) y una pausa de 2-3,5 s (delay). Con 33
grupos, 19 min de primera pasada; con la Segunda Fase y alevín no cabría en el job. Aquí:
  - la carga espera a lo que el lector necesita, con tope (FIFLP_READY_MS, 5 s por defecto): las
    hojas de estilo de la federación (de ellas salen las cifras que pintan los ::before y que
    materializa el aplanado, fiflp_render.FLATTEN_JS) y, en las páginas cuyo desplegable rellena su
    JS (jornadas, grupos, competiciones), una opción de verdad. Lo demás llega entero en el HTML,
    que ya está leído al acabar domcontentloaded. Si lo esperado no llega, se sigue igual: los
    lectores saben qué hacer con una página vacía (como antes tras los 2,5 s);
  - la pausa entre peticiones, educada pero menor: FIFLP_DELAY segundos («1-1.5» por defecto, con
    jitter; «2-3.5» era la de antes);
  - una página de error de la federación (un 5xx, como el 503 de Apache cuando bloquea, o un 429) no
    es una página cargada: se reintenta como una que no carga y, con BLOCKED_AFTER seguidas, el bot
    deja de pedirle más en esa pasada (Federacion.blocked);
  - una página VACÍA (un 200 con «<html><head></head><body></body></html>») es su freno: tras unas
    20 páginas seguidas a ~5 s cada una deja de servir (14/10/2026, ejecución 38581710573: 63 de 69
    grupos). Se reintenta una vez tras EMPTY_WAIT y, si sigue, no carga (cuenta para blocked);
  - el RITMO: entre dos peticiones, al menos FIFLP_MIN_INTERVAL segundos (DEFAULT_INTERVAL, el de
    antes de octubre, ~6,8 s por página, que nunca frenó), por rápido que cargue cada página.
No cambia cómo se aplana ni cómo se lee el HTML: solo cuándo. Lo usa el bot (update_fiflp,
Federacion); las tandas de temporadas pasadas (fetch_fiflp_actas, _goleadores, _detalle, _islas)
siguen con el paso de fetch_fiflp_2425, sin prisa.
"""
import os
import random
import re
import time

from fiflp_render import FIFLP_HOSTS

DEFAULT_DELAY = (1.0, 1.5)
DEFAULT_READY_MS = 5000
DEFAULT_INTERVAL = 7.0    # segundos entre el inicio de dos peticiones (FIFLP_MIN_INTERVAL)
EMPTY_WAIT = 60           # tras una página vacía (el freno de la federación), antes de reintentarla
EMPTY_JS = "() => !document.body || document.body.innerHTML.trim() === ''"
RETRY_WAITS = (15, 30)    # entre intentos de una página que no carga (tres intentos)
# Páginas seguidas que no cargan (cada una tras sus intentos): la federación bloquea o se ha caído, y
# el bot deja de pedirle más en esa pasada (Federacion.blocked).
BLOCKED_AFTER = 3

_OPTION = ' option:not([value=""]):not([value="0"])'

# ¿Listo? El elemento que necesita el lector (si hace falta) y las hojas de estilo de los hosts de
# la federación cargadas. Una hoja de otro host (bloqueada por fiflp_only) no carga nunca: no se mira.
READY_JS = """([selector, hosts]) => {
  if (selector && !document.querySelector(selector)) return false;
  const ours = (url) => {
    let host = '';
    try { host = new URL(url, location.href).hostname.toLowerCase(); } catch (e) { return false; }
    return hosts.some((h) => host === h || host.endsWith('.' + h));
  };
  return Array.from(document.querySelectorAll('link[rel~="stylesheet"]'))
    .every((link) => !link.href || !ours(link.href) || link.sheet !== null);
}"""


def _env_number(text):
    return float(text.strip().replace(",", "."))


def delay_range(env=None):
    """(mínimo, máximo) de la pausa entre peticiones: FIFLP_DELAY, «1-1.5» o «1.2» (fija). Un valor
    que no se entiende, al revés o negativo no deja al bot sin pausa: vale el de por defecto."""
    text = (os.environ if env is None else env).get("FIFLP_DELAY", "")
    m = re.fullmatch(r"\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:-\s*([0-9]+(?:[.,][0-9]+)?)\s*)?", text or "")
    if not m:
        return DEFAULT_DELAY
    low = _env_number(m.group(1))
    high = _env_number(m.group(2)) if m.group(2) else low
    return (low, high) if 0 <= low <= high else DEFAULT_DELAY


def ready_timeout_ms(env=None):
    """El tope de la espera a que la página esté lista (FIFLP_READY_MS, en milisegundos). Nunca 0:
    para Playwright, 0 es esperar sin tope."""
    text = (os.environ if env is None else env).get("FIFLP_READY_MS", "").strip()
    return int(text) if text.isdigit() and int(text) > 0 else DEFAULT_READY_MS


def min_interval(env=None):
    """Los segundos mínimos entre el inicio de dos peticiones a la federación (FIFLP_MIN_INTERVAL). Un
    valor que no se entiende o negativo deja el de por defecto: nunca el bot sin freno."""
    text = (os.environ if env is None else env).get("FIFLP_MIN_INTERVAL", "")
    m = re.fullmatch(r"\s*([0-9]+(?:[.,][0-9]+)?)\s*", text or "")
    return _env_number(m.group(1)) if m else DEFAULT_INTERVAL


def _empty(page):
    """¿La federación sirvió la página vacía (su freno)? Sin poder mirarla (las páginas de prueba), no."""
    try:
        return page.evaluate(EMPTY_JS) is True
    except Exception:
        return False


def pause(extra=0, rng=random.uniform, sleep=time.sleep, env=None):
    """La pausa entre dos peticiones a la federación (y `extra` segundos más)."""
    low, high = delay_range(env)
    sleep(rng(low, high) + extra)


def ready_selector(url):
    """Lo que el lector de esa página necesita que pinte el JS de la federación; None si nada."""
    if "NFG_CmpJornada" not in url:
        return None
    if "CodGrupo=" in url:
        return 'select[name="jornada"]' + _OPTION
    if "CodCompeticion=" in url:
        return 'select[name="grupo"]' + _OPTION
    return 'select[name="competicion"]' + _OPTION


def wait_ready(page, selector, timeout_ms, hosts=FIFLP_HOSTS):
    """Espera (con tope) a que la página esté lista. True si lo estaba; si no, se sigue igual."""
    try:
        page.wait_for_function(READY_JS, arg=[selector, list(hosts)], timeout=timeout_ms, polling=100)
        return True
    except Exception:
        return False


def _refused(response):
    """¿La federación contestó con una página de error (un 503 de Apache cuando bloquea o se cae, un
    429 por ir deprisa)? page.goto no lanza con ellas. Sin respuesta (las páginas de prueba), no."""
    status = getattr(response, "status", None)
    return isinstance(status, int) and (status >= 500 or status == 429)


def goto(page, url, deadline=None, retries=3, ready_ms=None, hosts=FIFLP_HOSTS, sleep=time.sleep, log=print):
    """Carga `url` y espera a que esté lista para el lector (ready_selector y hojas de estilo). Hasta
    `retries` intentos, con 15 y 30 s entre ellos, nunca más allá de `deadline` (time.monotonic()):
    una página que no carga (o que la federación sirve con un 5xx o un 429) se deja para la próxima
    pasada. True si cargó."""
    timeout_ms = ready_timeout_ms() if ready_ms is None else ready_ms
    for attempt in range(retries):
        try:
            response = page.goto(url, wait_until="domcontentloaded", timeout=30000)
            failure = f"responde {response.status}" if _refused(response) else None
            if failure is None and _empty(page):
                failure = "página vacía (la federación frena)"
        except Exception:
            failure = "no carga"
        if failure is None:
            wait_ready(page, ready_selector(url), timeout_ms, hosts)
            return True
        braking = failure.startswith("página vacía")
        # El freno dura: una sola espera larga; si sigue, la página queda para la próxima pasada.
        if attempt + 1 >= retries or (braking and attempt >= 1):
            return False
        wait = EMPTY_WAIT if braking else RETRY_WAITS[min(attempt, len(RETRY_WAITS) - 1)]
        if deadline is not None and time.monotonic() + wait > deadline:
            return False
        log(f"      {failure} ({attempt + 1}/{retries}), se reintenta en {wait} s")
        sleep(wait)
    return False


class Federacion:
    """Lo que el bot usa del raspador de la federación (fetch_fiflp_2425: BASE y los lectores de
    clasificación y de jornada) con la carga y la pausa de aquí. `deadline` (time.monotonic()) corta
    los reintentos de una página; `pages` cuenta las cargas (el log del bot da el coste por página) y
    `failures`, las seguidas que no cargan (con BLOCKED_AFTER, `blocked`: no pedirle más). Entre el
    inicio de dos peticiones pasan al menos `interval` segundos (min_interval)."""

    def __init__(self, scraper, deadline=None, interval=None, clock=time.monotonic, sleep=time.sleep):
        self._scraper = scraper
        self.BASE = scraper.BASE
        self.deadline = deadline
        self.pages = 0
        self.failures = 0
        self.interval = min_interval() if interval is None else interval
        self._clock, self._sleep, self._last = clock, sleep, None

    @property
    def blocked(self):
        return self.failures >= BLOCKED_AFTER

    def goto(self, page, url):
        if self._last is not None:
            wait = self._last + self.interval - self._clock()
            if wait > 0:
                self._sleep(wait)
        self._last = self._clock()
        self.pages += 1
        loaded = goto(page, url, deadline=self.deadline)
        self.failures = 0 if loaded else self.failures + 1
        return loaded

    def delay(self, extra=0):
        pause(extra)

    def __getattr__(self, name):          # parse_standings, parse_matches…: los del raspador
        return getattr(self._scraper, name)
