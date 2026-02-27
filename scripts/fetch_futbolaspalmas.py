#!/usr/bin/env python3
"""
fetch_futbolaspalmas.py — Reconstruye data-benjamin.js, data-prebenjamin.js y data-history.js
scrapeando futbolaspalmas.com: clasificación, jornadas históricas, partidos y campos.

Sin dependencias externas. Uso: python3 scripts/fetch_futbolaspalmas.py
"""

import datetime
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

HISTORY_PATH = os.path.join(PROJECT_ROOT, "data-history.js")


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


def parse_all_matches(html):
    """
    Returns dict: {"Jornada N": [[date_YYYY-MM-DD, home, away, hs, as], ...]}
    Only completed matches (with scores) where a 4-digit year can be detected.
    Used to build data-history.js with the full jornada history.
    """
    p = MatchParser()
    p.feed(html)

    jornadas = {}
    current_name = None

    for cells in p.rows:
        if len(cells) == 1:
            txt = cells[0].strip()
            m = re.match(r"JORNADA\s+(\d+)", txt, re.IGNORECASE)
            if m:
                current_name = f"Jornada {m.group(1)}"
                if current_name not in jornadas:
                    jornadas[current_name] = []
        elif len(cells) == 7:
            if current_name is None:
                continue

            # Detect 4-digit year in date cell
            date_raw = cells[0].strip()
            year = None
            for num in re.findall(r'\d+', date_raw):
                if len(num) == 4 and 2020 <= int(num) <= 2030:
                    year = num
                    break
            if year is None:
                continue  # can't determine year (e.g. Spanish text dates) → skip

            # Extract day and month (first two short digit sequences)
            short_nums = [n for n in re.findall(r'\d+', date_raw) if len(n) <= 2]
            if len(short_nums) < 2:
                continue
            day, month = short_nums[0].zfill(2), short_nums[1].zfill(2)
            full_date = f"{year}-{month}-{day}"

            home = cells[2].strip()
            away = cells[5].strip()

            try:
                hs = int(cells[3].strip())
                as_ = int(cells[4].strip())
            except ValueError:
                continue  # no score yet → skip

            jornadas[current_name].append([full_date, home, away, hs, as_])

    # Remove jornadas with no completed matches
    return {k: v for k, v in jornadas.items() if v}


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


# ─── HISTORY UPDATE ─────────────────────────────────────────────────────────────

def update_history(all_history_updates):
    """Merge all jornada history updates into data-history.js."""
    if not all_history_updates:
        print("  Sin datos históricos para actualizar.")
        return

    with open(HISTORY_PATH, encoding="utf-8") as f:
        content = f.read()

    m = re.match(r"const HISTORY=(\{.*?\});", content, re.DOTALL)
    if not m:
        print("  ERROR: HISTORY no encontrado en data-history.js")
        return

    history = json.loads(m.group(1))
    tail = content[m.end():]

    for gid, jornadas in all_history_updates.items():
        if gid not in history:
            history[gid] = {}
        for jor_name, matches in jornadas.items():
            history[gid][jor_name] = matches

    # Count total matches
    total_matches = sum(
        len(ms) for grp in history.values() for ms in grp.values()
    )

    # Update HIST_MATCHES constant
    tail = re.sub(r'const HIST_MATCHES=\d+;', f'const HIST_MATCHES={total_matches};', tail)

    new_content = (
        "const HISTORY="
        + json.dumps(history, ensure_ascii=False, separators=(",", ":"))
        + ";"
        + tail
    )
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        f.write(new_content)

    groups_updated = len(all_history_updates)
    jornadas_updated = sum(len(v) for v in all_history_updates.values())
    print(f"  → Historia: {total_matches} partidos totales ({groups_updated} grupos, {jornadas_updated} jornadas actualizadas).")


# ─── PROCESS FILE ───────────────────────────────────────────────────────────────

def process_file(js_path, var_name, stats_var):
    with open(js_path, encoding="utf-8") as f:
        content = f.read()

    m = re.match(r"const " + var_name + r"=(\[.*?\]);", content, re.DOTALL)
    if not m:
        print(f"  ERROR: {var_name} no encontrado en {os.path.basename(js_path)}")
        return {}

    groups = json.loads(m.group(1))
    tail = content[m.end():]

    updated_matches = 0
    updated_standings = 0
    history_updates = {}

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

        # ── Partidos + campos (jornada actual) ────────────────────────────
        jornada_name, matches = parse_matches(html)
        if jornada_name and matches:
            group["jornada"] = jornada_name
            group["matches"] = matches
            updated_matches += len(matches)
            print(f"    {jornada_name}: {len(matches)} partidos")
        else:
            print(f"    ⚠ sin partidos")

        # ── Historia (todas las jornadas completadas) ─────────────────────
        all_hist = parse_all_matches(html)
        if all_hist:
            history_updates[group["id"]] = all_hist
            print(f"    Historia: {len(all_hist)} jornadas con resultados")

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
    return history_updates


# ─── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    all_history_updates = {}

    for js_path, var_name, stats_var in FILES:
        print(f"\n{'='*50}")
        print(f"{os.path.basename(js_path)}")
        print(f"{'='*50}")
        history_updates = process_file(js_path, var_name, stats_var)
        all_history_updates.update(history_updates)

    print(f"\n{'='*50}")
    print("data-history.js")
    print(f"{'='*50}")
    update_history(all_history_updates)
    bump_cache_version()

    print("✓ Terminado.")


def bump_cache_version():
    """Update ?v=YYYYMMDD in index.html script tags so browsers fetch fresh data."""
    index_path = os.path.join(PROJECT_ROOT, "index.html")
    today = datetime.date.today().strftime("%Y%m%d")
    with open(index_path, encoding="utf-8") as f:
        content = f.read()
    new_content = re.sub(r'\?v=\d{8}', f'?v={today}', content)
    if new_content != content:
        with open(index_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"  index.html: versión de caché actualizada a {today}.")


if __name__ == "__main__":
    main()
