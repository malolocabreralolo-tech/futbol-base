#!/usr/bin/env python3
"""
discover_fiflp_comps.py — Lists ALL benjamin/prebenjamin competitions for each
FIFLP season, looking specifically for Copa de Campeones / Tercera Fase / Fase
Final / Final variants we haven't configured yet.

Loops temporadas 17→21 (2021-22 → 2025-26) and dumps competition catalog.

Output: scripts/fiflp_comps_catalog.json
"""
import json
import os
import time
import sys

from playwright.sync_api import sync_playwright

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT = os.path.join(SCRIPT_DIR, "fiflp_comps_catalog.json")
BASE = "https://www.fiflp.com/pnfg/NPcd"

SEASONS = [
    ("17", "2021-2022"),
    ("18", "2022-2023"),
    ("19", "2023-2024"),
    ("20", "2024-2025"),
    ("21", "2025-2026"),
]

KEYWORDS = [
    "benjamin", "benjamín", "prebenjamin", "prebenjamín",
    "copa", "campeon", "campeón", "tercera", "final",
]


def main():
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ))
        page.set_default_timeout(30000)

        for season_code, season_name in SEASONS:
            url = f"{BASE}/NFG_CmpJornada?cod_primaria=1000120&CodTemporada={season_code}"
            print(f"\n=== Season {season_code} ({season_name}) ===")
            print(f"  URL: {url}")
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
                page.wait_for_timeout(3000)
            except Exception as e:
                print(f"  goto err: {e}")
                results[season_name] = {"error": str(e), "competitions": []}
                continue

            comps = page.evaluate("""
                () => {
                    const sel = document.querySelector('select[name="competicion"]');
                    if (!sel) return [];
                    return Array.from(sel.options)
                        .filter(o => o.value && o.value !== '0')
                        .map(o => ({id: o.value, name: o.text.trim()}));
                }
            """)
            print(f"  Total competitions: {len(comps)}")

            # Filter to benjamin/prebenjamin/cup-related ones
            relevant = []
            for c in comps:
                name_lower = c["name"].lower()
                if any(k in name_lower for k in KEYWORDS):
                    relevant.append(c)
                    print(f"    {c['id']:>10}  {c['name']}")
            results[season_name] = {
                "season_code": season_code,
                "total": len(comps),
                "relevant": relevant,
                "all": comps,  # complete list for archive
            }
            time.sleep(1.5)

        browser.close()

    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\nSaved to {OUTPUT}")


if __name__ == "__main__":
    main()
