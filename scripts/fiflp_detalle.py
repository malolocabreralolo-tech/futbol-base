#!/usr/bin/env python3
"""fiflp_detalle.py — Lectores de las páginas de la federación (FIFLP) que dan el
detalle que no traen las actas ni los calendarios. Funciones puras sobre el HTML,
probadas con muestras reales (scripts/tests/fixtures/detalle/):

  parse_clasificacion(html)  NFG_VisClasificacion: cada fila con el código del
                             equipo en la federación (codequipo), los partidos en
                             casa y fuera por separado, los últimos resultados y
                             los puntos de sanción.
  parse_directorio(html)     NFG_LstDirectorioEquipos (un grupo): por equipo, su
                             código, el escudo, los colores de la equipación
                             (camiseta, pantalón y medias) y su campo (código,
                             nombre y superficie). Los datos de contacto que
                             publica la federación (persona, dirección y
                             teléfono) NO se leen: son datos personales y la
                             base y los raws van a un repositorio público.
  parse_campo(html)          NFG_VisCampos: coordenadas, dirección, código
                             postal, superficie, instalaciones (vallado, sala
                             antidopaje, despacho arbitral, internet), foto y los
                             equipos que juegan o entrenan allí.

La clasificación oficial no está ofuscada (las cifras van en claro), así que se
lee del HTML sin aplanar.
"""
import re
from html import unescape

_TAGS = re.compile(r"<[^>]+>")


def _text(fragment):
    """Texto visible de un trozo de HTML, con los espacios normalizados."""
    t = unescape(_TAGS.sub(" ", fragment or "")).replace("\xa0", " ")
    return re.sub(r"\s+", " ", t).strip()


def _int(value):
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


# ── Clasificación ─────────────────────────────────────────────────────────────

_ROW = re.compile(r"(?is)<tr[^>]*>(.*?)</tr>")
_CELL = re.compile(r"(?is)<td[^>]*>(.*?)</td>")
_CODEQUIPO = re.compile(r"codequipo=(\d+)")


def parse_clasificacion(html):
    """Filas de la tabla DETALLADA (casa/fuera) de la clasificación.

    La página trae dos tablas con los mismos equipos: la detallada (16 o 17
    celdas por fila) y la resumida (10 u 11). Se lee la detallada; si no está
    (algunas copas), la resumida, sin el reparto casa/fuera.

    Celdas de la detallada (17 si lleva la columna de puntos por partido):
      '' pos equipo [pts/pj] pts  Jc Gc Ec Pc  Jf Gf Ef Pf  F C  últimos  sanción
    """
    best, best_n = [], 0
    for table in re.findall(r"(?is)<table[^>]*>(.*?)</table>", html or ""):
        rows = []
        for row in _ROW.findall(table):
            cells = _CELL.findall(row)
            code = _CODEQUIPO.search(row)
            if len(cells) in (10, 11, 16, 17) and code:
                rows.append((cells, code.group(1)))
        detailed = rows and len(rows[0][0]) in (16, 17)
        # La detallada gana a la resumida aunque tengan las mismas filas.
        score = len(rows) * (2 if detailed else 1)
        if score > best_n:
            best, best_n = rows, score
    out = []
    for cells, code in best:
        tx = [_text(c) for c in cells]
        pos = _int(tx[1])
        team = tx[2]
        if pos is None or not team:
            continue
        nc = len(cells)
        base = 5 if nc in (17, 11) else 4
        pts = _int(tx[base - 1])
        # Los últimos resultados van como letras sueltas (G, E, P).
        form = "".join(re.findall(r"\b([GEP])\b", tx[-2].upper()))
        row = {"pos": pos, "team": team, "codequipo": int(code), "pts": pts,
               "form": form, "sanction": _int(tx[-1]) or 0}
        if nc in (16, 17):
            home = [_int(v) for v in tx[base:base + 4]]
            away = [_int(v) for v in tx[base + 4:base + 8]]
            row.update({
                "home": dict(zip(("j", "g", "e", "p"), home)),
                "away": dict(zip(("j", "g", "e", "p"), away)),
                "j": (home[0] or 0) + (away[0] or 0), "g": (home[1] or 0) + (away[1] or 0),
                "e": (home[2] or 0) + (away[2] or 0), "p": (home[3] or 0) + (away[3] or 0),
                "gf": _int(tx[base + 8]), "gc": _int(tx[base + 9]),
            })
        else:
            row.update(dict(zip(("j", "g", "e", "p"), (_int(v) for v in tx[base:base + 4]))))
            row.update({"gf": None, "gc": None})
        out.append(row)
    return out


