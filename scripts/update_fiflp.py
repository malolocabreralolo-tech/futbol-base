#!/usr/bin/env python3
"""update_fiflp.py — Pone al día los grupos de la temporada en curso que vienen
de la federación (FIFLP): clasificación y las jornadas que pueden haber
cambiado (las recientes, las próximas, las que tienen resultados pendientes y
las que la base aún no tiene).

Es la pareja de fetch_futbolaspalmas.py para los grupos cuya URL es de
www.fiflp.com (los que dio de alta activate_season.py --fiflp-raw). FIFLP
contesta vacío a las IPs domésticas, así que esto solo tiene sentido dentro de
GitHub Actions: fetch_futbolaspalmas.py lo llama al final si FIFLP_UPDATE=1.

Reglas (las mismas que protegen al resto de importadores):
- La clasificación oficial de FIFLP no está ofuscada y es la referencia; se
  sustituye solo si standings_regression no ve nada raro (tabla vacía, jornada
  que retrocede, equipos que no se parecen).
- Los nombres son los que ya tiene la base para ese grupo: FIFLP escribe
  'MESAS HURACAN, U.D. LAS "A"' donde la base pone 'Las Mesas Hu.'.
- Los marcadores de FIFLP están ofuscados y la lectura del navegador acierta
  ~90%. Un marcador nuevo entra siempre; uno que ya estaba solo se cambia si el
  nuevo cuadra mejor con los goles a favor/en contra de la clasificación.
- Nunca se borra un partido: si la federación lo mueve de jornada, se avisa.
"""
from collections import namedtuple
from datetime import date, datetime, timedelta, timezone
import json
import os
import re
import sys
import time
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import get_or_create_team
from fiflp_names import canonical_names, is_bye
from import_fiflp_cups_2324 import clean_team_name
from activate_season import fiflp_ids, _iso
from fiflp_render import flatten, fiflp_only
from fiflp_carga import ready_selector, ready_timeout_ms, wait_ready
from fetch_futbolaspalmas import standings_regression, stored_standings
from generate_js import _repair_incoherent_points
from fiflp_names import team_key, team_score
import source_health

BACK_DAYS = 21          # jornadas ya jugadas que se vuelven a mirar
AHEAD_DAYS = 14         # jornadas próximas (horarios y campos se publican tarde)
PENDING_DAYS = 120      # resultados pendientes (aplazados) que se siguen buscando
MAX_ACTAS_PER_RUN = 60   # actas por pasada del bot (~3-6 s cada una); el resto, en la siguiente
MAX_ACTA_TRIES = 4       # lecturas fallidas de un acta antes de dejarla (se puede releer a mano)
# Plazo GLOBAL de las dos pasadas, desde que arranca update_groups (FIFLP_BUDGET_MIN). Con ~1 min de
# preparación, ~2-5 de app, importaciones y generate_js, ~2 de pruebas y el commit, el job queda en
# unos 35 min en el peor caso: 10 de margen sobre los 45 de update.yml.
DEADLINE_SECONDS = 25 * 60
# Lo que la primera pasada deja siempre para la segunda (FIFLP_RESERVE_MIN): las actas y los
# goleadores de los grupos prioritarios, que van los primeros, y lo que quepa de los demás.
RESERVE_SECONDS = 4 * 60
CLOSED_DAYS = 21                 # un grupo con todo jugado y la última jornada más vieja: cerrado…
CLOSED_EVERY = timedelta(hours=24)   # …y solo se refresca una vez al día
# Un grupo sin comprobar desde hace dos pasadas (o nunca) se adelanta a los niveles: si el plazo no
# da para todos, la rotación no deja a alevín (el último nivel) sin refrescar nunca.
STALE_AFTER = timedelta(hours=12)
# Margen de las dos esperas de arriba: la hora de cada comprobación es la de su grupo, minutos después
# de que empiece su pasada, y el cron (cada 6 h) se retrasa sin regla. Sin margen, la pasada que toca
# llegaba minutos antes de cumplirse la espera y se la saltaba (un cerrado, cada 30 h y no cada 24).
# Media pasada del cron: ni se salta la que toca ni se adelanta a la anterior.
PASS_SLACK = timedelta(hours=3)
ACTA_URL = "/NFG_CmpPartido?cod_primaria=1000120&CodActa={code}"
GOLEADORES_URL = ("/NFG_CMP_Goleadores?cod_primaria=1000120&CodJornada="
                  "&codcompeticion={comp}&codtemporada={season}&codgrupo={group}")

clock = time.monotonic          # el reloj de los plazos (las pruebas ponen uno falso)


def fiflp_groups(conn, season_id):
    return conn.execute(
        """SELECT id, code, url FROM groups
           WHERE season_id=? AND url LIKE '%fiflp.com%' ORDER BY code""",
        (season_id,)).fetchall()


def _minutes_env(name, default_seconds, env=None):
    text = (os.environ if env is None else env).get(name, "").strip().replace(",", ".")
    try:
        value = float(text)
    except ValueError:
        return default_seconds
    return value * 60 if value > 0 else default_seconds


def budget_seconds(env=None):
    """El plazo global de la federación en el bot (FIFLP_BUDGET_MIN minutos; 25 por defecto)."""
    return _minutes_env("FIFLP_BUDGET_MIN", DEADLINE_SECONDS, env)


def reserve_seconds(env=None):
    """La reserva de la segunda pasada (FIFLP_RESERVE_MIN minutos; 4 por defecto)."""
    return _minutes_env("FIFLP_RESERVE_MIN", RESERVE_SECONDS, env)


# ── El orden de la pasada ────────────────────────────────────────────────────

