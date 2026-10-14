"""Las categorías de la base y de la federación (scripts/categorias.py y la migración
scripts/migrate_categories.py), con alevín de Gran Canaria como tercera categoría.

Todo lo que importa de la federación decide la categoría de una competición con
categorias.category_of: antes, cada importador tenía su copia y todo lo que no era
prebenjamín acababa en benjamín, alevín incluido.
"""
import json
import sqlite3
from pathlib import Path

import pytest

from categorias import category_of, parse_categories, DB_NAME

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("name, expected", [
    # Benjamín y prebenjamín, con y sin tildes ni guiones.
    ("LIGA BENJAMIN GRAN CANARIA FASE PREVIA", "BENJAMIN"),
    ("LIGA BENJAMÍN F7 GRAN CANARIA FASE LIGA A", "BENJAMIN"),
    ("COPA CABILDO DE LANZAROTE PREFERENTE BENJAMIN FUTBOL-8", "BENJAMIN"),
    ("LIGA BENJAMIN F-7 DE FUERTEVENTURA 1ª FASE", "BENJAMIN"),
    ("LIGA PREBENJAMIN DE GRAN CANARIA", "PREBENJAMIN"),
    ("TORNEO PRE-BENJAMIN CIERRE TEMPORADA", "PREBENJAMIN"),
    ("torneo pre-benjamin cierre temporada fuerteventura-lanzarote", "PREBENJAMIN"),
    ("COPA CAMPEONES PREBENJAMIN", "PREBENJAMIN"),
    # Alevín de Gran Canaria, en todos los formatos del catálogo.
    ("LIGA ALEVIN GRAN CANARIA FASE PREVIA", "ALEVIN"),
    ("LIGA ALEVIN F8 GRAN CANARIA SEGUNDA FASE A", "ALEVIN"),
    ("LIGA PREFERENTE ALEVIN F-8 GRAN CANARIA", "ALEVIN"),
    ("copa de campeones categoria alevin fase c", "ALEVIN"),
    ("CLAUSURA ALEVÍN", "ALEVIN"),
    ("COPA CAMPEONES ALEVÍN", "ALEVIN"),
    ("LIGA ALEVIN GRAN CANARIA FASE PREVIA (GRUPO 7)", "ALEVIN"),       # cabecera de un acta
    ("Liga Alevin Gran Canaria Grupo 12", "ALEVIN"),                     # liga de la app
    # Fuera: alevín de Lanzarote y Fuerteventura, fútbol sala y lo que no dice la categoría.
    ("LIGA ALEVIN LANZAROTE FASE 1", None),
    ("LIGA ALEVIN FUERTEVENTURA F7 1ª FASE", None),
    ("LIGA PREFERENTE ALEVIN F-8 DE LANZAROTE", None),
    ("COPA CABILDO DE LANZAROTE PRIMERA ALEVIN FUTBOL-8", None),
    ("LIGA ALEVIN FUTBOL SALA GRAN CANARIA", None),
    ("LIGA BENJAMÍN FUTBOL SALA GRAN CANARIA 2ªFASE", None),
    ("LIGA PREBENJAMIN FUTBOL SALA GRAN CANARIA (LPFS)", None),
    ("COPA FÚTBOL SALA PREBENJAMÍN", None),
    ("MINI COPA JOSÉ ANTONIO RUIZ CABALLERO", None),
    ("LIGA INFANTIL PREFERENTE", None),
    ("", None),
    (None, None),
])
def test_category_of(name, expected):
    assert category_of(name) == expected


