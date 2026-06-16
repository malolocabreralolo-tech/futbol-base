#!/usr/bin/env python3
"""Scrape FIFLP Copa de Campeones 2023-24 (benjamín + prebenjamín de Gran Canaria).

Reuses the 2024-25 scraper unchanged (group/standings/jornada auto-discovery +
the knockout-aware match parser + robust H2 score reader) by monkeypatching its
module globals: season 19 (2023-2024) and the cup comp IDs from the FIFLP catalog
(scripts/fiflp_comps_catalog.json, season_code 19):

  1229  COPA DE CAMPEONES BENJAMIN GRAN CANARIA
  1230  COPA DE CAMPEONES PREBENJAMIN GRAN CANARIA

Writes scripts/fiflp_cups_2324_raw.json (separate from the 2324 league raw). Does
NOT touch the DB — a separate LOCAL import step consumes the raw JSON, so the
uncertain FIFLP scrape is isolated to GitHub Actions while import/synth/publish
stay local and testable (mismo patrón que las copas 2025-26).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_fiflp_2425 as F

F.SEASON = "19"  # CodTemporada 2023-2024
F.OUTPUT_PATH = os.path.join(F.PROJECT_ROOT, "scripts", "fiflp_cups_2324_raw.json")
F.COMPETITIONS = [
    {"id": "1229", "name": "Copa Campeones Benjamin",
     "cat": "benjamin", "island": "grancanaria", "phase": "Copa de Campeones"},
    {"id": "1230", "name": "Copa Campeones Prebenjamin",
     "cat": "prebenjamin", "island": "grancanaria", "phase": "Copa de Campeones"},
]

if __name__ == "__main__":
    F.main()
