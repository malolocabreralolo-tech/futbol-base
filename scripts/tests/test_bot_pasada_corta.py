"""Pasadas cortas y más frecuentes del bot de la federación: una semana simulada, sin red (16/10/2026).

Lo medido en las pasadas reales 1107-1110 (15-16/10/2026): la federación sirve ~15 documentos por IP y
luego bloquea, y el bloqueo ESCALA dentro de una pasada: el 1.º dura ~300 s, el 2.º ~900 s y el 3.º más
que el plazo. Cada ejecución de GitHub tiene una IP nueva y vuelve a empezar con 5 min. Con el cron cada
6 h y 33 min de plazo, cada pasada daba ~45 páginas útiles, ~33 de ellas para los seis grupos de Las
Mesas, y solo ~3 grupos más, sin sus actas ni sus goleadores.

Lo decidido: pasadas CORTAS y MÁS FRECUENTES, una cada vez (sin IPs en paralelo): cada pasada espera solo
el primer freno (fiflp_carga.BRAKE_PAUSES = 1) y acaba en el segundo, con el cron cada 2 h (desde el
17/10/2026, el reloj: abajo); los prioritarios, solo cuando toca (más de 6 h desde su última comprobación,
o un partido suyo recién jugado sin resultado o con su acta por leer, durante 12 h:
update_fiflp.plan_groups); y cada grupo, completo (calendario, goleadores y actas pendientes) antes del
siguiente.

La simulación: la temporada llena de test_bot_rotacion (81 grupos, los siete de Las Mesas Huracán), cada
grupo con seis equipos y una jornada por semana (tres partidos, el sábado o el domingo), una semana de
pasadas desde el jueves 15/10/2026 00:23 UTC (una cada 2 h; con el código de antes, cada 6 h) y, para la
información completa de cada grupo (c), tres (LONG_DAYS: es un máximo, y una sola lo truncaba). La
federación publica cada resultado entre 1,5 y 7,5 h después del saque y el acta, a la vez o unas horas
más tarde (antes, el acta no se puede leer: «se reintentará»); sirve 15 páginas por IP y frena 300, 900
y 2700 s, y cada pasada empieza con el cupo entero (IP nueva). La base de partida es la de ahora: la
jornada anterior a medias (actas pendientes, 28 grupos con «error» heredado del 14/10 y sin sus
resultados) y ocho grupos de la Segunda Fase recién activados (primera pasada completa). Entre pasadas,
la base y data-health.json pasan tal cual (data-health.json solo si se reescribe, como en update.yml).

`simulate` sirve también para el código de antes (con sus módulos en sys.path): así se midieron los
números de «antes» de docs/federacion.md («Lo que da una pasada»).

Desde el 17/10/2026 las pasadas las lanza el reloj (reloj.yml, reloj_pasadas.due): cada 2 h, y cada hora en
las ventanas de partidos (viernes de 18 a 24 y sábado y domingo de 10 a 24, hora de Canarias). (f) simula la
misma semana a las horas que daría el reloj con GitHub perdiendo más de la mitad de sus ticks y retrasando los
demás hasta 1 h (clock_times): lo de las pruebas (a)-(e) se sigue cumpliendo con pasadas cada hora.
"""
from datetime import date, datetime, timedelta, timezone
import json
import random
import re
import sqlite3
import statistics
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import SCHEMA  # noqa: E402
from migrate_actas_schema import migrate  # noqa: E402
import fiflp_carga as C  # noqa: E402
import reloj_pasadas as R  # noqa: E402
import update_fiflp as U  # noqa: E402

START = datetime(2026, 10, 15, 0, 23, tzinfo=timezone.utc)      # un jueves, a la hora del cron nuevo
CANARIAS = timedelta(hours=1)          # la hora de Canarias en octubre (WEST, UTC+1, hasta el 25/10)
DAYS = 7
# La información completa de cada grupo (c), con tres semanas: lo más vieja que llega a estar es un máximo, y
# en una sola semana salía truncado (un grupo sin ninguna lectura en ella daba «6,9 días», el tope de la
# ventana; el hueco de verdad pasa de la semana: corrector del 16/10/2026). Con 21 días ninguno queda sin
# leer completo y el máximo ya no crece con la ventana (14 días, lo mismo).
LONG_DAYS = 21
BLOCKS = (300, 900, 2700)              # los bloqueos de una pasada (1107-1110), con IP nueva en cada una
BASE = "https://www.fiflp.com/pnfg/NPcd"
MINE = {"PG2": "Las Mesas Hu.", "FF5": "Las Mesas Hu.", "B2": "Las Mesas Hu.", "AL3": "Las Mesas Hu. A",
        "AL11": "Las Mesas Hu. B", "AL20": "Las Mesas Huracán C", "AL27": "Las Mesas Hu. D"}
# El partido de cada equipo de Las Mesas el fin de semana: (día desde el sábado, hora de Canarias).
MINE_KICKOFF = {"PG2": (0, 9, 30), "FF5": (0, 11, 0), "B2": (0, 12, 30), "AL3": (0, 16, 0), "AL11": (0, 17, 30),
                "AL20": (1, 10, 0), "AL27": (1, 12, 0)}
