#!/usr/bin/env python3
"""Fixer one-shot: borra los grupos duplicados de 2021-22.

Los slugs de futbolaspalmas (`1benjaminN`, `1prebenjaminN`) se renumeran entre
snapshots del archivo, así que el mismo grupo se importó dos veces con códigos
distintos:

    GC7  = GC5  con menos resultados (mismos 156 emparejamientos, 78 vs 132
           jugados, cero discrepancias de marcador)
    PGC3 = PGC2 clavado (mismos 182 emparejamientos, mismos 132 jugados)

Verificado también contra FIFLP (sonda 17gc): Primera GC 2021-22 tenía 5 grupos
y Prebenjamín 2, no 6 y 3.

El grupo fantasma duplica sus partidos en todos los recuentos, mete una liga que
no existió en el selector y sale en la web como un grupo más. Se queda el que
más resultados tiene; a igualdad, el de código menor.

    python3 scripts/_archive/fix_grupos_duplicados_2122.py            # informe
    python3 scripts/_archive/fix_grupos_duplicados_2122.py --write

El guardián permanente es test_db_sanity.py::test_no_duplicate_groups.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db import get_connection, delete_group          # noqa: E402

SEASON = "2021-2022"
MIN_SOLAPE = 0.9


def fixtures(conn, gid):
    return set(conn.execute(
        "SELECT jornada, home_team_id, away_team_id FROM matches WHERE group_id=?",
        (gid,)).fetchall())


def played(conn, gid):
    return conn.execute(
        "SELECT COUNT(*) FROM matches WHERE group_id=? AND home_score IS NOT NULL",
        (gid,)).fetchone()[0]


def duplicate_pairs(conn, season_id):
    grupos = []
    for gid, code in conn.execute(
            "SELECT id, code FROM groups WHERE season_id=? ORDER BY code", (season_id,)):
        f = fixtures(conn, gid)
        if len(f) >= 10:
            grupos.append((code, gid, f))
    pares = []
    for i, a in enumerate(grupos):
        for b in grupos[i + 1:]:
            comun = len(a[2] & b[2])
            if comun and comun / min(len(a[2]), len(b[2])) >= MIN_SOLAPE:
                # Se queda el que más resultados tiene; a igualdad, código menor.
                orden = sorted((a, b), key=lambda g: (-played(conn, g[1]), g[0]))
                pares.append((orden[0], orden[1], comun))
    return pares


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    conn = get_connection()
    conn.execute("PRAGMA foreign_keys=ON")
    row = conn.execute("SELECT id FROM seasons WHERE name=?", (SEASON,)).fetchone()
    if not row:
        sys.exit(f"No existe la temporada {SEASON}")
    season_id = row[0]

    pares = duplicate_pairs(conn, season_id)
    if not pares:
        print("Sin duplicados. Nada que hacer.")
        return
    for queda, sobra, comun in pares:
        print(f"  {SEASON}: {sobra[0]} ({played(conn, sobra[1])}j) es duplicado de "
              f"{queda[0]} ({played(conn, queda[1])}j) — {comun} emparejamientos "
              f"comunes · {'BORRANDO' if args.write else 'se borraría'} {sobra[0]}")
        if args.write:
            delete_group(conn, sobra[1])
    if args.write:
        conn.commit()
        print("\nHecho. Regenera con scripts/generate_js.py.")
    else:
        print("\nInforme: repite con --write para aplicarlo.")
    conn.close()


if __name__ == "__main__":
    main()
