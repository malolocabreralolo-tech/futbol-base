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

    def test_real_db_no_collisions_any_season(self, tmp_path):
        """Cada equipo con appearances conserva su clave en TEAMS_<S> en TODAS
        las temporadas de la DB real (cero colisiones, mapeo inyectivo)."""
        if not os.path.exists(DB_PATH):
            pytest.skip("futbolbase.db not present")
        from scripts.generate_js import generate_players_js
        # backup API: safe copy even if another writer is mid-transaction
        src = sqlite3.connect(DB_PATH)
        conn = sqlite3.connect(str(tmp_path / "fb.db"))
        src.backup(conn)
        src.close()
        for sid, sname in conn.execute("SELECT id, name FROM seasons ORDER BY id").fetchall():
            expected_ids = {r[0] for r in conn.execute("""
                SELECT DISTINCT t.id FROM teams t
                  JOIN appearances a ON a.team_id=t.id
                  JOIN matches m ON m.id=a.match_id
                  JOIN groups g ON g.id=m.group_id
                 WHERE g.season_id=?""", (sid,))}
            if not expected_ids:
                continue
            js = generate_players_js(conn, sname)
            teams = _parse_const(js, "TEAMS_" + sname.replace("-", "_"))
            assert len(teams) == len(expected_ids), (
                f"{sname}: {len(expected_ids) - len(teams)} colisión(es) de clave en TEAMS_"
            )
            assert set(teams.values()) == expected_ids, f"{sname}: team ids perdidos en TEAMS_"

    def test_real_db_output_deterministic(self, tmp_path):
        """Misma DB → mismo JS byte a byte (necesario para C4)."""
        if not os.path.exists(DB_PATH):
            pytest.skip("futbolbase.db not present")
        from scripts.generate_js import generate_players_js
        src = sqlite3.connect(DB_PATH)
        conn = sqlite3.connect(str(tmp_path / "fb.db"))
        src.backup(conn)
        src.close()
        assert generate_players_js(conn, "2025-2026") == generate_players_js(conn, "2025-2026")


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
