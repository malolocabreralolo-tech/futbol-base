"""Muchas pasadas seguidas del bot de la federación con la temporada llena, sin red (update_fiflp.py).

La temporada de 2026-27 con todo lo previsto: los 33 grupos de octubre (FF1-24, LZ1-5 y PG1-4), los 32
de alevín (AL1-32) y los 16 de la Segunda Fase de benjamín (A1-D4), 81 grupos. Las Mesas Huracán juega
en PG2, FF5, B2 y en cuatro grupos alevín: siete grupos prioritarios. Cada página de la federación le
cuesta al bot ~3 s (fiflp_carga; reloj falso), un grupo abierto son 7 (clasificación, calendario y cinco
jornadas) y uno cerrado 2: los 81 piden unos 27 min de primera pasada, y el plazo global es de 25 para
las dos. La rotación no tiene estado (run_number): se prueba con y sin commits entre pasadas (sin
commits, cada pasada arranca de la misma base y del mismo data-health.json, como cuando update.yml no
sube nada porque no ha cambiado ningún dato publicado). En 24 pasadas (seis días con el cron cada 6 h):
  - los grupos prioritarios se leen en todas, con sus actas y goleadores;
  - todo grupo abierto se lee al menos una vez en cada cuatro pasadas seguidas (24 h), y lo mismo sus
    goleadores (la segunda pasada también rota), alevín incluido; con ~3 s por página, de hecho, en
    cada tres, también si se pierde una pasada (un número de ejecución que se salta); con 6 s por
    página (el doble), en cada cuatro;
  - un grupo cerrado, una vez cada cuatro (el requisito es ≤ 8);
  - ninguna página se pide pasado el plazo.
"""
from datetime import date, datetime, timedelta, timezone
import json
import re
import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import SCHEMA  # noqa: E402
from migrate_actas_schema import migrate  # noqa: E402
import update_fiflp as U  # noqa: E402

TODAY = date(2026, 10, 14)
NOW = datetime(2026, 10, 14, 0, 20, tzinfo=timezone.utc)
PAGE = 3.0                       # segundos por página (carga, espera y pausa)
PASSES = 24
# Las Mesas Huracán (y sus filiales): siete grupos prioritarios.
MINE = {"PG2": "Las Mesas Hu.", "FF5": "Las Mesas Hu.", "B2": "Las Mesas Hu.", "AL3": "Las Mesas Hu. A",
        "AL11": "Las Mesas Hu. B", "AL20": "Las Mesas Huracán C", "AL27": "Las Mesas Hu. D"}


def season_groups():
    benjamin = [f"FF{i}" for i in range(1, 25)] + [f"LZ{i}" for i in range(1, 6)]
    segunda = [f"{letter}{i}" for letter in "ABCD" for i in range(1, 5)]
    return ([(c, "BENJAMIN") for c in benjamin] + [(f"PG{i}", "PREBENJAMIN") for i in range(1, 5)]
            + [(f"AL{i}", "ALEVIN") for i in range(1, 33)] + [(c, "BENJAMIN") for c in segunda])


def url(gid):
    return ("https://www.fiflp.com/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22"
            f"&CodCompeticion=900&CodGrupo={gid}")


def base_db(closed=()):
    """La base: cada grupo abierto con dos jornadas jugadas (3 y 10 de octubre) y sus dos actas por
    leer; los cerrados (`closed`), con todo jugado el 12 de septiembre y las actas ya leídas."""
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.execute("INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2026-2027', 2026, 2027, 1)")
    cats = {}
    for gid, (code, cat) in enumerate(season_groups(), 1):
        if cat not in cats:
            cats[cat] = conn.execute("INSERT INTO categories(name) VALUES (?)", (cat,)).lastrowid
        conn.execute("INSERT INTO groups(id, season_id, category_id, code, url) VALUES (?, 1, ?, ?, ?)",
                     (gid, cats[cat], code, url(gid)))
        teams = [MINE.get(code, f"Local {code}"), f"Visitante {code}"]
        if code == "PG1":
            teams[0] = "Atlético Bachicán Las Mesas"           # otro club: no es prioritario
        ids = [conn.execute("INSERT OR IGNORE INTO teams(name) VALUES (?)", (t,)) and
               conn.execute("SELECT id FROM teams WHERE name=?", (t,)).fetchone()[0] for t in teams]
        days = ["2026-09-12"] if code in closed else ["2026-10-03", "2026-10-10"]
        for n, day in enumerate(days, 1):
            acta = gid * 100 + n
            conn.execute(
                """INSERT INTO matches(group_id, jornada, date, home_team_id, away_team_id, home_score, away_score,
                                       fiflp_acta, cod_acta) VALUES (?, ?, ?, ?, ?, 2, 1, ?, ?)""",
                (gid, f"Jornada {n}", day, ids[0], ids[1], acta, acta if code in closed else None))
    conn.commit()
    return conn


