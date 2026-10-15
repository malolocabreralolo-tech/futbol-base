"""Las actas de alevín van APARTE (scripts/actas_lotes.py, 14/10/2026).

Un raw de actas de benjamín y prebenjamín pesa unos 20 MB por temporada; el histórico alevín
(2019-26) en el mismo raw lo duplicaría, cerca del aviso de GitHub (50 MB por fichero; tope,
100 MB). Las de alevín van a scripts/fiflp_actas_<S>_alevin_raw.json, con su índice y su estado:

- fetch_fiflp_actas.py baja en cada tanda las de UN lote y solo escribe los ficheros de ese lote
  (los de su cadena: dos cadenas nunca escriben el mismo fichero): con varios navegadores
  (fetch_parallel), en las tandas encadenadas (índice y estado por lote) y al refrescar; un acta
  que una tanda antigua dejó en el raw que no es el suyo pasa sola al suyo (la adopta la tanda de
  su lote y la suelta la del otro);
- import_fiflp_actas.py importa los dos (su huella por fichero; el de siempre, primero) sin que la
  purga de huérfanas de uno deje sin acta a los partidos del otro;
- grupos, goleadores, detalle y escudos leen los índices y raws de los dos lotes juntos;
- actas-federacion.yml tiene una cadena por temporada y lote, sube solo los ficheros del suyo y
  encadena por su estado (para si las categorías no existen, mezclan lotes o no son del suyo).

Todo con datos sintéticos (clubes de prueba y jugadores «JUGADOR PRUEBA»), sin red.
"""
import hashlib
import json
import os
import sqlite3
import subprocess
import sys
import types
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(1, str(ROOT / "scripts"))
import scripts.fetch_fiflp_actas as A  # noqa: E402
from scripts import actas_lotes as L  # noqa: E402
from db import SCHEMA  # noqa: E402
from migrate_actas_schema import migrate  # noqa: E402

ALEVIN_2526 = {"54422881", "54422939", "54422940", "54422941", "54965212", "54976639"}
ALEVIN_COMP = "LIGA ALEVIN GRAN CANARIA FASE PREVIA"
BENJAMIN_COMP = "LIGA BENJAMIN FASE PREVIA F-7 GRAN CANARIA"


# ── Nombres de los ficheros ──────────────────────────────────────────────────

def test_each_lote_has_its_raw_index_and_status():
    assert L.file_name("2025-2026", "raw") == "fiflp_actas_2025-2026_raw.json"
    assert L.file_name("2025-2026", "raw", "alevin") == "fiflp_actas_2025-2026_alevin_raw.json"
    assert L.file_name("2019-2020", "index", "alevin") == "fiflp_actas_2019-2020_alevin_index.json"
    assert L.file_name("2019-2020", "status", "alevin") == "fiflp_actas_2019-2020_alevin_status.json"
    with pytest.raises(ValueError):
        L.file_name("2025-2026", "raw", "cadete")
    assert A.raw_path("21").name == "fiflp_actas_2025-2026_raw.json"           # el de siempre, igual
    assert A.raw_path("21", "alevin").name == "fiflp_actas_2025-2026_alevin_raw.json"
    assert A.index_path("15", "alevin").name == "fiflp_actas_2019-2020_alevin_index.json"
    assert A.status_path("22", "alevin").name == "fiflp_actas_2026-2027_alevin_status.json"
    assert A.index_path("21").name == "fiflp_actas_2025-2026_index.json"
    assert A.status_path("21").name == "fiflp_actas_2025-2026_status.json"


def test_the_importer_recognises_both_raws_and_nothing_else():
    import import_fiflp_actas as I
    m = I.RAW_FILE.match("fiflp_actas_2025-2026_alevin_raw.json")
    assert (m.group(1), m.group(2)) == ("2025-2026", "alevin")
    m = I.RAW_FILE.match("fiflp_actas_2025-2026_raw.json")
    assert (m.group(1), m.group(2)) == ("2025-2026", None)
    for other in ("fiflp_actas_2025-2026_index.json", "fiflp_actas_2025-2026_alevin_index.json",
                  "fiflp_actas_2025-2026_alevin_status.json", "fiflp_actas_unmatched.json",
                  "fiflp_actas_2025-2026_cadete_raw.json", "fiflp_goleadores_2025-2026_raw.json"):
        assert not I.RAW_FILE.match(other), other


def test_import_order_is_by_season_and_the_usual_raw_first(tmp_path):
    for name in ("fiflp_actas_2025-2026_alevin_raw.json", "fiflp_actas_2025-2026_raw.json",
                 "fiflp_actas_2024-2025_alevin_raw.json", "fiflp_actas_2024-2025_raw.json",
                 "fiflp_actas_2025-2026_index.json", "fiflp_actas_unmatched.json"):
        (tmp_path / name).write_text("{}", encoding="utf-8")
    assert [n for n, _, _ in L.raw_files(tmp_path)] == [
        "fiflp_actas_2024-2025_raw.json", "fiflp_actas_2024-2025_alevin_raw.json",
        "fiflp_actas_2025-2026_raw.json", "fiflp_actas_2025-2026_alevin_raw.json"]


def test_the_lote_of_a_competition_by_its_name():
    assert L.lote_of_name(ALEVIN_COMP) == "alevin"
    assert L.lote_of_name(f"{ALEVIN_COMP} (GRUPO 7)") == "alevin"           # cabecera de un acta
    assert L.lote_of_name("COPA CAMPEONES ALEVÍN") == "alevin"
    assert L.lote_of_name(BENJAMIN_COMP) == ""
    assert L.lote_of_name("LIGA PREBENJAMIN DE GRAN CANARIA (GRUPO 2)") == ""
    # Alevín que la web no publica (otra isla, sala): nunca al raw de siempre.
    assert L.lote_of_name("LIGA ALEVIN LANZAROTE FASE 1") == "alevin"
    assert L.lote_of_name("LIGA ALEVIN FUTBOL SALA") == "alevin"
    for unknown in (None, "", "COPA DE CAMPEONES", "LIGA BENJAMIN FUTBOL SALA"):
        assert L.lote_of_name(unknown) is None, unknown
    assert L.lotes_of(("ALEVIN", "BENJAMIN")) == ("", "alevin")
    assert L.lotes_of(("PREBENJAMIN",)) == ("",)


