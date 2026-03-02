"""
SQLite database schema and helpers for futbol-base.

Tables: seasons, categories, groups, teams, standings, matches, goals, scorers.
Uses WAL mode and foreign keys. No external dependencies.
"""

import os
import sqlite3

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(PROJECT_ROOT, "futbolbase.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS seasons (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    start_year  INTEGER NOT NULL,
    end_year    INTEGER NOT NULL,
    is_current  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS teams (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL UNIQUE,
    shield_filename TEXT
);

CREATE TABLE IF NOT EXISTS groups (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id       INTEGER NOT NULL REFERENCES seasons(id),
    category_id     INTEGER NOT NULL REFERENCES categories(id),
    code            TEXT    NOT NULL,
    name            TEXT,
    full_name       TEXT,
    phase           TEXT,
    island          TEXT,
    url             TEXT,
    current_jornada TEXT,
    UNIQUE(season_id, category_id, code)
);

CREATE TABLE IF NOT EXISTS standings (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id  INTEGER NOT NULL REFERENCES groups(id),
    team_id   INTEGER NOT NULL REFERENCES teams(id),
    position  INTEGER,
    points    INTEGER,
    played    INTEGER,
    won       INTEGER,
    drawn     INTEGER,
    lost      INTEGER,
    gf        INTEGER,
    gc        INTEGER,
    gd        INTEGER,
    UNIQUE(group_id, team_id)
);

CREATE TABLE IF NOT EXISTS matches (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id      INTEGER NOT NULL REFERENCES groups(id),
    jornada       TEXT,
    date          TEXT,
    time          TEXT,
    home_team_id  INTEGER NOT NULL REFERENCES teams(id),
    away_team_id  INTEGER NOT NULL REFERENCES teams(id),
    home_score    INTEGER,
    away_score    INTEGER,
    venue         TEXT,
    UNIQUE(group_id, jornada, home_team_id, away_team_id)
);

CREATE TABLE IF NOT EXISTS goals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id      INTEGER NOT NULL REFERENCES matches(id),
    minute        INTEGER,
    player_name   TEXT,
    running_score TEXT,
    side          TEXT,
    type          TEXT
);

CREATE TABLE IF NOT EXISTS scorers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id    INTEGER NOT NULL REFERENCES groups(id),
    player_name TEXT    NOT NULL,
    team_id     INTEGER NOT NULL REFERENCES teams(id),
    goals       INTEGER,
    games       INTEGER,
    UNIQUE(group_id, player_name, team_id)
);
"""


def get_connection(db_path=None):
    """Return a connection to the SQLite database with WAL and FK enabled."""
    path = db_path or DB_PATH
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(conn):
    """Create all tables if they don't exist."""
    conn.executescript(SCHEMA)
    conn.commit()


def get_or_create_season(conn, name, start_year, end_year, is_current=False):
    """Return the season id, creating it if needed."""
    cur = conn.execute("SELECT id FROM seasons WHERE name=?", (name,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur = conn.execute(
        "INSERT INTO seasons (name, start_year, end_year, is_current) VALUES (?,?,?,?)",
        (name, start_year, end_year, int(is_current)),
    )
    conn.commit()
    return cur.lastrowid


def get_or_create_category(conn, name):
    """Return the category id, creating it if needed."""
    cur = conn.execute("SELECT id FROM categories WHERE name=?", (name,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur = conn.execute("INSERT INTO categories (name) VALUES (?)", (name,))
    conn.commit()
    return cur.lastrowid


def get_or_create_team(conn, name, shield_filename=None):
    """Return the team id, creating it if needed. Updates shield if provided."""
    cur = conn.execute("SELECT id FROM teams WHERE name=?", (name,))
    row = cur.fetchone()
    if row:
        if shield_filename:
            conn.execute(
                "UPDATE teams SET shield_filename=? WHERE id=?",
                (shield_filename, row[0]),
            )
        return row[0]
    cur = conn.execute(
        "INSERT INTO teams (name, shield_filename) VALUES (?,?)",
        (name, shield_filename),
    )
    conn.commit()
    return cur.lastrowid


def get_or_create_group(conn, season_id, category_id, code, **kwargs):
    """Return the group id, creating it if needed. kwargs: name, full_name, phase, island, url, current_jornada."""
    cur = conn.execute(
        "SELECT id FROM groups WHERE season_id=? AND category_id=? AND code=?",
        (season_id, category_id, code),
    )
    row = cur.fetchone()
    if row:
        # Update fields if provided
        updates = []
        values = []
        for col in ("name", "full_name", "phase", "island", "url", "current_jornada"):
            if col in kwargs and kwargs[col] is not None:
                updates.append(f"{col}=?")
                values.append(kwargs[col])
        if updates:
            values.append(row[0])
            conn.execute(
                f"UPDATE groups SET {','.join(updates)} WHERE id=?", values
            )
        return row[0]
    cols = ["season_id", "category_id", "code"]
    vals = [season_id, category_id, code]
    for col in ("name", "full_name", "phase", "island", "url", "current_jornada"):
        if col in kwargs:
            cols.append(col)
            vals.append(kwargs[col])
    placeholders = ",".join(["?"] * len(vals))
    cur = conn.execute(
        f"INSERT INTO groups ({','.join(cols)}) VALUES ({placeholders})", vals
    )
    conn.commit()
    return cur.lastrowid
