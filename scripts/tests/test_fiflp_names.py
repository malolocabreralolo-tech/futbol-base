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

    def test_a_name_that_is_only_a_club_type_matches_nobody(self):
        # 'C.D.' no identifica a nadie: lo que no puede es colapsar con todos.
        assert team_score(team_key('C.D.'), team_key('Firgas')) == 0.0
        assert team_score(team_key('C.D.'), team_key('C.F.')) == 0.0

    def test_the_club_abbreviation_is_not_a_filial_letter(self):
        # 'U.D.' dejaba una 'D' suelta que pasaba por letra de filial.
        assert team_key('SAN PEDRO ATALAYA, U.D.')[1] == ''
        assert team_key('MOGAN, C.F.')[1] == ''
        assert team_key('ARUCAS C.F. "B"')[1] == 'B'


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


class TestCanonicalNames:
    POOL = ['Tablero', 'Tablero B', 'Mogán', 'Arinaga', 'Estrella B']

    def test_maps_the_fiflp_spelling_to_the_database_one(self):
        from fiflp_names import canonical_names
        canon = canonical_names(['TABLERO, C.D. "A"', 'MOGAN, C.F.'], [], self.POOL)
        assert canon['TABLERO, C.D. "A"'] == 'Tablero'
        assert canon['MOGAN, C.F.'] == 'Mogán'

    def test_a_previous_unreconciled_import_does_not_block_the_good_name(self):
        from fiflp_names import canonical_names
        # 'TABLERO, C.D. "A"' ya está en la base porque otro import lo metió sin
        # reconciliar: emparejado consigo mismo, ganaría por puntuación.
        sucio = self.POOL + ['TABLERO, C.D. "A"']
        canon = canonical_names(['TABLERO, C.D. "A"'], [], sucio)
        assert canon['TABLERO, C.D. "A"'] == 'Tablero'

    def test_the_filial_letter_is_respected(self):
        from fiflp_names import canonical_names
        canon = canonical_names(['TABLERO B, C.D. "B"'], [], self.POOL)
        assert canon['TABLERO B, C.D. "B"'] == 'Tablero B'

    def test_a_team_the_season_does_not_have_keeps_its_name(self):
        from fiflp_names import canonical_names
        canon = canonical_names(['CASA PASTORES, C.F.'], [], self.POOL)
        assert canon['CASA PASTORES, C.F.'] == 'CASA PASTORES, C.F.'

    def test_the_group_squad_wins_over_the_season_pool(self):
        from fiflp_names import canonical_names
        canon = canonical_names(['MOGAN, C.F.'], ['CF Mogán'], self.POOL)
        assert canon['MOGAN, C.F.'] == 'CF Mogán'


class TestCanonicalNamesVariants:
    """FIFLP escribe el mismo equipo distinto en la tabla y en el calendario.
    Sin agrupar las variantes, el emparejamiento uno-a-uno le da el nombre de la
    base a una sola y la otra entra como un equipo nuevo."""

    def test_both_spellings_get_the_same_name(self):
        from fiflp_names import canonical_names
        canon = canonical_names(['INGENIO B, C.D. "B"', 'INGENIO "B", C.D. "B"'],
                                [], ['Ingenio B'])
        assert canon['INGENIO B, C.D. "B"'] == 'Ingenio B'
        assert canon['INGENIO "B", C.D. "B"'] == 'Ingenio B'

    def test_variants_of_an_unknown_team_still_collapse(self):
        from fiflp_names import canonical_names
        canon = canonical_names(['PASTORES, C.F.', 'PASTORES C.F.'], [], ['Otro'])
        assert len(set(canon.values())) == 1  # un solo equipo, no dos

    def test_different_teams_are_not_merged(self):
        from fiflp_names import canonical_names
        canon = canonical_names(['ARUCAS C.F. "A"', 'ARUCAS C.F. "B"'],
                                [], ['Arucas A', 'Arucas B'])
        assert canon['ARUCAS C.F. "A"'] == 'Arucas A'
        assert canon['ARUCAS C.F. "B"'] == 'Arucas B'


