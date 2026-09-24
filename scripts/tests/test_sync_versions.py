"""Plan B2, tarea 1: rebase de la rama del rediseño (decisión 8).

El bot comitea en main index.html, sw.js y data-*. Al rebasar la rama, en
index.html y sw.js se queda la estructura de la rama con las marcas de versión
de main: todas las ?v=, el literal «Última actualización» y el CACHE_NAME de la
línea 1 de sw.js, las mismas que reescribe generate_js.bump_cache_version.
Ficheros sintéticos: nunca los index.html ni sw.js reales.
"""
import re
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sync_versions  # noqa: E402

MAIN_INDEX = (
    '<link rel="stylesheet" href="./style.css?v=20260930b">\n'
    '<div id="sec-miequipo"></div>\n'
    '<span id="legacyUpdated" hidden>Última actualización: 30/09/2026</span>\n'
    '<script src="./data-benjamin.js?v=20260930b"></script>\n'
    '<script src="./data-seasons.js?v=20260930b"></script>\n'
    '<script type="module" src="./src/app.js?v=20260930b"></script>\n'
)
MAIN_SW = (
    "const CACHE_NAME = 'futbolbase-v20260930b';\n"
    "const STATIC_ASSETS = ['./', './src/render.js'];\n"
)
BRANCH_INDEX = (
    '<link rel="stylesheet" href="./style.css?v=20260923j">\n'
    '<main id="contenido" class="page"><div class="box skeleton"></div></main>\n'
    '<span id="legacyUpdated" hidden>Última actualización: 23/09/2026</span>\n'
    '<script src="./data-benjamin.js?v=20260923j"></script>\n'
    '<script src="./data-seasons.js?v=20260923j"></script>\n'
    '<script type="module" src="./src/app.js?v=20260923j"></script>\n'
)
BRANCH_SW = (
    "const CACHE_NAME = 'futbolbase-v20260923j';\n"
    "// Rediseño: sin la caché futbolbase-vieja de antes\n"
    "const STATIC_ASSETS = ['./', './src/screen-home.js'];\n"
)


def test_marks_lee_las_tres_marcas():
    assert sync_versions.marks(MAIN_INDEX, MAIN_SW) == {
        "v": "20260930b", "footer": "30/09/2026", "cache": "20260930b",
    }


def test_la_rama_conserva_su_estructura_con_las_marcas_de_main():
    index, sw = sync_versions.apply_marks(
        BRANCH_INDEX, BRANCH_SW, sync_versions.marks(MAIN_INDEX, MAIN_SW))
    assert index == BRANCH_INDEX.replace("20260923j", "20260930b").replace("23/09/2026", "30/09/2026")
    assert index.count("?v=20260930b") == 4
    assert '<div class="box skeleton">' in index and "sec-miequipo" not in index
    assert sw.splitlines()[0] == "const CACHE_NAME = 'futbolbase-v20260930b';"
    assert sw.splitlines()[1:] == BRANCH_SW.splitlines()[1:], "solo cambia la línea 1"
    assert "screen-home.js" in sw and "render.js" not in sw


def test_solo_la_primera_cache_name_como_el_bot():
    _, sw = sync_versions.apply_marks(
        BRANCH_INDEX, BRANCH_SW, {"v": "20261001", "footer": "01/10/2026", "cache": "20261001"})
    assert "futbolbase-vieja" in sw, "count=1, igual que bump_cache_version"


def test_es_idempotente():
    want = sync_versions.marks(MAIN_INDEX, MAIN_SW)
    once = sync_versions.apply_marks(BRANCH_INDEX, BRANCH_SW, want)
    assert sync_versions.apply_marks(*once, want) == once


@pytest.mark.parametrize("index, sw, missing", [
    (MAIN_INDEX.replace("Última actualización: 30/09/2026", ""), MAIN_SW, "Última actualización"),
    (MAIN_INDEX.replace("?v=20260930b", ""), MAIN_SW, "?v="),
    (MAIN_INDEX, "const CACHE_NAME = 'otra';\n", "CACHE_NAME"),
], ids=["sin-literal", "sin-v", "sin-cache-name"])
def test_sin_una_marca_se_para(index, sw, missing):
    with pytest.raises(sync_versions.MarksError, match=re.escape(missing)):
        sync_versions.marks(index, sw)


