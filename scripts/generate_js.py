#!/usr/bin/env python3
"""
Generate all data-*.js files from the SQLite database.

Reads futbolbase.db and produces:
  - data-benjamin.js
  - data-prebenjamin.js
  - data-history.js
  - data-matchdetail.js
  - data-goleadores.js
  - data-seasons.js and data-season-<S>.js (the past seasons)
  - data-lineups-<S>-<grupo>.js (one per group with actas)
data-shields.js is maintained by hand. Plan B4 (decisión 1) retired
data-matchdetail-keys.js, data-stats.js and data-players-<S>.js: nobody read
them (test_pygen_fixes.py::TestGeneratorOutputs keeps them out).

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
    """Normalizer for the club key (contrato C1): db.get_or_create_team and, in
    the browser, src/state.js normalizeForTeamsMapping (until B4 it also keyed
    TEAMS_<S> in data-players-<S>.js, now retired).

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


def _match_key(home, away, hs, as_):
    """Match lookup key, identical to the frontend's
    (render.js / miequipo.js / modals.js: `home|away|hs-as`). Scores are
    sanitized (out-of-range -> None) and rendered JS-style ('null', not Python
    'None') so the ⚽ badge / lineup lookup matches on both sides."""
    def _js(v):
        v = sanitize_score(v)
        return "null" if v is None else str(v)
    return f"{home}|{away}|{_js(hs)}-{_js(as_)}"


_ROUND_RANK = (
    ("dieciseisavos", 1), ("octavos", 2), ("cuartos", 3),
    ("semifinal", 4), ("final", 5),  # "semifinal" also matches "semifinales"
)


def _jornada_sort_key(j):
    """Sort key for jornadas. Knockout rounds ("( Cuartos )"/"( Semifinales )"/
    "( Final )", optionally date-prefixed) order by progression (bracket reads
    Cuartos → Semifinales → Final), NOT by the day number or alphabetically.
    Regular jornadas ("Jornada 5", "Ronda 2", "5") order by their number."""
    s = str(j)
    sl = s.lower()
    dm = re.search(r"(\d{2})-(\d{2})-(\d{4})", s)
    datekey = (int(dm.group(3)), int(dm.group(2)), int(dm.group(1))) if dm else (0, 0, 0)
    for name, rank in _ROUND_RANK:
        if name in sl:
            return (datekey, rank)
    rest = re.sub(r"\d{2}-\d{2}-\d{4}", "", s)
    m = re.search(r"\d+", rest)
    return (datekey, int(m.group()) if m else 0)


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
    # Finales, semifinales («Semifinal Liga Primera Lanzarote») y torneos de cierre o clausura
    # (isCupGroup de src/state.js).
    if re.match(r"(semi)?final\b|torneo\b|clausura\b", (phase or "").lower()):
        return False
    if (code or "").upper().startswith(("PCC", "BC")):
        return False
    return True


# Real-world sanctions seen in the source deduct 3 (occasionally 6) points;
# the two corruptions found 2026-06-15 were -49 (Valkyrias Bec.: 0 vs 49) and
# -12 (Lanzarote B: 7 vs 19). A deviation beyond this tolerance, on a row whose
# W/D/L is self-consistent, is a mis-scraped points column, not a sanction.
_SANCTION_TOLERANCE = 6


def _repair_incoherent_points(stored):
    """Repair rows whose points are arithmetically impossible.

    The source occasionally mis-scrapes ONLY the points column (anti-scrape
    obfuscation defeats the parse and it defaults to a wrong number). When a
    row is otherwise self-consistent (``played == won + drawn + lost``, so
    ``3*won + drawn`` is trustworthy) but its points deviate beyond a plausible
    sanction, rewrite just that field and re-rank — keeping every other column.

    Crucially this does NOT recompute the table from ``matches``: the stored
    table can be MORE complete than the fixtures (it carries the final round
    and walkover losses that never appear as matches), so a full recompute
    would regress the other teams. Returns ``(rows, changed)``."""
    repaired = False
    out = []
    for row in stored:
        pos, name, pts, j, g, e, p, gf, gc, gd = row
        expected = 3 * g + e
        if j == g + e + p and abs(pts - expected) > _SANCTION_TOLERANCE:
            pts = expected
            repaired = True
        out.append([pos, name, pts, j, g, e, p, gf, gc, gd])
    if not repaired:
        return stored, False
    # canonical order: pts desc, DF desc, GF desc, name asc
    out.sort(key=lambda r: (-r[2], -r[9], -r[7], r[1]))
    for i, r in enumerate(out):
        r[0] = i + 1
    return out, True


