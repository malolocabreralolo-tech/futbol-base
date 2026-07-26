"""TDD — sonda de arranque de temporada (scripts/discover_temporada.py).

Solo las partes puras: extraer los enlaces de la portada y construir las
candidatas de prebenjamín. Lo que toca la red se prueba a mano.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from discover_temporada import (benjamin_links, prebenjamin_links,  # noqa: E402
                                PREBENJAMIN_MAX)

PORTADA = """
<ul>
  <li><a href="https://futbolaspalmas.com/benjamin/">Benjamín</a></li>
  <li><a href="https://futbolaspalmas.com/benjamin-segunda-fase-uno/">G1</a></li>
  <li><a href="https://futbolaspalmas.com/benjamin-segunda-fase-uno/">G1 otra vez</a></li>
  <li><a href="https://futbolaspalmas.com/benjamin-primera-grupo-uno-lanzarote/">LZ1</a></li>
  <li><a href="https://futbolaspalmas.com/cadete-primera/">Cadete</a></li>
  <li><a href="https://futbolaspalmas.com/1prebenjamin2">Prebenjamín 2</a></li>
</ul>
"""


class TestBenjaminLinks:
    def test_finds_the_competition_links(self):
        assert benjamin_links(PORTADA) == [
            "https://futbolaspalmas.com/benjamin-primera-grupo-uno-lanzarote/",
            "https://futbolaspalmas.com/benjamin-segunda-fase-uno/",
        ]

    def test_drops_the_category_landing_page(self):
        # '/benjamin/' es la portada de la categoría, no un grupo.
        assert "https://futbolaspalmas.com/benjamin/" not in benjamin_links(PORTADA)

    def test_ignores_other_categories(self):
        assert not any("cadete" in u for u in benjamin_links(PORTADA))

    def test_empty_or_broken_html(self):
        assert benjamin_links("") == []
        assert benjamin_links(None) == []


class TestPrebenjaminLinks:
    def test_numbered_pattern(self):
        urls = prebenjamin_links(3)
        assert urls == ["https://futbolaspalmas.com/1prebenjamin1",
                        "https://futbolaspalmas.com/1prebenjamin2",
                        "https://futbolaspalmas.com/1prebenjamin3"]

    def test_default_ceiling(self):
        assert len(prebenjamin_links()) == PREBENJAMIN_MAX
