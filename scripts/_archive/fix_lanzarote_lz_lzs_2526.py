#!/usr/bin/env python3
"""Fixer one-shot: Lanzarote benjamín 2025-26 sale dos veces (LZ1-4 y LZS1-4).

Es la misma competición sacada de dos fuentes, pero NO son copias exactas:

    LZ1-4   futbolaspalmas: URL viva (la refresca update.yml), goleadores y
            cronología de goles; campo en ningún partido.
    LZS1-4  FIFLP: sin URL, sin goleadores; campo en el 100 % de los partidos.

Solo coinciden unos 261 de 342 partidos por (jornada, fecha, marcador) y las
clasificaciones difieren en algún puesto. Publicar las dos duplicaba el
calendario en la web y las estadísticas de STATS (CD Tahiche: 36 entradas en
pointsHistory para 18 partidos y 102 puntos en vez de 54).

Decisión (spec 2026-09-23, §9.4): se conserva LZ1-4. Este script
  1. copia `venue` (y `time` si falta) de LZSn a LZn en los partidos que
     emparejan SIN AMBIGÜEDAD por (número de jornada, fecha ISO, gl, gv) y
     cuyos equipos cuadran con el mapa de nombres LZ -> FIFLP;
  2. deja en el log los partidos y las filas de clasificación que difieren, y
     los pares apartados porque sus equipos no cuadran;
  3. borra LZS1-4 con db.delete_group;
  4. regenera la web con generate_js.py.

    python3 scripts/_archive/fix_lanzarote_lz_lzs_2526.py            # informe
    python3 scripts/_archive/fix_lanzarote_lz_lzs_2526.py --write

El log se escribe también en scripts/_archive/fix_lanzarote_lz_lzs_2526.log
(ignorado por git). El guardián permanente es
test_db_sanity.py::test_no_group_repeats_another_source.
"""
import argparse
import os
import re
import sys
from collections import Counter

_AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_AQUI))
from db import get_connection, delete_group          # noqa: E402

SEASON = "2025-2026"
CATEGORY = "BENJAMIN"
PAIRS = [("LZ1", "LZS1"), ("LZ2", "LZS2"), ("LZ3", "LZS3"), ("LZ4", "LZS4")]
MIN_SOLAPE = 0.7          # el mismo umbral que el guardián de test_db_sanity
LOG_PATH = os.path.join(_AQUI, "fix_lanzarote_lz_lzs_2526.log")


def jornada_num(label):
    """'Jornada 7' (futbolaspalmas) y '7' (FIFLP) son la misma jornada."""
    s = (label or "").strip()
    m = re.fullmatch(r"(?:Jornada\s+)?(\d+)", s, re.IGNORECASE)
    return str(int(m.group(1))) if m else s