class TestDoNotMergeDifferentClubs:
    """Compartir una palabra no basta. Caso real (Segunda Fase GC 2023-24):
    'MESAS HURACAN, U.D. LAS "A"' es Las Mesas Huracán y se estaba fundiendo con
    'Atco. Huracán', que es otro club."""

    POOL = ['Las Mesas Hu.', 'Atco. Huracán', 'At. Huracán B', 'Las Huesas']

    def test_the_right_club_wins(self):
        from fiflp_names import canonical_names
        canon = canonical_names(['MESAS HURACAN, U.D. LAS "A"'], [], self.POOL)
        assert canon['MESAS HURACAN, U.D. LAS "A"'] == 'Las Mesas Hu.'

    def test_the_two_huracan_stay_apart(self):
        from fiflp_names import canonical_names
        canon = canonical_names(['MESAS HURACAN, U.D. LAS "A"',
                                 'ATLETICO HURACAN, A.D.'], [], self.POOL)
        assert canon['MESAS HURACAN, U.D. LAS "A"'] == 'Las Mesas Hu.'
        assert canon['ATLETICO HURACAN, A.D.'] == 'Atco. Huracán'

    def test_a_real_short_form_still_matches(self):
        # La regla no puede cargarse los casos legítimos de nombre corto.
        from fiflp_names import team_key, team_score, MIN_TEAM_SCORE
        for largo, corto in [('SAN PEDRO ATALAYA, U.D.', 'Atalaya'),
                             ('PAN.ERIA PULIDO SAN MATEO, C.D.', 'San Mateo'),
                             ('ROQUE AMAGRO DE GALDAR "A"', 'Roque Amagro'),
                             ('TEROR BALOMPIE', 'Teror')]:
            assert team_score(team_key(largo), team_key(corto)) >= MIN_TEAM_SCORE, largo


class TestBye:
    def test_recognises_the_rest_marker(self):
        from fiflp_names import is_bye
        assert is_bye('Descansa') and is_bye('DESCANSO') and is_bye('descansa')

    def test_a_real_team_is_not_a_bye(self):
        from fiflp_names import is_bye
        assert not is_bye('Firgas')
        assert not is_bye('')


class TestForcedLastPairing:
    """Con el grupo ya identificado, el equipo que sobra a cada lado es el
    mismo club escrito raro. Caso real: 'CERRUDA SANTA LUCIA DE TIRAJANA, C.D.
    "A"' por 'CD Cerruda' en el grupo 4 de la Segunda Fase B de 2025-26."""

    BASE = ['Firgas', 'Moya', 'Teror', 'Valleseco', 'CD Cerruda']
    FIFLP = ['FIRGAS', 'MOYA', 'TEROR', 'VALLESECO',
             'CERRUDA SANTA LUCIA DE TIRAJANA, C.D. "A"']

    def test_the_leftover_pairs_up(self):
        from fiflp_names import canonical_names
        canon = canonical_names(self.FIFLP, self.BASE, [])
        assert canon['CERRUDA SANTA LUCIA DE TIRAJANA, C.D. "A"'] == 'CD Cerruda'

    def test_two_leftovers_are_not_guessed(self):
        from fiflp_names import canonical_names
        canon = canonical_names(self.FIFLP[:4] + ['UNO RARO', 'OTRO RARO'],
                                self.BASE + ['Otro Equipo'], [])
        assert canon['UNO RARO'] == 'UNO RARO'
        assert canon['OTRO RARO'] == 'OTRO RARO'

    def test_a_barely_matched_group_forces_nothing(self):
        from fiflp_names import canonical_names
        # Con una sola pareja hecha, "el que sobra" sería una apuesta.
        canon = canonical_names(['MOYA'], ['Firgas'], ['Firgas', 'Moya'])
        assert canon['MOYA'] == 'Moya'

    def test_nothing_is_forced_without_a_group_squad(self):
        from fiflp_names import canonical_names
        canon = canonical_names(['UNO RARO'], [], ['Firgas'])
        assert canon['UNO RARO'] == 'UNO RARO'


