"""Los descargadores de la federación y de la app eligen sus competiciones por categoría
(categorias.category_of) y alevín se pide a propósito: por defecto bajan lo de siempre,
benjamín y prebenjamín. Sin red: el catálogo del repositorio y HTML de prueba.
"""
import importlib
import json
import sys
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(1, str(ROOT))
CATALOG = json.loads((ROOT / "scripts" / "fiflp_comps_catalog.json").read_text(encoding="utf-8"))
ALEVIN_GC_2526 = {"54422881", "54422939", "54422940", "54422941", "54965212", "54976639"}


# ── fetch_fiflp_islas.py (activación de una fase de la temporada en curso) ────

def islas(monkeypatch, season, ids="", cats=None):
    """El módulo como lo arranca fetch-fiflp-islas.yml (ISLAS_SEASON, SCRAPE_IDS, FIFLP_CATS)."""
    import fetch_fiflp_2425 as F
    for attr in ("SEASON", "OUTPUT_PATH", "COMPETITIONS"):      # el módulo los cambia al importarse
        monkeypatch.setattr(F, attr, getattr(F, attr))
    monkeypatch.setenv("ISLAS_SEASON", season)
    monkeypatch.setenv("SCRAPE_IDS", ids)
    if cats is None:
        monkeypatch.delenv("FIFLP_CATS", raising=False)
    else:
        monkeypatch.setenv("FIFLP_CATS", cats)
    monkeypatch.delitem(sys.modules, "fetch_fiflp_islas", raising=False)
    return importlib.import_module("fetch_fiflp_islas")


def test_catalog_competitions_by_category():
    import fetch_fiflp_islas as I
    ben = I.comps_from_catalog("2026-2027", CATALOG)
    assert {c["id"] for c in ben} == {"54976988", "54976982", "54977017", "54977022"}
    al = I.comps_from_catalog("2026-2027", CATALOG, ("ALEVIN",))
    assert [(c["id"], c["cat"], c["island"]) for c in al] == [("54976940", "alevin", "grancanaria")]


def test_tanda_22al_is_only_the_alevin_fase_previa_of_gran_canaria(monkeypatch):
    I = islas(monkeypatch, "22al")
    assert I.F.SEASON == "22"
    assert I.F.OUTPUT_PATH.endswith("scripts/fiflp_islas_22al_raw.json")
    assert [c["id"] for c in I.F.COMPETITIONS] == ["54976940"]


def test_tanda_22_can_fetch_fuerteventura_benjamin_alone(monkeypatch):
    """La 1.ª Fase benjamín de Fuerteventura (54977017) apareció en el catálogo después del raw del 3/10:
    con SCRAPE_IDS se baja sola y se añade al mismo raw (el scraper reanuda por grupo)."""
    I = islas(monkeypatch, "22", ids="54977017")
    assert I.F.OUTPUT_PATH.endswith("scripts/fiflp_islas_22_raw.json")
    assert [(c["id"], c["island"]) for c in I.F.COMPETITIONS] == [("54977017", "fuerteventura")]


def test_fiflp_cats_overrides_the_category_of_a_tanda(monkeypatch):
    I = islas(monkeypatch, "22", cats="alevin,benjamin")
    assert {c["id"] for c in I.F.COMPETITIONS} == {"54976940", "54976988", "54976982", "54977017"}


def test_an_unknown_tanda_still_stops(monkeypatch):
    with pytest.raises(SystemExit):
        islas(monkeypatch, "23al")


# ── fetch_fiflp_actas.py / fetch_fiflp_goleadores.py / fetch_fiflp_detalle.py ─

def test_actas_know_2026_27_and_choose_by_category():
    from scripts import fetch_fiflp_actas as A
    assert A.SEASON_NAME["22"] == "2026-2027"
    assert set(A.catalog_comps("22")) == {"54976988", "54976982", "54977017", "54977022"}
    assert set(A.catalog_comps("21", ("ALEVIN",))) == ALEVIN_GC_2526
    assert "54422881" not in A.catalog_comps("21")                       # por defecto, sin alevín
    assert set(A.catalog_comps("21", ("ALEVIN", "BENJAMIN"))) >= ALEVIN_GC_2526 | {"54422885"}


def test_actas_cli_takes_the_categories(monkeypatch):
    from scripts import fetch_fiflp_actas as A
    monkeypatch.setattr(sys, "argv", ["x", "--temporada", "22", "--categorias", "alevin"])
    args = A.parse_args()
    assert args.temporada == "22" and args.categorias == "alevin"


def test_goleadores_read_the_categories(monkeypatch):
    import time
    import fetch_fiflp_goleadores as S
    asked = []
    monkeypatch.setattr(S, "catalog_comps", lambda season, cats=None: asked.append(cats) or [])
    monkeypatch.setattr(S, "comp_names", lambda season: {})
    monkeypatch.setattr(S, "raw_path", lambda season: Path("/nonexistent/raw.json"))
    assert S.run(None, None, ["21"], time.monotonic() + 60, log=lambda *_: None, categories=("ALEVIN",))
    assert asked == [("ALEVIN",)]