# ── Directorio de equipos ─────────────────────────────────────────────────────

_KIT = {"camiseta": "shirt", "pantalon": "shorts", "medias": "socks"}


def parse_directorio(html):
    """[{codequipo, team, crest, shirt, shorts, socks, venue_code, venue, surface}]
    de la página del directorio filtrada por un grupo. Sin datos de contacto."""
    out = []
    cards = re.split(r'(?i)<div class="card"', html or "")[1:]
    for card in cards:
        head = re.search(r'(?is)<a class="more"[^>]*href="[^"]*codequipo=(\d+)[^"]*"[^>]*>(.*?)</a>', card)
        if not head:
            continue
        entry = {"codequipo": int(head.group(1)), "team": _text(head.group(2))}
        crest = re.search(r'(?i)<img src="([^"]*/Clubes/[^"]+)"', card)
        entry["crest"] = unescape(crest.group(1)) if crest else None
        for img, key in _KIT.items():
            m = re.search(rf'(?is)equipo_{img}\.png"[^>]*>(.*?)</h5>', card)
            entry[key] = _text(m.group(1)) if m else None
        field = re.search(r'(?is)<b>Campo:</b>\s*<a[^>]*Codigo_Campo=(\d+)[^>]*>(.*?)</a>(.*?)</h5>', card)
        if field:
            entry["venue_code"] = int(field.group(1))
            entry["venue"] = _text(field.group(2))
            entry["surface"] = _text(field.group(3)).lstrip("- ").strip() or None
        else:
            entry.update({"venue_code": None, "venue": None, "surface": None})
        out.append(entry)
    return out


# ── Ficha de campo ────────────────────────────────────────────────────────────

_YES_NO = {"si": True, "sí": True, "no": False}


def _label(html, label):
    m = re.search(rf"(?is)<b>\s*{label}:?\s*</b>(.*?)</h5>", html or "")
    return _text(m.group(1)) if m else None


def _team_list(html, title):
    m = re.search(rf"(?is){title}:.*?<tbody>(.*?)</tbody>", html or "")
    if not m:
        return []
    return [t for t in (_text(s) for s in re.findall(r"(?is)<span[^>]*>(.*?)</span>", m.group(1))) if t]


def parse_campo(html):
    """Ficha de un campo; None si la página no es una ficha (vacía o de error)."""
    name = re.search(r'(?is)<h4 class="la_roja_regular_titulo1">(.*?)</h4>', html or "")
    code = _label(html, "Código")
    if not name or not code:
        return None
    loc = re.search(r"q=loc:(-?\d+(?:\.\d+)?)\+(-?\d+(?:\.\d+)?)", html)
    lat, lon = (float(loc.group(1)), float(loc.group(2))) if loc else (None, None)
    # Sin coordenadas la federación escribe 0+0: no es un sitio.
    if lat is not None and abs(lat) < 1e-6 and abs(lon) < 1e-6:
        lat = lon = None
    photo = re.search(r'(?is)</h4>\s*<img src="([^"]+)"', html)
    photo = unescape(photo.group(1)) if photo else None
    if photo and "campo_generico" in photo:
        photo = None
    facilities = {}
    for label, key in (("Vallado", "fenced"), ("Sala antidopaje", "doping_room"),
                       ("Despacho Arbitral", "referee_room"), ("Internet", "internet")):
        value = _label(html, label)
        facilities[key] = _YES_NO.get((value or "").lower())
    address = (_label(html, "Dirección") or "").rstrip(", ").strip() or None
    return {
        "code": _int(code), "name": _text(name.group(1)),
        "lat": lat, "lon": lon, "address": address,
        "city": _label(html, "Localidad"), "province": _label(html, "Provincia"),
        "postal_code": _label(html, "Código Postal"), "surface": _label(html, "Superficie de juego"),
        "photo": photo, **facilities,
        "teams": _team_list(html, "Equipos en Competición"),
        "training": _team_list(html, "Equipos en Entrenamiento"),
    }
