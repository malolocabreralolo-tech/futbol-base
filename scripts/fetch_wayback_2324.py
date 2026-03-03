#!/usr/bin/env python3
"""
fetch_wayback_2324.py — Scrapes futbolaspalmas.com 2023-2024 season data
from Wayback Machine archives.

Uses CDX API to discover all benjamin/prebenjamin group URLs archived
in Apr-Jun 2024, then fetches each via web.archive.org and parses
standings + match history.

Output: scripts/wayback_2324_raw.json
"""

import json
import os
import re
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(SCRIPT_DIR, "wayback_2324_raw.json")
KNOWN_URLS_PATH = os.path.join(SCRIPT_DIR, "wayback_2324_urls.json")

CDX_URL  = "https://web.archive.org/cdx/search/cdx"
WAYBACK  = "https://web.archive.org/web"
SITE     = "futbolaspalmas.com"
FROM_DATE = "20240401"
TO_DATE   = "20240630"

DELAY = 1.5  # seconds between Wayback requests


# ─── CDX ──────────────────────────────────────────────────────────────────────

def cdx_query(url_pattern, limit=200):
    params = {
        "url": url_pattern,
        "output": "json",
        "filter": "statuscode:200",
        "from": FROM_DATE,
        "to": TO_DATE,
        "fl": "timestamp,original",
        "collapse": "urlkey",
        "limit": str(limit),
    }
    full_url = CDX_URL + "?" + urllib.parse.urlencode(params)
    print(f"  CDX: {full_url}")
    req = urllib.request.Request(full_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode("utf-8"))
    if data and data[0] == ["timestamp", "original"]:
        data = data[1:]
    return data


def discover_groups():
    """
    Returns list of {timestamp, url, path, category, slug}.
    Combines known benjamin groups from wayback_2324_urls.json
    plus targeted CDX queries for prebenjamin and any other missing groups.
    """
    groups = {}

    # Load known URLs from previous discovery
    if os.path.exists(KNOWN_URLS_PATH):
        with open(KNOWN_URLS_PATH, encoding="utf-8") as f:
            known = json.load(f)
        for g in known.get("benjamin_prebenjamin", []):
            slug = g["path"]
            groups[slug] = g
        print(f"Loaded {len(groups)} benjamin groups from {KNOWN_URLS_PATH}")

    # Additional targeted CDX queries for categories not covered by the 1000-limit query
    extra_patterns = [
        f"{SITE}/1prebenjamin*",
        f"{SITE}/2benjamin*",       # possible segunda fase naming
        f"{SITE}/1benjamin-*",      # possible hyphenated naming
        f"{SITE}/1benjaminlanzarote*",
        f"{SITE}/1benjaminfuerteventura*",
        f"{SITE}/1prebenjaminlanzarote*",
        f"{SITE}/1prebenjaminfuerteventura*",
    ]

    for pattern in extra_patterns:
        time.sleep(0.5)
        try:
            results = cdx_query(pattern, limit=100)
            for ts, url in results:
                path = url.replace("https://futbolaspalmas.com/", "").replace("http://futbolaspalmas.com/", "")
                path = path.strip("/")
                if path and "/" not in path and not path.startswith("?"):
                    if path not in groups:
                        groups[path] = {"timestamp": ts, "url": url, "path": path}
                        print(f"  Found extra: {path}")
        except Exception as e:
            print(f"  CDX error for {pattern}: {e}")

    # Classify each group
    result = []
    for slug, g in sorted(groups.items()):
        cat = categorize(slug)
        if cat:
            result.append({**g, "category": cat, "slug": slug})

    print(f"\nTotal groups to scrape: {len(result)}")
    return result


def categorize(slug):
    """Return 'benjamin' or 'prebenjamin' or None."""
    s = slug.lower()
    if "prebenjamin" in s:
        return "prebenjamin"
    if "benjamin" in s:
        return "benjamin"
    return None


# ─── FETCH (via Wayback) ───────────────────────────────────────────────────────

