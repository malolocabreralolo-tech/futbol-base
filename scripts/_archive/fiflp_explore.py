#!/usr/bin/env python3
"""
fiflp_explore.py — Explores FIFLP site to find how to access previous seasons.
Tries different cod_primaria values and looks for season selectors.
"""

import json, os, re, time
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_PATH  = os.path.join(PROJECT_ROOT, "scripts", "fiflp_explore.json")
BASE = "https://www.fiflp.com/pnfg/NPcd"

def goto(page, url, retries=2):
    for attempt in range(retries):
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(2000)
            return True
        except Exception:
            time.sleep(10 * (attempt + 1))
    return False

def main():
    from playwright.sync_api import sync_playwright
    results = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ))
        page.set_default_timeout(30000)

        # 1. Check the main jornada page for ALL selects (maybe there's a season selector)
        print("=== STEP 1: Check all selects on jornada page ===")
        if goto(page, f"{BASE}/NFG_CmpJornada?cod_primaria=1000120"):
            all_selects = page.evaluate("""
                () => {
                    const selects = document.querySelectorAll('select');
                    return Array.from(selects).map(s => ({
                        name: s.name,
                        id: s.id,
                        options_count: s.options.length,
                        first_options: Array.from(s.options).slice(0, 10).map(o => ({
                            value: o.value, text: o.text.trim()
                        }))
                    }));
                }
            """)
            results["selects_on_jornada_page"] = all_selects
            for sel in all_selects:
                print(f"  SELECT name='{sel['name']}' id='{sel['id']}' ({sel['options_count']} options)")
                for opt in sel["first_options"]:
                    print(f"    [{opt['value']}] {opt['text']}")

            # Check for links that might point to previous seasons
            links = page.evaluate("""
                () => {
                    const links = document.querySelectorAll('a[href]');
                    return Array.from(links)
                        .filter(a => {
                            const href = a.href.toLowerCase();
                            const text = a.textContent.toLowerCase();
                            return href.includes('temporada') || href.includes('season') ||
                                   href.includes('cod_primaria') || text.includes('2024') ||
                                   text.includes('2023') || text.includes('temporada') ||
                                   text.includes('anterior');
                        })
                        .map(a => ({href: a.href, text: a.textContent.trim().substring(0, 100)}));
                }
            """)
            results["season_links"] = links
            print(f"\n  Season-related links: {len(links)}")
            for lnk in links:
                print(f"    {lnk['text']}: {lnk['href']}")

        # 2. Try different cod_primaria values
        print("\n=== STEP 2: Try different cod_primaria values ===")
        test_primarias = [
            1000119, 1000118, 1000117, 1000116, 1000115,
            1000110, 1000100, 1000090, 1000080,
            1000121, 1000122, 1000125, 1000130,
        ]
        results["cod_primaria_tests"] = []
        for cp in test_primarias:
            if goto(page, f"{BASE}/NFG_CmpJornada?cod_primaria={cp}"):
                comps = page.evaluate("""
                    () => {
                        const sel = document.querySelector('select[name="competicion"]');
                        if (!sel) return [];
                        return Array.from(sel.options)
                            .filter(o => o.value && o.value !== '0')
                            .map(o => ({id: o.value, name: o.text.trim()}));
                    }
                """)
                entry = {"cod_primaria": cp, "competitions": len(comps)}
                if comps:
                    entry["first_comp"] = comps[0]["name"]
                    entry["all_comps"] = comps
                results["cod_primaria_tests"].append(entry)
                print(f"  cod_primaria={cp}: {len(comps)} competitions", end="")
                if comps:
                    print(f" -> {comps[0]['name']}", end="")
                print()
            else:
                results["cod_primaria_tests"].append({"cod_primaria": cp, "error": "timeout"})
                print(f"  cod_primaria={cp}: TIMEOUT")
            time.sleep(1.5)

        # 3. Check page HTML for season-related elements
        print("\n=== STEP 3: Check page HTML for season references ===")
        if goto(page, f"{BASE}/NFG_CmpJornada?cod_primaria=1000120"):
            html_check = page.evaluate("""
                () => {
                    const html = document.body.innerHTML;
                    const results = [];
                    const patterns = [/temporada/gi, /season/gi, /2024/g, /2023/g, /cod_primaria/gi];
                    for (const p of patterns) {
                        let m;
                        while ((m = p.exec(html)) !== null) {
                            const start = Math.max(0, m.index - 50);
                            const end = Math.min(html.length, m.index + m[0].length + 50);
                            results.push(html.substring(start, end).replace(/\\s+/g, ' '));
                        }
                    }
                    return [...new Set(results)].slice(0, 20);
                }
            """)
            results["html_season_matches"] = html_check
            print(f"  Found {len(html_check)} HTML snippets:")
            for h in html_check:
                print(f"    {h}")

            # Check all forms
            forms = page.evaluate("""
                () => {
                    return Array.from(document.querySelectorAll('form')).map(f => ({
                        action: f.action,
                        method: f.method,
                        inputs: Array.from(f.querySelectorAll('input,select')).map(i => ({
                            tag: i.tagName, name: i.name, type: i.type, value: i.value
                        }))
                    }));
                }
            """)
            results["forms"] = forms
            print(f"\n  Forms: {len(forms)}")
            for f in forms:
                print(f"    action={f['action']} method={f['method']}")
                for inp in f["inputs"]:
                    val = inp['value'][:50] if inp.get('value') else ''
                    print(f"      {inp['tag']} name={inp['name']} type={inp.get('type','')} value={val}")

        # 4. Check main FIFLP navigation for cod_primaria links
        print("\n=== STEP 4: Check main FIFLP navigation ===")
        if goto(page, "https://www.fiflp.com/pnfg/NPcd/NFG_Main"):
            nav_links = page.evaluate("""
                () => {
                    return Array.from(document.querySelectorAll('a[href*="cod_primaria"]'))
                        .map(a => ({href: a.href, text: a.textContent.trim().substring(0, 100)}))
                        .slice(0, 30);
                }
            """)
            results["main_nav_links"] = nav_links
            print(f"  Links with cod_primaria: {len(nav_links)}")
            for lnk in nav_links:
                print(f"    {lnk['text']}: {lnk['href']}")

        # 5. Try direct classification URL with older comp IDs
        print("\n=== STEP 5: Test older competition IDs ===")
        test_comp_ids = ["54422800", "54422700", "54422600", "54422500",
                         "54422400", "54422300", "54422200", "54422100"]
        results["old_comp_tests"] = []
        for cid in test_comp_ids:
            url = (f"{BASE}/NFG_VisClasificacion?cod_primaria=1000120"
                   f"&codcompeticion={cid}&codgrupo=0&codjornada=99")
            if goto(page, url):
                has_table = page.evaluate("() => document.querySelectorAll('table').length")
                title = page.evaluate("() => document.title")
                comp_text = page.evaluate("""
                    () => {
                        const els = document.querySelectorAll('h1,h2,h3,.titulo');
                        return Array.from(els).map(e => e.textContent.trim()).join(' | ');
                    }
                """)
                entry = {"comp_id": cid, "tables": has_table,
                         "title": title[:80], "comp_text": comp_text[:120]}
                results["old_comp_tests"].append(entry)
                print(f"  comp={cid}: {has_table} tables, '{comp_text[:60]}'")
            else:
                results["old_comp_tests"].append({"comp_id": cid, "error": "timeout"})
                print(f"  comp={cid}: TIMEOUT")
            time.sleep(1)

        browser.close()

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\nResults saved to {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
