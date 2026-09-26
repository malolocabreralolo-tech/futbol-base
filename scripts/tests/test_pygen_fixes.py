#!/usr/bin/env python3
"""
Regression tests for the 2026-06-11 generate_js.py fixes:

  1. TEAMS_<S> mapping uses a letter-preserving normalizer (contrato C1):
     'UD Atalaya' -> 'atalaya', 'UD Atalaya B' -> 'atalaya b' (no colisiones).
  2. generate_lineups_js pairs substitutions correctly: one event per change
     with n = saliente y n2 = entrante (mutual pair_id, no self-lookup).
  3. Out-of-range scores (<0 or >50) are emitted as null + stderr warning.
  4. Stale stored standings in the CURRENT season are recomputed from matches
     (3/1/0; pts desc, DF desc, GF desc, name asc); synced ones are kept
     (official tables may carry sanctions); copas/knockouts never recomputed.
  5. C4: ?v= / footer date / CACHE_NAME only bump if some data-*.js content
     changed in this run; C3: sw.js CACHE_NAME literal stays regex-matchable.

Run: python3 -m pytest scripts/tests/test_pygen_fixes.py -v
"""

import json
import os
import re
import sqlite3
import sys
from datetime import date

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(ROOT, "futbolbase.db")


# ─── synthetic-DB helpers ────────────────────────────────────────────────────

_SCHEMA = """
CREATE TABLE seasons (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE,
    start_year INTEGER NOT NULL, end_year INTEGER NOT NULL,
    is_current INTEGER NOT NULL DEFAULT 0);
CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE groups (
    id INTEGER PRIMARY KEY, season_id INTEGER NOT NULL, category_id INTEGER NOT NULL,
    code TEXT NOT NULL, name TEXT, full_name TEXT, phase TEXT, island TEXT,
    url TEXT, current_jornada TEXT);
CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, shield_filename TEXT);
CREATE TABLE matches (
    id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL, jornada TEXT, date TEXT,
    time TEXT, home_team_id INTEGER NOT NULL, away_team_id INTEGER NOT NULL,
    home_score INTEGER, away_score INTEGER, venue TEXT, cod_acta INTEGER);
CREATE TABLE standings (
    id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL, team_id INTEGER NOT NULL,
    position INTEGER, points INTEGER, played INTEGER, won INTEGER, drawn INTEGER,
    lost INTEGER, gf INTEGER, gc INTEGER, gd INTEGER);
CREATE TABLE players (id INTEGER PRIMARY KEY, full_name TEXT NOT NULL, norm_name TEXT NOT NULL UNIQUE);
CREATE TABLE appearances (
    id INTEGER PRIMARY KEY, match_id INTEGER NOT NULL, team_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL, dorsal INTEGER, role TEXT NOT NULL,
    goals INTEGER NOT NULL DEFAULT 0, yellow INTEGER NOT NULL DEFAULT 0,
    red INTEGER NOT NULL DEFAULT 0);
CREATE TABLE match_events (
    id INTEGER PRIMARY KEY, match_id INTEGER NOT NULL, team_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL, kind TEXT NOT NULL, minute INTEGER,
    goal_type TEXT, pair_id INTEGER);
CREATE TABLE match_staff (
    id INTEGER PRIMARY KEY, match_id INTEGER NOT NULL, team_id INTEGER,
    kind TEXT NOT NULL, name TEXT NOT NULL);
CREATE TABLE scorers (
    id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL, player_name TEXT NOT NULL,
    team_id INTEGER NOT NULL, goals INTEGER, games INTEGER);
CREATE TABLE goals (
    id INTEGER PRIMARY KEY, match_id INTEGER NOT NULL, minute INTEGER,
    player_name TEXT, running_score TEXT, side TEXT, type TEXT);
"""


def _synth_conn():
    conn = sqlite3.connect(":memory:")
    conn.executescript(_SCHEMA)
    conn.executescript("""
      INSERT INTO seasons (id, name, start_year, end_year, is_current)
        VALUES (1, '2025-2026', 2025, 2026, 1);
      INSERT INTO categories (id, name) VALUES (1, 'BENJAMIN'), (2, 'PREBENJAMIN');
    """)
    return conn


def _parse_const(js, name):
    m = re.search(rf"const {name}\s*=\s*([\[{{].*?[\]}}]);", js, re.DOTALL)
    assert m, f"const {name} not parseable in:\n{js[:500]}"
    return json.loads(m.group(1))


# ─── Fix 1: TEAMS_<S> letter-preserving normalization (C1) ──────────────────

class TestTeamsMappingNormalization:
    def test_keeps_filial_letter(self):
        from scripts.generate_js import normalize_for_teams_mapping
        assert normalize_for_teams_mapping("UD Atalaya") == "atalaya"
        assert normalize_for_teams_mapping("UD Atalaya B") == "atalaya b"

    def test_pipeline_matches_project_normalizer_semantics(self):
        from scripts.generate_js import normalize_for_teams_mapping
        # accents, punctuation (straight + curly quotes), club tokens
        assert normalize_for_teams_mapping("ARUCAS, C.F.") == "arucas"
        assert normalize_for_teams_mapping("Arucas CF") == "arucas"
        assert normalize_for_teams_mapping('ATLETICO HURACÁN, A.D. “A”') == "huracan a"
        assert normalize_for_teams_mapping("U.D. MOYA") == "moya"
        assert normalize_for_teams_mapping("") == ""
        assert normalize_for_teams_mapping(None) == ""


# ─── Fix 2: substitutions pairing in generate_lineups_js ────────────────────

