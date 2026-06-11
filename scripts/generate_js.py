#!/usr/bin/env python3
"""
Generate all data-*.js files from the SQLite database.

Reads futbolbase.db and produces:
  - data-benjamin.js
  - data-prebenjamin.js
  - data-history.js
  - data-matchdetail.js
  - data-goleadores.js
  - data-shields.js

Also bumps the cache version (?v= + footer date in index.html, CACHE_NAME in
sw.js — contrato C3) but ONLY if the content of some data-*.js actually
changed in this run (contrato C4), so no-op cron runs produce no diff.
"""

import glob
import hashlib
import json
import os
import re
import sys
import unicodedata
from datetime import date

# _CLUB_SUFFIX (the canonical club-token list) lives in scripts/acta_reconciler.py.
# Make the import work whether generate_js.py is run as `python3
# scripts/generate_js.py` (sys.path[0] is scripts/) or imported as
# `scripts.generate_js` (project root in sys.path).
try:
    from scripts.acta_reconciler import _CLUB_SUFFIX
except ImportError:
    from acta_reconciler import _CLUB_SUFFIX

# Allow importing db.py from the same directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import get_connection, PROJECT_ROOT


def js_val(v):
    """Convert a Python value to a JS-compatible JSON value."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, (list, tuple)):
        return "[" + ",".join(js_val(x) for x in v) + "]"
    if isinstance(v, dict):
        items = ",".join(f"{json.dumps(k, ensure_ascii=False)}:{js_val(val)}" for k, val in v.items())
        return "{" + items + "}"
    return json.dumps(v, ensure_ascii=False)


MAX_SANE_SCORE = 50


def sanitize_score(score, context=""):
    """Defense in depth: a goal count outside [0, MAX_SANE_SCORE] is corrupt
    source data (e.g. the 2024-25 away_score=41736 IDs), never a real score.
    Emit it as null and warn on stderr so the corrupt row is visible in CI logs
    without poisoning the published data files."""
    if score is None:
        return None
    if 0 <= score <= MAX_SANE_SCORE:
        return score
    print(
        f"  WARNING: marcador fuera de rango ({score}) {context} — emitido como null",
        file=sys.stderr,
    )
    return None


def normalize_for_teams_mapping(s):
    """Normalizer for the TEAMS_<S> key map (contrato C1).

    Same pipeline as acta_reconciler.normalize_team_name (lowercase -> NFKD
    accent-strip -> quotes/punctuation removed -> club tokens stripped via the
    shared _CLUB_SUFFIX list -> whitespace collapsed) EXCEPT it KEEPS the
    trailing filial letter, so 'UD Atalaya' -> 'atalaya' and 'UD Atalaya B' ->
    'atalaya b' get distinct keys instead of last-wins colliding.

    MIRROR: src/state.js normalizeForTeamsMapping must implement exactly the
    same pipeline — keep both sides in sync (C1).
    """
    if not s:
        return ""
    # Comillas/puntuación -> espacio ANTES del pase ascii-ignore: las comillas
    # curvas no son descomponibles a ascii, así que codificar primero se las
    # tragaría sin dejar separador y divergiría del espejo JS
    # ('VET“C”' -> 'vetc' en vez de 'vet c').
    s = re.sub(r'["\'‘’“”]', " ", s)
    s = re.sub(r"[.,;:]", " ", s)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = s.lower()
    s = _CLUB_SUFFIX.sub(" ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def get_groups_for_category(conn, category_name):
    """Return groups for the given category in the current season, ordered by code."""
    rows = conn.execute(
        """SELECT g.id, g.code, g.name, g.full_name, g.phase, g.island, g.url, g.current_jornada
           FROM groups g
           JOIN categories c ON g.category_id = c.id
           JOIN seasons s ON g.season_id = s.id
           WHERE c.name = ? AND s.is_current = 1
           ORDER BY g.code""",
        (category_name,),
    ).fetchall()
    return rows


def get_standings(conn, group_id):
    """Return standings for a group as list of [pos, team, pts, J, G, E, P, GF, GC, DF]."""
    rows = conn.execute(
        """SELECT s.position, t.name, s.points, s.played, s.won, s.drawn, s.lost,
                  s.gf, s.gc, s.gd
           FROM standings s
           JOIN teams t ON s.team_id = t.id
           WHERE s.group_id = ?
           ORDER BY s.position""",
        (group_id,),
    ).fetchall()
    return [list(r) for r in rows]


def compute_standings_from_matches(conn, group_id):
    """Recompute a league table from the matches of a group.

    Rows in the canonical standings format [pos, team, pts, J, G, E, P, GF,
    GC, DF]; 3/1/0 points; order pts desc, DF desc, GF desc, name asc.
    Teams appearing only in unplayed fixtures still get a zeroed row.
    Out-of-range scores are ignored (match treated as unplayed)."""
    rows = conn.execute(
        """SELECT h.name, a.name, m.home_score, m.away_score
           FROM matches m
           JOIN teams h ON m.home_team_id = h.id
           JOIN teams a ON m.away_team_id = a.id
           WHERE m.group_id = ?
           ORDER BY m.id""",
        (group_id,),
    ).fetchall()

    table = {}

    def _entry(team):
        return table.setdefault(team, {"pts": 0, "j": 0, "g": 0, "e": 0, "p": 0, "gf": 0, "gc": 0})

    for home, away, hs, as_ in rows:
        th, ta = _entry(home), _entry(away)
        ctx = f"en {home} vs {away} (grupo {group_id})"
        hs = sanitize_score(hs, ctx)
        as_ = sanitize_score(as_, ctx)
        if hs is None or as_ is None:
            continue
        th["j"] += 1
        ta["j"] += 1
        th["gf"] += hs
        th["gc"] += as_
        ta["gf"] += as_
        ta["gc"] += hs
        if hs > as_:
            th["g"] += 1
            th["pts"] += 3
            ta["p"] += 1
        elif hs < as_:
            ta["g"] += 1
            ta["pts"] += 3
            th["p"] += 1
        else:
            th["e"] += 1
            ta["e"] += 1
            th["pts"] += 1
            ta["pts"] += 1

    ordered = sorted(
        table.items(),
        key=lambda kv: (-kv[1]["pts"], -(kv[1]["gf"] - kv[1]["gc"]), -kv[1]["gf"], kv[0]),
    )
    return [
        [i + 1, name, st["pts"], st["j"], st["g"], st["e"], st["p"],
         st["gf"], st["gc"], st["gf"] - st["gc"]]
        for i, (name, st) in enumerate(ordered)
    ]


def _is_league_group(code, phase):
    """True for regular league groups. Knockouts (Copa de Campeones, whose
    standings are synthesized by synth_copa_campeones.py with its own ranking
    semantics) must never be recomputed as a league table."""
    if "copa" in (phase or "").lower():
        return False
    if (code or "").upper().startswith(("PCC", "BC")):
        return False
    return True


def get_effective_standings(conn, group_id, code=None, phase=None):
    """Standings for a CURRENT-season group, recomputed from matches when the
    stored table went stale (the source kept publishing results after it
    stopped publishing standings — e.g. frozen since ~25/04 while results ran
    to J29). If the stored table is up to date it wins, because the official
    one may carry sanctions a recompute can't know about."""
    stored = get_standings(conn, group_id)
    if not stored or not _is_league_group(code, phase):
        return stored
    computed = compute_standings_from_matches(conn, group_id)
    stored_j = sum((r[3] or 0) for r in stored)
    computed_j = sum(r[3] for r in computed)
    if computed_j > stored_j:
        print(
            f"  WARNING: standings desfasados en grupo {code or group_id} "
            f"(J almacenada {stored_j} < J jugada {computed_j}) — recalculados desde matches",
            file=sys.stderr,
        )
        return computed
    return stored


