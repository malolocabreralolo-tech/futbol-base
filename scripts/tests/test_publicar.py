"""Plan B4, tarea 2: la subida de versión de una publicación (spec §5.5; decisión 10 de B4).

Cada fase del rediseño se publica al terminarla. La publicación sube a la vez las ?v= de index.html y
CACHE_NAME de sw.js, con la misma cadena, y CODIGO, sin tocar «Última actualización», que es la
fecha de los datos (source_health la publica como lastDataChange). La versión es la fecha UTC y
estrictamente mayor que la vigente. El bot sigue como hoy: bump_cache_version sin argumentos mueve el
pie. Árboles sintéticos, y una copia del index.html y el sw.js reales: nunca los data-*.js vivos.
"""
import re
import shutil
import sys
from datetime import date
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import codigo  # noqa: E402
import generate_js  # noqa: E402
import publicar  # noqa: E402

VERSION_RE = re.compile(r"\?v=(\d{8}[a-z]?)")
FOOTER = "Última actualización: 01/09/2026"


def _tree(tmp_path, version="20260925b"):
    """index.html y sw.js con las marcas del bot, CODIGO y el código del que sale su huella."""
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "app.js").write_text("export function start() {}\n", encoding="utf-8")
    (tmp_path / "acta.css").write_text("body { margin: 0; }\n", encoding="utf-8")
    (tmp_path / "index.html").write_text(
        f'<link rel="stylesheet" href="./acta.css?v={version}">\n'
        f'<span id="legacyUpdated" hidden>{FOOTER}</span>\n'
        f'<script defer src="./data-seasons.js?v={version}"></script>\n'
        "<script type=\"module\">\n"
        "  const CODIGO = '00000000';\n"
        f"  import('./src/app.js?v={version}');\n"
        "</script>\n",
        encoding="utf-8",
    )
    (tmp_path / "sw.js").write_text(
        f"const CACHE_NAME = 'futbolbase-v{version}';\nconst OFFLINE_URL = './index.html';\n", encoding="utf-8")
    return tmp_path


@pytest.mark.parametrize("current, today, want", [
    ("20260925b", "20260926", "20260926"),     # vigente de un día anterior: la fecha del día
    ("20260926", "20260926", "20260926b"),     # vigente de hoy: la letra siguiente
    ("20260926b", "20260926", "20260926c"),
    ("20260927", "20260926", "20260927b"),     # vigente de un día posterior: nunca retrocede
    ("20260927c", "20260926", "20260927d"),
    ("20260925z", "20260926", "20260926"),     # con la z, pero de un día anterior: la fecha del día
], ids=["de-ayer", "de-hoy", "de-hoy-b", "posterior", "posterior-c", "z-de-ayer"])
def test_la_version_de_una_publicacion_es_estrictamente_mayor(current, today, want):
    assert publicar.next_publish_version(current, today) == want
    assert want > current


@pytest.mark.parametrize("current, today", [
    ("20260926z", "20260926"), ("20260927z", "20260926"), ("2026092", "20260926"), ("20260926", "hoy"),
], ids=["z-de-hoy", "z-posterior", "vigente-sin-forma", "hoy-sin-forma"])
def test_sin_version_posible_se_para(current, today):
    with pytest.raises(ValueError):
        publicar.next_publish_version(current, today)


def test_bump_cache_version_sin_tocar_el_pie(tmp_path):
    site = _tree(tmp_path)
    before = (site / "index.html").read_text(encoding="utf-8")
    generate_js.bump_cache_version(str(site), touch_footer=False, version="20260930")
    after = (site / "index.html").read_text(encoding="utf-8")
    assert VERSION_RE.findall(after) == ["20260930"] * 3
    assert FOOTER in after
    assert after == before.replace("20260925b", "20260930")
    assert (site / "sw.js").read_text(encoding="utf-8").splitlines()[0] == "const CACHE_NAME = 'futbolbase-v20260930';"


def test_bump_cache_version_del_bot_mueve_el_pie(tmp_path):
    # Sin argumentos, como la llama bump_if_changed: la versión del día y el pie, a hoy.
    site = _tree(tmp_path)
    generate_js.bump_cache_version(str(site))
    after = (site / "index.html").read_text(encoding="utf-8")
    today = date.today()
    assert set(VERSION_RE.findall(after)) == {today.strftime("%Y%m%d")}
    assert f"Última actualización: {today.strftime('%d/%m/%Y')}" in after


def test_bump_cache_version_rechaza_una_version_sin_la_forma_del_bot(tmp_path):
    site = _tree(tmp_path)
    before = (site / "index.html").read_text(encoding="utf-8")
    with pytest.raises(ValueError):
        generate_js.bump_cache_version(str(site), touch_footer=False, version="b4")
    assert (site / "index.html").read_text(encoding="utf-8") == before


def test_next_version_con_el_dia_del_bot():
    day = date(2026, 9, 26)
    assert generate_js._next_version('<script src="./a.js?v=20260925b">', day) == "20260926"
    assert generate_js._next_version('<script src="./a.js?v=20260926">', day) == "20260926b"
    assert generate_js._next_version('<script src="./a.js?v=20260926b">', day) == "20260926c"
    assert generate_js._next_version('<script src="./a.js?v=20260926z">', day) == "20260926z"


