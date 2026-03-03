#!/usr/bin/env python3
"""
fetch_wayback_2223.py — Scrapes futbolaspalmas.com 2022-2023 season data
from Wayback Machine archives.

For 2022-2023, the site used different URL structures than 2023-2024:
  - Benjamin (6 groups):      futbolaspalmas.com/1benjaminN/
    (main page only archived in Aug 2022 = prior season; use subpage instead)
    Subpage: /1benjaminN/primera-benjamin-grupo-N-benjamin-primeraN.html
  - Benjamin Preferente (2):  futbolaspalmas.com/1benjamin-prefe1/
    and                       futbolaspalmas.com/1benjamin-prefe2/
  - Prebenjamin (2 groups):   futbolaspalmas.com/1prebenjaminN/

Best snapshots are from June 2023 (end of season, most complete data).

Output: scripts/wayback_2223_raw.json
"""

import json
import os
import re
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(SCRIPT_DIR, "wayback_2223_raw.json")

CDX_URL   = "https://web.archive.org/cdx/search/cdx"
WAYBACK   = "https://web.archive.org/web"
SITE      = "futbolaspalmas.com"

# Use end-of-season snapshots (June 2023) to maximise data completeness.
# Fall back to earlier snapshots if June not available.
FROM_DATE = "20230601"
TO_DATE   = "20230630"
FALLBACK_FROM = "20230301"
FALLBACK_TO   = "20230331"

DELAY = 1.5  # seconds between Wayback requests


# ─── KNOWN GROUPS ─────────────────────────────────────────────────────────────
# Manually curated after CDX discovery.  Each entry has:
#   slug       : unique identifier (used as key and for code mapping)
#   category   : "benjamin" | "benjamin_prefe" | "prebenjamin"
#   main_url   : canonical futbolaspalmas.com URL for the group page
#   subpage    : subpage URL that always has full data (preferred)
# The script tries to find the best snapshot via CDX for each URL.

KNOWN_GROUPS = [
    # ── Benjamin Primera (1-6) ─────────────────────────────────────────────
    {
        "slug": "1benjamin1",
        "category": "benjamin",
        "main_url": "https://futbolaspalmas.com/1benjamin1/",
        "subpage": "https://futbolaspalmas.com/1benjamin1/primera-benjamin-grupo-1-benjamin-primera1.html",
    },
    {
        "slug": "1benjamin2",
        "category": "benjamin",
        "main_url": "https://futbolaspalmas.com/1benjamin2/",
        "subpage": "https://futbolaspalmas.com/1benjamin2/primera-benjamin-grupo-2-benjamin-primera2.html",
    },
    {
        "slug": "1benjamin3",
        "category": "benjamin",
        "main_url": "https://futbolaspalmas.com/1benjamin3/",
        "subpage": "https://futbolaspalmas.com/1benjamin3/primera-benjamin-grupo-3-benjamin-primera3.html",
    },
    {
        "slug": "1benjamin4",
        "category": "benjamin",
        "main_url": "https://futbolaspalmas.com/1benjamin4/",
        "subpage": "https://futbolaspalmas.com/1benjamin4/primera-benjamin-grupo-4-benjamin-primera4.html",
    },
    {
        "slug": "1benjamin5",
        "category": "benjamin",
        "main_url": "https://futbolaspalmas.com/1benjamin5/",
        "subpage": "https://futbolaspalmas.com/1benjamin5/primera-benjamin-grupo-5-benjamin-primera5.html",
    },
    {
        "slug": "1benjamin6",
        "category": "benjamin",
        "main_url": "https://futbolaspalmas.com/1benjamin6/",
        "subpage": "https://futbolaspalmas.com/1benjamin6/primera-benjamin-grupo-6-benjamin-primera6.html",
    },
    # ── Benjamin Preferente (1-2) ──────────────────────────────────────────
    {
        "slug": "1benjamin-prefe1",
        "category": "benjamin_prefe",
        "main_url": "https://futbolaspalmas.com/1benjamin-prefe1/",
        "subpage": "https://futbolaspalmas.com/1benjamin-prefe1/benjamin-preferente-grupo-1-benjaminpreferente1.html",
    },
    {
        "slug": "1benjamin-prefe2",
        "category": "benjamin_prefe",
        "main_url": "https://futbolaspalmas.com/1benjamin-prefe2/",
        "subpage": "https://futbolaspalmas.com/1benjamin-prefe2/benjamin-preferente-grupo-2-benjaminpreferente2.html",
    },
    # ── Prebenjamin Primera (1-2) ──────────────────────────────────────────
    {
        "slug": "1prebenjamin1",
        "category": "prebenjamin",
        "main_url": "https://futbolaspalmas.com/1prebenjamin1/",
        "subpage": "https://futbolaspalmas.com/1prebenjamin1/primera-benjamin-grupo-1-prebenjamin-primera1.html",
    },
    {
        "slug": "1prebenjamin2",
        "category": "prebenjamin",
        "main_url": "https://futbolaspalmas.com/1prebenjamin2/",
        "subpage": "https://futbolaspalmas.com/1prebenjamin2/primera-benjamin-grupo-2-prebenjamin-primera2.html",
    },
]


# ─── CDX ──────────────────────────────────────────────────────────────────────

