#!/usr/bin/env python3
"""
fetch_wayback_2425.py — Scrapes futbolaspalmas.com 2024-2025 season data
from Wayback Machine archives.

Targets Benjamin Primera Fase GC (1benjamin1-14) and Prebenjamín GC
(1prebenjamin1-4) — end-of-season snapshots (Apr-Jul 2025) to get
complete match results.

Output: scripts/wayback_2425_raw.json
"""

import json
import os
import re
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(SCRIPT_DIR, "wayback_2425_raw.json")

CDX_URL   = "https://web.archive.org/cdx/search/cdx"
WAYBACK   = "https://web.archive.org/web"
SITE      = "futbolaspalmas.com"
FROM_DATE = "20250401"
TO_DATE   = "20250731"

DELAY = 1.5  # seconds between Wayback requests

# Known groups for 2024-2025 season
KNOWN_GROUPS = (
    [(f"1benjamin{i}", "benjamin") for i in range(1, 15)]    # 1–14
  + [(f"1prebenjamin{i}", "prebenjamin") for i in range(1, 5)]  # 1–4
)


# ─── CDX ──────────────────────────────────────────────────────────────────────

def cdx_best_snapshot(slug, from_date=FROM_DATE, to_date=TO_DATE):
    """
    Returns (timestamp, original_url) for the latest 200-status snapshot
    of the group's main page in the given date range, or None.
    """
    url_pattern = f"{SITE}/{slug}/"
    params = {
        "url": url_pattern,
        "output": "json",
        "filter": "statuscode:200",
        "from": from_date,
        "to": to_date,
        "fl": "timestamp,original",
        "collapse": "digest",   # de-dup identical content
        "limit": "50",
    }
    full_url = CDX_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(full_url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"  CDX error for {slug}: {e}")
        return None
    if data and data[0] == ["timestamp", "original"]:
        data = data[1:]
    if not data:
        return None
    # Pick latest snapshot
    data.sort(key=lambda x: x[0], reverse=True)
    return data[0][0], data[0][1]


