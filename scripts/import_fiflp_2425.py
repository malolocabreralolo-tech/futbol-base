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
                get_or_create_group, existing_played_count, PROJECT_ROOT, DB_PATH)

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
    # Benjamin Copa de Campeones (knockout) — one per Segunda Fase tier
    "1727": "BCA",   # Benjamin Copa Campeones Fase A (oro)
    "1728": "BCB",   # Benjamin Copa Campeones Fase B
    "1729": "BCC",   # Benjamin Copa Campeones Fase C
    "1730": "BCD",   # Benjamin Copa Campeones Fase D
    "1719": "BCE",   # Benjamin Copa Campeones Fase E
    # Benjamin Lanzarote
    "1575": "LZP",   # Preferente Lanzarote
    "1578": "LZ1",   # Primera Lanzarote
    # Benjamin Fuerteventura
    "1579": "FV1",   # Fase 1 Fuerteventura
    "1583": "FV2",   # Fase 2 Fuerteventura
    # Prebenjamin
    "1581": "PGC",   # Prebenjamin Gran Canaria
    "1582": "PFV",   # Prebenjamin Fuerteventura
    "1712": "PLZ",   # Prebenjamin Lanzarote
    "1469": "PCC",   # Prebenjamin Copa de Campeones (final phase: champions of each group)
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
    "1727": "Copa Campeones Benjamin A",
    "1728": "Copa Campeones Benjamin B",
    "1729": "Copa Campeones Benjamin C",
    "1730": "Copa Campeones Benjamin D",
    "1719": "Copa Campeones Benjamin E",
    "1575": "Preferente Lanzarote",
    "1578": "Primera Lanzarote",
    "1579": "Fase 1 Fuerteventura",
    "1583": "Fase 2 Fuerteventura",
    "1581": "Gran Canaria",
    "1582": "Fuerteventura",
    "1712": "Lanzarote",
    "1469": "Copa de Campeones",
}


def group_num(group_name):
    m = re.search(r"\d+", group_name)
    return m.group(0) if m else ""


# Tables whose rows reference matches(id) and must be deleted BEFORE the
# matches themselves (FK ON via db.get_connection would otherwise crash).
ACTA_CHILD_TABLES = ("appearances", "match_events", "match_staff", "goals")


def _table_exists(conn, name):
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def delete_group_matches(conn, group_id):
    """Delete a group's matches and every row referencing them (acta data and
    goals). Does NOT commit — the caller controls the transaction."""
    for tbl in ACTA_CHILD_TABLES:
        if _table_exists(conn, tbl):
            conn.execute(
                f"DELETE FROM {tbl} WHERE match_id IN "
                f"(SELECT id FROM matches WHERE group_id=?)",
                (group_id,),
            )
    conn.execute("DELETE FROM matches WHERE group_id=?", (group_id,))


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

    # Empty scrape (0 matches — e.g. jornada-page timeout left a partial raw):
    # never wipe existing data with nothing to replace it.
    n_scraped = sum(
        1 for j in g["jornadas"] for m in j["matches"]
        if m.get("home") and m.get("away")
    )
    if n_scraped == 0:
        print(f"  [{code}] {grp_name} ({phase}): scrape vacío (0 partidos) — SKIP, se conserva lo existente")
        return

    # Guard de NO-REGRESIÓN: solo sobrescribir cuando el scrape trae
    # ESTRICTAMENTE MÁS partidos jugados que lo ya almacenado para este
    # (temporada, code). Los comps 1576/1581 mezclan grupos LIMPIOS de Wayback
    # (P1=45/45, PGC1…) con grupos FIFLP escasos (P2/P5, PFV*, PLZ*). Re-scrapear
    # el comp entero solo debe RELLENAR los escasos: si FIFLP empata o trae menos
    # (la lectura robusta H2 aún sub-lee ~10% de marcadores ofuscados) se conserva
    # el dato limpio existente; si trae más, gana por completitud (objetivo: máx.
    # cantidad de info). El gate test_no_absurd_scores corta basura.
    new_played = sum(
        1 for j in g["jornadas"] for m in j["matches"]
        if m.get("hs") is not None and m.get("as") is not None
    )
    prev_played = existing_played_count(conn, season_id, code)
    if prev_played >= new_played and prev_played > 0:
        print(f"  [{code}] {grp_name} ({phase}): scrape {new_played}j <= existente "
              f"{prev_played}j — SKIP (conservar dato existente)")
        return

    group_id = get_or_create_group(
        conn, season_id, cat_id, code,
        name=grp_name,
        full_name=full_name,
        phase=phase,
        island=g["island"],
        url="",
        current_jornada=cur_jor,
    )

    # Pre-resolve every team id BEFORE the destructive transaction:
    # get_or_create_team() commits internally when it creates a team, which
    # would otherwise commit our DELETEs before the INSERTs run.
    team_ids = {}
    for s in g["standings"]:
        team_ids[s["team"]] = get_or_create_team(conn, s["team"])
    for jor in g["jornadas"]:
        for m in jor["matches"]:
            for name in (m.get("home"), m.get("away")):
                if name and name not in team_ids:
                    team_ids[name] = get_or_create_team(conn, name)

    # Destructive section: one transaction per group (DELETE + INSERT commit
    # together; a crash midway rolls back and leaves the group intact).
    try:
        # Clean previous data for this group (children first: FK)
        conn.execute("DELETE FROM standings WHERE group_id=?", (group_id,))
        delete_group_matches(conn, group_id)

        # Standings
        for s in g["standings"]:
            conn.execute(
                """INSERT OR REPLACE INTO standings
                   (group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (group_id, team_ids[s["team"]],
                 s["pos"], s["pts"], s["j"], s["g"], s["e"], s["p"],
                 s["gf"] or 0, s["gc"] or 0, s["df"] or 0),
            )

        # Matches
        for jor in g["jornadas"]:
            for m in jor["matches"]:
                if not m["home"] or not m["away"]:
                    continue
                if m["home"] == m["away"]:
                    print(f"    WARN: partido contra sí mismo ignorado: {m['home']} (J{jor['num']})")
                    continue
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
                     team_ids[m["home"]], team_ids[m["away"]],
                     score_h, score_a,
                     m.get("venue", "")),
                )
        conn.commit()
    except Exception:
        conn.rollback()
        raise

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
        try:
            conn.execute("DELETE FROM standings WHERE group_id=?", (old[0],))
            delete_group_matches(conn, old[0])
            conn.execute("DELETE FROM groups WHERE id=?", (old[0],))
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        print("  (removed old test group fiflp_A2)")

    for g in groups_with_data:
        import_group(conn, g, season_id)

    conn.close()
    print(f"\n  {len(groups_with_data)} groups imported into {DB_PATH} (season {SEASON_NAME})")


if __name__ == "__main__":
    main()
