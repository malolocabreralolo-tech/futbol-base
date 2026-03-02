# SQLite Database Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add SQLite as central data store for futbol-base, replacing direct JS file generation with a two-step pipeline: scrape→SQLite→JS.

**Architecture:** The scraper writes to `futbolbase.db` (SQLite). A separate generator script reads the DB and produces the same `data-*.js` files. The GitHub Actions workflow runs both scripts sequentially. The web frontend remains unchanged.

**Tech Stack:** Python 3 stdlib (`sqlite3`, no external deps), SQLite3

---

### Task 1: Create the database schema script

**Files:**
- Create: `scripts/db.py`

**Step 1: Write `scripts/db.py`**

This module creates the SQLite database and provides helper functions. All other scripts import from here.

```python
#!/usr/bin/env python3
"""Database schema and helpers for futbolbase.db"""

import os
import sqlite3

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(PROJECT_ROOT, "futbolbase.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS seasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_year INTEGER NOT NULL,
    end_year INTEGER NOT NULL,
    is_current INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL REFERENCES seasons(id),
    category_id INTEGER NOT NULL REFERENCES categories(id),
    code TEXT NOT NULL,
    name TEXT,
    full_name TEXT,
    phase TEXT,
    island TEXT,
    url TEXT,
    current_jornada TEXT,
    UNIQUE(season_id, category_id, code)
);

CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    shield_filename TEXT
);

CREATE TABLE IF NOT EXISTS standings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES groups(id),
    team_id INTEGER NOT NULL REFERENCES teams(id),
    position INTEGER NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    played INTEGER NOT NULL DEFAULT 0,
    won INTEGER NOT NULL DEFAULT 0,
    drawn INTEGER NOT NULL DEFAULT 0,
    lost INTEGER NOT NULL DEFAULT 0,
    gf INTEGER NOT NULL DEFAULT 0,
    gc INTEGER NOT NULL DEFAULT 0,
    gd INTEGER NOT NULL DEFAULT 0,
    UNIQUE(group_id, team_id)
);

CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES groups(id),
    jornada TEXT NOT NULL,
    date TEXT,
    time TEXT,
    home_team_id INTEGER NOT NULL REFERENCES teams(id),
    away_team_id INTEGER NOT NULL REFERENCES teams(id),
    home_score INTEGER,
    away_score INTEGER,
    venue TEXT,
    UNIQUE(group_id, jornada, home_team_id, away_team_id)
);

CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id),
    minute INTEGER,
    player_name TEXT NOT NULL,
    running_score TEXT,
    side TEXT,
    type TEXT
);

CREATE TABLE IF NOT EXISTS scorers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES groups(id),
    player_name TEXT NOT NULL,
    team_id INTEGER NOT NULL REFERENCES teams(id),
    goals INTEGER NOT NULL DEFAULT 0,
    games INTEGER NOT NULL DEFAULT 0,
    UNIQUE(group_id, player_name, team_id)
);
"""


def get_connection():
    """Return a connection to the database, creating tables if needed."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    return conn


def get_or_create_season(conn, name, start_year, end_year, is_current=True):
    """Get or create a season. Returns season id."""
    cur = conn.execute("SELECT id FROM seasons WHERE name=?", (name,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur = conn.execute(
        "INSERT INTO seasons (name, start_year, end_year, is_current) VALUES (?,?,?,?)",
        (name, start_year, end_year, 1 if is_current else 0),
    )
    conn.commit()
    return cur.lastrowid


def get_or_create_category(conn, name):
    """Get or create a category. Returns category id."""
    cur = conn.execute("SELECT id FROM categories WHERE name=?", (name,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur = conn.execute("INSERT INTO categories (name) VALUES (?)", (name,))
    conn.commit()
    return cur.lastrowid


def get_or_create_team(conn, name, shield_filename=None):
    """Get or create a team. Updates shield if provided. Returns team id."""
    cur = conn.execute("SELECT id FROM teams WHERE name=?", (name,))
    row = cur.fetchone()
    if row:
        if shield_filename:
            conn.execute("UPDATE teams SET shield_filename=? WHERE id=?", (shield_filename, row[0]))
        return row[0]
    cur = conn.execute(
        "INSERT INTO teams (name, shield_filename) VALUES (?,?)",
        (name, shield_filename),
    )
    return cur.lastrowid


def get_or_create_group(conn, season_id, category_id, code, **kwargs):
    """Get or create a group. Updates fields if provided. Returns group id."""
    cur = conn.execute(
        "SELECT id FROM groups WHERE season_id=? AND category_id=? AND code=?",
        (season_id, category_id, code),
    )
    row = cur.fetchone()
    if row:
        gid = row[0]
        updates = {k: v for k, v in kwargs.items() if v is not None}
        if updates:
            sets = ", ".join(f"{k}=?" for k in updates)
            conn.execute(f"UPDATE groups SET {sets} WHERE id=?", (*updates.values(), gid))
        return gid
    cols = ["season_id", "category_id", "code"] + list(kwargs.keys())
    vals = [season_id, category_id, code] + list(kwargs.values())
    placeholders = ",".join("?" * len(cols))
    cur = conn.execute(
        f"INSERT INTO groups ({','.join(cols)}) VALUES ({placeholders})", vals
    )
    return cur.lastrowid
```

