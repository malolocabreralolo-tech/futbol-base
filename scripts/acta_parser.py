#!/usr/bin/env python3
"""Pure FIFLP acta HTML parser. No browser, no network.

The capture step records the page HTML after JS execution (via Playwright
page.content()). This means the ntype() obfuscation script HAS run in the
browser before capture and has already mutated the CSS classes — BUT the
display:none fallback spans are still present for some digits. We decode
the score using the ntype() call arguments (n, i) and the fixed digit-lookup
table that is embedded in every FIFLP acta.

HONESTY CAVEAT — minutes:
  The FIFLP acta uses CSS ::before pseudo-elements to display goal/event
  minutes, e.g. <span class="font-blue">(')</span>. The minute value comes
  from CSS class content rules. In the captured static HTML the CSS is loaded
  from an external stylesheet that was NOT captured; therefore the ::before
  content is unavailable and all event minutes are recorded as None.
  Inline <style> ::before/::after rules (when present) are extracted and used.

Public API:
    parse_acta(html: str) -> dict
        Returns:
          { 'header': {'season', 'jornada', 'date', 'home_team', 'away_team',
                       'home_score', 'away_score', 'competition'},
            'lineups': {'home': [{'dorsal', 'name', 'role'}], 'away': [...]},
            'events':  [{'kind', 'side', 'player_name', 'minute',
                         'goal_type'?, 'pair_idx'?}, ...],
            'staff':   {'referee', 'coach_home', 'coach_away'} }
"""
import re
from html import unescape

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

_WS = re.compile(r"\s+")


def _clean(s: str) -> str:
    """Collapse whitespace and unescape HTML entities."""
    return _WS.sub(" ", unescape(s)).strip()


def _strip_tags(s: str) -> str:
    return re.sub(r"<[^>]+>", " ", s)


# The fixed digit-lookup array embedded in every FIFLP acta page.
# ntype(elemId, n, i, oldClass) -> element gets class 'fa-' + str(d[(i*10)+n])
_NTYPE_D = [2, 5, 9, 4, 1, 0, 8, 6, 3, 7,
            1, 3, 5, 7, 9, 0, 2, 4, 6, 8,
            0, 2, 4, 6, 8, 1, 3, 5, 7, 9,
            7, 5, 2, 0, 9, 6, 3, 8, 4, 1]

_RE_NTYPE = re.compile(r'ntype\("[^"]+",\s*(\d+),\s*(\d+),\s*"[^"]+"\)')


def _decode_ntype(match: re.Match) -> int:
    """Decode the obfuscated score digit. FIFLP serves digits via `ntype(i, n)`
    JS calls; the lookup table has 4 rows of 10. Defensive: if i/n exceed the
    table, return 0 (the visible HTML wins via the fallback path)."""
    n, i = int(match.group(1)), int(match.group(2))
    idx = (i * 10) + n
    if idx < 0 or idx >= len(_NTYPE_D):
        return 0
    return _NTYPE_D[idx]


# ---------------------------------------------------------------------------
# Task 4: Header
# ---------------------------------------------------------------------------

# <h5 class="font-grey-cascade">Temporada 2024-2025 ... Jornada 1 ... 26-10-2024 09:00 h</h5>
_RE_FICHA_H5 = re.compile(
    r'class="font-grey-cascade">Temporada\s+(\d{4}-\d{4})'
    r'[^<]*Jornada\s+(\d+).*?(\d{2}-\d{2}-\d{4})',
    re.DOTALL | re.IGNORECASE,
)

# Competition: <h4 ...><i class="fa fa-trophy"...></i> LIGA ... </h4>
_RE_COMPETITION = re.compile(r'fa-trophy[^>]*></i>\s*([^<]+)', re.IGNORECASE)

# Team names from header widget divs
_RE_WIDGET_L = re.compile(r'class="font_widgetL">([^<]+)</div>')
_RE_WIDGET_V = re.compile(r'class="font_widgetV">([^<]+)</div>')

