#!/usr/bin/env python3
"""wayback_portal.py — Lectores de las páginas ANTIGUAS de futbolaspalmas.com (2012-13 a
2018-19) que guarda el Wayback Machine. Funciones puras sobre el HTML, probadas con
páginas reales (scripts/tests/fixtures/wayback/). Tres formatos:

  F2015  página de grupo de 2015-16 a 2018-19 (/1benjaminN/primera-benjamin-grupo-N-…html):
         el calendario completo con resultados (filas de 7 celdas td.fecha2015 | hora2015 |
         local2015 | goles ×2 | visitante2015 | campo2015, tras una fila «JORNADA N») y la
         clasificación, en tabla (td.orden | td.nombrex | td.jugados | td.datos ×6 | td.puntos,
         hasta 2017-18) o en divs dentro de div#mostrar_clasi (2018-19).
  ACAL   calendarioN.php de 2013-14 y 2014-15: filas tr.brillo de 8 celdas
         [jornada, dd/mm/aaaa, hora, local, goles local, goles visitante, visitante, campo]; un
         campo «R» marca un resultado administrativo (contra un equipo retirado).
  AZT    ztorneo*-N.php de 2012-13 a 2014-15: la tabla «CLASIFICACION» (pos | escudo | nombre |
         J G E P GF GC | Ptos, sin diferencia de goles).

Los goleadores de esas temporadas no se archivaron (se cargaban por AJAX): no hay lector.
La temporada de una página se deduce de las fechas de sus partidos, nunca de la fecha de la
captura (las de septiembre aún enseñan la anterior).
"""
import re
from collections import Counter
from html import unescape

_TAGS = re.compile(r"<[^>]+>")


def decode(raw):
    """Bytes de la página → texto (UTF-8 desde 2015-16; cp1252 sin charset antes)."""
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("cp1252", errors="replace")


def clean(fragment):
    return re.sub(r"\s+", " ", unescape(_TAGS.sub(" ", fragment or ""))).replace("\xa0", " ").strip()


def norm_date(text):
    """'05/10/2013' o '02-10-2015' → '2013-10-05'; None si no es una fecha."""
    nums = re.findall(r"\d+", text or "")
    if len(nums) >= 3 and len(nums[2]) == 4:
        d, m, y = int(nums[0]), int(nums[1]), int(nums[2])
        if 1 <= d <= 31 and 1 <= m <= 12:
            return f"{y:04d}-{m:02d}-{d:02d}"
    return None


def norm_time(text):
    """'17:30:00' o '9:00' → '17:30' / '09:00'; '' si no hay hora."""
    m = re.search(r"(\d{1,2}):(\d{2})", text or "")
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else ""


def _score(a, b):
    try:
        return int(str(a).strip()), int(str(b).strip())
    except ValueError:
        return None, None


def season_of(date_iso):
    """'2015-10-02' → '2015-2016' (la temporada va de agosto a julio)."""
    y, m = int(date_iso[:4]), int(date_iso[5:7])
    return f"{y}-{y + 1}" if m >= 8 else f"{y - 1}-{y}"


def season_of_matches(jornadas):
    """La temporada de la mayoría de los partidos, o None sin partidos con fecha."""
    seasons = Counter(season_of(m["date"]) for ms in jornadas.values() for m in ms if m.get("date"))
    return seasons.most_common(1)[0][0] if seasons else None


# ── F2015: calendario de la página de grupo ───────────────────────────────────

def matches_f2015(html):
    """{número de jornada: [partidos]} del calendario de una página de grupo de 2015-16 a 2018-19.
    Cada partido: {date, time, home, away, hs, as, venue}. Lo que repite la caja «FINAL DE LIGA»
    (la última jornada otra vez) se descarta."""
    from fetch_futbolaspalmas import MatchParser
    parser = MatchParser()
    parser.feed(html)
    out, current = {}, None
    for cells in parser.rows:
        if len(cells) == 1:
            m = re.match(r"\s*JORNADA\s+(\d+)", cells[0], re.I)
            if m:
                current = int(m.group(1))
                out.setdefault(current, [])
        elif len(cells) == 7 and current is not None:
            date = norm_date(cells[0])
            home, away = clean(cells[2]), clean(cells[5])
            if not date or not home or not away:
                continue
            hs, as_ = _score(cells[3], cells[4])
            match = {"date": date, "time": norm_time(cells[1]), "home": home, "away": away,
                     "hs": hs, "as": as_, "venue": clean(cells[6]) or None}
            if all((m["home"], m["away"]) != (home, away) for m in out[current]):
                out[current].append(match)
    return {j: ms for j, ms in sorted(out.items()) if ms}


def standings_f2015(html):
    """[[pos, equipo, pts, J, G, E, P, GF, GC, DF]] de la clasificación de una página de grupo:
    la tabla (td.orden/nombrex/jugados/datos/puntos) o, si no la hay, los divs de
    div#mostrar_clasi. Solo el primer bloque (alguna página la repite)."""
    return _standings_table(html) or _standings_divs(html)