def test_category_of_whole_catalog():
    """Cada competición del catálogo de la federación: nada de sala, nada de alevín fuera de Gran
    Canaria, y ningún benjamín tomado por prebenjamín ni al revés."""
    catalog = json.loads((ROOT / "scripts" / "fiflp_comps_catalog.json").read_text(encoding="utf-8"))
    seen = {"ALEVIN": 0, "BENJAMIN": 0, "PREBENJAMIN": 0}
    for season in catalog.values():
        for comp in season.get("all", []):
            cat = category_of(comp["name"])
            upper = comp["name"].upper()
            if "SALA" in upper or "LPFS" in upper:
                assert cat is None, comp
            if cat == "ALEVIN":
                assert "LANZAROTE" not in upper and "FUERTEVENTURA" not in upper, comp
            if cat:
                seen[cat] += 1
    assert all(seen.values()), seen
    # 2026-27: la Fase Previa alevín de Gran Canaria entra; las de Lanzarote y Fuerteventura, no.
    names = {c["id"]: category_of(c["name"]) for c in catalog["2026-2027"]["all"]}
    assert names["54976940"] == "ALEVIN" and names["54976933"] is None and names["54976977"] is None


def test_parse_categories():
    assert parse_categories("benjamin,prebenjamin") == ("BENJAMIN", "PREBENJAMIN")
    assert parse_categories(" alevín ") == ("ALEVIN",)
    assert parse_categories("ALEVIN,benjamin,alevin") == ("ALEVIN", "BENJAMIN")
    assert parse_categories("") == ("BENJAMIN", "PREBENJAMIN")       # por defecto, las de siempre
    assert parse_categories(None) == ("BENJAMIN", "PREBENJAMIN")
    with pytest.raises(ValueError, match="cadete"):
        parse_categories("benjamin,cadete")
    assert DB_NAME == {"benjamin": "BENJAMIN", "prebenjamin": "PREBENJAMIN", "alevin": "ALEVIN"}


# ── La tabla categories ──────────────────────────────────────────────────────

def _base(*names):
    from db import SCHEMA
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    for name in names:
        conn.execute("INSERT INTO categories(name) VALUES (?)", (name,))
    conn.execute("INSERT INTO seasons(name,start_year,end_year,is_current) VALUES('2026-2027',2026,2027,1)")
    conn.commit()
    return conn


def test_get_or_create_category_ignores_case_and_creates_in_upper_case():
    from db import get_or_create_category
    conn = _base("BENJAMIN", "PREBENJAMIN", "prebenjamin")
    assert get_or_create_category(conn, "prebenjamin") == 2      # la buena, no la duplicada
    assert get_or_create_category(conn, "Benjamin") == 1
    new = get_or_create_category(conn, "alevin")
    assert conn.execute("SELECT name FROM categories WHERE id=?", (new,)).fetchone() == ("ALEVIN",)
    assert get_or_create_category(conn, "ALEVIN") == new
    assert conn.execute("SELECT count(*) FROM categories").fetchone()[0] == 4


def test_migration_drops_the_orphan_lower_case_row_and_adds_alevin():
    from migrate_categories import migrate
    conn = _base("BENJAMIN", "PREBENJAMIN", "prebenjamin")
    conn.execute("INSERT INTO groups(season_id,category_id,code) VALUES (1,1,'FF1'),(1,2,'PG1')")
    report = migrate(conn)
    assert sorted(r[0] for r in conn.execute("SELECT name FROM categories")) == ["ALEVIN", "BENJAMIN", "PREBENJAMIN"]
    assert report == {"dropped": ["prebenjamin"], "kept": [], "created": ["ALEVIN"]}
    # Idempotente: otra pasada no cambia nada.
    before = conn.execute("SELECT id, name FROM categories ORDER BY id").fetchall()
    assert migrate(conn) == {"dropped": [], "kept": [], "created": []}
    assert conn.execute("SELECT id, name FROM categories ORDER BY id").fetchall() == before


def test_migration_never_drops_a_referenced_row():
    from migrate_categories import migrate
    conn = _base("BENJAMIN", "PREBENJAMIN", "prebenjamin")
    conn.execute("INSERT INTO groups(season_id,category_id,code) VALUES (1,3,'X1')")
    report = migrate(conn)
    assert report["kept"] == ["prebenjamin"] and report["dropped"] == []
    assert conn.execute("SELECT count(*) FROM categories WHERE name='prebenjamin'").fetchone()[0] == 1