class TestLineupsSubstitutions:
    def _seed(self, conn):
        conn.executescript("""
          INSERT INTO groups (id, season_id, category_id, code, name, phase)
            VALUES (1, 1, 1, 'A1', 'Grupo 1', 'Segunda Fase A');
          INSERT INTO teams (id, name) VALUES (1, 'Home FC'), (2, 'Away FC');
          INSERT INTO matches (id, group_id, jornada, date, home_team_id, away_team_id,
                               home_score, away_score, cod_acta)
            VALUES (1, 1, 'Jornada 1', '06/06', 1, 2, 1, 0, 90001);
          INSERT INTO players (id, full_name, norm_name)
            VALUES (1, 'SALE, PEPE', 'sale pepe'), (2, 'ENTRA, JUAN', 'entra juan');
          INSERT INTO appearances (match_id, team_id, player_id, dorsal, role)
            VALUES (1, 1, 1, 7, 'starter'), (1, 1, 2, 12, 'sub');
          -- mutual pair ids, exactly as import_fiflp_actas.py links them:
          -- out.pair_id = in.id  /  in.pair_id = out.id
          INSERT INTO match_events (id, match_id, team_id, player_id, kind, minute, pair_id)
            VALUES (1, 1, 1, 1, 'sub_out', 40, 2),
                   (2, 1, 1, 2, 'sub_in',  40, 1);
        """)

    def test_one_event_per_change_with_out_and_in_names(self):
        from scripts.generate_js import generate_lineups_js
        conn = _synth_conn()
        self._seed(conn)
        js = generate_lineups_js(conn, "2025-2026")
        data = _parse_const(js, "LINEUPS_2025_2026")
        events = data["Home FC|Away FC|1-0"]["events"]
        subs = [e for e in events if e.get("t") == "sub"]
        assert len(subs) == 1, f"cada cambio debe emitir UN evento, no {len(subs)}: {subs}"
        sub = subs[0]
        assert sub["n"] == "SALE, PEPE", "n debe ser el jugador que SALE"
        assert sub["n2"] == "ENTRA, JUAN", "n2 debe ser el jugador que ENTRA"
        assert sub["s"] == "h" and sub["m"] == 40

    def test_unpaired_sub_event_still_emitted(self):
        """Un sub_out sin pareja (pair_id NULL) se emite suelto, sin crash."""
        from scripts.generate_js import generate_lineups_js
        conn = _synth_conn()
        self._seed(conn)
        conn.execute("""INSERT INTO match_events (id, match_id, team_id, player_id, kind, minute, pair_id)
                        VALUES (3, 1, 1, 1, 'sub_out', 55, NULL)""")
        js = generate_lineups_js(conn, "2025-2026")
        data = _parse_const(js, "LINEUPS_2025_2026")
        events = data["Home FC|Away FC|1-0"]["events"]
        loose = [e for e in events if e.get("t") == "sub_out"]
        assert len(loose) == 1 and loose[0]["n"] == "SALE, PEPE"


# ─── Fix 3: score range guard (defensa en profundidad) ──────────────────────

class TestScoreRangeGuard:
    def _seed(self, conn):
        conn.executescript("""
          INSERT INTO groups (id, season_id, category_id, code, name, phase, current_jornada)
            VALUES (1, 1, 1, 'A1', 'Grupo 1', 'Segunda Fase A', 'Jornada 1');
          INSERT INTO teams (id, name) VALUES (1, 'Herbania B'), (2, 'Tamasite A');
          INSERT INTO matches (id, group_id, jornada, date, home_team_id, away_team_id,
                               home_score, away_score)
            VALUES (1, 1, 'Jornada 1', '30/03', 1, 2, 3, 41736);
        """)

    def test_history_emits_null_for_corrupt_score(self, capsys):
        from scripts.generate_js import generate_history_js
        conn = _synth_conn()
        self._seed(conn)
        js = generate_history_js(conn)
        hist = _parse_const(js, "HISTORY")
        row = hist["A1"]["Jornada 1"][0]  # [date, home, away, hs, as]
        assert row[3] == 3
        assert row[4] is None, f"away_score 41736 debe emitirse como null, no {row[4]}"
        assert "41736" in capsys.readouterr().err, "debe avisar por stderr"

    def test_current_jornada_matches_emits_null(self, capsys):
        from scripts.generate_js import get_current_jornada_matches
        conn = _synth_conn()
        self._seed(conn)
        rows = get_current_jornada_matches(conn, 1, "Jornada 1")
        # [date, time, home, away, hs, as, venue]
        assert rows[0][4] == 3 and rows[0][5] is None
        assert "41736" in capsys.readouterr().err

    def test_historical_jornadas_emits_null(self, capsys):
        from scripts.generate_js import get_historical_jornadas
        conn = _synth_conn()
        self._seed(conn)
        jor = get_historical_jornadas(conn, 1)
        row = jor["Jornada 1"][0]
        assert row[3] == 3 and row[4] is None
        assert "41736" in capsys.readouterr().err

    def test_negative_score_also_nulled(self, capsys):
        from scripts.generate_js import generate_history_js
        conn = _synth_conn()
        self._seed(conn)
        conn.execute("UPDATE matches SET home_score=-1, away_score=2 WHERE id=1")
        hist = _parse_const(generate_history_js(conn), "HISTORY")
        row = hist["A1"]["Jornada 1"][0]
        assert row[3] is None and row[4] == 2

    def test_sane_scores_untouched(self, capsys):
        from scripts.generate_js import generate_history_js
        conn = _synth_conn()
        self._seed(conn)
        conn.execute("UPDATE matches SET home_score=0, away_score=41 WHERE id=1")
        hist = _parse_const(generate_history_js(conn), "HISTORY")
        row = hist["A1"]["Jornada 1"][0]
        assert row[3] == 0 and row[4] == 41
        assert capsys.readouterr().err == ""


# ─── Plan A §9.1: hora y campo en temporadas pasadas ────────────────────────

class TestHistoricalMatchDetails:
    """Las temporadas pasadas salían en filas de 5 columnas aunque la base
    tenga su hora y su campo (unos 5.600 partidos de 2021-22 a 2024-25): solo
    2025-26 en adelante pasaba include_details. Ahora todas las temporadas usan
    las 8 columnas de HISTORY: [fecha, local, visitante, gl, gv, null, hora, campo]."""

    def _seed_past_season(self, conn):
        conn.executescript("""
          INSERT INTO seasons (id, name, start_year, end_year, is_current)
            VALUES (2, '2021-2022', 2021, 2022, 0);
          INSERT INTO groups (id, season_id, category_id, code, name, phase, current_jornada)
            VALUES (7, 2, 2, 'PG2', 'Grupo 2', 'Gran Canaria', '1');
          INSERT INTO teams (id, name) VALUES (1, 'Las Mesas Hu.'), (2, 'Huracan');
          INSERT INTO matches (id, group_id, jornada, date, time, home_team_id, away_team_id,
                               home_score, away_score, venue)
            VALUES (1, 7, '1', '06/11', '10:30', 1, 2, 2, 7, 'ANEXO GRAN CANARIA F8(1)'),
                   (2, 7, '1', '06/11', '', 2, 1, NULL, NULL, '');
        """)

    def test_past_season_rows_carry_time_and_venue(self):
        from scripts.generate_js import generate_seasons_js
        conn = _synth_conn()
        self._seed_past_season(conn)
        _, seasons = generate_seasons_js(conn)
        past = next(s for s in seasons if s["name"] == "2021-2022")
        assert past["prebenjamin"][0]["jornadas"] == {"1": [
            ["06/11", "Huracan", "Las Mesas Hu.", None, None, None, "", ""],
            ["06/11", "Las Mesas Hu.", "Huracan", 2, 7, None, "10:30", "ANEXO GRAN CANARIA F8(1)"],
        ]}


