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
  - el RITMO: entre dos peticiones, al menos FIFLP_MIN_INTERVAL segundos (DEFAULT_INTERVAL, 7: el de
    antes de octubre, ~6,8 s por página), por rápido que cargue cada página. Por cortesía: el freno no
    depende del ritmo (abajo);
  - si el navegador se cierra (Chromium caído), no es la federación: ni reintentos ni esperas, y nada
    más en esa pasada (Federacion.closed);
  - lo que se REPITE va a la red (fiflp_render.goto, 15/10/2026): la federación da sus documentos con
    «Cache-Control: private, max-age=300», y con la caché HTTP la misma URL antes de 5 min saldría de
    la caché sin pedirle nada. Toda URL que el navegador ya pidió (los reintentos de goto, la otra página
    de Federacion._serving, los sondeos del freno, la recarga del calendario y la clasificación otra vez
    de update_fiflp.scrape_group) pide su documento a la red; los scripts y las hojas, de la caché.

EL FRENO (medido el 15/10/2026 con freno-fiflp.yml, scripts/freno_experimento.py: tres runners de GitHub
a la vez, cada uno con su IP, pidiendo documentos distintos con la caché y fiflp_launch_args):
  - la federación sirve ~15 DOCUMENTOS POR IP y después una página VACÍA (un 200 con «content-length: 0»
    de Apache, que el navegador pinta como «<html><head></head><body></body></html>»; la normal llega con
    «Cache-Control: private, max-age=300» y por trozos) durante ~2-6 min, casi siempre ~5:
      a 7 s por página: 15 páginas, vuelve a los 304 s; 16, vuelve a los 364 s; 17 (y seguía 242 s después);
      a 15 s: 15, vuelve a los 304 s; 15, vuelve a los 122 s; 15 (y seguía 181 s después);
      a 30 s: 15 (7,5 min), vuelve a los 303 s; y 20 sin frenar hasta acabar el plazo;
  - EL RITMO NO IMPORTA (15 páginas a 7, a 15 y a 30 s): el cupo es de páginas. Pasadas reales de ese
    día: frenaba tras ~10-12 páginas, y el ×1,5 de ralentización al reanudar no servía de nada;
  - la misma página 10 s después, vacía; y en un CONTEXTO NUEVO (otra sesión, otras cookies, la misma IP),
    vacía: el cupo es POR IP, no por sesión. No se intenta saltarlo (ni varias IPs, ni proxies, ni
    runners en paralelo, ni otra identidad): se trabaja DENTRO del cupo;
  - un sondeo de una página cada 60 s durante el bloqueo no lo alarga (vuelve a ~300 s igual).