CLUBS = ["Arucas", "Teror", "Moya", "Firgas", "Tejeda", "Ingenio", "Agaete", "Tamaraceite"]
ROUNDS = 10                            # jornadas en el calendario: sábados desde el 3/10
FIRST_SATURDAY = date(2026, 10, 3)
# Los 28 grupos con «error» del 14/10 (sin la jornada 2 en la base) y los ocho de la Segunda Fase recién
# activados (fiflp_full_pending).
ERRORED = ([f"AL{i}" for i in (1, 5, 6, 7, 8, 10, 12, 13, 14, 15, 16)]
           + [f"FF{i}" for i in (1, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17)] + ["LZ1", "LZ3", "LZ4"])
FULL = ["A1", "A2", "A3", "A4", "B1", "B3", "B4", "C1"]


def season_groups():
    benjamin = [f"FF{i}" for i in range(1, 25)] + [f"LZ{i}" for i in range(1, 6)]
    segunda = [f"{letter}{i}" for letter in "ABCD" for i in range(1, 5)]
    return ([(c, "BENJAMIN") for c in benjamin] + [(f"PG{i}", "PREBENJAMIN") for i in range(1, 5)]
            + [(f"AL{i}", "ALEVIN") for i in range(1, 33)] + [(c, "BENJAMIN") for c in segunda])


def url(gid):
    return f"{BASE}/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22&CodCompeticion=900&CodGrupo={gid}"


def pairs(j):
    """Los tres partidos de la jornada j de una liga de seis (el círculo; la segunda vuelta, al revés)."""
    teams = list(range(6))
    r = (j - 1) % 5
    order = [teams[0]] + (teams[1:][-r:] + teams[1:][:-r] if r else teams[1:])
    out = [(order[k], order[5 - k]) for k in range(3)]
    return out if (j - 1) // 5 % 2 == 0 else [(a, h) for h, a in out]


class Season:
    """La temporada: cada partido con su saque, su resultado y cuándo publica la federación el resultado y el
    acta (en UTC)."""

    def __init__(self, seed=7):
        rnd = random.Random(seed)
        self.groups = [(gid, code, cat) for gid, (code, cat) in enumerate(season_groups(), 1)]
        self.code = {gid: code for gid, code, _ in self.groups}
        self.gid = {code: gid for gid, code, _ in self.groups}
        self.names, self.matches, self.actas, self.imported = {}, {}, {}, set()
        for gid, code, _ in self.groups:
            names = [f"{club} {code}" for club in CLUBS[:6]]
            if code in MINE:
                names[0] = MINE[code]
            self.names[gid] = names
            for j in range(1, ROUNDS + 1):
                saturday = FIRST_SATURDAY + timedelta(weeks=j - 1)
                rows = []
                for m, (h, a) in enumerate(pairs(j)):
                    if code in MINE and 0 in (h, a):
                        day, hour, minute = MINE_KICKOFF[code]
                    else:
                        day, hour, minute = (gid + m) % 2, 9 + (3 * gid + 2 * m) % 10, 0
                    local = datetime.combine(saturday + timedelta(days=day), datetime.min.time()) + timedelta(
                        hours=hour, minutes=minute)
                    kickoff = (local - CANARIAS).replace(tzinfo=timezone.utc)
                    published = kickoff + timedelta(hours=1.5 + rnd.uniform(0, 6))
                    acta = published + timedelta(hours=rnd.choice((0, 0, 0, 1, 3, 9)))
                    number = 300000 + gid * 100 + j * 10 + m
                    rows.append({"home": names[h], "away": names[a], "hs": rnd.randint(0, 6), "as": rnd.randint(0, 6),
                                 "local": local, "kickoff": kickoff, "published": published, "acta_at": acta,
                                 "acta": number, "gid": gid, "j": j})
                    self.actas[number] = rows[-1]
                self.matches[(gid, j)] = rows

    def rounds(self, gid):
        return [{"value": str(j), "text": f"{j} - {FIRST_SATURDAY + timedelta(weeks=j - 1):%d-%m-%Y}"}
                for j in range(1, ROUNDS + 1)]

    def page_matches(self, gid, j, at):
        """Lo que enseña la página de la jornada j a la hora `at`: el resultado, si ya se ha publicado."""
        out = []
        for m in self.matches.get((gid, j), []):
            shown = m["published"] <= at
            out.append({"home": m["home"], "away": m["away"], "hs": m["hs"] if shown else None,
                        "as": m["as"] if shown else None, "date": f"{m['local']:%d-%m-%Y}",
                        "time": f"{m['local']:%H:%M}", "venue": f"Campo {m['home']}", "fiflp_acta": m["acta"]})
        return out

    def base(self, start=START):
        """La base de partida: la jornada 1 entera (con sus actas), la 2 con resultado salvo en los grupos con
        «error» y con la mitad de sus actas pendientes, y el resto del calendario sin jugar (las jornadas 1-3
        con el código del acta, que ya publicó la federación). Los de FULL, recién activados: lo jugado sin
        actas y su primera pasada completa pendiente."""
        conn = sqlite3.connect(":memory:")
        conn.executescript(SCHEMA)
        migrate(conn)
        conn.execute("INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2026-2027', 2026, 2027, 1)")
        conn.execute("CREATE TABLE IF NOT EXISTS fiflp_full_pending (group_id INTEGER PRIMARY KEY)")
        cats = {}
        for gid, code, cat in self.groups:
            if cat not in cats:
                cats[cat] = conn.execute("INSERT INTO categories(name) VALUES (?)", (cat,)).lastrowid
            conn.execute("INSERT INTO groups(id, season_id, category_id, code, url) VALUES (?, 1, ?, ?, ?)",
                         (gid, cats[cat], code, url(gid)))
            ids = {}
            for name in self.names[gid]:
                row = conn.execute("SELECT id FROM teams WHERE name=?", (name,)).fetchone()
                ids[name] = row[0] if row else conn.execute("INSERT INTO teams(name) VALUES (?)", (name,)).lastrowid
            for j in range(1, ROUNDS + 1):
                for k, m in enumerate(self.matches[(gid, j)]):
                    played = m["published"] <= start and not (j == 2 and code in ERRORED)
                    imported = played and code not in FULL and (j == 1 or (gid + k) % 2 == 0) and m["acta_at"] <= start
                    if imported:
                        self.imported.add(m["acta"])
                    conn.execute(
                        """INSERT INTO matches(group_id, jornada, date, time, home_team_id, away_team_id, home_score,
                                               away_score, fiflp_acta, cod_acta) VALUES (?,?,?,?,?,?,?,?,?,?)""",
                        (gid, f"Jornada {j}", f"{m['local']:%Y-%m-%d}", f"{m['local']:%H:%M}", ids[m["home"]],
                         ids[m["away"]], m["hs"] if played else None, m["as"] if played else None,
                         m["acta"] if j <= 3 else None, m["acta"] if imported else None))
            if code in FULL:
                conn.execute("INSERT INTO fiflp_full_pending(group_id) VALUES (?)", (gid,))
        conn.commit()
        return conn

    def report(self, start=START):
        """data-health.json de partida: los 28 con «error» desde el 14/10; los prioritarios, comprobados hace
        4 h; los demás, en las últimas 30 h."""
        groups = {}
        for gid, code, _ in self.groups:
            if code in ERRORED:
                at, status = datetime(2026, 10, 14, 14, 40, tzinfo=timezone.utc), "error"
            elif code in MINE:
                at, status = start - timedelta(hours=4), "ok"
            else:
                at, status = start - timedelta(hours=2 + (gid * 7) % 28), "ok"
            groups[code] = {"url": url(gid), "status": status,
                            "message": "no carga la jornada 2" if status == "error" else "3 jornadas leídas",
                            "checkedAt": at.isoformat(timespec="seconds")}
        return {"version": 1, "season": "2026-2027", "groups": groups,
                "nextSeason": {"name": "2027-2028", "status": "pending"},
                "checkedAt": (start - timedelta(hours=2)).isoformat(timespec="seconds"), "dataVersion": "20261014a",
                "summary": {s: sum(g["status"] == s for g in groups.values()) for s in ("ok", "rejected", "error")}}


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


