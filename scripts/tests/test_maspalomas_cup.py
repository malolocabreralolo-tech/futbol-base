"""TDD — generador de la Maspalomas Cup (`fetch_maspalomas_cup.py`).

Contexto del bug que estos tests fijan: el script generaba
`const MASPALOMAS_CUP_2026 = {categoría: [partidos]}` mientras lo publicado y lo
que lee `src/state.js` son `MASPALOMAS_CUP_BENJAMIN` / `_PREBENJAMIN` (grupos con
clasificación, partidos y cuadros). El paso de transformación se hizo a mano y no
se guardó, así que re-ejecutar el scraper rompía la web. El test dorado
(`TestGoldenRegeneration`) garantiza que script y fichero publicado no vuelvan a
divergir: regenera desde el raw trackeado y compara con lo que hay en el repo.

La API no expone ni grupo ni ronda: la estructura se deduce del `matchNumber`.
"""
import datetime
import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

RAW_PATH = ROOT / "scripts" / "maspalomas_cup_2026_raw.json"
JS_PATH = ROOT / "data-maspalomas-cup-2026.js"


def _match(n, day="26/06", time="10:00", home="A", away="B", hs=1, as_=0,
           field="Campo CD 1.1 - Campo Joma 1"):
    """Partido ya normalizado, como los que manejan los helpers internos."""
    d = datetime.datetime.strptime(f"2026-{day[3:]}-{day[:2]} {time}",
                                   "%Y-%m-%d %H:%M")
    return {"n": n, "kickoff": d, "day": day, "time": time,
            "date_key": d.strftime("%d-%m-%Y"), "home": home, "away": away,
            "hs": hs, "as": as_, "field": field}


class TestShortField:
    def test_strips_prefix_and_sponsor_suffix(self):
        from fetch_maspalomas_cup import short_field
        assert short_field("Campo CD 3.1 - Campo Danone 1") == "CD 3.1"
        assert short_field("Campo CD 1.1 - Campo Joma 1") == "CD 1.1"

    def test_tolerates_missing_parts(self):
        from fetch_maspalomas_cup import short_field
        assert short_field("CD 2.1") == "CD 2.1"
        assert short_field("") == ""
        assert short_field(None) == ""


class TestStandings:
    def test_points_and_canonical_columns(self):
        from fetch_maspalomas_cup import standings_from
        table = standings_from([
            _match(1, home="X", away="Y", hs=3, as_=0),
            _match(2, home="Y", away="Z", hs=1, as_=1),
            _match(3, home="X", away="Z", hs=2, as_=2),
        ])
        # [pos, equipo, pts, J, G, E, P, GF, GC, DF]
        assert table[0] == [1, "X", 4, 2, 1, 1, 0, 5, 2, 3]
        assert [r[1] for r in table] == ["X", "Z", "Y"]
        assert all(len(r) == 10 for r in table)

    def test_tiebreak_goal_difference_then_goals_for(self):
        from fetch_maspalomas_cup import standings_from
        # Ambos ganan 1 partido: mismo puntos, decide diferencia y luego GF.
        table = standings_from([
            _match(1, home="P", away="Q", hs=5, as_=0),
            _match(2, home="R", away="S", hs=1, as_=0),
        ])
        assert [r[1] for r in table[:2]] == ["P", "R"]

    def test_ignores_unplayed_matches(self):
        from fetch_maspalomas_cup import standings_from
        table = standings_from([_match(1, hs=None, as_=None)])
        assert table == []