**Step 2: Test it works**

Run: `cd /home/manolo/claude/futbol-base && python3 -c "from scripts.db import get_connection; c=get_connection(); print('Tables:', [r[0] for r in c.execute(\"SELECT name FROM sqlite_master WHERE type='table'\").fetchall()]); c.close()"`

Expected: `Tables: ['seasons', 'categories', 'groups', 'teams', 'standings', 'matches', 'goals', 'scorers']`

**Step 3: Add futbolbase.db to .gitignore**

The DB file is large and regenerated from scraping. Add to `.gitignore`:
```
futbolbase.db
futbolbase.db-wal
futbolbase.db-shm
```

**Step 4: Commit**

```bash
git add scripts/db.py .gitignore
git commit -m "feat: add SQLite schema and DB helpers (scripts/db.py)"
```

---

### Task 2: Create the import script to seed DB from existing data-*.js

**Files:**
- Create: `scripts/import_existing.py`

This one-time script reads the current `data-*.js` files and populates the SQLite DB with all existing data. This ensures we don't lose any historical data.

**Step 1: Write `scripts/import_existing.py`**

```python
#!/usr/bin/env python3
"""
import_existing.py — One-time import of existing data-*.js into futbolbase.db.
Reads: data-benjamin.js, data-prebenjamin.js, data-history.js,
       data-matchdetail.js, data-goleadores.js, data-shields.js
Writes: futbolbase.db
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import (
    get_connection, get_or_create_season, get_or_create_category,
    get_or_create_team, get_or_create_group, PROJECT_ROOT,
)

SEASON_NAME = "2025-2026"
SEASON_START = 2025
SEASON_END = 2026

def load_js_var(filename, varname):
    """Load a JS variable from a data-*.js file. Returns parsed JSON."""
    path = os.path.join(PROJECT_ROOT, filename)
    with open(path, encoding="utf-8") as f:
        content = f.read()
    m = re.search(rf"const {varname}\s*=\s*(\[.*?\]|\{{.*?\}});", content, re.DOTALL)
    if not m:
        print(f"  WARNING: {varname} not found in {filename}")
        return None
    return json.loads(m.group(1))


def import_category(conn, season_id, category_name, groups_data):
    """Import groups, standings, and current matches for a category."""
    cat_id = get_or_create_category(conn, category_name)
    for g in groups_data:
        gid = get_or_create_group(
            conn, season_id, cat_id, g["id"],
            name=g.get("name"), full_name=g.get("fullName"),
            phase=g.get("phase"), island=g.get("island"),
            url=g.get("url"), current_jornada=g.get("jornada"),
        )
        # Standings
        conn.execute("DELETE FROM standings WHERE group_id=?", (gid,))
        for row in g.get("standings", []):
            # [pos, team, pts, J, G, E, P, GF, GC, DF]
            team_id = get_or_create_team(conn, row[1])
            conn.execute(
                "INSERT INTO standings (group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (gid, team_id, row[0], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9]),
            )
        # Current jornada matches (upcoming/latest)
        for m in g.get("matches", []):
            # [date_dd_mm, time, home, away, hs|None, as|None, venue|None]
            home_id = get_or_create_team(conn, m[2])
            away_id = get_or_create_team(conn, m[3])
            conn.execute(
                "INSERT OR IGNORE INTO matches (group_id, jornada, date, time, home_team_id, away_team_id, home_score, away_score, venue) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (gid, g.get("jornada", ""), m[0], m[1], home_id, away_id, m[4], m[5], m[6]),
            )
    conn.commit()
    print(f"  {category_name}: {len(groups_data)} groups imported")


def import_history(conn, season_id, history_data):
    """Import historical match data from HISTORY object."""
    # We need to look up group_id by code
    for group_code, jornadas in history_data.items():
        cur = conn.execute(
            "SELECT id FROM groups WHERE season_id=? AND code=?",
            (season_id, group_code),
        )
        row = cur.fetchone()
        if not row:
            print(f"  WARNING: group {group_code} not found in DB, skipping history")
            continue
        gid = row[0]
        for jor_name, matches in jornadas.items():
            for m in matches:
                # [date, home, away, hs, as]
                home_id = get_or_create_team(conn, m[1])
                away_id = get_or_create_team(conn, m[2])
                conn.execute(
                    "INSERT OR IGNORE INTO matches (group_id, jornada, date, home_team_id, away_team_id, home_score, away_score) "
                    "VALUES (?,?,?,?,?,?,?)",
                    (gid, jor_name, m[0], home_id, away_id, m[3], m[4]),
                )
    conn.commit()
    total = sum(len(ms) for jors in history_data.values() for ms in jors.values())
    print(f"  HISTORY: {total} matches imported across {len(history_data)} groups")


def import_matchdetail(conn, season_id, matchdetail_data):
    """Import goal details from MATCH_DETAIL object."""
    imported = 0
    for key, detail in matchdetail_data.items():
        # key: "Home|Away|score"
        parts = key.split("|")
        if len(parts) != 3:
            continue
        home_name, away_name, score = parts
        home_id = get_or_create_team(conn, home_name)
        away_id = get_or_create_team(conn, away_name)
        score_parts = score.split("-")
        if len(score_parts) != 2:
            continue
        hs, as_ = int(score_parts[0]), int(score_parts[1])
        # Find the match in DB
        cur = conn.execute(
            "SELECT id FROM matches WHERE home_team_id=? AND away_team_id=? AND home_score=? AND away_score=?",
            (home_id, away_id, hs, as_),
        )
        row = cur.fetchone()
        if not row:
            continue
        match_id = row[0]
        # Check if goals already exist
        cur2 = conn.execute("SELECT COUNT(*) FROM goals WHERE match_id=?", (match_id,))
        if cur2.fetchone()[0] > 0:
            continue
        for goal in detail.get("g", []):
            # [minute, player, running_score, side, type]
            conn.execute(
                "INSERT INTO goals (match_id, minute, player_name, running_score, side, type) "
                "VALUES (?,?,?,?,?,?)",
                (match_id, goal[0], goal[1], goal[2], goal[3], goal[4] if len(goal) > 4 else None),
            )
            imported += 1
    conn.commit()
    print(f"  MATCH_DETAIL: {imported} goals imported")


def import_shields(conn, shields_data):
    """Import shield filenames into teams table."""
    updated = 0
    for team_name, filename in shields_data.items():
        get_or_create_team(conn, team_name, shield_filename=filename)
        updated += 1
    conn.commit()
    print(f"  SHIELDS: {updated} teams updated")


def import_scorers(conn, season_id, scorers_data, category_name):
    """Import top scorers from GOL_BENJ or GOL_PREBENJ."""
    cat_id = get_or_create_category(conn, category_name)
    for group_entry in scorers_data:
        group_name = group_entry["g"]
        # Find group by full_name match
        cur = conn.execute(
            "SELECT id FROM groups WHERE season_id=? AND category_id=? AND full_name=?",
            (season_id, cat_id, group_name),
        )
        row = cur.fetchone()
        if not row:
            # Try partial match on name
            cur = conn.execute(
                "SELECT id FROM groups WHERE season_id=? AND category_id=? AND full_name LIKE ?",
                (season_id, cat_id, f"%{group_name}%"),
            )
            row = cur.fetchone()
        if not row:
            print(f"  WARNING: scorer group '{group_name}' not found")
            continue
        gid = row[0]
        conn.execute("DELETE FROM scorers WHERE group_id=?", (gid,))
        for s in group_entry["s"]:
            # [player, team, goals, games]
            team_id = get_or_create_team(conn, s[1])
            conn.execute(
                "INSERT INTO scorers (group_id, player_name, team_id, goals, games) VALUES (?,?,?,?,?)",
                (gid, s[0], team_id, s[2], s[3]),
            )
    conn.commit()
    print(f"  SCORERS ({category_name}): {len(scorers_data)} groups imported")


def main():
    conn = get_connection()
    season_id = get_or_create_season(conn, SEASON_NAME, SEASON_START, SEASON_END)
    print(f"Season: {SEASON_NAME} (id={season_id})")

    # 1. Import groups + standings from BENJAMIN and PREBENJAMIN
    benjamin = load_js_var("data-benjamin.js", "BENJAMIN")
    if benjamin:
        import_category(conn, season_id, "BENJAMIN", benjamin)

    prebenjamin = load_js_var("data-prebenjamin.js", "PREBENJAMIN")
    if prebenjamin:
        import_category(conn, season_id, "PREBENJAMIN", prebenjamin)

    # 2. Import shields
    shields = load_js_var("data-shields.js", "SHIELDS")
    if shields:
        import_shields(conn, shields)

    # 3. Import history
    history = load_js_var("data-history.js", "HISTORY")
    if history:
        import_history(conn, season_id, history)

    # 4. Import match details (goals)
    matchdetail = load_js_var("data-matchdetail.js", "MATCH_DETAIL")
    if matchdetail:
        import_matchdetail(conn, season_id, matchdetail)

    # 5. Import scorers
    gol_benj = load_js_var("data-goleadores.js", "GOL_BENJ")
    if gol_benj:
        import_scorers(conn, season_id, gol_benj, "BENJAMIN")

    gol_prebenj = load_js_var("data-goleadores.js", "GOL_PREBENJ")
    if gol_prebenj:
        import_scorers(conn, season_id, gol_prebenj, "PREBENJAMIN")

    # Stats
    for table in ["seasons", "categories", "groups", "teams", "standings", "matches", "goals", "scorers"]:
        count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"  {table}: {count} rows")

    conn.close()
    print("✓ Import complete")


if __name__ == "__main__":
    main()
```