class Web:
    """La federación en una pasada (una IP): sirve `per_ip` documentos y después vacías durante el bloqueo
    que toca (BLOCKS: cada uno más largo que el anterior), que los sondeos no alargan; al pasar, otro cupo.
    Cada carga, `cost` s. Apunta cada petición (hora de la pasada, URL, ¿servida?)."""

    def __init__(self, season, clock, now, blocks=BLOCKS, per_ip=15, cost=2.0):
        self.season, self.clock, self.now, self.blocks, self.per_ip, self.cost = season, clock, now, blocks, per_ip, cost
        self.count, self.since, self.history, self.requests = 0, None, [], []

    def wall(self):
        return self.now + timedelta(seconds=self.clock.t)

    def braking(self):
        if self.since is not None:
            lasts = self.blocks[min(len(self.history) - 1, len(self.blocks) - 1)]
            if self.clock.t < self.since + lasts:
                return True
            self.since, self.count = None, 0
        if self.count >= self.per_ip:
            self.since = self.clock.t
            self.history.append(self.clock.t)
            return True
        self.count += 1
        return False

    def served(self):
        return [u for _, u, ok in self.requests if ok]


class Page:
    def __init__(self, web):
        self.web, self.url, self.empty = web, "", False

    def goto(self, url, wait_until=None, timeout=None):
        web = self.web
        self.url, self.empty = url, web.braking()
        web.requests.append((web.wall(), url, not self.empty))
        web.clock.t += web.cost

    def evaluate(self, js, *a):
        if js == C.EMPTY_JS:
            return self.empty
        if self.empty:
            return []
        if js == getattr(U, "SELECTED_JS", None):
            return None
        if 'select[name="jornada"]' in js and "NFG_CmpJornada" in self.url and "CodJornada" not in self.url:
            return self.web.season.rounds(_gid(self.url))
        return []

    def wait_for_function(self, js, arg=None, timeout=None, polling=None):
        pass

    def content(self):
        if "NFG_CMP_Goleadores" in self.url and not self.empty:
            gid = int(re.search(r"codgrupo=(\d+)", self.url).group(1))
            return "".join(f"<tr><td>Jugador {k}</td><td>{name}</td><td>G</td><td>3</td><td>{k + 1}</td></tr>"
                           for k, name in enumerate(self.web.season.names[gid]))
        return "<html></html>"


def _gid(u):
    return int(re.search(r"(?i)codgrupo=(\d+)", u).group(1))