def base_report(conn):
    """data-health.json de la última pasada publicada: todo bien, hace 6 h."""
    groups = {code: {"url": u, "status": "ok", "message": "2 jornadas leídas",
                     "checkedAt": (NOW - timedelta(hours=6)).isoformat()}
              for _, code, u in U.fiflp_groups(conn, 1)}
    return {"version": 1, "season": "2026-2027", "groups": groups, "nextSeason": {"name": "2027-2028", "status": "pending"},
            "checkedAt": (NOW - timedelta(hours=6)).isoformat(), "dataVersion": "20261014a",
            "summary": {"ok": len(groups), "rejected": 0, "error": 0}}


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


class Page:
    """El calendario de un grupo abierto trae cinco jornadas (3/10 a 31/10: tres en la ventana del bot
    y dos que la base aún no tiene); el de uno cerrado, la del 12/9, ya leída."""
    url = ""

    def __init__(self, closed):
        self.closed = closed

    def evaluate(self, js, *a):
        if 'select[name="jornada"]' not in js:
            return []
        gid = int(re.search(r"CodGrupo=(\d+)", self.url).group(1))
        if gid in self.closed:
            return [{"value": "1", "text": "1 - 12-09-2026"}]
        return [{"value": str(n), "text": f"{n} - {day}-10-2026"} for n, day in enumerate(("03", "10", "17", "24", "31"), 1)]

    def wait_for_timeout(self, ms):
        pass

    def content(self):
        return "<html></html>"


class Fed:
    """La federación: cada página, `cost` segundos del reloj; apunta cuándo empezó cada una."""
    BASE = "https://www.fiflp.com/pnfg/NPcd"

    def __init__(self, clock, cost=PAGE):
        self.clock, self.cost, self.urls, self.starts = clock, cost, [], []

    def goto(self, page, url):
        self.urls.append(url)
        self.starts.append(self.clock.t)
        page.url = url
        self.clock.t += self.cost
        return True

    def delay(self, *a):
        pass

    def parse_standings(self, page):
        return []

    def parse_matches(self, page):
        return []


def read_first(fed, codes):
    return {codes[int(m.group(1))] for u in fed.urls if "CodJornada" not in u
            for m in [re.search(r"CodGrupo=(\d+)$", u)] if m}


def read_scorers(fed, codes):
    return {codes[int(u.rsplit("=", 1)[1])] for u in fed.urls if "NFG_CMP_Goleadores" in u}


def simulate(tmp_path, monkeypatch, commits, closed=(), numbers=None, page=PAGE):
    """`numbers` pasadas (por defecto 24 seguidas); con `commits`, cada una arranca de la base y del
    data-health.json que dejó la anterior; sin ellos, de los de partida. Devuelve, por pasada, los
    grupos leídos, los que tuvieron su segunda pasada (goleadores), las notas y el tiempo."""
    import source_health
    (tmp_path / "index.html").write_text('<script src="./data-seasons.js?v=20261014a"></script>')
    monkeypatch.setattr(source_health, "ROOT", tmp_path)
    monkeypatch.setattr(source_health, "REPORT_PATH", tmp_path / "data-health.json")
    monkeypatch.setattr(source_health, "_report", None)
    monkeypatch.setattr(U, "flatten", lambda page, selector=None: 0)
    # Un acta que se lee bien queda importada (con su código): deja de estar pendiente.
    monkeypatch.setattr(U, "apply_acta", lambda conn, mid, code, acta, log=print: bool(
        conn.execute("UPDATE matches SET cod_acta=? WHERE id=?", (code, mid))))
    for name in ("FIFLP_PRIORITY_TEAMS", "FIFLP_ALEVIN_MIN", "FIFLP_BUDGET_MIN", "FIFLP_RESERVE_MIN"):
        monkeypatch.delenv(name, raising=False)
    base = base_db(closed)
    codes = dict((gid, code) for gid, code, _ in U.fiflp_groups(base, 1))
    closed_ids = {gid for gid, code in codes.items() if code in closed}
    start_report = base_report(base)
    conn, report = base, start_report
    passes = []
    for i, number in enumerate(numbers or range(1000, 1000 + PASSES)):
        if not commits:
            conn = sqlite3.connect(":memory:")
            base.backup(conn)
            report = start_report
        source_health.REPORT_PATH.write_text(json.dumps(report))
        source_health.begin("2026-2027")
        clock = Clock()
        monkeypatch.setattr(U, "clock", clock)
        fed = Fed(clock, page)
        groups = U.fiflp_groups(conn, 1)
        pending = {code: u for _, code, u in groups}
        U.run_passes(Page(closed_ids), fed, conn, 1, groups, TODAY, pending, number=number,
                     now=NOW + timedelta(hours=6 * i))
        source_health.finish(now=NOW + timedelta(hours=6 * i, minutes=30))
        assert pending == {}
        report = json.loads(source_health.REPORT_PATH.read_text())
        passes.append({"first": read_first(fed, codes), "scorers": read_scorers(fed, codes), "run": report["run"],
                       "last_start": max(fed.starts), "end": clock.t, "report": report})
        if commits:          # entre pasada y pasada se juega: actas nuevas en un cuarto de los grupos abiertos
            for gid, code in codes.items():
                if gid not in closed_ids and gid % 4 == i % 4:
                    home, away = conn.execute("SELECT home_team_id, away_team_id FROM matches WHERE group_id=?",
                                              (gid,)).fetchone()
                    conn.execute("""INSERT INTO matches(group_id, jornada, date, home_team_id, away_team_id, home_score,
                                    away_score, fiflp_acta) VALUES (?, ?, '2026-10-17', ?, ?, 0, 0, ?)""",
                                 (gid, f"Jornada {10 + i}", away, home, gid * 100 + 50 + i))
            conn.commit()
    return passes, set(codes.values())


