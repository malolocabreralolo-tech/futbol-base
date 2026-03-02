#!/usr/bin/env python3
"""
fetch_fiflp_test.py — Test: scrape Benjamin Fase A Grupo 2 temporada 2024/2025.
Selects season 2024-2025 first, then finds the right competition and group.
"""

import json, os, re, time, random, sys
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_PATH  = os.path.join(PROJECT_ROOT, "scripts", "fiflp_test_result.json")
BASE = "https://www.fiflp.com/pnfg/NPcd"

SEASON_VALUE = "20"  # 2024-2025

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

def wait_after_select(page):
    """Wait for AJAX after changing a select."""
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

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ))
        page.set_default_timeout(30000)

        # 1. Cargar pagina de jornadas
        print("=== PASO 1: Cargar pagina y seleccionar temporada 2024-2025 ===")
        if not goto(page, f"{BASE}/NFG_CmpJornada?cod_primaria=1000120"):
            print("ERROR: no se pudo cargar")
            browser.close()
            sys.exit(1)

        # 2. Seleccionar temporada 2024-2025
        # The onchange calls: BuscarCompeticiones(value)
        page.select_option('select[name="temporada"]', SEASON_VALUE)
        page.evaluate(f"BuscarCompeticiones('{SEASON_VALUE}')")
        print("Temporada seleccionada: 2024-2025 (BuscarCompeticiones called)")
        wait_after_select(page)
        page.wait_for_timeout(3000)  # Extra wait for AJAX

        # 3. Listar competiciones disponibles
        all_comps = page.evaluate("""
            () => {
                const sel = document.querySelector('select[name="competicion"]');
                if (!sel) return [];
                return Array.from(sel.options)
                    .filter(o => o.value && o.value !== '0')
                    .map(o => ({id: o.value, name: o.text.trim()}));
            }
        """)
        print(f"\nCompeticiones en 2024-2025: {len(all_comps)}")
        for c in all_comps:
            print(f"  [{c['id']}] {c['name']}")

        if not all_comps:
            print("\nERROR: No competitions found for 2024-2025")
            browser.close()
            sys.exit(1)

        # 4. Buscar Benjamin Fase A / Liga A
        target = None
        for c in all_comps:
            name_lower = c["name"].lower()
            if "benjamin" in name_lower and ("fase a" in name_lower or "liga a" in name_lower or "fase liga a" in name_lower):
                target = c
                break

        if not target:
            # Fallback: any benjamin competition
            for c in all_comps:
                if "benjamin" in c["name"].lower() and "sala" not in c["name"].lower():
                    target = c
                    break

        if not target:
            print("\nERROR: No hay competicion Benjamin en 2024-2025")
            browser.close()
            sys.exit(1)

        print(f"\n=== PASO 2: Seleccionar [{target['id']}] {target['name']} ===")
        page.select_option('select[name="competicion"]', target["id"])
        wait_after_select(page)

        # 5. Listar grupos
        groups = page.evaluate("""
            () => {
                const sel = document.querySelector('select[name="grupo"]');
                if (!sel) return [];
                return Array.from(sel.options)
                    .filter(o => o.value && o.value !== '0')
                    .map(o => ({value: o.value, text: o.text.trim()}));
            }
        """)
        print(f"Grupos: {len(groups)}")
        for g in groups:
            print(f"  [{g['value']}] {g['text']}")

        # 6. Buscar Grupo 2
        target_grp = None
        for g in groups:
            if "2" in g["text"] and ("grupo" in g["text"].lower() or g["text"].strip() == "2"):
                target_grp = g
                break
        if not target_grp and len(groups) >= 2:
            target_grp = groups[1]
        if not target_grp and groups:
            target_grp = groups[0]

        if not target_grp:
            print("ERROR: No hay grupos disponibles")
            browser.close()
            sys.exit(1)

        print(f"\n=== PASO 3: Scrapeando grupo [{target_grp['text']}] ===")

        gdata = {
            "competition_id": target["id"], "competition_name": target["name"],
            "cat": "benjamin", "island": "grancanaria",
            "phase": target["name"],
            "group_id": target_grp["value"], "group_name": target_grp["text"],
            "standings": [], "jornadas": [],
        }

        # 7. Clasificacion
        print("Obteniendo clasificacion...", end="", flush=True)
        clasif_url = (f"{BASE}/NFG_VisClasificacion?cod_primaria=1000120"
                      f"&codcompeticion={target['id']}&codgrupo={target_grp['value']}&codjornada=99")
        if goto(page, clasif_url):
            gdata["standings"] = parse_standings(page)
            print(f" {len(gdata['standings'])} equipos")
            for s in gdata["standings"]:
                print(f"  {s['pos']}. {s['team']} - {s['pts']}pts ({s['j']}j)")
        else:
            print(" TIMEOUT")
        delay()

        # 8. Jornadas - volver a pagina principal y seleccionar todo de nuevo
        print("\nObteniendo jornadas...", flush=True)
        if not goto(page, f"{BASE}/NFG_CmpJornada?cod_primaria=1000120"):
            print("ERROR: no se pudo cargar pagina de jornadas")
            save([gdata])
            browser.close()
            return

        # Re-seleccionar temporada, competicion y grupo
        try:
            page.select_option('select[name="temporada"]', SEASON_VALUE)
            page.evaluate(f"BuscarCompeticiones('{SEASON_VALUE}')")
            wait_after_select(page)
            page.wait_for_timeout(2000)
            page.select_option('select[name="competicion"]', target["id"])
            wait_after_select(page)
            page.select_option('select[name="grupo"]', target_grp["value"])
            wait_after_select(page)
        except Exception as e:
            print(f"ERROR seleccionando: {e}")
            save([gdata])
            browser.close()
            return

        # Leer opciones de jornada (con reintentos)
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

        print(f"{len(jornada_opts)} jornadas")

        for jor in jornada_opts:
            jor_num  = jor["text"].split(" - ")[0].strip()
            jor_date = jor["text"].split(" - ")[1].strip() if " - " in jor["text"] else ""
            try:
                page.evaluate(f"BuscarPartidos('{jor['value']}')")
                page.wait_for_timeout(2000)
                matches = parse_matches(page)
                gdata["jornadas"].append({"num": jor_num, "date": jor_date, "matches": matches})
                played = sum(1 for m in matches if m["hs"] is not None)
                print(f"  J{jor_num}: {len(matches)} partidos ({played} jugados)")
            except Exception as e:
                print(f"  J{jor_num}: ERROR - {e}")
            delay()

        browser.close()

    save([gdata])

    # Resumen
    teams  = len(gdata["standings"])
    total  = sum(len(j["matches"]) for j in gdata["jornadas"])
    played = sum(1 for j in gdata["jornadas"] for m in j["matches"] if m["hs"] is not None)
    print(f"\n{'='*50}")
    print(f"RESULTADO: {target['name']} - {target_grp['text']}")
    print(f"  Equipos:  {teams}")
    print(f"  Partidos: {total} total, {played} jugados")
    print(f"  Jornadas: {len(gdata['jornadas'])}")
    print(f"  Guardado: {OUTPUT_PATH}")

    if teams == 0 and total == 0:
        print("\nWARNING: No se obtuvo ningun dato!")
        sys.exit(1)

if __name__ == "__main__":
    main()
