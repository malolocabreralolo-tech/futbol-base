#!/usr/bin/env python3
"""
fix-2026-06-11-null-corrupt-scores.py — one-shot fixer (2026-06-11 cleanup, task 2)

24 partidos de 2024-2025 tienen away_score corrupto (27240-41736: el parser
anti-ofuscación de fetch_fiflp_2425.py capturó IDs del DOM como goles; el
máximo marcador legítimo en toda la DB es 41). Regla del proyecto: un marcador
solo vale si AMBOS lados están presentes → se ponen home_score y away_score a
NULL en esas filas.

Además parchea scripts/fiflp_2425_raw.json poniendo 'as': null en las entradas
corruptas (>50) para que un re-import no las reintroduzca (import_fiflp_2425.py
solo persiste el marcador si hs Y as son not None, líneas 158-161; dejar
'hs' tal cual replica el patrón de parse parcial ya existente en el fichero).

Idempotente.
"""
import json
import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(ROOT, "futbolbase.db")
RAW = os.path.join(ROOT, "scripts", "fiflp_2425_raw.json")

THRESHOLD = 50  # máximo legítimo observado en la DB: 41

con = sqlite3.connect(DB)
con.execute("PRAGMA foreign_keys=ON")

rows = con.execute(
    "SELECT id, home_score, away_score FROM matches "
    "WHERE home_score > ? OR away_score > ? ORDER BY id",
    (THRESHOLD, THRESHOLD),
).fetchall()
print(f"ANTES: {len(rows)} partidos con marcador > {THRESHOLD}:")
for r in rows:
    print(f"  match {r[0]}: {r[1]}-{r[2]}")

if rows:
    with con:
        cur = con.execute(
            "UPDATE matches SET home_score = NULL, away_score = NULL "
            "WHERE home_score > ? OR away_score > ?",
            (THRESHOLD, THRESHOLD),
        )
        print(f"filas actualizadas en DB: {cur.rowcount}")
else:
    print("DB ya limpia.")

mx = con.execute(
    "SELECT MAX(home_score), MAX(away_score) FROM matches"
).fetchone()
print(f"DESPUES: max(home_score)={mx[0]}, max(away_score)={mx[1]}")
assert (mx[0] or 0) <= 41 and (mx[1] or 0) <= 41, "siguen quedando marcadores absurdos"

# --- raw JSON ---
if not os.path.exists(RAW):
    sys.exit("fiflp_2425_raw.json no encontrado")
with open(RAW, encoding="utf-8") as f:
    data = json.load(f)

patched = 0
for comp in data:
    for jor in comp.get("jornadas", []):
        for m in jor.get("matches", []):
            a = m.get("as")
            if isinstance(a, int) and a > THRESHOLD:
                print(f"  raw: {comp['competition_name']} {comp['group_name']} J{jor['num']} "
                      f"{m.get('home')} vs {m.get('away')}: as={a} -> null")
                m["as"] = None
                patched += 1
            h = m.get("hs")
            if isinstance(h, int) and h > THRESHOLD:
                print(f"  raw: hs corrupto {h} -> null en {m.get('home')} vs {m.get('away')}")
                m["hs"] = None
                patched += 1

print(f"entradas parcheadas en raw: {patched}")
if patched:
    with open(RAW, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# verificación raw
with open(RAW, encoding="utf-8") as f:
    data = json.load(f)
remaining = sum(
    1
    for comp in data
    for jor in comp.get("jornadas", [])
    for m in jor.get("matches", [])
    if (isinstance(m.get("as"), int) and m["as"] > THRESHOLD)
    or (isinstance(m.get("hs"), int) and m["hs"] > THRESHOLD)
)
print(f"DESPUES raw: entradas con marcador > {THRESHOLD}: {remaining}")
assert remaining == 0
print("OK")
