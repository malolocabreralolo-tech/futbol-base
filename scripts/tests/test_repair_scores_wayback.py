"""Reparación de marcadores con capturas de futbolaspalmas en Wayback (plan A2).

Todo se prueba sin red: las llamadas a Wayback reciben una función `get` falsa.
"""
import json
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from db import SCHEMA  # noqa: E402
import repair_scores_wayback as R  # noqa: E402

URL = "https://futbolaspalmas.com/benjamin-segunda-fase-b-cuatro/"


def _db():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    conn.executescript("""
      INSERT INTO seasons (id, name, start_year, end_year, is_current) VALUES (1, '2025-2026', 2025, 2026, 1);
      INSERT INTO categories (id, name) VALUES (1, 'BENJAMIN');
      INSERT INTO groups (id, season_id, category_id, code, name, url)
        VALUES (10, 1, 1, 'B4', 'Grupo 4', 'https://futbolaspalmas.com/benjamin-segunda-fase-b-cuatro/');
      INSERT INTO teams (id, name) VALUES (1, 'Las Rosas'), (2, 'Las Majoreras'), (3, 'San Pedro');
      -- Oficial: Las Rosas 2 PJ 16-1; Las Majoreras 2 PJ 1-15; San Pedro 2 PJ 1-2.
      INSERT INTO standings (group_id, team_id, played, gf, gc)
        VALUES (10, 1, 2, 16, 1), (10, 2, 2, 1, 15), (10, 3, 2, 1, 2);
      -- Calendario leído de FIFLP: el 15-0 quedó en 5-0.
      INSERT INTO matches (id, group_id, jornada, home_team_id, away_team_id, home_score, away_score)
        VALUES (100, 10, '1', 1, 2, 5, 0), (101, 10, '2', 3, 1, 1, 1), (102, 10, '3', 2, 3, 1, 0);
    """)
    return conn


def _html(rows):
    """Página de grupo con la estructura real: cabecera JORNADA N de una celda
    y filas de 7 celdas [fecha, hora, local, gl, gv, visitante, campo]."""
    out = ["<table>"]
    for jornada, fecha, hora, home, hs, as_, away in rows:
        out.append(f"<tr><td>JORNADA {jornada}</td></tr>")
        out.append(f"<tr><td>{fecha}</td><td>{hora}</td><td>{home}</td><td>{hs}</td>"
                   f"<td>{as_}</td><td>{away}</td><td></td></tr>")
    out.append("</table>")
    return "".join(out)


# Liga de 4 equipos a una vuelta; la tabla oficial sale de TRUE_LEAGUE y el
# calendario de la base tiene dos dígitos perdidos (12-1 → 2-1, 1-10 → 1-0).
TRUE_LEAGUE = [(1, "Las Rosas", "Las Majoreras", 3, 1), (1, "San Pedro", "FUTBOL P.D.C. 2016, C.D.", 2, 2),
               (2, "San Pedro", "Las Rosas", 0, 4), (2, "FUTBOL P.D.C. 2016, C.D.", "Las Majoreras", 12, 1),
               (3, "Las Rosas", "FUTBOL P.D.C. 2016, C.D.", 5, 0), (3, "Las Majoreras", "San Pedro", 1, 10)]


def _league():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    conn.executescript("""
      INSERT INTO seasons (id, name, start_year, end_year, is_current) VALUES (1, '2025-2026', 2025, 2026, 1);
      INSERT INTO categories (id, name) VALUES (1, 'BENJAMIN');
      INSERT INTO groups (id, season_id, category_id, code, name) VALUES (40, 1, 1, 'L1', 'Grupo 1');
    """)
    ids = {"Las Rosas": 1, "Las Majoreras": 2, "San Pedro": 3, "FUTBOL P.D.C. 2016, C.D.": 4}
    conn.executemany("INSERT INTO teams (id, name) VALUES (?, ?)", [(i, n) for n, i in ids.items()])
    tabla = {i: [0, 0, 0] for i in ids.values()}
    for k, (j, h, a, gl, gv) in enumerate(TRUE_LEAGUE):
        for t, f, c in ((ids[h], gl, gv), (ids[a], gv, gl)):
            tabla[t][0] += 1
            tabla[t][1] += f
            tabla[t][2] += c
        guardado = {3: (2, 1), 5: (1, 0)}.get(k, (gl, gv))
        conn.execute("INSERT INTO matches (id, group_id, jornada, home_team_id, away_team_id, home_score, away_score)"
                     " VALUES (?, 40, ?, ?, ?, ?, ?)", (400 + k, str(j), ids[h], ids[a], *guardado))
    conn.executemany("INSERT INTO standings (group_id, team_id, played, gf, gc) VALUES (40, ?, ?, ?, ?)",
                     [(t, *v) for t, v in tabla.items()])
    return conn


