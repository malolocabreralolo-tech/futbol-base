#!/usr/bin/env python3
"""Fixer one-shot: funde los equipos que entraron con el nombre crudo de FIFLP
con el que ya tenía la base.

Los importadores de FIFLP anteriores a 2026-07-26 escribían el nombre tal cual
lo da la federación ('TABLERO A, C.D. "A"', 'ACODETTI C.F "A"') sin reconciliar
con el que usa el portal ('Tablero', 'Acodetti'). Resultado: el mismo club
partido en dos equipos distintos. El duplicado se queda sin escudo (data-shields
.js va por nombre normalizado), rompe el histórico entre temporadas del modal de
equipo y parte sus goles y partidos en dos fichas.

Reglas de seguridad:
  - Solo se funde si la reconciliación por tokens (fiflp_names) da >= UMBRAL.
  - NUNCA se funden dos equipos que aparecen en la MISMA clasificación: ahí son
    entidades distintas por definición.
  - La letra de filial no se colapsa nunca ('Arucas' != 'Arucas B').
  - Antes de repuntar, se detectan las colisiones de clave única (dos filas del
    mismo partido, una con cada grafía) y se descarta la del duplicado.

    python3 scripts/_archive/fix_nombres_fiflp.py            # informe
    python3 scripts/_archive/fix_nombres_fiflp.py --write
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db import get_connection                                    # noqa: E402
from fiflp_names import team_key, team_score, MIN_TEAM_SCORE     # noqa: E402

# Nombre "crudo": lleva la puntuación de la federación.
CRUDO = re.compile(r'"|, ?C\.|, ?U\.|, ?A\.|, ?S\.|C\.F|C\.D|U\.D|A\.D|S\.D|F\.C')
# Más exigente que el umbral general: aquí se borra una fila, no se elige un
# grupo, y un error deja dos clubes fundidos para siempre.
UMBRAL = 0.85

REFERENCIAS = [                       # (tabla, columna)
    ("standings", "team_id"),
    ("matches", "home_team_id"),
    ("matches", "away_team_id"),
    ("scorers", "team_id"),
    ("appearances", "team_id"),
    ("match_events", "team_id"),
    ("match_staff", "team_id"),
]


def tabla_existe(conn, nombre):
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (nombre,)
    ).fetchone() is not None


def grupos_de(conn, team_id):
    return {r[0] for r in conn.execute(
        "SELECT group_id FROM standings WHERE team_id=?", (team_id,))}


def parejas(conn):
    """[(id_crudo, nombre_crudo, id_bueno, nombre_bueno, score)] a fundir."""
    equipos = [(r[0], r[1]) for r in conn.execute("SELECT id, name FROM teams")]
    crudos = [(i, n) for i, n in equipos if CRUDO.search(n)]
    limpios = [(i, n) for i, n in equipos if not CRUDO.search(n)]
    claves = {i: team_key(n) for i, n in equipos}
    out = []
    for i, n in crudos:
        mejor = (0.0, None, None)
        for j, m in limpios:
            s = team_score(claves[i], claves[j])
            if s > mejor[0]:
                mejor = (s, j, m)
        score, j, m = mejor
        if score < max(UMBRAL, MIN_TEAM_SCORE) or j is None:
            continue
        # Coincidir en una misma clasificación = son equipos distintos.
        if grupos_de(conn, i) & grupos_de(conn, j):
            continue
        # 'X A' y 'X' suelen ser el primer equipo escrito de dos formas, pero
        # 'X B' NUNCA es 'X': es el filial. Sin esto se fundía
        # 'LA UNION DE VECINDARIO "B"' con el primer equipo.
        fil_crudo, fil_bueno = claves[i][1], claves[j][1]
        if fil_crudo not in ('', 'A') and not fil_bueno:
            continue
        out.append((i, n, j, m, score))
    return out


def fundir(conn, viejo, nuevo):
    """Repunta todas las referencias de `viejo` a `nuevo` y borra la fila."""
    # Filas que chocarían con la clave única al repuntar: se quedan las del
    # equipo bueno y se tiran las del duplicado.
    conn.execute(
        """DELETE FROM standings WHERE team_id=? AND group_id IN
           (SELECT group_id FROM standings WHERE team_id=?)""", (viejo, nuevo))
    conn.execute(
        """DELETE FROM matches WHERE id IN (
             SELECT m.id FROM matches m JOIN matches o
               ON o.group_id=m.group_id AND o.jornada=m.jornada
              AND o.home_team_id = CASE WHEN m.home_team_id=? THEN ? ELSE m.home_team_id END
              AND o.away_team_id = CASE WHEN m.away_team_id=? THEN ? ELSE m.away_team_id END
              AND o.id <> m.id
             WHERE m.home_team_id=? OR m.away_team_id=?)""",
        (viejo, nuevo, viejo, nuevo, viejo, viejo))
    for tabla, columna in REFERENCIAS:
        if tabla_existe(conn, tabla):
            conn.execute(f"UPDATE OR IGNORE {tabla} SET {columna}=? WHERE {columna}=?",
                         (nuevo, viejo))
    for tabla, columna in REFERENCIAS:
        if tabla_existe(conn, tabla):
            conn.execute(f"DELETE FROM {tabla} WHERE {columna}=?", (viejo,))
    conn.execute("DELETE FROM teams WHERE id=?", (viejo,))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--listar", type=int, default=15,
                    help="cuántas parejas mostrar en el informe")
    args = ap.parse_args()

    conn = get_connection()
    conn.execute("PRAGMA foreign_keys=ON")
    ps = parejas(conn)
    antes_eq = conn.execute("SELECT COUNT(*) FROM teams").fetchone()[0]
    antes_par = conn.execute("SELECT COUNT(*) FROM matches").fetchone()[0]

    print(f"{'APLICANDO' if args.write else 'INFORME (nada se escribe)'} · "
          f"{antes_eq} equipos, {len(ps)} fusiones\n")
    for i, n, j, m, s in ps[:args.listar]:
        print(f"   {s:.2f}  {n!r}\n         -> {m!r}")
    if len(ps) > args.listar:
        print(f"   … y {len(ps) - args.listar} más")

    if args.write:
        for i, n, j, m, s in ps:
            fundir(conn, i, j)
        conn.commit()
        eq = conn.execute("SELECT COUNT(*) FROM teams").fetchone()[0]
        par = conn.execute("SELECT COUNT(*) FROM matches").fetchone()[0]
        huerfanos = conn.execute("PRAGMA foreign_key_check").fetchall()
        print(f"\nEquipos {antes_eq} -> {eq} · partidos {antes_par} -> {par} "
              f"· huérfanos: {len(huerfanos)}")
        print("Regenera con scripts/generate_js.py.")
    else:
        print("\nRepite con --write para aplicarlo.")
    conn.close()


if __name__ == "__main__":
    main()
