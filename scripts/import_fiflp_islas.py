#!/usr/bin/env python3
"""import_fiflp_islas.py — Importa las ligas y copas INSULARES de temporadas
anteriores (Lanzarote y Fuerteventura) desde el raw de fetch_fiflp_islas.py.

Aditivo: solo crea los grupos insulares, no toca nada de Gran Canaria ya
importado. Trae clasificación Y partidos con fecha, hora y campo — son ligas de
verdad (jornadas numeradas), no cuadros, incluidas las que se llaman "Copa":
las copas insulares de 2023-24 son liguillas de grupos, con su clasificación.

Códigos siguiendo el convenio ya usado en 2024-25 (LZP1/LZ1n/FV1n/FV2n/PFVn) y
prefijo C* para las competiciones de copa, que también son liguillas:

    1328 Lanzarote Preferente        -> LZP1
    1330 Lanzarote Primera           -> LZ11, LZ12
    1331 Fuerteventura Fase 1        -> FV11, FV12, FV13
    1442 Fuerteventura Fase 2        -> FV21
    1434 Prebenjamín Fuerteventura   -> PFV1, PFV2, PFV3
    1332 Copa Benjamín FV            -> CFV1, CFV2
    1407 Copa Cabildo LZ Preferente  -> CLZP1, CLZP2
    1432 Copa Cabildo LZ Primera     -> CLZ11, CLZ12

Uso:
    ISLAS_SEASON=19 python3 scripts/import_fiflp_islas.py
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import (get_connection, init_db, get_or_create_season,
                get_or_create_category, get_or_create_team,
                get_or_create_group, delete_group_matches, PROJECT_ROOT)
from import_fiflp_cups_2324 import clean_team_name

SEASONS = {
    "17": ("2021-2022", 2021, 2022),
    "18": ("2022-2023", 2022, 2023),
    "19": ("2023-2024", 2023, 2024),
}

# competition_id -> (prefijo de código, fase publicada)
COMP_META = {
    "1328": ("LZP", "Preferente Lanzarote"),
    "1330": ("LZ1", "Primera Lanzarote"),
    "1331": ("FV1", "Fase 1 Fuerteventura"),
    "1442": ("FV2", "Fase 2 Fuerteventura"),
    "1434": ("PFV", "Fuerteventura"),
    "1332": ("CFV", "Copa Fuerteventura"),
    "1407": ("CLZP", "Copa Cabildo Preferente Lanzarote"),
    "1432": ("CLZ1", "Copa Cabildo Primera Lanzarote"),
    # 2021-22 / 2022-23 (mismas competiciones, otros IDs)
    "892": ("LZP", "Preferente Lanzarote"),
    "894": ("LZ1", "Primera Lanzarote"),
    "895": ("FV1", "Fuerteventura"),
    "896": ("CFV", "Copa Fuerteventura"),
    "971": ("CLZ", "Copa Delegación Lanzarote"),
    "1093": ("LZP", "Preferente Lanzarote"),
    "1095": ("LZ1", "Primera Lanzarote"),
    "1096": ("FV1", "Fuerteventura"),
    "1097": ("CFV", "Copa Fuerteventura"),
    "1128": ("CFVD", "Copa Delegación Fuerteventura"),
}


def group_code(competition_id, group_name):
    """Código canónico del grupo: prefijo de la competición + número de grupo."""
    prefix = COMP_META[competition_id][0]
    m = re.search(r"(\d+)", group_name or "")
    return f"{prefix}{m.group(1) if m else '1'}"


def assert_no_collisions(raw, conn, season_id):
    """Dos grupos con el mismo código se pisarían (el import borra por grupo), y
    reutilizar un código ya existente en la temporada machacaría datos de Gran
    Canaria. Fallar antes de tocar nada."""
    codes = [group_code(g["competition_id"], g["group_name"]) for g in raw]
    dups = sorted({c for c in codes if codes.count(c) > 1})
    if dups:
        raise ValueError(f"códigos duplicados en el raw: {dups}")
    existing = {r[0] for r in conn.execute(
        "SELECT code FROM groups WHERE season_id=?", (season_id,))}
    clash = sorted(set(codes) & existing)
    if clash:
        raise ValueError(
            f"estos códigos ya existen en la temporada: {clash}. "
            f"Aditivo significa NO pisar lo importado antes.")


def import_group(conn, g, season_id):
    code = group_code(g["competition_id"], g["group_name"])
    _, phase = COMP_META[g["competition_id"]]
    cat_name = "BENJAMIN" if g["cat"] == "benjamin" else "PREBENJAMIN"
    cat_id = get_or_create_category(conn, cat_name)
    grp_name = (g["group_name"] or "Grupo 1").title()
    full = f"{cat_name} {phase.upper()} - {grp_name}"

    matches = []
    for jor in g["jornadas"]:
        for m in jor.get("matches") or []:
            home, away = clean_team_name(m.get("home")), clean_team_name(m.get("away"))
            if not home or not away or home == away:
                continue
            matches.append((
                str(jor.get("num", "")).strip(), home, away,
                m.get("hs"), m.get("as"),
                m.get("date") or "", m.get("time") or "", m.get("venue") or "",
            ))
    standings = g.get("standings") or []
    if not matches and not standings:
        print(f"  [{code}] {grp_name}: scrape vacío — SKIP")
        return None

    group_id = get_or_create_group(
        conn, season_id, cat_id, code, name=grp_name, full_name=full,
        phase=phase, island=g.get("island", "grancanaria"), url="",
        current_jornada=matches[-1][0] if matches else "",
    )

    # Resolver los ids de equipo ANTES de la transacción destructiva:
    # get_or_create_team hace commit al crear y confirmaría el DELETE a medias.
    names = {n for _, h, a, *_ in matches for n in (h, a)}
    names |= {clean_team_name(r.get("team")) for r in standings}
    team_ids = {n: get_or_create_team(conn, n) for n in sorted(names) if n}

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
                 hs if both else None, as_ if both else None, venue),
            )
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
                 r.get("gf"), r.get("gc"), r.get("df")),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    played = sum(1 for m in matches if m[3] is not None and m[4] is not None)
    print(f"  [{code}] {grp_name} ({phase}): {len(matches)} partidos "
          f"({played} jugados), {len(standings)} equipos")
    return group_id


def main():
    season = os.environ.get("ISLAS_SEASON", "19")
    if season not in SEASONS:
        sys.exit(f"ISLAS_SEASON={season!r} no soportada: {', '.join(SEASONS)}")
    name, start, end = SEASONS[season]
    raw_path = os.path.join(PROJECT_ROOT, "scripts",
                            f"fiflp_islas_{season}_raw.json")
    with open(raw_path, encoding="utf-8") as f:
        raw = json.load(f)

    unknown = sorted({g["competition_id"] for g in raw} - set(COMP_META))
    if unknown:
        sys.exit(f"competiciones sin código asignado en COMP_META: {unknown}")

    conn = get_connection()
    init_db(conn)
    season_id = get_or_create_season(conn, name, start, end)
    assert_no_collisions(raw, conn, season_id)

    print(f"Importando {len(raw)} grupos insulares a {name}…")
    for g in raw:
        import_group(conn, g, season_id)
    conn.commit()
    conn.close()
    print("Hecho. Ejecuta generate_js.py para publicar.")


if __name__ == "__main__":
    main()
