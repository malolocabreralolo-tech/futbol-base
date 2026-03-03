#!/usr/bin/env python3
"""
debug_compare_seasons.py - Compare season 20 vs 19 page rendering with CodJornada.
Confirms whether server returns match data for older seasons.
"""
import json
from playwright.sync_api import sync_playwright

BASE = "https://www.fiflp.com/pnfg/NPcd"
TESTS = [
    # (season, comp, group, jornada, label)
    ("20", "1575", "190745", "1", "Lanzarote Preferente 2024-2025 J1"),
    ("19", "1329", "168500", "1", "GC Primera Benjamin 2023-2024 J1"),
    ("19", "1329", "168500", "10", "GC Primera Benjamin 2023-2024 J10"),
]

def check_url(page, season, comp, group, jornada):
    url = (f"{BASE}/NFG_CmpJornada?cod_primaria=1000120"
           f"&CodCompeticion={comp}&CodGrupo={group}"
           f"&CodTemporada={season}&CodJornada={jornada}")
    page.goto(url, wait_until="domcontentloaded")
    try:
        page.wait_for_load_state("networkidle", timeout=8000)
    except Exception:
        pass
    page.wait_for_timeout(3000)

    body = page.evaluate("() => document.body.innerText")
    tables = page.evaluate("""
        () => Array.from(document.querySelectorAll('table')).map(t => {
            const rows = t.querySelectorAll('tr');
            const r0 = rows[0] ? rows[0].querySelectorAll('td').length : 0;
            return {rows: rows.length, r0_cells: r0, text: t.innerText.trim().slice(0, 200)};
        })
    """)
    match_tables = [t for t in tables if t['rows'] == 2 and t['r0_cells'] == 3]
    return {
        "url": url,
        "body_snippet": body[body.find('LIGA') if 'LIGA' in body else 0:][:300],
        "total_tables": len(tables),
        "match_tables": len(match_tables),
        "match_table_samples": [t['text'] for t in match_tables[:2]],
    }

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ))
        page.set_default_timeout(30000)

        results = {}
        for season, comp, group, jornada, label in TESTS:
            print(f"Testing: {label}")
            r = check_url(page, season, comp, group, jornada)
            results[label] = r
            print(f"  Tables: {r['total_tables']}, Match tables (2r,3c): {r['match_tables']}")
            for s in r['match_table_samples']:
                print(f"    Sample: {s[:100]}")

        browser.close()

    with open("scripts/debug_compare_seasons.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print("Saved to scripts/debug_compare_seasons.json")

if __name__ == "__main__":
    main()
