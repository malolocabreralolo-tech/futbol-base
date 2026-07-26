"""TDD — emparejador de grupos de Gran Canaria (import_fiflp_gc.py).

Los grupos de GC de temporadas antiguas YA existen en la base (vienen de
Wayback: GC1..GC12, PGC1..PGC4). Importar lo que FIFLP conserva SIN emparejar
duplicaría la liga entera bajo códigos nuevos, así que cada grupo scrapeado se
empareja con el existente por SOLAPAMIENTO DE PLANTILLA — los números de grupo
de FIFLP no tienen por qué coincidir con los de Wayback — y solo se escribe si
trae estrictamente más partidos jugados.

La reconciliación de nombres en sí vive en test_fiflp_names.py.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

# Plantillas reales de 2021-22: FIFLP 893 GRUPO 1 y el GC1 de la base.
FIFLP_GC1 = ['ARUCAS C.F. "B" "B"', 'BARRIAL', 'BECERRIL', 'CARDONES', 'FIRGAS',
             'GOLETA', 'GUAYARMINA', 'GUIA', 'MOYA', 'PAN.ERIA PULIDO SAN MATEO',
             'ROQUE AMAGRO DE GALDAR "A" "A"', 'SAN NICOLAS', 'SAN PEDRO ATALAYA',
             'TEROR BALOMPIE', 'UNION MORAL DE GALDAR', 'VALLESECO']
BASE_GC1 = ['Arucas B', 'Atalaya', 'Barrial', 'Becerril', 'Cardones', 'Firgas',
            'Goleta', 'Guayarmina', 'Guía', 'Moya', 'Roque Amagro', 'San Mateo',
            'San Nicolás', 'Teror', 'Unión Moral', 'Valleseco']
BASE_LZ = ['Lanzarote', 'Puerto del Carmen', 'Tinajo', 'Haría', 'Teguise']


def _existing(**kw):
    base = {'GC1': {'id': 1, 'cat': 1, 'teams': BASE_GC1, 'played': 240},
            'LZP1': {'id': 2, 'cat': 1, 'teams': BASE_LZ, 'played': 90}}
    base.update(kw)
    return base


class TestBestMatch:
    def test_finds_the_same_group_despite_different_naming(self):
        from import_fiflp_gc import best_match, MIN_OVERLAP
        code, ratio = best_match(FIFLP_GC1, _existing())
        assert code == 'GC1'
        assert ratio >= MIN_OVERLAP

    def test_unrelated_squad_stays_below_the_threshold(self):
        from import_fiflp_gc import best_match, MIN_OVERLAP
        _, ratio = best_match(['Otro', 'Distinto', 'Equipo'], _existing())
        assert ratio < MIN_OVERLAP

    def test_no_existing_groups(self):
        from import_fiflp_gc import best_match
        assert best_match(FIFLP_GC1, {}) == (None, 0.0)

    def test_picks_the_best_of_two_similar_groups(self):
        from import_fiflp_gc import best_match
        # Un grupo con media plantilla compartida no puede ganarle al completo.
        parcial = dict(teams=BASE_GC1[:8] + BASE_LZ, id=3, cat=1, played=0)
        code, _ = best_match(FIFLP_GC1, _existing(GC9=parcial))
        assert code == 'GC1'


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
        from import_fiflp_gc import scraped_teams
        g = {"standings": [{"team": "VALLESECO"}],
             "jornadas": [{"num": "1", "matches": [
                 {"home": "FIRGAS", "away": "VALLESECO"}]}]}
        assert scraped_teams(g) == {'VALLESECO', 'FIRGAS'}

    def test_ignores_empty_names(self):
        from import_fiflp_gc import scraped_teams
        g = {"standings": [{"team": ""}, {"team": None}]}
        assert scraped_teams(g) == set()


class TestCanonicalNames:
    def test_keeps_the_name_the_database_already_uses(self):
        from import_fiflp_gc import canonical_names
        canon = canonical_names(FIFLP_GC1, BASE_GC1, BASE_GC1)
        # Lo que se escribiría es el nombre del portal, no el de FIFLP.
        assert canon['PAN.ERIA PULIDO SAN MATEO'] == 'San Mateo'
        assert canon['TEROR BALOMPIE'] == 'Teror'
        assert canon['SAN PEDRO ATALAYA'] == 'Atalaya'
        assert canon['GUIA'] == 'Guía'

    def test_every_scraped_team_maps_to_exactly_one_name(self):
        from import_fiflp_gc import canonical_names
        canon = canonical_names(FIFLP_GC1, BASE_GC1, BASE_GC1)
        assert set(canon) == set(FIFLP_GC1)
        assert len(set(canon.values())) == len(FIFLP_GC1)  # sin colisiones

    def test_falls_back_to_the_rest_of_the_season(self):
        from import_fiflp_gc import canonical_names
        # 'MOYA' no está en el grupo emparejado pero sí en otro de la temporada:
        # hay que reutilizar el equipo existente, no crear uno nuevo.
        canon = canonical_names(['MOYA'], ['Firgas'], ['Firgas', 'Moya'])
        assert canon['MOYA'] == 'Moya'

    def test_a_genuinely_new_team_keeps_its_scraped_name(self):
        from import_fiflp_gc import canonical_names
        canon = canonical_names(['EQUIPO INEDITO'], BASE_GC1, BASE_GC1)
        assert canon['EQUIPO INEDITO'] == 'EQUIPO INEDITO'


class TestWithdrawnTeams:
    """Un equipo retirado no aparece en la clasificación oficial y sus partidos
    los resuelve la federación por incomparecencia. Caso real: Las Majoreras B
    en el grupo 5 de Primera GC 2021-22 — 24 partidos 1-0/0-1 sin fecha, con la
    tabla dando J22 a todos los demás y J0 a él."""

    GRUPO = {
        "standings": [{"team": 'FIRGAS'}, {"team": 'MOYA'}],
        "jornadas": [{"num": "1", "matches": [
            {"home": 'FIRGAS', "away": 'MOYA', "hs": 2, "as": 1, "date": "10-10-2021"},
            {"home": 'MOYA', "away": 'MAJORERAS-GUAYADEQUE "B"', "hs": 1, "as": 0, "date": ""},
        ]}],
    }

    def test_detects_the_team_missing_from_the_table(self):
        from import_fiflp_gc import withdrawn_teams
        assert withdrawn_teams(self.GRUPO) == {'MAJORERAS-GUAYADEQUE "B"'}

    def test_walkovers_do_not_count_as_played(self):
        from import_fiflp_gc import count_played
        assert count_played(self.GRUPO) == 1     # solo Firgas-Moya

    def test_without_an_official_table_nothing_is_assumed(self):
        from import_fiflp_gc import withdrawn_teams, count_played
        sin_tabla = {"jornadas": self.GRUPO["jornadas"]}
        assert withdrawn_teams(sin_tabla) == set()
        assert count_played(sin_tabla) == 2

    def test_naming_differences_are_not_mistaken_for_a_withdrawal(self):
        from import_fiflp_gc import withdrawn_teams
        g = {"standings": [{"team": 'U.D.Vecindario B'}, {"team": 'Maspalomas B'}],
             "jornadas": [{"num": "1", "matches": [
                 {"home": 'PASEO COMERCIAL DE VECINDARIO B, C.D. "B"',
                  "away": 'MASPALOMASB, CD "B"', "hs": 1, "as": 1}]}]}
        assert withdrawn_teams(g) == set()


class TestPhaseCrossoverGuard:
    """Las fases de una temporada se forman con los equipos de la anterior, así
    que un grupo de Segunda Fase solapa ~60% de plantilla con uno de Primera.
    Caso real (2023-24): el grupo 9 de la Segunda Fase iba a pisar GC9 de la
    Primera. Lo que los distingue es el CALENDARIO, no la plantilla."""

    EQUIPOS = ['Firgas', 'Moya', 'Teror', 'Arucas']

    def _existing(self, pares):
        return {'GC9': {'id': 1, 'cat': 1, 'teams': self.EQUIPOS, 'played': 6,
                        'pairs': pares}}

    def test_a_group_with_a_different_calendar_is_not_a_fill(self):
        from import_fiflp_gc import best_match
        base = {frozenset(('Firgas', 'Moya')), frozenset(('Teror', 'Arucas'))}
        # Mismos equipos, emparejamientos distintos: es otra fase.
        otros = {frozenset(('Firgas', 'Teror')), frozenset(('Moya', 'Arucas'))}
        code, _ = best_match(self.EQUIPOS, self._existing(base), otros)
        assert code is None

    def test_the_same_group_with_more_matches_is_a_fill(self):
        from import_fiflp_gc import best_match
        base = {frozenset(('Firgas', 'Moya')), frozenset(('Teror', 'Arucas'))}
        mas = base | {frozenset(('Firgas', 'Teror')), frozenset(('Moya', 'Arucas'))}
        code, _ = best_match(self.EQUIPOS, self._existing(base), mas)
        assert code == 'GC9'

    def test_a_group_without_a_calendar_falls_back_to_the_squad(self):
        from import_fiflp_gc import best_match
        # A4/B4 recién dados de alta: sin partidos, la plantilla es lo único.
        code, _ = best_match(self.EQUIPOS, self._existing(set()),
                             {frozenset(('Firgas', 'Moya'))})
        assert code == 'GC9'

    def test_names_are_reconciled_before_comparing_the_calendar(self):
        from import_fiflp_gc import best_match
        base = {frozenset(('Firgas', 'Moya')), frozenset(('Teror', 'Arucas'))}
        # El scrape los escribe a la manera de FIFLP.
        fiflp = {frozenset(('FIRGAS, C.D.', 'MOYA, U.D.')),
                 frozenset(('TEROR BALOMPIE', 'ARUCAS C.F.'))}
        code, _ = best_match(['FIRGAS, C.D.', 'MOYA, U.D.', 'TEROR BALOMPIE',
                              'ARUCAS C.F.'], self._existing(base), fiflp)
        assert code == 'GC9'
