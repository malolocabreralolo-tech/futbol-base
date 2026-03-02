#!/usr/bin/env python3
"""
import_history.py — Import historical season data from data-history-2024.json into SQLite.

Reads the JSON file produced by the scraper and inserts it into the futbolbase.db
as a non-current season. Then regenerates all JS data files.

Usage: python3 scripts/import_history.py
"""

import json
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db import get_connection, init_db, get_or_create_season, get_or_create_category, \
    get_or_create_team, get_or_create_group

HISTORY_FILE = os.path.join(PROJECT_ROOT, "data-history-2024.json")


def import_season(conn, data):
    """Import a full season's data into the database."""
    season_name = data.get("season", "2024-2025")
    parts = season_name.split("-")
    start_year = int(parts[0])
    end_year = int(parts[1]) if len(parts) > 1 else start_year + 1

    # Create the season (not current)
    season_id = get_or_create_season(conn, season_name, start_year, end_year, is_current=False)
    print(f"Season: {season_name} (id={season_id})")

    total_teams = 0
    total_matches = 0

    for category_key in ("benjamin", "prebenjamin"):
        cat_data = data.get(category_key, {})
        groups = cat_data.get("groups", [])
        if not groups:
            continue

        cat_id = get_or_create_category(conn, category_key)
        print(f"\n  Category: {category_key} ({len(groups)} groups)")

        for group_data in groups:
            group_name = group_data.get("name", "Unknown")
            comp_id = group_data.get("comp_id", 0)
            code = f"hist_{comp_id}" if comp_id else group_name.lower().replace(" ", "_")

            group_id = get_or_create_group(
                conn, season_id, cat_id, code,
                name=group_name,
                full_name=group_data.get("full_name", group_name),
                island="Gran Canaria",
            )

            # Import standings
            standings = group_data.get("standings", [])
            for team_data in standings:
                team_name = team_data.get("team", "").strip()
                if not team_name:
                    continue

                team_id = get_or_create_team(conn, team_name)

                conn.execute("""
                    INSERT OR REPLACE INTO standings
                    (group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    group_id, team_id,
                    team_data.get("pos"),
                    team_data.get("pts"),
                    team_data.get("pj"),
                    team_data.get("pg"),
                    team_data.get("pe"),
                    team_data.get("pp"),
                    team_data.get("gf"),
                    team_data.get("gc"),
                    team_data.get("dg"),
                ))
                total_teams += 1

            # Import matches (jornadas)
            jornadas = group_data.get("jornadas", {})
            for jornada_num, jornada_data in jornadas.items():
                matches = jornada_data.get("matches", [])
                jornada_date = jornada_data.get("date", "")

                for match in matches:
                    home_name = match.get("home", "").strip()
                    away_name = match.get("away", "").strip()
                    if not home_name or not away_name:
                        continue

                    home_id = get_or_create_team(conn, home_name)
                    away_id = get_or_create_team(conn, away_name)

                    home_score = match.get("home_score")
                    away_score = match.get("away_score")

                    try:
                        conn.execute("""
                            INSERT OR IGNORE INTO matches
                            (group_id, jornada, date, home_team_id, away_team_id, home_score, away_score)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, (
                            group_id, str(jornada_num), jornada_date,
                            home_id, away_id, home_score, away_score,
                        ))
                        total_matches += 1
                    except Exception as e:
                        print(f"    Warning: {e}")

            print(f"    {group_name}: {len(standings)} teams, {sum(len(j.get('matches', [])) for j in jornadas.values())} matches")

    conn.commit()
    print(f"\nTotal: {total_teams} team standings, {total_matches} matches imported")


def main():
    if not os.path.exists(HISTORY_FILE):
        print(f"Error: {HISTORY_FILE} not found.")
        print("Run the scraper first to generate it.")
        sys.exit(1)

    with open(HISTORY_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    conn = get_connection()
    init_db(conn)

    print("=== Importing Historical Season Data ===\n")
    import_season(conn, data)

    conn.close()
    print("\nDone! Run generate_js.py to regenerate data files.")


if __name__ == "__main__":
    main()