def gaps(passes, key, code):
    """La mayor racha de pasadas seguidas en que `code` no aparece en passes[i][key] (contando desde el
    principio y hasta el final)."""
    worst = run = 0
    for p in passes:
        run = 0 if code in p[key] else run + 1
        worst = max(worst, run)
    return worst


def check(passes, everyone, closed=(), page=PAGE, most=3):
    """`most`: las pasadas seguidas que un grupo abierto puede quedarse sin leer (3: «al menos una vez
    en cada cuatro»)."""
    budget = U.DEADLINE_SECONDS
    for i, p in enumerate(passes):
        assert set(MINE) <= p["first"], (i, set(MINE) - p["first"])              # prioritarios, en todas
        assert set(MINE) <= p["scorers"], (i, set(MINE) - p["scorers"])          # con sus goleadores
        assert p["last_start"] <= budget, (i, p["last_start"])                   # nada pasado el plazo
        assert p["end"] <= budget + page, (i, p["end"])
        assert p["report"]["summary"] == {"ok": len(everyone), "rejected": 0, "error": 0}
    open_groups = everyone - set(closed)
    worst_first = {c: gaps(passes, "first", c) for c in open_groups}
    worst_scorers = {c: gaps(passes, "scorers", c) for c in open_groups}
    # «Al menos una vez en cada cuatro pasadas seguidas»: como mucho tres seguidas sin leerse.
    assert max(worst_first.values()) <= most, sorted(c for c, g in worst_first.items() if g > most)
    assert max(worst_scorers.values()) <= most, sorted(c for c, g in worst_scorers.items() if g > most)
    for code in closed:
        assert gaps(passes, "first", code) <= 3, code                          # ≤ 8 pedido; aquí, ≤ 4


@pytest.mark.parametrize("commits", [True, False], ids=["con-commits", "sin-commits"])
def test_81_open_groups_rotate_within_four_passes(tmp_path, monkeypatch, commits):
    passes, everyone = simulate(tmp_path, monkeypatch, commits)
    assert len(everyone) == 81
    check(passes, everyone)
    # El plazo corta: cada pasada deja grupos para otra, y la segunda pasada también se queda corta.
    assert all(p["run"]["deferred"] for p in passes)
    assert all(len(p["scorers"]) < 81 for p in passes)


@pytest.mark.parametrize("commits", [True, False], ids=["con-commits", "sin-commits"])
def test_with_the_first_phase_closed_the_closed_groups_are_read_once_every_four_passes(tmp_path, monkeypatch, commits):
    closed = [f"FF{i}" for i in range(1, 25) if i != 5]          # FF5, de Las Mesas, sigue abierto
    passes, everyone = simulate(tmp_path, monkeypatch, commits, closed=closed)
    check(passes, everyone, closed=closed)
    for code in closed:                                          # una vez cada cuatro, exactamente
        assert sum(code in p["first"] for p in passes) == PASSES // 4, code


@pytest.mark.parametrize("numbers", [
    [n for n in range(3000, 3030) if n != 3005][:PASSES],          # una ejecución cancelada
    [n for n in range(2000, 2040) if n % 3 != 1][:PASSES],         # una de cada tres
], ids=["un-salto", "uno-de-cada-tres"])
def test_a_cancelled_run_skips_a_number_and_the_rotation_still_holds(tmp_path, monkeypatch, numbers):
    """GITHUB_RUN_NUMBER se salta un número cuando GitHub cancela una ejecución en cola (concurrency: las
    tandas de la federación lanzan el bot) o falla antes del bot: la pasada siguiente empieza dos
    turnos más allá. El turno siguiente de cada nivel (la segunda vuelta de plan_groups) es el margen:
    con ~3 s por página, ningún grupo se queda fuera más de dos pasadas seguidas."""
    passes, everyone = simulate(tmp_path, monkeypatch, commits=False, numbers=numbers)
    check(passes, everyone, most=2)


@pytest.mark.parametrize("commits", [True, False], ids=["con-commits", "sin-commits"])
def test_with_slow_pages_the_turns_still_fit(tmp_path, monkeypatch, commits):
    """Si cada página cuesta el doble de lo previsto (6 s, como antes de fiflp_carga), el plazo da para
    unos 27 grupos por pasada: los prioritarios y el turno de cada nivel, que es lo que hace falta para
    leerlos todos (y sus goleadores) en cuatro pasadas seguidas. Lo que se pierde es el margen."""
    passes, everyone = simulate(tmp_path, monkeypatch, commits, page=6.0)
    check(passes, everyone, page=6.0)
    assert all(len(p["first"]) < 40 for p in passes)
