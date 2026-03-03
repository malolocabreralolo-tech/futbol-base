#!/usr/bin/env python3
"""
debug_season19.py — Dumps page structure for FIFLP season 19 (2023-2024)
to understand why standings/jornadas return 0 data.
"""
import json
from playwright.sync_api import sync_playwright

BASE   = "https://www.fiflp.com/pnfg/NPcd"
SEASON = "19"
COMP   = "1328"   # Liga Preferente Benjamin Lanzarote 2023-2024
GROUP  = "169838" # Grupo 1

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ))
        page.set_default_timeout(30000)

        out = {}

        # 1. Classification page
        clasif_url = (f"{BASE}/NFG_VisClasificacion?cod_primaria=1000120"
                      f"&CodTemporada={SEASON}"
                      f"&codcompeticion={COMP}&codgrupo={GROUP}&codjornada=99")
        print(f"Loading classification: {clasif_url}")
        page.goto(clasif_url, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)

        out["clasif_url"] = clasif_url
        out["clasif_title"] = page.title()
        out["clasif_tables"] = page.evaluate("""
            () => Array.from(document.querySelectorAll('table')).map(t => ({
                rows: t.querySelectorAll('tr').length,
                firstRowCells: t.querySelector('tr') ? t.querySelector('tr').querySelectorAll('td').length : 0,
                sample: t.innerText.trim().slice(0, 300)
            }))
        """)

        # 2. Jornada page
        jornada_url = (f"{BASE}/NFG_CmpJornada?cod_primaria=1000120"
                       f"&CodTemporada={SEASON}"
                       f"&CodCompeticion={COMP}&CodGrupo={GROUP}")
        print(f"Loading jornada: {jornada_url}")
        page.goto(jornada_url, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)

        out["jornada_url"] = jornada_url
        out["jornada_title"] = page.title()
        out["jornada_selects"] = page.evaluate("""
            () => Array.from(document.querySelectorAll('select')).map(s => ({
                name: s.name,
                options: Array.from(s.options).map(o => ({value: o.value, text: o.text.trim()})).slice(0, 10)
            }))
        """)
        out["jornada_body_snippet"] = page.evaluate("() => document.body.innerText.slice(0, 2000)")
        out["jornada_html_snippet"] = page.evaluate("() => document.body.innerHTML.slice(0, 5000)")

        # 3. Try selecting first jornada if available
        jornada_opts = page.evaluate("""
            () => {
                const sel = document.querySelector('select[name="jornada"]');
                if (!sel) return [];
                return Array.from(sel.options)
                    .filter(o => o.value && o.value !== '0')
                    .map(o => ({value: o.value, text: o.text.trim()}));
            }
        """)
        print(f"Jornada options: {len(jornada_opts)}")
        out["jornada_opts_count"] = len(jornada_opts)
        out["jornada_opts"] = jornada_opts[:5]

        if jornada_opts:
            print(f"Loading first jornada: {jornada_opts[0]}")
            page.evaluate(f"BuscarPartidos('{jornada_opts[0]['value']}')")
            page.wait_for_timeout(3000)
            out["first_jornada_tables"] = page.evaluate("""
                () => Array.from(document.querySelectorAll('table')).slice(0, 5).map(t => ({
                    rows: t.querySelectorAll('tr').length,
                    sample: t.innerText.trim().slice(0, 300)
                }))
            """)

        # 4. Also dump clasif page HTML
        page.goto(clasif_url, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        out["clasif_html_snippet"] = page.evaluate("() => document.body.innerHTML.slice(0, 5000)")
        out["clasif_body_snippet"] = page.evaluate("() => document.body.innerText.slice(0, 2000)")

        with open("scripts/debug_season19.json", "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
        print("Saved to scripts/debug_season19.json")
        browser.close()

if __name__ == "__main__":
    main()
