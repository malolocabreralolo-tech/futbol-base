#!/usr/bin/env python3
"""
fetch_fiflp_2425.py — Scrapes FIFLP for Benjamin + Prebenjamin 2024/2025.
Uses CodTemporada=20 to access the previous season.
Saves progressively to fiflp_2425_raw.json.
"""

import json, os, re, time, random
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_PATH  = os.path.join(PROJECT_ROOT, "scripts", "fiflp_2425_raw.json")
BASE = "https://www.fiflp.com/pnfg/NPcd"
SEASON = "20"  # CodTemporada for 2024-2025

ALL_COMPETITIONS = [
    # Benjamin Gran Canaria
    {"id": "1576", "name": "Primera Benjamin GC",            "cat": "benjamin",    "island": "grancanaria",   "phase": "Primera Fase"},
    {"id": "1706", "name": "Benjamin GC Segunda Fase A",     "cat": "benjamin",    "island": "grancanaria",   "phase": "Segunda Fase A"},
    {"id": "1707", "name": "Benjamin GC Segunda Fase B",     "cat": "benjamin",    "island": "grancanaria",   "phase": "Segunda Fase B"},
    {"id": "1708", "name": "Benjamin GC Segunda Fase C",     "cat": "benjamin",    "island": "grancanaria",   "phase": "Segunda Fase C"},
    {"id": "1709", "name": "Benjamin GC Segunda Fase D",     "cat": "benjamin",    "island": "grancanaria",   "phase": "Segunda Fase D"},
    {"id": "1710", "name": "Benjamin GC Segunda Fase E",     "cat": "benjamin",    "island": "grancanaria",   "phase": "Segunda Fase E"},
    # Benjamin Copa de Campeones (one per Segunda Fase tier, knockout final phase)
    {"id": "1727", "name": "Copa Campeones Benjamin Fase A", "cat": "benjamin",    "island": "grancanaria",   "phase": "Copa Campeones A"},
    {"id": "1728", "name": "Copa Campeones Benjamin Fase B", "cat": "benjamin",    "island": "grancanaria",   "phase": "Copa Campeones B"},
    {"id": "1729", "name": "Copa Campeones Benjamin Fase C", "cat": "benjamin",    "island": "grancanaria",   "phase": "Copa Campeones C"},
    {"id": "1730", "name": "Copa Campeones Benjamin Fase D", "cat": "benjamin",    "island": "grancanaria",   "phase": "Copa Campeones D"},
    {"id": "1719", "name": "Copa Campeones Benjamin Fase E", "cat": "benjamin",    "island": "grancanaria",   "phase": "Copa Campeones E"},
    # Benjamin Lanzarote
    {"id": "1575", "name": "Benjamin Lanzarote Preferente",  "cat": "benjamin",    "island": "lanzarote",     "phase": "Preferente"},
    {"id": "1578", "name": "Benjamin Lanzarote Primera",     "cat": "benjamin",    "island": "lanzarote",     "phase": "Primera"},
    # Benjamin Fuerteventura
    {"id": "1579", "name": "Benjamin Fuerteventura Fase 1",  "cat": "benjamin",    "island": "fuerteventura", "phase": "Fase 1"},
    {"id": "1583", "name": "Benjamin Fuerteventura Fase 2",  "cat": "benjamin",    "island": "fuerteventura", "phase": "Fase 2"},
    # Prebenjamin
    {"id": "1581", "name": "Prebenjamin Gran Canaria",       "cat": "prebenjamin", "island": "grancanaria",   "phase": "Gran Canaria"},
    {"id": "1469", "name": "Copa de Campeones Prebenjamin",  "cat": "prebenjamin", "island": "grancanaria",   "phase": "Copa de Campeones"},
]

# Use resume: if fiflp_2425_raw.json exists, skip already-done competitions
# Filter by SCRAPE_IDS env var (comma-separated IDs) if set
_ids_env = os.environ.get("SCRAPE_IDS", "")
COMPETITIONS = [c for c in ALL_COMPETITIONS if c["id"] in _ids_env.split(",")] if _ids_env else ALL_COMPETITIONS


def delay(extra=0):
    time.sleep(random.uniform(2.0, 3.5) + extra)

def save(data):
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def goto(page, url, retries=3):
    for attempt in range(retries):
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(2500)
            return True
        except Exception:
            wait = 15 * (attempt + 1)
            print(f"\n      Timeout ({attempt+1}/{retries}), waiting {wait}s...", end="", flush=True)
            time.sleep(wait)
    return False

def wait_after_select(page):
    try:
        page.wait_for_load_state("networkidle", timeout=8000)
    except Exception:
        page.wait_for_timeout(3000)