def get_effective_standings(conn, group_id, code=None, phase=None):
    """Standings for a CURRENT-season group, recomputed from matches when the
    stored table went stale (the source kept publishing results after it
    stopped publishing standings — e.g. frozen since ~25/04 while results ran
    to J29). If the stored table is up to date it wins, because the official
    one may carry sanctions a recompute can't know about. When the stored table
    is complete but a row's points are impossible (a mis-scraped points
    column), only that field is repaired (see _repair_incoherent_points)."""
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
    repaired, changed = _repair_incoherent_points(stored)
    if changed:
        print(
            f"  WARNING: puntos incoherentes en grupo {code or group_id} "
            f"— reparados desde 3·G+E (resto de la tabla intacto)",
            file=sys.stderr,
        )
    return repaired


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
            "standingsKind": "source" if standings == get_standings(conn, gid) else (
                "reconstructed" if sum(r[3] for r in standings) > sum(r[3] for r in get_standings(conn, gid)) else "corrected"),
        }
        # La clasificación detallada de la federación (casa/fuera y sanciones) y qué significa cada
        # puesto (app de futbolaspalmas), solo si los hay.
        detail = standings_detail_map(conn, gid)
        if detail:
            group_obj["detail"] = detail
        zones = zones_of(conn, gid, len(standings))
        if zones:
            group_obj["zones"] = zones
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
            """SELECT m.jornada, m.date, h.name, a.name, m.home_score, m.away_score, m.time, m.venue
               FROM matches m
               JOIN teams h ON m.home_team_id = h.id
               JOIN teams a ON m.away_team_id = a.id
               WHERE m.group_id = ?
               ORDER BY m.jornada, m.date, m.time, h.name""",
            (gid,),
        ).fetchall()

        jornadas = {}
        for jornada, dt, home, away, hs, as_, kickoff, venue in rows:
            if jornada not in jornadas:
                jornadas[jornada] = []
            ctx = f"en {home} vs {away} ({dt})"
            jornadas[jornada].append(
                [dt, home, away, sanitize_score(hs, ctx), sanitize_score(as_, ctx), None, kickoff, venue]
            )
            total_matches += 1

        # Sort jornadas by progression (knockout rounds) or number (leagues)
        sorted_jornadas = dict(sorted(jornadas.items(), key=lambda x: _jornada_sort_key(x[0])))
        history[code] = sorted_jornadas

    # El directorio de campos va con el calendario (CAMPOS, para «Cómo llegar»):
    # un fichero inmediato nuevo rompería la primera apertura sin red con el SW
    # anterior, que no lo tiene y devolvería index.html en su lugar.
    js = "const HISTORY=" + js_val(history) + ";\n" + generate_campos_js(conn) + "\n"
    js += f"const HIST_MATCHES={total_matches};"
    # Y con ellos, por la misma razón, la ficha de cada equipo de la temporada (equipación y campo,
    # EQUIPOS) y el estado de los partidos que da la app de futbolaspalmas (ESTADOS).
    row = conn.execute("SELECT id FROM seasons WHERE is_current = 1").fetchone()
    js += "\nconst EQUIPOS=" + js_val(team_info_map(conn, row[0]) if row else {}) + ";"
    js += "\nconst ESTADOS=" + js_val(match_states_map(conn, row[0]) if row else {}) + ";"
    js += "\nconst COBERTURA=" + js_val(coverage_summary(conn)) + ";"
    return js


def coverage_summary(conn):
    """Lo que guarda la base, para «Fuentes»: por temporada [nombre, grupos, partidos, con
    resultado, con acta, jugadores con alineación, goles con autor]; equipos con ficha (equipación
    y campo), campos con coordenadas y el tamaño de la base en MB (de 5 en 5, para que no cambie en
    cada pasada del bot)."""
    seasons = []
    for sid, name in conn.execute("SELECT id, name FROM seasons ORDER BY start_year DESC"):
        groups, matches, played, actas = conn.execute(
            """SELECT count(DISTINCT g.id), count(m.id), count(m.home_score), count(m.cod_acta)
               FROM groups g LEFT JOIN matches m ON m.group_id = g.id WHERE g.season_id = ?""", (sid,)).fetchone()
        players = conn.execute(
            """SELECT count(DISTINCT a.player_id) FROM appearances a JOIN matches m ON m.id = a.match_id
               JOIN groups g ON g.id = m.group_id WHERE g.season_id = ?""", (sid,)).fetchone()[0] \
            if _has_table(conn, "appearances") else 0
        # Por partido, la fuente que más goles con autor da (el acta o la cronología del portal): las dos
        # cuentan los mismos goles.
        events = ("(SELECT match_id, count(*) AS n FROM match_events WHERE kind = 'goal' GROUP BY match_id)"
                  if _has_table(conn, "match_events") else "(SELECT NULL AS match_id, 0 AS n)")
        goals = conn.execute(
            f"""SELECT coalesce(sum(max(coalesce(e.n, 0), coalesce(x.n, 0))), 0)
                FROM matches m JOIN groups g ON g.id = m.group_id
                LEFT JOIN {events} e ON e.match_id = m.id
                LEFT JOIN (SELECT match_id, count(*) AS n FROM goals GROUP BY match_id) x ON x.match_id = m.id
                WHERE g.season_id = ?""", (sid,)).fetchone()[0]
        seasons.append([name, groups, matches, played, actas, players, goals])
    teams = conn.execute("SELECT count(DISTINCT team_id) FROM team_seasons").fetchone()[0] \
        if _has_table(conn, "team_seasons") else 0
    venues = conn.execute("SELECT count(*) FROM venue_details WHERE lat IS NOT NULL").fetchone()[0] \
        if _has_table(conn, "venue_details") else 0
    db = os.path.join(PROJECT_ROOT, "futbolbase.db")
    size = int(5 * round(os.path.getsize(db) / 1024 / 1024 / 5)) if os.path.exists(db) else None
    return {"temporadas": seasons, "equipos": teams, "campos": venues, "mb": size}


def _keyed_or_dup(pairs):
    """[(clave, entrada), …] → {clave: entrada}; si dos o más partidos producen
    la misma clave `local|visitante|gl-gv`, {clave: {"dup": True, "list":
    [entrada, …]}} en el orden recibido. Nunca sobrescribe: antes ganaba el
    último partido y el otro desaparecía sin aviso (la clave
    'CD Calero|La Garita|1-11' la comparten un partido de FF15 y otro de PG2).
    Una entrada dup no lleva .g/.home: la interfaz actual lee undefined y no
    pinta nada, en vez de los datos de otro partido."""
    buckets = {}
    for key, entry in pairs:
        buckets.setdefault(key, []).append(entry)
    return {k: v[0] if len(v) == 1 else {"dup": True, "list": v}
            for k, v in buckets.items()}