def fetch_wayback(timestamp, original_url, retries=3):
    wb_url = f"{WAYBACK}/{timestamp}/{original_url}"
    req = urllib.request.Request(wb_url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,*/*",
        "Accept-Language": "es-ES,es;q=0.9",
    })
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read()
            try:
                return raw.decode("utf-8")
            except UnicodeDecodeError:
                return raw.decode("iso-8859-1", errors="replace")
        except Exception as e:
            if attempt < retries - 1:
                wait = (attempt + 1) * 5
                print(f"  Retry {attempt+1}/{retries-1} after {wait}s: {e}")
                time.sleep(wait)
            else:
                raise


# ─── PARSERS (same logic as fetch_futbolaspalmas.py) ──────────────────────────

class MatchParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self._cells = []
        self._buf = ""
        self._in_cell = False
        self.rows = []

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


def parse_all_matches(html):
    """
    Returns dict: {"Jornada N": [[full_date, home, away, hs, as_], ...]}
    Only completed matches with full YYYY-MM-DD date.
    """
    p = MatchParser()
    p.feed(html)

    jornadas = {}
    current_name = None

    for cells in p.rows:
        if len(cells) == 1:
            m = re.match(r"JORNADA\s+(\d+)", cells[0].strip(), re.IGNORECASE)
            if m:
                current_name = f"Jornada {m.group(1)}"
                if current_name not in jornadas:
                    jornadas[current_name] = []
        elif len(cells) == 7:
            if current_name is None:
                continue
            date_raw = cells[0].strip()
            year = None
            for num in re.findall(r'\d+', date_raw):
                if len(num) == 4 and 2020 <= int(num) <= 2030:
                    year = num
                    break
            if year is None:
                continue
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

    return {k: v for k, v in jornadas.items() if v}


def parse_standings(html):
    """
    Parsea clasificacion de la página principal del grupo (versión 2023-2024).
    - Team names: extraídos de ganadosEmpatadosPerdidos(...,'EQUIPO','cargaN')
    - Points: fw-bold bg-* divs
    - Stats: border-start divs (primeros n_teams*7)
    Returns list of [pos, team, pts, J, G, E, P, GF, GC, DF].
    """
    # Extract teams ordered by carga index
    carga_teams = re.findall(r"ganadosEmpatadosPerdidos\('[^']+','([^']+)','carga(\d+)'\)", html)
    teams_by_carga = {}
    for name, idx in carga_teams:
        i = int(idx)
        if i not in teams_by_carga:
            teams_by_carga[i] = name
    names = [teams_by_carga[i] for i in sorted(teams_by_carga.keys())]

    pts_list = [int(x) for x in re.findall(r'fw-bold[^"]*bg-[^"]*"[^>]*>\s*(\d+)\s*<', html)]

    all_stats = [int(x) for x in re.findall(r'border-start[^"]*"[^>]*>\s*(-?\d+)\s*<', html)]

    n_teams = min(len(names), len(pts_list))
    if not n_teams or len(all_stats) < n_teams * 7:
        return []

    result = []
    for i in range(n_teams):
        stats = all_stats[i * 7: i * 7 + 7]
        if len(stats) < 7:
            break
        j, g, e, perd, gf, gc, df = stats
        result.append([i + 1, names[i], pts_list[i], j, g, e, perd, gf, gc, df])

    return result


def group_label(slug, category):
    """Derive a human-readable group name from URL slug."""
    # e.g. "1benjamin3" → "Grupo 3", "1prebenjamin2" → "Grupo 2"
    m = re.search(r'(\d+)$', slug)
    n = m.group(1) if m else "?"
    return f"Grupo {n}"


def phase_from_slug(slug):
    """Guess the phase name from slug."""
    s = slug.lower()
    if "lanzarote" in s:
        return "Lanzarote"
    if "fuerteventura" in s or "fv" in s:
        return "Fuerteventura"
    if s.startswith("2") or "segunda" in s:
        return "Segunda Fase GC"
    return "Primera Fase GC"


def island_from_slug(slug):
    s = slug.lower()
    if "lanzarote" in s:
        return "lanzarote"
    if "fuerteventura" in s or "fv" in s:
        return "fuerteventura"
    return "gran_canaria"


# ─── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    print("=== Wayback Machine 2023-2024 Scraper ===\n")

    groups = discover_groups()

    # Load existing results for incremental mode
    # Skip only groups that already have standings data (equipos > 0) and match data
    existing = {}
    if os.path.exists(OUTPUT_PATH):
        with open(OUTPUT_PATH, encoding="utf-8") as f:
            prev = json.load(f)
        for g in prev.get("groups", []):
            has_data = len(g.get("standings", [])) > 0 and len(g.get("jornadas", [])) > 0
            if has_data:
                existing[g["slug"]] = g
        print(f"Loaded {len(existing)} complete groups from {OUTPUT_PATH} (re-scraping incomplete ones)\n")

    results = list(existing.values())
    errors = []
    done_slugs = set(existing.keys())

    for g in groups:
        slug = g["slug"]
        if slug in done_slugs:
            print(f"[{slug}] skipped (already done)")
            continue
        ts = g["timestamp"]
        original_url = g["url"].rstrip("/") + "/"
        category = g["category"]

        print(f"\n[{slug}] {original_url}")

        # Fetch main group page
        try:
            html = fetch_wayback(ts, original_url)
            time.sleep(DELAY)
        except Exception as e:
            print(f"  ERROR fetching main page: {e}")
            errors.append({"slug": slug, "error": str(e)})
            continue

        # Parse all matches
        all_matches = parse_all_matches(html)
        match_count = sum(len(v) for v in all_matches.values())
        print(f"  Jornadas: {len(all_matches)}, Partidos: {match_count}")

        # Build jornadas list in same format as fiflp raw
        jornadas_out = []
        for jor_name, matches in sorted(all_matches.items(),
                                         key=lambda x: int(re.search(r'\d+', x[0]).group())):
            num = int(re.search(r'\d+', jor_name).group())
            jornadas_out.append({
                "num": num,
                "name": jor_name,
                "matches": [
                    {"date": m[0], "home": m[1], "away": m[2],
                     "hs": m[3], "as_": m[4]}
                    for m in matches
                ]
            })

        # Parse standings from main page HTML (mostrar_clasi.php not archived)
        standings_out = []
        standings = parse_standings(html)
        if standings:
            for row in standings:
                pos, name, pts, j, g_, e, perd, gf, gc, df = row
                standings_out.append({
                    "pos": pos, "team": name, "pts": pts,
                    "j": j, "g": g_, "e": e, "p": perd,
                    "gf": gf, "gc": gc, "df": df,
                })
            print(f"  Clasificacion: {len(standings_out)} equipos")
        else:
            print(f"  ! clasificacion no parseada")

        results.append({
            "slug": slug,
            "url": original_url,
            "wayback_timestamp": ts,
            "category": category,
            "group_name": group_label(slug, category),
            "phase": phase_from_slug(slug),
            "island": island_from_slug(slug),
            "standings": standings_out,
            "jornadas": jornadas_out,
        })

    # Save output
    out = {
        "season": "2023-2024",
        "scraped_at": FROM_DATE + "-" + TO_DATE,
        "groups": results,
        "errors": errors,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*50}")
    print(f"Saved {len(results)} groups to {OUTPUT_PATH}")
    print(f"Errors: {len(errors)}")
    if errors:
        for e in errors:
            print(f"  {e['slug']}: {e['error']}")


if __name__ == "__main__":
    main()