def parse_standings(page):
    def si(v):
        try: return int(v)
        except: return 0
    results = []
    best, best_n = None, 0
    for t in page.query_selector_all('table'):
        n = sum(1 for r in t.query_selector_all('tr')
                if len(r.query_selector_all('td')) in (10, 11, 16, 17))
        if n > best_n:
            best_n, best = n, t
    if not best:
        return results
    for row in best.query_selector_all('tr'):
        cells = row.query_selector_all('td')
        nc = len(cells)
        if nc not in (10, 11, 16, 17): continue
        tx = [c.inner_text().strip().replace('\xa0', ' ') for c in cells]
        try:    pos = int(tx[1])
        except: continue
        team = re.sub(r'\s+', ' ', tx[2]).strip()
        if not team: continue
        if nc in (17, 11):   pts, base = si(tx[4]), 5
        else:                pts, base = si(tx[3]), 4
        if nc in (17, 16):
            j  = si(tx[base])   + si(tx[base+4])
            g  = si(tx[base+1]) + si(tx[base+5])
            e  = si(tx[base+2]) + si(tx[base+6])
            p  = si(tx[base+3]) + si(tx[base+7])
            gf, gc = si(tx[base+8]), si(tx[base+9])
            df, form_raw = gf - gc, tx[base+10]
        else:
            j, g, e, p = si(tx[base]), si(tx[base+1]), si(tx[base+2]), si(tx[base+3])
            gf = gc = df = None
            form_raw = tx[base+4]
        form = re.sub(r'[^GEP]', '', form_raw.upper())
        results.append({"pos": pos, "team": team, "pts": pts,
                        "j": j, "g": g, "e": e, "p": p,
                        "gf": gf, "gc": gc, "df": df, "form": form})
    return results


# ntype(id, n, i, oldClass) sets the element's class to fa-D[(i*10)+n]; the
# 4th arg is the DECOY old class. Same lookup table as the actas parser.
_NTYPE_D = [2, 5, 9, 4, 1, 0, 8, 6, 3, 7,
            1, 3, 5, 7, 9, 0, 2, 4, 6, 8,
            0, 2, 4, 6, 8, 1, 3, 5, 7, 9,
            7, 5, 2, 0, 9, 6, 3, 8, 4, 1]


def _extract_score_from_html(score_html):
    """Parse home/away scores from FIFLP's anti-scrape obfuscated score cell.

    FIFLP renders each score inside `<span class="wid2_resultado_cerrada ...">`
    using several techniques to defeat naive scraping:
      A) Plain digit:           <i class="fa-solid">N</i>
      B) Hidden fallback span:  <span style="display:none;">N</span>
      C) JS class transform:    ntype(id, X, Y, "fa-N")  (final class encodes N)
      D) CSS pseudo-element:    <style>#ID:before{content:"N"}</style>
      E) Packed JS injection that resolves at runtime

    For each score span we try A→D in order; if all fail (case E), pull any
    leftover standalone digit from the span markup.
    """
    spans = re.findall(
        r'<span\s+class="wid2_resultado_cerrada[^"]*"[^>]*>(.*?)</span>\s*'
        r'(?=<span\s+class="wid2_resultado_cerrada|</strong>)',
        score_html, re.DOTALL,
    )
    out = []
    for s in spans:
        # ntype calls are the authoritative obfuscated digits — decode every one
        # in the span (DOM order) for multi-digit scores, via the D table (NOT
        # the decoy 4th arg). Check first; league pages without ntype fall through.
        nts = re.findall(r'ntype\("[^"]*",\s*(\d+),\s*(\d+)\s*,', s)
        if nts:
            digits = "".join(
                str(_NTYPE_D[(int(i) * 10) + int(n)])
                for n, i in nts
                if 0 <= (int(i) * 10) + int(n) < len(_NTYPE_D)
            )
            out.append(int(digits) if digits else None)
            continue
        m = re.search(r'<span\s+style="display:\s*none;?"\s*>(\d+)</span>', s)
        if m: out.append(int(m.group(1))); continue
        m = re.search(r'<i class="fa-solid">\s*(\d+)\s*</i>', s)
        if m: out.append(int(m.group(1))); continue
        m = re.search(r':before\s*\{[^}]*content:\s*"(\d+)"', s)
        if m: out.append(int(m.group(1))); continue
        # Last resort: any standalone digit in the span markup that isn't
        # part of an ntype id/arg or fa-X class.
        candidates = re.findall(r'(?<![\w-])(\d)(?![\w-])', re.sub(
            r'(?:ntype\([^)]*\))|(?:fa-\d)|(?:idh\d+)|(?:id="[^"]*")', '', s))
        out.append(int(candidates[0]) if candidates else None)
    if len(out) >= 2: return out[0], out[1]
    if len(out) == 1: return out[0], None
    return None, None


