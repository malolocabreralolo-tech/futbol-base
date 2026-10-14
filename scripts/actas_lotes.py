"""actas_lotes.py — Los ficheros de actas de la federación de una temporada, por lote.

Las actas de alevín van APARTE de las de benjamín y prebenjamín: un raw de actas pesa
unos 20 MB por temporada y el histórico alevín (2019-26) lo duplicaría, cerca del aviso
de GitHub (50 MB por fichero; tope duro, 100 MB). Cada lote tiene su raw, su índice y su
estado:

    lote ''        scripts/fiflp_actas_<S>_raw.json         (benjamín y prebenjamín: los de siempre)
                   scripts/fiflp_actas_<S>_index.json
                   scripts/fiflp_actas_<S>_status.json
    lote 'alevin'  scripts/fiflp_actas_<S>_alevin_raw.json  (alevín de Gran Canaria)
                   scripts/fiflp_actas_<S>_alevin_index.json
                   scripts/fiflp_actas_<S>_alevin_status.json

Los escribe fetch_fiflp_actas.py, cada tanda los de UN lote (los de su cadena de
actas-federacion.yml, una por temporada y lote: dos cadenas nunca escriben el mismo fichero), y
los leen los importadores: import_fiflp_actas importa cada raw por separado (su huella, por
fichero); los que buscan una acta o un grupo de la federación en el índice o en el raw
de la temporada (grupos, goleadores, detalle, escudos) leen los de todos los lotes
juntos (load_merged). Sin ficheros de alevín, todo es exactamente lo de antes.

Los goleadores (fiflp_goleadores_<S>_raw.json) y el detalle (fiflp_detalle_<S>_raw.json)
no se parten: pesan entre 0,1 y 1,3 MB por temporada y alevín no los acerca a ningún
límite (docs/federacion.md).
"""
import json
import os
import re
import unicodedata

# En este orden: el de siempre primero (al importar, al juntar índices y raws).
LOTES = ("", "alevin")
# Un raw de actas de cualquier lote: grupo 1, la temporada; grupo 2, el lote (None = el de siempre).
RAW_FILE = re.compile(r"^fiflp_actas_(\d{4}-\d{4})(?:_(alevin))?_raw\.json$")
KINDS = ("raw", "index", "status")


def _categorias():
    try:
        from scripts import categorias
    except ImportError:
        import categorias
    return categorias


def lote_of(category):
    """'ALEVIN' → 'alevin'; 'BENJAMIN', 'PREBENJAMIN' (o None) → '' (el raw de siempre)."""
    return "alevin" if category == "ALEVIN" else ""


def lote_of_name(name):
    """El lote de una competición por su nombre (el del catálogo o el de la cabecera de un acta,
    con «(GRUPO 7)» detrás), o None si el nombre no dice su categoría. Alevín de otra isla (que la
    web no publica: category_of da None) también es del lote de alevín: nunca va al de siempre."""
    C = _categorias()
    category = C.category_of(name)
    if category:
        return lote_of(category)
    folded = "".join(c for c in unicodedata.normalize("NFD", name or "")
                     if unicodedata.category(c) != "Mn").upper()
    compact = re.sub(r"[\s\-_.]", "", folded)
    if "ALEVIN" in compact and "BENJAMIN" not in compact:
        return "alevin"
    return None


def lotes_of(categories):
    """Los lotes de unas categorías ('BENJAMIN', 'ALEVIN'…), sin repetir y en el orden de LOTES."""
    wanted = {lote_of(c) for c in categories}
    return tuple(lote for lote in LOTES if lote in wanted)


def file_name(season, kind, lote=""):
    """'2025-2026', 'raw', 'alevin' → 'fiflp_actas_2025-2026_alevin_raw.json'."""
    if kind not in KINDS or lote not in LOTES:
        raise ValueError(f"fichero de actas desconocido: {kind!r}, lote {lote!r}")
    return f"fiflp_actas_{season}{'_' + lote if lote else ''}_{kind}.json"


def path(folder, season, kind, lote=""):
    return os.path.join(str(folder), file_name(season, kind, lote))


def lote_of_file(name):
    """El lote de un raw de actas por su nombre ('' o 'alevin'), o None si no es un raw de actas."""
    m = RAW_FILE.match(os.path.basename(str(name)))
    return (m.group(2) or "") if m else None


def raw_files(folder):
    """[(nombre, temporada, lote)] de los raws de actas de `folder`, por temporada y, dentro de cada
    una, el de siempre antes que el de alevín (el orden de importación)."""
    out = []
    for name in os.listdir(folder):
        m = RAW_FILE.match(name)
        if m:
            out.append((name, m.group(1), m.group(2) or ""))
    return sorted(out, key=lambda f: (f[1], LOTES.index(f[2])))


def _load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def load_merged(folder, season, kind):
    """El índice o el raw de actas de la temporada con los de todos los lotes juntos (un dict por
    cod_acta; un índice antiguo en forma de lista, también). Sin ficheros de alevín, el del lote de
    siempre tal cual (las mismas claves en el mismo orden); sin ninguno, {}."""
    if kind not in ("raw", "index"):
        raise ValueError(f"solo se juntan raws e índices, no {kind!r}")
    merged = {}
    for lote in LOTES:
        p = path(folder, season, kind, lote)
        if not os.path.exists(p):
            continue
        data = _load(p)
        if isinstance(data, list):
            data = {str(e["cod_acta"]): e for e in data}
        for cod, value in data.items():
            merged.setdefault(cod, value)
    return merged


def sibling_raw_keys(raw_path):
    """Las claves (cod_acta) de los raws de los OTROS lotes de la misma temporada y carpeta que
    `raw_path`: la purga de huérfanas de un raw no deja sin acta a los partidos cuyas actas están
    en el raw del otro lote. Vacío si el nombre no es el de un raw de actas."""
    m = RAW_FILE.match(os.path.basename(str(raw_path)))
    if not m:
        return set()
    folder, season, mine = os.path.dirname(os.path.abspath(raw_path)), m.group(1), m.group(2) or ""
    keys = set()
    for lote in LOTES:
        p = path(folder, season, "raw", lote)
        if lote != mine and os.path.exists(p):
            keys.update(_load(p).keys())
    return keys


def misplaced(folder):
    """{raw: [cod_acta]} de las actas de `folder` cuya cabecera dice otro lote que el de su raw (las
    que dejó una tanda de antes de partir los raws; las tandas las pasan solas al suyo:
    fetch_fiflp_actas.RawStore). Vacío si todo está en su sitio."""
    out = {}
    for name, _season, lote in raw_files(folder):
        raw = _load(os.path.join(str(folder), name))
        wrong = [cod for cod, acta in raw.items() if isinstance(acta, dict)
                 and lote_of_name((acta.get("header") or {}).get("competition")) not in (None, lote)]
        if wrong:
            out[name] = wrong
    return out
