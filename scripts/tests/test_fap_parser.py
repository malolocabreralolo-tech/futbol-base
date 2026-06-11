"""parse_standings de fetch_futbolaspalmas.py — formato HTML 2026-06.

La fuente cambió su markup (~25/4/2026): nombres en .fw-bolderr, puntos en
.text-warning-emphasis y stats en filas .contenedor__item con divs
.borderr-start [J,G,E,P,GF,GC,DF] (+ desglose casa/fuera que se ignora).
El formato viejo (fw-bolder / fw-bold bg-* / border-start) queda como fallback.
Fixture real: clasi_fap_2026-06.html (1prebenjamin1, capturado 2026-06-11).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fetch_futbolaspalmas import parse_standings

FIXTURE = Path(__file__).parent / "fixtures" / "clasi_fap_2026-06.html"


def _rows():
    return parse_standings(FIXTURE.read_text())


def test_parses_all_teams():
    rows = _rows()
    assert len(rows) == 15


def test_first_row_is_moya():
    # [pos, team, pts, J, G, E, P, GF, GC, DF]
    assert _rows()[0] == [1, "UD Moya", 72, 28, 24, 0, 4, 150, 76, 74]


def test_atalaya_official_row():
    rows = _rows()
    atalaya = next(r for r in rows if r[1] == "UD Atalaya")
    assert atalaya[0] == 4 and atalaya[2] == 52


def test_rows_internally_consistent():
    for pos, team, pts, j, g, e, p, gf, gc, df in _rows():
        assert j == g + e + p, f"{team}: J {j} != {g}+{e}+{p}"
        assert df == gf - gc, f"{team}: DF {df} != {gf}-{gc}"
        # pts pueden diferir de 3g+e por sanciones — solo cota superior
        assert pts <= 3 * g + e, f"{team}: pts {pts} > 3G+E"
