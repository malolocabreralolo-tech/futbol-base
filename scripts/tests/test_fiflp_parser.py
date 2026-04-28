#!/usr/bin/env python3
"""
Unit + integration tests for fetch_fiflp.py parser.

Run: python3 -m pytest scripts/tests/test_fiflp_parser.py -v
"""

import os, sys, re, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.fetch_fiflp import parse_standings, parse_matches

# ── Minimal Playwright-like DOM mock ──────────────────────────────────────────
# Mirrors the DOM API that fetch_fiflp.py expects.

class _E:
    def __init__(self, tag, text='', children=None):
        self.tag = tag; self._text = text; self.children = children or []
    def inner_text(self): return self._text
    def query_selector_all(self, s): return [c for c in self.children if c.tag == s]

class _P:
    def __init__(self, html): self._html = html
    def query_selector_all(self, s): return self._html.get(s, [])

def row(*cells):
    """Build a <tr> with the given cell texts."""
    return _E('tr', children=[_E('td', str(c)) for c in cells])

def table(*rows):
    """Build a <table> with the given <tr> children."""
    return _E('table', children=list(rows))

def page(*tables):
    return _P({'table': list(tables)})


# ── parse_standings — unit tests ─────────────────────────────────────────────

class TestStandings:
    def test_17cell(self):
        """17-cell: '' pos team pts/pj pts j_h g_h e_h p_h j_a g_a e_a p_a gf gc form sanc"""
        # Real structure: gf at index 14, gc at 15 (after the extra pts/pj cell)
        tbl = table(
            row('✦','1','ATLETICO HURACAN','2.26','46','16','15','1','0','8','6','0','2','59','23','GGGEEGPG',''),
        )
        r = parse_standings(page(tbl))
        assert len(r) == 1
        assert r[0]['pos'] == 1
        assert r[0]['team'] == 'ATLETICO HURACAN'
        assert r[0]['pts'] == 46
        assert r[0]['j']  == 24  # 16+8
        assert r[0]['g']  == 21  # 15+6
        assert r[0]['gf'] == 59
        assert r[0]['gc'] == 23
        assert r[0]['form'] == 'GGGEEGPG'

    def test_16cell(self):
        """16-cell: '' pos team pts j_h g_h e_h p_h j_a g_a e_a p_a gf gc form sanc"""
        tbl = table(
            row('✦','1','TELDE U.D.','45','10','8','2','0','8','6','0','2','84','28','GGGPEPGG',''),
        )
        r = parse_standings(page(tbl))
        assert len(r) == 1
        assert r[0]['pts'] == 45
        assert r[0]['j']  == 18  # 10+8
        assert r[0]['g']  == 14  # 8+6
        assert r[0]['gf'] == 84
        assert r[0]['gc'] == 28

    def test_11cell(self):
        """11-cell: '' pos team pts/pj pts j g e p form sanc"""
        tbl = table(
            row('✦','1','PALMAS U.D.','3.00','48','16','16','0','0','GGGGGGGGEEP',''),
        )
        r = parse_standings(page(tbl))
        assert len(r) == 1
        assert r[0]['pts'] == 48
        assert r[0]['j']   == 16
        assert r[0]['g']   == 16

    def test_10cell(self):
        """10-cell: '' pos team pts j g e p form sanc"""
        tbl = table(
            row('✦','3','REAL CLUB','33','14','11','0','3','GGGPEPGEEP',''),
        )
        r = parse_standings(page(tbl))
        assert len(r) == 1
        assert r[0]['pts'] == 33
        assert r[0]['j']   == 14

    def test_skips_header_rows(self):
        tbl = table(
            row('✦','POS','EQUIPO','PPJ','PTS','J','G','E','P','J','G','E','P','GF','GC','FORM',''),
            row('✦','1','TEAM A','2.00','30','15','10','0','5','8','6','0','2','50','20','GGGEEPGG',''),
        )
        r = parse_standings(page(tbl))
        assert len(r) == 1 and r[0]['team'] == 'TEAM A'

    def test_normalises_whitespace(self):
        tbl = table(
            row('✦','1','  U.D.  LAS  PALMAS  \u00a0  "A"','2.0','48','16','16','0','0','GGGGGGGGEEP',''),
        )
        r = parse_standings(page(tbl))
        assert '  ' not in r[0]['team'] and '\xa0' not in r[0]['team']

    def test_empty_page(self):
        assert parse_standings(page()) == []

    def test_goals_difference_computed(self):
        tbl = table(
            row('✦','1','TEAM','2.0','40','14','12','2','0','0','0','0','0','80','20','GGGGGGGGGG',''),
        )
        r = parse_standings(page(tbl))
        assert r[0]['gf'] == 80
        assert r[0]['gc'] == 20
        assert r[0]['df'] == 60


# ── parse_matches — unit tests ──────────────────────────────────────────────

