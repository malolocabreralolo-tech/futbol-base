#!/usr/bin/env python3
"""Verify a season manifest; activate only with --apply, preserving every archive.

Examples and manifest format: docs/temporada-nueva.md. Verification downloads
the actual fixture tables: a new year in a website heading is insufficient.

A group can come from futbolaspalmas.com (its URL is downloaded here) or from
the federation, FIFLP (its URL names CodCompeticion/CodGrupo). FIFLP answers
empty to home IPs, so its tables are scraped in GitHub Actions
(fetch_fiflp_islas.py) and verified here from that raw file: --fiflp-raw.
"""
import argparse
from datetime import date, datetime, timezone
import json
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile
from urllib.parse import parse_qs, urlparse

from db import get_connection, PROJECT_ROOT
from categorias import DB_NAME
from fetch_futbolaspalmas import fetch, parse_all_matches, parse_standings
from portal_config import load_config

SOURCE_HOSTS = ("futbolaspalmas.com", "www.fiflp.com")


def validate_manifest(manifest, current, adding=False):
    """`adding`: grupos nuevos (una fase que la fuente publica a mitad de
    temporada) para la temporada EN CURSO, sin cambiar de temporada."""
    season = manifest.get("season", "")
    if not re.fullmatch(r"20\d{2}-20\d{2}", season):
        raise ValueError("Temporada inválida")
    start, end = map(int, season.split("-"))
    if adding:
        if season != current:
            raise ValueError("Solo se añaden grupos a la temporada en curso")
    elif end != start + 1 or start != int(current.split("-")[1]):
        raise ValueError("Solo se puede activar la temporada inmediatamente siguiente")
    groups = manifest.get("groups", [])
    if not groups:
        raise ValueError("Faltan grupos verificados")
    codes = set()
    for group in groups:
        code = group.get("id", "")
        if not re.fullmatch(r"[A-Z][A-Z0-9_-]{0,19}", code) or code in codes:
            raise ValueError("Los códigos deben ser válidos y únicos entre categorías")
        codes.add(code)
        if group.get("cat") not in DB_NAME:          # benjamin, prebenjamin, alevin
            raise ValueError("Categoría no admitida")
        if group.get("island") not in ["grancanaria", "lanzarote", "fuerteventura"]:
            raise ValueError("Isla no admitida")
        if not group.get("name") or not group.get("phase"):
            raise ValueError("Faltan nombre o fase del grupo")
        parsed = urlparse(group.get("url", ""))
        if parsed.scheme != "https" or parsed.hostname not in SOURCE_HOSTS or parsed.username or parsed.password:
            raise ValueError("La URL debe ser HTTPS de futbolaspalmas.com o de la federación (www.fiflp.com)")
        if parsed.hostname == "www.fiflp.com" and not fiflp_ids(group["url"]):
            raise ValueError("La URL de la federación debe llevar CodCompeticion y CodGrupo")
    if adding:
        return
    team = manifest.get("defaultTeam", {})
    if not team.get("name") or not any(g["id"] == team.get("groupId") and g["cat"] == team.get("cat") for g in groups):
        raise ValueError("El equipo inicial debe pertenecer a uno de los grupos")


def fiflp_ids(url):
    """(CodCompeticion, CodGrupo) de una URL de la federación, o None."""
    query = {k.lower(): v[0] for k, v in parse_qs(urlparse(url).query).items()}
    comp, group = query.get("codcompeticion"), query.get("codgrupo")
    return (comp, group) if comp and group else None


def _iso(day):
    """'03-10-2026' (FIFLP) -> '2026-10-03'; lo que ya es ISO se queda igual."""
    m = re.fullmatch(r"(\d{2})[-/](\d{2})[-/](\d{4})", (day or "").strip())
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else (day or "").strip()


def fiflp_evidence(group, raw, names=None):
    """(rounds, standings) de un grupo de la federación, sacados del raw de
    fetch_fiflp_islas.py con la misma forma que dan los parsers de futbolaspalmas:
    rounds {'Jornada N': [[fecha ISO, local, visitante, gl, gv, hora, campo]]} y
    standings [[pos, equipo, pts, J, G, E, P, GF, GC, DF]]. Si el raw trae el código
    del acta del partido (fiflp_acta, desde octubre de 2026), va como octava columna
    (insert_groups lo guarda: así el bot lee su acta). `names` traduce el
    nombre de FIFLP al que ya usa la base (escudo, histórico, ficha). Antes de la
    primera jornada FIFLP no publica clasificación: sale de los equipos del
    calendario, todo a cero y por orden alfabético."""
    from import_fiflp_cups_2324 import clean_team_name
    from fiflp_names import is_bye
    comp, code = fiflp_ids(group["url"])
    entry = next((g for g in raw if str(g.get("competition_id")) == comp and str(g.get("group_id")) == code), None)
    if entry is None:
        raise ValueError(f'{group["id"]}: la federación no tiene ese grupo en el raw')
    names = names or {}
    name = lambda raw_name: names.get(clean_team_name(raw_name), clean_team_name(raw_name))
    rounds = {}
    for jornada in entry.get("jornadas") or []:
        label = f'Jornada {str(jornada.get("num", "")).strip()}'
        for m in jornada.get("matches") or []:
            home, away = clean_team_name(m.get("home")), clean_team_name(m.get("away"))
            if not home or not away or home == away or is_bye(home) or is_bye(away):
                continue
            both = m.get("hs") is not None and m.get("as") is not None
            rounds.setdefault(label, []).append([
                _iso(m.get("date") or jornada.get("date")), name(home), name(away),
                m.get("hs") if both else None, m.get("as") if both else None,
                (m.get("time") or "") or None, (m.get("venue") or "") or None]
                + ([m["fiflp_acta"]] if m.get("fiflp_acta") else []))
    from fiflp_names import team_key
    crudos = {clean_team_name(t) for t in [r.get("team") for r in entry.get("standings") or []] +
              [m.get(s) for j in entry.get("jornadas") or [] for m in j.get("matches") or [] for s in ("home", "away")]}
    crudos = {t for t in crudos if t and not is_bye(t)}
    if len({(team_key(t)[0], _filial(t)) for t in crudos}) != len({name(t) for t in crudos}):
        raise ValueError(f'{group["id"]}: dos equipos distintos acabarían con el mismo nombre')
    standings = [[r.get("pos"), name(r.get("team")), r.get("pts"), r.get("j"), r.get("g"), r.get("e"),
                  r.get("p"), r.get("gf"), r.get("gc"), r.get("df")]
                 for r in entry.get("standings") or [] if clean_team_name(r.get("team"))]
    if not standings:
        teams = sorted({t for ms in rounds.values() for m in ms for t in (m[1], m[2])})
        standings = [[i, t, 0, 0, 0, 0, 0, 0, 0, 0] for i, t in enumerate(teams, 1)]
    return rounds, standings


