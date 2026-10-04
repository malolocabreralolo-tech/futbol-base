"""Import a fiflp_actas_<season>_raw.json into the DB.

Idempotent: for each acta whose match is reconciled, DELETE the prior rows from
appearances/match_events/match_staff for that match and re-insert. Unmatched
actas are appended to scripts/fiflp_actas_unmatched.json (deduplicated by
cod_acta key).

El bot (fetch_futbolaspalmas.py) llama a import_changed_raws: importa cada
scripts/fiflp_actas_<S>_raw.json que haya cambiado desde la última vez (sha1 en
la tabla raw_imports), con solo las actas leídas aplanadas (las descarga
actas-federacion.yml).

CLI: python3 scripts/import_fiflp_actas.py path/to/raw.json [--db futbolbase.db]
"""
import hashlib
import json
import os
import re
import sqlite3
import sys
import unicodedata

try:
    from scripts.acta_reconciler import reconcile_acta, _contradicts
except ImportError:
    # Direct CLI run (`python3 scripts/import_fiflp_actas.py`): sys.path[0] is
    # scripts/, so the `scripts.` package is not importable. Add the repo root.
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from scripts.acta_reconciler import reconcile_acta, _contradicts

UNMATCHED_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fiflp_actas_unmatched.json")


# ---------------------------------------------------------------------------
# Player helpers
# ---------------------------------------------------------------------------

def _norm_player(name: str) -> str:
    """Accent-strip, uppercase, collapse whitespace — canonical player key."""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"\s+", " ", s).strip().upper()
    return s


def _has_fiflp_id(conn) -> bool:
    return any(r[1] == "fiflp_id" for r in conn.execute("PRAGMA table_info(players)"))


def _get_or_create_player(conn, name: str, fiflp_id: int = None) -> int:
    """El jugador por su id de la federación (estable entre temporadas: el
    mismo niño de prebenjamín a benjamín) y, si no, por nombre normalizado.
    Un homónimo con otro id de la federación es OTRO niño: entra con la clave
    'NOMBRE#id' para no fundirlos."""
    norm = _norm_player(name)
    with_id = fiflp_id is not None and _has_fiflp_id(conn)
    if with_id:
        r = conn.execute("SELECT id FROM players WHERE fiflp_id=?", (fiflp_id,)).fetchone()
        if r:
            return r[0]
    r = conn.execute("SELECT id, " + ("fiflp_id" if with_id else "NULL") +
                     " FROM players WHERE norm_name=?", (norm,)).fetchone()
    # Una fila antigua sin id solo se adopta si el nombre lleva apellidos: un
    # nombre de pila suelto ('LUCAS', como publica la federación a algunos
    # niños) es de cualquiera, y le daría al niño nuevo la historia de otro.
    adopt = r and r[1] is None and (not with_id or "," in name)
    if r and (not with_id or r[1] == fiflp_id or adopt):
        if with_id and r[1] is None:
            conn.execute("UPDATE players SET fiflp_id=? WHERE id=?", (fiflp_id, r[0]))
        return r[0]
    if r:                                   # mismo nombre, otro id: homónimo
        norm = f"{norm}#{fiflp_id}"
    if with_id:
        cur = conn.execute("INSERT INTO players(full_name, norm_name, fiflp_id) VALUES(?, ?, ?)",
                           (name, norm, fiflp_id))
    else:
        cur = conn.execute("INSERT INTO players(full_name, norm_name) VALUES(?, ?)", (name, norm))
    return cur.lastrowid


ANON_NORM = "#SIN NOMBRE PUBLICADO"


def _anonymous_player(conn) -> int:
    """La fila única de «jugador sin nombre publicado» (full_name vacío)."""
    r = conn.execute("SELECT id FROM players WHERE norm_name=?", (ANON_NORM,)).fetchone()
    if r:
        return r[0]
    return conn.execute("INSERT INTO players(full_name, norm_name) VALUES('', ?)", (ANON_NORM,)).lastrowid


def _team_id_by_side(conn, mid: int, side: str) -> int:
    col = "home_team_id" if side == "home" else "away_team_id"
    return conn.execute(f"SELECT {col} FROM matches WHERE id=?", (mid,)).fetchone()[0]


# ---------------------------------------------------------------------------
# Core import logic for a single acta
# ---------------------------------------------------------------------------

