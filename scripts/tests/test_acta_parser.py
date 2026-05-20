#!/usr/bin/env python3
"""Tests for T4-T7: header + lineups + goals + substitutions."""
import os
import pytest
FIX = os.path.join(os.path.dirname(__file__), "fixtures")

@pytest.fixture(scope="module")
def modern():
    from scripts.acta_parser import parse_acta
    with open(os.path.join(FIX, "acta_modern.html"), encoding="utf-8") as f:
        return parse_acta(f.read())

@pytest.fixture(scope="module")
def antiguo():
    from scripts.acta_parser import parse_acta
    with open(os.path.join(FIX, "acta_2024_25.html"), encoding="utf-8") as f:
        return parse_acta(f.read())

@pytest.fixture(scope="module")
def modern_html():
    with open(os.path.join(FIX, "acta_modern.html"), encoding="utf-8") as f:
        return f.read()


class TestHeader:
    def test_header_modern_season(self, modern):
        assert modern["header"]["season"] == "2024/2025"

    def test_header_modern_jornada(self, modern):
        assert modern["header"]["jornada"] == "1"

    def test_header_modern_date(self, modern):
        assert modern["header"]["date"] == "26-10-2024"

    def test_header_modern_teams(self, modern):
        assert "ATLETICO HURACAN" in modern["header"]["home_team"]
        assert "VETERANOS DEL PILA" in modern["header"]["away_team"]

    def test_header_modern_score(self, modern):
        assert modern["header"]["home_score"] == 3
        assert modern["header"]["away_score"] == 0

    def test_header_modern_competition(self, modern):
        assert modern["header"]["competition"] is not None

    def test_header_antiguo_season(self, antiguo):
        assert antiguo["header"]["season"] == "2024/2025"

    def test_header_antiguo_teams(self, antiguo):
        assert "GUIA" in antiguo["header"]["home_team"].upper()
        assert "VALLESECO" in antiguo["header"]["away_team"].upper()

    def test_header_antiguo_score(self, antiguo):
        assert antiguo["header"]["home_score"] == 0
        assert antiguo["header"]["away_score"] == 13

    def test_header_complete_keys(self, modern):
        for key in ("season", "jornada", "date", "home_team", "away_team",
                    "home_score", "away_score", "competition"):
            assert key in modern["header"]


class TestLineups:
    def test_lineups_modern_both_teams_have_entries(self, modern):
        assert len(modern["lineups"]["home"]) >= 5
        assert len(modern["lineups"]["away"]) >= 5

    def test_lineups_modern_player_shape(self, modern):
        for p in modern["lineups"]["home"] + modern["lineups"]["away"]:
            assert "dorsal" in p
            assert "name" in p and len(p["name"]) > 0
            assert p["role"] in ("starter", "sub")
            assert p["dorsal"] is None or (isinstance(p["dorsal"], int) and p["dorsal"] > 0)

    def test_lineups_modern_has_starters_and_subs(self, modern):
        home = modern["lineups"]["home"]
        away = modern["lineups"]["away"]
        assert any(p["role"] == "starter" for p in home)
        assert any(p["role"] == "sub" for p in home)
        assert any(p["role"] == "starter" for p in away)
        assert any(p["role"] == "sub" for p in away)

    def test_lineups_modern_known_players(self, modern):
        home_names = [p["name"] for p in modern["lineups"]["home"]]
        assert any("ACOSTA ARTILES" in n for n in home_names)
        away_names = [p["name"] for p in modern["lineups"]["away"]]
        assert any("SANTANA MARTIN" in n for n in away_names)

    def test_lineups_antiguo_both_teams(self, antiguo):
        assert len(antiguo["lineups"]["home"]) >= 5
        assert len(antiguo["lineups"]["away"]) >= 5

    def test_lineups_antiguo_known_players(self, antiguo):
        away_names = [p["name"] for p in antiguo["lineups"]["away"]]
        assert any("CABRERA RIVERO" in n for n in away_names)


class TestGoals:
    def test_goals_modern_count(self, modern):
        assert len([e for e in modern["events"] if e["kind"] == "goal"]) >= 1

    def test_goals_modern_shape(self, modern):
        for g in [e for e in modern["events"] if e["kind"] == "goal"]:
            assert g["side"] in ("home", "away")
            assert "," in g["player_name"]
            assert g["minute"] is None or (isinstance(g["minute"], int) and 1 <= g["minute"] <= 200)
            assert g.get("goal_type") in ("normal", "penalty", "own", None)

    def test_goals_modern_exact_score_match(self, modern):
        home_goals = sum(1 for e in modern["events"] if e["kind"] == "goal" and e["side"] == "home")
        away_goals = sum(1 for e in modern["events"] if e["kind"] == "goal" and e["side"] == "away")
        assert home_goals == 3 and away_goals == 0

    def test_goals_antiguo_exact_score_match(self, antiguo):
        home_goals = sum(1 for e in antiguo["events"] if e["kind"] == "goal" and e["side"] == "home")
        away_goals = sum(1 for e in antiguo["events"] if e["kind"] == "goal" and e["side"] == "away")
        assert home_goals == 0 and away_goals == 13

    def test_goals_known_scorer_modern(self, modern):
        names = [g["player_name"] for g in modern["events"] if g["kind"] == "goal"]
        assert any("OJEDA DELGADO" in n for n in names)

    def test_goals_known_scorer_antiguo(self, antiguo):
        names = [g["player_name"] for g in antiguo["events"] if g["kind"] == "goal"]
        assert any("CABRERA RIVERO" in n for n in names)


class TestSubstitutions:
    def test_subs_modern_no_crash(self, modern):
        """acta_modern has no substitutions — parser must not crash."""
        subs_in = [e for e in modern["events"] if e["kind"] == "sub_in"]
        subs_out = [e for e in modern["events"] if e["kind"] == "sub_out"]
        assert len(subs_in) == 0
        assert len(subs_out) == 0

    def test_subs_antiguo_no_crash(self, antiguo):
        """acta_2024_25 has no substitutions — parser must not crash."""
        subs_in = [e for e in antiguo["events"] if e["kind"] == "sub_in"]
        subs_out = [e for e in antiguo["events"] if e["kind"] == "sub_out"]
        assert len(subs_in) == 0
        assert len(subs_out) == 0

    def test_subs_balance_when_present(self, modern):
        """When subs exist, sub_in count must equal sub_out count."""
        subs_in = [e for e in modern["events"] if e["kind"] == "sub_in"]
        subs_out = [e for e in modern["events"] if e["kind"] == "sub_out"]
        if subs_in or subs_out:
            assert len(subs_in) == len(subs_out)

    def test_subs_pair_same_side(self, modern):
        """pair_idx: sub_in and sub_out with same pair_idx must be same side."""
        subs_in = [e for e in modern["events"] if e["kind"] == "sub_in"]
        subs_out = [e for e in modern["events"] if e["kind"] == "sub_out"]
        for ev in subs_in:
            if ev.get("pair_idx") is not None:
                others = [e for e in subs_out if e.get("pair_idx") == ev["pair_idx"]]
                if others:
                    assert ev["side"] == others[0]["side"]

    def test_subs_section_recognized_if_present(self, modern, modern_html):
        """If 'Cambios'/'Sustituciones' is in the fixture, no crash."""
        if "cambios" in modern_html.lower() or "sustituciones" in modern_html.lower():
            assert isinstance(modern["events"], list)