class TestModernFedName:
    """Los formatos de la federación de 2017-2021 (temporadas archivadas), con la forma de los de
    2021 en adelante: modern_fed_name, con el vocabulario de fed_words. Casos reales de los raws de
    goleadores de 2017-18 a 2020-21."""

    WORDS = frozenset({'GUIA', 'TELDE', 'AMAGRO', 'BALOS', 'ESTRELLA', 'MARITIMA', 'MASPALOMAS', 'HOMBRE',
                       'TINAJO', 'PILA'})

    def modern(self, name):
        from fiflp_names import modern_fed_name
        return modern_fed_name(name, self.WORDS)

    def test_the_extra_b_of_the_filial_letter(self):
        # '"DB"' es el filial D: sin quitar la B, 'ARUCAS D CF "DB"' casaba con Arucas.
        assert self.modern('ARUCAS D CF "DB"') == 'ARUCAS CF "D"'
        assert self.modern('VETERANOS DEL PILA D, C.D. "DB"') == 'VETERANOS DEL PILA, C.D. "D"'
        assert self.modern('ARUCAS C.F. D DB') == 'ARUCAS C.F. "D"'          # la página de goleadores
        # Las cabeceras de las actas de 2020-21: la letra entre comillas delante y la «DB» al final.
        assert self.modern('ARUCAS C.F. "D" DB') == 'ARUCAS C.F. "D"'
        assert self.modern('CORAZON DE MARIA "D", C.D. DB') == 'CORAZON DE MARIA, C.D. "D"'

    def test_a_loose_letter_repeating_the_quoted_one_goes(self):
        assert self.modern('ARUCAS B, C.F. "B"') == 'ARUCAS, C.F. "B"'
        assert self.modern('ARUCAS A C.F. "A"') == 'ARUCAS C.F. "A"'
        assert self.modern('ACODETTI C.F. C "C"') == 'ACODETTI C.F. "C"'
        assert self.modern('CASA PASTORES, A C.F. "A"') == 'CASA PASTORES, C.F. "A"'
        # La de una abreviatura con punto no es una letra suelta.
        assert self.modern('PALMEIROS DE COSTA T. A, U.D. "A"') == 'PALMEIROS DE COSTA T., U.D. "A"'

    def test_a_loose_letter_without_quotes_gets_them(self):
        assert self.modern('INGENIO B') == 'INGENIO "B"'
        assert self.modern('TEROR BALOMPIE A, U.D.') == 'TEROR BALOMPIE, U.D. "A"'
        assert self.modern('ACODETTI A, C.F. A') == 'ACODETTI, C.F. "A"'

    def test_a_glued_letter_is_split_off(self):
        assert self.modern('GUIAA, U.D. "A"') == 'GUIA, U.D. "A"'
        assert self.modern('TELDEA, U.D. "A"') == 'TELDE, U.D. "A"'
        assert self.modern('ROQUE AMAGROA, C.D. "A"') == 'ROQUE AMAGRO, C.D. "A"'
        assert self.modern('BALOSB, U.D. "B"') == 'BALOS, U.D. "B"'
        assert self.modern('ESTRELLAA, C.F. "A"') == 'ESTRELLA, C.F. "A"'
        assert self.modern('ESTRELLAB C.F. B') == 'ESTRELLA C.F. "B"'
        assert self.modern('ORIENTACION MARITIMAC, C.D. "C"') == 'ORIENTACION MARITIMA, C.D. "C"'
        assert self.modern('VETERANOS DEL PILA.A, C.D. "A"') == 'VETERANOS DEL PILA, C.D. "A"'
        assert self.modern('VETERANOS DEL PILA."A", C.D. A') == 'VETERANOS DEL PILA, C.D. "A"'
        # Sin la raíz en el vocabulario, no se toca: 'MOYA' no es 'MOY' más una A.
        assert self.modern('MOYA, U.D.') == 'MOYA, U.D.'
        from fiflp_names import modern_fed_name
        assert modern_fed_name('GUIAA, U.D. "A"') == 'GUIAA, U.D. "A"'

    def test_abbreviations_glued_to_the_comma(self):
        assert self.modern('CARRIZAL,CFU') == 'CARRIZAL, C.F.U.'
        assert self.modern('VICTORIA,RC') == 'VICTORIA, R.C.'
        assert self.modern('JOVERO LAS ROSAS, C,F,') == 'JOVERO LAS ROSAS, C.F.'
        assert self.modern('MASPALOMAS,A C.D. "A"') == 'MASPALOMAS, C.D. "A"'
        assert self.modern('ATLETICO G.C.A, C.F. "A"') == 'ATLETICO G.C., C.F. "A"'

    def test_eaten_abbreviations(self):
        assert self.modern('PUERTOS DE L.P. A, C.E.F. "A"') == 'PUERTOS DE LAS PALMAS, C.E.F. "A"'
        assert self.modern('PUERTOS DE L.P.A, C.E.F. "A"') == 'PUERTOS DE LAS PALMAS, C.E.F. "A"'

    def test_idempotent(self):
        names = ['ARUCAS D CF "DB"', 'ARUCAS B, C.F. "B"', 'INGENIO B', 'TEROR BALOMPIE A, U.D.', 'GUIAA, U.D. "A"',
                 'ESTRELLAB C.F. B', 'VETERANOS DEL PILA.A, C.D. "A"', 'CARRIZAL,CFU', 'VICTORIA,RC',
                 'JOVERO LAS ROSAS, C,F,', '35600,A C.D. A', 'PUERTOS DE L.P.A, C.E.F. "A"', 'TINAJOB, U.D. B',
                 'CORAZON DE MARIA D, C.D. DB', 'PALMAS, U.D. LAS', 'C.D ARINAGA B "B"', 'ARUCAS C.F. "D" DB',
                 'CORAZON DE MARIA "D", C.D. DB', 'VETERANOS DEL PILA."A", C.D. A']
        for name in names:
            once = self.modern(name)
            assert self.modern(once) == once, name

    def test_the_vocabulary_drops_the_glued_forms(self):
        from fiflp_names import fed_words
        words = fed_words(['GUIAA, U.D. "A"', 'GUIA B, U.D. "B"', 'TINAJOB, U.D. "B"'], ['CD Tinajo'])
        assert 'GUIA' in words and 'TINAJO' in words
        assert 'GUIAA' not in words and 'TINAJOB' not in words
