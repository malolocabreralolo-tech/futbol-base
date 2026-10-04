#!/usr/bin/env python3
"""Scrape FIFLP actas (lineups + events + staff) for benjamin/prebenjamin
across all 5 seasons, incrementally and resumably.

Saves to scripts/fiflp_actas_<season>_raw.json keyed by CodActa.

CLI:
  --temporada NN      (required) CodTemporada: 17..21
  --comps "id,id"     (optional) override comp list; otherwise auto-discover
  --max-actas N       (optional) cap for spike runs
  --dump-fixture COD  (optional) dump acta HTML to scripts/tests/fixtures/

Designed to run only in GitHub Actions (FIFLP blocks the local IP).
"""
import os, sys, re, json, time, random, argparse
from pathlib import Path
from scripts.acta_parser import parse_acta

# Playwright is only needed at runtime (inside main()). Importing it at module
# level made the Tests CI pytest job red because the runner doesn't install
# Playwright. Lazy-import in main() instead.

# ── Constants ─────────────────────────────────────────────────────────────────

BASE = "https://www.fiflp.com/pnfg/NPcd"
UA   = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120 Safari/537")

SEASON_NAME = {
    "17": "2021-2022",
    "18": "2022-2023",
    "19": "2023-2024",
    "20": "2024-2025",
    "21": "2025-2026",
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

KEYWORDS_BENJ = ("BENJAMIN", "BENJAMÍN", "PREBENJAMIN", "PREBENJAMÍN")

# Regex to find CodActa anchors in page HTML
ACTA_HREF = re.compile(r"NFG_CmpPartido[^\"'\s]*CodActa=(\d+)", re.IGNORECASE)


def catalog_comps(season_code):
    """Ids de las competiciones benjamín/prebenjamín de fútbol 7/8 (sin sala)
    de la temporada, del catálogo; [] si el catálogo no la tiene."""
    path = Path(__file__).parent / "fiflp_comps_catalog.json"
    if season_code not in SEASON_NAME or not path.exists():
        return []
    entry = json.loads(path.read_text(encoding="utf-8")).get(SEASON_NAME[season_code]) or {}
    fold = lambda t: t.upper().replace("Í", "I").replace("É", "E")
    return [c["id"] for c in entry.get("all", [])
            if "BENJAMIN" in fold(c["name"]) and "SALA" not in fold(c["name"]) and "LPFS" not in fold(c["name"])]


def index_path(season_code):
    """Índice de actas enumeradas (cod_acta → comp, grupo, jornada): una tanda
    encadenada no vuelve a recorrer todas las jornadas de la temporada."""
    return Path(__file__).parent / f"fiflp_actas_{SEASON_NAME[season_code]}_index.json"


def status_path(season_code):
    return Path(__file__).parent / f"fiflp_actas_{SEASON_NAME[season_code]}_status.json"


def needs_rescrape(acta):
    """Las actas leídas antes de octubre de 2026 (acta_parser, sin aplanar)
    traen la cabecera mal descifrada y sin minutos: se vuelven a leer."""
    return isinstance(acta, dict) and "consistent" not in acta


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


def raw_path(season_code):
    return Path(__file__).parent / f"fiflp_actas_{SEASON_NAME[season_code]}_raw.json"


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


def load_raw(season_code):
    p = raw_path(season_code)
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


def save_raw(season_code, data):
    raw_path(season_code).write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ── Comp discovery ────────────────────────────────────────────────────────────

def discover_comps(page, season_code):
    """Read the comp dropdown from NFG_CmpJornada and keep benjamín/prebenjamín."""
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
    keep = [o["value"] for o in opts if any(k in o["text"] for k in KEYWORDS_BENJ)]
    print(f"  discovered {len(keep)} benjamin/preben comps for season {season_code}")
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
                    help="CodTemporada: 17..21")
    ap.add_argument("--comps", default="",
                    help="Optional comma-separated comp IDs (override auto-discovery)")
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
    return ap.parse_args()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    # Lazy import — keeps the module importable in environments without playwright
    # (the Tests CI pytest job doesn't install it).
    global sync_playwright
    from playwright.sync_api import sync_playwright  # noqa: F401

    args = parse_args()
    GROUP_FILTER[:] = [g.strip() for g in args.grupos.split(",") if g.strip()]
    season = args.temporada

    # Resolve comp list
    if args.comps:
        comps = [c.strip() for c in args.comps.split(",") if c.strip()]
    elif catalog_comps(season):
        # Las competiciones benjamín/prebenjamín de fútbol 7/8 de esa temporada
        # (sin sala) del catálogo de la federación (discover_fiflp_comps.py).
        comps = catalog_comps(season)
    elif season in KNOWN_COMPS:
        comps = KNOWN_COMPS[season]
    else:
        # auto-discover (used for seasons 17 and 18)
        with sync_playwright() as p:
            br = p.chromium.launch(headless=True)
            page = br.new_context(user_agent=UA).new_page()
            comps = discover_comps(page, season)
            br.close()

    print(f"Season {SEASON_NAME[season]} ({season}): {len(comps)} comps to walk")

    raw = load_raw(season)
    print(f"Resume state: {len(raw)} actas already scraped")
    fetched = 0
    # El plazo cuenta desde el arranque: enumerar también lleva su tiempo.
    BUDGET = (args.max_minutes or 330) * 60   # bajo el timeout del job, para guardar y subir
    run_start = time.time()
    over = lambda: time.time() - run_start > BUDGET
    unenumerated = 0

    with sync_playwright() as p:
        br = p.chromium.launch(headless=True)
        page = br.new_context(user_agent=UA).new_page()

        # --- Enumerate targets (o el índice de una tanda anterior) ---
        index = {}
        if index_path(season).exists() and not args.reindex:
            index = json.loads(index_path(season).read_text(encoding="utf-8"))
        all_targets = []
        for comp_id in comps:
            cached = [dict(v, cod_acta=k) for k, v in index.items()
                      if str(v.get("comp_id")) == str(comp_id) and _wanted(comp_id, v.get("grupo"), v.get("grupo_name"))]
            if cached and not GROUP_FILTER:
                print(f"  comp {comp_id}: {len(cached)} actas del índice")
                all_targets += cached
                continue
            if over():
                unenumerated += 1         # la tanda siguiente la enumera
                continue
            started = time.time()
            print(f"  enumerating comp {comp_id}...")
            actas, strategy = enumerate_actas_cascade(page, season, comp_id)
            all_targets += actas
            for t in actas:
                index[t["cod_acta"]] = {k: v for k, v in t.items() if k != "cod_acta"}
            # Tras cada competición: una tanda cortada no pierde lo enumerado.
            index_path(season).write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"    ({time.time() - started:.0f} s)")
            delay()
        index_path(season).write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")

        # Dedupe all_targets by cod_acta (multiple comps may reference same acta)
        seen_t: set = set()
        deduped = []
        for t in all_targets:
            if t["cod_acta"] not in seen_t:
                seen_t.add(t["cod_acta"])
                deduped.append(t)
        all_targets = deduped

        # Filter out already scraped (resume support)
        pending = [t for t in all_targets if t["cod_acta"] not in raw or needs_rescrape(raw[t["cod_acta"]])]
        print(f"Enumerated {len(all_targets)} actas total, {len(pending)} pending")

        # --- Fetch + parse loop ---
        for i, t in enumerate(pending):
            if args.max_actas and i >= args.max_actas:
                break
            if over():
                print(
                    f"  time budget reached, stopping cleanly "
                    f"with {len(raw)} actas saved"
                )
                break
            cod = t["cod_acta"]
            acta = fetch_and_parse_acta(page, cod, args.dump_fixture)
            if acta is None:
                continue
            if is_empty_acta(acta):
                # Anti-scrape blank survived all retries: do NOT persist it as
                # done, so the next incremental run retries this acta.
                print(f"  ! acta {cod} empty after retries — not persisted (will retry next run)")
                continue
            acta["cod_acta"]    = int(cod)
            acta["enumeration"] = {
                "comp_id": t["comp_id"],
                "grupo":   t["grupo"],
                "jornada": t["jornada"],
            }
            raw[cod] = acta
            fetched += 1
            # save every 25 actas to survive crashes
            if (i + 1) % 25 == 0:
                save_raw(season, raw)
                print(f"    progress: {i+1}/{len(pending)} (saved)")
            delay()

        br.close()

    save_raw(season, raw)
    left = sum(1 for t in all_targets if t["cod_acta"] not in raw or needs_rescrape(raw[t["cod_acta"]]))
    # Una competición sin enumerar por falta de plazo cuenta como pendiente: la cadena sigue.
    status_path(season).write_text(json.dumps({"season": SEASON_NAME[season], "enumerated": len(all_targets),
                                               "in_raw": len(raw), "pending": left + unenumerated,
                                               "unenumerated_comps": unenumerated, "fetched": fetched},
                                              indent=1) + "\n", encoding="utf-8")
    print(f"Done season {season}: total {len(raw)} actas in raw, {left} pending")


if __name__ == "__main__":
    main()
