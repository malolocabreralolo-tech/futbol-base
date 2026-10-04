"""El enumerador de actas de temporadas pasadas va por URL directa (2026-10):
elegir grupo con select_option sobre el formulario OCULTO de FIFLP daba timeout
en todos los grupos salvo el primero."""
import pytest
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


def test_only_the_requested_groups(monkeypatch):
    page = Page()
    page.evaluate_orig = page.evaluate

    def evaluate(js, *a):
        if "o.text.trim()" in js:
            return [["G1", "GRUPO 1"], ["G2", "GRUPO 2"]]
        return page.evaluate_orig(js, *a)
    page.evaluate = evaluate

    def goto(p, url, *a, **k):
        p.url = url
        p.urls.append(url)
        return True
    monkeypatch.setattr(A, "goto", goto)
    monkeypatch.setattr(A, "delay", lambda *a, **k: None)
    monkeypatch.setattr(A, "GROUP_FILTER", ["54422888:GRUPO 2"])
    out = A.enumerate_actas_main(page, "21", "54422888")
    assert {r["grupo"] for r in out} == {"G2"}
    monkeypatch.setattr(A, "GROUP_FILTER", ["99999:GRUPO 2"])          # de otra competición: nada
    assert A.enumerate_actas_main(page, "21", "54422888") == []


def test_backfill_takes_the_catalog_competitions_without_futsal_and_rereads_old_actas():
    comps = A.catalog_comps("21")
    assert "54422888" in comps and "54976641" in comps            # liga prebenjamín y Clausura Benjamín
    assert "54422904" not in comps                                # LIGA BENJAMIN FUTBOL SALA
    assert A.catalog_comps("99") == []
    assert A.needs_rescrape({"header": {}, "lineups": {}})        # lector de mayo: sin «consistent»
    assert not A.needs_rescrape({"header": {}, "consistent": True})


def test_an_empty_answer_is_retried_and_the_slow_strategies_never_run(monkeypatch):
    """La federación sirve a veces la página sin desplegables: se reintenta por URL. Las estrategias
    antiguas (la página de cada equipo) comían horas de la tanda y ya no se usan solas."""
    calls = []
    answers = iter([[], [{"cod_acta": "1", "comp_id": "9", "grupo": "1", "jornada": "1"}]])
    monkeypatch.setattr(A, "enumerate_actas_main", lambda page, season, comp: calls.append(comp) or next(answers))
    monkeypatch.setattr(A, "enumerate_actas_via_teams", lambda *a: pytest.fail("estrategia lenta"))
    monkeypatch.setattr(A, "enumerate_actas_lstpartidos", lambda *a: pytest.fail("estrategia lenta"))
    monkeypatch.setattr(A.time, "sleep", lambda s: None)
    res, label = A.enumerate_actas_cascade(None, "20", "9")
    assert (len(res), label, calls) == (1, "main", ["9", "9"])
    monkeypatch.setattr(A, "enumerate_actas_main", lambda *a: [])
    assert A.enumerate_actas_cascade(None, "20", "9") == ([], "none")


def test_actas_are_read_by_several_browsers_from_one_queue_until_the_deadline(monkeypatch):
    import threading
    seen, opened, closed = [], [], []
    lock = threading.Lock()
    monkeypatch.setattr(A, "delay", lambda *a, **k: None)
    monkeypatch.setattr(A, "fetch_and_parse_acta", lambda page, cod, dump="": {"page": page, "cod": cod})

    def open_page():
        with lock:
            opened.append(len(opened))
            n = opened[-1]
        return f"p{n}", lambda: closed.append(n)

    def on_result(t, acta):
        with lock:
            seen.append((t["cod_acta"], acta["page"]))

    pending = [{"cod_acta": str(i)} for i in range(30)]
    A.fetch_parallel(pending, 3, lambda: False, on_result, open_page=open_page)
    assert sorted(c for c, _ in seen) == sorted(str(i) for i in range(30))   # cada acta, una vez
    assert len(opened) == 3 and sorted(closed) == [0, 1, 2]
    # Con el plazo agotado no se lee ninguna más.
    seen.clear()
    A.fetch_parallel(pending, 2, lambda: True, on_result, open_page=open_page)
    assert seen == []