def get_current_jornada_matches(conn, group_id, current_jornada):
    """Return matches for the current jornada as [date, time, home, away, hs, as, venue]."""
    if not current_jornada:
        return []
    rows = conn.execute(
        """SELECT m.date, m.time, h.name, a.name, m.home_score, m.away_score, m.venue
           FROM matches m
           JOIN teams h ON m.home_team_id = h.id
           JOIN teams a ON m.away_team_id = a.id
           WHERE m.group_id = ? AND m.jornada = ?
           ORDER BY m.date, m.time, h.name""",
        (group_id, current_jornada),
    ).fetchall()
    out = []
    for r in rows:
        r = list(r)
        ctx = f"en {r[2]} vs {r[3]} ({r[0]})"
        r[4] = sanitize_score(r[4], ctx)
        r[5] = sanitize_score(r[5], ctx)
        out.append(r)
    return out


def generate_category_js(conn, category_name, var_name, stats_var):
    """Generate the JS content for a category (BENJAMIN or PREBENJAMIN)."""
    groups = get_groups_for_category(conn, category_name)
    result = []
    total_teams = 0

    for gid, code, name, full_name, phase, island, url, current_jornada in groups:
        standings = get_effective_standings(conn, gid, code, phase)
        matches = get_current_jornada_matches(conn, gid, current_jornada)
        total_teams += len(standings)

        group_obj = {
            "id": code,
            "name": name,
            "fullName": full_name,
            "phase": phase,
            "island": island,
            "url": url,
            "jornada": current_jornada,
            "standings": standings,
            "matches": matches,
        }
        result.append(group_obj)

    js = f"const {var_name}=" + js_val(result) + ";\n"
    js += f"const {stats_var}=" + js_val({"groups": len(groups), "teams": total_teams}) + ";\n"
    return js


def generate_history_js(conn):
    """Generate data-history.js with ALL matches grouped by group code and jornada."""
    # Get all groups for current season
    groups = conn.execute(
        """SELECT g.id, g.code FROM groups g
           JOIN seasons s ON g.season_id = s.id
           WHERE s.is_current = 1
           ORDER BY g.code""",
    ).fetchall()

    history = {}
    total_matches = 0

    for gid, code in groups:
        # Get all matches for this group, ordered by jornada number then date
        rows = conn.execute(
            """SELECT m.jornada, m.date, h.name, a.name, m.home_score, m.away_score
               FROM matches m
               JOIN teams h ON m.home_team_id = h.id
               JOIN teams a ON m.away_team_id = a.id
               WHERE m.group_id = ?
               ORDER BY m.jornada, m.date, h.name""",
            (gid,),
        ).fetchall()

        jornadas = {}
        for jornada, dt, home, away, hs, as_ in rows:
            if jornada not in jornadas:
                jornadas[jornada] = []
            ctx = f"en {home} vs {away} ({dt})"
            jornadas[jornada].append(
                [dt, home, away, sanitize_score(hs, ctx), sanitize_score(as_, ctx)]
            )
            total_matches += 1

        # Sort jornadas by number
        def jornada_sort_key(j):
            m = re.search(r"(\d+)", j)
            return int(m.group(1)) if m else 0

        sorted_jornadas = dict(sorted(jornadas.items(), key=lambda x: jornada_sort_key(x[0])))
        history[code] = sorted_jornadas

    js = "const HISTORY=" + js_val(history) + ";"
    js += f"const HIST_MATCHES={total_matches};"
    return js


