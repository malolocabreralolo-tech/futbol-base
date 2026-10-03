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
from datetime import date, timedelta
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import get_or_create_team
from fiflp_names import canonical_names, is_bye
from import_fiflp_cups_2324 import clean_team_name
from activate_season import fiflp_ids, _iso
from fiflp_render import flatten
from fetch_futbolaspalmas import standings_regression, stored_standings
from generate_js import _repair_incoherent_points
from fiflp_names import team_key, team_score
import source_health

BACK_DAYS = 21          # jornadas ya jugadas que se vuelven a mirar
AHEAD_DAYS = 14         # jornadas próximas (horarios y campos se publican tarde)
PENDING_DAYS = 120      # resultados pendientes (aplazados) que se siguen buscando
MAX_ACTAS_PER_RUN = 60   # actas por pasada del bot (~6 s cada una); el resto, en la siguiente
MAX_ACTA_TRIES = 4       # lecturas fallidas de un acta antes de dejarla (se puede releer a mano)
DEADLINE_SECONDS = 25 * 60   # actas y goleadores solo hasta aquí: el job tiene 45 min
ACTA_URL = "/NFG_CmpPartido?cod_primaria=1000120&CodActa={code}"
GOLEADORES_URL = ("/NFG_CMP_Goleadores?cod_primaria=1000120&CodJornada="
                  "&codcompeticion={comp}&codtemporada={season}&codgrupo={group}")


def fiflp_groups(conn, season_id):
    return conn.execute(
        """SELECT id, code, url FROM groups
           WHERE season_id=? AND url LIKE '%fiflp.com%' ORDER BY code""",
        (season_id,)).fetchall()


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


def scrape_group(page, F, url, stored, today):
    """(standings crudas, {jornada: [partidos crudos]}) de un grupo de FIFLP."""
    comp, code = fiflp_ids(url)
    season = re.search(r"CodTemporada=(\d+)", url).group(1)
    base = f"{F.BASE}/NFG_VisClasificacion?cod_primaria=1000120&CodTemporada={season}"
    standings = []
    if F.goto(page, f"{base}&codcompeticion={comp}&codgrupo={code}&codjornada=99"):
        standings = F.parse_standings(page)
    F.delay()
    rounds = {}
    calendar = (f"{F.BASE}/NFG_CmpJornada?cod_primaria=1000120&CodTemporada={season}"
                f"&CodCompeticion={comp}&CodGrupo={code}")
    if not F.goto(page, calendar):
        raise RuntimeError("no carga el calendario de la federación")
    options = []
    for _ in range(4):        # FIFLP a veces tarda en servir el desplegable («0J»)
        options = page.evaluate("""() => {
            const sel = document.querySelector('select[name="jornada"]');
            return sel ? Array.from(sel.options).filter(o => o.value && o.value !== '0')
                           .map(o => ({value: o.value, text: o.text.trim()})) : [];
        }""")
        if options:
            break
        page.wait_for_timeout(3000)
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
    `deadline`, en time.monotonic()). Devuelve cuántas importó y cuántas leyó.
    Una lectura fallida suma un intento; una página que no carga, no (es la
    red, no el acta), pero tres seguidas cortan la pasada."""
    import time
    from fiflp_acta import parse_flat_acta
    done = read = failed_loads = 0
    for mid, code in pending_actas(conn, group_id)[:budget]:
        if deadline and time.monotonic() > deadline:
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


def write_scorers(conn, group_id, rows):
    """Sustituye los goleadores del grupo con los de la federación, con los
    nombres de equipo que ya usa la base."""
    if not rows:
        return 0
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


def update_groups(conn, season_id, today=None):
    """Recorre los grupos de la federación de la temporada en curso."""
    groups = fiflp_groups(conn, season_id)
    if not groups:
        return
    from migrate_actas_schema import migrate
    migrate(conn)                 # fiflp_acta, players.fiflp_id, delegados
    today = today or date.today()
    print(f"\nFederación (FIFLP): {len(groups)} grupos")
    pending = {code: url for _, code, url in groups}
    try:
        _scrape_all(conn, groups, today, pending)
    except Exception as e:      # sin navegador o FIFLP caída: se informa, no se tumba el run
        print(f"  ! la federación no se pudo consultar: {e}")
        for code, url in pending.items():
            source_health.record(code, url, "error", e)


def _scrape_all(conn, groups, today, pending):
    import fetch_fiflp_2425 as F
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"))
        page.set_default_timeout(30000)
        import time
        deadline = time.monotonic() + DEADLINE_SECONDS
        results = {}
        for group_id, code, url in groups:
            print(f"  [{code}]", flush=True)
            try:
                raw_standings, raw_rounds = scrape_group(page, F, url, stored_rounds(conn, group_id), today)
                status, msg = update_group(conn, group_id, code, raw_standings, raw_rounds)
            except Exception as e:          # un grupo que falla no tumba a los demás
                conn.rollback()
                status, msg = "error", e
                print(f"    ! error: {e}")
            results[code] = [status, msg]
        # Segunda pasada, con lo que quede de plazo: actas y goleadores. Son lo
        # más lento y lo menos urgente; un fallo aquí no cambia el estado del grupo.
        budget = MAX_ACTAS_PER_RUN
        print("\n  Actas y goleadores")
        for group_id, code, url in groups:
            if results[code][0] != "ok" or time.monotonic() > deadline:
                continue
            notes = []
            try:
                done, read = import_actas(page, F, conn, group_id, budget, deadline)
                budget -= read
                if read:
                    notes.append(f"{done}/{read} actas")
            except Exception as e:
                conn.rollback()
                notes.append(f"actas: {e}")
            try:
                if time.monotonic() <= deadline:
                    scorers = update_goleadores(page, F, conn, group_id, url)
                    if scorers:
                        notes.append(f"{scorers} goleadores")
            except Exception as e:
                conn.rollback()
                notes.append(f"goleadores: {e}")
            if notes:
                print(f"  [{code}] " + ", ".join(notes))
                results[code][1] = f"{results[code][1]}; " + ", ".join(notes)
        if time.monotonic() > deadline:
            print("  (plazo agotado: el resto de actas y goleadores, en la próxima pasada)")
        for group_id, code, url in groups:
            source_health.record(code, url, *results[code])
            pending.pop(code, None)
        browser.close()
