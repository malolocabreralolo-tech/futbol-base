"""El marcador de FIFLP se lee como lo PINTA el navegador (2026-10-03).

Casos copiados del volcado real de la Liga Benjamín de Lanzarote 2026-27
(debug-fiflp-copa.yml con scores=1): texto visible + dígito pintado por CSS
('2<i class="fa-1">' se ve «21»), señuelos display:none y el 4.º argumento de
ntype, que tampoco cuenta. El lector anterior daba 1 en el primer caso.
"""
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

sync_api = pytest.importorskip("playwright.sync_api")

CSS = "".join(f'.fa-{d}::before{{content:"{d}"}}' for d in range(10)) + '.once::before{content:"\\0031\\0031"}'
CASES = [
    # (html de los dos spans, marcador que ve una persona)
    ('<i class="fa-solid">2<i id="a" style="font-style:normal" class="fa-1"><script>ntype("a",4,0,"fa-22");</script>'
     '<span style="display:none;">22</span></i></i> -',
     '<i class="fa-solid"><i id="b" style="font-style:normal" class="fa-1"><script>ntype("b",4,0,"fa-0");</script>'
     '<span style="display:none;">0</span></i></i>', (21, 1)),
    ('<i class="fa-solid"><i id="c" class="fa-5"><script>ntype("c",1,0,"fa-7");</script><span style="display:none;">7</span></i></i> -',
     '<i class="fa-solid"><i id="d" class="fa-1"><span style="display:none;">1</span></i></i>', (5, 1)),
    ('3 -', '<span style="visibility:hidden">9</span>0', (3, 0)),
    ('<i class="once"></i> -', '<i class="fa-solid">1<span style="font-size:0">8</span>2</i>', (11, 12)),
]


def test_scores_are_read_as_rendered():
    import fetch_fiflp_2425 as F
    try:
        with sync_api.sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            rows = "".join(f'<tr><td>L</td><td id="c{i}"><span class="wid2_resultado_cerrada ntype">{h}</span>'
                           f'<span class="wid2_resultado_cerrada ntype">{a}</span></td><td>V</td></tr>'
                           for i, (h, a, _) in enumerate(CASES))
            page.set_content(f"<style>{CSS}</style><table>{rows}</table>")
            got = [tuple(F._scores_from_browser(page.query_selector(f"#c{i}"))) for i in range(len(CASES))]
            browser.close()
    except Exception as e:                       # sin Chromium instalado
        pytest.skip(f"sin navegador: {e}")
    assert got == [want for _, _, want in CASES]