class Reader:
    BASE = BASE

    def __init__(self, web):
        self.web = web

    def parse_standings(self, page):
        return []

    def parse_matches(self, page):
        m = re.search(r"CodJornada=(\d+)", page.url)
        if page.empty or not m:
            return []
        return self.web.season.page_matches(_gid(page.url), int(m.group(1)), self.web.wall())


def simulate(tmp_path, monkeypatch, every=timedelta(hours=2), days=DAYS, blocks=BLOCKS, env=None, seed=7, times=None):
    """Una semana de pasadas (una cada `every`, o a las horas `times`: las del reloj, clock_times) sobre la
    temporada simulada. Devuelve un dict por pasada:
    su hora, las peticiones (hora, URL, ¿servida?), lo que el bot comprobó (el informe en memoria), los
    grupos cuyos goleadores se leyeron, las esperas del freno y el informe publicado; y la temporada y la
    base, para medir."""
    import source_health
    (tmp_path / "index.html").write_text('<script src="./data-seasons.js?v=20261014a"></script>')
    monkeypatch.setattr(source_health, "ROOT", tmp_path)
    monkeypatch.setattr(source_health, "REPORT_PATH", tmp_path / "data-health.json")
    monkeypatch.setattr(source_health, "_report", None)
    monkeypatch.setattr(U, "flatten", lambda page, selector=None: 0)
    for name in ("FIFLP_PRIORITY_TEAMS", "FIFLP_ALEVIN_MIN", "FIFLP_BUDGET_MIN", "FIFLP_RESERVE_MIN",
                 "FIFLP_BRAKE_PAUSE_MIN", "FIFLP_BRAKE_PAUSES", "FIFLP_BRAKE_PROBE_S", "FIFLP_BRAKE_MAX_MIN",
                 "FIFLP_MIN_INTERVAL", "FIFLP_PRIORITY_MAX_H", "FIFLP_CATS"):
        monkeypatch.delenv(name, raising=False)
    for name, value in (env or {}).items():
        monkeypatch.setenv(name, value)
    monkeypatch.setattr(U, "pinned_groups", lambda: set())
    season = Season(seed)
    conn = season.base()
    source_health.REPORT_PATH.write_text(json.dumps(season.report()))
    passes, web = [], None

    def apply_acta(conn, mid, code, acta, log=print):
        """El acta se importa si la federación ya la tiene completa; si no, «se reintentará»."""
        if season.actas[code]["acta_at"] > web.wall():
            return False
        return bool(conn.execute("UPDATE matches SET cod_acta=? WHERE id=?", (code, mid)))
    monkeypatch.setattr(U, "apply_acta", apply_acta)
    if times is None:
        times = [START + i * every for i in range(int(timedelta(days=days) / every))]
    for i, now in enumerate(times):
        source_health._report = None
        source_health.begin("2026-2027")
        clock = Clock()
        monkeypatch.setattr(U, "clock", clock)

        def sleep(s, clock=clock):
            clock.t += max(s, 0)
        monkeypatch.setattr(C, "pause", lambda extra=0, sleep=sleep: sleep(1.0 + extra))
        web = Web(season, clock, now, blocks=blocks)
        F = C.Federacion(Reader(web), deadline=clock() + U.budget_seconds(), interval=7.0, clock=clock, sleep=sleep,
                         wall=web.wall, log=lambda *_: None)
        groups = U.fiflp_groups(conn, 1)
        pending = {code: u for _, code, u in groups}
        U.run_passes(Page(web), F, conn, 1, groups, now.date(), pending, now=now, number=1000 + i)
        source_health.finish(now=web.wall())
        assert pending == {}
        checked = {code: dict(entry) for code, entry in source_health._report["groups"].items()}
        mine = [season.gid[c] for c in MINE]
        scored = {(gid, jornada, home, away) for gid, jornada, home, away in conn.execute(
            f"""SELECT m.group_id, m.jornada, h.name, a.name FROM matches m JOIN teams h ON h.id=m.home_team_id
                JOIN teams a ON a.id=m.away_team_id WHERE m.home_score IS NOT NULL
                AND m.group_id IN ({','.join('?' * len(mine))})""", mine)}
        passes.append({"now": now, "requests": list(web.requests), "checked": checked, "end": web.wall(), "scored": scored,
                       "scorers": {season.code[_gid(u)] for u in web.served() if "NFG_CMP_Goleadores" in u},
                       "pauses": F.pauses, "paused": F.paused, "probes": F.probes, "blocks": len(web.history),
                       "deadline": now + timedelta(seconds=F.deadline), "run": dict(source_health._report.get("run") or {}),
                       "published": json.loads(source_health.REPORT_PATH.read_text())})
    return passes, season, conn


# ── Las medidas ───────────────────────────────────────────────────────────────

def reads(passes, season):
    """{código: [hora de cada lectura correcta]}: las comprobaciones «ok» de cada pasada con su hora (las que
    conservan la anterior, por descanso, rotación o freno, no son lecturas)."""
    out = {code: [] for code in season.gid}
    for p in passes:
        for code, entry in p["checked"].items():
            at = datetime.fromisoformat(entry["checkedAt"])
            if entry["status"] == "ok" and at >= p["now"]:
                out[code].append(at)
    return out


def scorer_times(passes, season):
    """{código: [hora de cada lectura de sus goleadores]}."""
    out = {code: [] for code in season.gid}
    for p in passes:
        for at, u, ok in p["requests"]:
            if ok and "NFG_CMP_Goleadores" in u:
                out[season.code[_gid(u)]].append(at)
    return out