class TestSplitRounds:
    """Las rondas se cortan por matchNumber desde la final hacia atrás."""

    def test_full_bracket_is_named_and_ordered(self):
        from fetch_maspalomas_cup import split_rounds
        rounds = split_rounds([_match(n) for n in range(1, 16)])  # 8+4+2+1
        assert [name for name, _ in rounds] == [
            "Octavos", "Cuartos", "Semifinales", "Final"]
        assert [len(ms) for _, ms in rounds] == [8, 4, 2, 1]

    def test_leftover_at_the_start_is_a_preliminary_round_first(self):
        from fetch_maspalomas_cup import split_rounds
        # 33 = 2 previa + 16 + 8 + 4 + 2 + 1 (caso real de benjamín 2026)
        rounds = split_rounds([_match(n) for n in range(2201, 2234)])
        assert [name for name, _ in rounds] == [
            "Previa", "Dieciseisavos", "Octavos", "Cuartos",
            "Semifinales", "Final"]
        assert [len(ms) for _, ms in rounds] == [2, 16, 8, 4, 2, 1]
        # La previa es la de números MÁS BAJOS y va la primera.
        assert [m["n"] for m in rounds[0][1]] == [2201, 2202]
        assert [m["n"] for m in rounds[-1][1]] == [2233]

    def test_partial_first_round_is_previa_not_a_full_round_name(self):
        from fetch_maspalomas_cup import split_rounds
        # 11 = 4 + 4 + 2 + 1: los 4 primeros NO son unos octavos completos
        # (bracket de 12 equipos con 4 exentos), así que son ronda previa.
        rounds = split_rounds([_match(n) for n in range(1101, 1112)])
        assert [name for name, _ in rounds] == [
            "Previa", "Cuartos", "Semifinales", "Final"]

    def test_matches_within_a_round_are_ordered_by_kickoff(self):
        from fetch_maspalomas_cup import split_rounds
        # El matchNumber no sigue el orden de juego dentro de una ronda.
        ms = [_match(1, time="11:00"), _match(2, time="08:00"),
              _match(3, time="09:00"), _match(4, time="10:00"),
              _match(5, time="12:00"), _match(6, time="13:00"),
              _match(7, time="14:00")]
        rounds = split_rounds(ms)
        first_round = rounds[0][1]
        assert [m["time"] for m in first_round] == ["08:00", "09:00",
                                                    "10:00", "11:00"]


class TestStructureValidation:
    """Ante un torneo con otro formato, abortar en vez de publicar basura."""

    def test_wrong_group_stage_size_raises(self):
        from fetch_maspalomas_cup import StructureError, build_group_stage
        # Prebenjamín espera 6 grupos × 6 partidos = 36; le damos 12.
        matches = [_match(1000 + i) for i in range(1, 13)]
        with pytest.raises(StructureError, match="fase de grupos"):
            build_group_stage(matches, "Prebenjamín", "MCP")

    def test_group_without_round_robin_shape_raises(self):
        from fetch_maspalomas_cup import StructureError, build_group_stage
        # 36 partidos pero todos entre los mismos 2 equipos: no es round-robin.
        matches = [_match(1000 + i, home="A", away="B") for i in range(1, 37)]
        with pytest.raises(StructureError, match="round-robin"):
            build_group_stage(matches, "Prebenjamín", "MCP")

    def test_unexpected_number_of_cups_raises(self):
        from fetch_maspalomas_cup import (StructureError, build_cups,
                                          build_group_stage)
        raw = json.loads(RAW_PATH.read_text(encoding="utf-8"))
        from fetch_maspalomas_cup import normalize
        matches = [normalize(m) for m in raw
                   if m.get("categoryName") == "Prebenjamín"]
        groups, stage = build_group_stage(matches, "Prebenjamín", "MCP")
        # Un tercer bloque de eliminatorias no encaja con Oro/Plata.
        extra = matches + [_match(1301), _match(1302)]
        with pytest.raises(StructureError, match="cuadros"):
            build_cups(extra, "Prebenjamín", "MCP", stage, groups)


