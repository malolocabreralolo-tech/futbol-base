#!/usr/bin/env python3
"""Scrape FIFLP actas (lineups + events + staff) for benjamin/prebenjamin
across all 5 seasons, incrementally and resumably.

Saves to scripts/fiflp_actas_<season>_raw.json keyed by CodActa (benjamín y
prebenjamín) y las de alevín APARTE, en scripts/fiflp_actas_<season>_alevin_raw.json,
cada lote con su índice y su estado (actas_lotes.py): el histórico alevín en el
mismo raw lo duplicaría y lo acercaría a los límites de GitHub. Cada competición va
al lote de su categoría (la del catálogo) y cada acta, al de la categoría de su
cabecera si la dice: nunca se mezclan, tampoco al refrescar ni con varios navegadores.

CLI:
  --temporada NN      (required) CodTemporada: 12..22
  --comps "id,id"     (optional) override comp list; otherwise auto-discover
  --categorias LISTA  (optional) 'benjamin,prebenjamin' (por defecto) o 'alevin' (solo
                      Gran Canaria, sin sala): las competiciones del catálogo que se recorren
  --max-actas N       (optional) cap for spike runs
  --dump-fixture COD  (optional) dump acta HTML to scripts/tests/fixtures/
  --estado            (optional) sin navegador: imprime {"pending", "stuck", "lotes"} de los
                      lotes de la tanda (lo lee actas-federacion.yml para encadenar)

Designed to run only in GitHub Actions (FIFLP blocks the local IP).
"""
import os, sys, re, json, time, random, argparse, threading
from pathlib import Path
from scripts.acta_parser import parse_acta
from scripts import actas_lotes

# Playwright is only needed at runtime (inside main()). Importing it at module
# level made the Tests CI pytest job red because the runner doesn't install
# Playwright. Lazy-import in main() instead.

# ── Constants ─────────────────────────────────────────────────────────────────

HERE = Path(__file__).parent   # donde van los raws, índices y estados (las pruebas lo cambian)
BASE = "https://www.fiflp.com/pnfg/NPcd"
UA   = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120 Safari/537")

SEASON_NAME = {
    # 12-16: temporadas anteriores a la web (2016-17 a 2020-21), solo para descargar sus datos.
    # 2015-16 (11) no tiene benjamín ni prebenjamín en la federación (sonda del 7/10/2026).
    "12": "2016-2017",
    "13": "2017-2018",
    "14": "2018-2019",
    "15": "2019-2020",
    "16": "2020-2021",
    "17": "2021-2022",
    "18": "2022-2023",
    "19": "2023-2024",
    "20": "2024-2025",
    "21": "2025-2026",
    # La temporada en curso: las actas que el bot (update_fiflp) ya no relee, p. ej. las de una fase
    # dada de alta tarde (alevín, Fuerteventura).
    "22": "2026-2027",
}

# Pre-shipped comp lists reused from existing scrapers.
# Seasons 17 and 18 use auto-discover at runtime.
KNOWN_COMPS = {
    "21": [c["id"] for c in
           __import__("scripts.fetch_fiflp", fromlist=["COMPETITIONS"]).COMPETITIONS],
    "20": [c["id"] for c in
           __import__("scripts.fetch_fiflp_2425", fromlist=["ALL_COMPETITIONS"]).ALL_COMPETITIONS],
    "19": [c["id"] for c in
           __import__("scripts.fetch_fiflp_2324", fromlist=["ALL_COMPETITIONS"]).ALL_COMPETITIONS],
}

# Regex to find CodActa anchors in page HTML
ACTA_HREF = re.compile(r"NFG_CmpPartido[^\"'\s]*CodActa=(\d+)", re.IGNORECASE)


def _categorias():
    try:
        from scripts import categorias
    except ImportError:
        import categorias
    return categorias


def catalog_comps(season_code, categories=None):
    """Ids de las competiciones de fútbol 7/8 de la temporada de las categorías dadas ('ALEVIN',
    'BENJAMIN'…; por defecto benjamín y prebenjamín), del catálogo y según
    categorias.category_of (sin sala ni alevín de Lanzarote o Fuerteventura); [] si el catálogo
    no la tiene."""
    C = _categorias()
    categories = categories or C.DEFAULT_CATEGORIES
    entry = _catalog_entry(season_code)
    return [c["id"] for c in entry.get("all", []) if C.category_of(c["name"]) in categories]


def _catalog_entry(season_code):
    path = Path(__file__).parent / "fiflp_comps_catalog.json"
    if season_code not in SEASON_NAME or not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8")).get(SEASON_NAME[season_code]) or {}


