#!/usr/bin/env python3
"""Sonda de arranque de temporada: qué publica hoy futbolaspalmas.com y en qué
se diferencia de lo que cree la base.

El proyecto nunca ha pasado un cambio de temporada (docs/temporada-nueva.md).
Las URLs del portal son slugs SIN temporada y se reutilizan, así que la misma
dirección que hoy sirve la clasificación final de 2025-26 servirá en septiembre
la de 2026-27. `standings_regression` impide que eso pise los datos buenos, pero
solo avisa por la vía de que el run se ponga rojo.

Esta sonda contesta las dos preguntas del paso 1 del documento SIN escribir nada:

  1. ¿Alguna URL que la base tiene fichada ha empezado a servir OTRA liga?
     (equipos distintos = la temporada ha cambiado en la fuente)
  2. ¿Qué competiciones publica el portal que la base no conoce?
     (benjamín por los enlaces de la portada, prebenjamín por patrón numerado,
     que es como está documentado)

    python3 scripts/discover_temporada.py            # resumen
    python3 scripts/discover_temporada.py --todas    # comprueba TODOS los grupos
"""
import argparse
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_futbolaspalmas import fetch, parse_standings   # noqa: E402
from fiflp_names import group_overlap                     # noqa: E402
from db import get_connection                             # noqa: E402

HOME = "https://futbolaspalmas.com/"
PREBENJAMIN_URL = "https://futbolaspalmas.com/1prebenjamin{}"
PREBENJAMIN_MAX = 12
# Por debajo de esto, la URL ya no sirve la liga que la base tiene fichada.
MIN_MISMA_LIGA = 0.5


def benjamin_links(html):
    """Enlaces a competiciones de benjamín de la portada, sin duplicados.

    Se descarta la portada de categoría ('/benjamin/'), que no es un grupo.
    """
    urls = set(re.findall(
        r'https://futbolaspalmas\.com/[a-z0-9-]*benjamin[a-z0-9-]*/', html or ''))
    return sorted(u for u in urls if u != "https://futbolaspalmas.com/benjamin/")


def prebenjamin_links(maximo=PREBENJAMIN_MAX):
    """El prebenjamín no sale en el menú: va por patrón numerado."""
    return [PREBENJAMIN_URL.format(n) for n in range(1, maximo + 1)]


def leer_clasificacion(url):
    """(equipos, jornada) de una URL de grupo. ([], None) si no hay tabla."""
    try:
        clasi = parse_standings(fetch(url.rstrip("/") + "/mostrar_clasi.php"))
    except Exception:
        return [], None
    if not clasi:
        return [], None
    equipos = [fila[1] for fila in clasi]
    jornadas = [fila[3] for fila in clasi if len(fila) > 3]
    return equipos, max(jornadas) if jornadas else None


def grupos_de_la_base(conn):
    """[(code, url, [equipos])] de la temporada marcada como actual."""
    fila = conn.execute("SELECT id, name FROM seasons WHERE is_current=1").fetchone()
    if not fila:
        return None, []
    season_id, nombre = fila
    out = []
    for code, url in conn.execute(
            """SELECT code, url FROM groups WHERE season_id=? AND url IS NOT NULL
               AND url != '' ORDER BY code""", (season_id,)):
        equipos = [r[0] for r in conn.execute(
            """SELECT t.name FROM standings s JOIN teams t ON t.id=s.team_id
               JOIN groups g ON g.id=s.group_id
               WHERE g.season_id=? AND g.code=?""", (season_id, code))]
        out.append((code, url, equipos))
    return nombre, out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--todas", action="store_true",
                    help="comprueba todos los grupos fichados, no una muestra")
    ap.add_argument("--muestra", type=int, default=6)
    ap.add_argument("--pausa", type=float, default=1.0)
    args = ap.parse_args()

    conn = get_connection()
    temporada, fichados = grupos_de_la_base(conn)
    if not temporada:
        sys.exit("No hay ninguna temporada marcada como actual en la base.")
    print(f"Temporada actual en la base: {temporada} · {len(fichados)} grupos con URL\n")

    print("1) ¿Alguna URL fichada ha cambiado de liga?")
    revisar = fichados if args.todas else fichados[:args.muestra]
    if not args.todas and len(fichados) > len(revisar):
        print(f"   (muestra de {len(revisar)} de {len(fichados)}; usa --todas para el barrido completo)")
    cambiados, vacios = [], []
    for code, url, equipos in revisar:
        web, jornada = leer_clasificacion(url)
        time.sleep(args.pausa)
        if not web:
            vacios.append(code)
            print(f"   {code:5} SIN TABLA — {url}")
            continue
        solape = group_overlap(web, equipos) if equipos else 0.0
        estado = "MISMA liga" if solape >= MIN_MISMA_LIGA else "¡OTRA LIGA!"
        if solape < MIN_MISMA_LIGA:
            cambiados.append(code)
        print(f"   {code:5} {estado} · solape {solape:3.0%} · web {len(web)} eq J{jornada}")

    print("\n2) Competiciones que publica el portal")
    try:
        portada = fetch(HOME)
    except Exception as e:
        print(f"   no se pudo leer la portada: {e}")
        portada = ""
    enlaces = benjamin_links(portada)
    conocidas = {u.rstrip("/") for _, u, _ in fichados}
    nuevas = [u for u in enlaces if u.rstrip("/") not in conocidas]
    print(f"   benjamín: {len(enlaces)} enlaces en la portada, "
          f"{len(nuevas)} que la base NO tiene fichados")
    for u in nuevas:
        print(f"      + {u}")
    prebe = [u for u in prebenjamin_links() if u.rstrip("/") not in conocidas]
    print(f"   prebenjamín (patrón numerado): {len(prebe)} candidatas sin fichar")

    print("\nResumen")
    if cambiados:
        print(f"   ⚠ CAMBIO DE TEMPORADA: {len(cambiados)} grupos sirven otra liga "
              f"({', '.join(cambiados)}). Sigue docs/temporada-nueva.md.")
    else:
        print("   Las URLs fichadas siguen sirviendo la misma liga: la fuente no ha girado.")
    if vacios:
        print(f"   {len(vacios)} grupos sin tabla ahora mismo: {', '.join(vacios)}")
    conn.close()


if __name__ == "__main__":
    main()
