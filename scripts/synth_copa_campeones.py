#!/usr/bin/env python3
"""
synth_copa_campeones.py — Synthesizes standings for all Copa de Campeones
groups (knockout tournaments). FIFLP/futbolaspalmas don't publish league-style
standings for cups, but we want the group card to show participating teams
ranked by who advanced furthest.

Knockout ranking:
  1. Champion (winner of FINAL = last jornada with a single played match)
  2. Runner-up (loser of FINAL)
  3-N. Remaining teams sorted by wins desc, pts desc, GD desc

Detects Copa de Campeones groups by code prefix PCC (prebenjamin) or BC*
(benjamin Copa Campeones A/B/C/D/E). Run after every FIFLP import to keep
standings in sync — FIFLP overwrites them with empty arrays each scrape.
"""
import os
import sys
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from db import get_or_create_team  # noqa


def synth_group(conn, group_id, code):
    cur = conn.cursor()
    matches = cur.execute(
        """SELECT h.name, a.name, m.home_score, m.away_score, m.jornada, m.id
           FROM matches m
           JOIN teams h ON m.home_team_id = h.id
           JOIN teams a ON m.away_team_id = a.id
           WHERE m.group_id = ? ORDER BY m.id""",
        (group_id,),
    ).fetchall()
    if not matches:
        return None

    stats = {}
    def _init(t):
        if t not in stats:
            stats[t] = {"pts": 0, "j": 0, "g": 0, "e": 0, "p": 0, "gf": 0, "gc": 0}

    # Find the final = last played match (chronologically by insertion order),
    # provided there is only one match on that jornada (true final, not a
    # multi-match round).
    played = [m for m in matches if m[2] is not None and m[3] is not None]
    final_winner = final_loser = None
    last_jornada = matches[-1][4]
    if played:
        last_jornada = played[-1][4]
        final_matches = [m for m in played if m[4] == last_jornada]
        if len(final_matches) == 1:
            h, a, hs, aas, _, _ = final_matches[0]
            if hs > aas: final_winner, final_loser = h, a
            elif hs < aas: final_winner, final_loser = a, h

    for h, a, hs, aas, _, _ in matches:
        _init(h); _init(a)
        stats[h]["j"] += 1; stats[a]["j"] += 1
        if hs is not None and aas is not None:
            stats[h]["gf"] += hs; stats[h]["gc"] += aas
            stats[a]["gf"] += aas; stats[a]["gc"] += hs
            if hs > aas:
                stats[h]["pts"] += 3; stats[h]["g"] += 1; stats[a]["p"] += 1
            elif hs < aas:
                stats[a]["pts"] += 3; stats[a]["g"] += 1; stats[h]["p"] += 1
            else:
                stats[h]["pts"] += 1; stats[h]["e"] += 1
                stats[a]["pts"] += 1; stats[a]["e"] += 1

    def rank_key(item):
        team, s = item
        if team == final_winner: return (-100, 0, 0, team)
        if team == final_loser:  return (-99,  0, 0, team)
        return (-s["g"], -s["pts"], -(s["gf"] - s["gc"]), team)

    ranked = sorted(stats.items(), key=rank_key)

    cur.execute("DELETE FROM standings WHERE group_id=?", (group_id,))
    for pos, (team, s) in enumerate(ranked, 1):
        team_id = get_or_create_team(conn, team)
        df = s["gf"] - s["gc"]
        cur.execute(
            """INSERT INTO standings
               (group_id, team_id, position, points, played, won, drawn, lost, gf, gc, gd)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (group_id, team_id, pos, s["pts"], s["j"], s["g"], s["e"], s["p"],
             s["gf"], s["gc"], df),
        )
    cur.execute("UPDATE groups SET current_jornada=? WHERE id=?", (last_jornada, group_id))
    return ranked[0][0] if ranked else None


def main():
    db = os.path.join(ROOT, "futbolbase.db")
    conn = sqlite3.connect(db)
    cur = conn.cursor()
    groups = cur.execute(
        "SELECT id, code FROM groups "
        "WHERE code LIKE 'PCC%' OR code LIKE 'BC%' "
        "ORDER BY code"
    ).fetchall()
    if not groups:
        print("No Copa de Campeones groups in DB.")
        return
    print(f"Synthesizing standings for {len(groups)} Copa de Campeones group(s)…")
    for gid, code in groups:
        champ = synth_group(conn, gid, code)
        if champ:
            print(f"  [{code}] 🏆 {champ}")
    conn.commit()
    conn.close()


if __name__ == "__main__":
    main()
