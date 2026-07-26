#!/usr/bin/env python3
"""import_fiflp_gc.py — Rellena los grupos de GRAN CANARIA de temporadas
antiguas con lo que conserva FIFLP.

A diferencia de las fases isleñas, estos grupos YA EXISTEN en la base: vienen de
Wayback (GC1..GC12, PGC1..PGC4) y en 2021-22 quedaron a medias — GC7 78/156,
GC5 132/156, PGC2/PGC3 132/182 — huecos que se dieron por "techo" sin haber
probado nunca FIFLP.

Por eso este importador NO crea grupos nuevos a ciegas: eso duplicaría la liga
entera bajo códigos distintos. Empareja cada grupo scrapeado con el existente
POR SOLAPAMIENTO DE EQUIPOS (los números de grupo de FIFLP no tienen por qué
coincidir con los de Wayback) y solo escribe si el scrape trae estrictamente más
partidos jugados, con el guard `existing_played_count` que ya usan los demás
importadores.

Uso:
    ISLAS_SEASON=17gc python3 scripts/import_fiflp_gc.py            # informe
    ISLAS_SEASON=17gc python3 scripts/import_fiflp_gc.py --write    # importa
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import (get_connection, init_db, get_or_create_season,
                get_or_create_team, get_or_create_group,
                delete_group_matches, existing_played_count, PROJECT_ROOT)
from import_fiflp_cups_2324 import clean_team_name

SEASONS = {
    "17gc": ("2021-2022", 2021, 2022),
    "18gc": ("2022-2023", 2022, 2023),
    "19gc": ("2023-2024", 2023, 2024),
}

# Por debajo de esto no se considera que sea el mismo grupo.
MIN_OVERLAP = 0.6


def norm(name):
    """Nombre comparable: sin tipo de club, puntuación ni mayúsculas."""
    n = clean_team_name(name or "").upper()
    for token in ('C.F.', 'C.D.', 'U.D.', 'A.D.', 'S.D.', 'CF', 'CD', 'UD',
                  'AD', 'SD', 'CLUB', 'ATLETICO', 'ATCO.', 'REAL'):
        n = n.replace(token, ' ')
    return ' '.join(n.replace('"', ' ').replace(',', ' ').replace('.', ' ').split())


def scraped_teams(g):
    teams = {norm(r.get("team")) for r in (g.get("standings") or [])}
    for jor in g.get("jornadas") or []:
        for m in jor.get("matches") or []:
            teams.add(norm(m.get("home")))
            teams.add(norm(m.get("away")))
    return {t for t in teams if t}


def existing_groups(conn, season_id):
    """{code: (group_id, cat_id, {equipos normalizados}, jugados)}"""
    out = {}
    for gid, code, cat_id in conn.execute(
            "SELECT id, code, category_id FROM groups WHERE season_id=?",
            (season_id,)):
        teams = {norm(r[0]) for r in conn.execute(
            """SELECT t.name FROM standings s JOIN teams t ON t.id=s.team_id
               WHERE s.group_id=?""", (gid,))}
        if not teams:
            teams = {norm(r[0]) for r in conn.execute(
                """SELECT DISTINCT t.name FROM matches m
                   JOIN teams t ON t.id IN (m.home_team_id, m.away_team_id)
                   WHERE m.group_id=?""", (gid,))}
        played = conn.execute(
            "SELECT COUNT(*) FROM matches WHERE group_id=? AND home_score IS NOT NULL",
            (gid,)).fetchone()[0]
        out[code] = (gid, cat_id, teams, played)
    return out


def best_match(teams, existing):
    """Código existente que mejor solapa, con su ratio. (None, 0) si ninguno."""
    best, ratio = None, 0.0
    for code, (_, _, ex_teams, _) in existing.items():
        if not ex_teams or not teams:
            continue
        r = len(teams & ex_teams) / min(len(teams), len(ex_teams))
        if r > ratio:
            best, ratio = code, r
    return best, ratio


def count_played(g):
    return sum(1 for jor in (g.get("jornadas") or [])
               for m in (jor.get("matches") or [])
               if m.get("hs") is not None and m.get("as") is not None)


def write_group(conn, g, season_id, code, cat_id):
    """Reemplaza partidos y clasificación de un grupo EXISTENTE."""
    matches = []
    for jor in g.get("jornadas") or []:
        for m in jor.get("matches") or []:
            home, away = clean_team_name(m.get("home")), clean_team_name(m.get("away"))
            if not home or not away or home == away:
                continue
            matches.append((str(jor.get("num", "")).strip(), home, away,
                            m.get("hs"), m.get("as"), m.get("date") or "",
                            m.get("time") or "", m.get("venue") or ""))
    standings = g.get("standings") or []
    names = {n for _, h, a, *_ in matches for n in (h, a)}
    names |= {clean_team_name(r.get("team")) for r in standings}
    team_ids = {n: get_or_create_team(conn, n) for n in sorted(names) if n}

    group_id = get_or_create_group(
        conn, season_id, cat_id, code,
        current_jornada=matches[-1][0] if matches else "")
    try:
        conn.execute("DELETE FROM standings WHERE group_id=?", (group_id,))
        delete_group_matches(conn, group_id)
        for jornada, home, away, hs, as_, date, time, venue in matches:
            both = hs is not None and as_ is not None
            conn.execute(
                """INSERT OR REPLACE INTO matches
                   (group_id, jornada, date, time, home_team_id, away_team_id,
                    home_score, away_score, venue)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (group_id, jornada, date, time, team_ids[home], team_ids[away],
                 hs if both else None, as_ if both else None, venue))
        for r in standings:
            name = clean_team_name(r.get("team"))
            if not name:
                continue
            conn.execute(
                """INSERT INTO standings
                   (group_id, team_id, position, points, played, won, drawn,
                    lost, gf, gc, gd)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (group_id, team_ids[name], r.get("pos"), r.get("pts"),
                 r.get("j"), r.get("g"), r.get("e"), r.get("p"),
                 r.get("gf"), r.get("gc"), r.get("df")))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return len(matches)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--write", action="store_true",
                    help="aplica los cambios (por defecto solo informa)")
    args = ap.parse_args()

    season_key = os.environ.get("ISLAS_SEASON", "17gc")
    if season_key not in SEASONS:
        sys.exit(f"ISLAS_SEASON={season_key!r}; opciones: {', '.join(SEASONS)}")
    name, start, end = SEASONS[season_key]
    raw_path = os.path.join(PROJECT_ROOT, "scripts",
                            f"fiflp_islas_{season_key}_raw.json")
    with open(raw_path, encoding="utf-8") as f:
        raw = json.load(f)

    conn = get_connection()
    init_db(conn)
    season_id = get_or_create_season(conn, name, start, end)
    existing = existing_groups(conn, season_id)

    print(f"{'APLICANDO' if args.write else 'INFORME (nada se escribe)'} · "
          f"{name} · {len(raw)} grupos scrapeados vs {len(existing)} en la base\n")
    ganancia = 0
    for g in raw:
        teams = scraped_teams(g)
        code, ratio = best_match(teams, existing)
        nuevo = count_played(g)
        etiqueta = f"{g['competition_name'][:26]:26} {g['group_name']:9}"
        if not code or ratio < MIN_OVERLAP:
            print(f"  {etiqueta} | {nuevo:3}j | SIN PAREJA (mejor {code}={ratio:.0%}) "
                  f"— grupo nuevo, no se toca")
            continue
        previo = existing_played_count(conn, season_id, code)
        if previo >= nuevo:
            print(f"  {etiqueta} | {nuevo:3}j | ↔ {code} ({ratio:.0%}) "
                  f"tiene {previo}j — SKIP")
            continue
        print(f"  {etiqueta} | {nuevo:3}j | → {code} ({ratio:.0%}) "
              f"tenía {previo}j · GANA {nuevo - previo}")
        ganancia += nuevo - previo
        if args.write:
            write_group(conn, g, season_id, code, existing[code][1])

    print(f"\nPartidos jugados que se ganarían: {ganancia}")
    if not args.write and ganancia:
        print("Repite con --write para aplicarlo.")
    conn.close()


if __name__ == "__main__":
    main()