def generate_matchdetail_js(conn):
    """Generate data-matchdetail.js with goal details per match."""
    header = (
        "// data-matchdetail.js — generado por scripts/generate_js.py\n"
        "// NO editar manualmente — usar scripts/update.sh para regenerar\n\n"
    )

    # Get all matches that have goals
    rows = conn.execute(
        """SELECT DISTINCT m.id, h.name, a.name, m.home_score, m.away_score
           FROM matches m
           JOIN teams h ON m.home_team_id = h.id
           JOIN teams a ON m.away_team_id = a.id
           JOIN goals g ON g.match_id = m.id
           ORDER BY m.id""",
    ).fetchall()

    details = {}
    for match_id, home, away, hs, as_ in rows:
        key = f"{home}|{away}|{hs}-{as_}"
        goals = conn.execute(
            """SELECT minute, player_name, running_score, side, type
               FROM goals WHERE match_id = ? ORDER BY minute, id""",
            (match_id,),
        ).fetchall()

        entry = {"g": [list(g) for g in goals]}
        details[key] = entry

    js = header + "const MATCH_DETAIL=" + js_val(details) + ";"
    return js


def generate_matchdetail_keys_js(conn):
    """Generate data-matchdetail-keys.js: an O(1) presence map of the match
    keys that have a goal timeline, so the ⚽ badge can render without loading
    the full (~359 KB) data-matchdetail.js. Same JOIN as
    generate_matchdetail_js, so the key set is identical by construction."""
    header = (
        "// data-matchdetail-keys.js — generado por scripts/generate_js.py\n"
        "// NO editar manualmente — usar scripts/update.sh para regenerar\n\n"
    )
    rows = conn.execute(
        """SELECT DISTINCT h.name, a.name, m.home_score, m.away_score
           FROM matches m
           JOIN teams h ON m.home_team_id = h.id
           JOIN teams a ON m.away_team_id = a.id
           JOIN goals g ON g.match_id = m.id""",
    ).fetchall()
    keys = {f"{home}|{away}|{hs}-{as_}": 1 for home, away, hs, as_ in rows}
    return header + "const MATCH_DETAIL_KEYS=" + js_val(keys) + ";"


def _season_const_suffix(season_name):
    return season_name.replace("-", "_")


def generate_lineups_js(conn, season_name):
    """Emit data-lineups-<season>.js with shape:
       const LINEUPS_<YYYY_YYYY> = { "<home>|<away>|<hs>-<as>": { home:[...], away:[...], events:[...], coachH, coachA, ref } };
    """
    season_id = conn.execute("SELECT id FROM seasons WHERE name=?", (season_name,)).fetchone()
    if not season_id:
        return f"// no season {season_name}\n"
    rows = conn.execute("""
      SELECT m.id, t1.name, t2.name, m.home_score, m.away_score
        FROM matches m JOIN groups g ON g.id=m.group_id
        JOIN teams t1 ON t1.id=m.home_team_id JOIN teams t2 ON t2.id=m.away_team_id
       WHERE g.season_id=? AND m.cod_acta IS NOT NULL""", (season_id[0],)).fetchall()
    obj = {}
    for mid, h, a, hs, asc in rows:
        key = f"{h}|{a}|{hs}-{asc}"
        apps = conn.execute("""
          SELECT a.team_id, p.full_name, a.dorsal, a.role, a.goals, a.yellow, a.red
            FROM appearances a JOIN players p ON p.id=a.player_id
           WHERE a.match_id=? ORDER BY a.role DESC, a.dorsal""", (mid,)).fetchall()
        home_team_id = conn.execute("SELECT home_team_id FROM matches WHERE id=?", (mid,)).fetchone()[0]
        home = [{"n": r[1], "dn": r[2], "r": r[3], "g": r[4], "y": r[5], "rd": r[6]} for r in apps if r[0] == home_team_id]
        away = [{"n": r[1], "dn": r[2], "r": r[3], "g": r[4], "y": r[5], "rd": r[6]} for r in apps if r[0] != home_team_id]
        evs = conn.execute("""
          SELECT e.id, e.kind, e.team_id, p.full_name, e.minute, e.goal_type, e.pair_id
            FROM match_events e JOIN players p ON p.id=e.player_id
           WHERE e.match_id=? ORDER BY COALESCE(e.minute,9999), e.id""", (mid,)).fetchall()
        events = []
        handled = set()  # event ids already emitted as half of a sub pair
        for eid, kind, tid, name, mn, gt, pid in evs:
            side = "h" if tid == home_team_id else "a"
            if kind in ("sub_in", "sub_out") and pid:
                if eid in handled:
                    continue
                # pair ids are MUTUAL (out.pair_id = in.id and vice versa,
                # see import_fiflp_actas.py), so the partner is the event
                # whose id == pid — never this event itself.
                pair = next((e for e in evs if e[0] == pid), None)
                pair_name = pair[3] if pair else None
                ev = {"t": "sub", "s": side, "m": mn,
                      "n": name if kind == "sub_out" else pair_name,
                      "n2": name if kind == "sub_in" else pair_name}
                events.append(ev)
                handled.add(eid)
                handled.add(pid)
            elif kind in ("sub_in", "sub_out"):
                events.append({"t": kind, "s": side, "n": name, "m": mn})
            elif kind == "goal":
                events.append({"t": "goal", "s": side, "n": name, "m": mn, "gt": gt})
            else:
                events.append({"t": kind, "s": side, "n": name, "m": mn})
        ref = conn.execute("SELECT name FROM match_staff WHERE match_id=? AND kind='referee'", (mid,)).fetchone()
        ch = conn.execute("SELECT name FROM match_staff WHERE match_id=? AND kind='coach' AND team_id=?", (mid, home_team_id)).fetchone()
        ca = conn.execute("SELECT name FROM match_staff WHERE match_id=? AND kind='coach' AND team_id!=?", (mid, home_team_id)).fetchone()
        obj[key] = {"home": home, "away": away, "events": events,
                    "coachH": ch[0] if ch else None,
                    "coachA": ca[0] if ca else None,
                    "ref":    ref[0] if ref else None}
    suffix = _season_const_suffix(season_name)
    return ("// Auto-generated by scripts/generate_js.py — do not edit\n"
            "const LINEUPS_" + suffix + " = " + json.dumps(obj, ensure_ascii=False) + ";\n")


