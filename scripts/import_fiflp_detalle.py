#!/usr/bin/env python3
"""import_fiflp_detalle.py — El detalle de la federación que descarga
detalle-federacion.yml (fetch_fiflp_detalle.py), en la base:

  standings_detail  (grupo, equipo): partidos en casa y fuera, últimos resultados,
                    puntos de sanción y código del equipo en la federación, de la
                    clasificación detallada.
  team_seasons      (equipo, temporada): código y nombre en la federación, escudo,
                    colores de la equipación (camiseta, pantalón y medias) y campo
                    (código, nombre y superficie), del directorio de equipos.
  venue_details     (código de campo): coordenadas, dirección, localidad, código
                    postal, superficie, foto, instalaciones y equipos que juegan o
                    entrenan allí, de la ficha del campo.
  matches           el calendario completo (resultado, fecha, hora, campo) de los
                    grupos que no tienen ningún partido: los de las temporadas en
                    las que la federación no publica actas (2016-17 a 2018-19),
                    solo las de CALENDAR_SEASONS.
  groups            las finales, semifinales y copas de las temporadas archivadas
                    que no tienen clasificación ni actas, desde su calendario
                    (create_cup_group; quedan en detalle_groups).

Cada grupo de la federación se casa con el de la base igual que sus goleadores:
por la URL (los de la temporada en curso), por el grupo que creó
import_fiflp_grupos, por sus actas o por sus equipos (match_group); y sus
equipos, con team_bridge (la fila de la clasificación oficial, el nombre y el
puesto). Un equipo del directorio es el de la clasificación con su mismo código.

El bot llama a import_changed_detalle: solo los raws cuya huella (sha1 del raw,
de los de goleadores y de los grupos de la temporada) ha cambiado.
"""
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_fiflp_cups_2324 import clean_team_name  # noqa: E402

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_FILE = re.compile(r"^fiflp_detalle_(\d{4}-\d{4})_raw\.json$")
CAMPOS_FILE = "fiflp_campos_raw.json"
# En la huella: subirla reimporta el detalle de todas las temporadas. 2: finales y copas de las
# archivadas (create_cup_group), calendarios de 2016-19 y fichas rehechas tras fix_positions.
DETALLE_VERSION = "2"
# Temporadas cuyo calendario (jornadas del raw) entra en los grupos sin partidos. Solo las que se han
# revisado en local y tienen su línea base de score_deviation al día: un marcador mal leído en otra
# dejaría la prueba en rojo y al bot sin publicar. 2016-19 (revisadas el 7/10/2026): las ligas y
# copas de Lanzarote y Fuerteventura, sin un partido hasta ahora (2.480 partidos, sin desvío nuevo);
# los de los retirados entran, como en el resto de temporadas.
CALENDAR_SEASONS = ("2016-2017", "2017-2018", "2018-2019")

SCHEMA = (
    """CREATE TABLE IF NOT EXISTS standings_detail (
        group_id     INTEGER NOT NULL REFERENCES groups(id),
        team_id      INTEGER NOT NULL REFERENCES teams(id),
        fiflp_code   INTEGER,
        home_played  INTEGER, home_won INTEGER, home_drawn INTEGER, home_lost INTEGER,
        away_played  INTEGER, away_won INTEGER, away_drawn INTEGER, away_lost INTEGER,
        sanction     INTEGER NOT NULL DEFAULT 0,
        form         TEXT,
        PRIMARY KEY (group_id, team_id))""",
    """CREATE TABLE IF NOT EXISTS team_seasons (
        team_id      INTEGER NOT NULL REFERENCES teams(id),
        season_id    INTEGER NOT NULL REFERENCES seasons(id),
        fiflp_code   INTEGER,
        fiflp_name   TEXT,
        crest_url    TEXT,
        shirt        TEXT, shorts TEXT, socks TEXT,
        venue_code   INTEGER, venue_name TEXT, surface TEXT,
        PRIMARY KEY (team_id, season_id))""",
    """CREATE TABLE IF NOT EXISTS detalle_groups (
        group_id  INTEGER PRIMARY KEY REFERENCES groups(id),
        season_id INTEGER NOT NULL, comp TEXT NOT NULL, grupo TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS venue_details (
        code         INTEGER PRIMARY KEY,
        name         TEXT, lat REAL, lon REAL,
        address      TEXT, city TEXT, province TEXT, postal_code TEXT,
        surface      TEXT, photo TEXT,
        fenced       INTEGER, doping_room INTEGER, referee_room INTEGER, internet INTEGER,
        teams        TEXT, training TEXT, fetched TEXT)""",
)


