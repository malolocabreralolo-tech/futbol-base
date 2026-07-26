"""TDD — protección de cambio de temporada en el scraper de la temporada actual.

EL PROBLEMA (encontrado el 25/07/2026, antes de que ocurra)

`fetch_futbolaspalmas.py` tiene la temporada hardcodeada ("2025-2026") y saca la
lista de grupos y sus URLs de los propios data-*.js, que salen de la DB: un
bucle cerrado que solo sabe refrescar los grupos que ya conoce. Las URLs de
futbolaspalmas.com son slugs sin temporada (`/benjamin-segunda-fase-uno/`) y se
REUTILIZAN: la misma dirección sirve siempre la temporada en curso.

Cuando arranque 2026-27 (sept/oct), el auto-update de cada 6h:
  1. pedirá las URLs de los grupos de la FASE FINAL de 2025-26,
  2. recibirá la página de la temporada nueva (vacía o de jornada 1),
  3. hará `DELETE FROM standings WHERE group_id=?` + INSERT,
     pisando la clasificación FINAL de una temporada terminada.

Nadie lo detectaría: los datos quedarían internamente coherentes, solo que mal.
Este proyecto nunca ha pasado un cambio de temporada con esta arquitectura (el
pipeline con DB se construyó en marzo de 2026, a mitad de temporada), así que
no hay precedente que lo cubra.

LA PROTECCIÓN

`standings_regression` decide si una clasificación recién scrapeada puede
sustituir a la almacenada. Mismo espíritu que el guard de no-regresión que ya
usan import_fiflp_2425 / import_wayback_2425 (`existing_played_count`): solo se
sobrescribe cuando lo nuevo no es una pérdida de información.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))


def _table(teams, played, points_step=3):
    """Clasificación sintética: [pos, equipo, pts, J, G, E, P, GF, GC, DF]."""
    return [[i + 1, t, played * points_step, played, played, 0, 0,
             played * 2, 0, played * 2] for i, t in enumerate(teams)]


TEAMS = ["Las Mesas", "Unión Viera", "AD Huracán", "UD Telde"]


class TestStandingsRegression:
    def test_new_season_empty_table_is_a_regression(self):
        from fetch_futbolaspalmas import standings_regression
        stored = _table(TEAMS, played=28)
        assert standings_regression(stored, []) is not None

    def test_matchday_one_cannot_replace_a_finished_season(self):
        from fetch_futbolaspalmas import standings_regression
        # El caso exacto de septiembre: 28 jornadas jugadas → 1.
        stored = _table(TEAMS, played=28)
        scraped = _table(TEAMS, played=1)
        reason = standings_regression(stored, scraped)
        assert reason is not None
        assert "jornada" in reason.lower() or "temporada" in reason.lower()

    def test_a_different_set_of_teams_is_a_regression(self):
        from fetch_futbolaspalmas import standings_regression
        # Reestructuración de grupos entre temporadas: mismo slug, otros equipos.
        stored = _table(TEAMS, played=28)
        scraped = _table(["Otro A", "Otro B", "Otro C", "Otro D"], played=20)
        assert standings_regression(stored, scraped) is not None

    def test_normal_matchday_progress_is_allowed(self):
        from fetch_futbolaspalmas import standings_regression
        stored = _table(TEAMS, played=12)
        scraped = _table(TEAMS, played=13)
        assert standings_regression(stored, scraped) is None

    def test_same_matchday_refresh_is_allowed(self):
        from fetch_futbolaspalmas import standings_regression
        # Corrección de un resultado dentro de la misma jornada.
        stored = _table(TEAMS, played=13)
        scraped = _table(TEAMS, played=13)
        assert standings_regression(stored, scraped) is None

    def test_first_load_of_an_empty_group_is_allowed(self):
        from fetch_futbolaspalmas import standings_regression
        assert standings_regression([], _table(TEAMS, played=1)) is None

    def test_start_of_a_season_progresses_normally(self):
        from fetch_futbolaspalmas import standings_regression
        # Jornada 1 → 2 al principio de temporada: nada que proteger.
        assert standings_regression(_table(TEAMS, played=1),
                                    _table(TEAMS, played=2)) is None

    def test_a_team_joining_late_does_not_block_the_update(self):
        from fetch_futbolaspalmas import standings_regression
        stored = _table(TEAMS, played=10)
        scraped = _table(TEAMS + ["Recién Inscrito"], played=11)
        assert standings_regression(stored, scraped) is None

    def test_a_withdrawn_team_does_not_block_the_update(self):
        from fetch_futbolaspalmas import standings_regression
        # Un equipo retirado (tipo CD Batán) desaparece de la tabla: sigue
        # habiendo solapamiento suficiente, no es un cambio de temporada.
        stored = _table(TEAMS, played=20)
        scraped = _table(TEAMS[:-1], played=21)
        assert standings_regression(stored, scraped) is None


class TestGuardIsWired:
    """El guard no sirve de nada si el DELETE no pasa por él."""

    def _source(self):
        return (ROOT / "scripts" / "fetch_futbolaspalmas.py").read_text(encoding="utf-8")

    def test_delete_of_standings_happens_only_after_the_check(self):
        src = self._source()
        idx_guard = src.index("regression = standings_regression(")
        idx_delete = src.index('DELETE FROM standings WHERE group_id=?',
                               src.index("def process_file"))
        assert idx_guard < idx_delete, \
            "el DELETE de standings tiene que ir DESPUÉS de comprobar la regresión"

    def test_the_whole_group_is_skipped_not_just_the_standings(self):
        # Los partidos se escriben ANTES que la clasificación y entran con
        # INSERT OR IGNORE: si el guard solo protegiese standings, una
        # temporada nueva colaría igualmente sus fixtures en los grupos
        # viejos y quedarían dos temporadas mezcladas en el mismo grupo.
        src = self._source()
        body = src[src.index("def process_file"):]
        idx_guard = body.index("regression = standings_regression(")
        idx_matches = body.index("jornada_name, matches = parse_matches(html)")
        assert idx_guard < idx_matches, \
            "la comprobación debe ir antes de procesar los partidos"
        # y el rechazo tiene que saltar el grupo entero
        rechazo = body[idx_guard:idx_matches]
        assert "continue" in rechazo, \
            "un grupo rechazado debe saltarse por completo (continue)"

    def test_a_full_rejection_fails_the_run(self):
        # update.yml solo publica si el job va verde: un cambio de temporada
        # tiene que salir rojo, no pasar como un run normal sin cambios.
        src = self._source()
        assert "CAMBIO DE TEMPORADA DETECTADO" in src
        assert "SystemExit" in src

    def test_the_playbook_it_points_to_exists(self):
        assert (ROOT / "docs" / "temporada-nueva.md").exists(), \
            "el mensaje remite a docs/temporada-nueva.md"


class TestShortGroupsAreProtectedToo:
    """Los umbrales fijos dejaban sin proteger a los grupos cortos: cuatro
    grupos reales de 2025-26 terminan con J4, por debajo de
    _ROLLOVER_MIN_PLAYED=5, así que ninguna caída de jornada los rechazaba."""

    def _tabla(self, jugados, equipos=("A", "B", "C", "D")):
        return [[i + 1, e, jugados * 3, jugados, jugados, 0, 0, 10, 2, 8]
                for i, e in enumerate(equipos)]

    def test_a_four_matchday_group_cannot_go_back_to_one(self):
        from fetch_futbolaspalmas import standings_regression
        motivo = standings_regression(self._tabla(4), self._tabla(1))
        assert motivo and "retrocede" in motivo

    def test_normal_progress_still_passes(self):
        from fetch_futbolaspalmas import standings_regression
        assert standings_regression(self._tabla(4), self._tabla(5)) is None

    def test_the_same_matchday_still_passes(self):
        # Corrección de una tabla ya publicada: mismo J, no es regresión.
        from fetch_futbolaspalmas import standings_regression
        assert standings_regression(self._tabla(4), self._tabla(4)) is None

    def test_a_new_group_still_passes(self):
        from fetch_futbolaspalmas import standings_regression
        assert standings_regression([], self._tabla(1)) is None


class TestFailedStandingsDownloadSkipsTheGroup:
    """Si mostrar_clasi.php falla no se puede comprobar nada, así que el grupo
    entero se salta. Antes el guard ni se llamaba y los partidos entraban a
    ciegas: un 500 transitorio en septiembre metía la temporada nueva en los
    grupos de la vieja sin poner el run rojo."""

    def test_the_call_site_passes_an_empty_table_when_the_download_failed(self):
        import re
        src = (ROOT / "scripts" / "fetch_futbolaspalmas.py").read_text(encoding="utf-8")
        assert re.search(r"standings_regression\(\s*stored_standings\(conn, group_id\),\s*"
                         r"standings if clasi_html else \[\]\)", src), \
            "el fallo de descarga debe llegar al guard como tabla vacía"

    def test_an_empty_table_is_rejected(self):
        from fetch_futbolaspalmas import standings_regression
        stored = [[1, "A", 30, 10, 10, 0, 0, 30, 5, 25]]
        assert standings_regression(stored, []) is not None
