#!/usr/bin/env python3
"""
fetch_futbolaspalmas.py — Scrapes futbolaspalmas.com for standings, matches,
shields and goals, writes everything to SQLite, then generates JS data files.

Sin dependencias externas. Uso: python3 scripts/fetch_futbolaspalmas.py
"""

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DELAY = 0.35

FILES = [
    (os.path.join(PROJECT_ROOT, "data-benjamin.js"),    "BENJAMIN",    "BENJ_STATS"),
    (os.path.join(PROJECT_ROOT, "data-prebenjamin.js"), "PREBENJAMIN", "PREBENJ_STATS"),
]

GOALS_URL = "https://futbolaspalmas.com/mostrar-mas-datos-estadisticas.php"

# ── DB imports ────────────────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import (get_connection, init_db, get_or_create_season, get_or_create_category,
                get_or_create_team, get_or_create_group, DB_PATH)


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
                hs = None
                as_ = None

            jornadas[current_name].append([full_date, home, away, hs, as_])

    # Remove jornadas with no matches at all
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


# ─── PARSE SHIELDS (escudos) ─────────────────────────────────────────────────────

def parse_shields(html):
    """Extract {team_name: shield_filename} from <img src="...escudos/FILE" title="Calendario TEAM">"""
    pattern = re.compile(
        r'<img\s+src="[^"]*escudos/([^"]+\.(?:png|jpg|gif|svg))"[^>]*title="\s*Calendario\s+([^"]*)"',
        re.IGNORECASE,
    )
    shields = {}
    for filename, team in pattern.findall(html):
        team = team.strip()
        if team and filename:
            # Strip size prefixes like "100x100" or "200x200" from filenames
            # so they match the local escudos/ files (e.g. "100x100arucas.png" → "arucas.png")
            clean = re.sub(r'^\d+x\d+', '', filename)
            shields[team] = clean
    return shields


# ─── GOAL SCRAPING (mostrar-mas-datos-estadisticas.php) ─────────────────────────

def extract_team_codes(group_html):
    """
    Returns {team_name: code} from the main group page HTML.
    Looks for: <td class='local2015 fw-bold'>TeamName<a href='...-CODE.html'>
    """
    pattern = re.compile(
        r'<td[^>]*fw-bold[^>]*>\s*([A-Za-z\u00e0-\u00ff \'.,]+?)\s*'
        r'<a\s+href="[^"]*?-([A-Z0-9]+)\.html"',
        re.IGNORECASE,
    )
    result = {}
    for name, code in pattern.findall(group_html):
        name = name.strip()
        if name and code not in result.values():
            result[name] = code
    return result


def extract_categoria(clasi_html):
    """
    Returns (categoria, clasificacion) from mostrar_clasi.php HTML.
    Looks for: onClick="calendarioClasificacion('calendario_benjamin_a_g1',..."
    clasificacion is derived by replacing 'calendario_' with 'clasi_'.
    """
    m = re.search(r"calendarioClasificacion\('([^']+)'", clasi_html)
    if not m:
        return None, None
    cat = m.group(1)
    clasi = cat.replace("calendario_", "clasi_")
    return cat, clasi


