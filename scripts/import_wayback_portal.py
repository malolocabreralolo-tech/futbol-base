#!/usr/bin/env python3
"""import_wayback_portal.py — Las temporadas antiguas de futbolaspalmas.com (los raws de
fetch_wayback_portal.py, wayback_portal_<S>_raw.json) en la base.

- Temporada que la base no tiene (2012-13 a 2015-16): se da de alta, cerrada, con sus grupos
  (el código del raw: GC, BPGC y PGC de Gran Canaria; FV y LZ en 2012-13), su clasificación
  y sus partidos. De 2012-13 no hay partidos (Wayback no guardó los calendarios). De 2014-15
  la clasificación archivada es de marzo-abril: se calcula con los partidos, que llegan hasta
  el 10 de mayo (faltan las tres últimas jornadas de los grupos de 16).
- Temporada que la base ya tiene, de la federación (2016-17 a 2018-19): solo los partidos, en
  el grupo de la base de la misma categoría con el que comparte equipos (group_overlap ≥ 0,6,
  sin empate) y solo si ese grupo no tiene ninguno. Su clasificación es la oficial de la
  federación y no se toca. El portal cuenta a los retirados (con 0 puntos) y les da sus
  partidos como resultados administrativos; la federación los quita y anula esos partidos: por
  eso solo entran los partidos entre equipos del grupo de la base, y el calendario cuadra con
  la tabla oficial.
- Nombres: en un grupo que ya existe, los suyos (canonical_names). En una temporada nueva, el de
  la base si es el mismo equipo sin dudas (misma clave y letra, team_score ≥ 0,9 y único) y, si
  no, el del portal, sin sus marcas de sanción o retirada.

Lo que crea o rellena queda en portal_groups, y se rehace cuando cambia su raw (huella en
raw_imports). Un resultado administrativo de 2013-14 (contra un retirado) entra con su marcador
y sin campo.
"""
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_FILE = re.compile(r"^wayback_portal_(\d{4}-\d{4})_raw\.json$")
PORTAL_VERSION = "1"
# Temporadas que solo tiene el portal: se dan de alta con sus grupos. Las demás (2016-17 a 2018-19)
# son de la federación y solo reciben partidos, cuando ya están en la base.
NEW_SEASONS = ("2012-2013", "2013-2014", "2014-2015", "2015-2016")
# Temporadas cuya clasificación archivada no es la final: se calcula con los partidos.
COMPUTED_STANDINGS = ("2014-2015",)
MIN_OVERLAP = 0.6
MIN_SAME_TEAM = 0.9

SCHEMA = (
    """CREATE TABLE IF NOT EXISTS portal_groups (
        group_id INTEGER PRIMARY KEY REFERENCES groups(id),
        season   TEXT NOT NULL,
        code     TEXT NOT NULL,
        mode     TEXT NOT NULL CHECK(mode IN ('group', 'matches')),
        source   TEXT)""",
)


def migrate(conn):
    for sql in SCHEMA:
        conn.execute(sql)


def _fold(text):
    import unicodedata
    t = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


# Nombres que no son equipos (una plaza vacía de la tabla del portal).
NOT_TEAMS = {"EXCLUIDO", "RETIRADO", "DESCANSA", "DESCANSO"}
# Abreviaturas del portal antiguo → la palabra entera, para casar con los nombres de la base.
_ABBR = [
    (r"\bAt(?:l)?co\.\s*|\bAt\.\s*(?=[A-Z])", "Atlético "), (r"\bDan\.\s*", "Daniel "),
    (r"\bGuinig\.\s*", "Guiniguada "), (r"\bGuin\.\s*", "Guiniguada "), (r"\bLom\.\s*", "Lomo "),
    (r"\bVet\.\s*", "Veteranos "), (r"\bVirg\.\s*", "Virgen "), (r"\bSta\.\s*", "Santa "),
    (r"\bS\.(?=Pedro|Pedro|Mateo|Juan|Fern|Nicol|Isidro|Lorenzo|José|Jose)\s*", "San "),
    (r"\bCol\.\s*", "Colegio "), (r"\bC\.(?=Norte)", "Colegio "), (r"\bMaj\.\s*", "Majoreras "),
    (r"\bInter-nacional\b", "Internacional"), (r"\bL\.?\s?P\.(?=\s|$)", "Las Palmas"),
    (r"\bPan\.p\.\s*", "Panadería Pulido "), (r"\bP\.P\.\s*", "Panadería Pulido "),
]