def test_the_competitions_of_a_tanda_go_to_the_lote_of_their_category():
    lotes = A.comp_lotes("21", sorted(ALEVIN_2526) + ["54422885", "54422888"], ("ALEVIN", "BENJAMIN", "PREBENJAMIN"))
    assert {c for c, lote in lotes.items() if lote == "alevin"} == ALEVIN_2526
    assert lotes["54422885"] == lotes["54422888"] == ""
    # Por el nombre del catálogo, no por las categorías pedidas.
    assert A.comp_lotes("21", ["54422881"])["54422881"] == "alevin"
    # Una fuera del catálogo: el lote de las categorías pedidas, si son de uno; si no, se para.
    assert A.comp_lotes("21", ["1"], ("ALEVIN",)) == {"1": "alevin"}
    assert A.comp_lotes("21", ["1"]) == {"1": ""}
    assert A.comp_lotes("21", ["1"], ("BENJAMIN", "ALEVIN"), names={"1": f"{ALEVIN_COMP}"}) == {"1": "alevin"}
    with pytest.raises(ValueError):
        A.comp_lotes("21", ["1"], ("BENJAMIN", "ALEVIN"))
    # Una tanda, un lote: el de sus categorías; las que mezclan los dos, o una competición del otro, paran.
    assert A.tanda_lote("21") == ""
    assert A.tanda_lote("21", ("ALEVIN",)) == "alevin"
    assert A.tanda_lote("21", ("ALEVIN",), ["54422881", "1"]) == "alevin"
    assert A.tanda_lote("21", None, ["54422885"], expected="") == ""
    for bad in (dict(categories=("ALEVIN", "BENJAMIN")), dict(comps=["54422881"]),
                dict(categories=("ALEVIN",), comps=["54422885"]),
                dict(categories=("ALEVIN",), expected=""), dict(expected="alevin")):
        with pytest.raises(ValueError):
            A.tanda_lote("21", **bad)


# ── La descarga (main con un navegador de mentira) ───────────────────────────

class _Browser:
    def new_context(self, **kw):
        return self

    def new_page(self):
        return object()

    def close(self):
        pass


LAUNCHES = []


class _Playwright:
    chromium = types.SimpleNamespace(launch=lambda **kw: LAUNCHES.append(kw) or _Browser())

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def start(self):
        return self

    def stop(self):
        pass


def synthetic_acta(competition, consistent=True, staff_v=None):
    acta = {"header": {"season": "2025/2026", "jornada": "1", "date": "04-10-2025", "time": "10:00",
                       "competition": competition, "home_team": "LOCAL PRUEBA, C.F.",
                       "away_team": "VISITANTE PRUEBA, C.D.", "home_score": 1, "away_score": 0},
            "lineups": {"home": [{"name": "JUGADOR PRUEBA, UNO", "dorsal": 1, "role": "starter"}], "away": []},
            "events": [], "staff": {}, "consistent": consistent}
    if staff_v:
        acta["staff_v"] = staff_v
    return acta


@pytest.fixture
def fed(tmp_path, monkeypatch):
    """main sin red: un Playwright de mentira, los ficheros en tmp_path, dos actas por competición
    (la segunda de la Fase Previa de benjamín trae en la cabecera una competición de alevín) y la
    lectura de cada una con la competición de su cabecera."""
    api = types.ModuleType("playwright.sync_api")
    api.sync_playwright = lambda: _Playwright()
    pkg = types.ModuleType("playwright")
    pkg.sync_api = api
    monkeypatch.setitem(sys.modules, "playwright", pkg)
    monkeypatch.setitem(sys.modules, "playwright.sync_api", api)
    monkeypatch.setattr(A, "sync_playwright", None, raising=False)
    monkeypatch.setattr(A, "HERE", tmp_path)
    monkeypatch.setattr(A, "delay", lambda *a, **k: None)
    LAUNCHES.clear()
    names = A.catalog_names("21")
    state = {"competition": {}, "read": [], "answer": None, "mislabel": True}

    def enumerate_comp(page, season, comp):
        out = [{"cod_acta": f"{comp}{i}", "comp_id": comp, "grupo": "1", "jornada": str(i)} for i in (1, 2)]
        for t in out:
            state["competition"][t["cod_acta"]] = f"{names[comp]} (GRUPO 1)"
        if state["mislabel"] and comp == "54422885":
            state["competition"]["544228852"] = f"{ALEVIN_COMP} (GRUPO 3)"
        return out, "main"

    def read(page, cod, dump=""):
        state["read"].append(cod)
        competition = state["competition"][cod]
        return state["answer"](cod, competition) if state["answer"] else synthetic_acta(competition)

    monkeypatch.setattr(A, "enumerate_actas_cascade", enumerate_comp)
    monkeypatch.setattr(A, "fetch_and_parse_acta", read)

    def run(*argv):
        monkeypatch.setattr(sys, "argv", ["fetch_fiflp_actas.py", "--temporada", "21", *argv])
        A.main()
    state["run"] = run
    state["dir"] = tmp_path
    return state


def files(folder):
    return {p.name: json.loads(p.read_text(encoding="utf-8")) for p in sorted(folder.glob("fiflp_actas_*.json"))}