def test_el_bot_sigue_moviendo_el_pie_cuando_cambian_los_datos(tmp_path):
    site = _tree(tmp_path)
    (site / "data-foo.js").write_text("const FOO=1;\n", encoding="utf-8")
    before = generate_js.snapshot_data_files(str(site))
    (site / "data-foo.js").write_text("const FOO=2;\n", encoding="utf-8")
    assert generate_js.bump_if_changed(before, str(site)) is True
    assert f"Última actualización: {date.today().strftime('%d/%m/%Y')}" in (site / "index.html").read_text(encoding="utf-8")


def test_publicar_sube_las_marcas_y_codigo_sin_tocar_el_pie(tmp_path, monkeypatch, capsys):
    site = _tree(tmp_path)
    monkeypatch.setattr(publicar, "_today_utc", lambda: "20260925")
    assert publicar.main(["--root", str(site)]) == 0
    index = (site / "index.html").read_text(encoding="utf-8")
    assert VERSION_RE.findall(index) == ["20260925c"] * 3
    assert FOOTER in index
    assert f"const CODIGO = '{codigo.huella(site)}';" in index
    assert (site / "sw.js").read_text(encoding="utf-8").splitlines()[0] == "const CACHE_NAME = 'futbolbase-v20260925c';"
    assert capsys.readouterr().out.splitlines() == [
        f"versión 20260925c (antes, 20260925b): 3 ?v= en index.html y futbolbase-v20260925c en sw.js; «{FOOTER}», sin tocar",
        f"CODIGO {codigo.huella(site)}: la huella de acta.css y src/*.js, en index.html",
    ]


def test_publicar_se_para_si_las_v_no_son_todas_iguales(tmp_path, monkeypatch, capsys):
    # Una de las tres ?v= queda distinta de las otras dos (una fusión a medias, por ejemplo): la versión
    # no puede salir solo de la primera sin comprobar que todas van iguales.
    site = _tree(tmp_path, version="20260925b")
    index = (site / "index.html").read_text(encoding="utf-8")
    index = index.replace("data-seasons.js?v=20260925b", "data-seasons.js?v=20260925c", 1)
    (site / "index.html").write_text(index, encoding="utf-8")
    before = [(site / name).read_text(encoding="utf-8") for name in ("index.html", "sw.js")]
    monkeypatch.setattr(publicar, "_today_utc", lambda: "20260925")
    assert publicar.main(["--root", str(site)]) == 1
    assert [(site / name).read_text(encoding="utf-8") for name in ("index.html", "sw.js")] == before
    assert capsys.readouterr().out.strip().endswith(": nada escrito")


def test_publicar_se_para_si_cache_name_no_coincide_con_las_v(tmp_path, monkeypatch, capsys):
    # Las tres ?v= van iguales entre sí, pero el CACHE_NAME de sw.js quedó de otra versión.
    site = _tree(tmp_path, version="20260925b")
    sw = (site / "sw.js").read_text(encoding="utf-8")
    (site / "sw.js").write_text(sw.replace("futbolbase-v20260925b", "futbolbase-v20260925c", 1), encoding="utf-8")
    before = [(site / name).read_text(encoding="utf-8") for name in ("index.html", "sw.js")]
    monkeypatch.setattr(publicar, "_today_utc", lambda: "20260925")
    assert publicar.main(["--root", str(site)]) == 1
    assert [(site / name).read_text(encoding="utf-8") for name in ("index.html", "sw.js")] == before
    assert capsys.readouterr().out.strip().endswith(": nada escrito")


def test_publicar_se_para_en_la_z_sin_escribir(tmp_path, monkeypatch, capsys):
    site = _tree(tmp_path, version="20260925z")
    before = [(site / name).read_text(encoding="utf-8") for name in ("index.html", "sw.js")]
    monkeypatch.setattr(publicar, "_today_utc", lambda: "20260925")
    assert publicar.main(["--root", str(site)]) == 1
    assert [(site / name).read_text(encoding="utf-8") for name in ("index.html", "sw.js")] == before
    assert capsys.readouterr().out.strip() == "la versión 20260925z ya no admite otra letra: nada escrito"


def test_publicar_sobre_una_copia_del_arbol_solo_cambia_las_marcas(tmp_path, monkeypatch):
    # El index.html y el sw.js reales, con el código del que sale su CODIGO: solo cambian las ?v= y
    # CACHE_NAME (CODIGO ya es la huella del árbol, test_rediseno_index.mjs), nunca el pie ni el resto.
    for name in ("index.html", "sw.js", "acta.css"):
        shutil.copy(ROOT / name, tmp_path / name)
    shutil.copytree(ROOT / "src", tmp_path / "src")
    before = (tmp_path / "index.html").read_text(encoding="utf-8")
    sw_before = (tmp_path / "sw.js").read_text(encoding="utf-8")
    monkeypatch.setattr(publicar, "_today_utc", lambda: "20991231")
    assert publicar.main(["--root", str(tmp_path)]) == 0
    after = (tmp_path / "index.html").read_text(encoding="utf-8")
    assert VERSION_RE.sub("", after) == VERSION_RE.sub("", before)
    assert set(VERSION_RE.findall(after)) == {"20991231"}
    assert len(VERSION_RE.findall(after)) == len(VERSION_RE.findall(before))
    sw = (tmp_path / "sw.js").read_text(encoding="utf-8")
    assert sw.splitlines()[0] == "const CACHE_NAME = 'futbolbase-v20991231';"
    assert sw.splitlines()[1:] == sw_before.splitlines()[1:]