GOOD = _html([(1, "11-10-2025", "09:00", "Las Rosas", 15, 0, "Las Majoreras"),
              (2, "18-10-2025", "09:00", "San Pedro", 1, 1, "Las Rosas"),
              (3, "25-10-2025", "09:00", "Las Majoreras", 1, 0, "San Pedro")])


class TestSnapshots:
    def test_season_window(self):
        assert R.season_window("2025-2026") == ("20250801", "20260731")

    def test_list_snapshots_keeps_200s_in_window_newest_first(self):
        cdx = json.dumps([["timestamp", "statuscode"],
                          ["20260212191634", "200"], ["20260510024729", "200"],
                          ["20260510024729", "200"], ["20260601000000", "301"]])
        calls = []

        def fake_get(url):
            calls.append(url)
            return cdx

        assert R.list_snapshots(URL, "2025-2026", get=fake_get) == ["20260510024729", "20260212191634"]
        assert "from=20250801" in calls[0] and "to=20260731" in calls[0]

    def test_list_snapshots_survives_an_empty_answer(self):
        assert R.list_snapshots(URL, "2025-2026", get=lambda url: "") == []

    def test_snapshot_rows_come_from_the_bot_parser(self):
        jornadas = R.jornadas_from_html(GOOD)
        assert jornadas["Jornada 1"][0][:5] == ["2025-10-11", "Las Rosas", "Las Majoreras", 15, 0]


class TestNames:
    def test_exact_then_club_matching(self):
        teams = {1: "Las Rosas", 2: "Las Majoreras", 3: "San Pedro"}
        mapping, unmatched = R.map_names(["Las Rosas", "UD Las Majoreras", "Otro Club"], teams)
        assert mapping == {"Las Rosas": 1, "UD Las Majoreras": 2}
        assert unmatched == ["Otro Club"]