def test_detalle_chooses_by_category():
    import fetch_fiflp_detalle as D
    comps = CATALOG["2025-2026"]["all"]
    assert {c for c, _ in D.benjamin_comps(comps, ("ALEVIN",))} == ALEVIN_GC_2526
    assert "54422881" not in [c for c, _ in D.benjamin_comps(comps)]
    assert {c for c, _ in D.catalog_comps("21", ("ALEVIN",))} == ALEVIN_GC_2526


# ── App de futbolaspalmas ────────────────────────────────────────────────────

APP = ('<select id="selector-liga">'
       '<option value="77">Liga Alevin Gran Canaria Grupo 1</option>'
       '<option value="120">Alevin eliminatorias Grupo 1</option>'
       '<option value="130">Liga Benjamín Gran Canaria Grupo 1</option>'
       '<option value="140">Liga Prebenjamin Gran Canaria  Grupo 2</option>'
       '<option value="150">Liga Alevin Lanzarote Grupo 1</option>'
       '<option value="160">Liga Benjamín Fútbol Sala Grupo 1</option></select>')


def test_app_leagues_by_category():
    from discover_temporada import app_ligas
    assert [v for v, _ in app_ligas(APP)] == ["130", "140"]
    assert [v for v, _ in app_ligas(APP, ("ALEVIN",))] == ["77", "120"]


def test_the_bot_asks_the_app_only_for_the_categories_of_fp_app_cats(monkeypatch, tmp_path):
    import fetch_fp_app as P
    monkeypatch.setattr(P, "get", lambda url: APP)
    monkeypatch.setattr(P, "raw_path", lambda season: tmp_path / "raw.json")
    fetched = []
    monkeypatch.setattr(P, "fetch_liga", lambda liga_id, name, data, now, log: fetched.append(liga_id))
    monkeypatch.delenv("FP_APP_CATS", raising=False)
    P.run("2026-2027", log=lambda *_: None)
    assert fetched == ["130", "140"]                    # por defecto, sin alevín (docs/alevin.md)
    fetched.clear()
    monkeypatch.setenv("FP_APP_CATS", "benjamin,prebenjamin,alevin")
    P.run("2026-2027", log=lambda *_: None)
    assert fetched == ["77", "120", "130", "140"]


# ── Workflows ────────────────────────────────────────────────────────────────

WF = ROOT / ".github" / "workflows"


def load(name):
    return yaml.safe_load((WF / name).read_text(encoding="utf-8"))


def inputs(data):
    return (data.get("on", data.get(True)) or {})["workflow_dispatch"]["inputs"]


def test_actas_workflow_has_2026_27_and_propagates_the_categories_to_every_dispatch():
    data = load("actas-federacion.yml")
    assert "22" in inputs(data)["temporada"]["options"]
    assert inputs(data)["categorias"]["default"] == "benjamin,prebenjamin"
    steps = data["jobs"]["scrape"]["steps"]
    scrape = next(s for s in steps if "fetch_fiflp_actas.py" in s.get("run", ""))
    assert "--categorias" in scrape["run"] and "${{" not in scrape["run"], "la entrada va por env"
    nxt = next(s for s in steps if s.get("name") == "Siguiente tanda")
    dispatches = [line for line in nxt["run"].splitlines() if "gh workflow run actas-federacion.yml" in line]
    assert len(dispatches) == 2 and all('-f categorias="$CATS_INPUT"' in line for line in dispatches), dispatches


def test_goleadores_and_detalle_workflows_take_and_chain_the_categories():
    gol = load("goleadores-federacion.yml")
    assert inputs(gol)["categorias"]["default"] == "benjamin,prebenjamin"
    scrape = next(s for s in gol["jobs"]["scrape"]["steps"] if "fetch_fiflp_goleadores.py" in s.get("run", ""))
    assert "--categorias" in scrape["run"] and "${{" not in scrape["run"]
    det = load("detalle-federacion.yml")
    assert inputs(det)["categorias"]["default"] == "benjamin,prebenjamin"
    steps = det["jobs"]["scrape"]["steps"]
    scrape = next(s for s in steps if "fetch_fiflp_detalle.py" in s.get("run", ""))
    assert "--categorias" in scrape["run"] and "${{" not in scrape["run"]
    nxt = next(s for s in steps if s.get("name") == "Siguiente tanda")
    assert '-f categorias="$CATEGORIAS"' in nxt["run"]


def test_islas_workflow_documents_the_alevin_tanda_and_runs_on_node24():
    data = load("fetch-fiflp-islas.yml")
    assert "22al" in inputs(data)["temporada"]["description"]
    uses = [s["uses"] for s in data["jobs"]["scrape"]["steps"] if "uses" in s]
    assert uses == ["actions/checkout@v5", "actions/setup-python@v6"]
