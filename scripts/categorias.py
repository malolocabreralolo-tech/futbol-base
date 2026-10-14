"""categorias.py — La categoría de una competición de la federación (o de una liga de la
app de futbolaspalmas) por su nombre, en UN solo sitio.

Antes cada importador tenía su copia («PREBENJAMIN si lo dice, si no BENJAMIN») y alevín
caía en benjamín: un grupo alevín con los mismos clubes que uno de benjamín se casaba con
él y le escribía sus goleadores, sus actas o sus estados. Ahora todos preguntan aquí:

    category_of(nombre) -> 'ALEVIN' | 'PREBENJAMIN' | 'BENJAMIN' | None

None es «no se publica»: fútbol sala (también la liga «LPFS»), alevín de Lanzarote y
Fuerteventura (fuera del alcance de la web: solo alevín de Gran Canaria, fútbol 7/8) y
cualquier competición que no diga su categoría. Los nombres de la base son los de
categories.name, en mayúsculas; las claves de la web, en minúsculas (DB_NAME).
"""
import re
import unicodedata

# Clave de la web (manifiestos, --categorias, data-*.js) → nombre en la tabla categories.
DB_NAME = {"benjamin": "BENJAMIN", "prebenjamin": "PREBENJAMIN", "alevin": "ALEVIN"}
# Lo que descargan e importan los scripts si no se les dice otra cosa: alevín se pide a propósito.
DEFAULT_CATEGORIES = ("BENJAMIN", "PREBENJAMIN")
# Islas de las que no se publica alevín.
ALEVIN_FUERA = ("LANZAROTE", "FUERTEVENTURA")


def _fold(text):
    """Mayúsculas sin tildes."""
    return "".join(c for c in unicodedata.normalize("NFD", text or "")
                   if unicodedata.category(c) != "Mn").upper()


def category_of(name):
    """'ALEVIN', 'PREBENJAMIN', 'BENJAMIN' o None (ver el docstring del módulo). Lee el nombre del
    catálogo ('LIGA ALEVIN GRAN CANARIA FASE PREVIA'), el de la cabecera de un acta (con
    '(GRUPO 7)' detrás) o el de una liga de la app ('Liga Alevin Gran Canaria Grupo 1')."""
    n = _fold(name)
    if not n or re.search(r"\bSALA\b|\bLPFS\b", n):
        return None
    compact = re.sub(r"[\s\-_.]", "", n)        # 'PRE-BENJAMIN', 'PRE BENJAMIN'
    if "PREBENJAMIN" in compact:
        return "PREBENJAMIN"
    if "BENJAMIN" in compact:
        return "BENJAMIN"
    if "ALEVIN" in compact:
        return None if any(isla in n for isla in ALEVIN_FUERA) else "ALEVIN"
    return None


def parse_categories(text):
    """'benjamin,prebenjamin' (la entrada de un workflow o de --categorias) → ('BENJAMIN',
    'PREBENJAMIN'), en ese orden y sin repetir; vacío, las de siempre (DEFAULT_CATEGORIES). Una
    categoría que no existe aborta: mejor parar que bajar de más o de menos."""
    out = []
    for part in (text or "").split(","):
        key = _fold(part.strip()).lower()
        if not key:
            continue
        if key.upper() in DB_NAME.values():
            key = key.lower()
        if key not in DB_NAME:
            raise ValueError(f"categoría desconocida: {part.strip()} (valen {', '.join(DB_NAME)})")
        if DB_NAME[key] not in out:
            out.append(DB_NAME[key])
    return tuple(out) or DEFAULT_CATEGORIES


def web_key(db_name):
    """'ALEVIN' → 'alevin' (la clave de la web)."""
    return (db_name or "").lower()
