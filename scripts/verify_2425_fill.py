#!/usr/bin/env python3
"""verify_2425_fill.py — Verificación post-scrape del relleno FIFLP 2024-25.

Implementa el checklist del review pre-vuelo. Compara la DB actual contra el
baseline (/tmp/baseline_2425.json, capturado ANTES del import) y usa la tabla
de clasificación de FIFLP (no ofuscada, fiable) para detectar corrupción de
marcadores. NO publica; solo informa y devuelve exit!=0 si hay algo que abortar.

Uso:
    python3 scripts/verify_2425_fill.py [baseline.json]
"""
import json
import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "futbolbase.db")
BASELINE = sys.argv[1] if len(sys.argv) > 1 else "/tmp/baseline_2425.json"
SEASON = "2024-2025"
GAP_GROUPS = {"P2", "P5", "P7", "P13", "P14", "PGC1", "PGC2", "PGC3", "PGC4",
              "PFV1", "PFV2", "PFV3", "PLZ1", "PLZ2"}


def main():
    conn = sqlite3.connect(DB)
    base = json.load(open(BASELINE)) if os.path.exists(BASELINE) else {}

    rows = conn.execute(
        """SELECT g.id, g.code, COUNT(m.id) total,
                  SUM(CASE WHEN m.home_score IS NOT NULL THEN 1 ELSE 0 END) played
           FROM seasons s JOIN groups g ON g.season_id=s.id
           LEFT JOIN matches m ON m.group_id=g.id
           WHERE s.name=? GROUP BY g.id ORDER BY g.code""", (SEASON,)).fetchall()

    regressions, wins, fallback_codes = [], [], []
    absurd = conn.execute(
        """SELECT COUNT(*) FROM matches m JOIN groups g ON g.id=m.group_id
           JOIN seasons s ON s.id=g.season_id
           WHERE s.name=? AND (m.home_score>50 OR m.away_score>50)""", (SEASON,)).fetchone()[0]
    half = conn.execute(
        """SELECT COUNT(*) FROM matches m JOIN groups g ON g.id=m.group_id
           JOIN seasons s ON s.id=g.season_id
           WHERE s.name=? AND ((m.home_score IS NULL) != (m.away_score IS NULL))""",
        (SEASON,)).fetchone()[0]

    print(f"{'code':7} {'played':>12} {'total':>5}  note")
    total_new = total_old = 0
    for gid, code, total, played in rows:
        played = played or 0
        b = base.get(code, {})
        bp = b.get("played", 0)
        total_new += played
        total_old += bp
        delta = played - bp
        note = ""
        if delta < 0:
            regressions.append((code, bp, played))
            note = f"REGRESSION {bp}->{played}"
        elif delta > 0:
            note = f"+{delta} ({bp}->{played})"
            if code in GAP_GROUPS:
                wins.append((code, bp, played, total))
        if code.startswith("X") or code == "X":
            fallback_codes.append(code)
        flag = "  <-- " + note if note else ""
        if code in GAP_GROUPS or delta != 0:
            print(f"{code:7} {played:>5}/{total:<6}{'':1}{total:>0}{flag}")

    # Standings-vs-matches divergence + plausible-corruption (per-team GF) SOLO
    # en los grupos que ESTE import cambió (played != baseline) — así no se
    # mezcla el ruido preexistente de otros comps (p.ej. FV* benjamín del H2).
    # Over-read (match GF sum > clasif GF) = concatenación/swap; under-read es
    # esperable por la ofuscación. La corrupción es WARNING (spot-check manual),
    # no abort: son marcadores recién rellenados, mejores que nada.
    changed = {code for _g, code, _t, pl in rows
               if (pl or 0) != base.get(code, {}).get("played", 0)}
    corruption = []
    divergence = []
    for gid, code, total, played in rows:
        played = played or 0
        if played == 0 or code not in changed:
            continue
        st = conn.execute(
            "SELECT team_id, played, gf FROM standings WHERE group_id=?", (gid,)).fetchall()
        if not st:
            continue
        st_played_sum = sum(r[1] or 0 for r in st)
        # divergence: official table (st_played_sum/2 matches) vs stored matches
        div = st_played_sum - 2 * played
        if div > 0:
            divergence.append((code, st_played_sum // 2, played, div))
        # per-team GF from stored matches
        gf_by_team = {}
        for hid, aid, hs, as_ in conn.execute(
            """SELECT home_team_id, away_team_id, home_score, away_score
               FROM matches WHERE group_id=? AND home_score IS NOT NULL""", (gid,)):
            gf_by_team[hid] = gf_by_team.get(hid, 0) + hs
            gf_by_team[aid] = gf_by_team.get(aid, 0) + as_
        for team_id, _pl, gf in st:
            mgf = gf_by_team.get(team_id, 0)
            if gf is not None and mgf > gf + 1:  # +1 tolerancia
                corruption.append((code, team_id, mgf, gf))

    print("\n========= RESUMEN =========")
    print(f"Total jugados 2024-25: {total_old} -> {total_new}  (delta {total_new-total_old:+d})")
    print(f"Wins (gap groups mejorados): {len(wins)}")
    for code, bp, np_, tot in wins:
        print(f"   {code}: {bp} -> {np_} / {tot}")
    print(f"Absurdos (>50): {absurd} | medios marcadores (uno null): {half}")
    print(f"Códigos fallback 'X' (mapeo CODE_PREFIX fallido): {fallback_codes or 'ninguno'}")
    print(f"Divergencia clasif>resultados (esperable por sub-lectura): {len(divergence)} grupos")
    for code, st_m, mt, div in sorted(divergence, key=lambda x: -x[3])[:8]:
        print(f"   {code}: clasif={st_m} partidos vs resultados={mt} (faltan {div//1})")
    print(f"\nREGRESIONES (ABORTAR si las hay): {len(regressions)}")
    for code, bp, np_ in regressions:
        print(f"   {code}: {bp} -> {np_}")
    print(f"CORRUPCIÓN sospechosa en grupos cambiados (match GF > clasif GF) "
          f"[WARNING, spot-check]: {len(corruption)} equipos")
    for code, tid, mgf, gf in corruption[:12]:
        nm = conn.execute("SELECT name FROM teams WHERE id=?", (tid,)).fetchone()
        print(f"   {code}: {nm[0] if nm else tid} matchGF={mgf} > clasifGF={gf}")

    # ABORT duro solo: regresiones, absurdos>50, medios marcadores, códigos
    # fallback 'X'. La corrupción over-read y la divergencia son para revisar.
    hard_ok = not regressions and absurd == 0 and half == 0 and not fallback_codes
    print("\nVEREDICTO:",
          "OK ✓ (sin bloqueantes; revisar warnings de corrupción si los hay)" if hard_ok
          else "ABORTAR ✗ (regresión/absurdo/fallback — ver arriba)")
    if corruption:
        print("  (corrupción = WARNING: revisar/spot-check esos marcadores recién rellenados)")
    return 0 if hard_ok else 1


if __name__ == "__main__":
    sys.exit(main())