def _match_details(conn):
    """{clave: {s, gr, g}} (o dup) con la cronología de goles de TODAS las
    temporadas. s = temporada y gr = código de grupo, para que la interfaz
    distinga dos partidos con la misma clave."""
    rows = conn.execute(
        """SELECT DISTINCT m.id, h.name, a.name, m.home_score, m.away_score,
                  s.name, gr.code
           FROM matches m
           JOIN teams h ON m.home_team_id = h.id
           JOIN teams a ON m.away_team_id = a.id
           JOIN groups gr ON gr.id = m.group_id
           JOIN seasons s ON s.id = gr.season_id
           JOIN goals g ON g.match_id = m.id
           ORDER BY m.id""",
    ).fetchall()

    pairs = []
    for match_id, home, away, hs, as_, season, code in rows:
        goals = conn.execute(
            """SELECT minute, player_name, running_score, side, type
               FROM goals WHERE match_id = ? ORDER BY minute, id""",
            (match_id,),
        ).fetchall()
        pairs.append((_match_key(home, away, hs, as_),
                      {"s": season, "gr": code, "g": [list(g) for g in goals]}))
    return _keyed_or_dup(pairs + _fp_goal_entries(conn))


def _running(goals):
    """[[minuto, nombre, marcador parcial, lado, tipo]] con el parcial, si todos los goles tienen
    minuto (orden estable por minuto); si no, sin parcial."""
    if any(g[0] is None for g in goals):
        return [[g[0], g[1], None, g[3], g[4]] for g in goals]
    h = a = 0
    out = []
    for g in sorted(goals, key=lambda g: g[0]):
        h, a = (h + 1, a) if g[3] == "h" else (h, a + 1)
        out.append([g[0], g[1], f"{h}-{a}", g[3], g[4]])
    return out


def _fp_goal_entries(conn):
    """[(clave, entrada)] de MATCH_DETAIL con los goleadores de la app de futbolaspalmas (fp_goals),
    para los partidos sin cronología de futbolaspalmas del portal antiguo (goals) cuyos goles en la
    app cuadran con el marcador: sin acta, los de la app; con un acta que tiene goles sin nombre
    (niños que la federación no publica), la cronología del acta con esos nombres de pila puestos
    por lado y minuto. Un acta con todos los nombres manda: no sale aquí."""
    if not (_has_table(conn, "fp_goals") and _has_table(conn, "fp_matches")):
        return []
    rows = conn.execute(
        """SELECT m.id, h.name, a.name, m.home_score, m.away_score, s.name, g.code, f.fp_id, m.cod_acta,
                  m.home_team_id
           FROM fp_matches f JOIN matches m ON m.id = f.match_id JOIN groups g ON g.id = m.group_id
           JOIN seasons s ON s.id = g.season_id
           JOIN teams h ON h.id = m.home_team_id JOIN teams a ON a.id = m.away_team_id
           WHERE m.home_score IS NOT NULL AND m.away_score IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM goals x WHERE x.match_id = m.id)
           ORDER BY m.id""").fetchall()
    pairs = []
    for mid, home, away, hs, as_, season, code, fp_id, cod, home_id in rows:
        fp = conn.execute("SELECT side, minute, name FROM fp_goals WHERE fp_id = ? ORDER BY ord", (fp_id,)).fetchall()
        if not fp or (sum(g[0] == "h" for g in fp), sum(g[0] == "a" for g in fp)) != (hs, as_):
            continue
        merged = None
        if cod:
            evs = conn.execute(
                """SELECT e.team_id, e.minute, p.full_name, e.goal_type FROM match_events e
                   JOIN players p ON p.id = e.player_id
                   WHERE e.match_id = ? AND e.kind = 'goal' ORDER BY COALESCE(e.minute, 9999), e.id""",
                (mid,)).fetchall()
            if all(name for _, _, name, _ in evs):
                continue                      # el acta trae todos los nombres
            if len(evs) == hs + as_:
                free = list(fp)
                merged = []
                for team_id, minute, name, gt in evs:
                    side = "h" if team_id == home_id else "a"
                    if gt == "own":
                        side = "a" if side == "h" else "h"
                    if not name:
                        pick = next((g for g in free if g[0] == side and g[1] == minute), None) \
                            or next((g for g in free if g[0] == side), None)
                        if pick:
                            free.remove(pick)
                            name = pick[2]
                    merged.append([minute, name or None, None, side, "o" if gt == "own" else "r"])
        if merged is None:
            merged = [[minute, name, None, side, "r"] for side, minute, name in fp]
        pairs.append((_match_key(home, away, hs, as_),
                      {"s": season, "gr": code, "g": _running(merged), "src": "fp"}))
    return pairs


def generate_matchdetail_js(conn):
    """Generate data-matchdetail.js with goal details per match."""
    header = (
        "// data-matchdetail.js — generado por scripts/generate_js.py\n"
        "// NO editar manualmente — usar scripts/update.sh para regenerar\n\n"
    )
    js = header + "const MATCH_DETAIL=" + js_val(_match_details(conn)) + ";"
    return js


def _season_const_suffix(season_name):
    return season_name.replace("-", "_")


def lineups_const(season_name, code):
    """Nombre de la constante de data-lineups-<S>-<grupo>.js: LINEUPS_<YYYY_YYYY>_<grupo>."""
    return f"LINEUPS_{_season_const_suffix(season_name)}_{code}"