class TestPlan:
    def test_propose_repairs_the_lost_digit(self):
        conn = _db()
        plan = R.plan_group(conn, 10, [{"url": URL, "timestamp": "20260510024729",
                                        "jornadas": R.jornadas_from_html(GOOD)}])
        assert plan["overrides"] == {100: (15, 0)}
        assert (plan["before"], plan["after"], plan["accepted"]) == (20, 0, True)
        assert plan["changes"] == [{"match_id": 100, "jornada": "1", "home": "Las Rosas",
                                    "away": "Las Majoreras", "before": [5, 0], "after": [15, 0],
                                    "source": f"{URL}@20260510024729"}]

    def test_a_snapshot_that_worsens_the_group_is_rejected(self):
        conn = _db()
        bad = _html([(1, "11-10-2025", "09:00", "Las Rosas", 2, 0, "Las Majoreras")])
        plan = R.plan_group(conn, 10, [{"url": URL, "timestamp": "20260510024729",
                                        "jornadas": R.jornadas_from_html(bad)}])
        assert plan["accepted"] is False
        assert plan["overrides"] == {}
        assert [d["match_id"] for d in plan["discarded"]] == [100]

    def test_later_snapshot_wins(self):
        conn = _db()
        early = _html([(1, "11-10-2025", "09:00", "Las Rosas", 5, 0, "Las Majoreras")])
        plan = R.plan_group(conn, 10, [
            {"url": URL, "timestamp": "20260510024729", "jornadas": R.jornadas_from_html(GOOD)},
            {"url": URL, "timestamp": "20260212191634", "jornadas": R.jornadas_from_html(early)}])
        assert plan["overrides"] == {100: (15, 0)}

    def test_repeated_pairing_is_resolved_by_round_or_skipped(self):
        conn = _db()
        conn.execute("INSERT INTO matches (id, group_id, jornada, home_team_id, away_team_id, home_score, away_score)"
                     " VALUES (103, 10, '4', 1, 2, 3, 3)")
        both = _html([(1, "11-10-2025", "09:00", "Las Rosas", 15, 0, "Las Majoreras"),
                      (4, "01-11-2025", "09:00", "Las Rosas", 3, 3, "Las Majoreras")])
        plan = R.plan_group(conn, 10, [{"url": URL, "timestamp": "20260510024729",
                                        "jornadas": R.jornadas_from_html(both)}])
        assert plan["overrides"] == {100: (15, 0)}

    def test_rows_dated_outside_the_group_season_are_ignored(self):
        # Una captura de principios de agosto puede enseñar aún la temporada
        # anterior con una plantilla parecida: sus filas no valen.
        conn = _db()
        old = _html([(1, "11-10-2024", "09:00", "Las Rosas", 15, 0, "Las Majoreras")])
        plan = R.plan_group(conn, 10, [{"url": URL, "timestamp": "20250805000000",
                                        "jornadas": R.jornadas_from_html(old)}])
        assert plan["overrides"] == {}

    def test_the_round_must_match_even_for_a_single_pairing(self):
        # Una captura de otro grupo o de una copa puede repetir una pareja: sin
        # la misma jornada, ese marcador no es de este partido.
        conn = _db()
        moved = _html([(2, "11-10-2025", "09:00", "Las Rosas", 15, 0, "Las Majoreras")])
        plan = R.plan_group(conn, 10, [{"url": URL, "timestamp": "20260510024729",
                                        "jornadas": R.jornadas_from_html(moved)}])
        assert plan["overrides"] == {}

    def test_empty_scores_are_never_filled(self):
        # Rellenar un partido sin marcador completa el calendario de dos equipos
        # que hasta entonces no se comparaban: ese relleno no lo valida nada.
        conn = _db()
        conn.execute("INSERT INTO matches (id, group_id, jornada, home_team_id, away_team_id)"
                     " VALUES (103, 10, '4', 1, 3)")
        both = _html([(1, "11-10-2025", "09:00", "Las Rosas", 15, 0, "Las Majoreras"),
                      (4, "01-11-2025", "09:00", "Las Rosas", 2, 2, "San Pedro")])
        plan = R.plan_group(conn, 10, [{"url": URL, "timestamp": "20260510024729",
                                        "jornadas": R.jornadas_from_html(both)}])
        assert plan["overrides"] == {100: (15, 0)}
        assert plan["skipped_fills"] == 1

    def test_a_change_the_standings_contradict_is_discarded(self):
        # La captura también tiene erratas. El grupo mejora con las dos filas,
        # pero la tabla oficial cuadra justo sin la segunda: se descarta esa.
        conn = _db()
        typo = _html([(1, "11-10-2025", "09:00", "Las Rosas", 15, 0, "Las Majoreras"),
                      (3, "25-10-2025", "09:00", "Las Majoreras", 0, 0, "San Pedro")])
        plan = R.plan_group(conn, 10, [{"url": URL, "timestamp": "20260510024729",
                                        "jornadas": R.jornadas_from_html(typo)}])
        assert plan["overrides"] == {100: (15, 0)}
        assert [(d["match_id"], d["before"], d["proposed"]) for d in plan["discarded"]] == [(102, [1, 0], [0, 0])]
        assert (plan["before"], plan["after"], plan["accepted"]) == (20, 0, True)

    def test_a_name_nobody_recognises_pairs_by_its_calendar(self):
        # «Futbol2016» es «FUTBOL P.D.C. 2016, C.D.»: el parecido de nombres no
        # lo ve, pero juega contra los mismos rivales en las mismas jornadas.
        conn = _league()
        rows = [(j, "01-11-2025", "10:00", "Futbol2016" if h == "FUTBOL P.D.C. 2016, C.D." else h, gl, gv,
                 "Futbol2016" if a == "FUTBOL P.D.C. 2016, C.D." else a) for j, h, a, gl, gv in TRUE_LEAGUE]
        plan = R.plan_group(conn, 40, [{"url": URL, "timestamp": "20260510024729",
                                        "jornadas": R.jornadas_from_html(_html([(j, f, hr, h, gl, gv, a)
                                                                               for j, f, hr, h, gl, gv, a in rows]))}])
        assert plan["unmatched"] == []
        assert plan["overrides"] == {403: (12, 1), 405: (1, 10)}
        assert plan["after"] == 0

    def test_apply_writes_only_accepted_plans(self):
        conn = _db()
        good = R.plan_group(conn, 10, [{"url": URL, "timestamp": "20260510024729",
                                        "jornadas": R.jornadas_from_html(GOOD)}])
        rejected = dict(good, accepted=False, overrides={101: (9, 9)})
        assert R.apply_plans(conn, [good, rejected]) == 1
        assert conn.execute("SELECT home_score, away_score FROM matches WHERE id=100").fetchone() == (15, 0)
        assert conn.execute("SELECT home_score, away_score FROM matches WHERE id=101").fetchone() == (1, 1)


