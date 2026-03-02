#!/usr/bin/env python3
"""
fetch_mygol.py — Reconstruye data-benjamin.js, data-prebenjamin.js y data-history.js
desde la API REST de tusligascanarias.mygol.es (MyGol platform).

Sin dependencias externas. Uso: python3 scripts/fetch_mygol.py
"""

import datetime
import json
import os
import re
import urllib.request

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_URL = "https://tusligascanarias.mygol.es/api"
HISTORY_PATH = os.path.join(PROJECT_ROOT, "data-history.js")

# Torneos a procesar
TOURNAMENTS = [
    {
        "id": 86,
        "js_path": os.path.join(PROJECT_ROOT, "data-benjamin.js"),
        "var_name": "BENJAMIN",
        "stats_var": "BENJ_STATS",
        "group_prefix": "BEN",
        "island": "grancanaria",
    },
    {
        "id": 87,
        "js_path": os.path.join(PROJECT_ROOT, "data-prebenjamin.js"),
        "var_name": "PREBENJAMIN",
        "stats_var": "PREBENJ_STATS",
        "group_prefix": "PRE",
        "island": "grancanaria",
    },
]

STATUS_PLAYED = 5  # match status when played/finished


def fetch_json(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; FutbolBase/1.0)",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_classification(stage_id):
    """Fetch classification — API returns object with leagueClassification key."""
    data = fetch_json(f"{BASE_URL}/tournaments/stageclassification/{stage_id}")
    if isinstance(data, list):
        return data
    return data.get("leagueClassification", [])


def build_team_map(tournament_data):
    """Returns {team_id: team_name}"""
    return {t["id"]: t["name"].title() for t in tournament_data.get("teams", [])}


def compute_goals(days, team_ids):
    """Compute goals for/against per team from match results."""
    gf = {tid: 0 for tid in team_ids}
    gc = {tid: 0 for tid in team_ids}
    for day in days:
        for m in day.get("matches", []):
            if m.get("status") != STATUS_PLAYED:
                continue
            ht, vt = m["idHomeTeam"], m["idVisitorTeam"]
            hs, vs = m.get("homeScore", 0), m.get("visitorScore", 0)
            if ht in gf:
                gf[ht] += hs
                gc[ht] += vs
            if vt in gf:
                gf[vt] += vs
                gc[vt] += hs
    return gf, gc


def build_standings(classification, team_map, gf, gc):
    """Returns [[pos, name, pts, j, g, e, p, gf, gc, dg], ...]"""
    result = []
    for i, entry in enumerate(classification):
        tid = entry["idTeam"]
        name = team_map.get(tid, f"Equipo {tid}")
        tf, tc = gf.get(tid, 0), gc.get(tid, 0)
        result.append([
            i + 1,
            name,
            entry.get("tournamentPoints", 0),
            entry.get("gamesPlayed", 0),
            entry.get("gamesWon", 0),
            entry.get("gamesDraw", 0),
            entry.get("gamesLost", 0),
            tf,
            tc,
            tf - tc,
        ])
    return result


def parse_starttime(start_time):
    """Parse ISO datetime → (date 'DD/MM', time 'HH:MM') or (None, None) if invalid."""
    if not start_time or start_time.startswith("0001") or start_time.startswith("1901"):
        return None, None
    try:
        dt = datetime.datetime.fromisoformat(start_time)
        return f"{dt.day:02d}/{dt.month:02d}", f"{dt.hour:02d}:{dt.minute:02d}"
    except Exception:
        return None, None


def starttime_to_isodate(start_time):
    """Parse ISO datetime → 'YYYY-MM-DD' or None."""
    if not start_time or start_time.startswith("0001") or start_time.startswith("1901"):
        return None
    try:
        dt = datetime.datetime.fromisoformat(start_time)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return None