# ─── Fix 4: stale standings recompute (current season, league groups) ───────

class TestStandingsFreshness:
    def _seed_group(self, conn, code="PG1", phase="Gran Canaria"):
        conn.execute(
            """INSERT INTO groups (id, season_id, category_id, code, name, phase, current_jornada)
               VALUES (1, 1, 1, ?, 'Grupo 1', ?, 'Jornada 3')""", (code, phase))
        conn.executescript("""
          INSERT INTO teams (id, name) VALUES (1, 'Alpha'), (2, 'Beta');
        """)

    def _seed_three_rounds(self, conn):
        conn.executescript("""
          INSERT INTO matches (group_id, jornada, date, home_team_id, away_team_id, home_score, away_score)
            VALUES (1, 'Jornada 1', '01/02', 1, 2, 2, 0),
                   (1, 'Jornada 2', '08/02', 2, 1, 1, 1),
                   (1, 'Jornada 3', '15/02', 1, 2, 0, 3);
        """)

    def _frozen_standings(self, conn):
        # stored table frozen after round 1 (source stopped publishing)
        conn.executescript("""
          INSERT INTO standings (group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd)
            VALUES (1, 1, 1, 3, 1, 1, 0, 0, 2, 0, 2),
                   (1, 2, 2, 0, 1, 0, 0, 1, 0, 2, -2);
        """)

    def test_stale_group_recomputed_from_matches(self):
        from scripts.generate_js import generate_category_js
        conn = _synth_conn()
        self._seed_group(conn)
        self._seed_three_rounds(conn)
        self._frozen_standings(conn)
        js = generate_category_js(conn, "BENJAMIN", "BENJAMIN", "BENJ_STATS")
        standings = _parse_const(js, "BENJAMIN")[0]["standings"]
        # computed: both 4 pts after 3 rounds; Beta first on DF (+1 vs -1)
        assert standings == [
            [1, "Beta", 4, 3, 1, 1, 1, 4, 3, 1],
            [2, "Alpha", 4, 3, 1, 1, 1, 3, 4, -1],
        ], f"tabla desfasada debe recalcularse desde matches, got {standings}"

    def test_synced_group_keeps_stored_standings(self):
        """Si J almacenada está al día, se respeta la tabla oficial (sanciones)."""
        from scripts.generate_js import generate_category_js
        conn = _synth_conn()
        self._seed_group(conn)
        # only round 1 played -> stored (J=1 each) is in sync
        conn.execute("""INSERT INTO matches (group_id, jornada, date, home_team_id, away_team_id, home_score, away_score)
                        VALUES (1, 'Jornada 1', '01/02', 1, 2, 2, 0)""")
        # official table carries a 1-point sanction on Alpha (2 pts, not 3)
        conn.executescript("""
          INSERT INTO standings (group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd)
            VALUES (1, 1, 1, 2, 1, 1, 0, 0, 2, 0, 2),
                   (1, 2, 2, 0, 1, 0, 0, 1, 0, 2, -2);
        """)
        js = generate_category_js(conn, "BENJAMIN", "BENJAMIN", "BENJ_STATS")
        standings = _parse_const(js, "BENJAMIN")[0]["standings"]
        assert standings == [
            [1, "Alpha", 2, 1, 1, 0, 0, 2, 0, 2],
            [2, "Beta", 0, 1, 0, 0, 1, 0, 2, -2],
        ], "tabla en sync debe respetar la almacenada (puede llevar sanciones)"

    def test_copa_group_never_recomputed(self):
        """Las copas sintetizadas (knockout) conservan sus standings aunque
        la suma de J no cuadre con matches."""
        from scripts.generate_js import generate_category_js
        conn = _synth_conn()
        self._seed_group(conn, code="BCA1", phase="Copa Campeones Benjamin A")
        self._seed_three_rounds(conn)
        self._frozen_standings(conn)
        js = generate_category_js(conn, "BENJAMIN", "BENJAMIN", "BENJ_STATS")
        standings = _parse_const(js, "BENJAMIN")[0]["standings"]
        assert standings == [
            [1, "Alpha", 3, 1, 1, 0, 0, 2, 0, 2],
            [2, "Beta", 0, 1, 0, 0, 1, 0, 2, -2],
        ], "grupos de copa no deben recalcularse"

    def test_tiebreak_full_order(self):
        """Orden canónico: pts desc, DF desc, GF desc, nombre asc."""
        from scripts.generate_js import compute_standings_from_matches
        conn = _synth_conn()
        conn.executescript("""
          INSERT INTO groups (id, season_id, category_id, code, name, phase)
            VALUES (1, 1, 1, 'PG1', 'Grupo 1', 'Gran Canaria');
          INSERT INTO teams (id, name) VALUES (1, 'Delta'), (2, 'Casa');
          INSERT INTO matches (group_id, jornada, date, home_team_id, away_team_id, home_score, away_score)
            VALUES (1, 'Jornada 1', '01/02', 1, 2, 1, 1);
        """)
        rows = compute_standings_from_matches(conn, 1)
        # full tie (1 pt, DF 0, GF 1) -> name asc: Casa before Delta
        assert [r[1] for r in rows] == ["Casa", "Delta"]
        assert rows[0] == [1, "Casa", 1, 1, 0, 1, 0, 1, 1, 0]


# ─── Fix (2026-06-15): row-level points repair for corrupt-but-complete tables ─

