#!/usr/bin/env python3
"""import_fiflp_grupos.py — Los grupos de temporadas pasadas que la base no tiene,
desde la federación: ligas insulares de 2021-22, grupos de una competición que
no se archivaron, finales, semifinales y torneos de cierre o clausura.

Fuentes (las suben goleadores-federacion.yml y actas-federacion.yml):
  - fiflp_goleadores_<S>_raw.json: los grupos de cada competición del catálogo,
    con su nombre y su clasificación oficial;
  - fiflp_actas_<S>_index.json y _raw.json: los partidos jugados de cada grupo,
    de la cabecera de su acta aplanada (fecha, hora, equipos, marcador, campo).

Un grupo de la federación que casa con uno de la base (import_fiflp_goleadores.
match_group: por sus actas o por sus equipos) ya está y no se toca. Uno que no
casa se crea con el código de su competición: el de sus grupos hermanos que sí
están en la base (mismo prefijo, fase e isla) o el de COMP_META
(import_fiflp_islas.py) o EXTRA_META. Si ese código ya existe en la temporada,
se salta (mejor un grupo de menos que pisar uno). Los nombres de los equipos,
los que ya usa la base en esa temporada o en las de al lado (known_names).
Los grupos creados aquí quedan en fiflp_groups y se rehacen cuando cambian sus
fuentes. El bot llama a import_changed_grupos (sha1 de las fuentes en raw_imports).
"""
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import get_or_create_category, get_or_create_group, get_or_create_team, delete_group_matches  # noqa: E402
from import_fiflp_cups_2324 import clean_team_name  # noqa: E402
from import_fiflp_goleadores import match_group, _category  # noqa: E402
from import_fiflp_islas import COMP_META  # noqa: E402
import import_fiflp_actas  # noqa: E402

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))

# Competiciones sin grupos en la base: (prefijo de código, fase publicada, isla).
EXTRA_META = {
    # 2021-22
    "973": ("CLZF", "Final Copa Delegación Lanzarote", "lanzarote"),
    "962": ("FV1F", "Final Liga Fuerteventura", "fuerteventura"),
    "803": ("CFVF", "Final Copa Fuerteventura", "fuerteventura"),
    "956": ("LZ1F", "Final Liga Primera Lanzarote", "lanzarote"),
    # 2022-23
    "1165": ("FV1F", "Final Liga Fuerteventura", "fuerteventura"),
    "1014": ("CFVF", "Final Copa Fuerteventura", "fuerteventura"),
    "1157": ("LZ1F", "Final Liga Primera Lanzarote", "lanzarote"),
    # 2023-24
    "1445": ("TPC", "Torneo Cierre Prebenjamín", "grancanaria"),
    "1409": ("CLZPF", "Final Copa Cabildo Preferente Lanzarote", "lanzarote"),
    "1391": ("LZ1F", "Final Liga Primera Lanzarote", "lanzarote"),
    "1433": ("CLZ1F", "Final Copa Cabildo Primera Lanzarote", "lanzarote"),
    # 2024-25
    "1657": ("CLZP", "Copa Cabildo Preferente Lanzarote", "lanzarote"),
    "1659": ("CLZPF", "Final Copa Cabildo Preferente Lanzarote", "lanzarote"),
    "1641": ("LZ1F", "Final Liga Primera Lanzarote", "lanzarote"),
    "1682": ("CLZ1", "Copa Cabildo Primera Lanzarote", "lanzarote"),
    "1695": ("CLZ1S", "Semifinal Copa Cabildo Primera Lanzarote", "lanzarote"),
    "1683": ("CLZ1F", "Final Copa Cabildo Primera Lanzarote", "lanzarote"),
    "1731": ("TPFL", "Torneo Cierre Prebenjamín Fuerteventura-Lanzarote", "fuerteventura"),
    # 2025-26: la Fase 1 de Lanzarote (la Fase 2, 54422886, es LZ1-4, de futbolaspalmas)
    "54422884": ("LZF", "Lanzarote Fase 1", "lanzarote"),
    "54976641": ("CLB", "Clausura Benjamín", "grancanaria"),
    "54969359": ("CLP", "Torneo Clausura Prebenjamín", "grancanaria"),
}
ISLAND_OF_PREFIX = (("LZ", "lanzarote"), ("CLZ", "lanzarote"), ("PLZ", "lanzarote"),
                    ("FV", "fuerteventura"), ("CFV", "fuerteventura"), ("PFV", "fuerteventura"))


