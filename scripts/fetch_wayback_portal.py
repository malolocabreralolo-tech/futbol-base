#!/usr/bin/env python3
"""fetch_wayback_portal.py — Las temporadas antiguas de futbolaspalmas.com (2012-13 a
2018-19), desde el Wayback Machine, en un raw por temporada.

Qué grupo sale de qué captura lo dice scripts/wayback_portal_sources.json (de un estudio del
archivo de octubre de 2026: la última captura de cada grupo cuyo contenido, por las fechas de
sus partidos, es de esa temporada). Cada página se pide en su forma original
(https://web.archive.org/web/<ts>id_/<url>, sin la barra de Wayback), con una pausa entre
peticiones, y se guarda en una caché fuera del repositorio (--cache, por defecto
~/.cache/futbol-base/wayback): una segunda pasada no vuelve a pedir nada.

Escribe scripts/wayback_portal_<S>_raw.json:
  {código: {category, phase, island, name, title, standings_from, results_from,
            standings: [[pos, equipo, pts, J, G, E, P, GF, GC, DF]],
            jornadas: {"Jornada N": [{date, time, home, away, hs, as, venue, admin?}]}}}
Lo importa import_wayback_portal.py. Los lectores, en wayback_portal.py. Un grupo cuyos
partidos resultan ser de otra temporada se queda sin partidos (y se avisa).

  python3 scripts/fetch_wayback_portal.py [--temporadas 2013-2014,2015-2016] [--cache DIR]
"""
import argparse
import hashlib
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wayback_portal as W  # noqa: E402

HERE = Path(__file__).resolve().parent
SOURCES = HERE / "wayback_portal_sources.json"
WAYBACK = "https://web.archive.org/web/{ts}id_/{url}"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
DELAY = 1.5


def raw_path(season):
    return HERE / f"wayback_portal_{season}_raw.json"


def cache_key(ts, url):
    return f"{ts}_{hashlib.sha1(url.encode()).hexdigest()[:12]}.html"


def get_page(ts, url, cache, log=print):
    """El HTML (bytes) de la captura, de la caché o de Wayback."""
    path = Path(cache) / cache_key(ts, url)
    if path.exists():
        return path.read_bytes()
    for attempt in range(4):
        try:
            req = urllib.request.Request(WAYBACK.format(ts=ts, url=url), headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            time.sleep(DELAY)
            return data
        except Exception as e:
            log(f"    ! {url} ({ts}): {e}; reintento")
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"no se pudo bajar {url} ({ts})")


def read_group(source, cache, log=print):
    """La entrada del raw de un grupo: su clasificación y su calendario, leídos de sus capturas."""
    entry = {k: source.get(k) for k in ("category", "phase", "island", "name", "title")}
    standings, jornadas = [], {}
    if source.get("results"):
        ts, url = source["results"]
        html = W.decode(get_page(ts, url, cache, log))
        if "fecha2015" in html:
            jornadas = W.matches_f2015(html)
        elif 'class="brillo"' in html:
            jornadas = W.matches_calendar(html)
        entry["results_from"] = [ts, url]
        if source.get("standings") == source.get("results"):
            standings = W.standings_f2015(html) if "fecha2015" in html else W.standings_old(html)
    if source.get("standings") and not standings:
        ts, url = source["standings"]
        html = W.decode(get_page(ts, url, cache, log))
        standings = W.standings_f2015(html) if "fecha2015" in html else W.standings_old(html)
        entry["standings_from"] = [ts, url]
    elif source.get("standings"):
        entry["standings_from"] = source["standings"]
    found = W.season_of_matches(jornadas)
    if jornadas and found != source["season"]:
        log(f"    ! {source['season']} {source['code']}: los partidos son de {found}; se descartan")
        jornadas = {}
    entry["standings"] = standings
    entry["jornadas"] = {f"Jornada {j}": ms for j, ms in sorted(jornadas.items())}
    return entry


def run(seasons=None, cache=None, log=print):
    cache = cache or os.path.expanduser("~/.cache/futbol-base/wayback")
    sources = json.loads(SOURCES.read_text(encoding="utf-8"))
    out = {}
    for source in sources:
        if seasons and source["season"] not in seasons:
            continue
        entry = read_group(source, cache, log)
        out.setdefault(source["season"], {})[source["code"]] = entry
        played = sum(1 for ms in entry["jornadas"].values() for m in ms if m["hs"] is not None)
        log(f"  {source['season']} {source['code']}: {len(entry['standings'])} equipos, {played} partidos")
    for season, groups in out.items():
        raw_path(season).write_text(json.dumps(groups, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                                    encoding="utf-8")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--temporadas", default="", help="por defecto, todas las de wayback_portal_sources.json")
    ap.add_argument("--cache", default=None)
    args = ap.parse_args(argv)
    seasons = {s.strip() for s in args.temporadas.split(",") if s.strip()} or None
    run(seasons, args.cache)


if __name__ == "__main__":
    main()
