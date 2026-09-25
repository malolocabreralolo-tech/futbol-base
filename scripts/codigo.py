#!/usr/bin/env python3
"""CODIGO, la versión del código de la app, en el arranque de index.html (Plan B3, decisiones 155 y 156).

CODIGO es la huella sha1 (sus 8 primeras cifras) de acta.css y de src/*.js: cambia con cualquier
cambio de código y nunca con los datos. El arranque la compara con la última que abrió ese navegador
y, si cambió y un SW de otra versión está al mando, quita de sus cachés el código viejo antes de
importar app.js. La sube el paso de publicar de cada fase, con las ?v= y CACHE_NAME; el bot
(generate_js.py) nunca la cambia, porque nunca toca src/ ni acta.css. test_rediseno_index.mjs
comprueba que la de index.html es la del árbol: quien cambie src/*.js o acta.css (también al activar
una temporada, que cambia src/config.js) ejecuta este guion antes de las suites.

Uso, desde la raíz del repositorio:
  python3 scripts/codigo.py          # escribe en index.html la huella del árbol
  python3 scripts/codigo.py --check  # no escribe nada: sale con 1 si la de index.html no es la del árbol
"""
import argparse
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CODIGO_RE = re.compile(r"const CODIGO = '([0-9a-f]{8})';")


def huella(root=ROOT):
    """La de acta.css y src/*.js por nombre: de cada uno, su ruta, un cero, su contenido y otro cero."""
    root = Path(root)
    digest = hashlib.sha1()
    for path in [root / 'acta.css', *sorted((root / 'src').glob('*.js'))]:
        digest.update(path.relative_to(root).as_posix().encode('utf-8') + b'\0' + path.read_bytes() + b'\0')
    return digest.hexdigest()[:8]


def main(argv=None):
    parser = argparse.ArgumentParser(description='Escribe en index.html (o comprueba) CODIGO, la huella del código.')
    parser.add_argument('--check', action='store_true', help='no escribe nada: sale con 1 si no es la del árbol')
    parser.add_argument('--root', default=str(ROOT), help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    root = Path(args.root)
    path = root / 'index.html'
    index = path.read_text(encoding='utf-8')
    found = CODIGO_RE.findall(index)
    if len(found) != 1:
        print(f'index.html tiene que llevar un CODIGO, y lleva {len(found)}')
        return 1
    want = huella(root)
    if args.check:
        print(f'CODIGO {found[0]}: ' + ('la huella del árbol' if found[0] == want else f'no es la huella del árbol, {want}'))
        return 0 if found[0] == want else 1
    if found[0] != want:
        path.write_text(CODIGO_RE.sub(f"const CODIGO = '{want}';", index), encoding='utf-8')
    print(f'CODIGO {want}: la huella de acta.css y src/*.js, en index.html')
    return 0


if __name__ == '__main__':
    sys.exit(main())