def test_each_tanda_writes_only_the_files_of_its_lote_with_several_browsers_and_chained_tandas(fed, capsys):
    raw, raw_al = "fiflp_actas_2025-2026_raw.json", "fiflp_actas_2025-2026_alevin_raw.json"
    fed["run"]("--categorias", "alevin", "--lote", "alevin", "--workers", "3")
    # Cada navegador (el de enumerar y uno por hilo), sin lo ajeno ni imágenes y sin ruta (con caché).
    from scripts.fiflp_render import fiflp_launch_args
    assert len(LAUNCHES) == 4 and all(kw == {"headless": True, "args": fiflp_launch_args()} for kw in LAUNCHES)
    got = files(fed["dir"])
    assert set(got) == {f"fiflp_actas_2025-2026_alevin_{kind}.json" for kind in ("raw", "index", "status")}
    alevin = got[raw_al]
    assert {a["enumeration"]["comp_id"] for a in alevin.values()} == ALEVIN_2526
    assert all(L.lote_of_name(a["header"]["competition"]) == "alevin" for a in alevin.values())
    assert got["fiflp_actas_2025-2026_alevin_status.json"] == {
        "season": "2025-2026", "enumerated": 12, "in_raw": 12, "pending": 0, "unenumerated_comps": 0, "fetched": 12}
    alevin_bytes = {p.name: p.read_bytes() for p in fed["dir"].glob("fiflp_actas_*alevin*.json")}

    # Benjamín y prebenjamín (con varios navegadores): el acta de una competición de benjamín cuya
    # cabecera dice alevín se queda en el raw de la tanda, con un aviso (el de alevín es de otra cadena).
    capsys.readouterr()
    fed["run"]("--lote", "siempre", "--workers", "3")
    assert "acta 544228852: su cabecera es del lote alevin" in capsys.readouterr().out
    assert {p.name: p.read_bytes() for p in fed["dir"].glob("fiflp_actas_*alevin*.json")} == alevin_bytes
    got = files(fed["dir"])
    usual = got[raw]
    assert len(usual) == 30 and "544228852" in usual and not set(usual) & set(alevin)
    assert {a["enumeration"]["comp_id"] for a in usual.values()}.isdisjoint(ALEVIN_2526)
    status = got["fiflp_actas_2025-2026_status.json"]
    assert (status["enumerated"], status["in_raw"], status["pending"], status["fetched"]) == (30, 30, 0, 30)
    assert sorted(fed["read"]) == sorted(set(fed["read"]))                   # cada acta, una vez
    for argv, lote in ((("--categorias", "alevin"), "alevin"), ((), "")):
        fed["run"](*argv, "--estado")
        assert json.loads(capsys.readouterr().out) == {"pending": 0, "stuck": 0, "lote": lote}

    # Tandas encadenadas: todo del índice de su lote y nada pendiente.
    fed["read"].clear()
    before = {n: (fed["dir"] / n).read_bytes() for n in (raw, raw_al)}
    fed["run"]("--categorias", "alevin", "--workers", "2")
    fed["run"]("--workers", "2")
    assert fed["read"] == []
    assert {n: (fed["dir"] / n).read_bytes() for n in before} == before
    capsys.readouterr()
    fed["run"]("--categorias", "alevin", "--estado")
    assert json.loads(capsys.readouterr().out) == {"pending": 0, "stuck": 1, "lote": "alevin"}

    # Refrescar: las de benjamín salen mejor y se sustituyen; las de alevín salen peor y se quedan las
    # viejas, marcadas en SU raw. Ninguna cambia de raw y cada tanda solo escribe el suyo.
    from scripts.fiflp_acta import STAFF_VERSION

    def answer(cod, competition):
        if L.lote_of_name(competition) == "alevin":
            return synthetic_acta(competition, consistent=False, staff_v=STAFF_VERSION)
        return synthetic_acta(competition, staff_v=STAFF_VERSION)
    fed["answer"] = answer
    fed["run"]("--refrescar", "--workers", "3")
    assert (fed["dir"] / raw_al).read_bytes() == before[raw_al]
    fed["run"]("--categorias", "alevin", "--refrescar", "--workers", "3")
    after = files(fed["dir"])
    usual2, alevin2 = after[raw], after[raw_al]
    assert set(usual2) == set(usual) and set(alevin2) == set(alevin)
    assert all(a.get("staff_v") == STAFF_VERSION for cod, a in usual2.items() if cod != "544228852")
    assert usual2["544228852"].get("staff_refresh_failed")                     # cabecera alevín: salió peor
    assert all(a.get("staff_refresh_failed") and a["consistent"] and "staff_v" not in a for a in alevin2.values())


def test_an_alevin_tanda_never_touches_the_usual_files_and_viceversa(fed):
    """También con un acta de cabecera alevín en una competición de benjamín (antes, la tanda de
    benjamín la escribía en el raw de alevín y la subía: chocaba con la cadena de alevín)."""
    fed["run"]("--categorias", "alevin")
    assert set(files(fed["dir"])) == {"fiflp_actas_2025-2026_alevin_raw.json", "fiflp_actas_2025-2026_alevin_index.json",
                                      "fiflp_actas_2025-2026_alevin_status.json"}
    alevin = {p.name: p.read_bytes() for p in fed["dir"].glob("fiflp_actas_*alevin*.json")}
    fed["run"]()                                                # benjamín y prebenjamín, lo de siempre
    assert {p.name: p.read_bytes() for p in fed["dir"].glob("fiflp_actas_*alevin*.json")} == alevin
    got = files(fed["dir"])
    usual = got["fiflp_actas_2025-2026_raw.json"]
    assert len(usual) == 30 and sum(L.lote_of_name(a["header"]["competition"]) == "alevin" for a in usual.values()) == 1
    assert got["fiflp_actas_2025-2026_status.json"]["fetched"] == 30
    # Otra tanda de alevín no toca los de siempre.
    usual_bytes = {p.name: p.read_bytes() for p in fed["dir"].glob("fiflp_actas_2025-2026_*.json") if "alevin" not in p.name}
    fed["run"]("--categorias", "alevin")
    assert {n: (fed["dir"] / n).read_bytes() for n in usual_bytes} == usual_bytes


@pytest.mark.parametrize("argv", [
    ("--categorias", "benjamin,prebenjamin,alevin"),          # mezcla los dos lotes
    ("--categorias", "alevin", "--lote", "siempre"),          # no es el lote de la cadena
    ("--lote", "alevin"),
    ("--comps", "54422881"),                                  # competición de alevín en una tanda de siempre
    ("--comps", "54422881,54422885", "--categorias", "alevin"),
    ("--comps", "1", "--categorias", "benjamin,alevin"),
    ("--categorias", "alevines"),                             # no existe
])
def test_a_tanda_outside_one_lote_stops_before_writing_and_its_chain_stops(fed, capsys, argv):
    with pytest.raises(ValueError):
        fed["run"](*argv)
    assert not list(fed["dir"].glob("fiflp_actas_*")) and fed["read"] == []
    fed["run"](*argv, "--estado")
    state = json.loads(capsys.readouterr().out)
    assert (state["pending"], state["stuck"]) == (0, 1) and state["error"]


def test_an_acta_left_in_the_other_raw_by_an_older_tanda_moves_to_its_own(fed, capsys):
    """Un acta de alevín en el raw de siempre (la de una tanda de antes de partir los raws, con
    -f categorias=alevin): la tanda de alevín la adopta (la copia a su raw sin volver a leerla y sin
    tocar el de siempre) y la de benjamín la suelta (la quita del suyo sin tocar el de alevín)."""
    fed["mislabel"] = False
    fed["run"]("--categorias", "alevin")
    alevin_raw = A.raw_path("21", "alevin")
    old = json.loads(alevin_raw.read_text(encoding="utf-8"))
    moved = sorted(old)[:3]
    A.save_raw("21", {cod: old[cod] for cod in moved})                          # el raw de siempre, de antes
    A.save_raw("21", {cod: a for cod, a in old.items() if cod not in moved}, "alevin")
    usual_before = A.raw_path("21").read_bytes()
    fed["read"].clear()
    fed["run"]("--categorias", "alevin")
    assert fed["read"] == []                                                    # adoptadas, no releídas
    assert A.raw_path("21").read_bytes() == usual_before
    assert json.loads(alevin_raw.read_text(encoding="utf-8")) == old
    assert "3 acta(s) adoptadas" in capsys.readouterr().out
    alevin_bytes = alevin_raw.read_bytes()
    fed["run"]()
    assert alevin_raw.read_bytes() == alevin_bytes
    usual = json.loads(A.raw_path("21").read_text(encoding="utf-8"))
    assert len(usual) == 30 and not set(usual) & set(moved)
    assert "3 acta(s) de otro lote ya en su raw" in capsys.readouterr().out
    # Ya en su sitio: otra vuelta no cambia nada.
    snapshot = {p.name: p.read_bytes() for p in fed["dir"].glob("fiflp_actas_*_raw.json")}
    fed["run"]()
    fed["run"]("--categorias", "alevin")
    assert {p.name: p.read_bytes() for p in fed["dir"].glob("fiflp_actas_*_raw.json")} == snapshot


