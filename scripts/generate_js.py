#!/usr/bin/env python3
"""
Generate all data-*.js files from the SQLite database.

Reads futbolbase.db and produces:
  - data-benjamin.js
  - data-prebenjamin.js
  - data-history.js
  - data-matchdetail.js
  - data-goleadores.js
  - data-shields.js

Also bumps the cache version in index.html to today's date.
"""

import json
import os
import re
import sys
from datetime import date

# Allow importing db.py from the same directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import get_connection, PROJECT_ROOT


def js_val(v):
    """Convert a Python value to a JS-compatible JSON value."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, (list, tuple)):
        return "[" + ",".join(js_val(x) for x in v) + "]"
    if isinstance(v, dict):
        items = ",".join(f"{json.dumps(k, ensure_ascii=False)}:{js_val(val)}" for k, val in v.items())
        return "{" + items + "}"
    return json.dumps(v, ensure_ascii=False)


def get_groups_for_category(conn, category_name):
    """Return groups for the given category in the current season, ordered by code."""
    rows = conn.execute(
        """SELECT g.id, g.code, g.name, g.full_name, g.phase, g.island, g.url, g.current_jornada
           FROM groups g
           JOIN categories c ON g.category_id = c.id
           JOIN seasons s ON g.season_id = s.id
           WHERE c.name = ? AND s.is_current = 1
           ORDER BY g.code""",
        (category_name,),
    ).fetchall()
    return rows


def get_standings(conn, group_id):
    """Return standings for a group as list of [pos, team, pts, J, G, E, P, GF, GC, DF]."""
    rows = conn.execute(
        """SELECT s.position, t.name, s.points, s.played, s.won, s.drawn, s.lost,
                  s.gf, s.gc, s.gd
           FROM standings s
           JOIN teams t ON s.team_id = t.id
           WHERE s.group_id = ?
           ORDER BY s.position""",
        (group_id,),
    ).fetchall()
    return [list(r) for r in rows]


def get_current_jornada_matches(conn, group_id, current_jornada):
    """Return matches for the current jornada as [date, time, home, away, hs, as, venue]."""
    if not current_jornada:
        return []
    rows = conn.execute(
        """SELECT m.date, m.time, h.name, a.name, m.home_score, m.away_score, m.venue
           FROM matches m
           JOIN teams h ON m.home_team_id = h.id
           JOIN teams a ON m.away_team_id = a.id
           WHERE m.group_id = ? AND m.jornada = ?
           ORDER BY m.date, m.time, h.name""",
        (group_id, current_jornada),
    ).fetchall()
    return [list(r) for r in rows]


def generate_category_js(conn, category_name, var_name, stats_var):
    """Generate the JS content for a category (BENJAMIN or PREBENJAMIN)."""
    groups = get_groups_for_category(conn, category_name)
    result = []
    total_teams = 0

    for gid, code, name, full_name, phase, island, url, current_jornada in groups:
        standings = get_standings(conn, gid)
        matches = get_current_jornada_matches(conn, gid, current_jornada)
        total_teams += len(standings)

        group_obj = {
            "id": code,
            "name": name,
            "fullName": full_name,
            "phase": phase,
            "island": island,
            "url": url,
            "jornada": current_jornada,
            "standings": standings,
            "matches": matches,
        }
        result.append(group_obj)

    js = f"const {var_name}=" + js_val(result) + ";\n"
    js += f"const {stats_var}=" + js_val({"groups": len(groups), "teams": total_teams}) + ";\n"
    return js


def generate_history_js(conn):
    """Generate data-history.js with ALL matches grouped by group code and jornada."""
    # Get all groups for current season
    groups = conn.execute(
        """SELECT g.id, g.code FROM groups g
           JOIN seasons s ON g.season_id = s.id
           WHERE s.is_current = 1
           ORDER BY g.code""",
    ).fetchall()

    history = {}
    total_matches = 0

    for gid, code in groups:
        # Get all matches for this group, ordered by jornada number then date
        rows = conn.execute(
            """SELECT m.jornada, m.date, h.name, a.name, m.home_score, m.away_score
               FROM matches m
               JOIN teams h ON m.home_team_id = h.id
               JOIN teams a ON m.away_team_id = a.id
               WHERE m.group_id = ?
               ORDER BY m.jornada, m.date, h.name""",
            (gid,),
        ).fetchall()

        jornadas = {}
        for jornada, dt, home, away, hs, as_ in rows:
            if jornada not in jornadas:
                jornadas[jornada] = []
            jornadas[jornada].append([dt, home, away, hs, as_])
            total_matches += 1

        # Sort jornadas by number
        def jornada_sort_key(j):
            m = re.search(r"(\d+)", j)
            return int(m.group(1)) if m else 0

        sorted_jornadas = dict(sorted(jornadas.items(), key=lambda x: jornada_sort_key(x[0])))
        history[code] = sorted_jornadas

    js = "const HISTORY=" + js_val(history) + ";"
    js += f"const HIST_MATCHES={total_matches};"
    return js


def generate_matchdetail_js(conn):
    """Generate data-matchdetail.js with goal details per match."""
    header = (
        "// data-matchdetail.js — generado por scripts/generate_js.py\n"
        "// NO editar manualmente — usar scripts/update.sh para regenerar\n\n"
    )

    # Get all matches that have goals
    rows = conn.execute(
        """SELECT DISTINCT m.id, h.name, a.name, m.home_score, m.away_score
           FROM matches m
           JOIN teams h ON m.home_team_id = h.id
           JOIN teams a ON m.away_team_id = a.id
           JOIN goals g ON g.match_id = m.id
           ORDER BY m.id""",
    ).fetchall()

    details = {}
    for match_id, home, away, hs, as_ in rows:
        key = f"{home}|{away}|{hs}-{as_}"
        goals = conn.execute(
            """SELECT minute, player_name, running_score, side, type
               FROM goals WHERE match_id = ? ORDER BY minute, id""",
            (match_id,),
        ).fetchall()

        entry = {"g": [list(g) for g in goals]}
        details[key] = entry

    js = header + "const MATCH_DETAIL=" + js_val(details) + ";"
    return js


def generate_shields_js(conn):
    """Generate data-shields.js with team shield filenames."""
    rows = conn.execute(
        "SELECT name, shield_filename FROM teams WHERE shield_filename IS NOT NULL ORDER BY name"
    ).fetchall()

    shields = {}
    for name, filename in rows:
        shields[name] = filename

    return "const SHIELDS=" + js_val(shields) + ";\n"


def _goleadores_group_name(code, full_name, category_name):
    """
    Convert a group code + full_name into the goleadores display name.

    Benjamin examples:
      A1 + 'SEGUNDA FASE BENJAMIN A-G1' -> 'BENJAMIN SEGUNDA FASE A-G1'
      LZ1 + 'Benjamin Lanzarote Grupo 1' -> 'BENJAMIN PRIMERA LANZAROTE G1'
      FO + 'Benjamin Fuerteventura Liga Oro' -> 'BENJAMIN FUERTEVENTURA LIGA ORO'

    Prebenjamin examples:
      PG1 + 'PREBENJAMIN PRIMERA GRAN CANARIA G-1' -> 'PREBENJAMIN GC GRUPO 1'
    """
    upper = full_name.upper()

    if category_name == "PREBENJAMIN":
        # 'PREBENJAMIN PRIMERA GRAN CANARIA G-N' -> 'PREBENJAMIN GC GRUPO N'
        m = re.search(r"G-?(\d+)", upper)
        if m:
            return f"PREBENJAMIN GC GRUPO {m.group(1)}"
        return upper

    # BENJAMIN
    if "FUERTEVENTURA" in upper:
        # 'Benjamin Fuerteventura Liga Oro' -> 'BENJAMIN FUERTEVENTURA LIGA ORO'
        cleaned = re.sub(r"\bBENJAMIN\b\s*", "", upper).strip()
        return f"BENJAMIN {cleaned}"

    if "LANZAROTE" in upper:
        # 'Benjamin Lanzarote Grupo N' -> 'BENJAMIN PRIMERA LANZAROTE GN'
        m = re.search(r"GRUPO\s*(\d+)", upper)
        if m:
            return f"BENJAMIN PRIMERA LANZAROTE G{m.group(1)}"
        cleaned = re.sub(r"\bBENJAMIN\b\s*", "", upper).strip()
        return f"BENJAMIN {cleaned}"

    # GC segunda fase: 'SEGUNDA FASE BENJAMIN X-GN' -> 'BENJAMIN SEGUNDA FASE X-GN'
    cleaned = re.sub(r"\bBENJAMIN\b\s*", "", upper).strip()
    return f"BENJAMIN {cleaned}"


def generate_goleadores_js(conn):
    """Generate data-goleadores.js with top scorers per group."""
    parts = []

    for cat_name, var_name in [("BENJAMIN", "GOL_BENJ"), ("PREBENJAMIN", "GOL_PREBENJ")]:
        groups = get_groups_for_category(conn, cat_name)
        entries = []

        for gid, code, name, full_name, phase, island, url, current_jornada in groups:
            gol_name = _goleadores_group_name(code, full_name, cat_name)

            scorers = conn.execute(
                """SELECT s.player_name, t.name, s.goals, s.games
                   FROM scorers s
                   JOIN teams t ON s.team_id = t.id
                   WHERE s.group_id = ?
                   ORDER BY s.goals DESC, s.games ASC""",
                (gid,),
            ).fetchall()

            if scorers:
                entries.append({
                    "g": gol_name,
                    "s": [list(s) for s in scorers],
                })

        parts.append(f"const {var_name}=" + js_val(entries) + ";")

    return "\n".join(parts)


def bump_cache_version():
    """Update ?v=YYYYMMDD in index.html to today's date."""
    index_path = os.path.join(PROJECT_ROOT, "index.html")
    if not os.path.exists(index_path):
        print("  WARNING: index.html not found, skipping cache bump")
        return

    today = date.today().strftime("%Y%m%d")
    with open(index_path, "r", encoding="utf-8") as f:
        content = f.read()

    new_content = re.sub(r"\?v=\d{8}", f"?v={today}", content)
    if new_content != content:
        with open(index_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"  index.html cache version bumped to ?v={today}")
    else:
        print(f"  index.html already at ?v={today}")


def write_file(filename, content):
    """Write content to a file in the project root."""
    path = os.path.join(PROJECT_ROOT, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    size = os.path.getsize(path)
    print(f"  {filename}: {size:,} bytes")


def main():
    conn = get_connection()
    conn.row_factory = None  # ensure tuples

    print("=== Generating JS data files from SQLite ===\n")

    print("1. data-benjamin.js")
    write_file("data-benjamin.js", generate_category_js(conn, "BENJAMIN", "BENJAMIN", "BENJ_STATS"))

    print("2. data-prebenjamin.js")
    write_file("data-prebenjamin.js", generate_category_js(conn, "PREBENJAMIN", "PREBENJAMIN", "PREBENJ_STATS"))

    print("3. data-history.js")
    write_file("data-history.js", generate_history_js(conn))

    print("4. data-matchdetail.js")
    write_file("data-matchdetail.js", generate_matchdetail_js(conn))

    print("5. data-goleadores.js")
    write_file("data-goleadores.js", generate_goleadores_js(conn))

    print("6. data-shields.js")
    write_file("data-shields.js", generate_shields_js(conn))

    print("\n7. Bumping cache version in index.html")
    bump_cache_version()

    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