def process_tournament(config):
    tournament_id = config["id"]
    print(f"\n{'='*50}")
    print(f"Torneo {tournament_id}: {config['var_name']}")
    print(f"{'='*50}")

    # Datos del torneo (equipos, grupos, fases)
    t_data = fetch_json(f"{BASE_URL}/tournaments/{tournament_id}")
    team_map = build_team_map(t_data)
    groups_info = t_data.get("groups", [])
    stages_map = {s["id"]: s for s in t_data.get("stages", [])}
    print(f"  Equipos: {len(team_map)}, Grupos: {len(groups_info)}")

    # Jornadas y partidos
    days = fetch_json(f"{BASE_URL}/matches/fortournament/{tournament_id}")
    print(f"  Jornadas totales: {len(days)}")

    # Clasificación por fase
    all_classification = []
    for sid in stages_map:
        clasi = fetch_classification(sid)
        all_classification.extend(clasi)
    print(f"  Clasificación: {len(all_classification)} entradas")

    # Organizar por grupo
    clasi_by_group = {}
    for entry in all_classification:
        gid = entry.get("idGroup", 0)
        clasi_by_group.setdefault(gid, []).append(entry)

    days_by_group = {}
    for day in days:
        matches = day.get("matches", [])
        gid = matches[0].get("idGroup", 0) if matches else day.get("idGroup", 0)
        days_by_group.setdefault(gid, []).append(day)

    groups_array = []
    history_updates = {}

    for i, group in enumerate(groups_info):
        gid = group["id"]
        stage = stages_map.get(group.get("idStage", 0), {})
        app_id = f"{config['group_prefix']}{i + 1}"

        group_days = days_by_group.get(gid, days if len(groups_info) == 1 else [])
        group_clasi = clasi_by_group.get(gid, all_classification if len(groups_info) == 1 else [])

        # Calcular goles desde partidos
        team_ids = {e["idTeam"] for e in group_clasi}
        gf_map, gc_map = compute_goals(group_days, team_ids)
        standings = build_standings(group_clasi, team_map, gf_map, gc_map)

        # Jornada actual = última con al menos un partido jugado
        current_jornada_name = None
        current_matches_raw = []
        for day in reversed(group_days):
            if any(m.get("status") == STATUS_PLAYED for m in day.get("matches", [])):
                current_jornada_name = day["name"]
                current_matches_raw = day.get("matches", [])
                break

        # Si nada jugado aún, mostrar primera jornada
        if not current_jornada_name and group_days:
            current_jornada_name = group_days[0]["name"]
            current_matches_raw = group_days[0].get("matches", [])

        # Formatear partidos de la jornada actual
        formatted_matches = []
        for m in sorted(current_matches_raw, key=lambda x: x.get("startTime", "")):
            date_str, time_str = parse_starttime(m.get("startTime", ""))
            home = team_map.get(m["idHomeTeam"], f"Equipo {m['idHomeTeam']}")
            away = team_map.get(m["idVisitorTeam"], f"Equipo {m['idVisitorTeam']}")
            played = m.get("status") == STATUS_PLAYED
            hs = m.get("homeScore") if played else None
            vs = m.get("visitorScore") if played else None
            venue = m.get("field", {}).get("name") if m.get("idField", 0) > 0 else None
            formatted_matches.append([date_str, time_str, home, away, hs, vs, venue])

        # Construir historial
        history_jornadas = {}
        for day in group_days:
            hist_entries = []
            for m in day.get("matches", []):
                if m.get("status") != STATUS_PLAYED:
                    continue
                full_date = starttime_to_isodate(m.get("startTime", ""))
                if not full_date:
                    continue
                home = team_map.get(m["idHomeTeam"], f"Equipo {m['idHomeTeam']}")
                away = team_map.get(m["idVisitorTeam"], f"Equipo {m['idVisitorTeam']}")
                hist_entries.append([full_date, home, away, m.get("homeScore", 0), m.get("visitorScore", 0)])
            if hist_entries:
                history_jornadas[day["name"]] = hist_entries

        history_updates[app_id] = history_jornadas

        stage_name = stage.get("name", "")
        group_name = group.get("name", f"Grupo {i + 1}")
        full_name = f"{stage_name} - {group_name}".strip(" -") if stage_name else group_name

        groups_array.append({
            "id": app_id,
            "name": group_name,
            "fullName": full_name,
            "phase": stage_name,
            "island": config["island"],
            "jornada": current_jornada_name or "Jornada 1",
            "standings": standings,
            "matches": formatted_matches,
        })

        played_count = sum(len(v) for v in history_jornadas.values())
        print(f"  [{app_id}] {group_name} — {current_jornada_name}, {played_count} partidos hist.")

    # Escribir archivo JS
    num_teams = sum(len(g["standings"]) for g in groups_array)
    content = (
        f"const {config['var_name']}="
        + json.dumps(groups_array, ensure_ascii=False, separators=(",", ":"))
        + f";\nconst {config['stats_var']}={{groups:{len(groups_array)},teams:{num_teams}}};\n"
    )
    with open(config["js_path"], "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  → {config['var_name']}: {len(groups_array)} grupos, {num_teams} equipos")

    return history_updates


def update_history(all_history_updates):
    """Actualiza data-history.js con los nuevos datos."""
    try:
        with open(HISTORY_PATH, encoding="utf-8") as f:
            content = f.read()
        m = re.match(r"const HISTORY=(\{.*?\});", content, re.DOTALL)
        if m:
            history = json.loads(m.group(1))
            tail = content[m.end():]
        else:
            history = {}
            tail = "\nconst HIST_MATCHES=0;\n"
    except FileNotFoundError:
        history = {}
        tail = "\nconst HIST_MATCHES=0;\n"

    # Reemplazar datos de los grupos nuevos (mantener histórico de grupos antiguos)
    history.update(all_history_updates)

    total_matches = sum(len(ms) for grp in history.values() for ms in grp.values())
    tail = re.sub(r"const HIST_MATCHES=\d+;", f"const HIST_MATCHES={total_matches};", tail)

    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        f.write(
            "const HISTORY="
            + json.dumps(history, ensure_ascii=False, separators=(",", ":"))
            + ";"
            + tail
        )
    print(f"\n→ data-history.js: {total_matches} partidos totales")


def bump_cache_version():
    index_path = os.path.join(PROJECT_ROOT, "index.html")
    today = datetime.date.today().strftime("%Y%m%d")
    try:
        with open(index_path, encoding="utf-8") as f:
            content = f.read()
        new_content = re.sub(r"\?v=\d{8}", f"?v={today}", content)
        if new_content != content:
            with open(index_path, "w", encoding="utf-8") as f:
                f.write(new_content)
            print(f"  index.html: cache bumped a {today}")
    except FileNotFoundError:
        pass


def main():
    all_history = {}
    for config in TOURNAMENTS:
        updates = process_tournament(config)
        all_history.update(updates)

    print(f"\n{'='*50}")
    update_history(all_history)
    bump_cache_version()
    print("\n✓ Terminado.")


if __name__ == "__main__":
    main()
