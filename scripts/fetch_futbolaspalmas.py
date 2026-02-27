#!/usr/bin/env python3
"""
fetch_futbolaspalmas.py — Reconstruye data-benjamin.js y data-prebenjamin.js
scrapeando futbolaspalmas.com: clasificación, jornada actual, partidos y campos.

Sin dependencias externas. Uso: python3 scripts/fetch_futbolaspalmas.py
"""

import json
import os
import re
import time
import urllib.request
from html.parser import HTMLParser

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DELAY = 0.35

FILES = [
    (os.path.join(PROJECT_ROOT, "data-benjamin.js"),    "BENJAMIN",    "BENJ_STATS"),
    (os.path.join(PROJECT_ROOT, "data-prebenjamin.js"), "PREBENJAMIN", "PREBENJ_STATS"),
]


# ─── FETCH ─────────────────────────────────────────────────────────────────────

def fetch(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,*/*",
        "Accept-Language": "es-ES,es;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=20) as r:
        raw = r.read()
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("iso-8859-1", errors="replace")


# ─── PARSE PARTIDOS (#miTabla) ──────────────────────────────────────────────────

class MatchParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self._cells = []
        self._buf = ""
        self._in_cell = False
        self.rows = []        # all rows (1-cell and 7-cell)

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._cells = []
        elif tag in ("td", "th"):
            self._in_cell = True
            self._buf = ""

    def handle_endtag(self, tag):
        if tag in ("td", "th"):
            self._cells.append(self._buf.strip())
            self._in_cell = False
            self._buf = ""
        elif tag == "tr":
            if self._cells:
                self.rows.append(self._cells[:])

    def handle_data(self, data):
        if self._in_cell:
            self._buf += data


def parse_matches(html):
    """
    Returns (jornada_name, matches_list) for the CURRENT (last) jornada.
    matches: [date_dd_mm, time, home, away, hs|None, as_|None, venue|None]
    """
    p = MatchParser()
    p.feed(html)

    # Group rows by jornada
    jornadas = []          # list of (name, [match_rows])
    current_matches = []
    current_name = None

    for cells in p.rows:
        if len(cells) == 1:
            txt = cells[0].strip()
            m = re.match(r"JORNADA\s+(\d+)", txt, re.IGNORECASE)
            if m:
                # Start of a new jornada
                if current_name is not None:
                    jornadas.append((current_name, current_matches))
                current_name = f"Jornada {m.group(1)}"
                current_matches = []
        elif len(cells) == 7:
            if current_name is not None:
                current_matches.append(cells)

    if current_name is not None:
        jornadas.append((current_name, current_matches))

    if not jornadas:
        return None, []

    # Current jornada = last one
    jornada_name, raw_matches = jornadas[-1]

    matches = []
    for cells in raw_matches:
        # Normalize date: "28-11-2025" → "28/11"
        date_raw = re.sub(r"[^\d\-/]", "", cells[0]).strip()
        parts = re.split(r"[-/]", date_raw)
        date = f"{parts[0]}/{parts[1]}" if len(parts) >= 2 else date_raw

        # Normalize time: "17:00h" → "17:00"
        t = cells[1].replace("h", "").strip()

        home = cells[2].strip()
        away = cells[5].strip()
        venue = cells[6].strip() or None

        hs_raw = cells[3].strip()
        as_raw = cells[4].strip()
        try:
            hs = int(hs_raw)
            as_ = int(as_raw)
        except ValueError:
            hs = None
            as_ = None

        matches.append([date, t, home, away, hs, as_, venue])

    return jornada_name, matches


# ─── PARSE CLASIFICACIÓN (mostrar_clasi.php) ────────────────────────────────────

def parse_standings(html):
    """
    Parsea la clasificación de mostrar_clasi.php usando regex.
    Returns list of [pos, team, pts, J, G, E, P, GF, GC, DF] or [] on failure.
    """
    # Team names: divs with class fw-bolder
    names = re.findall(r'fw-bolder[^>]*>([^<]+)', html)
    names = [n.strip() for n in names if n.strip()]

    # Points: divs with fw-bold bg-* (varying color by position)
    pts_list = [int(x) for x in re.findall(r'fw-bold[^"]*bg-[^"]*"[^>]*>\s*(\d+)\s*<', html)]

    # 7 stats per team (J,G,E,P,GF,GC,DF): divs with border-start class
    all_stats = [int(x) for x in re.findall(r'border-start[^"]*"[^>]*>\s*(-?\d+)\s*<', html)]

    n_teams = len(pts_list)
    if not names or not n_teams or len(all_stats) < n_teams * 7:
        return []

    # pts_list is the most precise count; team names are the first n_teams fw-bolder elements
    names = names[:n_teams]

    result = []
    for i, name in enumerate(names):
        if i >= n_teams:
            break
        stats = all_stats[i * 7: i * 7 + 7]
        if len(stats) < 7:
            break
        j, g, e, perd, gf, gc, df = stats
        result.append([i + 1, name, pts_list[i], j, g, e, perd, gf, gc, df])

    return result


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def process_file(js_path, var_name, stats_var):
    with open(js_path, encoding="utf-8") as f:
        content = f.read()

    m = re.match(r"const " + var_name + r"=(\[.*?\]);", content, re.DOTALL)
    if not m:
        print(f"  ERROR: {var_name} no encontrado en {os.path.basename(js_path)}")
        return

    groups = json.loads(m.group(1))
    tail = content[m.end():]

    updated_matches = 0
    updated_standings = 0

    for group in groups:
        url = group.get("url", "")
        if not url:
            continue

        print(f"  [{group['id']}] {url}")

        try:
            html = fetch(url)
        except Exception as e:
            print(f"    ⚠ error: {e}")
            continue
        time.sleep(DELAY)

        # ── Partidos + campos ──────────────────────────────────────────────
        jornada_name, matches = parse_matches(html)
        if jornada_name and matches:
            group["jornada"] = jornada_name
            group["matches"] = matches
            updated_matches += len(matches)
            print(f"    {jornada_name}: {len(matches)} partidos")
        else:
            print(f"    ⚠ sin partidos")

        # ── Clasificación ──────────────────────────────────────────────────
        clasi_url = url.rstrip("/") + "/mostrar_clasi.php"
        try:
            clasi_html = fetch(clasi_url)
            time.sleep(DELAY)
            standings = parse_standings(clasi_html)
            if standings:
                group["standings"] = standings
                updated_standings += 1
                print(f"    Clasificación: {len(standings)} equipos")
            else:
                print(f"    ⚠ clasificación no parseada")
        except Exception as e:
            print(f"    ⚠ clasificación error: {e}")

    # Recalculate stats
    all_teams = sum(len(g.get("standings", [])) for g in groups)
    all_matches = sum(
        sum(1 for m in g.get("matches", []) if m[4] is not None)
        for g in groups
    )

    # Write back
    new_content = (
        f"const {var_name}="
        + json.dumps(groups, ensure_ascii=False, separators=(",", ":"))
        + ";"
        + tail
    )
    with open(js_path, "w", encoding="utf-8") as f:
        f.write(new_content)

    print(f"  → {updated_matches} partidos, {updated_standings} clasificaciones actualizadas.\n")


def main():
    for js_path, var_name, stats_var in FILES:
        print(f"\n{'='*50}")
        print(f"{os.path.basename(js_path)}")
        print(f"{'='*50}")
        process_file(js_path, var_name, stats_var)
    print("✓ Terminado.")


if __name__ == "__main__":
    main()
