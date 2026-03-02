#!/usr/bin/env python3
"""
scrape_fiflp_2024.py — Scrape 2024-2025 season data from FIFLP using Playwright.

Strategy: Instead of brute-forcing group codes, first discover groups via the
FIFLP portal page (NFG_CmpJornada) which has dropdowns listing all competitions
and groups. Then fetch only the known group URLs.

Uses generous delays (8-15s) and randomized timing to avoid IP blocks.

Usage: python3 scripts/scrape_fiflp_2024.py [--discover-only] [--groups-file FILE]
"""

import json
import os
import random
import sys
import time

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Error: playwright not installed. Run: pip install playwright && playwright install chromium")
    sys.exit(1)

BASE_URL = "https://www.fiflp.com/pnfg/NPcd"
PORTAL_URL = f"{BASE_URL}/NFG_CmpJornada?cod_primaria=1000120"
CLASIF_URL = f"{BASE_URL}/NFG_VisClasificacion"

# Generous delays to avoid IP blocks
MIN_DELAY = 8   # minimum seconds between requests
MAX_DELAY = 15  # maximum seconds between requests
BLOCK_BACKOFF = 120  # seconds to wait if we detect a block

# Known group codes file (cache from discovery phase)
GROUPS_CACHE = os.path.join(PROJECT_ROOT, "scripts", "fiflp_groups_cache.json")

# Output file
OUTPUT_PATH = os.path.join(PROJECT_ROOT, "data-history-2024.json")

# Categories we care about (case-insensitive matching)
CATEGORIES = {
    "benjamin": ["benjamin"],
    "prebenjamin": ["prebenjamin"],
}


def random_delay():
    """Sleep for a random duration between MIN_DELAY and MAX_DELAY."""
    delay = random.uniform(MIN_DELAY, MAX_DELAY)
    time.sleep(delay)


def is_blocked(page):
    """Check if we got an empty/blocked response."""
    try:
        length = page.evaluate("() => document.body ? document.body.innerHTML.length : 0")
        return length < 100
    except Exception:
        return True


def safe_goto(page, url, max_retries=2):
    """Navigate to a URL with retry logic and block detection."""
    for attempt in range(max_retries):
        try:
            page.goto(url, wait_until="networkidle", timeout=20000)
            page.wait_for_timeout(3000)

            if is_blocked(page):
                if attempt < max_retries - 1:
                    print(f"    Blocked! Waiting {BLOCK_BACKOFF}s before retry...", flush=True)
                    time.sleep(BLOCK_BACKOFF)
                    continue
                else:
                    return False
            return True
        except Exception as e:
            print(f"    Navigation error: {e}", flush=True)
            if attempt < max_retries - 1:
                time.sleep(30)
    return False


def extract_standings(page):
    """Extract standings data from the current FIFLP classification page."""
    return page.evaluate("""() => {
        const main = document.querySelector('main');
        if (!main) return null;

        const h4s = main.querySelectorAll('h4');
        const h5 = main.querySelector('h5');

        const info = {
            competition: h4s[0] ? h4s[0].textContent.trim() : '',
            season: h4s[1] ? h4s[1].textContent.trim() : '',
            group: h5 ? h5.textContent.trim() : ''
        };

        if (!info.competition || !info.group) return null;

        const teams = [];
        const rows = main.querySelectorAll('table tr');
        for (const row of rows) {
            const cells = Array.from(row.querySelectorAll('td'));
            if (cells.length >= 8) {
                const pos = parseInt(cells[1] && cells[1].textContent.trim());
                if (!isNaN(pos) && pos > 0) {
                    teams.push({
                        pos: pos,
                        team: cells[2] ? cells[2].textContent.trim() : '',
                        pts: parseInt(cells[3] && cells[3].textContent.trim()) || 0,
                        pj: parseInt(cells[4] && cells[4].textContent.trim()) || 0,
                        pg: parseInt(cells[5] && cells[5].textContent.trim()) || 0,
                        pe: parseInt(cells[6] && cells[6].textContent.trim()) || 0,
                        pp: parseInt(cells[7] && cells[7].textContent.trim()) || 0
                    });
                }
            }
        }

        if (teams.length === 0) return null;
        return { info, teams };
    }""")