Por eso, desde ese día (Federacion):
  - una página vacía es el freno a la primera: SIN reintento (antes, uno tras EMPTY_WAIT = 60 s, que
    siempre salía vacío: un minuto perdido, y una petición);
  - la ESPERA del freno: FIFLP_BRAKE_PAUSE_MIN (4) minutos sin pedir nada y después LA MISMA página cada
    FIFLP_BRAKE_PROBE_S (60) segundos (un sondeo: una sola petición, al documento de la red y no al de la
    caché, porque la URL se repite), hasta que sirva; cada uno, si cabe en el plazo con BRAKE_ROOM para
    leer algo después. Con un tope por freno, FIFLP_BRAKE_MAX_MIN (20) minutos desde la página vacía: si
    no vuelve, nada más en esa pasada (`blocked`). Con lo medido (~5 min) vuelve en el 2.º o el 3.º
    sondeo (a los ~300 o ~360 s); el de 122 s, en el 1.º; y el tope deja 17 sondeos (en la pasada 1106
    un freno seguía a los 11 min);
  - SIN TOPE de frenos por pasada salvo el plazo: cada vuelta da otras ~15 páginas. FIFLP_BRAKE_PAUSES
    los limita si se quiere (0: ninguna espera, al frenar se acaba la pasada);
  - SIN RALENTIZAR al reanudar (antes, el intervalo ×1,5 y hasta ×2): el cupo no es de ritmo, y cada
    segundo de más es tiempo de plazo perdido;
  - lo demás, igual: un freno no es un error (update_fiflp.run_passes), un 503 o un 429 es señal del
    freno, una racha de URLs muertas mientras la federación sirve otra página no lo es, el navegador
    cerrado tampoco, y ninguna página empieza pasado el plazo, contando la espera del intervalo.
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
EMPTY_JS = "() => !document.body || document.body.innerHTML.trim() === ''"
RETRY_WAITS = (15, 30)    # entre intentos de una página que no carga (tres intentos)
# Páginas seguidas que no cargan (cada una tras sus intentos): la federación bloquea o se ha caído, y
# el bot deja de pedirle más en esa pasada (Federacion.blocked), si la espera del freno no lo arregla.
# Salvo que, sin un 503 ni un 429 en ellas, la federación sirva otra página (Federacion._serving):
# entonces son URLs muertas, no la federación.
BLOCKED_AFTER = 3
# Los estados con los que la federación dice que no sirve (no la página): señal del freno, como una vacía.
BRAKE_STATUSES = (429, 503)
# La página de competiciones de la temporada, que existe siempre (update_fiflp.check_competitions): con
# ella, Federacion._serving prueba si la federación sirve cuando aún no ha cargado ninguna otra página.
CATALOG_URL = "/NFG_CmpJornada?cod_primaria=1000120&CodTemporada={season}"
# La espera del freno (lo medido el 15/10/2026, en el docstring del módulo). La primera, sin pedir nada
# (FIFLP_BRAKE_PAUSE_MIN): el bloqueo dura ~5 min y casi nunca menos de 2, así que antes de 4 min un
# sondeo saldría vacío casi siempre. Después, la misma página cada BRAKE_PROBE s (FIFLP_BRAKE_PROBE_S):
# vuelve a servir hacia los 300 o los 360 s, y con sondeos de minuto en minuto se pierde, como mucho, un
# minuto de cada freno (con pausas fijas de 5 min, hasta 5). Cada freno, como mucho BRAKE_CAP s desde la
# página vacía (FIFLP_BRAKE_MAX_MIN): en el experimento el más largo duró 364 s, pero en la pasada 1106
# (15/10/2026, 11:07 UTC) el segundo freno seguía a los 11 min; esperar cuesta solo un sondeo por minuto, así
# que el tope es de 20 min. Si no ha vuelto, algo distinto pasa (una caída, otro bloqueo) y la pasada se da
# por acabada. Sin tope de frenos por pasada
# (BRAKE_PAUSES, None; FIFLP_BRAKE_PAUSES lo pone): cada vuelta son ~15 páginas más, y el plazo manda.
BRAKE_PAUSE = 4 * 60
BRAKE_PROBE = 60
BRAKE_PROBE_MIN = 30      # un sondeo más seguido no es educado (FIFLP_BRAKE_PROBE_S por debajo: el de siempre)
BRAKE_CAP = 20 * 60
BRAKE_PAUSES = None
BRAKE_ROOM = 2 * 60       # tras la espera (y tras cada sondeo), antes del plazo: ~15 páginas a 7 s
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


def _env_value(name, env=None):
    """El número de la variable `name` (con coma o punto decimal), o None si no está o no se entiende."""
    text = (os.environ if env is None else env).get(name, "")
    m = re.fullmatch(r"\s*([0-9]+(?:[.,][0-9]+)?)\s*", text or "")
    return _env_number(m.group(1)) if m else None


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
    value = _env_value("FIFLP_MIN_INTERVAL", env)
    return DEFAULT_INTERVAL if value is None else value


def brake_pause_seconds(env=None):
    """La primera espera cuando la federación frena, sin pedirle nada (FIFLP_BRAKE_PAUSE_MIN minutos; 4
    por defecto; hasta el 15/10/2026 era cada una de las pausas fijas, de 5). Un valor que no se entiende
    o que no es positivo deja el de por defecto."""
    value = _env_value("FIFLP_BRAKE_PAUSE_MIN", env)
    return value * 60 if value else BRAKE_PAUSE


def brake_probe_seconds(env=None):
    """Cada cuánto, tras la primera espera, se vuelve a pedir la misma página (FIFLP_BRAKE_PROBE_S
    segundos; 60 por defecto). Menos de BRAKE_PROBE_MIN, o un valor que no se entiende, deja el de por
    defecto: un sondeo detrás de otro no es educado (y el bloqueo no se pasa antes)."""
    value = _env_value("FIFLP_BRAKE_PROBE_S", env)
    return value if value is not None and value >= BRAKE_PROBE_MIN else BRAKE_PROBE


def brake_cap_seconds(env=None):
    """El tope de cada freno, desde la página vacía (FIFLP_BRAKE_MAX_MIN minutos; 20 por defecto): si no
    vuelve a servir antes, nada más en esa pasada. Un valor que no se entiende o no positivo, el de
    por defecto."""
    value = _env_value("FIFLP_BRAKE_MAX_MIN", env)
    return value * 60 if value else BRAKE_CAP