def _scores_from_browser(score_cell):
    """Last-resort: ask the browser for the actually-rendered score digits.

    Reads each `.wid2_resultado_cerrada` span's :before/inner content as
    computed by the browser AFTER FIFLP's anti-scrape JS has run.
    """
    try:
        return score_cell.evaluate("""(cell) => {
            const spans = cell.querySelectorAll('.wid2_resultado_cerrada');
            const out = [];
            for (const span of spans) {
                let digit = null;
                // 1) inner text (post-JS)
                const txt = (span.innerText || span.textContent || '').trim();
                let m = txt.match(/(\\d+)/);
                if (m) { out.push(parseInt(m[1])); continue; }
                // 2) CSS ::before content of inner elements
                for (const el of span.querySelectorAll('*')) {
                    const c = window.getComputedStyle(el, '::before').content;
                    const cm = (c || '').match(/(\\d+)/);
                    if (cm) { digit = parseInt(cm[1]); break; }
                }
                out.push(digit);
            }
            return out;
        }""")
    except Exception:
        return []


def parse_matches(page):
    matches, seen = [], set()
    for table in page.query_selector_all('table'):
        rows = table.query_selector_all('tr')
        if len(rows) not in (2, 3): continue
        r0 = rows[0].query_selector_all('td')
        # Some Copa de Campeones rows have 5 cells; for those, treat row 1 as
        # the standard 3-cell match row and ignore row 0.
        if len(r0) == 5 and len(rows) >= 2:
            r0 = rows[1].query_selector_all('td')
            r1 = rows[2].query_selector_all('td') if len(rows) >= 3 else []
        else:
            r1 = rows[1].query_selector_all('td') if len(rows) >= 2 else []
        if len(r0) != 3: continue
        home = re.sub(r'\s+', ' ', r0[0].inner_text().strip().replace('\xa0', ' ')).strip()
        away = re.sub(r'\s+', ' ', r0[2].inner_text().strip().replace('\xa0', ' ')).strip()
        if not home or not away: continue
        key = f"{home}|{away}"
        if key in seen: continue
        seen.add(key)
        # Prefer parsing the INNER HTML of the score cell — FIFLP's anti-scrape
        # obfuscation leaves digits visible only in HTML (CSS pseudo-elements,
        # hidden fallback spans, JS-transformed classes), not in inner_text.
        score_html = r0[1].inner_html()
        hs, as_ = _extract_score_from_html(score_html)
        # Fallback: ask the browser for computed/rendered scores when the
        # static HTML extraction missed them (packed runtime JS injection).
        if hs is None or as_ is None:
            browser_scores = _scores_from_browser(r0[1])
            if len(browser_scores) >= 2:
                if hs is None: hs = browser_scores[0]
                if as_ is None: as_ = browser_scores[1]
        score_raw = r0[1].inner_text().strip().replace('\xa0', ' ')
        lines = [l.strip() for l in score_raw.split('\n') if l.strip()]
        date_str = time_str = ''
        for line in lines:
            if hs is None and as_ is None:
                # Fallback — only use inner_text scores if HTML extraction failed.
                m = re.match(r'^(\d*)\s*-\s*(\d*)$', line)
                if m:
                    hs  = int(m.group(1)) if m.group(1) else None
                    as_ = int(m.group(2)) if m.group(2) else None
                    continue
            if re.match(r'^\d{2}-\d{2}-\d{4}$', line): date_str = line
            elif re.match(r'^\d{2}:\d{2}$', line):       time_str = line
        venue = referee = ''
        if r1:
            for vl in [l.strip() for l in r1[0].inner_text().split('\n') if l.strip()]:
                if 'rbitr' in vl.lower():
                    referee = vl.split(':', 1)[-1].strip() if ':' in vl else vl
                elif not venue and vl and not re.match(r'^[\d\-:/\s]+$', vl):
                    venue = vl
        matches.append({"home": home, "away": away, "hs": hs, "as": as_,
                        "date": date_str, "time": time_str,
                        "venue": venue, "referee": referee})
    return matches