**Step 2: Run the import**

Run: `cd /home/manolo/claude/futbol-base && python3 scripts/import_existing.py`

Expected: Output showing all tables populated with data counts.

**Step 3: Verify data**

Run: `python3 -c "import sqlite3; c=sqlite3.connect('futbolbase.db'); print('matches:', c.execute('SELECT COUNT(*) FROM matches').fetchone()[0]); print('teams:', c.execute('SELECT COUNT(*) FROM teams').fetchone()[0]); print('goals:', c.execute('SELECT COUNT(*) FROM goals').fetchone()[0]); c.close()"`

Expected: matches ~2400+, teams ~225, goals ~7500

**Step 4: Commit**

```bash
git add scripts/import_existing.py
git commit -m "feat: import script to seed SQLite from existing data-*.js"
```

---

### Task 3: Create the JS generator script

**Files:**
- Create: `scripts/generate_js.py`

This script reads SQLite and produces the exact same `data-*.js` files the frontend expects.

**Step 1: Write `scripts/generate_js.py`**

```python
#!/usr/bin/env python3
"""
generate_js.py — Generates data-*.js files from futbolbase.db.
Produces the exact same format the frontend (app.js) expects.
"""

import datetime
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import get_connection, PROJECT_ROOT

OUTPUT_FILES = {
    "benjamin": os.path.join(PROJECT_ROOT, "data-benjamin.js"),
    "prebenjamin": os.path.join(PROJECT_ROOT, "data-prebenjamin.js"),
    "history": os.path.join(PROJECT_ROOT, "data-history.js"),
    "matchdetail": os.path.join(PROJECT_ROOT, "data-matchdetail.js"),
    "shields": os.path.join(PROJECT_ROOT, "data-shields.js"),
    "goleadores": os.path.join(PROJECT_ROOT, "data-goleadores.js"),
}


def generate_category(conn, season_id, category_name, var_name, stats_var):
    """Generate a data-benjamin.js or data-prebenjamin.js file."""
    cat_id = conn.execute("SELECT id FROM categories WHERE name=?", (category_name,)).fetchone()
    if not cat_id:
        return None
    cat_id = cat_id[0]

    groups = conn.execute(
        "SELECT id, code, name, full_name, phase, island, url, current_jornada "
        "FROM groups WHERE season_id=? AND category_id=? ORDER BY code",
        (season_id, cat_id),
    ).fetchall()

    result = []
    for gid, code, name, full_name, phase, island, url, current_jornada in groups:
        group_obj = {
            "id": code,
            "name": name,
            "fullName": full_name,
            "phase": phase,
            "island": island,
            "url": url,
            "jornada": current_jornada,
        }

        # Standings
        standings = conn.execute(
            "SELECT s.position, t.name, s.points, s.played, s.won, s.drawn, s.lost, s.gf, s.gc, s.gd "
            "FROM standings s JOIN teams t ON s.team_id=t.id "
            "WHERE s.group_id=? ORDER BY s.position",
            (gid,),
        ).fetchall()
        group_obj["standings"] = [list(row) for row in standings]

        # Current jornada matches
        matches = conn.execute(
            "SELECT m.date, m.time, th.name, ta.name, m.home_score, m.away_score, m.venue "
            "FROM matches m "
            "JOIN teams th ON m.home_team_id=th.id "
            "JOIN teams ta ON m.away_team_id=ta.id "
            "WHERE m.group_id=? AND m.jornada=? "
            "ORDER BY m.date, m.time",
            (gid, current_jornada),
        ).fetchall()
        group_obj["matches"] = [list(row) for row in matches]

        result.append(group_obj)

    return result


def generate_history(conn, season_id):
    """Generate HISTORY object: {groupCode: {jornadaName: [[date, home, away, hs, as], ...]}}"""
    groups = conn.execute(
        "SELECT id, code FROM groups WHERE season_id=?", (season_id,)
    ).fetchall()

    history = {}
    for gid, code in groups:
        jornadas = conn.execute(
            "SELECT DISTINCT jornada FROM matches WHERE group_id=? AND home_score IS NOT NULL "
            "ORDER BY CAST(REPLACE(REPLACE(jornada, 'Jornada ', ''), 'JORNADA ', '') AS INTEGER)",
            (gid,),
        ).fetchall()

        if not jornadas:
            continue

        group_hist = {}
        for (jor_name,) in jornadas:
            matches = conn.execute(
                "SELECT m.date, th.name, ta.name, m.home_score, m.away_score "
                "FROM matches m "
                "JOIN teams th ON m.home_team_id=th.id "
                "JOIN teams ta ON m.away_team_id=ta.id "
                "WHERE m.group_id=? AND m.jornada=? AND m.home_score IS NOT NULL "
                "ORDER BY m.date",
                (gid, jor_name),
            ).fetchall()
            if matches:
                group_hist[jor_name] = [list(row) for row in matches]

        if group_hist:
            history[code] = group_hist

    return history


def generate_matchdetail(conn):
    """Generate MATCH_DETAIL object: {"Home|Away|hs-as": {"g": [[min, player, score, side, type], ...]}}"""
    matches_with_goals = conn.execute(
        "SELECT DISTINCT m.id, th.name, ta.name, m.home_score, m.away_score "
        "FROM matches m "
        "JOIN teams th ON m.home_team_id=th.id "
        "JOIN teams ta ON m.away_team_id=ta.id "
        "JOIN goals g ON g.match_id=m.id "
        "WHERE m.home_score IS NOT NULL",
    ).fetchall()

    detail = {}
    for mid, home, away, hs, as_ in matches_with_goals:
        key = f"{home}|{away}|{hs}-{as_}"
        goals = conn.execute(
            "SELECT minute, player_name, running_score, side, type FROM goals WHERE match_id=? ORDER BY minute",
            (mid,),
        ).fetchall()
        detail[key] = {"g": [list(g) for g in goals]}

    return detail


def generate_shields(conn):
    """Generate SHIELDS object: {"team_name": "filename.png"}"""
    rows = conn.execute(
        "SELECT name, shield_filename FROM teams WHERE shield_filename IS NOT NULL ORDER BY name"
    ).fetchall()
    return {name: fn for name, fn in rows}


def generate_scorers(conn, season_id, category_name):
    """Generate GOL_BENJ or GOL_PREBENJ array."""
    cat_id = conn.execute("SELECT id FROM categories WHERE name=?", (category_name,)).fetchone()
    if not cat_id:
        return []
    cat_id = cat_id[0]

    groups = conn.execute(
        "SELECT id, full_name FROM groups WHERE season_id=? AND category_id=? ORDER BY code",
        (season_id, cat_id),
    ).fetchall()

    result = []
    for gid, full_name in groups:
        scorers = conn.execute(
            "SELECT s.player_name, t.name, s.goals, s.games "
            "FROM scorers s JOIN teams t ON s.team_id=t.id "
            "WHERE s.group_id=? ORDER BY s.goals DESC, s.games ASC",
            (gid,),
        ).fetchall()
        if scorers:
            result.append({"g": full_name, "s": [list(r) for r in scorers]})

    return result


def write_js(path, content):
    """Write content to file."""
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def bump_cache_version():
    """Update ?v=YYYYMMDD in index.html."""
    index_path = os.path.join(PROJECT_ROOT, "index.html")
    today = datetime.date.today().strftime("%Y%m%d")
    with open(index_path, encoding="utf-8") as f:
        content = f.read()
    new_content = re.sub(r'\?v=\d{8}', f'?v={today}', content)
    if new_content != content:
        with open(index_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"  index.html: cache version bumped to {today}")


def main():
    conn = get_connection()

    # Get current season
    row = conn.execute("SELECT id, name FROM seasons WHERE is_current=1").fetchone()
    if not row:
        print("ERROR: no current season found")
        return
    season_id, season_name = row
    print(f"Season: {season_name}")

    # Generate category files
    for cat_name, var_name, stats_var, filename in [
        ("BENJAMIN", "BENJAMIN", "BENJ_STATS", "benjamin"),
        ("PREBENJAMIN", "PREBENJAMIN", "PREBENJ_STATS", "prebenjamin"),
    ]:
        data = generate_category(conn, season_id, cat_name, var_name, stats_var)
        if data:
            js = f"const {var_name}=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";"
            write_js(OUTPUT_FILES[filename], js)
            print(f"  {filename}: {len(data)} groups")

    # Generate history
    history = generate_history(conn, season_id)
    total_matches = sum(len(ms) for grp in history.values() for ms in grp.values())
    js = "const HISTORY=" + json.dumps(history, ensure_ascii=False, separators=(",", ":")) + f";const HIST_MATCHES={total_matches};"
    write_js(OUTPUT_FILES["history"], js)
    print(f"  history: {total_matches} matches across {len(history)} groups")

    # Generate match detail
    detail = generate_matchdetail(conn)
    js = "const MATCH_DETAIL=" + json.dumps(detail, ensure_ascii=False, separators=(",", ":")) + ";"
    write_js(OUTPUT_FILES["matchdetail"], js)
    print(f"  matchdetail: {len(detail)} matches with goals")

    # Generate shields
    shields = generate_shields(conn)
    js = "const SHIELDS=" + json.dumps(shields, ensure_ascii=False, separators=(",", ":")) + ";"
    write_js(OUTPUT_FILES["shields"], js)
    print(f"  shields: {len(shields)} teams")

    # Generate scorers
    gol_benj = generate_scorers(conn, season_id, "BENJAMIN")
    gol_prebenj = generate_scorers(conn, season_id, "PREBENJAMIN")
    js = (
        "const GOL_BENJ=" + json.dumps(gol_benj, ensure_ascii=False, separators=(",", ":")) + ";\n"
        "const GOL_PREBENJ=" + json.dumps(gol_prebenj, ensure_ascii=False, separators=(",", ":")) + ";\n"
    )
    write_js(OUTPUT_FILES["goleadores"], js)
    print(f"  goleadores: {len(gol_benj)} benjamin + {len(gol_prebenj)} prebenjamin groups")

    bump_cache_version()
    conn.close()
    print("✓ JS files generated")


if __name__ == "__main__":
    main()
```

