#!/usr/bin/env python3
"""
discover_season.py — Finds competition IDs for a given FIFLP season.
Pass SEASON env var (e.g. SEASON=19 for 2023-2024).
Saves results to scripts/fiflp_discover_SEASON.json
"""
import json, os, time
from playwright.sync_api import sync_playwright

BASE   = "https://www.fiflp.com/pnfg/NPcd"
SEASON = os.environ.get("SEASON", "19")
OUTPUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"fiflp_discover_{SEASON}.json")

KEYWORDS = ["benjamin", "prebenjamin", "benjamín", "prebenjamín"]

def goto(page, url, retries=3):
    for attempt in range(retries):
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(2500)
            return True
        except Exception:
            time.sleep(15 * (attempt + 1))
    return False

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ))
        page.set_default_timeout(30000)

        # Load jornada page with the target season
        url = f"{BASE}/NFG_CmpJornada?cod_primaria=1000120&CodTemporada={SEASON}"
        print(f"Loading: {url}")
        goto(page, url)

        # Get all competitions in this season
        all_comps = page.evaluate("""
            () => {
                const sel = document.querySelector('select[name="competicion"]');
                if (!sel) return [];
                return Array.from(sel.options)
                    .filter(o => o.value && o.value !== '0')
                    .map(o => ({id: o.value, name: o.text.trim()}));
            }
        """)
        print(f"Found {len(all_comps)} competitions for season {SEASON}")

        # Filter for Benjamin/Prebenjamin
        target = [c for c in all_comps
                  if any(k in c["name"].lower() for k in KEYWORDS)]
        other  = [c for c in all_comps
                  if not any(k in c["name"].lower() for k in KEYWORDS)]

        print(f"\n=== BENJAMIN / PREBENJAMIN ({len(target)}) ===")
        for c in target:
            print(f"  [{c['id']}] {c['name']}")

        print(f"\n=== OTHER ({len(other)}) ===")
        for c in other:
            print(f"  [{c['id']}] {c['name']}")

        # For each target competition, get the groups count
        print(f"\n=== EXPLORING GROUPS ===")
        for comp in target:
            comp_url = (f"{BASE}/NFG_CmpJornada?cod_primaria=1000120"
                        f"&CodTemporada={SEASON}&CodCompeticion={comp['id']}")
            goto(page, comp_url)
            groups = page.evaluate("""
                () => {
                    const sel = document.querySelector('select[name="grupo"]');
                    if (!sel) return [];
                    return Array.from(sel.options)
                        .filter(o => o.value && o.value !== '0')
                        .map(o => ({value: o.value, text: o.text.trim()}));
                }
            """)
            comp["groups"] = groups
            comp["num_groups"] = len(groups)
            print(f"  [{comp['id']}] {comp['name']}: {len(groups)} grupos")
            time.sleep(2)

        result = {
            "season": SEASON,
            "target_competitions": target,
            "all_competitions": all_comps,
        }
        with open(OUTPUT, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"\nSaved to {OUTPUT}")
        browser.close()

if __name__ == "__main__":
    main()
