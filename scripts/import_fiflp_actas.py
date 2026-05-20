"""Import a fiflp_actas_<season>_raw.json into the DB.

Idempotent: for each acta whose match is reconciled, DELETE the prior rows from
appearances/match_events/match_staff for that match and re-insert. Unmatched
actas are appended to scripts/fiflp_actas_unmatched.json (deduplicated by
cod_acta key).

CLI: python3 scripts/import_fiflp_actas.py path/to/raw.json [--db futbolbase.db]
"""
import json
import os
import re
import sqlite3
import sys
import unicodedata

from scripts.acta_reconciler import reconcile_acta

UNMATCHED_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fiflp_actas_unmatched.json")


# ---------------------------------------------------------------------------
# Player helpers
# ---------------------------------------------------------------------------

def _norm_player(name: str) -> str:
    """Accent-strip, uppercase, collapse whitespace — canonical player key."""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"\s+", " ", s).strip().upper()
    return s


def _get_or_create_player(conn, name: str) -> int:
    norm = _norm_player(name)
    r = conn.execute("SELECT id FROM players WHERE norm_name=?", (norm,)).fetchone()
    if r:
        return r[0]
    cur = conn.execute(
        "INSERT INTO players(full_name, norm_name) VALUES(?, ?)", (name, norm)
    )
    return cur.lastrowid


def _team_id_by_side(conn, mid: int, side: str) -> int:
    col = "home_team_id" if side == "home" else "away_team_id"
    return conn.execute(f"SELECT {col} FROM matches WHERE id=?", (mid,)).fetchone()[0]


# ---------------------------------------------------------------------------
# Core import logic for a single acta
# ---------------------------------------------------------------------------