def generate_players_js(conn, season_name):
    """Emit data-players-<season>.js with per-team player aggregates +
       a normalized team_name -> team_id mapping for client-side lookup.
       const PLAYERS_<YYYY_YYYY> = { "<team_id>": [{n, ap, st, g, y, rd}, ...] };
       const TEAMS_<YYYY_YYYY>   = { "<norm_team_name>": team_id, ... };
    """
    season_id = conn.execute("SELECT id FROM seasons WHERE name=?", (season_name,)).fetchone()
    if not season_id:
        return f"// no season {season_name}\n"
    rows = conn.execute("""
      SELECT a.team_id, p.full_name,
             COUNT(*) AS ap,
             SUM(CASE WHEN a.role='starter' THEN 1 ELSE 0 END) AS st,
             SUM(a.goals)  AS gl,
             SUM(a.yellow) AS y,
             SUM(a.red)    AS rd
        FROM appearances a
        JOIN players p ON p.id=a.player_id
        JOIN matches m ON m.id=a.match_id
        JOIN groups g  ON g.id=m.group_id
       WHERE g.season_id=?
       GROUP BY a.team_id, a.player_id
       ORDER BY a.team_id, gl DESC, p.full_name""", (season_id[0],)).fetchall()
    obj = {}
    for tid, name, ap, st, gl, y, rd in rows:
        obj.setdefault(str(tid), []).append(
            {"n": name, "ap": ap, "st": st or 0, "g": gl or 0, "y": y or 0, "rd": rd or 0}
        )
    team_rows = conn.execute("""
      SELECT DISTINCT t.id, t.name
        FROM teams t
        JOIN appearances a ON a.team_id=t.id
        JOIN matches m ON m.id=a.match_id
        JOIN groups g ON g.id=m.group_id
       WHERE g.season_id=?
       ORDER BY t.id""", (season_id[0],)).fetchall()
    # C1: letter-preserving normalizer so first team and filial B/C/D don't
    # collide on the same key (last-wins used to hide 'UD Atalaya' behind
    # 'UD Atalaya B'). ORDER BY t.id makes any residual collision deterministic.
    teams = {}
    for tid, name in team_rows:
        key = normalize_for_teams_mapping(name)
        if key in teams and teams[key] != tid:
            print(
                f"  WARNING: clave TEAMS duplicada en {season_name}: "
                f"'{key}' (team ids {teams[key]} y {tid}) — gana el último",
                file=sys.stderr,
            )
        teams[key] = tid
    suffix = _season_const_suffix(season_name)
    return ("// Auto-generated by scripts/generate_js.py — do not edit\n"
            "const PLAYERS_" + suffix + " = " + json.dumps(obj, ensure_ascii=False) + ";\n"
            "const TEAMS_" + suffix + " = " + json.dumps(teams, ensure_ascii=False) + ";\n")


def generate_shields_js(conn):
    """Generate data-shields.js with team shield filenames."""
    rows = conn.execute(
        "SELECT name, shield_filename FROM teams WHERE shield_filename IS NOT NULL ORDER BY name"
    ).fetchall()

    shields = {}
    for name, filename in rows:
        shields[name] = filename

    return "const SHIELDS=" + js_val(shields) + ";\n"