class TestStandingsPointsRepair:
    """Valkyrias Bec. (PG1) y Lanzarote B (LZ3) se publicaron con 0/7 pts pese
    a 16/6 victorias: la fuente mal-scrapeó SOLO la columna de puntos. La tabla
    stored es MÁS completa que `matches` (lleva la última jornada y derrotas por
    walkover que nunca son fixtures), así que recalcular la tabla entera
    regresaría a todos los demás equipos. Se repara únicamente el campo de
    puntos imposible (3·G+E) y se re-ordena, conservando el resto de la tabla."""

    def _seed(self, conn, corrupt_pts):
        # stored = temporada completa (played=4 cada uno); matches solo cubre 1
        # partido -> computed_j (2) < stored_j (12): NO es la rama de recompute.
        conn.execute(
            """INSERT INTO groups (id, season_id, category_id, code, name, phase, current_jornada)
               VALUES (1, 1, 1, 'PG1', 'Grupo 1', 'Gran Canaria', 'Jornada 4')""")
        conn.executescript(
            "INSERT INTO teams (id, name) VALUES (1,'Alpha'),(2,'Beta'),(3,'Gamma');")
        conn.execute(
            """INSERT INTO matches (group_id, jornada, date, home_team_id, away_team_id, home_score, away_score)
               VALUES (1, 'Jornada 1', '01/02', 1, 2, 2, 0)""")
        # Gamma: pts corrupto (debería ser 3*3+0 = 9); resto internamente coherente
        conn.execute(
            """INSERT INTO standings (group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd)
               VALUES (1, 1, 1, 10, 4, 3, 1, 0, 10, 3, 7),
                      (1, 2, 3, 4, 4, 1, 1, 2, 5, 8, -3),
                      (1, 3, 2, ?, 4, 3, 0, 1, 9, 5, 4)""", (corrupt_pts,))

    def test_corrupt_points_repaired_others_kept(self):
        from scripts.generate_js import generate_category_js
        conn = _synth_conn()
        self._seed(conn, corrupt_pts=0)
        js = generate_category_js(conn, "BENJAMIN", "BENJAMIN", "BENJ_STATS")
        standings = _parse_const(js, "BENJAMIN")[0]["standings"]
        assert standings == [
            [1, "Alpha", 10, 4, 3, 1, 0, 10, 3, 7],
            [2, "Gamma", 9, 4, 3, 0, 1, 9, 5, 4],   # 0 -> 9, re-ordenado sobre Beta
            [3, "Beta", 4, 4, 1, 1, 2, 5, 8, -3],
        ], f"solo se repara la columna de puntos y se re-ordena; got {standings}"
        # prueba que NO hubo recompute: Alpha conserva GF=10 stored (un recompute
        # del único match sembrado daría Alpha GF=2, played=1)
        assert standings[0][3] == 4 and standings[0][7] == 10

    def test_real_valkyrias_value(self):
        from scripts.generate_js import _repair_incoherent_points
        stored = [[15, "Valkyrias Bec.", 0, 28, 16, 1, 11, 118, 98, 20],
                  [5, "Tamaraceite", 50, 28, 15, 5, 8, 127, 84, 43]]
        repaired, changed = _repair_incoherent_points(stored)
        assert changed
        by = {r[1]: r for r in repaired}
        assert by["Valkyrias Bec."][2] == 49, "16G+1E -> 49 pts"
        # 49 < 50 -> Tamaraceite sigue primero, Valkyrias segundo
        assert repaired[0][1] == "Tamaraceite" and repaired[1][1] == "Valkyrias Bec."
        assert [r[0] for r in repaired] == [1, 2], "posiciones re-numeradas"

    def test_sanction_within_tolerance_preserved(self):
        from scripts.generate_js import _repair_incoherent_points
        # -3 sanción: 3G+0E -> esperado 9, stored 6 (delta 3 <= 6) -> conservar
        stored = [[1, "Sancho", 6, 3, 3, 0, 0, 9, 1, 8]]
        repaired, changed = _repair_incoherent_points(stored)
        assert changed is False
        assert repaired[0][2] == 6, "sanción real (-3) no debe repararse"

    def test_inconsistent_played_not_repaired(self):
        from scripts.generate_js import _repair_incoherent_points
        # played != G+E+P -> W/D/L no fiables, no fabricar puntos
        stored = [[1, "Bad", 0, 9, 3, 0, 1, 5, 5, 0]]  # 3+0+1=4 != 9
        repaired, changed = _repair_incoherent_points(stored)
        assert changed is False


# ─── Fix (2026-06-15): match-detail/lineup keys mirror the frontend (#11) ────

class TestMatchKeySanitize:
    """Las claves de MATCH_DETAIL/LINEUPS usaban hs/as_ crudos;
    el frontend (render.js/miequipo.js/modals.js) las construye con scores
    sanitizados. Un score fuera de rango → la clave del backend ('41736-0') no
    casaba con la del frontend ('null-0') → badge ⚽ / alineación invisibles.
    Latente (0 hoy), pero defensa en profundidad: ambas deben coincidir, usando
    'null' (JS) no 'None' (Python)."""

    def _seed_goals(self, conn, hs, as_):
        conn.executescript("""
          INSERT INTO groups (id, season_id, category_id, code, name, phase)
            VALUES (1, 1, 1, 'A1', 'Grupo 1', 'Segunda Fase A');
          INSERT INTO teams (id, name) VALUES (1,'Home FC'),(2,'Away FC');
          INSERT INTO players (id, full_name, norm_name) VALUES (1,'PEPE','pepe');
        """)
        conn.execute("""INSERT INTO matches (id, group_id, jornada, date, home_team_id, away_team_id, home_score, away_score, cod_acta)
                        VALUES (1, 1, 'Jornada 1', '06/06', 1, 2, ?, ?, 90001)""", (hs, as_))
        conn.execute("""INSERT INTO goals (match_id, minute, player_name, running_score, side, type)
                        VALUES (1, 10, 'X', '1-0', 'h', 'goal')""")
        conn.execute("""INSERT INTO appearances (match_id, team_id, player_id, dorsal, role)
                        VALUES (1, 1, 1, 7, 'starter')""")

    def test_corrupt_score_key_uses_null_everywhere(self, capsys):
        from scripts.generate_js import generate_matchdetail_js, generate_lineups_js
        conn = _synth_conn(); self._seed_goals(conn, 41736, 0)
        for out, what in [(generate_matchdetail_js(conn), "MATCH_DETAIL"),
                          (generate_lineups_js(conn, "2025-2026"), "LINEUPS")]:
            assert "Home FC|Away FC|null-0" in out, f"{what} debe usar 'null' para score corrupto"
            assert "41736" not in out, f"{what} no debe llevar el score corrupto"
            assert "None-0" not in out, f"{what} debe usar 'null' (JS), no 'None' (Python)"

    def test_sane_score_key_unchanged(self):
        from scripts.generate_js import generate_matchdetail_js, generate_lineups_js
        conn = _synth_conn(); self._seed_goals(conn, 3, 1)
        assert "Home FC|Away FC|3-1" in generate_matchdetail_js(conn)
        assert "Home FC|Away FC|3-1" in generate_lineups_js(conn, "2025-2026")