def lineups_entries(conn, season_name, code=None):
    """[(clave, entrada)] de las actas de la temporada (o de un grupo): la clave es
       "<home>|<away>|<hs>-<as>" y la entrada { s, gr, cod, home:[...], away:[...],
       events:[...], coachH, coachA, ref, delH?, delA? } (s = temporada, gr = código
       del grupo, cod = matches.cod_acta)."""
    season_id = conn.execute("SELECT id FROM seasons WHERE name=?", (season_name,)).fetchone()
    if not season_id:
        return []
    rows = conn.execute("""
      SELECT m.id, t1.name, t2.name, m.home_score, m.away_score, g.code, m.cod_acta
        FROM matches m JOIN groups g ON g.id=m.group_id
        JOIN teams t1 ON t1.id=m.home_team_id JOIN teams t2 ON t2.id=m.away_team_id
       WHERE g.season_id=? AND m.cod_acta IS NOT NULL AND (? IS NULL OR g.code=?)
       ORDER BY m.id""", (season_id[0], code, code)).fetchall()
    has_id = any(r[1] == "fiflp_id" for r in conn.execute("PRAGMA table_info(players)"))
    has_all = _has_table(conn, "match_staff_all")
    pairs = []
    for mid, h, a, hs, asc, code, cod in rows:
        key = _match_key(h, a, hs, asc)
        apps = conn.execute(f"""
          SELECT a.team_id, p.full_name, a.dorsal, a.role, a.goals, a.yellow, a.red,
                 {"p.fiflp_id" if has_id else "NULL"}
            FROM appearances a JOIN players p ON p.id=a.player_id
           WHERE a.match_id=? ORDER BY a.role DESC, a.dorsal""", (mid,)).fetchall()
        home_team_id = conn.execute("SELECT home_team_id FROM matches WHERE id=?", (mid,)).fetchone()[0]

        def player(r):
            # id: el del jugador en la federación (estable entre temporadas), si se conoce.
            out = {"n": r[1], "dn": r[2], "r": r[3], "g": r[4], "y": r[5], "rd": r[6]}
            if r[7] is not None:
                out["id"] = r[7]
            return out
        home = [player(r) for r in apps if r[0] == home_team_id]
        away = [player(r) for r in apps if r[0] != home_team_id]
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
                # Un gol en propia puerta suma al rival: el lado del gol es el
                # contrario al del jugador que lo marca.
                if gt == "own":
                    side = "a" if side == "h" else "h"
                events.append({"t": "goal", "s": side, "n": name, "m": mn, "gt": gt})
            else:
                events.append({"t": kind, "s": side, "n": name, "m": mn})
        ref = conn.execute("SELECT name FROM match_staff WHERE match_id=? AND kind='referee'", (mid,)).fetchone()
        ch = conn.execute("SELECT name FROM match_staff WHERE match_id=? AND kind='coach' AND team_id=?", (mid, home_team_id)).fetchone()
        ca = conn.execute("SELECT name FROM match_staff WHERE match_id=? AND kind='coach' AND team_id!=?", (mid, home_team_id)).fetchone()
        entry = {"s": season_name, "gr": code, "cod": cod,
                 "home": home, "away": away, "events": events,
                 "coachH": ch[0] if ch else None,
                 "coachA": ca[0] if ca else None,
                 "ref":    ref[0] if ref else None}
        # Todo el cuerpo técnico de cada equipo y los árbitros, con el cargo del acta (match_staff_all).
        if has_all:
            rows_s = conn.execute("SELECT team_id, role, name FROM match_staff_all WHERE match_id=? ORDER BY ord",
                                  (mid,)).fetchall()
            for key_s, test in (("stH", lambda t: t == home_team_id),
                                ("stA", lambda t: t is not None and t != home_team_id),
                                ("refs", lambda t: t is None)):
                found = [[role, name] for t, role, name in rows_s if test(t)]
                if found:
                    entry[key_s] = found
        # Delegados (de campo y de equipo) del acta de la federación, si los hay.
        for side_key, cmp in (("delH", "="), ("delA", "!=")):
            rows_d = conn.execute(f"""SELECT kind, name FROM match_staff WHERE match_id=?
                                      AND kind IN ('delegate_field','delegate_team') AND team_id{cmp}?""",
                                  (mid, home_team_id)).fetchall()
            if rows_d:
                entry[side_key] = {("campo" if k == "delegate_field" else "equipo"): n for k, n in rows_d}
        pairs.append((key, entry))
    return pairs


def generate_lineups_js(conn, season_name, code):
    """data-lineups-<S>-<grupo>.js: las actas de UN grupo de la temporada.
       const LINEUPS_<YYYY_YYYY>_<grupo> = { "<home>|<away>|<hs>-<as>": { s, gr, cod, ... } };
       Una clave que comparten dos o más partidos del grupo es
       { dup: true, list: [ {s, gr, cod, home, ...}, ... ] }.
       Por grupo y no por temporada: una temporada entera con todas sus actas
       pesa ~10 MB, y la ficha de un equipo o un partido solo necesita su grupo."""
    obj = _keyed_or_dup(lineups_entries(conn, season_name, code))
    return ("// Auto-generated by scripts/generate_js.py — do not edit\n"
            "const " + lineups_const(season_name, code) + " = " + json.dumps(obj, ensure_ascii=False) + ";\n")


LINEUPS_FILE = re.compile(r"^data-lineups-(\d{4}-\d{4})-([A-Za-z0-9]+)\.js$")


def lineups_files(conn):
    """{fichero: contenido} de los data-lineups-<S>-<grupo>.js: uno por grupo con
       alguna acta."""
    out = {}
    for sname, code in conn.execute("""
        SELECT DISTINCT s.name, g.code FROM matches m JOIN groups g ON g.id=m.group_id
          JOIN seasons s ON s.id=g.season_id
         WHERE m.cod_acta IS NOT NULL ORDER BY s.name, g.code""").fetchall():
        out[f"data-lineups-{sname}-{code}.js"] = generate_lineups_js(conn, sname, code)
    return out


