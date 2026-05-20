"""Match a FIFLP acta header to an existing matches row.

Strategy (strong -> weak):
  1. season_id by acta header "YYYY/YYYY" -> "YYYY-YYYY" lookup in seasons.
  2. candidate matches in that season with matching home/away teams by
     normalized name; if multiple, narrow by date (+-1 day) and/or score.
  3. Return matches.id if unique, else None.

Public API:
    normalize_team_name(s: str) -> str
    reconcile_acta(conn, header: dict) -> int | None
"""
import re
import unicodedata
from datetime import datetime, timedelta


def normalize_team_name(s: str) -> str:
    """Accent-strip, lowercase, strip trailing team-letter suffix (A/B/C/D)
    in quotes or bare, collapse whitespace."""
    if not s:
        return ""
    # Remove accents via NFKD decomposition
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    # Strip quote chars (both straight and curly-like)
    s = re.sub(r'["\'‘’“”]', " ", s)
    # Strip trailing team-letter suffix like "A", "B", "C", "D" (bare or previously quoted)
    s = re.sub(r"\s+[ABCD]\s*$", "", s, flags=re.IGNORECASE).strip()
    # Lowercase and collapse whitespace
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def _season_id(conn, header: dict):
    """Resolve season name from acta header (e.g. '2025/2026') to DB id."""
    raw = header.get("season")
    if not raw:
        return None
    # Acta format: "YYYY/YYYY" or "YYYY-YYYY" -> DB format: "YYYY-YYYY"
    name = raw.replace("/", "-")
    r = conn.execute("SELECT id FROM seasons WHERE name=?", (name,)).fetchone()
    return r[0] if r else None


def _parse_date(s: str):
    """Try to parse a date string in several formats. Returns date or None."""
    if not s:
        return None
    # Handle short format like "23/05" (no year) - cannot use for date comparison
    if re.match(r"^\d{2}/\d{2}$", s):
        return None
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except (ValueError, TypeError):
            pass
    return None


def reconcile_acta(conn, header: dict):
    """Return matches.id if exactly one match can be identified, else None."""
    sid = _season_id(conn, header)
    if not sid:
        return None

    nh = normalize_team_name(header.get("home_team") or "")
    na = normalize_team_name(header.get("away_team") or "")
    if not nh or not na:
        return None

    rows = conn.execute(
        """
        SELECT m.id, t1.name, t2.name, m.date, m.home_score, m.away_score
          FROM matches m
          JOIN groups g ON g.id=m.group_id
          JOIN teams t1 ON t1.id=m.home_team_id
          JOIN teams t2 ON t2.id=m.away_team_id
         WHERE g.season_id=?
        """,
        (sid,),
    ).fetchall()

    # Filter by normalized team names
    candidates = [
        r for r in rows
        if normalize_team_name(r[1]) == nh and normalize_team_name(r[2]) == na
    ]

    if len(candidates) == 1:
        return candidates[0][0]
    if len(candidates) == 0:
        return None

    # Multiple matches for same teams in a season (round-robin): narrow by date
    target = _parse_date(header.get("date"))
    if target:
        narrowed = []
        for r in candidates:
            d = _parse_date(r[3])
            if d and abs((d - target).days) <= 1:
                narrowed.append(r)
        if len(narrowed) == 1:
            return narrowed[0][0]
        if narrowed:
            candidates = narrowed

    # Narrow by score
    hs = header.get("home_score")
    asc_ = header.get("away_score")
    if hs is not None and asc_ is not None:
        narrowed = [r for r in candidates if r[4] == hs and r[5] == asc_]
        if len(narrowed) == 1:
            return narrowed[0][0]

    return None
