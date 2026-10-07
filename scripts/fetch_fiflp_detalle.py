#!/usr/bin/env python3
"""fetch_fiflp_detalle.py — El detalle de la federación (FIFLP) que no traen las
actas ni los goleadores, de cada grupo de benjamín y prebenjamín (fútbol 7/8, sin
sala) de las temporadas pedidas:

  - la clasificación detallada (NFG_VisClasificacion): código del equipo en la
    federación, partidos en casa y fuera, últimos resultados y puntos de sanción;
  - el directorio del grupo (NFG_LstDirectorioEquipos): código, escudo, colores
    de la equipación y campo de cada equipo (sin los datos de contacto);
  - con --jornadas, el calendario completo del grupo (NFG_CmpJornada por
    jornada, aplanado): resultados, fecha, hora, campo y árbitro. Es lo que hay de
    las temporadas en las que la federación no publica actas (2016-17 a 2018-19).

Y al final la ficha de cada campo (NFG_VisCampos) que aparezca en los
directorios o en la tabla venues de la base: coordenadas, dirección, superficie,
instalaciones y equipos que juegan allí.

Solo escribe raws (reanudables: lo ya leído no se vuelve a pedir):
  scripts/fiflp_detalle_<S>_raw.json   {"_grupos": {comp: [[grupo, nombre]]},
                                        "comp:grupo": {clasificacion, directorio, jornadas…}}
  scripts/fiflp_campos_raw.json        {código: ficha}
Los importa import_fiflp_detalle.py (lo llama el bot). Solo funciona desde GitHub
Actions (detalle-federacion.yml): FIFLP contesta vacío a las IPs domésticas.

  python3 scripts/fetch_fiflp_detalle.py --temporadas 12,13,14 --jornadas 12,13,14 [--max-minutes 320]
"""
import argparse
import json
import sqlite3
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fiflp_detalle import parse_campo, parse_clasificacion, parse_directorio  # noqa: E402

HERE = Path(__file__).resolve().parent
DB_PATH = HERE.parent / "futbolbase.db"
CAMPOS_RAW = HERE / "fiflp_campos_raw.json"
DIRECTORIO_URL = ("/NFG_LstDirectorioEquipos?cod_primaria=1000117&search=1&Buscar=1"
                  "&Sch_Cod_Temporada={season}&Sch_Codigo_Delegacion=&Sch_Tipo_Juego="
                  "&Sch_CodCompeticion={comp}&Sch_CodGrupo={grupo}")
CLASIFICACION_URL = ("/NFG_VisClasificacion?cod_primaria=1000120&CodTemporada={season}"
                     "&codcompeticion={comp}&codgrupo={grupo}&codjornada=99")
CALENDARIO_URL = ("/NFG_CmpJornada?cod_primaria=1000120&CodTemporada={season}"
                  "&CodCompeticion={comp}&CodGrupo={grupo}")
CAMPO_URL = "/NFG_VisCampos?cod_primaria=1000122&Codigo_Campo={code}"


def season_name(code):
    """'12' -> '2016-2017' (CodTemporada = año inicial − 2004)."""
    start = 2004 + int(code)
    return f"{start}-{start + 1}"


def raw_path(code):
    return HERE / f"fiflp_detalle_{season_name(code)}_raw.json"


def benjamin_comps(comps):
    """[(id, nombre)] de benjamín y prebenjamín de fútbol 7/8 (sin sala)."""
    fold = lambda t: t.upper().replace("Í", "I").replace("É", "E")
    return [(c["id"], c["name"].strip()) for c in comps
            if "BENJAMIN" in fold(c["name"]) and "SALA" not in fold(c["name"])
            and "LPFS" not in fold(c["name"])]


def catalog_comps(code):
    """Las de la temporada en el catálogo de discover_fiflp_comps.py."""
    path = HERE / "fiflp_comps_catalog.json"
    catalog = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    return benjamin_comps((catalog.get(season_name(code)) or {}).get("all", []))


