#!/usr/bin/env python3
"""
fetch_fiflp.py — Scrapes FIFLP for Benjamin + Prebenjamin, all islands.
Uses Playwright (headless). No login required.
Saves progressively to fiflp_raw.json.

Usage: python3 scripts/fetch_fiflp.py
"""

import json, os, re, time, random
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_PATH  = os.path.join(PROJECT_ROOT, "scripts", "fiflp_raw.json")
BASE = "https://www.fiflp.com/pnfg/NPcd"

COMPETITIONS = [
    {"id": "54422885", "name": "Benjamin Fase Previa GC",       "cat": "benjamin",    "island": "grancanaria",   "phase": "Fase Previa"},
    {"id": "54422953", "name": "Benjamin Fase Liga A GC",       "cat": "benjamin",    "island": "grancanaria",   "phase": "Fase Liga A"},
    {"id": "54422954", "name": "Benjamin Fase Liga B GC",       "cat": "benjamin",    "island": "grancanaria",   "phase": "Fase Liga B"},
    {"id": "54422955", "name": "Benjamin Fase Liga C GC",       "cat": "benjamin",    "island": "grancanaria",   "phase": "Fase Liga C"},
    {"id": "54422884", "name": "Benjamin Lanzarote Fase 1",     "cat": "benjamin",    "island": "lanzarote",     "phase": "Fase 1"},
    {"id": "54422886", "name": "Benjamin Lanzarote Fase 2",     "cat": "benjamin",    "island": "lanzarote",     "phase": "Fase 2"},
    {"id": "54422887", "name": "Benjamin Fuerteventura Fase 1", "cat": "benjamin",    "island": "fuerteventura", "phase": "Fase 1"},
    {"id": "54422890", "name": "Benjamin Fuerteventura Fase 2", "cat": "benjamin",    "island": "fuerteventura", "phase": "Fase 2"},
    {"id": "54422888", "name": "Prebenjamin Gran Canaria",      "cat": "prebenjamin", "island": "grancanaria",   "phase": "Gran Canaria"},
    {"id": "54422959", "name": "Prebenjamin Lanzarote",         "cat": "prebenjamin", "island": "lanzarote",     "phase": "Lanzarote"},
    {"id": "54422889", "name": "Prebenjamin Fuerteventura",     "cat": "prebenjamin", "island": "fuerteventura", "phase": "Fuerteventura"},
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def delay(extra=0):
    time.sleep(random.uniform(2.0, 3.5) + extra)

def save(data):
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def goto(page, url, retries=3):
    """Navigate with retry on timeout."""
    for attempt in range(retries):
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(2500)
            return True
        except Exception as e:
            wait = 15 * (attempt + 1)
            print(f"\n      ⏳ Timeout ({attempt+1}/{retries}), waiting {wait}s…", end="", flush=True)
            time.sleep(wait)
    return False


# ── Parsers ───────────────────────────────────────────────────────────────────

def parse_standings(page):
    """
    4 table layouts (by cell count per row):
      17: '' pos team pts/pj pts j_h g_h e_h p_h j_a g_a e_a p_a gf gc form sanc
      16: '' pos team pts       j_h g_h e_h p_h j_a g_a e_a p_a gf gc form sanc
      11: '' pos team pts/pj pts j   g   e   p            form sanc
      10: '' pos team pts       j   g   e   p            form sanc
    """
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
        if nc not in (10, 11, 16, 17):
            continue
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


def parse_matches(page):
    """
    Each match = 2-row table:
      Row 0 (3 cells): home | "{hs} - {as}\ndate\ntime" | away
      Row 1 (1 cell):  venue\nArbitro: name
    """
    matches, seen = [], set()
    for table in page.query_selector_all('table'):
        rows = table.query_selector_all('tr')
        if len(rows) != 2: continue
        r0 = rows[0].query_selector_all('td')
        r1 = rows[1].query_selector_all('td')
        if len(r0) != 3: continue

        home = re.sub(r'\s+', ' ', r0[0].inner_text().strip().replace('\xa0', ' ')).strip()
        away = re.sub(r'\s+', ' ', r0[2].inner_text().strip().replace('\xa0', ' ')).strip()
        if not home or not away: continue
        key = f"{home}|{away}"
        if key in seen: continue
        seen.add(key)

        score_raw = r0[1].inner_text().strip().replace('\xa0', ' ')
        lines = [l.strip() for l in score_raw.split('\n') if l.strip()]
        hs = as_ = None
        date_str = time_str = ''
        for line in lines:
            m = re.match(r'^(\d*)\s*-\s*(\d*)$', line)
            if m:
                hs  = int(m.group(1)) if m.group(1) else None
                as_ = int(m.group(2)) if m.group(2) else None
            elif re.match(r'^\d{2}-\d{2}-\d{4}$', line): date_str = line
            elif re.match(r'^\d{2}:\d{2}$', line):       time_str = line

        venue = referee = ''
        if r1:
            for vl in [l.strip() for l in r1[0].inner_text().split('\n') if l.strip()]:
                if 'rbitr' in vl.lower():
                    referee = vl.split(':', 1)[-1].strip() if ':' in vl else vl
                elif any(s in vl for s in ['Hierba', 'Cesped', 'Tierra', 'Artificial', 'Sintét']):
                    venue = vl
                elif not venue and vl and not re.match(r'^[\d\-:/\s]+$', vl):
                    venue = vl

        matches.append({"home": home, "away": away, "hs": hs, "as": as_,
                         "date": date_str, "time": time_str,
                         "venue": venue, "referee": referee})
    return matches


# ── Core scraping ─────────────────────────────────────────────────────────────

def scrape_competition(page, comp, done):
    """Scrape all groups for a competition. Returns list of group dicts."""
    results = []

    # Navigate to jornada page and select competition
    if not goto(page, f"{BASE}/NFG_CmpJornada?cod_primaria=1000120"):
        print("  ❌ No se pudo cargar la página de jornadas")
        return results

    try:
        page.select_option('select[name="competicion"]', comp["id"])
        page.wait_for_timeout(1500)
    except:
        print("  ❌ No se pudo seleccionar la competición")
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
            print(f"    [{grp['text']}] ya guardado, skip")
            continue

        print(f"    [{grp['text']}]", end="", flush=True)
        gdata = {
            "competition_id": comp["id"], "competition_name": comp["name"],
            "cat": comp["cat"], "island": comp["island"], "phase": comp["phase"],
            "group_id": grp["value"], "group_name": grp["text"],
            "standings": [], "jornadas": [],
        }

        # ── Standings ─────────────────────────────────────────────
        clasif_url = (f"{BASE}/NFG_VisClasificacion?cod_primaria=1000120"
                      f"&codcompeticion={comp['id']}&codgrupo={grp['value']}&codjornada=99")
        if goto(page, clasif_url):
            gdata["standings"] = parse_standings(page)
            print(f" {len(gdata['standings'])}eq", end="", flush=True)
        else:
            print(" [standings timeout]", end="", flush=True)
        delay()

        # ── Jornadas ──────────────────────────────────────────────
        # Return to jornada page and re-select comp+group
        if not goto(page, f"{BASE}/NFG_CmpJornada?cod_primaria=1000120"):
            print(" [jornada page timeout]")
            results.append(gdata)
            continue

        try:
            page.select_option('select[name="competicion"]', comp["id"])
            page.wait_for_timeout(1200)
            page.select_option('select[name="grupo"]', grp["value"])
            page.wait_for_timeout(1200)
        except Exception as e:
            print(f" [select err: {e}]")
            results.append(gdata)
            continue

        jornada_opts = page.evaluate("""
            () => {
                const sel = document.querySelector('select[name="jornada"]');
                if (!sel) return [];
                return Array.from(sel.options)
                    .filter(o => o.value && o.value !== '0')
                    .map(o => ({value: o.value, text: o.text.trim()}));
            }
        """)
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
            except Exception as e:
                print(f"[J{jor_num}?]", end="", flush=True)
            delay()

        total = sum(len(j["matches"]) for j in gdata["jornadas"])
        played = sum(1 for j in gdata["jornadas"] for m in j["matches"] if m["hs"] is not None)
        print(f" → {total}p ({played}j)")
        results.append(gdata)

    return results


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    from playwright.sync_api import sync_playwright

    if os.path.exists(OUTPUT_PATH):
        with open(OUTPUT_PATH, encoding="utf-8") as f:
            all_data = json.load(f)
        done = {f"{g['competition_id']}_{g['group_id']}" for g in all_data}
        print(f"Resumiendo — {len(all_data)} grupos ya guardados\n")
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
            print(f"📋 {comp['name'].upper()}")
            print(f"{'='*55}")
            new_groups = scrape_competition(page, comp, done)
            for g in new_groups:
                key = f"{g['competition_id']}_{g['group_id']}"
                if key not in done:
                    all_data.append(g)
                    done.add(key)
            save(all_data)
            delay(extra=3)   # extra pause between competitions

        browser.close()

    total_groups  = len(all_data)
    total_teams   = sum(len(g["standings"]) for g in all_data)
    total_matches = sum(len(j["matches"]) for g in all_data for j in g["jornadas"])
    played        = sum(1 for g in all_data for j in g["jornadas"]
                        for m in j["matches"] if m["hs"] is not None)
    print(f"\n{'='*55}")
    print(f"✅ SCRAPING COMPLETO")
    print(f"   Grupos:   {total_groups}")
    print(f"   Equipos:  {total_teams}")
    print(f"   Partidos: {total_matches} total, {played} jugados")
    print(f"   Fichero:  {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