def _fold(text):
    text = "".join(ch for ch in unicodedata.normalize("NFD", text or "") if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", text.lower()).strip()


def priority_teams(env=None):
    """Los equipos cuyos grupos van los primeros: FIFLP_PRIORITY_TEAMS (separados por comas; vacía,
    ninguno) o, si no está, el equipo inicial del portal (defaultTeam de src/config.js)."""
    env = os.environ if env is None else env
    if "FIFLP_PRIORITY_TEAMS" in env:
        return [t.strip() for t in env["FIFLP_PRIORITY_TEAMS"].split(",") if t.strip()]
    from portal_config import load_config
    name = (load_config().get("defaultTeam") or {}).get("name")
    return [name] if name else []


def pinned_groups():
    """El grupo del equipo inicial del portal: prioritario aunque aún no tenga equipos."""
    from portal_config import load_config
    group = (load_config().get("defaultTeam") or {}).get("groupId")
    return {group} if group else set()


def priority_keys(teams):
    """Las claves de club: «Las Mesas Hu.» → «las mesas hu»."""
    return [k for k in (_fold(t).rstrip(". ") for t in teams) if k]


def is_priority(name, keys):
    """¿Es del club de alguno de los equipos prioritarios? La clave, al principio de una palabra:
    «Las Mesas Hu.» incluye «Las Mesas Hu. B», «Las Mesas Huracán C» o «UD Las Mesas Huracán», y no
    «Atlético Bachicán Las Mesas», que es otro club."""
    folded = _fold(name)
    return any(re.search(r"(?:^|\s)" + re.escape(k), folded) for k in keys)


# Niveles: los grupos de los equipos prioritarios, prebenjamín, benjamín (y lo que no sea alevín) y
# alevín (categoría ALEVIN, códigos AL…), lo último.
LEVELS = {"PREBENJAMIN": 1, "ALEVIN": 3}
Plan = namedtuple("Plan", "order resting due_closed priority")


def _level(category, code):
    return 3 if code.upper().startswith("AL") else LEVELS.get((category or "").upper(), 2)


def _natural(code):
    """FF2 antes que FF10."""
    return [(1, int(p)) if p.isdigit() else (0, p) for p in re.findall(r"\d+|\D+", code)]


def _checked_at(entry, key="checkedAt"):
    """La hora `key` de una entrada de data-health.json (checkedAt, o extrasAt: la de su última
    segunda pasada), o None."""
    try:
        moment = datetime.fromisoformat((entry if isinstance(entry, dict) else {}).get(key) or "")
    except (TypeError, ValueError):
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def _due(now, when, wait):
    """¿Ha pasado `wait` (con PASS_SLACK de margen) desde la comprobación `when`? Sin ella, sí."""
    return not when or now - when >= wait - PASS_SLACK


def is_closed(conn, group_id, today):
    """¿Todo jugado y la última jornada hace más de CLOSED_DAYS días? (Las jornadas de ese grupo ya
    no entran en rounds_to_refresh: solo se leerían la clasificación y el calendario.)"""
    n, missing, last = conn.execute(
        """SELECT count(*), sum(home_score IS NULL OR away_score IS NULL), max(date)
           FROM matches WHERE group_id=?""", (group_id,)).fetchone()
    return bool(n) and not missing and bool(last) and last < (today - timedelta(days=CLOSED_DAYS)).isoformat()


def plan_groups(conn, groups, checks, now, today, priority=None, pinned=None):
    """El orden de la pasada. Plan(order, resting, due_closed, priority):
    - order: los grupos que tocan: primero los de los equipos prioritarios; después los que llevan
      STALE_AFTER sin comprobar (o nunca; con PASS_SLACK de margen, como CLOSED_EVERY); después el
      resto por nivel (prebenjamín, benjamín, alevín). Dentro, el comprobado hace más tiempo primero
      (checks: las entradas de data-health.json; sin comprobación, el primero) y después por
      categoría y código;
    - resting: los cerrados (is_closed) comprobados bien hace menos de CLOSED_EVERY y sin actas
      pendientes: descansan esta pasada;
    - due_closed: los cerrados que se refrescan por haber pasado el día (o sin comprobación): su
      nueva hora se publica aunque no cambie nada más (source_health.publish_checks);
    - priority: los códigos de los grupos prioritarios."""
    if not groups:
        return Plan([], [], set(), set())
    keys = priority_keys(priority_teams() if priority is None else priority)
    pinned = pinned_groups() if pinned is None else set(pinned)
    ids = [g[0] for g in groups]
    marks = ",".join("?" * len(ids))
    categories = dict(conn.execute(
        f"SELECT g.id, c.name FROM groups g JOIN categories c ON c.id=g.category_id WHERE g.id IN ({marks})", ids))
    teams = {}
    for gid, name in conn.execute(
            f"""SELECT s.group_id, t.name FROM standings s JOIN teams t ON t.id=s.team_id WHERE s.group_id IN ({marks})
                UNION SELECT m.group_id, t.name FROM matches m JOIN teams t ON t.id IN (m.home_team_id, m.away_team_id)
                WHERE m.group_id IN ({marks})""", ids + ids):
        teams.setdefault(gid, []).append(name)
    oldest = datetime.min.replace(tzinfo=timezone.utc)
    order, resting, due, mine = [], [], set(), set()
    for group in groups:
        gid, code, _ = group
        entry = checks.get(code) or {}
        when = _checked_at(entry)
        if is_closed(conn, gid, today):
            if entry.get("status") == "ok" and not _due(now, when, CLOSED_EVERY) and not pending_actas(conn, gid):
                resting.append(group)
                continue
            if _due(now, when, CLOSED_EVERY):
                due.add(code)
        level = _level(categories.get(gid), code)
        if code in pinned or any(is_priority(t, keys) for t in teams.get(gid, [])):
            mine.add(code)
            tier = 0
        else:
            tier = 1 if _due(now, when, STALE_AFTER) else 2
        order.append((tier, level if tier == 2 else 0, when or oldest, level, _natural(code), group))
    order.sort(key=lambda item: item[:5])
    return Plan([item[-1] for item in order], resting, due, mine)


# ── Competiciones nuevas en la federación ─────────────────────────────────────

CATALOG_URL = "/NFG_CmpJornada?cod_primaria=1000120&CodTemporada={season}"
# El desplegable de competiciones de la temporada (el mismo JS que discover_fiflp_comps.py).
COMPETITIONS_JS = """() => {
    const sel = document.querySelector('select[name="competicion"]');
    if (!sel) return [];
    return Array.from(sel.options).filter(o => o.value && o.value !== '0')
        .map(o => ({id: o.value, name: o.text.trim()}));
}"""
# Competiciones de las categorías de la web que no se van a añadir ({id: motivo}): dejan de salir en
# newCompetitions (Datos y fuentes). Para que no vuelva a abrirse su issue basta con cerrarla.
IGNORED_COMPETITIONS = {}


def category_of(name):
    """'ALEVIN', 'BENJAMIN', 'PREBENJAMIN' o None de una competición de la federación: nunca fútbol
    sala (SALA, LPFS) y alevín solo de Gran Canaria (el de Lanzarote y Fuerteventura queda fuera).
    El criterio del contrato de alevín; si la rama de datos trae su propio category_of (fiflp_manifest
    o un módulo común), fusionar los dos en uno."""
    n = _fold(name).upper()
    if not n or "SALA" in n or "LPFS" in n:
        return None
    if "PREBENJAMIN" in n:
        return "PREBENJAMIN"
    if "BENJAMIN" in n:
        return "BENJAMIN"
    if "ALEVIN" in n:
        return None if "LANZAROTE" in n or "FUERTEVENTURA" in n else "ALEVIN"
    return None


def _season_urls(conn, season_id):
    return [u for (u,) in conn.execute(
        "SELECT url FROM groups WHERE season_id=? AND url LIKE '%fiflp.com%'", (season_id,))]


def season_competitions(conn, season_id):
    """Los CodCompeticion de los grupos de la temporada."""
    return {m.group(1) for u in _season_urls(conn, season_id) for m in [re.search(r"CodCompeticion=(\d+)", u)] if m}


def season_code(conn, season_id):
    """El CodTemporada de la federación de la temporada (el de sus grupos), o None."""
    codes = [m.group(1) for u in _season_urls(conn, season_id) for m in [re.search(r"CodTemporada=(\d+)", u)] if m]
    return max(set(codes), key=codes.count) if codes else None


def new_competitions(options, known, previous=(), today=None, ignored=None):
    """[{id, name, firstSeen}] de las opciones del desplegable ([{id, name}]) de las categorías de la
    web (category_of) que no están en `known` ni en `ignored`; firstSeen, el de `previous` si ya se
    había visto (así el informe no cambia de una pasada a otra)."""
    ignored = IGNORED_COMPETITIONS if ignored is None else ignored
    seen = {str(c.get("id")): c.get("firstSeen") for c in previous or [] if isinstance(c, dict)}
    out, ids = [], set()
    for c in options or []:
        if not isinstance(c, dict):
            continue
        cid, name = str(c.get("id") or "").strip(), re.sub(r"\s+", " ", str(c.get("name") or "")).strip()
        if (not cid.isdigit() or not name or cid in ids or cid in known or cid in ignored
                or not category_of(name)):
            continue
        ids.add(cid)
        out.append({"id": cid, "name": name, "firstSeen": seen.get(cid) or (today or date.today()).isoformat()})
    return out


def check_competitions(page, F, conn, season_id, today, log=print):
    """Lee el desplegable de competiciones de la temporada en curso y apunta en data-health.json las
    nuevas (newCompetitions; update.yml abre una issue por cada una con avisar_competiciones.py). Si
    la página no carga o sale vacía, se queda lo que había. Devuelve las nuevas, o None si no leyó."""
    season = season_code(conn, season_id)
    if not season:
        return None
    if not F.goto(page, F.BASE + CATALOG_URL.format(season=season)):
        log("  ! competiciones: la federación no sirvió su desplegable")
        return None
    options = page.evaluate(COMPETITIONS_JS) or []
    F.delay()
    if not options:
        return None
    fresh = new_competitions(options, season_competitions(conn, season_id), source_health.new_competitions(), today)
    source_health.set_new_competitions(fresh)
    if fresh:
        log("\n  Competiciones nuevas en la federación: " + "; ".join(f"{c['name']} ({c['id']})" for c in fresh))
    return fresh


def option_round(text):
    """'3 - 17-10-2026' (así lo escribe FIFLP; también con barras) ->
    ('Jornada 3', date(2026, 10, 17)); sin fecha, None."""
    num, _, day = (text or "").partition(" - ")
    m = re.fullmatch(r"(\d{2})[-/](\d{2})[-/](\d{4})", day.strip())
    when = date(int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else None
    return f"Jornada {num.strip()}", when


def stored_rounds(conn, group_id):
    """{jornada: (fecha más temprana ISO, ¿falta algún resultado?)}."""
    out = {}
    for jornada, day, pending in conn.execute(
            """SELECT jornada, min(date), max(home_score IS NULL OR away_score IS NULL)
               FROM matches WHERE group_id=? GROUP BY jornada""", (group_id,)):
        out[jornada] = (day or "", bool(pending))
    return out


def rounds_to_refresh(options, stored, today):
    """Qué jornadas (las opciones del desplegable de FIFLP) hay que volver a leer."""
    picked = []
    for opt in options:
        label, when = option_round(opt.get("text"))
        recent = when is not None and today - timedelta(days=BACK_DAYS) <= when <= today + timedelta(days=AHEAD_DAYS)
        new = label not in stored
        day, pending = stored.get(label, ("", False))
        overdue = (pending and when is not None and
                   today - timedelta(days=PENDING_DAYS) <= when < today)
        if recent or new or overdue:
            picked.append(opt)
    return picked


def name_map(scraped_names, group_teams):
    """{nombre FIFLP limpio: nombre de la base}. Primero contra la plantilla del
    grupo; lo que no casa, con el nombre limpio de FIFLP."""
    crudos = sorted({clean_team_name(n) for n in scraped_names} - {""})
    crudos = [n for n in crudos if not is_bye(n)]
    mapa = canonical_names(crudos, group_teams, []) if group_teams else {}
    return {n: mapa.get(n, n) for n in crudos}


def deviation(conn, group_id, override=None):
    """Suma de |GF partidos − GF tabla| + |GC partidos − GC tabla| de los equipos
    COMPARABLES: los que tienen en la tabla oficial tantos partidos como
    resultados en la base (si la tabla va atrasada, la diferencia no dice nada
    del marcador). `override` = (match_id, gl, gv): cómo quedaría con otro.
    None si la tabla no trae goles."""
    table = {tid: (pj, gf, gc) for tid, pj, gf, gc in conn.execute(
        "SELECT team_id, played, gf, gc FROM standings WHERE group_id=?", (group_id,))}
    if not table or any(v[1] is None for v in table.values()):
        return None
    goals = {tid: [0, 0, 0] for tid in table}
    for mid, h, a, hs, as_ in conn.execute(
            """SELECT id, home_team_id, away_team_id, home_score, away_score
               FROM matches WHERE group_id=?""", (group_id,)):
        if override and mid == override[0]:
            hs, as_ = override[1], override[2]
        if hs is None or as_ is None:
            continue
        for tid, f, c in ((h, hs, as_), (a, as_, hs)):
            if tid in goals:
                goals[tid][0] += 1
                goals[tid][1] += f
                goals[tid][2] += c
    return sum(abs(goals[t][1] - table[t][1]) + abs(goals[t][2] - table[t][2])
               for t in table if goals[t][0] == table[t][0])


def _drop_one_digit(n):
    """15 -> {1, 5}; 213 -> {13, 23, 21}. La ofuscación de FIFLP cuela una cifra de más."""
    s = str(n)
    return {int(s[:i] + s[i + 1:]) for i in range(len(s))} if len(s) > 1 else set()


def reconcile_with_table(conn, group_id, log=print):
    """Corrige los marcadores con una cifra de más que la clasificación oficial
    desmiente. Solo acepta un cambio que baje la desviación de los equipos
    comparables; se repite mientras mejore. Devuelve cuántos corrigió."""
    fixed = 0
    while True:
        before = deviation(conn, group_id)
        if not before:
            return fixed
        best = None
        for mid, hs, as_, home, away in conn.execute(
                """SELECT m.id, m.home_score, m.away_score, h.name, a.name FROM matches m
                   JOIN teams h ON h.id=m.home_team_id JOIN teams a ON a.id=m.away_team_id
                   WHERE m.group_id=? AND m.home_score IS NOT NULL AND m.away_score IS NOT NULL
                   AND m.cod_acta IS NULL AND (m.home_score > 9 OR m.away_score > 9)""", (group_id,)).fetchall():
            for cand in [(h, as_) for h in _drop_one_digit(hs)] + [(hs, a) for a in _drop_one_digit(as_)]:
                after = deviation(conn, group_id, (mid, *cand))
                if after is not None and after < before and (best is None or after < best[0]):
                    best = (after, mid, cand, (home, hs, as_, away))
        if best is None:
            return fixed
        _, mid, (hs, as_), (home, old_h, old_a, away) = best
        conn.execute("UPDATE matches SET home_score=?, away_score=? WHERE id=?", (hs, as_, mid))
        log(f"    corregido con la tabla {home} {old_h}-{old_a} {away} → {hs}-{as_}")
        fixed += 1


def write_standings(conn, group_id, rows):
    """Sustituye la clasificación (filas canónicas) si no pierde información."""
    rows, _ = _repair_incoherent_points(rows)
    reason = standings_regression(stored_standings(conn, group_id), rows)
    if reason:
        return reason
    ids = {r[1]: get_or_create_team(conn, r[1]) for r in rows}
    conn.execute("DELETE FROM standings WHERE group_id=?", (group_id,))
    for r in rows:
        conn.execute(
            """INSERT INTO standings(group_id, team_id, position, points, played,
                                     won, drawn, lost, gf, gc, gd)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (group_id, ids[r[1]], r[0], *r[2:]))
    return None


def write_round(conn, group_id, label, matches, log=print):
    """Pone al día los partidos de una jornada. `matches`: dicts con home, away
    (ya con nombre de la base), hs, as, date ISO, time, venue. Devuelve
    (nuevos, actualizados, marcadores)."""
    new = updated = scores = 0
    for m in matches:
        home_id, away_id = get_or_create_team(conn, m["home"]), get_or_create_team(conn, m["away"])
        row = conn.execute(
            """SELECT id, home_score, away_score, date, time, venue, cod_acta FROM matches
               WHERE group_id=? AND jornada=? AND home_team_id=? AND away_team_id=?""",
            (group_id, label, home_id, away_id)).fetchone()
        hs, as_ = (m["hs"], m["as"]) if m["hs"] is not None and m["as"] is not None else (None, None)
        if row is None:
            # El mismo cruce SIN jugar en otra jornada: la federación ha rehecho
            # el calendario, se mueve. Si ya se jugó, es una repetición legítima
            # (liga a más de dos vueltas) y entra como partido nuevo.
            moved = conn.execute(
                """SELECT id, jornada FROM matches WHERE group_id=? AND home_team_id=?
                   AND away_team_id=? AND home_score IS NULL""",
                (group_id, home_id, away_id)).fetchone()
            if moved:
                log(f"    {m['home']} – {m['away']} pasa de {moved[1]} a {label}")
                conn.execute("UPDATE matches SET jornada=? WHERE id=?", (label, moved[0]))
                row = conn.execute(
                    "SELECT id, home_score, away_score, date, time, venue, cod_acta FROM matches WHERE id=?",
                    (moved[0],)).fetchone()
        if row is None:
            conn.execute(
                """INSERT INTO matches(group_id, jornada, date, time, home_team_id,
                                       away_team_id, home_score, away_score, venue, fiflp_acta)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (group_id, label, m["date"], m["time"] or None, home_id, away_id, hs, as_,
                 m["venue"] or None, m.get("fiflp_acta")))
            new += 1
            scores += hs is not None
            continue
        mid, old_hs, old_as, old_date, old_time, old_venue, verified = row
        fields = {}
        if m.get("fiflp_acta"):
            fields["fiflp_acta"] = m["fiflp_acta"]
        if m["date"] and m["date"] != old_date:
            fields["date"] = m["date"]
        if m["time"] and m["time"] != old_time:
            fields["time"] = m["time"]
        if m["venue"] and m["venue"] != old_venue:
            fields["venue"] = m["venue"]
        # Un marcador comprobado con el acta (cod_acta) ya no lo cambia una
        # lectura de la jornada, que puede venir con una cifra de más. Pero si
        # la discrepancia no se explica por una cifra de más (Competición cambia
        # un resultado, la federación rehace el acta), el acta se vuelve a leer.
        if hs is not None and (hs, as_) != (old_hs, old_as) and verified:
            # Una cifra de más o de menos en la lectura (21 leído 1, 4 leído 41).
            near = lambda a, b: a == b or a in _drop_one_digit(b) or b in _drop_one_digit(a)
            if not (near(old_hs, hs) and near(old_as, as_)):
                conn.execute("UPDATE matches SET acta_recheck=1 WHERE id=?", (mid,))
                log(f"    {m['home']} {old_hs}-{old_as} {m['away']}: la jornada dice {hs}-{as_}, se releerá el acta")
        if hs is not None and (hs, as_) != (old_hs, old_as) and not verified:
            if old_hs is None:
                fields.update(home_score=hs, away_score=as_)
                scores += 1
            else:
                before, after = deviation(conn, group_id), deviation(conn, group_id, (mid, hs, as_))
                if before is not None and after is not None and after < before:
                    fields.update(home_score=hs, away_score=as_)
                    scores += 1
                    log(f"    corregido {m['home']} {old_hs}-{old_as} {m['away']} → {hs}-{as_} (cuadra con la tabla)")
                else:
                    log(f"    se conserva {m['home']} {old_hs}-{old_as} {m['away']} (la federación lee {hs}-{as_})")
        if fields:
            changed = {k for k in fields if k != "fiflp_acta"}
            conn.execute(f"UPDATE matches SET {', '.join(k + '=?' for k in fields)} WHERE id=?",
                         (*fields.values(), mid))
            updated += bool(changed)
    return new, updated, scores


def current_round(conn, group_id):
    """La última jornada con algún resultado; antes de empezar, la primera."""
    rows = conn.execute(
        """SELECT jornada, max(home_score IS NOT NULL), min(date) FROM matches
           WHERE group_id=? GROUP BY jornada""", (group_id,)).fetchall()
    num = lambda j: int(re.sub(r"\D", "", j) or 0)
    rows.sort(key=lambda r: num(r[0]))
    played = [r[0] for r in rows if r[1]]
    return played[-1] if played else (rows[0][0] if rows else None)


JORNADAS_JS = """() => {
    const sel = document.querySelector('select[name="jornada"]');
    return sel ? Array.from(sel.options).filter(o => o.value && o.value !== '0')
                   .map(o => ({value: o.value, text: o.text.trim()})) : [];
}"""


def scrape_group(page, F, url, stored, today):
    """(standings crudas, {jornada: [partidos crudos]}) de un grupo de FIFLP."""
    comp, code = fiflp_ids(url)
    season = re.search(r"CodTemporada=(\d+)", url).group(1)
    base = f"{F.BASE}/NFG_VisClasificacion?cod_primaria=1000120&CodTemporada={season}"
    standings = []
    if F.goto(page, f"{base}&codcompeticion={comp}&codgrupo={code}&codjornada=99"):
        standings = F.parse_standings(page)
        try:
            add_detail(standings, page.content())
        except Exception:           # una página sin HTML que leer (las de prueba): solo los totales
            pass
    F.delay()
    rounds = {}
    calendar = (f"{F.BASE}/NFG_CmpJornada?cod_primaria=1000120&CodTemporada={season}"
                f"&CodCompeticion={comp}&CodGrupo={code}")
    if not F.goto(page, calendar):
        raise RuntimeError("no carga el calendario de la federación")
    # La carga ya esperó, con tope, al desplegable (fiflp_carga.ready_selector). Si no llegó y el grupo
    # tiene jornadas, FIFLP tarda en servirlo («0J»): una espera más, al desplegable y con tope. Sin
    # jornadas (un calendario aún sin publicar), nada que esperar: antes eran 4 × 3 s en cada pasada.
    options = page.evaluate(JORNADAS_JS)
    if not options and stored:
        wait_ready(page, ready_selector(calendar), ready_timeout_ms())
        options = page.evaluate(JORNADAS_JS)
    if not options and stored:
        raise RuntimeError("la federación no sirvió las jornadas del grupo")
    for opt in rounds_to_refresh(options, stored, today):
        label, when = option_round(opt["text"])
        # Cada jornada por su URL, no con BuscarPartidos: esa función no es
        # AJAX, navega leyendo un formulario OCULTO de la página, y flatten()
        # quita lo oculto (desde la 2.ª jornada fallaba el grupo entero).
        if not F.goto(page, f"{calendar}&CodJornada={opt['value']}"):
            raise RuntimeError(f"no carga la {label.lower()}")
        flatten(page)            # lo que se ve, sin señuelos (fiflp_render.py)
        rounds[label] = [{**m, "date": _iso(m.get("date")) or (when.isoformat() if when else "")}
                         for m in F.parse_matches(page)]
        F.delay()
    return standings, rounds


def add_detail(standings, html):
    """Lo que la clasificación de la federación da además de los totales (fiflp_detalle.
    parse_clasificacion): casa y fuera, puntos de sanción y código de cada equipo, en sus filas."""
    try:
        from fiflp_detalle import parse_clasificacion
        extra = {r["team"]: r for r in parse_clasificacion(html)}
    except Exception:
        return standings
    for row in standings:
        e = extra.get(row.get("team"))
        if e and e.get("home"):
            row.update(home=e["home"], away=e["away"], sanction=e.get("sanction") or 0, codequipo=e.get("codequipo"))
    return standings


def update_group(conn, group_id, code, raw_standings, raw_rounds, log=print):
    """Escribe en la base lo scrapeado de un grupo. Devuelve (estado, mensaje)."""
    group_teams = [r[1] for r in stored_standings(conn, group_id)]
    names = name_map([r["team"] for r in raw_standings] +
                     [m[s] for ms in raw_rounds.values() for m in ms for s in ("home", "away")],
                     group_teams)
    rows = [[r["pos"], names.get(clean_team_name(r["team"]), clean_team_name(r["team"])),
             r["pts"], r["j"], r["g"], r["e"], r["p"], r["gf"], r["gc"], r["df"]]
            for r in raw_standings if clean_team_name(r["team"])]
    played = max((r[3] for r in rows), default=0)
    reason = write_standings(conn, group_id, rows) if played else None
    if reason:
        return "rejected", reason
    # Casa/fuera y sanciones de la federación (standings_detail), con los nombres de la base.
    detail = [(names.get(clean_team_name(r["team"]), clean_team_name(r["team"])), r)
              for r in raw_standings if r.get("home") and clean_team_name(r["team"])]
    if detail:
        from import_fiflp_detalle import write_standings_detail
        write_standings_detail(conn, group_id, detail)
    totals = [0, 0, 0]
    for label, ms in raw_rounds.items():
        clean = []
        for m in ms:
            home, away = clean_team_name(m.get("home")), clean_team_name(m.get("away"))
            if not home or not away or home == away or is_bye(home) or is_bye(away):
                continue
            clean.append({"home": names.get(home, home), "away": names.get(away, away),
                          "hs": m.get("hs"), "as": m.get("as"), "date": m.get("date") or "",
                          "time": m.get("time") or "", "venue": m.get("venue") or "",
                          "fiflp_acta": m.get("fiflp_acta")})
        for i, n in enumerate(write_round(conn, group_id, label, clean, log)):
            totals[i] += n
    totals[2] += reconcile_with_table(conn, group_id, log)
    current = current_round(conn, group_id)
    if current:
        conn.execute("UPDATE groups SET current_jornada=? WHERE id=?", (current, group_id))
    conn.commit()
    msg = (f"{len(raw_rounds)} jornadas leídas: {totals[0]} partidos nuevos, "
           f"{totals[1]} actualizados, {totals[2]} resultados")
    log(f"    {msg}")
    return "ok", msg


def _same_side(acta_name, base_name):
    return team_score(team_key(acta_name or ""), team_key(base_name or ""))


def apply_acta(conn, mid, code, acta, log=print):
    """Importa el acta (fiflp_acta.parse_flat_acta) del partido `mid`. Su
    marcador, si cuadra con los marcadores parciales de los goles, pasa a ser
    el del partido. Un acta incoherente no se importa: se reintenta después."""
    from import_fiflp_actas import _import_one
    h = acta["header"]
    home, away, hs, as_ = conn.execute(
        """SELECT th.name, ta.name, m.home_score, m.away_score FROM matches m
           JOIN teams th ON th.id=m.home_team_id JOIN teams ta ON ta.id=m.away_team_id
           WHERE m.id=?""", (mid,)).fetchone()
    # El código viene de la fila de ESE partido en la jornada; aun así, el acta
    # tiene que traer los dos equipos con alineación, alguno reconocible y no
    # al revés (una página a medio cargar o un acta sin rellenar no vale).
    lineups = acta.get("lineups") or {}
    if not (h.get("home_team") and h.get("away_team") and lineups.get("home") and lineups.get("away")):
        log(f"    ! acta {code} sin equipos o sin alineaciones ({home} – {away}): se reintentará")
        return False
    straight = _same_side(h["home_team"], home) + _same_side(h["away_team"], away)
    swapped = _same_side(h["home_team"], away) + _same_side(h["away_team"], home)
    if straight <= 0 or swapped > straight:
        log(f"    ! acta {code}: {h['home_team']} – {h['away_team']} no casa con {home} – {away}")
        return False
    if not acta.get("consistent") or h.get("home_score") is None:
        log(f"    ! acta {code} incoherente ({home} – {away}): se reintentará")
        return False
    # Un acta sin un solo gol no cambia un marcador que no sea 0-0 (la jornada
    # puede traer un resultado de mesa que el acta en blanco no recoge).
    if not acta.get("events") and (h["home_score"], h["away_score"]) == (0, 0) and (hs or as_):
        log(f"    ! acta {code} en blanco 0-0 frente a {hs}-{as_}: se reintentará")
        return False
    if (h["home_score"], h["away_score"]) != (hs, as_):
        log(f"    marcador del acta {home} {hs}-{as_} {away} → {h['home_score']}-{h['away_score']}")
        conn.execute("UPDATE matches SET home_score=?, away_score=? WHERE id=?",
                     (h["home_score"], h["away_score"], mid))
    _import_one(conn, code, acta, mid)
    conn.execute("UPDATE matches SET acta_recheck=0, acta_tries=0 WHERE id=?", (mid,))
    return True


def pending_actas(conn, group_id):
    """Partidos jugados con código de acta y sin acta importada (o marcados para
    releer, o con otro código de acta), los nunca intentados primero y los más
    recientes antes; los que fallaron MAX_ACTA_TRIES veces se dejan."""
    return conn.execute(
        """SELECT id, fiflp_acta FROM matches WHERE group_id=? AND fiflp_acta IS NOT NULL
           AND home_score IS NOT NULL AND acta_tries < ?
           AND (cod_acta IS NULL OR acta_recheck=1 OR cod_acta <> fiflp_acta)
           ORDER BY acta_tries, date DESC, id""", (group_id, MAX_ACTA_TRIES)).fetchall()


def import_actas(page, F, conn, group_id, budget, deadline=None, log=print):
    """Lee e importa las actas pendientes del grupo (hasta `budget` y hasta
    `deadline`, en clock()). Devuelve cuántas importó y cuántas leyó.
    Una lectura fallida suma un intento; una página que no carga, no (es la
    red, no el acta), pero tres seguidas cortan la pasada."""
    from fiflp_acta import parse_flat_acta
    done = read = failed_loads = 0
    for mid, code in pending_actas(conn, group_id)[:budget]:
        if deadline and clock() > deadline:
            break
        read += 1
        ok = False
        try:
            if not F.goto(page, F.BASE + ACTA_URL.format(code=code)):
                failed_loads += 1
                if failed_loads >= 3:
                    log("    ! la federación no sirve actas: se deja para la próxima pasada")
                    break
                continue
            failed_loads = 0
            flatten(page)
            ok = apply_acta(conn, mid, code, parse_flat_acta(page.content()), log)
        except Exception as e:
            conn.rollback()
            log(f"    ! acta {code}: {e}")
        if ok:
            done += 1
        else:
            conn.execute("UPDATE matches SET acta_tries=acta_tries+1 WHERE id=?", (mid,))
        conn.commit()
        F.delay()
    return done, read


def parse_goleadores(html):
    """[(jugador, equipo, partidos, goles, penaltis)] de NFG_CMP_Goleadores
    (tabla 'Jugador | Equipo | Grupo | Partidos Jugados | Goles | Goles partido';
    los goles pueden traer '38 (1 P)')."""
    import html as _h
    rows = []
    for row in re.findall(r"<tr\b.*?</tr>", html, re.S):
        cells = [re.sub(r"\s+", " ", _h.unescape(re.sub(r"<[^>]+>", " ", c))).strip()
                 for c in re.findall(r"<td\b[^>]*>(.*?)</td>", row, re.S)]
        if len(cells) < 5:
            continue
        goals = re.match(r"(\d+)(?:\s*\((\d+)\s*P\))?", cells[4])
        games = re.fullmatch(r"\d+", cells[3])
        # El nombre puede venir vacío (la federación no lo publica): basta el equipo.
        if not goals or not games or not cells[1]:
            continue
        rows.append((cells[0], cells[1], int(cells[3]), int(goals.group(1)), int(goals.group(2) or 0)))
    return rows


def write_scorers(conn, group_id, rows, group_teams=None):
    """Sustituye los goleadores del grupo con los de la federación, con los
    nombres de equipo que ya usa la base (`group_teams`; por defecto, los de su
    clasificación)."""
    if not rows:
        return 0
    if group_teams is None:
        group_teams = [r[1] for r in stored_standings(conn, group_id)]
    names = name_map([team for _, team, *_ in rows], group_teams)
    ids = {}
    for _, team, *_ in rows:
        clean = clean_team_name(team)
        ids[team] = get_or_create_team(conn, names.get(clean, clean))
    conn.execute("DELETE FROM scorers WHERE group_id=?", (group_id,))
    anon, seen = 0, set()
    for player, team, games, goals, _ in rows:
        if not player:              # sin nombre publicado: clave interna '#n' (el frontend lo dice)
            anon += 1
            player = f"#{anon}"
        # Dos niños del mismo equipo con el mismo nombre (la federación publica a
        # algunos solo con el nombre de pila): no pueden compartir fila.
        base, n = player, 2
        while (player, ids[team]) in seen:
            player, n = f"{base} ({n})", n + 1
        seen.add((player, ids[team]))
        conn.execute("INSERT INTO scorers(group_id, player_name, team_id, goals, games) VALUES (?,?,?,?,?)",
                     (group_id, player, ids[team], goals, games))
    return len(rows)


def update_goleadores(page, F, conn, group_id, url, log=print):
    """Goleadores del grupo desde la federación, si ya se ha jugado algo."""
    played = conn.execute("SELECT 1 FROM matches WHERE group_id=? AND home_score IS NOT NULL LIMIT 1",
                          (group_id,)).fetchone()
    if not played:
        return 0
    comp, code = fiflp_ids(url)
    season = re.search(r"CodTemporada=(\d+)", url).group(1)
    if not F.goto(page, F.BASE + GOLEADORES_URL.format(comp=comp, season=season, group=code)):
        return 0
    flatten(page)
    n = write_scorers(conn, group_id, parse_goleadores(page.content()))
    conn.commit()
    F.delay()
    return n


CAMPOS_URL = "/NFG_LstCampos?cod_primaria=1000122&NPcd_Page={page}&NPcd_PageLines=100"


def parse_campos(html):
    """[(nombre, dirección, localidad, superficie, tipo, código)] de una página
    de NFG_LstCampos, y el total de páginas."""
    import html as _h
    rows = []
    for row in re.findall(r"<tr\b.*?</tr>", html, re.S):
        cells = [re.sub(r"\s+", " ", _h.unescape(re.sub(r"<[^>]+>", " ", c))).strip()
                 for c in re.findall(r"<td\b[^>]*>(.*?)</td>", row, re.S)]
        code = re.search(r"Codigo_Campo=(\d+)", row)
        if len(cells) < 6 or not cells[0] or not code:
            continue
        clean = lambda v: None if v in ("", "-") else v
        rows.append((cells[0], clean(cells[1]), clean(cells[2]), clean(cells[4]), clean(cells[5]), int(code.group(1))))
    total = re.search(r'pagination-panel-total">\s*(\d+)', html)
    return rows, int(total.group(1)) if total else 1


def missing_venues(conn, season_id):
    """Campos de los partidos de la temporada que el directorio no tiene."""
    from generate_js import venue_key
    known = {r[0] for r in conn.execute("SELECT norm FROM venues")}
    used = {r[0] for r in conn.execute(
        """SELECT DISTINCT m.venue FROM matches m JOIN groups g ON g.id=m.group_id
           WHERE g.season_id=? AND m.venue IS NOT NULL AND m.venue <> ''""", (season_id,))}
    return sorted(v for v in used if venue_key(v) not in known)


def update_campos(page, F, conn, deadline=None):
    """Refresca el directorio de campos (páginas de 100, hasta `deadline`). Devuelve cuántos."""
    from generate_js import venue_key
    rows, pages = [], 1
    for n in range(1, 30):
        if n > pages or (deadline is not None and clock() > deadline):
            break
        if not F.goto(page, F.BASE + CAMPOS_URL.format(page=n)):
            break
        got, pages = parse_campos(page.content())
        rows += got
        F.delay()
    if not rows:
        return 0
    conn.execute("DELETE FROM venues")
    conn.executemany("INSERT OR REPLACE INTO venues(name, norm, address, city, surface, kind, code) VALUES (?,?,?,?,?,?,?)",
                     [(r[0], venue_key(r[0]), *r[1:]) for r in rows])
    conn.commit()
    return len(rows)


def update_groups(conn, season_id, today=None):
    """Recorre los grupos de la federación de la temporada en curso, con el plazo global
    (budget_seconds) contado desde aquí, antes de abrir el navegador."""
    groups = fiflp_groups(conn, season_id)
    if not groups:
        return
    deadline = clock() + budget_seconds()
    from migrate_actas_schema import migrate
    migrate(conn)                 # fiflp_acta, players.fiflp_id, delegados
    today = today or date.today()
    print(f"\nFederación (FIFLP): {len(groups)} grupos, plazo de {budget_seconds() / 60:g} min", flush=True)
    pending = {code: url for _, code, url in groups}
    try:
        _with_browser(lambda page, F: run_passes(page, F, conn, season_id, groups, today, pending, deadline=deadline),
                      deadline=deadline)
    except Exception as e:      # sin navegador o FIFLP caída: se informa, no se tumba el run
        print(f"  ! la federación no se pudo consultar: {e}")
        for code, url in pending.items():
            source_health.record(code, url, "error", e)


def _with_browser(work, deadline=None):
    """Abre Chromium y llama a work(page, F) con el scraper de la federación: los lectores de
    fetch_fiflp_2425 con la carga de fiflp_carga (espera a lo que el lector necesita, sin los 2,5 s
    fijos, y pausa FIFLP_DELAY) y los reintentos cortados en `deadline` (time.monotonic())."""
    import fetch_fiflp_2425
    from fiflp_carga import Federacion
    from playwright.sync_api import sync_playwright
    F = Federacion(fetch_fiflp_2425, deadline)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"))
        fiflp_only(page)   # sin la publicidad de la federación, que colgaba las cargas
        page.set_default_timeout(30000)
        try:
            work(page, F)
        finally:
            browser.close()


def _codes(rows, limit=12):
    names = [code for _, code, _ in rows]
    return ", ".join(names[:limit]) + (f" y {len(names) - limit} más" if len(names) > limit else "")


def run_passes(page, F, conn, season_id, groups, today, pending, deadline_seconds=None, deadline=None,
               checks=None, now=None):
    """Las dos pasadas del bot sobre una página ya abierta (inyectable en las
    pruebas), en el orden de plan_groups y con un plazo GLOBAL (`deadline`, en
    clock(); o `deadline_seconds` desde ahora; por defecto, budget_seconds()):
    1. clasificación y jornadas de cada grupo, mientras quede plazo y la reserva
       (reserve_seconds) para la segunda; lo que no cabe queda para la pasada
       siguiente (rotación: su comprobación es la más vieja de su nivel y, a las
       STALE_AFTER, pasa delante de los niveles);
    2. con lo que quede: las actas y los goleadores (los prioritarios primero;
       después, el que lleva más tiempo sin ellos: extrasAt de data-health.json,
       así que lo que el plazo corta va primero en la pasada siguiente), el
       directorio de campos y las fichas de los equipos.
    Los grupos cerrados que descansan y los que no caben conservan su última
    comprobación en data-health.json (source_health.carry): no son un error."""
    start = clock()
    if deadline is None:
        deadline = start + (budget_seconds() if deadline_seconds is None else deadline_seconds)
    first_deadline = deadline - min(reserve_seconds(), max(0.0, deadline - start) / 4)
    checks = source_health.previous_groups() if checks is None else checks
    now = now or datetime.now(timezone.utc)
    plan = plan_groups(conn, groups, checks, now, today)
    print(f"  Orden: {len(plan.priority)} de equipos prioritarios primero ({', '.join(sorted(plan.priority)) or '—'}); "
          f"{len(plan.order)} por refrescar, {len(plan.resting)} cerrados descansan", flush=True)
    stamp = lambda: now + timedelta(seconds=clock() - start)     # la hora de cada comprobación
    results, stamps, deferred = {}, {}, []
    for group_id, code, url in plan.order:
        if clock() > first_deadline:
            deferred.append((group_id, code, url))
            continue
        print(f"  [{code}]", flush=True)
        stamps[code] = stamp()
        try:
            raw_standings, raw_rounds = scrape_group(page, F, url, stored_rounds(conn, group_id), today)
            status, msg = update_group(conn, group_id, code, raw_standings, raw_rounds)
        except Exception as e:          # un grupo que falla no tumba a los demás
            conn.rollback()
            status, msg = "error", e
            print(f"    ! error: {e}")
        results[code] = [status, msg]
    first_pass = clock() - start
    pages = getattr(F, "pages", None)
    print(f"  Primera pasada: {len(results)} grupos en {first_pass / 60:.1f} min"
          + (f" ({pages} páginas, {first_pass / pages:.1f} s cada una)" if pages else ""), flush=True)
    if deferred:
        print(f"  Rotación: {len(deferred)} grupos, a la próxima pasada ({_codes(deferred)})", flush=True)
    # Una página: las competiciones que la federación publica y la web no tiene (la Segunda Fase).
    try:
        if clock() <= deadline:
            check_competitions(page, F, conn, season_id, today)
    except Exception as e:
        print(f"  ! competiciones: {e}")
    # Segunda pasada, con lo que quede de plazo: actas y goleadores. Son lo
    # más lento y lo menos urgente; un fallo aquí no cambia el estado del grupo.
    # Los prioritarios primero; después, el que lleva más tiempo sin ella (extrasAt; sin ella, el
    # primero). Sin esa hora, el plazo cortaba siempre a los mismos: la de cada grupo es la de su
    # lectura, así que el primero en leerse volvía a ir el primero.
    budget = MAX_ACTAS_PER_RUN
    print("\n  Actas y goleadores", flush=True)
    refreshed = [g for g in plan.order if g[1] in results]
    oldest = datetime.min.replace(tzinfo=timezone.utc)
    second = sorted((g for g in refreshed if results[g[1]][0] == "ok"),
                    key=lambda g: (0, oldest) if g[1] in plan.priority
                    else (1, _checked_at(checks.get(g[1]), "extrasAt") or oldest))
    extras, cut = {}, []
    for group_id, code, url in second:
        if clock() > deadline:
            cut.append(code)
            continue
        at = stamp()
        notes = []
        try:
            done, read = import_actas(page, F, conn, group_id, budget, deadline)
            budget -= read
            if read:
                notes.append(f"{done}/{read} actas")
        except Exception as e:
            conn.rollback()
            notes.append(f"actas: {e}")
        if clock() > deadline:                 # el plazo la cortó en las actas: va primero la próxima vez
            cut.append(code)
        else:
            extras[code] = at
            try:
                scorers = update_goleadores(page, F, conn, group_id, url)
                if scorers:
                    notes.append(f"{scorers} goleadores")
            except Exception as e:
                conn.rollback()
                notes.append(f"goleadores: {e}")
        if notes:
            print(f"  [{code}] " + ", ".join(notes))
            results[code][1] = f"{results[code][1]}; " + ", ".join(notes)
    if cut:
        print(f"  (plazo agotado: las actas y los goleadores de {len(cut)} grupos, primero en la próxima pasada: "
              f"{', '.join(cut[:12])}{' y más' if len(cut) > 12 else ''})")
    # El directorio de campos, solo si falta alguno de los de la temporada (un grupo nuevo).
    try:
        if clock() <= deadline and missing_venues(conn, season_id):
            print(f"\n  Campos: {update_campos(page, F, conn, deadline)} en el directorio de la federación")
    except Exception as e:
        conn.rollback()
        print(f"  ! campos: {e}")
    # La ficha (equipación y campo) de los equipos que aún no la tienen y la de sus campos.
    try:
        if clock() <= deadline:
            cards, fields = update_directorio(page, F, conn, season_id, refreshed, deadline)
            if cards or fields:
                print(f"\n  Directorio: {cards} fichas de equipo y {fields} de campo")
    except Exception as e:
        conn.rollback()
        print(f"  ! directorio: {e}")
    for group_id, code, url in groups:
        if code in results:
            source_health.record(code, url, *results[code], now=stamps[code], extras_at=extras.get(code))
        else:
            source_health.carry(code)          # descansa o no cupo: su última comprobación
        pending.pop(code, None)
    source_health.note_run({
        "groups": len(groups), "refreshed": len(results), "resting": [c for _, c, _ in plan.resting],
        "deferred": [c for _, c, _ in deferred], "extrasDeferred": cut, "firstPassSeconds": round(first_pass),
        "seconds": round(clock() - start), **({"firstPassPages": pages} if pages else {})})
    # La rotación (de las dos pasadas) y los cerrados se ordenan por la hora de su última comprobación
    # o segunda pasada: sin publicarla, la pasada siguiente volvería a empezar por los mismos.
    if deferred or cut or (plan.due_closed & set(results)):
        source_health.publish_checks()
    print(f"  Federación: {round((clock() - start) / 60, 1)} min de {round((deadline - start) / 60, 1)}", flush=True)


def update_directorio(page, F, conn, season_id, groups, deadline=None):
    """team_seasons de los equipos de la temporada en curso que no la tienen (el directorio de su
    grupo, fiflp_detalle.parse_directorio, con el nombre de la base) y venue_details de sus campos
    que no la tienen (parse_campo). Es lo que baja detalle-federacion.yml de las temporadas
    pasadas, para los grupos que van apareciendo (la Segunda Fase). Devuelve (fichas, campos)."""
    from datetime import date as _date
    from fetch_fiflp_detalle import CAMPO_URL, DIRECTORIO_URL
    from fiflp_detalle import parse_campo, parse_directorio
    from import_fiflp_detalle import migrate as migrate_detalle
    migrate_detalle(conn)
    cards = fields = 0
    for group_id, code, url in groups:
        if deadline is not None and clock() > deadline:
            break
        teams = [r[1] for r in stored_standings(conn, group_id)]
        have = {r[0] for r in conn.execute(
            """SELECT t.name FROM team_seasons ts JOIN teams t ON t.id=ts.team_id WHERE ts.season_id=?""",
            (season_id,))}
        if not teams or all(t in have for t in teams):
            continue
        ids = fiflp_ids(url)
        season = re.search(r"CodTemporada=(\d+)", url)
        if not ids or not season:
            continue
        if not F.goto(page, F.BASE + DIRECTORIO_URL.format(season=season.group(1), comp=ids[0], grupo=ids[1])):
            continue
        rows = parse_directorio(page.content())
        F.delay()
        names = name_map([r["team"] for r in rows], teams)
        for r in rows:
            name = names.get(clean_team_name(r["team"]))
            if name not in teams or name in have:
                continue
            tid = get_or_create_team(conn, name)
            conn.execute(
                """INSERT OR REPLACE INTO team_seasons(team_id, season_id, fiflp_code, fiflp_name, crest_url, shirt,
                       shorts, socks, venue_code, venue_name, surface) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (tid, season_id, r.get("codequipo"), r.get("team"), r.get("crest"), r.get("shirt"), r.get("shorts"),
                 r.get("socks"), r.get("venue_code"), r.get("venue"), r.get("surface")))
            cards += 1
        conn.commit()
    codes = [c for (c,) in conn.execute(
        """SELECT DISTINCT ts.venue_code FROM team_seasons ts WHERE ts.season_id=? AND ts.venue_code IS NOT NULL
           AND ts.venue_code NOT IN (SELECT code FROM venue_details)""", (season_id,))]
    for c in codes:
        if deadline is not None and clock() > deadline:
            break
        if not F.goto(page, F.BASE + CAMPO_URL.format(code=c)):
            continue
        f = parse_campo(page.content())
        F.delay()
        if not f:
            continue
        conn.execute(
            """INSERT OR REPLACE INTO venue_details(code, name, lat, lon, address, city, province, postal_code,
                   surface, photo, fenced, doping_room, referee_room, internet, teams, training, fetched)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (f["code"], f["name"], f["lat"], f["lon"], f["address"], f["city"], f["province"], f["postal_code"],
             f["surface"], f["photo"], *[None if f[k] is None else int(f[k]) for k in
                                         ("fenced", "doping_room", "referee_room", "internet")],
             json.dumps(f["teams"], ensure_ascii=False), json.dumps(f["training"], ensure_ascii=False),
             _date.today().isoformat()))
        fields += 1
    conn.commit()
    return cards, fields