**Step 2: Run import + generate and verify output matches**

```bash
cd /home/manolo/claude/futbol-base
# First, back up current JS files
cp data-benjamin.js data-benjamin.js.bak
cp data-history.js data-history.js.bak

# Run import then generate
python3 scripts/import_existing.py
python3 scripts/generate_js.py

# Compare (should be identical or very similar)
diff <(python3 -c "import json,re; d=json.loads(re.search(r'const BENJAMIN=(\[.*?\]);',open('data-benjamin.js.bak').read(),re.DOTALL).group(1)); print(json.dumps(d,sort_keys=True,indent=2))") <(python3 -c "import json,re; d=json.loads(re.search(r'const BENJAMIN=(\[.*?\]);',open('data-benjamin.js').read(),re.DOTALL).group(1)); print(json.dumps(d,sort_keys=True,indent=2))") | head -30
```

**Step 3: Clean up backups and commit**

```bash
rm -f data-benjamin.js.bak data-history.js.bak
git add scripts/generate_js.py
git commit -m "feat: add JS generator script (SQLite → data-*.js)"
```

---

### Task 4: Modify fetch_futbolaspalmas.py to write to SQLite

**Files:**
- Modify: `scripts/fetch_futbolaspalmas.py`

The scraper should write to SQLite instead of directly to JS files. The parsing functions stay the same — only the output changes.