def test_the_chain_state_of_each_lote(tmp_path, monkeypatch):
    """La regla de actas-federacion.yml, en chain_state: otra tanda mientras quede alguna en el lote
    (sin estado, también); atascada si no trajo ninguna ni dejó competiciones por enumerar."""
    monkeypatch.setattr(A, "HERE", tmp_path)
    assert A.chain_state("21", "alevin") == {"pending": 1, "stuck": 0, "lote": "alevin"}

    def write(lote, **status):
        A.status_path("21", lote).write_text(json.dumps(status), encoding="utf-8")
    write("", pending=0, fetched=0, unenumerated_comps=0)
    assert A.chain_state("21") == {"pending": 0, "stuck": 1, "lote": ""}
    assert A.chain_state("21", "alevin") == {"pending": 1, "stuck": 0, "lote": "alevin"}
    write("alevin", pending=5, fetched=3, unenumerated_comps=0)
    assert A.chain_state("21", "alevin") == {"pending": 5, "stuck": 0, "lote": "alevin"}
    write("alevin", pending=5, fetched=0, unenumerated_comps=1)
    assert A.chain_state("21", "alevin")["stuck"] == 0
    write("alevin", pending=5, fetched=0, unenumerated_comps=0)
    assert A.chain_state("21", "alevin") == {"pending": 5, "stuck": 1, "lote": "alevin"}


def test_the_store_only_writes_the_raw_of_its_lote(tmp_path, monkeypatch):
    monkeypatch.setattr(A, "HERE", tmp_path)
    al, ben = synthetic_acta(f"{ALEVIN_COMP} (GRUPO 1)"), synthetic_acta(f"{BENJAMIN_COMP} (GRUPO 1)")
    A.save_raw("21", {"9": al, "8": ben})
    store = A.RawStore("21", "alevin", log=lambda *a: None)
    assert store.get("9") == ("alevin", al)                         # adoptada: la copia a su raw
    assert store.get("8") == ("", ben)                               # de su lote, donde está: no es suya
    assert store.get("7") == (None, None)
    usual = A.raw_path("21").read_bytes()
    store.save()
    assert A.raw_path("21").read_bytes() == usual
    assert set(json.loads(A.raw_path("21", "alevin").read_text(encoding="utf-8"))) == {"9"}
    store = A.RawStore("21", "", log=lambda *a: None)                # la suelta la tanda de siempre
    assert store.released == 1 and set(store.data) == {"8"}
    assert A.acta_lote({"header": {}}, "alevin") == "alevin"            # sin competición: la de la tanda


# ── La importación ───────────────────────────────────────────────────────────

TEAMS = ["Arucas", "Moya", "Gáldar", "Tablero"]


def base(season="2025-2026", current=0):
    """Una temporada con un grupo FF1 de benjamín y un AL1 de alevín de los mismos clubes; en cada uno,
    Arucas–Moya 3-1 y Gáldar–Tablero 0-2 (jornada 1)."""
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    start = int(season[:4])
    conn.execute("INSERT INTO seasons(id,name,start_year,end_year,is_current) VALUES (1,?,?,?,?)",
                 (season, start, start + 1, current))
    conn.executescript("INSERT INTO categories(id,name) VALUES (1,'BENJAMIN'),(2,'PREBENJAMIN'),(3,'ALEVIN');")
    for i, t in enumerate(TEAMS, 1):
        conn.execute("INSERT INTO teams(id,name) VALUES (?,?)", (i, t))
    for gid, cat, code in ((1, 1, "FF1"), (2, 3, "AL1")):
        conn.execute("""INSERT INTO groups(id,season_id,category_id,code,name,full_name,phase,island)
                        VALUES (?,1,?,?,'Grupo 1',?,'Primera Fase GC','grancanaria')""", (gid, cat, code, code))
        for pos, tid in enumerate(range(1, 5), 1):
            conn.execute("""INSERT INTO standings(group_id,team_id,position,points,played,won,drawn,lost,gf,gc,gd)
                            VALUES (?,?,?,0,0,0,0,0,0,0,0)""", (gid, tid, pos))
        for home, away, hs, as_ in ((1, 2, 3, 1), (3, 4, 0, 2)):
            conn.execute("""INSERT INTO matches(group_id,jornada,date,home_team_id,away_team_id,home_score,away_score)
                            VALUES (?,'Jornada 1',?,?,?,?,?)""", (gid, f"{start}-10-04", home, away, hs, as_))
    conn.commit()
    return conn


def acta(cod, competition, home, away, hs, as_, comp_id, season="2025/2026"):
    return {"header": {"season": season, "jornada": "1", "date": "04-10-2025", "competition": competition,
                       "home_team": home, "away_team": away, "home_score": hs, "away_score": as_},
            "lineups": {"home": [{"name": "JUGADOR PRUEBA, UNO", "dorsal": 7, "role": "starter", "fiflp_id": cod}],
                        "away": [{"name": "JUGADOR PRUEBA, DOS", "dorsal": 4, "role": "starter", "fiflp_id": cod + 1}]},
            "events": [], "staff": {}, "consistent": True, "cod_acta": cod,
            "enumeration": {"comp_id": comp_id, "grupo": "1", "jornada": "1"}}


def cod_of(conn, code, home_id):
    return conn.execute("""SELECT m.cod_acta FROM matches m JOIN groups g ON g.id=m.group_id
                           WHERE g.code=? AND m.home_team_id=?""", (code, home_id)).fetchone()[0]


@pytest.fixture
def importer(tmp_path, monkeypatch):
    import import_fiflp_actas as I
    monkeypatch.setattr(I, "UNMATCHED_PATH", str(tmp_path / "unmatched.json"))
    return I


