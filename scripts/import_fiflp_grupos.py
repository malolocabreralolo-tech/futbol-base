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

Las temporadas archivadas (ARCHIVE_SEASONS, 2016-17 a 2020-21) no están en la
base hasta que llegan sus fuentes: import_season da de alta cada una junto con
su primer grupo, y solo cuando ha terminado la descarga de sus actas
(actas_complete, la regla de actas-federacion.yml para pasar a la temporada
siguiente); si al final no crea ningún grupo, la borra. Sus grupos son todos de
la federación: el código, la fase y la isla salen, si no hay otra cosa, del
nombre de su competición (meta_by_name), y los nombres de sus equipos pasan
antes por fiflp_names.modern_fed_name (los formatos de 2017-2021) y prefieren
los de 2021 en adelante a los que haya inventado otra archivada.
"""
import hashlib
import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import (get_or_create_category, get_or_create_group, get_or_create_season, get_or_create_team,  # noqa: E402
                delete_group_matches)
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

# Las temporadas archivadas de la federación (CodTemporada 12 a 16): import_season da de alta cada una
# con su primer grupo, cuando ha terminado la descarga de sus actas. La lista es cerrada: un raw suelto
# de otra temporada no da de alta nada. 2015-16 no tiene benjamín ni prebenjamín en la federación.
ARCHIVE_SEASONS = ("2016-2017", "2017-2018", "2018-2019", "2019-2020", "2020-2021")
ARCHIVE_YEARS = {int(s[:4]) for s in ARCHIVE_SEASONS}
# Nombre de la federación ya modernizado (fiflp_names.modern_fed_name) → nombre de la base: lo que
# known_names no acierta en las archivadas, tras revisar la lista de sus equipos nuevos (también los
# goleadores de un equipo retirado, import_fiflp_goleadores._retired_names).
ARCHIVE_NAMES = {
    # Clubes distintos que known_names fundía con otro por compartir palabras.
    'SIETE PALMAS, A.D. "A"': "Siete Palmas",                 # no UD Las Palmas
    'SIETE PALMAS, A.D. "B"': "Siete Palmas B",
    "APOLINARIO C.F.": "Apolinario",                          # no Guiniguada Apolinario
    "POLIGONO DE ARINAGA, C.F.": "Polígono de Arinaga",       # no CD Arinaga
    'GRAN TARAJAL SOC. TAMAS., U.D. "A"': "Gran Tarajal",     # no UD Tarajalejo
    # En 2016-17, «G. TARAJAL»: known_names lo llevaba a UD Tarajalejo y a este, a Gran Tarajal.
    'G. TARAJAL SOC. TAMAS., U.D. "A"': "Gran Tarajal",
    'G. TARAJAL SOC. TAMAS., U.D. "B"': "Gran Tarajal B",
    "TARAJALEJO, U.D.": "UD Tarajalejo",
    'GRAN TARAJAL SOC. TAMAS., U.D. "B"': "Gran Tarajal B",
    "SPORTING ARBOL BONITO, C.F.": "Sporting Árbol Bonito",   # no Real Sporting (San José)
    "VEG. ARBOL BONITO, C.F.": "Veg. Árbol Bonito",
    # El primer equipo y el «Atlético» del mismo club, que team_key y la clave del contrato C1 no
    # distinguen (ATLETICO es ruido): como en la base, 'San Juan' y 'San Juan At.'.
    "SAN JUAN TRES PALMAS, C.D.": "San Juan",
    'SAN JUAN TRES PALMAS, C.D. "A"': "San Juan",
    "SAN JUAN TRES PALMAS ATCO., C.D.": "San Juan At.",
    "SAN JUAN TRES PALMAS ATLETICO, C.D.": "San Juan At.",
    "COLEGIO NORTE VIERA, C.D.": "Colegio Norte Viera",
    'COLEGIO NORTE VIERA, C.D. "A"': "Colegio Norte Viera",
    "COLEGIO NORTE VIERA ATLETICO, C.D.": "Colegio Norte Viera At.",
    # El mismo club con otro nombre: Cruz de Barrial Balompié es UD Barrial desde 2018-19 (ese año, ya
    # en prebenjamín); Football Project, con su patrocinador.
    "CRUZ DE BARRIAL BALOMPIE, C.D.": "UD Barrial",
    'CRUZ DE BARRIAL BALOMPIE, C.D. "A"': "UD Barrial",
    'CRUZ DE BARRIAL BALOMPIE, C.D. "B"': "UD Barrial B",
    "FOOTBALL PROJECT-FUND GRUBE, C.D.": "Football Project",
    # U.D. Las Mesas con otro patrocinador: Bachicao hasta 2019-20 y Huracán desde 2020-21, que ocupa su
    # plaza de Preferente, nunca los dos en una temporada; su B se llama igual en 2018-19 y en 2021-24
    # ('MESAS B, U.D. LAS "B"'). Sin esto, el B iba detrás del primer equipo, nuevo para known_names.
    "MESAS BACHICAO, U.D. LAS": "Las Mesas Hu.",
    'MESAS BACHICAO, U.D. LAS "A"': "Las Mesas Hu.",
    'MESAS, U.D. LAS "B"': "Las Mesas B",
    # Las tildes que pretty_name no sabe poner, y el retirado de 2020-21 con el nombre de la base.
    "SAGRADO CORAZON, C.D.": "Sagrado Corazón",
    "ARGUINEGUIN SANTA AGUEDA, C.D.": "Arguineguín Santa Águeda",
    'ORIENTACION MARITIMA, C.D. "A"': "O. Marítima",
    # Retirados de Lanzarote que solo salen en el calendario (import_fiflp_detalle): pretty_name
    # partía «VEGA» en «VEG A» y dejaba «Juventud» a secas.
    "AZULGRANAS DE SANTA MARÍA DE LA VEGA, C.D.": "CD Azulgranas",
    "AZULGRANAS DE SANTA MARÍA DE LA VEG A, C.D.": "CD Azulgranas",
    "JUVENTUD P.H., C.D.": "Juventud P.H.",
}

# Equipos que known_names o un import antiguo cruzaron en la clasificación de un grupo cerrado,
# comprobados con la de la federación (raw de detalle, la misma posición): {(temporada, código):
# {posición: nombre en la base}}. Van por posición, que en un grupo cerrado ya no se mueve: repetirlo
# no deshace nada. Los aplica fix_positions, en el bot después de los grupos; con uno nuevo, subir
# import_fiflp_detalle.DETALLE_VERSION, que rehace las fichas de la temporada que borra.
POSITION_FIXES = {
    # 'TARAJALEJO, U.D.' es UD Tarajalejo y 'G. TARAJAL SOC. TAMAS.' (A y B), Gran Tarajal: al revés.
    ("2016-2017", "FV13"): {4: "UD Tarajalejo", 9: "Gran Tarajal B", 10: "Gran Tarajal"},
    ("2016-2017", "CFV1"): {3: "Gran Tarajal"},
    ("2016-2017", "CFV2"): {1: "UD Tarajalejo", 6: "Gran Tarajal B"},
    # El nombre de la federación tal cual ('GRAN TARAJAL SOC. TAMAS., U.D.').
    ("2019-2020", "FV11"): {10: "Gran Tarajal"},
    # Veteranos C con el nombre del portal (wayback_2324), Veteranos C en el resto de la temporada.
    ("2023-2024", "GC7"): {9: "Veteranos C"},
}


def group_number(name):
    m = re.search(r"(\d+)", name or "")
    return int(m.group(1)) if m else 1


def _iso_island(prefix):
    return next((island for p, island in ISLAND_OF_PREFIX if prefix.startswith(p)), "grancanaria")


def _fold(text):
    """Mayúsculas sin tildes ni signos, sin la modalidad ('F-8', 'FUTBOL-7') y con 1ª/2ª en letra."""
    text = unicodedata.normalize("NFD", text or "")
    text = "".join(c for c in text if unicodedata.category(c) != "Mn").upper()
    text = re.sub(r"\bF-?[78]\b|\bFUTBOL-?[78]\b", " ", text)
    text = text.replace("2ª", "SEGUNDA ").replace("1ª", "PRIMERA ")
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", text)).strip()


ISLANDS = (("FUERTEVENTURA", "fuerteventura"), ("LANZAROTE", "lanzarote"))


def _island(name):
    return next((island for word, island in ISLANDS if word in name), "grancanaria")


def meta_by_name(comp_name):
    """(prefijo de código, fase, isla) de una competición de fútbol 7/8 de benjamín o
    prebenjamín por su nombre en el catálogo, con los convenios de 2021-22 ('LIGA
    PREFERENTE BENJAMIN F-8 GRAN CANARIA' → BPGC, 'Preferente GC'); None si no es de
    las conocidas (fútbol sala, o un formato nuevo). Las finales y semifinales, las de
    su competición base con F o S detrás. Solo para las temporadas archivadas
    (comp_meta con by_name)."""
    n = _fold(comp_name)
    if "SALA" in n:
        return None
    pre = "PREBENJAMIN" in n.replace(" ", "")
    island = _island(n)
    m = re.match(r"^(SEMI)?FINAL(?:ES)? (.+)$", n)
    if m:
        base = meta_by_name(m.group(2))
        if not base:
            return None
        prefix, phase, isl = base
        league = not phase.startswith("Copa")
        kind = "Semifinal" if m.group(1) else "Final"
        return prefix + kind[0], f"{kind} {'Liga ' if league else ''}{phase}", isl
    if "CAMPEONES" in n:
        return ("PCC" if pre else "BC"), "Copa de Campeones", island
    if pre:
        # La copa prebenjamín de Gran Canaria (2018-19): «Copa Gran Canaria», sin repetir la categoría
        # en la etiqueta («Prebenjamín, Copa Gran Canaria, Grupo 1»).
        if n.startswith("COPA"):
            return ("PCGC", "Copa Gran Canaria", island) if island == "grancanaria" else None
        if n.startswith("LIGA"):
            return {"grancanaria": ("PGC", "Primera Fase GC"), "lanzarote": ("PLZ", "Lanzarote"),
                    "fuerteventura": ("PFV", "Fuerteventura")}[island] + (island,)
        return None
    if n.startswith("SUPERLIGA") and island == "fuerteventura":
        return "FVS", "Superliga Fuerteventura", island
    m = re.match(r"^COPA CABILDO .*\b(PREFERENTE|PRIMERA)\b", n)
    if m and island == "lanzarote":
        return ("CLZP", "Copa Cabildo Preferente Lanzarote", island) if m.group(1) == "PREFERENTE" \
            else ("CLZ1", "Copa Cabildo Primera Lanzarote", island)
    if n.startswith("COPA DELEGACION") and island != "grancanaria":
        return ("CLZ", "Copa Delegación Lanzarote", island) if island == "lanzarote" \
            else ("CFVD", "Copa Delegación Fuerteventura", island)
    if n.startswith("COPA") and island == "fuerteventura":
        return "CFV", "Copa Fuerteventura", island
    if "SEGUNDA FASE" in n:
        if island == "fuerteventura":
            return "FV2", "Fase 2 Fuerteventura", island
        return None  # Gran Canaria: SF (2023-24), A..E (2024-25 y 2025-26), por id
    if not n.startswith("LIGA"):
        return None
    if "PREFERENTE" in n:
        return ("LZP", "Preferente Lanzarote", island) if island == "lanzarote" else \
            ("BPGC", "Preferente GC", island) if island == "grancanaria" else None
    if re.search(r"\bPRIMERA\b", n) and "PRIMERA FASE" not in n:
        return ("LZ1", "Primera Lanzarote", island) if island == "lanzarote" else \
            ("GC", "Primera Fase GC", island) if island == "grancanaria" else None
    if island == "fuerteventura":
        return ("FV1", "Fase 1 Fuerteventura", island) if "PRIMERA FASE" in n else ("FV1", "Fuerteventura", island)
    return None


def comp_meta(conn, comp, siblings, comp_name="", by_name=False):
    """(prefijo, fase, isla) de una competición: la de un grupo hermano ya en la
    base (su código menos el número de su grupo), la de EXTRA_META o la de
    COMP_META y, con `by_name` (las temporadas archivadas), la de su nombre
    (meta_by_name); None si no se sabe."""
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
    return meta_by_name(comp_name) if by_name else None


def actas_complete(folder, season):
    """¿Ha terminado la descarga de las actas de `season`? Hay raw e índice y su
    _status.json dice que no queda ninguna (pending 0) o que la última tanda no
    trajo ninguna sin dejar competiciones por enumerar: la regla de
    actas-federacion.yml para pasar a la temporada siguiente. Sin estado, no."""
    paths = [os.path.join(folder, f"fiflp_actas_{season}_{suffix}.json") for suffix in ("raw", "index", "status")]
    if not all(os.path.exists(p) for p in paths):
        return False
    try:
        status = _load(paths[2], {})
    except ValueError:
        return False
    return status.get("pending") == 0 or (status.get("fetched", 1) == 0 and not status.get("unenumerated_comps"))


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


def _same_team_in_group(name, entry, matches):
    """`name` con los equipos de la clasificación que no salen en el calendario llevados a los del
    calendario que no salen en la clasificación."""
    from fiflp_names import match_teams
    table = {name(r["team"]): r["team"] for r in entry.get("standings") or [] if clean_team_name(r.get("team"))}
    calendar = {name(m[1]) for m in matches} | {name(m[2]) for m in matches}
    only_table = sorted(set(table) - calendar)
    only_calendar = sorted(calendar - set(table))
    if not only_table or not only_calendar:
        return name
    pairs = match_teams(only_table, only_calendar)
    rest_t = [t for t in only_table if t not in pairs]
    rest_c = [c for c in only_calendar if c not in pairs.values()]
    if len(rest_t) == 1 and len(rest_c) == 1:
        pairs[rest_t[0]] = rest_c[0]
    if not pairs:
        return name
    return lambda raw_name: pairs.get(name(raw_name), name(raw_name))


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
            # La letra A es el primer equipo, como no llevar letra: 'UNION VIERA A, C.F. "A"' y 'UNION
            # VIERA, C.F.' son el mismo club (known_names los lleva juntos a 'Unión Viera').
            core, filial = team_key(raw_name)
            clubs.setdefault((core, "" if filial == "A" else filial), []).append(raw_name)
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


def _modernized(conn, raw, actas):
    """Copias del raw de goleadores y de las actas de una temporada archivada con los nombres de los
    equipos (clasificación y cabeceras) con la forma de 2021 en adelante (fiflp_names.modern_fed_name,
    con el vocabulario de los nombres de la temporada y de los equipos de la base)."""
    from fiflp_names import fed_words, modern_fed_name
    fed = [r.get("team") for e in raw.values() for r in e.get("standings") or []]
    fed += [(a.get("header") or {}).get(side) for a in actas.values() if isinstance(a, dict)
            for side in ("home_team", "away_team")]
    words = fed_words([n for n in fed if n], [r[0] for r in conn.execute("SELECT name FROM teams")])
    modern = lambda n: modern_fed_name(n, words) if n else n
    raw = {key: {**entry, "standings": [{**r, "team": modern(r.get("team"))} for r in entry.get("standings") or []]}
           for key, entry in raw.items()}
    actas = {cod: ({**a, "header": {**a["header"], "home_team": modern(a["header"].get("home_team")),
                                    "away_team": modern(a["header"].get("away_team"))}}
                   if isinstance(a, dict) and isinstance(a.get("header"), dict) else a)
             for cod, a in actas.items()}
    return raw, actas


def _move_rows(conn, table, where, params, mapping):
    """Las filas de `table` que cumplen `where` con su team_id cambiado según `mapping` (borrar y
    volver a meter: un intercambio de dos equipos chocaría con el UNIQUE a mitad de un UPDATE)."""
    cols = [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]
    if not cols:                      # una tabla que esta base aún no tiene
        return
    marks = ",".join("?" * len(mapping))
    rows = conn.execute(f"SELECT {', '.join(cols)} FROM {table} WHERE {where} AND team_id IN ({marks})",
                        (*params, *mapping)).fetchall()
    conn.execute(f"DELETE FROM {table} WHERE {where} AND team_id IN ({marks})", (*params, *mapping))
    i = cols.index("team_id")
    for r in rows:
        r = list(r)
        r[i] = mapping[r[i]]
        conn.execute(f"INSERT INTO {table}({', '.join(cols)}) VALUES ({','.join('?' * len(cols))})", r)


def fix_positions(conn, log=print):
    """POSITION_FIXES: el equipo de cada posición pasa a ser el de la lista en la clasificación del
    grupo, su detalle y sus goleadores, y en sus partidos con lo que cuelga de ellos (alineaciones,
    goles, tarjetas, cuerpo técnico). Las fichas de la temporada de esos equipos se borran (las
    rehace import_fiflp_detalle) y el equipo que se queda sin uso, también. Un cambio que dejaría a
    un equipo dos veces en la clasificación no se hace. Devuelve cuántos equipos cambió."""
    changed = 0
    for (season, code), fixes in sorted(POSITION_FIXES.items()):
        found = conn.execute("""SELECT g.id, g.season_id FROM groups g JOIN seasons s ON s.id=g.season_id
                                WHERE s.name=? AND g.code=?""", (season, code)).fetchall()
        if len(found) != 1:
            continue
        gid, season_id = found[0]
        at = dict(conn.execute("SELECT position, team_id FROM standings WHERE group_id=?", (gid,)))
        mapping = {}
        for pos, name in fixes.items():
            row = conn.execute("SELECT id FROM teams WHERE name=?", (name,)).fetchone()
            new = row[0] if row else get_or_create_team(conn, name)
            if pos in at and at[pos] != new:
                mapping[at[pos]] = new
        if not mapping:
            continue
        after = [mapping.get(t, t) for t in at.values()]
        if len(after) != len(set(after)):
            log(f"  ! {season} {code}: el cambio dejaría un equipo dos veces en la clasificación; no se hace")
            continue
        for table in ("standings", "standings_detail", "scorers"):
            _move_rows(conn, table, "group_id=?", (gid,), mapping)
        in_group = "match_id IN (SELECT id FROM matches WHERE group_id=?)"
        for table in ("appearances", "match_events", "match_staff", "match_staff_all"):
            _move_rows(conn, table, in_group, (gid,), mapping)
        case = "CASE {col} " + " ".join(f"WHEN {a} THEN {b}" for a, b in mapping.items()) + " ELSE {col} END"
        conn.execute(f"""UPDATE matches SET home_team_id={case.format(col='home_team_id')},
                         away_team_id={case.format(col='away_team_id')} WHERE group_id=?""", (gid,))
        teams = set(mapping) | set(mapping.values())
        marks = ",".join("?" * len(teams))
        if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='team_seasons'").fetchone():
            conn.execute(f"DELETE FROM team_seasons WHERE season_id=? AND team_id IN ({marks})", (season_id, *teams))
        names = dict(conn.execute(f"SELECT id, name FROM teams WHERE id IN ({marks})", tuple(teams)))
        for old in mapping:
            if not _referenced(conn, old):
                for table in ("team_seasons", "standings_detail", "match_staff_all", "fp_teams"):
                    if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
                        conn.execute(f"DELETE FROM {table} WHERE team_id=?", (old,))
                conn.execute("DELETE FROM teams WHERE id=?", (old,))
        log(f"  {season} {code}: " + ", ".join(f"{names[a]} → {names[b]}" for a, b in mapping.items()))
        changed += len(mapping)
    conn.commit()
    return changed


def import_season(conn, folder, season, log=print):
    """Crea (o rehace) los grupos de la federación de `season` que la base no
    tiene. Una temporada archivada que no está en la base se da de alta con su
    primer grupo (y se borra si al final no crea ninguno). Devuelve {creados,
    rehechos, ya_estaban, sin_código, choques, vacíos} y, si la ha dado de
    alta, season_created."""
    from activate_season import known_names
    report = {"created": 0, "redone": 0, "existing": 0, "no_meta": 0, "clash": 0, "empty": 0}
    archived = season in ARCHIVE_SEASONS
    row = conn.execute("SELECT id, start_year FROM seasons WHERE name=?", (season,)).fetchone()
    if not row and not archived:
        return report
    # Una archivada que falta: sin fila todavía (se da de alta con su primer grupo, más abajo).
    season_id, start = row if row else (None, int(season[:4]))
    raw = _load(os.path.join(folder, f"fiflp_goleadores_{season}_raw.json"), {})
    index = _load(os.path.join(folder, f"fiflp_actas_{season}_index.json"), {})
    actas = _load(os.path.join(folder, f"fiflp_actas_{season}_raw.json"), {})
    if archived:
        raw, actas = _modernized(conn, raw, actas)
    conn.execute("""CREATE TABLE IF NOT EXISTS fiflp_groups (
        group_id INTEGER PRIMARY KEY, season_id INTEGER NOT NULL, comp TEXT NOT NULL, grupo TEXT NOT NULL)""")
    owned = {(c, g): gid for gid, c, g in conn.execute(
        "SELECT group_id, comp, grupo FROM fiflp_groups WHERE season_id=?", (season_id,))} if season_id else {}

    # Qué grupos de la federación ya están en la base (y con qué grupo) y cuáles faltan. Sin la
    # temporada en la base, faltan todos.
    mapped, missing = {}, []
    for key in sorted(raw):
        entry = raw[key]
        if not entry.get("ok"):
            continue
        ident = (str(entry["comp"]), str(entry["grupo"]))
        if ident in owned or season_id is None:
            missing.append(entry)
            continue
        gid = match_group(conn, season_id, index, entry)
        if gid and gid not in owned.values():
            mapped.setdefault(ident[0], []).append((entry, gid))
            report["existing"] += 1
        else:
            missing.append(entry)

    plans = []
    codes = {r[0]: r[1] for r in conn.execute("SELECT code, id FROM groups WHERE season_id=?", (season_id,))} \
        if season_id else {}
    for entry in missing:
        ident = (str(entry["comp"]), str(entry["grupo"]))
        meta = comp_meta(conn, ident[0], mapped.get(ident[0], []), entry.get("comp_name") or "", by_name=archived)
        if not meta:
            report["no_meta"] += 1
            log(f"  ! {season} {entry.get('comp_name')} {entry.get('grupo_name')}: competición sin código")
            continue
        matches = group_matches(index, actas, *ident)
        # Sin clasificación ni actas (una final de la que no hay nada todavía): nada que crear.
        if not matches and not entry.get("standings"):
            report["empty"] += 1
            continue
        prefix, phase, island = meta
        n = group_number(entry.get("grupo_name"))
        code = f"{prefix}{n}"
        if code in codes and codes[code] != owned.get(ident):
            report["clash"] += 1
            log(f"  ! {season} {entry.get('comp_name')} {entry.get('grupo_name')}: el código {code} ya es de otro grupo")
            continue
        codes[code] = owned.get(ident) or ("nuevo", ident)
        plans.append((entry, code, n, phase, island, matches))
    if not plans:
        conn.commit()
        return report
    if season_id is None:
        season_id = get_or_create_season(conn, season, start, start + 1)
        report["season_created"] = True

    # Los nombres de los equipos, todos los grupos nuevos de la temporada a la vez.
    pseudo = [{"island": island, "standings": entry.get("standings") or [],
               "jornadas": [{"matches": [{"home": m[1], "away": m[2]} for m in matches]}]}
              for entry, code, n, phase, island, matches in plans]
    # Los nombres de la base: primero los de la propia temporada (los de una que se rehace), después los
    # de 2021 en adelante y, en una archivada, al final los de las otras archivadas, que pueden ser
    # inventados (pretty_name); en cada grupo, de la más cercana a la más lejana. Una temporada de
    # 2021-22 en adelante nunca mira las archivadas.
    all_years = {r[0] for r in conn.execute("SELECT start_year FROM seasons")} | {start}
    if start not in ARCHIVE_YEARS:
        all_years -= ARCHIVE_YEARS
    years = sorted(all_years, key=lambda y: (y != start, y in ARCHIVE_YEARS, abs(y - start), y < start))
    names = unique_names(known_names(pseudo, conn, years=years, keep_existing=True), conn)
    if archived:
        names.update({k: v for k, v in ARCHIVE_NAMES.items() if k in names})
    name = lambda raw_name: names.get(clean_team_name(raw_name), clean_team_name(raw_name))

    for entry, code, n, phase, island, matches in plans:
        ident = (str(entry["comp"]), str(entry["grupo"]))
        # La federación escribe a veces un equipo de dos formas en el mismo grupo ('TINAJOB "B"' en la
        # clasificación y 'TINAJO "B"' en las actas): el que solo sale en la tabla es el que solo sale en
        # el calendario (match_teams, y si queda uno a cada lado, ese).
        name = _same_team_in_group(name, entry, matches)
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
    # Una archivada dada de alta aquí que al final no tiene ningún grupo (todos saltados): fuera, o
    # sería una temporada vacía en la web.
    if report.get("season_created") and not report["created"]:
        conn.execute("DELETE FROM seasons WHERE id=? AND NOT EXISTS (SELECT 1 FROM groups WHERE season_id=?)",
                     (season_id, season_id))
        conn.commit()
        log(f"  {season}: ningún grupo creado; la temporada no se queda en la base")
    return report


# En la huella: subirla rehace los grupos de todas las temporadas. 5: la huella deja la ruta absoluta
# (otra carpeta con el mismo contenido da la misma) y lleva IMPORT_VERSION de import_fiflp_actas; la
# primera pasada rehace una vez los grupos propios de 2021-22 a 2025-26 (14, 2, 4, 9 y 5), igual que
# estaban (los mismos nombres, partidos y actas).
GRUPOS_VERSION = "5"


def sources_digest(folder, season):
    h = hashlib.sha1((GRUPOS_VERSION + import_fiflp_actas.IMPORT_VERSION).encode())
    for kind in ("goleadores", "actas"):
        for suffix in (("raw",) if kind == "goleadores" else ("index", "raw")):
            path = os.path.join(folder, f"fiflp_{kind}_{season}_{suffix}.json")
            h.update(os.path.basename(path).encode())
            if os.path.exists(path):
                with open(path, "rb") as f:
                    h.update(f.read())
    return h.hexdigest()


def import_changed_grupos(conn, folder=SCRIPTS_DIR, log=print):
    """import_season de cada temporada con raw de goleadores cuyas fuentes hayan
    cambiado desde la última vez (sha1 en raw_imports, clave grupos:<S>). Una
    temporada que no está en la base no graba huella: si no es archivada se salta;
    si lo es, se mira siempre (sin su huella) y se importa en cuanto ha terminado
    la descarga de sus actas (actas_complete)."""
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
        if not conn.execute("SELECT 1 FROM seasons WHERE name=?", (season,)).fetchone():
            if season not in ARCHIVE_SEASONS:
                continue
            if not actas_complete(folder, season):
                log(f"  {season}: esperando a que acabe la descarga de sus actas")
                continue
        elif row and row[0] == digest:
            continue
        report = import_season(conn, folder, season, log=log)
        # La huella, solo si la temporada está en la base después de importar.
        if conn.execute("SELECT 1 FROM seasons WHERE name=?", (season,)).fetchone():
            conn.execute("INSERT OR REPLACE INTO raw_imports(path, sha1, imported_at) VALUES (?, ?, datetime('now'))",
                         (key, digest))
            conn.commit()
        log(f"  {season}: {'temporada nueva; ' if report.get('season_created') else ''}{report['created']} grupos "
            f"nuevos, {report['redone']} rehechos, {report['existing']} ya estaban; {report['no_meta']} sin código, "
            f"{report['clash']} con el código ocupado, {report['empty']} sin clasificación ni actas")
        reports[season] = report
    return reports


if __name__ == "__main__":
    from db import get_connection
    c = get_connection()
    import_changed_grupos(c)
    c.close()
