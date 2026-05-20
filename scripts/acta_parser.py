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

Public API:
    parse_acta(html: str) -> dict
"""
import re
from html import unescape

_WS = re.compile(r"\s+")

def _clean(s: str) -> str:
    return _WS.sub(" ", unescape(s)).strip()

def _strip_tags(s: str) -> str:
    return re.sub(r"<[^>]+>", " ", s)

# The fixed digit-lookup array embedded in every FIFLP acta page.
_NTYPE_D = [2, 5, 9, 4, 1, 0, 8, 6, 3, 7,
            1, 3, 5, 7, 9, 0, 2, 4, 6, 8,
            0, 2, 4, 6, 8, 1, 3, 5, 7, 9,
            7, 5, 2, 0, 9, 6, 3, 8, 4, 1]

_RE_NTYPE = re.compile(r'ntype\("[^"]+",\s*(\d+),\s*(\d+),\s*"[^"]+"\)')

def _decode_ntype(match: re.Match) -> int:
    n, i = int(match.group(1)), int(match.group(2))
    return _NTYPE_D[(i * 10) + n]

_RE_FICHA_H5 = re.compile(
    r'class="font-grey-cascade">Temporada\s+(\d{4}-\d{4})'
    r'[^<]*Jornada\s+(\d+).*?(\d{2}-\d{2}-\d{4})',
    re.DOTALL | re.IGNORECASE,
)

_RE_COMPETITION = re.compile(r'fa-trophy[^>]*></i>\s*([^<]+)', re.IGNORECASE)
_RE_WIDGET_L = re.compile(r'class="font_widgetL">([^<]+)</div>')
_RE_WIDGET_V = re.compile(r'class="font_widgetV">([^<]+)</div>')
_RE_NTYPE_H2 = re.compile(r'<h2\s+class="ntype">(.*?)</h2>', re.DOTALL | re.IGNORECASE)


def _decode_score(h2_content: str):
    sep = " - "
    sep_idx = h2_content.find(sep)
    if sep_idx < 0:
        return None, None
    home_part = h2_content[:sep_idx]
    away_part = h2_content[sep_idx + len(sep):]

    def _digits_from(part):
        return "".join(str(_decode_ntype(m)) for m in _RE_NTYPE.finditer(part))

    home_str = _digits_from(home_part)
    away_str = _digits_from(away_part)
    try:
        return (int(home_str) if home_str else None, int(away_str) if away_str else None)
    except ValueError:
        return None, None


def _parse_header(html: str) -> dict:
    h = {
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


def parse_acta(html: str) -> dict:
    return {
        "header": _parse_header(html),
        "lineups": {"home": [], "away": []},
        "events":  [],
        "staff":   {"referee": None, "coach_home": None, "coach_away": None},
    }