def discover_groups_via_portal(page, cod_temporada=20):
    """
    Discover competition and group codes using the FIFLP portal page.
    The portal has cascading dropdowns: Season -> Competition -> Group.
    This avoids brute-forcing codes.

    CodTemporada: 20=2024-2025, 21=2025-2026
    """
    print(f"\nPhase 1: Discovering groups via portal (CodTemporada={cod_temporada})...", flush=True)

    url = f"{PORTAL_URL}&CodTemporada={cod_temporada}"
    if not safe_goto(page, url):
        print("  ERROR: Cannot access FIFLP portal. Blocked or down.", flush=True)
        return None

    # Extract competition dropdown options
    competitions = page.evaluate("""() => {
        const sel = document.querySelector('select[name="codcompeticion"], #codcompeticion, select');
        if (!sel) return [];
        return Array.from(sel.options)
            .filter(o => o.value && o.value !== '0')
            .map(o => ({code: parseInt(o.value), name: o.textContent.trim()}));
    }""")

    if not competitions:
        print("  No competitions found in dropdown. Trying to extract from page...", flush=True)
        # Try snapshot of all selects
        all_selects = page.evaluate("""() => {
            return Array.from(document.querySelectorAll('select')).map(s => ({
                id: s.id, name: s.name,
                options: Array.from(s.options).map(o => ({value: o.value, text: o.textContent.trim()}))
            }));
        }""")
        print(f"  Found {len(all_selects)} selects on page", flush=True)
        for s in all_selects:
            print(f"    {s['id'] or s['name']}: {len(s['options'])} options", flush=True)
            for o in s['options'][:5]:
                print(f"      {o['value']}: {o['text']}", flush=True)
        return None

    print(f"  Found {len(competitions)} competitions:", flush=True)
    for c in competitions:
        print(f"    {c['code']}: {c['name']}", flush=True)

    # For each competition, select it and get the group dropdown
    all_groups = []
    for comp in competitions:
        # Check if this competition is relevant to our categories
        comp_lower = comp["name"].lower()
        category = None
        for cat, keywords in CATEGORIES.items():
            if any(kw in comp_lower for kw in keywords):
                category = cat
                break

        if not category:
            print(f"  Skipping {comp['name']} (not benjamin/prebenjamin)", flush=True)
            continue

        print(f"\n  Selecting competition: {comp['name']}...", flush=True)

        # Select the competition in the dropdown and wait for group dropdown to populate
        try:
            page.select_option('select[name="codcompeticion"], #codcompeticion, select', str(comp["code"]))
            page.wait_for_timeout(3000)  # Wait for AJAX to populate groups

            groups = page.evaluate("""() => {
                const selects = document.querySelectorAll('select');
                // The group dropdown is typically the second select
                for (const sel of selects) {
                    const opts = Array.from(sel.options)
                        .filter(o => o.value && o.value !== '0' && o.textContent.trim().toLowerCase().includes('grupo'));
                    if (opts.length > 0) {
                        return opts.map(o => ({code: parseInt(o.value), name: o.textContent.trim()}));
                    }
                }
                // Try any second select
                if (selects.length >= 2) {
                    return Array.from(selects[1].options)
                        .filter(o => o.value && o.value !== '0')
                        .map(o => ({code: parseInt(o.value), name: o.textContent.trim()}));
                }
                return [];
            }""")

            for g in groups:
                all_groups.append({
                    "comp_code": comp["code"],
                    "comp_name": comp["name"],
                    "group_code": g["code"],
                    "group_name": g["name"],
                    "category": category,
                })
                print(f"    Group: {g['name']} (code={g['code']})", flush=True)

        except Exception as e:
            print(f"    Error selecting competition: {e}", flush=True)

        random_delay()

    return all_groups


def scrape_known_groups(page, groups):
    """
    Scrape standings for a list of known group codes.
    Much more efficient than brute-force discovery.
    """
    print(f"\nPhase 2: Scraping {len(groups)} known groups...", flush=True)

    results = {"benjamin": {"groups": []}, "prebenjamin": {"groups": []}}

    for i, g in enumerate(groups):
        print(f"\n  [{i+1}/{len(groups)}] {g['comp_name']} - {g['group_name']}...", flush=True)

        url = f"{CLASIF_URL}?cod_primaria=1000120&codjornada=99&codcompeticion={g['comp_code']}&codgrupo={g['group_code']}"

        if not safe_goto(page, url):
            print(f"    BLOCKED! Aborting to save progress.", flush=True)
            break

        data = extract_standings(page)
        if data:
            entry = {
                "codgrupo": g["group_code"],
                "name": data["info"]["group"],
                "full_name": f"{g['comp_name']} - {data['info']['group']}",
                "comp_id": g["comp_code"],
                "standings": data["teams"],
            }
            results[g["category"]]["groups"].append(entry)

            print(f"    OK: {data['info']['group']} ({len(data['teams'])} teams)", flush=True)
            for t in data["teams"][:3]:
                print(f"      {t['pos']:>2}. {t['team']:<35} {t['pts']:>3}pts", flush=True)
            if len(data["teams"]) > 3:
                print(f"      ... and {len(data['teams']) - 3} more teams", flush=True)
        else:
            print(f"    No standings data found", flush=True)

        random_delay()

    return results


