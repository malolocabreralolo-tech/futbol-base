"""Repara marcadores con las capturas de futbolaspalmas que guarda Wayback.

Los calendarios que vinieron de FIFLP pierden dígitos al leer su ofuscación
(un 15-0 queda en 5-0); los de futbolaspalmas cuadran con la clasificación
oficial. Para cada grupo cuyo calendario no cuadra con su tabla
(score_deviation.py), esta herramienta:

1. busca la página del grupo en futbolaspalmas (la URL de la base o la de las
   capturas locales `wayback_*_raw.json`) y sus capturas de Wayback dentro de
   la temporada;
2. lee su calendario con el mismo parser que el bot y empareja los equipos con
   los de la base por nombre y, si no, por club (fiflp_names.match_teams);
3. propone los marcadores que difieren y **solo los aplica si el desvío del
   grupo frente a la clasificación oficial baja**. Nunca toca clasificaciones
   ni crea o borra partidos.

Uso:
    python3 scripts/repair_scores_wayback.py --season 2025-2026 --fetch   # descarga a raw
    python3 scripts/repair_scores_wayback.py --season 2025-2026           # plan en seco
    python3 scripts/repair_scores_wayback.py --season 2025-2026 --write   # aplica

Lo descargado queda en scripts/wayback_scores_raw.json (reproducible sin red) y
cada cambio aplicado en scripts/wayback_scores_repairs.json.
"""
import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from fetch_futbolaspalmas import parse_all_matches  # noqa: E402
from fiflp_names import group_overlap, match_teams  # noqa: E402
from score_deviation import baseline_key, group_deviation, team_deviations  # noqa: E402

RAW_PATH = ROOT / "scripts" / "wayback_scores_raw.json"
REPORT_PATH = ROOT / "scripts" / "wayback_scores_repairs.json"
CDX = "https://web.archive.org/cdx/search/cdx"
# Las URLs de futbolaspalmas se reutilizan entre temporadas y hasta dentro de
# una misma temporada ('1benjaminN' se renumeró): una captura solo vale si su
# plantilla es la del grupo.
MIN_OVERLAP = 0.8
MAX_SNAPSHOTS_PER_URL = 4
KEEP_PER_URL = 2


def http_get(url, tries=3):
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (futbol-base)"})
            with urllib.request.urlopen(req, timeout=90) as resp:
                return resp.read().decode("utf-8", "replace")
        except Exception as exc:  # red de Wayback: reintentar con espera
            last = exc
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"no se pudo descargar {url}: {last}")


def season_window(season):
    start, end = season.split("-")
    return f"{start}0801", f"{end}0731"


def list_snapshots(url, season, get=http_get):
    """Marcas de tiempo de las capturas 200 de `url` en la temporada, recientes primero."""
    desde, hasta = season_window(season)
    query = urllib.parse.urlencode({"url": url, "from": desde, "to": hasta, "output": "json",
                                    "fl": "timestamp,statuscode", "filter": "statuscode:200"})
    try:
        rows = json.loads(get(f"{CDX}?{query}") or "[]")
    except ValueError:
        return []
    stamps = {r[0] for r in rows[1:] if len(r) > 1 and r[1] == "200" and desde <= r[0][:8] <= hasta}
    return sorted(stamps, reverse=True)


def snapshot_html(url, timestamp, get=http_get):
    return get(f"https://web.archive.org/web/{timestamp}id_/{url}")


def jornadas_from_html(html):
    return parse_all_matches(html or "", include_details=True)


def _snapshot_names(jornadas):
    return sorted({n for rows in jornadas.values() for r in rows for n in (r[1], r[2]) if n})


def group_teams(conn, group_id):
    """{team_id: nombre} de la tabla y del calendario del grupo."""
    rows = conn.execute("""
        SELECT t.id, t.name FROM teams t WHERE t.id IN (
          SELECT team_id FROM standings WHERE group_id=:g
          UNION SELECT home_team_id FROM matches WHERE group_id=:g
          UNION SELECT away_team_id FROM matches WHERE group_id=:g)""", {"g": group_id}).fetchall()
    return dict(rows)


