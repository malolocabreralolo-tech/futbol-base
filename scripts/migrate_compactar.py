#!/usr/bin/env python3
"""migrate_compactar.py — Las tablas de las actas en su esquema compacto (idempotente; 10/2026).

futbolbase.db va en git, que no admite ficheros de más de 100 MB, y con el alevín la base iba hacia ese
límite. Este paso (la opción «B5» del estudio de almacenamiento) la deja en algo más de la mitad (71,2 →
37,6 MB el 14/10/2026) sin cambiar nada de lo que se publica: los data-*.js salen iguales, byte a byte,
salvo el tamaño de la base que enseña Fuentes (COBERTURA.mb, de 70 a 35).

  - appearances pasa a WITHOUT ROWID, con la UNIQUE de antes (match_id, team_id, player_id) como clave
    primaria y una columna ord con el orden del acta (el que daba appearances.id), que desempata las
    alineaciones. Fuera idx_appearances_match (lo cubre la clave) e idx_appearances_team (solo lo usa
    _referenced, que sin él tarda unos milisegundos). Se queda idx_appearances_player, para prune_players.
  - match_staff, que era una copia de los cuatro cargos de siempre de match_staff_all, pasa a ser una vista
    de match_staff_all. Antes de borrarla, lo que tenía y match_staff_all no, pasa a match_staff_all:
      · los partidos sin ninguna fila en match_staff_all, con sus cargos en el orden del antiguo
        backfill_staff_all (lo que hacía el bot en cada pasada): salen también en el cuerpo técnico;
      · cada fila suelta que el acta no trae con ese cargo, con ord negativo: sale en la vista y no en el
        cuerpo técnico que se publica. En la base del 14/10/2026 hay una, el «entrenador» del visitante
        del acta 289289: el lector tomó la línea siguiente a un «…Entrenador:» sin nombre.
    Si aun así a la vista le faltara una fila de la tabla, no se convierte nada (error).
  - match_events: fuera idx_match_events_kind (todas las filas son goles: no filtra) y un índice parcial
    de pair_id, porque su clave ajena recorría la tabla entera por cada suceso borrado.
  - VACUUM, una sola vez: solo cuando ha cambiado algo.

En una base ya compacta no hace nada. La ejecuta el bot al arrancar, antes de leer nada
(fetch_futbolaspalmas.main), y migrate_actas_schema.migrate al final. Con FIFLP_DB_MARK (update.yml)
deja la marca para que el bot suba la base aunque no cambie ningún data-*.js. A mano:

    python3 scripts/migrate_compactar.py [--db RUTA]
"""
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from migrate_actas_schema import (APPEARANCES_COLUMNS, APPEARANCES_PLAYER_INDEX, EVENTS_PAIR_INDEX,  # noqa: E402
                                  MATCH_STAFF_ALL_DDL, MATCH_STAFF_ALL_INDEX, MATCH_STAFF_SELECT,
                                  MATCH_STAFF_VIEW, STAFF_KINDS)

APPEARANCES_COLS = ("match_id", "team_id", "player_id", "dorsal", "role", "goals", "yellow", "red")
# Los índices que el esquema compacto no tiene (los de appearances y match_staff se van con sus tablas).
DROPPED_INDEXES = ("idx_appearances_match", "idx_appearances_team", "idx_match_events_kind",
                   "idx_match_staff_match")
# El orden de los cargos de un partido sin match_staff_all (el del antiguo backfill_staff_all).
LEGACY_ORDER = ("referee", "delegate_field", "delegate_team", "coach")


def _type(conn, name):
    row = conn.execute("SELECT type FROM sqlite_master WHERE name=?", (name,)).fetchone()
    return row[0] if row else None


def _appearances_compact(conn):
    sql = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='appearances'").fetchone()
    cols = {r[1] for r in conn.execute("PRAGMA table_info(appearances)")}
    return sql is None or ("WITHOUT ROWID" in sql[0].upper() and "ord" in cols and "id" not in cols)


def pending(conn):
    """Lo que le falta a la base para el esquema compacto ([] si nada)."""
    todo = []
    if not _appearances_compact(conn):
        todo.append("appearances")
    if _type(conn, "match_staff") == "table":
        todo.append("match_staff")
    todo += [idx for idx in DROPPED_INDEXES if _type(conn, idx) == "index"
             and not (idx.startswith("idx_appearances") and "appearances" in todo)
             and not (idx == "idx_match_staff_match" and "match_staff" in todo)]
    if _type(conn, "match_events") == "table" and _type(conn, "idx_match_events_pair") is None:
        todo.append("idx_match_events_pair")
    return todo


def _convert_appearances(conn):
    """appearances a WITHOUT ROWID con ord = el orden de las filas de cada partido (su id). Devuelve cuántas."""
    cols = [r[1] for r in conn.execute("PRAGMA table_info(appearances)")]
    lost = set(cols) - set(APPEARANCES_COLS) - {"id", "ord"}
    if lost:
        raise RuntimeError(f"appearances tiene columnas que el esquema compacto no conoce: {sorted(lost)}")
    order = "id" if "id" in cols else "rowid"
    conn.execute("CREATE TABLE appearances_compacta " + APPEARANCES_COLUMNS)
    conn.execute(f"""INSERT INTO appearances_compacta({", ".join(APPEARANCES_COLS)}, ord)
                     SELECT {", ".join(APPEARANCES_COLS)},
                            ROW_NUMBER() OVER (PARTITION BY match_id ORDER BY {order}) - 1
                       FROM appearances ORDER BY match_id, team_id, player_id""")
    before = conn.execute("SELECT count(*) FROM appearances").fetchone()[0]
    after = conn.execute("SELECT count(*) FROM appearances_compacta").fetchone()[0]
    if before != after:
        raise RuntimeError(f"appearances: {before} filas y {after} en la copia")
    conn.execute("DROP TABLE appearances")
    conn.execute("ALTER TABLE appearances_compacta RENAME TO appearances")
    conn.execute(APPEARANCES_PLAYER_INDEX)
    return after