**Step 1: Add DB imports and modify main() to write to SQLite**

At the top, add:
```python
from db import (
    get_connection, get_or_create_season, get_or_create_category,
    get_or_create_team, get_or_create_group,
)
```

Replace the `process_file` function to write to DB instead of JS. Replace `update_history` and `update_matchdetail` to write to DB. Replace `write_shields` to write to DB. Replace `main()` to:
1. Open DB connection
2. Get/create current season
3. For each category, scrape and write to DB
4. Call `generate_js.py` at the end

The key change: instead of reading/writing JS files, use SQL INSERT/UPDATE.

**Step 2: Update main() flow**

The new main should:
```python
def main():
    conn = get_connection()
    season_id = get_or_create_season(conn, "2025-2026", 2025, 2026)

    for js_path, var_name, stats_var in FILES:
        # ... scrape as before ...
        # But instead of writing to JS, write to DB
        pass

    conn.commit()
    conn.close()

    # Generate JS from DB
    import generate_js
    generate_js.main()
```

**Step 3: Test the full pipeline**

```bash
python3 scripts/fetch_futbolaspalmas.py
```

Should scrape, write to DB, then generate JS files.

**Step 4: Commit**

```bash
git add scripts/fetch_futbolaspalmas.py
git commit -m "refactor: scraper writes to SQLite, generates JS from DB"
```

