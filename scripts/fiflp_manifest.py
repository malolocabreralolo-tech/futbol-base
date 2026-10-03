#!/usr/bin/env python3
"""fiflp_manifest.py — Manifiesto de temporada (docs/temporada-nueva.md) a partir
del raw de la federación que deja fetch_fiflp_islas.py.

Los códigos y las fases siguen el convenio de 2025/26 para que la web, el
histórico entre temporadas y el cambio de fase de Mi equipo los traten igual:

    LIGA BENJAMIN GRAN CANARIA FASE PREVIA   -> FF1..   «Primera Fase GC»
    LIGA BENJAMIN ... FASE LIGA A|B|C        -> A1.. B1.. C1..  «Segunda Fase A|B|C»
    LIGA BENJAMIN DE LANZAROTE FASE 1|2      -> LZ1.. / LZS1..  «Lanzarote Fase 1|2»
    LIGA BENJAMIN ... FUERTEVENTURA 1ª|2ª    -> FV11.. / FV21.. «Fuerteventura Fase 1|2»
    LIGA PREBENJAMIN DE GRAN CANARIA         -> PG1..   «Gran Canaria»
    LIGA PREBENJAMIN LANZAROTE|FUERTEVENTURA -> PLZ1.. / PFV1..

Una competición que no encaje aborta: mejor parar que inventar una fase que la
web clasificaría como «otra-…».

    python3 scripts/fiflp_manifest.py scripts/fiflp_islas_22_raw.json 2026-2027 \\
        --team "Las Mesas" --cat prebenjamin > temporada-2026-2027.json
"""
import argparse
import json
import re
import sys
import unicodedata

FIFLP_URL = ("https://www.fiflp.com/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120"
             "&CodTemporada={season}&CodCompeticion={comp}&CodGrupo={group}")


def fold(text):
    return "".join(ch for ch in unicodedata.normalize("NFD", text or "")
                   if unicodedata.category(ch) != "Mn").upper()


def comp_meta(name):
    """(prefijo de código, fase publicada) de una competición de FIFLP."""
    n = fold(name)
    if "SALA" in n:
        raise ValueError(f"fútbol sala no se publica: {name}")
    pre = "PREBENJAMIN" in n
    if "LANZAROTE" in n:
        if pre:
            return "PLZ", "Lanzarote"
        return ("LZS", "Lanzarote Fase 2") if re.search(r"FASE 2|2. FASE", n) else ("LZ", "Lanzarote Fase 1")
    if "FUERTEVENTURA" in n:
        if pre:
            return "PFV", "Fuerteventura"
        return ("FV2", "Fuerteventura Fase 2") if re.search(r"FASE 2|2. FASE", n) else ("FV1", "Fuerteventura Fase 1")
    if pre:
        return "PG", "Gran Canaria"
    m = re.search(r"FASE LIGA ([A-E])\b", n)
    if m:
        return m.group(1), f"Segunda Fase {m.group(1)}"
    if "FASE PREVIA" in n or "PRIMERA FASE" in n:
        return "FF", "Primera Fase GC"
    raise ValueError(f"competición sin convenio de código: {name}")


def group_number(group_name):
    m = re.search(r"(\d+)", group_name or "")
    return int(m.group(1)) if m else 1


def build(raw, season, season_code, names=None):
    """Grupos del manifiesto (sin defaultTeam)."""
    groups, seen = [], set()
    for g in sorted(raw, key=lambda g: (comp_meta(g["competition_name"]), group_number(g["group_name"]))):
        if not g.get("jornadas") and not g.get("standings"):
            continue                       # grupo dado de alta sin calendario todavía
        prefix, phase = comp_meta(g["competition_name"])
        n = group_number(g["group_name"])
        code = f"{prefix}{n}"
        if code in seen:
            raise ValueError(f"código repetido: {code}")
        seen.add(code)
        cat = "prebenjamin" if "PREBENJAMIN" in fold(g["competition_name"]) else "benjamin"
        island = ("lanzarote" if prefix in ("LZ", "LZS", "PLZ") else
                  "fuerteventura" if prefix in ("FV1", "FV2", "PFV") else "grancanaria")
        groups.append({
            "id": code, "cat": cat, "name": f"Grupo {n}", "phase": phase, "island": island,
            "fullName": f"{cat.upper()} {fold(phase)} - GRUPO {n}",
            "url": FIFLP_URL.format(season=season_code, comp=g["competition_id"], group=g["group_id"]),
        })
    return groups


def find_team(raw, groups, needle, cat, names):
    """(groupId, nombre en la base) del equipo cuyo nombre contiene `needle`;
    el primer equipo del club (sin letra de filial B, C…)."""
    from import_fiflp_cups_2324 import clean_team_name
    by_url = {(g["competition_id"], g["group_id"]): g for g in raw}
    hits = []
    for group in (g for g in groups if g["cat"] == cat):
        comp = re.search(r"CodCompeticion=(\d+)", group["url"]).group(1)
        code = re.search(r"CodGrupo=(\d+)", group["url"]).group(1)
        entry = by_url[(comp, code)]
        teams = {clean_team_name(m[s]) for j in entry["jornadas"] for m in j["matches"] for s in ("home", "away")}
        teams |= {clean_team_name(r["team"]) for r in entry.get("standings") or []}
        for t in sorted(teams):
            shown = names.get(t, t)
            if fold(needle) in fold(shown) or fold(needle) in fold(t):
                hits.append((group["id"], shown, t))
    first = [h for h in hits if not re.search(r'["\s]([B-H])"?$', h[2]) and not re.search(r"\s[B-H]$", h[1])]
    if not first:
        raise ValueError(f"no aparece «{needle}» en {cat}")
    if len({(g, n) for g, n, _ in first}) > 1:
        raise ValueError(f"«{needle}» es ambiguo: {sorted({(g, n) for g, n, _ in first})}")
    return first[0][0], first[0][1]


def main():
    sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("raw")
    ap.add_argument("season")
    ap.add_argument("--team", help="parte del nombre del equipo inicial (al activar una temporada)")
    ap.add_argument("--comps", default="", help="solo estas competiciones (ids separados por coma): fase nueva con --add")
    ap.add_argument("--cat", default="prebenjamin", choices=["benjamin", "prebenjamin"])
    args = ap.parse_args()
    raw = json.load(open(args.raw, encoding="utf-8"))
    if args.comps:
        raw = [g for g in raw if str(g["competition_id"]) in args.comps.split(",")]
    from db import get_connection
    from activate_season import known_names
    conn = get_connection()
    try:
        names = known_names(raw, conn)
    finally:
        conn.close()
    start = int(args.season.split("-")[0])
    groups = build(raw, args.season, str(start - 2004))
    manifest = {"season": args.season, "groups": groups}
    if args.team:
        group_id, name = find_team(raw, groups, args.team, args.cat, names)
        manifest["defaultTeam"] = {"cat": args.cat, "groupId": group_id, "name": name}
    json.dump(manifest, sys.stdout, ensure_ascii=False, indent=2)
    print()


if __name__ == "__main__":
    main()