def migrate(conn):
    for sql in SCHEMA:
        conn.execute(sql)


def _load(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _flag(value):
    return None if value is None else int(bool(value))


def import_campos(conn, folder=SCRIPTS_DIR):
    """venue_details desde fiflp_campos_raw.json. Devuelve cuántas fichas."""
    raw = _load(os.path.join(folder, CAMPOS_FILE), {})
    n = 0
    for code, f in raw.items():
        if not f.get("ok"):
            continue
        conn.execute(
            """INSERT OR REPLACE INTO venue_details(code, name, lat, lon, address, city, province,
                   postal_code, surface, photo, fenced, doping_room, referee_room, internet,
                   teams, training, fetched)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (int(code), f.get("name"), f.get("lat"), f.get("lon"), f.get("address"), f.get("city"),
             f.get("province"), f.get("postal_code"), f.get("surface"), f.get("photo"),
             _flag(f.get("fenced")), _flag(f.get("doping_room")), _flag(f.get("referee_room")),
             _flag(f.get("internet")), json.dumps(f.get("teams") or [], ensure_ascii=False),
             json.dumps(f.get("training") or [], ensure_ascii=False), f.get("fetched")))
        n += 1
    return n


def by_url(conn, season_id, comp, grupo):
    """El grupo de la temporada en curso dado de alta con la URL de la federación."""
    from activate_season import fiflp_ids
    for gid, url in conn.execute("SELECT id, url FROM groups WHERE season_id=? AND url LIKE '%fiflp.com%'",
                                 (season_id,)):
        if fiflp_ids(url) == (str(comp), str(grupo)):
            return gid
    return None


def matching_entry(det, gol):
    """Lo que necesitan match_group y team_bridge: la clasificación y los
    goleadores del raw de goleadores si lo hay (el camino probado), y si no, la
    clasificación del detalle."""
    standings = [{k: r.get(k) for k in ("pos", "team", "pts", "j", "g", "e", "p", "gf", "gc")}
                 for r in det.get("clasificacion") or []]
    gol = gol or {}
    return {"comp": det["comp"], "grupo": det["grupo"], "comp_name": det.get("comp_name", ""),
            "grupo_name": det.get("grupo_name", ""), "ok": True,
            "standings": gol.get("standings") or standings, "scorers": gol.get("scorers") or []}


def _team_ids(conn):
    return {name: tid for tid, name in conn.execute("SELECT id, name FROM teams")}


def _group_team_names(conn, gid):
    from import_fiflp_goleadores import _db_groups_one
    return sorted(_db_groups_one(conn, gid))


def resolve_names(conn, season_id, gid, entry, fed_names, archived):
    """{nombre de la federación limpio: nombre de la base} de los equipos de un
    grupo: team_bridge y, para lo que quede (retirados que no salen en la
    clasificación), lo mismo que los goleadores de una archivada."""
    from import_fiflp_goleadores import team_bridge, _retired_names
    bridge = team_bridge(conn, gid, entry)
    out = {n: bridge[n] for n in fed_names if n in bridge}
    loose = [n for n in fed_names if n not in out]
    if loose:
        known = set(bridge.values()) | set(_group_team_names(conn, gid))
        from fiflp_names import match_teams
        pairs = match_teams(loose, sorted(known - set(out.values())))
        out.update(pairs)
        loose = [n for n in loose if n not in out]
    if loose and archived:
        from fiflp_names import fed_words
        words = fed_words(loose, [r[0] for r in conn.execute("SELECT name FROM teams")])
        rows = _retired_names(conn, season_id, [(None, n) for n in loose], set(), words)
        out.update({n: r[1] for n, r in zip(loose, rows)})
    return out


def write_standings_detail(conn, gid, rows):
    """standings_detail de un grupo: [(nombre en la base, fila de parse_clasificacion)]. Solo los
    equipos que están en el grupo; las filas anteriores del grupo se sustituyen."""
    migrate(conn)
    ids = _team_ids(conn)
    group_teams = set(_group_team_names(conn, gid))
    conn.execute("DELETE FROM standings_detail WHERE group_id=?", (gid,))
    n = 0
    for name, r in rows:
        tid = ids.get(name)
        if not tid or name not in group_teams:
            continue
        home, away = r.get("home") or {}, r.get("away") or {}
        conn.execute(
            """INSERT OR REPLACE INTO standings_detail(group_id, team_id, fiflp_code, home_played, home_won,
                   home_drawn, home_lost, away_played, away_won, away_drawn, away_lost, sanction, form)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (gid, tid, r.get("codequipo"), home.get("j"), home.get("g"), home.get("e"), home.get("p"),
             away.get("j"), away.get("g"), away.get("e"), away.get("p"), r.get("sanction") or 0,
             r.get("form") or None))
        n += 1
    return n


def write_group(conn, season_id, gid, det, entry, archived, log=print, calendar=False):
    """standings_detail, team_seasons y (si el grupo no tiene partidos) su
    calendario. Devuelve (filas de detalle, equipos con ficha, partidos nuevos)."""
    from update_fiflp import write_round, reconcile_with_table, current_round
    from fiflp_names import is_bye
    rows = det.get("clasificacion") or []
    directory = det.get("directorio") or []
    rounds = det.get("jornadas") or {}
    by_code = {r["codequipo"]: clean_team_name(r["team"]) for r in rows if r.get("codequipo")}
    fed_names = set(by_code.values())
    fed_names |= {clean_team_name(t["team"]) for t in directory}
    for ms in rounds.values():
        for m in ms:
            fed_names |= {clean_team_name(m.get("home")), clean_team_name(m.get("away"))}
    fed_names = sorted(n for n in fed_names - {""} if not is_bye(n))
    names = resolve_names(conn, season_id, gid, entry, fed_names, archived)
    ids = _team_ids(conn)
    group_teams = set(_group_team_names(conn, gid))

    detail = write_standings_detail(conn, gid, [(names.get(clean_team_name(r["team"])), r) for r in rows
                                                 if r.get("home")])

    cards = 0
    for t in directory:
        name = names.get(by_code.get(t.get("codequipo")) or clean_team_name(t["team"]))
        tid = ids.get(name)
        if not tid or name not in group_teams:
            continue
        conn.execute(
            """INSERT OR REPLACE INTO team_seasons(team_id, season_id, fiflp_code, fiflp_name, crest_url,
                   shirt, shorts, socks, venue_code, venue_name, surface)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (tid, season_id, t.get("codequipo"), t.get("team"), t.get("crest"), t.get("shirt"),
             t.get("shorts"), t.get("socks"), t.get("venue_code"), t.get("venue"), t.get("surface")))
        cards += 1

    new = 0
    has_matches = conn.execute("SELECT 1 FROM matches WHERE group_id=? LIMIT 1", (gid,)).fetchone()
    if rounds and has_matches and calendar:
        added, scores, fixed = complete_group(conn, gid, rounds, names, log)
        new += added
        if added or scores or fixed:
            log(f"    grupo {gid}: del calendario, {added} partidos que faltaban, {scores} resultados y "
                f"{fixed} marcadores que cuadran mejor con la clasificación")
    elif rounds and calendar:
        for label, ms in rounds.items():
            clean = []
            for m in ms:
                home, away = clean_team_name(m.get("home")), clean_team_name(m.get("away"))
                if not home or not away or home == away or is_bye(home) or is_bye(away):
                    continue
                if home not in names or away not in names:
                    log(f"    sin nombre en la base: {home} – {away}")
                    continue
                clean.append({"home": names[home], "away": names[away], "hs": m.get("hs"), "as": m.get("as"),
                              "date": m.get("date") or "", "time": m.get("time") or "",
                              "venue": m.get("venue") or "", "fiflp_acta": m.get("fiflp_acta")})
            new += write_round(conn, gid, label, clean, log)[0]
        reconcile_with_table(conn, gid, log)
        current = current_round(conn, gid)
        if current:
            conn.execute("UPDATE groups SET current_jornada=? WHERE id=?", (current, gid))
    return detail, cards, new


def _label_like(conn, gid, label):
    """La jornada del calendario ('Jornada 7') como las del grupo: '7' si las suyas son números."""
    m = re.fullmatch(r"Jornada (\d+)", label or "")
    labels = [r[0] for r in conn.execute("SELECT DISTINCT jornada FROM matches WHERE group_id=?", (gid,))]
    if m and labels and all(str(x).isdigit() for x in labels):
        return m.group(1)
    return label


def complete_group(conn, gid, rounds, names, log=print):
    """Lo que le falta a un grupo que ya tiene partidos, del calendario de la federación: el resultado
    de un partido sin acta que no lo tiene (y su fecha, hora o campo si faltan) y el partido que no
    está, entre dos equipos de su clasificación. Solo los cruces (local, visitante) que salen una vez
    en el calendario y como mucho una en la base: una liga a más vueltas o un cruce escrito de dos
    formas no se toca. Un marcador sin acta que el calendario da distinto (los del archivo del portal
    difieren en un 3-5 %) se cambia solo si con el del calendario los goles cuadran mejor con la
    clasificación oficial: de uno en uno, el que más baja el desvío, mientras baje. Devuelve
    (partidos nuevos, resultados puestos, marcadores corregidos)."""
    from fiflp_names import is_bye
    from score_deviation import group_deviation
    ids = _team_ids(conn)
    table = {r[0] for r in conn.execute("SELECT team_id FROM standings WHERE group_id=?", (gid,))}
    cal = {}
    for label, ms in rounds.items():
        for m in ms:
            home, away = clean_team_name(m.get("home")), clean_team_name(m.get("away"))
            if not home or not away or is_bye(home) or is_bye(away):
                continue
            h, a = ids.get(names.get(home)), ids.get(names.get(away))
            if h and a and h != a:
                cal.setdefault((h, a), []).append((label, m))
    db = {}
    for row in conn.execute("""SELECT id, home_team_id, away_team_id, home_score, away_score, date, time, venue,
                                      cod_acta FROM matches WHERE group_id=?""", (gid,)):
        db.setdefault((row[1], row[2]), []).append(row)
    new = scores = 0
    for pair, found in sorted(cal.items()):
        if len(found) != 1 or len(db.get(pair, [])) > 1:
            continue
        label, m = found[0]
        hs, as_ = m.get("hs"), m.get("as")
        played = hs is not None and as_ is not None
        if pair in db:
            mid, _, _, old_hs, old_as, date, time, venue, cod_acta = db[pair][0]
            fields = {}
            if played and old_hs is None and old_as is None and not cod_acta:
                fields.update(home_score=hs, away_score=as_)
            for key, old in (("date", date), ("time", time), ("venue", venue)):
                if not old and m.get(key):
                    fields[key] = m[key]
            if fields:
                conn.execute(f"UPDATE matches SET {', '.join(f'{k}=?' for k in fields)} WHERE id=?",
                             (*fields.values(), mid))
                scores += "home_score" in fields
        elif pair[0] in table and pair[1] in table:
            conn.execute("""INSERT INTO matches(group_id, jornada, date, time, home_team_id, away_team_id,
                                                home_score, away_score, venue, fiflp_acta)
                            VALUES (?,?,?,?,?,?,?,?,?,?)""",
                         (gid, _label_like(conn, gid, label), m.get("date") or None, m.get("time") or None,
                          pair[0], pair[1], hs if played else None, as_ if played else None,
                          m.get("venue") or None, m.get("fiflp_acta")))
            new += 1
    other = {}
    for pair, found in cal.items():
        if len(found) != 1 or len(db.get(pair, [])) != 1:
            continue
        m = found[0][1]
        mid, _, _, old_hs, old_as, _, _, _, cod_acta = db[pair][0]
        if cod_acta or old_hs is None or old_as is None or m.get("hs") is None or m.get("as") is None:
            continue
        if (m["hs"], m["as"]) != (old_hs, old_as):
            other[mid] = (m["hs"], m["as"])
    fixed = 0
    while other:
        before = group_deviation(conn, gid)["dev"]
        dev, mid = min((group_deviation(conn, gid, {mid: score})["dev"], mid) for mid, score in other.items())
        if dev >= before:
            break
        hs, as_ = other.pop(mid)
        conn.execute("UPDATE matches SET home_score=?, away_score=? WHERE id=?", (hs, as_, mid))
        fixed += 1
    return new, scores, fixed


def _season_fed_teams(conn, season_id):
    """{clave del club (fiflp_names._club_key): {equipo de la base}} de los nombres de la federación
    de las fichas de la temporada (team_seasons)."""
    from fiflp_names import _club_key
    out = {}
    for team, fed in conn.execute("""SELECT t.name, ts.fiflp_name FROM team_seasons ts JOIN teams t ON t.id=ts.team_id
                                     WHERE ts.season_id=? AND ts.fiflp_name IS NOT NULL""", (season_id,)):
        out.setdefault(_club_key(fed), set()).add(team)
    return out


def create_cup_group(conn, season_id, season, det, log=print):
    """El grupo de una final, una semifinal o una copa de una temporada archivada que la base no
    tiene (sin clasificación ni actas, así que import_fiflp_grupos no lo crea): su calendario del
    raw (las jornadas que baja detalle-federacion.yml para 2016-17 a 2018-19), con los equipos de
    esa temporada. Cada nombre se busca primero por su ficha de la temporada (team_seasons, el mismo
    club y la misma letra) y si no, por parecido (canonical_names); el que no casa se salta: no se
    inventan equipos. Código, fase e isla de su competición (meta_by_name: LZ1F, BC, PCC, CFVF…);
    si el código ya existe, nada. Un grupo con todos los resultados a 0-0 y sin actas no los
    registró (la Copa de Campeones prebenjamín de 2018-19): sus partidos entran sin resultado.
    Queda en detalle_groups. Devuelve los partidos que escribe."""
    from db import get_or_create_category, get_or_create_group
    from fiflp_names import _club_key, canonical_names, is_bye
    from import_fiflp_grupos import meta_by_name, group_number
    from update_fiflp import write_round, current_round
    rounds = det.get("jornadas") or {}
    played = [m for ms in rounds.values() for m in ms if m.get("hs") is not None and m.get("as") is not None]
    meta = meta_by_name(det.get("comp_name"))
    if not played or not meta:
        return 0
    prefix, phase, island = meta
    code = f"{prefix}{group_number(det.get('grupo_name'))}"
    category = "PREBENJAMIN" if "PREBENJAMIN" in (det.get("comp_name") or "").upper().replace("Í", "I") else "BENJAMIN"
    cat_id = get_or_create_category(conn, category)
    if conn.execute("SELECT 1 FROM groups WHERE season_id=? AND category_id=? AND code=?",
                    (season_id, cat_id, code)).fetchone():
        return 0
    season_teams = sorted({r[0] for r in conn.execute(
        """SELECT t.name FROM standings st JOIN teams t ON t.id=st.team_id JOIN groups g ON g.id=st.group_id
           WHERE g.season_id=?""", (season_id,))})
    names = sorted({clean_team_name(m.get(k)) for ms in rounds.values() for m in ms for k in ("home", "away")} - {""})
    names = [n for n in names if not is_bye(n)]
    fed = _season_fed_teams(conn, season_id)
    guessed = canonical_names(names, [], season_teams)

    def team(name):
        hits = fed.get(_club_key(name)) or set()
        return next(iter(hits)) if len(hits) == 1 else guessed.get(name)

    unrecorded = all(m["hs"] == 0 and m["as"] == 0 and not m.get("fiflp_acta") for m in played)
    clean = []
    for label, ms in rounds.items():
        for m in ms:
            home, away = team(clean_team_name(m.get("home"))), team(clean_team_name(m.get("away")))
            if home not in season_teams or away not in season_teams or home == away:
                continue
            hs, as_ = (None, None) if unrecorded else (m.get("hs"), m.get("as"))
            clean.append((label, {"home": home, "away": away, "hs": hs, "as": as_,
                                  "date": m.get("date") or "", "time": m.get("time") or "",
                                  "venue": m.get("venue") or "", "fiflp_acta": m.get("fiflp_acta")}))
    if not clean:
        return 0
    gid = get_or_create_group(conn, season_id, cat_id, code, name=det.get("grupo_name", "").title() or None,
                              full_name=det.get("comp_name"), phase=phase, island=island, url=None)
    new = 0
    for label in dict.fromkeys(lbl for lbl, _ in clean):
        new += write_round(conn, gid, label, [m for lbl, m in clean if lbl == label], log)[0]
    current = current_round(conn, gid)
    if current:
        conn.execute("UPDATE groups SET current_jornada=? WHERE id=?", (current, gid))
    conn.execute("INSERT OR REPLACE INTO detalle_groups(group_id, season_id, comp, grupo) VALUES (?,?,?,?)",
                 (gid, season_id, str(det["comp"]), str(det["grupo"])))
    log(f"    {season} {code} ({phase}): grupo nuevo con {new} partidos"
        + (" (sin resultados registrados)" if unrecorded else ""))
    return new


def import_raw(conn, path, log=print, calendar_seasons=None):
    """Importa un fiflp_detalle_<S>_raw.json. Devuelve el resumen."""
    calendar_seasons = CALENDAR_SEASONS if calendar_seasons is None else calendar_seasons
    from import_fiflp_goleadores import match_group
    from import_fiflp_grupos import ARCHIVE_SEASONS
    season = RAW_FILE.match(os.path.basename(path)).group(1)
    report = {"groups": 0, "unmatched": 0, "detail": 0, "cards": 0, "matches": 0}
    row = conn.execute("SELECT id FROM seasons WHERE name=?", (season,)).fetchone()
    if not row:
        return report
    season_id = row[0]
    folder = os.path.dirname(path)
    raw = _load(path, {})
    gol = _load(os.path.join(folder, f"fiflp_goleadores_{season}_raw.json"), {})
    index = _load(os.path.join(folder, f"fiflp_actas_{season}_index.json"), {})
    if isinstance(index, list):
        index = {str(e["cod_acta"]): e for e in index}
    archived = season in ARCHIVE_SEASONS
    claimed, cups = set(), []
    for key in sorted(k for k in raw if not k.startswith("_")):
        det = raw[key]
        if not det.get("ok"):
            continue
        entry = matching_entry(det, gol.get(key))
        owned = conn.execute("SELECT group_id FROM detalle_groups WHERE season_id=? AND comp=? AND grupo=?",
                             (season_id, str(det["comp"]), str(det["grupo"]))).fetchone()
        if owned:
            continue                      # una final o copa que ya creó create_cup_group
        gid = by_url(conn, season_id, det["comp"], det["grupo"]) or match_group(conn, season_id, index, entry)
        if not gid and archived:
            cups.append(det)              # después: sus equipos se buscan en las fichas de la temporada
            continue
        if not gid or gid in claimed:
            report["unmatched"] += 1
            continue
        claimed.add(gid)
        detail, cards, new = write_group(conn, season_id, gid, det, entry, archived, log,
                                         calendar=season in calendar_seasons)
        report["groups"] += 1
        report["detail"] += detail
        report["cards"] += cards
        report["matches"] += new
    for det in cups:
        created = create_cup_group(conn, season_id, season, det, log)
        report["matches"] += created
        report["unmatched"] += 0 if created else 1
    conn.commit()
    return report


def _digest(conn, folder, name, season, calendars):
    """La huella del detalle de una temporada: el raw, el de goleadores, la de sus grupos de la
    federación y la del archivo del portal (que reescribe los partidos de sus grupos: hay que volver
    a pasar el calendario), y sus grupos con los equipos de la clasificación (uno nuevo, uno
    renombrado)."""
    h = hashlib.sha1(DETALLE_VERSION.encode() + repr(season in calendars).encode())
    for part in (name, f"fiflp_goleadores_{season}_raw.json"):
        p = os.path.join(folder, part)
        if os.path.exists(p):
            with open(p, "rb") as f:
                h.update(f.read())
    for key in (f"grupos:{season}", f"wayback_portal_{season}_raw.json"):
        stored = conn.execute("SELECT sha1 FROM raw_imports WHERE path=?", (key,)).fetchone()
        h.update(stored[0].encode() if stored else b"")
    h.update(repr(conn.execute("""SELECT g.id, group_concat(t.name) FROM groups g JOIN seasons s ON s.id=g.season_id
                                   LEFT JOIN standings st ON st.group_id=g.id LEFT JOIN teams t ON t.id=st.team_id
                                   WHERE s.name=? GROUP BY g.id ORDER BY g.id""", (season,)).fetchall()).encode())
    return h.hexdigest()


def import_changed_detalle(conn, folder=SCRIPTS_DIR, log=print, calendar_seasons=None):
    """import_raw de cada fiflp_detalle_<S>_raw.json cuya huella haya cambiado, y
    las fichas de los campos. La de una temporada que no está en la base (una
    archivada que aún no ha dado de alta import_fiflp_grupos) se salta sin grabar
    su huella."""
    migrate(conn)
    conn.execute("""CREATE TABLE IF NOT EXISTS raw_imports (
        path TEXT PRIMARY KEY, sha1 TEXT NOT NULL, imported_at TEXT NOT NULL)""")
    reports = {}
    campos_path = os.path.join(folder, CAMPOS_FILE)
    if os.path.exists(campos_path):
        with open(campos_path, "rb") as f:
            digest = hashlib.sha1(DETALLE_VERSION.encode() + f.read()).hexdigest()
        row = conn.execute("SELECT sha1 FROM raw_imports WHERE path=?", (CAMPOS_FILE,)).fetchone()
        if not row or row[0] != digest:
            n = import_campos(conn, folder)
            conn.execute("INSERT OR REPLACE INTO raw_imports(path, sha1, imported_at) VALUES (?, ?, datetime('now'))",
                         (CAMPOS_FILE, digest))
            conn.commit()
            log(f"  {CAMPOS_FILE}: {n} fichas de campo")
            reports[CAMPOS_FILE] = n
    for name in sorted(os.listdir(folder)):
        m = RAW_FILE.match(name)
        if not m:
            continue
        season = m.group(1)
        if not conn.execute("SELECT 1 FROM seasons WHERE name=?", (season,)).fetchone():
            continue
        calendars = CALENDAR_SEASONS if calendar_seasons is None else calendar_seasons
        row = conn.execute("SELECT sha1 FROM raw_imports WHERE path=?", (name,)).fetchone()
        if row and row[0] == _digest(conn, folder, name, season, calendars):
            continue
        report = import_raw(conn, os.path.join(folder, name), log=log, calendar_seasons=calendars)
        # La huella, con lo que ha quedado tras importar (las finales y copas que acaba de crear).
        conn.execute("INSERT OR REPLACE INTO raw_imports(path, sha1, imported_at) VALUES (?, ?, datetime('now'))",
                     (name, _digest(conn, folder, name, season, calendars)))
        conn.commit()
        log(f"  {name}: {report['groups']} grupos ({report['unmatched']} sin pareja), {report['detail']} filas "
            f"de casa/fuera, {report['cards']} fichas de equipo, {report['matches']} partidos del calendario")
        reports[name] = report
    return reports


if __name__ == "__main__":
    from db import get_connection
    c = get_connection()
    import_changed_detalle(c)