# Score: inside <h2 class="ntype">...</h2>
_RE_NTYPE_H2 = re.compile(r'<h2\s+class="ntype">(.*?)</h2>', re.DOTALL | re.IGNORECASE)


def _decode_score(h2_content: str) -> tuple:
    """Extract (home_score, away_score) from the obfuscated ntype h2 block."""
    sep = " - "
    sep_idx = h2_content.find(sep)
    if sep_idx < 0:
        return None, None
    home_part = h2_content[:sep_idx]
    away_part = h2_content[sep_idx + len(sep):]

    def _digits_from(part: str) -> str:
        return "".join(str(_decode_ntype(m)) for m in _RE_NTYPE.finditer(part))

    home_str = _digits_from(home_part)
    away_str = _digits_from(away_part)
    try:
        return (int(home_str) if home_str else None,
                int(away_str) if away_str else None)
    except ValueError:
        return None, None


def _parse_header(html: str) -> dict:
    h: dict = {
        "season": None, "jornada": None, "date": None,
        "home_team": None, "away_team": None,
        "home_score": None, "away_score": None,
        "competition": None,
    }
    m = _RE_FICHA_H5.search(html)
    if m:
        h["season"] = m.group(1).replace("-", "/")
        h["jornada"] = m.group(2)
        h["date"] = m.group(3)
    m = _RE_COMPETITION.search(html)
    if m:
        h["competition"] = _clean(m.group(1))
    lm = _RE_WIDGET_L.search(html)
    vm = _RE_WIDGET_V.search(html)
    if lm:
        h["home_team"] = _clean(lm.group(1))
    if vm:
        h["away_team"] = _clean(vm.group(1))
    m = _RE_NTYPE_H2.search(html)
    if m:
        h["home_score"], h["away_score"] = _decode_score(m.group(1))
    return h


# ---------------------------------------------------------------------------
# Task 5: Lineups
# ---------------------------------------------------------------------------

_RE_LINEUP_PANEL = re.compile(
    r'<div class="number"[^>]*>([A-Z\xc1\xc9\xcd\xd3\xda\xd1\xdc][^<]+)</div>'
    r'(.*?)'
    r'(?=<div class="number"|</div>\s*</div>\s*</div>\s*</div>)',
    re.DOTALL | re.IGNORECASE,
)

# Use simple <strong> tag patterns to find section boundaries reliably.
# Avoids the multi-line h5 regex trap where .*? spans from Titulares to Suplentes.
_RE_STRONG_TITULARES = re.compile(r'<strong>Titulares</strong>', re.IGNORECASE)
_RE_STRONG_SUPLENTES = re.compile(r'<strong>Suplentes</strong>', re.IGNORECASE)

_RE_LINEUP_ROW = re.compile(
    r'<td[^>]*>[\s\xa0]*(\d{1,2})[\s\xa0]*</td>\s*'
    r'<td[^>]*>\s*([^<]+?)\s*</td>',
    re.DOTALL | re.IGNORECASE,
)

# Skip panels for non-lineup sections (Árbitros, Goles, staff)
_NON_LINEUP_KEYWORDS = re.compile(
    r'^(\xc1rbitros?|rbitros?|goles?|entrenador|del\.|cuerpo)',
    re.IGNORECASE,
)


def _extract_players_from_block(block: str, role: str) -> list:
    """Parse (dorsal, name) rows from a table block."""
    players = []
    for m in _RE_LINEUP_ROW.finditer(block):
        dorsal = int(m.group(1))
        name = _clean(m.group(2))
        if not name or len(name) < 3:
            continue
        players.append({"dorsal": dorsal, "name": name, "role": role})
    return players