def _clear_acta_rows(conn, mid: int) -> None:
    """Delete every acta-derived row of a match (appearances/events/staff)."""
    conn.execute("DELETE FROM appearances  WHERE match_id=?", (mid,))
    conn.execute("DELETE FROM match_events WHERE match_id=?", (mid,))
    conn.execute("DELETE FROM match_staff  WHERE match_id=?", (mid,))


def _import_one(conn, cod_acta: int, acta: dict, mid: int = None) -> bool:
    """Import one parsed acta into the DB. Returns True if reconciled.

    `mid` may be precomputed by the caller (import_raw reconciles first for
    duplicate detection); when None, it is resolved here.
    """
    if mid is None:
        mid = reconcile_acta(conn, acta.get("header") or {})
    if not mid:
        return False

    # If this acta was previously assigned to a DIFFERENT match (reconciliation
    # changed between runs), clear the stale assignment and its stale rows —
    # otherwise the old match would keep publishing obsolete lineups.
    for (old_mid,) in conn.execute(
        "SELECT id FROM matches WHERE cod_acta=? AND id<>?", (cod_acta, mid)
    ).fetchall():
        _clear_acta_rows(conn, old_mid)
        conn.execute("UPDATE matches SET cod_acta=NULL WHERE id=?", (old_mid,))
        print(f"  ! cleared stale cod_acta={cod_acta} from match {old_mid} "
              f"(acta now reconciles to match {mid})")

    # Mark the match with its acta code
    conn.execute("UPDATE matches SET cod_acta=? WHERE id=?", (cod_acta, mid))

    # Idempotency: wipe prior rows for this match before re-inserting
    _clear_acta_rows(conn, mid)

    # Insert appearances and build name -> (player_id, team_id) map
    name_to_pid: dict = {}
    for side in ("home", "away"):
        team_id = _team_id_by_side(conn, mid, side)
        for p in (acta.get("lineups") or {}).get(side, []):
            pid = _get_or_create_player(conn, p["name"], p.get("fiflp_id"))
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
        if not ev.get("player_name"):
            # Gol de un niño cuyo nombre la federación no publica: queda en la
            # cronología con un jugador «sin nombre» (sin aparición ni ficha).
            if ev["kind"] == "goal" and side in ("home", "away"):
                conn.execute(
                    """INSERT INTO match_events(match_id, team_id, player_id, kind, minute, goal_type, pair_id)
                       VALUES (?, ?, ?, 'goal', ?, ?, NULL)""",
                    (mid, _team_id_by_side(conn, mid, side), _anonymous_player(conn), ev.get("minute"),
                     ev.get("goal_type")))
            continue
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

        # Bump appearance counters. Un gol en propia puerta no es gol del
        # jugador (suma al rival): queda en match_events, pero no en su ficha.
        if kind == "goal" and ev.get("goal_type") == "own":
            pass
        elif kind == "goal":
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
    # Delegados de campo y de equipo (acta de la federación, 2026-10).
    for side in ("home", "away"):
        delegates = staff.get(f"delegates_{side}") or {}
        for field, kind in (("campo", "delegate_field"), ("equipo", "delegate_team")):
            if delegates.get(field):
                conn.execute(
                    "INSERT OR IGNORE INTO match_staff(match_id, team_id, kind, name) VALUES(?, ?, ?, ?)",
                    (mid, _team_id_by_side(conn, mid, side), kind, delegates[field]),
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

def _purge_orphan_cod_actas(conn, raw: dict) -> int:
    """NULL out matches.cod_acta (and drop their stale acta rows) when the
    acta no longer exists in the raw being imported.

    Scoped to the seasons covered by the raw's headers, so importing one
    season's raw never touches other seasons' assignments. Assumes the raw is
    the COMPLETE harvest for its season(s).
    """
    season_ids = set()
    for acta in raw.values():
        s = ((acta.get("header") or {}).get("season") or "").replace("/", "-")
        if not s:
            continue
        r = conn.execute("SELECT id FROM seasons WHERE name=?", (s,)).fetchone()
        if r:
            season_ids.add(r[0])
    if not season_ids:
        return 0
    known = set()
    for k in raw.keys():
        try:
            known.add(int(k))
        except (TypeError, ValueError):
            pass
    qmarks = ",".join("?" * len(season_ids))
    rows = conn.execute(
        f"""SELECT m.id, m.cod_acta
              FROM matches m
              JOIN groups g ON g.id=m.group_id
             WHERE g.season_id IN ({qmarks}) AND m.cod_acta IS NOT NULL""",
        tuple(season_ids),
    ).fetchall()
    cleared = 0
    for mid, cod in rows:
        if cod not in known:
            _clear_acta_rows(conn, mid)
            conn.execute("UPDATE matches SET cod_acta=NULL WHERE id=?", (mid,))
            print(f"  ! orphan cod_acta={cod} on match {mid} (acta no longer in raw) — cleared")
            cleared += 1
    return cleared


def flattened(acta) -> bool:
    """Un acta leída aplanada (fiflp_render.FLATTEN_JS + fiflp_acta; trae
    `consistent`). Las de antes de octubre de 2026 (acta_parser, sin aplanar)
    traen marcadores y minutos mal descifrados: actas-federacion.yml las vuelve
    a descargar, y hasta entonces se quedan como estén en la base."""
    return isinstance(acta, dict) and "consistent" in acta


def import_raw(conn, raw_path: str, only=None) -> dict:
    """Read raw_path JSON and import each acta into conn.

    `only(acta)`: si se da, solo se importan las actas que lo cumplen; las demás
    cuentan en "skipped" y no se tocan (tampoco se purgan: siguen en el raw).
    Returns {"matched": int, "unmatched": int, "duplicates": int,
    "orphans_cleared": int, "skipped": int}. Commits the connection after processing all actas.
    Unmatched actas are written to fiflp_actas_unmatched.json (by cod_acta key).
    Two actas reconciling to the same match are reported as duplicates (first
    one wins, the rest are skipped with a warning). Matches holding a cod_acta
    that no longer exists in the raw (same seasons) get it cleared.
    """
    with open(raw_path, encoding="utf-8") as f:
        raw = json.load(f)

    matched = 0
    unmatched = 0
    duplicates = 0
    skipped = 0
    fixed = 0
    um = _load_unmatched()
    claimed = {}  # match_id -> cod_acta that claimed it in this run

    orphans_cleared = _purge_orphan_cod_actas(conn, raw)

    votes = {}       # grupo de la federación -> {grupo de la base: actas}
    first, pending = [], []
    for cod_acta_str, acta in raw.items():
        if only is not None and not only(acta):
            skipped += 1
            continue
        mid = reconcile_acta(conn, acta.get("header") or {})
        if not mid:
            pending.append((cod_acta_str, acta))
            continue
        gid = conn.execute("SELECT group_id FROM matches WHERE id=?", (mid,)).fetchone()[0]
        first.append((cod_acta_str, acta, mid, gid))
        fed = _fed_group(acta)
        if fed:
            votes.setdefault(fed, {}).setdefault(gid, 0)
            votes[fed][gid] += 1
    major = {fed: _majority(v) for fed, v in votes.items()}
    owner = {gid: fed for fed, gid in major.items() if gid}
    gol = _gol_entries(raw_path)
    official = {gid: gol[fed] for fed, gid in major.items() if gid and fed in gol}
    fixes = {}       # grupo de la base -> {partido: marcador del acta}

    for cod_acta_str, acta, mid, gid in first:
        cod_acta = int(cod_acta_str)
        # Casada por nombres en un grupo que no es el de su grupo de la federación, o que es el
        # de otro grupo de la federación (el acta de una copa con el partido de liga de los
        # mismos equipos): a la segunda pasada.
        fed = _fed_group(acta)
        if fed and ((major.get(fed) and major[fed] != gid) or owner.get(gid) not in (None, fed)):
            pending.append((cod_acta_str, acta))
            continue
        prev = claimed.get(mid)
        if prev is not None and prev != cod_acta:
            duplicates += 1
            print(f"  ! DUPLICATE: acta {cod_acta} reconciles to match {mid} "
                  f"already claimed by acta {prev} in this run — skipped")
            continue
        claimed[mid] = cod_acta
        _propose_fix(conn, fixes, gid, mid, acta)
        _import_one(conn, cod_acta, acta, mid=mid)
        matched += 1

    # Segunda pasada: las que no casaron por nombres ('BECERRIL VALKYRIAS, C.D.' frente a
    # 'Valkyrias Bec.'), dentro del grupo de la base de su grupo de la federación. Un acta
    # coherente manda sobre un marcador mal leído del calendario (un 16-0 guardado como 6-0).
    known = {int(k) for k in raw if str(k).isdigit()}
    in_group, more_official = reconcile_in_groups(conn, raw_path, pending, votes)
    official.update(more_official)
    for cod_acta_str, acta in pending:
        cod_acta = int(cod_acta_str)
        mid, fix = in_group.get(cod_acta_str, (None, False))
        held = conn.execute("SELECT cod_acta FROM matches WHERE id=?", (mid,)).fetchone() if mid else None
        if (not mid or claimed.get(mid) not in (None, cod_acta)
                or (held and held[0] not in (None, cod_acta) and held[0] in known)):
            unmatched += 1
            um[str(cod_acta_str)] = {"header": (acta.get("header") or {}), "reason": "no candidate match"}
            continue
        claimed[mid] = cod_acta
        if fix:
            gid = conn.execute("SELECT group_id FROM matches WHERE id=?", (mid,)).fetchone()[0]
            fixes.setdefault(gid, {})[mid] = (acta["header"]["home_score"], acta["header"]["away_score"])
        _import_one(conn, cod_acta, acta, mid=mid)
        um.pop(str(cod_acta_str), None)
        matched += 1

    # Huecos del calendario: un acta coherente sin partido, de un grupo claro, cuyo cruce no
    # existe en ese grupo (LZ12 2024-25 tenía 90 de sus 132 partidos), crea el suyo.
    left = [(c, a) for c, a in pending if str(c) in um]
    added = fill_gaps(conn, raw_path, left, votes, claimed)
    for cod_acta_str in added:
        um.pop(str(cod_acta_str), None)
        unmatched -= 1
        matched += 1

    # Los marcadores de las actas y la clasificación oficial, grupo a grupo, sin alejar nunca
    # el grupo de su clasificación (fiflp_tables.settle).
    from fiflp_tables import official_rows, settle
    tables = 0
    for gid, group_fixes in fixes.items():
        entry = official.get(gid)
        choice = settle(conn, gid, group_fixes, official_rows(conn, gid, entry) if entry else None)
        fixed += len(group_fixes) if "fixes" in choice else 0
        tables += choice.startswith("official")

    conn.commit()
    _save_unmatched(um)
    return {
        "matched": matched,
        "unmatched": unmatched,
        "duplicates": duplicates,
        "orphans_cleared": orphans_cleared,
        "skipped": skipped,
        "scores_fixed": fixed,
        "official_tables": tables,
        "gaps_filled": len(added),
    }


def _fed_group(acta):
    e = acta.get("enumeration") or {}
    return (str(e["comp_id"]), str(e["grupo"])) if e.get("comp_id") and e.get("grupo") else None


def _gol_entries(raw_path):
    """{grupo de la federación: su entrada del raw de goleadores de la temporada}."""
    m = RAW_FILE.match(os.path.basename(raw_path))
    path = os.path.join(os.path.dirname(os.path.abspath(raw_path)), f"fiflp_goleadores_{m.group(1)}_raw.json") if m else ""
    if not path or not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return {(str(e["comp"]), str(e["grupo"])): e for e in json.load(f).values()}


def _propose_fix(conn, fixes, gid, mid, acta):
    """Un acta coherente casada con un partido de otro marcador (un 1-11 guardado como 1-1, la
    cifra que perdía la ofuscación antigua) propone el suyo; lo decide fiflp_tables.settle."""
    h = acta.get("header") or {}
    if not acta.get("consistent") or h.get("home_score") is None or h.get("away_score") is None:
        return
    row = conn.execute("SELECT home_score, away_score FROM matches WHERE id=?", (mid,)).fetchone()
    if row and tuple(row) != (h["home_score"], h["away_score"]):
        fixes.setdefault(gid, {})[mid] = (h["home_score"], h["away_score"])


def _like(sample, value, kind):
    """La jornada o la fecha de un partido nuevo con la forma de las del grupo."""
    if kind == "jornada":
        return f"Jornada {value}" if str(sample or "").startswith("Jornada ") else str(value)
    d, m, y = value.split("-") if value and re.match(r"^\d{2}-\d{2}-\d{4}$", value) else (None, None, None)
    if not d:
        return value or ""
    if re.match(r"^\d{2}/\d{2}$", sample or ""):
        return f"{d}/{m}"
    if re.match(r"^\d{4}-\d{2}-\d{2}$", sample or ""):
        return f"{y}-{m}-{d}"
    return value


def fill_gaps(conn, raw_path, left, votes, claimed):
    """[cod_acta] de las actas que crean su partido: coherentes, de un grupo de la federación con
    grupo de la base claro (la mayoría de sus actas casadas), con los dos equipos en ese grupo y
    sin ningún partido de ese cruce (local y visitante) en él. Por grupo, dentro de un SAVEPOINT:
    si el grupo se aleja de su clasificación (la medida de score_deviation), se deshace."""
    sys.path.insert(0, SCRIPTS_DIR)
    from fiflp_names import match_teams
    from score_deviation import group_deviation
    import import_fiflp_goleadores as G
    gol = _gol_entries(raw_path)
    by_group = {}
    for cod, acta in left:
        fed = _fed_group(acta)
        h = acta.get("header") or {}
        if not fed or not acta.get("consistent") or h.get("home_score") is None or h.get("away_score") is None:
            continue
        gid = _majority(votes.get(fed, {}))
        if gid:
            by_group.setdefault((gid, fed), []).append((cod, acta))
    added = []
    for (gid, fed), actas in by_group.items():
        teams = sorted(G._db_groups_one(conn, gid))
        bridge = G.team_bridge(conn, gid, gol[fed]) if fed in gol else {}
        sample = conn.execute("SELECT jornada, date FROM matches WHERE group_id=? LIMIT 1", (gid,)).fetchone() or ("", "")
        d0 = group_deviation(conn, gid)["dev"]
        conn.execute("SAVEPOINT huecos")
        mine = []
        for cod, acta in actas:
            h = acta["header"]
            names = [G.scorer_team(G.clean_team_name(h.get(side)), bridge) for side in ("home_team", "away_team")]
            loose = match_teams([n for n in names if n not in teams], teams)
            home, away = (loose.get(n, n) for n in names)
            if home not in teams or away not in teams or home == away:
                continue
            ids = [conn.execute("SELECT id FROM teams WHERE name=?", (t,)).fetchone()[0] for t in (home, away)]
            if conn.execute("SELECT 1 FROM matches WHERE group_id=? AND home_team_id=? AND away_team_id=?",
                            (gid, *ids)).fetchone():
                continue
            cur = conn.execute("""INSERT INTO matches (group_id, jornada, date, time, home_team_id, away_team_id,
                                  home_score, away_score, venue) VALUES (?,?,?,?,?,?,?,?,?)""",
                               (gid, _like(sample[0], h.get("jornada") or "", "jornada"),
                                _like(sample[1], h.get("date"), "date"), h.get("time") or "", *ids,
                                h["home_score"], h["away_score"], h.get("venue") or ""))
            claimed[cur.lastrowid] = int(cod)
            _import_one(conn, int(cod), acta, mid=cur.lastrowid)
            mine.append(cod)
        if mine and group_deviation(conn, gid)["dev"] > d0:
            conn.execute("ROLLBACK TO huecos")
            for cod in mine:
                claimed.pop(next((m for m, c in claimed.items() if c == int(cod)), None), None)
            mine = []
        conn.execute("RELEASE huecos")
        added += mine
    return added


def _majority(v):
    """El grupo de la base de la mayoría (al menos 3 actas y dos tercios), o None."""
    if not v:
        return None
    gid, n = max(v.items(), key=lambda kv: kv[1])
    return gid if n >= 3 and n * 3 >= sum(v.values()) * 2 else None


def reconcile_in_groups(conn, raw_path, pending, votes):
    """({cod_acta: (match_id, corregir el marcador)}, {grupo de la base: su entrada del raw de
    goleadores}) de las actas que no casaron por nombres, buscadas en el
    grupo de la base de su grupo de la federación: el de la mayoría de sus actas ya
    casadas (al menos 3 y dos tercios) o, si no, el que casa con su entrada del raw
    de goleadores (import_fiflp_goleadores.match_group). Los nombres se traducen con
    team_bridge (la clasificación oficial) y, si no, match_teams; el partido debe
    tener esos dos equipos en ese orden y la fecha (±1 día) no puede contradecir
    el acta; el marcador tampoco, salvo que el acta sea coherente (entonces se
    propone corregir el del calendario: lo decide fiflp_tables.settle)."""
    sys.path.insert(0, SCRIPTS_DIR)
    from fiflp_names import match_teams
    import import_fiflp_goleadores as G
    folder = os.path.dirname(os.path.abspath(raw_path))
    m = RAW_FILE.match(os.path.basename(raw_path))
    season = m.group(1) if m else None
    row = conn.execute("SELECT id FROM seasons WHERE name=?", (season,)).fetchone() if season else None
    if not row:
        return {}, {}
    season_id = row[0]
    gol_path = os.path.join(folder, f"fiflp_goleadores_{season}_raw.json")
    gol = {}
    if os.path.exists(gol_path):
        with open(gol_path, encoding="utf-8") as f:
            gol = {(str(e["comp"]), str(e["grupo"])): e for e in json.load(f).values()}
    index_path = os.path.join(folder, f"fiflp_actas_{season}_index.json")
    index = {}
    if os.path.exists(index_path):
        with open(index_path, encoding="utf-8") as f:
            index = json.load(f)

    groups, bridges, out, official = {}, {}, {}, {}
    for cod, acta in pending:
        fed = _fed_group(acta)
        if not fed:
            continue
        if fed not in groups:
            gid = _majority(votes.get(fed, {}))
            if not gid and fed in gol:
                gid = G.match_group(conn, season_id, index, gol[fed])
            groups[fed] = gid
            if gid and fed in gol:
                official[gid] = gol[fed]
            if gid:
                teams = sorted(G._db_groups_one(conn, gid))
                bridge = G.team_bridge(conn, gid, gol[fed]) if fed in gol else {}
                bridges[fed] = (bridge, teams)
        gid = groups[fed]
        if not gid:
            continue
        bridge, teams = bridges[fed]
        h = acta.get("header") or {}
        names = []
        for side in ("home_team", "away_team"):
            raw_name = G.clean_team_name(h.get(side))
            names.append(G.scorer_team(raw_name, bridge) if raw_name else None)
        loose = match_teams([n for n in names if n and n not in teams], teams)
        home, away = (loose.get(n, n) if n else None for n in names)
        if home not in teams or away not in teams:
            continue
        rows = conn.execute("""SELECT m.id, t1.name, t2.name, m.date, m.home_score, m.away_score
            FROM matches m JOIN teams t1 ON t1.id=m.home_team_id JOIN teams t2 ON t2.id=m.away_team_id
            WHERE m.group_id=? AND t1.name=? AND t2.name=?""", (gid, home, away)).fetchall()
        # Con el acta coherente, el marcador no descarta: es el del calendario el que puede estar mal.
        consistent = bool(acta.get("consistent")) and h.get("home_score") is not None and h.get("away_score") is not None
        rows = [r for r in rows if not _contradicts(h, r, check_score=not consistent)]
        if len(rows) == 1:
            r = rows[0]
            out[cod] = (r[0], consistent and (r[4], r[5]) != (h["home_score"], h["away_score"]))
    return out, official


RAW_FILE = re.compile(r"^fiflp_actas_(\d{4}-\d{4})_raw\.json$")
# Entra en la huella de cada raw: al cambiar la lógica de importación, subirla
# hace que el bot reimporte una vez todos los raws (5: relleno de huecos del calendario).
IMPORT_VERSION = "5"
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))


