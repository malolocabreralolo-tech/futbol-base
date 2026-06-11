#!/usr/bin/env python3
"""
fix-2026-06-11-detach-misreconciled-actas.py — one-shot fixer (2026-06-11, task 3)

Auditados los 253 matches con cod_acta contra el header de su acta en los
scripts/fiflp_actas_<season>_raw.json: 19 actas estaban reconciliadas sobre el
partido EQUIVOCADO. En los 19 casos la competición del header del acta es
incompatible con el grupo del partido (acta de SEGUNDA FASE o COPA DE CAMPEONES
sobre partidos de PRIMERA FASE, incluso actas de BENJAMIN sobre partidos de
PREBENJAMIN) y la fecha difiere entre 7 y 168 días; varios además contradicen
el marcador (ej. acta 171238 'Mesas Huracán A vs Arucas A' 14-04-2024 2-3
escrita sobre el partido 29265 'Las Mesas Hu. vs Arucas C' 19/11 7-2).

NO se tocan los casos en que solo difiere el marcador con fecha/equipos/
competición idénticos: ahí la reconciliación es correcta y la discrepancia es
del parser del header (trunca marcadores de 2 dígitos: db=19-0 vs header=1-0,
confirmado contando los goal-events del acta).

Para cada uno: DELETE de appearances/match_events/match_staff y cod_acta=NULL.
(La tabla goals NO se toca: viene del scrape de resultados, no de actas.)
Idempotente: solo actúa si el match aún tiene ese cod_acta.
"""
import os
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(ROOT, "futbolbase.db")

# (match_id, cod_acta) auditados — temporada 2023-2024
MISRECONCILED = [
    # BENJAMIN PRIMERA FASE GC - Grupo 2 <- actas de SEGUNDA FASE (GRUPO 1)
    (29192, 171237),  # San Nicolás vs Costa Ayala, db 27/10 vs acta 12-04-2024
    (29196, 171201),  # Barrial Atco. vs San Nicolás, db 03/11 vs acta 17-02-2024 (acta de Barrial A)
    (29208, 171210),  # Goleta vs San Nicolás, db 18/11 vs acta 02-03-2024
    (29234, 171254),  # Costa Ayala vs Arucas B, db 13/01 vs acta 02-05-2024 (acta de Arucas A)
    # BENJAMIN PRIMERA FASE GC - Grupo 3 <- actas de SEGUNDA FASE (GRUPO 1)
    (29256, 171211),  # Garepa Viera vs Las Mesas Hu., db 11/11 1-1 vs acta 03-03-2024 4-3
    (29265, 171238),  # Las Mesas Hu. vs Arucas C, db 19/11 7-2 vs acta 14-04-2024 2-3
    # BENJAMIN PRIMERA FASE GC - Grupo 6 <- acta de COPA DE CAMPEONES (GRUPO 3)
    (29452, 173517),  # Veteranos B vs Carnevali B, db 20/01 vs acta 17-05-2024 (acta de Veteranos C)
    # PREBENJAMIN PRIMERA FASE GC - Grupo 1 <- actas de BENJAMIN SEGUNDA FASE (GRUPO 1)
    (29622, 171250),  # Guayarmina vs Goleta, db 24/11 vs acta 03-05-2024
    (29660, 171239),  # Becerril vs Guayarmina, db 26/01 2-7 vs acta 12-04-2024 5-4
    (29670, 171204),  # Guayarmina vs Arucas C, db 09/02 vs acta 16-02-2024
    (29693, 171241),  # Barrial vs Goleta, db 08/03 vs acta 18-04-2024
    (29698, 171199),  # Becerril vs Arucas C, db 08/03 vs acta 11-02-2024
    (29704, 171205),  # Goleta vs Guayarmina, db 17/03 vs acta 24-02-2024
    (29728, 171221),  # Goleta vs Becerril, db 20/04 vs acta 16-03-2024
    (29732, 171257),  # Becerril vs Barrial, db 26/04 vs acta 07-05-2024
    # PREBENJAMIN PRIMERA FASE GC - Grupo 4 <- actas de BENJAMIN (GRUPO 12)
    (30052, 167949),  # Maspalomas vs Maspa Training, db 04/11 0-6 vs acta 09-12-2023 0-8
    (30073, 167936),  # Cerruda vs Maspa Training, db 02/12 vs acta 24-11-2023
    (30110, 167968),  # Maspa Training vs San Pedro, db 03/02 vs acta 20-01-2024
    (30143, 167962),  # Tablero vs Maspa Training, db 14/03 vs acta 13-01-2024
]

CHILD_TABLES = ("appearances", "match_events", "match_staff")

con = sqlite3.connect(DB)
con.execute("PRAGMA foreign_keys=ON")

before = con.execute("SELECT COUNT(*) FROM matches WHERE cod_acta IS NOT NULL").fetchone()[0]
print(f"ANTES: matches con cod_acta: {before}")

detached = 0
with con:
    for mid, cod in MISRECONCILED:
        row = con.execute("SELECT cod_acta FROM matches WHERE id=?", (mid,)).fetchone()
        if row is None:
            print(f"  match {mid}: NO EXISTE — saltado")
            continue
        if row[0] != cod:
            print(f"  match {mid}: cod_acta={row[0]} != {cod} (ya arreglado?) — saltado")
            continue
        counts = []
        for tbl in CHILD_TABLES:
            n = con.execute(f"SELECT COUNT(*) FROM {tbl} WHERE match_id=?", (mid,)).fetchone()[0]
            con.execute(f"DELETE FROM {tbl} WHERE match_id=?", (mid,))
            counts.append(f"{tbl}={n}")
        con.execute("UPDATE matches SET cod_acta=NULL WHERE id=?", (mid,))
        detached += 1
        print(f"  match {mid}: acta {cod} desvinculada ({', '.join(counts)})")

after = con.execute("SELECT COUNT(*) FROM matches WHERE cod_acta IS NOT NULL").fetchone()[0]
print(f"DESPUES: matches con cod_acta: {after} (desvinculadas {detached})")

# verificación: ninguno de los 19 sigue vinculado ni con hijos
for mid, cod in MISRECONCILED:
    r = con.execute("SELECT cod_acta FROM matches WHERE id=?", (mid,)).fetchone()
    assert r is None or r[0] != cod, f"match {mid} sigue con acta {cod}"
    for tbl in CHILD_TABLES:
        n = con.execute(f"SELECT COUNT(*) FROM {tbl} WHERE match_id=?", (mid,)).fetchone()[0]
        assert n == 0, f"match {mid} sigue con {n} filas en {tbl}"
print("OK")
