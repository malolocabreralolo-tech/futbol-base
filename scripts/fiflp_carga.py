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
    deja de pedirle más en esa pasada (Federacion.blocked). Un 503 o un 429 («no disponible»,
    «demasiadas peticiones») es además señal del freno, como una página vacía: la federación, no la
    página. Un 500 (u otro 5xx) o un corte de conexión, no: puede ser la URL;
  - una página VACÍA (un 200 con «<html><head></head><body></body></html>») es su freno: tras unas
    20 páginas seguidas a ~5 s cada una deja de servir (14/10/2026, ejecución 38581710573: 63 de 69
    grupos). Se reintenta una vez tras EMPTY_WAIT y, si sigue, no carga (cuenta para blocked);
  - el RITMO: entre dos peticiones, al menos FIFLP_MIN_INTERVAL segundos (DEFAULT_INTERVAL, el de
    antes de octubre, ~6,8 s por página, que nunca frenó), por rápido que cargue cada página;
  - la PAUSA LARGA (Federacion, desde el 15/10/2026): el freno es errático (a 7 s por página, 130 y
    169 páginas sin frenar unas pasadas y 10-41 otras) y se pasa solo (seguía 3 min después en la
    pasada 1103; 37 min después del de las 20:42 la pasada fue limpia). Cuando frena (una página
    vacía tras su espera de EMPTY_WAIT, o la página que dejaría a la federación `blocked`: con un 503
    o un 429, sin más; si no, solo si la federación tampoco sirve otra página, la última que cargó o,
    sin ninguna, la de competiciones de la temporada: si la sirve, la racha es de URLs muertas), si
    cabe antes del plazo (con BRAKE_ROOM para leer algo después), el bot espera FIFLP_BRAKE_PAUSE_MIN
    minutos y vuelve a pedir LA MISMA página: si carga (o carga otra), sigue la pasada, más despacio
    (el intervalo ×BRAKE_SLOWDOWN, como mucho ×BRAKE_SLOWDOWN_MAX); si no, otra pausa, hasta
    FIFLP_BRAKE_PAUSES por pasada. Agotadas (o sin plazo para otra), `blocked`: nada más en esa pasada.
    Ninguna página empieza pasado el plazo, contando la espera del intervalo;
  - si el navegador se cierra (Chromium caído), no es la federación: ni reintentos ni pausas, y nada
    más en esa pasada (Federacion.closed);
  - lo que se REPITE va a la red (fiflp_render.goto, 15/10/2026): la federación da sus documentos con
    «Cache-Control: private, max-age=300», y con la caché HTTP la misma URL antes de 5 min saldría de
    la caché sin pedirle nada. Toda URL que el navegador ya pidió (los reintentos de goto, la otra página
    de Federacion._serving, la misma tras la pausa larga, la recarga del calendario y la clasificación
    otra vez de update_fiflp.scrape_group) pide su documento a la red; los scripts y las hojas, de la caché.
