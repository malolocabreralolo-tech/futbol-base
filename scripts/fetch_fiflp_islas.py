#!/usr/bin/env python3
"""Scrape FIFLP de las ligas y copas INSULARES (Lanzarote y Fuerteventura) de
temporadas anteriores, que el portal no tiene.

Wayback nunca archivó las fases isleñas de 2021-22 / 2022-23 / 2023-24, pero
FIFLP sí las conserva: están en el catálogo (scripts/fiflp_comps_catalog.json).
De ahí salen los IDs de abajo. La Copa de Campeones 2023-24 se dio por
"irrecuperable" en su día por el mismo motivo equivocado (se probó Wayback) y
acabó importándose sin problema desde FIFLP, así que toca comprobarlo.

Reusa el scraper de 2024-25 sin tocarlo (auto-descubrimiento de grupos,
clasificaciones y jornadas + parser de knockouts + lectura robusta del marcador)
monkeypatcheando sus globales, igual que fetch_fiflp_cups_2324.py.

Escribe scripts/fiflp_islas_<temporada>_raw.json y NO toca la DB: el import es
un paso LOCAL aparte contra el raw, para aislar en Actions la única parte con
incertidumbre externa.

Uso:
    ISLAS_SEASON=19 python3 scripts/fetch_fiflp_islas.py
    ISLAS_SEASON=19 SCRAPE_IDS=1328,1330 python3 scripts/fetch_fiflp_islas.py
    ISLAS_SEASON=22 python3 scripts/fetch_fiflp_islas.py   # 2026-27, IDs del catálogo
    ISLAS_SEASON=22 SCRAPE_IDS=54977017 python3 …          # solo esa (se añade al raw de la tanda)
    ISLAS_SEASON=22al python3 scripts/fetch_fiflp_islas.py # alevín de Gran Canaria de 2026-27

En las temporadas del catálogo (CATALOG_SEASONS), la tanda elige la categoría
(categorias.category_of): '22' es benjamín y prebenjamín y '22al' (sufijo «al»),
alevín de Gran Canaria, en su propio raw (fiflp_islas_22al_raw.json), sin sala ni
alevín de Lanzarote o Fuerteventura. FIFLP_CATS ('alevin,benjamin') la cambia.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_fiflp_2425 as F
from categorias import DEFAULT_CATEGORIES, category_of, parse_categories, web_key

# CodTemporada -> competiciones insulares de benjamín/prebenjamín (fútbol 7/8,
# nada de sala). Tomadas del catálogo FIFLP por season_code.
COMPS_BY_SEASON = {
    # 2021-2022
    "17": [
        {"id": "892", "name": "Benjamin Lanzarote Preferente", "cat": "benjamin", "island": "lanzarote", "phase": "Preferente"},
        {"id": "894", "name": "Benjamin Lanzarote Primera", "cat": "benjamin", "island": "lanzarote", "phase": "Primera"},
        {"id": "895", "name": "Benjamin Fuerteventura", "cat": "benjamin", "island": "fuerteventura", "phase": "Liga"},
        {"id": "896", "name": "Copa Benjamin Fuerteventura", "cat": "benjamin", "island": "fuerteventura", "phase": "Copa"},
        {"id": "971", "name": "Copa Delegacion Benjamin Lanzarote", "cat": "benjamin", "island": "lanzarote", "phase": "Copa Delegacion"},
    ],
    # 2022-2023
    "18": [
        {"id": "1093", "name": "Benjamin Lanzarote Preferente", "cat": "benjamin", "island": "lanzarote", "phase": "Preferente"},
        {"id": "1095", "name": "Benjamin Lanzarote Primera", "cat": "benjamin", "island": "lanzarote", "phase": "Primera"},
        {"id": "1096", "name": "Benjamin Fuerteventura", "cat": "benjamin", "island": "fuerteventura", "phase": "Liga"},
        {"id": "1097", "name": "Copa Benjamin Fuerteventura", "cat": "benjamin", "island": "fuerteventura", "phase": "Copa"},
        {"id": "1128", "name": "Copa Delegacion Benjamin Fuerteventura", "cat": "benjamin", "island": "fuerteventura", "phase": "Copa Delegacion"},
    ],
    # 2021-2022 — ligas de GRAN CANARIA. Wayback dejó huecos que se dieron por
    # "techo" (GC7 78/156, GC5 132/156, PGC2/PGC3 132/182) sin haber probado
    # FIFLP. Se scrapean para COMPARAR: el import solo rellena, nunca pisa.
    "17gc": [
        {"id": "891", "name": "Benjamin GC Preferente", "cat": "benjamin", "island": "grancanaria", "phase": "Preferente GC"},
        {"id": "893", "name": "Benjamin GC Primera", "cat": "benjamin", "island": "grancanaria", "phase": "Primera Fase GC"},
        {"id": "897", "name": "Prebenjamin GC", "cat": "prebenjamin", "island": "grancanaria", "phase": "Gran Canaria"},
    ],
    # 2022-2023 — mismas ligas de Gran Canaria
    "18gc": [
        {"id": "1092", "name": "Benjamin GC Preferente", "cat": "benjamin", "island": "grancanaria", "phase": "Preferente GC"},
        {"id": "1094", "name": "Benjamin GC Primera", "cat": "benjamin", "island": "grancanaria", "phase": "Primera Fase GC"},
        {"id": "1098", "name": "Prebenjamin GC", "cat": "prebenjamin", "island": "grancanaria", "phase": "Gran Canaria"},
    ],
    # 2023-2024 — Segunda Fase de Gran Canaria, que no archivó nadie
    "19gc": [
        {"id": "1329", "name": "Benjamin GC Primera", "cat": "benjamin", "island": "grancanaria", "phase": "Primera Fase GC"},
        {"id": "1333", "name": "Prebenjamin GC", "cat": "prebenjamin", "island": "grancanaria", "phase": "Gran Canaria"},
        {"id": "1439", "name": "Benjamin GC Segunda Fase", "cat": "benjamin", "island": "grancanaria", "phase": "Segunda Fase GC"},
        {"id": "1445", "name": "Torneo Cierre Prebenjamin", "cat": "prebenjamin", "island": "grancanaria", "phase": "Torneo Cierre"},
    ],
    # 2025-2026 — Segunda Fase de Gran Canaria. El portal publica un GRUPO 4 en
    # las fases A y B que la base nunca fichó (solo tenía A1-A3 y B1-B3 con la
    # C completa hasta C4). Sus clasificaciones sí se pudieron sacar del portal,
    # pero el calendario no: futbolaspalmas solo sirve la jornada en curso y la
    # liga terminó en mayo. FIFLP conserva las jornadas.
    "21gc": [
        {"id": "54422953", "name": "Benjamin GC Fase Liga A", "cat": "benjamin", "island": "grancanaria", "phase": "Segunda Fase A"},
        {"id": "54422954", "name": "Benjamin GC Fase Liga B", "cat": "benjamin", "island": "grancanaria", "phase": "Segunda Fase B"},
    ],
    # 2025-2026 — competiciones insulares que futbolaspalmas NO publica. El
    # portal solo sirve prebenjamín de Gran Canaria (1prebenjamin1-3; del 4 en
    # adelante da 404) y de benjamín isleño solo una fase por isla, así que
    # estas cuatro solo pueden venir de FIFLP.
    "21isl": [
        {"id": "54422886", "name": "Benjamin Lanzarote Fase 2", "cat": "benjamin", "island": "lanzarote", "phase": "Lanzarote Fase 2"},
        {"id": "54422887", "name": "Benjamin Fuerteventura 1a Fase", "cat": "benjamin", "island": "fuerteventura", "phase": "Fuerteventura Fase 1"},
        {"id": "54422959", "name": "Prebenjamin Lanzarote", "cat": "prebenjamin", "island": "lanzarote", "phase": "Lanzarote"},
        {"id": "54422889", "name": "Prebenjamin Fuerteventura", "cat": "prebenjamin", "island": "fuerteventura", "phase": "Fuerteventura"},
    ],
    # 2024-2025 — copas insulares de Lanzarote, nunca importadas
    "20": [
        {"id": "1657", "name": "Copa Cabildo Lanzarote Preferente", "cat": "benjamin", "island": "lanzarote", "phase": "Copa Cabildo Preferente Lanzarote"},
        {"id": "1682", "name": "Copa Cabildo Lanzarote Primera", "cat": "benjamin", "island": "lanzarote", "phase": "Copa Cabildo Primera Lanzarote"},
        {"id": "1731", "name": "Torneo Cierre Prebenjamin FV-LZ", "cat": "prebenjamin", "island": "lanzarote", "phase": "Torneo Cierre"},
    ],
    # 2023-2024
    "19": [
        {"id": "1328", "name": "Benjamin Lanzarote Preferente", "cat": "benjamin", "island": "lanzarote", "phase": "Preferente"},
        {"id": "1330", "name": "Benjamin Lanzarote Primera", "cat": "benjamin", "island": "lanzarote", "phase": "Primera"},
        {"id": "1331", "name": "Benjamin Fuerteventura", "cat": "benjamin", "island": "fuerteventura", "phase": "Fase 1"},
        {"id": "1442", "name": "Benjamin Fuerteventura Fase 2", "cat": "benjamin", "island": "fuerteventura", "phase": "Fase 2"},
        {"id": "1434", "name": "Prebenjamin Fuerteventura", "cat": "prebenjamin", "island": "fuerteventura", "phase": "Fuerteventura"},
        {"id": "1332", "name": "Copa Benjamin Fuerteventura", "cat": "benjamin", "island": "fuerteventura", "phase": "Copa"},
        {"id": "1407", "name": "Copa Cabildo Lanzarote Preferente", "cat": "benjamin", "island": "lanzarote", "phase": "Copa Cabildo Preferente"},
        {"id": "1432", "name": "Copa Cabildo Lanzarote Primera", "cat": "benjamin", "island": "lanzarote", "phase": "Copa Cabildo Primera"},
    ],
}

# Temporada en curso o recién publicada: los IDs aún no se conocen al escribir
# el código, así que salen del catálogo (discover_fiflp_comps.py) por nombre.
CATALOG_SEASONS = {"22": "2026-2027"}


def _fold(text):
    import unicodedata
    return "".join(ch for ch in unicodedata.normalize("NFD", text)
                   if unicodedata.category(ch) != "Mn").upper()


def comps_from_catalog(season_name, catalog=None, categories=DEFAULT_CATEGORIES):
    """Competiciones de fútbol 7/8 de las categorías dadas ('BENJAMIN', 'ALEVIN'…; por
    defecto benjamín y prebenjamín) de una temporada del catálogo FIFLP, según
    categorias.category_of: nada de sala ni de alevín de Lanzarote o Fuerteventura. La
    fase provisional es el nombre de FIFLP; el import decide la fase que ve la web."""
    if catalog is None:
        import json
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "fiflp_comps_catalog.json")
        with open(path, encoding="utf-8") as f:
            catalog = json.load(f)
    comps = []
    for c in (catalog.get(season_name) or {}).get("all", []):
        cat = category_of(c["name"])
        if cat not in categories:
            continue
        name = _fold(c["name"])
        island = ("lanzarote" if "LANZAROTE" in name else
                  "fuerteventura" if "FUERTEVENTURA" in name else "grancanaria")
        comps.append({"id": c["id"], "name": c["name"], "cat": web_key(cat),
                      "island": island, "phase": c["name"]})
    return comps


def tanda_categories(key, env=None):
    """Las categorías de una tanda del catálogo: '22al' alevín; '22', benjamín y prebenjamín;
    FIFLP_CATS manda sobre las dos."""
    env = os.environ if env is None else env
    if env.get("FIFLP_CATS"):
        return parse_categories(env["FIFLP_CATS"])
    return ("ALEVIN",) if key.endswith("al") else DEFAULT_CATEGORIES


SEASON = os.environ.get("ISLAS_SEASON", "19")
_code = re.sub(r"\D", "", SEASON)
if SEASON not in COMPS_BY_SEASON and _code in CATALOG_SEASONS and SEASON in (_code, _code + "al"):
    COMPS_BY_SEASON[SEASON] = comps_from_catalog(CATALOG_SEASONS[_code], categories=tanda_categories(SEASON))
if SEASON not in COMPS_BY_SEASON:
    sys.exit(f"ISLAS_SEASON={SEASON!r} no soportada. Opciones: "
             f"{', '.join(sorted(COMPS_BY_SEASON))}")

# La clave puede llevar sufijo ('17gc' = temporada 17, tanda de Gran Canaria)
# para separar lotes de la misma temporada en raws distintos. El CodTemporada
# que entiende FIFLP son solo los dígitos.
F.SEASON = re.sub(r"\D", "", SEASON)
F.OUTPUT_PATH = os.path.join(F.PROJECT_ROOT, "scripts",
                             f"fiflp_islas_{SEASON}_raw.json")

_ids = os.environ.get("SCRAPE_IDS", "")
_comps = COMPS_BY_SEASON[SEASON]
F.COMPETITIONS = ([c for c in _comps if c["id"] in _ids.split(",")]
                  if _ids else _comps)

def drop_empty_groups(path):
    """El scraper reanuda saltándose los grupos ya guardados, también los que
    se guardaron VACÍOS porque FIFLP no sirvió el desplegable a tiempo (pasó con
    el prebenjamín 2026-27: «0J» en tres grupos que tenían 26 jornadas). Se
    quitan antes de reanudar para que se vuelvan a intentar."""
    import json
    if not os.path.exists(path):
        return 0
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    kept = [g for g in data if g.get("jornadas") or g.get("standings")]
    if len(kept) != len(data):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(kept, f, ensure_ascii=False, indent=2)
    return len(data) - len(kept)


if __name__ == "__main__":
    print(f"Temporada {SEASON} · {len(F.COMPETITIONS)} competiciones · "
          f"salida {os.path.basename(F.OUTPUT_PATH)}")
    vacios = drop_empty_groups(F.OUTPUT_PATH)
    if vacios:
        print(f"{vacios} grupos vacíos del raw se vuelven a intentar")
    F.main()
