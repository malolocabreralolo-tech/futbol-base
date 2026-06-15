"""TDD — helpers puros de import_fiflp_cups_2526.py (Copa de Campeones 2025-26).

Las páginas de cup de FIFLP 2025-26 embeben tags en los nombres
('(Clasificado)', '(Ganador)', '(P)') y la comp benjamín es única con 3 grupos
internos (FASE A/B/C) en vez de las 5 comps de 2024-25. Estos helpers se testean
en local; el scrape (que necesita FIFLP/Actions) ya produjo el raw JSON.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))


class TestCleanTeamName:
    def test_strips_trailing_clasificado_and_p(self):
        from import_fiflp_cups_2526 import clean_team_name
        assert clean_team_name('TAMARACEITE, U.D. "A" (P) (Clasificado)') == 'TAMARACEITE, U.D. "A"'

    def test_strips_leading_clasificado(self):
        from import_fiflp_cups_2526 import clean_team_name
        assert clean_team_name('(Clasificado) ACODETTI C.F. "A"') == 'ACODETTI C.F. "A"'

    def test_strips_ganador(self):
        from import_fiflp_cups_2526 import clean_team_name
        assert clean_team_name('PALMAS, U.D. LAS (Ganador)') == 'PALMAS, U.D. LAS'

    def test_untagged_name_unchanged(self):
        from import_fiflp_cups_2526 import clean_team_name
        assert clean_team_name('ARUCAS C.F. "B"') == 'ARUCAS C.F. "B"'

    def test_matches_2024_25_db_convention(self):
        # 0 equipos con tags en la DB del 2024-25 → la limpieza debe dejar el
        # mismo formato FIFLP que ya existe ('PALMAS, U.D. LAS', no normalizado)
        from import_fiflp_cups_2526 import clean_team_name
        assert clean_team_name('(Clasificado) PALMAS, U.D. LAS') == 'PALMAS, U.D. LAS'


class TestCupCode:
    def test_benjamin_phases(self):
        from import_fiflp_cups_2526 import cup_code
        assert cup_code('benjamin', 'FASE A') == 'BCA1'
        assert cup_code('benjamin', 'FASE B') == 'BCB1'
        assert cup_code('benjamin', 'FASE C') == 'BCC1'

    def test_prebenjamin_single_bracket(self):
        from import_fiflp_cups_2526 import cup_code
        assert cup_code('prebenjamin', 'ELIMINATORIAS') == 'PCC1'

    def test_codes_are_knockout_recognizable(self):
        # el frontend (isKnockoutGroup) y synth detectan por prefijo BC*/PCC*
        from import_fiflp_cups_2526 import cup_code
        assert cup_code('benjamin', 'FASE A').startswith('BC')
        assert cup_code('prebenjamin', 'ELIMINATORIAS').startswith('PCC')


class TestTaggedWinner:
    """El equipo con tag (Clasificado)/(Ganador) en un partido es el que pasó —
    señal fiable incluso en empates (penaltis). Lo usamos para verificar el
    campeón frente al marcador."""

    def test_tagged_side(self):
        from import_fiflp_cups_2526 import tagged_winner
        # devuelve 'home'/'away'/None según qué lado lleva el tag
        assert tagged_winner('(Clasificado) ACODETTI', 'MASPA') == 'home'
        assert tagged_winner('UNION VIERA', 'TAMARACEITE (Clasificado)') == 'away'
        assert tagged_winner('PALMAS (Ganador)', 'ACODETTI') == 'home'
        assert tagged_winner('FIRGAS', 'SAN ANTONIO') is None
