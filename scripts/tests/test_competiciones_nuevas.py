"""Competiciones nuevas de la federación: el bot las ve solo y avisa (octubre de 2026).

La Segunda Fase de benjamín llega a mediados de noviembre y «LIGA BENJAMIN F-7 DE FUERTEVENTURA 1ª
FASE» (54977017) ya se había escapado: nada miraba el desplegable de competiciones. Ahora, en cada
pasada, update_fiflp.check_competitions lee ese desplegable de la temporada en curso (el mismo JS que
discover_fiflp_comps.py), se queda con benjamín, prebenjamín y alevín de Gran Canaria (sin fútbol sala
ni alevín de Lanzarote y Fuerteventura), quita las que la temporada ya tiene y las ignoradas, y lo
apunta en data-health.json (newCompetitions). update.yml abre una issue por competición, sin
repetirla (avisar_competiciones.py). Sin red: el catálogo real de 2026-27 y un gh falso.
"""
from datetime import date, datetime, timedelta, timezone
import json
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from db import SCHEMA  # noqa: E402
import avisar_competiciones as A  # noqa: E402
import source_health  # noqa: E402
import update_fiflp as U  # noqa: E402

TODAY = date(2026, 10, 14)
CATALOG = json.loads((ROOT / "scripts" / "fiflp_comps_catalog.json").read_text(encoding="utf-8"))["2026-2027"]["all"]
FIFLP = ("https://www.fiflp.com/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22"
         "&CodCompeticion={comp}&CodGrupo={group}")


# ── Qué categoría es una competición ─────────────────────────────────────────

@pytest.mark.parametrize("name, cat", [
    ("LIGA BENJAMIN F-7 DE FUERTEVENTURA 1ª FASE", "BENJAMIN"),
    ("LIGA BENJAMIN F7 GRAN CANARIA FASE LIGA F", "BENJAMIN"),
    ("Liga Benjamín de Lanzarote Fase 2", "BENJAMIN"),
    ("LIGA PREBENJAMIN DE GRAN CANARIA", "PREBENJAMIN"),
    ("COPA CAMPEONES PREBENJAMIN", "PREBENJAMIN"),
    ("LIGA ALEVIN GRAN CANARIA FASE PREVIA", "ALEVIN"),
    ("COPA CAMPEONES ALEVÍN", "ALEVIN"),
    ("copa de campeones categoria alevin fase a", "ALEVIN"),
    # Alevín solo de Gran Canaria; nunca fútbol sala; el resto de categorías, nada.
    ("LIGA ALEVIN LANZAROTE FASE 1", None),
    ("LIGA ALEVIN FUERTEVENTURA F7 1ª FASE", None),
    ("LIGA PRIMERA BENJAMIN FUTBOL SALA GRAN CANARIA", None),
    ("LIGA BENJAMIN LPFS", None),
    ("LIGA INFANTIL PREFERENTE DE GRAN CANARIA", None),
    ("MINI COPA DE NAVIDAD", None),
    ("", None),
])
def test_category_of_a_federation_competition(name, cat):
    assert U.category_of(name) == cat


# ── Qué es nuevo ───────────────────────────────────────────────────────────────

KNOWN = {"54976988", "54976982", "54977022"}       # FF1-24, LZ1-5 y PG1-4 de 2026-27


def test_the_2026_27_catalog_has_fuerteventura_benjamin_and_gran_canaria_alevin_pending():
    fresh = U.new_competitions(CATALOG, KNOWN, today=TODAY, ignored={})
    assert [(c["id"], c["name"]) for c in fresh] == [
        ("54976940", "LIGA ALEVIN GRAN CANARIA FASE PREVIA"),
        ("54977017", "LIGA BENJAMIN F-7 DE FUERTEVENTURA 1ª FASE")]
    assert {c["firstSeen"] for c in fresh} == {"2026-10-14"}


def test_ignored_and_known_competitions_are_left_out_and_first_seen_is_kept():
    previous = [{"id": "54977017", "name": "LIGA BENJAMIN F-7 DE FUERTEVENTURA 1ª FASE", "firstSeen": "2026-10-07"}]
    fresh = U.new_competitions(CATALOG, KNOWN, previous, TODAY, ignored={"54976940": "alevín, en su rama"})
    assert fresh == previous
    assert U.new_competitions(CATALOG, KNOWN | {"54977017", "54976940"}, previous, TODAY, ignored={}) == []
    # Lo que no es una opción de verdad (sin id o sin nombre) no cuenta.
    assert U.new_competitions([{"id": "", "name": "LIGA BENJAMIN X"}, {"value": "1", "text": "1 - 03-10-2026"}],
                              set(), today=TODAY, ignored={}) == []


