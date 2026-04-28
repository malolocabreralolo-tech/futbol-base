#!/usr/bin/env python3
"""Refresh the scorers table by scraping the goleadores-base.php endpoint
for every group in the current season. Doesn't touch standings/matches/goals.

Usage: python3 scripts/refresh_scorers.py [--limit N] [--code CODE]
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import get_connection, get_or_create_team
from fetch_futbolaspalmas import fetch, fetch_top_scorers, parse_top_scorers, extract_categoria, DELAY


def refresh_one(conn, group_id, code, name, url):
    if not url:
        print(f"  [{code}] sin URL, salto")
        return 0
    try:
        clasi_html = fetch(url.rstrip("/") + "/mostrar_clasi.php")
    except Exception as e:
        print(f"  [{code}] error clasi: {e}")
        return 0

    cat, clasi = extract_categoria(clasi_html)
    if not cat or not clasi:
        print(f"  [{code}] sin categoria/clasificacion en clasi page")
        return 0

    try:
        html = fetch_top_scorers(cat, clasi)
    except Exception as e:
        print(f"  [{code}] error goleadores-base: {e}")
        return 0

    rows = parse_top_scorers(html)
    if not rows:
        print(f"  [{code}] tabla vacía")
        return 0

    conn.execute("DELETE FROM scorers WHERE group_id=?", (group_id,))
    for player, team, jugados, goles in rows:
        team_id = get_or_create_team(conn, team)
        conn.execute(
            "INSERT INTO scorers (group_id, player_name, team_id, goals, games) VALUES (?,?,?,?,?)",
            (group_id, player, team_id, goles, jugados),
        )
    conn.commit()
    print(f"  [{code}] {name}: {len(rows)} jugadores actualizados")
    return len(rows)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--limit", type=int, help="solo los primeros N grupos")
    p.add_argument("--code", help="solo el grupo con este code (ej: A1)")
    args = p.parse_args()

    conn = get_connection()
    rows = list(conn.execute(
        """SELECT g.id, g.code, g.name, g.url
           FROM groups g
           JOIN seasons s ON g.season_id = s.id
           WHERE s.is_current=1
           ORDER BY g.code"""
    ))
    if args.code:
        rows = [r for r in rows if r[1] == args.code]
    if args.limit:
        rows = rows[: args.limit]

    print(f"Grupos a refrescar: {len(rows)}")
    total = 0
    for i, (gid, code, name, url) in enumerate(rows, 1):
        n = refresh_one(conn, gid, code, name, url)
        total += n
        if i < len(rows):
            time.sleep(DELAY)
    print(f"\nTotal: {total} entradas en scorers actualizadas para {len(rows)} grupos")


if __name__ == "__main__":
    main()