def _goleadores_group_name(code, full_name, category_name):
    """
    Convert a group code + full_name into the goleadores display name.

    Benjamin examples:
      A1 + 'SEGUNDA FASE BENJAMIN A-G1' -> 'BENJAMIN SEGUNDA FASE A-G1'
      LZ1 + 'Benjamin Lanzarote Grupo 1' -> 'BENJAMIN PRIMERA LANZAROTE G1'
      FO + 'Benjamin Fuerteventura Liga Oro' -> 'BENJAMIN FUERTEVENTURA LIGA ORO'

    Prebenjamin examples:
      PG1 + 'PREBENJAMIN PRIMERA GRAN CANARIA G-1' -> 'PREBENJAMIN GC GRUPO 1'
    """
    upper = full_name.upper()

    if category_name == "PREBENJAMIN":
        # 'PREBENJAMIN PRIMERA GRAN CANARIA G-N' -> 'PREBENJAMIN GC GRUPO N'
        m = re.search(r"G-?(\d+)", upper)
        if m:
            return f"PREBENJAMIN GC GRUPO {m.group(1)}"
        return upper

    # BENJAMIN
    if "FUERTEVENTURA" in upper:
        # 'Benjamin Fuerteventura Liga Oro' -> 'BENJAMIN FUERTEVENTURA LIGA ORO'
        cleaned = re.sub(r"\bBENJAMIN\b\s*", "", upper).strip()
        return f"BENJAMIN {cleaned}"

    if "LANZAROTE" in upper:
        # 'Benjamin Lanzarote Grupo N' -> 'BENJAMIN PRIMERA LANZAROTE GN'
        m = re.search(r"GRUPO\s*(\d+)", upper)
        if m:
            return f"BENJAMIN PRIMERA LANZAROTE G{m.group(1)}"
        cleaned = re.sub(r"\bBENJAMIN\b\s*", "", upper).strip()
        return f"BENJAMIN {cleaned}"

    # GC segunda fase: 'SEGUNDA FASE BENJAMIN X-GN' -> 'BENJAMIN SEGUNDA FASE X-GN'
    cleaned = re.sub(r"\bBENJAMIN\b\s*", "", upper).strip()
    return f"BENJAMIN {cleaned}"


def generate_goleadores_js(conn):
    """Generate data-goleadores.js with top scorers per group.

    Reads from the `scorers` table, refreshed each scrape from the
    goleadores-base.php endpoint of futbolaspalmas.com.
    """
    parts = []

    for cat_name, var_name in [("BENJAMIN", "GOL_BENJ"), ("PREBENJAMIN", "GOL_PREBENJ")]:
        groups = get_groups_for_category(conn, cat_name)
        entries = []

        for gid, code, name, full_name, phase, island, url, current_jornada in groups:
            gol_name = _goleadores_group_name(code, full_name, cat_name)

            scorers = conn.execute(
                """SELECT s.player_name, t.name, s.goals, s.games
                   FROM scorers s
                   JOIN teams t ON s.team_id = t.id
                   WHERE s.group_id = ?
                   ORDER BY s.goals DESC, s.games ASC""",
                (gid,),
            ).fetchall()

            if scorers:
                entries.append({
                    "g": gol_name,
                    "s": [list(s) for s in scorers],
                })

        parts.append(f"const {var_name}=" + js_val(entries) + ";")

    return "\n".join(parts)


