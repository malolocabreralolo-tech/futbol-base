#!/usr/bin/env python3
"""
fix-2026-06-11-delete-self-match.py — one-shot fixer (2026-06-11 cleanup, task 4)

Partido imposible id=724079 (FV11 2024-2025, jornada 4, 16/11): STEAUA DE
TIRAJANA 4-5 STEAUA DE TIRAJANA (home_team_id = away_team_id = 254). Producto
del mismo import defectuoso de 2024-25. Se borra con sus hijos (no tiene).

Por seguridad solo borra partidos donde home_team_id = away_team_id.
Idempotente.
"""
import os
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(ROOT, "futbolbase.db")

CHILD_TABLES = ("goals", "appearances", "match_events", "match_staff")

con = sqlite3.connect(DB)
con.execute("PRAGMA foreign_keys=ON")

rows = con.execute(
    "SELECT id, group_id, jornada, date, home_team_id, home_score, away_score "
    "FROM matches WHERE home_team_id = away_team_id"
).fetchall()
print(f"ANTES: partidos equipo-contra-sí-mismo: {len(rows)}")
for r in rows:
    print(f"  {r}")

if rows:
    ids = [r[0] for r in rows]
    ph = ",".join("?" * len(ids))
    with con:
        for tbl in CHILD_TABLES:
            n = con.execute(f"SELECT COUNT(*) FROM {tbl} WHERE match_id IN ({ph})", ids).fetchone()[0]
            if n:
                con.execute(f"DELETE FROM {tbl} WHERE match_id IN ({ph})", ids)
            print(f"  hijos borrados en {tbl}: {n}")
        cur = con.execute(f"DELETE FROM matches WHERE id IN ({ph})", ids)
        print(f"  partidos borrados: {cur.rowcount}")
else:
    print("Nada que hacer.")

after = con.execute("SELECT COUNT(*) FROM matches WHERE home_team_id = away_team_id").fetchone()[0]
print(f"DESPUES: partidos equipo-contra-sí-mismo: {after}")
assert after == 0
print("OK")
