#!/usr/bin/env python3
"""
import_wayback_2425.py — Imports wayback_2425_raw.json into futbolbase.db.

Only touches season 2024-2025 groups for Benjamin Primera Fase GC (P1-P14)
and Prebenjamín GC (PGC1-PGC4). Does NOT modify other groups or seasons.
"""

import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import (get_connection, init_db, get_or_create_season,
                get_or_create_category, get_or_create_team,
                get_or_create_group, PROJECT_ROOT, DB_PATH)

RAW_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wayback_2425_raw.json")

SEASON_NAME  = "2024-2025"
SEASON_START = 2024
SEASON_END   = 2025

CAT_MAP = {
    "benjamin":    "BENJAMIN",
    "prebenjamin": "PREBENJAMIN",
}


def slug_to_code(slug):
    """
    1benjamin1  -> P1   (Primera Fase GC, matches CODE_PREFIX["1576"]="P")
    1benjamin14 -> P14
    1prebenjamin1 -> PGC1
    1prebenjamin4 -> PGC4
    """
    m = re.match(r"1benjamin(\d+)$", slug)
    if m:
        return f"P{m.group(1)}"
    m = re.match(r"1prebenjamin(\d+)$", slug)
    if m:
        return f"PGC{m.group(1)}"
    return slug.upper()


def current_jornada_for_group(jornadas):
    last_played = None
    first_unplayed = None
    for jor in jornadas:
        num = jor["num"]
        played = any(m.get("hs") is not None for m in jor["matches"])
        upcoming = any(m.get("hs") is None and m.get("home") for m in jor["matches"])
        if played:
            last_played = num
        elif upcoming and first_unplayed is None:
            first_unplayed = num
    return last_played or first_unplayed


def fmt_date(raw_date):
    """2024-10-21 -> 21/10"""
    if not raw_date:
        return ""
    parts = raw_date.split("-")
    if len(parts) == 3:
        return f"{parts[2]}/{parts[1]}"
    return raw_date


def import_group(conn, g, season_id):
    slug = g["slug"]
    code = slug_to_code(slug)

    cat_name = CAT_MAP.get(g["category"], "BENJAMIN")
    cat_id   = get_or_create_category(conn, cat_name)

    phase    = g["phase"]
    num_str  = re.search(r"\d+$", slug)
    grp_name = f"Grupo {num_str.group(0)}" if num_str else slug

    if g["category"] == "benjamin":
        full_name = f"BENJAMIN {phase.upper()} - {grp_name}"
    else:
        full_name = f"PREBENJAMIN {phase.upper()} - {grp_name}"

    cur_jor = current_jornada_for_group(g.get("jornadas", []))

    group_id = get_or_create_group(
        conn, season_id, cat_id, code,
        name=grp_name,
        full_name=full_name,
        phase=phase,
        island=g.get("island", "gran_canaria"),
        url=g.get("url", ""),
        current_jornada=cur_jor,
    )

    # Clean previous data for this group
    conn.execute("DELETE FROM standings WHERE group_id=?", (group_id,))
    conn.execute("DELETE FROM matches   WHERE group_id=?", (group_id,))
    conn.commit()

    # Standings
    for s in g.get("standings", []):
        team_id = get_or_create_team(conn, s["team"])
        conn.execute(
            """INSERT OR REPLACE INTO standings
               (group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (group_id, team_id,
             s["pos"], s["pts"], s["j"], s["g"], s["e"], s["p"],
             s.get("gf", 0), s.get("gc", 0), s.get("df", 0)),
        )
    conn.commit()

    # Matches — wayback uses "as_" (not "as") for away score
    for jor in g.get("jornadas", []):
        for m in jor["matches"]:
            if not m.get("home") or not m.get("away"):
                continue
            home_id = get_or_create_team(conn, m["home"])
            away_id = get_or_create_team(conn, m["away"])
            hs  = m.get("hs")
            as_ = m.get("as_")
            score_h = hs  if (hs is not None and as_ is not None) else None
            score_a = as_ if (hs is not None and as_ is not None) else None
            conn.execute(
                """INSERT OR IGNORE INTO matches
                   (group_id, jornada, date, time, home_team_id, away_team_id,
                    home_score, away_score, venue)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (group_id, jor["num"],
                 fmt_date(m.get("date", "")), m.get("time", ""),
                 home_id, away_id,
                 score_h, score_a,
                 m.get("venue", "")),
            )
    conn.commit()

    played = sum(1 for j in g.get("jornadas", []) for m in j["matches"]
                 if m.get("hs") is not None)
    total  = sum(len(j["matches"]) for j in g.get("jornadas", []))
    print(f"  [{code}] {grp_name} ({phase}): "
          f"{len(g.get('standings', []))}eq | {total}p ({played}j) | jornada={cur_jor}")


def main():
    if not os.path.exists(RAW_PATH):
        print(f"ERROR: {RAW_PATH} not found. Run fetch_wayback_2425.py first.")
        sys.exit(1)

    with open(RAW_PATH, encoding="utf-8") as f:
        data = json.load(f)

    groups = data["groups"]
    groups_with_data = [
        g for g in groups
        if g.get("standings") or any(
            m.get("hs") is not None
            for j in g.get("jornadas", [])
            for m in j["matches"]
        )
    ]

    print(f"Importing {len(groups_with_data)}/{len(groups)} groups with data...")

    conn = get_connection()
    init_db(conn)

    season_id = get_or_create_season(conn, SEASON_NAME, SEASON_START, SEASON_END, is_current=False)

    for g in sorted(groups_with_data, key=lambda x: x["slug"]):
        import_group(conn, g, season_id)

    conn.close()
    print(f"\n  {len(groups_with_data)} groups imported into {DB_PATH} (season {SEASON_NAME})")


if __name__ == "__main__":
    main()