def generate_stats_js(conn):
    """Generate data-stats.js with pre-calculated statistics per category."""
    stats = {}

    for cat_name, cat_key in [("BENJAMIN", "benjamin"), ("PREBENJAMIN", "prebenjamin")]:
        # Get all group IDs for this category in the current season
        groups = conn.execute(
            """SELECT g.id, g.code FROM groups g
               JOIN categories c ON g.category_id = c.id
               JOIN seasons s ON g.season_id = s.id
               WHERE c.name = ? AND s.is_current = 1
               ORDER BY g.code""",
            (cat_name,),
        ).fetchall()
        group_ids = [g[0] for g in groups]

        if not group_ids:
            stats[cat_key] = {"season": {}, "teams": {}}
            continue

        placeholders = ",".join("?" * len(group_ids))

        # --- Season-level stats ---

        # totalMatches (completed only)
        total_matches = conn.execute(
            f"SELECT COUNT(*) FROM matches WHERE group_id IN ({placeholders}) AND home_score IS NOT NULL",
            group_ids,
        ).fetchone()[0]

        # totalGoals
        total_goals_row = conn.execute(
            f"SELECT COALESCE(SUM(home_score + away_score), 0) FROM matches WHERE group_id IN ({placeholders}) AND home_score IS NOT NULL",
            group_ids,
        ).fetchone()
        total_goals = total_goals_row[0]

        # avgGoalsPerMatch
        avg_goals = round(total_goals / total_matches, 2) if total_matches > 0 else 0

        # topScorer from scorers table
        top_scorer_row = conn.execute(
            f"""SELECT s.player_name, t.name, s.goals
                FROM scorers s
                JOIN teams t ON s.team_id = t.id
                WHERE s.group_id IN ({placeholders})
                ORDER BY s.goals DESC
                LIMIT 1""",
            group_ids,
        ).fetchone()
        top_scorer = None
        if top_scorer_row:
            top_scorer = {"name": top_scorer_row[0], "team": top_scorer_row[1], "goals": top_scorer_row[2]}

        # mostGoals: team with most GF from standings
        most_goals_row = conn.execute(
            f"""SELECT t.name, s.gf
                FROM standings s
                JOIN teams t ON s.team_id = t.id
                WHERE s.group_id IN ({placeholders})
                ORDER BY s.gf DESC
                LIMIT 1""",
            group_ids,
        ).fetchone()
        most_goals = None
        if most_goals_row:
            most_goals = {"team": most_goals_row[0], "gf": most_goals_row[1]}

        # leastConceded: team with least GC (played > 0)
        least_conceded_row = conn.execute(
            f"""SELECT t.name, s.gc
                FROM standings s
                JOIN teams t ON s.team_id = t.id
                WHERE s.group_id IN ({placeholders}) AND s.played > 0
                ORDER BY s.gc ASC
                LIMIT 1""",
            group_ids,
        ).fetchone()
        least_conceded = None
        if least_conceded_row:
            least_conceded = {"team": least_conceded_row[0], "gc": least_conceded_row[1]}

        # biggestWin: match with biggest score difference
        biggest_win_row = conn.execute(
            f"""SELECT h.name, a.name, m.home_score || '-' || m.away_score, m.date,
                       ABS(m.home_score - m.away_score) as diff
                FROM matches m
                JOIN teams h ON m.home_team_id = h.id
                JOIN teams a ON m.away_team_id = a.id
                WHERE m.group_id IN ({placeholders}) AND m.home_score IS NOT NULL
                ORDER BY diff DESC, (m.home_score + m.away_score) DESC
                LIMIT 1""",
            group_ids,
        ).fetchone()
        biggest_win = None
        if biggest_win_row:
            biggest_win = {"home": biggest_win_row[0], "away": biggest_win_row[1],
                           "score": biggest_win_row[2], "date": biggest_win_row[3]}

        # mostGoalsMatch: match with most total goals
        most_goals_match_row = conn.execute(
            f"""SELECT h.name, a.name, m.home_score || '-' || m.away_score,
                       (m.home_score + m.away_score) as total, m.date
                FROM matches m
                JOIN teams h ON m.home_team_id = h.id
                JOIN teams a ON m.away_team_id = a.id
                WHERE m.group_id IN ({placeholders}) AND m.home_score IS NOT NULL
                ORDER BY total DESC, ABS(m.home_score - m.away_score) DESC
                LIMIT 1""",
            group_ids,
        ).fetchone()
        most_goals_match = None
        if most_goals_match_row:
            most_goals_match = {"home": most_goals_match_row[0], "away": most_goals_match_row[1],
                                "score": most_goals_match_row[2], "totalGoals": most_goals_match_row[3],
                                "date": most_goals_match_row[4]}

        season_stats = {
            "totalMatches": total_matches,
            "totalGoals": total_goals,
            "avgGoalsPerMatch": avg_goals,
            "topScorer": top_scorer,
            "mostGoals": most_goals,
            "leastConceded": least_conceded,
            "biggestWin": biggest_win,
            "mostGoalsMatch": most_goals_match,
        }

        # --- Team-level stats ---
        # Get all teams that appear in standings for this category
        team_rows = conn.execute(
            f"""SELECT DISTINCT t.id, t.name
                FROM standings s
                JOIN teams t ON s.team_id = t.id
                WHERE s.group_id IN ({placeholders})
                ORDER BY t.name""",
            group_ids,
        ).fetchall()

        teams_stats = {}
        for team_id, team_name in team_rows:
            # Get all completed matches for this team in these groups, ordered by date/jornada
            matches = conn.execute(
                f"""SELECT m.jornada, m.date, h.name, a.name, m.home_score, m.away_score,
                           CASE WHEN m.home_team_id = ? THEN 'H' ELSE 'A' END as side
                    FROM matches m
                    JOIN teams h ON m.home_team_id = h.id
                    JOIN teams a ON m.away_team_id = a.id
                    WHERE m.group_id IN ({placeholders})
                      AND (m.home_team_id = ? OR m.away_team_id = ?)
                      AND m.home_score IS NOT NULL
                    ORDER BY m.date, m.jornada""",
                [team_id] + group_ids + [team_id, team_id],
            ).fetchall()

            if not matches:
                continue

            # Compute home/away records, streaks, points history, biggest win/worst loss
            home_w, home_d, home_l = 0, 0, 0
            away_w, away_d, away_l = 0, 0, 0
            total_gf, total_gc = 0, 0
            results = []  # list of 'W', 'D', 'L'
            points_history = []
            cumulative_pts = 0
            best_diff = -999
            best_match = None
            worst_diff = 999
            worst_match = None

            for jornada, dt, home, away, hs, as_, side in matches:
                if side == "H":
                    gf, gc = hs, as_
                    opponent = away
                else:
                    gf, gc = as_, hs
                    opponent = home

                total_gf += gf
                total_gc += gc
                diff = gf - gc

                if diff > 0:
                    result = "W"
                    pts = 3
                elif diff == 0:
                    result = "D"
                    pts = 1
                else:
                    result = "L"
                    pts = 0

                results.append(result)
                cumulative_pts += pts
                points_history.append(cumulative_pts)

                if side == "H":
                    if result == "W":
                        home_w += 1
                    elif result == "D":
                        home_d += 1
                    else:
                        home_l += 1
                else:
                    if result == "W":
                        away_w += 1
                    elif result == "D":
                        away_d += 1
                    else:
                        away_l += 1

                score_str = f"{hs}-{as_}"
                if diff > best_diff or (diff == best_diff and best_match is None):
                    best_diff = diff
                    best_match = {"vs": opponent, "score": score_str, "date": dt}
                if diff < worst_diff or (diff == worst_diff and worst_match is None):
                    worst_diff = diff
                    worst_match = {"vs": opponent, "score": score_str, "date": dt}

            # Current streak (from most recent)
            streak_type = results[-1] if results else None
            streak_count = 0
            for r in reversed(results):
                if r == streak_type:
                    streak_count += 1
                else:
                    break

            n_matches = len(matches)
            home_total = home_w + home_d + home_l
            away_total = away_w + away_d + away_l

            team_stat = {
                "streak": {"type": streak_type, "count": streak_count} if streak_type else None,
                "homeRecord": {
                    "w": home_w, "d": home_d, "l": home_l,
                    "pct": round(home_w / home_total * 100) if home_total > 0 else 0,
                },
                "awayRecord": {
                    "w": away_w, "d": away_d, "l": away_l,
                    "pct": round(away_w / away_total * 100) if away_total > 0 else 0,
                },
                "avgGF": round(total_gf / n_matches, 1),
                "avgGC": round(total_gc / n_matches, 1),
                "biggestWin": best_match,
                "worstLoss": worst_match,
                "pointsHistory": points_history,
            }
            teams_stats[team_name] = team_stat

        stats[cat_key] = {"season": season_stats, "teams": teams_stats}

    return "const STATS=" + json.dumps(stats, ensure_ascii=False, separators=(",", ":")) + ";\n"