def merge_with_existing(new_data, existing_path):
    """Merge new scraped data with existing data file, avoiding duplicates."""
    if not os.path.exists(existing_path):
        return new_data

    with open(existing_path, "r", encoding="utf-8") as f:
        existing = json.load(f)

    for cat in ("benjamin", "prebenjamin"):
        existing_codes = {g.get("codgrupo") for g in existing.get(cat, {}).get("groups", [])}
        new_groups = new_data.get(cat, {}).get("groups", [])

        for g in new_groups:
            if g["codgrupo"] not in existing_codes:
                if cat not in existing:
                    existing[cat] = {"groups": []}
                existing[cat]["groups"].append(g)
                print(f"  Added new group: {g['name']} to {cat}", flush=True)
            else:
                # Update existing group with fresh data
                for i, eg in enumerate(existing[cat]["groups"]):
                    if eg["codgrupo"] == g["codgrupo"]:
                        existing[cat]["groups"][i] = g
                        print(f"  Updated group: {g['name']} in {cat}", flush=True)
                        break

    return existing


def main():
    discover_only = "--discover-only" in sys.argv
    groups_file = None
    for i, arg in enumerate(sys.argv):
        if arg == "--groups-file" and i + 1 < len(sys.argv):
            groups_file = sys.argv[i + 1]

    print("=== FIFLP 2024-2025 Smart Scraper ===", flush=True)
    print(f"  Delays: {MIN_DELAY}-{MAX_DELAY}s between requests", flush=True)
    print(f"  Block backoff: {BLOCK_BACKOFF}s", flush=True)
    print(flush=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        # Step 1: Test connectivity
        print("Step 1: Testing connection...", flush=True)
        test_url = f"{CLASIF_URL}?cod_primaria=1000120&codjornada=99&codcompeticion=1581&codgrupo=190080"
        if not safe_goto(page, test_url):
            print("ERROR: Cannot access FIFLP. Site may be blocking us.", flush=True)
            print("Try again later (blocks usually last 30-60 min).", flush=True)
            browser.close()
            sys.exit(1)

        data = extract_standings(page)
        if data:
            print(f"  OK! Connected to FIFLP", flush=True)
            print(f"  {data['info']['competition']} - {data['info']['group']}: {len(data['teams'])} teams", flush=True)
        else:
            print("ERROR: Page loaded but no standings found.", flush=True)
            browser.close()
            sys.exit(1)

        random_delay()

        # Step 2: Get group codes
        groups = None

        if groups_file and os.path.exists(groups_file):
            # Load from provided file
            with open(groups_file, "r") as f:
                groups = json.load(f)
            print(f"\nLoaded {len(groups)} groups from {groups_file}", flush=True)

        elif os.path.exists(GROUPS_CACHE):
            # Load from cache
            with open(GROUPS_CACHE, "r") as f:
                groups = json.load(f)
            print(f"\nLoaded {len(groups)} groups from cache", flush=True)

        if not groups:
            # Discover via portal
            groups = discover_groups_via_portal(page)
            if groups:
                # Save to cache
                with open(GROUPS_CACHE, "w") as f:
                    json.dump(groups, f, ensure_ascii=False, indent=2)
                print(f"\nSaved {len(groups)} groups to cache: {GROUPS_CACHE}", flush=True)
            else:
                print("\nCould not discover groups via portal.", flush=True)
                print("You can provide groups manually with --groups-file", flush=True)
                browser.close()
                sys.exit(1)

        if discover_only:
            print("\n--discover-only: stopping after discovery.", flush=True)
            browser.close()
            return

        # Step 3: Scrape standings for each group
        results = scrape_known_groups(page, groups)
        browser.close()

    # Step 4: Merge and save
    print("\nStep 4: Saving results...", flush=True)
    final_data = {
        "season": "2024-2025",
        "source": "fiflp.com",
        **results,
    }

    # Merge with existing data
    final_data = merge_with_existing(results, OUTPUT_PATH)
    if "season" not in final_data:
        final_data["season"] = "2024-2025"
        final_data["source"] = "fiflp.com"

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(final_data, f, ensure_ascii=False, indent=2)

    print(f"\nSaved to {OUTPUT_PATH}", flush=True)

    # Summary
    for cat in ("benjamin", "prebenjamin"):
        groups_data = final_data.get(cat, {}).get("groups", [])
        total_teams = sum(len(g.get("standings", [])) for g in groups_data)
        print(f"  {cat}: {len(groups_data)} groups, {total_teams} teams", flush=True)


if __name__ == "__main__":
    main()
