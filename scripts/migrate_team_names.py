#!/usr/bin/env python3
"""migrate_team_names.py — Equipos de un grupo que se llevaron la fila de teams de otro club (idempotente).

teams.name es único y lo comparten todas las categorías y temporadas: si la activación de un grupo le
da a un equipo el nombre de otro club, la ficha de ese nombre mezcla los dos. La activación de la Fase
Previa alevín de Gran Canaria 2026-27 lo hizo con estos (activate_season.known_names ya no los repite:
el filial va con su club, cada nombre de la base es de un solo club, la ficha de la federación de la
temporada manda, los candidatos de otra isla no compiten y los nombres revisados de
fiflp_team_names.json):

  - 'MESAS HURACAN, U.D. LAS "B"' y '"C"' eran 'Huracán B' y 'AD Huracán C', los de AD Huracán (otro
    club, el de benjamín FF12 y FF14): son Las Mesas Hu. B y C, como su A ('Las Mesas Hu.') y su D.
  - 'FUNDACION GUINIGUADA, C.D. DE LA "A"' era 'Guiniguada', la fila de GUINIGUADA APOLINARIO (AL8):
    es otro club de la federación, con su A, 'Fundación Guini.' en benjamín 2025-26.
  - 'FUNDACION CANARIA U.D. LAS PALMAS, C.D.' (AL5) y 'PALMAS, U.D. LAS' (AL13), dos equipos sin letra,
    en la misma fila 'Las Palmas' (la de benjamín es PALMAS, U.D. LAS).
  - 'NATURALEZA VERDE-VALLESECO DE G.C., C.D.' era 'UD Valleseco' (VALLESECO, U.D., otro club de la
    federación que sigue con su equipo de Segunda en el mismo campo).
  - 'VICTORIA, REAL CLUB "A"' era 'Victoria' (la fila de 2014-25): en benjamín y prebenjamín de 2026-27 (y
    su B en alevín) es 'RC Victoria'.
  - 'PUERTOS DE L.P., C.E.F.' A y B eran 'Puertos de' y 'Puertos de B' (nombre roto): 'Puertos LP' y
    'Puertos LP B', los de benjamín; 'ALCOTAN CANARIAS, C.D.' era 'Alcotan Canarias', sin el escudo ni el
    histórico de 'Alcotán Can.'.

TEAM_FIXES: {(temporada, categoría, código del grupo): {nombre que tiene en el grupo: nombre que debe
tener}}. Solo en ese grupo: clasificación y su detalle, goleadores, partidos con todo lo que cuelga de
ellos (alineaciones, eventos, cuerpo técnico) y los equipos de la app de futbolaspalmas de su liga. La
fila que sigue en uso en otro grupo (de otra categoría o temporada) se queda como está, con su ficha;
la que se queda sin uso se borra, y su ficha de la temporada pasa a la buena si esta no tiene. Un
nombre que ya no está en el grupo no hace nada: en una base ya corregida, nada.

La ejecuta el bot en cada pasada (fetch_futbolaspalmas.main), antes de leer la federación: el bot casa
los nombres de la federación con los de la clasificación del grupo, que así ya son los buenos.

    python3 scripts/migrate_team_names.py [--db RUTA]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

TEAM_FIXES = {
    ("2026-2027", "ALEVIN", "AL3"): {"UD Valleseco": "Naturaleza Verde-Valleseco"},
    ("2026-2027", "ALEVIN", "AL4"): {"AD Huracán C": "Las Mesas Hu. C"},
    ("2026-2027", "ALEVIN", "AL5"): {"Las Palmas": "Fundación UD Las Palmas"},
    ("2026-2027", "ALEVIN", "AL12"): {"Victoria": "RC Victoria"},
    ("2026-2027", "ALEVIN", "AL15"): {"Guiniguada": "Fundación Guini."},
    ("2026-2027", "ALEVIN", "AL17"): {"Puertos de B": "Puertos LP B"},
    ("2026-2027", "ALEVIN", "AL19"): {"Alcotan Canarias": "Alcotán Can."},
    ("2026-2027", "ALEVIN", "AL20"): {"Huracán B": "Las Mesas Hu. B", "Puertos de": "Puertos LP"},
}

# Lo que apunta a un equipo dentro de un grupo: (tabla, filtro por grupo). Los partidos, aparte (dos columnas).
_IN_GROUP = "match_id IN (SELECT id FROM matches WHERE group_id=?)"
_GROUP_ROWS = (("standings", "group_id=?"), ("standings_detail", "group_id=?"), ("scorers", "group_id=?"),
               ("appearances", _IN_GROUP), ("match_events", _IN_GROUP), ("match_staff", _IN_GROUP),
               ("match_staff_all", _IN_GROUP),
               ("fp_teams", "liga_id IN (SELECT liga_id FROM fp_ligas WHERE group_id=?)"))
# Lo que hace que una fila de teams siga en uso (la ficha de la temporada, no: va con el equipo).
_USES = (("standings", "team_id"), ("standings_detail", "team_id"), ("scorers", "team_id"),
         ("matches", "home_team_id"), ("matches", "away_team_id"), ("appearances", "team_id"),
         ("match_events", "team_id"), ("match_staff", "team_id"), ("match_staff_all", "team_id"),
         ("fp_teams", "team_id"))


def _tables(conn):
    return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def _in_use(conn, team_id, tables):
    return any(conn.execute(f"SELECT 1 FROM {t} WHERE {c}=? LIMIT 1", (team_id,)).fetchone()
               for t, c in _USES if t in tables)


def _group_teams(conn, gid):
    """{nombre: id} de los equipos de la clasificación y del calendario del grupo (un retirado solo
    está en el calendario)."""
    return dict(conn.execute(
        """SELECT t.name, t.id FROM teams t WHERE t.id IN (
               SELECT team_id FROM standings WHERE group_id=:g
               UNION SELECT home_team_id FROM matches WHERE group_id=:g
               UNION SELECT away_team_id FROM matches WHERE group_id=:g)""", {"g": gid}))


def migrate(conn, fixes=None, log=print):
    """Aplica TEAM_FIXES (o `fixes`). Devuelve [(temporada, código, nombre que tenía, nombre bueno)]."""
    fixes = TEAM_FIXES if fixes is None else fixes
    tables = _tables(conn)
    done = []
    for (season, category, code), renames in sorted(fixes.items()):
        found = conn.execute(
            """SELECT g.id, g.season_id FROM groups g JOIN seasons s ON s.id=g.season_id
               JOIN categories c ON c.id=g.category_id WHERE s.name=? AND upper(c.name)=? AND g.code=?""",
            (season, category.upper(), code)).fetchall()
        if len(found) != 1:
            continue
        gid, season_id = found[0]
        present = _group_teams(conn, gid)
        for wrong, right in sorted(renames.items()):
            old = present.get(wrong)
            if old is None:
                continue                                   # ya corregido (o nunca estuvo)
            row = conn.execute("SELECT id FROM teams WHERE name=?", (right,)).fetchone()
            if row and row[0] in present.values():
                log(f"  ! {season} {code}: {right} ya está en el grupo; {wrong} se queda")
                continue
            with conn:
                new = row[0] if row else conn.execute("INSERT INTO teams(name) VALUES (?)", (right,)).lastrowid
                for table, where in _GROUP_ROWS:
                    if table in tables and (table != "fp_teams" or "fp_ligas" in tables):
                        conn.execute(f"UPDATE {table} SET team_id=? WHERE team_id=? AND {where}", (new, old, gid))
                for side in ("home_team_id", "away_team_id"):
                    conn.execute(f"UPDATE matches SET {side}=? WHERE {side}=? AND group_id=?", (new, old, gid))
                if not _in_use(conn, old, tables):
                    # Solo jugaba en este grupo: su ficha de la temporada (si la leyó el bot del directorio
                    # del grupo) es la del equipo bueno, si este no tiene; y la fila, fuera.
                    if "team_seasons" in tables:
                        if not conn.execute("SELECT 1 FROM team_seasons WHERE team_id=? AND season_id=?",
                                            (new, season_id)).fetchone():
                            conn.execute("UPDATE team_seasons SET team_id=? WHERE team_id=? AND season_id=?",
                                         (new, old, season_id))
                        conn.execute("DELETE FROM team_seasons WHERE team_id=?", (old,))
                    conn.execute("DELETE FROM teams WHERE id=?", (old,))
            present = _group_teams(conn, gid)
            done.append((season, code, wrong, right))
            log(f"  {season} {code}: {wrong} → {right}")
    return done


if __name__ == "__main__":
    import argparse
    from db import get_connection
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--db", default=None)
    args = ap.parse_args()
    c = get_connection(args.db)
    try:
        print(f"{len(migrate(c))} equipos corregidos")
    finally:
        c.close()
