#!/usr/bin/env python3
"""
debug_match_row.py — Dumps raw r1 content from FIFLP match tables
to understand the scorer data format.
Scrapes just 1 jornada from Lanzarote Preferente (smallest group).
"""
import json, time
from playwright.sync_api import sync_playwright

BASE   = "https://www.fiflp.com/pnfg/NPcd"
SEASON = "20"
COMP   = "1575"
GROUP  = "186624"  # Grupo 1 Preferente Lanzarote

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ))
        page.set_default_timeout(30000)

        url = (f"{BASE}/NFG_CmpJornada?cod_primaria=1000120"
               f"&CodTemporada={SEASON}&CodCompeticion={COMP}&CodGrupo={GROUP}")
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(2500)

        # Get first jornada option
        jornada_opts = page.evaluate("""
            () => Array.from(document.querySelector('select[name="jornada"]')?.options || [])
                .filter(o => o.value && o.value !== '0')
                .map(o => ({value: o.value, text: o.text.trim()}))
        """)
        print(f"Found {len(jornada_opts)} jornadas")

        results = []
        for jor in jornada_opts[:5]:  # Only first 5 jornadas
            page.evaluate(f"BuscarPartidos('{jor['value']}')")
            page.wait_for_timeout(2000)

            # Dump ALL table content for this jornada
            tables = page.evaluate("""
                () => {
                    const out = [];
                    for (const t of document.querySelectorAll('table')) {
                        const rows = t.querySelectorAll('tr');
                        if (rows.length !== 2) continue;
                        const r0cells = rows[0].querySelectorAll('td');
                        if (r0cells.length !== 3) continue;
                        const r1cells = rows[1].querySelectorAll('td');
                        out.push({
                            r0: Array.from(r0cells).map(c => c.innerText.trim()),
                            r1: Array.from(r1cells).map(c => c.innerText.trim()),
                            r1_html: Array.from(r1cells).map(c => c.innerHTML.trim()),
                        });
                    }
                    return out;
                }
            """)
            results.append({"jornada": jor["text"], "tables": tables})
            print(f"  J{jor['text']}: {len(tables)} matches")
            time.sleep(2.5)

        with open("scripts/debug_match_row.json", "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print("Saved to scripts/debug_match_row.json")
        browser.close()

if __name__ == "__main__":
    main()