def get_historical_jornadas(conn, group_id):
    """Return matches grouped by jornada num for historical groups.
    Format: {jornada_num: [[date, home, away, hs, as_], ...]}
    Only includes jornadas with at least one match.
    """
    rows = conn.execute(
        """SELECT m.jornada, m.date, h.name, a.name, m.home_score, m.away_score
           FROM matches m
           JOIN teams h ON m.home_team_id = h.id
           JOIN teams a ON m.away_team_id = a.id
           WHERE m.group_id = ?
           ORDER BY m.jornada, m.date, h.name""",
        (group_id,),
    ).fetchall()

    jornadas = {}
    for jornada, dt, home, away, hs, as_ in rows:
        ctx = f"en {home} vs {away} ({dt})"
        jornadas.setdefault(jornada, []).append(
            [dt, home, away, sanitize_score(hs, ctx), sanitize_score(as_, ctx)]
        )

    def _jor_num(j):
        m = re.search(r'\d+', str(j))
        return int(m.group()) if m else 0

    return dict(sorted(jornadas.items(), key=lambda x: _jor_num(x[0])))


def generate_seasons_js(conn):
    """Generate data-seasons.js with list of available seasons + historical data.

    Returns (js_string_for_lean_file, full_seasons_list_with_groups).

    The lean file (data-seasons.js) only contains [{name, current}] entries —
    enough for the season selector dropdown. Per-season group/match data is
    written to data-season-YYYY-YYYY.js by generate_per_season_files() and
    fetched lazily by src/state.js loadSeasonData() when the user switches
    to a historical season. This keeps initial page load small (was 484KB,
    now ~200B for season list).
    """
    seasons = conn.execute(
        "SELECT id, name, is_current FROM seasons ORDER BY start_year DESC"
    ).fetchall()

    # Lean version for the eager-loaded data-seasons.js
    lean_list = [{"name": n, "current": bool(c)} for _, n, c in seasons]

    # Full version (with group data) used by generate_per_season_files
    seasons_list = []
    for season_id, season_name, is_current in seasons:
        entry = {"name": season_name, "current": bool(is_current)}

        if not is_current:
            # Include historical standings data inline (for per-season files)
            for cat_name, cat_key in [("BENJAMIN", "benjamin"), ("PREBENJAMIN", "prebenjamin")]:
                # Match category by case-insensitive name (import may use lowercase)
                cat_ids = [r[0] for r in conn.execute(
                    "SELECT id FROM categories WHERE UPPER(name) = ?", (cat_name,)
                ).fetchall()]
                if not cat_ids:
                    entry[cat_key] = []
                    continue

                placeholders = ",".join("?" * len(cat_ids))
                groups = conn.execute(
                    f"""SELECT g.id, g.code, g.name, g.full_name, g.phase, g.island, g.current_jornada
                       FROM groups g
                       WHERE g.season_id = ? AND g.category_id IN ({placeholders})
                       ORDER BY g.code""",
                    [season_id] + cat_ids,
                ).fetchall()

                groups_data = []
                for gid, code, name, full_name, phase, island, current_jornada in groups:
                    standings = get_standings(conn, gid)
                    hist_jornadas = get_historical_jornadas(conn, gid)
                    groups_data.append({
                        "id": code,
                        "name": name,
                        "fullName": full_name,
                        "phase": phase or island or "Gran Canaria",
                        "island": island,
                        "current_jornada": current_jornada,
                        "standings": standings,
                        "jornadas": hist_jornadas,
                    })
                entry[cat_key] = groups_data

        seasons_list.append(entry)

    return "const SEASONS=" + js_val(lean_list) + ";\n", seasons_list


def generate_per_season_files(seasons_list):
    """Write data-season-YYYY-YYYY.js for each historical season.

    The app fetches these lazily via state.js loadSeasonData() — keeping them
    in sync with data-seasons.js prevents drift bugs (e.g. 2026-05-08 GC1
    invisible because per-season file lagged behind DB).
    """
    written = []
    for s in seasons_list:
        if s.get("current"):
            continue
        name = s["name"]  # "2021-2022"
        var_name = "SEASON_" + name.replace("-", "_")
        out_path = os.path.join(PROJECT_ROOT, f"data-season-{name}.js")
        content = f"const {var_name}=" + js_val(s) + ";\n"
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(content)
        written.append((name, len(content)))
    return written


def snapshot_data_files(root=None):
    """C4: content hash of every data-*.js under root, used to decide whether
    this run actually changed any published data."""
    root = root or PROJECT_ROOT
    snap = {}
    for path in sorted(glob.glob(os.path.join(root, "data-*.js"))):
        with open(path, "rb") as f:
            snap[os.path.basename(path)] = hashlib.sha256(f.read()).hexdigest()
    return snap