def cdx_best_snapshot(url, from_date, to_date):
    """Return (timestamp, url) for the latest 200 snapshot in [from_date, to_date]."""
    params = {
        "url": url,
        "output": "json",
        "filter": "statuscode:200",
        "from": from_date,
        "to": to_date,
        "fl": "timestamp,original",
        "limit": "10",
    }
    full_url = CDX_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(full_url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8"))
        if data and data[0] == ["timestamp", "original"]:
            data = data[1:]
        if not data:
            return None, None
        # Return latest snapshot
        ts, orig = data[-1]
        return ts, orig
    except Exception as e:
        print(f"    CDX error for {url}: {e}")
        return None, None


def discover_snapshots():
    """
    For each known group, find the best Wayback snapshot.
    Preference: subpage in June 2023, then subpage in March 2023,
    then main page in June 2023, then main page in March 2023.
    """
    groups_out = []
    for g in KNOWN_GROUPS:
        slug = g["slug"]
        print(f"\n[{slug}] Finding best snapshot...")

        ts, snap_url = None, None

        # 1. Try subpage in June 2023 first (most complete data)
        if g.get("subpage"):
            ts, snap_url = cdx_best_snapshot(g["subpage"], FROM_DATE, TO_DATE)
            if ts:
                print(f"  Found subpage in June 2023: {ts}")
            else:
                # 2. Try subpage in March 2023
                time.sleep(0.3)
                ts, snap_url = cdx_best_snapshot(g["subpage"], FALLBACK_FROM, FALLBACK_TO)
                if ts:
                    print(f"  Found subpage in Mar 2023: {ts}")

        # 3. Fall back to main page in June 2023
        if not ts:
            time.sleep(0.3)
            ts, snap_url = cdx_best_snapshot(g["main_url"], FROM_DATE, TO_DATE)
            if ts:
                print(f"  Found main page in June 2023: {ts}")
            else:
                # 4. Fall back to main page in March 2023
                time.sleep(0.3)
                ts, snap_url = cdx_best_snapshot(g["main_url"], FALLBACK_FROM, FALLBACK_TO)
                if ts:
                    print(f"  Found main page in Mar 2023: {ts}")

        if not ts:
            print(f"  WARNING: no snapshot found for {slug}")
            continue

        groups_out.append({
            "slug": slug,
            "category": g["category"],
            "url": snap_url,
            "timestamp": ts,
        })
        time.sleep(0.3)

    return groups_out


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


# ─── PARSERS ──────────────────────────────────────────────────────────────────

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
    Parses standings from 2022-2023 group pages.

    The 2022-2023 site uses div-based standings with inline width% styles.
    Stats are in repeating blocks of 9 divs:
      width:4%  → position (orden55ddd)
      width:7%  → PTS
      width:6%  → J
      width:6%  → G
      width:5%  → E
      width:6%  → P
      width:7%  → GF
      width:7%  → GC
      width:7%  → DF

    Team names are extracted (in position order) from calendarioClasificacion()
    onclick handlers.

    Returns list of [pos, team, pts, J, G, E, P, GF, GC, DF].
    """
    # Team names in order of standing position
    teams = re.findall(
        r"calendarioClasificacion\('[^']+','([^']+)','clasidiv\d+'\)", html
    )
    if not teams:
        return []

    # Extract (width_percent, numeric_value) pairs from inline-styled divs
    all_width_nums = re.findall(
        r"width:\s*(\d+)%[;\"][^>]*>\s*(-?\d+)\s*</div>", html
    )

    # Parse repeating 9-value groups starting at width:4% (position)
    stat_groups = []
    i = 0
    while i < len(all_width_nums):
        w, v = all_width_nums[i]
        if w == "4":
            if i + 8 < len(all_width_nums):
                grp = [all_width_nums[i + j][1] for j in range(9)]
                stat_groups.append(grp)
                i += 9
            else:
                i += 1
        else:
            i += 1

    n = min(len(teams), len(stat_groups))
    if not n:
        return []

    result = []
    for idx_t in range(n):
        t = teams[idx_t]
        grp = stat_groups[idx_t]
        pos, pts, j, g, e, perd, gf, gc, df = (int(x) for x in grp)
        result.append([pos, t, pts, j, g, e, perd, gf, gc, df])

    return result


def group_label(slug):
    """Derive a human-readable group name from URL slug."""
    m = re.search(r'(\d+)$', slug)
    n = m.group(1) if m else "?"
    return f"Grupo {n}"


def phase_from_category(category):
    """Map category to phase name."""
    if category == "benjamin_prefe":
        return "Preferente GC"
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
    print("=== Wayback Machine 2022-2023 Scraper ===\n")

    groups = discover_snapshots()
    print(f"\nTotal groups to scrape: {len(groups)}\n")

    # Load existing results for incremental mode
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
        original_url = g["url"]
        category = g["category"]

        print(f"\n[{slug}] {original_url} @ {ts}")

        # Fetch page
        try:
            html = fetch_wayback(ts, original_url)
            time.sleep(DELAY)
        except Exception as e:
            print(f"  ERROR fetching page: {e}")
            errors.append({"slug": slug, "error": str(e)})
            continue

        # Parse all matches
        all_matches = parse_all_matches(html)
        match_count = sum(len(v) for v in all_matches.values())
        print(f"  Jornadas: {len(all_matches)}, Partidos completados: {match_count}")

        # Build jornadas list
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

        # Parse standings
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
            "group_name": group_label(slug),
            "phase": phase_from_category(category),
            "island": island_from_slug(slug),
            "standings": standings_out,
            "jornadas": jornadas_out,
        })

    # Save output
    out = {
        "season": "2022-2023",
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
