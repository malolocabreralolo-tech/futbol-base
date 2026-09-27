"""A new heading cannot activate old fixtures; activation preserves sporting rows."""
import copy
import json
from pathlib import Path
import re
import shutil
import sqlite3
import sys
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from activate_season import validate_manifest, verify_sources, seed_season, apply_manifest
import activate_season
import codigo
from db import SCHEMA, get_connection
from migrate_actas_schema import migrate
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


def next_season(season):
    """Return the season immediately after `season` ("2025-2026" -> "2026-2027")."""
    start, end = map(int, season.split('-'))
    return f'{start + 1}-{end + 1}'


def manifest_for(season):
    """A manifest like MANIFEST but activating `season` instead of a fixed
    "2026-2027". Needed by the tests that copy the live tree: the day the
    portal is really on 2026-2027, MANIFEST's fixed season would try to
    re-activate the season already current and validate_manifest would
    reject it (only the immediately next season can be activated)."""
    return {"season": season, "defaultTeam": {"cat": "prebenjamin", "groupId": "NEW1", "name": "Local"},
            "groups": [{"id": "NEW1", "cat": "prebenjamin", "name": "Grupo 1", "phase": "Liga",
                        "island": "grancanaria", "url": "https://futbolaspalmas.com/1prebenjamin1/"}]}


def fixtures_for(season):
    """Like fixtures(), but the heading and the match date belong to `season`
    (its start year) instead of the hardcoded 2026-2027, so verify_sources'
    date-range check (July of the first year to June of the second) accepts
    it whatever season is actually being activated."""
    start = season.split('-')[0]
    return (f'<h1>{season}</h1><table><tr><th>JORNADA 1</th></tr><tr><td>04-10-{start}</td>'
            '<td>Local</td><td>-</td><td>-</td><td>Visitante</td><td>17:30h</td></tr></table>')


def evidence_for(manifest):
    return verify_sources(manifest, lambda url: standings() if 'mostrar_clasi' in url else fixtures_for(manifest['season']))


def first_group_and_team(path):
    """Read (group id, a team name) from a copied data-benjamin.js/data-prebenjamin.js,
    before apply_manifest overwrites it with the newly activated season's groups.
    Lets the archival assertions below check against whatever the copied tree's
    portal season actually contains, instead of a 2025-2026 literal. None if that
    category has no group with standings: a partial activation (only one category,
    valid per docs/temporada-nueva.md) can leave the other one empty."""
    array_text = path.read_text().split('=', 1)[1].split(';\n', 1)[0]
    for group in json.loads(array_text):
        if group['standings']:
            return group['id'], group['standings'][0][1]
    return None


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
    # Activate whatever season comes right after the copied tree's own portal
    # season (today 2025-2026 -> 2026-2027; the day the live tree is really on
    # 2026-2027, this activates 2027-2028 instead of re-activating the season
    # already current, which validate_manifest rejects).
    portal_season = load_config(tmp_path / 'src/config.js')['season']
    season = next_season(portal_season)
    manifest = manifest_for(season)
    old_groups = [g for g in (first_group_and_team(tmp_path / 'data-prebenjamin.js'),
                               first_group_and_team(tmp_path / 'data-benjamin.js')) if g]
    assert old_groups, 'la copia no tiene ningún grupo con clasificación que archivar'
    backup = apply_manifest(manifest, evidence_for(manifest), tmp_path)
    assert (backup / 'futbolbase.db').exists()
    assert load_config(tmp_path / 'src/config.js')['season'] == season
    conn = sqlite3.connect(tmp_path / 'futbolbase.db')
    for table, rows in before.items():
        last = max((r[0] for r in rows), default=0)
        assert conn.execute(f'SELECT * FROM {table} WHERE id<=? ORDER BY id', (last,)).fetchall() == rows
    assert conn.execute('SELECT name FROM seasons WHERE is_current=1').fetchall() == [(season,)]
    assert conn.execute('PRAGMA foreign_key_check').fetchall() == []
    conn.close()
    # The archive keeps the copy's own outgoing season: its group ids and team
    # names come from the copied tree itself, not from a 2025-2026 literal that
    # stops being true once the portal moves past that season.
    archive = (tmp_path / f'data-season-{portal_season}.js').read_text()
    for group_id, team in old_groups:
        assert group_id in archive and team in archive
    assert 'NEW1' in (tmp_path / 'data-prebenjamin.js').read_text()
    assert json.loads((tmp_path / 'data-health.json').read_text())['season'] == season


# Un sw.js sintético con la forma del de verdad: CACHE_NAME, CRESTS_CACHE y los dos literales.
WORKER = ("const CACHE_NAME = 'futbolbase-v20280101';\n"
          "const CRESTS_CACHE = 'futbolbase-escudos-00000000';\n"
          "const STATIC_ASSETS = [\n  './',\n];\n\n"
          "// Season data files\n"
          "const SEASON_FILES = [\n  './data-season-2027-2028.js',\n  './data-lineups-2028-2029.js',\n];\n\n"
          "function classifyRequest(pathname) {}\n")


