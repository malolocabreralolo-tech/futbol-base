#!/usr/bin/env python3
"""
One-time import: reads current data-*.js files and populates futbolbase.db.

Usage:
    python3 scripts/import_existing.py
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import (
    get_connection,
    init_db,
    get_or_create_season,
    get_or_create_category,
    get_or_create_team,
    get_or_create_group,
    DB_PATH,
    PROJECT_ROOT,
)

SEASON_NAME = "2025-2026"
START_YEAR = 2025
END_YEAR = 2026


def read_file(filename):
    """Read a JS data file from the project root."""
    path = os.path.join(PROJECT_ROOT, filename)
    with open(path, encoding="utf-8") as f:
        return f.read()


def extract_json(text, var_name):
    """Extract the JSON value assigned to a JS const, handling both arrays and objects."""
    # Match: const VAR_NAME = <json>;
    pattern = rf"const\s+{var_name}\s*=\s*"
    m = re.search(pattern, text)
    if not m:
        return None
    start = m.end()
    # Find matching bracket/brace
    opener = text[start]
    closer = "]" if opener == "[" else "}"
    depth = 0
    i = start
    while i < len(text):
        ch = text[i]
        if ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                return json.loads(text[start : i + 1])
        elif ch == '"':
            # Skip string contents
            i += 1
            while i < len(text) and text[i] != '"':
                if text[i] == "\\":
                    i += 1
                i += 1
        i += 1
    return None


def import_groups_and_standings(conn, season_id, category_id, groups_data):
    """Import groups, standings, and upcoming matches from BENJAMIN/PREBENJAMIN arrays."""
    stats = {"groups": 0, "standings": 0, "matches": 0}
    for g in groups_data:
        group_id = get_or_create_group(
            conn,
            season_id,
            category_id,
            g["id"],
            name=g.get("name"),
            full_name=g.get("fullName"),
            phase=g.get("phase"),
            island=g.get("island"),
            url=g.get("url"),
            current_jornada=g.get("jornada"),
        )
        stats["groups"] += 1

        # Standings: [pos, team, pts, J, G, E, P, GF, GC, DF]
        for row in g.get("standings", []):
            pos, team_name, pts, played, won, drawn, lost, gf, gc, gd = row
            team_id = get_or_create_team(conn, team_name)
            conn.execute(
                """INSERT OR REPLACE INTO standings
                   (group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (group_id, team_id, pos, pts, played, won, drawn, lost, gf, gc, gd),
            )
            stats["standings"] += 1

        # Upcoming matches (from current jornada): [date, time, home, away, hs, as, venue]
        jornada = g.get("jornada")
        for row in g.get("matches", []):
            date_str, time_str, home, away, hs, as_, venue = row
            home_id = get_or_create_team(conn, home)
            away_id = get_or_create_team(conn, away)
            conn.execute(
                """INSERT OR IGNORE INTO matches
                   (group_id, jornada, date, time, home_team_id, away_team_id, home_score, away_score, venue)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (group_id, jornada, date_str, time_str, home_id, away_id, hs, as_, venue),
            )
            stats["matches"] += 1

    conn.commit()
    return stats


def import_history(conn, season_id):
    """Import historical match results from HISTORY object."""
    text = read_file("data-history.js")
    history = extract_json(text, "HISTORY")
    if not history:
        print("  WARNING: Could not parse HISTORY")
        return 0

    count = 0
    for group_code, jornadas in history.items():
        # Find the group_id — try both categories
        group_id = None
        for cat_name in ("BENJAMIN", "PREBENJAMIN"):
            cur = conn.execute(
                """SELECT g.id FROM groups g
                   JOIN categories c ON g.category_id = c.id
                   WHERE g.season_id=? AND g.code=? AND c.name=?""",
                (season_id, group_code, cat_name),
            )
            row = cur.fetchone()
            if row:
                group_id = row[0]
                break
        if not group_id:
            print(f"  WARNING: group '{group_code}' not found, skipping")
            continue

        for jornada, matches in jornadas.items():
            for m in matches:
                # [date, home, away, hs, as]
                date_str, home, away, hs, as_ = m
                home_id = get_or_create_team(conn, home)
                away_id = get_or_create_team(conn, away)
                conn.execute(
                    """INSERT OR IGNORE INTO matches
                       (group_id, jornada, date, time, home_team_id, away_team_id, home_score, away_score, venue)
                       VALUES (?,?,?,?,?,?,?,?,?)""",
                    (group_id, jornada, date_str, None, home_id, away_id, hs, as_, None),
                )
                count += 1

    conn.commit()
    return count


def import_match_details(conn):
    """Import goal details from MATCH_DETAIL object."""
    text = read_file("data-matchdetail.js")
    details = extract_json(text, "MATCH_DETAIL")
    if not details:
        print("  WARNING: Could not parse MATCH_DETAIL")
        return 0

    count = 0
    for key, detail in details.items():
        # Key format: "Home|Away|hs-as"
        parts = key.split("|")
        if len(parts) != 3:
            print(f"  WARNING: bad match detail key: {key}")
            continue
        home_name, away_name, score = parts
        score_parts = score.split("-")
        if len(score_parts) != 2:
            continue
        hs, as_ = int(score_parts[0]), int(score_parts[1])

        # Find the match by team names and score
        cur = conn.execute(
            """SELECT m.id FROM matches m
               JOIN teams h ON m.home_team_id = h.id
               JOIN teams a ON m.away_team_id = a.id
               WHERE h.name=? AND a.name=? AND m.home_score=? AND m.away_score=?""",
            (home_name, away_name, hs, as_),
        )
        row = cur.fetchone()
        if not row:
            # Might have multiple matches with same teams/score; skip if not found
            continue
        match_id = row[0]

        for goal in detail.get("g", []):
            # [minute, player, running_score, side, type]
            minute, player, running_score, side, gtype = goal
            conn.execute(
                """INSERT INTO goals (match_id, minute, player_name, running_score, side, type)
                   VALUES (?,?,?,?,?,?)""",
                (match_id, minute, player, running_score, side, gtype),
            )
            count += 1

    conn.commit()
    return count


def import_shields(conn):
    """Import shield filenames from SHIELDS object."""
    text = read_file("data-shields.js")
    shields = extract_json(text, "SHIELDS")
    if not shields:
        print("  WARNING: Could not parse SHIELDS")
        return 0

    count = 0
    for team_name, filename in shields.items():
        get_or_create_team(conn, team_name, shield_filename=filename)
        count += 1

    conn.commit()
    return count


def _extract_group_code(scorer_group_name):
    """
    Extract the group code from a scorer group name.
    Examples:
      'BENJAMIN SEGUNDA FASE A-G1' -> 'A1'
      'BENJAMIN SEGUNDA FASE B-G2' -> 'B2'
      'BENJAMIN SEGUNDA FASE C-G4' -> 'C4'
      'BENJAMIN PRIMERA LANZAROTE G1' -> 'LZ1'
      'BENJAMIN PRIMERA LANZAROTE G2' -> 'LZ2'
      'BENJAMIN FUERTEVENTURA LIGA ORO' -> 'FO'
      'BENJAMIN FUERTEVENTURA LIGA PLATA' -> 'FP'
      'BENJAMIN FUERTEVENTURA LIGA BRONCE' -> 'FB'
      'PREBENJAMIN GC GRUPO 1' -> 'PG1'
      'PREBENJAMIN GC GRUPO 2' -> 'PG2'
    """
    s = scorer_group_name.upper()

    # Fuerteventura special codes
    if "FUERTEVENTURA" in s:
        if "ORO" in s:
            return "FO"
        if "PLATA" in s:
            return "FP"
        if "BRONCE" in s:
            return "FB"

    # Lanzarote: "BENJAMIN PRIMERA LANZAROTE G1" -> "LZ1"
    m = re.search(r"LANZAROTE\s+G(\d+)", s)
    if m:
        return f"LZ{m.group(1)}"

    # Segunda Fase: "BENJAMIN SEGUNDA FASE A-G1" -> "A1"
    m = re.search(r"FASE\s+([A-C])-G(\d+)", s)
    if m:
        return f"{m.group(1)}{m.group(2)}"

    # Prebenjamin: "PREBENJAMIN GC GRUPO 1" -> "PG1"
    m = re.search(r"PREBENJAMIN\s+GC\s+GRUPO\s+(\d+)", s)
    if m:
        return f"PG{m.group(1)}"

    return None


def import_scorers(conn, season_id):
    """Import top scorers from GOL_BENJ and GOL_PREBENJ."""
    text = read_file("data-goleadores.js")

    # Build a lookup: (category_name, group_code) -> group_id
    group_lookup = {}
    cur = conn.execute(
        """SELECT g.id, g.code, c.name FROM groups g
           JOIN categories c ON g.category_id = c.id
           WHERE g.season_id=?""",
        (season_id,),
    )
    for gid, code, cat in cur.fetchall():
        group_lookup[(cat, code)] = gid

    total = 0
    for var_name, cat_name in [("GOL_BENJ", "BENJAMIN"), ("GOL_PREBENJ", "PREBENJAMIN")]:
        data = extract_json(text, var_name)
        if not data:
            print(f"  WARNING: Could not parse {var_name}")
            continue

        for entry in data:
            group_full_name = entry["g"]
            code = _extract_group_code(group_full_name)
            group_id = group_lookup.get((cat_name, code)) if code else None

            if not group_id:
                print(f"  WARNING: scorer group not found: '{group_full_name}' -> code={code} ({cat_name})")
                continue

            for scorer in entry["s"]:
                # [player_name, team_name, goals, games]
                player_name, team_name, goals, games = scorer
                team_id = get_or_create_team(conn, team_name)
                conn.execute(
                    """INSERT OR REPLACE INTO scorers
                       (group_id, player_name, team_id, goals, games)
                       VALUES (?,?,?,?,?)""",
                    (group_id, player_name, team_id, goals, games),
                )
                total += 1

    conn.commit()
    return total


def main():
    # Remove existing DB to start fresh
    for ext in ("", "-wal", "-shm"):
        path = DB_PATH + ext
        if os.path.exists(path):
            os.remove(path)

    conn = get_connection()
    init_db(conn)

    print("=== Importing futbol-base data into SQLite ===")
    print(f"DB: {DB_PATH}\n")

    # 1. Season
    season_id = get_or_create_season(conn, SEASON_NAME, START_YEAR, END_YEAR, is_current=True)
    print(f"Season: {SEASON_NAME} (id={season_id})")

    # 2. Categories
    benj_cat = get_or_create_category(conn, "BENJAMIN")
    prebenj_cat = get_or_create_category(conn, "PREBENJAMIN")
    print(f"Categories: BENJAMIN (id={benj_cat}), PREBENJAMIN (id={prebenj_cat})")

    # 3. Import BENJAMIN groups/standings/upcoming matches
    print("\nImporting BENJAMIN groups...")
    text = read_file("data-benjamin.js")
    benj_data = extract_json(text, "BENJAMIN")
    if benj_data:
        stats = import_groups_and_standings(conn, season_id, benj_cat, benj_data)
        print(f"  Groups: {stats['groups']}, Standings: {stats['standings']}, Upcoming matches: {stats['matches']}")
    else:
        print("  ERROR: Could not parse BENJAMIN data")

    # 4. Import PREBENJAMIN groups/standings/upcoming matches
    print("\nImporting PREBENJAMIN groups...")
    text = read_file("data-prebenjamin.js")
    prebenj_data = extract_json(text, "PREBENJAMIN")
    if prebenj_data:
        stats = import_groups_and_standings(conn, season_id, prebenj_cat, prebenj_data)
        print(f"  Groups: {stats['groups']}, Standings: {stats['standings']}, Upcoming matches: {stats['matches']}")
    else:
        print("  ERROR: Could not parse PREBENJAMIN data")

    # 5. Import shields
    print("\nImporting shields...")
    n = import_shields(conn)
    print(f"  Shields updated: {n}")

    # 6. Import history matches
    print("\nImporting history matches...")
    n = import_history(conn, season_id)
    print(f"  History matches: {n}")

    # 7. Import match details (goals)
    print("\nImporting match details (goals)...")
    n = import_match_details(conn)
    print(f"  Goals: {n}")

    # 8. Import scorers
    print("\nImporting scorers...")
    n = import_scorers(conn, season_id)
    print(f"  Scorers: {n}")

    # Final stats
    print("\n=== Final counts ===")
    tables = ["seasons", "categories", "groups", "teams", "standings", "matches", "goals", "scorers"]
    for t in tables:
        count = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"  {t}: {count}")

    conn.close()
    print(f"\nDone! DB written to {DB_PATH}")


if __name__ == "__main__":
    main()