def season():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2025-2026', 2025, 2026, 0),
                                                                            (2, '2026-2027', 2026, 2027, 1);
      INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN'), (2, 'PREBENJAMIN');""")
    for gid, (sid, cat, code, comp) in enumerate([(2, 1, "FF1", "54976988"), (2, 1, "LZ1", "54976982"),
                                                  (2, 2, "PG2", "54977022"), (1, 1, "FV11", "54977017")], 1):
        conn.execute("INSERT INTO groups(id, season_id, category_id, code, url) VALUES (?, ?, ?, ?, ?)",
                     (gid, sid, cat, code, FIFLP.format(comp=comp, group=gid)))
    return conn


def test_the_season_competitions_come_from_its_group_urls():
    conn = season()
    assert U.season_competitions(conn, 2) == KNOWN          # la de 2025-26 no cuenta
    assert U.season_code(conn, 2) == "22"


class Page:
    def __init__(self, options):
        self.options, self.url = options, ""

    def evaluate(self, js, *a):
        assert 'select[name="competicion"]' in js
        return self.options


class Fed:
    BASE = "https://www.fiflp.com/pnfg/NPcd"

    def __init__(self, ok=True):
        self.ok, self.urls = ok, []

    def goto(self, page, url):
        self.urls.append(url)
        return self.ok

    def delay(self, *a):
        pass


@pytest.fixture
def health(tmp_path, monkeypatch):
    (tmp_path / "index.html").write_text('<script src="./data-seasons.js?v=20261014a"></script>')
    monkeypatch.setattr(source_health, "ROOT", tmp_path)
    monkeypatch.setattr(source_health, "REPORT_PATH", tmp_path / "data-health.json")
    monkeypatch.setattr(source_health, "_report", None)
    return source_health.REPORT_PATH


def test_the_bot_reads_the_dropdown_once_and_writes_new_competitions(health):
    conn = season()
    source_health.begin("2026-2027")
    fed = Fed()
    fresh = U.check_competitions(Page(CATALOG), fed, conn, 2, TODAY, log=lambda *_: None)
    assert fed.urls == ["https://www.fiflp.com/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22"]
    assert [c["id"] for c in fresh] == ["54976940", "54977017"]
    source_health.finish(now=datetime(2026, 10, 14, 4, tzinfo=timezone.utc))
    assert json.loads(health.read_text())["newCompetitions"] == fresh


def test_same_competitions_do_not_rewrite_the_report_and_a_failed_read_keeps_them(health):
    conn = season()
    t0 = datetime(2026, 10, 14, 4, tzinfo=timezone.utc)
    source_health.begin("2026-2027")
    U.check_competitions(Page(CATALOG), Fed(), conn, 2, TODAY, log=lambda *_: None)
    source_health.finish(now=t0)
    first = health.read_text()
    # Seis horas después, lo mismo (firstSeen no cambia): el informe queda igual, sin commit.
    source_health.begin("2026-2027")
    U.check_competitions(Page(CATALOG), Fed(), conn, 2, TODAY + timedelta(days=1), log=lambda *_: None)
    source_health.finish(now=t0 + timedelta(hours=6))
    assert health.read_text() == first
    # La federación no sirve la página o el desplegable sale vacío: se queda lo que había.
    for page, fed in ((Page(CATALOG), Fed(ok=False)), (Page([]), Fed())):
        source_health.begin("2026-2027")
        assert U.check_competitions(page, fed, conn, 2, TODAY, log=lambda *_: None) is None
        source_health.finish(now=t0 + timedelta(hours=7))
        assert health.read_text() == first
    # Ya activada en la web: deja de salir.
    conn.execute("UPDATE groups SET season_id=2 WHERE id=4")
    source_health.begin("2026-2027")
    fresh = U.check_competitions(Page(CATALOG), Fed(), conn, 2, TODAY, log=lambda *_: None)
    source_health.finish(now=t0 + timedelta(hours=8))
    assert [c["id"] for c in fresh] == ["54976940"]
    assert [c["id"] for c in json.loads(health.read_text())["newCompetitions"]] == ["54976940"]


def test_a_new_season_starts_without_the_old_ones(health):
    health.write_text(json.dumps({"season": "2025-2026", "groups": {},
                                  "newCompetitions": [{"id": "1", "name": "LIGA BENJAMIN X", "firstSeen": "2026-05-01"}]}))
    source_health.begin("2026-2027")
    assert source_health.new_competitions() == []
    health.write_text(json.dumps({"season": "2026-2027", "groups": {},
                                  "newCompetitions": [{"id": "1", "name": "LIGA BENJAMIN X", "firstSeen": "2026-10-01"}]}))
    source_health.begin("2026-2027")                 # sin pasar por la federación (FIFLP_UPDATE): se conservan
    assert [c["id"] for c in source_health.new_competitions()] == ["1"]


# ── El aviso: una issue por competición, sin repetirla ─────────────────────────

