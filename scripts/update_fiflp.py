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
from fetch_futbolaspalmas import standings_regression, stored_standings
from generate_js import _repair_incoherent_points
import source_health

BACK_DAYS = 21          # jornadas ya jugadas que se vuelven a mirar
AHEAD_DAYS = 14         # jornadas próximas (horarios y campos se publican tarde)
PENDING_DAYS = 120      # resultados pendientes (aplazados) que se siguen buscando


def fiflp_groups(conn, season_id):
    return conn.execute(
        """SELECT id, code, url FROM groups
           WHERE season_id=? AND url LIKE '%fiflp.com%' ORDER BY code""",
        (season_id,)).fetchall()


def option_round(text):
    """'3 - 17/10/2026' -> ('Jornada 3', date(2026, 10, 17)); sin fecha, None."""
    num, _, day = (text or "").partition(" - ")
    m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", day.strip())
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
    """Suma de |GF partidos − GF tabla| + |GC partidos − GC tabla| por equipo.
    `override` = (match_id, gl, gv) para medir cómo quedaría con otro marcador."""
    table = {tid: (gf, gc) for tid, gf, gc in conn.execute(
        "SELECT team_id, gf, gc FROM standings WHERE group_id=?", (group_id,))}
    if not table or any(v[0] is None for v in table.values()):
        return None
    goals = {tid: [0, 0] for tid in table}
    for mid, h, a, hs, as_ in conn.execute(
            """SELECT id, home_team_id, away_team_id, home_score, away_score
               FROM matches WHERE group_id=?""", (group_id,)):
        if override and mid == override[0]:
            hs, as_ = override[1], override[2]
        if hs is None or as_ is None:
            continue
        for tid, f, c in ((h, hs, as_), (a, as_, hs)):
            if tid in goals:
                goals[tid][0] += f
                goals[tid][1] += c
    return sum(abs(goals[t][0] - table[t][0]) + abs(goals[t][1] - table[t][1]) for t in table)


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
            """SELECT id, home_score, away_score, date, time, venue FROM matches
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
                    "SELECT id, home_score, away_score, date, time, venue FROM matches WHERE id=?",
                    (moved[0],)).fetchone()
        if row is None:
            conn.execute(
                """INSERT INTO matches(group_id, jornada, date, time, home_team_id,
                                       away_team_id, home_score, away_score, venue)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (group_id, label, m["date"], m["time"] or None, home_id, away_id, hs, as_, m["venue"] or None))
            new += 1
            scores += hs is not None
            continue
        mid, old_hs, old_as, old_date, old_time, old_venue = row
        fields = {}
        if m["date"] and m["date"] != old_date:
            fields["date"] = m["date"]
        if m["time"] and m["time"] != old_time:
            fields["time"] = m["time"]
        if m["venue"] and m["venue"] != old_venue:
            fields["venue"] = m["venue"]
        if hs is not None and (hs, as_) != (old_hs, old_as):
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
            conn.execute(f"UPDATE matches SET {', '.join(k + '=?' for k in fields)} WHERE id=?",
                         (*fields.values(), mid))
            updated += 1
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
    if not F.goto(page, f"{F.BASE}/NFG_CmpJornada?cod_primaria=1000120&CodTemporada={season}"
                        f"&CodCompeticion={comp}&CodGrupo={code}"):
        raise RuntimeError("no carga el calendario de la federación")
    options = page.evaluate("""() => {
        const sel = document.querySelector('select[name="jornada"]');
        return sel ? Array.from(sel.options).filter(o => o.value && o.value !== '0')
                       .map(o => ({value: o.value, text: o.text.trim()})) : [];
    }""")
    for opt in rounds_to_refresh(options, stored, today):
        label, when = option_round(opt["text"])
        page.evaluate(f"BuscarPartidos('{opt['value']}')")
        page.wait_for_timeout(2000)
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
                          "time": m.get("time") or "", "venue": m.get("venue") or ""})
        for i, n in enumerate(write_round(conn, group_id, label, clean, log)):
            totals[i] += n
    current = current_round(conn, group_id)
    if current:
        conn.execute("UPDATE groups SET current_jornada=? WHERE id=?", (current, group_id))
    conn.commit()
    msg = (f"{len(raw_rounds)} jornadas leídas: {totals[0]} partidos nuevos, "
           f"{totals[1]} actualizados, {totals[2]} resultados")
    log(f"    {msg}")
    return "ok", msg


def update_groups(conn, season_id, today=None):
    """Recorre los grupos de la federación de la temporada en curso."""
    groups = fiflp_groups(conn, season_id)
    if not groups:
        return
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
        for group_id, code, url in groups:
            print(f"  [{code}]", flush=True)
            try:
                raw_standings, raw_rounds = scrape_group(page, F, url, stored_rounds(conn, group_id), today)
                status, msg = update_group(conn, group_id, code, raw_standings, raw_rounds)
            except Exception as e:          # un grupo que falla no tumba a los demás
                conn.rollback()
                status, msg = "error", e
                print(f"    ! error: {e}")
            source_health.record(code, url, status, msg)
            pending.pop(code, None)
        browser.close()