def live_comps(page, F, code):
    """Las de la temporada leídas de la web, para una que el catálogo aún no tiene."""
    if not F.goto(page, F.BASE + f"/NFG_CmpJornada?cod_primaria=1000120&CodTemporada={code}"):
        return []
    comps = page.evaluate("""() => {
        const sel = document.querySelector('select[name="competicion"]');
        return sel ? Array.from(sel.options).filter(o => o.value && o.value !== '0')
                       .map(o => ({id: o.value, name: o.text.trim()})) : [];
    }""") or []
    F.delay()
    return benjamin_comps(comps)


def load(path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")


def group_done(entry, jornadas):
    """Un grupo ya leído: cargó la clasificación y el directorio (y, si se piden,
    las jornadas)."""
    return bool(entry and entry.get("ok") and (not jornadas or "jornadas" in entry))


def _grupos(page, F):
    """[[valor, nombre]] del desplegable de grupos de la página cargada."""
    for _ in range(4):
        try:
            opts = page.evaluate("""() => Array.from(document.querySelectorAll('select[name="grupo"] option'))
                .filter(o => o.value && o.value !== '0').map(o => [o.value, o.text.trim()])""") or []
        except Exception:
            opts = []
        if opts:
            return opts
        page.wait_for_timeout(2500)
    return []


def _jornadas(page, F, base, log=print):
    """{etiqueta de jornada: [partidos]} de un grupo, cada jornada por su URL y
    aplanada (las cifras de los marcadores van ofuscadas)."""
    from fiflp_render import flatten
    from update_fiflp import option_round
    from activate_season import _iso
    options = []
    for _ in range(4):
        options = page.evaluate("""() => {
            const sel = document.querySelector('select[name="jornada"]');
            return sel ? Array.from(sel.options).filter(o => o.value && o.value !== '0')
                           .map(o => ({value: o.value, text: o.text.trim()})) : [];
        }""") or []
        if options:
            break
        page.wait_for_timeout(2500)
    rounds = {}
    for opt in options:
        label, when = option_round(opt["text"])
        if not F.goto(page, f"{base}&CodJornada={opt['value']}"):
            log(f"      ! no carga la {label.lower()}")
            return None
        flatten(page)
        rounds[label] = [{**m, "date": _iso(m.get("date")) or (when.isoformat() if when else "")}
                         for m in F.parse_matches(page)]
        F.delay()
    return rounds


def scrape_group(page, F, season, comp, grupo, jornadas, log=print):
    """(clasificación, directorio, jornadas o None, ok) de un grupo."""
    clasificacion, directorio, rounds = [], [], None
    ok = True
    if F.goto(page, F.BASE + CLASIFICACION_URL.format(season=season, comp=comp, grupo=grupo)):
        clasificacion = parse_clasificacion(page.content())
    else:
        ok = False
    F.delay()
    if F.goto(page, F.BASE + DIRECTORIO_URL.format(season=season, comp=comp, grupo=grupo)):
        directorio = parse_directorio(page.content())
    else:
        ok = False
    F.delay()
    if jornadas:
        base = F.BASE + CALENDARIO_URL.format(season=season, comp=comp, grupo=grupo)
        if F.goto(page, base):
            rounds = _jornadas(page, F, base, log)
        if rounds is None:
            ok = False
    return clasificacion, directorio, rounds, ok


def run_groups(page, F, seasons, jornadas_seasons, deadline, log=print):
    for season in seasons:
        path = raw_path(season)
        data = load(path)
        comps = catalog_comps(season)
        if not comps:
            comps = [tuple(c) for c in data.get("_comps") or []] or live_comps(page, F, season)
            data["_comps"] = comps
            save(path, data)
        log(f"Temporada {season_name(season)}: {len(comps)} competiciones")
        want_rounds = season in jornadas_seasons
        for comp, comp_name in comps:
            if time.monotonic() > deadline:
                log("  plazo agotado: sigue en la próxima tanda")
                return False
            grupos = data.setdefault("_grupos", {}).get(comp)
            if not grupos:
                if not F.goto(page, F.BASE + f"/NFG_CmpJornada?cod_primaria=1000120&CodTemporada={season}"
                                             f"&CodCompeticion={comp}"):
                    log(f"  ! {comp}: no carga")
                    continue
                grupos = _grupos(page, F)
                F.delay()
                if not grupos:
                    log(f"  ! {comp} {comp_name[:50]}: sin grupos")
                    continue
                data["_grupos"][comp] = grupos
                save(path, data)
            new = 0
            for grupo, grupo_name in grupos:
                if time.monotonic() > deadline:
                    break
                key = f"{comp}:{grupo}"
                if group_done(data.get(key), want_rounds):
                    continue
                clasificacion, directorio, rounds, ok = scrape_group(page, F, season, comp, grupo, want_rounds, log)
                entry = {"comp": comp, "comp_name": comp_name, "grupo": grupo, "grupo_name": grupo_name,
                         "clasificacion": clasificacion, "directorio": directorio,
                         "ok": ok, "fetched": date.today().isoformat()}
                if rounds is not None:
                    entry["jornadas"] = rounds
                data[key] = entry
                save(path, data)
                new += 1
            log(f"  {comp} {comp_name[:50]}: {len(grupos)} grupos, {new} leídos")
    return True


def venue_codes(seasons):
    """Códigos de campo de los directorios descargados y de la tabla venues."""
    codes = set()
    for path in HERE.glob("fiflp_detalle_*_raw.json"):
        for key, entry in load(path).items():
            if key.startswith("_"):
                continue
            codes.update(t.get("venue_code") for t in entry.get("directorio") or [] if t.get("venue_code"))
    if DB_PATH.exists():
        try:
            conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
            codes.update(c for (c,) in conn.execute("SELECT code FROM venues WHERE code IS NOT NULL"))
            conn.close()
        except sqlite3.Error:
            pass
    return sorted(c for c in codes if c)


def run_campos(page, F, deadline, log=print):
    data = load(CAMPOS_RAW)
    codes = [c for c in venue_codes(None) if not (data.get(str(c)) or {}).get("ok")]
    log(f"Campos: {len(codes)} fichas por leer")
    for code in codes:
        if time.monotonic() > deadline:
            log("  plazo agotado: sigue en la próxima tanda")
            return False
        ficha = None
        if F.goto(page, F.BASE + CAMPO_URL.format(code=code)):
            ficha = parse_campo(page.content())
        data[str(code)] = {**(ficha or {}), "ok": bool(ficha), "fetched": date.today().isoformat()}
        save(CAMPOS_RAW, data)
        F.delay()
    return True


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--temporadas", default="12,13,14,15,16,17,18,19,20,21,22")
    ap.add_argument("--jornadas", default="12,13,14",
                    help="temporadas de las que bajar también el calendario completo")
    ap.add_argument("--sin-campos", action="store_true", help="no leer las fichas de los campos")
    ap.add_argument("--max-minutes", type=float, default=320)
    args = ap.parse_args(argv)
    seasons = [s.strip() for s in args.temporadas.split(",") if s.strip()]
    jornadas = {s.strip() for s in args.jornadas.split(",") if s.strip()}
    deadline = time.monotonic() + args.max_minutes * 60
    import fetch_fiflp_2425 as F
    from fiflp_render import fiflp_only
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"))
        fiflp_only(page)   # sin la publicidad de la federación, que colgaba las cargas
        page.set_default_timeout(30000)
        try:
            complete = run_groups(page, F, seasons, jornadas, deadline)
            if complete and not args.sin_campos:
                complete = run_campos(page, F, deadline)
        finally:
            browser.close()
    print("Completo." if complete else "Incompleto: relanzar para seguir.")


if __name__ == "__main__":
    main()
