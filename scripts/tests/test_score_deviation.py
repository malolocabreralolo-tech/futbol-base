"""Desvío de los marcadores frente a la clasificación oficial (plan A2).

La clasificación oficial (GF/GC por equipo) no está ofuscada en ninguna fuente,
así que es la vara de medir: si los goles que suman los partidos de un equipo
no coinciden con los de su fila de la tabla, algún marcador del calendario está
mal. Solo cuentan los equipos cuyo calendario tiene todos sus partidos (PJ de
la tabla == partidos con marcador): si falta alguno, la diferencia no dice nada.
"""
import json
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from db import SCHEMA, DB_PATH  # noqa: E402
from score_deviation import (  # noqa: E402
    BASELINE_PATH, baseline_key, closed_season_deviations, group_deviation,
    load_baseline, regressions,
)


def _db():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    conn.executescript("""
      INSERT INTO seasons (id, name, start_year, end_year, is_current)
        VALUES (1, '2024-2025', 2024, 2025, 0), (2, '2025-2026', 2025, 2026, 1);
      INSERT INTO categories (id, name) VALUES (1, 'BENJAMIN');
      INSERT INTO groups (id, season_id, category_id, code, name)
        VALUES (10, 1, 1, 'G1', 'Grupo 1'), (20, 2, 1, 'G1', 'Grupo 1');
      INSERT INTO teams (id, name) VALUES (1, 'A'), (2, 'B'), (3, 'C');
      -- Tabla oficial de G1 2024-25: A 2 PJ, 16-1; B 2 PJ, 1-8; C 2 PJ, 1-9.
      INSERT INTO standings (group_id, team_id, played, gf, gc)
        VALUES (10, 1, 2, 16, 1), (10, 2, 2, 1, 8), (10, 3, 2, 1, 9);
      -- Calendario: A-B 5-0 (la tabla dice 15-0: dígito perdido), C-A 1-1, B-C 1-0.
      INSERT INTO matches (id, group_id, jornada, home_team_id, away_team_id, home_score, away_score)
        VALUES (100, 10, '1', 1, 2, 5, 0), (101, 10, '2', 3, 1, 1, 1), (102, 10, '3', 2, 3, 1, 0);
    """)
    return conn


class TestGroupDeviation:
    def test_sums_goal_differences_of_complete_teams(self):
        # A: calendario 6-1 frente a 16-1 → 10; B: 1-5 frente a 1-8 → 3;
        # C: 1-2 frente a 1-9 → 7. Total 20.
        d = group_deviation(_db(), 10)
        assert d["dev"] == 20
        assert (d["complete"], d["teams"]) == (3, 3)

    def test_override_repairs_the_lost_digit(self):
        # Con el 15-0 bueno, A: 16-1 y B: 1-15 frente a 1-8 → sigue desviado B.
        d = group_deviation(_db(), 10, overrides={100: (15, 0)})
        assert d["dev"] == 7 + 7  # B 1-15 vs 1-8 → 7; C 1-2 vs 1-9 → 7

    def test_teams_with_missing_matches_do_not_count(self):
        conn = _db()
        conn.execute("UPDATE matches SET home_score=NULL, away_score=NULL WHERE id=102")
        # B y C tienen 1 partido con marcador y 2 PJ en la tabla: fuera.
        d = group_deviation(conn, 10)
        assert (d["complete"], d["dev"]) == (1, 10)

    def test_group_without_standings_has_no_deviation(self):
        assert group_deviation(_db(), 20) == {"dev": 0, "complete": 0, "teams": 0}


class TestBaseline:
    def test_only_closed_seasons_enter_the_baseline(self):
        devs = closed_season_deviations(_db())
        assert devs == {baseline_key("2024-2025", "BENJAMIN", "G1"): 20}

    def test_regression_is_an_increase_over_the_baseline(self):
        base = {baseline_key("2024-2025", "BENJAMIN", "G1"): 20}
        assert regressions(base, {baseline_key("2024-2025", "BENJAMIN", "G1"): 20}) == []
        assert regressions(base, {baseline_key("2024-2025", "BENJAMIN", "G1"): 3}) == []
        assert regressions(base, {baseline_key("2024-2025", "BENJAMIN", "G1"): 21}) == [
            ("2024-2025|BENJAMIN|G1", 20, 21)]

    def test_a_group_that_disappeared_is_not_a_regression(self):
        # Un grupo que ya no existe (fusión, renombrado) no bloquea al bot.
        base = {baseline_key("2024-2025", "BENJAMIN", "GONE"): 5}
        assert regressions(base, {}) == []


@pytest.fixture
def live_conn():
    if not Path(DB_PATH).exists():
        pytest.skip("futbolbase.db no está disponible")
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    yield conn
    conn.close()


def test_score_deviation_does_not_regress(live_conn):
    """Vigilante: en las temporadas cerradas, ningún grupo puede separarse más
    de su clasificación oficial que en la línea base guardada. La temporada en
    curso queda fuera: a mitad de liga tabla y calendario van desfasados de
    forma legítima y bloquearía al bot sin motivo."""
    base = load_baseline()
    assert base, f"falta la línea base {BASELINE_PATH}"
    worse = regressions(base, closed_season_deviations(live_conn))
    assert not worse, (
        "marcadores que se separan más de la clasificación oficial "
        f"(grupo, línea base, ahora): {worse[:10]}")


def test_baseline_file_is_well_formed():
    data = json.loads(Path(BASELINE_PATH).read_text())
    assert data["version"] == 1
    assert all(isinstance(v, int) and v >= 0 for v in data["groups"].values())
    assert all(k.count("|") == 2 for k in data["groups"])
