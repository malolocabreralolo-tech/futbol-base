"""A new heading cannot activate old fixtures; activation preserves sporting rows."""
import copy
import json
from pathlib import Path
import shutil
import sqlite3
import sys
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from activate_season import validate_manifest, verify_sources, seed_season, apply_manifest
from db import SCHEMA, get_connection
from fetch_futbolaspalmas import parse_all_matches, parse_standings, existing_jornada
from portal_config import load_config

MANIFEST = {"season": "2026-2027", "defaultTeam": {"cat": "prebenjamin", "groupId": "NEW1", "name": "Local"},
            "groups": [{"id": "NEW1", "cat": "prebenjamin", "name": "Grupo 1", "phase": "Liga",
                        "island": "grancanaria", "url": "https://futbolaspalmas.com/1prebenjamin1/"}]}


def fixtures(year=2026):
    return f'<h1>2026-2027</h1><table><tr><th>JORNADA 1</th></tr><tr><td>04-10-{year}</td><td>Local</td><td>-</td><td>-</td><td>Visitante</td><td>17:30h</td></tr></table>'


def standings():
    return ''.join('<div class="contenedor__item"><div class="fw-bolderr">' + team + '</div><div class="text-warning-emphasis">0</div>'
                   + ''.join('<div class="borderr-start">' + value + '</div>' for value in ['0'] * 6 + ['<span>+0</span>']) + '</div>'
                   for team in ['Local', 'Visitante'])


def evidence():
    return verify_sources(MANIFEST, lambda url: standings() if 'mostrar_clasi' in url else fixtures())


def test_six_column_source_retains_future_fixture_and_time():
    assert parse_all_matches(fixtures(), include_details=True) == {
        'Jornada 1': [['2026-10-04', 'Local', 'Visitante', None, None, '17:30', None]]}
    assert parse_standings(standings()) == [[1, 'Local', 0, 0, 0, 0, 0, 0, 0, 0], [2, 'Visitante', 0, 0, 0, 0, 0, 0, 0, 0]]


def test_new_heading_with_old_calendar_is_rejected():
    with pytest.raises(ValueError, match='otra temporada'):
        verify_sources(MANIFEST, lambda url: standings() if 'mostrar_clasi' in url else fixtures(2025))


@pytest.mark.parametrize('change', [
    {'season': '2027-2028'}, {'season': '2026-2028'}, {'groups': []},
    {'defaultTeam': {'cat': 'benjamin', 'groupId': 'MISSING', 'name': 'Local'}},
])
def test_unverified_or_incomplete_manifest_cannot_activate(change):
    with pytest.raises(ValueError):
        validate_manifest({**MANIFEST, **change}, '2025-2026')


def test_no_duplicate_round_when_the_database_uses_numeric_labels():
    conn = sqlite3.connect(':memory:')
    conn.executescript(SCHEMA)
    conn.execute("INSERT INTO matches(group_id,jornada,home_team_id,away_team_id) VALUES(1,'3',1,2)")
    assert existing_jornada(conn, 1, 'Jornada 3') == '3'
    assert existing_jornada(conn, 2, 'Jornada 3') == 'Jornada 3'
    assert existing_jornada(conn, 1, 'Semifinal') == 'Semifinal'
    conn.close()


def test_seed_rolls_back_if_a_category_is_missing():
    conn = sqlite3.connect(':memory:')
    conn.executescript(SCHEMA)
    conn.execute("INSERT INTO seasons(name,start_year,end_year,is_current) VALUES('2025-2026',2025,2026,1)")
    conn.commit()
    with pytest.raises(ValueError, match='categoría'):
        seed_season(conn, MANIFEST, evidence())
    assert conn.execute('SELECT name,is_current FROM seasons').fetchall() == [('2025-2026', 1)]
    assert conn.execute('SELECT count(*) FROM groups').fetchone()[0] == 0
    conn.close()


def test_activation_generates_new_season_and_retains_every_old_sporting_row(tmp_path):
    # Exercise the complete staged generator using a SQLite snapshot, not the live DB.
    (tmp_path / 'src').mkdir()
    for file in [*ROOT.glob('data-*.js'), ROOT / 'index.html', ROOT / 'sw.js', ROOT / 'src/config.js']:
        shutil.copy2(file, tmp_path / file.relative_to(ROOT))
    source, target = get_connection(ROOT / 'futbolbase.db'), sqlite3.connect(tmp_path / 'futbolbase.db')
    source.backup(target)
    source.close()
    before = {table: target.execute(f'SELECT * FROM {table} ORDER BY id').fetchall() for table in ['groups', 'standings', 'matches', 'goals', 'scorers']}
    target.close()
    backup = apply_manifest(MANIFEST, evidence(), tmp_path)
    assert (backup / 'futbolbase.db').exists()
    assert load_config(tmp_path / 'src/config.js')['season'] == '2026-2027'
    conn = sqlite3.connect(tmp_path / 'futbolbase.db')
    for table, rows in before.items():
        last = max((r[0] for r in rows), default=0)
        assert conn.execute(f'SELECT * FROM {table} WHERE id<=? ORDER BY id', (last,)).fetchall() == rows
    assert conn.execute('SELECT name FROM seasons WHERE is_current=1').fetchall() == [('2026-2027',)]
    assert conn.execute('PRAGMA foreign_key_check').fetchall() == []
    conn.close()
    archive = (tmp_path / 'data-season-2025-2026.js').read_text()
    assert 'Las Mesas Hu.' in archive and 'PG2' in archive
    assert 'NEW1' in (tmp_path / 'data-prebenjamin.js').read_text()
    assert json.loads((tmp_path / 'data-health.json').read_text())['season'] == '2026-2027'
