#!/usr/bin/env python3
"""Fixer one-shot: reescribe los nombres de equipo en los data-lineups-*.js que
la base ya no puede regenerar.

Las temporadas 2022-23 y 2024-25 tienen **0 actas en la base** (se perdieron o
nunca se reimportaron), así que `generate_js.py` no reescribe sus
`data-lineups-*.js`: los publicados son de una generación anterior y ahí siguen,
sirviendo alineaciones que la DB ya no respalda.

La fusión de equipos duplicados (fix_nombres_fiflp.py) renombró equipos que esos
ficheros congelados siguen nombrando a la vieja usanza. La clave de LINEUPS es
`"<local>|<visitante>|<goles>"`, así que un nombre desactualizado deja el partido
sin alineación en el modal — sin fallar ni avisar.

    python3 scripts/_archive/fix_lineups_renombrados.py            # informe
    python3 scripts/_archive/fix_lineups_renombrados.py --write
"""
import argparse
import glob
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db import get_connection, PROJECT_ROOT                          # noqa: E402
from fiflp_names import team_key, team_score, MIN_TEAM_SCORE         # noqa: E402


def nombres_en_claves(texto):
    """Equipos que aparecen en las claves '<local>|<visitante>|<goles>'."""
    out = set()
    for local, visitante in re.findall(r'"([^"|]+)\|([^"|]+)\|[^"]*"', texto):
        out.add(local)
        out.add(visitante)
    return out


def mejor_equivalente(nombre, vivos):
    clave = team_key(nombre)
    mejor = (0.0, None)
    for v in vivos:
        s = team_score(clave, team_key(v))
        if s > mejor[0]:
            mejor = (s, v)
    return mejor if mejor[0] >= MIN_TEAM_SCORE else (0.0, None)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    conn = get_connection()
    # El destino tiene que ser el nombre que usa ESA temporada en sus partidos:
    # es el que el frontend compone para buscar la clave de LINEUPS. Un nombre
    # equivalente de otra temporada puntuaría igual y no casaría.
    por_temporada = {}
    for nombre, sid in conn.execute("SELECT name, id FROM seasons"):
        por_temporada[nombre] = [r[0] for r in conn.execute(
            """SELECT DISTINCT t.name FROM matches m
               JOIN teams t ON t.id IN (m.home_team_id, m.away_team_id)
               JOIN groups g ON g.id=m.group_id WHERE g.season_id=?""", (sid,))]
    conn.close()

    total = 0
    for ruta in sorted(glob.glob(os.path.join(PROJECT_ROOT, "data-lineups-*.js"))):
        temporada = re.search(r'data-lineups-(\d{4}-\d{4})\.js', ruta).group(1)
        vivos = por_temporada.get(temporada, [])
        texto = open(ruta, encoding="utf-8").read()
        muertos = sorted(n for n in nombres_en_claves(texto) if n not in vivos)
        if not muertos:
            continue
        print(f"\n{os.path.basename(ruta)}:")
        cambios = []
        for n in muertos:
            score, nuevo = mejor_equivalente(n, vivos)
            if not nuevo:
                print(f"   {n!r}: SIN equivalente en la base — se deja")
                continue
            veces = texto.count(f"\"{n}|") + texto.count(f"|{n}|")
            print(f"   {n!r} -> {nuevo!r}  ({score:.2f}, {veces} claves)")
            cambios.append((n, nuevo))
        for viejo, nuevo in cambios:
            # Solo dentro de la clave, delimitado por comilla o barra: así no se
            # toca ningún nombre de jugador ni de campo.
            texto = texto.replace(f'"{viejo}|', f'"{nuevo}|')
            texto = texto.replace(f'|{viejo}|', f'|{nuevo}|')
        total += len(cambios)
        if args.write and cambios:
            open(ruta, "w", encoding="utf-8").write(texto)

    if not total:
        print("Nada que arreglar.")
    elif args.write:
        print(f"\n{total} equipos reescritos. Bump manual de ?v= y CACHE_NAME.")
    else:
        print(f"\n{total} equipos a reescribir. Repite con --write.")


if __name__ == "__main__":
    main()
