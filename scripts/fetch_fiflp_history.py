#!/usr/bin/env python3
"""
fetch_fiflp_history.py — Scrapes historical season data from fiflp.com (FIFLP federation site).
Uses Playwright for JS-rendered pages.

Usage: python3 scripts/fetch_fiflp_history.py
"""

import json
import re
import sys
import time
import os

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "scripts"))

from playwright.sync_api import sync_playwright

BASE = "https://www.fiflp.com/pnfg/NPcd"

# Known competition codes for 2024-2025 season (codtemporada=20)
COMPETITIONS_2024_25 = {
    "benjamin": [
        {"code": 1574, "name": "BENJAMIN PREFERENTE"},
        {"code": 1576, "name": "BENJAMIN PRIMERA"},
    ],
    "prebenjamin": [
        {"code": 1581, "name": "PREBENJAMIN"},
    ],
}

DELAY = 2.0  # seconds between requests


def get_page_data(page, url, max_retries=2):
    """Navigate to URL and wait for content to load. Returns page content or None."""
    for attempt in range(max_retries):
        page.goto(url, wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(2000)

        # Check if content loaded
        content = page.content()
        if len(content) > 100:
            return content

        if attempt < max_retries - 1:
            print(f"  Retry {attempt + 1}...")
            time.sleep(DELAY * 2)

    return None


def find_groups(page, codcompeticion):
    """Find all group codes for a given competition by trying a range of codes."""
    groups = []
    # Known group code: 190080 for prebenjamin grupo 2
    # Try a wide range
    for g in range(189900, 190200):
        url = f"{BASE}/NFG_VisClasificacion?cod_primaria=1000120&codjornada=99&codcompeticion={codcompeticion}&codgrupo={g}"
        try:
            page.goto(url, wait_until="networkidle", timeout=8000)
            page.wait_for_timeout(1500)

            info = page.evaluate("""() => {
                const h5 = document.querySelector('h5');
                const h4s = document.querySelectorAll('h4');
                const main = document.querySelector('main');
                if (!main) return null;
                const links = main.querySelectorAll('a[href*="codequipo"]');
                return {
                    group: h5 ? h5.textContent.trim() : null,
                    comp: h4s.length > 0 ? h4s[0].textContent.trim() : null,
                    teamCount: links.length
                };
            }""")

            if info and info.get("group") and info.get("teamCount", 0) > 0:
                groups.append({
                    "codgrupo": g,
                    "name": info["group"],
                    "teams": info["teamCount"]
                })
                print(f"    Found: {info['group']} (code={g}, {info['teamCount']} teams)")

            time.sleep(0.5)
        except Exception:
            pass

    return groups


def scrape_standings(page, codcompeticion, codgrupo, codjornada=99):
    """Scrape standings for a specific competition/group."""
    url = f"{BASE}/NFG_VisClasificacion?cod_primaria=1000120&codjornada={codjornada}&codcompeticion={codcompeticion}&codgrupo={codgrupo}"

    content = get_page_data(page, url)
    if not content:
        return None

    data = page.evaluate("""() => {
        const result = { teams: [], matches: [], info: {} };

        // Get competition/group info
        const h4s = document.querySelectorAll('h4');
        const h5 = document.querySelector('h5');
        result.info.competition = h4s[0] ? h4s[0].textContent.trim() : '';
        result.info.season = h4s[1] ? h4s[1].textContent.trim() : '';
        result.info.group = h5 ? h5.textContent.trim() : '';

        // Get standings from main table
        const main = document.querySelector('main');
        if (!main) return result;

        const tables = main.querySelectorAll('table');
        if (tables.length === 0) return result;

        // First table is standings
        const standingsTable = tables[0];
        const tbodies = standingsTable.querySelectorAll('tbody');
        if (tbodies.length >= 3) {
            // Third tbody has the actual team rows
            const rows = tbodies[2].querySelectorAll('tr');
            rows.forEach(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length >= 9) {
                    const team = {
                        pos: parseInt(cells[1]?.textContent?.trim()) || 0,
                        name: cells[2]?.textContent?.trim() || '',
                        pts: parseInt(cells[3]?.textContent?.trim()) || 0,
                        pj: parseInt(cells[4]?.textContent?.trim()) || 0,
                        pg: parseInt(cells[5]?.textContent?.trim()) || 0,
                        pe: parseInt(cells[6]?.textContent?.trim()) || 0,
                        pp: parseInt(cells[7]?.textContent?.trim()) || 0,
                        form: cells[8]?.textContent?.trim() || '',
                    };
                    if (team.name) result.teams.push(team);
                }
            });
        }

        // Get match results (jornada section)
        const h3 = main.querySelector('h3');
        if (h3) {
            result.info.jornada = h3.textContent.trim();
        }

        // Match results table (second table in main)
        if (tables.length > 1) {
            const matchTable = tables[tables.length - 1];
            // Check if this is the retired teams table or match table
            const matchRows = matchTable.querySelectorAll('tbody tr');
            matchRows.forEach(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length === 3) {
                    const home = cells[0]?.textContent?.trim();
                    const score = cells[1]?.textContent?.trim();
                    const away = cells[2]?.textContent?.trim();
                    if (home && away && score && score.includes('-')) {
                        result.matches.push({ home, score, away });
                    }
                }
            });
        }

        return result;
    }""")

    return data


def scrape_all_jornadas(page, codcompeticion, codgrupo, max_jornada=30):
    """Scrape match results for all jornadas."""
    all_matches = {}

    for j in range(1, max_jornada + 1):
        url = f"{BASE}/NFG_VisClasificacion?cod_primaria=1000120&codjornada={j}&codcompeticion={codcompeticion}&codgrupo={codgrupo}"

        try:
            content = get_page_data(page, url)
            if not content:
                continue

            data = page.evaluate("""() => {
                const main = document.querySelector('main');
                if (!main) return null;

                const h3 = main.querySelector('h3');
                const jornada = h3 ? h3.textContent.trim() : '';

                const matches = [];
                // Find match results in the last section
                const tables = main.querySelectorAll('table');
                for (const table of tables) {
                    const rows = table.querySelectorAll('tbody tr');
                    rows.forEach(row => {
                        const cells = Array.from(row.querySelectorAll('td'));
                        if (cells.length === 3) {
                            const home = cells[0]?.textContent?.trim();
                            const score = cells[1]?.textContent?.trim();
                            const away = cells[2]?.textContent?.trim();
                            if (home && away && score && score.includes('-')) {
                                matches.push({ home, score, away });
                            }
                        }
                    });
                }

                return { jornada, matches };
            }""")

            if data and data.get("matches"):
                all_matches[j] = data
                print(f"      Jornada {j}: {len(data['matches'])} matches")
            else:
                # No more jornadas
                if j > 5:
                    break

            time.sleep(1.0)
        except Exception as e:
            print(f"      Jornada {j}: error - {e}")
            continue

    return all_matches


def main():
    print("=== FIFLP Historical Data Scraper ===")
    print()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        # Step 1: Get the prebenjamin data (we know the codes)
        # First, let's verify we can access the known URL
        print("Step 1: Testing connection...")
        standings = scrape_standings(page, 1581, 190080)
        if not standings or not standings.get("teams"):
            print("ERROR: Could not access FIFLP site. Try again later.")
            browser.close()
            return

        print(f"  OK! Found {len(standings['teams'])} teams for {standings['info'].get('competition', '?')}")
        print(f"  Season: {standings['info'].get('season', '?')}")
        print(f"  Group: {standings['info'].get('group', '?')}")
        print()

        # Step 2: Find group codes for each competition
        print("Step 2: Finding all groups...")
        all_data = {}

        for category, comps in COMPETITIONS_2024_25.items():
            all_data[category] = []
            for comp in comps:
                print(f"\n  Competition: {comp['name']} (code={comp['code']})")
                groups = find_groups(page, comp["code"])

                for group in groups:
                    print(f"\n    Scraping standings for {group['name']}...")
                    standings = scrape_standings(page, comp["code"], group["codgrupo"])

                    if standings and standings.get("teams"):
                        entry = {
                            "competition": comp["name"],
                            "codcompeticion": comp["code"],
                            "codgrupo": group["codgrupo"],
                            "group": group["name"],
                            "season": standings["info"].get("season", "2024-2025"),
                            "standings": standings["teams"],
                        }
                        all_data[category].append(entry)

                        # Print standings
                        for t in standings["teams"]:
                            print(f"      {t['pos']:>2}. {t['name']:<35} {t['pts']:>3}pts  {t['pj']}j {t['pg']}g {t['pe']}e {t['pp']}p")

                    time.sleep(DELAY)

        browser.close()

    # Step 3: Save results
    output_path = os.path.join(PROJECT_ROOT, "data-history-2024.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2)

    print(f"\n\nSaved to {output_path}")

    # Summary
    for cat, groups in all_data.items():
        total_teams = sum(len(g.get("standings", [])) for g in groups)
        print(f"  {cat}: {len(groups)} groups, {total_teams} teams")


if __name__ == "__main__":
    main()