def current_round(rounds, today=None):
    """La jornada que la portada debe enseñar: la última con algún resultado y,
    antes de empezar, la primera. La última del calendario no sirve: a principio
    de temporada sería la de mayo."""
    played = [label for label, ms in rounds.items() if any(m[3] is not None for m in ms)]
    return played[-1] if played else next(iter(rounds))


def verify_sources(manifest, fetcher=fetch, fiflp_raw=None, names=None):
    """Return source evidence, or fail before making any database/file writes."""
    start, end = map(int, manifest["season"].split("-"))
    first, last = date(start, 7, 1), date(end, 6, 30)
    evidence = []
    for group in manifest["groups"]:
        if urlparse(group["url"]).hostname == "www.fiflp.com":
            if fiflp_raw is None:
                raise ValueError(f'{group["id"]}: los grupos de la federación se verifican con --fiflp-raw')
            rounds, standings = fiflp_evidence(group, fiflp_raw, names)
        else:
            url = group["url"].rstrip("/") + "/"
            rounds = parse_all_matches(fetcher(url), include_details=True)
            standings = parse_standings(fetcher(url + "mostrar_clasi.php"))
        matches = [m for entries in rounds.values() for m in entries]
        if not standings or not matches:
            raise ValueError(f'{group["id"]}: faltan clasificación o partidos con año verificable')
        if any(not first <= date.fromisoformat(m[0]) <= last for m in matches):
            raise ValueError(f'{group["id"]}: el calendario contiene fechas de otra temporada')
        table = {r[1] for r in standings}
        # Un retirado: la federación lo quita de la tabla y deja sus partidos en el calendario (sin
        # resultado o con 0-3/0-1 administrativos, a veces con acta, como AL20 de 2026-27); la web lo
        # reconoce (model.retiredTeams). Lo que esta comprobación busca es un calendario de otro grupo:
        # entonces casi ningún equipo está en la tabla. Una minoría fuera de ella son retirados.
        outside = {t for m in matches for t in (m[1], m[2]) if t not in table}
        if len(outside) > max(1, len(table) // 3):
            raise ValueError(f'{group["id"]}: calendario y clasificación tienen equipos diferentes')
        default = manifest.get("defaultTeam") or {}
        if group["id"] == default.get("groupId") and default["name"] not in table:
            raise ValueError("El equipo inicial no aparece en la clasificación verificada")
        evidence.append({"group": group, "rounds": rounds, "standings": standings,
                         "current": current_round(rounds)})
    return evidence


def club_id(conn, name):
    """El equipo por su nombre exacto o, si no, el mismo CLUB con otra grafía
    (la clave del contrato C1, que conserva la letra de filial); si no existe,
    se crea. Como db.get_or_create_team, pero sin su commit: la activación
    entera es una sola transacción."""
    from db import _teams_key
    row = conn.execute("SELECT id FROM teams WHERE name=?", (name,)).fetchone()
    if row:
        return row[0]
    key = _teams_key(name)
    if key:
        for tid, existing in conn.execute("SELECT id, name FROM teams").fetchall():
            if _teams_key(existing) == key:
                # El mismo club guardado con la grafía de la federación toma la
                # forma de portal, en todas sus temporadas.
                if not _portal_style(existing) and _portal_style(name):
                    conn.execute("UPDATE teams SET name=? WHERE id=?", (name, tid))
                return tid
    return conn.execute("INSERT INTO teams(name) VALUES(?)", (name,)).lastrowid


def seed_season(conn, manifest, evidence):
    """One transaction, insert-only sporting data. Existing season rows survive."""
    current = conn.execute("SELECT name FROM seasons WHERE is_current=1").fetchall()
    if len(current) != 1:
        raise ValueError("Debe existir una sola temporada actual")
    validate_manifest(manifest, current[0][0])
    if conn.execute("SELECT 1 FROM seasons WHERE name=?", (manifest["season"],)).fetchone():
        raise ValueError("La temporada ya existe; no se sobrescribe")
    if [e["group"] for e in evidence] != manifest["groups"]:
        raise ValueError("La evidencia no corresponde al manifiesto completo")
    start, end = map(int, manifest["season"].split("-"))
    with conn:
        conn.execute("UPDATE seasons SET is_current=0")
        sid = conn.execute("INSERT INTO seasons(name,start_year,end_year,is_current) VALUES(?,?,?,1)",
                           (manifest["season"], start, end)).lastrowid
        insert_groups(conn, sid, evidence)


def add_groups(conn, manifest, evidence):
    """Grupos nuevos en la temporada en curso, en una sola transacción. No toca
    ningún grupo existente: un código que ya está aborta antes de escribir."""
    current = conn.execute("SELECT id, name FROM seasons WHERE is_current=1").fetchall()
    if len(current) != 1:
        raise ValueError("Debe existir una sola temporada actual")
    sid, name = current[0]
    validate_manifest(manifest, name, adding=True)
    if [e["group"] for e in evidence] != manifest["groups"]:
        raise ValueError("La evidencia no corresponde al manifiesto completo")
    taken = {r[0] for r in conn.execute("SELECT code FROM groups WHERE season_id=?", (sid,))}
    clash = sorted(taken & {g["id"] for g in manifest["groups"]})
    if clash:
        raise ValueError(f"Estos códigos ya existen en la temporada: {clash}")
    with conn:
        insert_groups(conn, sid, evidence)


def category_id(conn, key):
    """El id de la categoría de la web ('alevin') en la tabla categories: sin distinguir mayúsculas,
    la fila en mayúsculas si hay dos (la 'prebenjamin' duplicada) y, si falta, se crea en
    mayúsculas ('ALEVIN'). Como db.get_or_create_category, sin su commit: la activación entera
    es una sola transacción."""
    row = conn.execute("SELECT id FROM categories WHERE upper(name)=upper(?) ORDER BY name<>upper(name), id LIMIT 1",
                       (key,)).fetchone()
    if row:
        return row[0]
    if key.lower() not in DB_NAME:
        raise ValueError("Falta la categoría en la base")
    return conn.execute("INSERT INTO categories(name) VALUES(?)", (DB_NAME[key.lower()],)).lastrowid


# Los grupos de la federación recién dados de alta: la primera pasada del bot lee TODAS sus jornadas
# ya jugadas (update_fiflp.full_read_pending), no solo las de las últimas tres semanas, para tener el
# código del acta de cada partido; sin eso, las actas de las primeras jornadas no se leían nunca.
FULL_READ_TABLE = "CREATE TABLE IF NOT EXISTS fiflp_full_pending (group_id INTEGER PRIMARY KEY, since TEXT)"


def insert_groups(conn, sid, evidence):
    """Grupos con su clasificación y su calendario, ya verificados (verify_sources). Los de la
    federación quedan marcados para la lectura completa de la primera pasada del bot."""
    conn.execute(FULL_READ_TABLE)
    for item in evidence:
        g = item["group"]
        cat = category_id(conn, g["cat"])
        gid = conn.execute("""INSERT INTO groups(season_id,category_id,code,name,full_name,phase,island,url,current_jornada)
            VALUES(?,?,?,?,?,?,?,?,?)""", (sid, cat, g["id"], g["name"], g.get("fullName", g["name"]),
            g["phase"], g["island"], g["url"], item.get("current") or next(reversed(item["rounds"])))).lastrowid
        team_ids = {}
        for row in item["standings"]:
            team_ids[row[1]] = club_id(conn, row[1])
            conn.execute("""INSERT INTO standings(group_id,team_id,position,points,played,won,drawn,lost,gf,gc,gd)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)""", (gid, team_ids[row[1]], row[0], *row[2:]))
        for round_name, matches in item["rounds"].items():
            for dt, home, away, hs, away_score, kickoff, venue, *acta in matches:
                # El código del acta, si el raw de la federación lo trae (octava columna de fiflp_evidence).
                extra = ",fiflp_acta" if acta else ""
                for team in (home, away):   # un retirado solo está en el calendario (verify_sources)
                    if team not in team_ids:
                        team_ids[team] = club_id(conn, team)
                conn.execute(f"""INSERT INTO matches(group_id,jornada,date,time,home_team_id,away_team_id,home_score,away_score,
                                                     venue{extra}) VALUES(?,?,?,?,?,?,?,?,?{",?" if acta else ""})""",
                             (gid, round_name, dt, kickoff, team_ids[home], team_ids[away], hs, away_score, venue, *acta[:1]))
        if urlparse(g["url"]).hostname == "www.fiflp.com":
            conn.execute("INSERT OR REPLACE INTO fiflp_full_pending(group_id, since) VALUES (?, date('now'))", (gid,))


# Las plantillas de temporada entera (data-lineups-<S>.js) que precacheaba el SW antes de partir las
# actas por grupo: si un sw.js antiguo aún las lleva, se quitan.
LINEUPS_URL = re.compile(r"\./data-lineups-\d{4}-\d{4}\.js")


def season_files_for(worker, closing, opening):
    """sw.js con SEASON_FILES al activar `opening`: delante, el archivo de la temporada que se cierra
    (data-season-<closing>.js), si no estaba. Las actas, por grupo, no se precachean (el SW conserva las
    ya usadas entre versiones). El resto de sw.js, igual."""
    start = worker.index("const SEASON_FILES = [")
    end = worker.index("];", start) + len("];")
    entries = [url for url in re.findall(r"'([^']+)'", worker[start:end]) if not LINEUPS_URL.fullmatch(url)]
    archive = f"./data-season-{closing}.js"
    if archive not in entries:
        entries.insert(0, archive)
    literal = "const SEASON_FILES = [\n" + "".join(f"  '{url}',\n" for url in entries) + "];"
    return worker[:start] + literal + worker[end:]


def apply_manifest(manifest, evidence, root=Path(PROJECT_ROOT)):
    """Generate in a temporary checkout before replacing any live artifact."""
    import generate_js
    import codigo
    root = Path(root)
    config = load_config(root / "src/config.js")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = root / "backups" / ("temporada-" + stamp)
    backup.mkdir(parents=True, exist_ok=False)
    files = list(root.glob("data-*.js")) + [root / "index.html", root / "sw.js", root / "src/config.js"]
    if (root / "data-health.json").exists():
        files.append(root / "data-health.json")
    for path in files:
        dest = backup / path.relative_to(root)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dest)
    with get_connection(root / "futbolbase.db") as original, sqlite3.connect(backup / "futbolbase.db") as copy:
        original.backup(copy)
    original.close()
    copy.close()
    with tempfile.TemporaryDirectory(prefix="futbol-temporada-") as work:
        stage = Path(work)
        for path in files:
            dest = stage / path.relative_to(root)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, dest)
        shutil.copy2(backup / "futbolbase.db", stage / "futbolbase.db")
        conn = get_connection(stage / "futbolbase.db")
        try:
            seed_season(conn, manifest, evidence)
        finally:
            conn.close()
        sw_path = stage / "sw.js"
        sw_path.write_text(season_files_for(sw_path.read_text(encoding="utf-8"), config["season"], manifest["season"]),
                           encoding="utf-8")
        config.update(season=manifest["season"], defaultTeam=manifest["defaultTeam"],
                      nextSeason=f'{manifest["season"].split("-")[1]}-{int(manifest["season"].split("-")[1]) + 1}')
        (stage / "src/config.js").write_text("export const PORTAL = " + json.dumps(config, ensure_ascii=False, indent=2) + ";\n")
        old_root, old_connection = generate_js.PROJECT_ROOT, generate_js.get_connection
        try:
            generate_js.PROJECT_ROOT = str(stage)
            generate_js.get_connection = lambda: get_connection(stage / "futbolbase.db")
            generate_js.main()
        finally:
            generate_js.PROJECT_ROOT, generate_js.get_connection = old_root, old_connection
        report = {"version": 1, "season": config["season"], "checkedAt": datetime.now(timezone.utc).isoformat(),
                  "lastDataChange": date.today().isoformat(), "nextSeason": {"name": config["nextSeason"], "status": "pending"},
                  "summary": {"ok": len(evidence), "rejected": 0, "error": 0},
                  "groups": {e["group"]["id"]: {"url": e["group"]["url"], "status": "ok", "checkedAt": datetime.now(timezone.utc).isoformat()} for e in evidence}}
        (stage / "data-health.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        artifacts = list(stage.glob("data-*")) + [stage / "index.html", stage / "sw.js", stage / "src/config.js", stage / "futbolbase.db"]
        try:
            for path in artifacts:
                shutil.copy2(path, root / path.relative_to(stage))
            # Las actas que el generador ya no escribe (data-lineups-*, por grupo) se van también del árbol.
            for path in root.glob("data-lineups-*.js"):
                if not (stage / path.name).exists():
                    path.unlink()
        except Exception:
            for path in artifacts:
                relative = path.relative_to(stage)
                if (backup / relative).exists():
                    shutil.copy2(backup / relative, root / relative)
                else:
                    (root / relative).unlink(missing_ok=True)
            raise
    # CODIGO es la huella de src/*.js y acta.css (scripts/codigo.py; Plan B3 decisión 156); --apply
    # acaba de reescribir src/config.js, así que se recalcula aquí con la misma función, o
    # test_rediseno_index.mjs saldría en rojo el día de activar (ronda de arreglos 1, R2-1). root sin el
    # árbol completo (una copia parcial, como la que usan las pruebas que solo comprueban los datos) no
    # tiene nada que recalcular.
    if (root / "acta.css").exists():
        codigo.main(["--root", str(root)])
    return backup


def _filial(name):
    """Letra de filial (B, C…); la A es el primer equipo, como no llevar letra."""
    from fiflp_names import team_key
    letter = team_key(name)[1]
    return "" if letter == "A" else letter


def _portal_style(name):
    """'Carnevali', 'Atl. Angostura'; no 'DANIEL CARNEVALI, C.D. "A"' (federación)."""
    return not ('"' in name or ", " in name or (name == name.upper() and re.search(r"[A-Z]{4}", name)))


_ABBR = re.compile(r"^(?:[A-Z]\.\s?){1,3}$|^(?:CD|CF|UD|AD|SD|FC|CFS|CEF)$")
_ACCENTS = {"ATLETICO": "Atlético", "UNION": "Unión", "LEON": "León", "SUAREZ": "Suárez", "JOSE": "José",
            "MARIA": "María", "GALDAR": "Gáldar", "TIAS": "Tías", "BACHICAN": "Bachicán", "MARTIN": "Martín",
            "LAZARO": "Lázaro", "NICOLAS": "Nicolás", "BARTOLOME": "Bartolomé", "AGUIMES": "Agüimes",
            "MOGAN": "Mogán", "JINAMAR": "Jinámar", "GUIA": "Guía", "BRIGIDA": "Brígida", "MARITIMA": "Marítima",
            "ARGUINEGUIN": "Arguineguín", "VELEZ": "Vélez", "ATHLETICO": "Athlético"}
_SMALL = {"DE", "DEL", "Y"}


def pretty_name(raw):
    """Un nombre de la federación con forma de portal, para los clubes que la base
    no conoce: 'ATLETICO FOMENTO, CLUB "A"' -> 'Atlético Fomento', 'UNION SUR
    YAIZA, C.D. "B"' -> 'Unión Sur Yaiza B', 'CD MIGUEL LEON' -> 'Miguel León'."""
    # La federación escribe la letra entre comillas, a veces dos veces ('X B, C.D. "B"'), con una
    # B de más ('INTERNACIONAL PH D "DB"': el filial D) o entre comillas en medio y suelta al final
    # ('PEÑA DE LA AMISTAD "A", C.D. A').
    quoted = re.findall(r'"([A-H])B?"', raw)
    char = quoted[-1] if quoted else None
    text = re.sub(r'\s*"[A-H]B?"', "", raw.strip()).strip().rstrip(",").strip()
    main_, sep, tail_ = text.partition(", ")
    bare = re.search(r"\s([A-H])$", tail_)
    if not char and bare and len(tail_.split()) > 1:
        char = bare.group(1)
    if char:
        main_ = re.sub(rf"\s+{char}$", "", main_)
        tail_ = re.sub(rf"\s+{char}$", "", tail_) if len(tail_.split()) > 1 else tail_
    text = main_ + sep + tail_
    letter = char if char and char != "A" else ""
    main, _, tail = text.partition(", ")
    # 'C.D.', 'F.C', 'C. F.', 'C.F.S.': letras sueltas con punto, enteras, antes de trocear.
    strip_abbr = lambda t: re.sub(r"(?<![A-Z])(?:[A-Z]\.\s?)+[A-Z]?(?![A-Za-z])", " ", t.upper())
    words = lambda t: [w for w in re.split(r"[\s,]+", strip_abbr(t)) if w and not _ABBR.match(w)]
    lead = [w for w in words(tail) if w not in ("CLUB",)]
    body = words(main)
    if body[:2] == ["DE", "FUTBOL"]:
        body = body[2:]
    tokens = [w for w in lead + body if w != "CLUB"] or words(main)
    out = []
    for i, w in enumerate(tokens):
        if w in _ACCENTS:
            out.append(_ACCENTS[w])
        elif w in _SMALL and i:
            out.append(w.lower())
        else:
            # Con guion, cada parte con mayúscula: 'LAS MAJORERAS-GUAYADEQUE' -> 'Las Majoreras-Guayadeque'.
            out.append("-".join(_ACCENTS.get(p, p.capitalize()) for p in w.split("-")))
    # La abreviatura del final se va entera y deja colgando su preposición: 'PUERTOS DE L.P., C.E.F.' daba
    # 'Puertos de' y 'NATURALEZA VERDE-VALLESECO DE G.C., C.D.', 'Naturaleza Verde-Valleseco de'.
    while len(out) > 1 and out[-1] in {w.lower() for w in _SMALL}:
        out.pop()
    return " ".join(out) + (f" {letter}" if letter else "")


def _same_team(a, b):
    """¿Dos claves de la federación (núcleo, letra) son el mismo equipo escrito de dos formas? La misma
    letra y todas sus palabras emparejadas una a una ('TINAJOB "B"' y 'TINAJO "B"'); no si a uno le sobra
    una palabra: 'FUNDACION GUINIGUADA' y 'GUINIGUADA APOLINARIO', o 'FUNDACION CANARIA U.D. LAS PALMAS' y
    'PALMAS, U.D. LAS', son dos clubes."""
    from fiflp_names import _common
    (core_a, letter_a), (core_b, letter_b) = a, b
    return letter_a == letter_b and len(core_a) == len(core_b) and _common(core_a, core_b) == len(core_a)


def season_fed_names(conn, season):
    """{clave del club (fiflp_names._club_key): {nombres de la base}}: el equipo de la base de cada nombre
    de la federación en las fichas (team_seasons, el directorio de cada grupo) de `season`, como
    import_fiflp_detalle._season_fed_teams. Solo los nombres con forma de portal: una fila con la grafía
    de la federación es un resto, no el nombre del club."""
    from fiflp_names import _club_key
    if not season or not conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='team_seasons'").fetchone():
        return {}
    out = {}
    for name, fed in conn.execute(
            """SELECT t.name, ts.fiflp_name FROM team_seasons ts JOIN teams t ON t.id=ts.team_id
               JOIN seasons s ON s.id=ts.season_id WHERE s.name=? AND ts.fiflp_name IS NOT NULL""", (season,)):
        if _portal_style(name):
            out.setdefault(_club_key(fed), set()).add(name)
    return out


def raw_categories(raw):
    """{nombre limpio de la federación: {categorías de los grupos del raw en que sale}} (None si el grupo
    no la dice)."""
    from import_fiflp_cups_2324 import clean_team_name
    cats = {}
    for entry in raw:
        teams = {clean_team_name(m.get(side)) for j in entry.get("jornadas") or []
                 for m in j.get("matches") or [] for side in ("home", "away")}
        teams |= {clean_team_name(r.get("team")) for r in entry.get("standings") or []}
        for t in teams:
            cats.setdefault(t, set()).add(entry.get("cat") or None)
    return cats


def name_clashes(names, cats=None):
    """[(nombre, [nombres de la federación])] que darían a dos equipos distintos (otra clave de club, que no
    es el mismo escrito de otra forma) de una misma categoría la misma fila de la base. Los dos de la tabla
    revisada a mano no cuentan: es una fusión decidida ('ROQUE AMAGRO-CLARAVISION' y 'CLARAVISION-ROQUE
    AMAGRO'). Con `cats` (raw_categories), dos de categorías distintas tampoco: es el mismo club con otro
    nombre en cada una ('CLARAVISION-ROQUE AMAGRO' en benjamín y 'ROQUE AMAGRO DE GALDAR' en prebenjamín)."""
    from fiflp_names import _club_key, fed_alias
    cats = cats or {}
    shared = lambda a, b: (not cats or {c for n in a for c in cats.get(n, {None})} &
                           {c for n in b for c in cats.get(n, {None})})
    by_name = {}
    for raw_name, name in names.items():
        by_name.setdefault(name, []).append(raw_name)
    clashes = []
    for name, raws in sorted(by_name.items()):
        keys = {}
        for raw_name in raws:
            keys.setdefault(_club_key(raw_name), []).append(raw_name)
        groups = list(keys.items())
        bad = [(a, b) for i, a in enumerate(groups) for b in groups[i + 1:]
               if not _same_team(a[0], b[0]) and not all(fed_alias(n) == name for n in a[1] + b[1])
               and shared(a[1], b[1])]
        if bad:
            clashes.append((name, sorted(raws)))
    return clashes


def known_names(raw, conn, years=None, keep_existing=False, season=None):
    """{nombre limpio de FIFLP: nombre que ya usa la base}. Un club que vuelve
    conserva su nombre, su escudo y su histórico; lo que no casa se queda con su
    nombre de FIFLP (mejor un nombre feo que fundir dos clubes).

    Se busca en los equipos de las temporadas de `years` (años de inicio, en ese
    orden); por defecto, primero la temporada que se cierra y después la
    anterior (la última de la base y la de antes). Con `keep_existing`, un nombre
    que ya es de un equipo de la base no se pasa a forma de portal (al activar,
    club_id renombra esa fila; en una temporada pasada no se toca). La letra de filial manda: 'ARGUINEGUIN, C.D. "C"' no es
    'Arguineguín' (el emparejamiento por tokens lo admitía con penalización);
    si la base no tiene ese filial, se nombra como su primer equipo más la
    letra ('Arguineguín C'). Y si el primer equipo del club es nuevo, su filial
    también: 'BACHICAN LAS MESAS "B"' no es 'Las Mesas B' (UD Las Mesas).

    Un nombre de la base es, en cada categoría, de un solo club: el que ya se lo ha llevado (por la
    ficha, por la tabla revisada o en una pasada anterior) no se lo deja a otro de su categoría
    ('FUNDACION GUINIGUADA' no es Guiniguada, que es GUINIGUADA APOLINARIO); en otra categoría, sí (el mismo
    club con otro nombre: 'CLARAVISION-ROQUE AMAGRO' en benjamín y 'ROQUE AMAGRO DE GALDAR' en
    prebenjamín son Roque Amagro). Y un filial va con su club: si su primer equipo es Las Mesas Hu., 'MESAS
    HURACAN, U.D. LAS "B"' no es 'Huracán B' (el B de AD Huracán), sino 'Las Mesas Hu. B'.

    `season`: la temporada cuyas fichas (team_seasons) mandan; la activación pasa la que está en curso
    (raw_team_names): al añadir una fase, la misma; al activar la siguiente, la que se cierra. El club que
    juega en ella con el mismo nombre de la federación es esa fila: 'VICTORIA, REAL CLUB "A"' es 'RC
    Victoria', como en benjamín y prebenjamín de 2025-27, no 'Victoria' (2014-25, la de la tabla
    revisada). Sin `season` (import_fiflp_grupos, que rehace temporadas pasadas), la tabla y las palabras."""
    from import_fiflp_cups_2324 import clean_team_name
    from fiflp_names import _club_key as club, canonical_names, fed_alias, is_bye, team_key, team_score, MIN_TEAM_SCORE

    if years is None:
        top = conn.execute("SELECT max(start_year) FROM seasons").fetchone()[0]
        years = [top, top - 1]

    def pool(year):
        return [r[0] for r in conn.execute(
            """SELECT DISTINCT t.name FROM teams t JOIN standings st ON st.team_id=t.id
               JOIN groups g ON g.id=st.group_id JOIN seasons s ON s.id=g.season_id
               WHERE s.start_year = ?""", (year,))]

    # Un equipo no cambia de isla: un nombre de la base que solo ha jugado en
    # otra isla no es este equipo ('Internacional B' de Lanzarote no es el
    # filial de un club de Gran Canaria).
    base_islands = {}
    for name, island in conn.execute(
            """SELECT DISTINCT t.name, g.island FROM teams t JOIN standings st ON st.team_id=t.id
               JOIN groups g ON g.id=st.group_id WHERE g.island IS NOT NULL"""):
        base_islands.setdefault(name, set()).add(island)
    islands = {}
    for entry in raw:
        teams = {clean_team_name(m.get(side)) for j in entry.get("jornadas") or []
                 for m in j.get("matches") or [] for side in ("home", "away")}
        teams |= {clean_team_name(r.get("team")) for r in entry.get("standings") or []}
        for t in teams:
            islands.setdefault(t, set()).add(entry.get("island") or "grancanaria")
    crudos = sorted(n for n in islands if n and not is_bye(n))
    cats = raw_categories(raw)

    def fits(n, canon):
        return (_filial(canon) == _filial(n) and
                (canon not in base_islands or base_islands[canon] & islands[n]))

    names = {n: n for n in crudos}
    # Lo que no se empareja por palabras: la ficha de la federación de la misma temporada (lo que ya
    # usan las otras categorías) y, si no, los nombres de la federación revisados a mano
    # (fiflp_team_names.json), que mandan sobre el emparejamiento: el club que se fundió o renombró no
    # vuelve con otra grafía al rehacer un grupo.
    by_card = season_fed_names(conn, season)
    fixed, aliased = {}, set()
    for n in crudos:
        card = by_card.get(club(n), set())
        if len(card) == 1 and fits(n, next(iter(card))):
            fixed[n] = next(iter(card))
        elif fed_alias(n):
            fixed[n] = fed_alias(n)
            aliased.add(n)
    names.update(fixed)
    # Cada nombre de la base, de un solo club en cada categoría: el que ya tiene dueño en ella no es de
    # otro club de esa categoría ({nombre de la base: [(clave del club, categorías)] de quien lo tiene}); sí
    # del mismo equipo escrito de otra forma ('MESAS B, U.D. LAS "B"' y 'MESAS "B", U.D. LAS "B"'). Sin
    # categoría (los grupos de import_fiflp_grupos), como siempre: nunca se aparta.
    taken = {}

    def take(canon, raw_names):
        for n in raw_names:
            taken.setdefault(canon, []).append((club(n), frozenset(c for c in cats.get(n, ()) if c)))

    def free(canon, key, kinds):
        return all(_same_team(key, holder) or not (held & kinds) for holder, held in taken.get(canon, []))

    for n, canon in fixed.items():
        take(canon, [n])

    # Primeros equipos y filiales por separado: el emparejamiento es uno a uno,
    # y un filial que se llevara el nombre del primer equipo lo dejaría sin él.
    # 'CHATUR SAN FERNANDO "A"' en un grupo y 'CHATUR SAN FERNANDO' en otro son
    # el mismo equipo: se emparejan juntos, o solo uno se llevaría el nombre de
    # la base y el club quedaría partido en dos.
    stem = lambda n: re.sub(r',?\s*"A"\s*$', "", n).strip()
    firsts_subset = [n for n in crudos if not _filial(n) and n not in fixed]
    for subset in (firsts_subset, [n for n in crudos if _filial(n) and n not in fixed]):
        variants = {}
        for n in subset:
            variants.setdefault(stem(n), []).append(n)
        rest = sorted(variants)
        filial = subset is not firsts_subset
        # La base arrastra el mismo club con dos grafías ('Carnevali' y 'DANIEL
        # CARNEVALI, C.D. "A"'): primero los nombres del portal y solo después
        # los que quedaron con la grafía de la federación. Y un primer equipo
        # solo se busca entre primeros equipos; un filial, entre filiales.
        passes = [(year, nice) for nice in (True, False) for year in years]
        for year, nice in passes:
            candidates = [c for c in pool(year) if bool(_filial(c)) == filial and (not nice or _portal_style(c))]
            kinds = lambda key: frozenset(c for n in variants[key] for c in cats.get(n, ()) if c)
            unnamed = lambda key: names[variants[key][0]] == variants[key][0]

            def assign(keys, local):
                """Empareja `keys` con `local` (uno a uno, el mejor par primero) y les pone el nombre si encaja
                y está libre en sus categorías; devuelve las que casaron con uno que ya es de otro club."""
                found, refused = canonical_names(keys, [], local), []
                for key in keys:
                    canon = found.get(key, key)
                    if canon == key or not all(fits(n, canon) for n in variants[key]):
                        continue
                    if not free(canon, club(variants[key][0]), kinds(key)):
                        refused.append(key)
                        continue
                    for n in variants[key]:
                        names[n] = canon
                    take(canon, variants[key])
                return refused

            # Isla por isla y antes de emparejar: un equipo de otra isla que empataba se llevaba el sitio y,
            # descartado después, dejaba al bueno sin nombre ('PUERTOS DE L.P., C.E.F.' empataba con Puerto
            # del Carmen, de Lanzarote, y Puertos LP se quedaba fuera: salía 'Puertos de'). Los que casan con
            # un nombre que ya es de otro club de su categoría lo intentan otra vez sin los ocupados.
            for island in sorted({i for key in rest for n in variants[key] for i in islands[n]}):
                keys = [k for k in rest if unnamed(k) and any(island in islands[n] for n in variants[k])]
                local = [c for c in candidates if c not in base_islands or island in base_islands[c]]
                for key in assign(keys, local):
                    if unnamed(key):
                        assign([key], [c for c in local if free(c, club(variants[key][0]), kinds(key))])
            rest = [key for key in rest if unnamed(key)]
    # El mismo equipo escrito de dos formas que no comparten clave ('TINAJOB "B"' en la tabla y 'TINAJO
    # "B"' en el calendario): el que quedó sin nombre toma el del otro.
    for n in crudos:
        if names[n] == n:
            twin = next((m for m in crudos if names[m] != m and _same_team(club(n), club(m))
                         and islands[n] & islands[m]), None)
            if twin:
                names[n] = names[twin]

    firsts = [n for n in crudos if not _filial(n)]
    every = {r[0] for r in conn.execute("SELECT name FROM teams")}
    for n in crudos:
        letter = _filial(n)
        if not letter or n in fixed:
            continue
        core = team_key(n)[0]
        own = [f for f in firsts if team_key(f)[0] == core and islands[f] & islands[n]]
        same = {names[f] for f in own}
        near = [f for f in firsts if team_score((core, ""), (team_key(f)[0], "")) >= MIN_TEAM_SCORE]
        # Un filial va con su club. Si su primer equipo ya tiene nombre de la base, el filial es el de su
        # familia si la base lo tiene ('Las Mesas Hu.' → 'Las Mesas Hu. B') y, si no, el que ha casado solo
        # si es del mismo club: 'Huracán B' y 'AD Huracán C' son de AD Huracán, no de Las Mesas Hu. Si su
        # primer equipo es nuevo, su filial también. La familia no sale de un nombre de la tabla revisada:
        # esa fila puede ser la de otras temporadas ('Victoria', 2014-25; ahora 'RC Victoria' y 'RC Victoria B').
        if len(same) == 1:
            first = next(iter(same))
            family = f"{first} {letter}"
            if (first not in firsts and family in every and fits(n, family)
                    and not any(f in aliased for f in own)):
                names[n] = family
            elif names[n] != n and (first in firsts or team_score(
                    (team_key(first)[0], ""), (team_key(names[n])[0], "")) < MIN_TEAM_SCORE):
                names[n] = n
        if not same and near and all(names[f] == f for f in near):
            names[n] = n                      # primer equipo nuevo: su filial también
        elif (names[n] == n and len(same) == 1 and next(iter(same)) not in firsts
              and _portal_style(next(iter(same)))):
            names[n] = f"{next(iter(same))} {letter}"
    # Lo que no casa con la base va con forma de portal; el filial de un club
    # nuevo, como su primer equipo más la letra. Solo el que ha salido de pretty_name: el que ya tiene
    # su fila (por la ficha, la tabla revisada o el emparejamiento) se queda con ella aunque se llame
    # como su pretty_name ('ATALAYA, U.D. "B"' es 'Atalaya B', no 'UD Atalaya B', una fila que no existe).
    existing = {r[0] for r in conn.execute("SELECT name FROM teams")} if keep_existing else set()
    pretty = set()
    for n in crudos:
        if n not in fixed and not _portal_style(names[n]) and names[n] not in existing:
            names[n] = pretty_name(names[n])
            pretty.add(n)
    for n in pretty:
        letter = _filial(n)
        core = team_key(n)[0]
        near = [f for f in firsts if team_score((core, ""), (team_key(f)[0], "")) >= MIN_TEAM_SCORE]
        if (letter and names[n] == pretty_name(n) and len({names[f] for f in near}) == 1
                and _portal_style(names[near[0]])):
            names[n] = f"{names[near[0]]} {letter}"
    return names


def raw_team_names(raw, conn, current):
    """{nombre de la federación: nombre de la base} de los equipos del raw, para activar la temporada
    siguiente o añadir una fase a la que está en curso (`current`, la de src/config.js: la que se cierra
    o la misma). Las fichas de la federación de `current` (team_seasons) mandan sobre la tabla revisada y
    sobre el emparejamiento: son la última palabra de qué fila es cada club. Sin ellas, al activar
    2027-28 la tabla volvía a llevar 'VICTORIA, REAL CLUB "A"' a 'Victoria' (la fila de 2014-25; desde
    2025-26 es 'RC Victoria') y su B a 'RC Victoria B', partiendo el club, y 'ATCO MARZASPORT, C.D.' a
    'Atco. Marzasport' en vez de 'Atl. Marzasport'. Aborta si dos equipos distintos acabarían con el mismo
    nombre: dentro de un grupo lo comprueba fiflp_evidence; entre grupos, aquí (dos clubes en la misma fila
    de teams, que comparten todas las categorías, mezclan sus fichas)."""
    names = known_names(raw, conn, season=current)
    clashes = name_clashes(names, raw_categories(raw))
    if clashes:
        raise ValueError("Dos equipos distintos acabarían con el mismo nombre: " +
                         "; ".join(f"{name} ← {', '.join(raws)}" for name, raws in clashes))
    return names


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--apply", action="store_true", help="activar tras verificar; crea copia y genera primero en temporal")
    parser.add_argument("--fiflp-raw", type=Path, help="raw de fetch_fiflp_islas.py para los grupos de la federación")
    parser.add_argument("--add", action="store_true",
                        help="añadir los grupos del manifiesto a la temporada EN CURSO (fase nueva); con --apply escribe")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    current = load_config()["season"]
    validate_manifest(manifest, current, adding=args.add)
    raw = names = None
    if args.fiflp_raw:
        raw = json.loads(args.fiflp_raw.read_text())
        conn = get_connection()
        try:
            # Con --add y sin él: las fichas de la temporada en curso (la misma, o la que se cierra).
            names = raw_team_names(raw, conn, current)
        finally:
            conn.close()
    evidence = verify_sources(manifest, fiflp_raw=raw, names=names)
    print(f'{manifest["season"]}: {len(evidence)} grupos verificados con calendarios fechados.')
    if args.add and args.apply:
        import generate_js
        backup = Path(PROJECT_ROOT) / "backups" / ("grupos-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
        backup.mkdir(parents=True)
        conn = get_connection()
        try:
            with sqlite3.connect(backup / "futbolbase.db") as copy:
                conn.backup(copy)
            add_groups(conn, manifest, evidence)
        finally:
            conn.close()
        generate_js.main()
        print(f"Grupos añadidos. Copia de la base: {backup}")
    elif args.apply:
        print(f"Temporada activada. Copia anterior: {apply_manifest(manifest, evidence)}")
    else:
        print("Solo comprobación. No se ha modificado la base ni la configuración.")


if __name__ == "__main__":
    main()