def write_lineups(conn, root=None):
    """Escribe los data-lineups-<S>-<grupo>.js y borra los que ya no tocan: los
       de un grupo que ya no tiene actas y los antiguos, de temporada entera
       (data-lineups-<S>.js)."""
    root = root or PROJECT_ROOT
    files = lineups_files(conn)
    for name in sorted(os.listdir(root)):
        if name.startswith("data-lineups-") and name.endswith(".js") and name not in files:
            os.remove(os.path.join(root, name))
            print(f"  {name}: borrado")
    for name, content in files.items():
        with open(os.path.join(root, name), "w", encoding="utf-8") as f:
            f.write(content)
    print(f"  {len(files)} ficheros data-lineups-<S>-<grupo>.js")
    return files


# La ficha de cada jugador (por su id de la federación, el mismo niño de prebenjamín a benjamín y de
# una temporada a otra): 16 ficheros, el del id módulo 16, para que abrir una ficha no baje todas.
JUGADORES_SHARDS = 16


def _season_day(text, start_year):
    """'AAAA-MM-DD', 'DD-MM-AAAA' o 'DD/MM' (sin año: de julio a diciembre, el año de inicio de la
    temporada) → 'AAAA-MM-DD', o None."""
    text = (text or "").strip()
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", text)
    if m:
        return text
    m = re.fullmatch(r"(\d{1,2})[-/](\d{1,2})(?:[-/](\d{4}))?", text)
    if not m:
        return None
    day, month = int(m.group(1)), int(m.group(2))
    year = int(m.group(3)) if m.group(3) else (start_year if month >= 7 else start_year + 1)
    return f"{year:04d}-{month:02d}-{day:02d}"


def jugadores_files(conn):
    """{fichero: contenido} de los data-jugadores-<k>.js: const JUGADORES_<k> =
       {"p": {"<fiflp_id>": {"n": nombre, "c": [[temporada, grupo, equipo,
       partidos, titular, goles, amarillas, rojas], ...]}}, "g": {"<temporada>/
       <grupo>": [categoría, nombre, fase, isla]}}: una fila por grupo y equipo,
       en orden de temporada y de primer partido del grupo, y de cada grupo lo
       que la app necesita para nombrarlo (model.groupLabel)."""
    if not any(r[1] == "fiflp_id" for r in conn.execute("PRAGMA table_info(players)")):
        return {}
    # El primer día de cada grupo (las fechas vienen en tres formatos).
    first_day = {}
    for gid, day, start in conn.execute("""SELECT m.group_id, m.date, s.start_year FROM matches m
                                             JOIN groups g ON g.id=m.group_id JOIN seasons s ON s.id=g.season_id"""):
        iso = _season_day(day, start)
        if iso and (gid not in first_day or iso < first_day[gid]):
            first_day[gid] = iso
    rows = conn.execute("""
        SELECT p.fiflp_id, p.full_name, s.name, s.start_year, g.id, g.code, t.name, COUNT(*),
               SUM(a.role='starter'), SUM(a.goals), SUM(a.yellow), SUM(a.red),
               LOWER(c.name), g.name, g.phase, g.island
          FROM appearances a JOIN players p ON p.id=a.player_id
          JOIN matches m ON m.id=a.match_id JOIN groups g ON g.id=m.group_id
          JOIN seasons s ON s.id=g.season_id JOIN teams t ON t.id=a.team_id
          JOIN categories c ON c.id=g.category_id
         WHERE p.fiflp_id IS NOT NULL
         GROUP BY p.id, g.id, a.team_id""").fetchall()
    rows.sort(key=lambda r: (r[0], r[3], first_day.get(r[4], "9999"), r[5], r[6]))
    shards = [{"p": {}, "g": {}} for _ in range(JUGADORES_SHARDS)]
    for fid, name, season, _, _, code, team, pj, tit, goals, yellow, red, cat, gname, phase, island in rows:
        shard = shards[fid % JUGADORES_SHARDS]
        shard["p"].setdefault(str(fid), {"n": name, "c": []})["c"].append(
            [season, code, team, pj, tit, goals, yellow, red])
        shard["g"].setdefault(f"{season}/{code}", [cat, gname, phase, island])
    return {f"data-jugadores-{k}.js": f"const JUGADORES_{k} = "
            + json.dumps(shard, ensure_ascii=False, separators=(",", ":")) + ";\n"
            for k, shard in enumerate(shards)}


def write_jugadores(conn, root=None):
    root = root or PROJECT_ROOT
    files = jugadores_files(conn)
    for name, content in files.items():
        with open(os.path.join(root, name), "w", encoding="utf-8") as f:
            f.write(content)
    total = sum(len(c) for c in files.values())
    print(f"  {len(files)} ficheros data-jugadores-<k>.js, {total:,} bytes")
    return files


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


def goleadores_entries(conn, cat_name, season_name=None):
    """[{id, g, s: [[jugador, equipo, goles, partidos]]}] de una categoría, de la
    temporada actual o de `season_name`. Los niños sin nombre publicado llevan la
    clave '#<grupo>-<n>' (el frontend dice «Sin nombre publicado»)."""
    if season_name is None:
        groups = get_groups_for_category(conn, cat_name)
    else:
        groups = conn.execute(
            """SELECT g.id, g.code, g.name, g.full_name, g.phase, g.island, g.url, g.current_jornada
               FROM groups g JOIN seasons s ON s.id=g.season_id JOIN categories c ON c.id=g.category_id
               WHERE s.name=? AND UPPER(c.name)=? ORDER BY g.code""", (season_name, cat_name)).fetchall()
    entries = []
    for gid, code, name, full_name, phase, island, url, current_jornada in groups:
        scorers = conn.execute(
            """SELECT s.player_name, t.name, s.goals, s.games
               FROM scorers s JOIN teams t ON s.team_id = t.id
               WHERE s.group_id = ? ORDER BY s.goals DESC, s.games ASC""", (gid,)).fetchall()
        rows, anon = [], 0
        for player, team, goals, games in scorers:
            if not player or player.startswith("#"):
                anon += 1
                player = f"#{code}-{anon}"
            rows.append([player, team, goals, games])
        if scorers:
            entries.append({"id": code, "g": _goleadores_group_name(code, full_name or "", cat_name), "s": rows})
    return entries


