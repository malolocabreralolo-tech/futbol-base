"""TDD — reconciliación de nombres FIFLP <-> base (scripts/fiflp_names.py).

Los casos de este fichero son REALES: salen de comparar el grupo GC1 de
2021-22 (Wayback, en la base) con lo que FIFLP devuelve para la misma liga.
Comparando cadenas normalizadas daban 56% de solape — por debajo del umbral de
emparejamiento — siendo exactamente el mismo grupo.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from fiflp_names import (fold, team_key, team_score, match_teams,  # noqa: E402
                         group_overlap, MIN_TEAM_SCORE)


class TestFold:
    def test_strips_accents_and_case(self):
        assert fold('Guía') == fold('GUIA') == 'GUIA'
        assert fold('San Nicolás') == fold('SAN NICOLAS')

    def test_strips_punctuation(self):
        assert fold('PAN.ERIA PULIDO, C.D.') == 'PAN ERIA PULIDO C D'

    def test_enye(self):
        assert fold('Peña Roja') == 'PENA ROJA'

    def test_empty(self):
        assert fold(None) == '' and fold('') == ''


class TestTeamKey:
    def test_drops_club_type_words(self):
        assert team_key('UNION VIERA, C.F.')[0] == team_key('Unión Viera')[0]
        assert team_key('ATLETICO HURACAN, A.D.')[0] == team_key('Huracán')[0]

    def test_extracts_the_filial_letter(self):
        core, fil = team_key('ROQUE AMAGRO DE GALDAR "A"')
        assert fil == 'A'
        assert 'ROQUE' in core and 'AMAGRO' in core

    def test_collapses_the_duplicated_letter_artifact(self):
        # 'ARUCAS C.F. "B" "B"' es el artefacto conocido del scraper.
        assert team_key('ARUCAS C.F. "B" "B"') == team_key('Arucas B')

    def test_name_made_only_of_noise_keeps_its_tokens(self):
        core, _ = team_key('C.D.')
        assert core  # no puede quedar vacío: colapsaría con cualquier otro


class TestTeamScore:
    def test_short_name_is_subset_of_the_long_one(self):
        for largo, corto in [('PAN.ERIA PULIDO SAN MATEO, C.D.', 'San Mateo'),
                             ('SAN PEDRO ATALAYA, U.D.', 'Atalaya'),
                             ('TEROR BALOMPIE', 'Teror'),
                             ('UNION MORAL DE GALDAR', 'Unión Moral')]:
            assert team_score(team_key(largo), team_key(corto)) >= MIN_TEAM_SCORE, largo

    def test_sharing_one_common_word_is_not_enough(self):
        # El falso positivo que hay que evitar: dos 'SAN ...' distintos.
        assert team_score(team_key('SAN NICOLAS'), team_key('SAN MATEO')) < MIN_TEAM_SCORE
        assert team_score(team_key('UNION VIERA'), team_key('UNION MORAL')) < MIN_TEAM_SCORE

    def test_different_filial_letters_never_match(self):
        assert team_score(team_key('Arucas A'), team_key('Arucas B')) == 0.0

    def test_filial_only_on_one_side_still_matches_but_lower(self):
        con_letra = team_score(team_key('Roque Amagro A'), team_key('Roque Amagro'))
        exacto = team_score(team_key('Roque Amagro A'), team_key('Roque Amagro A'))
        assert MIN_TEAM_SCORE <= con_letra < exacto == 1.0

    def test_unrelated_teams_score_zero(self):
        assert team_score(team_key('Firgas'), team_key('Becerril')) == 0.0


class TestMatchTeams:
    def test_the_exact_pair_wins_over_the_penalised_one(self):
        # Si el grupo tiene 'Arucas' y 'Arucas B', cada uno debe ir al suyo.
        m = match_teams(['ARUCAS C.F.', 'ARUCAS C.F. "B"'], ['Arucas', 'Arucas B'])
        assert m == {'ARUCAS C.F.': 'Arucas', 'ARUCAS C.F. "B"': 'Arucas B'}

    def test_each_existing_team_is_used_once(self):
        m = match_teams(['SAN MATEO', 'PAN.ERIA PULIDO SAN MATEO'], ['San Mateo'])
        assert len(m) == 1

    def test_unmatched_names_are_absent(self):
        m = match_teams(['EQUIPO NUEVO'], ['Firgas'])
        assert m == {}


class TestGroupOverlap:
    # Plantillas reales: FIFLP 893 GRUPO 1 vs GC1 de la base (2021-22).
    FIFLP = ['ARUCAS C.F. "B" "B"', 'BARRIAL', 'BECERRIL', 'CARDONES', 'FIRGAS',
             'GOLETA', 'GUAYARMINA', 'GUIA', 'MOYA', 'PAN.ERIA PULIDO SAN MATEO',
             'ROQUE AMAGRO DE GALDAR "A" "A"', 'SAN NICOLAS',
             'SAN PEDRO ATALAYA', 'TEROR BALOMPIE', 'UNION MORAL DE GALDAR',
             'VALLESECO']
    BASE = ['Arucas B', 'Atalaya', 'Barrial', 'Becerril', 'Cardones', 'Firgas',
            'Goleta', 'Guayarmina', 'Guía', 'Moya', 'Roque Amagro', 'San Mateo',
            'San Nicolás', 'Teror', 'Unión Moral', 'Valleseco']

    def test_the_same_group_overlaps_almost_completely(self):
        assert group_overlap(self.FIFLP, self.BASE) >= 0.9

    def test_two_different_groups_do_not_overlap(self):
        otro = ['Lanzarote', 'Puerto del Carmen', 'Tinajo', 'Haría', 'Teguise']
        assert group_overlap(self.FIFLP, otro) < 0.3

    def test_empty_side(self):
        assert group_overlap([], self.BASE) == 0.0
        assert group_overlap(self.FIFLP, []) == 0.0


class TestRealWorldMisses:
    """Casos que fallaban con la primera versión (grupo GC5 de 2021-22)."""

    def test_club_abbreviation_letters_are_not_distinctive(self):
        # 'U.D.Vecindario B' vs 'PASEO COMERCIAL DE VECINDARIO B, C.D. "B"'
        assert team_score(team_key('U.D.Vecindario B'),
                          team_key('PASEO COMERCIAL DE VECINDARIO B, C.D. "B"')) >= MIN_TEAM_SCORE

    def test_glued_name_from_the_scraper(self):
        # 'MASPALOMASB, CD "B"' es 'Maspalomas B' sin el espacio.
        assert team_score(team_key('MASPALOMASB, CD "B"'),
                          team_key('Maspalomas B')) >= MIN_TEAM_SCORE

    def test_abbreviated_name(self):
        # 'Corazón Mª D' en la base, nombre largo en FIFLP.
        assert team_score(team_key('Corazón Mª D'),
                          team_key('CORAZON DE MARIA D, C.D. "DB"')) >= MIN_TEAM_SCORE

    def test_prefix_rule_needs_a_long_token(self):
        # 'SAN' es prefijo de 'SANTA' pero son clubes distintos.
        assert team_score(team_key('San Isidro'), team_key('Santa Brígida')) == 0.0
