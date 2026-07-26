#!/usr/bin/env python3
"""Fixer one-shot: funde los equipos que colisionan en el mapa TEAMS_<temporada>.

El contrato C1 del proyecto dice que `TEAMS_<S>` va indexado por
`normalize_for_teams_mapping` (espejo exacto de `normalizeForTeamsMapping` en
state.js) y que esa clave identifica al club: conserva la letra de filial, así
que 'atalaya' y 'atalaya b' son claves distintas. Cuando dos equipos caen en la
MISMA clave, el generador avisa ("clave TEAMS duplicada … gana el último") y en
la web la plantilla de uno de los dos es inalcanzable.

Es la variante "limpia" del problema que arregló fix_nombres_fiflp.py: aquí los
dos nombres están bien escritos, solo que uno lleva el tipo de club y el otro no
('UD Barrial' y 'Barrial', 'CD Ingenio' e 'Ingenio'). Por eso el filtro de
nombre crudo no los veía.

Salvaguarda: si los dos equipos aparecen en la MISMA clasificación son
entidades distintas y no se tocan (con la clave incluyendo la letra de filial,
no debería pasar nunca, pero se comprueba igual).

Gana el nombre de la temporada MÁS RECIENTE (el que se está viendo ahora),
con el número de partidos como desempate.

    python3 scripts/_archive/fix_equipos_colision_teams.py            # informe
    python3 scripts/_archive/fix_equipos_colision_teams.py --write
"""
import argparse
import collections
import os
import sys

_AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_AQUI))
sys.path.insert(0, _AQUI)
from db import get_connection                                       # noqa: E402
from generate_js import normalize_for_teams_mapping as clave_teams  # noqa: E402
from fix_nombres_fiflp import fundir, grupos_de                     # noqa: E402


def colisiones(conn):
    """[(id_que_se_queda, nombre, [(id_que_sobra, nombre), …])]"""
    equipos = [(r[0], r[1]) for r in conn.execute("SELECT id, name FROM teams")]
    por_clave = collections.defaultdict(list)
    for tid, nombre in equipos:
        por_clave[clave_teams(nombre)].append((tid, nombre))

    partidos = dict(conn.execute(
        """SELECT t.id, (SELECT COUNT(*) FROM matches m
                          WHERE m.home_team_id=t.id OR m.away_team_id=t.id)
             FROM teams t"""))
    # Gana el nombre de la temporada MÁS RECIENTE: es el que la gente está
    # viendo ahora mismo, y renombrar la temporada en curso se nota mucho más
    # que unificar las históricas, que ya venían inconsistentes entre sí.
    ultima = dict(conn.execute(
        """SELECT t.id, MAX(se.start_year) FROM teams t
             JOIN standings s ON s.team_id=t.id
             JOIN groups g ON g.id=s.group_id
             JOIN seasons se ON se.id=g.season_id
            GROUP BY t.id"""))

    out = []
    for clave, miembros in sorted(por_clave.items()):
        if len(miembros) < 2:
            continue
        # Dos equipos de la misma clasificación son entidades distintas.
        if any(grupos_de(conn, a) & grupos_de(conn, b)
               for i, (a, _) in enumerate(miembros)
               for b, _ in miembros[i + 1:]):
            continue
        orden = sorted(miembros, key=lambda m: (-ultima.get(m[0], 0),
                                                -partidos.get(m[0], 0), m[1]))
        out.append((orden[0][0], orden[0][1], orden[1:]))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--listar", type=int, default=12)
    args = ap.parse_args()

    conn = get_connection()
    conn.execute("PRAGMA foreign_keys=ON")
    grupos = colisiones(conn)
    antes = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
             for t in ("teams", "matches", "standings", "appearances")}

    total = sum(len(sobran) for _, _, sobran in grupos)
    print(f"{'APLICANDO' if args.write else 'INFORME (nada se escribe)'} · "
          f"{len(grupos)} claves en conflicto, {total} equipos a fundir\n")
    for queda_id, queda, sobran in grupos[:args.listar]:
        print(f"   {queda!r} <- " + ", ".join(repr(n) for _, n in sobran))
    if len(grupos) > args.listar:
        print(f"   … y {len(grupos) - args.listar} claves más")

    if args.write:
        for queda_id, _, sobran in grupos:
            for viejo, _ in sobran:
                fundir(conn, viejo, queda_id)
        conn.commit()
        despues = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                   for t in ("teams", "matches", "standings", "appearances")}
        print("\n" + " · ".join(f"{t}: {antes[t]} -> {despues[t]}" for t in antes))
        print(f"huérfanos: {len(conn.execute('PRAGMA foreign_key_check').fetchall())}")
        print("Regenera con scripts/generate_js.py.")
    else:
        print("\nRepite con --write para aplicarlo.")
    conn.close()


if __name__ == "__main__":
    main()