# Nombres del portal antiguo (ya pasados por portal_name) → el de la base, revisados a mano sobre la
# lista de equipos nuevos de una importación de prueba (7/10/2026): el mismo club con su nombre largo,
# de patrocinador o con una errata. Lo que no está aquí y no casa solo, entra con su nombre del portal
# (clubes que ya no existen: Almenara, Labrantes, Black Stars…).
PORTAL_NAMES = {
    "Mesas Bachicao": "Las Mesas Hu.", "UD Las Mesas Ba.": "Las Mesas Hu.",
    "Daniel carnevali": "Carnevali", "Daniel Carnevali B": "Carnevali B", "Daniel Carnevali C": "Carnevali C",
    "CD Carnevali C": "Carnevali C",
    "Guiniguada apolinario": "Guiniguada", "Guiniguada Apolinario B": "Guiniguada B",
    "Veteranos Del Pila": "Veteranos", "Veteranos Del Pila B": "Veteranos B", "Veteranos Del Pila D": "Veteranos D",
    "CD Veteranos del Pilar C": "Veteranos C", "CD Veteranos del Pilar E": "Veteranos E",
    "Panadería Pulido San Mateo": "San Mateo", "PP San Mateo": "San Mateo",
    "Marzasport": "Atl. Marzasport", "Marzasport B": "Atl. Marzasport B",
    "Playa Del Hombre": "Playa D.H.", "Playa Del Hombre B": "Playa D.H. B", "Playa Del Hombre C": "Playa D.H. C",
    "UJ Costa Ayala": "Costa Ayala", "UJ Costa Ayala B": "Costa Ayala B",
    "Inter P.h.": "Internacional PH",
    "CEF Puertos Las Palmas": "Puertos LP", "CEF Puertos Las Palmas B": "Puertos LP B",
    "Puerto Las Palmas": "Puertos LP", "Puertos Las Palmas B": "Puertos LP B",
    "Santidad Banot": "Santidad", "UD Teror Balomp.": "UD Teror",
    "Villa S.Brígida": "Santa Brígida", "UD Villa Santa Brigida": "Santa Brígida",
    "U.D.S. Fernando": "San Fernando",
    "San Pedro Martir": "San Pedro", "San Pedro Martir B": "San Pedro B",
    "Lomo blanco S.j.a": "Lomo Blanco",
    "Majoreras guayadeque": "Las Majoreras", "Majoreras Guay. B": "Las Majoreras B",
    "CF Las Majoreras C": "Las Majoreras C",
    "Medifonsa L.torres": "Las Torres", "UD Las Torres B": "Las Torres B",
    "Union Viera E": "Unión Viera E", "UD Pedro Hidaldo": "Pedro Hidalgo",
    "CD V.Árbol Bonito": "Veg. Árbol Bonito", "CD V.Árbol Bonito B": "Veg. Árbol Bonito B",
    "CD V.Árbol Bonito C": "Veg. Árbol Bonito C", "Veg.arbol Bonito B": "Veg. Árbol Bonito B",
    "Colegio Norte V. Atlético": "Colegio Norte Viera At.", "Norte Viera": "Colegio Norte Viera",
    "CD Colegio Marpe": "Marpe", "CD Colegio Marpe B": "Marpe B",
    "CD Becerril B": "Becerril B", "Firgas B": "CD Firgas B", "CD Alcotán": "Alcotán Can.",
    "CF Castillo B": "Castillo CF B", "CF Rosiana B": "Rosiana B", "Ojos De Garza B": "Ojos de Garza B",
    "Esrella": "Estrella CF", "Estrella CF C": "Estrella C",
    "Daniel Carnevali": "Carnevali", "Pl. del Hombre": "Playa D.H.", "Pl. del Hombre B": "Playa D.H. B",
    "Pl. del Hombre C": "Playa D.H. C", "San Pedro Mártir": "San Pedro", "San Pedro Mártir B": "San Pedro B",
    "Veteranos del Pilar": "Veteranos", "Veteranos del Pilar B": "Veteranos B", "Veteranos del Pilar D": "Veteranos D",
    "Atlético Marzasport": "Atl. Marzasport", "Atlético Marzasport B": "Atl. Marzasport B",
    "Pla.del Hombre": "Playa D.H.", "Pla.del Hombre B": "Playa D.H. B",
    "internacional": "Internacional PH",      # Lanzarote, 2012-13: el Internacional de Playa Honda
    # 2017-18 y 2018-19 (los únicos de la federación sin pareja en el portal): UD Villa de Santa Brígida,
    # la Arenas San Fernando y el Flor de Lis Norte.
    "Villa": "Santa Brígida", "Villa B": "Santa Brígida B", "ArenaSanfer": "San Fernando B",
    "FDL Norte C": "Flor de Lis Norte C",
}


