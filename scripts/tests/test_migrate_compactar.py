"""El esquema compacto de las actas (migrate_compactar, 10/2026): appearances WITHOUT ROWID con el orden del
acta (ord), match_staff como vista de match_staff_all, los índices que sobran fuera y el de pair_id dentro.

Sobre bases sintéticas (nombres inventados) con el esquema de antes, tal como lo dejaba
migrate_actas_schema hasta octubre de 2026."""
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from db import SCHEMA, delete_group  # noqa: E402
import generate_js as G  # noqa: E402
import import_fiflp_actas as I  # noqa: E402
import migrate_compactar as M  # noqa: E402
from migrate_actas_schema import migrate as migrate_actas  # noqa: E402

# Las tablas de las actas antes de la compactación (migrate_actas_schema hasta el 14/10/2026).
OLD_ACTAS = """
CREATE TABLE players (id INTEGER PRIMARY KEY, full_name TEXT NOT NULL, norm_name TEXT NOT NULL UNIQUE,
                      fiflp_id INTEGER);
CREATE TABLE appearances (
    id        INTEGER PRIMARY KEY,
    match_id  INTEGER NOT NULL REFERENCES matches(id),
    team_id   INTEGER NOT NULL REFERENCES teams(id),
    player_id INTEGER NOT NULL REFERENCES players(id),
    dorsal    INTEGER,
    role      TEXT NOT NULL CHECK(role IN ('starter','sub')),
    goals     INTEGER NOT NULL DEFAULT 0,
    yellow    INTEGER NOT NULL DEFAULT 0,
    red       INTEGER NOT NULL DEFAULT 0,
    UNIQUE(match_id, team_id, player_id));
CREATE INDEX idx_appearances_match  ON appearances(match_id);
CREATE INDEX idx_appearances_player ON appearances(player_id);
CREATE INDEX idx_appearances_team   ON appearances(team_id);
CREATE TABLE match_events (
    id        INTEGER PRIMARY KEY,
    match_id  INTEGER NOT NULL REFERENCES matches(id),
    team_id   INTEGER NOT NULL REFERENCES teams(id),
    player_id INTEGER NOT NULL REFERENCES players(id),
    kind      TEXT NOT NULL CHECK(kind IN ('goal','sub_in','sub_out','yellow','red')),
    minute    INTEGER,
    goal_type TEXT CHECK(goal_type IN ('normal','penalty','own')),
    pair_id   INTEGER REFERENCES match_events(id));
CREATE INDEX idx_match_events_match  ON match_events(match_id);
CREATE INDEX idx_match_events_player ON match_events(player_id);
CREATE INDEX idx_match_events_kind   ON match_events(kind);
CREATE TABLE match_staff (
    id       INTEGER PRIMARY KEY,
    match_id INTEGER NOT NULL REFERENCES matches(id),
    team_id  INTEGER,
    kind     TEXT NOT NULL CHECK(kind IN ('coach','referee','delegate_field','delegate_team')),
    name     TEXT NOT NULL,
    UNIQUE(match_id, team_id, kind, name));
CREATE INDEX idx_match_staff_match ON match_staff(match_id);
CREATE TABLE match_staff_all (match_id INTEGER NOT NULL REFERENCES matches(id), team_id INTEGER,
                              role TEXT NOT NULL, name TEXT NOT NULL, ord INTEGER NOT NULL);
CREATE INDEX idx_match_staff_all_match ON match_staff_all(match_id);
ALTER TABLE matches ADD COLUMN cod_acta INTEGER;
ALTER TABLE matches ADD COLUMN fiflp_acta INTEGER;
ALTER TABLE matches ADD COLUMN acta_tries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE matches ADD COLUMN acta_recheck INTEGER NOT NULL DEFAULT 0;
ALTER TABLE matches ADD COLUMN venue_code INTEGER;
"""

