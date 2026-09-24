"""Plan B2, tarea 4: el index.html y el sw.js del rediseño siguen siendo del bot.

generate_js.bump_cache_version y source_health.finish los leen y reescriben con
expresiones regulares. Si el esqueleto las rompiera, el bot dejaría de subir la
versión (o de publicar la fecha de los datos) sin avisar. Se ejecutan de verdad,
sobre copias de los ficheros reales.
"""
import json
import re
import shutil
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import generate_js  # noqa: E402
import source_health  # noqa: E402

VERSION_RE = re.compile(r"\?v=(\d{8}[a-z]?)")
FOOTER_RE = re.compile(r"Última actualización: (\d{2})/(\d{2})/(\d{4})")


@pytest.fixture
def site(tmp_path):
    for name in ("index.html", "sw.js"):
        shutil.copy(ROOT / name, tmp_path / name)
    return tmp_path


def test_bump_cache_version_sube_todas_las_marcas_y_nada_mas(site):
    before = (site / "index.html").read_text(encoding="utf-8")
    sw_before = (site / "sw.js").read_text(encoding="utf-8")
    generate_js.bump_cache_version(str(site))
    after = (site / "index.html").read_text(encoding="utf-8")
    versions = set(VERSION_RE.findall(after))
    assert len(versions) == 1, versions
    (version,) = versions
    assert version.startswith(date.today().strftime("%Y%m%d"))
    assert len(VERSION_RE.findall(after)) == len(VERSION_RE.findall(before)) >= 11
    assert f"Última actualización: {date.today().strftime('%d/%m/%Y')}" in after

    def neutral(text):
        return FOOTER_RE.sub("", VERSION_RE.sub("", text))

    assert neutral(after) == neutral(before), "el bot solo toca las marcas"
    sw = (site / "sw.js").read_text(encoding="utf-8")
    assert sw.splitlines()[0] == f"const CACHE_NAME = 'futbolbase-v{version}';"
    assert sw.splitlines()[1:] == sw_before.splitlines()[1:]


def test_source_health_lee_la_fecha_y_la_version_del_esqueleto(site, monkeypatch):
    monkeypatch.setattr(source_health, "ROOT", site)
    monkeypatch.setattr(source_health, "REPORT_PATH", site / "data-health.json")
    text = (site / "index.html").read_text(encoding="utf-8")
    day, month, year = FOOTER_RE.search(text).groups()
    version = re.search(r"data-seasons\.js\?v=([0-9a-z]+)", text).group(1)
    now = datetime(2026, 9, 24, 3, 35, tzinfo=timezone.utc)
    source_health.begin("2025-2026")
    source_health.record("PG2", "https://example.test/PG2", "ok", "15 equipos", now=now)
    source_health.finish(now=now)
    report = json.loads((site / "data-health.json").read_text(encoding="utf-8"))
    assert report["lastDataChange"] == f"{year}-{month}-{day}"
    assert report["dataVersion"] == version
