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
        if group.get("cat") not in ["benjamin", "prebenjamin"]:
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
    standings [[pos, equipo, pts, J, G, E, P, GF, GC, DF]]. `names` traduce el
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
                (m.get("time") or "") or None, (m.get("venue") or "") or None])
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
        if any(m[1] not in table or m[2] not in table for m in matches):
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


def insert_groups(conn, sid, evidence):
    """Grupos con su clasificación y su calendario, ya verificados (verify_sources)."""
    for item in evidence:
        g = item["group"]
        cat = conn.execute("SELECT id FROM categories WHERE lower(name)=?", (g["cat"],)).fetchone()
        if not cat:
            raise ValueError("Falta la categoría en la base")
        gid = conn.execute("""INSERT INTO groups(season_id,category_id,code,name,full_name,phase,island,url,current_jornada)
            VALUES(?,?,?,?,?,?,?,?,?)""", (sid, cat[0], g["id"], g["name"], g.get("fullName", g["name"]),
            g["phase"], g["island"], g["url"], item.get("current") or next(reversed(item["rounds"])))).lastrowid
        team_ids = {}
        for row in item["standings"]:
            team_ids[row[1]] = club_id(conn, row[1])
            conn.execute("""INSERT INTO standings(group_id,team_id,position,points,played,won,drawn,lost,gf,gc,gd)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)""", (gid, team_ids[row[1]], row[0], *row[2:]))
        for round_name, matches in item["rounds"].items():
            for dt, home, away, hs, away_score, kickoff, venue in matches:
                conn.execute("""INSERT INTO matches(group_id,jornada,date,time,home_team_id,away_team_id,home_score,away_score,venue)
                    VALUES(?,?,?,?,?,?,?,?,?)""", (gid, round_name, dt, kickoff, team_ids[home], team_ids[away], hs, away_score, venue))


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
    quoted = re.search(r'"([B-H])"\s*$', raw)       # la federación la escribe entre comillas
    letter = quoted.group(1) if quoted else ""
    text = re.sub(r',?\s*"[A-H]"\s*$', "", raw.strip()).strip()
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
            out.append(w.capitalize())
    return " ".join(out) + (f" {letter}" if letter else "")


def known_names(raw, conn, years=None):
    """{nombre limpio de FIFLP: nombre que ya usa la base}. Un club que vuelve
    conserva su nombre, su escudo y su histórico; lo que no casa se queda con su
    nombre de FIFLP (mejor un nombre feo que fundir dos clubes).

    Se busca en los equipos de las temporadas de `years` (años de inicio, en ese
    orden); por defecto, primero la temporada que se cierra y después la
    anterior (la última de la base y la de antes). La letra de filial manda: 'ARGUINEGUIN, C.D. "C"' no es
    'Arguineguín' (el emparejamiento por tokens lo admitía con penalización);
    si la base no tiene ese filial, se nombra como su primer equipo más la
    letra ('Arguineguín C'). Y si el primer equipo del club es nuevo, su filial
    también: 'BACHICAN LAS MESAS "B"' no es 'Las Mesas B' (UD Las Mesas)."""
    from import_fiflp_cups_2324 import clean_team_name
    from fiflp_names import canonical_names, is_bye, team_key, team_score, MIN_TEAM_SCORE

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

    def fits(n, canon):
        return (_filial(canon) == _filial(n) and
                (canon not in base_islands or base_islands[canon] & islands[n]))

    # Primeros equipos y filiales por separado: el emparejamiento es uno a uno,
    # y un filial que se llevara el nombre del primer equipo lo dejaría sin él.
    # 'CHATUR SAN FERNANDO "A"' en un grupo y 'CHATUR SAN FERNANDO' en otro son
    # el mismo equipo: se emparejan juntos, o solo uno se llevaría el nombre de
    # la base y el club quedaría partido en dos.
    stem = lambda n: re.sub(r',?\s*"A"\s*$', "", n).strip()
    names = {n: n for n in crudos}
    firsts_subset = [n for n in crudos if not _filial(n)]
    for subset in (firsts_subset, [n for n in crudos if _filial(n)]):
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
            found = canonical_names(rest, [], candidates)
            for key in rest:
                if found.get(key, key) != key and all(fits(n, found[key]) for n in variants[key]):
                    for n in variants[key]:
                        names[n] = found[key]
            rest = [key for key in rest if names[variants[key][0]] == variants[key][0]]

    firsts = [n for n in crudos if not _filial(n)]
    for n in crudos:
        letter = _filial(n)
        if not letter:
            continue
        core = team_key(n)[0]
        same = {names[f] for f in firsts if team_key(f)[0] == core}
        near = [f for f in firsts if team_score((core, ""), (team_key(f)[0], "")) >= MIN_TEAM_SCORE]
        if not same and near and all(names[f] == f for f in near):
            names[n] = n                      # primer equipo nuevo: su filial también
        elif names[n] == n and len(same) == 1 and next(iter(same)) not in firsts:
            names[n] = f"{next(iter(same))} {letter}"
    # Lo que no casa con la base va con forma de portal; el filial de un club
    # nuevo, como su primer equipo más la letra.
    for n in crudos:
        if not _portal_style(names[n]):
            names[n] = pretty_name(names[n])
    for n in crudos:
        letter = _filial(n)
        core = team_key(n)[0]
        near = [f for f in firsts if team_score((core, ""), (team_key(f)[0], "")) >= MIN_TEAM_SCORE]
        if letter and names[n] == pretty_name(n) and len({names[f] for f in near}) == 1:
            names[n] = f"{names[near[0]]} {letter}"
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
    validate_manifest(manifest, load_config()["season"], adding=args.add)
    raw = names = None
    if args.fiflp_raw:
        raw = json.loads(args.fiflp_raw.read_text())
        conn = get_connection()
        try:
            names = known_names(raw, conn)
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