def test_season_files_swap_the_portal_lineups_and_keep_every_archive():
    # Plan B5, decisión 2: al activar 2029-2030, el archivo de 2028-2029 entra delante y la plantilla que
    # se precachea pasa a ser la de 2029-2030, aunque ese fichero todavía no exista; el resto, igual.
    out = activate_season.season_files_for(WORKER, "2028-2029", "2029-2030")
    assert out == WORKER.replace("  './data-season-2027-2028.js',\n  './data-lineups-2028-2029.js',\n",
                                 "  './data-season-2028-2029.js',\n  './data-season-2027-2028.js',\n  './data-lineups-2029-2030.js',\n")
    assert activate_season.season_files_for(out, "2028-2029", "2029-2030") == out, "otra vez con la misma temporada: igual"
    # El sw.js del repositorio, con la temporada de su propia plantilla (nunca la de config.js): activar
    # la siguiente solo toca SEASON_FILES.
    real = (ROOT / "sw.js").read_text(encoding="utf-8")
    portal = re.search(r"'\./data-lineups-(\d{4}-\d{4})\.js'", real).group(1)
    after = activate_season.season_files_for(real, portal, next_season(portal))
    assert f"'./data-season-{portal}.js'" in after and f"'./data-lineups-{next_season(portal)}.js'" in after
    assert f"'./data-lineups-{portal}.js'" not in after
    literal = re.compile(r"const SEASON_FILES = \[[^\]]*\];")
    assert literal.sub("", after) == literal.sub("", real)


def test_activation_on_a_synthetic_tree_precaches_the_lineups_of_the_new_season(tmp_path):
    # apply_manifest entero sobre un árbol sintético con sus propias temporadas (2028-2029 → 2029-2030, años
    # que acepta el lector de calendarios de fetch_futbolaspalmas.py): ni los data-*.js, ni el config.js ni la
    # base vivos. La temporada que se cierra tiene un acta, y su plantilla; la nueva todavía no tiene ninguna,
    # y SEASON_FILES ya precachea la suya (Plan B5, decisión 2).
    closing, opening = "2028-2029", "2029-2030"
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "config.js").write_text("export const PORTAL = " + json.dumps(
        {"season": closing, "nextSeason": opening, "defaultTeam": {"cat": "prebenjamin", "groupId": "OLD1", "name": "Local"},
         "timeZone": "Atlantic/Canary"}, indent=2) + ";\n", encoding="utf-8")
    (tmp_path / "index.html").write_text('<script defer src="./data-seasons.js?v=20280101"></script>\n'
                                         '<span id="legacyUpdated" hidden>Última actualización: 01/01/2028</span>\n', encoding="utf-8")
    (tmp_path / "sw.js").write_text(WORKER, encoding="utf-8")
    conn = sqlite3.connect(tmp_path / "futbolbase.db")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.executescript(f"""
      INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '{closing}', 2028, 2029, 1);
      INSERT INTO categories(id, name) VALUES (1, 'BENJAMIN'), (2, 'PREBENJAMIN');
      INSERT INTO groups(id, season_id, category_id, code, name, full_name, phase, island, current_jornada)
        VALUES (1, 1, 2, 'OLD1', 'Grupo 1', 'PREBENJAMIN G-1', 'Liga', 'grancanaria', 'Jornada 1');
      INSERT INTO teams(id, name) VALUES (1, 'Local'), (2, 'Visitante');
      INSERT INTO matches(id, group_id, jornada, date, home_team_id, away_team_id, home_score, away_score, cod_acta)
        VALUES (1, 1, 'Jornada 1', '2028-10-05', 1, 2, 1, 0, 90001);
      INSERT INTO players(id, full_name, norm_name) VALUES (1, 'PEREZ, JUAN', 'perez juan');
      INSERT INTO appearances(match_id, team_id, player_id, dorsal, role, goals) VALUES (1, 1, 1, 7, 'starter', 1);
    """)
    conn.commit()
    conn.close()
    manifest = manifest_for(opening)
    apply_manifest(manifest, evidence_for(manifest), tmp_path)
    assert load_config(tmp_path / "src/config.js")["season"] == opening
    worker = (tmp_path / "sw.js").read_text(encoding="utf-8")
    assert ("const SEASON_FILES = [\n  './data-season-2028-2029.js',\n  './data-season-2027-2028.js',\n"
            "  './data-lineups-2029-2030.js',\n];") in worker
    assert worker.splitlines()[1] == "const CRESTS_CACHE = 'futbolbase-escudos-00000000';"
    assert (tmp_path / "data-season-2028-2029.js").exists() and (tmp_path / "data-lineups-2028-2029.js").exists()
    assert not (tmp_path / "data-lineups-2029-2030.js").exists()


def test_apply_recalculates_codigo_for_the_new_config(tmp_path):
    # --apply rewrites src/config.js, part of CODIGO's fingerprint (src/*.js + acta.css; scripts/codigo.py,
    # Plan B3 decisión 156). Unlike the narrower tmp_path above (only enough to exercise the data
    # migration), this one mirrors the whole tree codigo.py needs, so codigo.py --check can confirm the
    # fingerprint was recalculated in place after activation (ronda de arreglos 1, R2-1).
    shutil.copytree(ROOT / 'src', tmp_path / 'src')
    shutil.copy2(ROOT / 'acta.css', tmp_path / 'acta.css')
    for file in [*ROOT.glob('data-*.js'), ROOT / 'index.html', ROOT / 'sw.js']:
        shutil.copy2(file, tmp_path / file.relative_to(ROOT))
    source, target = get_connection(ROOT / 'futbolbase.db'), sqlite3.connect(tmp_path / 'futbolbase.db')
    source.backup(target)
    source.close()
    target.close()
    assert codigo.main(['--check', '--root', str(tmp_path)]) == 0, 'la copia empieza con CODIGO al día'
    # Same reasoning as the test above: activate the season after the copy's own
    # portal season, not a season fixed at 2026-2027.
    season = next_season(load_config(tmp_path / 'src/config.js')['season'])
    manifest = manifest_for(season)
    apply_manifest(manifest, evidence_for(manifest), tmp_path)
    assert load_config(tmp_path / 'src/config.js')['season'] == season
    assert codigo.main(['--check', '--root', str(tmp_path)]) == 0
