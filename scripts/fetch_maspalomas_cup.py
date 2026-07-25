#!/usr/bin/env python3
"""
Maspalomas Cup — scraper + generador de `data-maspalomas-cup-2026.js`.

La API pública (`/api/public/partidos`) devuelve partidos PLANOS: matchNumber,
fecha, campo, equipos y marcador. NO expone ni grupo ni ronda, y no hay otros
endpoints (`/grupos`, `/clasificaciones`, `/equipos`… todos 404). Toda la
estructura se deduce del `matchNumber`, que el torneo asigna por bloques:

  Fase de grupos : bloque contiguo desde `base` (1001 prebenjamín, 2001
                   benjamín). Round-robin de 4 equipos = 6 partidos por grupo,
                   repartido cíclicamente → grupo = (n - base) % nº_grupos.
  Eliminatorias  : un bloque contiguo por copa. Dentro del bloque los números
                   son secuenciales por ronda y las rondas se cuentan HACIA
                   ATRÁS desde la final (1 Final, 2 Semifinales, 4 Cuartos,
                   8 Octavos, 16 Dieciseisavos…). Lo que sobra al principio del
                   bloque es la ronda Previa (en 2026: 17 grupos × 2
                   clasificados = 34 equipos → 2 eliminatorias para bajar a 32).

Las LETRAS de grupo no las da la API: se tomaron de maspalomascup.es y viven en
GROUP_LETTERS. Si el formato del torneo cambia (otro número de grupos, grupos de
distinto tamaño, un bracket que no cuadre), la validación aborta en voz alta en
vez de publicar un fichero roto.

Uso:
    python3 scripts/fetch_maspalomas_cup.py              # baja de la API y genera
    python3 scripts/fetch_maspalomas_cup.py --from-raw   # regenera desde el raw
    python3 scripts/fetch_maspalomas_cup.py --check      # verifica sin escribir
"""
import argparse
import datetime
import json
import os
import sys

API_URL = "https://www.maspalomascup.es/api/public/partidos"
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "maspalomas_cup_2026_raw.json")
JS_PATH = os.path.join(PROJECT_ROOT, "data-maspalomas-cup-2026.js")

EDITION = "Maspalomas Cup 2026"
PHASE = "Maspalomas Cup"
ISLAND = "grancanaria"

# Categorías que publica el portal (Alevín queda fuera de su alcance).
CATEGORIES = [
    # (nombre API, prefijo de código, variable JS)
    ("Prebenjamín", "MCP", "MASPALOMAS_CUP_PREBENJAMIN"),
    ("Benjamín", "MCB", "MASPALOMAS_CUP_BENJAMIN"),
]

# Letra de cada grupo por su clase de resto (n - base) % nº_grupos. No sale de
# la API: es metadato del torneo, copiado de maspalomascup.es. Reordenar esta
# lista es la única forma de corregir la asignación de letras.
GROUP_LETTERS = {
    "Prebenjamín": ["A", "F", "C", "E", "D", "B"],
    "Benjamín": ["N", "D", "B", "E", "I", "H", "O", "P", "F", "Q", "C", "M",
                 "G", "L", "A", "J", "K"],
}

MATCHES_PER_GROUP = 6  # round-robin de 4 equipos
ROUND_ROBIN_TEAMS = 4

# Nombres de ronda de una eliminatoria, del final hacia atrás.
ROUND_NAMES_FROM_END = ["Final", "Semifinales", "Cuartos", "Octavos",
                        "Dieciseisavos", "Treintaidosavos"]
PRELIM_ROUND_NAME = "Previa"

# Las copas se ordenan de menor a mayor número de partido: Plata (consolación)
# antes que Oro (cuadro principal). Se valida contra la composición real.
CUP_NAMES = ["Copa Plata", "Copa Oro"]


class StructureError(RuntimeError):
    """El torneo no encaja con el formato asumido: abortar sin escribir nada."""


# ─── FETCH ─────────────────────────────────────────────────────────────────────

def fetch_partidos():
    """Descarga los partidos de la API (Vercel Security Checkpoint → cloudscraper)."""
    import cloudscraper
    s = cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "darwin", "mobile": False}
    )
    resp = s.get(API_URL, timeout=45)
    if resp.status_code != 200:
        raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")
    return resp.json().get("scheduledMatches", [])