No cambia cómo se aplana ni cómo se lee el HTML: solo cuándo. Lo usa el bot (update_fiflp,
Federacion); las tandas de temporadas pasadas (fetch_fiflp_actas, _goleadores, _detalle, _islas)
siguen con el paso de fetch_fiflp_2425, sin prisa.
"""
from datetime import datetime, timedelta, timezone
import os
import random
import re
import time

import fiflp_render
from fiflp_render import FIFLP_HOSTS

DEFAULT_DELAY = (1.0, 1.5)
DEFAULT_READY_MS = 5000
DEFAULT_INTERVAL = 7.0    # segundos entre el inicio de dos peticiones (FIFLP_MIN_INTERVAL)
EMPTY_WAIT = 60           # tras una página vacía (el freno de la federación), antes de reintentarla
EMPTY_JS = "() => !document.body || document.body.innerHTML.trim() === ''"
RETRY_WAITS = (15, 30)    # entre intentos de una página que no carga (tres intentos)
# Páginas seguidas que no cargan (cada una tras sus intentos): la federación bloquea o se ha caído, y
# el bot deja de pedirle más en esa pasada (Federacion.blocked), si una pausa larga no lo arregla. Salvo
# que, sin un 503 ni un 429 en ellas, la federación sirva otra página (Federacion._serving): entonces son
# URLs muertas, no la federación.
BLOCKED_AFTER = 3
# Los estados con los que la federación dice que no sirve (no la página): señal del freno, como una vacía.
BRAKE_STATUSES = (429, 503)
# La página de competiciones de la temporada, que existe siempre (update_fiflp.check_competitions): con
# ella, Federacion._serving prueba si la federación sirve cuando aún no ha cargado ninguna otra página.
CATALOG_URL = "/NFG_CmpJornada?cod_primaria=1000120&CodTemporada={season}"
# La pausa larga cuando frena (FIFLP_BRAKE_PAUSE_MIN, FIFLP_BRAKE_PAUSES). El freno seguía 3 min después
# en la pasada 1103 (páginas vacías a las 03:30:43, 03:31:43 y 03:32:45) y se había pasado 37 min después
# del de las 20:42 del 14/10 (la pasada de las 21:19, 169 páginas sin freno). 5 min pasa del mínimo visto
# y, con 3 pausas, el bot vuelve a probar a los ~6, ~11 y ~16 min de la primera página vacía: cubre un
# freno de un cuarto de hora sin pedir nada entretanto. Uno más largo cuesta tiempo de runner, no páginas:
# la pasada se da por perdida como antes, y el plazo global (y con él el job) no se mueve.
BRAKE_PAUSE = 5 * 60
BRAKE_PAUSES = 3
BRAKE_ROOM = 2 * 60       # tras la pausa, antes del plazo: la página otra vez y el resto de su grupo
# Tras volver a servir, más despacio el resto de la pasada. El freno no sale solo del ritmo (a 7 s, 169
# páginas sin frenar a las 21:19 y freno tras 13 a las 16:39): no merece pararse en seco. ×1,5 (7 → 10,5 s)
# aún deja ~85 páginas en 15 min; si vuelve a frenar y a servir, el doble (14 s), y no más.
BRAKE_SLOWDOWN = 1.5
BRAKE_SLOWDOWN_MAX = 2.0
# Los motivos de un intento fallido (goto, `why`) que Federacion mira: el freno (una página vacía, o un
# BRAKE_STATUSES) y el navegador cerrado (no la federación). Los demás, el texto del registro.
EMPTY = "vacía"
REFUSED = "rechazada"
CLOSED = "navegador cerrado"

_OPTION = ' option:not([value=""]):not([value="0"])'

# ¿Listo? El elemento que necesita el lector (si hace falta) y las hojas de estilo de los hosts de
# la federación cargadas. Una hoja de otro host (no se resuelve: fiflp_render.fiflp_launch_args) no carga
# nunca: no se mira. Con la caché HTTP, las de la federación ya están desde la segunda página.
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


def brake_pause_seconds(env=None):
    """La pausa larga cuando la federación frena (FIFLP_BRAKE_PAUSE_MIN minutos; 5 por defecto). Un
    valor que no se entiende o que no es positivo deja el de por defecto."""
    text = (os.environ if env is None else env).get("FIFLP_BRAKE_PAUSE_MIN", "")
    m = re.fullmatch(r"\s*([0-9]+(?:[.,][0-9]+)?)\s*", text or "")
    value = _env_number(m.group(1)) * 60 if m else 0
    return value if value > 0 else BRAKE_PAUSE


def brake_pauses(env=None):
    """Cuántas pausas largas por pasada (FIFLP_BRAKE_PAUSES; 3 por defecto). Con 0, ninguna: al frenar,
    la pasada se da por perdida, como antes del 15/10/2026."""
    text = (os.environ if env is None else env).get("FIFLP_BRAKE_PAUSES", "").strip()
    return int(text) if text.isdigit() else BRAKE_PAUSES


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


class _Closed(Exception):
    """El navegador se cerró en una petición de Federacion (la página, la de _serving o la de tras una
    pausa): Federacion.goto lo atiende en un solo sitio."""


def _closed(page, error):
    """¿Se cerró la página o el navegador (Chromium caído: «Target page, context or browser has been
    closed»)? Entonces el fallo no es de la federación."""
    try:
        if page.is_closed() is True:
            return True
    except Exception:                     # las páginas de prueba, sin is_closed
        pass
    return type(error).__name__ == "TargetClosedError" or "has been closed" in str(error)


def _refused(response):
    """¿La federación contestó con una página de error (un 503 de Apache cuando bloquea o se cae, un
    429 por ir deprisa)? page.goto no lanza con ellas. Sin respuesta (las páginas de prueba), no."""
    status = getattr(response, "status", None)
    return isinstance(status, int) and (status >= 500 or status == 429)


def goto(page, url, deadline=None, retries=3, ready_ms=None, hosts=FIFLP_HOSTS, sleep=time.sleep, log=print,
         clock=time.monotonic, why=None):
    """Carga `url` y espera a que esté lista para el lector (ready_selector y hojas de estilo). Hasta
    `retries` intentos, con 15 y 30 s entre ellos (tras una página vacía, una sola espera de EMPTY_WAIT),
    nunca más allá de `deadline` (en `clock`): una página que no carga (o que la federación sirve con un
    5xx, un 429 o vacía) se deja para la próxima pasada. True si cargó. En `why` (una lista), el motivo
    de cada intento fallido: EMPTY o REFUSED si fue el freno (vacía, o un BRAKE_STATUSES), CLOSED si se
    cerró el navegador (sin más intentos: no es la federación); Federacion los usa para su pausa larga.
    Cada carga, por fiflp_render.goto: desde el 2.º intento (la misma URL otra vez), y la 1.ª si el navegador
    ya la pidió antes, el documento va a la red y no a la caché HTTP (la federación los da con
    «Cache-Control: private, max-age=300»: si no, el reintento de una página vacía podría ser la vacía
    guardada)."""
    timeout_ms = ready_timeout_ms() if ready_ms is None else ready_ms
    for attempt in range(retries):
        status = None
        try:
            # El 2.º intento (y cualquier URL que el navegador ya pidió) va a la red, no a la caché HTTP:
            # sus documentos se guardan 5 min (fiflp_render.goto).
            response = fiflp_render.goto(page, url, wait_until="domcontentloaded", timeout=30000)
            status = getattr(response, "status", None)
            failure = f"responde {status}" if _refused(response) else None
            if failure is None and _empty(page):
                failure = "página vacía (la federación frena)"
        except Exception as error:
            if _closed(page, error):
                if why is not None:
                    why.append(CLOSED)
                return False
            failure = "no carga"
        if failure is None:
            wait_ready(page, ready_selector(url), timeout_ms, hosts)
            return True
        braking = failure.startswith("página vacía")
        if why is not None:
            why.append(EMPTY if braking else REFUSED if status in BRAKE_STATUSES else failure)
        # El freno dura: una sola espera larga; si sigue, la página no carga (Federacion decide si pausa).
        if attempt + 1 >= retries or (braking and attempt >= 1):
            return False
        wait = EMPTY_WAIT if braking else RETRY_WAITS[min(attempt, len(RETRY_WAITS) - 1)]
        if deadline is not None and clock() + wait > deadline:
            return False
        log(f"      {failure} ({attempt + 1}/{retries}), se reintenta en {wait} s")
        sleep(wait)
    return False


class Federacion:
    """Lo que el bot usa del raspador de la federación (fetch_fiflp_2425: BASE y los lectores de
    clasificación y de jornada) con la carga y la pausa de aquí, para UNA pasada. `deadline` (en
    `clock`) es el plazo global del bot: ninguna página empieza después (contando la espera del
    intervalo: si no cabe, se espera igual y no se pide, y el bot ve el plazo agotado), y corta los
    reintentos de una página y las pausas largas. Entre el inicio de dos peticiones pasan al menos
    `interval` segundos (min_interval). Cuenta:
      - `pages`, las peticiones (también la de después de una pausa larga y la de comprobar si sirve
        otra: el log del bot da el coste por página), y `served`, las páginas que cargaron;
      - `failures`, las seguidas que no cargan (con BLOCKED_AFTER, `blocked`: no pedirle más);
      - el freno: `brakes`, sus señales (cada página vacía o con un 503 o un 429, cargue o no tras sus
        reintentos, y cada racha de BLOCKED_AFTER sin cargar en la que la federación no sirve otra
        página: _serving), y en `brake_marks`
        las páginas servidas (`served`) hasta cada una (el bot sabe así si un fallo anterior, sin servir
        nada entre medias, ya era el freno); `unserved`, las páginas que no sirvió por su freno;
        `pauses`, las pausas largas hechas (como mucho `max_pauses`, de `pause_seconds` cada una:
        brake_pauses y brake_pause_seconds); `resumed`, cuántas veces volvió a servir tras una pausa (no
        tras cuántas pausas: eso lo dice el registro); `paused`, los segundos en pausa (no son coste de
        ninguna página ni de ningún grupo); y `halted`: frenó sin pausas o sin plazo para otra, y no se
        le pide nada más (`blocked`);
      - `closed`: el navegador se cerró (Chromium caído). No es el freno (ni señal ni pausas): `halted`,
        y el bot da por error el grupo que se estaba leyendo.
    Toda petición pasa por goto y fiflp_render.goto: una URL que el navegador ya pidió en la pasada (la otra
    página de _serving, la misma tras una pausa larga, lo que el bot vuelve a pedir) va a la red, no a la
    caché HTTP. Lo recuerda el navegador (su contexto), no esta clase: vale igual para cualquier lector."""

    def __init__(self, scraper, deadline=None, interval=None, clock=time.monotonic, sleep=time.sleep,
                 pause_seconds=None, max_pauses=None, wall=None, log=print):
        self._scraper = scraper
        self.BASE = scraper.BASE
        self.deadline = deadline
        self.pages = self.served = self.failures = self.unserved = self.brakes = 0
        self.brake_marks = []
        self.interval = min_interval() if interval is None else interval
        self.base_interval = self.interval
        self.pause_seconds = brake_pause_seconds() if pause_seconds is None else pause_seconds
        self.max_pauses = brake_pauses() if max_pauses is None else max_pauses
        self.pauses = self.resumed = 0
        self.paused = 0.0
        self.halted = self.closed = False
        self._clock, self._sleep, self._last = clock, sleep, None
        self._good = None                 # la última página que cargó (_serving)
        self._wall = wall or (lambda: datetime.now(timezone.utc))
        self._log = log

    @property
    def blocked(self):
        return self.halted or self.failures >= BLOCKED_AFTER

    def _request(self, page, url, retries=3):
        """Una petición (con sus reintentos cortos: goto) al ritmo de `interval`. (¿cargó?, los motivos de
        sus intentos fallidos: goto `why`), o None si, tras la espera del intervalo, ya ha pasado el plazo:
        entonces ni se pide."""
        if self._last is not None:
            wait = self._last + self.interval - self._clock()
            if wait > 0:
                self._sleep(wait)
        if self.deadline is not None and self._clock() > self.deadline:
            return None
        self._last = self._clock()
        self.pages += 1
        why = []
        loaded = goto(page, url, deadline=self.deadline, retries=retries, sleep=self._sleep, log=self._log,
                      clock=self._clock, why=why)
        if CLOSED in why:
            raise _Closed
        if loaded:
            self._good = url
        return loaded, why

    def _serving(self, page, url):
        """¿Sirve la federación otra página: la última que cargó o, si aún no ha cargado ninguna, la de
        competiciones de la temporada (CATALOG_URL, que existe siempre)? Distingue una racha de URLs
        muertas (sí: no es el freno) del freno o de una caída (no). Si la que falla es esa misma, no."""
        season = re.search(r"(?i)CodTemporada=(\d+)", url)
        other = self._good or (self.BASE + CATALOG_URL.format(season=season.group(1)) if season else None)
        if other is None or other == url:
            return False
        got = self._request(page, other, retries=1)
        if not got or not got[0]:
            return False
        self.failures = 0
        self.served += 1
        return True

    def _pause_fits(self):
        """¿Otra pausa larga? Si quedan y, tras ella, aún hay BRAKE_ROOM antes del plazo."""
        if self.pauses >= self.max_pauses:
            n = self.pauses
            self._log(f"      la federación sigue frenando tras {n} pausa{'s' if n > 1 else ''}: nada más en esta pasada"
                      if n else "      la federación frena (sin pausas largas): nada más en esta pasada")
            return False
        if self.deadline is not None and self._clock() + self.pause_seconds + BRAKE_ROOM > self.deadline:
            self._log(f"      la federación frena y no queda plazo para una pausa de {self.pause_seconds / 60:g} "
                      "min: nada más en esta pasada")
            return False
        return True

    def _pause(self):
        self.pauses += 1
        until = self._wall() + timedelta(seconds=self.pause_seconds)
        self._log(f"      la federación frena: pausa de {self.pause_seconds / 60:g} min "
                  f"({self.pauses}/{self.max_pauses}), hasta las {until:%H:%M} UTC")
        began = self._clock()
        self._sleep(self.pause_seconds)
        self.paused += self._clock() - began

    def goto(self, page, url):
        if self.halted or (self.deadline is not None and self._clock() > self.deadline):
            return False                  # frenada sin remedio, o pasado el plazo: ni se pide
        try:
            return self._goto(page, url)
        except _Closed:                   # el navegador, no la federación: ni señal del freno ni pausas
            self.closed = self.halted = True
            self.failures += 1
            self._log("      el navegador se ha cerrado: nada más en esta pasada")
            return False

    def _goto(self, page, url):
        got = self._request(page, url)
        if got is None:
            return False                  # tras el intervalo, pasado el plazo: ni se pide
        loaded, why = got
        empty = EMPTY in why
        # El freno: una página vacía o con un 503 o un 429 (aunque cargue tras sus reintentos), o la que
        # dejaría a la federación bloqueada si no sirve otra página. Si la sirve, la racha es de URLs muertas
        # (dos grupos seguidos con la URL muerta, p. ej.): esta no carga y se sigue.
        signal = empty or REFUSED in why
        streak = not loaded and self.failures + 1 >= BLOCKED_AFTER
        if streak and not signal and self._serving(page, url):
            streak = False
            self._log(f"      {BLOCKED_AFTER} páginas seguidas sin cargar, pero la federación sirve otra: no es "
                      "el freno, es esta página")
        if signal or streak:
            self.brakes += 1
            self.brake_marks.append(self.served)
        # En vez de rendirse, pausas largas mientras quepan, y la misma página otra vez.
        braking = not loaded and (empty or streak)
        while braking:
            if not self._pause_fits():
                self.halted = True
                break
            self._pause()
            got = self._request(page, url, retries=1)
            loaded, empty = (got[0], EMPTY in got[1]) if got else (False, False)
            # Vuelve a servir si carga esta o, si esta no y no está vacía, otra (_serving).
            if loaded or (got and not empty and self._serving(page, url)):
                braking = False
                self.resumed += 1
                self.interval = min(self.interval * BRAKE_SLOWDOWN, self.base_interval * BRAKE_SLOWDOWN_MAX)
                self._log(f"      la federación vuelve a servir{'' if loaded else ', pero no esta página'}: se "
                          f"sigue, una página cada {self.interval:g} s")
            else:
                self._log("      la federación sigue frenando")
        if loaded:
            self.failures = 0
            self.served += 1
        else:
            self.failures += 1
            self.unserved += braking
        return loaded

    def delay(self, extra=0):
        pause(extra)

    def __getattr__(self, name):          # parse_standings, parse_matches…: los del raspador
        return getattr(self._scraper, name)