def _next_version(index_content):
    """New cache-bust version string: YYYYMMDD, or YYYYMMDD + next letter
    suffix (b, c, ...) if index.html already carries today's version."""
    today = date.today().strftime("%Y%m%d")
    existing = re.search(r"\?v=(\d{8})([a-z]?)", index_content)
    if existing and existing.group(1) == today:
        suffix = existing.group(2)
        if not suffix:
            return today + "b"
        if suffix < "z":
            return today + chr(ord(suffix) + 1)
        return today + "z"  # cap — 26 same-day data changes won't happen
    return today


def bump_cache_version(root=None):
    """Bump ?v=, footer date (index.html) and CACHE_NAME (sw.js, contrato C3)
    to the SAME version string. Only call when data content changed — the
    decision lives in bump_if_changed() (contrato C4)."""
    root = root or PROJECT_ROOT
    index_path = os.path.join(root, "index.html")
    if not os.path.exists(index_path):
        print("  WARNING: index.html not found, skipping cache bump")
        return

    with open(index_path, "r", encoding="utf-8") as f:
        content = f.read()

    version = _next_version(content)
    today_display = date.today().strftime("%d/%m/%Y")
    new_content = re.sub(r"\?v=\d{8}[a-z]?", f"?v={version}", content)
    new_content = re.sub(
        r"Última actualización: \d{2}/\d{2}/\d{4}",
        f"Última actualización: {today_display}",
        new_content
    )
    if new_content != content:
        with open(index_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"  index.html cache version bumped to ?v={version}")

    # C3: keep sw.js CACHE_NAME (first line, /futbolbase-v[0-9a-z]+/) in sync
    # with the same version string so the SW cache rotates with the data.
    sw_path = os.path.join(root, "sw.js")
    if os.path.exists(sw_path):
        with open(sw_path, "r", encoding="utf-8") as f:
            sw = f.read()
        new_sw = re.sub(r"futbolbase-v[0-9a-z]+", f"futbolbase-v{version}", sw, count=1)
        if new_sw != sw:
            with open(sw_path, "w", encoding="utf-8") as f:
                f.write(new_sw)
            print(f"  sw.js CACHE_NAME bumped to futbolbase-v{version}")
    else:
        print("  WARNING: sw.js not found, skipping CACHE_NAME bump")


def bump_if_changed(before_snapshot, root=None):
    """C4: compare the data-*.js snapshot taken BEFORE regeneration with the
    current tree; bump ?v=/footer/CACHE_NAME only if some content changed.
    Avoids the daily no-op commit that only touched index.html."""
    after = snapshot_data_files(root)
    if after == before_snapshot:
        print("  data-*.js sin cambios — no se bumpea ?v= / footer / CACHE_NAME (C4)")
        return False
    bump_cache_version(root)
    return True


def write_file(filename, content):
    """Write content to a file in the project root."""
    path = os.path.join(PROJECT_ROOT, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    size = os.path.getsize(path)
    print(f"  {filename}: {size:,} bytes")


def main():
    conn = get_connection()
    conn.row_factory = None  # ensure tuples

    print("=== Generating JS data files from SQLite ===\n")

    # C4: hash all data-*.js BEFORE regenerating, to bump versions only if
    # some content actually changes during this run.
    before_snapshot = snapshot_data_files()

    print("1. data-benjamin.js")
    write_file("data-benjamin.js", generate_category_js(conn, "BENJAMIN", "BENJAMIN", "BENJ_STATS"))

    print("2. data-prebenjamin.js")
    write_file("data-prebenjamin.js", generate_category_js(conn, "PREBENJAMIN", "PREBENJAMIN", "PREBENJ_STATS"))

    print("3. data-history.js")
    write_file("data-history.js", generate_history_js(conn))

    print("4. data-matchdetail.js")
    write_file("data-matchdetail.js", generate_matchdetail_js(conn))
    print("4b. data-matchdetail-keys.js")
    write_file("data-matchdetail-keys.js", generate_matchdetail_keys_js(conn))

    print("5. data-goleadores.js")
    write_file("data-goleadores.js", generate_goleadores_js(conn))

    print("6. data-shields.js  [skipped - maintained manually]")

    print("7. data-stats.js")
    write_file("data-stats.js", generate_stats_js(conn))

    print("8. data-seasons.js")
    seasons_js, seasons_list = generate_seasons_js(conn)
    write_file("data-seasons.js", seasons_js)

    print("9. data-season-*.js (per-season lazy-loaded files)")
    written = generate_per_season_files(seasons_list)
    for name, sz in written:
        print(f"  data-season-{name}.js: {sz:,} bytes")

    # SP-1: per-season actas data files (only emitted for seasons with any cod_acta set)
    print("\n10. data-lineups-*.js / data-players-*.js (actas)")
    for sid, sname in conn.execute("SELECT id, name FROM seasons ORDER BY id").fetchall():
        has_actas = conn.execute(
            "SELECT 1 FROM matches m JOIN groups g ON g.id=m.group_id "
            "WHERE g.season_id=? AND m.cod_acta IS NOT NULL LIMIT 1", (sid,)
        ).fetchone()
        if not has_actas:
            continue
        print(f"  data-lineups-{sname}.js")
        write_file(f"data-lineups-{sname}.js", generate_lineups_js(conn, sname))
        print(f"  data-players-{sname}.js")
        write_file(f"data-players-{sname}.js", generate_players_js(conn, sname))

    print("\n11. Cache version (only if data changed — C4)")
    bump_if_changed(before_snapshot)

    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