# ─── NORMALIZACIÓN ─────────────────────────────────────────────────────────────

def _dt(match):
    return datetime.datetime.fromisoformat(match["date"].replace("Z", "+00:00"))


def short_field(field):
    """'Campo CD 3.1 - Campo Danone 1' → 'CD 3.1'."""
    if not field:
        return ""
    head = field.split(" - ")[0]
    return head[len("Campo "):] if head.startswith("Campo ") else head


def normalize(match):
    """Partido de la API → dict interno con lo que usa el portal."""
    d = _dt(match)
    return {
        "n": match.get("matchNumber"),
        "kickoff": d,
        "day": d.strftime("%d/%m"),
        "time": d.strftime("%H:%M"),
        "date_key": d.strftime("%d-%m-%Y"),
        "home": match.get("homeTeamName"),
        "away": match.get("awayTeamName"),
        "hs": match.get("homeScore"),
        "as": match.get("awayScore"),
        "field": match.get("field") or "",
        "pen": _penalty_winner(match),
    }


def _penalty_winner(match):
    """'home' / 'away' si el partido se decidió en los penaltis, si no None."""
    if (match.get("penaltyStatus") or "none") == "none":
        return None
    winner = match.get("penaltyWinner")
    return winner if winner in ("home", "away") else None


def by_kickoff(m):
    """Orden de juego: hora y, a igual hora, número de partido."""
    return (m["kickoff"], m["n"])


def row_full(m, abbreviate_field=False):
    """Fila de la lista `matches` de un grupo (7 columnas).

    La fase de grupos publica el nombre completo del campo ('Campo CD 1.1 -
    Campo Joma 1') y las eliminatorias su forma corta ('CD 1.1').
    """
    field = short_field(m["field"]) if abbreviate_field else m["field"]
    return [m["day"], m["time"], m["home"], m["away"], m["hs"], m["as"], field]


def row_short(m):
    """Fila de una ronda dentro de `jornadas`.

    5 columnas, más una 6ª OPCIONAL con quién ganó la tanda de penaltis
    ('home'/'away') cuando el partido acabó en empate. El frontend deduce el que
    pasa mirando quién aparece en la ronda siguiente, pero eso no funciona en la
    final: sin este dato la Copa Oro benjamín 2026 (2-2, penaltis 3-4) se queda
    sin campeón visible. Las rondas sin penaltis mantienen las 5 columnas de
    siempre, igual que los datos históricos.
    """
    row = [m["day"], m["home"], m["away"], m["hs"], m["as"]]
    if m["pen"]:
        row.append(m["pen"])
    return row


# ─── CLASIFICACIONES ───────────────────────────────────────────────────────────

def standings_from(matches):
    """Clasificación canónica [pos, equipo, pts, J, G, E, P, GF, GC, DF].

    3/1/0; desempate por puntos, diferencia de goles, goles a favor y nombre.
    """
    table = {}
    for m in matches:
        if m["hs"] is None or m["as"] is None:
            continue
        for name in (m["home"], m["away"]):
            table.setdefault(name, dict(pts=0, j=0, g=0, e=0, p=0, gf=0, gc=0))
        home, away = table[m["home"]], table[m["away"]]
        home["j"] += 1
        away["j"] += 1
        home["gf"] += m["hs"]
        home["gc"] += m["as"]
        away["gf"] += m["as"]
        away["gc"] += m["hs"]
        if m["hs"] > m["as"]:
            home["g"] += 1
            home["pts"] += 3
            away["p"] += 1
        elif m["hs"] < m["as"]:
            away["g"] += 1
            away["pts"] += 3
            home["p"] += 1
        else:
            home["e"] += 1
            away["e"] += 1
            home["pts"] += 1
            away["pts"] += 1

    ordered = sorted(table.items(),
                     key=lambda kv: (-kv[1]["pts"],
                                     -(kv[1]["gf"] - kv[1]["gc"]),
                                     -kv[1]["gf"],
                                     kv[0]))
    return [[i + 1, name, v["pts"], v["j"], v["g"], v["e"], v["p"],
             v["gf"], v["gc"], v["gf"] - v["gc"]]
            for i, (name, v) in enumerate(ordered)]


# ─── ESTRUCTURA ────────────────────────────────────────────────────────────────