def test_la_rama_tambien_tiene_que_llevar_las_marcas_del_bot():
    want = sync_versions.marks(MAIN_INDEX, MAIN_SW)
    with pytest.raises(sync_versions.MarksError, match="Última actualización"):
        sync_versions.apply_marks(BRANCH_INDEX.replace("Última actualización: 23/09/2026", ""), BRANCH_SW, want)


def _git(root, *args):
    subprocess.run(["git", "-C", str(root), "-c", "user.name=prueba", "-c", "user.email=prueba@example.test",
                    *args], check=True, capture_output=True)


@pytest.fixture
def repo(tmp_path):
    """Repositorio con main (las marcas buenas) y la rama en el árbol de trabajo."""
    _git(tmp_path, "init", "-q", "-b", "main")
    (tmp_path / "index.html").write_text(MAIN_INDEX, encoding="utf-8")
    (tmp_path / "sw.js").write_text(MAIN_SW, encoding="utf-8")
    _git(tmp_path, "add", "index.html", "sw.js")
    _git(tmp_path, "commit", "-q", "-m", "main")
    (tmp_path / "index.html").write_text(BRANCH_INDEX, encoding="utf-8")
    (tmp_path / "sw.js").write_text(BRANCH_SW, encoding="utf-8")
    return tmp_path


def test_cli_reescribe_con_las_marcas_de_la_ref(repo, capsys):
    assert sync_versions.main(["--from", "main", "--root", str(repo)]) == 0
    index = (repo / "index.html").read_text(encoding="utf-8")
    sw = (repo / "sw.js").read_text(encoding="utf-8")
    assert "?v=20260923j" not in index and index.count("?v=20260930b") == 4
    assert "Última actualización: 30/09/2026" in index and "skeleton" in index
    assert sw.startswith("const CACHE_NAME = 'futbolbase-v20260930b';\n") and "screen-home.js" in sw
    assert "20260930b" in capsys.readouterr().out


def test_cli_check_avisa_si_alguna_marca_no_coincide(repo, capsys):
    assert sync_versions.main(["--from", "main", "--root", str(repo), "--check"]) == 1
    assert "?v=" in capsys.readouterr().out
    assert (repo / "index.html").read_text(encoding="utf-8") == BRANCH_INDEX, "--check no escribe"
    sync_versions.main(["--from", "main", "--root", str(repo)])
    assert sync_versions.main(["--from", "main", "--root", str(repo), "--check"]) == 0


def test_cli_check_detecta_una_v_suelta(repo):
    sync_versions.main(["--from", "main", "--root", str(repo)])
    path = repo / "index.html"
    path.write_text(path.read_text(encoding="utf-8").replace(
        "./data-seasons.js?v=20260930b", "./data-seasons.js?v=20260923j"), encoding="utf-8")
    assert sync_versions.main(["--from", "main", "--root", str(repo), "--check"]) == 1


def test_solo_marcas_distingue_al_bot_de_un_arreglo_en_main():
    bot_index = MAIN_INDEX.replace("20260930b", "20261002").replace("30/09/2026", "02/10/2026")
    bot_sw = MAIN_SW.replace("20260930b", "20261002")
    assert sync_versions.only_marks_changed(MAIN_INDEX, MAIN_SW, bot_index, bot_sw)
    arreglo = MAIN_INDEX.replace('<div id="sec-miequipo"></div>', '<div id="sec-miequipo" class="active"></div>')
    assert not sync_versions.only_marks_changed(MAIN_INDEX, MAIN_SW, arreglo, MAIN_SW)
    assert not sync_versions.only_marks_changed(MAIN_INDEX, MAIN_SW, MAIN_INDEX, MAIN_SW + "// otra línea\n")


def test_cli_since_avisa_si_main_cambio_algo_mas_que_las_marcas(repo, capsys):
    bot = MAIN_INDEX.replace("20260930b", "20261002")
    for tag, index in (("bot", bot), ("arreglo", bot.replace("sec-miequipo", "sec-otra"))):
        (repo / "index.html").write_text(index, encoding="utf-8")
        _git(repo, "add", "index.html")
        _git(repo, "commit", "-q", "-m", tag)
        _git(repo, "tag", tag)
    (repo / "index.html").write_text(BRANCH_INDEX, encoding="utf-8")
    assert sync_versions.main(["--from", "bot", "--since", "main~2", "--root", str(repo)]) == 0
    assert sync_versions.main(["--from", "arreglo", "--since", "main~2", "--root", str(repo)]) == 1
    assert "a mano" in capsys.readouterr().out
    assert (repo / "index.html").read_text(encoding="utf-8") == BRANCH_INDEX, "--since no escribe"
