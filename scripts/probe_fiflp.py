#!/usr/bin/env python3
"""probe_fiflp.py — Sonda de la web de la federación (FIFLP, plataforma NFG):
qué páginas públicas hay para un grupo y qué traen (goleadores, actas con
alineaciones, fichas de equipo y de jugador, sanciones…), sin escribir nada en
la base. Solo funciona desde GitHub Actions (FIFLP contesta vacío a las IPs
domésticas): el workflow probe-fiflp.yml sube probe_out/ como artefacto y se
analiza en local con `gh run download`.

Qué hace:
  1. Abre la jornada y la clasificación del grupo, carga cada jornada con
     BuscarPartidos y recoge TODOS los enlaces y onclick que apuntan a la
     plataforma (NFG_*), con sus parámetros.
  2. Por cada tipo de página (NFG_xxx) descubierto, abre hasta SAMPLES
     ejemplos y guarda el HTML y un resumen (URL final, título, tamaño, tablas,
     si pide acceso/login).
  3. Prueba además nombres de página típicos de la plataforma que no aparezcan
     enlazados (goleadores, sanciones, equipos…), con los parámetros del grupo.

Variables: PROBE_SEASON (22), PROBE_COMP, PROBE_GRUPO, PROBE_SAMPLES (3),
PROBE_EXTRA (URLs relativas a NPcd separadas por espacios).
"""
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

BASE = "https://www.fiflp.com/pnfg/NPcd"
OUT = Path(os.environ.get("PROBE_OUT", "probe_out"))
SEASON = os.environ.get("PROBE_SEASON", "22")
COMP = os.environ.get("PROBE_COMP", "54976982")
GRUPO = os.environ.get("PROBE_GRUPO", "55141374")
SAMPLES = int(os.environ.get("PROBE_SAMPLES", "3"))
EXTRA = os.environ.get("PROBE_EXTRA", "").split()

# Nombres habituales de la plataforma NFG que pueden existir sin estar enlazados.
GUESSES = [
    "NFG_VisGoleadores", "NFG_LstGoleadores", "NFG_CmpGoleadores", "NFG_ClasificacionGoleadores",
    "NFG_VisSanciones", "NFG_LstSanciones", "NFG_CmpSanciones", "NFG_LstEquipos", "NFG_VisEquipos",
    "NFG_CmpEquipo", "NFG_VisCalendario", "NFG_CmpCalendario", "NFG_LstPartidos", "NFG_VisJugadores",
    "NFG_CmpJugador", "NFG_VisTarjetas", "NFG_LstTarjetas", "NFG_VisArbitros", "NFG_CmpArbitro",
]
PARAMS = (f"cod_primaria=1000120&CodTemporada={SEASON}&CodCompeticion={COMP}&CodGrupo={GRUPO}"
          f"&codtemporada={SEASON}&codcompeticion={COMP}&codgrupo={GRUPO}")

NFG_RE = re.compile(r"(NFG_[A-Za-z_]+)(\?[^\"'\s<>)]*)?")


def wait():
    time.sleep(2.5)


def summary(page, url, html):
    text = page.inner_text("body") if html else ""
    final = page.url
    return {
        "url": url, "final": final, "title": page.title(), "bytes": len(html),
        "tables": page.evaluate("() => Array.from(document.querySelectorAll('table')).map(t => t.rows.length)"),
        "login": bool(re.search(r"login|acceso|identif|contrase", final + " " + text[:3000], re.I)),
        "text": re.sub(r"\s+", " ", text)[:2500],
    }


def links_in(page):
    """Todos los destinos NFG_* de enlaces, onclick y scripts de la página."""
    html = page.content()
    found = {}
    for name, query in NFG_RE.findall(html):
        found.setdefault(name, set()).add((query or "").replace("&amp;", "&"))
    return found


def save(name, page, url):
    html = page.content()
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", name)[:120]
    (OUT / f"{safe}.html").write_text(html, encoding="utf-8")
    return summary(page, url, html)


def main():
    from playwright.sync_api import sync_playwright
    OUT.mkdir(parents=True, exist_ok=True)
    report = {"season": SEASON, "comp": COMP, "grupo": GRUPO, "pages": [], "endpoints": {}}
    endpoints = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"))
        page.set_default_timeout(30000)

        def visit(name, url):
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
                page.wait_for_timeout(3000)
                info = save(name, page, url)
                for k, v in links_in(page).items():
                    endpoints.setdefault(k, set()).update(v)
                report["pages"].append({"name": name, **info})
                print(f"[{name}] {info['bytes']}B tablas={info['tables'][:8]} login={info['login']} → {info['final'][:120]}")
            except Exception as e:
                report["pages"].append({"name": name, "url": url, "error": str(e)[:300]})
                print(f"[{name}] ERROR {e}")
            wait()

        jornada_url = f"{BASE}/NFG_CmpJornada?cod_primaria=1000120&CodTemporada={SEASON}&CodCompeticion={COMP}&CodGrupo={GRUPO}"
        visit("jornada", jornada_url)
        options = page.evaluate("""() => { const s = document.querySelector('select[name="jornada"]');
            return s ? Array.from(s.options).filter(o => o.value && o.value !== '0').map(o => [o.value, o.text.trim()]) : []; }""")
        for value, text in options[:3]:
            try:
                page.evaluate(f"BuscarPartidos('{value}')")
                page.wait_for_timeout(3000)
                info = save(f"jornada_{value}", page, f"{jornada_url}#BuscarPartidos({value})")
                for k, v in links_in(page).items():
                    endpoints.setdefault(k, set()).update(v)
                report["pages"].append({"name": f"jornada {text}", **info})
                print(f"[jornada {text}] enlaces: {sorted(links_in(page))}")
            except Exception as e:
                print(f"[jornada {text}] ERROR {e}")
            wait()
        visit("clasificacion", f"{BASE}/NFG_VisClasificacion?cod_primaria=1000120&CodTemporada={SEASON}"
                               f"&codcompeticion={COMP}&codgrupo={GRUPO}&codjornada=99")

        report["endpoints"] = {k: sorted(v)[:40] for k, v in endpoints.items()}
        print("\nTIPOS DE PÁGINA ENLAZADOS:")
        for k, v in sorted(endpoints.items()):
            print(f"  {k}: {len(v)} variantes, p.ej. {sorted(v)[:2]}")

        skip = {"NFG_CmpJornada", "NFG_VisClasificacion"}
        for name, queries in sorted(endpoints.items()):
            if name in skip:
                continue
            for i, q in enumerate([q for q in sorted(queries) if q][:SAMPLES]):
                visit(f"{name}_{i}", f"{BASE}/{name}{q}")
        for name in GUESSES:
            if name not in endpoints:
                visit(f"guess_{name}", f"{BASE}/{name}?{PARAMS}")
        for rel in EXTRA:
            visit(f"extra_{rel}", f"{BASE}/{rel}")
        browser.close()
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{len(report['pages'])} páginas en {OUT}/")


if __name__ == "__main__":
    sys.exit(main())