def acta_times(passes, season):
    """{código del acta: hora en que se importó} (la primera petición servida de esa acta que importó)."""
    out = {}
    for p in passes:
        for at, u, ok in p["requests"]:
            m = re.search(r"CodActa=(\d+)", u)
            if ok and m and int(m.group(1)) not in out and season.actas[int(m.group(1))]["acta_at"] <= at:
                out[int(m.group(1))] = at
    return out


def complete_gaps(passes, season, start=START):
    """{código: lo más vieja que llegó a estar su información COMPLETA en la ventana, en días}. Al acabar cada
    pasada (τ), un grupo está completo hasta t, la última lectura correcta de su calendario (t ≤ τ) tal que
    en τ ya están importadas todas las actas que la federación tenía antes de t (en esa pasada o en otra
    posterior: las actas nuevas que el segundo freno dejó a medias se recuperan en la siguiente) y sus
    goleadores se leyeron después del último cambio de antes de t (un resultado o un acta publicados). Su
    edad en τ es τ - t; sin ninguna, τ - el comienzo de la simulación (la base de partida está a medias:
    28 «error», actas pendientes y ocho grupos sin su primera pasada completa). Los resultados no se miran
    aparte: una lectura correcta lee siempre su última jornada jugada y las que tienen un resultado
    pendiente (rounds_to_refresh). Un máximo que sigue abierto al final de la ventana es solo una cota
    inferior (open_complete_gaps)."""
    return {code: worst for code, (worst, _) in _complete(passes, season, start).items()}


def open_complete_gaps(passes, season, start=START):
    """Los grupos cuyo máximo de complete_gaps sigue abierto al acabar la ventana (desde su última lectura
    completa, o desde el principio si no tuvo ninguna): su valor es una cota inferior, el hueco de verdad es
    mayor. Con una semana, uno sin ninguna lectura salía con el tope de la ventana (6,9 días)."""
    return sorted(code for code, (_, still) in _complete(passes, season, start).items() if still)


def _complete(passes, season, start=START):
    """{código: (lo más vieja en días, ¿ese máximo sigue abierto al final?)} (complete_gaps)."""
    ends = [p["end"] for p in passes]
    got, scorers, actas = reads(passes, season), scorer_times(passes, season), acta_times(passes, season)
    actas.update({code: start for code in season.imported})
    never = passes[-1]["end"] + timedelta(days=1)
    out = {}
    for gid, code, _ in season.groups:
        matches = [m for j in range(1, ROUNDS + 1) for m in season.matches[(gid, j)]]
        points = []                     # (t, cuándo quedó completa la lectura de t)
        for t in got[code]:
            ready = [m for m in matches if m["acta_at"] <= t]
            change = max([m["published"] for m in matches if m["published"] <= t] + [m["acta_at"] for m in ready]
                         + [start])
            scored = min((s for s in scorers[code] if s >= change), default=never)
            imported = max((actas.get(m["acta"], never) for m in ready), default=start)
            points.append((t, max(t, scored, imported)))
        worst, gap = timedelta(0), timedelta(0)
        for tau in ends:
            last = max((t for t, done in points if done <= tau), default=start)
            gap = tau - last
            worst = max(worst, gap)
        out[code] = (worst.total_seconds() / 86400, gap == worst > timedelta(0))
    return out


def priority_gaps(passes, season):
    """{prioritario: lo más que pasó entre dos lecturas suyas, en horas} (desde el principio y hasta el final)."""
    got = reads(passes, season)
    out = {}
    for code in MINE:
        marks = [START] + got[code] + [passes[-1]["end"]]
        out[code] = max((b - a).total_seconds() for a, b in zip(marks, marks[1:])) / 3600
    return out


def priority_latency(passes, season):
    """Por cada partido de Las Mesas publicado durante la simulación: (grupo, jornada, cuántas pasadas pasan
    desde la primera que empieza con el resultado ya publicado hasta la que lo deja en la base): 0, esa
    misma; -1, la anterior (lo publicó mientras corría); None, ninguna."""
    out = []
    for code in MINE:
        gid = season.gid[code]
        for j in range(1, ROUNDS + 1):
            for m in season.matches[(gid, j)]:
                if MINE[code] not in (m["home"], m["away"]) or not START <= m["published"] <= passes[-1]["now"]:
                    continue
                first = next(i for i, p in enumerate(passes) if p["now"] >= m["published"])
                key = (gid, f"Jornada {j}", m["home"], m["away"])
                got = next((i for i, p in enumerate(passes) if key in p["scored"]), None)
                out.append((code, j, None if got is None else got - first))
    return out


def per_day(passes, key):
    days = {}
    for p in passes:
        for at, u, ok in p["requests"]:
            if key(ok):
                days[at.date()] = days.get(at.date(), 0) + 1
    whole = [d for d in days if START.date() < d < passes[-1]["end"].date()]
    return statistics.mean(days[d] for d in whole) if whole else 0


