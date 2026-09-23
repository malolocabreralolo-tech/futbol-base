"""Reparación de marcadores con capturas de futbolaspalmas en Wayback (plan A2).

Todo se prueba sin red: las llamadas a Wayback reciben una función `get` falsa.
"""
import json
import sqlite3
import sys
from pathlib import Path

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
        assert plan["after"] > plan["before"]

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

    def test_apply_writes_only_accepted_plans(self):
        conn = _db()
        good = R.plan_group(conn, 10, [{"url": URL, "timestamp": "20260510024729",
                                        "jornadas": R.jornadas_from_html(GOOD)}])
        rejected = dict(good, accepted=False, overrides={101: (9, 9)})
        assert R.apply_plans(conn, [good, rejected]) == 1
        assert conn.execute("SELECT home_score, away_score FROM matches WHERE id=100").fetchone() == (15, 0)
        assert conn.execute("SELECT home_score, away_score FROM matches WHERE id=101").fetchone() == (1, 1)
