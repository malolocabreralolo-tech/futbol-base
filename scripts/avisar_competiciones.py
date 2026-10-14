#!/usr/bin/env python3
"""avisar_competiciones.py — Una issue por cada competición nueva de la federación.

update_fiflp.check_competitions apunta en data-health.json (newCompetitions: [{id, name, firstSeen}])
las competiciones de benjamín, prebenjamín y alevín de Gran Canaria que la federación publica y la
temporada en curso no tiene (la Segunda Fase, una fase insular). update.yml llama a este guion tras
el bot, con GH_TOKEN: abre una issue por competición (GitHub avisa por correo) y nunca la repite,
porque antes busca su código en las issues, también en las cerradas: cerrar la issue es decir «esta
no». El repositorio es público: la issue lleva solo el nombre y el código de la competición.

    python3 scripts/avisar_competiciones.py [data-health.json]
"""
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def title(comp):
    return f"Competición nueva en la federación: {comp['name']} ({comp['id']})"


def season_code(season):
    """El CodTemporada de la federación: 2016-2017 → 12, 2026-2027 → 22."""
    m = re.match(r"(\d{4})-\d{4}$", season or "")
    return str(int(m.group(1)) - 2004) if m else "<CodTemporada>"


def body(comp, season):
    cid, code = comp["id"], season_code(season)
    raw = f"scripts/fiflp_islas_{code}_raw.json"
    alevin = "ALEVIN" in unicodedata.normalize("NFD", comp["name"]).encode("ascii", "ignore").decode().upper()
    return "\n".join([
        f"La federación (FIFLP) publica en la temporada {season} una competición que la web todavía no tiene:",
        "",
        f"- **{comp['name']}** (CodCompeticion {cid}), vista por primera vez el {comp.get('firstSeen') or '—'}.",
        "",
        "Para añadirla (docs/temporada-nueva.md, «fase nueva»), sin ningún workflow en marcha:",
        "",
        "```bash",
        f"gh workflow run fetch-fiflp-islas.yml -f temporada={code} -f ids={cid}   # sus grupos, al raw",
        f"python3 scripts/fiflp_manifest.py {raw} {season} --comps {cid} > fase.json",
        f"python3 scripts/activate_season.py fase.json --fiflp-raw {raw} --add          # comprueba",
        f"python3 scripts/activate_season.py fase.json --fiflp-raw {raw} --add --apply  # escribe",
        "```",
        "",
        *(["Es de alevín: antes, comprobar que la descarga, el manifiesto y la activación ya admiten esa "
           "categoría (códigos AL…).", ""] if alevin else []),
        "Si no hay que añadirla, basta con cerrar esta issue: el bot no vuelve a abrirla. Para que deje de "
        "salir en Datos y fuentes, su código va en `IGNORED_COMPETITIONS` de scripts/update_fiflp.py.",
        "",
        "Aviso automático del bot (update.yml, avisar_competiciones.py).",
    ])


def gh(args):
    return subprocess.run(["gh", *args], capture_output=True, text=True, check=True).stdout


def has_issue(cid, gh=gh):
    """¿Hay ya una issue (abierta o cerrada) con este código en el título?"""
    out = gh(["issue", "list", "--state", "all", "--search", f"{cid} in:title",
              "--json", "number,title", "--limit", "100"])
    return any(f"({cid})" in (issue.get("title") or "") for issue in json.loads(out or "[]"))


def valid(comp):
    return (isinstance(comp, dict) and re.fullmatch(r"\d{1,12}", str(comp.get("id") or ""))
            and str(comp.get("name") or "").strip())


def main(argv=None, gh=gh, log=print):
    argv = sys.argv[1:] if argv is None else argv
    path = Path(argv[0]) if argv else ROOT / "data-health.json"
    try:
        health = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        log("Sin data-health.json: nada que avisar")
        return 0
    comps = [c for c in health.get("newCompetitions") or [] if valid(c)]
    if not comps:
        log("Sin competiciones nuevas en la federación")
        return 0
    season = health.get("season") or "en curso"
    for comp in comps:
        comp = {**comp, "name": re.sub(r"\s+", " ", str(comp["name"])).strip()[:200]}
        if has_issue(comp["id"], gh):
            log(f"  {comp['id']}: ya tiene su issue")
            continue
        gh(["issue", "create", "--title", title(comp), "--body", body(comp, season)])
        log(f"  {comp['id']}: issue abierta ({comp['name']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