def map_names(snapshot_names, teams):
    """({nombre de la captura: team_id}, [sin pareja]). Nombre exacto y, si no, por club."""
    por_nombre = {name: tid for tid, name in teams.items()}
    mapping = {n: por_nombre[n] for n in snapshot_names if n in por_nombre}
    sueltos = [n for n in snapshot_names if n not in mapping]
    libres = [name for name in por_nombre if name not in {teams[t] for t in mapping.values()}]
    for scraped, existing in match_teams(sueltos, libres).items():
        mapping[scraped] = por_nombre[existing]
    return mapping, [n for n in snapshot_names if n not in mapping]


def _round_number(label):
    m = re.search(r"(\d+)", label or "")
    return int(m.group(1)) if m else None


def plan_group(conn, group_id, snapshots):
    """Plan de reparación de un grupo a partir de sus capturas.

    Las capturas se aplican de la más antigua a la más reciente: la reciente
    manda. Solo cuentan filas fechadas dentro de la temporada del grupo. Se
    acepta solo si el desvío de los equipos con el calendario completo en ambos
    estados baja estrictamente."""
    teams = group_teams(conn, group_id)
    (season,) = conn.execute("SELECT s.name FROM groups g JOIN seasons s ON s.id = g.season_id WHERE g.id=?",
                             (group_id,)).fetchone()
    desde, hasta = (f"{d[:4]}-{d[4:6]}-{d[6:]}" for d in season_window(season))
    partidos = conn.execute(
        "SELECT id, jornada, home_team_id, away_team_id, home_score, away_score FROM matches WHERE group_id=?",
        (group_id,)).fetchall()
    por_pareja = {}
    for mid, jornada, home, away, hs, as_ in partidos:
        por_pareja.setdefault((home, away), []).append((mid, jornada, hs, as_))
    propuestos, origen, sin_pareja = {}, {}, set()
    for snap in sorted(snapshots, key=lambda s: s["timestamp"]):
        jornadas = snap["jornadas"]
        mapping, sueltos = map_names(_snapshot_names(jornadas), teams)
        sin_pareja.update(sueltos)
        for label, rows in jornadas.items():
            for row in rows:
                hs, as_ = row[3], row[4]
                home, away = mapping.get(row[1]), mapping.get(row[2])
                if hs is None or as_ is None or home is None or away is None:
                    continue
                if not (row[0] and desde <= row[0] <= hasta):
                    continue  # fila de otra temporada (captura de agosto con la anterior)
                candidatos = por_pareja.get((home, away), [])
                if len(candidatos) > 1:
                    n = _round_number(label)
                    candidatos = [c for c in candidatos if _round_number(c[1]) == n]
                if len(candidatos) != 1:
                    continue
                mid = candidatos[0][0]
                propuestos[mid] = (hs, as_)
                origen[mid] = f"{snap['url']}@{snap['timestamp']}"
    actual = {mid: (hs, as_) for mid, _, _, _, hs, as_ in partidos}
    overrides = {mid: v for mid, v in propuestos.items() if actual.get(mid) != v}
    before, after = _common_deviation(conn, group_id, overrides)
    info = {mid: (j, h, a) for mid, j, h, a, _, _ in partidos}
    changes = [{"match_id": mid, "jornada": info[mid][0], "home": teams[info[mid][1]],
                "away": teams[info[mid][2]], "before": list(actual[mid]), "after": list(v),
                "source": origen[mid]} for mid, v in sorted(overrides.items())]
    return {"group_id": group_id, "overrides": overrides, "changes": changes,
            "before": before, "after": after, "accepted": bool(overrides) and after < before,
            "unmatched": sorted(sin_pareja)}


def _common_deviation(conn, group_id, overrides):
    """Desvío antes y después sobre los equipos completos en los dos estados.

    Rellenar un marcador vacío puede completar el calendario de un equipo cuyo
    desvío venía de otros partidos: comparar solo los equipos completos antes y
    después evita rechazar un arreglo bueno por lo que no toca."""
    antes = team_deviations(conn, group_id)
    despues = team_deviations(conn, group_id, overrides)
    comunes = antes.keys() & despues.keys()
    return sum(antes[t] for t in comunes), sum(despues[t] for t in comunes)


def apply_plans(conn, plans):
    """Escribe los marcadores de los planes aceptados. Devuelve cuántos partidos cambian."""
    n = 0
    for plan in plans:
        if not plan["accepted"]:
            continue
        for mid, (hs, as_) in plan["overrides"].items():
            conn.execute("UPDATE matches SET home_score=?, away_score=? WHERE id=?", (hs, as_, mid))
            n += 1
    conn.commit()
    return n