---

### Task 5: Update GitHub Actions workflow

**Files:**
- Modify: `.github/workflows/update.yml`

**Step 1: Update workflow to run scraper (which now handles everything)**

The scraper now writes to DB and generates JS. We need to also commit the DB file if we want it persisted — but since it's in `.gitignore`, we only commit the generated JS files. The DB is recreated each run.

Actually, we should keep the DB in the repo (remove from `.gitignore`) so history accumulates across runs. The DB file is small (~500KB for this data).

Update `.gitignore` to NOT ignore the DB:
```
# futbolbase.db — intentionally tracked for data persistence
futbolbase.db-wal
futbolbase.db-shm
```

Update workflow:
```yaml
      - name: Actualizar datos desde futbolaspalmas.com
        run: python3 scripts/fetch_futbolaspalmas.py

      - name: Commit y push si hay cambios
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add futbolbase.db data-benjamin.js data-prebenjamin.js data-matchdetail.js data-history.js data-goleadores.js data-shields.js index.html
          if git diff --cached --quiet; then
            echo "Sin cambios."
          else
            git commit -m "Actualización automática $(date '+%d/%m/%Y %H:%M UTC')"
            git push
          fi
```

**Step 2: Commit**

```bash
git add .github/workflows/update.yml .gitignore
git commit -m "chore: update workflow to track SQLite DB and all generated files"
```

---

### Task 6: End-to-end verification

**Step 1: Delete the DB and regenerate from scratch**

```bash
rm -f futbolbase.db
python3 scripts/import_existing.py
python3 scripts/generate_js.py
```

**Step 2: Verify the web still works locally**

Open `index.html` in a browser and check:
- Classifications load for all groups
- Jornada history works (navigate through jornadas)
- Goleadores show correctly
- Match details open with goals
- Escudos display

**Step 3: Run the full scraper pipeline**

```bash
python3 scripts/fetch_futbolaspalmas.py
```

Verify no errors, DB updated, JS files regenerated.

**Step 4: Commit everything and push**

```bash
git add -A
git commit -m "feat: SQLite database implementation complete"
git push
```