def portal_name(raw):
    """El nombre del portal sin marcas, con las abreviaturas desplegadas y sin la «A» del primer
    equipo ni un «C.F.» suelto al final: 'Atlco.Fomento A' → 'Atlético Fomento',
    'Estrella A C.f.' → 'Estrella'."""
    from wayback_portal import team_name
    name = team_name(raw)
    for pattern, repl in _ABBR:
        name = re.sub(pattern, repl, name, flags=re.I)
    name = re.sub(r"\s+(?:C\.\s?F\.?|C\.f\.?)$", "", name)
    name = re.sub(r"\s+A$", "", name.strip())
    return re.sub(r"\s+", " ", name).strip()


def is_placeholder(raw):
    """Una plaza que no es un equipo («EXCLUIDO ®», «DESCANSA»)."""
    return portal_name(raw).upper() in NOT_TEAMS


_PREFIX = re.compile(r"^(?:cd|cf|ud|ad|uj|cef|sd|cdf|fc)\s+")


def _lookup_key(name):
    """La clave de PORTAL_NAMES: sin tildes, mayúsculas, puntuación ni el prefijo del club."""
    return _PREFIX.sub("", _fold(name))


_PORTAL_BY_KEY = None


def portal_alias(clean):
    global _PORTAL_BY_KEY
    if _PORTAL_BY_KEY is None:
        _PORTAL_BY_KEY = {_lookup_key(k): v for k, v in PORTAL_NAMES.items()}
    return _PORTAL_BY_KEY.get(_lookup_key(clean))


def base_names_for(conn, names):
    """{nombre del portal: nombre de la base} para una temporada nueva: el de la base si es el
    mismo equipo sin dudas, si no el del portal limpio. Uno a uno dentro de `names` (un grupo)."""
    from fiflp_names import team_key, team_score
    db_names = [r[0] for r in conn.execute("SELECT name FROM teams")]
    by_fold = {}
    for n in db_names:
        by_fold.setdefault(_fold(n), []).append(n)
    keys = {n: team_key(n) for n in db_names}
    # La tabla y el calendario escriben a veces el mismo equipo con y sin marca («Atlético G.C. B *»):
    # se casa cada nombre limpio una sola vez.
    cleans = {}
    for raw in names:
        cleans.setdefault(portal_name(raw), []).append(raw)
    chosen, used = {}, set()
    pending = []
    for clean in sorted(cleans):
        alias = portal_alias(clean)
        if alias and alias not in used:
            chosen[clean] = alias
            used.add(alias)
            continue
        exact = [n for n in by_fold.get(_fold(clean), []) if n not in used]
        if len(exact) == 1:
            chosen[clean] = exact[0]
            used.add(exact[0])
        else:
            pending.append(clean)
    for clean in pending:
        k = team_key(clean)
        scored = sorted(((team_score(k, keys[n]), n) for n in db_names if n not in used), reverse=True)
        best = scored[0] if scored else (0, None)
        second = scored[1][0] if len(scored) > 1 else 0
        if best[1] and best[0] >= MIN_SAME_TEAM and second < best[0] and keys[best[1]][1] == k[1]:
            chosen[clean] = best[1]
            used.add(best[1])
        else:
            chosen[clean] = clean
    return {raw: chosen[clean] for clean, raws in cleans.items() for raw in raws}


def table_rows(standings, jornadas):
    """Las filas de la tabla del portal que son equipos de verdad: sin las plazas vacías, sin un
    retirado antes de empezar (0 partidos y fuera del calendario) y sin un excluido (el portal le
    deja las victorias y le quita los puntos: 0 puntos con más de una sanción de diferencia; la
    federación los quita de la tabla)."""
    from generate_js import _SANCTION_TOLERANCE
    in_calendar = {portal_name(m[k]) for ms in jornadas.values() for m in ms for k in ("home", "away")}
    out = []
    for row in standings:
        pos, name, pts, played, g, e, p = row[:7]
        if is_placeholder(name):
            continue
        if jornadas and not played and portal_name(name) not in in_calendar:
            continue
        if pts == 0 and 3 * g + e > _SANCTION_TOLERANCE:
            continue
        out.append(row)
    return [[i + 1, *r[1:]] for i, r in enumerate(out)]


def _group_names(entry):
    names = {r[1] for r in entry.get("standings") or []}
    for ms in (entry.get("jornadas") or {}).values():
        for m in ms:
            names |= {m["home"], m["away"]}
    return sorted(n for n in names if n and not is_placeholder(n))