def catalog_names(season_code):
    """{id: nombre} de las competiciones de la temporada en el catálogo ({} si no la tiene)."""
    return {str(c["id"]): c["name"] for c in _catalog_entry(season_code).get("all", [])}


def comp_lotes(season_code, comps, categories=None, names=None):
    """{competición: lote} (actas_lotes: '' benjamín y prebenjamín, 'alevin' alevín), por el nombre
    de la competición en el catálogo o en `names` (el desplegable que lee discover_comps). Una que
    no está en ninguno va al lote de las categorías pedidas si son de uno solo; si son de los dos,
    no se sabe dónde guardarla y se para (ValueError): mejor no bajar que mezclar."""
    categories = categories or _categorias().DEFAULT_CATEGORIES
    known = {**catalog_names(season_code), **{str(k): v for k, v in (names or {}).items()}}
    asked = actas_lotes.lotes_of(categories)
    out = {}
    for comp in comps:
        lote = actas_lotes.lote_of_name(known.get(str(comp)))
        if lote is None:
            if len(asked) != 1:
                raise ValueError(f"competición {comp}: no está en el catálogo y las categorías "
                                 f"({', '.join(categories)}) son de los dos lotes; "
                                 "pide --categorias alevin o benjamin,prebenjamin")
            lote = asked[0]
        out[str(comp)] = lote
    return out


def run_lotes(season_code, categories=None, comps=None):
    """Los lotes de una tanda, en el orden de actas_lotes.LOTES: los de sus competiciones si se
    dan (--comps) y, si no, los de sus categorías. main escribe el estado de cada uno y --estado
    (actas-federacion.yml, para encadenar) los lee."""
    categories = categories or _categorias().DEFAULT_CATEGORIES
    wanted = (set(comp_lotes(season_code, comps, categories).values()) if comps
              else set(actas_lotes.lotes_of(categories)))
    return tuple(lote for lote in actas_lotes.LOTES if lote in wanted)


def index_path(season_code, lote=""):
    """Índice de actas enumeradas (cod_acta → comp, grupo, jornada): una tanda
    encadenada no vuelve a recorrer todas las jornadas de la temporada. Uno por lote."""
    return HERE / actas_lotes.file_name(SEASON_NAME[season_code], "index", lote)


def status_path(season_code, lote=""):
    return HERE / actas_lotes.file_name(SEASON_NAME[season_code], "status", lote)


