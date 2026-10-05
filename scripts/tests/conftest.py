"""Las pruebas no leen la tabla de nombres revisados del proyecto (scripts/fiflp_team_names.json):
describe la base de verdad, no las de prueba. La que la necesita pone la suya (test_fed_names.py)."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture(autouse=True)
def _sin_tabla_de_nombres(tmp_path_factory, monkeypatch):
    import fiflp_names
    modules = [fiflp_names] + [m for m in (sys.modules.get("scripts.fiflp_names"),) if m]
    for module in modules:
        monkeypatch.setattr(module, "FED_NAMES_PATH", str(tmp_path_factory.getbasetemp() / "sin-tabla.json"))
        module.fed_alias.cache_clear()
    yield
    for module in modules:
        module.fed_alias.cache_clear()