def summary(passes, season, conn):
    gaps = complete_gaps(passes, season)
    open_gaps = sorted(gaps.values())
    errors = [sum(g["status"] == "error" for g in p["published"]["groups"].values()) for p in passes]
    cleaned = next((p["now"] for p, e in zip(passes, errors) if e == 0), None)
    return {
        "passes": len(passes),
        "served_per_day": round(per_day(passes, lambda ok: ok)),
        "requests_per_day": round(per_day(passes, lambda ok: True)),
        "max_pauses": max(p["pauses"] for p in passes),
        "max_paused": round(max(p["paused"] for p in passes)),
        "waited_900": sum(p["paused"] >= 600 for p in passes),
        "max_minutes": round(max((p["end"] - p["now"]).total_seconds() for p in passes) / 60, 1),
        "priority_gap_h": round(max(priority_gaps(passes, season).values()), 2),
        "priority_latency": sorted({d for _, _, d in priority_latency(passes, season)}, key=lambda d: (d is None, d)),
        "complete_max_days": round(open_gaps[-1], 2),
        "complete_median_days": round(statistics.median(open_gaps), 2),
        "complete_within_3_days": sum(g <= 3 for g in open_gaps),
        "complete_within_5_days": sum(g <= 5 for g in open_gaps),
        "others_within_3_days": sum(g <= 3 for c, g in gaps.items() if c not in MINE),
        "others_within_5_days": sum(g <= 5 for c, g in gaps.items() if c not in MINE),
        "complete_still_open": open_complete_gaps(passes, season),
        "priority_complete_max_days": round(max(gaps[c] for c in MINE), 2),
        "errors_start": len(ERRORED), "errors_end": errors[-1],
        "errors_cleaned_h": None if cleaned is None else round((cleaned - START).total_seconds() / 3600, 1),
        "pending_actas_end": sum(len(U.pending_actas(conn, gid)) for gid, _, _ in season.groups),
    }


# El reloj (reloj.yml, 17/10/2026): un tick a las :07, :22, :37 y :52 que GitHub pierde con CLOCK_LOSS de
# probabilidad (del cron de update.yml llegaron 5 de 13 en ~26 h) y retrasa 0-CLOCK_DELAY min si llega; cada
# tick, en fila (la concurrency del reloj), lanza una pasada si toca (reloj_pasadas.due), que está sin acabar
# CLOCK_JOB min y empieza a pedir páginas a la federación CLOCK_SETUP después de crearse.
CLOCK_TICKS = (7, 22, 37, 52)
CLOCK_LOSS = 0.55
CLOCK_DELAY = 60
CLOCK_JOB = (20, 25)
CLOCK_SETUP = timedelta(minutes=3)


def clock_times(seed=1, days=DAYS, start=START, loss=CLOCK_LOSS, delay=CLOCK_DELAY):
    """Las horas (UTC, en segundos enteros, como checkedAt) a las que empiezan las pasadas que lanzaría el
    reloj en `days` días desde `start`, con ticks perdidos y retrasados (arriba). Con `loss` 0 y `delay` 0,
    una cada hora en punto de las ventanas y cada 2 h fuera."""
    rnd = random.Random(seed)
    end = start + timedelta(days=days)
    ticks, hour = [], start.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
    while hour < end:
        ticks += [hour + timedelta(minutes=m + rnd.uniform(0, delay)) for m in CLOCK_TICKS if rnd.random() >= loss]
        hour += timedelta(hours=1)
    runs, free = [], start - timedelta(hours=3)
    for at in sorted(ticks):
        at = free = max(at, free) + timedelta(seconds=30)
        seen = [{"status": "completed" if done <= at else "in_progress", "createdAt": made.isoformat()}
                for made, done in runs[-20:]]
        if R.due(at, seen):
            runs.append((at, at + timedelta(minutes=rnd.uniform(*CLOCK_JOB))))
    return [(made + CLOCK_SETUP).replace(microsecond=0) for made, _ in runs if start <= made + CLOCK_SETUP < end]


def priority_minutes(passes, season):
    """Por cada partido de Las Mesas publicado durante la simulación, los minutos desde que la federación publica
    el resultado hasta que el bot lo lee (la hora de la lectura de su grupo en la pasada que lo deja en la base)."""
    out = []
    for code in MINE:
        gid = season.gid[code]
        for j in range(1, ROUNDS + 1):
            for m in season.matches[(gid, j)]:
                if MINE[code] not in (m["home"], m["away"]) or not START <= m["published"] <= passes[-1]["now"]:
                    continue
                key = (gid, f"Jornada {j}", m["home"], m["away"])
                got = next(p for p in passes if key in p["scored"])
                out.append((datetime.fromisoformat(got["checked"][code]["checkedAt"]) - m["published"]).total_seconds() / 60)
    return out


# ── Las pruebas ───────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def week(tmp_path_factory):
    """La semana con el bot de ahora (una pasada cada 2 h), una sola vez para todas las pruebas."""
    mp = pytest.MonkeyPatch()
    try:
        passes, season, conn = simulate(tmp_path_factory.mktemp("semana"), mp)
        yield passes, season, conn, summary(passes, season, conn)
    finally:
        mp.undo()


@pytest.fixture(scope="module")
def clock_week(tmp_path_factory):
    """La misma semana con las pasadas a las horas del reloj (clock_times), una sola vez."""
    mp = pytest.MonkeyPatch()
    try:
        passes, season, conn = simulate(tmp_path_factory.mktemp("reloj"), mp, times=clock_times())
        yield passes, season, conn, summary(passes, season, conn)
    finally:
        mp.undo()