def group_number(name):
    m = re.search(r"(\d+)", name or "")
    return int(m.group(1)) if m else 1


def _iso_island(prefix):
    return next((island for p, island in ISLAND_OF_PREFIX if prefix.startswith(p)), "grancanaria")


def comp_meta(conn, comp, siblings):
    """(prefijo, fase, isla) de una competición: la de un grupo hermano ya en la
    base (su código menos el número de su grupo), la de COMP_META o la de
    EXTRA_META; None si no se sabe."""
    for entry, gid in siblings:
        row = conn.execute("SELECT code, phase, island FROM groups WHERE id=?", (gid,)).fetchone()
        n = str(group_number(entry.get("grupo_name")))
        if row and row[0].endswith(n) and len(row[0]) > len(n):
            return row[0][:-len(n)], row[1], row[2]
    if comp in EXTRA_META:
        return EXTRA_META[comp]
    if comp in COMP_META:
        prefix, phase = COMP_META[comp]
        return prefix, phase, _iso_island(prefix)
    return None


def group_matches(index, actas, comp, grupo):
    """[(jornada, local, visitante, gl, gv, fecha, hora, campo, cod_acta, acta)] de las
    actas aplanadas de ese grupo de la federación, en orden de jornada y fecha."""
    out = []
    for cod, e in index.items():
        if str(e.get("comp_id")) != str(comp) or str(e.get("grupo")) != str(grupo):
            continue
        acta = actas.get(str(cod))
        if not import_fiflp_actas.flattened(acta):
            continue
        h = acta.get("header") or {}
        home, away = clean_team_name(h.get("home_team")), clean_team_name(h.get("away_team"))
        if not home or not away or home == away:
            continue
        out.append((str(h.get("jornada") or e.get("jornada") or ""), home, away, h.get("home_score"),
                    h.get("away_score"), h.get("date") or "", h.get("time") or "", h.get("venue") or "",
                    int(cod), acta))
    key = lambda m: (int(m[0]) if m[0].isdigit() else 999, m[5][6:] + m[5][3:5] + m[5][:2], m[6])
    return sorted(out, key=key)


def _referenced(conn, team_id):
    for table, column in (("standings", "team_id"), ("matches", "home_team_id"), ("matches", "away_team_id"),
                          ("scorers", "team_id"), ("appearances", "team_id"), ("match_events", "team_id"),
                          ("match_staff", "team_id")):
        if conn.execute(f"SELECT 1 FROM {table} WHERE {column}=? LIMIT 1", (team_id,)).fetchone():
            return True
    return False


def unique_names(names, conn):
    """Dos clubes distintos (otra clave de equipo) que known_names ha llevado al
    mismo nombre ('GRAN TARAJAL SOC. TAMAS., U.D.' y 'TARAJALEJO, U.D.' → 'UD
    Tarajalejo'): se lo queda el que mejor casa con él; los demás, su nombre con
    forma de portal (o el de la federación, si ese ya es de otro equipo)."""
    from activate_season import pretty_name
    from fiflp_names import team_key, team_score
    existing = {r[0] for r in conn.execute("SELECT name FROM teams")}
    by_target = {}
    for raw_name, target in names.items():
        by_target.setdefault(target, []).append(raw_name)
    out = dict(names)
    taken = set(names.values())
    for target, raws in by_target.items():
        clubs = {}
        for raw_name in raws:
            clubs.setdefault(team_key(raw_name), []).append(raw_name)
        if len(clubs) < 2:
            continue
        best = max(clubs, key=lambda key: (team_score(key, team_key(target)), key))
        for key, members in clubs.items():
            if key == best:
                continue
            for raw_name in members:
                pretty = pretty_name(raw_name)
                out[raw_name] = pretty if pretty not in existing and pretty not in taken else raw_name
                taken.add(out[raw_name])
    return out