# ─── Descarga (red) ──────────────────────────────────────────────────────────

def _raw_files():
    return [p for p in sorted((ROOT / "scripts").glob("wayback_*_raw.json")) if p.name != RAW_PATH.name]


def _local_raw_urls(conn, season, group_id):
    """URLs de las capturas locales wayback_*_raw.json cuya plantilla es la del grupo."""
    names = list(group_teams(conn, group_id).values())
    urls = []
    for path in _raw_files():
        try:
            data = json.loads(path.read_text())
        except ValueError:
            continue
        if data.get("season") != season:
            continue
        for g in data.get("groups", []):
            equipos = [r.get("team") for r in g.get("standings", []) if r.get("team")]
            if g.get("url") and group_overlap(equipos, names) >= MIN_OVERLAP:
                urls.append(g["url"])
    return urls


def known_urls(conn):
    """Todas las URLs de futbolaspalmas conocidas: las de la base (cualquier
    temporada) y las de las capturas locales. futbolaspalmas reutiliza sus
    direcciones cada temporada, así que valen como candidatas para cualquiera."""
    urls = {u for (u,) in conn.execute("SELECT url FROM groups WHERE url IS NOT NULL AND url != ''")}
    for path in _raw_files():
        try:
            data = json.loads(path.read_text())
        except ValueError:
            continue
        urls.update(g["url"] for g in data.get("groups", []) if g.get("url"))
    return sorted(u for u in urls if "futbolaspalmas.com" in u)


def fetch_pool(urls, season, get=http_get, pause=1.5):
    """{url: [capturas con algún marcador]}: las más recientes de cada URL en la temporada."""
    pool = {}
    for url in urls:
        snaps = []
        try:
            stamps = list_snapshots(url, season, get=get)
        except RuntimeError as exc:  # un 504 de Wayback no puede tumbar la temporada
            print(f"    ! {exc}")
            stamps = []
        for ts in stamps[:MAX_SNAPSHOTS_PER_URL]:
            time.sleep(pause)
            try:
                jornadas = jornadas_from_html(snapshot_html(url, ts, get=get))
            except RuntimeError as exc:
                print(f"    ! {exc}")
                continue
            con_marcador = sum(1 for rows in jornadas.values() for r in rows if r[3] is not None)
            print(f"    {url} @{ts}: {con_marcador} marcadores")
            if con_marcador:
                snaps.append({"url": url, "timestamp": ts, "jornadas": jornadas})
        pool[url] = snaps
        time.sleep(pause)
    return pool


def assign_snapshots(conn, group_ids, pool, keep=KEEP_PER_URL):
    """{group_id: capturas cuya plantilla casa con la del grupo, recientes primero}."""
    out = {}
    for gid in group_ids:
        names = list(group_teams(conn, gid).values())
        buenas = [s for snaps in pool.values() for s in snaps
                  if group_overlap(_snapshot_names(s["jornadas"]), names) >= MIN_OVERLAP]
        out[gid] = sorted(buenas, key=lambda s: s["timestamp"], reverse=True)[:keep]
    return out


def candidate_urls(conn, season, group_id):
    (url,) = conn.execute("SELECT url FROM groups WHERE id=?", (group_id,)).fetchone()
    urls = [url] if url else []
    for u in _local_raw_urls(conn, season, group_id):
        if u not in urls:
            urls.append(u)
    return urls


def fetch_group(conn, season, group_id, get=http_get, pause=1.5):
    """Capturas válidas del grupo: plantilla con solape suficiente y algún marcador."""
    names = list(group_teams(conn, group_id).values())
    kept = []
    for url in candidate_urls(conn, season, group_id):
        guardadas = 0
        try:
            stamps = list_snapshots(url, season, get=get)
        except RuntimeError as exc:
            print(f"    ! {exc}")
            stamps = []
        for ts in stamps[:MAX_SNAPSHOTS_PER_URL]:
            time.sleep(pause)
            try:
                jornadas = jornadas_from_html(snapshot_html(url, ts, get=get))
            except RuntimeError as exc:
                print(f"    ! {exc}")
                continue
            snap_names = _snapshot_names(jornadas)
            con_marcador = sum(1 for rows in jornadas.values() for r in rows if r[3] is not None)
            ov = group_overlap(snap_names, names) if snap_names else 0.0
            print(f"    {url} @{ts}: {con_marcador} marcadores, solape {ov:.2f}")
            if ov >= MIN_OVERLAP and con_marcador:
                kept.append({"url": url, "timestamp": ts, "jornadas": jornadas})
                guardadas += 1
                if guardadas >= KEEP_PER_URL:
                    break
        time.sleep(pause)
    return kept