# ─── Fix (2026-06-15): knockout round ordering (cups) ───────────────────────

class TestJornadaSortKey:
    """Las rondas de cup ("( Cuartos )"/"( Semifinales )"/"( Final )", mismo día)
    se ordenaban por el primer número (el día) → empate → orden alfabético
    (Cuartos, Final, Semifinales). El frontend etiqueta por posición → la final
    (1 partido) salía como semifinal y viceversa. Deben ordenarse por progresión."""

    def test_knockout_rounds_order_by_progression(self):
        from scripts.generate_js import _jornada_sort_key
        keys = ["10-06-2026 ( Final )", "10-06-2026 ( Cuartos )", "10-06-2026 ( Semifinales )"]
        assert sorted(keys, key=_jornada_sort_key) == [
            "10-06-2026 ( Cuartos )", "10-06-2026 ( Semifinales )", "10-06-2026 ( Final )"]

    def test_octavos_before_cuartos(self):
        from scripts.generate_js import _jornada_sort_key
        keys = ["01-01-2026 ( Cuartos )", "01-01-2026 ( Octavos )", "01-01-2026 ( Final )"]
        assert sorted(keys, key=_jornada_sort_key) == [
            "01-01-2026 ( Octavos )", "01-01-2026 ( Cuartos )", "01-01-2026 ( Final )"]

    def test_league_jornadas_by_number(self):
        from scripts.generate_js import _jornada_sort_key
        keys = ["Jornada 10", "Jornada 2", "Jornada 1"]
        assert sorted(keys, key=_jornada_sort_key) == ["Jornada 1", "Jornada 2", "Jornada 10"]

    def test_dated_rounds_order_by_date_then_rank(self):
        from scripts.generate_js import _jornada_sort_key
        keys = ["09-06-2025 ( Ronda 2 )", "08-06-2025 ( Ronda 1 )"]
        assert sorted(keys, key=_jornada_sort_key) == [
            "08-06-2025 ( Ronda 1 )", "09-06-2025 ( Ronda 2 )"]


# ─── Fix 5: conditional cache/version bump (C3 + C4) ────────────────────────

def _synth_site(tmp_path):
    (tmp_path / "index.html").write_text(
        '<script src="./data-foo.js?v=20260101"></script>\n'
        '<script src="./src/app.js?v=20260101"></script>\n'
        "<p>Última actualización: 01/01/2026</p>\n",
        encoding="utf-8",
    )
    (tmp_path / "sw.js").write_text(
        "const CACHE_NAME = 'futbolbase-v20260101';\nconst OFFLINE_URL = './index.html';\n",
        encoding="utf-8",
    )
    (tmp_path / "data-foo.js").write_text("const FOO=1;\n", encoding="utf-8")
    return str(tmp_path)


class TestConditionalBump:
    def test_no_bump_when_data_unchanged(self, tmp_path):
        from scripts.generate_js import snapshot_data_files, bump_if_changed
        root = _synth_site(tmp_path)
        before = snapshot_data_files(root)
        idx0 = (tmp_path / "index.html").read_text(encoding="utf-8")
        sw0 = (tmp_path / "sw.js").read_text(encoding="utf-8")
        assert bump_if_changed(before, root) is False
        assert (tmp_path / "index.html").read_text(encoding="utf-8") == idx0, \
            "sin cambios de datos NO se toca index.html (C4)"
        assert (tmp_path / "sw.js").read_text(encoding="utf-8") == sw0, \
            "sin cambios de datos NO se toca sw.js (C4)"

    def test_bump_when_data_changed(self, tmp_path):
        from scripts.generate_js import snapshot_data_files, bump_if_changed
        root = _synth_site(tmp_path)
        before = snapshot_data_files(root)
        (tmp_path / "data-foo.js").write_text("const FOO=2;\n", encoding="utf-8")
        assert bump_if_changed(before, root) is True
        today = date.today().strftime("%Y%m%d")
        idx = (tmp_path / "index.html").read_text(encoding="utf-8")
        assert idx.count(f"?v={today}") == 2, f"todos los ?v= deben pasar a {today}"
        assert f"Última actualización: {date.today().strftime('%d/%m/%Y')}" in idx
        sw = (tmp_path / "sw.js").read_text(encoding="utf-8")
        assert f"futbolbase-v{today}" in sw, "CACHE_NAME debe llevar el mismo string de versión"
        # C3: first line keeps the matchable literal
        assert re.search(r"futbolbase-v[0-9a-z]+", sw.splitlines()[0])
        assert sw.splitlines()[0] == f"const CACHE_NAME = 'futbolbase-v{today}';"

    def test_same_day_second_change_gets_letter_suffix(self, tmp_path):
        from scripts.generate_js import snapshot_data_files, bump_if_changed
        root = _synth_site(tmp_path)
        today = date.today().strftime("%Y%m%d")
        # first data change today
        before = snapshot_data_files(root)
        (tmp_path / "data-foo.js").write_text("const FOO=2;\n", encoding="utf-8")
        assert bump_if_changed(before, root) is True
        # second data change same day -> suffix 'b' everywhere
        before = snapshot_data_files(root)
        (tmp_path / "data-foo.js").write_text("const FOO=3;\n", encoding="utf-8")
        assert bump_if_changed(before, root) is True
        idx = (tmp_path / "index.html").read_text(encoding="utf-8")
        assert idx.count(f"?v={today}b") == 2
        sw = (tmp_path / "sw.js").read_text(encoding="utf-8")
        assert sw.splitlines()[0] == f"const CACHE_NAME = 'futbolbase-v{today}b';"

    def test_new_data_file_counts_as_change(self, tmp_path):
        from scripts.generate_js import snapshot_data_files, bump_if_changed
        root = _synth_site(tmp_path)
        before = snapshot_data_files(root)
        (tmp_path / "data-bar.js").write_text("const BAR=1;\n", encoding="utf-8")
        assert bump_if_changed(before, root) is True