def cdx_find_resultados(slug, from_date=FROM_DATE, to_date=TO_DATE):
    """
    Looks for 'resultados-' pages under the group URL to supplement match data.
    Returns list of (timestamp, url).
    """
    url_pattern = f"{SITE}/{slug}/resultados-*"
    params = {
        "url": url_pattern,
        "output": "json",
        "filter": "statuscode:200",
        "from": from_date,
        "to": to_date,
        "fl": "timestamp,original",
        "collapse": "urlkey",
        "limit": "10",
    }
    full_url = CDX_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(full_url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8"))
    except Exception:
        return []
    if data and data[0] == ["timestamp", "original"]:
        data = data[1:]
    return [(row[0], row[1]) for row in data]


# ─── FETCH ────────────────────────────────────────────────────────────────────

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
    """Collects text content from all tr/td/th elements."""
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
    Parses match data from a group page.
    Tries 7-cell rows (2023-2024 format) and 9-cell rows (team calendar format).
    Returns dict: {"Jornada N": [[full_date, home, away, hs, as_], ...]}
    """
    p = MatchParser()
    p.feed(html)

    jornadas = {}
    current_name = None

    for cells in p.rows:
        # Jornada header
        if len(cells) == 1:
            m = re.match(r"JORNADA\s+(\d+)", cells[0].strip(), re.IGNORECASE)
            if m:
                current_name = f"Jornada {m.group(1)}"
                if current_name not in jornadas:
                    jornadas[current_name] = []
            continue

        # 7-cell row: date, ?, home, hs, as_, away, ?
        if len(cells) == 7 and current_name is not None:
            date_raw = cells[0].strip()
            year = next((n for n in re.findall(r'\d+', date_raw)
                         if len(n) == 4 and 2020 <= int(n) <= 2030), None)
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
                hs  = int(cells[3].strip())
                as_ = int(cells[4].strip())
            except ValueError:
                hs = None
                as_ = None
            if home and away:
                jornadas.setdefault(current_name, []).append(
                    [full_date, home, away, hs, as_]
                )
            continue

        # 9-cell row (team calendar): jornada, verified, date, time, field, home, hs, as_, away
        # or similar extended format
        if len(cells) == 9:
            # Try to detect jornada from first cell
            jor_m = re.match(r"(\d+)", cells[0].strip())
            date_raw = cells[2].strip()
            year = next((n for n in re.findall(r'\d+', date_raw)
                         if len(n) == 4 and 2020 <= int(n) <= 2030), None)
            if not year or not jor_m:
                continue
            short_nums = [n for n in re.findall(r'\d+', date_raw) if len(n) <= 2]
            if len(short_nums) < 2:
                continue
            day, month = short_nums[0].zfill(2), short_nums[1].zfill(2)
            full_date = f"{year}-{month}-{day}"
            jor_key = f"Jornada {jor_m.group(1)}"
            home = cells[5].strip()
            away = cells[8].strip()
            try:
                hs  = int(cells[6].strip())
                as_ = int(cells[7].strip())
            except ValueError:
                hs = None
                as_ = None
            if home and away:
                jornadas.setdefault(jor_key, []).append(
                    [full_date, home, away, hs, as_]
                )

    return {k: v for k, v in jornadas.items() if v}


def parse_standings(html):
    """
    Parses standings from group page.
    Supports both 2023-2024 format (ganadosEmpatadosPerdidos js calls)
    and current site format (same regex patterns).
    """
    # Team names from JS calls: ganadosEmpatadosPerdidos('...','TEAM','cargaN')
    carga_teams = re.findall(r"ganadosEmpatadosPerdidos\('[^']+','([^']+)','carga(\d+)'\)", html)
    if carga_teams:
        teams_by_carga = {}
        for name, idx in carga_teams:
            i = int(idx)
            if i not in teams_by_carga:
                teams_by_carga[i] = name
        names = [teams_by_carga[i] for i in sorted(teams_by_carga.keys())]

        pts_list = [int(x) for x in re.findall(r'fw-bold[^"]*bg-[^"]*"[^>]*>\s*(\d+)\s*<', html)]
        all_stats = [int(x) for x in re.findall(r'border-start[^"]*"[^>]*>\s*(-?\d+)\s*<', html)]

        n_teams = min(len(names), len(pts_list))
        if n_teams and len(all_stats) >= n_teams * 7:
            result = []
            for i in range(n_teams):
                stats = all_stats[i * 7: i * 7 + 7]
                if len(stats) < 7:
                    break
                j, g, e, perd, gf, gc, df = stats
                result.append([i + 1, names[i], pts_list[i], j, g, e, perd, gf, gc, df])
            if result:
                return result

    return []


# ─── HELPERS ──────────────────────────────────────────────────────────────────

def slug_to_phase(slug, category):
    if category == "prebenjamin":
        return "Gran Canaria"
    return "Primera Fase GC"


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    print("=== Wayback Machine 2024-2025 Scraper ===\n")

    # Load existing results for incremental mode
    existing = {}
    if os.path.exists(OUTPUT_PATH):
        with open(OUTPUT_PATH, encoding="utf-8") as f:
            prev = json.load(f)
        for g in prev.get("groups", []):
            has_data = len(g.get("standings", [])) > 0 or any(
                m.get("hs") is not None
                for j in g.get("jornadas", [])
                for m in j["matches"]
            )
            if has_data:
                existing[g["slug"]] = g
        print(f"Loaded {len(existing)} complete groups from existing output\n")

    results = list(existing.values())
    errors = []
    done_slugs = set(existing.keys())

    for slug, category in KNOWN_GROUPS:
        if slug in done_slugs:
            print(f"[{slug}] skipped (already done)")
            continue

        print(f"\n[{slug}] Querying CDX...")

        # Find best snapshot
        snap = cdx_best_snapshot(slug)
        if not snap:
            # Try wider date range as fallback
            snap = cdx_best_snapshot(slug, from_date="20250101", to_date="20250831")
        if not snap:
            print(f"  ! No snapshot found")
            errors.append({"slug": slug, "error": "no snapshot found"})
            continue

        ts, original_url = snap
        original_url = original_url.rstrip("/") + "/"
        print(f"  Snapshot: {ts} -> {original_url}")
        time.sleep(0.3)

        # Fetch main group page
        try:
            html = fetch_wayback(ts, original_url)
            time.sleep(DELAY)
        except Exception as e:
            print(f"  ERROR fetching main page: {e}")
            errors.append({"slug": slug, "error": str(e)})
            continue

        all_matches = parse_all_matches(html)
        standings   = parse_standings(html)

        match_count = sum(len(v) for v in all_matches.values())
        print(f"  Main page → Jornadas: {len(all_matches)}, Partidos: {match_count}, "
              f"Equipos: {len(standings)}")

        # If no matches found from main page, try resultados- pages
        if match_count == 0:
            print(f"  Trying resultados pages...")
            res_pages = cdx_find_resultados(slug)
            time.sleep(0.3)
            for res_ts, res_url in res_pages[:3]:
                try:
                    res_html = fetch_wayback(res_ts, res_url)
                    time.sleep(DELAY)
                    extra = parse_all_matches(res_html)
                    for k, v in extra.items():
                        if k not in all_matches:
                            all_matches[k] = v
                        else:
                            # Merge: prefer entries with scores
                            existing_homes = {m[1] for m in all_matches[k]}
                            for m in v:
                                if m[1] not in existing_homes or m[3] is not None:
                                    all_matches[k] = [x for x in all_matches[k] if x[1] != m[1]]
                                    all_matches[k].append(m)
                    match_count = sum(len(v) for v in all_matches.values())
                    print(f"    {res_url} → +{sum(len(v) for v in extra.values())} partidos")
                    if match_count > 0:
                        break
                except Exception as e:
                    print(f"    ERROR {res_url}: {e}")

        # Build jornadas output
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
                ],
            })

        # Build standings output
        standings_out = []
        for row in standings:
            pos, name, pts, j, g_, e, perd, gf, gc, df = row
            standings_out.append({
                "pos": pos, "team": name, "pts": pts,
                "j": j, "g": g_, "e": e, "p": perd,
                "gf": gf, "gc": gc, "df": df,
            })
        if standings_out:
            print(f"  Clasificacion: {len(standings_out)} equipos")
        else:
            print(f"  ! Clasificacion no parseada")

        num_m = re.search(r"(\d+)$", slug)
        grp_num = num_m.group(1) if num_m else "?"
        results.append({
            "slug": slug,
            "url": original_url,
            "wayback_timestamp": ts,
            "category": category,
            "group_name": f"Grupo {grp_num}",
            "phase": slug_to_phase(slug, category),
            "island": "gran_canaria",
            "standings": standings_out,
            "jornadas": jornadas_out,
        })

        # Save incrementally after each group
        out = {
            "season": "2024-2025",
            "scraped_from": FROM_DATE,
            "scraped_to": TO_DATE,
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

    total_matches = sum(
        sum(len(j["matches"]) for j in g.get("jornadas", []))
        for g in results
    )
    scored = sum(
        1 for g in results
        for j in g.get("jornadas", [])
        for m in j["matches"]
        if m.get("hs") is not None
    )
    print(f"\nTotal partidos: {total_matches} ({scored} con resultado)")


if __name__ == "__main__":
    main()
