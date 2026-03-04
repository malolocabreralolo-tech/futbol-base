#!/usr/bin/env python3
"""
check_missing_shields.py - Lista equipos sin escudo en data-shields.js.
Util para identificar equipos historicos que necesitan escudo manual.
"""
import json, os, re, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHIELDS_PATH = os.path.join(ROOT, 'data-shields.js')
SEASONS_PATH = os.path.join(ROOT, 'data-seasons.js')

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
    m = re.search(r'const ' + varname + r'\s*=\s*(\[.*?\]|\{.*?\})\s*;?\s*$', content, re.DOTALL)
    return json.loads(m.group(1))

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

def main():
    shields = load_json_var(SHIELDS_PATH, 'SHIELDS')
    shields_norm = {}
    for k in shields:
        n = normalize(k)
        if n and n not in shields_norm:
            shields_norm[n] = shields[k]

    seasons = load_json_var(SEASONS_PATH, 'SEASONS')
    print(f"Shields loaded: {len(shields)}\n")

    for season in seasons:
        sname = season.get('name', '?')
        for cat in ['benjamin', 'prebenjamin']:
            groups = season.get(cat, [])
            if not groups:
                continue
            missing = set()
            for g in groups:
                for row in g.get('standings', []):
                    team = row[1]
                    if not has_shield(team, shields, shields_norm):
                        missing.add(team)
            if missing:
                print(f"[{sname}] {cat.upper()} - {len(missing)} sin escudo:")
                for t in sorted(missing):
                    print(f"  - {t!r}")
                print()

if __name__ == '__main__':
    main()