def test_both_raws_are_imported_each_with_its_own_fingerprint(tmp_path, importer):
    I = importer
    conn = base()
    usual = {"778": acta(778, f"{BENJAMIN_COMP} (GRUPO 1)", "GALDAR, C.F.", 'TABLERO, C.D. "A"', 0, 2, "54422885")}
    alevin = {"777": acta(777, f"{ALEVIN_COMP} (GRUPO 1)", "ARUCAS, C.F.", "MOYA, U.D.", 3, 1, "54422881")}
    (tmp_path / "fiflp_actas_2025-2026_raw.json").write_text(json.dumps(usual), encoding="utf-8")
    (tmp_path / "fiflp_actas_2025-2026_alevin_raw.json").write_text(json.dumps(alevin), encoding="utf-8")
    reports = I.import_changed_raws(conn, str(tmp_path), log=lambda *a: None)
    assert list(reports) == ["fiflp_actas_2025-2026_raw.json", "fiflp_actas_2025-2026_alevin_raw.json"]
    assert [r["matched"] for r in reports.values()] == [1, 1]
    assert cod_of(conn, "FF1", 3) == 778 and cod_of(conn, "AL1", 1) == 777
    assert cod_of(conn, "AL1", 3) is None and cod_of(conn, "FF1", 1) is None     # nunca en la otra categoría
    for name in reports:
        content = (tmp_path / name).read_bytes()
        digest = hashlib.sha1(I.IMPORT_VERSION.encode() + content).hexdigest()
        assert conn.execute("SELECT sha1 FROM raw_imports WHERE path=?", (name,)).fetchone() == (digest,)
    assert I.import_changed_raws(conn, str(tmp_path), log=lambda *a: None) == {}

    # El raw de siempre cambia y trae un acta sin competición en la cabecera (la purga, sin filtro de
    # categoría): las actas del raw de alevín no son huérfanas.
    usual["779"] = {**acta(779, None, "MOYA, U.D.", "ARUCAS, C.F.", 1, 1, "54422885")}
    del usual["779"]["header"]["competition"]
    (tmp_path / "fiflp_actas_2025-2026_raw.json").write_text(json.dumps(usual), encoding="utf-8")
    again = I.import_changed_raws(conn, str(tmp_path), log=lambda *a: None)
    assert list(again) == ["fiflp_actas_2025-2026_raw.json"]
    assert again["fiflp_actas_2025-2026_raw.json"]["orphans_cleared"] == 0
    assert cod_of(conn, "AL1", 1) == 777
    al1 = conn.execute("SELECT id FROM matches WHERE cod_acta=777").fetchone()[0]
    assert conn.execute("SELECT count(*) FROM appearances WHERE match_id=?", (al1,)).fetchone()[0] == 2

    # Y al revés: el de alevín cambia y no deja huérfanas las de benjamín.
    alevin["777"]["header"]["time"] = "11:00"
    (tmp_path / "fiflp_actas_2025-2026_alevin_raw.json").write_text(json.dumps(alevin), encoding="utf-8")
    again = I.import_changed_raws(conn, str(tmp_path), log=lambda *a: None)
    assert list(again) == ["fiflp_actas_2025-2026_alevin_raw.json"]
    assert cod_of(conn, "FF1", 3) == 778


def test_an_acta_in_both_raws_while_it_moves_imports_like_in_one(tmp_path, importer):
    """Mientras un acta de alevín pasa del raw de siempre (una tanda antigua) al suyo, está en los dos
    (la adopta la tanda de alevín antes de que la suelte la de siempre): la base sale igual que con el
    acta en un solo raw, en cada paso, y al soltarla nadie la deja huérfana."""
    I = importer
    al = acta(777, f"{ALEVIN_COMP} (GRUPO 1)", "ARUCAS, C.F.", "MOYA, U.D.", 3, 1, "54422881")
    # Otros jugadores (otros fiflp_id y otros nombres): sin homónimos, cuyo «#id» depende del orden.
    ben = acta(780, f"{BENJAMIN_COMP} (GRUPO 1)", "GALDAR, C.F.", 'TABLERO, C.D. "A"', 0, 2, "54422885")
    for side, name in (("home", "JUGADOR PRUEBA, TRES"), ("away", "JUGADOR PRUEBA, CUATRO")):
        ben["lineups"][side][0]["name"] = name
    usual_raw, alevin_raw = tmp_path / "fiflp_actas_2025-2026_raw.json", tmp_path / "fiflp_actas_2025-2026_alevin_raw.json"

    def dump(conn):
        """La base sin ids (el orden de inserción cambia con el raw donde está cada acta)."""
        return [sorted(conn.execute("""SELECT group_id, jornada, date, time, home_team_id, away_team_id, home_score,
                                              away_score, venue, cod_acta, fiflp_acta FROM matches""")),
                sorted(conn.execute("""SELECT m.cod_acta, a.team_id, p.full_name, p.fiflp_id, a.dorsal, a.role, a.goals,
                                              a.yellow, a.red FROM appearances a JOIN matches m ON m.id=a.match_id
                                       JOIN players p ON p.id=a.player_id""")),
                sorted(conn.execute("SELECT full_name, norm_name, fiflp_id FROM players")),
                sorted(conn.execute("""SELECT m.cod_acta, e.team_id, e.kind, e.minute, e.goal_type FROM match_events e
                                       JOIN matches m ON m.id=e.match_id""")),
                sorted(conn.execute("""SELECT m.cod_acta, s.team_id, s.kind, s.name FROM match_staff s
                                       JOIN matches m ON m.id=s.match_id"""))]

    def run(conn, usual, alevin):
        usual_raw.write_text(json.dumps(usual), encoding="utf-8")
        if alevin is None:
            alevin_raw.unlink(missing_ok=True)
        else:
            alevin_raw.write_text(json.dumps(alevin), encoding="utf-8")
        I.import_changed_raws(conn, str(tmp_path), log=lambda *a: None)
        return dump(conn)

    clean = run(base(), {"780": ben}, {"777": al})
    conn = base()
    assert run(conn, {"777": al, "780": ben}, None) == clean               # la tanda antigua: en el de siempre
    assert run(conn, {"777": al, "780": ben}, {"777": al}) == clean        # la adopta la de alevín
    assert run(conn, {"780": ben}, {"777": al}) == clean                   # la suelta la de siempre
    assert cod_of(conn, "AL1", 1) == 777


def test_an_acta_really_gone_from_its_raw_is_still_cleared(tmp_path, importer):
    """La purga de siempre sigue: un acta de benjamín que ya no está en ningún raw de la temporada."""
    I = importer
    conn = base()
    conn.execute("UPDATE matches SET cod_acta=500 WHERE group_id=1 AND home_team_id=1")
    conn.commit()
    usual = {"778": acta(778, f"{BENJAMIN_COMP} (GRUPO 1)", "GALDAR, C.F.", 'TABLERO, C.D. "A"', 0, 2, "54422885")}
    (tmp_path / "fiflp_actas_2025-2026_raw.json").write_text(json.dumps(usual), encoding="utf-8")
    (tmp_path / "fiflp_actas_2025-2026_alevin_raw.json").write_text(json.dumps({"501": {}}), encoding="utf-8")
    report = I.import_raw(conn, str(tmp_path / "fiflp_actas_2025-2026_raw.json"))
    assert report["orphans_cleared"] == 1 and cod_of(conn, "FF1", 1) is None


# ── Los que leen índices y raws de actas: los de los dos lotes juntos ────────

