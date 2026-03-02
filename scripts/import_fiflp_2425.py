#!/usr/bin/env python3
"""
import_fiflp_2425.py — Imports fiflp_2425_raw.json into futbolbase.db.

Only touches season 2024-2025. Does NOT modify 2025-2026 data.
Maps FIFLP competitions to internal group codes.
"""

import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import (get_connection, init_db, get_or_create_season,
                get_or_create_category, get_or_create_team,
                get_or_create_group, PROJECT_ROOT, DB_PATH)

RAW_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fiflp_2425_raw.json")

SEASON_NAME  = "2024-2025"
SEASON_START = 2024
SEASON_END   = 2025

# competition_id -> code prefix (unique per competition)
CODE_PREFIX = {
    # Benjamin GC
    "1576": "P",     # Primera Fase GC
    "1706": "A",     # Segunda Fase A GC
    "1707": "B",     # Segunda Fase B GC
    "1708": "C",     # Segunda Fase C GC
    "1709": "D",     # Segunda Fase D GC
    "1710": "E",     # Segunda Fase E GC
    # Benjamin Lanzarote
    "1575": "LZP",   # Preferente Lanzarote
    "1578": "LZ1",   # Primera Lanzarote
    # Benjamin Fuerteventura
    "1579": "FV1",   # Fase 1 Fuerteventura
    "1583": "FV2",   # Fase 2 Fuerteventura
    # Prebenjamin
    "1581": "PGC",   # Prebenjamin Gran Canaria
    "1712": "PLZ",   # Prebenjamin Lanzarote
    "1582": "PFV",   # Prebenjamin Fuerteventura
}

CAT_MAP = {
    "benjamin":    "BENJAMIN",
    "prebenjamin": "PREBENJAMIN",
}

PHASE_MAP = {
    "1576": "Primera Fase GC",
    "1706": "Segunda Fase A GC",
    "1707": "Segunda Fase B GC",
    "1708": "Segunda Fase C GC",
    "1709": "Segunda Fase D GC",
    "1710": "Segunda Fase E GC",
    "1575": "Preferente Lanzarote",
    "1578": "Primera Lanzarote",
    "1579": "Fase 1 Fuerteventura",
    "1583": "Fase 2 Fuerteventura",
    "1581": "Gran Canaria",
    "1712": "Lanzarote",
    "1582": "Fuerteventura",
}


def group_num(group_name):
    m = re.search(r"\d+", group_name)
    return m.group(0) if m else ""


def current_jornada_for_group(jornadas):
    last_played = None
    first_unplayed = None
    for jor in jornadas:
        num = jor["num"]
        played = any(m["hs"] is not None for m in jor["matches"])
        upcoming = any(m["hs"] is None and m["home"] for m in jor["matches"])
        if played:
            last_played = num
        elif upcoming and first_unplayed is None:
            first_unplayed = num
    return last_played or first_unplayed


def fmt_date(fiflp_date):
    if not fiflp_date:
        return ""
    parts = fiflp_date.split("-")
    if len(parts) == 3:
        return f"{parts[0]}/{parts[1]}"
    return fiflp_date


def import_group(conn, g, season_id):
    comp_id  = g["competition_id"]
    prefix   = CODE_PREFIX.get(comp_id, "X")
    num      = group_num(g["group_name"])
    code     = f"{prefix}{num}"

    cat_name = CAT_MAP.get(g["cat"], "BENJAMIN")
    cat_id   = get_or_create_category(conn, cat_name)

    phase    = PHASE_MAP.get(comp_id, g["phase"])
    grp_name = g["group_name"].title()
    if g["cat"] == "benjamin":
        full_name = f"BENJAMIN {phase.upper()} - {g['group_name']}"
    else:
        full_name = f"PREBENJAMIN {phase.upper()} - {g['group_name']}"

    cur_jor = current_jornada_for_group(g["jornadas"])

    group_id = get_or_create_group(
        conn, season_id, cat_id, code,
        name=grp_name,
        full_name=full_name,
        phase=phase,
        island=g["island"],
        url="",
        current_jornada=cur_jor,
    )

    # Clean previous data for this group
    conn.execute("DELETE FROM standings WHERE group_id=?", (group_id,))
    conn.execute("DELETE FROM matches   WHERE group_id=?", (group_id,))
    conn.commit()

    # Standings
    for s in g["standings"]:
        team_id = get_or_create_team(conn, s["team"])
        conn.execute(
            """INSERT OR REPLACE INTO standings
               (group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (group_id, team_id,
             s["pos"], s["pts"], s["j"], s["g"], s["e"], s["p"],
             s["gf"] or 0, s["gc"] or 0, s["df"] or 0),
        )
    conn.commit()

    # Matches
    for jor in g["jornadas"]:
        for m in jor["matches"]:
            if not m["home"] or not m["away"]:
                continue
            home_id = get_or_create_team(conn, m["home"])
            away_id = get_or_create_team(conn, m["away"])
            hs = m.get("hs")
            as_ = m.get("as")
            score_h = hs if (hs is not None and as_ is not None) else None
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

    played = sum(1 for j in g["jornadas"] for m in j["matches"] if m["hs"] is not None)
    total  = sum(len(j["matches"]) for j in g["jornadas"])
    print(f"  [{code}] {grp_name} ({phase}): "
          f"{len(g['standings'])}eq | {total}p ({played}j) | jornada={cur_jor}")


def main():
    if not os.path.exists(RAW_PATH):
        print(f"ERROR: {RAW_PATH} not found. Run fetch_fiflp_2425.py first.")
        sys.exit(1)

    with open(RAW_PATH, encoding="utf-8") as f:
        raw = json.load(f)

    groups_with_data = [
        g for g in raw
        if g.get("standings") or any(
            m["hs"] is not None
            for j in g.get("jornadas", [])
            for m in j["matches"]
        )
    ]

    print(f"Importing {len(groups_with_data)}/{len(raw)} groups with data...")

    conn = get_connection()
    init_db(conn)

    # Get or create 2024-2025 season (do NOT touch is_current)
    season_id = get_or_create_season(conn, SEASON_NAME, SEASON_START, SEASON_END, is_current=False)

    # Remove old fiflp-imported benjamin group if exists (from test)
    old = conn.execute(
        "SELECT id FROM groups WHERE season_id=? AND code='fiflp_A2'", (season_id,)
    ).fetchone()
    if old:
        conn.execute("DELETE FROM standings WHERE group_id=?", (old[0],))
        conn.execute("DELETE FROM matches WHERE group_id=?", (old[0],))
        conn.execute("DELETE FROM groups WHERE id=?", (old[0],))
        conn.commit()
        print("  (removed old test group fiflp_A2)")

    for g in groups_with_data:
        import_group(conn, g, season_id)

    conn.close()
    print(f"\n  {len(groups_with_data)} groups imported into {DB_PATH} (season {SEASON_NAME})")


if __name__ == "__main__":
    main()
