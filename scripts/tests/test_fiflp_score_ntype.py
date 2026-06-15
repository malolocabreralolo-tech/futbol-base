"""TDD — _extract_score_from_html decodifica el ntype packed correctamente.

Bug (revisión cups 2025-26): las páginas knockout de FIFLP ofuscan el marcador
con `ntype(id, n, i, oldClass)`, que cambia la clase del elemento a
`fa-D[(i*10)+n]` (D = misma tabla que las actas). El extractor capturaba el 4º
argumento (`"fa-X"` = la clase VIEJA/decoy) en vez de decodificar n,i → daba
marcadores invertidos/erróneos (la final FASE A salía 1-0 en vez de 0-1).

HTML real del dump (debug_fiflp_copa.json, 2026-06-15) de la final FASE A:
  span0 (ACODETTI): ntype("idh4877",5,0,"fa-1") → D[5]=0
  span1 (PALMAS):   ntype("idh4878",4,0,"fa-0") → D[4]=1
Real: ACODETTI 0 - 1 PALMAS (PALMAS ganó, coincide con el tag (Ganador)).
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

FASE_A_FINAL = (
    "<h4><strong> "
    '<span class="wid2_resultado_cerrada ntype">'
    '<i class="fa-solid"></i><i class="fa-0"></i>'
    '<script>ntype("idh4877",5,0,"fa-1");</script><span>1</span></span> '
    '<span class="wid2_resultado_cerrada ntype">'
    '<i class="fa-solid">1</i><i class="fa-1"></i>'
    '<script>ntype("idh4878",4,0,"fa-0");</script><span>0</span></span> '
    "</strong></h4>"
)


def test_decodes_ntype_not_decoy_4th_arg():
    from fetch_fiflp_2425 import _extract_score_from_html
    # decoy 4th args dirían (1, 0); la decodificación real es (0, 1)
    assert _extract_score_from_html(FASE_A_FINAL) == (0, 1)


def test_multi_digit_concatenates_ntype_digits():
    from fetch_fiflp_2425 import _extract_score_from_html
    # home = dos dígitos: D[0]=2 y D[(1*10)+1]=D[11]=3 -> "23"; away = D[5]=0
    html = (
        "<strong>"
        '<span class="wid2_resultado_cerrada ntype">'
        '<script>ntype("a",0,0,"fa-9");</script>'
        '<script>ntype("b",1,1,"fa-9");</script></span>'
        '<span class="wid2_resultado_cerrada ntype">'
        '<script>ntype("c",5,0,"fa-9");</script></span>'
        "</strong>"
    )
    assert _extract_score_from_html(html) == (23, 0)


def test_plain_digit_still_works():
    # las páginas de liga normales usan <i class="fa-solid">N</i> (no ntype)
    from fetch_fiflp_2425 import _extract_score_from_html
    html = (
        "<strong>"
        '<span class="wid2_resultado_cerrada"><i class="fa-solid">3</i></span>'
        '<span class="wid2_resultado_cerrada"><i class="fa-solid">2</i></span>'
        "</strong>"
    )
    assert _extract_score_from_html(html) == (3, 2)