def write_lotes(folder, season="2025-2026"):
    usual_index = {"778": {"comp_id": "54422885", "grupo": "1", "jornada": "1"}}
    alevin_index = {"777": {"comp_id": "54422881", "grupo": "1", "jornada": "1"}}
    (folder / f"fiflp_actas_{season}_index.json").write_text(json.dumps(usual_index), encoding="utf-8")
    (folder / f"fiflp_actas_{season}_alevin_index.json").write_text(json.dumps(alevin_index), encoding="utf-8")
    usual = {"778": acta(778, f"{BENJAMIN_COMP} (GRUPO 1)", "GALDAR, C.F.", 'TABLERO, C.D. "A"', 0, 2, "54422885")}
    alevin = {"777": acta(777, f"{ALEVIN_COMP} (GRUPO 1)", "ARUCAS, C.F.", "MOYA, U.D.", 3, 1, "54422881")}
    (folder / f"fiflp_actas_{season}_raw.json").write_text(json.dumps(usual), encoding="utf-8")
    (folder / f"fiflp_actas_{season}_alevin_raw.json").write_text(json.dumps(alevin), encoding="utf-8")


def test_load_merged_is_the_usual_file_untouched_without_alevin(tmp_path):
    index = {"5": {"comp_id": "1", "grupo": "2"}, "3": {"comp_id": "1", "grupo": "2"}}
    (tmp_path / "fiflp_actas_2025-2026_index.json").write_text(json.dumps(index), encoding="utf-8")
    merged = L.load_merged(tmp_path, "2025-2026", "index")
    assert merged == index and list(merged) == ["5", "3"]
    assert L.load_merged(tmp_path, "2024-2025", "raw") == {}
    (tmp_path / "fiflp_actas_2025-2026_alevin_index.json").write_text(
        json.dumps([{"cod_acta": 9, "comp_id": "4"}]), encoding="utf-8")                # índice en lista
    assert list(L.load_merged(tmp_path, "2025-2026", "index")) == ["5", "3", "9"]
    assert L.sibling_raw_keys(tmp_path / "fiflp_actas_2025-2026_raw.json") == set()
    (tmp_path / "fiflp_actas_2025-2026_alevin_raw.json").write_text('{"9": {}}', encoding="utf-8")
    assert L.sibling_raw_keys(tmp_path / "fiflp_actas_2025-2026_raw.json") == {"9"}
    assert L.sibling_raw_keys(tmp_path / "fiflp_actas_2025-2026_alevin_raw.json") == set()
    assert L.sibling_raw_keys(tmp_path / "otro.json") == set()


def test_goleadores_detalle_and_crests_match_groups_with_both_indexes(tmp_path, monkeypatch):
    import escudos_federacion as E
    import import_fiflp_detalle as D
    import import_fiflp_goleadores as G
    conn = base()
    write_lotes(tmp_path)
    gol = {"54422881:1": {"comp": "54422881", "grupo": "1", "comp_name": ALEVIN_COMP, "grupo_name": "GRUPO 1",
                          "ok": True, "standings": [], "scorers": [["JUGADOR PRUEBA, UNO", "ARUCAS, C.F.", 1, 1, 0]],
                          "crests": {"ARUCAS, C.F.": "https://example.invalid/escudo.png"}}}
    (tmp_path / "fiflp_goleadores_2025-2026_raw.json").write_text(json.dumps(gol), encoding="utf-8")
    det = {"54422881:1": {"comp": "54422881", "grupo": "1", "comp_name": ALEVIN_COMP, "grupo_name": "GRUPO 1",
                          "ok": True, "clasificacion": []}}
    (tmp_path / "fiflp_detalle_2025-2026_raw.json").write_text(json.dumps(det), encoding="utf-8")
    seen = []
    monkeypatch.setattr(G, "match_group", lambda conn, season_id, index, entry: seen.append(set(index)) or None)
    G.import_raw(conn, str(tmp_path / "fiflp_goleadores_2025-2026_raw.json"), log=lambda *a: None)
    D.migrate(conn)
    D.import_raw(conn, str(tmp_path / "fiflp_detalle_2025-2026_raw.json"), log=lambda *a: None)
    monkeypatch.setattr(E, "ficha_candidates", lambda *a: {})
    E.candidates(conn, folder=tmp_path)
    assert seen == [{"777", "778"}] * 3


def test_the_alevin_calendar_of_the_detail_uses_the_scores_of_the_alevin_raw(tmp_path, monkeypatch):
    import import_fiflp_detalle as D
    import import_fiflp_goleadores as G
    conn = base()
    write_lotes(tmp_path)
    det = {"54422881:1": {"comp": "54422881", "grupo": "1", "comp_name": ALEVIN_COMP, "grupo_name": "GRUPO 1",
                          "ok": True, "clasificacion": []}}
    (tmp_path / "fiflp_detalle_2025-2026_raw.json").write_text(json.dumps(det), encoding="utf-8")
    monkeypatch.setattr(G, "match_group", lambda *a: 2)
    got = {}

    def write_group(conn, season_id, gid, det, entry, archived, log, calendar=False, acta_scores=None):
        got.update(gid=gid, calendar=calendar, scores=acta_scores)
        return 0, 0, 0
    monkeypatch.setattr(D, "write_group", write_group)
    D.migrate(conn)
    D.import_raw(conn, str(tmp_path / "fiflp_detalle_2025-2026_raw.json"), log=lambda *a: None)
    assert got == {"gid": 2, "calendar": True, "scores": {778: (0, 2), 777: (3, 1)}}


def test_a_missing_alevin_group_is_created_from_the_alevin_raw(tmp_path):
    import import_fiflp_grupos as GR
    conn = base()
    conn.execute("DELETE FROM matches WHERE group_id=2")
    conn.execute("DELETE FROM standings WHERE group_id=2")
    conn.execute("DELETE FROM groups WHERE id=2")
    conn.commit()
    write_lotes(tmp_path)
    teams = ["ARUCAS, C.F.", "MOYA, U.D.", "GALDAR, C.F.", 'TABLERO, C.D. "A"']
    gol = {"54422881:1": {"comp": "54422881", "grupo": "1", "comp_name": ALEVIN_COMP, "grupo_name": "GRUPO 1",
                          "ok": True, "scorers": [],
                          "standings": [{"pos": i + 1, "team": t, "pts": 3 - i, "j": 1, "g": 1, "e": 0, "p": 0,
                                         "gf": 3, "gc": 1, "df": 2} for i, t in enumerate(teams)]}}
    (tmp_path / "fiflp_goleadores_2025-2026_raw.json").write_text(json.dumps(gol), encoding="utf-8")
    report = GR.import_season(conn, str(tmp_path), "2025-2026", log=lambda *a: None)
    assert report["created"] == 1
    rows = conn.execute("""SELECT g.code, c.name, m.cod_acta, m.home_score, m.away_score FROM matches m
                           JOIN groups g ON g.id=m.group_id JOIN categories c ON c.id=g.category_id
                           WHERE g.code LIKE 'AL%'""").fetchall()
    assert rows == [("AL1", "ALEVIN", 777, 3, 1)]


