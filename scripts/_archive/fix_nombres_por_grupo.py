#!/usr/bin/env python3
"""Fixer one-shot: dentro de un grupo, la clasificación y el calendario tienen
que nombrar a los equipos igual.

FIFLP escribe la letra de filial en la tabla pero no en el calendario
('CORRALEJO B, C.D. "B"' arriba, 'CORRALEJO, C.D. "B"' en los partidos), así
que el mismo equipo entra dos veces en el mismo grupo: uno con clasificación y
sin partidos, otro con partidos y sin clasificación. En la web, ese equipo abre
su ficha vacía y su columna de forma sale en blanco.

NO se fusionan los equipos globalmente: 'Maspalomas B' puede ser un filial de
verdad en otro grupo. Lo que se hace es LOCAL — repuntar los partidos de ESTE
grupo al equipo que sí está en su clasificación. El equipo fantasma solo se
borra si se queda sin ninguna referencia en toda la base.

Salvaguarda: si los dos nombres aparecen en la MISMA clasificación, son equipos
distintos y no se toca nada.

    python3 scripts/_archive/fix_nombres_por_grupo.py            # informe
    python3 scripts/_archive/fix_nombres_por_grupo.py --write
"""
import argparse
import os
import sys

_AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_AQUI))
from db import get_connection                       # noqa: E402
from fiflp_names import match_teams                 # noqa: E402


def desajustes(conn):
    """[(season, code, group_id, [(id_fantasma, nombre, id_bueno, nombre)])]"""
    out = []
    for gid, code, temporada in conn.execute(
            """SELECT g.id, g.code, se.name FROM groups g
                 JOIN seasons se ON se.id=g.season_id ORDER BY se.start_year, g.code"""):
        tabla = {r[1]: r[0] for r in conn.execute(
            """SELECT t.id, t.name FROM standings s JOIN teams t ON t.id=s.team_id
               WHERE s.group_id=?""", (gid,))}
        calendario = {r[1]: r[0] for r in conn.execute(
            """SELECT DISTINCT t.id, t.name FROM matches m
               JOIN teams t ON t.id IN (m.home_team_id, m.away_team_id)
               WHERE m.group_id=?""", (gid,))}
        if not tabla or not calendario:
            continue
        huerfanos = [n for n in tabla if n not in calendario]
        fantasmas = [n for n in calendario if n not in tabla]
        if not huerfanos or not fantasmas:
            continue
        # match_teams ya rechaza letras de filial distintas ('A' vs 'B').
        parejas = match_teams(fantasmas, huerfanos)
        if parejas:
            out.append((temporada, code, gid,
                        [(calendario[f], f, tabla[b], b) for f, b in parejas.items()]))
    return out


def repuntar(conn, gid, fantasma, bueno):
    """Los partidos de ESTE grupo pasan del equipo fantasma al de la tabla."""
    # Si el emparejamiento ya existe con el nombre bueno, la fila del fantasma
    # chocaría con la clave única: se descarta.
    conn.execute(
        """DELETE FROM matches WHERE group_id=? AND id IN (
             SELECT m.id FROM matches m JOIN matches o
               ON o.group_id=m.group_id AND o.jornada=m.jornada AND o.id<>m.id
              AND o.home_team_id = CASE WHEN m.home_team_id=? THEN ? ELSE m.home_team_id END
              AND o.away_team_id = CASE WHEN m.away_team_id=? THEN ? ELSE m.away_team_id END
             WHERE m.home_team_id=? OR m.away_team_id=?)""",
        (gid, fantasma, bueno, fantasma, bueno, fantasma, fantasma))
    for col in ("home_team_id", "away_team_id"):
        conn.execute(f"UPDATE OR IGNORE matches SET {col}=? WHERE group_id=? AND {col}=?",
                     (bueno, gid, fantasma))


def sin_referencias(conn, tid):
    for tabla, col in (("standings", "team_id"), ("matches", "home_team_id"),
                       ("matches", "away_team_id"), ("scorers", "team_id"),
                       ("appearances", "team_id")):
        fila = conn.execute(
            f"SELECT 1 FROM {tabla} WHERE {col}=? LIMIT 1", (tid,)).fetchone()
        if fila:
            return False
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    conn = get_connection()
    conn.execute("PRAGMA foreign_keys=ON")
    casos = desajustes(conn)
    total = sum(len(p) for _, _, _, p in casos)
    print(f"{'APLICANDO' if args.write else 'INFORME (nada se escribe)'} · "
          f"{len(casos)} grupos, {total} equipos desacoplados\n")
    for temporada, code, gid, parejas in casos:
        print(f"   {temporada} {code}:")
        for fid, fn, bid, bn in parejas:
            print(f"      calendario {fn!r} -> tabla {bn!r}")
            if args.write:
                repuntar(conn, gid, fid, bid)

    if args.write:
        conn.commit()
        borrados = 0
        for _, _, _, parejas in casos:
            for fid, _, _, _ in parejas:
                if sin_referencias(conn, fid):
                    conn.execute("DELETE FROM teams WHERE id=?", (fid,))
                    borrados += 1
        conn.commit()
        print(f"\n{total} repuntados · {borrados} equipos fantasma borrados "
              f"· huérfanos: {len(conn.execute('PRAGMA foreign_key_check').fetchall())}")
        print("Regenera con scripts/generate_js.py.")
    else:
        print("\nRepite con --write para aplicarlo.")
    conn.close()


if __name__ == "__main__":
    main()