class TestMatches:
    def make_match(self, home, away, score_lines, extra=''):
        if isinstance(score_lines, list):
            lines = score_lines
        else:
            lines = score_lines.split('\n')
        sc = '\n'.join(l for l in lines if l.strip())
        r0 = _E('tr', children=[_E('td', home), _E('td', sc), _E('td', away)])
        r1 = _E('tr', children=[_E('td', extra)]) if extra else _E('tr', children=[])
        return _E('table', children=[r0, r1])

    def mp(self, *tables): return _P({'table': list(tables)})

    def test_basic_with_score(self):
        t = self.make_match('ATLETICO HURACAN','ACODETTI C.F.',
                            ['3 - 0','05-04-2026','10:00'],
                            'Estadio Ciudad\nÁrbitro: Juan Pérez')
        r = parse_matches(self.mp(t))
        assert len(r) == 1
        assert r[0]['home'] == 'ATLETICO HURACAN'
        assert r[0]['away'] == 'ACODETTI C.F.'
        assert r[0]['hs'] == 3 and r[0]['as'] == 0
        assert r[0]['time'] == '10:00'
        assert r[0]['date'] == '05-04-2026'
        assert 'Juan Pérez' in r[0]['referee']
        assert 'Ciudad' in r[0]['venue']

    def test_without_score(self):
        t = self.make_match('TEAM A','TEAM B', ['- -','15-05-2026'])
        r = parse_matches(self.mp(t))
        assert r[0]['hs'] is None and r[0]['as'] is None
        assert r[0]['date'] == '15-05-2026'

    def test_deduplication(self):
        t1 = self.make_match('A','B', ['2-1','01-01-2026'])
        t2 = self.make_match('A','B', ['2-1','01-01-2026'])
        r = parse_matches(self.mp(t1, t2))
        assert len(r) == 1

    def test_normalises_whitespace(self):
        t = self.make_match('  U.D.  LAS\tPALMAS  \u00a0','C.F. TEAM', ['1\u00a0-\u00a01','01-01-2026'])
        r = parse_matches(self.mp(t))
        assert '  ' not in r[0]['home'] and '\xa0' not in r[0]['home']

    def test_referee_extracted(self):
        t = self.make_match('A','B',['2-0','01-01-2026'], 'Campo Synthetic\nÁrbitro: María García')
        r = parse_matches(self.mp(t))
        assert r[0]['referee'] == 'María García'

    def test_venue_extracted(self):
        t = self.make_match('A','B',['2-0','01-01-2026'],'Campo Hierba Artificial\nÁrbitro: Pepe')
        r = parse_matches(self.mp(t))
        assert 'Hierba' in r[0]['venue'] or 'Artificial' in r[0]['venue']

    def test_empty_page(self):
        assert parse_matches(self.mp()) == []

    def test_skips_empty_home_or_away(self):
        t = self.make_match('','TEAM B',['3-0','01-01-2026'])
        assert parse_matches(self.mp(t)) == []


# ── Integration: real scraped data ───────────────────────────────────────────

class TestIntegration:
    def _path(self, name):
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # scripts/tests/ → scripts/
        return os.path.join(base, name)  # → scripts/fiflp_raw.json

    def test_raw_json_valid(self):
        p = self._path('fiflp_raw.json')
        if not os.path.exists(p):
            import pytest; pytest.skip('fiflp_raw.json not found')
        with open(p) as f: data = json.load(f)
        assert isinstance(data, list) and len(data) > 0

    def test_standings_required_fields(self):
        p = self._path('fiflp_raw.json')
        if not os.path.exists(p): import pytest; pytest.skip()
        with open(p) as f:
            for g in json.load(f):
                for s in g['standings']:
                    assert s['pos'] > 0
                    assert s['pts'] >= 0
                    assert s['team'].strip()

    def test_matches_required_fields(self):
        p = self._path('fiflp_raw.json')
        if not os.path.exists(p): import pytest; pytest.skip()
        with open(p) as f:
            for g in json.load(f):
                for j in g['jornadas']:
                    for m in j['matches']:
                        assert m['home'].strip() and m['away'].strip()

    def test_no_negative_scores(self):
        p = self._path('fiflp_raw.json')
        if not os.path.exists(p): import pytest; pytest.skip()
        with open(p) as f:
            for g in json.load(f):
                for j in g['jornadas']:
                    for m in j['matches']:
                        if m['hs'] is not None: assert m['hs'] >= 0
                        if m['as'] is not None: assert m['as'] >= 0

    def test_no_duplicate_matches_in_jornada(self):
        p = self._path('fiflp_raw.json')
        if not os.path.exists(p): import pytest; pytest.skip()
        with open(p) as f:
            for g in json.load(f):
                for j in g['jornadas']:
                    seen = set()
                    for m in j['matches']:
                        key = m['home'] + '|' + m['away']
                        assert key not in seen, f'Duplicate: {key}'
                        seen.add(key)
