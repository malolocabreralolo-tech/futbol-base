"""Repara marcadores con las capturas de futbolaspalmas que guarda Wayback.

Los calendarios que vinieron de FIFLP pierden dígitos al leer su ofuscación
(un 15-0 queda en 5-0); los de futbolaspalmas cuadran con la clasificación
oficial. Para cada grupo cuyo calendario no cuadra con su tabla
(score_deviation.py), esta herramienta:

1. busca la página del grupo en futbolaspalmas (la URL de la base o la de las
   capturas locales `wayback_*_raw.json`) y sus capturas de Wayback dentro de
   la temporada;
2. lee su calendario con el mismo parser que el bot y empareja los equipos con
   los de la base por nombre, por club (fiflp_names.match_teams) y, lo que
   quede suelto, por calendario (mismos rivales en las mismas jornadas);
3. propone los marcadores que difieren en la misma pareja y jornada (nunca
   rellena un partido sin marcador), **descarta uno a uno los que la
   clasificación oficial contradice** (la captura también tiene erratas) y
   solo aplica el grupo si su desvío baja. Nunca toca clasificaciones ni crea
   o borra partidos.

Las correcciones manuales de scripts/score_corrections.json (marcadores que
fija la clasificación oficial y que ninguna captura trae bien) se aplican
antes y ninguna captura las pisa.

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
CORRECTIONS_PATH = ROOT / "scripts" / "score_corrections.json"
CDX = "https://web.archive.org/cdx/search/cdx"
# Las URLs de futbolaspalmas se reutilizan entre temporadas y hasta dentro de
# una misma temporada ('1benjaminN' se renumeró): una captura solo vale si su
# plantilla es la del grupo.
MIN_OVERLAP = 0.8
MAX_SNAPSHOTS_PER_URL = 4
KEEP_PER_URL = 2
# Un nombre que el parecido no empareja se empareja por calendario si al menos
# el 80 % de sus partidos (y no menos de 3) coincide con los de un único equipo
# libre: mismo rival ya emparejado, misma jornada y mismo campo.
MIN_SCHEDULE_FIXTURES = 3
MIN_SCHEDULE_SHARE = 0.8


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


def pair_by_schedule(partidos, jornadas, mapping, sueltos, teams):
    """{nombre suelto: team_id} por calendario (ver MIN_SCHEDULE_SHARE).

    «Futbol2016» es «FUTBOL P.D.C. 2016, C.D.» aunque no se parezcan: juega
    contra los mismos rivales en las mismas jornadas y en el mismo campo."""
    usados = set(mapping.values())
    libres = [t for t in teams if t not in usados]
    en_base = {}
    for _, jornada, home, away, _, _ in partidos:
        n = _round_number(jornada)
        en_base.setdefault(home, set()).add((n, away, True))
        en_base.setdefault(away, set()).add((n, home, False))
    en_captura = {}
    for label, rows in jornadas.items():
        n = _round_number(label)
        for row in rows:
            home, away = row[1], row[2]
            if home in sueltos and away in mapping:
                en_captura.setdefault(home, set()).add((n, mapping[away], True))
            if away in sueltos and home in mapping:
                en_captura.setdefault(away, set()).add((n, mapping[home], False))
    out = {}
    for name in sueltos:
        fixtures = en_captura.get(name, set())
        if len(fixtures) < MIN_SCHEDULE_FIXTURES:
            continue
        scores = sorted(((len(fixtures & en_base.get(t, set())) / len(fixtures), t)
                         for t in libres if t not in out.values()), reverse=True)
        if scores and scores[0][0] >= MIN_SCHEDULE_SHARE and (len(scores) == 1 or scores[1][0] < scores[0][0]):
            out[name] = scores[0][1]
    return out


def discard_contradicted(conn, group_id, overrides):
    """(cambios que quedan, [match_id descartados, en orden]).

    La captura también tiene erratas, y un grupo que mejora en conjunto puede
    arrastrar una (un 4-8 que pasa a 8-4). Se quita, uno a uno, el cambio cuya
    retirada más baja el desvío, hasta que ninguna retirada lo baje."""
    kept = dict(overrides)
    discarded = []
    while kept:
        base = sum(team_deviations(conn, group_id, kept).values())
        best = None
        for mid in sorted(kept):
            dev = sum(team_deviations(conn, group_id, {k: v for k, v in kept.items() if k != mid}).values())
            if dev < base and (best is None or dev < best[1]):
                best = (mid, dev)
        if best is None:
            break
        discarded.append(best[0])
        del kept[best[0]]
    return kept, discarded


def plan_group(conn, group_id, snapshots, locked=()):
    """Plan de reparación de un grupo a partir de sus capturas.

    Las capturas se aplican de la más antigua a la más reciente: la reciente
    manda. Solo cuentan filas fechadas dentro de la temporada del grupo y en la
    misma jornada que el partido de la base; nunca se rellena un partido sin
    marcador ni se toca uno de `locked` (correcciones manuales). Los cambios
    que la clasificación contradice se descartan uno a uno, y el grupo se
    acepta solo si el desvío de los equipos completos baja estrictamente."""
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
    propuestos, origen, sin_pareja, rellenos = {}, {}, set(), set()
    for snap in sorted(snapshots, key=lambda s: s["timestamp"]):
        jornadas = snap["jornadas"]
        mapping, sueltos = map_names(_snapshot_names(jornadas), teams)
        if sueltos:
            extra = pair_by_schedule(partidos, jornadas, mapping, sueltos, teams)
            mapping.update(extra)
            sueltos = [n for n in sueltos if n not in extra]
        sin_pareja.update(sueltos)
        for label, rows in jornadas.items():
            n = _round_number(label)
            for row in rows:
                hs, as_ = row[3], row[4]
                home, away = mapping.get(row[1]), mapping.get(row[2])
                if hs is None or as_ is None or home is None or away is None:
                    continue
                if not (row[0] and desde <= row[0] <= hasta):
                    continue  # fila de otra temporada (captura de agosto con la anterior)
                # Misma pareja y misma jornada, aunque la pareja sea única: una
                # captura de otro grupo o de una copa puede repetir la pareja.
                candidatos = [c for c in por_pareja.get((home, away), [])
                              if n is not None and _round_number(c[1]) == n]
                if len(candidatos) != 1:
                    continue
                mid, _, base_hs, base_as = candidatos[0]
                if mid in locked:
                    continue
                if base_hs is None or base_as is None:
                    rellenos.add(mid)
                    continue
                propuestos[mid] = (hs, as_)
                origen[mid] = f"{snap['url']}@{snap['timestamp']}"
    actual = {mid: (hs, as_) for mid, _, _, _, hs, as_ in partidos}
    propuestas = {mid: v for mid, v in propuestos.items() if actual.get(mid) != v}
    overrides, descartados = discard_contradicted(conn, group_id, propuestas)
    before, after = _common_deviation(conn, group_id, overrides)
    cobertura = group_deviation(conn, group_id)
    info = {mid: (j, h, a) for mid, j, h, a, _, _ in partidos}

    def fila(mid):
        return {"match_id": mid, "jornada": info[mid][0], "home": teams[info[mid][1]],
                "away": teams[info[mid][2]], "before": list(actual[mid])}
    changes = [dict(fila(mid), after=list(v), source=origen[mid]) for mid, v in sorted(overrides.items())]
    discarded = [dict(fila(mid), proposed=list(propuestas[mid]), source=origen[mid]) for mid in descartados]
    return {"group_id": group_id, "overrides": overrides, "changes": changes, "discarded": discarded,
            "skipped_fills": len(rellenos), "before": before, "after": after,
            "accepted": bool(overrides) and after < before,
            "complete": cobertura["complete"], "teams": cobertura["teams"], "unmatched": sorted(sin_pareja)}


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
    """Escribe (sin confirmar) los marcadores de los planes aceptados. Devuelve
    cuántos partidos cambian; confirma commit_and_checkpoint."""
    n = 0
    for plan in plans:
        if not plan["accepted"]:
            continue
        for mid, (hs, as_) in plan["overrides"].items():
            conn.execute("UPDATE matches SET home_score=?, away_score=? WHERE id=?", (hs, as_, mid))
            n += 1
    return n


def commit_and_checkpoint(conn):
    """Confirma y vuelca el WAL al fichero de la base.

    La base va en modo WAL: si otra conexión la tiene abierta, los cambios se
    quedan en futbolbase.db-wal, que git no sube, y el commit llevaría la base
    sin ellos. Por eso un volcado incompleto es un error; los cambios ya están
    confirmados y basta con repetir el volcado cuando la otra conexión cierre."""
    conn.commit()
    busy, log, done = conn.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
    if busy or log != done:
        raise RuntimeError(
            f"cambios confirmados e informe guardado, pero el volcado del wal no terminó (busy={busy}, "
            f"páginas {done} de {log}): otra conexión tiene futbolbase.db abierta. Ciérrala y vuelca con: "
            "python3 -c \"import sqlite3; print(sqlite3.connect('futbolbase.db')"
            ".execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone())\"")


# ─── Correcciones manuales ───────────────────────────────────────────────────

def load_corrections(path=CORRECTIONS_PATH):
    try:
        return json.loads(Path(path).read_text())["corrections"]
    except FileNotFoundError:
        return []


def _correction_match(conn, season, c):
    rows = conn.execute("""
        SELECT m.id, m.jornada, m.home_score, m.away_score FROM matches m
        JOIN groups g ON g.id = m.group_id JOIN seasons s ON s.id = g.season_id
        JOIN categories cat ON cat.id = g.category_id
        JOIN teams th ON th.id = m.home_team_id JOIN teams ta ON ta.id = m.away_team_id
        WHERE s.name=? AND cat.name=? AND g.code=? AND th.name=? AND ta.name=?""",
                        (season, c["category"], c["group"], c["home"], c["away"])).fetchall()
    rows = [r for r in rows if _round_number(r[1]) == _round_number(c["jornada"])]
    if len(rows) != 1:
        raise ValueError(f"la corrección de {c['group']} {season}, jornada {c['jornada']} "
                         f"({c['home']} - {c['away']}) no señala un único partido")
    return rows[0]


def locked_matches(conn, season, corrections):
    """match_id de las correcciones de la temporada: ninguna captura los pisa."""
    return {_correction_match(conn, season, c)[0] for c in corrections if c["season"] == season}


def apply_corrections(conn, season, corrections):
    """Aplica (sin confirmar) las correcciones de la temporada que aún no están.
    Devuelve los cambios hechos, con la clave del grupo."""
    hechos = []
    for c in corrections:
        if c["season"] != season:
            continue
        mid, jornada, hs, as_ = _correction_match(conn, season, c)
        if [hs, as_] == list(c["score"]):
            continue
        conn.execute("UPDATE matches SET home_score=?, away_score=? WHERE id=?", (*c["score"], mid))
        hechos.append({"key": baseline_key(season, c["category"], c["group"]), "match_id": mid,
                       "jornada": jornada, "home": c["home"], "away": c["away"], "before": [hs, as_],
                       "after": list(c["score"]), "source": f"corrección manual: {c['reason']}"})
    return hechos


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


def url_category(url):
    """Categoría que nombra la dirección de futbolaspalmas, o None."""
    slug = url.lower()
    if "prebenjamin" in slug:
        return "PREBENJAMIN"
    return "BENJAMIN" if "benjamin" in slug else None


def squad_overlap(snapshot_names, names):
    """Solape de dos plantillas, 0..1, sobre la MAYOR: una copa de 6 equipos
    no puede pasar por su liga de 13 (sobre la menor daría 1.0)."""
    if not snapshot_names or not names:
        return 0.0
    return len(match_teams(snapshot_names, names)) / max(len(snapshot_names), len(names))


def assign_snapshots(conn, group_ids, pool, keep=KEEP_PER_URL):
    """{group_id: capturas de su categoría cuya plantilla casa con la del grupo, recientes primero}."""
    out = {}
    for gid in group_ids:
        names = list(group_teams(conn, gid).values())
        (category,) = conn.execute("SELECT c.name FROM groups g JOIN categories c ON c.id = g.category_id "
                                   "WHERE g.id=?", (gid,)).fetchone()
        buenas = [s for snaps in pool.values() for s in snaps
                  if url_category(s["url"]) in (None, category)
                  and squad_overlap(_snapshot_names(s["jornadas"]), names) >= MIN_OVERLAP]
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
    """Capturas válidas del grupo: de su categoría, con plantilla de solape suficiente y algún marcador."""
    names = list(group_teams(conn, group_id).values())
    (category,) = conn.execute("SELECT c.name FROM groups g JOIN categories c ON c.id = g.category_id "
                               "WHERE g.id=?", (group_id,)).fetchone()
    kept = []
    for url in candidate_urls(conn, season, group_id):
        if url_category(url) not in (None, category):
            continue
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
            ov = squad_overlap(snap_names, names)
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


def merge_snapshots(saved, fetched):
    """Capturas guardadas más las descargadas, por (url, timestamp), recientes
    primero. Con Wayback caído, una descarga vacía nunca borra lo guardado."""
    by_key = {(s["url"], s["timestamp"]): s for s in saved}
    by_key.update({(s["url"], s["timestamp"]): s for s in fetched})
    return sorted(by_key.values(), key=lambda s: s["timestamp"], reverse=True)


def _merge_by_match(old, new):
    out = {c["match_id"]: c for c in old}
    out.update({c["match_id"]: c for c in new})
    return list(out.values())


def merge_report_group(existing, plan):
    """Entrada del informe de un grupo tras aplicar `plan`, sin perder lo que
    registraron ejecuciones anteriores: el desvío de partida es el primero."""
    existing = existing or {}
    before = existing.get("before")
    return {"before": plan["before"] if before is None else before, "after": plan["after"],
            "changes": _merge_by_match(existing.get("changes", []), plan["changes"]),
            "discarded": _merge_by_match(existing.get("discarded", []), plan.get("discarded", []))}


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
    corrections = load_corrections(CORRECTIONS_PATH)
    locked = locked_matches(conn, args.season, corrections)
    codes = set(args.groups.split(",")) if args.groups else None
    targets = _targets(conn, args.season, codes)
    raw = _load(RAW_PATH)
    if args.fetch and args.pool:
        pool = fetch_pool(known_urls(conn), args.season)
        asignadas = assign_snapshots(conn, [gid for gid, _, _ in targets], pool)
        for gid, category, code in targets:
            key = baseline_key(args.season, category, code)
            previas = raw["groups"].get(key, {}).get("snapshots", [])
            raw["groups"][key] = {"snapshots": merge_snapshots(previas, asignadas[gid])}
            print(f"[{code}] {len(asignadas[gid])} capturas asignadas")
        _save(RAW_PATH, raw)
    elif args.fetch:
        for gid, category, code in targets:
            print(f"[{code}] descargando capturas")
            key = baseline_key(args.season, category, code)
            previas = raw["groups"].get(key, {}).get("snapshots", [])
            raw["groups"][key] = {"snapshots": merge_snapshots(previas, fetch_group(conn, args.season, gid))}
            _save(RAW_PATH, raw)
    # Las correcciones van sin confirmar hasta el final: después de la descarga,
    # para no bloquear la base a otros procesos mientras dura.
    corregidos = apply_corrections(conn, args.season, corrections)
    for c in corregidos:
        print(f"[{c['key'].split('|')[2]}] corrección manual, jornada {c['jornada']}, {c['home']} - {c['away']}: "
              f"{c['before'][0]}-{c['before'][1]} -> {c['after'][0]}-{c['after'][1]}")
    if corregidos:
        targets = _targets(conn, args.season, codes)
    plans = []
    for gid, category, code in targets:
        entry = raw["groups"].get(baseline_key(args.season, category, code))
        if not entry or not entry.get("snapshots"):
            print(f"[{code}] sin capturas válidas")
            continue
        plan = plan_group(conn, gid, entry["snapshots"], locked=locked)
        plan["key"] = baseline_key(args.season, category, code)
        plans.append(plan)
        notas = [f"descartados {len(plan['discarded'])}" if plan["discarded"] else "",
                 f"sin rellenar {plan['skipped_fills']}" if plan["skipped_fills"] else "",
                 f"solo {plan['complete']} de {plan['teams']} equipos completos"
                 if plan["complete"] * 2 < plan["teams"] else "",
                 f"sin pareja: {', '.join(plan['unmatched'])}" if plan["unmatched"] else ""]
        print(f"[{code}] {len(plan['changes'])} marcadores, desvío {plan['before']} -> {plan['after']}: "
              + ("ACEPTADO" if plan["accepted"] else "rechazado") + "".join(f"; {x}" for x in notas if x))
    aceptados = [p for p in plans if p["accepted"]]
    print(f"\n{len(aceptados)} de {len(plans)} grupos se reparan; "
          f"{sum(len(p['changes']) for p in aceptados)} marcadores; desvío "
          f"{sum(p['before'] for p in aceptados)} -> {sum(p['after'] for p in aceptados)}; "
          f"{len(corregidos)} correcciones manuales")
    if not args.write:
        conn.rollback()
        conn.close()
        return
    n = apply_plans(conn, aceptados)
    conn.commit()
    report = _load(REPORT_PATH)
    for p in aceptados:
        report["groups"][p["key"]] = merge_report_group(report["groups"].get(p["key"]), p)
    for c in corregidos:
        entrada = report["groups"].setdefault(c["key"], {"before": None, "after": None,
                                                          "changes": [], "discarded": []})
        entrada["changes"] = _merge_by_match(entrada["changes"],
                                             [{k: v for k, v in c.items() if k != "key"}])
    _save(REPORT_PATH, report)
    try:
        commit_and_checkpoint(conn)
    finally:
        conn.close()
    print(f"Aplicados {n} marcadores y {len(corregidos)} correcciones. Informe: "
          f"{REPORT_PATH.relative_to(ROOT)}. Siguiente: python3 scripts/generate_js.py y "
          "python3 scripts/score_deviation.py --write-baseline")


if __name__ == "__main__":
    main()