# ─── CLI ─────────────────────────────────────────────────────────────────────

def _targets(conn, season, codes=None):
    rows = conn.execute("""
        SELECT g.id, c.name, g.code FROM groups g
        JOIN seasons s ON s.id = g.season_id JOIN categories c ON c.id = g.category_id
        WHERE s.name=? ORDER BY c.name, g.code""", (season,)).fetchall()
    out = []
    for gid, category, code in rows:
        if codes and code not in codes:
            continue
        if not codes and group_deviation(conn, gid)["dev"] == 0:
            continue
        out.append((gid, category, code))
    return out


def _load(path):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return {"version": 1, "groups": {}}


def _save(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + "\n")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--season", required=True)
    ap.add_argument("--groups", help="códigos separados por comas (por defecto: los que tienen desvío)")
    ap.add_argument("--fetch", action="store_true", help="descarga capturas de Wayback al raw")
    ap.add_argument("--pool", action="store_true",
                    help="con --fetch: prueba todas las URLs conocidas de futbolaspalmas, no solo las del grupo")
    ap.add_argument("--write", action="store_true", help="aplica los planes aceptados")
    args = ap.parse_args(argv)
    from db import get_connection
    conn = get_connection()
    codes = set(args.groups.split(",")) if args.groups else None
    targets = _targets(conn, args.season, codes)
    raw = _load(RAW_PATH)
    if args.fetch and args.pool:
        pool = fetch_pool(known_urls(conn), args.season)
        asignadas = assign_snapshots(conn, [gid for gid, _, _ in targets], pool)
        for gid, category, code in targets:
            raw["groups"][baseline_key(args.season, category, code)] = {"snapshots": asignadas[gid]}
            print(f"[{code}] {len(asignadas[gid])} capturas asignadas")
        _save(RAW_PATH, raw)
    elif args.fetch:
        for gid, category, code in targets:
            print(f"[{code}] descargando capturas")
            snaps = fetch_group(conn, args.season, gid)
            raw["groups"][baseline_key(args.season, category, code)] = {"snapshots": snaps}
            _save(RAW_PATH, raw)
    plans = []
    for gid, category, code in targets:
        entry = raw["groups"].get(baseline_key(args.season, category, code))
        if not entry or not entry.get("snapshots"):
            print(f"[{code}] sin capturas válidas")
            continue
        plan = plan_group(conn, gid, entry["snapshots"])
        plan["key"] = baseline_key(args.season, category, code)
        plans.append(plan)
        estado = "ACEPTADO" if plan["accepted"] else "rechazado"
        print(f"[{code}] {len(plan['changes'])} marcadores, desvío {plan['before']} -> {plan['after']}: "
              f"{estado}" + (f"; sin pareja: {', '.join(plan['unmatched'])}" if plan["unmatched"] else ""))
    aceptados = [p for p in plans if p["accepted"]]
    print(f"\n{len(aceptados)} de {len(plans)} grupos se reparan; "
          f"{sum(len(p['changes']) for p in aceptados)} marcadores; desvío "
          f"{sum(p['before'] for p in aceptados)} -> {sum(p['after'] for p in aceptados)}")
    if args.write and aceptados:
        n = apply_plans(conn, aceptados)
        report = _load(REPORT_PATH)
        for p in aceptados:
            report["groups"][p["key"]] = {"before": p["before"], "after": p["after"], "changes": p["changes"]}
        _save(REPORT_PATH, report)
        print(f"Aplicados {n} marcadores. Informe: {REPORT_PATH.relative_to(ROOT)}. "
              "Siguiente: python3 scripts/generate_js.py y "
              "python3 scripts/score_deviation.py --write-baseline")
    conn.close()


if __name__ == "__main__":
    main()
