#!/usr/bin/env python3
"""fetch_fiflp_goleadores.py — Goleadores y clasificación oficial de cada grupo
de benjamín y prebenjamín de temporadas pasadas, de la web de la federación.

Recorre las competiciones del catálogo (fiflp_comps_catalog.json, las mismas
que las actas: benjamín y prebenjamín de fútbol 7/8, sin sala) y, de cada
grupo, guarda:
  - la clasificación (NFG_VisClasificacion, no ofuscada): para casar el grupo
    con el de la base aunque no tenga actas importadas;
  - los goleadores (NFG_CMP_Goleadores, aplanados con fiflp_render): jugador,
    equipo, partidos, goles y penaltis;
  - el escudo de cada equipo (la URL de la imagen que va en su celda de una
    jornada; --escudos rellena solo eso en los grupos ya leídos).

Solo escribe scripts/fiflp_goleadores_<S>_raw.json (reanudable: un grupo ya
leído no se vuelve a pedir). Lo importa el bot (import_fiflp_goleadores.py).
Solo funciona desde GitHub Actions (goleadores-federacion.yml): FIFLP contesta
vacío a las IPs domésticas.

  python3 scripts/fetch_fiflp_goleadores.py --temporadas 17,18,19,20,21 [--max-minutes 320]
"""
import argparse
import json
import sys
import time
from datetime import date
from pathlib import Path

# scripts/ (sus módulos) y la raíz (fetch_fiflp_actas importa scripts.acta_parser).
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(1, str(Path(__file__).resolve().parents[1]))
from fetch_fiflp_actas import SEASON_NAME, catalog_comps, _options  # noqa: E402
from fiflp_render import flatten, fiflp_only  # noqa: E402
from update_fiflp import GOLEADORES_URL, parse_goleadores  # noqa: E402

HERE = Path(__file__).resolve().parent


def raw_path(season_code):
    return HERE / f"fiflp_goleadores_{SEASON_NAME[season_code]}_raw.json"


def comp_names(season_code):
    """{id: nombre} de las competiciones de la temporada, del catálogo."""
    entry = json.loads((HERE / "fiflp_comps_catalog.json").read_text(encoding="utf-8")).get(SEASON_NAME[season_code]) or {}
    return {c["id"]: c["name"] for c in entry.get("all", [])}


def load(path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")


def done(entry):
    """Un grupo ya leído: la página de goleadores cargó (aunque no tenga ninguno)."""
    return bool(entry and entry.get("ok"))


CRESTS_JS = r"""() => {
  const out = {};
  for (const img of document.querySelectorAll('img[src*="/Clubes/"]')) {
    const cell = img.closest('td');
    if (!cell) continue;
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('script, style').forEach(n => n.remove());
    const name = clone.textContent.replace(/\s+/g, ' ').trim();
    if (name && name.length < 80 && !out[name]) out[name] = img.src;
  }
  return out;
}"""


def scrape_crests(page, F, season, comp, grupo, teams):
    """{equipo: URL de su escudo} de las jornadas del grupo (el escudo va en la celda
    del equipo): la que sirve por defecto y, si falta alguno (un descanso), otra."""
    base = f"{F.BASE}/NFG_CmpJornada?cod_primaria=1000120&CodTemporada={season}&CodCompeticion={comp}&CodGrupo={grupo}"
    crests = {}
    for url in (base, base + "&CodJornada=1", base + "&CodJornada=2"):
        if not F.goto(page, url):
            continue
        try:
            crests.update({k: v for k, v in (page.evaluate(CRESTS_JS) or {}).items() if k not in crests})
        except Exception:
            pass
        F.delay()
        if teams and all(t in crests for t in teams):
            break
    return crests


def scrape_group(page, F, season, comp, grupo):
    """(clasificación, goleadores, ok) de un grupo."""
    standings = []
    if F.goto(page, f"{F.BASE}/NFG_VisClasificacion?cod_primaria=1000120&CodTemporada={season}"
                    f"&codcompeticion={comp}&codgrupo={grupo}&codjornada=99"):
        standings = F.parse_standings(page)
    F.delay()
    if not F.goto(page, F.BASE + GOLEADORES_URL.format(comp=comp, season=season, group=grupo)):
        return standings, [], False
    flatten(page)
    scorers = [list(r) for r in parse_goleadores(page.content())]
    F.delay()
    return standings, scorers, True


def run(page, F, seasons, deadline, log=print, crests_only=False):
    for season in seasons:
        path = raw_path(season)
        data = load(path)
        names = comp_names(season)
        comps = catalog_comps(season)
        log(f"Temporada {SEASON_NAME[season]}: {len(comps)} competiciones")
        for comp in comps:
            if time.monotonic() > deadline:
                log("  plazo agotado: sigue en la próxima tanda")
                return False
            base = f"{F.BASE}/NFG_CmpJornada?cod_primaria=1000120&CodTemporada={season}&CodCompeticion={comp}"
            if not F.goto(page, base):
                log(f"  ! {comp}: no carga")
                continue
            try:
                labels = dict(page.evaluate("""() => Array.from(document.querySelectorAll('select[name="grupo"] option'))
                    .map(o => [o.value, o.text.trim()])""") or [])
            except Exception:
                labels = {}
            grupos = _options(page, "grupo")
            F.delay()
            new = 0
            for grupo in grupos:
                key = f"{comp}:{grupo}"
                if time.monotonic() > deadline:
                    break
                entry = data.get(key)
                if not done(entry):
                    if crests_only:
                        continue
                    standings, scorers, ok = scrape_group(page, F, season, comp, grupo)
                    entry = data[key] = {"comp": comp, "comp_name": names.get(comp, ""), "grupo": grupo,
                                         "grupo_name": labels.get(grupo, ""), "standings": standings,
                                         "scorers": scorers, "ok": ok, "fetched": date.today().isoformat()}
                    new += 1
                if "crests" not in entry:
                    teams = [r["team"] for r in entry.get("standings") or []]
                    entry["crests"] = scrape_crests(page, F, season, comp, grupo, teams)
                    new += 1
                save(path, data)
            log(f"  {comp} {names.get(comp, '')[:50]}: {len(grupos)} grupos, {new} leídos")
    return True


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--temporadas", default="17,18,19,20,21")
    ap.add_argument("--max-minutes", type=float, default=320)
    ap.add_argument("--escudos", action="store_true", help="solo los escudos de los grupos ya leídos")
    args = ap.parse_args(argv)
    seasons = [s.strip() for s in args.temporadas.split(",") if s.strip()]
    for s in seasons:
        if s not in SEASON_NAME:
            sys.exit(f"temporada desconocida: {s}")
    deadline = time.monotonic() + args.max_minutes * 60
    import fetch_fiflp_2425 as F
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"))
        fiflp_only(page)   # sin la publicidad de la federación, que colgaba las cargas
        page.set_default_timeout(30000)
        try:
            complete = run(page, F, seasons, deadline, crests_only=args.escudos)
        finally:
            browser.close()
    print("Completo." if complete else "Incompleto: relanzar para seguir.")


if __name__ == "__main__":
    main()