SEED = """
INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2025-2026', 2025, 2026, 0);
INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN');
INSERT INTO groups(id, season_id, category_id, code, name) VALUES (1, 1, 1, 'G1', 'Grupo 1');
INSERT INTO teams(id, name) VALUES (1, 'Local'), (2, 'Visitante');
INSERT INTO matches(id, group_id, jornada, date, home_team_id, away_team_id, home_score, away_score, cod_acta)
  VALUES (1, 1, 'Jornada 1', '2025-10-04', 1, 2, 2, 1, 900001),
         (2, 1, 'Jornada 2', '2025-10-11', 2, 1, 0, 0, 900002);
INSERT INTO players(id, full_name, norm_name, fiflp_id) VALUES
  (1, 'JUGADOR A', 'JUGADOR A', 101), (2, 'JUGADOR B', 'JUGADOR B', 102), (3, 'JUGADOR C', 'JUGADOR C', 103),
  (4, 'JUGADOR D', 'JUGADOR D', 104), (5, 'JUGADOR E', 'JUGADOR E', 105), (6, 'JUGADOR F', 'JUGADOR F', 106),
  (7, 'JUGADOR SIN USO', 'JUGADOR SIN USO', 107);
-- El orden del acta (el id) no es el de la clave: los suplentes sin dorsal (empatados) van E, B, D.
INSERT INTO appearances(id, match_id, team_id, player_id, dorsal, role, goals) VALUES
  (10, 1, 1, 3, 9, 'starter', 2), (11, 1, 1, 5, NULL, 'sub', 0), (12, 1, 1, 2, NULL, 'sub', 0),
  (13, 1, 1, 4, NULL, 'sub', 0), (14, 1, 2, 6, 4, 'starter', 1), (15, 1, 2, 1, 4, 'starter', 0),
  (16, 2, 2, 6, 4, 'starter', 0), (17, 2, 1, 3, 9, 'starter', 0);
INSERT INTO match_events(id, match_id, team_id, player_id, kind, minute, goal_type) VALUES
  (1, 1, 1, 3, 'goal', 5, 'normal'), (2, 1, 2, 6, 'goal', 20, 'normal'), (3, 1, 1, 3, 'goal', 30, 'penalty');
-- Partido 1: match_staff_all completa y una fila suelta en match_staff (el «entrenador» visitante que el
-- lector tomó de otra línea, como el acta 289289).
INSERT INTO match_staff(id, match_id, team_id, kind, name) VALUES
  (1, 1, NULL, 'referee', 'ARBITRA UNO'), (2, 1, 2, 'coach', 'TEXTO SUELTO'), (3, 1, 1, 'coach', 'ENTRENADORA LOCAL'),
  (4, 1, 2, 'delegate_team', 'DELEGADO VISITANTE');
INSERT INTO match_staff_all(match_id, team_id, role, name, ord) VALUES
  (1, NULL, 'Árbitro/a Principal', 'ARBITRA UNO', 0), (1, 1, 'Entrenador', 'ENTRENADORA LOCAL', 1),
  (1, 1, '2ºEntrenador', 'SEGUNDO LOCAL', 2), (1, 2, 'DEL. Equipo', 'DELEGADO VISITANTE', 3),
  (1, 2, 'ENCARGADO MATERIAL', 'MATERIAL VISITANTE', 4);
-- Partido 2: igual en las dos tablas.
INSERT INTO match_staff(id, match_id, team_id, kind, name) VALUES
  (5, 2, NULL, 'referee', 'ARBITRO DOS'), (6, 2, 1, 'delegate_field', 'DELEGADA DOS');
INSERT INTO match_staff_all(match_id, team_id, role, name, ord) VALUES
  (2, NULL, 'Árbitro/a Principal', 'ARBITRO DOS', 0), (2, 1, 'DEL. Campo', 'DELEGADA DOS', 1);
"""

quiet = lambda *a, **k: None  # noqa: E731


def old_base(path=":memory:", seed=SEED):
    conn = sqlite3.connect(path)
    conn.executescript(SCHEMA)
    conn.executescript(OLD_ACTAS)
    conn.executescript(seed)
    conn.commit()
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def objects(conn):
    return {name: kind for kind, name in conn.execute(
        "SELECT type, name FROM sqlite_master WHERE type IN ('table','view','index') AND name NOT LIKE 'sqlite_%'")}