def generate_goleadores_js(conn):
    """Generate data-goleadores.js with top scorers per group (temporada actual).

    Reads from the `scorers` table: desde 2026-27, los goleadores de la
    federación (update_fiflp.update_goleadores); antes, los de futbolaspalmas.
    """
    return "\n".join(f"const {var_name}=" + js_val(goleadores_entries(conn, cat_name)) + ";"
                     for cat_name, var_name in [("BENJAMIN", "GOL_BENJ"), ("PREBENJAMIN", "GOL_PREBENJ")])


def venue_key(name):
    """Clave para casar el campo del calendario con el directorio de la
    federación: sin tildes ni signos, y sin el tipo de campo pegado al nombre
    ('Cirilo Lorenzo Alonso F-8' = 'CIRILO LORENZO ALONSO')."""
    import unicodedata
    text = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode().upper()
    text = re.sub(r"\(?\bF\s*-?\s*(?:7|8|11)\b\)?", " ", text)
    text = re.sub(r"[^A-Z0-9 ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def generate_campos_js(conn):
    """CAMPOS (en data-history.js) = {campo: [dirección, localidad, superficie, tipo(, latitud,
    longitud)]} de los partidos y los equipos de la temporada actual (directorio y fichas de campos
    de la federación, campos_entries)."""
    row = conn.execute("SELECT id FROM seasons WHERE is_current = 1").fetchone()
    out = campos_entries(conn, season_venue_names(conn, row[0])) if row else {}
    return "const CAMPOS=" + js_val(out) + ";"


def _has_table(conn, name):
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone() is not None


def computed_table(conn, group_id, season_name):
    """¿Es la clasificación del grupo una calculada con sus partidos (import_wayback_portal)?"""
    if not _has_table(conn, "portal_groups"):
        return False
    from import_wayback_portal import COMPUTED_STANDINGS
    return season_name in COMPUTED_STANDINGS and conn.execute(
        "SELECT 1 FROM portal_groups WHERE group_id=? AND mode='group'", (group_id,)).fetchone() is not None


def standings_detail_map(conn, group_id):
    """{equipo: [Jc, Gc, Ec, Pc, Jf, Gf, Ef, Pf, sanción]} de la clasificación detallada de la
    federación (import_fiflp_detalle.py): partidos jugados, ganados, empatados y perdidos en casa y
    fuera, y los puntos de sanción. None si el grupo no la tiene."""
    if not _has_table(conn, "standings_detail"):
        return None
    rows = conn.execute(
        """SELECT t.name, d.home_played, d.home_won, d.home_drawn, d.home_lost,
                  d.away_played, d.away_won, d.away_drawn, d.away_lost, d.sanction
           FROM standings_detail d JOIN teams t ON t.id = d.team_id
           WHERE d.group_id = ? ORDER BY t.name""", (group_id,)).fetchall()
    return {r[0]: list(r[1:]) for r in rows} or None


def zones_of(conn, group_id, teams):
    """[[desde, hasta, tipo, texto]]: qué significa cada puesto de la tabla según la app de
    futbolaspalmas (fp_ligas). Ascenso, playoff, copa y promoción se cuentan desde arriba y el
    descenso desde abajo. None sin datos."""
    if not _has_table(conn, "fp_ligas"):
        return None
    row = conn.execute(
        """SELECT plazas_ascenso, texto_ascenso, plazas_playoff, texto_playoff, plazas_copa, texto_copa,
                  plazas_promocion, texto_promocion, plazas_descenso, texto_descenso
           FROM fp_ligas WHERE group_id = ? ORDER BY liga_id LIMIT 1""", (group_id,)).fetchone()
    if not row:
        return None
    out, pos = [], 1
    for kind, n, text in (("ascenso", row[0], row[1]), ("playoff", row[2], row[3]),
                          ("copa", row[4], row[5]), ("promocion", row[6], row[7])):
        if n and n > 0:
            out.append([pos, pos + n - 1, kind, (text or "").strip() or None])
            pos += n
    if row[8] and row[8] > 0 and teams:
        out.append([max(1, teams - row[8] + 1), teams, "descenso", (row[9] or "").strip() or None])
    return out or None


def team_info_map(conn, season_id):
    """{equipo: [camiseta, pantalón, medias, campo, superficie, equipación de futbolaspalmas]} de la
    temporada: el directorio de la federación (team_seasons, import_fiflp_detalle.py) y la app de
    futbolaspalmas (fp_teams: el nombre de su dibujo, «2026-blanca-blanco-blancas.png»)."""
    out = {}
    if _has_table(conn, "team_seasons"):
        for name, shirt, shorts, socks, venue, surface in conn.execute(
                """SELECT t.name, ts.shirt, ts.shorts, ts.socks, ts.venue_name, ts.surface
                   FROM team_seasons ts JOIN teams t ON t.id = ts.team_id
                   WHERE ts.season_id = ? ORDER BY t.name""", (season_id,)):
            out[name] = [shirt, shorts, socks, venue, surface, None]
    if _has_table(conn, "fp_teams") and _has_table(conn, "fp_ligas"):
        for name, kit in conn.execute(
                """SELECT t.name, f.equipacion FROM fp_teams f JOIN fp_ligas l ON l.liga_id = f.liga_id
                   JOIN teams t ON t.id = f.team_id
                   WHERE l.season_id = ? AND f.equipacion IS NOT NULL AND f.equipacion <> ''
                   ORDER BY t.name, f.liga_id""", (season_id,)):
            out.setdefault(name, [None] * 6)[5] = kit
    return dict(sorted(out.items()))


# Estados de la app de futbolaspalmas que el marcador no dice.
FP_STATES = ("aplazado", "suspendido", "retirado", "anulado")


def match_states_map(conn, season_id):
    """{código de grupo: {jornada: {"local|visitante": [estado, motivo, hora real de inicio]}}} de
    los partidos de la temporada que la app de futbolaspalmas da aplazados, suspendidos, retirados
    o anulados, o con su hora real de inicio (HH:MM)."""
    if not _has_table(conn, "fp_matches"):
        return {}
    out = {}
    rows = conn.execute(
        """SELECT g.code, m.jornada, h.name, a.name, f.estado, f.motivo_aplazado, f.hora_inicio
           FROM fp_matches f JOIN matches m ON m.id = f.match_id JOIN groups g ON g.id = m.group_id
           JOIN teams h ON h.id = m.home_team_id JOIN teams a ON a.id = m.away_team_id
           WHERE g.season_id = ? ORDER BY g.code, m.jornada, h.name""", (season_id,)).fetchall()
    for code, jornada, home, away, estado, motivo, inicio in rows:
        state = estado if estado in FP_STATES else None
        start = (inicio or "")[11:16] if re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?", inicio or "") else None
        if not state and not start:
            continue
        out.setdefault(code, {}).setdefault(jornada, {})[f"{home}|{away}"] = [state, (motivo or "").strip() or None, start]
    return out


def campos_entries(conn, venue_names):
    """{campo: [dirección, localidad, superficie, tipo(, latitud, longitud)]} de los campos dados,
    del directorio de la federación (venues) y de sus fichas (venue_details: las coordenadas). Casa
    por venue_key y, si no, por un único campo del directorio que empiece igual; un campo que solo
    está en las fichas (el de un equipo), por su nombre."""
    has = _has_table(conn, "venues")
    directory = conn.execute("SELECT norm, address, city, surface, kind, code FROM venues").fetchall() if has else []
    details = {}
    if _has_table(conn, "venue_details"):
        details = {r[0]: r[1:] for r in conn.execute(
            "SELECT code, name, address, city, surface, lat, lon FROM venue_details")}
    by_key = {r[0]: r[1:] for r in directory}
    by_detail_name = {venue_key(v[0]): (code, v) for code, v in details.items() if v[0]}
    out = {}
    for venue in venue_names:
        key = venue_key(venue)
        info = by_key.get(key)
        if info is None and len(key) >= 6:
            near = [v for k, v in by_key.items() if k.startswith(key) or key.startswith(k)]
            info = near[0] if len(near) == 1 else None
        if info:
            entry, code = list(info[:4]), info[4]
        elif key in by_detail_name:
            code, d = by_detail_name[key]
            entry = [d[1], d[2], d[3], None]
        else:
            continue
        d = details.get(code)
        if d and d[4] is not None and d[5] is not None:
            entry += [round(d[4], 6), round(d[5], 6)]
        out[venue] = entry
    return out


def season_venue_names(conn, season_id):
    """Los campos de los partidos de la temporada y los de sus equipos (team_seasons)."""
    names = {r[0] for r in conn.execute(
        """SELECT DISTINCT m.venue FROM matches m JOIN groups g ON g.id = m.group_id
           WHERE g.season_id = ? AND m.venue IS NOT NULL AND m.venue <> ''""", (season_id,))}
    if _has_table(conn, "team_seasons"):
        names |= {r[0] for r in conn.execute(
            "SELECT DISTINCT venue_name FROM team_seasons WHERE season_id = ? AND venue_name IS NOT NULL",
            (season_id,))}
    return sorted(names)


def get_historical_jornadas(conn, group_id, include_details=False):
    """Return matches grouped by jornada num for historical groups.
    Format: {jornada_num: [[date, home, away, hs, as_], ...]}; with
    include_details, the 8 columns of HISTORY:
    [date, home, away, hs, as_, None, time, venue]. Every per-season file
    uses include_details (Plan A §9.1).
    Only includes jornadas with at least one match.
    """
    rows = conn.execute(
        """SELECT m.jornada, m.date, h.name, a.name, m.home_score, m.away_score, m.time, m.venue
           FROM matches m
           JOIN teams h ON m.home_team_id = h.id
           JOIN teams a ON m.away_team_id = a.id
           WHERE m.group_id = ?
           ORDER BY m.jornada, m.date, m.time, h.name""",
        (group_id,),
    ).fetchall()

    jornadas = {}
    for jornada, dt, home, away, hs, as_, kickoff, venue in rows:
        ctx = f"en {home} vs {away} ({dt})"
        jornadas.setdefault(jornada, []).append(
            [dt, home, away, sanitize_score(hs, ctx), sanitize_score(as_, ctx)]
            + ([None, kickoff, venue] if include_details else [])
        )

    return dict(sorted(jornadas.items(), key=lambda x: _jornada_sort_key(x[0])))


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
                    hist_jornadas = get_historical_jornadas(conn, gid, include_details=True)
                    group_obj = {
                        "id": code,
                        "name": name,
                        "fullName": full_name,
                        "phase": phase or island or "Gran Canaria",
                        "island": island,
                        "current_jornada": current_jornada,
                        "standings": standings,
                        "jornadas": hist_jornadas,
                    }
                    detail = standings_detail_map(conn, gid)
                    if detail:
                        group_obj["detail"] = detail
                    # La clasificación calculada con los partidos (2014-15 del archivo del portal: la
                    # archivada era de marzo-abril), para que la web no la llame oficial.
                    if computed_table(conn, gid, season_name):
                        group_obj["standingsKind"] = "reconstructed"
                    groups_data.append(group_obj)
                entry[cat_key] = groups_data
            # Los goleadores de la temporada archivada, si la base los tiene
            # (2025-26: los de futbolaspalmas; desde 2026-27, los de la federación).
            gol = {cat_key: goleadores_entries(conn, cat_name, season_name)
                   for cat_name, cat_key in [("BENJAMIN", "benjamin"), ("PREBENJAMIN", "prebenjamin")]}
            if any(gol.values()):
                entry["gol"] = gol
            # La ficha de cada equipo (equipación y campo) y los campos de la temporada, con sus
            # coordenadas, si la base los tiene.
            equipos = team_info_map(conn, season_id)
            if equipos:
                entry["equipos"] = equipos
            campos = campos_entries(conn, season_venue_names(conn, season_id))
            if campos:
                entry["campos"] = campos

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


# El literal de sw.js con los archivos de temporada que precachea el SW.
SEASON_FILES_RE = re.compile(r"const SEASON_FILES = \[[^\]]*\];")


def sync_season_files(names, root=None):
    """sw.js con SEASON_FILES = los data-season-<S>.js de `names` (las temporadas pasadas que acaba de
    escribir generate_per_season_files), de la más nueva a la más vieja, con el formato de
    activate_season.season_files_for. Una temporada archivada nueva (import_fiflp_grupos) entra en la
    misma pasada del bot que publica su archivo: sin precachearla, sin conexión se rompen la
    Trayectoria y «Ver temporadas anteriores», que cargan el archivo entero. Las que ya estaban se
    quedan (una temporada no sale nunca de la base). Solo escribe si cambia; True si ha escrito. No
    toca CACHE_NAME ni el resto de sw.js."""
    path = os.path.join(root or PROJECT_ROOT, "sw.js")
    if not os.path.exists(path):
        return False
    with open(path, encoding="utf-8") as f:
        worker = f.read()
    match = SEASON_FILES_RE.search(worker)
    if not match:
        return False
    seasons = set(re.findall(r"'\./data-season-(\d{4}-\d{4})\.js'", match.group(0))) | set(names)
    ordered = sorted(seasons, key=lambda s: int(s[:4]), reverse=True)
    literal = "const SEASON_FILES = [\n" + "".join(f"  './data-season-{s}.js',\n" for s in ordered) + "];"
    if literal == match.group(0):
        return False
    with open(path, "w", encoding="utf-8") as f:
        f.write(worker[:match.start()] + literal + worker[match.end():])
    print(f"  sw.js SEASON_FILES: {len(ordered)} temporadas ({', '.join(ordered)})")
    return True


def snapshot_data_files(root=None):
    """C4: content hash of every data-*.js under root, used to decide whether
    this run actually changed any published data."""
    root = root or PROJECT_ROOT
    snap = {}
    for path in sorted(glob.glob(os.path.join(root, "data-*.js"))):
        with open(path, "rb") as f:
            snap[os.path.basename(path)] = hashlib.sha256(f.read()).hexdigest()
    return snap


def _next_version(index_content, today=None):
    """New cache-bust version string: YYYYMMDD, or YYYYMMDD + next letter
    suffix (b, c, ...) if index.html already carries that day's version.
    `today` (datetime.date) defaults to date.today(): the bot's clock, UTC on
    the GitHub runner."""
    today = (today or date.today()).strftime("%Y%m%d")
    existing = re.search(r"\?v=(\d{8})([a-z]?)", index_content)
    if existing and existing.group(1) == today:
        suffix = existing.group(2)
        if not suffix:
            return today + "b"
        if suffix < "z":
            return today + chr(ord(suffix) + 1)
        return today + "z"  # cap — 26 same-day data changes won't happen
    return today


def bump_cache_version(root=None, touch_footer=True, version=None):
    """Bump ?v= (index.html) and CACHE_NAME (sw.js, contrato C3) to the SAME
    version string and, with touch_footer, the footer date «Última
    actualización». The bot calls it without arguments, only when data
    content changed (bump_if_changed, contrato C4): the footer is the date of
    the data. scripts/publicar.py passes touch_footer=False and its own
    version (spec §5.5; Plan B4, decisión 10): a release does not move that
    date. `version` keeps the bot's form, 8 digits and an optional letter
    (ValueError otherwise, and nothing is written)."""
    if version is not None and not re.fullmatch(r"\d{8}[a-z]?", version):
        raise ValueError(f"versión sin la forma del bot (AAAAMMDD y una letra opcional): {version!r}")
    root = root or PROJECT_ROOT
    index_path = os.path.join(root, "index.html")
    if not os.path.exists(index_path):
        print("  WARNING: index.html not found, skipping cache bump")
        return

    with open(index_path, "r", encoding="utf-8") as f:
        content = f.read()

    version = version or _next_version(content)
    new_content = re.sub(r"\?v=\d{8}[a-z]?", f"?v={version}", content)
    if touch_footer:
        today_display = date.today().strftime("%d/%m/%Y")
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

    print("5. data-goleadores.js")
    write_file("data-goleadores.js", generate_goleadores_js(conn))

    print("6. data-shields.js  [skipped - maintained manually]")

    print("7. data-seasons.js")
    seasons_js, seasons_list = generate_seasons_js(conn)
    write_file("data-seasons.js", seasons_js)

    print("8. data-season-*.js (per-season lazy-loaded files)")
    written = generate_per_season_files(seasons_list)
    for name, sz in written:
        print(f"  data-season-{name}.js: {sz:,} bytes")

    print("8b. sw.js SEASON_FILES")
    sync_season_files([name for name, _ in written])

    # Actas: un data-lineups-<S>-<grupo>.js por grupo con alguna acta.
    print("\n9. data-lineups-<S>-<grupo>.js (actas)")
    write_lineups(conn)

    # Fichas de jugador: data-jugadores-<k>.js.
    print("\n9b. data-jugadores-<k>.js (fichas de jugador)")
    write_jugadores(conn)

    print("\n10. Cache version (only if data changed — C4)")
    bump_if_changed(before_snapshot)

    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
