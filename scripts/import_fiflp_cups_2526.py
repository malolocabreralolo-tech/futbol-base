#!/usr/bin/env python3
"""import_fiflp_cups_2526.py — Import FIFLP Copa de Campeones 2025-26 into the
DB (season 2025-2026), additive: only creates the knockout groups BCA1/BCB1/
BCC1 (benjamín) and PCC1 (prebenjamín). Does NOT touch the league data that
came from futbolaspalmas.com.

Consumes scripts/fiflp_cups_2526_raw.json (produced by fetch_fiflp_cups_2526.py
on GitHub Actions). Standings are left to synth_copa_campeones.py. Team names
carry FIFLP knockout tags ('(Clasificado)'/'(Ganador)'/'(P)') that are stripped
to match the 2024-25 cup convention (clean FIFLP-format names).
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import (get_connection, init_db, get_or_create_season,
                get_or_create_category, get_or_create_team,
                get_or_create_group, delete_group_matches, PROJECT_ROOT)

RAW_PATH = os.path.join(PROJECT_ROOT, "scripts", "fiflp_cups_2526_raw.json")
SEASON_NAME, SEASON_START, SEASON_END = "2025-2026", 2025, 2026

_TAG_RE = re.compile(r"\s*\((?:Clasificado|Ganador|P)\)\s*", re.I)


def clean_team_name(name):
    """Strip the FIFLP knockout annotations the cup pages embed in the team
    name ((Clasificado)/(Ganador)/(P)); collapse whitespace."""
    return re.sub(r"\s+", " ", _TAG_RE.sub(" ", name or "")).strip()


def cup_code(cat, group_name):
    """Canonical knockout code: BCA1/BCB1/BCC1 for the 3 benjamín phases,
    PCC1 for the single prebenjamín bracket (prefix BC*/PCC* so the frontend
    isKnockoutGroup and synth_copa_campeones recognise them)."""
    g = (group_name or "").upper()
    if cat == "benjamin":
        m = re.search(r"FASE\s+([A-E])", g)
        return f"BC{m.group(1)}1" if m else "BC1"
    return "PCC1"


def tagged_winner(home, away):
    """Which side carries a (Clasificado)/(Ganador) tag — the team FIFLP marks
    as having advanced (reliable even on penalty-shootout draws). Returns
    'home'/'away'/None."""
    h, a = bool(_TAG_RE.search(home or "")), bool(_TAG_RE.search(away or ""))
    if h and not a:
        return "home"
    if a and not h:
        return "away"
    return None


def corrected_scores(home, away, hs, as_):
    """The (Clasificado)/(Ganador) tag is authoritative for who advanced. If both
    scores are present, it's not a draw, and the score-winner is NOT the tagged
    side, the scraper inverted home/away on that row — return the scores oriented
    to the real winner (magnitudes kept; the tag gives the winner, not the exact
    score). Takes the RAW (still-tagged) names."""
    if hs is None or as_ is None or hs == as_:
        return hs, as_
    tw = tagged_winner(home, away)
    if tw is None:
        return hs, as_
    score_w = "home" if hs > as_ else "away"
    return (as_, hs) if score_w != tw else (hs, as_)


def assert_unique_codes(raw):
    """cup_code falls back to BC1/PCC1 for groups without "FASE X"; two such
    groups would collide and delete_group_matches would wipe the first. Fail
    loudly before importing anything."""
    codes = [cup_code(g["cat"], g["group_name"]) for g in raw]
    dups = sorted({c for c in codes if codes.count(c) > 1})
    if dups:
        raise ValueError(f"cup_code colisión {dups}; revisa group_name/cup_code antes de importar")


def _norm_jornada(num):
    """Knockout jornada label as stored in 2024-25 cups (e.g.
    '06-06-2026 ( Final )'). The scraper already produced it as `num`."""
    return (num or "").strip()


def import_group(conn, g, season_id):
    code = cup_code(g["cat"], g["group_name"])
    cat_id = get_or_create_category(conn, "BENJAMIN" if g["cat"] == "benjamin" else "PREBENJAMIN")
    phase = "Copa de Campeones"
    grp_name = g["group_name"].title()
    full = f"{'BENJAMIN' if g['cat']=='benjamin' else 'PREBENJAMIN'} {phase.upper()} - {grp_name}"

    # collect cleaned matches; skip empty scrape (never wipe with nothing)
    matches = []
    for jor in g["jornadas"]:
        for m in jor["matches"]:
            raw_h, raw_a = m.get("home"), m.get("away")
            home, away = clean_team_name(raw_h), clean_team_name(raw_a)
            if not home or not away or home == away:
                continue
            hs, as_ = corrected_scores(raw_h, raw_a, m.get("hs"), m.get("as"))
            matches.append((_norm_jornada(jor["num"]), home, away, hs, as_))
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