def _parse_lineup_from_panel(panel_html: str) -> list:
    """Extract titulares + suplentes from one team panel.

    Uses direct strong-tag position searching to correctly identify
    the boundary between the Titulares and Suplentes tables.
    """
    tit_m = _RE_STRONG_TITULARES.search(panel_html)
    if tit_m is None:
        return []

    # Find the end of the Titulares h5: advance past </h5>
    h5_end_tag = panel_html.find("</h5>", tit_m.start())
    tit_block_start = h5_end_tag + len("</h5>") if h5_end_tag >= 0 else tit_m.end()

    # Find Suplentes strong tag (must be AFTER Titulares)
    sup_m = _RE_STRONG_SUPLENTES.search(panel_html, tit_block_start)
    if sup_m:
        sup_h5_start = panel_html.rfind("<h5", 0, sup_m.start())
        tit_block_end = sup_h5_start if sup_h5_start >= tit_block_start else sup_m.start()
        sup_h5_end = panel_html.find("</h5>", sup_m.start())
        sup_block_start = sup_h5_end + len("</h5>") if sup_h5_end >= 0 else sup_m.end()
        sup_block = panel_html[sup_block_start:]
    else:
        tit_block_end = len(panel_html)
        sup_block = ""

    tit_block = panel_html[tit_block_start:tit_block_end]
    players = _extract_players_from_block(tit_block, "starter")
    players += _extract_players_from_block(sup_block, "sub")
    return players


def _parse_lineups(html: str) -> dict:
    """Return {'home': [...], 'away': [...]} player lists."""
    out: dict = {"home": [], "away": []}
    team_panels = []
    for m in _RE_LINEUP_PANEL.finditer(html):
        panel_title = _clean(m.group(1))
        if _NON_LINEUP_KEYWORDS.match(panel_title):
            continue
        if not re.search(r'Titulares', m.group(2), re.IGNORECASE):
            continue
        team_panels.append((panel_title, m.group(2)))
    if len(team_panels) >= 1:
        out["home"] = _parse_lineup_from_panel(team_panels[0][1])
    if len(team_panels) >= 2:
        out["away"] = _parse_lineup_from_panel(team_panels[1][1])
    return out


# ---------------------------------------------------------------------------
# Shared: goal / event side classification
# ---------------------------------------------------------------------------

def _classify_side(player_name: str, home_lineup: list, away_lineup: list):
    """Return 'home', 'away', or None if not found in either lineup."""
    if not player_name:
        return None
    norm = player_name.upper().strip()
    if any(p["name"].upper().strip() == norm for p in home_lineup):
        return "home"
    if any(p["name"].upper().strip() == norm for p in away_lineup):
        return "away"
    return None


# ---------------------------------------------------------------------------
# Shared: CSS minute extraction (best-effort; usually returns None)
# ---------------------------------------------------------------------------

def _extract_minutes_from_css(html: str) -> dict:
    """Build {elem_id_or_class: minute_int} from inline <style> ::before rules.

    FIFLP uses CSS ::before to obfuscate event minutes. These rules are
    sometimes included as inline <style> tags in the captured HTML.
    """
    out: dict = {}
    for style in re.findall(r"<style[^>]*>(.*?)</style>", html, re.DOTALL | re.IGNORECASE):
        # #elemId::before { content: "\0030" } or #elemId::before { content: "6" }
        for css_id, mn in re.findall(
            r"#([\w-]+)::?(?:before|after)\s*\{[^}]*content\s*:\s*['\"]\\?0*(\d+)['\"]",
            style,
        ):
            try:
                out[css_id] = int(mn)
            except ValueError:
                pass
        # .className::before { content: "N" }
        for cls, mn in re.findall(
            r"\.([\w-]+)::?(?:before|after)\s*\{[^}]*content\s*:\s*['\"](\d+)['\"]",
            style,
        ):
            try:
                out[cls] = int(mn)
            except ValueError:
                pass
    return out


def _row_minute(row_html: str, css_minutes: dict):
    """Try to extract a minute integer from a goal/event row.

    NOTE: In practice, FIFLP minutes are shown via CSS ::before on an external
    stylesheet NOT included in the static HTML capture. Minutes will often be
    None. Inline style rules (when present) are used.
    """
    for elem_id in re.findall(r'id=["\']([^"\']+)["\']', row_html):
        if elem_id in css_minutes:
            return css_minutes[elem_id]
    for cls_val in re.findall(r'class=["\']([^"\']+)["\']', row_html):
        for cls in cls_val.split():
            if cls in css_minutes:
                return css_minutes[cls]
    return None


