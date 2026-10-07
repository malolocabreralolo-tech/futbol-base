#!/usr/bin/env python3
"""import_fp_app.py — Lo que trae la app de futbolaspalmas (fetch_fp_app.py), en la base.

Tablas propias (todo lo que da la app, tal cual):
  fp_ligas    (liga_id): el grupo de la base con el que casa, jornadas, y qué
              significa cada zona de la tabla (plazas y texto de ascenso,
              playoff, copa, promoción y descenso).
  fp_teams    (fp_team_id): el equipo de la base, escudo, equipación (imagen con
              los colores de camiseta, pantalón y medias), banderas y sanciones.
  fp_matches  (fp_id): el partido de la base, estado (finalizado, aplazado,
              suspendido, retirado…), fecha prevista, hora real de inicio, campo
              y su enlace al mapa, marcador, goleadores (minuto y nombre de pila),
              penaltis, árbitros y técnicos.
  fp_goals    (fp_id, lado, minuto, nombre): los goleadores ya separados.

Y en las tablas de siempre, solo lo que falta: el resultado de un partido
finalizado que la base aún no tiene (la federación lo publica días después) y la
hora de los que no la tienen. Nunca cambia un marcador que ya está.

Cada liga se casa con un grupo de la temporada en curso de la misma categoría
por sus equipos (group_overlap, al menos 0,6 y sin empate); los equipos, con
canonical_names contra los del grupo.
"""
import hashlib
import json
import os
import re
import sys
from html import unescape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_FILE = re.compile(r"^fp_app_(\d{4}-\d{4})_raw\.json$")
FP_VERSION = "1"
MIN_OVERLAP = 0.6

SCHEMA = (
    """CREATE TABLE IF NOT EXISTS fp_ligas (
        liga_id      INTEGER PRIMARY KEY,
        season_id    INTEGER NOT NULL REFERENCES seasons(id),
        group_id     INTEGER REFERENCES groups(id),
        name         TEXT, tipo TEXT, total_jornadas INTEGER, jornada_actual INTEGER,
        plazas_ascenso INTEGER, plazas_playoff INTEGER, plazas_copa INTEGER,
        plazas_promocion INTEGER, plazas_descenso INTEGER,
        texto_ascenso TEXT, texto_playoff TEXT, texto_copa TEXT, texto_promocion TEXT, texto_descenso TEXT,
        fetched      TEXT)""",
    """CREATE TABLE IF NOT EXISTS fp_teams (
        fp_team_id   INTEGER PRIMARY KEY,
        liga_id      INTEGER NOT NULL,
        team_id      INTEGER REFERENCES teams(id),
        name         TEXT, escudo TEXT, equipacion TEXT, banderas TEXT,
        sanciones    INTEGER)""",
    """CREATE TABLE IF NOT EXISTS fp_matches (
        fp_id        INTEGER PRIMARY KEY,
        liga_id      INTEGER NOT NULL,
        match_id     INTEGER REFERENCES matches(id),
        jornada      INTEGER, estado TEXT, fecha_programada TEXT, hora_inicio TEXT,
        local        TEXT, visitante TEXT,
        estadio      TEXT, campo_gps TEXT, latitud REAL, longitud REAL,
        goles_local  INTEGER, goles_visitante INTEGER,
        goleadores_local TEXT, goleadores_visitante TEXT,
        penaltis_local TEXT, penaltis_visitante TEXT, motivo_aplazado TEXT,
        arbitro TEXT, asistente1 TEXT, asistente2 TEXT,
        tecnico_local TEXT, tecnico_visitante TEXT, fase_eliminatoria TEXT)""",
    """CREATE INDEX IF NOT EXISTS idx_fp_matches_match ON fp_matches(match_id)""",
    """CREATE TABLE IF NOT EXISTS fp_goals (
        fp_id        INTEGER NOT NULL REFERENCES fp_matches(fp_id),
        side         TEXT NOT NULL CHECK(side IN ('h','a')),
        minute       INTEGER,
        name         TEXT,
        ord          INTEGER NOT NULL)""",
    """CREATE INDEX IF NOT EXISTS idx_fp_goals_fp ON fp_goals(fp_id)""",
)


def migrate(conn):
    for sql in SCHEMA:
        conn.execute(sql)


_GOAL = re.compile(r"^\s*(\d+)\s*'?\s*-\s*(.+?)\s*$")


def parse_goleadores(text):
    """"22&#039; - Adrian \\r\\n45&#039; - Zullivan" -> [(22, 'Adrian'), (45, 'Zullivan')].
    Una línea sin minuto entra con minuto None."""
    out = []
    for line in re.split(r"[\r\n]+", unescape(text or "")):
        line = line.strip()
        if not line:
            continue
        m = _GOAL.match(line)
        if m:
            out.append((int(m.group(1)), m.group(2).strip()))
        else:
            out.append((None, line.lstrip("-– ").strip()))
    return [(mn, name) for mn, name in out if name]


