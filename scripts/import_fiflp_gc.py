#!/usr/bin/env python3
"""import_fiflp_gc.py — Rellena los grupos de GRAN CANARIA de temporadas
antiguas con lo que conserva FIFLP.

A diferencia de las fases isleñas, estos grupos YA EXISTEN en la base: vienen de
Wayback (GC1..GC12, PGC1..PGC4) y en 2021-22 quedaron a medias — GC7 78/156,
GC5 132/156, PGC2/PGC3 132/182 — huecos que se dieron por "techo" sin haber
probado nunca FIFLP.

Por eso este importador NO crea grupos nuevos a ciegas: eso duplicaría la liga
entera bajo códigos distintos. Empareja cada grupo scrapeado con el existente
POR SOLAPAMIENTO DE PLANTILLA (los números de grupo de FIFLP no tienen por qué
coincidir con los de Wayback) y solo escribe si el scrape trae estrictamente más
partidos jugados.

Al escribir CONSERVA LOS NOMBRES DE LA BASE: FIFLP llama 'PAN.ERIA PULIDO SAN
MATEO, C.D.' a lo que el portal llama 'San Mateo'. Escribir el nombre de FIFLP
crearía un equipo duplicado y ese grupo perdería escudo, histórico entre
temporadas y ficha de equipo.

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
from fiflp_names import match_teams, group_overlap, canonical_names

SEASONS = {
    "17gc": ("2021-2022", 2021, 2022),
    "21gc": ("2025-2026", 2025, 2026),
    "18gc": ("2022-2023", 2022, 2023),
    "19gc": ("2023-2024", 2023, 2024),
}

# Por debajo de esto no se considera que sea el mismo grupo.
MIN_OVERLAP = 0.6


def teams_in_matches(g):
    """Nombres tal y como aparecen en el calendario."""
    teams = set()
    for jor in g.get("jornadas") or []:
        for m in jor.get("matches") or []:
            teams.add(clean_team_name(m.get("home")))
            teams.add(clean_team_name(m.get("away")))
    return {t for t in teams if t}


def scraped_teams(g):
    """Plantilla del grupo scrapeado, con los nombres ya limpios.

    OJO: FIFLP escribe el mismo equipo distinto en la tabla y en el calendario
    ('INGENIO B, C.D. "B"' vs 'INGENIO "B", C.D. "B"'), así que este conjunto
    puede traer el mismo club dos veces. Sirve para emparejar grupos, no para
    contar equipos.
    """
    teams = {clean_team_name(r.get("team")) for r in (g.get("standings") or [])}
    return {t for t in teams if t} | teams_in_matches(g)


def existing_groups(conn, season_id):
    """{code: {'id','cat','teams' (nombres de la base), 'played', 'pairs'}}"""
    out = {}
    for gid, code, cat_id in conn.execute(
            "SELECT id, code, category_id FROM groups WHERE season_id=?",
            (season_id,)):
        teams = [r[0] for r in conn.execute(
            """SELECT t.name FROM standings s JOIN teams t ON t.id=s.team_id
               WHERE s.group_id=?""", (gid,))]
        if not teams:
            teams = [r[0] for r in conn.execute(
                """SELECT DISTINCT t.name FROM matches m
                   JOIN teams t ON t.id IN (m.home_team_id, m.away_team_id)
                   WHERE m.group_id=?""", (gid,))]
        played = conn.execute(
            "SELECT COUNT(*) FROM matches WHERE group_id=? AND home_score IS NOT NULL",
            (gid,)).fetchone()[0]
        pairs = {frozenset((h, a)) for h, a in conn.execute(
            """SELECT h.name, v.name FROM matches m
               JOIN teams h ON h.id=m.home_team_id
               JOIN teams v ON v.id=m.away_team_id
               WHERE m.group_id=?""", (gid,)) if h != a}
        out[code] = {"id": gid, "cat": cat_id, "teams": teams,
                     "played": played, "pairs": pairs}
    return out


def scraped_pairs(g):
    """Emparejamientos del grupo scrapeado, sin orden local/visitante."""
    out = set()
    for jor in g.get("jornadas") or []:
        for m in jor.get("matches") or []:
            h, a = clean_team_name(m.get("home")), clean_team_name(m.get("away"))
            if h and a and h != a:
                out.add(frozenset((h, a)))
    return out


# Cuánto del calendario existente tiene que reaparecer en el scrape para
# aceptar que son el mismo grupo.
MIN_PAIR_OVERLAP = 0.7


def pair_overlap(pares_scrape, pares_base, canon):
    """Parte del calendario de la base que reaparece en el scrape, 0..1.

    None si la base no tiene calendario (grupo recién dado de alta): ahí la
    plantilla es la única señal disponible.
    """
    if not pares_base:
        return None
    if not pares_scrape:
        return 0.0
    traducidos = {frozenset(canon.get(n, n) for n in par) for par in pares_scrape}
    return len(traducidos & pares_base) / len(pares_base)


def best_match(teams, existing, pares_scrape=None):
    """Código existente que mejor case, con su ratio de plantilla.

    La plantilla sola NO basta: las fases de una misma temporada se forman con
    los equipos de la fase anterior, así que un grupo de Segunda Fase solapa un
    60% con uno de Primera y el relleno lo pisaría con partidos de otra fase.
    Cuando el grupo de la base ya tiene calendario, se exige además que ese
    calendario reaparezca en el scrape: dos fases distintas no comparten ni un
    emparejamiento con las mismas jornadas.
    """
    best, ratio = None, 0.0
    for code, info in existing.items():
        r = group_overlap(teams, info["teams"])
        if r <= ratio:
            continue
        if pares_scrape is not None:
            # El mapa se construye SOLO con los nombres del calendario: FIFLP
            # escribe el mismo equipo distinto en la tabla y en los partidos, y
            # un emparejamiento uno-a-uno sobre la unión deja media grafía sin
            # traducir — con lo que ningún emparejamiento coincidiría.
            del_calendario = sorted({n for par in pares_scrape for n in par})
            canon = canonical_names(del_calendario, info["teams"], info["teams"])
            solape = pair_overlap(pares_scrape, info["pairs"], canon)
            if solape is not None and solape < MIN_PAIR_OVERLAP:
                continue
        best, ratio = code, r
    return best, ratio


def withdrawn_teams(g):
    """Equipos que juegan partidos pero NO salen en la clasificación oficial.

    Son los retirados: la federación resuelve sus partidos por incomparecencia
    (sin fecha, 1-0 / 0-1) y no los cuenta en la tabla. Importarlos como jugados
    metería partidos que nunca se disputaron e inflaría goles y recuentos.
    Ejemplo real: Las Majoreras B en el grupo 5 de Primera GC 2021-22, con la
    tabla dando J22 a todos los demás y J0 a él.
    """
    tabla = [clean_team_name(r.get("team")) for r in (g.get("standings") or [])]
    tabla = [t for t in tabla if t]
    if not tabla:
        return set()                  # sin tabla oficial no se puede afirmar
    # Solo los nombres del calendario: mezclar los de la tabla haría que el
    # emparejamiento uno-a-uno dejara sueltas sus propias variantes de escritura
    # y medio grupo pasaría por retirado.
    en_partidos = teams_in_matches(g)
    emparejados = match_teams(sorted(en_partidos), tabla)
    return {t for t in en_partidos if t not in emparejados}


def is_real_match(m, retirados):
    """¿Cuenta como partido disputado?"""
    if m.get("hs") is None or m.get("as") is None:
        return False
    return not (retirados & {clean_team_name(m.get("home")),
                             clean_team_name(m.get("away"))})


def count_played(g, retirados=None):
    retirados = withdrawn_teams(g) if retirados is None else retirados
    return sum(1 for jor in (g.get("jornadas") or [])
               for m in (jor.get("matches") or [])
               if is_real_match(m, retirados))



def write_group(conn, g, season_id, code, cat_id, canon):
    """Reemplaza partidos y clasificación de un grupo EXISTENTE."""
    retirados = withdrawn_teams(g)
    matches = []
    for jor in g.get("jornadas") or []:
        for m in jor.get("matches") or []:
            home = canon.get(clean_team_name(m.get("home")))
            away = canon.get(clean_team_name(m.get("away")))
            if not home or not away or home == away:
                continue
            # El emparejamiento se conserva en el calendario, pero sin marcador:
            # una incomparecencia no es un partido jugado.
            real = is_real_match(m, retirados)
            matches.append((str(jor.get("num", "")).strip(), home, away,
                            m.get("hs") if real else None,
                            m.get("as") if real else None,
                            m.get("date") or "",
                            m.get("time") or "", m.get("venue") or ""))
    standings = g.get("standings") or []
    names = {n for _, h, a, *_ in matches for n in (h, a)}
    names |= {canon.get(clean_team_name(r.get("team"))) for r in standings}
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
            name = canon.get(clean_team_name(r.get("team")))
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
    season_teams = [r[0] for r in conn.execute(
        """SELECT DISTINCT t.name FROM teams t
           JOIN standings s ON s.team_id=t.id
           JOIN groups g ON g.id=s.group_id WHERE g.season_id=?""",
        (season_id,))]

    print(f"{'APLICANDO' if args.write else 'INFORME (nada se escribe)'} · "
          f"{name} · {len(raw)} grupos scrapeados vs {len(existing)} en la base\n")
    ganancia = 0
    for g in raw:
        teams = scraped_teams(g)
        code, ratio = best_match(teams, existing, scraped_pairs(g))
        nuevo = count_played(g)
        etiqueta = f"{g['competition_name'][:24]:24} {g['group_name']:9}"
        if not code or ratio < MIN_OVERLAP:
            print(f"  {etiqueta} | {nuevo:3}j | SIN PAREJA (mejor {code}={ratio:.0%}) "
                  f"— grupo nuevo, no se toca")
            continue
        previo = existing_played_count(conn, season_id, code)
        if previo >= nuevo:
            print(f"  {etiqueta} | {nuevo:3}j | ↔ {code} ({ratio:.0%}) "
                  f"tiene {previo}j — SKIP")
            continue
        canon = canonical_names(teams, existing[code]["teams"], season_teams)
        nuevos_nombres = sorted(n for n, c in canon.items() if n == c
                                and n not in existing[code]["teams"])
        print(f"  {etiqueta} | {nuevo:3}j | → {code} ({ratio:.0%}) "
              f"tenía {previo}j · GANA {nuevo - previo}")
        if nuevos_nombres:
            print(f"      equipos sin pareja en la base: {', '.join(nuevos_nombres)}")
        ganancia += nuevo - previo
        if args.write:
            write_group(conn, g, season_id, code, existing[code]["cat"], canon)

    print(f"\nPartidos jugados que se ganarían: {ganancia}")
    if not args.write and ganancia:
        print("Repite con --write para aplicarlo.")
    conn.close()


if __name__ == "__main__":
    main()
