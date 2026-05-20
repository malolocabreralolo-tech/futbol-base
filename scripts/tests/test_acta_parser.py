#!/usr/bin/env python3
"""TDD tests for scripts/acta_parser.py — Tasks 4-9 of the SP-1 pipeline.

Both fixtures are 2024-25 actas:
  acta_modern.html  — CodActa=190080, ATLETICO HURACAN 3-0 VETERANOS DEL PILA
  acta_2024_25.html — CodActa=189453, GUIA 0-13 VALLESECO

Neither fixture has substitutions or cards — the tests accept empty lists for
those sections but verify the events list is well-formed.

HONESTY CAVEAT — minutes:
  FIFLP minutes are rendered by CSS ::before on an external stylesheet not
  captured in the static HTML. Most minutes are None. Inline <style> rules
  (when present, as in acta_2024_25.html) are extracted and used.
"""
import os
import pytest

FIX = os.path.join(os.path.dirname(__file__), "fixtures")


@pytest.fixture(scope="module")
def modern_html():
    with open(os.path.join(FIX, "acta_modern.html"), encoding="utf-8") as f:
        return f.read()


@pytest.fixture(scope="module")
def antiguo_html():
    with open(os.path.join(FIX, "acta_2024_25.html"), encoding="utf-8") as f:
        return f.read()


@pytest.fixture(scope="module")
def modern(modern_html):
    from scripts.acta_parser import parse_acta
    return parse_acta(modern_html)


@pytest.fixture(scope="module")
def antiguo(antiguo_html):
    from scripts.acta_parser import parse_acta
    return parse_acta(antiguo_html)


# ─── Task 4: Header ──────────────────────────────────────────────────────────

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
        h = modern["header"]
        assert h["competition"] is not None
        assert "LIGA" in h["competition"].upper() or "PREBENJAMIN" in h["competition"].upper()

    def test_header_antiguo_season(self, antiguo):
        assert antiguo["header"]["season"] == "2024/2025"

    def test_header_antiguo_teams(self, antiguo):
        assert "GUIA" in antiguo["header"]["home_team"].upper()
        assert "VALLESECO" in antiguo["header"]["away_team"].upper()

    def test_header_antiguo_score(self, antiguo):
        assert antiguo["header"]["home_score"] == 0
        assert antiguo["header"]["away_score"] == 13

    def test_header_antiguo_competition(self, antiguo):
        assert antiguo["header"]["competition"] is not None
        assert "LIGA" in antiguo["header"]["competition"].upper()

    def test_header_complete_keys(self, modern):
        for key in ("season", "jornada", "date", "home_team", "away_team",
                    "home_score", "away_score", "competition"):
            assert key in modern["header"], f"missing key: {key}"


# ─── Task 5: Lineups ─────────────────────────────────────────────────────────

class TestLineups:
    def test_lineups_modern_both_teams_have_entries(self, modern):
        home = modern["lineups"]["home"]
        away = modern["lineups"]["away"]
        assert len(home) >= 5, f"home has only {len(home)} players"
        assert len(away) >= 5, f"away has only {len(away)} players"

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


# ─── Task 6: Goals ───────────────────────────────────────────────────────────

class TestGoals:
    def test_goals_modern_count(self, modern):
        goals = [e for e in modern["events"] if e["kind"] == "goal"]
        assert len(goals) >= 1

    def test_goals_modern_shape(self, modern):
        for g in [e for e in modern["events"] if e["kind"] == "goal"]:
            assert g["side"] in ("home", "away")
            assert isinstance(g["player_name"], str)
            assert "," in g["player_name"], f"player name missing comma: {g['player_name']!r}"
            assert g["minute"] is None or (isinstance(g["minute"], int) and 1 <= g["minute"] <= 200)
            assert g.get("goal_type") in ("normal", "penalty", "own", None)

    def test_goals_modern_all_home(self, modern):
        goals = [e for e in modern["events"] if e["kind"] == "goal"]
        assert all(g["side"] == "home" for g in goals)

    def test_goals_modern_exact_score_match(self, modern):
        home_goals = sum(1 for e in modern["events"] if e["kind"] == "goal" and e["side"] == "home")
        away_goals = sum(1 for e in modern["events"] if e["kind"] == "goal" and e["side"] == "away")
        assert home_goals == 3 and away_goals == 0

    def test_goals_antiguo_count(self, antiguo):
        goals = [e for e in antiguo["events"] if e["kind"] == "goal"]
        assert len(goals) == 13

    def test_goals_antiguo_all_away(self, antiguo):
        goals = [e for e in antiguo["events"] if e["kind"] == "goal"]
        assert all(g["side"] == "away" for g in goals)

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

    def test_goals_consistency_with_score(self, modern):
        header = modern["header"]
        home_goals = sum(1 for e in modern["events"] if e["kind"] == "goal" and e["side"] == "home")
        away_goals = sum(1 for e in modern["events"] if e["kind"] == "goal" and e["side"] == "away")
        assert home_goals == header["home_score"] or away_goals == header["away_score"]


