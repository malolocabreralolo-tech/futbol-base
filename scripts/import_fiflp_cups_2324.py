#!/usr/bin/env python3
"""import_fiflp_cups_2324.py — Import FIFLP Copa de Campeones 2023-24 into the DB
(season 2023-2024), additive: only creates the knockout/group-stage groups
BC1/BC2/BC3 (benjamín, comp 1229) and PCC1 (prebenjamín, comp 1230). Does NOT
touch the league data already imported for 2023-24.

Consumes scripts/fiflp_cups_2324_raw.json (produced by fetch_fiflp_cups_2324.py
on GitHub Actions). Standings are left to synth_copa_campeones.py.

Formato 2023-24: la copa es un GRUPO round-robin ("Ronda 1") por cada grupo, sin
tags de avance. El scraper duplicó la letra de equipo ('ARUCAS C.F. "A" "A"',
'DORAMAS "A", C.D. "A"'); clean_team_name la normaliza al formato canónico de la
DB para no crear equipos duplicados.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import (get_connection, init_db, get_or_create_season,
                get_or_create_category, get_or_create_team,
                get_or_create_group, delete_group_matches, PROJECT_ROOT)

RAW_PATH = os.path.join(PROJECT_ROOT, "scripts", "fiflp_cups_2324_raw.json")
SEASON_NAME, SEASON_START, SEASON_END = "2023-2024", 2023, 2024

_TAG_RE = re.compile(r"\s*\((?:Clasificado|Ganador|P)\)\s*", re.I)


def clean_team_name(name):
    """Normaliza el nombre del equipo: quita tags de avance (por si los hubiera)
    y corrige el artefacto de LETRA DUPLICADA del scraper de cup 2023-24:
      'ARUCAS C.F. "A" "A"'        -> 'ARUCAS C.F. "A"'      (adyacente)
      'DORAMAS "A", C.D. "A"'      -> 'DORAMAS, C.D. "A"'    (metida antes del tipo)
    El formato canónico deja la letra de equipo una sola vez (al final)."""
    n = _TAG_RE.sub(" ", name or "")
    # 1) letra duplicada adyacente: "X" "X" -> "X"
    n = re.sub(r'"([A-Z])"\s+"\1"', r'"\1"', n)
    # 2) letra metida tras el nombre, antes de ", TIPO ... "X"$: quítala
    n = re.sub(r'\s"([A-Z])"(,\s*[^"]*?)"\1"', r'\2"\1"', n)
    return re.sub(r"\s+", " ", n).strip()


def cup_code(cat, group_name):
    """Código canónico: BC1/BC2/BC3 para los grupos benjamín (comp 1229, formato
    GRUPO N), PCC1 para el bracket único prebenjamín (comp 1230). Prefijo BC*/PCC*
    para que isKnockoutGroup y synth_copa_campeones los reconozcan."""
    if cat == "benjamin":
        m = re.search(r"(\d+)", group_name or "")
        return f"BC{m.group(1)}" if m else "BC1"
    return "PCC1"


def assert_unique_codes(raw):
    """cup_code cae a BC1/PCC1 si un grupo no trae número; dos así colisionarían y
    delete_group_matches borraría el primero. Fallar ruidosamente antes."""
    codes = [cup_code(g["cat"], g["group_name"]) for g in raw]
    dups = sorted({c for c in codes if codes.count(c) > 1})
    if dups:
        raise ValueError(f"cup_code colisión {dups}; revisa group_name/cup_code")


def import_group(conn, g, season_id):
    code = cup_code(g["cat"], g["group_name"])
    cat_id = get_or_create_category(conn, "BENJAMIN" if g["cat"] == "benjamin" else "PREBENJAMIN")
    phase = "Copa de Campeones"
    grp_name = g["group_name"].title()
    full = f"{'BENJAMIN' if g['cat']=='benjamin' else 'PREBENJAMIN'} {phase.upper()} - {grp_name}"

    matches = []
    for jor in g["jornadas"]:
        for m in jor["matches"]:
            home, away = clean_team_name(m.get("home")), clean_team_name(m.get("away"))
            if not home or not away or home == away:
                continue
            # 2023-24 es temporada COMPLETA: descartar partidos sin marcador —
            # son fantasmas cross-grupo del scraper (p.ej. PALMAS vs DORAMAS de
            # GRUPO 1 colados en GRUPO 2), no fixtures pendientes legítimos.
            if m.get("hs") is None or m.get("as") is None:
                continue
            matches.append((jor["num"].strip(), home, away, m.get("hs"), m.get("as")))
    if not matches:
        print(f"  [{code}] {grp_name}: scrape vacío — SKIP")
        return None

    group_id = get_or_create_group(
        conn, season_id, cat_id, code, name=grp_name, full_name=full,
        phase=phase, island=g.get("island", "grancanaria"), url="",
        current_jornada=matches[-1][0],
    )

    # pre-resolve team ids before the destructive transaction (get_or_create_team
    # commits internally on create, which would commit our DELETE early)
    team_ids = {}
    for _, home, away, _, _ in matches:
        for nm in (home, away):
            if nm not in team_ids:
                team_ids[nm] = get_or_create_team(conn, nm)

    try:
        conn.execute("DELETE FROM standings WHERE group_id=?", (group_id,))
        delete_group_matches(conn, group_id)
        for jornada, home, away, hs, as_ in matches:
            both = hs is not None and as_ is not None
            conn.execute(
                """INSERT OR REPLACE INTO matches
                   (group_id, jornada, date, time, home_team_id, away_team_id,
                    home_score, away_score, venue)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (group_id, jornada, "", "", team_ids[home], team_ids[away],
                 hs if both else None, as_ if both else None, ""),
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    played = sum(1 for _, _, _, hs, as_ in matches if hs is not None and as_ is not None)
    print(f"  [{code}] {grp_name}: {len(matches)} partidos ({played} jugados)")
    return group_id


def main():
    with open(RAW_PATH, encoding="utf-8") as f:
        raw = json.load(f)
    assert_unique_codes(raw)
    conn = get_connection()
    init_db(conn)
    season_id = get_or_create_season(conn, SEASON_NAME, SEASON_START, SEASON_END)
    print(f"Importando {len(raw)} grupos de cup a {SEASON_NAME}…")
    for g in raw:
        import_group(conn, g, season_id)
    conn.commit()
    conn.close()
    print("Hecho. Ejecuta synth_copa_campeones.py para generar standings.")


if __name__ == "__main__":
    main()
