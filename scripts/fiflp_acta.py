"""fiflp_acta.py — Acta de la federación (NFG_CmpPartido) ya APLANADA con
fiflp_render.FLATTEN_JS → dict listo para import_fiflp_actas._import_one.

Con la ofuscación resuelta en el navegador, el acta visible es texto limpio
dividido en bloques con título (<div class="number">): «Árbitros», «Goles» y
uno por equipo (local primero) con Titulares, Suplentes y Cuerpo Técnico. Cada
fila de jugador enlaza su ficha (NFG_EstadisticasJugador?jugador=N): ese N es
el id del jugador en la federación, estable entre temporadas.

El marcador sale de la cabecera, y se comprueba con los marcadores parciales
de los goles (deben subir de uno en uno y acabar en el final): `consistent`
dice si cuadran. Un gol en propia puerta suma al rival del que lo marca.

Forma (compatible con acta_parser.parse_acta, con campos de más):
  header  {season, jornada, date, time, competition, home_team, away_team,
           home_score, away_score, venue, city}
  lineups {home: [{dorsal, name, role, fiflp_id}], away: [...]}
  events  [{kind:'goal', side, player_name, minute, goal_type, score:[h,a]}]
  staff   {referee, referees:[...], coach_home, coach_away,
           delegates_home:{campo, equipo}, delegates_away:{...}}
  consistent  bool
"""
import html as _html
import re

def _goal_type(row):
    """Tipo de gol por el título del icono ('Gol normal', 'Gol de penalti',
    'Gol en propia puerta'); la clase (lgol, lgolpp…) como respaldo."""
    title = re.search(r'class="img (lgol\w*)"[^>]*title="([^"]*)"', row) or re.search(r'title="([^"]*)"[^>]*class="img (lgol\w*)"', row)
    text = (title.group(0) if title else "").lower()
    if "propia" in text or "lgolpp" in text:
        return "own"
    if "penal" in text:
        return "penalty"
    return "normal"


def _person(value):
    """'No presenta' / vacío → None."""
    value = (value or "").strip()
    return None if not value or value.lower().startswith("no presenta") else value


def _text(fragment):
    """HTML → texto con un salto por fila/celda/bloque, espacios normalizados."""
    t = re.sub(r"(?i)<br\s*/?>|</(?:tr|p|div|h\d|li|table)>", "\n", fragment)
    t = re.sub(r"(?i)</t[dh]>", "\t", t)
    t = _html.unescape(re.sub(r"<[^>]+>", "", t)).replace("\xa0", " ")
    lines = [re.sub(r"[ \t]+", " ", l).strip() for l in t.split("\n")]
    return "\n".join(l for l in lines if l)


def _blocks(html):
    """[(título, html del bloque)] de los <div class="number">."""
    marks = list(re.finditer(r'<div class="number"[^>]*>(.*?)</div>', html, re.S))
    out = []
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(html)
        out.append((_text(m.group(1)), html[m.end():end]))
    return out


def _header(html, blocks):
    first = html.find('<div class="number"')
    text = _text(html[:first if first > 0 else len(html)])
    h = {}
    m = re.search(r"Temporada (\d{4})[-/](\d{4})\s+Jornada\s+(\S+)\s+(\d{2}-\d{2}-\d{4})(?:\s+(\d{1,2}:\d{2}))?", text)
    if m:
        h.update(season=f"{m.group(1)}/{m.group(2)}", jornada=m.group(3), date=m.group(4), time=m.group(5))
        tail = [l.strip() for l in text[m.end():].split("\n")]
        tail = [l for l in tail if l and l != "h"]
        h["competition"] = tail[0] if tail else None
        scores = [re.fullmatch(r"(\d+)\s*-\s*(\d+)", l) for l in tail[:8]]
        score = next((s for s in scores if s), None)
        if score:
            h["home_score"], h["away_score"] = int(score.group(1)), int(score.group(2))
    teams = [t for t, b in blocks if "Titulares" in b or "Suplentes" in b]
    h["home_team"] = teams[0] if teams else None
    h["away_team"] = teams[1] if len(teams) > 1 else None
    venue = re.search(r"Estadio:\s*([^\n]+)", _text(html))
    city = re.search(r"Ciudad:\s*([^\n]+)", _text(html))
    h["venue"] = venue.group(1).strip() if venue else None
    h["city"] = city.group(1).strip() if city else None
    h.setdefault("home_score", None)
    h.setdefault("away_score", None)
    return h


