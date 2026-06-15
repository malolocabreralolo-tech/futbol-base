#!/usr/bin/env python3
"""Scrape FIFLP Copa de Campeones 2025-26 (benjamín + prebenjamín).

Reuses the 2024-25 scraper unchanged (group/standings/jornada auto-discovery +
the knockout-aware match parser) by monkeypatching its module globals: season
21 (2025-26) and the cup comp IDs discovered 2026-06-15 from the FIFLP catalog:

  54968356  COPA CAMPEONES BENJAMÍN      (single comp; in 2024-25 it was 5 — A-E)
  54969313  COPA CAMPEONES PREBENJAMIN

Writes scripts/fiflp_cups_2526_raw.json (separate from the 2425 raw). Does NOT
touch the DB — a separate LOCAL import step consumes the raw JSON, so the
uncertain FIFLP scrape is isolated to GitHub Actions while import/synth/publish
stay local and testable.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_fiflp_2425 as F

F.SEASON = "21"  # CodTemporada 2025-2026
F.OUTPUT_PATH = os.path.join(F.PROJECT_ROOT, "scripts", "fiflp_cups_2526_raw.json")
F.COMPETITIONS = [
    {"id": "54968356", "name": "Copa Campeones Benjamin",
     "cat": "benjamin", "island": "grancanaria", "phase": "Copa de Campeones"},
    {"id": "54969313", "name": "Copa Campeones Prebenjamin",
     "cat": "prebenjamin", "island": "grancanaria", "phase": "Copa de Campeones"},
]

if __name__ == "__main__":
    F.main()
