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
from playwright.sync_api import sync_playwright
from scripts.acta_parser import parse_acta

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


def load_raw(season_code):
    p = raw_path(season_code)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


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

def enumerate_actas_main(page, season, comp_id):
    """Returns list of dicts: [{cod_acta, comp_id, grupo, jornada}, ...].

    Navigates the NFG_CmpJornada dropdown tree: comp → grupo → jornada →
    BuscarPartidos(jornada) → scan anchors for CodActa.
    """
    out = []
    # IMPORTANT: navigate WITHOUT comp_id in URL, then use page.select_option
    # to trigger the FIFLP AJAX. Putting comp_id in the URL skips the AJAX and
    # the grupo/jornada selects load empty / null. Pattern matches the proven
    # fetch_fiflp.py::scrape_competition.
    if not goto(page, f"{BASE}/NFG_CmpJornada?cod_primaria=1000120&CodTemporada={season}"):
        return out
    try:
        page.select_option('select[name="competicion"]', comp_id)
        page.wait_for_timeout(2000)
    except Exception as e:
        print(f"  WARN season={season} comp={comp_id} could not select competition: {e}")
        return out
    grupos = page.evaluate("""
        () => Array.from(document.querySelectorAll('select[name="grupo"] option'))
                   .filter(o => o.value && o.value !== '0')
                   .map(o => o.value)""")
    for grupo in grupos:
        try:
            page.select_option('select[name="grupo"]', grupo)
            try:
                page.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                page.wait_for_timeout(2000)
        except Exception as e:
            print(f"  WARN season={season} comp={comp_id} grupo={grupo} select failed: {e}")
            continue
        jornadas = page.evaluate("""
            () => Array.from(document.querySelectorAll('select[name="jornada"] option'))
                       .filter(o => o.value && o.value !== '0')
                       .map(o => o.value)""")
        if not jornadas:
            print(f"  WARN season={season} comp={comp_id} grupo={grupo} jornadas:0")
            continue
        for jornada in jornadas:
            try:
                page.evaluate(f"BuscarPartidos('{jornada}')")
                page.wait_for_timeout(1500)
            except Exception:
                continue
            html = page.content()
            for m in ACTA_HREF.finditer(html):
                out.append({
                    "cod_acta": m.group(1),
                    "comp_id":  comp_id,
                    "grupo":    grupo,
                    "jornada":  jornada,
                })
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

def enumerate_actas_cascade(page, season, comp_id):
    """Try enumeration strategies 1→3; return first non-empty result.

    Strategy precedence:
      1. main       — NFG_CmpJornada dropdown (grupo→jornada→BuscarPartidos)
      2. lstpart.   — NFG_LstPartidos flat list
      3. teams      — walk each team's NFG_CmpEquipo page

    Strategy 4 (enumerate_actas_by_range) is NOT auto-invoked: it fetches
    every CodActa in a numeric range and is expensive. Invoke it manually
    when strategies 1-3 yield nothing for an old season.

    Returns (list_of_target_dicts, strategy_label_str).
    """
    for label, fn in (
        ("main",      lambda: enumerate_actas_main(page, season, comp_id)),
        ("lstpart.",  lambda: enumerate_actas_lstpartidos(page, season, comp_id)),
        ("teams",     lambda: enumerate_actas_via_teams(page, season, comp_id)),
    ):
        res = fn()
        if res:
            print(f"  comp {comp_id} via strategy={label}: {len(res)} actas")
            return res, label
    print(f"  comp {comp_id}: NO actas via strategies 1-3 — needs range scan (manual)")
    return [], "none"


# ── Fetch + parse single acta ─────────────────────────────────────────────────

def fetch_and_parse_acta(page, cod_acta, dump_fixture_for=None):
    """Fetch one acta page (frameset + frames), optionally dump fixture, parse.

    The acta lives in a frameset: we capture main frame content then
    concatenate each child frame's HTML (marked with <!--FRAME url-->).
    If dump_fixture_for matches cod_acta the raw HTML is written to
    scripts/tests/fixtures/acta_<cod>.html for offline TDD use.

    Returns parsed dict from acta_parser.parse_acta, or None on failure.
    """
    url = (f"{BASE}/NFG_CmpPartido?cod_primaria=1000120"
           f"&CodActa={cod_acta}&cod_acta={cod_acta}")
    if not goto(page, url):
        return None
    # Frameset actas need a longer settle: the content frame issues its own
    # request after the outer frameset loads. 2s was too short — the smoke
    # run got empty parses because the inner frame's body was not yet there
    # when we called page.content(). 4s tracks the fixture-capture timing
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
    if dump_fixture_for and str(dump_fixture_for) == str(cod_acta):
        fix_dir = Path("scripts/tests/fixtures")
        fix_dir.mkdir(parents=True, exist_ok=True)
        (fix_dir / f"acta_{cod_acta}.html").write_text(html, encoding="utf-8")
        print(f"  dumped fixture: scripts/tests/fixtures/acta_{cod_acta}.html")
    try:
        return parse_acta(html)
    except Exception as ex:
        print(f"  ! parse error acta={cod_acta}: {ex}")
        return None


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
    ap.add_argument("--dump-fixture", default="",
                    help="CodActa whose raw HTML to dump to scripts/tests/fixtures/")
    return ap.parse_args()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()
    season = args.temporada

    # Resolve comp list
    if args.comps:
        comps = [c.strip() for c in args.comps.split(",") if c.strip()]
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

    with sync_playwright() as p:
        br = p.chromium.launch(headless=True)
        page = br.new_context(user_agent=UA).new_page()

        # --- Enumerate targets ---
        all_targets = []
        for comp_id in comps:
            print(f"  enumerating comp {comp_id} (cascade)...")
            actas, strategy = enumerate_actas_cascade(page, season, comp_id)
            all_targets += actas
            delay()

        # Dedupe all_targets by cod_acta (multiple comps may reference same acta)
        seen_t: set = set()
        deduped = []
        for t in all_targets:
            if t["cod_acta"] not in seen_t:
                seen_t.add(t["cod_acta"])
                deduped.append(t)
        all_targets = deduped

        # Filter out already scraped (resume support)
        pending = [t for t in all_targets if t["cod_acta"] not in raw]
        print(f"Enumerated {len(all_targets)} actas total, {len(pending)} pending")

        # --- Fetch + parse loop ---
        BUDGET = 5.5 * 3600   # leave headroom under GitHub Actions 6h timeout
        run_start = time.time()

        for i, t in enumerate(pending):
            if args.max_actas and i >= args.max_actas:
                break
            if time.time() - run_start > BUDGET:
                print(
                    f"  time budget reached, stopping cleanly "
                    f"with {len(raw)} actas saved"
                )
                break
            cod = t["cod_acta"]
            acta = fetch_and_parse_acta(page, cod, args.dump_fixture)
            if acta is None:
                continue
            acta["cod_acta"]    = int(cod)
            acta["enumeration"] = {
                "comp_id": t["comp_id"],
                "grupo":   t["grupo"],
                "jornada": t["jornada"],
            }
            raw[cod] = acta
            # save every 25 actas to survive crashes
            if (i + 1) % 25 == 0:
                save_raw(season, raw)
                print(f"    progress: {i+1}/{len(pending)} (saved)")
            delay()

        br.close()

    save_raw(season, raw)
    print(f"Done season {season}: total {len(raw)} actas in raw")


if __name__ == "__main__":
    main()