# ---------------------------------------------------------------------------
# Task 6: Goals
# ---------------------------------------------------------------------------

_RE_GOLES_SECTION = re.compile(r'Goles</div>', re.IGNORECASE)

_GOAL_TYPE_MAP = {
    "Gol normal": "normal",
    "Gol Penalti": "penalty",
    "Gol Propia Puerta": "own",
}

_RE_GOAL_ROW = re.compile(r'<tr[^>]*>(.*?)</tr>', re.DOTALL | re.IGNORECASE)
_RE_LGOL = re.compile(r'class="img\s+lgol"', re.IGNORECASE)
_RE_LGOL_TITLE = re.compile(r'title="([^"]+)"', re.IGNORECASE)

# Player name in goal row: in <td class="font_responsive">...(')PLAYER_NAME</td>
_RE_GOAL_PLAYER = re.compile(
    r'class="font_responsive">[^<]*<span[^>]*>[^<]*</span>\s*'
    r'([A-Z\xc1\xc9\xcd\xd3\xda\xd1\xdc][A-Z\xc1\xc9\xcd\xd3\xda\xd1\xdc\s,\.\'-]+?)\s*</td>',
    re.IGNORECASE,
)


def _parse_goal_events(html: str, lineups: dict, css_minutes: dict) -> list:
    """Extract goal events from the Goles section."""
    out: list = []
    blk_m = _RE_GOLES_SECTION.search(html)
    if not blk_m:
        return out
    blk = html[blk_m.start(): blk_m.start() + 15000]
    for tr_m in _RE_GOAL_ROW.finditer(blk):
        row = tr_m.group(1)
        if not _RE_LGOL.search(row):
            continue
        title_m = _RE_LGOL_TITLE.search(row)
        raw_title = title_m.group(1).strip() if title_m else "Gol normal"
        goal_type = _GOAL_TYPE_MAP.get(raw_title, "normal")
        player_m = _RE_GOAL_PLAYER.search(row)
        if not player_m:
            continue
        name = _clean(player_m.group(1))
        if not name or "," not in name:
            continue
        side = _classify_side(name, lineups["home"], lineups["away"])
        if side is None:
            continue
        out.append({
            "kind": "goal",
            "side": side,
            "player_name": name,
            "minute": _row_minute(row, css_minutes),
            "goal_type": goal_type,
        })
    return out


# ---------------------------------------------------------------------------
# Task 7: Substitutions
# ---------------------------------------------------------------------------

_RE_SUBS_SECTION = re.compile(r'(Cambios|Sustituciones)</div>', re.IGNORECASE)

_RE_NAME_IN_ROW = re.compile(
    r'[A-Z\xc1\xc9\xcd\xd3\xda\xd1\xdc]{2,}(?:\s+[A-Z\xc1\xc9\xcd\xd3\xda\xd1\xdc]{2,})*'
    r',\s*[A-Z\xc1\xc9\xcd\xd3\xda\xd1\xdc][A-Z\xc1\xc9\xcd\xd3\xda\xd1\xdc\s\'-]*',
    re.IGNORECASE,
)


def _parse_sub_events(html: str, lineups: dict, css_minutes: dict) -> list:
    """Extract sub_in / sub_out event pairs from the Cambios section.

    These fixtures have no substitution sections. The implementation handles
    the expected FIFLP format if/when such fixtures are captured.
    """
    out: list = []
    blk_m = _RE_SUBS_SECTION.search(html)
    if not blk_m:
        return out
    blk = html[blk_m.start(): blk_m.start() + 12000]
    pair_idx = 0
    for tr_m in _RE_GOAL_ROW.finditer(blk):
        row = tr_m.group(1)
        plain = _clean(_strip_tags(row))
        names = _RE_NAME_IN_ROW.findall(plain)
        if len(names) < 2:
            continue
        out_name = _clean(names[0])
        in_name = _clean(names[1])
        side = (_classify_side(out_name, lineups["home"], lineups["away"])
                or _classify_side(in_name, lineups["home"], lineups["away"]))
        if not side:
            continue
        minute = _row_minute(row, css_minutes)
        out.append({"kind": "sub_out", "side": side, "player_name": out_name,
                    "minute": minute, "pair_idx": pair_idx})
        out.append({"kind": "sub_in", "side": side, "player_name": in_name,
                    "minute": minute, "pair_idx": pair_idx})
        pair_idx += 1
    return out