def _players(table_html, role):
    out = []
    for row in re.findall(r"<tr\b.*?</tr>", table_html, re.S):
        cells = [_text(c) for c in re.findall(r"<td\b[^>]*>(.*?)</td>", row, re.S)]
        if len(cells) < 2 or not cells[-1]:
            continue
        pid = re.search(r"jugador=(\d+)", row)
        dorsal = re.fullmatch(r"\d+", cells[0] or "")
        out.append({"dorsal": int(cells[0]) if dorsal else None, "name": cells[-1],
                    "role": role, "fiflp_id": int(pid.group(1)) if pid else None})
    return out


def _team(block_html):
    starters = re.search(r"Titulares(.*?)(?:Suplentes|Cuerpo T|$)", block_html, re.S)
    subs = re.search(r"Suplentes(.*?)(?:Cuerpo T|$)", block_html, re.S)
    lineup = _players(starters.group(1), "starter") if starters else []
    lineup += _players(subs.group(1), "sub") if subs else []
    staff_text = _text(block_html[block_html.find("Cuerpo T"):]) if "Cuerpo T" in block_html else ""
    grab = lambda label: (re.search(rf"{label}:\s*([^\n]+)", staff_text) or [None, None])[1]
    staff = {"coach": grab("Entrenador"), "campo": grab(r"DEL\. Campo"), "equipo": grab(r"DEL\. Equipo")}
    return lineup, {k: _person(v) for k, v in staff.items()}


def _goals(block_html):
    goals = []
    for row in re.findall(r"<tr\b.*?</tr>", block_html, re.S):
        cells = re.findall(r"<td\b[^>]*>(.*?)</td>", row, re.S)
        if len(cells) < 2:
            continue
        score = re.search(r"(\d+)\s*-\s*(\d+)", _text(cells[0]))
        rest = _text(cells[1])
        minute = re.search(r"\((\d+)'\)", rest)
        name = re.sub(r"\(\d+'\)", "", rest).strip()
        if not score:
            continue
        # Sin nombre: un niño cuyo nombre la federación no publica. El gol
        # cuenta igual (si no, el marcador parcial «salta» y el acta no cuadra).
        goals.append({"score": [int(score.group(1)), int(score.group(2))],
                      "minute": int(minute.group(1)) if minute else None, "player_name": name or None,
                      "goal_type": _goal_type(row)})
    return goals


def parse_flat_acta(html):
    blocks = _blocks(html)
    header = _header(html, blocks)
    team_blocks = [b for t, b in blocks if "Titulares" in b or "Suplentes" in b]
    (home, staff_h), (away, staff_a) = [_team(b) for b in team_blocks[:2]] + [([], {})] * (2 - len(team_blocks[:2]))
    ref_block = next((b for t, b in blocks if t.startswith("Árbitro")), "")
    referees = [l for l in _text(ref_block).split("\n") if l]
    referee = _person(next((re.sub(r"^Árbitro/a Principal\s*", "", l) for l in referees if l.startswith("Árbitro/a Principal")), None))
    goals_block = next((b for t, b in blocks if t == "Goles"), "")
    raw_goals = _goals(goals_block)

    events, prev, consistent = [], [0, 0], True
    for g in raw_goals:
        h, a = g["score"]
        if (h, a) == (prev[0] + 1, prev[1]):
            side = "home"
        elif (h, a) == (prev[0], prev[1] + 1):
            side = "away"
        else:
            side, consistent = None, False
        prev = [h, a]
        # En propia puerta suma al rival del que marca: el autor es del otro lado.
        scorer_side = ({"home": "away", "away": "home"}.get(side) if g["goal_type"] == "own" else side)
        events.append({"kind": "goal", "side": scorer_side, "player_name": g["player_name"],
                       "minute": g["minute"], "goal_type": g["goal_type"], "score": g["score"]})
    final = (header.get("home_score"), header.get("away_score"))
    if raw_goals and tuple(prev) != final:
        consistent = False
    if not raw_goals and final not in ((0, 0), (None, None)):
        consistent = False
    return {
        "header": header,
        "lineups": {"home": home, "away": away},
        "events": events,
        "staff": {"referee": referee, "referees": referees,
                  "coach_home": staff_h.get("coach"), "coach_away": staff_a.get("coach"),
                  "delegates_home": {k: staff_h.get(k) for k in ("campo", "equipo")},
                  "delegates_away": {k: staff_a.get(k) for k in ("campo", "equipo")}},
        "consistent": consistent,
    }
