#!/usr/bin/env python3
"""
fetch_fiflp_test.py — scraper de prueba: solo 2 grupos de Fase Liga B GC.
Verifica que el pipeline completo funciona antes del scraping total.
"""

import json, os, re, time, random
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_PATH  = os.path.join(PROJECT_ROOT, "scripts", "fiflp_raw.json")
BASE = "https://www.fiflp.com/pnfg/NPcd"

# Solo una competición, máximo 2 grupos
TEST_COMPETITION = {"id": "54422954", "name": "Benjamin Fase Liga B GC",
                    "cat": "benjamin", "island": "grancanaria", "phase": "Fase Liga B"}
MAX_GROUPS = 2

def delay():
    time.sleep(random.uniform(2.0, 3.5))

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
            time.sleep(15 * (attempt + 1))
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

def main():
    from playwright.sync_api import sync_playwright

    comp = TEST_COMPETITION
    all_data = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ))
        page.set_default_timeout(30000)

        print(f"TEST: {comp['name']} — máximo {MAX_GROUPS} grupos\n")

        if not goto(page, f"{BASE}/NFG_CmpJornada?cod_primaria=1000120"):
            print("ERROR: no se pudo cargar la página")
            return

        page.select_option('select[name="competicion"]', comp["id"])
        page.wait_for_timeout(1500)

        groups = page.evaluate("""
            () => {
                const sel = document.querySelector('select[name="grupo"]');
                if (!sel) return [];
                return Array.from(sel.options)
                    .filter(o => o.value && o.value !== '0')
                    .map(o => ({value: o.value, text: o.text.trim()}));
            }
        """)
        print(f"{len(groups)} grupos disponibles, probando {MAX_GROUPS}\n")

        for grp in groups[:MAX_GROUPS]:
            print(f"  [{grp['text']}]", end="", flush=True)
            gdata = {
                "competition_id": comp["id"], "competition_name": comp["name"],
                "cat": comp["cat"], "island": comp["island"], "phase": comp["phase"],
                "group_id": grp["value"], "group_name": grp["text"],
                "standings": [], "jornadas": [],
            }

            # Clasificación
            clasif_url = (f"{BASE}/NFG_VisClasificacion?cod_primaria=1000120"
                          f"&codcompeticion={comp['id']}&codgrupo={grp['value']}&codjornada=99")
            if goto(page, clasif_url):
                gdata["standings"] = parse_standings(page)
                print(f" {len(gdata['standings'])}eq", end="", flush=True)
            delay()

            # Jornadas
            if not goto(page, f"{BASE}/NFG_CmpJornada?cod_primaria=1000120"):
                all_data.append(gdata)
                continue

            try:
                page.select_option('select[name="competicion"]', comp["id"])
                page.wait_for_timeout(1500)
                page.select_option('select[name="grupo"]', grp["value"])
                try:
                    page.wait_for_load_state("networkidle", timeout=8000)
                except Exception:
                    page.wait_for_timeout(2000)
            except Exception as e:
                print(f" [select err]")
                all_data.append(gdata)
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
                    break
                except Exception:
                    if attempt < 2:
                        page.wait_for_timeout(2000)

            print(f" | {len(jornada_opts)}J", end="", flush=True)

            # Solo las primeras 3 jornadas para el test
            for jor in jornada_opts[:3]:
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

            total  = sum(len(j["matches"]) for j in gdata["jornadas"])
            played = sum(1 for j in gdata["jornadas"] for m in j["matches"] if m["hs"] is not None)
            print(f" → {total}p ({played}j)")
            all_data.append(gdata)

        browser.close()

    save(all_data)
    print(f"\n✅ TEST OK: {len(all_data)} grupos guardados en fiflp_raw.json")

if __name__ == "__main__":
    main()
