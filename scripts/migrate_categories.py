#!/usr/bin/env python3
"""migrate_categories.py — La tabla categories con sus nombres canónicos (idempotente).

  - Borra las filas que repiten otra cambiando solo las mayúsculas ('prebenjamin', id 3,
    que dejó import_history.py al pasar la clave en minúsculas), solo si nada las usa: la
    única tabla que apunta a categories es groups.category_id, pero se mira cualquier
    columna category_id y cualquier clave ajena a categories, por si llega otra.
  - Crea las que faltan de categorias.DB_NAME (ALEVIN), en mayúsculas: generate_js las
    busca por su nombre exacto.

Una fila duplicada que sí se usa se queda (se avisa): moverla de grupo es otra cosa.
La ejecuta el bot al arrancar (fetch_futbolaspalmas.main) y se puede lanzar a mano:

    python3 scripts/migrate_categories.py [--db RUTA]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from categorias import DB_NAME  # noqa: E402


def _referencing_columns(conn):
    """[(tabla, columna)] que pueden guardar un id de categories."""
    out = []
    for (table,) in conn.execute("SELECT name FROM sqlite_master WHERE type='table'"):
        if table == "categories" or table.startswith("sqlite_"):
            continue
        cols = {r[1] for r in conn.execute(f'PRAGMA table_info("{table}")')}
        refs = {r[3] for r in conn.execute(f'PRAGMA foreign_key_list("{table}")') if r[2] == "categories"}
        for col in sorted(refs | ({"category_id"} & cols)):
            out.append((table, col))
    return out


def _used(conn, cat_id, columns):
    return any(conn.execute(f'SELECT 1 FROM "{t}" WHERE "{c}"=? LIMIT 1', (cat_id,)).fetchone()
               for t, c in columns)


def migrate(conn, log=print):
    """Devuelve {"dropped": [nombres borrados], "kept": [duplicados que se usan], "created": [...]}."""
    report = {"dropped": [], "kept": [], "created": []}
    columns = _referencing_columns(conn)
    rows = conn.execute("SELECT id, name FROM categories ORDER BY id").fetchall()
    canonical = {name.upper(): cid for cid, name in rows if name == name.upper()}
    for cid, name in rows:
        if name == name.upper() or name.upper() not in canonical:
            continue
        if _used(conn, cid, columns):
            report["kept"].append(name)
            log(f"  ! categoría '{name}' (id {cid}) repite '{name.upper()}' pero la usan grupos: se queda")
            continue
        conn.execute("DELETE FROM categories WHERE id=?", (cid,))
        report["dropped"].append(name)
        log(f"  categoría '{name}' (id {cid}) duplicada y sin uso: borrada")
    have = {r[0].upper() for r in conn.execute("SELECT name FROM categories")}
    for name in DB_NAME.values():
        if name not in have:
            conn.execute("INSERT INTO categories(name) VALUES (?)", (name,))
            report["created"].append(name)
            log(f"  categoría '{name}' creada")
    conn.commit()
    return report


if __name__ == "__main__":
    import argparse
    from db import get_connection
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--db", default=None)
    args = ap.parse_args()
    c = get_connection(args.db)
    print(migrate(c))
    c.close()