class TestTeamLookupIsCollisionAware:
    """El portal escribe 'Arucas CF' donde la base tiene 'Arucas'. Si
    get_or_create_team empareja solo por nombre exacto, cada scrape vuelve a
    partir el club en dos: la clasificación con un nombre y el calendario con el
    otro, la ficha vacía y la clave de TEAMS_ duplicada. Tumbó el auto-update
    del 27/07/2026."""

    def _conn(self):
        import sqlite3
        from db import init_db
        c = sqlite3.connect(":memory:")
        init_db(c)
        return c

    def test_another_spelling_reuses_the_same_team(self):
        from db import get_or_create_team
        c = self._conn()
        a = get_or_create_team(c, "Arucas")
        assert get_or_create_team(c, "Arucas CF") == a
        assert get_or_create_team(c, "ARUCAS, C.F.") == a

    def test_the_name_already_in_the_database_wins(self):
        from db import get_or_create_team
        c = self._conn()
        get_or_create_team(c, "Arucas")
        get_or_create_team(c, "Arucas CF")
        assert [r[0] for r in c.execute("SELECT name FROM teams")] == ["Arucas"]

    def test_the_filial_letter_still_separates(self):
        from db import get_or_create_team
        c = self._conn()
        a = get_or_create_team(c, "Arucas")
        assert get_or_create_team(c, "Arucas B") != a
        assert get_or_create_team(c, "Arucas C") != a

    def test_a_genuinely_new_club_is_created(self):
        from db import get_or_create_team
        c = self._conn()
        a = get_or_create_team(c, "Arucas")
        assert get_or_create_team(c, "Firgas") != a


def test_the_scraper_repairs_impossible_points_before_writing():
    """Si no, la fuente vuelve a meter el disparate en la base cada 5 horas."""
    ruta = os.path.join(ROOT, "scripts", "fetch_futbolaspalmas.py")
    with open(ruta, encoding="utf-8") as f:
        src = f.read()
    assert "_repair_incoherent_points(standings)" in src
    # Antes del guard de cambio de temporada, que es lo primero que mira la
    # tabla recién scrapeada (el .index() de la definición no vale aquí).
    assert (src.index("_repair_incoherent_points(standings)")
            < src.index("standings_regression(stored_standings("))


# ─── Plan A §9.2 (2026-09-23): claves repetidas de MATCH_DETAIL / LINEUPS ───

def _parse_tail_const(js, name):
    """Como _parse_const, pero hasta el ÚLTIMO ';' del fichero: los data-*.js
    reales son un único `const X = {...};` y un ';' dentro de un nombre
    cortaría la búsqueda perezosa."""
    m = re.search(rf"const {name}\s*=\s*(.*);\s*$", js, re.DOTALL)
    assert m, f"const {name} not parseable in:\n{js[:500]}"
    return json.loads(m.group(1))


def _entries(value):
    """Entradas de una clave: [entrada] o la lista de un {dup: true, list}."""
    return value["list"] if value.get("dup") else [value]


