#!/usr/bin/env python3
"""
import_wayback_2526_primera.py — Imports wayback_2526_primera_raw.json
into futbolbase.db (season 2025-2026).

Only adds Benjamin Primera Fase GC groups (P1-P23) for season 2025-26.
The current 2025-26 has Segunda Fase (A1-C4) + Lanzarote + Fuerteventura
+ Prebenjamin GC because futbolaspalmas removed Primera Fase URLs after
the regular season ended. These groups recover that data from Wayback.
"""

import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import (get_connection, init_db, get_or_create_season,
                get_or_create_category, get_or_create_team,
                get_or_create_group, PROJECT_ROOT, DB_PATH)

RAW_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "wayback_2526_primera_raw.json")

SEASON_NAME  = "2025-2026"
SEASON_START = 2025
SEASON_END   = 2026


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
    if not raw_date:
        return ""
    parts = raw_date.split("-")
    if len(parts) == 3:
        return f"{parts[2]}/{parts[1]}"
    return raw_date


def import_group(conn, g, season_id):
    grp_num = g.get("group_num")
    phase_num = g.get("phase_num", 2)
    code = g.get("group_code") or (f"FF{grp_num}" if phase_num == 2 else f"P{grp_num}")
    phase_name = g.get("phase") or ("Fase Final GC" if phase_num == 2 else "Primera Fase GC")
    full_name = g.get("group_name") or f"BENJAMIN {phase_name.upper()} - GRUPO {grp_num}"

    cat_id = get_or_create_category(conn, "BENJAMIN")
    grp_name = f"Grupo {grp_num}"

    cur_jor = current_jornada_for_group(g.get("jornadas", []))

    group_id = get_or_create_group(
        conn, season_id, cat_id, code,
        name=grp_name,
        full_name=full_name,
        phase=phase_name,
        island=g.get("island", "gran_canaria"),
        url=g.get("url", ""),
        current_jornada=cur_jor,
    )

    # Wipe previous data for this group (re-runnable)
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

    # Matches
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
                 home_id, away_id, score_h, score_a, m.get("venue", "")),
            )
    conn.commit()

    matches_count = sum(len(j["matches"]) for j in g.get("jornadas", []))
    played = sum(1 for j in g.get("jornadas", []) for m in j["matches"]
                 if m.get("hs") is not None)
    print(f"  [{code}] {grp_name}: {len(g.get('standings', []))}eq | "
          f"{matches_count}p ({played}j) | jornada={cur_jor}")


def main():
    if not os.path.exists(RAW_PATH):
        print(f"ERROR: {RAW_PATH} not found"); return
    with open(RAW_PATH, encoding="utf-8") as f:
        data = json.load(f)

    # Only import Phase 2 (FF1-FF23, "Fase Final GC") which is complete from
    # live futbolaspalmas. Phase 1 (gran-canaria-N) is partial (~4/15 groups
    # archived in Wayback) — would confuse users; leave for future re-scrape.
    groups = [g for g in data.get("groups", [])
              if g.get("phase_num", 2) == 2
              and (g.get("standings") or g.get("jornadas"))]
    print(f"Importing {len(groups)} Phase 2 groups (Fase Final GC)...")

    conn = get_connection()
    init_db(conn)
    season_id = get_or_create_season(conn, SEASON_NAME, SEASON_START, SEASON_END,
                                     is_current=True)

    for g in sorted(groups, key=lambda x: x.get("group_num", 999)):
        import_group(conn, g, season_id)

    conn.close()
    print(f"\n  {len(groups)} groups imported into {DB_PATH} (season {SEASON_NAME})")


if __name__ == "__main__":
    main()
