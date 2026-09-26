#!/usr/bin/env python3
"""La subida de versión de una publicación del rediseño (spec §5.5; Plan B4, decisión 10).

Cada fase se publica al terminarla (docs/rediseno-rebase.md). La publicación sube a la vez todas las
?v= de index.html y CACHE_NAME de sw.js, con la misma cadena, para que los móviles con la app
instalada cambien a la versión nueva, y recalcula CODIGO (scripts/codigo.py), la versión del código
que lee el arranque. No toca «Última actualización»: es la fecha de los datos, la escribe el bot y
source_health la publica como lastDataChange. Las marcas las reescribe bump_cache_version, la misma
función del bot, con touch_footer=False.

La versión es la fecha UTC, como la del bot (date.today() en el runner de GitHub: con la de Canarias,
entre las 00:00 y la 01:00 se podía repetir o hacer retroceder una CACHE_NAME), y estrictamente mayor
que la vigente, la primera ?v= de index.html. Si no lo es (la del día ya está publicada, o la vigente
es de un día posterior), la letra siguiente de la vigente: 20260925 → 20260925b → 20260925c. Se para
sin escribir nada si la vigente ya lleva la z.

Uso, desde la raíz del repositorio:
  python3 scripts/publicar.py    # las ?v=, CACHE_NAME y CODIGO de index.html y sw.js
"""
import argparse
import contextlib
import io
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import codigo  # noqa: E402
import generate_js  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
VERSION_RE = re.compile(r"\?v=(\d{8}[a-z]?)")
FOOTER_RE = re.compile(r"Última actualización: \d{2}/\d{2}/\d{4}")
CACHE_LINE_RE = re.compile(r"^const CACHE_NAME = 'futbolbase-v[0-9a-z]+';$")


def next_publish_version(current, today_utc):
    """La versión de una publicación: `today_utc` (AAAAMMDD) si es mayor que `current`, la vigente; si
    no, la letra siguiente de `current`. En estas cadenas, el orden alfabético es el de las versiones.
    ValueError si `current` ya lleva la z o si alguna no tiene la forma del bot."""
    found = re.fullmatch(r"(\d{8})([a-z]?)", current)
    if not found or not re.fullmatch(r"\d{8}", today_utc):
        raise ValueError(f"versiones sin la forma del bot: {current!r} y {today_utc!r}")
    if today_utc > current:
        return today_utc
    day, letter = found.groups()
    if letter == "z":
        raise ValueError(f"la versión {current} ya no admite otra letra")
    return day + (chr(ord(letter) + 1) if letter else "b")


def _today_utc():
    return datetime.now(timezone.utc).strftime("%Y%m%d")


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Sube las ?v=, CACHE_NAME y CODIGO de una publicación, sin tocar «Última actualización».")
    parser.add_argument("--root", default=str(ROOT), help="la raíz del árbol (por defecto, la del repositorio)")
    args = parser.parse_args(argv)
    root = Path(args.root)
    index = (root / "index.html").read_text(encoding="utf-8")
    sw = (root / "sw.js").read_text(encoding="utf-8")
    marks = VERSION_RE.findall(index)
    footer = FOOTER_RE.findall(index)
    if not marks or len(footer) != 1 or not CACHE_LINE_RE.match(sw.split("\n", 1)[0]) \
            or len(codigo.CODIGO_RE.findall(index)) != 1:
        print("index.html y sw.js tienen que llevar sus marcas: las ?v=, un «Última actualización», un CODIGO "
              "y CACHE_NAME en la línea 1 de sw.js: nada escrito")
        return 1
    current = marks[0]
    try:
        version = next_publish_version(current, _today_utc())
    except ValueError as error:
        print(f"{error}: nada escrito")
        return 1
    # Las mismas expresiones que el bot; sus avisos por línea sobran aquí, que lo resume en una.
    with contextlib.redirect_stdout(io.StringIO()):
        generate_js.bump_cache_version(str(root), touch_footer=False, version=version)
    index = (root / "index.html").read_text(encoding="utf-8")
    first = (root / "sw.js").read_text(encoding="utf-8").split("\n", 1)[0]
    assert VERSION_RE.findall(index) == [version] * len(marks), "alguna ?v= no subió"
    assert FOOTER_RE.findall(index) == footer, "el pie cambió"
    assert first == f"const CACHE_NAME = 'futbolbase-v{version}';", first
    print(f"versión {version} (antes, {current}): {len(marks)} ?v= en index.html y futbolbase-v{version} en sw.js; "
          f"«{footer[0]}», sin tocar")
    return codigo.main(["--root", str(root)])


if __name__ == "__main__":
    sys.exit(main())
