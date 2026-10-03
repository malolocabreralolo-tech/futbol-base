"""Idempotent schema migration for SP-1 actas pipeline.

Adds: players, appearances, match_events, match_staff tables; matches.cod_acta column;
players.fiflp_id (id del jugador en la federación, estable entre temporadas) and
the delegate kinds of match_staff (delegado de campo y de equipo, 2026-10).
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
        kind     TEXT NOT NULL CHECK(kind IN ('coach','referee','delegate_field','delegate_team')),
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
    # El código del acta en la federación, que el calendario ya trae antes del
    # partido (la «previa»). cod_acta sigue significando «acta importada».
    if not column_exists(conn, "matches", "fiflp_acta"):
        conn.execute("ALTER TABLE matches ADD COLUMN fiflp_acta INTEGER")
    # Lecturas fallidas del acta (se espacian y se abandonan) y marca de
    # «releer» cuando la jornada contradice un marcador ya comprobado con el
    # acta (Competición cambia un resultado, la federación rehace el acta).
    if not column_exists(conn, "matches", "acta_tries"):
        conn.execute("ALTER TABLE matches ADD COLUMN acta_tries INTEGER NOT NULL DEFAULT 0")
    if not column_exists(conn, "matches", "acta_recheck"):
        conn.execute("ALTER TABLE matches ADD COLUMN acta_recheck INTEGER NOT NULL DEFAULT 0")
    if not column_exists(conn, "players", "fiflp_id"):
        conn.execute("ALTER TABLE players ADD COLUMN fiflp_id INTEGER")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_players_fiflp ON players(fiflp_id)")
    # SQLite no cambia un CHECK: match_staff se reconstruye una vez con los
    # delegados (de campo y de equipo) que trae el acta de la federación.
    sql = conn.execute("SELECT sql FROM sqlite_master WHERE name='match_staff'").fetchone()[0]
    if "delegate_field" not in sql:
        conn.execute("ALTER TABLE match_staff RENAME TO match_staff_old")
        conn.execute(next(d for d in DDL if "TABLE IF NOT EXISTS match_staff" in d))
        conn.execute("""INSERT INTO match_staff(id, match_id, team_id, kind, name)
                        SELECT id, match_id, team_id, kind, name FROM match_staff_old""")
        conn.execute("DROP TABLE match_staff_old")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_match_staff_match ON match_staff(match_id)")
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
