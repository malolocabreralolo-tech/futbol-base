#!/usr/bin/env python3
"""
import_fiflp.py — importa fiflp_raw.json en futbolbase.db.

Mapea competiciones/grupos de FIFLP a códigos internos de la app,
y hace upsert de grupos, clasificaciones y partidos en SQLite.

Uso:
    python3 scripts/import_fiflp.py
"""

import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import (get_connection, init_db, get_or_create_season,
                get_or_create_category, get_or_create_team,
                get_or_create_group, PROJECT_ROOT, DB_PATH)

RAW_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fiflp_raw.json")

SEASON_NAME  = "2025/2026"
SEASON_START = 2025
SEASON_END   = 2026

# competition_id → código interno (prefijo único por competición)
CODE_PREFIX = {
    "54422885": "P",    # Benjamín Fase Previa GC
    "54422953": "A",    # Benjamín Fase Liga A GC
    "54422954": "B",    # Benjamín Fase Liga B GC
    "54422955": "C",    # Benjamín Fase Liga C GC
    "54422884": "LZA",  # Benjamín Lanzarote Fase 1
    "54422886": "LZB",  # Benjamín Lanzarote Fase 2
    "54422887": "FVA",  # Benjamín Fuerteventura Fase 1
    "54422890": "FVB",  # Benjamín Fuerteventura Fase 2
    "54422888": "PGC",  # Prebenjamín Gran Canaria
    "54422959": "PLZ",  # Prebenjamín Lanzarote
    "54422889": "PFV",  # Prebenjamín Fuerteventura
}

CAT_MAP = {
    "benjamin":    "BENJAMIN",
    "prebenjamin": "PREBENJAMIN",
}

FULL_PHASE_MAP = {
    "54422885": "Fase Previa GC",
    "54422953": "Fase Liga A GC",
    "54422954": "Fase Liga B GC",
    "54422955": "Fase Liga C GC",
    "54422884": "Lanzarote Fase 1",
    "54422886": "Lanzarote Fase 2",
    "54422887": "Fuerteventura Fase 1",
    "54422890": "Fuerteventura Fase 2",
    "54422888": "Gran Canaria",
    "54422959": "Lanzarote",
    "54422889": "Fuerteventura",
}


def group_num(group_name):
    """Extrae número de 'GRUPO 1' → '1'. Si no hay número devuelve ''."""
    m = re.search(r"\d+", group_name)
    return m.group(0) if m else ""


def current_jornada_for_group(jornadas):
    """
    Devuelve el número de jornada a mostrar como 'actual':
    - Última jornada con partidos jugados, o
    - Primera jornada pendiente si no se ha jugado ninguna.
    """
    last_played = None
    first_unplayed = None
    for jor in jornadas:
        num = jor["num"]
        played = any(m["hs"] is not None for m in jor["matches"])
        upcoming = any(m["hs"] is None and m["home"] for m in jor["matches"])
        if played:
            last_played = num
        elif upcoming and first_unplayed is None:
            first_unplayed = num
    return last_played or first_unplayed


def fmt_date(fiflp_date):
    """Convierte '15-12-2025' → '15/12' para la app."""
    if not fiflp_date:
        return ""
    parts = fiflp_date.split("-")
    if len(parts) == 3:
        return f"{parts[0]}/{parts[1]}"
    return fiflp_date


def import_group(conn, g, season_id):
    """Importa un grupo completo (clasificación + partidos) al DB."""
    comp_id  = g["competition_id"]
    prefix   = CODE_PREFIX.get(comp_id, "X")
    num      = group_num(g["group_name"])
    code     = f"{prefix}{num}"

    cat_name = CAT_MAP.get(g["cat"], "BENJAMIN")
    cat_id   = get_or_create_category(conn, cat_name)

    phase    = FULL_PHASE_MAP.get(comp_id, g["phase"])
    grp_name = g["group_name"].title()   # "Grupo 1"
    full_name = f"BENJAMÍN {phase.upper()} - {g['group_name']}" if g["cat"] == "benjamin" \
                else f"PREBENJAMÍN {phase.upper()} - {g['group_name']}"

    cur_jor = current_jornada_for_group(g["jornadas"])

    group_id = get_or_create_group(
        conn, season_id, cat_id, code,
        name=grp_name,
        full_name=full_name,
        phase=phase,
        island=g["island"],
        url="",
        current_jornada=f"Jornada {cur_jor}" if cur_jor else None,
    )

    # Limpiar datos anteriores de este grupo
    conn.execute("DELETE FROM standings WHERE group_id=?", (group_id,))
    conn.execute("DELETE FROM matches   WHERE group_id=?", (group_id,))
    conn.commit()

    # Clasificación
    for s in g["standings"]:
        team_id = get_or_create_team(conn, s["team"])
        conn.execute(
            """INSERT OR REPLACE INTO standings
               (group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (group_id, team_id,
             s["pos"], s["pts"], s["j"], s["g"], s["e"], s["p"],
             s["gf"] or 0, s["gc"] or 0, s["df"] or 0),
        )
    conn.commit()

    # Partidos de todas las jornadas
    for jor in g["jornadas"]:
        for m in jor["matches"]:
            if not m["home"] or not m["away"]:
                continue
            home_id = get_or_create_team(conn, m["home"])
            away_id = get_or_create_team(conn, m["away"])
            # Solo almacenar marcador si ambos goles están presentes
            hs = m.get("hs")
            as_ = m.get("as")
            score_h = hs if (hs is not None and as_ is not None) else None
            score_a = as_ if (hs is not None and as_ is not None) else None
            conn.execute(
                """INSERT OR IGNORE INTO matches
                   (group_id, jornada, date, time, home_team_id, away_team_id,
                    home_score, away_score, venue)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (group_id, jor["num"],
                 fmt_date(m.get("date", "")), m.get("time", ""),
                 home_id, away_id,
                 score_h, score_a,
                 m.get("venue", "")),
            )
    conn.commit()

    played = sum(1 for j in g["jornadas"] for m in j["matches"] if m["hs"] is not None)
    total  = sum(len(j["matches"]) for j in g["jornadas"])
    print(f"  [{code}] {grp_name} ({phase}): "
          f"{len(g['standings'])}eq | {total}p ({played}j) | jornada={cur_jor}")


def main():
    if not os.path.exists(RAW_PATH):
        print(f"ERROR: {RAW_PATH} no encontrado. Ejecuta fetch_fiflp.py primero.")
        sys.exit(1)

    with open(RAW_PATH, encoding="utf-8") as f:
        raw = json.load(f)

    groups_with_data = [
        g for g in raw
        if g.get("standings") or any(
            m["hs"] is not None
            for j in g.get("jornadas", [])
            for m in j["matches"]
        )
    ]

    print(f"Importando {len(groups_with_data)}/{len(raw)} grupos con datos...")

    conn = get_connection()
    init_db(conn)

    season_id = get_or_create_season(conn, SEASON_NAME, SEASON_START, SEASON_END, is_current=True)
    conn.execute("UPDATE seasons SET is_current=0 WHERE id!=?", (season_id,))
    conn.execute("UPDATE seasons SET is_current=1 WHERE id=?", (season_id,))
    conn.commit()

    for g in groups_with_data:
        import_group(conn, g, season_id)

    conn.close()
    print(f"\n✅ {len(groups_with_data)} grupos importados en {DB_PATH}")


if __name__ == "__main__":
    main()