def test_the_actas_of_a_season_are_complete_when_every_lote_started_is(tmp_path):
    import import_fiflp_grupos as GR
    season = "2019-2020"

    def put(lote, kind, data):
        (tmp_path / L.file_name(season, kind, lote)).write_text(json.dumps(data), encoding="utf-8")
    assert not GR.actas_complete(str(tmp_path), season)
    for kind, data in (("raw", {}), ("index", {}), ("status", {"pending": 0})):
        put("", kind, data)
    assert GR.actas_complete(str(tmp_path), season)                 # sin alevín: lo de siempre
    put("alevin", "raw", {})
    put("alevin", "index", {})
    assert not GR.actas_complete(str(tmp_path), season)             # alevín empezado, sin estado
    put("alevin", "status", {"pending": 3, "fetched": 2})
    assert not GR.actas_complete(str(tmp_path), season)
    put("alevin", "status", {"pending": 3, "fetched": 0, "unenumerated_comps": 0})
    assert GR.actas_complete(str(tmp_path), season)                 # atascada: no hay más que bajar
    put("", "status", {"pending": 1, "fetched": 4})
    assert not GR.actas_complete(str(tmp_path), season)


def test_the_groups_fingerprint_only_changes_when_alevin_files_exist(tmp_path):
    import import_fiflp_actas as I
    import import_fiflp_grupos as GR
    season = "2025-2026"
    (tmp_path / f"fiflp_goleadores_{season}_raw.json").write_text("{}", encoding="utf-8")
    (tmp_path / f"fiflp_actas_{season}_index.json").write_text('{"1": {}}', encoding="utf-8")
    (tmp_path / f"fiflp_actas_{season}_raw.json").write_text('{"1": {}}', encoding="utf-8")
    # La fórmula de antes de partir los raws (GRUPOS_VERSION 5): la huella no cambia sin alevín.
    h = hashlib.sha1((GR.GRUPOS_VERSION + I.IMPORT_VERSION).encode())
    for name in (f"fiflp_goleadores_{season}_raw.json", f"fiflp_actas_{season}_index.json",
                 f"fiflp_actas_{season}_raw.json"):
        h.update(name.encode())
        h.update((tmp_path / name).read_bytes())
    assert GR.sources_digest(str(tmp_path), season) == h.hexdigest()
    (tmp_path / f"fiflp_actas_{season}_alevin_index.json").write_text('{"2": {}}', encoding="utf-8")
    with_index = GR.sources_digest(str(tmp_path), season)
    assert with_index != h.hexdigest()
    (tmp_path / f"fiflp_actas_{season}_alevin_raw.json").write_text('{"2": {}}', encoding="utf-8")
    assert GR.sources_digest(str(tmp_path), season) not in (with_index, h.hexdigest())


# ── Los workflows ─────────────────────────────────────────────────────────────

WF = ROOT / ".github" / "workflows"


def steps(name, job):
    return yaml.safe_load((WF / name).read_text(encoding="utf-8"))["jobs"][job]["steps"]


def gh_contains(search, item):
    """contains() de las expresiones de GitHub Actions con cadenas: sin distinguir mayúsculas, pero
    sin quitar tildes («alevín» no contiene «alevin»)."""
    return item.lower() in (search or "").lower()


def chain_lote(workflow, categorias):
    """(sufijo del grupo de concurrencia, LOTE_CADENA de cada paso) de actas-federacion.yml para un
    valor de la entrada categorias, evaluando sus expresiones como GitHub."""
    import re
    expr = re.compile(r"\$\{\{ contains\(inputs\.categorias, '([^']+)'\) && '([^']*)' \|\| '([^']*)' \}\}")

    def evaluate(text):
        m = expr.fullmatch(text.strip())
        assert m, f"expresión inesperada: {text}"
        return m.group(2) if gh_contains(categorias, m.group(1)) else m.group(3)
    group = workflow["concurrency"]["group"]
    prefix = "actas-federacion-${{ inputs.temporada }}"
    assert group.startswith(prefix)
    lotes = {s["name"]: evaluate(s["env"]["LOTE_CADENA"]) for s in workflow["jobs"]["scrape"]["steps"]
             if "LOTE_CADENA" in (s.get("env") or {})}
    return evaluate(group[len(prefix):]), lotes


def test_the_chain_of_each_lote_has_its_concurrency_group_and_tells_it_to_the_script():
    """El grupo de concurrencia y el --lote de la cadena salen de la misma expresión, y para todo valor
    de categorias que el script acepta, el del lote de sus categorías: también con tilde («alevín»,
    que parse_categories acepta y contains(…, 'alevin') no reconocía: la cadena de alevín caía en el
    grupo de benjamín)."""
    from scripts import categorias as C
    data = yaml.safe_load((WF / "actas-federacion.yml").read_text(encoding="utf-8"))
    for value in ("alevin", "alevín", "Alevín", "ALEVÍN", "ALEVIN", " alevin ", "", "benjamin,prebenjamin",
                  "benjamin", "Prebenjamín", "BENJAMÍN,prebenjamin"):
        lote = L.lotes_of(C.parse_categories(value))
        assert len(lote) == 1, value
        suffix, steps_lote = chain_lote(data, value)
        assert set(steps_lote) == {"Descargar actas (tanda)", "Subir el raw", "Siguiente tanda"}
        expected = {"alevin": "alevin", "": "siempre"}[lote[0]]
        assert suffix == ("-alevin" if expected == "alevin" else ""), value
        assert set(steps_lote.values()) == {expected}, value
        assert A.LOTE_ARG[expected] == lote[0]
    # Y lo que mezcla lotes o no existe cae en un grupo, pero el script para (--lote no casa).
    for value in ("benjamin,alevin", "alevines"):
        suffix, steps_lote = chain_lote(data, value)
        assert suffix == "-alevin" and set(steps_lote.values()) == {"alevin"}
    download = next(s for s in data["jobs"]["scrape"]["steps"] if s.get("name") == "Descargar actas (tanda)")
    assert "--lote $LOTE_CADENA" in download["run"]


def test_the_actas_workflow_uploads_only_the_files_of_its_lote(tmp_path):
    """El git add explícito de «Subir el raw», ejecutado con un git de mentira: sube raw, índice y
    estado del lote de la cadena (los que existan), nunca los del otro lote (son de la cadena de su
    grupo de concurrencia, que puede estar subiendo a la vez)."""
    upload = next(s for s in steps("actas-federacion.yml", "scrape") if s.get("name") == "Subir el raw")
    script = upload["run"]
    loop = script[script.index('LOTE=""'):script.index("if git diff --cached --quiet")]
    (tmp_path / "scripts").mkdir()
    present = ["fiflp_actas_2025-2026_raw.json", "fiflp_actas_2025-2026_status.json",
               "fiflp_actas_2025-2026_alevin_raw.json", "fiflp_actas_2025-2026_alevin_index.json",
               "fiflp_actas_2025-2026_alevin_status.json", "fiflp_actas_2024-2025_alevin_raw.json"]
    for name in present:
        (tmp_path / "scripts" / name).write_text("{}", encoding="utf-8")
    for lote, mine in (("siempre", lambda n: "alevin" not in n), ("alevin", lambda n: "alevin" in n)):
        (tmp_path / "added.txt").write_text("", encoding="utf-8")
        bash = f'git() {{ echo "$2" >> added.txt; }}\nLABEL=2025-2026\nLOTE_CADENA={lote}\n{loop}'
        subprocess.run(["bash", "-c", bash], cwd=tmp_path, check=True)
        added = (tmp_path / "added.txt").read_text(encoding="utf-8").split()
        assert sorted(added) == sorted(f"scripts/{n}" for n in present if "2025-2026" in n and mine(n)), lote