def iso_date(raw, start_year, end_year):
    """YYYY-MM-DD, DD-MM-YYYY o DD/MM (año según la temporada) -> ISO; si no, None."""
    s = (raw or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return s
    m = re.fullmatch(r"(\d{2})-(\d{2})-(\d{4})", s)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    m = re.fullmatch(r"(\d{2})/(\d{2})", s)
    if m:
        year = start_year if int(m.group(2)) >= 7 else end_year
        return f"{year}-{m.group(2)}-{m.group(1)}"
    return None


def match_key(row, start_year, end_year):
    """Clave entre fuentes de una fila de load_rows(); None si no se jugó o no
    tiene fecha. Los ids de equipo no sirven: cada fuente escribe los nombres
    a su manera ('Pto.del Carmen' / 'PUERTO DEL CARMEN, F.C. "A"')."""
    _id, jornada, date, _time, _home, _away, hs, as_, _venue = row
    iso = iso_date(date, start_year, end_year)
    if hs is None or as_ is None or iso is None:
        return None
    return (jornada_num(jornada), iso, hs, as_)


def pair_matches(lz_rows, lzs_rows, start_year, end_year):
    """Empareja partidos de las dos fuentes. Solo se empareja una clave que
    aparece EXACTAMENTE una vez en cada lado; el resto va al informe.

    Devuelve {'pairs': [(lz_row, lzs_row)], 'ambiguous': [clave],
              'lz_only': [row], 'lzs_only': [row]}."""
    def index(rows):
        by_key = {}
        for row in rows:
            by_key.setdefault(match_key(row, start_year, end_year), []).append(row)
        return by_key

    lz, lzs = index(lz_rows), index(lzs_rows)
    pairs, ambiguous, lz_only, lzs_only = [], [], [], []
    for key in sorted(set(lz) | set(lzs), key=repr):
        a, b = lz.get(key, []), lzs.get(key, [])
        if key is not None and len(a) == 1 and len(b) == 1:
            pairs.append((a[0], b[0]))
        elif key is not None and a and b:
            ambiguous.append(key)
        else:
            lz_only.extend(a)
            lzs_only.extend(b)
    return {"pairs": pairs, "ambiguous": ambiguous, "lz_only": lz_only, "lzs_only": lzs_only}


def overlap_ratio(lz_rows, lzs_rows, start_year, end_year):
    """Solape del guardián: claves comunes / partidos jugados del grupo menor."""
    a = Counter(k for k in (match_key(r, start_year, end_year) for r in lz_rows) if k)
    b = Counter(k for k in (match_key(r, start_year, end_year) for r in lzs_rows) if k)
    menor = min(sum(a.values()), sum(b.values()))
    return sum((a & b).values()) / menor if menor else 0.0


def team_map(pairs):
    """Nombre LZ -> nombre LZS, por mayoría de los partidos emparejados."""
    votos = {}
    for lz_row, lzs_row in pairs:
        for i in (4, 5):
            votos.setdefault(lz_row[i], Counter())[lzs_row[i]] += 1
    return {lz: c.most_common(1)[0][0] for lz, c in votos.items()}


def split_by_teams(pairs, names):
    """Separa los pares cuyos equipos cuadran con `names` (team_map) de los que
    no. Una clave única con otros equipos no es el mismo partido: no se le
    copia el campo y va al log. Devuelve (coherentes, apartados)."""
    ok, bad = [], []
    for lz_row, lzs_row in pairs:
        same = (names.get(lz_row[4]) == lzs_row[4]
                and names.get(lz_row[5]) == lzs_row[5])
        (ok if same else bad).append((lz_row, lzs_row))
    return ok, bad


def load_rows(conn, group_id):
    return conn.execute(
        """SELECT m.id, m.jornada, m.date, m.time, h.name, a.name,
                  m.home_score, m.away_score, m.venue
             FROM matches m JOIN teams h ON h.id=m.home_team_id
             JOIN teams a ON a.id=m.away_team_id
            WHERE m.group_id=? ORDER BY m.id""", (group_id,)).fetchall()


def load_standings(conn, group_id):
    return {r[0]: r[1:] for r in conn.execute(
        """SELECT t.name, s.position, s.points, s.played, s.won, s.drawn, s.lost,
                  s.gf, s.gc FROM standings s JOIN teams t ON t.id=s.team_id
            WHERE s.group_id=? ORDER BY s.position""", (group_id,))}


def standings_diff(lz_table, lzs_table, names):
    """Filas de LZ cuya pareja en LZS (vía `names`) no dice lo mismo."""
    out = []
    for team, row in lz_table.items():
        other = names.get(team)
        if other not in lzs_table:
            out.append(f"{team}: sin fila equivalente en FIFLP")
        elif lzs_table[other] != row:
            out.append(f"{team} {row} | FIFLP {other} {lzs_table[other]}")
    return out


def _group(conn, code):
    return conn.execute(
        """SELECT g.id, s.start_year, s.end_year FROM groups g
             JOIN seasons s ON s.id=g.season_id JOIN categories c ON c.id=g.category_id
            WHERE s.name=? AND UPPER(c.name)=? AND g.code=?""",
        (SEASON, CATEGORY, code)).fetchone()


def build_plan(conn):
    """Un plan por pareja LZn/LZSn presente. Aborta (SystemExit) si una pareja
    no se solapa lo bastante para ser el mismo grupo: nunca se borra a ciegas."""
    plan = []
    for lz_code, lzs_code in PAIRS:
        lz, lzs = _group(conn, lz_code), _group(conn, lzs_code)
        if not lz or not lzs:
            continue
        sy, ey = lz[1], lz[2]
        lz_rows, lzs_rows = load_rows(conn, lz[0]), load_rows(conn, lzs[0])
        ratio = overlap_ratio(lz_rows, lzs_rows, sy, ey)
        if ratio < MIN_SOLAPE:
            raise SystemExit(f"{lz_code}/{lzs_code}: solape {ratio:.2f} < {MIN_SOLAPE}; "
                             "no parecen el mismo grupo. No se toca nada.")
        res = pair_matches(lz_rows, lzs_rows, sy, ey)
        names = team_map(res["pairs"])
        res["pairs"], res["mismatched"] = split_by_teams(res["pairs"], names)
        plan.append({
            "lz": lz_code, "lzs": lzs_code, "lz_id": lz[0], "lzs_id": lzs[0],
            "ratio": ratio, **res,
            "standings": standings_diff(load_standings(conn, lz[0]),
                                        load_standings(conn, lzs[0]),
                                        names),
        })
    return plan


def apply_plan(conn, plan):
    """Copia campo (y hora si falta) a LZ y borra LZS. No hace commit."""
    copiados = 0
    for p in plan:
        for lz_row, lzs_row in p["pairs"]:
            cur = conn.execute(
                """UPDATE matches
                      SET venue=COALESCE(NULLIF(venue,''), ?),
                          time=COALESCE(NULLIF(time,''), ?)
                    WHERE id=? AND (COALESCE(venue,'')='' OR COALESCE(time,'')='')""",
                (lzs_row[8] or None, lzs_row[3] or None, lz_row[0]))
            copiados += cur.rowcount
        delete_group(conn, p["lzs_id"])
    return copiados


def report(plan):
    lines = []
    for p in plan:
        lines.append(f"{SEASON} {p['lz']} ~ {p['lzs']}: solape {p['ratio']:.2f} · "
                     f"{len(p['pairs'])} emparejados · {len(p['ambiguous'])} claves ambiguas · "
                     f"{len(p['lz_only'])} solo en {p['lz']} · {len(p['lzs_only'])} solo en {p['lzs']}")
        for key in p["ambiguous"]:
            lines.append(f"    ambigua {key}")
        for lz_row, lzs_row in p["mismatched"]:
            lines.append(f"    equipos distintos: J{jornada_num(lz_row[1])} {lz_row[2]} "
                         f"{lz_row[4]} {lz_row[6]}-{lz_row[7]} {lz_row[5]} | "
                         f"FIFLP {lzs_row[4]} - {lzs_row[5]}")
        for r in p["lz_only"]:
            lines.append(f"    solo {p['lz']}:  J{jornada_num(r[1])} {r[2]} {r[4]} {r[6]}-{r[7]} {r[5]}")
        for r in p["lzs_only"]:
            lines.append(f"    solo {p['lzs']}: J{jornada_num(r[1])} {r[2]} {r[4]} {r[6]}-{r[7]} {r[5]}")
        for s in p["standings"]:
            lines.append(f"    tabla {s}")
    return lines


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    conn = get_connection()
    plan = build_plan(conn)
    if not plan:
        print("LZS1-4 ya no existen. Nada que hacer.")
        conn.close()
        return
    lines = report(plan)
    with open(LOG_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"\nLog: {LOG_PATH}")
    if not args.write:
        print("Informe: repite con --write para aplicarlo.")
        conn.close()
        return
    copiados = apply_plan(conn, plan)
    conn.commit()
    conn.close()
    print(f"\n{copiados} partidos de LZ con campo/hora de FIFLP; "
          f"borrados {', '.join(p['lzs'] for p in plan)}.")
    from generate_js import main as generate_main
    generate_main()


if __name__ == "__main__":
    main()