def _convert_staff(conn, log):
    """match_staff a vista de match_staff_all, con lo que solo tenía ella pasado antes a match_staff_all.
    Devuelve {"rows": filas de la tabla, "matches": partidos rellenados enteros, "loose": filas sueltas
    rellenadas (ord negativo), "extra": filas de la vista que la tabla no tenía}."""
    conn.execute(MATCH_STAFF_ALL_DDL)
    conn.execute(MATCH_STAFF_ALL_INDEX)
    staff = conn.execute("SELECT match_id, team_id, kind, name FROM match_staff ORDER BY match_id, id").fetchall()
    unknown = {r[2] for r in staff} - set(STAFF_KINDS)
    if unknown:
        raise RuntimeError(f"match_staff con cargos desconocidos: {sorted(unknown)}")
    insert = "INSERT INTO match_staff_all(match_id, team_id, role, name, ord) VALUES (?, ?, ?, ?, ?)"
    # 1. Los partidos sin ninguna fila en match_staff_all: los cuatro cargos, con su orden.
    with_all = {r[0] for r in conn.execute("SELECT DISTINCT match_id FROM match_staff_all")}
    whole = {}
    for mid, tid, kind, name in staff:
        if mid not in with_all:
            whole.setdefault(mid, []).append((tid, kind, name))
    for mid, rows in whole.items():
        rows.sort(key=lambda r: (r[0] is not None, r[0] or 0, LEGACY_ORDER.index(r[1])))
        for i, (tid, kind, name) in enumerate(rows):
            conn.execute(insert, (mid, tid, STAFF_KINDS[kind], name, i))
    # 2. Las filas sueltas que la vista no daría: con ord negativo (fuera del cuerpo técnico publicado).
    have = Counter(conn.execute(MATCH_STAFF_SELECT))
    loose = {}
    for row in staff:
        if have[row] > 0:
            have[row] -= 1
        else:
            loose.setdefault(row[0], []).append(row)
    for mid, rows in loose.items():
        for i, (_, tid, kind, name) in enumerate(rows, 1):
            conn.execute(insert, (mid, tid, STAFF_KINDS[kind], name, -i))
    # 3. La vista tiene todas las filas de la tabla (las mismas veces), o no se toca nada.
    table, view = Counter(staff), Counter(conn.execute(MATCH_STAFF_SELECT))
    lost = table - view
    if lost:
        raise RuntimeError(f"match_staff: a la vista le faltarían {sum(lost.values())} filas de la tabla")
    extra = sum((view - table).values())
    if extra:
        log(f"  ! match_staff: la vista da {extra} filas de match_staff_all que la tabla no tenía")
    conn.execute("DROP TABLE match_staff")
    conn.execute(MATCH_STAFF_VIEW)
    return {"rows": len(staff), "matches": len(whole), "loose": sum(len(r) for r in loose.values()),
            "extra": extra}


def _mark_db(todo):
    """update.yml solo sube futbolbase.db si cambia algún data-*.js o si encuentra el fichero
    FIFLP_DB_MARK; la base compactada no cambia ninguno, y sin la marca cada pasada la volvería a
    convertir desde la de main. Sin la variable (en local, en las pruebas), nada."""
    path = os.environ.get("FIFLP_DB_MARK")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write("migrate_compactar: " + ", ".join(todo) + "\n")


def migrate(conn, log=print):
    """Pasa la base al esquema compacto. Devuelve {"converted": [lo que ha cambiado], ...} con las
    cifras; {"converted": []} si ya lo estaba (y entonces no toca nada, tampoco el VACUUM)."""
    todo = pending(conn)
    report = {"converted": todo}
    if not todo:
        return report
    pages = lambda: conn.execute("PRAGMA page_count").fetchone()[0] * conn.execute("PRAGMA page_size").fetchone()[0]  # noqa: E731
    report["bytes_before"] = pages()
    conn.commit()
    fk = conn.execute("PRAGMA foreign_keys").fetchone()[0]
    conn.execute("PRAGMA foreign_keys=OFF")         # las tablas se rehacen: sin comprobar fila a fila
    try:
        conn.execute("BEGIN")
        if "match_staff" in todo:
            report["match_staff"] = _convert_staff(conn, log)
        if "appearances" in todo:
            report["appearances"] = _convert_appearances(conn)
        for idx in DROPPED_INDEXES:
            conn.execute(f"DROP INDEX IF EXISTS {idx}")
        if _type(conn, "match_events") == "table":
            conn.execute(EVENTS_PAIR_INDEX)
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.execute(f"PRAGMA foreign_keys={'ON' if fk else 'OFF'}")
    conn.execute("VACUUM")
    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    report["bytes_after"] = pages()
    _mark_db(todo)
    staff = report.get("match_staff")
    log("  Esquema compacto de las actas: " + ", ".join(todo)
        + (f"; appearances: {report['appearances']} filas con su orden" if "appearances" in report else "")
        + (f"; match_staff, vista: {staff['rows']} filas, {staff['matches']} partidos y {staff['loose']} filas"
           " sueltas pasadas a match_staff_all" if staff else "")
        + f"; {report['bytes_before'] / 1e6:.1f} → {report['bytes_after'] / 1e6:.1f} MB")
    return report


if __name__ == "__main__":
    import argparse
    from db import get_connection
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--db", default=None)
    args = ap.parse_args()
    c = get_connection(args.db)
    try:
        print(migrate(c))
    finally:
        c.close()