class TestApply:
    def test_a_checkpoint_that_cannot_finish_is_an_error(self, tmp_path):
        # Con otra conexión leyendo, el volcado no se completa y el cambio se
        # quedaría en futbolbase.db-wal, que git no sube.
        path = tmp_path / "wal.db"
        conn = sqlite3.connect(path, timeout=0.1)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        conn.execute("INSERT INTO seasons (id, name, start_year, end_year) VALUES (1, '2025-2026', 2025, 2026)")
        conn.commit()
        lector = sqlite3.connect(path, isolation_level=None)
        lector.execute("BEGIN")
        lector.execute("SELECT COUNT(*) FROM seasons").fetchone()
        conn.execute("UPDATE seasons SET is_current=1")
        with pytest.raises(RuntimeError, match="wal"):
            R.commit_and_checkpoint(conn)
        lector.execute("COMMIT")
        R.commit_and_checkpoint(conn)

    def test_manual_corrections_apply_once_and_name_their_match(self):
        conn = _db()
        fix = [{"season": "2025-2026", "category": "BENJAMIN", "group": "B4", "jornada": "1",
                "home": "Las Rosas", "away": "Las Majoreras", "score": [15, 0], "reason": "tabla oficial"}]
        applied = R.apply_corrections(conn, "2025-2026", fix)
        assert applied == [{"key": "2025-2026|BENJAMIN|B4", "match_id": 100, "jornada": "1",
                            "home": "Las Rosas", "away": "Las Majoreras", "before": [5, 0], "after": [15, 0],
                            "source": "corrección manual: tabla oficial"}]
        assert conn.execute("SELECT home_score, away_score FROM matches WHERE id=100").fetchone() == (15, 0)
        assert R.apply_corrections(conn, "2025-2026", fix) == []
        assert R.apply_corrections(conn, "2024-2025", fix) == []

    def test_a_correction_without_its_match_is_an_error(self):
        fix = [{"season": "2025-2026", "category": "BENJAMIN", "group": "B4", "jornada": "9",
                "home": "Las Rosas", "away": "Las Majoreras", "score": [15, 0], "reason": "x"}]
        with pytest.raises(ValueError, match="B4"):
            R.apply_corrections(_db(), "2025-2026", fix)

    def test_the_corrections_file_is_well_formed(self):
        for c in R.load_corrections():
            assert set(c) == {"season", "category", "group", "jornada", "home", "away", "score", "reason"}
            assert len(c["score"]) == 2 and all(isinstance(v, int) and v >= 0 for v in c["score"])

    def test_fetching_never_drops_saved_snapshots(self):
        # Con Wayback caído, --fetch devolvía [] y vaciaba las capturas guardadas.
        a = {"url": "https://a/", "timestamp": "20250101000000", "jornadas": {}}
        b = {"url": "https://a/", "timestamp": "20250301000000", "jornadas": {}}
        assert R.merge_snapshots([a], []) == [a]
        assert R.merge_snapshots([a], [b, dict(a)]) == [b, a]

    def test_the_report_keeps_earlier_changes_of_a_group(self):
        first = {"before": 20, "after": 10, "changes": [{"match_id": 1, "after": [15, 0]}], "discarded": []}
        plan = {"before": 10, "after": 0, "changes": [{"match_id": 2, "after": [1, 12]}],
                "discarded": [{"match_id": 3}]}
        merged = R.merge_report_group(first, plan)
        assert (merged["before"], merged["after"]) == (20, 0)
        assert [c["match_id"] for c in merged["changes"]] == [1, 2]
        assert [d["match_id"] for d in merged["discarded"]] == [3]


