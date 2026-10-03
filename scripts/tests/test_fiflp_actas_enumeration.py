"""El enumerador de actas de temporadas pasadas va por URL directa (2026-10):
elegir grupo con select_option sobre el formulario OCULTO de FIFLP daba timeout
en todos los grupos salvo el primero."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
import scripts.fetch_fiflp_actas as A


class Page:
    def __init__(self):
        self.url, self.urls = "", []
    def evaluate(self, js, *a):
        if 'name="grupo"' in js:
            return ["G1", "G2"]
        if 'name="jornada"' in js:
            return ["1", "2"]
        return []
    def select_option(self, *a, **k):
        raise AssertionError("select_option sobre el formulario oculto da timeout")
    def wait_for_timeout(self, ms):
        pass
    def content(self):
        g = "G1" if "CodGrupo=G1" in self.url else "G2"
        j = self.url.rsplit("CodJornada=", 1)[-1]
        return (f'<a href="/pnfg/NPcd/NFG_CmpPartido?cod_primaria=1000120&amp;CodActa={g}{j}0">acta</a>'
                f'<a href="/pnfg/NPcd/NFG_CmpPrevio?cod_primaria=1000120&amp;CodActa=999">previa</a>').replace("G1", "1").replace("G2", "2")


def test_every_group_and_round_is_read_by_url(monkeypatch):
    page = Page()

    def goto(p, url, *a, **k):
        p.url = url
        p.urls.append(url)
        return True
    monkeypatch.setattr(A, "goto", goto)
    monkeypatch.setattr(A, "delay", lambda *a, **k: None)
    out = A.enumerate_actas_main(page, "21", "54422888")
    assert sorted(r["cod_acta"] for r in out) == ["110", "120", "210", "220"]      # sin la previa
    assert {r["grupo"] for r in out} == {"G1", "G2"}
    assert any(u.endswith("&CodGrupo=G2&CodJornada=2") for u in page.urls)