def _load(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def import_season(conn, folder, season, log=print):
    """Crea (o rehace) los grupos de la federación de `season` que la base no
    tiene. Devuelve {creados, rehechos, ya_estaban, sin_código, choques}."""
    from activate_season import known_names
    report = {"created": 0, "redone": 0, "existing": 0, "no_meta": 0, "clash": 0}
    row = conn.execute("SELECT id, start_year FROM seasons WHERE name=?", (season,)).fetchone()
    if not row:
        return report
    season_id, start = row
    raw = _load(os.path.join(folder, f"fiflp_goleadores_{season}_raw.json"), {})
    index = _load(os.path.join(folder, f"fiflp_actas_{season}_index.json"), {})
    actas = _load(os.path.join(folder, f"fiflp_actas_{season}_raw.json"), {})
    conn.execute("""CREATE TABLE IF NOT EXISTS fiflp_groups (
        group_id INTEGER PRIMARY KEY, season_id INTEGER NOT NULL, comp TEXT NOT NULL, grupo TEXT NOT NULL)""")
    owned = {(c, g): gid for gid, c, g in conn.execute(
        "SELECT group_id, comp, grupo FROM fiflp_groups WHERE season_id=?", (season_id,))}

    # Qué grupos de la federación ya están en la base (y con qué grupo) y cuáles faltan.
    mapped, missing = {}, []
    for key in sorted(raw):
        entry = raw[key]
        if not entry.get("ok"):
            continue
        ident = (str(entry["comp"]), str(entry["grupo"]))
        if ident in owned:
            missing.append(entry)
            continue
        gid = match_group(conn, season_id, index, entry)
        if gid and gid not in owned.values():
            mapped.setdefault(ident[0], []).append((entry, gid))
            report["existing"] += 1
        else:
            missing.append(entry)

    plans = []
    codes = {r[0]: r[1] for r in conn.execute("SELECT code, id FROM groups WHERE season_id=?", (season_id,))}
    for entry in missing:
        ident = (str(entry["comp"]), str(entry["grupo"]))
        meta = comp_meta(conn, ident[0], mapped.get(ident[0], []))
        if not meta:
            report["no_meta"] += 1
            log(f"  ! {season} {entry.get('comp_name')} {entry.get('grupo_name')}: competición sin código")
            continue
        prefix, phase, island = meta
        n = group_number(entry.get("grupo_name"))
        code = f"{prefix}{n}"
        if code in codes and codes[code] != owned.get(ident):
            report["clash"] += 1
            log(f"  ! {season} {entry.get('comp_name')} {entry.get('grupo_name')}: el código {code} ya es de otro grupo")
            continue
        matches = group_matches(index, actas, *ident)
        if not matches and not entry.get("standings"):
            continue
        codes[code] = owned.get(ident) or ("nuevo", ident)
        plans.append((entry, code, n, phase, island, matches))
    if not plans:
        conn.commit()
        return report

    # Los nombres de los equipos, todos los grupos nuevos de la temporada a la vez.
    pseudo = [{"island": island, "standings": entry.get("standings") or [],
               "jornadas": [{"matches": [{"home": m[1], "away": m[2]} for m in matches]}]}
              for entry, code, n, phase, island, matches in plans]
    # Los nombres de la base, de la temporada más cercana a la más lejana.
    years = sorted({r[0] for r in conn.execute("SELECT start_year FROM seasons")}, key=lambda y: (abs(y - start), y < start))
    names = unique_names(known_names(pseudo, conn, years=years, keep_existing=True), conn)
    name = lambda raw_name: names.get(clean_team_name(raw_name), clean_team_name(raw_name))

    for entry, code, n, phase, island, matches in plans:
        ident = (str(entry["comp"]), str(entry["grupo"]))
        rows = [name(r["team"]) for r in entry.get("standings") or [] if clean_team_name(r.get("team"))]
        if len(rows) != len(set(rows)):
            report["clash"] += 1
            log(f"  ! [{code}] dos equipos de la clasificación acabarían con el mismo nombre: se salta")
            continue
        cat = _category(entry.get("comp_name"))
        cat_id = get_or_create_category(conn, cat)
        standings = [r for r in entry.get("standings") or [] if clean_team_name(r.get("team"))]
        teams = {name(m[1]) for m in matches} | {name(m[2]) for m in matches} | {name(r["team"]) for r in standings}
        team_ids = {t: get_or_create_team(conn, t) for t in sorted(teams)}
        group_id = get_or_create_group(
            conn, season_id, cat_id, code, name=f"Grupo {n}", full_name=f"{cat} {phase.upper()} - GRUPO {n}",
            phase=phase, island=island, url="", current_jornada=matches[-1][0] if matches else "")
        redo = ident in owned
        before = {r[0] for r in conn.execute("""SELECT team_id FROM standings WHERE group_id=?
            UNION SELECT home_team_id FROM matches WHERE group_id=? UNION SELECT away_team_id FROM matches WHERE group_id=?""",
            (group_id, group_id, group_id))} if redo else set()
        try:
            conn.execute("DELETE FROM standings WHERE group_id=?", (group_id,))
            delete_group_matches(conn, group_id)
            for jornada, home, away, hs, as_, date, time, venue, cod, acta in matches:
                both = hs is not None and as_ is not None
                cur = conn.execute(
                    """INSERT INTO matches (group_id, jornada, date, time, home_team_id, away_team_id,
                       home_score, away_score, venue, cod_acta) VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (group_id, jornada, date, time, team_ids[name(home)], team_ids[name(away)],
                     hs if both else None, as_ if both else None, venue, cod))
                import_fiflp_actas._import_one(conn, cod, acta, mid=cur.lastrowid)
            for r in standings:
                conn.execute("""INSERT INTO standings (group_id, team_id, position, points, played, won, drawn,
                                lost, gf, gc, gd) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                             (group_id, team_ids[name(r["team"])], r.get("pos"), r.get("pts"), r.get("j"), r.get("g"),
                              r.get("e"), r.get("p"), r.get("gf"), r.get("gc"), r.get("df")))
            conn.execute("INSERT OR REPLACE INTO fiflp_groups(group_id, season_id, comp, grupo) VALUES (?,?,?,?)",
                         (group_id, season_id, *ident))
            # Un equipo que el grupo rehecho ya no usa (otro nombre) y nadie más usa, fuera.
            for tid in before:
                if not _referenced(conn, tid):
                    conn.execute("DELETE FROM teams WHERE id=?", (tid,))
            conn.commit()
        except Exception as exc:
            conn.rollback()
            report["clash"] += 1
            log(f"  ! [{code}] no se pudo importar ({exc}): se salta")
            continue
        report["redone" if redo else "created"] += 1
        log(f"  [{code}] {phase}, Grupo {n}: {len(matches)} partidos, {len(standings)} equipos en la clasificación")
    return report


GRUPOS_VERSION = "3"   # en la huella: subirla rehace los grupos de todas las temporadas


def sources_digest(folder, season):
    h = hashlib.sha1(GRUPOS_VERSION.encode())
    for kind in ("goleadores", "actas"):
        for suffix in (("raw",) if kind == "goleadores" else ("index", "raw")):
            path = os.path.join(folder, f"fiflp_{kind}_{season}_{suffix}.json")
            h.update(path.encode())
            if os.path.exists(path):
                with open(path, "rb") as f:
                    h.update(f.read())
    return h.hexdigest()


def import_changed_grupos(conn, folder=SCRIPTS_DIR, log=print):
    """import_season de cada temporada con raw de goleadores cuyas fuentes hayan
    cambiado desde la última vez (sha1 en raw_imports, clave grupos:<S>)."""
    conn.execute("""CREATE TABLE IF NOT EXISTS raw_imports (
        path TEXT PRIMARY KEY, sha1 TEXT NOT NULL, imported_at TEXT NOT NULL)""")
    reports = {}
    for fname in sorted(os.listdir(folder)):
        m = re.match(r"^fiflp_goleadores_(\d{4}-\d{4})_raw\.json$", fname)
        if not m:
            continue
        season = m.group(1)
        key, digest = f"grupos:{season}", sources_digest(folder, season)
        row = conn.execute("SELECT sha1 FROM raw_imports WHERE path=?", (key,)).fetchone()
        if row and row[0] == digest:
            continue
        report = import_season(conn, folder, season, log=log)
        conn.execute("INSERT OR REPLACE INTO raw_imports(path, sha1, imported_at) VALUES (?, ?, datetime('now'))",
                     (key, digest))
        conn.commit()
        log(f"  {season}: {report['created']} grupos nuevos, {report['redone']} rehechos, {report['existing']} ya "
            f"estaban; {report['no_meta']} sin código, {report['clash']} con el código ocupado")
        reports[season] = report
    return reports


if __name__ == "__main__":
    from db import get_connection
    c = get_connection()
    import_changed_grupos(c)
    c.close()