def staff_rows(conn):
    return sorted(conn.execute("SELECT match_id, team_id, kind, name FROM match_staff"), key=repr)


def published(conn):
    """Lo que generate_js publica de las actas: alineaciones, fichas de jugador y cobertura."""
    return G.lineups_entries(conn, "2025-2026"), G.jugadores_files(conn), G.coverage_summary(conn)


def test_una_base_nueva_nace_compacta():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate_actas(conn, log=quiet)
    assert M.pending(conn) == []
    obj = objects(conn)
    assert obj["match_staff"] == "view" and obj["match_staff_all"] == "table"
    assert "WITHOUT ROWID" in conn.execute("SELECT sql FROM sqlite_master WHERE name='appearances'").fetchone()[0]
    assert {"idx_appearances_player", "idx_match_events_pair", "idx_match_events_match"} <= set(obj)
    assert not {"idx_appearances_match", "idx_appearances_team", "idx_match_events_kind",
                "idx_match_staff_match"} & set(obj)
    assert M.migrate(conn, log=quiet) == {"converted": []}


def test_convierte_el_esquema_viejo_y_la_segunda_vez_no_hace_nada(tmp_path, monkeypatch):
    mark = tmp_path / "base-cambiada"
    monkeypatch.setenv("FIFLP_DB_MARK", str(mark))
    conn = old_base(str(tmp_path / "fb.db"))
    before_apps = sorted(conn.execute("SELECT match_id, team_id, player_id, dorsal, role, goals, yellow, red FROM appearances"))
    before_events = conn.execute("SELECT * FROM match_events ORDER BY id").fetchall()
    assert M.pending(conn) == ["appearances", "match_staff", "idx_match_events_kind", "idx_match_events_pair"]
    statements = []
    conn.set_trace_callback(statements.append)
    report = M.migrate(conn, log=quiet)
    assert report["converted"] == ["appearances", "match_staff", "idx_match_events_kind", "idx_match_events_pair"]
    assert report["appearances"] == 8 and report["match_staff"] == {"rows": 6, "matches": 0, "loose": 1, "extra": 0}
    assert "VACUUM" in statements
    assert "migrate_compactar" in mark.read_text(encoding="utf-8")
    obj = objects(conn)
    assert obj["match_staff"] == "view" and M.pending(conn) == []
    assert not {"idx_appearances_match", "idx_appearances_team", "idx_match_events_kind",
                "idx_match_staff_match"} & set(obj)
    assert {"idx_appearances_player", "idx_match_events_pair"} <= set(obj)
    cols = [r[1] for r in conn.execute("PRAGMA table_info(appearances)")]
    assert "id" not in cols and "ord" in cols
    assert conn.execute("PRAGMA foreign_keys").fetchone() == (1,)            # como estaba
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    # Las mismas filas.
    assert sorted(conn.execute("SELECT match_id, team_id, player_id, dorsal, role, goals, yellow, red FROM appearances")) \
        == before_apps
    assert conn.execute("SELECT * FROM match_events ORDER BY id").fetchall() == before_events
    # La segunda vez: nada, ni VACUUM ni marca.
    mark.unlink()
    statements.clear()
    changes = conn.total_changes
    assert M.migrate(conn, log=quiet) == {"converted": []}
    migrate_actas(conn, log=quiet)
    assert conn.total_changes == changes
    assert not [s for s in statements if s.upper().startswith(("VACUUM", "DROP", "INSERT", "ALTER"))]
    assert not mark.exists()


def test_el_orden_del_acta_se_conserva():
    conn = old_base()
    order = lambda col: conn.execute(f"SELECT match_id, player_id FROM appearances ORDER BY match_id, {col}").fetchall()  # noqa: E731
    by_id = order("id")
    before = published(conn)
    M.migrate(conn, log=quiet)
    assert order("ord") == by_id
    assert conn.execute("SELECT match_id, player_id, ord FROM appearances WHERE match_id=1 ORDER BY ord").fetchall() == [
        (1, 3, 0), (1, 5, 1), (1, 2, 2), (1, 4, 3), (1, 6, 4), (1, 1, 5)]
    after = published(conn)
    assert after == before
    # Los suplentes sin dorsal (empatados), en el orden del acta y no en el de la clave (B, D, E). El rol va
    # en orden descendente: 'sub' antes que 'starter', como siempre.
    entry = dict(after[0])["Local|Visitante|2-1"]
    assert [p["n"] for p in entry["home"]] == ["JUGADOR E", "JUGADOR B", "JUGADOR D", "JUGADOR C"]
    assert [p["n"] for p in entry["away"]] == ["JUGADOR F", "JUGADOR A"]