def contiguous_blocks(numbers):
    """Parte una lista de enteros ordenada en bloques de números consecutivos."""
    blocks = []
    for n in sorted(numbers):
        if blocks and n == blocks[-1][-1] + 1:
            blocks[-1].append(n)
        else:
            blocks.append([n])
    return blocks


def split_rounds(matches):
    """Reparte los partidos de una eliminatoria en rondas.

    Los `matchNumber` son secuenciales por ronda, así que las rondas se cortan
    desde el final: 1 Final, 2 Semifinales, 4 Cuartos, 8 Octavos… El resto que
    quede al principio es la ronda Previa (nunca es una ronda completa: en 2026
    son 4 partidos con 4 exentos en prebenjamín y 2 partidos en benjamín).
    Devuelve [(nombre, [partidos])] en orden CRONOLÓGICO (previa primero, final
    al final), y dentro de cada ronda los partidos por hora de juego.
    """
    ms = sorted(matches, key=lambda m: m["n"])
    rounds = []
    remaining = len(ms)
    for size, name in zip((1, 2, 4, 8, 16, 32), ROUND_NAMES_FROM_END):
        if remaining < size:
            break
        rounds.append((name, size))
        remaining -= size
    if remaining:
        rounds.append((PRELIM_ROUND_NAME, remaining))

    out = []
    end = len(ms)
    for name, size in rounds:          # rounds va de la final hacia atrás
        out.append((name, sorted(ms[end - size:end], key=by_kickoff)))
        end -= size
    if end != 0:
        raise StructureError(f"eliminatoria de {len(ms)} partidos sin repartir")
    out.reverse()                      # → orden cronológico
    return out


def build_group_stage(matches, category, prefix):
    """Grupos de la fase de grupos, ordenados por letra."""
    letters = GROUP_LETTERS[category]
    n_groups = len(letters)
    base = min(m["n"] for m in matches)
    expected = n_groups * MATCHES_PER_GROUP

    stage_block = contiguous_blocks([m["n"] for m in matches])[0]
    if len(stage_block) != expected:
        raise StructureError(
            f"{category}: fase de grupos de {len(stage_block)} partidos, "
            f"se esperaban {expected} ({n_groups} grupos × {MATCHES_PER_GROUP}). "
            f"¿Cambió el formato del torneo? Revisa GROUP_LETTERS.")

    by_letter = {}
    for m in matches:
        if m["n"] not in stage_block:
            continue
        by_letter.setdefault(letters[(m["n"] - base) % n_groups], []).append(m)

    groups = []
    for idx, letter in enumerate(sorted(by_letter)):
        ms = sorted(by_letter[letter], key=lambda m: m["n"])
        teams = {t for m in ms for t in (m["home"], m["away"])}
        if len(ms) != MATCHES_PER_GROUP or len(teams) != ROUND_ROBIN_TEAMS:
            raise StructureError(
                f"{category} Grupo {letter}: {len(ms)} partidos y {len(teams)} "
                f"equipos; se esperaba un round-robin de {ROUND_ROBIN_TEAMS}.")
        name = f"Grupo {letter}"
        groups.append({
            "id": f"{prefix}{idx + 1}",
            "name": name,
            "fullName": f"{EDITION} - {category} - {name}",
            "phase": PHASE,
            "island": ISLAND,
            "url": "",
            "jornada": "Fase de Grupos",
            "standings": standings_from(ms),
            "matches": [row_full(m) for m in ms],
        })
    return groups, set(stage_block)