def test_migration_on_a_copy_of_the_real_base(tmp_path):
    """La base del repositorio tiene la fila 3 ('prebenjamin') sin ningún grupo: se va, y nada más."""
    from migrate_categories import migrate
    db = ROOT / "futbolbase.db"
    if not db.exists():
        pytest.skip("sin futbolbase.db")
    copy = tmp_path / "fb.db"
    src = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    dst = sqlite3.connect(copy)
    src.backup(dst)
    src.close()
    groups = dst.execute("SELECT category_id, count(*) FROM groups GROUP BY category_id").fetchall()
    migrate(dst)
    assert {r[1] for r in dst.execute("SELECT id, name FROM categories")} == {"BENJAMIN", "PREBENJAMIN", "ALEVIN"}
    assert dst.execute("SELECT category_id, count(*) FROM groups GROUP BY category_id").fetchall() == groups
    dst.close()


def test_import_history_uses_the_upper_case_rows():
    import import_history
    conn = _base("BENJAMIN", "PREBENJAMIN")
    data = {"season": "2024-2025", "prebenjamin": {"groups": [
        {"name": "Grupo 1", "comp_id": 7, "standings": [{"team": "Moya", "pos": 1}], "jornadas": {}}]}}
    import_history.import_season(conn, data)
    assert [r[0] for r in conn.execute("SELECT name FROM categories ORDER BY id")] == ["BENJAMIN", "PREBENJAMIN"]
    assert conn.execute("SELECT c.name FROM groups g JOIN categories c ON c.id=g.category_id").fetchone() == ("PREBENJAMIN",)


def test_activation_picks_the_upper_case_row_even_after_the_duplicate():
    """insert_groups buscaba con lower(name)=? y fetchone() sin orden: con 'PREBENJAMIN' y
    'prebenjamin' en la base, el grupo iba a la que saliera primero."""
    from activate_season import insert_groups
    conn = _base("BENJAMIN", "prebenjamin", "PREBENJAMIN")       # la duplicada, delante
    group = {"id": "PG1", "cat": "prebenjamin", "name": "Grupo 1", "phase": "Gran Canaria",
             "island": "grancanaria", "url": "https://www.fiflp.com/x?CodCompeticion=1&CodGrupo=2"}
    evidence = [{"group": group, "rounds": {"Jornada 1": [["2026-10-03", "Moya", "Gáldar", None, None, None, None]]},
                 "standings": [[1, "Gáldar", 0, 0, 0, 0, 0, 0, 0, 0], [2, "Moya", 0, 0, 0, 0, 0, 0, 0, 0]],
                 "current": "Jornada 1"}]
    with conn:
        insert_groups(conn, 1, evidence)
    assert conn.execute("SELECT c.name FROM groups g JOIN categories c ON c.id=g.category_id").fetchone() == ("PREBENJAMIN",)


def test_the_bot_runs_the_category_migration_at_start():
    text = (ROOT / "scripts" / "fetch_futbolaspalmas.py").read_text(encoding="utf-8")
    main = text[text.index("def main():"):]
    assert "migrate_categories" in main and main.index("init_db(conn)") < main.index("migrate_categories")


@pytest.mark.parametrize("name, expected", [
    ("LIGA ALEVIN FUTBOL SALA GRAN CANARIA", True),
    ("LIGA PREBENJAMIN FUTBOL SALA GRAN CANARIA (LPFS)", True),
    ("LIGA ALEVIN LANZAROTE FASE 1", True),
    ("COPA CABILDO DE LANZAROTE PRIMERA ALEVIN FUTBOL-8", True),
    ("LIGA BENJAMIN DE LANZAROTE FASE 1", False),
    ("LIGA ALEVIN GRAN CANARIA FASE PREVIA", False),
    ("MINI COPA JOSÉ ANTONIO RUIZ CABALLERO", False),      # no dice la categoría: no se sabe
    ("test", False),
    (None, False),
])
def test_excluded(name, expected):
    from categorias import excluded
    assert excluded(name) is expected
