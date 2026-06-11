#!/usr/bin/env python3
"""
fix-2026-06-11-dedupe-ff-matches.py — one-shot fixer (2026-06-11 cleanup, task 1)

Los grupos FF1-FF23 de 2025-2026 (benjamín, season_id=1) tienen cada partido
DOS veces: una pasada de import con jornada 'N' + fecha DD/MM y otra con
'Jornada N' + fecha ISO. El resto de la temporada 2025-2026 usa 'Jornada N'
(2354 partidos no-FF, 0 con etiqueta desnuda), así que se CONSERVA la copia
'Jornada N' y se borra la copia 'N' (que además no tiene hijos ni cod_acta).

Idempotente: si no quedan duplicados no hace nada.
"""
import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(ROOT, "futbolbase.db")

CHILD_TABLES = ("goals", "appearances", "match_events", "match_staff")

con = sqlite3.connect(DB)
con.execute("PRAGMA foreign_keys=ON")

DUP_PAIRS_SQL = """
SELECT COUNT(*) FROM matches m1
JOIN matches m2 ON m1.group_id = m2.group_id
 AND m1.home_team_id = m2.home_team_id AND m1.away_team_id = m2.away_team_id
 AND m1.id < m2.id
JOIN groups g ON g.id = m1.group_id
WHERE g.season_id = 1 AND g.code LIKE 'FF%'
"""

# Copia a borrar: etiqueta desnuda 'N' cuyo gemelo 'Jornada N' existe en el grupo.
DOOMED_SQL = """
SELECT m.id FROM matches m
JOIN groups g ON g.id = m.group_id
WHERE g.season_id = 1 AND g.code LIKE 'FF%'
  AND m.jornada NOT LIKE 'Jornada%'
  AND EXISTS (
    SELECT 1 FROM matches k
    WHERE k.group_id = m.group_id
      AND k.home_team_id = m.home_team_id AND k.away_team_id = m.away_team_id
      AND k.jornada = 'Jornada ' || m.jornada
  )
"""

before_pairs = con.execute(DUP_PAIRS_SQL).fetchone()[0]
before_total = con.execute(
    "SELECT COUNT(*) FROM matches m JOIN groups g ON g.id=m.group_id "
    "WHERE g.season_id=1 AND g.code LIKE 'FF%'"
).fetchone()[0]
doomed = [r[0] for r in con.execute(DOOMED_SQL)]
print(f"ANTES: partidos FF={before_total}, pares duplicados={before_pairs}, copias 'N' a borrar={len(doomed)}")

# Evidencia: los pares deben tener marcador idéntico (mismo partido, no ida/vuelta)
diff_scores = con.execute("""
SELECT COUNT(*) FROM matches m1
JOIN matches m2 ON m1.group_id = m2.group_id
 AND m1.home_team_id = m2.home_team_id AND m1.away_team_id = m2.away_team_id
 AND m1.id < m2.id
JOIN groups g ON g.id = m1.group_id
WHERE g.season_id = 1 AND g.code LIKE 'FF%'
  AND (m1.home_score IS NOT m2.home_score OR m1.away_score IS NOT m2.away_score)
""").fetchone()[0]
print(f"Pares con marcador distinto entre copias: {diff_scores} (esperado 0)")
if diff_scores:
    sys.exit("ABORT: hay pares con marcadores distintos; revisar a mano.")

if not doomed:
    print("Nada que hacer (ya dedupeado).")
    sys.exit(0)

with con:
    ph = ",".join("?" * len(doomed))
    for tbl in CHILD_TABLES:
        n = con.execute(f"SELECT COUNT(*) FROM {tbl} WHERE match_id IN ({ph})", doomed).fetchone()[0]
        if n:
            con.execute(f"DELETE FROM {tbl} WHERE match_id IN ({ph})", doomed)
        print(f"  hijos borrados en {tbl}: {n}")
    cur = con.execute(f"DELETE FROM matches WHERE id IN ({ph})", doomed)
    print(f"  partidos borrados: {cur.rowcount}")

after_pairs = con.execute(DUP_PAIRS_SQL).fetchone()[0]
after_total = con.execute(
    "SELECT COUNT(*) FROM matches m JOIN groups g ON g.id=m.group_id "
    "WHERE g.season_id=1 AND g.code LIKE 'FF%'"
).fetchone()[0]
print(f"DESPUES: partidos FF={after_total}, pares duplicados={after_pairs}")
assert after_pairs == 0, "siguen quedando pares duplicados"
assert after_total == before_total - len(doomed)
print("OK")