class TestMatchKeyCollisions:
    """MATCH_DETAIL y LINEUPS_<S> se indexan por `local|visitante|gl-gv`, que no
    es única: 'CD Calero|La Garita|1-11' es un partido de FF15 (benjamín) y
    otro de PG2 (prebenjamín), y al activar 2026/27 chocarán claves entre
    temporadas (la consulta de MATCH_DETAIL no filtra temporada). Antes ganaba
    el último partido y el otro desaparecía en silencio. Ahora cada entrada
    lleva s (temporada) y gr (código de grupo), LINEUPS además cod
    (matches.cod_acta), y una clave repetida sale como {dup: true, list: [...]}."""

    KEY = "CD Calero|La Garita|1-11"

    def _seed_calero(self, conn, cod_pg2=None, cod_ff15=None):
        # Mismos ids y grupos que en la base real (el partido de PG2 es el de
        # id menor), pero aquí los DOS tienen goles para forzar el choque.
        conn.executescript("""
          INSERT INTO groups (id, season_id, category_id, code, name, phase)
            VALUES (10, 1, 1, 'FF15', 'Grupo 15', 'Primera Fase'),
                   (20, 1, 2, 'PG2', 'Grupo 2', 'Liga');
          INSERT INTO teams (id, name) VALUES (1, 'CD Calero'), (2, 'La Garita');
          INSERT INTO players (id, full_name, norm_name)
            VALUES (1, 'PEREZ, JUAN', 'perez juan'), (2, 'GOMEZ, RAUL', 'gomez raul');
        """)
        conn.execute("""INSERT INTO matches (id, group_id, jornada, date, home_team_id,
                          away_team_id, home_score, away_score, cod_acta)
                        VALUES (2256, 20, 'Jornada 27', '2026-05-14', 1, 2, 1, 11, ?)""",
                     (cod_pg2,))
        conn.execute("""INSERT INTO matches (id, group_id, jornada, date, home_team_id,
                          away_team_id, home_score, away_score, cod_acta)
                        VALUES (687244, 10, 'Jornada 3', '2025-10-24', 1, 2, 1, 11, ?)""",
                     (cod_ff15,))
        conn.executescript("""
          INSERT INTO goals (match_id, minute, player_name, running_score, side, type)
            VALUES (2256, 5, 'Pepe', '0-1', 'a', 'r'),
                   (687244, 54, 'Ylian Jose', '1-11', 'a', 'r');
          INSERT INTO appearances (match_id, team_id, player_id, dorsal, role)
            VALUES (2256, 1, 1, 7, 'starter'), (687244, 1, 2, 9, 'starter');
        """)

    def test_matchdetail_entry_carries_season_and_group(self):
        from scripts.generate_js import generate_matchdetail_js
        conn = _synth_conn()
        conn.executescript("""
          INSERT INTO groups (id, season_id, category_id, code, name, phase)
            VALUES (1, 1, 1, 'A1', 'Grupo 1', 'Segunda Fase A');
          INSERT INTO teams (id, name) VALUES (1, 'Home FC'), (2, 'Away FC');
          INSERT INTO matches (id, group_id, jornada, date, home_team_id, away_team_id,
                               home_score, away_score)
            VALUES (1, 1, 'Jornada 1', '06/06', 1, 2, 1, 0);
          INSERT INTO goals (match_id, minute, player_name, running_score, side, type)
            VALUES (1, 10, 'X', '1-0', 'h', 'r');
        """)
        md = _parse_tail_const(generate_matchdetail_js(conn), "MATCH_DETAIL")
        assert md == {"Home FC|Away FC|1-0":
                      {"s": "2025-2026", "gr": "A1", "g": [[10, "X", "1-0", "h", "r"]]}}

    def test_same_key_in_two_groups_is_a_dup_list_not_an_overwrite(self):
        from scripts.generate_js import generate_matchdetail_js
        conn = _synth_conn()
        self._seed_calero(conn)
        md = _parse_tail_const(generate_matchdetail_js(conn), "MATCH_DETAIL")
        assert md[self.KEY] == {"dup": True, "list": [
            {"s": "2025-2026", "gr": "PG2", "g": [[5, "Pepe", "0-1", "a", "r"]]},
            {"s": "2025-2026", "gr": "FF15", "g": [[54, "Ylian Jose", "1-11", "a", "r"]]},
        ]}
        # La interfaz actual lee detail.g: con una clave repetida recibe
        # undefined y no pinta cronología (no la de otro partido).
        assert "g" not in md[self.KEY]

    def test_same_key_in_two_seasons_is_a_dup_list(self):
        """Lo que pasará al activar 2026/27: mismo cruce y mismo marcador."""
        from scripts.generate_js import generate_matchdetail_js
        conn = _synth_conn()
        conn.executescript("""
          INSERT INTO seasons (id, name, start_year, end_year, is_current)
            VALUES (2, '2026-2027', 2026, 2027, 0);
          INSERT INTO groups (id, season_id, category_id, code, name, phase)
            VALUES (1, 1, 2, 'PG2', 'Grupo 2', 'Liga'),
                   (2, 2, 2, 'PG2', 'Grupo 2', 'Liga');
          INSERT INTO teams (id, name) VALUES (1, 'Home FC'), (2, 'Away FC');
          INSERT INTO matches (id, group_id, jornada, date, home_team_id, away_team_id,
                               home_score, away_score)
            VALUES (1, 1, 'Jornada 1', '2025-10-04', 1, 2, 1, 0),
                   (2, 2, 'Jornada 1', '2026-10-03', 1, 2, 1, 0);
          INSERT INTO goals (match_id, minute, player_name, running_score, side, type)
            VALUES (1, 3, 'A', '1-0', 'h', 'r'), (2, 7, 'C', '1-0', 'h', 'r');
        """)
        md = _parse_tail_const(generate_matchdetail_js(conn), "MATCH_DETAIL")
        entry = md["Home FC|Away FC|1-0"]
        assert entry["dup"] is True
        assert [(e["s"], e["gr"]) for e in entry["list"]] == [
            ("2025-2026", "PG2"), ("2026-2027", "PG2")]

    def test_lineups_entry_carries_season_group_and_cod(self):
        from scripts.generate_js import generate_lineups_js
        conn = _synth_conn()
        self._seed_calero(conn, cod_ff15=258611)
        lin = _parse_tail_const(generate_lineups_js(conn, "2025-2026"), "LINEUPS_2025_2026")
        entry = lin[self.KEY]
        assert (entry["s"], entry["gr"], entry["cod"]) == ("2025-2026", "FF15", 258611)
        assert entry["home"][0]["n"] == "GOMEZ, RAUL"
        assert set(entry) == {"s", "gr", "cod", "home", "away", "events",
                              "coachH", "coachA", "ref"}

    def test_lineups_same_key_twice_in_a_season_is_a_dup_list(self):
        from scripts.generate_js import generate_lineups_js
        conn = _synth_conn()
        self._seed_calero(conn, cod_pg2=125782, cod_ff15=258611)
        lin = _parse_tail_const(generate_lineups_js(conn, "2025-2026"), "LINEUPS_2025_2026")
        entry = lin[self.KEY]
        assert entry["dup"] is True and "home" not in entry
        assert [(e["s"], e["gr"], e["cod"]) for e in entry["list"]] == [
            ("2025-2026", "PG2", 125782), ("2025-2026", "FF15", 258611)]
        assert [e["home"][0]["n"] for e in entry["list"]] == ["PEREZ, JUAN", "GOMEZ, RAUL"]

    def _real_conn(self, tmp_path):
        if not os.path.exists(DB_PATH):
            pytest.skip("futbolbase.db not present")
        src = sqlite3.connect(DB_PATH)
        conn = sqlite3.connect(str(tmp_path / "fb.db"))
        src.backup(conn)
        src.close()
        return conn

    def test_real_db_no_key_is_silently_overwritten(self, tmp_path):
        """Base real: cada partido con goles sale UNA vez en MATCH_DETAIL y cada
        partido con acta UNA vez en el LINEUPS_<S> de su temporada, con su
        (s, gr[, cod]), sea como entrada suelta o dentro de un dup."""
        from scripts.generate_js import generate_matchdetail_js, generate_lineups_js
        conn = self._real_conn(tmp_path)
        md = _parse_tail_const(generate_matchdetail_js(conn), "MATCH_DETAIL")
        got = sorted((e["s"], e["gr"]) for v in md.values() for e in _entries(v))
        want = sorted(conn.execute("""
            SELECT s.name, gr.code FROM matches m
              JOIN groups gr ON gr.id = m.group_id
              JOIN seasons s ON s.id = gr.season_id
             WHERE m.id IN (SELECT match_id FROM goals)""").fetchall())
        assert got == want, "MATCH_DETAIL perdió o duplicó partidos con goles"
        for sid, sname in conn.execute("SELECT id, name FROM seasons").fetchall():
            lin = _parse_tail_const(generate_lineups_js(conn, sname),
                                    "LINEUPS_" + sname.replace("-", "_"))
            got = sorted((e["s"], e["gr"], e["cod"]) for v in lin.values() for e in _entries(v))
            want = sorted(conn.execute("""
                SELECT ?, gr.code, m.cod_acta FROM matches m
                  JOIN groups gr ON gr.id = m.group_id
                 WHERE gr.season_id = ? AND m.cod_acta IS NOT NULL""",
                (sname, sid)).fetchall())
            assert got == want, f"LINEUPS_{sname} perdió o duplicó actas"

    def test_real_db_calero_timeline_is_tagged_ff15(self, tmp_path):
        """En la base real solo el partido de FF15 (12 goles) tiene cronología;
        el de PG2 no tiene goles. La entrada sale con gr='FF15', así que el
        rediseño sabrá que no es la del partido de PG2. Si algún día PG2 trae
        goles, la clave pasa a dup con FF15 y PG2: el test lo acepta. Si una
        fusión o un renombrado de equipos hace desaparecer la clave, se salta:
        la invariante general la vigila test_real_db_no_key_is_silently_overwritten."""
        from scripts.generate_js import generate_matchdetail_js
        conn = self._real_conn(tmp_path)
        md = _parse_tail_const(generate_matchdetail_js(conn), "MATCH_DETAIL")
        entry = md.get(self.KEY)
        if entry is None:
            pytest.skip("la clave de Calero ya no está en la base")
        entries = [e for e in _entries(entry) if e["s"] == "2025-2026"]
        grs = {e["gr"] for e in entries}
        ff15s = [e for e in entries if e["gr"] == "FF15"]
        if not ff15s:
            pytest.skip("la entrada FF15 de Calero ya no está en la base")
        ff15 = ff15s[0]
        assert "FF15" in grs and grs <= {"FF15", "PG2"}, grs
        assert len(ff15["g"]) == 12 and ff15["g"][-1][2] == "1-11"