def _standings_table(html):
    rows = []
    for tr in re.findall(r"(?is)<tr[^>]*>(.*?)</tr>", html):
        if not re.search(r"class=[\"']nombrex[\"']", tr):
            continue
        cells = [(c, clean(v)) for c, v in re.findall(r"(?is)<td class=[\"']([^\"']+)[\"'][^>]*>(.*?)</td>", tr)]
        try:
            pos = int(next(v for c, v in cells if c == "orden"))
            name = next(v for c, v in cells if c == "nombrex")
            played = int(next(v for c, v in cells if c == "jugados"))
            datos = [int(v) for c, v in cells if c == "datos"]
            pts = int(next(v for c, v in cells if c == "puntos"))
        except (StopIteration, ValueError):
            continue
        if len(datos) < 6 or not name:
            continue
        if rows and pos <= rows[-1][0]:
            break
        g, e, p, gf, gc, df = datos[:6]
        rows.append([pos, name, pts, played, g, e, p, gf, gc, df])
    return rows


def _standings_divs(html):
    i = html.find('id="mostrar_clasi"')
    seg = html[i:] if i >= 0 else html
    rows = []
    for blk in re.split(r'<div class="orden\d*"', seg)[1:]:
        pos = re.match(r"[^>]*>\s*(\d+)\s*<", blk)
        name = re.search(r"(?s)width:(?:29|30)%[^>]*>(.*?)</div>", blk)
        if not (pos and name):
            continue
        tail = blk[name.end():].split('<div style="width:100%')[0]
        vals = [clean(v) for v in re.findall(r'(?s)<div style="width:\d+%[^>]*>(.*?)</div>', tail)]
        ints = [int(v) for v in vals if re.fullmatch(r"[+-]?\d+", v)]
        if len(ints) >= 8:
            played, g, e, p, gf, gc, df, pts = ints[:8]
        elif len(ints) == 7:
            played, g, e, p, gf, gc, pts = ints
            df = gf - gc
        else:
            continue
        if rows and int(pos.group(1)) <= rows[-1][0]:
            break
        rows.append([int(pos.group(1)), clean(name.group(1)), pts, played, g, e, p, gf, gc, df])
    return rows


# ── ACAL y AZT: 2012-13 a 2014-15 ─────────────────────────────────────────────

def matches_calendar(html):
    """{número de jornada: [partidos]} de calendarioN.php (2013-14 y 2014-15). Un resultado
    administrativo (campo «R») lleva admin=True y sin campo."""
    out = {}
    for tr in re.findall(r'(?s)<tr class="brillo">(.*?)</tr>', html):
        cells = [clean(x) for x in re.findall(r"(?s)<td[^>]*>(.*?)</td>", tr)]
        if len(cells) != 8:
            continue
        try:
            jornada = int(cells[0])
        except ValueError:
            continue
        date = norm_date(cells[1])
        if not date or not cells[3] or not cells[6]:
            continue
        hs, as_ = _score(cells[4], cells[5])
        admin = cells[7].strip().upper() == "R"
        match = {"date": date, "time": norm_time(cells[2]), "home": cells[3], "away": cells[6],
                 "hs": hs, "as": as_, "venue": None if admin else (cells[7] or None)}
        if admin:
            match["admin"] = True
        out.setdefault(jornada, []).append(match)
    return dict(sorted(out.items()))


def standings_old(html):
    """[[pos, equipo, pts, J, G, E, P, GF, GC, DF]] de la tabla «CLASIFICACION» de 2012-13 a
    2014-15 (sin DF en la página: se calcula)."""
    k = html.find(">CLASIFICACION<")
    if k < 0:
        return []
    table = html[html.rfind("<table", 0, k):html.find("</table>", k)]
    rows = []
    for tr in re.findall(r"(?s)<tr[^>]*>(.*?)</tr>", table):
        if 'class="orden"' not in tr:
            continue
        vals = [v for v in (clean(x) for x in re.findall(r"(?s)<td[^>]*>(.*?)</td>", tr)) if v]
        try:
            pos, name = int(vals[0]), vals[1]
            played, g, e, p, gf, gc, pts = (int(v) for v in vals[2:9])
        except (ValueError, IndexError):
            continue
        rows.append([pos, name, pts, played, g, e, p, gf, gc, gf - gc])
    return rows


def team_name(raw):
    """El nombre del portal sin sus marcas de sanción o retirada («Goleta Labr.B *»,
    «A.D. Huracán ®», «*Las Majoreras B») ni espacios dobles."""
    name = re.sub(r"[*®]+", " ", raw or "")
    return re.sub(r"\s+", " ", name).strip()


def title_of(html):
    m = re.search(r"(?is)<title>\s*(.*?)\s*</title>", html or "")
    return clean(m.group(1)) if m else ""