class TestPool:
    """Las URLs de futbolaspalmas se reutilizan cada temporada: una bolsa con
    todas las conocidas, asignando cada captura al grupo cuya plantilla casa."""

    def test_known_urls_come_from_every_season_and_local_raws(self, tmp_path, monkeypatch):
        conn = _db()
        conn.execute("INSERT INTO seasons (id, name, start_year, end_year) VALUES (2, '2024-2025', 2024, 2025)")
        conn.execute("INSERT INTO groups (id, season_id, category_id, code, url) "
                     "VALUES (30, 2, 1, 'P1', 'https://futbolaspalmas.com/1benjamin1/')")
        raw = tmp_path / "wayback_2425_raw.json"
        raw.write_text(json.dumps({"season": "2024-2025", "groups": [
            {"url": "https://futbolaspalmas.com/1prebenjamin1/", "standings": []}]}))
        monkeypatch.setattr(R, "ROOT", tmp_path.parent)
        monkeypatch.setattr(R, "_raw_files", lambda: [raw])
        assert R.known_urls(conn) == [
            "https://futbolaspalmas.com/1benjamin1/",
            "https://futbolaspalmas.com/1prebenjamin1/",
            "https://futbolaspalmas.com/benjamin-segunda-fase-b-cuatro/"]

    def test_assign_picks_snapshots_whose_squad_matches(self):
        conn = _db()
        other = _html([(1, "11-10-2025", "09:00", "Club X", 1, 0, "Club Y"),
                       (2, "18-10-2025", "09:00", "Club Z", 2, 2, "Club X")])
        pool = {"https://a/": [{"url": "https://a/", "timestamp": "20260510000000",
                                "jornadas": R.jornadas_from_html(GOOD)}],
                "https://b/": [{"url": "https://b/", "timestamp": "20260511000000",
                                "jornadas": R.jornadas_from_html(other)}]}
        assigned = R.assign_snapshots(conn, [10], pool)
        assert [s["url"] for s in assigned[10]] == ["https://a/"]

    def test_assign_keeps_the_most_recent_matching_snapshots(self):
        conn = _db()
        snaps = [{"url": "https://a/", "timestamp": ts, "jornadas": R.jornadas_from_html(GOOD)}
                 for ts in ("20260101000000", "20260301000000", "20260510000000")]
        assigned = R.assign_snapshots(conn, [10], {"https://a/": snaps}, keep=2)
        assert [s["timestamp"] for s in assigned[10]] == ["20260510000000", "20260301000000"]

    def test_assign_skips_other_categories_and_bigger_squads(self):
        conn = _db()
        other_cat = {"url": "https://futbolaspalmas.com/1prebenjamin2/", "timestamp": "20260510000000",
                     "jornadas": R.jornadas_from_html(GOOD)}
        bigger = _html([(1, "11-10-2025", "09:00", "Las Rosas", 15, 0, "Las Majoreras"),
                        (2, "18-10-2025", "09:00", "San Pedro", 1, 1, "Club X"),
                        (3, "25-10-2025", "09:00", "Club Y", 1, 0, "Club Z")])
        copa = {"url": "https://futbolaspalmas.com/copa-benjamin/", "timestamp": "20260511000000",
                "jornadas": R.jornadas_from_html(bigger)}
        assigned = R.assign_snapshots(conn, [10], {"a": [other_cat], "b": [copa]})
        assert assigned[10] == []
        assert R.url_category("https://futbolaspalmas.com/benjamin-segunda-fase-b-cuatro/") == "BENJAMIN"
        assert R.url_category("https://futbolaspalmas.com/1prebenjamin1/") == "PREBENJAMIN"
        assert R.url_category("https://futbolaspalmas.com/copa/") is None

    def test_one_failing_url_does_not_stop_the_pool(self):
        # Un 504 de Wayback en una consulta tumbaba toda la descarga de la
        # temporada y se perdían las capturas ya bajadas.
        cdx = json.dumps([["timestamp", "statuscode"], ["20260510000000", "200"]])

        def fake_get(url):
            if "cdx" in url and "rota" in url:
                raise RuntimeError("HTTP Error 504: Gateway Time-out")
            return cdx if "cdx" in url else GOOD

        pool = R.fetch_pool(["https://futbolaspalmas.com/rota/", "https://futbolaspalmas.com/buena/"],
                            "2025-2026", get=fake_get, pause=0)
        assert pool["https://futbolaspalmas.com/rota/"] == []
        assert [s["timestamp"] for s in pool["https://futbolaspalmas.com/buena/"]] == ["20260510000000"]