def build_cups(matches, category, prefix, stage_block, group_stage):
    """Cuadros de eliminatorias (Plata y Oro), con las rondas en orden."""
    ko = [m for m in matches if m["n"] not in stage_block]
    if not ko:
        return []
    blocks = contiguous_blocks([m["n"] for m in ko])
    if len(blocks) != len(CUP_NAMES):
        raise StructureError(
            f"{category}: {len(blocks)} cuadros de eliminatorias, se esperaban "
            f"{len(CUP_NAMES)} ({', '.join(CUP_NAMES)}).")

    # Los 2 primeros de cada grupo van al cuadro principal (Oro). Se comprueba
    # contra la composición real en vez de fiarse del orden de numeración.
    top2 = {row[1] for g in group_stage for row in g["standings"][:2]}
    scored = []
    for block in blocks:
        ms = [m for m in ko if m["n"] in block]
        teams = {t for m in ms for t in (m["home"], m["away"])}
        scored.append((len(teams & top2) / max(len(teams), 1), block, ms))

    gold = max(scored, key=lambda s: s[0])
    if gold[1] is not blocks[-1]:
        raise StructureError(
            f"{category}: el cuadro con más cabezas de serie no es el de "
            f"números más altos; revisa la asignación Oro/Plata.")

    cups = []
    for idx, (_, block, ms) in enumerate(scored):
        name = CUP_NAMES[idx]
        rounds = split_rounds(ms)
        jornadas = {}
        for round_name, round_matches in rounds:
            key = f"{round_matches[0]['date_key']} ( {round_name} )"
            jornadas[key] = [row_short(m) for m in round_matches]
        cups.append({
            "id": f"{prefix}K{idx + 1}",
            "name": name,
            "fullName": f"{EDITION} - {category} - {name}",
            "phase": PHASE,
            "island": ISLAND,
            "url": "",
            "jornada": "Eliminatorias",
            "standings": [],
            "jornadas": jornadas,
            "matches": [row_full(m, abbreviate_field=True)
                        for m in sorted(ms, key=lambda m: m["n"])],
        })
    return cups


def build_category(api_matches, category, prefix):
    """Todos los grupos publicables de una categoría."""
    matches = [normalize(m) for m in api_matches
               if m.get("categoryName") == category]
    if not matches:
        raise StructureError(f"{category}: la API no devolvió partidos.")
    groups, stage_block = build_group_stage(matches, category, prefix)
    return groups + build_cups(matches, category, prefix, stage_block, groups)


def build_all(api_matches):
    """{variable JS: [grupos]} para cada categoría publicable."""
    return {var: build_category(api_matches, cat, prefix)
            for cat, prefix, var in CATEGORIES}


# ─── SALIDA ────────────────────────────────────────────────────────────────────

def render_js(data, updated=None):
    stamp = updated or datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    out = [f"// {EDITION} - Generado desde maspalomascup.es API",
           f"// Actualizado: {stamp}"]
    for _, _, var in CATEGORIES:
        out.append(f"const {var} = {json.dumps(data[var], ensure_ascii=False)};")
    return "\n".join(out) + "\n"


# ─── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--from-raw", action="store_true",
                    help="regenera desde el raw guardado, sin tocar la red")
    ap.add_argument("--check", action="store_true",
                    help="verifica que el .js publicado está al día, sin escribir")
    args = ap.parse_args()

    if args.from_raw:
        with open(RAW_PATH, encoding="utf-8") as f:
            api_matches = json.load(f)
        print(f"Raw: {len(api_matches)} partidos desde {os.path.basename(RAW_PATH)}")
    else:
        print("Descargando partidos de la Maspalomas Cup…")
        api_matches = fetch_partidos()
        print(f"API: {len(api_matches)} partidos")

    try:
        data = build_all(api_matches)
    except StructureError as e:
        print(f"\nESTRUCTURA INESPERADA — no se escribe nada:\n  {e}", file=sys.stderr)
        sys.exit(1)

    js = render_js(data)

    if args.check:
        current = open(JS_PATH, encoding="utf-8").read() if os.path.exists(JS_PATH) else ""
        # La cabecera lleva fecha de generación: se compara solo el cuerpo.
        same = current.split("\n")[2:] == js.split("\n")[2:]
        print("Al día." if same else "DESFASADO: el .js publicado no coincide.")
        sys.exit(0 if same else 1)

    if not args.from_raw:
        with open(RAW_PATH, "w", encoding="utf-8") as f:
            json.dump(api_matches, f, ensure_ascii=False, indent=1)
        print(f"Guardado raw: {os.path.basename(RAW_PATH)}")

    with open(JS_PATH, "w", encoding="utf-8") as f:
        f.write(js)
    print(f"Guardado: {os.path.basename(JS_PATH)}")

    for cat, _, var in CATEGORIES:
        groups = data[var]
        cups = [g for g in groups if g.get("jornadas")]
        print(f"  {cat}: {len(groups) - len(cups)} grupos + "
              f"{len(cups)} cuadros ({', '.join(g['name'] for g in cups)})")


if __name__ == "__main__":
    main()