def test_el_cuerpo_tecnico_se_conserva_y_la_fila_suelta_no_sale_en_el_publicado():
    conn = old_base()
    before_staff = staff_rows(conn)
    before = dict(G.lineups_entries(conn, "2025-2026"))
    M.migrate(conn, log=quiet)
    assert staff_rows(conn) == before_staff
    # La fila suelta, en match_staff_all con ord negativo: en la vista (coachA), no en stA.
    assert conn.execute("SELECT team_id, role, name, ord FROM match_staff_all WHERE ord < 0").fetchall() == [
        (2, "Entrenador", "TEXTO SUELTO", -1)]
    after = dict(G.lineups_entries(conn, "2025-2026"))
    assert after == before
    entry = after["Local|Visitante|2-1"]
    assert entry["coachA"] == "TEXTO SUELTO" and entry["coachH"] == "ENTRENADORA LOCAL"
    assert entry["stA"] == [["DEL. Equipo", "DELEGADO VISITANTE"], ["ENCARGADO MATERIAL", "MATERIAL VISITANTE"]]
    assert entry["ref"] == "ARBITRA UNO" and entry["delA"] == {"equipo": "DELEGADO VISITANTE"}
    # Reimportar el acta del partido la quita (la vista sale de lo que trae el acta).
    I._clear_acta_rows(conn, 1)
    assert conn.execute("SELECT count(*) FROM match_staff WHERE match_id=1").fetchone() == (0,)


def test_los_partidos_sin_match_staff_all_se_rellenan_como_el_antiguo_backfill():
    seed = SEED + """
      INSERT INTO matches(id, group_id, jornada, date, home_team_id, away_team_id, home_score, away_score, cod_acta)
        VALUES (3, 1, 'Jornada 3', '2025-10-18', 1, 2, 1, 1, 900003);
      INSERT INTO match_staff(id, match_id, team_id, kind, name) VALUES
        (7, 3, 2, 'coach', 'ENTRENADOR TRES'), (8, 3, NULL, 'referee', 'ARBITRO TRES'), (9, 3, 1, 'delegate_team', 'DELEGADO TRES');
    """
    conn = old_base(seed=seed)
    before_staff = staff_rows(conn)
    report = M.migrate(conn, log=quiet)
    assert report["match_staff"] == {"rows": 9, "matches": 1, "loose": 1, "extra": 0}
    assert staff_rows(conn) == before_staff
    assert conn.execute("SELECT team_id, role, name, ord FROM match_staff_all WHERE match_id=3 ORDER BY ord").fetchall() == [
        (None, "Árbitro/a Principal", "ARBITRO TRES", 0), (1, "DEL. Equipo", "DELEGADO TRES", 1),
        (2, "Entrenador", "ENTRENADOR TRES", 2)]


def test_si_algo_falla_no_cambia_nada():
    conn = old_base()
    conn.execute("ALTER TABLE appearances ADD COLUMN nota TEXT")       # una columna que el esquema compacto no tiene
    conn.commit()
    before = objects(conn)
    with pytest.raises(RuntimeError, match="nota"):
        M.migrate(conn, log=quiet)
    assert objects(conn) == before
    assert conn.execute("SELECT count(*) FROM match_staff").fetchone() == (6,)
    assert conn.execute("PRAGMA foreign_keys").fetchone() == (1,)