def _category(name):
    fold = (name or "").upper().replace("Í", "I").replace(" ", "")
    return "PREBENJAMIN" if "PREBENJAMIN" in fold else "BENJAMIN"


def _season_groups(conn, season_id, category):
    """{group_id: [equipos]} de la temporada y categoría (clasificación y calendario)."""
    from import_fiflp_goleadores import _db_groups
    return _db_groups(conn, season_id, category)


def match_liga(conn, season_id, liga):
    """El grupo de la base de una liga de la app: el que más equipos comparte
    (al menos MIN_OVERLAP de la más pequeña), sin empate."""
    from fiflp_names import group_overlap
    teams = [t.get("nombre") for t in liga.get("tabla") or [] if t.get("nombre")]
    if len(teams) < 3:
        return None
    scored = sorted(((group_overlap(teams, names), gid)
                     for gid, names in _season_groups(conn, season_id, _category(liga.get("name"))).items()),
                    reverse=True)
    if not scored or scored[0][0] < MIN_OVERLAP or (len(scored) > 1 and scored[1][0] == scored[0][0]):
        return None
    return scored[0][1]


def _team_map(conn, season_id, gid, fp_names):
    from fiflp_names import canonical_names
    from import_fiflp_goleadores import _db_groups_one
    group_teams = sorted(_db_groups_one(conn, gid))
    mapping = canonical_names(fp_names, group_teams, [])
    ids = {name: tid for tid, name in conn.execute("SELECT id, name FROM teams")}
    # Solo los que han casado con un equipo del grupo: un nombre suelto no crea equipos.
    return {n: ids[mapping[n]] for n in fp_names if mapping.get(n) in group_teams and mapping[n] in ids}


def _find_match(conn, gid, home_id, away_id, jornada, day):
    rows = conn.execute("""SELECT id, jornada, date FROM matches WHERE group_id=? AND home_team_id=?
                           AND away_team_id=?""", (gid, home_id, away_id)).fetchall()
    if len(rows) <= 1:
        return rows[0][0] if rows else None
    num = lambda j: int(re.sub(r"\D", "", str(j or "")) or 0)
    same = [r for r in rows if num(r[1]) == int(jornada or 0)]
    if len(same) == 1:
        return same[0][0]
    same = [r for r in rows if (r[2] or "")[:10] == (day or "")[:10]]
    return same[0][0] if len(same) == 1 else None


