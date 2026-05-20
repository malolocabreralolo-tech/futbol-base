"""Idempotent schema migration for SP-1 actas pipeline.

Adds: players, appearances, match_events, match_staff tables; matches.cod_acta column.
Safe to run multiple times. Run: python3 scripts/migrate_actas_schema.py [--db PATH]
"""
import sqlite3
import sys

DDL = [
    """CREATE TABLE IF NOT EXISTS players (
        id        INTEGER PRIMARY KEY,
        full_name TEXT NOT NULL,
        norm_name TEXT NOT NULL UNIQUE
    )""",
    """CREATE TABLE IF NOT EXISTS appearances (
        id        INTEGER PRIMARY KEY,
        match_id  INTEGER NOT NULL REFERENCES matches(id),
        team_id   INTEGER NOT NULL REFERENCES teams(id),
        player_id INTEGER NOT NULL REFERENCES players(id),
        dorsal    INTEGER,
        role      TEXT NOT NULL CHECK(role IN ('starter','sub')),
        goals     INTEGER NOT NULL DEFAULT 0,
        yellow    INTEGER NOT NULL DEFAULT 0,
        red       INTEGER NOT NULL DEFAULT 0,
        UNIQUE(match_id, team_id, player_id)
    )""",
    """CREATE INDEX IF NOT EXISTS idx_appearances_match  ON appearances(match_id)""",
    """CREATE INDEX IF NOT EXISTS idx_appearances_player ON appearances(player_id)""",
    """CREATE INDEX IF NOT EXISTS idx_appearances_team   ON appearances(team_id)""",
    """CREATE TABLE IF NOT EXISTS match_events (
        id        INTEGER PRIMARY KEY,
        match_id  INTEGER NOT NULL REFERENCES matches(id),
        team_id   INTEGER NOT NULL REFERENCES teams(id),
        player_id INTEGER NOT NULL REFERENCES players(id),
        kind      TEXT NOT NULL CHECK(kind IN ('goal','sub_in','sub_out','yellow','red')),
        minute    INTEGER,
        goal_type TEXT CHECK(goal_type IN ('normal','penalty','own')),
        pair_id   INTEGER REFERENCES match_events(id)
    )""",
    """CREATE INDEX IF NOT EXISTS idx_match_events_match  ON match_events(match_id)""",
    """CREATE INDEX IF NOT EXISTS idx_match_events_player ON match_events(player_id)""",
    """CREATE INDEX IF NOT EXISTS idx_match_events_kind   ON match_events(kind)""",
    """CREATE TABLE IF NOT EXISTS match_staff (
        id       INTEGER PRIMARY KEY,
        match_id INTEGER NOT NULL REFERENCES matches(id),
        team_id  INTEGER,
        kind     TEXT NOT NULL CHECK(kind IN ('coach','referee')),
        name     TEXT NOT NULL,
        UNIQUE(match_id, team_id, kind, name)
    )""",
    """CREATE INDEX IF NOT EXISTS idx_match_staff_match ON match_staff(match_id)""",
]


def column_exists(conn, table, col):
    return any(r[1] == col for r in conn.execute(f"PRAGMA table_info({table})"))


def migrate(conn):
    """Apply the actas schema idempotently. Commits the connection."""
    for stmt in DDL:
        conn.execute(stmt)
    if not column_exists(conn, "matches", "cod_acta"):
        conn.execute("ALTER TABLE matches ADD COLUMN cod_acta INTEGER")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_matches_cod_acta ON matches(cod_acta)")
    conn.commit()


def main():
    db = "futbolbase.db"
    if len(sys.argv) > 1:
        if sys.argv[1] != "--db" or len(sys.argv) < 3:
            sys.exit("usage: migrate_actas_schema.py [--db PATH]")
        db = sys.argv[2]
    conn = sqlite3.connect(db)
    migrate(conn)
    print(f"Migration applied to {db}")


if __name__ == "__main__":
    main()
