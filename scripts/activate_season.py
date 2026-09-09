#!/usr/bin/env python3
"""Verify a season manifest; activate only with --apply, preserving every archive.

Examples and manifest format: docs/temporada-nueva.md. Verification downloads
the actual fixture tables: a new year in a website heading is insufficient.
"""
import argparse
from datetime import date, datetime, timezone
import json
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile
from urllib.parse import urlparse

from db import get_connection, PROJECT_ROOT
from fetch_futbolaspalmas import fetch, parse_all_matches, parse_standings
from portal_config import load_config


def validate_manifest(manifest, current):
    season = manifest.get("season", "")
    if not re.fullmatch(r"20\d{2}-20\d{2}", season):
        raise ValueError("Temporada inválida")
    start, end = map(int, season.split("-"))
    if end != start + 1 or start != int(current.split("-")[1]):
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
        if parsed.scheme != "https" or parsed.hostname != "futbolaspalmas.com" or parsed.username or parsed.password:
            raise ValueError("La URL debe ser HTTPS de futbolaspalmas.com")
    team = manifest.get("defaultTeam", {})
    if not team.get("name") or not any(g["id"] == team.get("groupId") and g["cat"] == team.get("cat") for g in groups):
        raise ValueError("El equipo inicial debe pertenecer a uno de los grupos")


def verify_sources(manifest, fetcher=fetch):
    """Return source evidence, or fail before making any database/file writes."""
    start, end = map(int, manifest["season"].split("-"))
    first, last = date(start, 7, 1), date(end, 6, 30)
    evidence = []
    for group in manifest["groups"]:
        url = group["url"].rstrip("/") + "/"
        rounds = parse_all_matches(fetcher(url), include_details=True)
        standings = parse_standings(fetcher(url + "mostrar_clasi.php"))
        matches = [m for entries in rounds.values() for m in entries]
        if not standings or not matches:
            raise ValueError(f'{group["id"]}: faltan clasificación o partidos con año verificable')
        if any(not first <= date.fromisoformat(m[0]) <= last for m in matches):
            raise ValueError(f'{group["id"]}: el calendario contiene fechas de otra temporada')
        names = {r[1] for r in standings}
        if any(m[1] not in names or m[2] not in names for m in matches):
            raise ValueError(f'{group["id"]}: calendario y clasificación tienen equipos diferentes')
        default = manifest["defaultTeam"]
        if group["id"] == default["groupId"] and default["name"] not in names:
            raise ValueError("El equipo inicial no aparece en la clasificación verificada")
        evidence.append({"group": group, "rounds": rounds, "standings": standings})
    return evidence


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
        for item in evidence:
            g = item["group"]
            cat = conn.execute("SELECT id FROM categories WHERE lower(name)=?", (g["cat"],)).fetchone()
            if not cat:
                raise ValueError("Falta la categoría en la base")
            gid = conn.execute("""INSERT INTO groups(season_id,category_id,code,name,full_name,phase,island,url,current_jornada)
                VALUES(?,?,?,?,?,?,?,?,?)""", (sid, cat[0], g["id"], g["name"], g.get("fullName", g["name"]),
                g["phase"], g["island"], g["url"], next(reversed(item["rounds"])))).lastrowid
            team_ids = {}
            for row in item["standings"]:
                conn.execute("INSERT OR IGNORE INTO teams(name) VALUES(?)", (row[1],))
                tid = conn.execute("SELECT id FROM teams WHERE name=?", (row[1],)).fetchone()[0]
                team_ids[row[1]] = tid
                conn.execute("""INSERT INTO standings(group_id,team_id,position,points,played,won,drawn,lost,gf,gc,gd)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?)""", (gid, tid, row[0], *row[2:]))
            for round_name, matches in item["rounds"].items():
                for dt, home, away, hs, away_score, kickoff, venue in matches:
                    conn.execute("""INSERT INTO matches(group_id,jornada,date,time,home_team_id,away_team_id,home_score,away_score,venue)
                        VALUES(?,?,?,?,?,?,?,?,?)""", (gid, round_name, dt, kickoff, team_ids[home], team_ids[away], hs, away_score, venue))


def apply_manifest(manifest, evidence, root=Path(PROJECT_ROOT)):
    """Generate in a temporary checkout before replacing any live artifact."""
    import generate_js
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
        archive_url = f'./data-season-{config["season"]}.js'
        worker = sw_path.read_text()
        if archive_url not in worker:
            sw_path.write_text(worker.replace('const SEASON_FILES = [', f"const SEASON_FILES = [\n  '{archive_url}',"))
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
        except Exception:
            for path in artifacts:
                relative = path.relative_to(stage)
                if (backup / relative).exists():
                    shutil.copy2(backup / relative, root / relative)
                else:
                    (root / relative).unlink(missing_ok=True)
            raise
    return backup


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--apply", action="store_true", help="activar tras verificar; crea copia y genera primero en temporal")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    validate_manifest(manifest, load_config()["season"])
    evidence = verify_sources(manifest)
    print(f'{manifest["season"]}: {len(evidence)} grupos verificados con calendarios fechados.')
    if args.apply:
        print(f"Temporada activada. Copia anterior: {apply_manifest(manifest, evidence)}")
    else:
        print("Solo comprobación. No se ha modificado la base ni la configuración.")


if __name__ == "__main__":
    main()