def import_raw(conn, path, log=print):
    season = RAW_FILE.match(os.path.basename(path)).group(1)
    report = {"ligas": 0, "sin_grupo": 0, "partidos": 0, "resultados": 0, "horas": 0, "goles": 0}
    row = conn.execute("SELECT id FROM seasons WHERE name=?", (season,)).fetchone()
    if not row:
        return report
    season_id = row[0]
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    team_of = {}   # (liga, nombre en la app) -> team_id
    group_of = {}
    for liga_id, liga in sorted(raw.get("ligas", {}).items()):
        gid = match_liga(conn, season_id, liga)
        meta = liga.get("meta") or {}
        conn.execute("""INSERT OR REPLACE INTO fp_ligas(liga_id, season_id, group_id, name, tipo, total_jornadas,
                            jornada_actual, plazas_ascenso, plazas_playoff, plazas_copa, plazas_promocion,
                            plazas_descenso, texto_ascenso, texto_playoff, texto_copa, texto_promocion,
                            texto_descenso, fetched)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                     (int(liga_id), season_id, gid, liga.get("name"), meta.get("tipo_competicion"),
                      meta.get("total_jornadas"), meta.get("jornada_actual"), meta.get("plazas_ascenso"),
                      meta.get("plazas_playoff"), meta.get("plazas_copa"), meta.get("plazas_promocion"),
                      meta.get("plazas_descenso"), meta.get("texto_ascenso"), meta.get("texto_playoff"),
                      meta.get("texto_copa"), meta.get("texto_promocion"), meta.get("texto_descenso"),
                      liga.get("fetched")))
        if not gid:
            report["sin_grupo"] += 1
            log(f"    sin grupo en la base: {liga.get('name')}")
            continue
        report["ligas"] += 1
        group_of[str(liga_id)] = gid
        names = sorted({t.get("nombre") for t in liga.get("tabla") or [] if t.get("nombre")}
                       | {p.get(k) for p in raw.get("partidos", {}).values() if str(p.get("liga_id")) == str(liga_id)
                          for k in ("local", "visitante") if p.get(k)})
        mapping = _team_map(conn, season_id, gid, names)
        for n, tid in mapping.items():
            team_of[(str(liga_id), n)] = tid
        conn.execute("DELETE FROM fp_teams WHERE liga_id=?", (int(liga_id),))
        for t in liga.get("tabla") or []:
            conn.execute("""INSERT OR REPLACE INTO fp_teams(fp_team_id, liga_id, team_id, name, escudo, equipacion,
                                banderas, sanciones) VALUES (?,?,?,?,?,?,?,?)""",
                         (t.get("id"), int(liga_id), mapping.get(t.get("nombre")), t.get("nombre"), t.get("escudo"),
                          t.get("equipacion"), t.get("banderas"), t.get("sanciones")))
    for fp_id, p in sorted(raw.get("partidos", {}).items(), key=lambda kv: int(kv[0])):
        liga_id = str(p.get("liga_id"))
        gid = group_of.get(liga_id)
        home_id, away_id = team_of.get((liga_id, p.get("local"))), team_of.get((liga_id, p.get("visitante")))
        mid = _find_match(conn, gid, home_id, away_id, p.get("jornada"), p.get("fecha_programada")) \
            if gid and home_id and away_id else None
        conn.execute("""INSERT OR REPLACE INTO fp_matches(fp_id, liga_id, match_id, jornada, estado, fecha_programada,
                            hora_inicio, local, visitante, estadio, campo_gps, latitud, longitud, goles_local,
                            goles_visitante, goleadores_local, goleadores_visitante, penaltis_local,
                            penaltis_visitante, motivo_aplazado, arbitro, asistente1, asistente2, tecnico_local,
                            tecnico_visitante, fase_eliminatoria)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                     (int(fp_id), int(liga_id), mid, p.get("jornada"), p.get("estado"), p.get("fecha_programada"),
                      p.get("hora_inicio"), p.get("local"), p.get("visitante"), p.get("estadio"),
                      p.get("campo_gps") or None, p.get("campo_latitud"), p.get("campo_longitud"),
                      p.get("goles_local"), p.get("goles_visitante"), p.get("goleadores_local") or None,
                      p.get("goleadores_visitante") or None, p.get("penaltis_local") or None,
                      p.get("penaltis_visitante") or None, p.get("motivo_aplazado") or None,
                      p.get("arbitro_principal_nombre"), p.get("asistente1_nombre"), p.get("asistente2_nombre"),
                      p.get("tecnico_local"), p.get("tecnico_visitante"), p.get("fase_eliminatoria") or None))
        conn.execute("DELETE FROM fp_goals WHERE fp_id=?", (int(fp_id),))
        ord_ = 0
        for side, key in (("h", "goleadores_local"), ("a", "goleadores_visitante")):
            for minute, name in parse_goleadores(p.get(key)):
                conn.execute("INSERT INTO fp_goals(fp_id, side, minute, name, ord) VALUES (?,?,?,?,?)",
                             (int(fp_id), side, minute, name, ord_))
                ord_ += 1
                report["goles"] += 1
        if not mid:
            continue
        report["partidos"] += 1
        hs, as_, mtime = conn.execute("SELECT home_score, away_score, time FROM matches WHERE id=?", (mid,)).fetchone()
        if p.get("estado") == "finalizado" and hs is None and p.get("goles_local") is not None \
                and p.get("goles_visitante") is not None:
            conn.execute("UPDATE matches SET home_score=?, away_score=? WHERE id=?",
                         (int(p["goles_local"]), int(p["goles_visitante"]), mid))
            report["resultados"] += 1
        when = (p.get("fecha_programada") or "")[11:16]
        if not mtime and re.fullmatch(r"\d{2}:\d{2}", when) and when != "00:00":
            conn.execute("UPDATE matches SET time=? WHERE id=?", (when, mid))
            report["horas"] += 1
    conn.commit()
    return report


def import_changed_fp_app(conn, folder=SCRIPTS_DIR, log=print):
    """import_raw de cada fp_app_<S>_raw.json cuya huella haya cambiado."""
    migrate(conn)
    conn.execute("""CREATE TABLE IF NOT EXISTS raw_imports (
        path TEXT PRIMARY KEY, sha1 TEXT NOT NULL, imported_at TEXT NOT NULL)""")
    reports = {}
    for name in sorted(os.listdir(folder)):
        if not RAW_FILE.match(name):
            continue
        with open(os.path.join(folder, name), "rb") as f:
            content = f.read()
        season = RAW_FILE.match(name).group(1)
        teams = conn.execute("""SELECT g.id, group_concat(st.team_id) FROM groups g JOIN seasons s ON s.id=g.season_id
                                LEFT JOIN standings st ON st.group_id=g.id WHERE s.name=? GROUP BY g.id""",
                             (season,)).fetchall()
        digest = hashlib.sha1(FP_VERSION.encode() + content + repr(teams).encode()).hexdigest()
        row = conn.execute("SELECT sha1 FROM raw_imports WHERE path=?", (name,)).fetchone()
        if row and row[0] == digest:
            continue
        report = import_raw(conn, os.path.join(folder, name), log=log)
        conn.execute("INSERT OR REPLACE INTO raw_imports(path, sha1, imported_at) VALUES (?, ?, datetime('now'))",
                     (name, digest))
        conn.commit()
        log(f"  {name}: {report['ligas']} ligas ({report['sin_grupo']} sin grupo), {report['partidos']} partidos "
            f"casados, {report['resultados']} resultados y {report['horas']} horas nuevas, {report['goles']} goles")
        reports[name] = report
    return reports


if __name__ == "__main__":
    from db import get_connection
    c = get_connection()
    import_changed_fp_app(c)
