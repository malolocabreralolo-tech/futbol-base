"""TDD — emparejador de grupos de Gran Canaria (import_fiflp_gc.py).

Los grupos de GC de temporadas antiguas YA existen en la base (vienen de
Wayback: GC1..GC12, PGC1..PGC4). Importar lo que FIFLP conserva SIN emparejar
duplicaría la liga entera bajo códigos nuevos, así que cada grupo scrapeado se
empareja con el existente por SOLAPAMIENTO DE EQUIPOS — los números de grupo de
FIFLP no tienen por qué coincidir con los de Wayback — y solo se escribe si trae
estrictamente más partidos jugados.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))


class TestNorm:
    def test_strips_club_type_and_punctuation(self):
        from import_fiflp_gc import norm
        assert norm('ATLETICO HURACAN, A.D.') == norm('HURACAN')
        assert norm('UNION VIERA, C.F.') == norm('UNION VIERA')

    def test_keeps_the_filial_letter(self):
        from import_fiflp_gc import norm
        # Un filial NO es el primer equipo: si se colapsaran, el emparejador
        # creería que dos grupos distintos son el mismo.
        assert norm('LANZAROTE A, U.D. "A"') != norm('LANZAROTE B, U.D. "B"')

    def test_empty_input(self):
        from import_fiflp_gc import norm
        assert norm(None) == ""
        assert norm("") == ""


class TestBestMatch:
    def _existing(self):
        return {
            'GC7': (1, 1, {'HURACAN', 'VIERA', 'TAMARACEITE', 'MOYA'}, 78),
            'GC5': (2, 1, {'PILETAS', 'GOLETA', 'ARUCAS', 'TELDE'}, 132),
        }

    def test_identical_team_set_matches_fully(self):
        from import_fiflp_gc import best_match
        code, ratio = best_match({'HURACAN', 'VIERA', 'TAMARACEITE', 'MOYA'},
                                 self._existing())
        assert code == 'GC7'
        assert ratio == 1.0

    def test_picks_the_group_with_most_overlap(self):
        from import_fiflp_gc import best_match
        code, _ = best_match({'PILETAS', 'GOLETA', 'ARUCAS'}, self._existing())
        assert code == 'GC5'

    def test_unrelated_teams_give_no_match(self):
        from import_fiflp_gc import best_match
        code, ratio = best_match({'OTRO', 'DISTINTO'}, self._existing())
        assert code is None or ratio == 0.0

    def test_weak_overlap_stays_below_the_threshold(self):
        from import_fiflp_gc import best_match, MIN_OVERLAP
        # Media plantilla coincidente no basta: mejor no tocar que mezclar.
        _, ratio = best_match({'HURACAN', 'VIERA', 'X', 'Y'}, self._existing())
        assert ratio < MIN_OVERLAP

    def test_no_existing_groups(self):
        from import_fiflp_gc import best_match
        assert best_match({'A', 'B'}, {}) == (None, 0.0)


class TestCountPlayed:
    def test_counts_only_matches_with_a_score(self):
        from import_fiflp_gc import count_played
        g = {"jornadas": [
            {"num": "1", "matches": [{"hs": 1, "as": 0}, {"hs": None, "as": None}]},
            {"num": "2", "matches": [{"hs": 2, "as": 2}]},
        ]}
        assert count_played(g) == 2

    def test_empty_group(self):
        from import_fiflp_gc import count_played
        assert count_played({}) == 0
        assert count_played({"jornadas": []}) == 0


class TestScrapedTeams:
    def test_takes_teams_from_standings_and_matches(self):
        from import_fiflp_gc import scraped_teams, norm
        g = {"standings": [{"team": "UNION VIERA, C.F."}],
             "jornadas": [{"num": "1", "matches": [
                 {"home": "ATLETICO HURACAN, A.D.", "away": "UNION VIERA, C.F."}]}]}
        assert scraped_teams(g) == {norm('UNION VIERA'), norm('HURACAN')}