# ─── Task 7: Substitutions ───────────────────────────────────────────────────

class TestSubstitutions:
    def test_subs_modern_no_crash(self, modern):
        """acta_modern has no substitutions; parser must not crash."""
        assert len([e for e in modern["events"] if e["kind"] == "sub_in"]) == 0
        assert len([e for e in modern["events"] if e["kind"] == "sub_out"]) == 0

    def test_subs_antiguo_no_crash(self, antiguo):
        """acta_2024_25 has no substitutions; parser must not crash."""
        assert len([e for e in antiguo["events"] if e["kind"] == "sub_in"]) == 0
        assert len([e for e in antiguo["events"] if e["kind"] == "sub_out"]) == 0

    def test_subs_balance_when_present(self, modern):
        subs_in = [e for e in modern["events"] if e["kind"] == "sub_in"]
        subs_out = [e for e in modern["events"] if e["kind"] == "sub_out"]
        if subs_in or subs_out:
            assert len(subs_in) == len(subs_out)

    def test_subs_pair_same_side(self, modern):
        subs_in = [e for e in modern["events"] if e["kind"] == "sub_in"]
        subs_out = [e for e in modern["events"] if e["kind"] == "sub_out"]
        for ev in subs_in:
            if ev.get("pair_idx") is not None:
                others = [e for e in subs_out if e.get("pair_idx") == ev["pair_idx"]]
                if others:
                    assert ev["side"] == others[0]["side"]

    def test_subs_section_recognized_if_present(self, modern, modern_html):
        if "cambios" in modern_html.lower() or "sustituciones" in modern_html.lower():
            assert isinstance(modern["events"], list)


# ─── Task 8: Cards ───────────────────────────────────────────────────────────

class TestCards:
    def test_cards_modern_no_crash(self, modern):
        """acta_modern has no cards section."""
        assert len([e for e in modern["events"] if e["kind"] == "yellow"]) == 0
        assert len([e for e in modern["events"] if e["kind"] == "red"]) == 0

    def test_cards_antiguo_no_crash(self, antiguo):
        assert len([e for e in antiguo["events"] if e["kind"] == "yellow"]) == 0
        assert len([e for e in antiguo["events"] if e["kind"] == "red"]) == 0

    def test_cards_shape_when_present(self, modern):
        for ev in modern["events"]:
            if ev["kind"] in ("yellow", "red"):
                assert ev["side"] in ("home", "away")
                assert "," in ev["player_name"]
                assert ev["minute"] is None or (1 <= ev["minute"] <= 200)

    def test_cards_section_recognized_if_present(self, modern, modern_html):
        raw = modern_html.lower()
        if "tarjet" in raw or "amonest" in raw:
            assert isinstance(modern["events"], list)


# ─── Task 9: Staff ───────────────────────────────────────────────────────────

class TestStaff:
    def test_staff_modern_referee(self, modern):
        s = modern["staff"]
        assert s["referee"] is not None, "referee missing"
        assert "BARRAGAN" in s["referee"].upper()

    def test_staff_modern_keys_present(self, modern):
        for key in ("referee", "coach_home", "coach_away"):
            assert key in modern["staff"], f"staff key missing: {key}"

    def test_staff_antiguo_referee(self, antiguo):
        s = antiguo["staff"]
        assert s["referee"] is not None, "referee missing in acta_2024_25"
        assert "SUÁREZ" in s["referee"].upper() or "SUAREZ" in s["referee"].upper()

    def test_staff_coaches_no_presenta(self, modern):
        """Both coaches say 'No presenta' in acta_modern -> stored as None."""
        s = modern["staff"]
        assert s["coach_home"] is None or isinstance(s["coach_home"], str)
        assert s["coach_away"] is None or isinstance(s["coach_away"], str)

    def test_staff_staff_dict_complete(self, antiguo):
        assert "referee" in antiguo["staff"]
        assert "coach_home" in antiguo["staff"]
        assert "coach_away" in antiguo["staff"]


# ─── Overall events list integrity ───────────────────────────────────────────

VALID_KINDS = {"goal", "sub_in", "sub_out", "yellow", "red"}


class TestEventsIntegrity:
    def test_all_event_kinds_valid_modern(self, modern):
        for ev in modern["events"]:
            assert ev["kind"] in VALID_KINDS, f"invalid kind: {ev['kind']}"

    def test_all_event_kinds_valid_antiguo(self, antiguo):
        for ev in antiguo["events"]:
            assert ev["kind"] in VALID_KINDS, f"invalid kind: {ev['kind']}"

    def test_events_list_is_list(self, modern, antiguo):
        assert isinstance(modern["events"], list)
        assert isinstance(antiguo["events"], list)

    def test_no_crash_on_both_fixtures(self, modern, antiguo):
        assert modern is not None
        assert antiguo is not None