def fetch_match_goals(local_code, vis_code, categoria, clasificacion):
    """POST to mostrar-mas-datos-estadisticas.php. Returns HTML string."""
    data = urllib.parse.urlencode({
        "local": local_code,
        "visitante": vis_code,
        "categoria": categoria,
        "clasificacion": clasificacion,
        "divcarga": "1",
    }).encode()
    req = urllib.request.Request(
        GOALS_URL,
        data=data,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "text/html,*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        raw = r.read()
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("iso-8859-1", errors="replace")


def parse_goals(html, hs, as_):
    """
    Parse goal events from mostrar-mas-datos-estadisticas.php response.
    Two <div class="grupo-negro12"> blocks: first = home goals, second = away goals.
    Within each div, goals are separated by <br /> with format: "12´ -  Name<br />"
    Returns [[min, name, running_score, side, 'r'], ...] sorted by minute.
    """
    # Extract content of each grupo-negro12 div
    sections = re.findall(
        r'<div[^>]+grupo-negro12[^>]*>(.*?)</div>',
        html,
        re.DOTALL | re.IGNORECASE,
    )
    if not sections:
        return []

    goal_line_re = re.compile(r'(\d+)[´\'\u00b4`]\s*-\s*\t*\s*([^\n<\r]+)')

    def extract_goals_from_section(section):
        goals = []
        for m in goal_line_re.finditer(section):
            minute = int(m.group(1))
            name = m.group(2).strip()
            if name:
                goals.append((minute, name))
        return goals

    home_raw = extract_goals_from_section(sections[0]) if len(sections) > 0 else []
    away_raw = extract_goals_from_section(sections[1]) if len(sections) > 1 else []

    # Build chronological event list
    events = [(mn, nm, "h") for mn, nm in home_raw] + [(mn, nm, "a") for mn, nm in away_raw]
    events.sort(key=lambda x: x[0])

    # Compute running score
    h_score, a_score = 0, 0
    result = []
    for mn, nm, side in events:
        if side == "h":
            h_score += 1
        else:
            a_score += 1
        result.append([mn, nm, f"{h_score}-{a_score}", side, "r"])

    return result


# ─── PROCESS FILE (writes to SQLite) ──────────────────────────────────────────

def process_file(conn, js_path, var_name, stats_var, season_id, category_id):
    """
    Read group config from existing JS file, scrape each group,
    and write results to SQLite.
    """
    with open(js_path, encoding="utf-8") as f:
        content = f.read()

    m = re.match(r"const " + var_name + r"=(\[.*?\]);", content, re.DOTALL)
    if not m:
        print(f"  ERROR: {var_name} no encontrado en {os.path.basename(js_path)}")
        return

    groups = json.loads(m.group(1))

    updated_matches = 0
    updated_standings = 0

    for group in groups:
        url = group.get("url", "")
        if not url:
            continue

        group_code = group["id"]
        group_id = get_or_create_group(
            conn, season_id, category_id, group_code,
            name=group.get("name"),
            full_name=group.get("fullName"),
            phase=group.get("phase"),
            island=group.get("island"),
            url=url,
        )

        print(f"  [{group_code}] {url}")

        try:
            html = fetch(url)
        except Exception as e:
            print(f"    ! error: {e}")
            continue
        time.sleep(DELAY)

        # ── Partidos + campos (jornada actual) ────────────────────────────
        jornada_name, matches = parse_matches(html)
        if jornada_name and matches:
            # Update current_jornada in groups table
            conn.execute(
                "UPDATE groups SET current_jornada=? WHERE id=?",
                (jornada_name, group_id),
            )
            # Insert current jornada matches
            for match in matches:
                date_str, t, home, away, hs, as_, venue = match
                home_id = get_or_create_team(conn, home)
                away_id = get_or_create_team(conn, away)
                conn.execute(
                    """INSERT OR IGNORE INTO matches
                       (group_id, jornada, date, time, home_team_id, away_team_id,
                        home_score, away_score, venue)
                       VALUES (?,?,?,?,?,?,?,?,?)""",
                    (group_id, jornada_name, date_str, t, home_id, away_id, hs, as_, venue),
                )
                # If already exists but score was NULL and now we have it, update
                if hs is not None:
                    conn.execute(
                        """UPDATE matches SET home_score=?, away_score=?, venue=?
                           WHERE group_id=? AND jornada=? AND home_team_id=? AND away_team_id=?
                           AND home_score IS NULL""",
                        (hs, as_, venue, group_id, jornada_name, home_id, away_id),
                    )
            updated_matches += len(matches)
            print(f"    {jornada_name}: {len(matches)} partidos")
        else:
            print(f"    ! sin partidos")

        # ── Historia (todas las jornadas completadas) ─────────────────────
        all_hist = parse_all_matches(html)
        if all_hist:
            hist_count = 0
            for jor_name, jor_matches in all_hist.items():
                for entry in jor_matches:
                    full_date, home, away, hs, as_ = entry
                    home_id = get_or_create_team(conn, home)
                    away_id = get_or_create_team(conn, away)
                    conn.execute(
                        """INSERT OR IGNORE INTO matches
                           (group_id, jornada, date, time, home_team_id, away_team_id,
                            home_score, away_score, venue)
                           VALUES (?,?,?,NULL,?,?,?,?,NULL)""",
                        (group_id, jor_name, full_date, home_id, away_id, hs, as_),
                    )
                    # Update score if it was NULL before
                    if hs is not None:
                        conn.execute(
                            """UPDATE matches SET home_score=?, away_score=?, date=?
                               WHERE group_id=? AND jornada=? AND home_team_id=? AND away_team_id=?
                               AND home_score IS NULL""",
                            (hs, as_, full_date, group_id, jor_name, home_id, away_id),
                        )
                    hist_count += 1
            print(f"    Historia: {len(all_hist)} jornadas, {hist_count} partidos")

        # ── Clasificacion ──────────────────────────────────────────────────
        clasi_url = url.rstrip("/") + "/mostrar_clasi.php"
        clasi_html = None
        try:
            clasi_html = fetch(clasi_url)
            time.sleep(DELAY)
            standings = parse_standings(clasi_html)
            if standings:
                # DELETE old standings for this group, INSERT new ones
                conn.execute("DELETE FROM standings WHERE group_id=?", (group_id,))
                for row in standings:
                    pos, team_name, pts, j, g, e, perd, gf, gc, df = row
                    team_id = get_or_create_team(conn, team_name)
                    conn.execute(
                        """INSERT INTO standings
                           (group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                        (group_id, team_id, pos, pts, j, g, e, perd, gf, gc, df),
                    )
                updated_standings += 1
                print(f"    Clasificacion: {len(standings)} equipos")
            else:
                print(f"    ! clasificacion no parseada")
        except Exception as e:
            print(f"    ! clasificacion error: {e}")

        # ── Escudos ──────────────────────────────────────────────────────
        if clasi_html:
            shields = parse_shields(clasi_html)
            if shields:
                for team_name, shield_file in shields.items():
                    get_or_create_team(conn, team_name, shield_filename=shield_file)
                print(f"    Escudos: {len(shields)} encontrados")

        # ── Goles por partido (incremental) ───────────────────────────────
        if clasi_html and all_hist:
            team_codes = extract_team_codes(html)  # main page has team code links
            cat, clasi = extract_categoria(clasi_html)  # standings page has categoria
            if team_codes and cat:
                fetched = 0
                skipped = 0
                for jor_name, jor_matches in all_hist.items():
                    for entry in jor_matches:
                        if entry[3] is None:
                            continue  # partido sin resultado
                        full_date, home_t, away_t, hs, as_ = entry
                        home_id = get_or_create_team(conn, home_t)
                        away_id = get_or_create_team(conn, away_t)

                        # Check if match exists and already has goals
                        match_row = conn.execute(
                            """SELECT m.id FROM matches m
                               WHERE m.group_id=? AND m.jornada=?
                               AND m.home_team_id=? AND m.away_team_id=?""",
                            (group_id, jor_name, home_id, away_id),
                        ).fetchone()
                        if not match_row:
                            skipped += 1
                            continue
                        match_id = match_row[0]

                        # Skip if goals already exist for this match
                        goal_count = conn.execute(
                            "SELECT COUNT(*) FROM goals WHERE match_id=?", (match_id,)
                        ).fetchone()[0]
                        if goal_count > 0:
                            skipped += 1
                            continue

                        lcode = team_codes.get(home_t)
                        vcode = team_codes.get(away_t)
                        if not lcode or not vcode:
                            continue
                        try:
                            goals_html = fetch_match_goals(lcode, vcode, cat, clasi)
                            goals = parse_goals(goals_html, hs, as_)
                            if goals:
                                for g in goals:
                                    minute, player, running, side, gtype = g
                                    conn.execute(
                                        """INSERT INTO goals
                                           (match_id, minute, player_name, running_score, side, type)
                                           VALUES (?,?,?,?,?,?)""",
                                        (match_id, minute, player, running, side, gtype),
                                    )
                                fetched += 1
                            time.sleep(DELAY)
                        except Exception as e:
                            print(f"    ! goles {home_t} vs {away_t}: {e}")
                if fetched or skipped:
                    print(f"    Goles: {fetched} nuevos, {skipped} ya existentes")

        # Commit after each group
        conn.commit()

    print(f"  -> {updated_matches} partidos, {updated_standings} clasificaciones actualizadas.\n")


# ─── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    conn = get_connection()
    init_db(conn)
    season_id = get_or_create_season(conn, "2025-2026", 2025, 2026, is_current=True)

    for js_path, var_name, stats_var in FILES:
        category_name = var_name  # "BENJAMIN" or "PREBENJAMIN"
        category_id = get_or_create_category(conn, category_name)

        print(f"\n{'='*50}")
        print(f"{os.path.basename(js_path)}")
        print(f"{'='*50}")
        process_file(conn, js_path, var_name, stats_var, season_id, category_id)

    conn.commit()
    conn.close()

    # Generate JS files from DB
    print(f"\n{'='*50}")
    print("Generating JS files from SQLite")
    print(f"{'='*50}")
    from generate_js import main as generate_main
    generate_main()

    print("\nTerminado.")


if __name__ == "__main__":
    main()
