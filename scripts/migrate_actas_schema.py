"""Idempotent schema migration for SP-1 actas pipeline.

Adds: players, appearances, match_events, match_staff_all (todo el cuerpo técnico
y los árbitros del acta) and the match_staff view; matches.cod_acta column;
players.fiflp_id (id del jugador en la federación, estable entre temporadas) and
matches.venue_code (código del campo en la federación).

Una base nueva nace con el esquema compacto (10/2026, migrate_compactar.py):
appearances WITHOUT ROWID con el orden del acta (ord) y match_staff como vista de
match_staff_all. Una base de antes se convierte al final de migrate().
Safe to run multiple times. Run: python3 scripts/migrate_actas_schema.py [--db PATH]
"""
import sqlite3
import sys

# Los cuatro cargos de siempre del acta: match_staff.kind y el cargo con que los escribe la federación
# (match_staff_all.role). match_staff es la vista de match_staff_all con solo estos cargos.
STAFF_KINDS = {"referee": "Árbitro/a Principal", "delegate_field": "DEL. Campo",
               "delegate_team": "DEL. Equipo", "coach": "Entrenador"}

# Una fila por jugador en el acta de un partido. La clave primaria es la UNIQUE de siempre y la tabla
# no tiene rowid (WITHOUT ROWID): la clave es la tabla, sin un índice aparte. ord es el orden del acta
# (el que daba el id de la fila): desempata las alineaciones de generate_js (rol, dorsal, ord).
APPEARANCES_COLUMNS = """(
        match_id  INTEGER NOT NULL REFERENCES matches(id),
        team_id   INTEGER NOT NULL REFERENCES teams(id),
        player_id INTEGER NOT NULL REFERENCES players(id),
        dorsal    INTEGER,
        role      TEXT NOT NULL CHECK(role IN ('starter','sub')),
        goals     INTEGER NOT NULL DEFAULT 0,
        yellow    INTEGER NOT NULL DEFAULT 0,
        red       INTEGER NOT NULL DEFAULT 0,
        ord       INTEGER NOT NULL,
        PRIMARY KEY(match_id, team_id, player_id)
    ) WITHOUT ROWID"""
APPEARANCES_DDL = "CREATE TABLE IF NOT EXISTS appearances " + APPEARANCES_COLUMNS
# prune_players (en cada pasada del bot) y la clave ajena al borrar jugadores: sin él, minutos.
APPEARANCES_PLAYER_INDEX = "CREATE INDEX IF NOT EXISTS idx_appearances_player ON appearances(player_id)"
# La clave ajena de pair_id: sin él, cada suceso borrado (al reimportar un acta) recorre match_events
# entera. Parcial: las filas con pair_id NULL (hoy, todas) no ocupan.
EVENTS_PAIR_INDEX = ("CREATE INDEX IF NOT EXISTS idx_match_events_pair ON match_events(pair_id) "
                     "WHERE pair_id IS NOT NULL")

# Todo el cuerpo técnico y los árbitros del acta, tal como los escribe la federación (cargo y nombre,
# en su orden, ord desde 0): 2.º entrenador, entrenador en prácticas, delegados… Una fila con ord
# negativo no es del cuerpo técnico del acta: es uno de los cuatro cargos que solo constaba en la
# antigua tabla match_staff (migrate_compactar); sale en la vista, no en lo que publica generate_js.
MATCH_STAFF_ALL_DDL = """CREATE TABLE IF NOT EXISTS match_staff_all (
        match_id INTEGER NOT NULL REFERENCES matches(id),
        team_id  INTEGER,
        role     TEXT NOT NULL,
        name     TEXT NOT NULL,
        ord      INTEGER NOT NULL
    )"""
MATCH_STAFF_ALL_INDEX = "CREATE INDEX IF NOT EXISTS idx_match_staff_all_match ON match_staff_all(match_id)"

# match_staff: el árbitro principal, los entrenadores y los delegados de campo y de equipo del acta, con
# su kind. Es una vista: se escribe en match_staff_all (un INSERT, UPDATE o DELETE en ella falla).
MATCH_STAFF_SELECT = (
    "SELECT match_id, team_id,\n"
    "         CASE role " + " ".join(f"WHEN '{role}' THEN '{kind}'" for kind, role in STAFF_KINDS.items())
    + " END AS kind,\n"
    "         name\n"
    "    FROM match_staff_all\n"
    "   WHERE role IN (" + ", ".join(f"'{role}'" for role in STAFF_KINDS.values()) + ")")
MATCH_STAFF_VIEW = "CREATE VIEW IF NOT EXISTS match_staff AS\n  " + MATCH_STAFF_SELECT

DDL = [
    """CREATE TABLE IF NOT EXISTS players (
        id        INTEGER PRIMARY KEY,
        full_name TEXT NOT NULL,
        norm_name TEXT NOT NULL UNIQUE
    )""",
    APPEARANCES_DDL,
    APPEARANCES_PLAYER_INDEX,
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
    EVENTS_PAIR_INDEX,
    # Directorio de campos de la federación (NFG_LstCampos): dirección exacta
    # para «Cómo llegar», superficie y tipo de campo (2026-10).
    """CREATE TABLE IF NOT EXISTS venues (
        name    TEXT PRIMARY KEY,
        norm    TEXT NOT NULL,
        address TEXT,
        city    TEXT,
        surface TEXT,
        kind    TEXT,
        code    INTEGER
    )""",
    MATCH_STAFF_ALL_DDL,
    MATCH_STAFF_ALL_INDEX,
    # Con la tabla match_staff de antes, no hace nada: la convierte migrate_compactar.
    MATCH_STAFF_VIEW,
]


def column_exists(conn, table, col):
    return any(r[1] == col for r in conn.execute(f"PRAGMA table_info({table})"))


def migrate(conn, log=print):
    """Apply the actas schema idempotently. Commits the connection. Al final, migrate_compactar: una
    base de antes (appearances con id, match_staff tabla) pasa al esquema compacto, con un VACUUM."""
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
    # El código del campo en la federación, del enlace del acta (2026-10).
    if not column_exists(conn, "matches", "venue_code"):
        conn.execute("ALTER TABLE matches ADD COLUMN venue_code INTEGER")
    if not column_exists(conn, "players", "fiflp_id"):
        conn.execute("ALTER TABLE players ADD COLUMN fiflp_id INTEGER")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_players_fiflp ON players(fiflp_id)")
    conn.commit()
    try:
        from migrate_compactar import migrate as compactar
    except ImportError:          # importado como scripts.migrate_actas_schema, sin scripts/ en sys.path
        from scripts.migrate_compactar import migrate as compactar
    compactar(conn, log=log)


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