def chain_state(season_code, lotes):
    """{"pending", "stuck", "lotes"} de la tanda por los estados de sus lotes: lo que quedan (un
    lote sin estado cuenta 1: que siga) y si está atascada (ningún lote trajo ningún acta ni dejó
    competiciones sin enumerar: lo que queda no se deja leer). La regla de actas-federacion.yml
    para lanzar otra tanda o pasar a la temporada siguiente."""
    pending, fetched, unenumerated, missing = 0, 0, 0, False
    for lote in lotes:
        try:
            status = json.loads(status_path(season_code, lote).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pending, missing = pending + 1, True
            continue
        pending += int(status.get("pending", 1))
        fetched += int(status.get("fetched", 1))
        unenumerated += int(status.get("unenumerated_comps") or 0)
    stuck = not missing and fetched == 0 and not unenumerated
    return {"pending": pending, "stuck": int(stuck), "lotes": list(lotes)}


def needs_refresh(acta):
    """Un acta aplanada leída antes de que se guardara todo el cuerpo técnico y el
    código del campo (fiflp_acta.STAFF_VERSION): --refrescar la vuelve a leer. Una
    cuya relectura salió peor (`staff_refresh_failed`) no se vuelve a pedir."""
    try:
        from scripts.fiflp_acta import STAFF_VERSION
    except ImportError:
        from fiflp_acta import STAFF_VERSION
    return (isinstance(acta, dict) and "consistent" in acta and (acta.get("staff_v") or 0) < STAFF_VERSION
            and not acta.get("staff_refresh_failed"))


def keep_old_on_refresh(old, new):
    """En --refrescar, la relectura solo sustituye al acta si es tan buena como
    ella: aplanada y, si la vieja cuadraba, cuadrando también."""
    if not isinstance(old, dict) or "consistent" not in old:
        return False
    return "consistent" not in new or (old.get("consistent") and not new.get("consistent"))


def needs_rescrape(acta):
    """Las actas leídas antes de octubre de 2026 (acta_parser, sin aplanar)
    traen la cabecera mal descifrada y sin minutos: se vuelven a leer. Una que
    ya se releyó con el lector aplanado y aun así no se dejó aplanar
    (`rescrape_failed`: la página de algunos partidos no tiene la forma de acta)
    no se vuelve a pedir: si no, cada tanda la leía otra vez y la cadena no
    paraba nunca (4/10/2026)."""
    return isinstance(acta, dict) and "consistent" not in acta and not acta.get("rescrape_failed")


# ── Low-level helpers ─────────────────────────────────────────────────────────

def delay(extra=0):
    time.sleep(random.uniform(2.0, 3.5) + extra)


def goto(page, url, retries=3):
    for attempt in range(retries):
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(2500)
            return True
        except Exception:
            time.sleep(10 * (attempt + 1))
    return False


def raw_path(season_code, lote=""):
    """scripts/fiflp_actas_<S>_raw.json (benjamín y prebenjamín) o, la del lote 'alevin',
    scripts/fiflp_actas_<S>_alevin_raw.json."""
    return HERE / actas_lotes.file_name(SEASON_NAME[season_code], "raw", lote)


def is_empty_acta(acta):
    """True when a parsed acta carries no data at all (the FIFLP anti-scrape
    empty frameset parsed into an all-None header with empty lineups).

    Such entries must never be treated as successfully scraped: persisting
    them poisons the resume state and the acta is skipped forever.
    """
    if not acta:
        return True
    h = acta.get("header") or {}
    lineups = acta.get("lineups") or {}
    return (
        all(h.get(k) is None for k in ("season", "home_team", "away_team", "date"))
        and not lineups.get("home")
        and not lineups.get("away")
    )


def load_raw(season_code, lote=""):
    p = raw_path(season_code, lote)
    if not p.exists():
        return {}
    data = json.loads(p.read_text(encoding="utf-8"))
    # Purge empty entries persisted by older runs so the resume logic treats
    # them as pending again (they were anti-scrape blanks, not real data).
    dead = [k for k, v in data.items() if is_empty_acta(v)]
    for k in dead:
        del data[k]
    if dead:
        print(f"  purged {len(dead)} empty acta(s) from resume state — will retry")
    return data


def save_raw(season_code, data, lote=""):
    raw_path(season_code, lote).write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def acta_lote(acta, default):
    """El lote de un acta leída: el de la categoría de su cabecera si la dice (un acta de alevín
    nunca va al raw de benjamín aunque su competición se tomara por otra) y, si no, `default`
    (el de su competición)."""
    competition = ((acta or {}).get("header") or {}).get("competition")
    lote = actas_lotes.lote_of_name(competition) if competition else None
    return default if lote is None else lote


class RawStore:
    """Las actas ya descargadas de una temporada, cada una en el raw de su lote. find la busca en
    todos; put la guarda en el de su lote (y la saca del otro si estaba allí); save reescribe solo
    los raws que han cambiado y los que se le piden (los de la tanda)."""

    def __init__(self, season_code):
        self.season = season_code
        self.raws = {}
        self.dirty = set()

    def raw(self, lote=""):
        if lote not in self.raws:
            self.raws[lote] = load_raw(self.season, lote)
        return self.raws[lote]

    def find(self, cod):
        """(lote, acta) del acta en el raw de cualquier lote, o (None, None)."""
        for lote in actas_lotes.LOTES:
            raw = self.raw(lote)
            if cod in raw:
                return lote, raw[cod]
        return None, None

    def put(self, lote, cod, acta):
        for other in actas_lotes.LOTES:
            if other != lote and cod in self.raw(other):
                del self.raws[other][cod]
                self.dirty.add(other)
        self.raw(lote)[cod] = acta
        self.dirty.add(lote)

    def save(self, lotes=()):
        for lote in actas_lotes.LOTES:
            if lote in self.dirty or lote in lotes:
                save_raw(self.season, self.raw(lote), lote)
        self.dirty.clear()


class Collector:
    """on_result de fetch_parallel (lo llaman los hilos de los navegadores, de uno en uno con su
    cerrojo): cada acta leída va al raw de su lote (acta_lote), nunca al del otro. Con --refrescar,
    la relectura que sale peor se descarta y la vieja queda marcada donde esté. Cuenta las actas
    aplanadas nuevas de cada lote (la de su competición: el avance de la cadena) y guarda cada
    `save_every`."""

    def __init__(self, store, refrescar=False, save_every=25, total=0, log=print):
        self.store, self.refrescar, self.save_every, self.total, self.log = store, refrescar, save_every, total, log
        self.lock = threading.Lock()
        self.fetched = 0
        self.by_lote = {}
        self.started = time.time()

    def __call__(self, t, acta):
        cod = t["cod_acta"]
        if acta is None:
            return
        if is_empty_acta(acta):
            # Anti-scrape blank survived all retries: do NOT persist it as
            # done, so the next incremental run retries this acta.
            self.log(f"  ! acta {cod} empty after retries — not persisted (will retry next run)")
            return
        acta["cod_acta"] = int(cod)
        acta["enumeration"] = {"comp_id": t["comp_id"], "grupo": t["grupo"], "jornada": t["jornada"]}
        flat = "consistent" in acta
        if not flat:
            acta["rescrape_failed"] = True     # leída ya con el lector nuevo: no se vuelve a pedir
        mine = t.get("lote", "")
        lote = acta_lote(acta, mine)
        with self.lock:
            old_lote, old = self.store.find(cod)
            if self.refrescar and keep_old_on_refresh(old, acta):
                # La relectura salió peor que la que ya había: se queda la vieja y no se vuelve a pedir.
                old["staff_refresh_failed"] = True
                self.store.dirty.add(old_lote)
                return
            if lote != mine:
                self.log(f"  ! acta {cod}: su cabecera es del lote '{lote or 'benjamín/prebenjamín'}' y su "
                         f"competición ({t['comp_id']}) del '{mine or 'benjamín/prebenjamín'}': va al raw de su cabecera")
            self.store.put(lote, cod, acta)
            # Solo cuenta como acta nueva la que se dejó aplanar: la cadena sigue mientras avanza.
            self.fetched += flat
            self.by_lote[mine] = self.by_lote.get(mine, 0) + flat
            # save every 25 actas to survive crashes
            if flat and self.fetched % self.save_every == 0:
                self.store.save()
                rate = (time.time() - self.started) / self.fetched
                self.log(f"    progress: {self.fetched}/{self.total} (saved; {rate:.1f} s por acta)")


# ── Comp discovery ────────────────────────────────────────────────────────────

def discover_comps(page, season_code, categories=None, names=None):
    """Read the comp dropdown from NFG_CmpJornada and keep those of `categories`
    (benjamín/prebenjamín by default; categorias.category_of). `names`, si se da,
    recibe {id: nombre} de las que se quedan (comp_lotes las reparte por lote)."""
    url = f"{BASE}/NFG_CmpJornada?cod_primaria=1000120&CodTemporada={season_code}"
    if not goto(page, url):
        return []
    opts = page.evaluate("""
        () => {
            const s = document.querySelector('select[name="competicion"]');
            if (!s) return [];
            return Array.from(s.options)
                .filter(o => o.value && o.value !== '0')
                .map(o => ({value: o.value, text: o.text.trim().toUpperCase()}));
        }""")
    C = _categorias()
    categories = categories or C.DEFAULT_CATEGORIES
    keep = [o["value"] for o in opts if C.category_of(o["text"]) in categories]
    if names is not None:
        names.update({o["value"]: o["text"] for o in opts if o["value"] in keep})
    print(f"  discovered {len(keep)} comps ({', '.join(categories)}) for season {season_code}")
    return keep


# ── Enumeration: Strategy 1 — main path (comp→grupo→jornada→anchor) ──────────

def _options(page, name, tries=4):
    """Valores del desplegable `name` (grupo, jornada); FIFLP a veces tarda en servirlo."""
    for _ in range(tries):
        try:
            values = page.evaluate(f"""() => Array.from(document.querySelectorAll('select[name="{name}"] option'))
                .filter(o => o.value && o.value !== '0').map(o => o.value)""")
        except Exception:
            values = []
        if values:
            return values
        page.wait_for_timeout(3000)
    return []


# --grupos: solo estos grupos. Entradas separadas por comas: 'GRUPO 5' (en todas
# las competiciones) o '54422885:GRUPO 13' (en esa); también vale el CodGrupo.
GROUP_FILTER = []


def _wanted(comp_id, value, text):
    if not GROUP_FILTER:
        return True
    for entry in GROUP_FILTER:
        comp, _, name = entry.rpartition(":")
        if comp and comp != str(comp_id):
            continue
        if name.strip().upper() in (str(value).upper(), (text or "").strip().upper()):
            return True
    return False


def enumerate_actas_main(page, season, comp_id):
    """Returns list of dicts: [{cod_acta, comp_id, grupo, jornada}, ...].

    comp → grupo → jornada por URL directa (&CodGrupo=G&CodJornada=N) y los
    CodActa de cada jornada. Antes elegía grupo con select_option y jornada con
    BuscarPartidos sobre el formulario de búsqueda, que la página trae OCULTO
    (#portlet_search, display:none): select_option daba timeout en todos los
    grupos salvo el primero (2025-26: solo el grupo 1 del prebenjamín).
    """
    out = []
    base = f"{BASE}/NFG_CmpJornada?cod_primaria=1000120&CodTemporada={season}&CodCompeticion={comp_id}"
    if not goto(page, base):
        return out
    try:
        labels = dict(page.evaluate("""() => Array.from(document.querySelectorAll('select[name="grupo"] option'))
            .map(o => [o.value, o.text.trim()])""") or [])
    except Exception:
        labels = {}
    grupos = [g for g in _options(page, "grupo") if _wanted(comp_id, g, labels.get(g))]
    for grupo in grupos:
        if not goto(page, f"{base}&CodGrupo={grupo}"):
            continue
        jornadas = _options(page, "jornada")
        if not jornadas:
            print(f"  WARN season={season} comp={comp_id} grupo={grupo} jornadas:0")
            continue
        for jornada in jornadas:
            if not goto(page, f"{base}&CodGrupo={grupo}&CodJornada={jornada}"):
                continue
            html = page.content()
            for m in ACTA_HREF.finditer(html):
                out.append({"cod_acta": m.group(1), "comp_id": comp_id, "grupo": grupo, "jornada": jornada})
            delay()
    # dedupe by cod_acta
    seen, uniq = set(), []
    for r in out:
        if r["cod_acta"] in seen:
            continue
        seen.add(r["cod_acta"])
        uniq.append(r)
    return uniq


# ── Enumeration: Strategy 2 — NFG_LstPartidos ────────────────────────────────

def enumerate_actas_lstpartidos(page, season, comp_id):
    """Strategy 2: scrape NFG_LstPartidos for the comp."""
    out = []
    url = (f"{BASE}/NFG_LstPartidos?cod_primaria=1000120"
           f"&CodTemporada={season}&CodCompeticion={comp_id}")
    if not goto(page, url):
        return out
    html = page.content()
    for m in ACTA_HREF.finditer(html):
        out.append({
            "cod_acta": m.group(1),
            "comp_id":  comp_id,
            "grupo":    None,
            "jornada":  None,
        })
    return list({r["cod_acta"]: r for r in out}.values())


# ── Enumeration: Strategy 3 — walk team pages ────────────────────────────────

def enumerate_actas_via_teams(page, season, comp_id):
    """Strategy 3: list teams in the comp, then walk each team's match list."""
    out = []
    url = (f"{BASE}/NFG_CmpJornada?cod_primaria=1000120"
           f"&CodTemporada={season}&CodCompeticion={comp_id}")
    if not goto(page, url):
        return out
    team_links = page.evaluate("""
        () => Array.from(document.querySelectorAll('a[href*="NFG_CmpEquipo"]'))
                   .map(a => a.getAttribute('href'))""")
    for href in set(team_links or []):
        team_url = BASE + "/" + href.lstrip("./")
        if not goto(page, team_url):
            continue
        html = page.content()
        for m in ACTA_HREF.finditer(html):
            out.append({
                "cod_acta": m.group(1),
                "comp_id":  comp_id,
                "grupo":    None,
                "jornada":  None,
            })
        delay()
    return list({r["cod_acta"]: r for r in out}.values())


# ── Enumeration: Strategy 4 — brute-force range scan ─────────────────────────

def enumerate_actas_by_range(page, season, comp_id, lo, hi):
    """Strategy 4: scan CodActa range, keep those whose header season matches.
    Expensive; use only for comps that strategies 1-3 cannot enumerate."""
    out = []
    target_season = SEASON_NAME[season]
    for cod in range(lo, hi + 1):
        acta = fetch_and_parse_acta(page, str(cod))
        if not acta:
            continue
        s = (acta.get("header", {}).get("season") or "").replace("/", "-")
        if s == target_season:
            out.append({
                "cod_acta": str(cod),
                "comp_id":  comp_id,
                "grupo":    None,
                "jornada":  None,
            })
        delay()
    return out


# ── Enumeration: Cascade (strategies 1 → 2 → 3; 4 is manual) ────────────────

def enumerate_actas_cascade(page, season, comp_id, tries=3):
    """Las actas de una competición por URL directa (enumerate_actas_main), con
    reintentos: la federación sirve a veces la página sin los desplegables de
    grupo o jornada, y eso no quiere decir que no haya actas.

    Las estrategias antiguas (NFG_LstPartidos, la página de cada equipo) ya no
    se usan solas: recorrer los equipos llevaba horas por competición y comía
    el plazo de la tanda (3/10/2026: 11 competiciones de 2024-25 sin enumerar).

    Returns (list_of_target_dicts, strategy_label_str).
    """
    for attempt in range(tries):
        res = enumerate_actas_main(page, season, comp_id)
        if res:
            print(f"  comp {comp_id}: {len(res)} actas (intento {attempt + 1})")
            return res, "main"
        time.sleep(20 * (attempt + 1))
    print(f"  comp {comp_id}: sin actas tras {tries} intentos")
    return [], "none"


# ── Fetch + parse single acta ─────────────────────────────────────────────────

def _fetch_acta_html(page, cod_acta):
    """Navigate to one acta URL and return concatenated frameset HTML, or '' on goto failure."""
    url = (f"{BASE}/NFG_CmpPartido?cod_primaria=1000120"
           f"&CodActa={cod_acta}&cod_acta={cod_acta}")
    if not goto(page, url):
        return ""
    # Frameset actas need a longer settle: the content frame issues its own
    # request after the outer frameset loads. 4s tracks the fixture-capture timing
    # that gave a valid parse.
    page.wait_for_timeout(4000)
    html = page.content()
    for fr in page.frames:
        if fr is page.main_frame:
            continue
        try:
            html += "\n<!--FRAME " + fr.url + "-->\n" + fr.content()
        except Exception:
            pass
    return html


def _is_empty_html(html):
    """FIFLP sometimes returns ~40-byte blank framesets as anti-scrape. Detect it."""
    return len(html) < 200 or "<body></body>" in html or "<body> </body>" in html


def fetch_and_parse_acta(page, cod_acta, dump_fixture_for=None, max_retries=2):
    """Fetch one acta (with retry-on-empty), optionally dump fixture, parse.

    FIFLP returns ~40-byte empty framesets ~50% of the time as anti-scrape. We
    retry up to `max_retries` times with a longer delay before giving up. This
    multiplies the harvest yield meaningfully (probe showed ~50% loss without
    retry; with 2 retries the loss drops substantially).

    Returns parsed dict from acta_parser.parse_acta, or None on goto failure.
    """
    html = ""
    for attempt in range(max_retries + 1):
        html = _fetch_acta_html(page, cod_acta)
        if not html:
            # goto itself failed — abandon (network-level), no point retrying
            return None
        if not _is_empty_html(html):
            break  # got real content
        if attempt < max_retries:
            # Longer cool-down before retry; FIFLP rate-limiter may relax
            delay(8 + 4 * attempt)
    # "first" sentinel dumps whatever the first acta we visit is — useful when
    # we don't yet know a good CodActa to target for diagnosis.
    if dump_fixture_for and (
        str(dump_fixture_for) == str(cod_acta) or str(dump_fixture_for).lower() == "first"
    ):
        fix_dir = Path("scripts/tests/fixtures")
        fix_dir.mkdir(parents=True, exist_ok=True)
        out_path = fix_dir / f"acta_live_{cod_acta}.html"
        out_path.write_text(html, encoding="utf-8")
        print(f"  dumped fixture: {out_path}")
    try:
        # Primero el acta tal como se ve (fiflp_render aplana la ofuscación de
        # marcadores, parciales y minutos; fiflp_acta la lee y comprueba que los
        # parciales cuadran). Si la página no tiene la forma de acta moderna,
        # el parser estático de siempre.
        result = None
        try:
            try:
                from scripts.fiflp_render import flatten
                from scripts.fiflp_acta import parse_flat_acta
            except ImportError:
                from fiflp_render import flatten
                from fiflp_acta import parse_flat_acta
            flatten(page)
            flat = parse_flat_acta(page.content())
            if flat["header"].get("home_team") and flat["lineups"]["home"]:
                result = flat
        except Exception as ex:
            print(f"  ! aplanado acta={cod_acta}: {ex}")
        if result is None:
            result = parse_acta(html)
    except Exception as ex:
        print(f"  ! parse error acta={cod_acta}: {ex}")
        return None
    # Auto-diagnostic: if every header field is None and lineups are empty, the
    # parser silently produced nothing. Save the HTML for one occurrence per
    # session so we can see what FIFLP actually served.
    h = result.get("header") or {}
    if all(h.get(k) is None for k in ("season", "home_team", "away_team", "date")) \
       and not result.get("lineups", {}).get("home") \
       and not getattr(fetch_and_parse_acta, "_dumped_failure", False):
        fix_dir = Path("scripts/tests/fixtures")
        fix_dir.mkdir(parents=True, exist_ok=True)
        out_path = fix_dir / f"acta_failed_{cod_acta}.html"
        out_path.write_text(html, encoding="utf-8")
        print(f"  ! parse failed silently (after {max_retries} retries) — dumped HTML to {out_path}")
        fetch_and_parse_acta._dumped_failure = True
    return result


# ── CLI ───────────────────────────────────────────────────────────────────────

def parse_args():
    ap = argparse.ArgumentParser(
        description="Scrape FIFLP actas for benjamín/prebenjamín."
    )
    ap.add_argument("--temporada", required=True, choices=list(SEASON_NAME),
                    help="CodTemporada: 12..22")
    ap.add_argument("--comps", default="",
                    help="Optional comma-separated comp IDs (override auto-discovery)")
    ap.add_argument("--categorias", default="",
                    help="Categorías del catálogo: 'benjamin,prebenjamin' (por defecto) o 'alevin'")
    ap.add_argument("--workers", type=int, default=2,
                    help="navegadores a la vez leyendo actas (por defecto 2)")
    ap.add_argument("--max-actas", type=int, default=0,
                    help="Cap on number of actas to process (0 = unlimited)")
    ap.add_argument("--max-minutes", type=int, default=0,
                    help="Minutos de descarga antes de parar limpio (0 = 330)")
    ap.add_argument("--reindex", action="store_true",
                    help="Volver a enumerar aunque haya índice (una fase nueva publicada)")
    ap.add_argument("--grupos", default="",
                    help="Solo estos grupos: 'GRUPO 5', '54422885:GRUPO 13' o el CodGrupo, separados por comas")
    ap.add_argument("--dump-fixture", default="",
                    help="CodActa whose raw HTML to dump to scripts/tests/fixtures/")
    ap.add_argument("--refrescar", action="store_true",
                    help="Volver a leer las actas ya descargadas sin todo el cuerpo técnico (needs_refresh)")
    ap.add_argument("--estado", action="store_true",
                    help="Sin navegador: imprime en JSON lo que queda de los lotes de la tanda (chain_state)")
    return ap.parse_args()


# ── Main ──────────────────────────────────────────────────────────────────────

def _fiflp_only(page):
    """Sin la publicidad de la federación (fiflp_render.fiflp_only), que colgaba la carga de cada acta."""
    try:
        from scripts.fiflp_render import fiflp_only
    except ImportError:
        from fiflp_render import fiflp_only
    return fiflp_only(page)


def fetch_parallel(pending, workers, over, on_result, dump_fixture="", open_page=None):
    """Lee las actas de `pending` con `workers` navegadores a la vez sobre una cola
    común (la federación tarda: leídas de una en una salían ~45 s por acta).
    Cada hilo tiene su Playwright y su página (la API síncrona va por hilo);
    on_result(target, acta) se llama desde los hilos. Para cuando over() es cierto.
    open_page() -> (page, close): inyectable en las pruebas."""
    import queue
    tasks = queue.Queue()
    for t in pending:
        tasks.put(t)

    def default_open():
        from playwright.sync_api import sync_playwright
        pw = sync_playwright().start()
        br = pw.chromium.launch(headless=True)
        page = _fiflp_only(br.new_context(user_agent=UA).new_page())
        return page, lambda: (br.close(), pw.stop())

    def worker():
        page, close = (open_page or default_open)()
        try:
            while not over():
                try:
                    t = tasks.get_nowait()
                except queue.Empty:
                    return
                try:
                    on_result(t, fetch_and_parse_acta(page, t["cod_acta"], dump_fixture))
                except Exception as ex:
                    print(f"  ! acta {t['cod_acta']}: {ex}")
                delay()
        finally:
            close()

    threads = [threading.Thread(target=worker, daemon=True) for _ in range(max(1, workers))]
    for th in threads:
        th.start()
    for th in threads:
        th.join()


def main():
    # Lazy import — keeps the module importable in environments without playwright
    # (the Tests CI pytest job doesn't install it).
    args = parse_args()
    GROUP_FILTER[:] = [g.strip() for g in args.grupos.split(",") if g.strip()]
    season = args.temporada
    categories = _categorias().parse_categories(args.categorias)
    comps_arg = [c.strip() for c in args.comps.split(",") if c.strip()]
    if args.estado:
        # Sin navegador ni red: lo que queda de los lotes de la tanda (actas-federacion.yml).
        try:
            state = chain_state(season, run_lotes(season, categories, comps_arg))
        except ValueError as ex:          # no se sabe de qué lote es: la cadena para
            state = {"pending": 0, "stuck": 1, "lotes": [], "error": str(ex)}
        print(json.dumps(state, ensure_ascii=False))
        return

    global sync_playwright
    from playwright.sync_api import sync_playwright  # noqa: F401

    # Resolve comp list
    names = {}
    if comps_arg:
        comps = comps_arg
    elif catalog_comps(season, categories):
        # Las competiciones de fútbol 7/8 de esas categorías de esa temporada (sin sala ni alevín
        # de otra isla) del catálogo de la federación (discover_fiflp_comps.py).
        comps = catalog_comps(season, categories)
    elif season in KNOWN_COMPS and categories == _categorias().DEFAULT_CATEGORIES:
        comps = KNOWN_COMPS[season]
    else:
        # auto-discover (used for seasons 17 and 18)
        with sync_playwright() as p:
            br = p.chromium.launch(headless=True)
            page = _fiflp_only(br.new_context(user_agent=UA).new_page())
            comps = discover_comps(page, season, categories, names)
            br.close()

    # Cada competición, a su lote (sus actas van a su raw, su índice y su estado): alevín aparte.
    lotes = comp_lotes(season, comps, categories, names)
    run = set(run_lotes(season, categories, comps_arg)) | set(lotes.values())
    run = tuple(lote for lote in actas_lotes.LOTES if lote in run)
    print(f"Season {SEASON_NAME[season]} ({season}): {len(comps)} comps to walk"
          + "".join(f"; lote {lote or 'benjamín/prebenjamín'}: {sum(1 for v in lotes.values() if v == lote)}"
                    for lote in run))

    store = RawStore(season)
    for lote in run:
        print(f"Resume state ({raw_path(season, lote).name}): {len(store.raw(lote))} actas already scraped")
    # El plazo cuenta desde el arranque: enumerar también lleva su tiempo.
    BUDGET = (args.max_minutes or 330) * 60   # bajo el timeout del job, para guardar y subir
    run_start = time.time()
    over = lambda: time.time() - run_start > BUDGET
    unenumerated = {lote: 0 for lote in run}

    with sync_playwright() as p:
        br = p.chromium.launch(headless=True)
        page = _fiflp_only(br.new_context(user_agent=UA).new_page())

        # --- Enumerate targets (o el índice de una tanda anterior), cada lote en su índice ---
        indexes = {}
        for lote in run:
            path = index_path(season, lote)
            indexes[lote] = json.loads(path.read_text(encoding="utf-8")) if path.exists() and not args.reindex else {}
        all_targets = []
        for comp_id in comps:
            lote = lotes[str(comp_id)]
            index = indexes[lote]
            cached = [dict(v, cod_acta=k, lote=lote) for k, v in index.items()
                      if str(v.get("comp_id")) == str(comp_id) and _wanted(comp_id, v.get("grupo"), v.get("grupo_name"))]
            if cached and not GROUP_FILTER:
                print(f"  comp {comp_id}: {len(cached)} actas del índice")
                all_targets += cached
                continue
            if over():
                unenumerated[lote] += 1   # la tanda siguiente la enumera
                continue
            started = time.time()
            print(f"  enumerating comp {comp_id}...")
            actas, strategy = enumerate_actas_cascade(page, season, comp_id)
            all_targets += [dict(t, lote=lote) for t in actas]
            for t in actas:
                index[t["cod_acta"]] = {k: v for k, v in t.items() if k != "cod_acta"}
            # Tras cada competición: una tanda cortada no pierde lo enumerado.
            index_path(season, lote).write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"    ({time.time() - started:.0f} s)")
            delay()
        for lote in run:
            index_path(season, lote).write_text(json.dumps(indexes[lote], ensure_ascii=False, indent=1),
                                                encoding="utf-8")

        # Dedupe all_targets by cod_acta (multiple comps may reference same acta)
        seen_t: set = set()
        deduped = []
        for t in all_targets:
            if t["cod_acta"] not in seen_t:
                seen_t.add(t["cod_acta"])
                deduped.append(t)
        all_targets = deduped

        # Filter out already scraped (resume support), esté en el raw del lote que esté.
        def wanted(cod):
            acta = store.find(cod)[1]
            return (acta is None or needs_rescrape(acta)
                    or (args.refrescar and needs_refresh(acta)))
        pending = [t for t in all_targets if wanted(t["cod_acta"])]
        print(f"Enumerated {len(all_targets)} actas total, {len(pending)} pending")

        # --- Fetch + parse loop ---
        br.close()

    if args.max_actas:
        pending = pending[:args.max_actas]
    collector = Collector(store, refrescar=args.refrescar, total=len(pending))
    fetch_parallel(pending, args.workers, over, collector, dump_fixture=args.dump_fixture)
    if over():
        print(f"  time budget reached, stopping cleanly with "
              f"{sum(len(store.raw(lote)) for lote in run)} actas saved")

    store.save(run)
    for lote in run:
        mine = [t for t in all_targets if t["lote"] == lote]
        left = sum(1 for t in mine if wanted(t["cod_acta"]))
        in_raw = len(store.raw(lote))
        # Una competición sin enumerar por falta de plazo cuenta como pendiente: la cadena sigue.
        status_path(season, lote).write_text(json.dumps(
            {"season": SEASON_NAME[season], "enumerated": len(mine), "in_raw": in_raw,
             "pending": left + unenumerated[lote], "unenumerated_comps": unenumerated[lote],
             "fetched": collector.by_lote.get(lote, 0)}, indent=1) + "\n", encoding="utf-8")
        print(f"Done season {season} ({raw_path(season, lote).name}): total {in_raw} actas in raw, {left} pending")


if __name__ == "__main__":
    main()