class TestGoldenRegeneration:
    """El .js publicado tiene que ser exactamente lo que produce el script.

    Si este test se pone rojo: o el raw cambió (re-scrape legítimo → regenerar
    y commitear el .js) o alguien editó el .js a mano (no se hace).
    """

    def test_regenerating_from_raw_matches_published_js(self):
        from fetch_maspalomas_cup import build_all, render_js
        raw = json.loads(RAW_PATH.read_text(encoding="utf-8"))
        generated = render_js(build_all(raw))
        published = JS_PATH.read_text(encoding="utf-8")
        # La línea 2 es la fecha de generación; el resto tiene que coincidir.
        assert generated.split("\n")[2:] == published.split("\n")[2:]

    def test_published_declares_the_variables_state_js_reads(self):
        published = JS_PATH.read_text(encoding="utf-8")
        state = (ROOT / "src" / "state.js").read_text(encoding="utf-8")
        for var in ("MASPALOMAS_CUP_BENJAMIN", "MASPALOMAS_CUP_PREBENJAMIN"):
            assert f"const {var} =" in published, f"{var} no se declara"
            assert var in state, f"{var} ya no se usa en state.js"


class TestPublishedContent:
    """Regresiones concretas que llegaron a producción el 28/06/2026."""

    def _groups(self, var):
        src = JS_PATH.read_text(encoding="utf-8")
        m = re.search(r"const " + var + r" = (\[.*?\]);", src, re.DOTALL)
        return json.loads(m.group(1))

    def test_no_leftover_from_the_botched_oro_plata_rename(self):
        for var in ("MASPALOMAS_CUP_BENJAMIN", "MASPALOMAS_CUP_PREBENJAMIN"):
            names = [g["name"] for g in self._groups(var)]
            assert "Copa Orotmp" not in names, "quedó el sed a medias"

    def test_each_category_has_exactly_one_oro_and_one_plata(self):
        for var in ("MASPALOMAS_CUP_BENJAMIN", "MASPALOMAS_CUP_PREBENJAMIN"):
            names = [g["name"] for g in self._groups(var) if g.get("jornadas")]
            assert sorted(names) == ["Copa Oro", "Copa Plata"]

    def test_gold_cup_holds_the_group_winners(self):
        for var in ("MASPALOMAS_CUP_BENJAMIN", "MASPALOMAS_CUP_PREBENJAMIN"):
            groups = self._groups(var)
            winners = {g["standings"][0][1] for g in groups if g["standings"]}
            gold = next(g for g in groups if g["name"] == "Copa Oro")
            teams = {t for row in gold["matches"] for t in (row[2], row[3])}
            silver = next(g for g in groups if g["name"] == "Copa Plata")
            s_teams = {t for row in silver["matches"] for t in (row[2], row[3])}
            assert len(winners & teams) > len(winners & s_teams)

    def test_rounds_are_in_playing_order_ending_in_the_final(self):
        order = ["Previa", "Dieciseisavos", "Octavos", "Cuartos",
                 "Semifinales", "Final"]
        for var in ("MASPALOMAS_CUP_BENJAMIN", "MASPALOMAS_CUP_PREBENJAMIN"):
            for g in self._groups(var):
                if not g.get("jornadas"):
                    continue
                names = [re.search(r"\( (.+) \)", k).group(1)
                         for k in g["jornadas"]]
                assert names == sorted(names, key=order.index), \
                    f"{g['id']}: rondas desordenadas {names}"
                assert names[-1] == "Final"
                # Cada ronda tiene la mitad de partidos que la anterior
                # (salvo la previa, que es incompleta por definición).
                sizes = [len(v) for v in g["jornadas"].values()]
                full = sizes[1:] if names[0] == "Previa" else sizes
                assert full == [2 ** i for i in range(len(full) - 1, -1, -1)], \
                    f"{g['id']}: tamaños de ronda raros {sizes}"

    def test_no_orphan_round_label(self):
        # 'Ronda 6' era la etiqueta sin sentido que recibía la ronda previa.
        src = JS_PATH.read_text(encoding="utf-8")
        assert "Ronda 6" not in src