def _import_one(conn, cod_acta: int, acta: dict) -> bool:
    """Import one parsed acta into the DB. Returns True if reconciled."""
    mid = reconcile_acta(conn, acta.get("header") or {})
    if not mid:
        return False

    # Mark the match with its acta code
    conn.execute("UPDATE matches SET cod_acta=? WHERE id=?", (cod_acta, mid))

    # Idempotency: wipe prior rows for this match before re-inserting
    conn.execute("DELETE FROM appearances  WHERE match_id=?", (mid,))
    conn.execute("DELETE FROM match_events WHERE match_id=?", (mid,))
    conn.execute("DELETE FROM match_staff  WHERE match_id=?", (mid,))

    # Insert appearances and build name -> (player_id, team_id) map
    name_to_pid: dict = {}
    for side in ("home", "away"):
        team_id = _team_id_by_side(conn, mid, side)
        for p in (acta.get("lineups") or {}).get(side, []):
            pid = _get_or_create_player(conn, p["name"])
            name_to_pid[(side, p["name"])] = (pid, team_id)
            conn.execute(
                """INSERT INTO appearances
                       (match_id, team_id, player_id, dorsal, role, goals, yellow, red)
                   VALUES (?, ?, ?, ?, ?, 0, 0, 0)""",
                (mid, team_id, pid, p.get("dorsal"), p["role"]),
            )

    # Insert events and bump appearance counters
    # pair_idx -> first event id (for sub_in/sub_out linking)
    event_id_by_pair: dict = {}

    for ev in acta.get("events") or []:
        side = ev["side"]
        key = (side, ev["player_name"])

        # Player in event but not in lineup (e.g. scorer who was unlisted sub)
        if key not in name_to_pid:
            pid = _get_or_create_player(conn, ev["player_name"])
            team_id = _team_id_by_side(conn, mid, side)
            conn.execute(
                """INSERT OR IGNORE INTO appearances
                       (match_id, team_id, player_id, dorsal, role, goals, yellow, red)
                   VALUES (?, ?, ?, NULL, 'sub', 0, 0, 0)""",
                (mid, team_id, pid),
            )
            name_to_pid[key] = (pid, team_id)

        pid, team_id = name_to_pid[key]
        kind = ev["kind"]

        # Determine pair_id for sub_in/sub_out pairs
        pair_id = None
        pair_idx = ev.get("pair_idx")
        if pair_idx is not None:
            other = event_id_by_pair.get(pair_idx)
            if other is not None:
                pair_id = other

        cur = conn.execute(
            """INSERT INTO match_events
                   (match_id, team_id, player_id, kind, minute, goal_type, pair_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (mid, team_id, pid, kind, ev.get("minute"), ev.get("goal_type"), pair_id),
        )
        new_id = cur.lastrowid

        # Record first event of a pair; link second event's pair_id backward
        if pair_idx is not None:
            if pair_idx not in event_id_by_pair:
                # This is the first event of the pair
                event_id_by_pair[pair_idx] = new_id
            else:
                # This is the second event; update the first to point back
                conn.execute(
                    "UPDATE match_events SET pair_id=? WHERE id=?",
                    (new_id, event_id_by_pair[pair_idx]),
                )

        # Bump appearance counters
        if kind == "goal":
            conn.execute(
                "UPDATE appearances SET goals=goals+1 WHERE match_id=? AND player_id=?",
                (mid, pid),
            )
        elif kind == "yellow":
            conn.execute(
                "UPDATE appearances SET yellow=yellow+1 WHERE match_id=? AND player_id=?",
                (mid, pid),
            )
        elif kind == "red":
            conn.execute(
                "UPDATE appearances SET red=red+1 WHERE match_id=? AND player_id=?",
                (mid, pid),
            )

    # Insert staff rows (referee + coaches)
    staff = acta.get("staff") or {}
    if staff.get("referee"):
        conn.execute(
            "INSERT OR IGNORE INTO match_staff(match_id, team_id, kind, name) VALUES(?, ?, ?, ?)",
            (mid, None, "referee", staff["referee"]),
        )
    for side, key in (("home", "coach_home"), ("away", "coach_away")):
        if staff.get(key):
            tid = _team_id_by_side(conn, mid, side)
            conn.execute(
                "INSERT OR IGNORE INTO match_staff(match_id, team_id, kind, name) VALUES(?, ?, ?, ?)",
                (mid, tid, "coach", staff[key]),
            )

    return True


# ---------------------------------------------------------------------------
# Unmatched log helpers
# ---------------------------------------------------------------------------

def _load_unmatched() -> dict:
    if not os.path.exists(UNMATCHED_PATH):
        return {}
    with open(UNMATCHED_PATH, encoding="utf-8") as f:
        return json.load(f)


def _save_unmatched(d: dict) -> None:
    with open(UNMATCHED_PATH, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=2, sort_keys=True)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def import_raw(conn, raw_path: str) -> dict:
    """Read raw_path JSON and import each acta into conn.

    Returns {"matched": int, "unmatched": int}.
    Commits the connection after processing all actas.
    Unmatched actas are written to fiflp_actas_unmatched.json (by cod_acta key).
    """
    with open(raw_path, encoding="utf-8") as f:
        raw = json.load(f)

    matched = 0
    unmatched = 0
    um = _load_unmatched()

    for cod_acta_str, acta in raw.items():
        ok = _import_one(conn, int(cod_acta_str), acta)
        if ok:
            matched += 1
        else:
            unmatched += 1
            um[str(cod_acta_str)] = {
                "header": (acta.get("header") or {}),
                "reason": "no candidate match",
            }

    conn.commit()
    _save_unmatched(um)
    return {"matched": matched, "unmatched": unmatched}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("usage: import_fiflp_actas.py path/to/raw.json [--db PATH]")
    raw_path = sys.argv[1]
    db_path = "futbolbase.db"
    if "--db" in sys.argv:
        idx = sys.argv.index("--db")
        if idx + 1 >= len(sys.argv):
            sys.exit("--db requires a path argument")
        db_path = sys.argv[idx + 1]
    conn = sqlite3.connect(db_path)
    rpt = import_raw(conn, raw_path)
    print(f"Imported {raw_path}: matched={rpt['matched']} unmatched={rpt['unmatched']}")


if __name__ == "__main__":
    main()