# ─── B4 (decisión 1): las salidas del generador, sin los datos retirados ─────

# Lo que B4 retiró: nadie lo lee (el ⚽ de las listas se fue con la app anterior, Récords sale del
# modelo y la plantilla, de las actas), y el generador ya no lo escribe.
_RETIRED = re.compile(r"^data-(matchdetail-keys|stats|players-\d{4}-\d{4})\.js$")


class TestGeneratorOutputs:
    """generate_js.main() con una base sintética en una raíz temporal, como la activación de temporada
    (activate_season.apply_manifest): escribe exactamente sus salidas, ninguna retirada, y otra pasada
    con la misma base no cambia ni un byte, ni la versión ni el pie (C4). Nunca los data-*.js vivos."""

    def _site(self, tmp_path):
        db = tmp_path / "fb.db"
        conn = sqlite3.connect(str(db))
        conn.executescript(_SCHEMA)
        conn.executescript("""
          INSERT INTO seasons (id, name, start_year, end_year, is_current)
            VALUES (1, '2025-2026', 2025, 2026, 1), (2, '2024-2025', 2024, 2025, 0);
          INSERT INTO categories (id, name) VALUES (1, 'BENJAMIN'), (2, 'PREBENJAMIN');
          INSERT INTO groups (id, season_id, category_id, code, name, full_name, phase, island, current_jornada)
            VALUES (1, 1, 1, 'A1', 'Grupo A1', 'SEGUNDA FASE BENJAMIN A-G1', 'Segunda Fase A', 'grancanaria', 'Jornada 1'),
                   (2, 1, 2, 'PG2', 'Grupo 2', 'PREBENJAMIN PRIMERA GRAN CANARIA G-2', 'Liga', 'grancanaria', 'Jornada 1'),
                   (3, 2, 2, 'PG2', 'Grupo 2', 'PREBENJAMIN PRIMERA GRAN CANARIA G-2', 'Liga', 'grancanaria', 'Jornada 1');
          INSERT INTO teams (id, name) VALUES (1, 'Home FC'), (2, 'Away FC');
          INSERT INTO players (id, full_name, norm_name) VALUES (1, 'PEREZ, JUAN', 'perez juan');
          INSERT INTO matches (id, group_id, jornada, date, home_team_id, away_team_id,
                               home_score, away_score, cod_acta)
            VALUES (1, 1, 'Jornada 1', '2025-10-04', 1, 2, 1, 0, 90001),
                   (2, 3, 'Jornada 1', '2024-10-05', 2, 1, 0, 2, 80001);
          INSERT INTO goals (match_id, minute, player_name, running_score, side, type)
            VALUES (1, 10, 'PEREZ, JUAN', '1-0', 'h', 'r');
          INSERT INTO appearances (match_id, team_id, player_id, dorsal, role, goals)
            VALUES (1, 1, 1, 7, 'starter', 1), (2, 1, 1, 7, 'starter', 2);
          INSERT INTO scorers (group_id, player_name, team_id, goals, games)
            VALUES (1, 'PEREZ, JUAN', 1, 1, 1);
        """)
        conn.commit()
        conn.close()
        site = tmp_path / "site"
        site.mkdir()
        (site / "index.html").write_text(
            '<script src="./data-seasons.js?v=20260101"></script>\n'
            '<span id="legacyUpdated" hidden>Última actualización: 01/01/2026</span>\n',
            encoding="utf-8",
        )
        (site / "sw.js").write_text("const CACHE_NAME = 'futbolbase-v20260101';\n", encoding="utf-8")
        return db, site

    def test_main_writes_its_outputs_and_none_retired(self, tmp_path, monkeypatch):
        import scripts.generate_js as generate_js
        db, site = self._site(tmp_path)
        monkeypatch.setattr(generate_js, "PROJECT_ROOT", str(site))
        monkeypatch.setattr(generate_js, "get_connection", lambda: sqlite3.connect(str(db)))
        generate_js.main()
        written = sorted(p.name for p in site.glob("data-*"))
        assert [name for name in written if _RETIRED.match(name)] == [], "el generador escribe datos retirados"
        assert written == [
            "data-benjamin.js", "data-goleadores.js", "data-history.js",
            "data-lineups-2024-2025.js", "data-lineups-2025-2026.js", "data-matchdetail.js",
            "data-prebenjamin.js", "data-season-2024-2025.js", "data-seasons.js",
        ]
        # Otra pasada con la misma base: ni un byte distinto, y sin subir la versión ni el pie (C4).
        index = (site / "index.html").read_text(encoding="utf-8")
        snapshot = generate_js.snapshot_data_files(str(site))
        generate_js.main()
        assert generate_js.snapshot_data_files(str(site)) == snapshot
        assert (site / "index.html").read_text(encoding="utf-8") == index