@pytest.fixture(scope="module")
def perfect_clock_week(tmp_path_factory):
    """La misma semana con el reloj sin perder ni retrasar ningún tick (clock_times(loss=0, delay=0)): una
    pasada cada hora en las ventanas y cada 2 h fuera, lo que se busca."""
    mp = pytest.MonkeyPatch()
    try:
        passes, season, conn = simulate(tmp_path_factory.mktemp("reloj-perfecto"), mp, times=clock_times(loss=0, delay=0))
        yield passes, season, conn
    finally:
        mp.undo()


def mine_acta_hours(passes, season):
    """Por cada acta de Las Mesas que la federación tiene durante la simulación: (grupo, jornada, horas desde que
    la tiene hasta que el bot la importa; None si no la importa)."""
    got = acta_times(passes, season)
    out = []
    for code in MINE:
        gid = season.gid[code]
        for j in range(1, ROUNDS + 1):
            for m in season.matches[(gid, j)]:
                if MINE[code] in (m["home"], m["away"]) and START <= m["acta_at"] <= passes[-1]["now"]:
                    at = got.get(m["acta"])
                    out.append((code, j, None if at is None else (at - m["acta_at"]).total_seconds() / 3600))
    return out


@pytest.fixture(scope="module")
def three_weeks(tmp_path_factory):
    """Tres semanas (LONG_DAYS) con el bot de ahora, para (c): en una, el máximo salía truncado."""
    mp = pytest.MonkeyPatch()
    try:
        passes, season, conn = simulate(tmp_path_factory.mktemp("tres-semanas"), mp, days=LONG_DAYS)
        yield passes, season, conn, summary(passes, season, conn)
    finally:
        mp.undo()


def test_no_pass_waits_for_the_900_s_block(week):
    """(a) Cada pasada espera solo el primer freno (~5 min) y acaba en el segundo: ninguna espera el de 900 s
    (con el código de antes, todas: 15 páginas, 5 min, 15, 15 min, 15 y el tercero hasta el plazo)."""
    passes, season, conn, s = week
    assert all(p["pauses"] <= 1 for p in passes), s
    assert all(p["paused"] < 600 for p in passes), s
    assert all(p["blocks"] <= 2 for p in passes)
    assert all(t <= p["deadline"] for p in passes for t, _, _ in p["requests"]), "ninguna página pasado el plazo"
    assert s["max_minutes"] <= U.DEADLINE_SECONDS / 60 + 1


def test_every_priority_group_is_read_every_six_hours_and_right_after_its_match(week):
    """(b) Cada prioritario, al menos cada 6 h (más lo que tarda una pasada en llegar a él); y con un partido
    suyo recién jugado, en la primera pasada en que la federación ya publica el resultado."""
    passes, season, conn, s = week
    gaps = priority_gaps(passes, season)
    assert max(gaps.values()) <= 6 + U.DEADLINE_SECONDS / 3600, gaps
    late = [(code, j, d) for code, j, d in priority_latency(passes, season) if d is None or d > 0]
    assert not late, late


def test_how_long_each_open_group_takes_to_be_read_complete(three_weeks):
    """(c) Calendario, goleadores y actas: lo más vieja que llega a estar la información completa de cada grupo
    abierto (complete_gaps; desde la base a medias del principio, con los 28 «error» y la Segunda Fase recién
    activada), en TRES semanas (LONG_DAYS): es un máximo, y con una sola salía truncado (un grupo sin ninguna
    lectura en la semana daba 6,9 días, el tope de la ventana; de verdad pasa 7,8 días sin leerse: corrector
    del 16/10/2026). Por eso, además, ningún grupo sin leer completo en la ventana, y el máximo no es de uno
    cuyo hueco sigue abierto al final (open_complete_gaps: una cota, no una medida). El objetivo era ≤ 3 días
    para todos; con el cupo (~30 páginas por pasada, ~360 al día) no se llega con la rotación sin estado: los
    prioritarios se llevan ~165 páginas al día (cada 6 h y, calientes, en cada pasada) y quedan ~25 lecturas
    al día para 74 grupos, ~3 días de media; el giro sin estado deja a unos pocos más de una semana. Lo que se
    consigue (y el código de antes, cada 6 h, no: en tres semanas, ningún grupo no prioritario completo nunca
    y 37 sin ninguna lectura): los prioritarios, completos en ≤ 1 día (casi todos en ≤ 4 h), y los demás,
    mediana ≤ 4,5 días, todos en ≤ 8 y siete de cada diez en ≤ 5. Las palancas que llegarían a ≤ 3
    (medidas con esta misma simulación), en docs/federacion.md, «Lo que da una pasada»."""
    passes, season, conn, s = three_weeks
    gaps = complete_gaps(passes, season)
    others = sorted(g for c, g in gaps.items() if c not in MINE)
    worst = max(gaps.values())
    assert max(gaps[c] for c in MINE) <= 1, {c: round(gaps[c], 2) for c in MINE}
    assert all(reads(passes, season).values()), "un grupo sin ninguna lectura en tres semanas"
    assert all(gaps[c] < worst for c in open_complete_gaps(passes, season)), s["complete_still_open"]
    assert worst <= 8, s
    assert statistics.median(gaps.values()) <= 4.5, s
    assert sum(g <= 5 for g in others) >= 0.7 * len(others), others


