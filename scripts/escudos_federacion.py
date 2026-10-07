#!/usr/bin/env python3
"""escudos_federacion.py — Escudos de la federación para los equipos que no tienen.

Los raws de goleadores (goleadores-federacion.yml) guardan, por grupo, la URL del
escudo de cada equipo («crests», la imagen de su celda en una jornada). Cada
grupo se casa con el de la base (import_fiflp_goleadores.match_group) y sus
nombres se traducen con team_bridge; un equipo de la base sin escudo en
data-shields.js (ni por su nombre ni por su nombre normalizado, como crestFile
de la app) recibe el de la federación: se descarga de laspalmas.filesnovanet.es
(contesta fuera de Actions), se recortan sus bordes transparentes como en
trim_shields.py y se guarda en escudos/fed_<nombre>.png; después, las
miniaturas y el sello de la caché (build_crests.py).

Desde octubre de 2026, además: el escudo de la ficha de cada equipo (team_seasons.crest_url, del
directorio de equipos que baja detalle-federacion.yml), solo si su nombre oficial casa con el de la
base (team_score), y un filial sin escudo toma el de su primer equipo ('Victoria B' el de 'Victoria'),
como los que ya están en data-shields.js, sin bajar nada.

A mano, como trim_shields.py (el bot no toca escudos/):
    python3 scripts/escudos_federacion.py            # informe
    python3 scripts/escudos_federacion.py --write
"""
import argparse
import json
import os
import re
import sys
import unicodedata
from io import BytesIO
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from check_missing_shields import normalize  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SHIELDS_PATH = ROOT / "data-shields.js"


def load_shields():
    m = re.search(r"const SHIELDS=(\{.*?\});", SHIELDS_PATH.read_text(encoding="utf-8"), re.S)
    return json.loads(m.group(1))


def has_crest(name, shields, normalized):
    return name in shields or normalize(name) in normalized


def slug(name):
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "", text.lower()) or "equipo"


def candidates(conn, folder=ROOT / "scripts"):
    """{equipo de la base sin escudo: URL del escudo de la federación}."""
    import import_fiflp_goleadores as G
    shields = load_shields()
    normalized = {normalize(k) for k in shields}
    out = {}
    for path in sorted(Path(folder).glob("fiflp_goleadores_*_raw.json")):
        season = re.search(r"(\d{4}-\d{4})", path.name).group(1)
        row = conn.execute("SELECT id FROM seasons WHERE name=?", (season,)).fetchone()
        if not row:
            continue
        index_path = Path(folder) / f"fiflp_actas_{season}_index.json"
        index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {}
        for entry in json.loads(path.read_text(encoding="utf-8")).values():
            if not entry.get("crests"):
                continue
            gid = G.match_group(conn, row[0], index, entry)
            if not gid:
                continue
            bridge = G.team_bridge(conn, gid, entry)
            group_teams = set(G._db_groups_one(conn, gid))
            for fed_name, url in entry["crests"].items():
                name = G.scorer_team(fed_name, bridge)
                if name in group_teams and not has_crest(name, shields, normalized) and name not in out:
                    out[name] = url
    out.update({name: url for name, url in ficha_candidates(conn, shields, normalized).items() if name not in out})
    return out


FILES_HOST = "https://laspalmas.filesnovanet.es"


def ficha_candidates(conn, shields, normalized):
    """{equipo de la base sin escudo: URL del escudo de su ficha de la federación}: la más reciente, y
    solo si el nombre oficial de la ficha es el del equipo (team_score ≥ 0,6 o la tabla revisada)."""
    from fiflp_names import fed_alias, team_key, team_score
    if not conn.execute("SELECT 1 FROM sqlite_master WHERE name='team_seasons'").fetchone():
        return {}
    out = {}
    for name, fed, url in conn.execute("""SELECT t.name, ts.fiflp_name, ts.crest_url FROM team_seasons ts
            JOIN teams t ON t.id=ts.team_id JOIN seasons s ON s.id=ts.season_id
            WHERE ts.crest_url LIKE '/pnfg/pimg/%' ORDER BY s.start_year DESC"""):
        if name in out or has_crest(name, shields, normalized):
            continue
        if fed_alias(fed) == name or team_score(team_key(fed), team_key(name)) >= 0.6:
            out[name] = FILES_HOST + url
    return out


def filial_crests(conn, shields=None):
    """{filial sin escudo: el fichero del escudo de su primer equipo} de los equipos con clasificación."""
    shields = shields if shields is not None else load_shields()
    normalized = {}
    for key, file in shields.items():
        normalized.setdefault(normalize(key), file)
    out = {}
    for (name,) in conn.execute("SELECT DISTINCT t.name FROM teams t JOIN standings st ON st.team_id=t.id"):
        if has_crest(name, shields, normalized):
            continue
        m = re.match(r"^(.*\S)\s+[B-F]$", name)
        if m and has_crest(m.group(1), shields, normalized):
            out[name] = shields.get(m.group(1)) or normalized[normalize(m.group(1))]
    return out


def install(found, log=print):
    from trim_shields import fetch_image, trim_transparent
    from PIL import Image
    import hashlib
    shields = load_shields()
    # Un fichero por escudo: los filiales comparten el de su club, y uno que ya está en escudos/
    # (el mismo contenido, de una pasada anterior) se reutiliza.
    have = {hashlib.sha1(p.read_bytes()).hexdigest(): p.name for p in (ROOT / "escudos").glob("fed_*.png")}
    added, files = 0, {}
    for name, url in sorted(found.items()):
        if url not in files:
            try:
                img = trim_transparent(Image.open(BytesIO(fetch_image(url))))
            except Exception as exc:
                log(f"  ! {name}: no se pudo bajar {url} ({exc})")
                continue
            buf = BytesIO()
            img.save(buf, format="PNG", optimize=True)
            digest = hashlib.sha1(buf.getvalue()).hexdigest()
            if digest not in have:
                have[digest] = f"fed_{slug(name)}.png"
                (ROOT / "escudos" / have[digest]).write_bytes(buf.getvalue())
            files[url] = have[digest]
        shields[name] = files[url]
        added += 1
        log(f"  {name} → escudos/{files[url]}")
    SHIELDS_PATH.write_text("const SHIELDS=" + json.dumps(shields, ensure_ascii=False, separators=(",", ":")) + ";\n",
                            encoding="utf-8")
    if added:
        import build_crests
        build_crests.main([])
    return added


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args(argv)
    from db import get_connection
    conn = get_connection()
    filiales = filial_crests(conn)
    print(f"{len(filiales)} filiales sin escudo con el de su primer equipo:")
    for name, file in sorted(filiales.items()):
        print(f"  {name}: {file}")
    if args.write and filiales:
        shields = load_shields()
        shields.update(filiales)
        SHIELDS_PATH.write_text("const SHIELDS=" + json.dumps(shields, ensure_ascii=False, separators=(",", ":"))
                                + ";\n", encoding="utf-8")
    found = candidates(conn)
    print(f"{len(found)} equipos sin escudo con escudo de la federación:")
    for name, url in sorted(found.items()):
        print(f"  {name}: {url}")
    if args.write and found:
        print(f"\n{install(found)} escudos nuevos")
    conn.close()


if __name__ == "__main__":
    main()