def run_next_tanda(tmp_path, categorias, temporada="21", cola="20,19", tandas="4", statuses=()):
    """El paso «Siguiente tanda» de actas-federacion.yml con un gh de mentira (apunta sus llamadas) y
    una copia de fetch_fiflp_actas.py cuyos estados son los de `statuses` ({fichero: estado})."""
    data = yaml.safe_load((WF / "actas-federacion.yml").read_text(encoding="utf-8"))
    step = next(s for s in data["jobs"]["scrape"]["steps"] if s.get("name") == "Siguiente tanda")
    work = tmp_path / "work"
    (work / "scripts").mkdir(parents=True)
    for name in ("fetch_fiflp_actas.py", "fiflp_comps_catalog.json"):
        (work / "scripts" / name).write_bytes((ROOT / "scripts" / name).read_bytes())
    for name, status in dict(statuses).items():
        (work / "scripts" / name).write_text(json.dumps(status), encoding="utf-8")
    (tmp_path / "bin").mkdir()
    gh = tmp_path / "bin" / "gh"
    gh.write_text(f'#!/bin/sh\necho "$@" >> {tmp_path / "gh.txt"}\n', encoding="utf-8")
    gh.chmod(0o755)
    _suffix, lotes = chain_lote(data, categorias)
    env = {**os.environ, "PATH": f"{tmp_path / 'bin'}:{os.environ['PATH']}", "PYTHONPATH": str(ROOT),
           "TEMP_INPUT": temporada, "COLA": cola, "TANDAS": tandas, "COMPS_INPUT": "", "CATS_INPUT": categorias,
           "LOTE_CADENA": lotes["Siguiente tanda"], "REFRESCAR": "false", "GH_TOKEN": "x"}
    out = subprocess.run(["bash", "-e", "-c", step["run"]], cwd=work, env=env, capture_output=True, text=True, check=True)
    calls = (tmp_path / "gh.txt").read_text(encoding="utf-8").splitlines() if (tmp_path / "gh.txt").exists() else []
    return out.stdout, calls


@pytest.mark.parametrize("categorias", ["alevines", "benjamin,alevin", "benjamin,prebenjamin,alevín"])
def test_a_chain_with_categories_it_cannot_download_stops_and_skips_the_queue(tmp_path, categorias):
    """Antes, unas categorías que no existen tiraban --estado y la cadena tomaba la reserva
    {"pending": 1}: se relanzaba hasta gastar las tandas (40), fallando en cada una."""
    out, calls = run_next_tanda(tmp_path, categorias)
    assert calls == [] and "La cadena para:" in out, out


def test_the_next_tanda_follows_the_state_of_the_lote_of_the_chain(tmp_path):
    done = {"pending": 0, "fetched": 4, "unenumerated_comps": 0}
    out, calls = run_next_tanda(tmp_path / "a", "alevín", statuses={
        "fiflp_actas_2025-2026_status.json": done,
        "fiflp_actas_2025-2026_alevin_status.json": {"pending": 7, "fetched": 3}})
    assert len(calls) == 1 and "-f temporada=21" in calls[0] and "-f categorias=alevín" in calls[0], out
    out, calls = run_next_tanda(tmp_path / "b", "benjamin,prebenjamin", statuses={
        "fiflp_actas_2025-2026_status.json": done,
        "fiflp_actas_2025-2026_alevin_status.json": {"pending": 7, "fetched": 3}})
    assert len(calls) == 1 and "-f temporada=20" in calls[0] and "-f cola=19" in calls[0], out


def test_the_other_workflows_need_no_new_files():
    """goleadores y detalle no se parten (pesan poco: actas_lotes.py) y suben sus raws por glob; el bot
    nunca sube raws de actas (los suben las tandas de actas-federacion.yml)."""
    gol = next(s for s in steps("goleadores-federacion.yml", "scrape") if s.get("name") == "Subir los raw")
    assert "scripts/fiflp_goleadores_*_raw.json" in gol["run"]
    det = next(s for s in steps("detalle-federacion.yml", "scrape") if s.get("name") == "Subir los raw")
    assert "scripts/fiflp_detalle_*_raw.json" in det["run"]
    bot = " ".join(s.get("run") or "" for s in steps("update.yml", "update"))
    assert "fiflp_actas" not in bot.replace("fiflp_actas_unmatched.json", "")
    legacy = (WF / "fetch-fiflp-actas.yml").read_text(encoding="utf-8")
    assert legacy.count("_alevin_raw.json") >= 2 and "add_if_exists scripts/fiflp_actas_*_raw.json" in legacy


def test_misplaced_finds_the_actas_in_the_raw_of_another_lote(tmp_path):
    (tmp_path / "fiflp_actas_2025-2026_raw.json").write_text(json.dumps({
        "1": {"header": {"competition": f"{ALEVIN_COMP} (GRUPO 1)"}},
        "2": {"header": {"competition": f"{BENJAMIN_COMP} (GRUPO 1)"}}, "3": {"header": {}}}), encoding="utf-8")
    (tmp_path / "fiflp_actas_2025-2026_alevin_raw.json").write_text(json.dumps({
        "4": {"header": {"competition": f"{ALEVIN_COMP} (GRUPO 2)"}}}), encoding="utf-8")
    assert L.misplaced(tmp_path) == {"fiflp_actas_2025-2026_raw.json": ["1"]}


def test_the_raws_in_the_repo_have_no_alevin_actas_in_the_usual_raw():
    """Los raws de siempre del repositorio no deberían tener actas de alevín. Si una tanda de antes de
    partir los raws (-f categorias=alevin) las dejó allí, las tandas las mueven solas (adopta la de
    alevín, suelta la de siempre): es un AVISO, no un fallo. Esta prueba corre en update.yml antes de
    subir la base y no puede parar al bot por el contenido de un raw."""
    import warnings
    wrong = L.misplaced(ROOT / "scripts")
    if wrong:
        warnings.warn("actas en el raw de otro lote (las moverán las tandas): "
                      + "; ".join(f"{name}: {len(cods)}" for name, cods in wrong.items()))