def scrape_competition(page, comp, done):
    """Scrape all groups for a competition. Returns list of group dicts."""
    results = []

    # Navigate with season param to get groups list
    url = (f"{BASE}/NFG_CmpJornada?cod_primaria=1000120"
           f"&CodTemporada={SEASON}"
           f"&CodCompeticion={comp['id']}")
    if not goto(page, url):
        print("  X Could not load competition page")
        return results

    groups = page.evaluate("""
        () => {
            const sel = document.querySelector('select[name="grupo"]');
            if (!sel) return [];
            return Array.from(sel.options)
                .filter(o => o.value && o.value !== '0')
                .map(o => ({value: o.value, text: o.text.trim()}));
        }
    """)
    print(f"  {len(groups)} grupos")

    for grp in groups:
        key = f"{comp['id']}_{grp['value']}"
        if key in done:
            print(f"    [{grp['text']}] already saved, skip")
            continue

        print(f"    [{grp['text']}]", end="", flush=True)
        gdata = {
            "competition_id": comp["id"], "competition_name": comp["name"],
            "cat": comp["cat"], "island": comp["island"], "phase": comp["phase"],
            "group_id": grp["value"], "group_name": grp["text"],
            "standings": [], "jornadas": [],
        }

        # Standings
        clasif_url = (f"{BASE}/NFG_VisClasificacion?cod_primaria=1000120"
                      f"&CodTemporada={SEASON}"
                      f"&codcompeticion={comp['id']}&codgrupo={grp['value']}&codjornada=99")
        if goto(page, clasif_url):
            gdata["standings"] = parse_standings(page)
            print(f" {len(gdata['standings'])}eq", end="", flush=True)
        else:
            print(" [standings timeout]", end="", flush=True)
        delay()

        # Jornadas - navigate with all params in URL
        jornada_url = (f"{BASE}/NFG_CmpJornada?cod_primaria=1000120"
                       f"&CodTemporada={SEASON}"
                       f"&CodCompeticion={comp['id']}"
                       f"&CodGrupo={grp['value']}")
        if not goto(page, jornada_url):
            print(" [jornada page timeout]")
            results.append(gdata)
            continue

        jornada_opts = []
        for attempt in range(3):
            try:
                jornada_opts = page.evaluate("""
                    () => {
                        const sel = document.querySelector('select[name="jornada"]');
                        if (!sel) return [];
                        return Array.from(sel.options)
                            .filter(o => o.value && o.value !== '0')
                            .map(o => ({value: o.value, text: o.text.trim()}));
                    }
                """)
                if jornada_opts:
                    break
            except Exception:
                pass
            page.wait_for_timeout(2000)

        print(f" | {len(jornada_opts)}J", end="", flush=True)

        for jor in jornada_opts:
            jor_num  = jor["text"].split(" - ")[0].strip()
            jor_date = jor["text"].split(" - ")[1].strip() if " - " in jor["text"] else ""
            try:
                page.evaluate(f"BuscarPartidos('{jor['value']}')")
                page.wait_for_timeout(2000)
                matches = parse_matches(page)
                gdata["jornadas"].append({"num": jor_num, "date": jor_date, "matches": matches})
                print(".", end="", flush=True)
            except Exception:
                print(f"[J{jor_num}?]", end="", flush=True)
            delay()

        total = sum(len(j["matches"]) for j in gdata["jornadas"])
        played = sum(1 for j in gdata["jornadas"] for m in j["matches"] if m["hs"] is not None)
        print(f" -> {total}p ({played}j)")
        results.append(gdata)

    return results


def main():
    from playwright.sync_api import sync_playwright

    if os.path.exists(OUTPUT_PATH):
        with open(OUTPUT_PATH, encoding="utf-8") as f:
            all_data = json.load(f)
        done = {f"{g['competition_id']}_{g['group_id']}" for g in all_data}
        print(f"Resuming - {len(all_data)} groups already saved\n")
    else:
        all_data, done = [], set()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ))
        page.set_default_timeout(30000)

        for comp in COMPETITIONS:
            print(f"\n{'='*55}")
            print(f"  {comp['name'].upper()} [{comp['id']}]")
            print(f"{'='*55}")
            new_groups = scrape_competition(page, comp, done)
            for g in new_groups:
                key = f"{g['competition_id']}_{g['group_id']}"
                if key not in done:
                    all_data.append(g)
                    done.add(key)
            save(all_data)
            print(f"  [saved: {len(all_data)} total groups]")
            delay(extra=2)

        browser.close()

    total_groups  = len(all_data)
    total_teams   = sum(len(g["standings"]) for g in all_data)
    total_matches = sum(len(j["matches"]) for g in all_data for j in g["jornadas"])
    played        = sum(1 for g in all_data for j in g["jornadas"]
                        for m in j["matches"] if m["hs"] is not None)
    print(f"\n{'='*55}")
    print(f"  SCRAPING COMPLETE")
    print(f"   Groups:   {total_groups}")
    print(f"   Teams:    {total_teams}")
    print(f"   Matches:  {total_matches} total, {played} played")
    print(f"   File:     {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