def computed_standings(names, jornadas):
    """[[pos, equipo, pts, J, G, E, P, GF, GC, DF]] de los partidos con marcador (3 por victoria,
    1 por empate), por puntos, diferencia y goles a favor."""
    rec = {n: [0, 0, 0, 0, 0, 0] for n in names}       # J G E P GF GC
    for ms in jornadas.values():
        for m in ms:
            if m["hs"] is None or m["as"] is None:
                continue
            for team, gf, gc in ((m["home"], m["hs"], m["as"]), (m["away"], m["as"], m["hs"])):
                r = rec.setdefault(team, [0, 0, 0, 0, 0, 0])
                r[0] += 1
                r[1 + (0 if gf > gc else 1 if gf == gc else 2)] += 1
                r[4] += gf
                r[5] += gc
    rows = [[team, 3 * r[1] + r[2], *r[:4], r[4], r[5], r[4] - r[5]] for team, r in rec.items()]
    rows.sort(key=lambda r: (-r[1], -r[8], -r[6], r[0]))
    return [[i + 1, *row] for i, row in enumerate(rows)]


def _write_matches(conn, gid, jornadas, names):
    from db import get_or_create_team
    n = 0
    for label, ms in jornadas.items():
        for m in ms:
            home, away = names.get(m["home"]), names.get(m["away"])
            if not home or not away or home == away:
                continue
            hid, aid = get_or_create_team(conn, home), get_or_create_team(conn, away)
            conn.execute("""INSERT OR IGNORE INTO matches(group_id, jornada, date, time, home_team_id, away_team_id,
                                                         home_score, away_score, venue)
                            VALUES (?,?,?,?,?,?,?,?,?)""",
                         (gid, label, m.get("date"), m.get("time") or None, hid, aid, m.get("hs"), m.get("as"),
                          m.get("venue") or None))
            n += 1
    return n


def _current_round(conn, gid):
    from update_fiflp import current_round
    current = current_round(conn, gid)
    if current:
        conn.execute("UPDATE groups SET current_jornada=? WHERE id=?", (current, gid))


