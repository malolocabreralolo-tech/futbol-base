"""Nombres de la federación revisados a mano (fiflp_team_names.json): fiflp_names.fed_alias, los
importadores que la leen (known_names, los goleadores) y el fixer que la escribe
(_archive/fix_nombres_federacion.py)."""
import json
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "scripts" / "_archive"))
import fiflp_names  # noqa: E402
from db import SCHEMA  # noqa: E402
from migrate_actas_schema import migrate  # noqa: E402


@pytest.fixture
def table(tmp_path, monkeypatch):
    def write(entries):
        path = tmp_path / "fiflp_team_names.json"
        path.write_text(json.dumps(entries, ensure_ascii=False), encoding="utf-8")
        monkeypatch.setattr(fiflp_names, "FED_NAMES_PATH", str(path))
        fiflp_names.fed_alias.cache_clear()
    return write


def test_alias_exact_loose_and_the_first_team_letter(table):
    table({'HENEQUEN FUE. F.C., C.D.': 'Henequén FTV', 'PALMEIROS DE COSTA T., U.D. "A"': 'UD Palmeiros',
           'CORRALEJO B, C.D. "B"': 'Corralejo B', 'CORRALEJO, C.D. "B"': 'Corralejo B',
           'ROQUE AMAGRO-CLARAVISION, C.D.': 'Roque Amagro Claravisión', 'CLARAVISION-ROQUE AMAGRO, C.D.': 'Roque Amagro'})
    alias = fiflp_names.fed_alias
    assert alias('PALMEIROS DE COSTA T , U.D. "A"') == 'UD Palmeiros'          # sin la puntuación
    assert alias('HENEQUEN FUE. F.C. A "A"') == 'Henequén FTV'                  # la A es el primer equipo
    assert alias('HENEQUEN FUE. F.C. B "B"') is None                            # el filial no es su club
    assert alias('CORRALEJO, C.D. "B"') == 'Corralejo B'
    assert alias('CORRALEJO, C.D.') is None
    # Dos nombres con la misma clave de club y destinos distintos: por la clave, ninguno.
    assert alias('ROQUE AMAGRO CLARAVISION') is None
    assert alias('ROQUE AMAGRO-CLARAVISION, C.D.') == 'Roque Amagro Claravisión'


def test_known_names_follows_the_table_and_its_filials(table):
    from activate_season import known_names
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    table({'HENEQUEN FUE. F.C., C.D.': 'Henequén FTV'})
    raw = [{"island": "fuerteventura", "standings": [{"team": 'HENEQUEN FUE. F.C., C.D.'}, {"team": 'HENEQUEN FUE. F.C., C.D. "B"'}]}]
    names = known_names(raw, conn, years=[2025])
    assert names['HENEQUEN FUE. F.C., C.D.'] == 'Henequén FTV'
    assert names['HENEQUEN FUE. F.C., C.D. "B"'] == 'Henequén FTV B'


def test_a_scorer_of_a_reviewed_club_never_opens_a_new_team(table):
    from import_fiflp_goleadores import scorer_team
    table({'ATLETICO G.C., C.F. "C"': 'Atlético C'})
    assert scorer_team('ATLETICO G.C., C.F. C', {}) == 'Atlético C'
    assert scorer_team('OTRO, C.D.', {}) == 'OTRO, C.D.'


def fixer_base():
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.executescript("""
      INSERT INTO seasons(id, name, start_year, end_year) VALUES (1, '2024-2025', 2024, 2025), (2, '2025-2026', 2025, 2026),
                                                            (3, '2026-2027', 2026, 2027);
      INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN');
      INSERT INTO groups(id, season_id, category_id, code, phase, island) VALUES
        (1, 1, 1, 'P1', 'Primera Fase GC', 'grancanaria'), (2, 1, 1, 'P2', 'Primera Fase GC', 'grancanaria'),
        (3, 2, 1, 'A1', 'Segunda Fase A', 'grancanaria'), (4, 3, 1, 'FF1', 'Primera Fase GC', 'grancanaria');
      INSERT INTO teams(id, name, shield_filename) VALUES (1, 'Carnevali', NULL), (2, 'DANIEL CARNEVALI, C.D. "A"', 'carnevali.png'),
        (3, 'Roque Amagro', NULL), (4, 'ROQUE AMAGRO-CLARAVISION, C.D.', NULL), (5, 'COTILLO, C.D. EL', NULL),
        (6, 'Rival', NULL), (7, 'VIEJO SIN USO, C.D.', NULL);
      INSERT INTO standings(group_id, team_id, position) VALUES (1, 3, 1), (2, 4, 1), (3, 2, 1), (3, 6, 2), (4, 1, 1), (2, 5, 2);
      INSERT INTO matches(group_id, jornada, home_team_id, away_team_id, home_score, away_score) VALUES (3, '1', 2, 6, 2, 1);
    """)
    return conn


def test_fixer_merges_with_proof_renames_otherwise_and_moves_the_shield(monkeypatch):
    import fix_nombres_federacion as F
    monkeypatch.setattr(F, "NOMBRES", {
        'DANIEL CARNEVALI, C.D. "A"': ('Carnevali', 'Daniel Carnevali'),
        'ROQUE AMAGRO-CLARAVISION, C.D.': ('Roque Amagro', 'Roque Amagro Claravisión'),
        'COTILLO, C.D. EL': ('El Cotillo', None),
    })
    conn = fixer_base()
    shields = {'DANIEL CARNEVALI, C.D. "A"': 'fed_carnevali.png'}
    report = F.run(conn, shields, log=lambda *a: None)
    assert report["fundido"] == [('DANIEL CARNEVALI, C.D. "A"', 'Carnevali')]
    # P1 y P2: la misma fase de la misma temporada, dos equipos del club: no se funden.
    assert sorted(report["renombrado"]) == [('COTILLO, C.D. EL', 'El Cotillo'), ('ROQUE AMAGRO-CLARAVISION, C.D.', 'Roque Amagro Claravisión')]
    assert report["borrados"] == ['VIEJO SIN USO, C.D.']
    assert conn.execute("SELECT t.name FROM matches m JOIN teams t ON t.id=m.home_team_id").fetchone()[0] == 'Carnevali'
    assert conn.execute("SELECT shield_filename FROM teams WHERE name='Carnevali'").fetchone()[0] == 'carnevali.png'
    assert shields == {'Carnevali': 'fed_carnevali.png'}
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
