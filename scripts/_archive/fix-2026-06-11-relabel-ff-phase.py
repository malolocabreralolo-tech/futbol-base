#!/usr/bin/env python3
"""
fix-2026-06-11-relabel-ff-phase.py — one-shot fixer (2026-06-11 cleanup, task 5)

Los 23 grupos FF1-FF23 de 2025-2026 están etiquetados phase='Fase Final GC'
pero son la PRIMERA FASE de octubre-noviembre. Evidencia (rama b del análisis):
  - Fechas de sus partidos (tras dedupe): 2025-10-10 a 2025-11-08; las
    Segunda Fase A/B/C arrancan el 2025-11-26/28 → FF es ANTERIOR, no final.
  - URLs de los grupos: benjamin-primera-fase-uno ... -veintitres.
  - Las propias actas de FF1 dicen 'LIGA BENJAMIN FASE PREVIA F-7 GRAN CANARIA'.
  - NO son duplicados de otros grupos: solo 3 de 325 partidos FF tienen un
    (home,away,score) idéntico en otro grupo 2025-2026 (<1%, coincidencias) →
    se descarta borrar los grupos (rama a).
  - En 2024-2025 la fase equivalente se llama 'Primera Fase GC' (14 grupos).

Se actualiza groups.phase a 'Primera Fase GC' y full_name
'BENJAMIN FASE FINAL GC - GRUPO N' → 'BENJAMIN PRIMERA FASE GC - GRUPO N'.
Los codes FF1-FF23 NO se tocan (claves de los data-*.js). Idempotente.
"""
import os
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(ROOT, "futbolbase.db")

con = sqlite3.connect(DB)
con.execute("PRAGMA foreign_keys=ON")

rows = con.execute(
    "SELECT id, code, phase, full_name FROM groups "
    "WHERE season_id=1 AND code LIKE 'FF%' ORDER BY id"
).fetchall()
mislabeled = [r for r in rows if r[2] == 'Fase Final GC']
print(f"ANTES: grupos FF={len(rows)}, con phase='Fase Final GC'={len(mislabeled)}")

if mislabeled:
    with con:
        cur = con.execute(
            "UPDATE groups SET phase='Primera Fase GC', "
            "full_name=REPLACE(full_name, 'FASE FINAL', 'PRIMERA FASE') "
            "WHERE season_id=1 AND code LIKE 'FF%' AND phase='Fase Final GC'"
        )
        print(f"grupos actualizados: {cur.rowcount}")
else:
    print("Nada que hacer.")

after = con.execute(
    "SELECT COUNT(*) FROM groups WHERE season_id=1 AND phase='Fase Final GC'"
).fetchone()[0]
sample = con.execute(
    "SELECT code, phase, full_name FROM groups WHERE season_id=1 AND code='FF1'"
).fetchone()
print(f"DESPUES: grupos 2025-2026 con phase='Fase Final GC': {after} | FF1 -> {sample}")
assert after == 0
print("OK")
