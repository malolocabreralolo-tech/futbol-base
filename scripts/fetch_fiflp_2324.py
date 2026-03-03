#!/usr/bin/env python3
"""
fetch_fiflp_2324.py — Scrapes FIFLP for Benjamin 2023/2024.
Uses CodTemporada=19 to access the 2023-2024 season.
Saves progressively to fiflp_2324_raw.json.
"""

import json, os, re, time, random
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_PATH  = os.path.join(PROJECT_ROOT, "scripts", "fiflp_2324_raw.json")
BASE = "https://www.fiflp.com/pnfg/NPcd"
SEASON = "19"  # CodTemporada for 2023-2024

ALL_COMPETITIONS = [
    # Benjamin Gran Canaria
    {"id": "1329", "name": "Primera Benjamin GC",            "cat": "benjamin",    "island": "grancanaria",   "phase": "Primera Fase"},
    {"id": "1439", "name": "Benjamin GC Segunda Fase",       "cat": "benjamin",    "island": "grancanaria",   "phase": "Segunda Fase"},
    {"id": "1229", "name": "Copa Campeones Benjamin GC",     "cat": "benjamin",    "island": "grancanaria",   "phase": "Copa Campeones"},
    # Benjamin Lanzarote
    {"id": "1328", "name": "Benjamin Lanzarote Preferente",  "cat": "benjamin",    "island": "lanzarote",     "phase": "Preferente"},
    {"id": "1330", "name": "Benjamin Lanzarote Primera",     "cat": "benjamin",    "island": "lanzarote",     "phase": "Primera"},
    # Benjamin Fuerteventura
    {"id": "1331", "name": "Benjamin Fuerteventura Fase 1",  "cat": "benjamin",    "island": "fuerteventura", "phase": "Fase 1"},
    {"id": "1442", "name": "Benjamin Fuerteventura Fase 2",  "cat": "benjamin",    "island": "fuerteventura", "phase": "Fase 2"},
]

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


def parse_matches(page):
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
                elif not venue and vl and not re.match(r'^[\d\-:/\s]+$', vl):
                    venue = vl
        matches.append({"home": home, "away": away, "hs": hs, "as": as_,
                        "date": date_str, "time": time_str,
                        "venue": venue, "referee": referee})
    return matches


def scrape_competition(page, comp, done):
    results = []

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

        # Jornadas
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
