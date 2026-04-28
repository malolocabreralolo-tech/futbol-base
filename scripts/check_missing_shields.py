#!/usr/bin/env python3
"""
check_missing_shields.py - Lista equipos sin escudo en data-shields.js.
Util para identificar equipos historicos que necesitan escudo manual.
"""
import json, os, re, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHIELDS_PATH = os.path.join(ROOT, 'data-shields.js')
SEASONS_PATH = os.path.join(ROOT, 'data-seasons.js')
BENJAMIN_PATH = os.path.join(ROOT, 'data-benjamin.js')
PREBENJAMIN_PATH = os.path.join(ROOT, 'data-prebenjamin.js')

STRIP = re.compile(r'\b(CF|UD|CD|AD|SD|AFC|SC|CP|CE|CEF|SSD|ATLETICO|ATL)\b', re.IGNORECASE)

def normalize(name):
    # Strip diacritics/accents
    name = unicodedata.normalize('NFD', name)
    name = ''.join(c for c in name if unicodedata.category(c) != 'Mn')
    # Strip punctuation and common suffixes
    name = re.sub(r"['\",.‘’“”]", '', name)
    name = STRIP.sub('', name)
    return re.sub(r'\s+', ' ', name.lower()).strip()

def load_json_var(path, varname):
    with open(path, encoding='utf-8') as f:
        content = f.read()
    m = re.search(r'const\s+' + re.escape(varname) + r'\s*=\s*', content)
    if not m:
        raise ValueError(f"Variable '{varname}' not found in {path}")
    rest = content[m.end():]
    # Use raw_decode to consume only the first JSON value
    decoder = json.JSONDecoder()
    obj, _ = decoder.raw_decode(rest.lstrip())
    return obj

def has_shield(name, shields, shields_norm):
    # 1. Exact
    if name in shields:
        return True
    # 2. Normalized
    n = normalize(name)
    if n and n in shields_norm:
        return True
    # 3. Substring
    if len(n) >= 4:
        for k in shields:
            kn = normalize(k)
            if len(kn) >= 4 and (n in kn or kn in n):
                return True
    return False

def teams_in_groups(groups):
    out = set()
    for g in groups:
        for row in g.get('standings', []):
            out.add(row[1])
    return out

def main():
    shields = load_json_var(SHIELDS_PATH, 'SHIELDS')
    shields_norm = {}
    for k in shields:
        n = normalize(k)
        if n and n not in shields_norm:
            shields_norm[n] = shields[k]

    seasons = load_json_var(SEASONS_PATH, 'SEASONS')
    print(f"Shields loaded: {len(shields)}\n")

    # Build {season_name: {cat: [groups]}}
    season_groups = {}
    for s in seasons:
        sname = s['name']
        if s.get('current'):
            # Current season uses data-benjamin.js / data-prebenjamin.js
            try:
                ben = load_json_var(BENJAMIN_PATH, 'BENJAMIN')
                pre = load_json_var(PREBENJAMIN_PATH, 'PREBENJAMIN')
                season_groups[sname] = {'benjamin': ben, 'prebenjamin': pre}
            except Exception as e:
                print(f"[{sname}] WARNING: can't load current data: {e}")
                season_groups[sname] = {'benjamin': s.get('benjamin', []), 'prebenjamin': s.get('prebenjamin', [])}
        else:
            # Historical seasons may be embedded in seasons or in data-season-XXXX.js
            ben = s.get('benjamin', [])
            pre = s.get('prebenjamin', [])
            if not ben and not pre:
                slug = sname.replace('-', '_')
                path = os.path.join(ROOT, f'data-season-{sname}.js')
                if os.path.exists(path):
                    try:
                        d = load_json_var(path, f'SEASON_{slug}')
                        ben = d.get('benjamin', [])
                        pre = d.get('prebenjamin', [])
                    except Exception as e:
                        print(f"[{sname}] WARNING: parse error in {path}: {e}")
            season_groups[sname] = {'benjamin': ben, 'prebenjamin': pre}

    grand_missing = set()
    for sname, cats in season_groups.items():
        for cat, groups in cats.items():
            if not groups:
                continue
            missing = set()
            for team in teams_in_groups(groups):
                if not has_shield(team, shields, shields_norm):
                    missing.add(team)
                    grand_missing.add(team)
            if missing:
                print(f"[{sname}] {cat.upper()} - {len(missing)} sin escudo:")
                for t in sorted(missing):
                    print(f"  - {t!r}")
                print()

    print(f"=== TOTAL equipos únicos sin escudo: {len(grand_missing)} ===")

if __name__ == '__main__':
    main()
