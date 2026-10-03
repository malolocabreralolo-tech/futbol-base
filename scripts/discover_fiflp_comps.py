#!/usr/bin/env python3
"""
discover_fiflp_comps.py — Lists ALL benjamin/prebenjamin competitions for each
FIFLP season, looking specifically for Copa de Campeones / Tercera Fase / Fase
Final / Final variants we haven't configured yet.

Loops temporadas 17→22 (2021-22 → 2026-27) and MERGES them into the catalog
(keeps any season already there that this run does not visit).

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
    ("22", "2026-2027"),
]

# DISCOVER_SEASONS=22 -> only those CodTemporada (comma-separated).
_only = os.environ.get("DISCOVER_SEASONS", "")
if _only:
    SEASONS = [s for s in SEASONS if s[0] in _only.split(",")]

KEYWORDS = [
    "benjamin", "benjamín", "prebenjamin", "prebenjamín",
    "copa", "campeon", "campeón", "tercera", "final",
]


def main():
    results = {}
    if os.path.exists(OUTPUT):
        with open(OUTPUT, encoding="utf-8") as f:
            results = json.load(f)
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
                # Un fallo de red no borra lo que ya estaba en el catálogo.
                results.setdefault(season_name, {"error": str(e), "competitions": []})
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
            if not comps and results.get(season_name, {}).get("all"):
                print("  (vacío: se conserva el catálogo anterior)")
                continue

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