def test_a_brake_is_never_an_error_and_the_old_errors_are_cleaned(week):
    """(d) Ningún grupo queda como error por el freno, y los 28 «error» heredados se limpian al releerlos."""
    passes, season, conn, s = week
    for p in passes:
        assert not [c for c, g in p["checked"].items() if g["status"] != "ok" and c not in ERRORED], p["now"]
    assert s["errors_start"] == len(ERRORED) and s["errors_end"] == 0, s


def test_more_useful_pages_per_day(week):
    """(e) Páginas útiles por día: con el código de antes (cada 6 h y 33 min), ~180 (45 por pasada); ahora,
    con una cada 2 h, el doble largo."""
    passes, season, conn, s = week
    assert s["served_per_day"] >= 330, s


def test_the_clock_without_losses_is_one_pass_an_hour_in_the_windows_and_every_two_hours_outside():
    """clock_times con GitHub perfecto: en la semana desde el jueves 15/10/2026, 34 h de ventanas (viernes de 18
    a 24, sábado y domingo de 10 a 24) con una pasada cada hora y el resto, cada 2 h."""
    times = clock_times(loss=0, delay=0)
    gaps = {(b - a) for a, b in zip(times, times[1:])}
    assert sum(1 for t in times if R.window(t)) == 34
    assert gaps == {timedelta(hours=1), timedelta(hours=2)}, gaps
    assert len(times) == 34 + 67


def test_with_the_clock_one_pass_an_hour_on_match_days_and_nothing_breaks(clock_week):
    """(f) Con el reloj (17/10/2026) y GitHub perdiendo más de la mitad de los ticks y retrasando los demás hasta
    1 h: ~80 pasadas en la semana, ~25 en las 34 h de ventanas (con el cron de antes, 5-7 de ~33). Y nada se
    rompe con pasadas cada hora: ninguna espera el bloqueo de 900 s ni pide páginas pasado el plazo, ningún
    freno deja un error, los 28 heredados se limpian, cada resultado de Las Mesas se lee en la primera pasada
    que empieza con él publicado, que en las ventanas llega antes (la mediana, ≤ 1 h desde que la federación
    lo publica), los prioritarios no pasan de PRIORITY_MAX_AGE sin leerse más lo que GitHub retrase un tick
    (stale mira PASS_EVERY, la cadencia base, también en las ventanas: lo seguro), ningún acta se queda sin
    intentos (retry_actas: en las ventanas sus lecturas por edad van cada ~3 h; la que falló una vez se
    reintenta desde 2 h 45 y las demás desde 4 h) y las páginas útiles al día no bajan."""
    passes, season, conn, s = clock_week
    assert len(passes) >= 75 and sum(1 for p in passes if R.window(p["now"])) >= 20, s
    assert all(p["pauses"] <= 1 and p["paused"] < 600 and p["blocks"] <= 2 for p in passes), s
    assert all(t <= p["deadline"] for p in passes for t, _, _ in p["requests"]), "ninguna página pasado el plazo"
    for p in passes:
        assert not [c for c, g in p["checked"].items() if g["status"] != "ok" and c not in ERRORED], p["now"]
    assert s["errors_end"] == 0, s
    late = [(code, j, d) for code, j, d in priority_latency(passes, season) if d is None or d > 0]
    assert not late, late
    minutes = priority_minutes(passes, season)
    assert statistics.median(minutes) <= 60 and max(minutes) <= 150, sorted(minutes)
    assert max(priority_gaps(passes, season).values()) <= (U.PRIORITY_MAX_AGE + timedelta(hours=2)) / timedelta(hours=1), s
    assert s["served_per_day"] >= 330, s
    exhausted = conn.execute("""SELECT count(*) FROM matches WHERE fiflp_acta IS NOT NULL AND acta_tries >= ?
                                AND (cod_acta IS NULL OR cod_acta <> fiflp_acta)""", (U.MAX_ACTA_TRIES,)).fetchone()[0]
    assert exhausted == 0 and s["pending_actas_end"] <= 5, s


def test_with_a_perfect_clock_the_actas_of_las_mesas_do_not_wait_for_the_end_of_the_window(perfect_clock_week):
    """(f) Cuanto mejor entregue GitHub los ticks, antes, no después (corrector del 17/10/2026): con el reloj
    perfecto, en las ventanas un prioritario ya frío se lee en su pasada cada ~3 h, y con un solo plazo de 4 h
    (ACTA_RETRY_AFTER) un acta suya que falló no se reintentaba en toda la ventana: la de PG2 de la jornada 3
    (la federación la completa 3 h después del resultado, el sábado) esperaba 12,4 h, hasta la madrugada del
    domingo. Con el 2.º intento desde 2 h 45 (ACTA_RETRY_SOON), ninguna tarda más de 8 h (la de B2, que la
    federación completa 9 h después del resultado, ~7 h), todas se importan y ninguna se queda sin intentos."""
    passes, season, conn = perfect_clock_week
    hours = mine_acta_hours(passes, season)
    assert len(hours) == len(MINE) and all(h is not None for _, _, h in hours), hours
    assert max(h for _, _, h in hours) <= 8, hours
    exhausted = conn.execute("""SELECT count(*) FROM matches WHERE fiflp_acta IS NOT NULL AND acta_tries >= ?
                                AND (cod_acta IS NULL OR cod_acta <> fiflp_acta)""", (U.MAX_ACTA_TRIES,)).fetchone()[0]
    assert exhausted == 0
