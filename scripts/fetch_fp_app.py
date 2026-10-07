#!/usr/bin/env python3
"""fetch_fp_app.py — La app nueva de futbolaspalmas.com (desde 2026/27), en un raw.

El portal pasó en 2026/27 a una app (directo.php) con una API JSON:
  ?action=get_full_calendar&liga_id=N   todos los partidos de una liga (sin goleadores)
  ?action=get_live_data&liga_id=N       la jornada en curso, la tabla (con la
                                        equipación de cada equipo, sanciones y
                                        racha) y qué significa cada zona de la
                                        tabla (ascenso, playoff, copa…)
  ?action=get_live_data&liga_id=HOY&fecha_ver=AAAA-MM-DD
                                        todos los partidos de un día, de todas las
                                        ligas: estado (finalizado, aplazado,
                                        suspendido, retirado…), goleadores (minuto y
                                        nombre de pila), hora real de inicio,
                                        árbitros, técnicos y campo con enlace al mapa.
Las ligas salen del desplegable <select id="selector-liga"> de cualquier página
de la app (discover_temporada.app_ligas): solo benjamín y prebenjamín.

Lo que da que la federación no: el nombre de los goleadores de los clubes cuyos
niños la federación no publica (Las Mesas, AD Huracán…), los colores de la
equipación, el enlace al mapa de cada campo, el estado de cada partido y qué
significa cada puesto de la tabla. futbolaspalmas SÍ contesta desde casa.

Raw: scripts/fp_app_<temporada>_raw.json
  {"ligas": {id: {name, fetched, meta, tabla}}, "partidos": {id: {...}}, "dias": {fecha: fetched}}
Cada partido guarda su último estado conocido (lo del día pisa lo del calendario).
Un día ya cerrado (pedido después de ese día) no se vuelve a pedir.

  python3 scripts/fetch_fp_app.py [--temporada 2026-2027] [--hoy AAAA-MM-DD]
"""
import argparse
import json
import os
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

HERE = Path(__file__).resolve().parent
API = "https://futbolaspalmas.com/directo.php"
APP_URL = "https://futbolaspalmas.com/benjamin/"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
DELAY = 0.4
META_KEYS = ("jornada_actual", "total_jornadas", "plazas_ascenso", "plazas_playoff", "plazas_descenso",
             "plazas_copa", "plazas_promocion", "texto_ascenso", "texto_playoff", "texto_copa",
             "texto_promocion", "texto_descenso", "tipo_competicion")
# Un partido en uno de estos estados ya no cambia.
CLOSED = {"finalizado", "suspendido", "aplazado", "retirado", "anulado"}


def raw_path(season):
    return HERE / f"fp_app_{season}_raw.json"


def get(url, tries=3):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json,text/html,*/*",
                                                       "Accept-Language": "es-ES,es;q=0.9"})
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception:
            if attempt == tries - 1:
                raise
            time.sleep(3 * (attempt + 1))


def get_json(params):
    from urllib.parse import urlencode
    text = get(f"{API}?{urlencode(params)}")
    return json.loads(text.strip())


def merge(old, new):
    """El partido con lo nuevo encima, sin borrar lo que lo nuevo no trae."""
    out = dict(old or {})
    out.update({k: v for k, v in new.items() if v is not None or k not in out})
    return out


def fetch_liga(liga_id, name, data, now, log=print):
    live = get_json({"action": "get_live_data", "liga_id": liga_id})
    time.sleep(DELAY)
    cal = get_json({"action": "get_full_calendar", "liga_id": liga_id})
    time.sleep(DELAY)
    data["ligas"][str(liga_id)] = {"name": name, "fetched": now,
                                   "meta": {k: live.get(k) for k in META_KEYS},
                                   "tabla": live.get("tabla") or []}
    n = 0
    for p in cal.get("partidos") or []:
        data["partidos"][str(p["id"])] = merge(data["partidos"].get(str(p["id"])), {**p, "liga_id": int(liga_id)})
        n += 1
    for p in (live.get("partidos") or []) + (live.get("partidos_siguientes") or []):
        data["partidos"][str(p["id"])] = merge(data["partidos"].get(str(p["id"])), {**p, "liga_id": int(liga_id)})
    log(f"  {name}: {len(data['ligas'][str(liga_id)]['tabla'])} equipos, {n} partidos")


def days_to_fetch(data, ligas, today):
    """Los días con partidos de nuestras ligas hasta hoy que no están cerrados: no
    pedidos nunca, pedidos el mismo día (los partidos aún se jugaban) o con algún
    partido que no ha terminado."""
    days = {}
    for p in data["partidos"].values():
        if str(p.get("liga_id")) not in ligas:
            continue
        day = (p.get("fecha_programada") or "")[:10]
        if not day or day > today.isoformat():
            continue
        days.setdefault(day, []).append(p)
    out = []
    for day, ps in sorted(days.items()):
        fetched = data["dias"].get(day)
        open_match = any((p.get("estado") or "") not in CLOSED for p in ps)
        if not fetched or fetched[:10] <= day or open_match:
            out.append(day)
    return out


def fetch_day(day, ligas, data, now):
    got = get_json({"action": "get_live_data", "liga_id": "HOY", "fecha_ver": day})
    n = 0
    for p in got.get("partidos") or []:
        if str(p.get("liga_id")) in ligas:
            data["partidos"][str(p["id"])] = merge(data["partidos"].get(str(p["id"])), p)
            n += 1
    data["dias"][day] = now
    return n


def run(season, today=None, log=print):
    from discover_temporada import app_ligas
    today = today or date.today()
    now = datetime.now().isoformat(timespec="seconds")
    path = raw_path(season)
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    for k in ("ligas", "partidos", "dias"):
        data.setdefault(k, {})
    ligas = app_ligas(get(APP_URL))
    log(f"futbolaspalmas (app): {len(ligas)} ligas de benjamín y prebenjamín")
    for liga_id, name in ligas:
        try:
            fetch_liga(liga_id, name, data, now, log)
        except Exception as e:     # una liga que falla no tumba las demás
            log(f"  ! {name}: {e}")
    ids = {str(i) for i, _ in ligas} | set(data["ligas"])
    for day in days_to_fetch(data, ids, today):
        try:
            n = fetch_day(day, ids, data, now)
            log(f"  día {day}: {n} partidos")
        except Exception as e:
            log(f"  ! día {day}: {e}")
        time.sleep(DELAY)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    return data


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--temporada", default=None, help="por defecto, la temporada en curso de la base")
    ap.add_argument("--hoy", default=None)
    args = ap.parse_args(argv)
    season = args.temporada
    if not season:
        from db import get_connection
        from portal_config import active_season
        conn = get_connection()
        season = active_season(conn)[1]
        conn.close()
    today = date.fromisoformat(args.hoy) if args.hoy else date.today()
    run(season, today)


if __name__ == "__main__":
    main()