def brake_pauses(env=None):
    """Cuántos frenos se esperan por pasada (FIFLP_BRAKE_PAUSES): por defecto, sin tope (None: los que
    quepan en el plazo). Con 0, ninguno: al frenar, la pasada se da por perdida, como antes del
    15/10/2026. Lo que no es un entero, sin tope. (Hasta el 15/10/2026 eran las pausas de 5 min por
    pasada, 3.)"""
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
    """El navegador se cerró en una petición de Federacion (la página, la de _serving o un sondeo del
    freno): Federacion.goto lo atiende en un solo sitio."""


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
    `retries` intentos, con 15 y 30 s entre ellos, nunca más allá de `deadline` (en `clock`): una página
    que no carga (o que la federación sirve con un 5xx o un 429) se deja para la próxima pasada. Una
    página VACÍA (el freno) no se reintenta: la misma página 10 s después sigue vacía y el bloqueo dura
    ~5 min (15/10/2026); Federacion espera el freno. True si cargó. En `why` (una lista), el motivo de
    cada intento fallido: EMPTY o REFUSED si fue el freno (vacía, o un BRAKE_STATUSES), CLOSED si se
    cerró el navegador (sin más intentos: no es la federación); Federacion los usa para su espera.
    Cada carga, por fiflp_render.goto: desde el 2.º intento (la misma URL otra vez), y la 1.ª si el navegador
    ya la pidió antes, el documento va a la red y no a la caché HTTP (la federación los da con
    «Cache-Control: private, max-age=300»: si no, un sondeo del freno podría ser la vacía guardada)."""
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
        # El freno dura minutos: ni un reintento (Federacion lo espera). Lo demás, con sus esperas cortas.
        if braking or attempt + 1 >= retries:
            return False
        wait = RETRY_WAITS[min(attempt, len(RETRY_WAITS) - 1)]
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
    reintentos de una página y la espera del freno. Entre el inicio de dos peticiones pasan al menos
    `interval` segundos (min_interval), también tras un freno (sin ralentizar: el cupo es de páginas).
    Cuenta:
      - `pages`, las peticiones (también los sondeos del freno y la de comprobar si sirve otra: el log
        del bot da el coste por página), y `served`, las páginas que cargaron;
      - `failures`, las seguidas que no cargan (con BLOCKED_AFTER, `blocked`: no pedirle más);
      - el freno: `brakes`, sus señales (cada página vacía o con un 503 o un 429, cargue o no tras sus
        reintentos, y cada racha de BLOCKED_AFTER sin cargar en la que la federación no sirve otra
        página: _serving), y en `brake_marks` las páginas servidas (`served`) hasta cada una (el bot sabe
        así si un fallo anterior, sin servir nada entre medias, ya era el freno); `unserved`, las páginas
        que no sirvió por su freno;
      - la espera de cada freno (una página vacía, o la que dejaría a la federación `blocked`): `pauses`,
        los frenos esperados (cada uno, su primera espera de `pause_seconds` y sus sondeos cada
        `probe_seconds`, como mucho `cap_seconds` desde la página vacía; como mucho `max_pauses` por
        pasada, None sin tope: brake_pause_seconds, brake_probe_seconds, brake_cap_seconds y
        brake_pauses); `resumed`, tras cuántos volvió a servir; `probes`, los sondeos; `brake_after`, las
        páginas servidas antes de cada freno, desde el anterior (el cupo, que el registro da también:
        «frena tras 15 páginas»); `paused`, los segundos esperando (no son coste de ninguna página ni de ningún grupo); y
        `halted`: frenó y no volvió (sin sitio en el plazo, pasado el tope o sin esperas), y no se le pide
        nada más (`blocked`);
      - `closed`: el navegador se cerró (Chromium caído). No es el freno (ni señal ni espera): `halted`,
        y el bot da por error el grupo que se estaba leyendo.
    Toda petición pasa por goto y fiflp_render.goto: una URL que el navegador ya pidió en la pasada (la otra
    página de _serving, los sondeos, lo que el bot vuelve a pedir) va a la red, no a la caché HTTP. Lo
    recuerda el navegador (su contexto), no esta clase: vale igual para cualquier lector."""

    def __init__(self, scraper, deadline=None, interval=None, clock=time.monotonic, sleep=time.sleep,
                 pause_seconds=None, max_pauses=None, probe_seconds=None, cap_seconds=None, wall=None, log=print):
        self._scraper = scraper
        self.BASE = scraper.BASE
        self.deadline = deadline
        self.pages = self.served = self.failures = self.unserved = self.brakes = 0
        self.brake_marks, self.brake_after = [], []
        self.interval = min_interval() if interval is None else interval
        self.pause_seconds = brake_pause_seconds() if pause_seconds is None else pause_seconds
        self.probe_seconds = brake_probe_seconds() if probe_seconds is None else probe_seconds
        self.cap_seconds = brake_cap_seconds() if cap_seconds is None else cap_seconds
        self.max_pauses = brake_pauses() if max_pauses is None else max_pauses
        self.pauses = self.resumed = self.probes = 0
        self.paused = 0.0
        self.halted = self.closed = False
        self._clock, self._sleep, self._last = clock, sleep, None
        self._good = None                 # la última página que cargó (_serving)
        self._run = 0                     # las páginas servidas desde el último freno (su cupo)
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

    def _count_served(self):
        self.served += 1
        self._run += 1

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
        self._count_served()
        return True

    def _idle(self, seconds):
        """Espera `seconds` sin pedir nada (la del freno): cuenta en `paused`."""
        if seconds <= 0:
            return
        began = self._clock()
        self._sleep(seconds)
        self.paused += self._clock() - began

    def _wait_brake(self, page, url):
        """La espera de un freno en `url`: la primera, de `pause_seconds`, sin pedir nada; después, un sondeo
        (la misma página, una sola petición, fresca) cada `probe_seconds` hasta que sirva, mientras cada uno
        quepa con BRAKE_ROOM antes del plazo y no pase de `cap_seconds` desde ahora (la página vacía). Da
        (¿cargó esta página?, ¿volvió a servir?): vuelve a servir si carga esta o, si esta no y no está
        vacía, otra (_serving: la federación sirve y esta página no)."""
        n = self._run
        self.brake_after.append(n)
        if self.max_pauses is not None and self.pauses >= self.max_pauses:
            self._log("      la federación frena (sin esperas: FIFLP_BRAKE_PAUSES=0): nada más en esta pasada"
                      if not self.max_pauses else
                      f"      la federación frena otra vez, y ya se esperaron {self.pauses} (FIFLP_BRAKE_PAUSES): "
                      "nada más en esta pasada")
            return False, False
        began = self._clock()
        if self.deadline is not None and began + self.pause_seconds + BRAKE_ROOM > self.deadline:
            self._log(f"      la federación frena y no queda plazo para esperarla ({self.pause_seconds / 60:g} min y "
                      f"{BRAKE_ROOM / 60:g} de margen): nada más en esta pasada")
            return False, False
        self.pauses += 1
        until = self._wall() + timedelta(seconds=self.cap_seconds)
        self._log(f"      la federación frena tras {n} página{'' if n == 1 else 's'}: espera de "
                  f"{self.pause_seconds / 60:g} min y después la misma página cada {self.probe_seconds:g} s, "
                  f"hasta las {until:%H:%M} UTC como mucho")
        self._idle(self.pause_seconds)
        while True:
            got = self._request(page, url, retries=1)
            if got is None:                       # tras el intervalo, pasado el plazo: ni se pidió
                self._log("      la federación sigue frenando y se acaba el plazo: nada más en esta pasada")
                return False, False
            self.probes += 1
            at = self._last                       # cuándo empezó el sondeo
            loaded, empty = got[0], EMPTY in got[1]
            if loaded or (not empty and self._serving(page, url)):
                self.resumed += 1
                self._run = 0 if loaded else 1       # la que cargó, la 1.ª de la vuelta (esta la cuenta _goto)
                self._log(f"      la federación vuelve a servir a los {at - began:.0f} s"
                          f"{'' if loaded else ', pero no esta página'}: se sigue")
                return loaded, True
            following = at + self.probe_seconds
            if following - began > self.cap_seconds:
                self._log(f"      la federación sigue frenando a los {at - began:.0f} s (tope de "
                          f"{self.cap_seconds / 60:g} min por freno): nada más en esta pasada")
                return False, False
            if self.deadline is not None and following + BRAKE_ROOM > self.deadline:
                self._log(f"      la federación sigue frenando a los {at - began:.0f} s y no queda plazo "
                          "para otro sondeo: nada más en esta pasada")
                return False, False
            self._log(f"      a los {at - began:.0f} s, sigue frenando")
            self._idle(following - self._clock())

    def goto(self, page, url):
        if self.halted or (self.deadline is not None and self._clock() > self.deadline):
            return False                  # frenada sin remedio, o pasado el plazo: ni se pide
        try:
            return self._goto(page, url)
        except _Closed:                   # el navegador, no la federación: ni señal del freno ni espera
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
        # En vez de rendirse, la espera del freno: la misma página hasta que vuelva a servir.
        braking = not loaded and (empty or streak)
        if braking:
            loaded, resumed = self._wait_brake(page, url)
            braking = not resumed
            self.halted = braking
        if loaded:
            self.failures = 0
            self._count_served()
        else:
            self.failures += 1
            self.unserved += braking
        return loaded

    def delay(self, extra=0):
        pause(extra)

    def __getattr__(self, name):          # parse_standings, parse_matches…: los del raspador
        return getattr(self._scraper, name)
