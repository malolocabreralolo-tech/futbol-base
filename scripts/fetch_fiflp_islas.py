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
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_fiflp_2425 as F

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

SEASON = os.environ.get("ISLAS_SEASON", "19")
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

if __name__ == "__main__":
    print(f"Temporada {SEASON} · {len(F.COMPETITIONS)} competiciones · "
          f"salida {os.path.basename(F.OUTPUT_PATH)}")
    F.main()