def test_importar_un_acta_guarda_el_orden_y_no_escribe_en_la_vista():
    conn = old_base()
    M.migrate(conn, log=quiet)
    acta = {"header": {}, "lineups": {
                "home": [{"name": "JUGADOR E", "dorsal": None, "role": "sub", "fiflp_id": 105},
                         {"name": "JUGADOR C", "dorsal": 9, "role": "starter", "fiflp_id": 103},
                         {"name": "JUGADOR B", "dorsal": None, "role": "sub", "fiflp_id": 102}],
                "away": [{"name": "JUGADOR F", "dorsal": 4, "role": "starter", "fiflp_id": 106}]},
            "events": [{"kind": "goal", "side": "away", "player_name": "JUGADOR NUEVO", "minute": 3,
                        "goal_type": "normal"},
                       {"kind": "goal", "side": "home", "player_name": "JUGADOR C", "minute": 8, "goal_type": "normal"}],
            "staff": {"referees": ["Árbitro/a Principal ARBITRA UNO"],
                      "all_home": [["Entrenador", "ENTRENADORA LOCAL"]], "all_away": [["DEL. Campo", "DELEGADO X"]]}}
    assert I._import_one(conn, 900001, acta, mid=1)
    assert conn.execute("""SELECT p.full_name, a.ord FROM appearances a JOIN players p ON p.id=a.player_id
                           WHERE a.match_id=1 ORDER BY a.ord""").fetchall() == [
        ("JUGADOR E", 0), ("JUGADOR C", 1), ("JUGADOR B", 2), ("JUGADOR F", 3), ("JUGADOR NUEVO", 4)]
    entry = dict(G.lineups_entries(conn, "2025-2026"))["Local|Visitante|2-1"]
    assert [p["n"] for p in entry["home"]] == ["JUGADOR E", "JUGADOR B", "JUGADOR C"]
    assert staff_rows(conn)[:3] == [(1, 1, "coach", "ENTRENADORA LOCAL"), (1, 2, "delegate_field", "DELEGADO X"),
                                    (1, None, "referee", "ARBITRA UNO")]
    assert entry["coachA"] is None                                       # la fila suelta se fue con la vieja acta
    # Reimportar da lo mismo.
    I._import_one(conn, 900001, acta, mid=1)
    assert dict(G.lineups_entries(conn, "2025-2026"))["Local|Visitante|2-1"] == entry


def test_borrar_un_grupo_salta_la_vista_y_sigue_como_antes():
    """db.delete_group no intenta borrar en la vista (fallaría). match_staff_all no está en su lista, tampoco
    antes de la compactación: con las claves ajenas activas, un grupo con cuerpo técnico en
    match_staff_all sigue sin poder borrarse, igual que antes (docs/SP-1-actas.md)."""
    for compact in (False, True):
        conn = old_base()
        if compact:
            M.migrate(conn, log=quiet)
        with pytest.raises(sqlite3.IntegrityError):
            delete_group(conn, 1)
        conn.rollback()
        assert conn.execute("SELECT count(*) FROM appearances").fetchone() == (8,)
    conn.execute("DELETE FROM match_staff_all")
    delete_group(conn, 1)
    conn.commit()
    for table in ("matches", "appearances", "match_events", "match_staff"):
        assert conn.execute(f"SELECT count(*) FROM {table}").fetchone() == (0,), table


def test_los_planes_de_consulta_usan_la_clave_y_los_indices():
    conn = old_base()
    M.migrate(conn, log=quiet)
    plan = lambda sql: " | ".join(r[3] for r in conn.execute("EXPLAIN QUERY PLAN " + sql, (1,)))  # noqa: E731
    assert "PRIMARY KEY (match_id=?)" in plan("SELECT * FROM appearances WHERE match_id=?")
    assert "idx_appearances_player" in plan("SELECT 1 FROM appearances WHERE player_id=?")
    assert "idx_match_events_pair" in plan("SELECT 1 FROM match_events WHERE pair_id=?")
    assert "idx_match_staff_all_match" in plan("SELECT name FROM match_staff WHERE match_id=?")
    # prune_players, con las claves ajenas activas, como en el bot.
    assert I.prune_players(conn, log=quiet) == 1
    assert conn.execute("SELECT count(*) FROM players WHERE full_name='JUGADOR SIN USO'").fetchone() == (0,)
