#!/usr/bin/env python3
"""Rebase de la rama del rediseño (Plan B2, decisión 8).

El bot de main (update.yml, fetch-fiflp.yml y fetch-fiflp-actas.yml) solo toca
tres marcas de index.html y sw.js, y siempre a la vez (bump_cache_version de
generate_js.py): todas las ?v=, el literal «Última actualización» de
index.html y el CACHE_NAME de la línea 1 de sw.js. Al rebasar la rama sobre
main, los dos ficheros se quedan con la estructura de la rama y esas marcas
de main. El procedimiento completo está en docs/rediseno-rebase.md.

Uso, desde la raíz del repositorio:
  python3 scripts/sync_versions.py --from origin/main --since BASE  # 1 si main cambió algo más que las marcas
  python3 scripts/sync_versions.py --from origin/main               # reescribe index.html y sw.js
  python3 scripts/sync_versions.py --from origin/main --check       # 1 si alguna marca no coincide
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = ("index.html", "sw.js")
# Los mismos patrones que bump_cache_version (generate_js.py).
VERSION_RE = re.compile(r"\?v=(\d{8}[a-z]?)")
FOOTER_RE = re.compile(r"Última actualización: (\d{2}/\d{2}/\d{4})")
CACHE_RE = re.compile(r"futbolbase-v([0-9a-z]+)")


class MarksError(ValueError):
    """A index.html o sw.js les falta alguna marca de versión del bot."""


def marks(index_html, sw_js):
    """Las marcas de un par index.html + sw.js: {'v', 'footer', 'cache'}.

    La ?v= es la primera del fichero, la misma que usa _next_version.
    Lanza MarksError si falta alguna: sin ellas, el bot tampoco puede subir la versión.
    """
    found = {"?v=": VERSION_RE.search(index_html),
             "Última actualización": FOOTER_RE.search(index_html),
             "CACHE_NAME": CACHE_RE.search(sw_js)}
    missing = [name for name, match in found.items() if not match]
    if missing:
        raise MarksError("faltan marcas de versión: " + ", ".join(missing))
    return {"v": found["?v="].group(1), "footer": found["Última actualización"].group(1),
            "cache": found["CACHE_NAME"].group(1)}


def apply_marks(index_html, sw_js, wanted):
    """index.html y sw.js con las marcas `wanted`: todas las ?v=, el literal y la primera CACHE_NAME."""
    marks(index_html, sw_js)  # la rama también cumple el contrato del bot
    index = VERSION_RE.sub(f"?v={wanted['v']}", index_html)
    index = FOOTER_RE.sub(f"Última actualización: {wanted['footer']}", index)
    sw = CACHE_RE.sub(f"futbolbase-v{wanted['cache']}", sw_js, count=1)
    return index, sw


def differences(index_html, sw_js, wanted):
    """Lo que no coincide con `wanted`, en líneas legibles; [] si todo coincide."""
    have = marks(index_html, sw_js)
    out = [f"?v={v} (debería ser ?v={wanted['v']})"
           for v in sorted(set(VERSION_RE.findall(index_html))) if v != wanted["v"]]
    if have["footer"] != wanted["footer"]:
        out.append(f"Última actualización: {have['footer']} (debería ser {wanted['footer']})")
    if have["cache"] != wanted["cache"]:
        out.append(f"CACHE_NAME futbolbase-v{have['cache']} (debería ser futbolbase-v{wanted['cache']})")
    return out


def only_marks_changed(old_index, old_sw, new_index, new_sw):
    """True si de (old_index, old_sw) a (new_index, new_sw) solo cambian las marcas del bot."""
    neutral = {"v": "00000000", "footer": "00/00/0000", "cache": "0"}
    return apply_marks(old_index, old_sw, neutral) == apply_marks(new_index, new_sw, neutral)


def git_show(root, ref, path):
    """El fichero `path` tal como está en `ref`."""
    return subprocess.run(["git", "-C", str(root), "show", f"{ref}:{path}"],
                          check=True, capture_output=True, text=True, encoding="utf-8").stdout


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Copia en index.html y sw.js las marcas de versión de otra rama (main).")
    parser.add_argument("--from", dest="ref", required=True,
                        help="rama o commit con las marcas buenas, normalmente origin/main")
    parser.add_argument("--check", action="store_true",
                        help="no escribe nada: sale con 1 si alguna marca no coincide")
    parser.add_argument("--since", metavar="BASE",
                        help="no escribe nada: sale con 1 si de BASE a --from cambió algo más que las marcas")
    parser.add_argument("--root", default=str(ROOT), help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    root = Path(args.root)
    main_files = [git_show(root, args.ref, name) for name in FILES]
    wanted = marks(*main_files)
    if args.since:
        if only_marks_changed(*(git_show(root, args.since, name) for name in FILES), *main_files):
            print(f"de {args.since} a {args.ref}, index.html y sw.js solo cambian las marcas de versión")
            return 0
        print(f"de {args.since} a {args.ref}, index.html o sw.js cambian algo más que las marcas: "
              "llévalo a mano a la rama (docs/rediseno-rebase.md)")
        return 1
    paths = [root / name for name in FILES]
    index, sw = (path.read_text(encoding="utf-8") for path in paths)
    if args.check:
        diff = differences(index, sw, wanted)
        for line in diff:
            print(f"distinta de {args.ref}: {line}")
        if not diff:
            print(f"index.html y sw.js llevan las marcas de {args.ref}: ?v={wanted['v']}")
        return 1 if diff else 0
    for path, old, new in zip(paths, (index, sw), apply_marks(index, sw, wanted)):
        if new != old:
            path.write_text(new, encoding="utf-8")
    print(f"marcas de {args.ref}: ?v={wanted['v']}, Última actualización: {wanted['footer']}, "
          f"CACHE_NAME futbolbase-v{wanted['cache']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
