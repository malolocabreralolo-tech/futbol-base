#!/usr/bin/env python3
"""Fixer one-shot: arregla en la BASE las filas con puntos imposibles.

`generate_js._repair_incoherent_points` ya las corrige AL PUBLICAR, así que la
web sale bien, pero la fuente de verdad sigue mal y el generador avisa en cada
pasada. Este script aplica exactamente la misma regla a la base, para que lo
almacenado y lo publicado digan lo mismo.

La regla, igual que en el generador: si la fila cuadra consigo misma
(`played == G + E + P`, así que `3*G + E` es de fiar) pero sus puntos se
desvían más de lo que explicaría una sanción, se reescribe SOLO ese campo y se
reordena el grupo. NO se recalcula la tabla desde los partidos: la tabla
almacenada suele ser MÁS completa que el calendario (lleva la última jornada y
las derrotas por incomparecencia, que no aparecen como partidos), y recalcular
regresaría a los demás equipos. Esa lección costó cara en junio de 2026.

    python3 scripts/_archive/fix_puntos_imposibles.py            # informe
    python3 scripts/_archive/fix_puntos_imposibles.py --write
"""
import argparse
import os
import sys

_AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_AQUI))
from db import get_connection                                   # noqa: E402
from generate_js import _SANCTION_TOLERANCE                     # noqa: E402


def imposibles(conn):
    return conn.execute(
        """SELECT s.id, se.name, g.code, g.id, t.name, s.points, s.won, s.drawn
             FROM standings s JOIN teams t ON t.id=s.team_id
             JOIN groups g ON g.id=s.group_id JOIN seasons se ON se.id=g.season_id
            WHERE s.played = s.won + s.drawn + s.lost
              AND ABS(s.points - (3 * s.won + s.drawn)) > ?
            ORDER BY se.start_year, g.code""", (_SANCTION_TOLERANCE,)).fetchall()


def reordenar(conn, group_id):
    """Renumera el grupo con el orden canónico: pts, DF, GF, nombre."""
    filas = conn.execute(
        """SELECT s.id FROM standings s JOIN teams t ON t.id=s.team_id
            WHERE s.group_id=? ORDER BY s.points DESC, s.gd DESC, s.gf DESC, t.name""",
        (group_id,)).fetchall()
    for pos, (sid,) in enumerate(filas, 1):
        conn.execute("UPDATE standings SET position=? WHERE id=?", (pos, sid))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    conn = get_connection()
    filas = imposibles(conn)
    print(f"{'APLICANDO' if args.write else 'INFORME (nada se escribe)'} · "
          f"{len(filas)} filas\n")
    grupos = set()
    for sid, temporada, code, gid, equipo, pts, g, e in filas:
        print(f"   {temporada} {code:6} {equipo:18} {pts:3}pts -> {3 * g + e:3} "
              f"({g}G {e}E)")
        grupos.add(gid)
        if args.write:
            conn.execute("UPDATE standings SET points=? WHERE id=?", (3 * g + e, sid))
    if args.write:
        for gid in grupos:
            reordenar(conn, gid)
        conn.commit()
        print(f"\n{len(filas)} filas corregidas, {len(grupos)} grupos reordenados.")
        print("Regenera con scripts/generate_js.py.")
    elif filas:
        print("\nRepite con --write para aplicarlo.")
    conn.close()


if __name__ == "__main__":
    main()
