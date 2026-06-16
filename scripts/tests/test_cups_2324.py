"""TDD — helpers de import_fiflp_cups_2324.py (Copa de Campeones 2023-24 GC).

La Copa 2023-24 (comps 1229 benjamín / 1230 prebenjamín) es un formato de GRUPOS
(round-robin "Ronda 1"), no de fases con letra. El scraper produjo nombres con
la LETRA DE EQUIPO DUPLICADA (artefacto): 'ARUCAS C.F. "A" "A"' y
'DORAMAS "A", C.D. "A"' — hay que normalizar al formato canónico de la DB
('ARUCAS C.F. "A"', 'DORAMAS, C.D. "A"') o se crean equipos duplicados.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))


class TestCleanTeamName:
    def test_collapses_adjacent_duplicate_letter(self):
        from import_fiflp_cups_2324 import clean_team_name
        assert clean_team_name('ARUCAS C.F. "A" "A"') == 'ARUCAS C.F. "A"'
        assert clean_team_name('ATLETICO ISLETA "A" "A"') == 'ATLETICO ISLETA "A"'
        assert clean_team_name('SIMUSETTI C. F. "B" "B"') == 'SIMUSETTI C. F. "B"'

    def test_removes_letter_inserted_before_club_type(self):
        from import_fiflp_cups_2324 import clean_team_name
        assert clean_team_name('DORAMAS "A", C.D. "A"') == 'DORAMAS, C.D. "A"'
        assert clean_team_name('ATLETICO HURACAN "A", A.D. "A"') == 'ATLETICO HURACAN, A.D. "A"'
        assert clean_team_name('TELDE "C", U.D. "C"') == 'TELDE, U.D. "C"'
        assert clean_team_name('VICTORIA "A", REAL CLUB "A"') == 'VICTORIA, REAL CLUB "A"'

    def test_untagged_single_suffix_unchanged(self):
        from import_fiflp_cups_2324 import clean_team_name
        assert clean_team_name('MOGAN, C.F.') == 'MOGAN, C.F.'
        assert clean_team_name('PALMAS, U.D. LAS') == 'PALMAS, U.D. LAS'
        assert clean_team_name('LA UNION DE VECINDARIO') == 'LA UNION DE VECINDARIO'


class TestCupCode:
    def test_benjamin_groups_numbered(self):
        from import_fiflp_cups_2324 import cup_code
        assert cup_code('benjamin', 'GRUPO 1') == 'BC1'
        assert cup_code('benjamin', 'GRUPO 2') == 'BC2'
        assert cup_code('benjamin', 'GRUPO 3') == 'BC3'

    def test_prebenjamin_single_bracket(self):
        from import_fiflp_cups_2324 import cup_code
        assert cup_code('prebenjamin', 'GRUPO 1') == 'PCC1'

    def test_codes_are_knockout_recognizable(self):
        from import_fiflp_cups_2324 import cup_code
        assert cup_code('benjamin', 'GRUPO 2').startswith('BC')
        assert cup_code('prebenjamin', 'GRUPO 1').startswith('PCC')


class TestSkipsUnplayedPhantom:
    """2023-24 es una temporada COMPLETA: no hay partidos pendientes legítimos.
    El scraper coló un fantasma cross-grupo sin marcador (PALMAS vs DORAMAS,
    ambos de GRUPO 1, dentro de GRUPO 2). El import debe descartar los partidos
    None-None para no mostrar fixtures espurios en la cup."""

    def _conn(self):
        import sqlite3, db
        conn = sqlite3.connect(":memory:")
        db.init_db(conn)
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def test_drops_none_none_matches(self):
        import import_fiflp_cups_2324 as imp
        conn = self._conn()
        sid = conn.execute(
            "INSERT INTO seasons (name,start_year,end_year,is_current) "
            "VALUES ('2023-2024',2023,2024,0)").lastrowid
        g = {"competition_id": "1229", "cat": "benjamin", "group_name": "GRUPO 2",
             "island": "grancanaria", "phase": "Copa de Campeones", "standings": [],
             "jornadas": [{"num": "Ronda 1", "matches": [
                 {"home": "VICTORIA, REAL CLUB \"A\"", "away": "TELDE, U.D. \"B\"", "hs": 2, "as": 2},
                 {"home": "PALMAS, U.D. LAS", "away": "DORAMAS, C.D. \"A\"", "hs": None, "as": None},
             ]}]}
        imp.import_group(conn, g, sid)
        n = conn.execute("SELECT COUNT(*) FROM matches").fetchone()[0]
        assert n == 1, "el partido None-None fantasma no debe importarse"


class TestUniqueCodes:
    def test_collision_raises(self):
        import pytest
        from import_fiflp_cups_2324 import assert_unique_codes
        raw = [{"cat": "benjamin", "group_name": "GRUPO 1"},
               {"cat": "benjamin", "group_name": "GRUPO 1"}]  # ambos BC1
        with pytest.raises(ValueError):
            assert_unique_codes(raw)

    def test_unique_ok(self):
        from import_fiflp_cups_2324 import assert_unique_codes
        raw = [{"cat": "benjamin", "group_name": "GRUPO 1"},
               {"cat": "benjamin", "group_name": "GRUPO 2"},
               {"cat": "benjamin", "group_name": "GRUPO 3"},
               {"cat": "prebenjamin", "group_name": "GRUPO 1"}]
        assert_unique_codes(raw)  # no levanta