def import_new_season(conn, season, raw, log=print):
    """Una temporada que la base no tiene: alta, grupos, clasificación y partidos."""
    from db import get_or_create_category, get_or_create_group, get_or_create_season, get_or_create_team
    start = int(season[:4])
    season_id = get_or_create_season(conn, season, start, start + 1, is_current=False)
    report = {"groups": 0, "matches": 0, "teams_new": 0}
    before = {r[0] for r in conn.execute("SELECT name FROM teams")}
    for code, entry in sorted(raw.items()):
        names = base_names_for(conn, _group_names(entry))
        cat_id = get_or_create_category(conn, entry["category"])
        gid = get_or_create_group(conn, season_id, cat_id, code, name=entry.get("name"),
                                  full_name=entry.get("title") or None, phase=entry.get("phase"),
                                  island=entry.get("island"), url=None)
        conn.execute("DELETE FROM standings WHERE group_id=?", (gid,))
        conn.execute("DELETE FROM matches WHERE group_id=?", (gid,))
        jornadas = entry.get("jornadas") or {}
        standings = table_rows(entry.get("standings") or [], jornadas)
        if season in COMPUTED_STANDINGS and jornadas:
            real = {label: [m for m in ms if not is_placeholder(m["home"]) and not is_placeholder(m["away"])]
                    for label, ms in jornadas.items()}
            standings = computed_standings(_group_names({"standings": [], "jornadas": real}), real)
        for row in standings:
            if is_placeholder(row[1]):
                continue
            tid = get_or_create_team(conn, names.get(row[1], portal_name(row[1])))
            conn.execute("""INSERT OR REPLACE INTO standings(group_id, team_id, position, points, played, won, drawn,
                                                             lost, gf, gc, gd) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                         (gid, tid, *[row[0], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9]]))
        report["matches"] += _write_matches(conn, gid, jornadas, names)
        _current_round(conn, gid)
        conn.execute("""INSERT OR REPLACE INTO portal_groups(group_id, season, code, mode, source)
                        VALUES (?,?,?,?,?)""", (gid, season, code, "group",
                                                json.dumps(entry.get("results_from") or entry.get("standings_from"))))
        report["groups"] += 1
    report["teams_new"] = len({r[0] for r in conn.execute("SELECT name FROM teams")} - before)
    return report


def import_existing_season(conn, season_id, season, raw, log=print):
    """Una temporada de la federación: los partidos del portal en sus grupos sin partidos."""
    from fiflp_names import canonical_names, group_overlap
    from import_fiflp_goleadores import _db_groups, _db_groups_one
    report = {"groups": 0, "matches": 0, "unmatched": 0, "skipped": 0}
    claimed = set()
    mine = {gid for (gid,) in conn.execute("SELECT group_id FROM portal_groups WHERE season=? AND mode='matches'",
                                           (season,))}
    for code, entry in sorted(raw.items()):
        jornadas = entry.get("jornadas") or {}
        if not jornadas:
            continue
        names = _group_names(entry)
        candidates = sorted(((group_overlap(names, teams), gid) for gid, teams in
                             _db_groups(conn, season_id, entry["category"]).items()), reverse=True)
        if not candidates or candidates[0][0] < MIN_OVERLAP or \
                (len(candidates) > 1 and candidates[1][0] == candidates[0][0]):
            report["unmatched"] += 1
            log(f"    {season} {code}: sin grupo en la base ({candidates[0][0] if candidates else 0:.2f})")
            continue
        gid = candidates[0][1]
        if gid in claimed:
            report["unmatched"] += 1
            continue
        claimed.add(gid)
        has = conn.execute("SELECT 1 FROM matches WHERE group_id=? LIMIT 1", (gid,)).fetchone()
        if has and gid not in mine:
            report["skipped"] += 1
            continue
        group_teams = sorted(_db_groups_one(conn, gid))
        mapping = canonical_names([portal_name(n) for n in names], group_teams, [])
        names_map = {n: (portal_alias(portal_name(n)) if portal_alias(portal_name(n)) in group_teams
                         else mapping.get(portal_name(n))) for n in names}
        # Solo equipos del grupo: un nombre que no casa no crea un equipo nuevo.
        names_map = {n: v for n, v in names_map.items() if v in group_teams}
        conn.execute("DELETE FROM matches WHERE group_id=?", (gid,))
        report["matches"] += _write_matches(conn, gid, jornadas, names_map)
        _current_round(conn, gid)
        conn.execute("""INSERT OR REPLACE INTO portal_groups(group_id, season, code, mode, source)
                        VALUES (?,?,?,?,?)""", (gid, season, code, "matches",
                                                json.dumps(entry.get("results_from"))))
        report["groups"] += 1
    return report


def import_raw(conn, path, log=print):
    season = RAW_FILE.match(os.path.basename(path)).group(1)
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    row = conn.execute("SELECT id FROM seasons WHERE name=?", (season,)).fetchone()
    if season in NEW_SEASONS:
        return {"mode": "season", **import_new_season(conn, season, raw, log)}
    if row:
        return {"mode": "matches", **import_existing_season(conn, row[0], season, raw, log)}
    return None     # una de la federación que aún no está en la base: se espera (sin huella)


def import_changed_portal(conn, folder=SCRIPTS_DIR, log=print):
    """import_raw de cada wayback_portal_<S>_raw.json cuya huella haya cambiado (también si cambian
    los grupos de la temporada en la base, para las de la federación)."""
    migrate(conn)
    conn.execute("""CREATE TABLE IF NOT EXISTS raw_imports (
        path TEXT PRIMARY KEY, sha1 TEXT NOT NULL, imported_at TEXT NOT NULL)""")
    reports = {}
    for name in sorted(os.listdir(folder)):
        m = RAW_FILE.match(name)
        if not m:
            continue
        season = m.group(1)
        with open(os.path.join(folder, name), "rb") as f:
            h = hashlib.sha1(PORTAL_VERSION.encode() + f.read())
        h.update(repr(conn.execute("""SELECT g.id, g.code FROM groups g JOIN seasons s ON s.id=g.season_id
                                       WHERE s.name=? ORDER BY g.id""", (season,)).fetchall()).encode())
        digest = h.hexdigest()
        row = conn.execute("SELECT sha1 FROM raw_imports WHERE path=?", (name,)).fetchone()
        if row and row[0] == digest:
            continue
        report = import_raw(conn, os.path.join(folder, name), log=log)
        if report is None:
            continue
        conn.commit()
        # La huella, con los grupos que han quedado (una temporada nueva los acaba de crear).
        h2 = hashlib.sha1(PORTAL_VERSION.encode() + open(os.path.join(folder, name), "rb").read())
        h2.update(repr(conn.execute("""SELECT g.id, g.code FROM groups g JOIN seasons s ON s.id=g.season_id
                                        WHERE s.name=? ORDER BY g.id""", (season,)).fetchall()).encode())
        conn.execute("INSERT OR REPLACE INTO raw_imports(path, sha1, imported_at) VALUES (?, ?, datetime('now'))",
                     (name, h2.hexdigest()))
        conn.commit()
        log(f"  {name}: {report}")
        reports[name] = report
    return reports


if __name__ == "__main__":
    from db import get_connection
    c = get_connection()
    import_changed_portal(c)
