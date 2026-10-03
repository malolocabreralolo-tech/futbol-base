#!/usr/bin/env python3
"""Vacía los marcadores de 2026-27 leídos con el lector de FIFLP anterior al
3/10/2026, que descartaba el texto visible cuando había un dígito pintado por
CSS ('2<i class="fa-1">', que se ve «21», salía 1). update_fiflp.py los vuelve a
leer con el lector nuevo (un marcador vacío siempre se rellena). Una sola vez."""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from db import get_connection

conn = get_connection()
n = conn.execute("""UPDATE matches SET home_score=NULL, away_score=NULL
    WHERE home_score IS NOT NULL AND group_id IN (
      SELECT g.id FROM groups g JOIN seasons s ON s.id=g.season_id
      WHERE s.name='2026-2027' AND g.url LIKE '%fiflp.com%')""").rowcount
conn.commit()
conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
conn.close()
print(f"{n} marcadores vacíos")