def import_changed_raws(conn, folder: str = SCRIPTS_DIR, log=print) -> dict:
    """Importa cada fiflp_actas_<S>_raw.json de `folder` que haya cambiado desde
    la última importación (su sha1, en la tabla raw_imports), con solo las actas
    aplanadas (`flattened`). Las tandas de actas-federacion.yml solo descargan
    y comitean el raw; el bot lo importa en su pasada siguiente. Devuelve
    {fichero: informe de import_raw} de los importados."""
    conn.execute("""CREATE TABLE IF NOT EXISTS raw_imports (
        path TEXT PRIMARY KEY, sha1 TEXT NOT NULL, imported_at TEXT NOT NULL)""")
    reports = {}
    for name in sorted(os.listdir(folder)):
        if not RAW_FILE.match(name):
            continue
        path = os.path.join(folder, name)
        with open(path, "rb") as f:
            digest = hashlib.sha1(IMPORT_VERSION.encode() + f.read()).hexdigest()
        row = conn.execute("SELECT sha1 FROM raw_imports WHERE path=?", (name,)).fetchone()
        if row and row[0] == digest:
            continue
        report = import_raw(conn, path, only=flattened)
        conn.execute("INSERT OR REPLACE INTO raw_imports(path, sha1, imported_at) VALUES (?, ?, datetime('now'))",
                     (name, digest))
        conn.commit()
        log(f"  {name}: {report['matched']} actas importadas, {report['unmatched']} sin partido, "
            f"{report['skipped']} sin aplanar (pendientes de volver a descargar); "
            f"{report['scores_fixed']} marcadores corregidos por su acta, "
            f"{report['official_tables']} clasificaciones oficiales, {report['gaps_filled']} partidos que faltaban")
        reports[name] = report
    return reports


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
    print(f"Imported {raw_path}: matched={rpt['matched']} unmatched={rpt['unmatched']} "
          f"duplicates={rpt['duplicates']} orphans_cleared={rpt['orphans_cleared']}")


if __name__ == "__main__":
    main()
