"""El detalle de la federación (2026-10): clasificación con casa/fuera y sanciones,
directorio de equipos (equipación, campo, escudo) y ficha de campo, leídos de
muestras reales (fixtures/detalle/), y el raspador reanudable que los guarda."""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import fetch_fiflp_detalle as D
from fiflp_detalle import parse_campo, parse_clasificacion, parse_directorio

FIX = Path(__file__).parent / "fixtures" / "detalle"


def read(name):
    return (FIX / name).read_text(encoding="utf-8")


def test_clasificacion_detallada_trae_casa_fuera_sancion_y_codigo_de_equipo():
    rows = parse_clasificacion(read("clasificacion_2526_A2.html"))
    assert len(rows) == 12
    mesas = next(r for r in rows if r["codequipo"] == 62744)
    assert mesas["team"] == 'MESAS HURACAN, U.D. LAS "A"'
    assert (mesas["pos"], mesas["pts"]) == (4, 43)
    assert mesas["home"] == {"j": 11, "g": 7, "e": 0, "p": 4}
    assert mesas["away"] == {"j": 11, "g": 7, "e": 1, "p": 3}
    assert (mesas["j"], mesas["g"], mesas["e"], mesas["p"]) == (22, 14, 1, 7)
    assert (mesas["gf"], mesas["gc"], mesas["sanction"]) == (137, 72, 0)
    assert mesas["form"] == "PGGPG"
    # Las filas salen en el orden de la tabla y con todos los puestos.
    assert [r["pos"] for r in rows] == list(range(1, 13))
    assert sum(r["home"]["j"] + r["away"]["j"] for r in rows) == 12 * 22


def test_clasificacion_de_una_jornada_temprana():
    rows = parse_clasificacion(read("clasificacion_2627_FF.html"))
    assert rows and all(r["codequipo"] for r in rows)
    lider = rows[0]
    assert lider["home"]["j"] + lider["away"]["j"] == lider["j"]


def test_la_resumida_sirve_si_no_hay_detallada():
    html = read("clasificacion_2526_A2.html")
    # Sin la tabla detallada (la primera), queda la resumida: sin casa/fuera.
    first = html.find("<table")
    second = html.find("<table", html.find("</table>", first))
    rows = parse_clasificacion(html[second:])
    assert len(rows) == 12
    assert "home" not in rows[0] and rows[0]["j"] == 22 and rows[0]["gf"] is None


def test_directorio_da_equipacion_campo_y_escudo_sin_contacto():
    teams = parse_directorio(read("directorio_2526_A2.html"))
    assert len(teams) == 12
    by_code = {t["codequipo"]: t for t in teams}
    udlp = by_code[31950]
    assert udlp["team"] == "PALMAS, U.D. LAS"
    assert (udlp["shirt"], udlp["shorts"], udlp["socks"]) == ("AMARILLA", "AZUL", "AZULES")
    assert (udlp["venue_code"], udlp["venue"]) == (75, "ANEXO GRAN CANARIA F8")
    assert udlp["surface"] == "Hierba Artificial (HA)"
    assert udlp["crest"].startswith("/pnfg/pimg/Clubes/")
    mesas = by_code[62744]
    assert mesas["shirt"] == "BLANCA CON FRANJA ROJA" and mesas["crest"] is None
    # Ni teléfonos, ni direcciones, ni personas: solo las claves de arriba.
    allowed = {"codequipo", "team", "crest", "shirt", "shorts", "socks", "venue_code", "venue", "surface"}
    assert all(set(t) == allowed for t in teams)
    blob = json.dumps(teams, ensure_ascii=False)
    assert "609111162" not in blob and "Penáguilas" not in blob and "Juan Francisco" not in blob


def test_ficha_de_campo():
    campo = parse_campo(read("campo_75.html"))
    assert campo["code"] == 75 and campo["name"] == "ANEXO GRAN CANARIA F8"
    assert (campo["lat"], campo["lon"]) == (28.102428, -15.4544136)
    assert campo["address"] == "C. Fondos de Segura, s/n"
    assert (campo["city"], campo["postal_code"]) == ("Las Palmas de Gran Canaria", "35019")
    assert campo["surface"] == "Hierba Artificial"
    assert campo["fenced"] is False and campo["internet"] is False
    assert "PALMAS, U.D. LAS (BEN)" in campo["teams"] and campo["training"] == []
    assert campo["photo"] is None


def test_ficha_vacia_o_sin_coordenadas():
    assert parse_campo("<html><head></head><body></body></html>") is None
    html = read("campo_75.html").replace("loc:28.102428+-15.4544136", "loc:0+0")
    assert parse_campo(html)["lat"] is None


