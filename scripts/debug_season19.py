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
        # Also find IrA function source
        out["ira_source"] = page.evaluate("""
            () => typeof IrA === 'function' ? IrA.toString().slice(0, 500) : 'NOT FOUND'
        """)

        # Navigate directly with CodJornada=5 - try different waits and strategies
        direct_url = (f"{BASE}/NFG_CmpJornada?cod_primaria=1000120"
                      f"&CodCompeticion={COMP}&CodGrupo={GROUP}"
                      f"&CodTemporada={SEASON}&CodJornada=5")
        print(f"Loading jornada 5 direct: {direct_url}")
        page.goto(direct_url, wait_until="domcontentloaded")
        # Try network idle
        try:
            page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:
            pass
        page.wait_for_timeout(5000)

        out["jornada5_tables"] = page.evaluate("""
            () => Array.from(document.querySelectorAll('table')).map(t => ({
                rows: t.querySelectorAll('tr').length,
                cells_r0: t.querySelector('tr') ? t.querySelector('tr').querySelectorAll('td').length : 0,
                sample: t.innerText.trim().slice(0, 300)
            }))
        """)
        out["jornada5_body"] = page.evaluate("() => document.body.innerText")
        out["jornada5_iframes"] = page.evaluate("""
            () => Array.from(document.querySelectorAll('iframe')).map(f => ({src: f.src, name: f.name}))
        """)
        # Get the full main content by looking for team-like content or match containers
        out["jornada5_content_html"] = page.evaluate("""
            () => {
                // Find div that contains match content
                const all = document.querySelectorAll('div, section, article');
                for (const el of all) {
                    const txt = el.innerText;
                    // look for football team name patterns
                    if (txt.length > 200 && txt.length < 5000 &&
                        (txt.includes(' - ') || txt.includes('Jornada')) &&
                        !txt.includes('dropdown') && !txt.includes('navbar')) {
                        return el.outerHTML.slice(0, 5000);
                    }
                }
                // Fallback: everything after position 10000 in body
                return document.body.innerHTML.slice(10000, 18000);
            }
        """)
        out["jornada5_nav_links"] = page.evaluate("""
            () => Array.from(document.querySelectorAll('a, button')).filter(el => {
                const txt = el.innerText || '';
                return ['Anterior','Siguiente','Resultados','Provisional','Definitivo'].some(k => txt.includes(k));
            }).map(el => ({text: el.innerText.trim(), href: el.href||'', onclick: el.getAttribute('onclick')||''}))
        """)

        # Reload jornada page
        page.goto(jornada_url, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)

        out["jornada_elements"] = page.evaluate("""
            () => {
                const result = {};
                // jornada select
                const jSel = document.querySelector('select[name="jornada"]');
                result.jornada_select_outer = jSel ? jSel.outerHTML : null;
                // all links/buttons with 'Anterior', 'Provisional', 'Definitivo', 'Resultados'
                result.nav_links = [];
                for (const el of document.querySelectorAll('a, button, input[type=button]')) {
                    const txt = el.innerText || el.value || '';
                    if (['Anterior','Provisional','Definitivo','Resultados','Siguiente'].some(k => txt.includes(k))) {
                        result.nav_links.push({tag: el.tagName, text: txt.trim(), href: el.href||'', onclick: el.getAttribute('onclick')||''});
                    }
                }
                // All forms on page
                result.forms = Array.from(document.querySelectorAll('form')).map(f => ({
                    action: f.action, method: f.method, inputs: Array.from(f.querySelectorAll('input[type=hidden]')).map(i => ({name: i.name, value: i.value})).slice(0, 10)
                }));
                // The content section (after header)
                const sections = document.querySelectorAll('.card-body, .row');
                for (const s of sections) {
                    const txt = s.innerText;
                    if (txt.includes('LIGA') && txt.includes('LANZAROTE')) {
                        result.comp_section = s.innerHTML.slice(0, 3000);
                        break;
                    }
                }
                return result;
            }
        """)

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
        out["clasif_body_snippet"] = page.evaluate("() => document.body.innerText.slice(0, 2000)")
        out["clasif_html_content"] = page.evaluate("""
            () => {
                for (const div of document.querySelectorAll('div')) {
                    if (div.innerText.includes('clasificacion') || div.innerText.includes('Clasificación') || div.innerText.includes('No hay')) {
                        return div.outerHTML.slice(0, 8000);
                    }
                }
                return document.body.innerHTML.slice(5000, 13000);
            }
        """)

        with open("scripts/debug_season19.json", "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
        print("Saved to scripts/debug_season19.json")
        browser.close()

if __name__ == "__main__":
    main()