FV = {"id": "54977017", "name": "LIGA BENJAMIN F-7 DE FUERTEVENTURA 1ª FASE", "firstSeen": "2026-10-07"}
AL = {"id": "54976940", "name": "LIGA ALEVIN GRAN CANARIA FASE PREVIA", "firstSeen": "2026-10-14"}


class Gh:
    """gh falso: las issues que ya hay (abiertas o cerradas) y las que se crean."""
    def __init__(self, titles=()):
        self.titles, self.calls = list(titles), []

    def __call__(self, args):
        self.calls.append(args)
        if args[:2] == ["issue", "list"]:
            assert "--state" in args and args[args.index("--state") + 1] == "all"
            return json.dumps([{"number": n, "title": t} for n, t in enumerate(self.titles, 1)])
        if args[:2] == ["issue", "create"]:
            self.titles.append(args[args.index("--title") + 1])
            return "https://github.com/x/y/issues/9\n"
        raise AssertionError(args)


def write(path, comps):
    path.write_text(json.dumps({"season": "2026-2027", "groups": {}, "newCompetitions": comps}))
    return path


def test_one_issue_per_new_competition_and_never_twice(tmp_path):
    path = write(tmp_path / "data-health.json", [FV, AL])
    gh = Gh(titles=["Competición nueva en la federación: LIGA ALEVIN GRAN CANARIA FASE PREVIA (54976940)"])
    assert A.main([str(path)], gh=gh, log=lambda *_: None) == 0
    created = [c for c in gh.calls if c[:2] == ["issue", "create"]]
    assert len(created) == 1
    title = created[0][created[0].index("--title") + 1]
    body = created[0][created[0].index("--body") + 1]
    assert title == "Competición nueva en la federación: LIGA BENJAMIN F-7 DE FUERTEVENTURA 1ª FASE (54977017)"
    assert "54977017" in body and "2026-2027" in body and "fiflp_manifest.py" in body and "--add" in body
    assert "-f temporada=22 -f ids=54977017" in body and "fiflp_islas_22_raw.json" in body
    assert "alevín" not in body and "alevín" in A.body(AL, "2026-2027")
    # La siguiente pasada la encuentra (también si se cerró) y no abre otra.
    A.main([str(path)], gh=gh, log=lambda *_: None)
    assert len([c for c in gh.calls if c[:2] == ["issue", "create"]]) == 1


def test_the_issue_steps_refresh_the_catalog_first_and_pull_before_the_manifest():
    """fetch-fiflp-islas saca las competiciones de 2026-27 del catálogo del repositorio
    (fiflp_comps_catalog.json): una competición publicada después no se descarga hasta que
    discover-fiflp.yml la apunta. Y el raw lo sube el workflow: git pull antes del manifiesto."""
    lines = A.body(FV, "2026-2027").splitlines()
    step = lambda text: next(i for i, line in enumerate(lines) if text in line)
    discover, fetch = step("gh workflow run discover-fiflp.yml"), step("gh workflow run fetch-fiflp-islas.yml")
    pull, manifest = step("git pull"), step("fiflp_manifest.py")
    assert discover < fetch < pull < manifest
    for launched, workflow in ((discover, "discover-fiflp.yml"), (fetch, "fetch-fiflp-islas.yml")):
        assert "gh run watch" in lines[launched + 1] and workflow in lines[launched + 1]   # a que acabe


def test_an_alevin_competition_goes_with_the_alevin_batch():
    """Alevín de Gran Canaria tiene su propia tanda y su propio raw (22al, docs/alevin.md); la categoría,
    con el category_of de todos (categorias.py)."""
    body = A.body(AL, "2026-2027")
    assert "-f temporada=22al -f ids=54976940" in body and "fiflp_islas_22al_raw.json" in body
    assert "docs/alevin.md" in body
    assert "22al" not in A.body(FV, "2026-2027")


def test_the_issue_only_carries_the_competition(tmp_path):
    """El repositorio es público: ni equipos ni personas; solo el nombre y el código de la competición."""
    path = write(tmp_path / "data-health.json", [FV])
    gh = Gh()
    A.main([str(path)], gh=gh, log=lambda *_: None)
    args = next(c for c in gh.calls if c[:2] == ["issue", "create"])
    text = " ".join(args)
    for personal in ("Mesas", "Huracán", "@"):
        assert personal not in text


def test_nothing_to_announce_and_odd_entries_are_skipped(tmp_path):
    gh = Gh()
    assert A.main([str(tmp_path / "no-existe.json")], gh=gh, log=lambda *_: None) == 0
    assert A.main([str(write(tmp_path / "h.json", []))], gh=gh, log=lambda *_: None) == 0
    odd = [{"id": "12; rm -rf /", "name": "LIGA BENJAMIN X"}, {"id": "55", "name": ""}, "54977017"]
    assert A.main([str(write(tmp_path / "h.json", odd))], gh=gh, log=lambda *_: None) == 0
    assert gh.calls == []