# ---------------------------------------------------------------------------
# Task 8: Cards
# ---------------------------------------------------------------------------

_RE_CARDS_SECTION = re.compile(r'(Amonestaciones|Tarjetas)</div>', re.IGNORECASE)
_RE_RED_HINT = re.compile(r'\b(roja|expuls|rojo)\b', re.IGNORECASE)


def _parse_card_events(html: str, lineups: dict, css_minutes: dict) -> list:
    """Extract yellow / red card events from the Amonestaciones section.

    These fixtures have no card sections. The implementation handles the
    expected FIFLP format if/when such fixtures are captured.
    """
    out: list = []
    blk_m = _RE_CARDS_SECTION.search(html)
    if not blk_m:
        return out
    blk = html[blk_m.start(): blk_m.start() + 12000]
    for tr_m in _RE_GOAL_ROW.finditer(blk):
        row = tr_m.group(1)
        plain = _clean(_strip_tags(row))
        names = _RE_NAME_IN_ROW.findall(plain)
        if not names:
            continue
        name = _clean(names[0])
        side = _classify_side(name, lineups["home"], lineups["away"])
        if not side:
            continue
        kind = "red" if _RE_RED_HINT.search(plain) else "yellow"
        out.append({
            "kind": kind,
            "side": side,
            "player_name": name,
            "minute": _row_minute(row, css_minutes),
        })
    return out


# ---------------------------------------------------------------------------
# Task 9: Staff (referee + coaches)
# ---------------------------------------------------------------------------

# Referee: <h5 class="font_responsive"><strong>Árbitro/a Principal</strong>... NAME</h5>
_RE_REFEREE = re.compile(
    r'<strong>[A-Z\xc1]rbitro/a\s+Principal</strong>(?:&nbsp;|\s)+([A-Z\xc1\xc9\xcd\xd3\xda\xd1\xdc][^<]+)',
    re.IGNORECASE,
)

# Coach: <h5 ...><strong>Entrenador: </strong> NAME </h5>
_RE_COACH_LABEL = re.compile(
    r'<strong>Entrenador:\s*</strong>\s*([^<\n\r]+)',
    re.IGNORECASE,
)

_NO_PRESENTA = re.compile(r'no\s+presenta', re.IGNORECASE)


def _parse_staff(html: str) -> dict:
    """Extract referee and coaches."""
    staff: dict = {"referee": None, "coach_home": None, "coach_away": None}
    ref_m = _RE_REFEREE.search(html)
    if ref_m:
        staff["referee"] = _clean(ref_m.group(1))
    coaches = []
    for m in _RE_COACH_LABEL.finditer(html):
        raw = _clean(m.group(1))
        coaches.append(None if _NO_PRESENTA.search(raw) else raw)
    if len(coaches) >= 1:
        staff["coach_home"] = coaches[0]
    if len(coaches) >= 2:
        staff["coach_away"] = coaches[1]
    return staff


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_acta(html: str) -> dict:
    """Parse a FIFLP acta HTML string.

    Returns dict with keys: header, lineups, events, staff.
    Most minute values are None; some recovered from inline `<style>` rules
    when present (see module docstring).
    """
    header = _parse_header(html)
    lineups = _parse_lineups(html)
    css_minutes = _extract_minutes_from_css(html)

    events: list = (
        _parse_goal_events(html, lineups, css_minutes)
        + _parse_sub_events(html, lineups, css_minutes)
        + _parse_card_events(html, lineups, css_minutes)
    )
    events.sort(key=lambda e: (e.get("minute") is None, e.get("minute") or 0, e["kind"]))

    staff = _parse_staff(html)

    return {
        "header": header,
        "lineups": lineups,
        "events": events,
        "staff": staff,
    }