# ── El raspador, con una web falsa ────────────────────────────────────────────

class FakePage:
    """Sirve el HTML de cada tipo de página; el desplegable de grupos por evaluate."""

    def __init__(self, web):
        self.web, self.url, self.visits = web, "", []

    def content(self):
        for key, html in self.web.items():
            if key in self.url:
                return html
        return "<html></html>"

    def evaluate(self, script, *args):
        if 'select[name="grupo"]' in script:
            return [["G1", "GRUPO 1"], ["G2", "GRUPO 2"]]
        if 'select[name="competicion"]' in script:
            return [{"id": "52", "name": "LIGA PREFERENTE BENJAMIN F-8 GRAN CANARIA"},
                    {"id": "92", "name": "LIGA PRIMERA BENJAMIN FUTBOL SALA GRAN CANARIA"},
                    {"id": "50", "name": "LIGA PREFERENTE ALEVIN F-8 GRAN CANARIA"}]
        return []

    def wait_for_timeout(self, ms):
        pass


class FakeF:
    BASE = "https://fed"

    def __init__(self, page, fail=()):
        self.page, self.fail = page, fail

    def goto(self, page, url):
        page.url = url
        page.visits.append(url)
        return not any(f in url for f in self.fail)

    def delay(self):
        pass


def web():
    return {"NFG_VisClasificacion": read("clasificacion_2526_A2.html"),
            "NFG_LstDirectorioEquipos": read("directorio_2526_A2.html"),
            "NFG_VisCampos": read("campo_75.html")}


def test_raspador_guarda_cada_grupo_y_reanuda(tmp_path, monkeypatch):
    monkeypatch.setattr(D, "HERE", tmp_path)
    monkeypatch.setattr(D, "CAMPOS_RAW", tmp_path / "fiflp_campos_raw.json")
    monkeypatch.setattr(D, "DB_PATH", tmp_path / "no-hay-base.db")
    page = FakePage(web())
    F = FakeF(page)
    # 2016-17 no está en el catálogo: las competiciones se leen de la web (sin sala ni alevín).
    assert D.run_groups(page, F, ["12"], set(), time.monotonic() + 60, log=lambda *a: None)
    raw = json.loads((tmp_path / "fiflp_detalle_2016-2017_raw.json").read_text())
    assert raw["_comps"] == [["52", "LIGA PREFERENTE BENJAMIN F-8 GRAN CANARIA"]]
    assert set(k for k in raw if not k.startswith("_")) == {"52:G1", "52:G2"}
    g1 = raw["52:G1"]
    assert g1["ok"] and len(g1["clasificacion"]) == 12 and len(g1["directorio"]) == 12
    assert g1["grupo_name"] == "GRUPO 1" and "jornadas" not in g1
    # Una segunda tanda no vuelve a pedir nada de lo ya leído.
    page.visits.clear()
    assert D.run_groups(page, F, ["12"], set(), time.monotonic() + 60, log=lambda *a: None)
    assert page.visits == []
    # Los campos: los de los directorios.
    assert D.run_campos(page, F, time.monotonic() + 60, log=lambda *a: None)
    campos = json.loads((tmp_path / "fiflp_campos_raw.json").read_text())
    assert campos["75"]["ok"] and campos["75"]["lat"] == 28.102428
    assert "148" in campos      # el de Las Mesas (Pepe Gonçalvez), aunque la web falsa sirva otra ficha


def test_un_grupo_que_no_carga_se_reintenta_en_la_siguiente_tanda(tmp_path, monkeypatch):
    monkeypatch.setattr(D, "HERE", tmp_path)
    page = FakePage(web())
    D.run_groups(page, FakeF(page, fail=("CodGrupo=G2", "Sch_CodGrupo=G2")), ["12"], set(),
                 time.monotonic() + 60, log=lambda *a: None)
    raw = json.loads((tmp_path / "fiflp_detalle_2016-2017_raw.json").read_text())
    assert raw["52:G1"]["ok"] and not raw["52:G2"]["ok"]
    page.visits.clear()
    D.run_groups(page, FakeF(page), ["12"], set(), time.monotonic() + 60, log=lambda *a: None)
    assert all("G2" in v for v in page.visits) and page.visits
    raw = json.loads((tmp_path / "fiflp_detalle_2016-2017_raw.json").read_text())
    assert raw["52:G2"]["ok"]


def test_plazo_agotado_para_sin_perder_lo_leido(tmp_path, monkeypatch):
    monkeypatch.setattr(D, "HERE", tmp_path)
    page = FakePage(web())
    assert D.run_groups(page, FakeF(page), ["12"], set(), time.monotonic() - 1, log=lambda *a: None) is False
