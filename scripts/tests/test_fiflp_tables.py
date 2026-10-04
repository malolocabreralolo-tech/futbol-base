"""fiflp_tables.settle: clasificación oficial y marcadores de las actas en un grupo pasado,
sin alejarlo nunca de su clasificación (la medida de test_score_deviation.py)."""
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from db import SCHEMA
from migrate_actas_schema import migrate
from score_deviation import group_deviation
import fiflp_tables as T


def base():
    """Barrial–Acodetti: la tabla y el calendario guardados dicen 1-1 a la vez (cuadran entre sí);
    el acta y la clasificación de la federación, 4-4."""
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2025-2026', 2025, 2026, 0);
      INSERT INTO categories(id, name) VALUES (1, 'PREBENJAMIN');
      INSERT INTO groups(id, season_id, category_id, code, name, phase) VALUES (1, 1, 1, 'PG1', 'Grupo 1', 'Gran Canaria');
      INSERT INTO teams(id, name) VALUES (1, 'UD Barrial'), (2, 'Acodetti B');
      INSERT INTO standings(group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd) VALUES
        (1, 1, 1, 4, 2, 1, 1, 0, 3, 1, 2), (1, 2, 2, 1, 2, 0, 1, 1, 1, 3, -2);
      INSERT INTO matches(id, group_id, jornada, date, home_team_id, away_team_id, home_score, away_score) VALUES
        (1, 1, 'Jornada 1', '10/03', 1, 2, 1, 1), (2, 1, 'Jornada 2', '17/03', 2, 1, 0, 2);
    """)
    return conn


OFFICIAL = [(1, 1, 4, 2, 1, 1, 0, 6, 4, 2), (2, 2, 1, 2, 0, 1, 1, 4, 6, -2)]


def test_the_acta_and_the_official_table_win_together():
    conn = base()
    assert group_deviation(conn, 1)["dev"] == 0
    assert group_deviation(conn, 1, {1: (4, 4)})["dev"] == 12        # solo el marcador: «empeora»
    assert T.settle(conn, 1, {1: (4, 4)}, OFFICIAL) == "official+fixes"
    assert conn.execute("SELECT home_score, away_score FROM matches WHERE id=1").fetchone() == (4, 4)
    assert conn.execute("SELECT gf, gc FROM standings WHERE team_id=1").fetchone() == (6, 4)
    assert group_deviation(conn, 1)["dev"] == 0


def test_never_a_worse_group():
    conn = base()
    assert T.settle(conn, 1, {1: (4, 4)}, None) == "keep"            # sin la tabla oficial, no se toca
    assert conn.execute("SELECT home_score FROM matches WHERE id=1").fetchone() == (1,)
    assert T.settle(conn, 1, {}, OFFICIAL) == "keep"                 # la tabla sola tampoco: el calendario no cuadra
    assert conn.execute("SELECT gf FROM standings WHERE team_id=1").fetchone() == (3,)


def test_a_group_without_table_gets_the_official_one_and_cups_never_do():
    conn = base()
    conn.execute("DELETE FROM standings")
    assert T.settle(conn, 1, {}, OFFICIAL) == "official"
    assert conn.execute("SELECT count(*) FROM standings").fetchone()[0] == 2
    conn.execute("UPDATE groups SET phase='Copa Cabildo Primera Lanzarote'")
    conn.execute("DELETE FROM standings")
    assert T.settle(conn, 1, {}, OFFICIAL) == "keep"


def test_an_official_table_with_annulled_matches_is_not_used():
    """La federación anula los resultados de un equipo retirado (otros partidos jugados), pero el
    calendario los conserva: esa tabla no cuadraría con él."""
    conn = base()
    annulled = [(1, 1, 3, 1, 1, 0, 0, 4, 4, 0), (2, 2, 0, 1, 0, 0, 1, 0, 2, -2)]
    assert T.settle(conn, 1, {}, annulled) == "keep"
    assert conn.execute("SELECT played FROM standings WHERE team_id=1").fetchone() == (2,)
