"""Muchas pasadas seguidas del bot de la federación con la temporada llena, sin red (update_fiflp.py).

La temporada de 2026-27 con todo lo previsto: los 33 grupos de octubre (FF1-24, LZ1-5 y PG1-4), los 32
de alevín (AL1-32) y los 16 de la Segunda Fase de benjamín (A1-D4), 81 grupos. Las Mesas Huracán juega
en PG2, FF5, B2 y en cuatro grupos alevín: siete grupos prioritarios. Cada página de la federación le
cuesta al bot ~3 s (fiflp_carga; reloj falso), un grupo abierto son 7 (clasificación, calendario y cinco
jornadas) más sus goleadores y sus actas (desde el 16/10/2026, cada grupo se lee completo antes del
siguiente) y uno cerrado 2. La rotación no tiene estado (run_number): se prueba con y sin commits entre
pasadas (sin commits, cada pasada arranca de la misma base y del mismo data-health.json, como cuando
update.yml no sube nada porque no ha cambiado ningún dato publicado). En 24 pasadas (seis días con el cron
cada 6 h):
  - los grupos prioritarios se leen en todas, con sus actas y goleadores (con 6 h entre pasadas, les toca
    en todas: update_fiflp.stale);
  - todo grupo abierto se lee al menos una vez en cada cuatro pasadas seguidas (24 h), y lo mismo sus
    goleadores (van con él), alevín incluido; con ~3 s por página, de hecho, en cada tres, también si se
    pierde una pasada (un número de ejecución que se salta); y en cada cuatro mientras la pasada dé para
    los prioritarios y el turno de cada nivel (~27 grupos: ~6 s por página con 7 páginas por grupo, ~5,3 s
    con 8; con las actas de cada pasada, 5,5 s). Más lento, el plazo corta el turno, cada época por otro
    sitio (spin): en cada ocho (48 h) hasta ~6,8 s con 7 páginas;
  - con una pasada perdida cada día a la misma hora (28 pasadas), en cada cuatro con ~3 s por página
    y en cada ocho con 4 s: el margen de la pasada anterior lee el turno perdido;
  - un grupo cerrado, una vez en cada época de cuatro pasadas, en una que salta dos puestos de una
    época a otra: al menos una vez en cada seis seguidas, y en cada ocho (lo pedido) aunque se pierda
    una pasada al día;
  - ninguna página se pide pasado el plazo, y cada prioritario se lee completo antes del siguiente.
EL MODELO de estas simulaciones es el de cuando se calibraron (octubre de 2026) y se fija aquí: un plazo
de 25 min (FIFLP_BUDGET_MIN), la ventana de jornadas de 21 días atrás y 14 adelante (7 páginas por grupo
abierto) y el cron cada 6 h (update_fiflp.PASS_EVERY, con los cerrados y las competiciones una vez cada
cuatro pasadas: CLOSED_PASSES, EXTRAS_PASSES). Desde el 16/10/2026 el bot hace pasadas CORTAS cada 2 h
(16 min, una espera del freno, 10 días atrás y 8 adelante) y lo que manda es el cupo de la federación (~15
páginas por IP y un bloqueo que escala dentro de la pasada: fiflp_carga), que no es un coste fijo por
página: una pasada, en test_bot_freno.py; muchas, con la temporada llena, al final de este
(test_with_the_measured_quota_…) y, con las jornadas, los resultados y las actas de una semana, en
test_bot_pasada_corta.py. Lo de aquí comprueba la rotación sin estado en sí.
"""
from datetime import date, datetime, timedelta, timezone
import json
import re
import sqlite3
import statistics
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
BUDGET = 25 * 60                 # el plazo del modelo (el del bot hasta el 15/10/2026; ahora, 33 min)
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


def base_db(closed=(), pending=True):
    """La base: cada grupo abierto con dos jornadas jugadas (3 y 10 de octubre) y sus dos actas por
    leer (con `pending`; si no, ya leídas); los cerrados (`closed`), con todo jugado el 12 de septiembre
    y las actas ya leídas."""
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
                (gid, f"Jornada {n}", day, ids[0], ids[1], acta, acta if code in closed or not pending else None))
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
    y dos que la base aún no tiene), y `extra` más que aún no tiene (7/11…: 8 páginas por grupo, como
    un sábado con la ventana de 21 días atrás y 14 adelante); el de uno cerrado, la del 12/9, ya leída."""
    url = ""

    def __init__(self, closed, extra=0):
        self.closed, self.extra = closed, extra

    def evaluate(self, js, *a):
        if 'select[name="jornada"]' not in js:
            return []
        gid = int(re.search(r"CodGrupo=(\d+)", self.url).group(1))
        if gid in self.closed:
            return [{"value": "1", "text": "1 - 12-09-2026"}]
        days = [f"{day}-10-2026" for day in ("03", "10", "17", "24", "31")] + [f"{7 + k:02d}-11-2026" for k in range(self.extra)]
        return [{"value": str(n), "text": f"{n} - {day}"} for n, day in enumerate(days, 1)]

    def wait_for_timeout(self, ms):
        pass

    def content(self):
        return "<html></html>"


class Fed:
    """La federación: cada página, `cost` segundos del reloj; apunta cuándo empezó cada una. Caída
    (`down`), cada página falla tras sus reintentos (15 y 30 s) y, con tres seguidas, `blocked`, como
    fiflp_carga.Federacion: la pasada se pierde."""
    BASE = "https://www.fiflp.com/pnfg/NPcd"

    def __init__(self, clock, cost=PAGE, down=False):
        self.clock, self.cost, self.down, self.urls, self.starts, self.failures = clock, cost, down, [], [], 0

    @property
    def blocked(self):
        return self.failures >= 3

    def goto(self, page, url):
        self.urls.append(url)
        self.starts.append(self.clock.t)
        page.url = url
        if self.down:
            self.clock.t += 45 + 3 * self.cost
            self.failures += 1
            return False
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


def simulate(tmp_path, monkeypatch, commits, closed=(), numbers=None, page=PAGE, extra=0, lost=(), actas=0):
    """`numbers` pasadas (por defecto 24 seguidas); con `commits`, cada una arranca de la base y del
    data-health.json que dejó la anterior; sin ellos, de los de partida. `extra`: jornadas de más en
    cada calendario (páginas por grupo); `lost`: las pasadas (su índice) en que la federación no sirve
    nada; `actas`: actas de más por leer en cada grupo prioritario (un fin de semana). Devuelve, por
    pasada, los grupos leídos, los que tuvieron su segunda pasada (goleadores), las notas y el tiempo."""
    import source_health
    (tmp_path / "index.html").write_text('<script src="./data-seasons.js?v=20261014a"></script>')
    monkeypatch.setattr(source_health, "ROOT", tmp_path)
    monkeypatch.setattr(source_health, "REPORT_PATH", tmp_path / "data-health.json")
    monkeypatch.setattr(source_health, "_report", None)
    monkeypatch.setattr(U, "flatten", lambda page, selector=None: 0)
    # Un acta que se lee bien queda importada (con su código): deja de estar pendiente.
    monkeypatch.setattr(U, "apply_acta", lambda conn, mid, code, acta, log=print: bool(
        conn.execute("UPDATE matches SET cod_acta=? WHERE id=?", (code, mid))))
    for name in ("FIFLP_PRIORITY_TEAMS", "FIFLP_ALEVIN_MIN"):
        monkeypatch.delenv(name, raising=False)
    # El modelo de cuando se calibró (docstring del módulo): 25 min de plazo, 6 de reserva y la ventana de
    # 21 días atrás y 14 adelante. Con los de ahora (33, 8, 10 y 8) todo cabe con más holgura.
    monkeypatch.setenv("FIFLP_BUDGET_MIN", str(BUDGET // 60))
    # La reserva ya no es la de una segunda pasada (eran 6 de 25 min): desde el 16/10/2026 cada grupo se lee
    # completo (calendario, goleadores y actas) y en los últimos RESERVE_SECONDS (2 min) no empieza ninguno.
    monkeypatch.delenv("FIFLP_RESERVE_MIN", raising=False)
    monkeypatch.setattr(U, "BACK_DAYS", 21)
    monkeypatch.setattr(U, "AHEAD_DAYS", 14)
    # Y el cron de entonces, cada 6 h (desde el 16/10/2026, cada 2 h: PASS_EVERY), con un cerrado y las
    # competiciones una vez cada cuatro pasadas (CLOSED_PASSES, EXTRAS_PASSES: 24 h, como ahora con doce).
    monkeypatch.setattr(U, "PASS_EVERY", timedelta(hours=6))
    monkeypatch.setattr(U, "CLOSED_PASSES", 4)
    monkeypatch.setattr(U, "EXTRAS_PASSES", 4)
    base = base_db(closed, pending=False)
    codes = dict((gid, code) for gid, code, _ in U.fiflp_groups(base, 1))
    for gid, code in codes.items():
        if code in MINE:
            home, away = base.execute("SELECT home_team_id, away_team_id FROM matches WHERE group_id=?",
                                      (gid,)).fetchone()
            for k in range(actas):
                base.execute("""INSERT INTO matches(group_id, jornada, date, home_team_id, away_team_id, home_score,
                                away_score, fiflp_acta) VALUES (?, ?, '2026-10-10', ?, ?, 0, 0, ?)""",
                             (gid, f"Jornada {20 + k}", away, home, gid * 1000 + k))
    base.commit()
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
        fed = Fed(clock, page, down=i in lost)
        groups = U.fiflp_groups(conn, 1)
        pending = {code: u for _, code, u in groups}
        U.run_passes(Page(closed_ids, extra), fed, conn, 1, groups, TODAY, pending, number=number,
                     now=NOW + timedelta(hours=6 * i))
        source_health.finish(now=NOW + timedelta(hours=6 * i, minutes=30))
        assert pending == {}
        report = json.loads(source_health.REPORT_PATH.read_text())
        passes.append({"first": read_first(fed, codes) if i not in lost else set(),
                       "scorers": read_scorers(fed, codes), "run": report["run"], "lost": i in lost,
                       "last_start": max(fed.starts), "end": clock.t, "report": report, "urls": list(fed.urls)})
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


def check(passes, everyone, closed=(), page=PAGE, most=3, most_closed=5):
    """`most`: las pasadas seguidas que un grupo abierto puede quedarse sin leer (3: «al menos una vez
    en cada cuatro»), contando las perdidas; `most_closed`, uno cerrado (lo pedido: en cada ocho, 7)."""
    budget = BUDGET
    for i, p in enumerate(passes):
        assert p["last_start"] <= budget, (i, p["last_start"])                   # nada pasado el plazo
        assert p["end"] <= budget + page, (i, p["end"])
        if p["lost"]:
            continue
        assert set(MINE) <= p["first"], (i, set(MINE) - p["first"])              # prioritarios, en todas
        assert set(MINE) <= p["scorers"], (i, set(MINE) - p["scorers"])          # con sus goleadores
        if not any(q["lost"] for q in passes):
            assert p["report"]["summary"] == {"ok": len(everyone), "rejected": 0, "error": 0}
    open_groups = everyone - set(closed)
    worst_first = {c: gaps(passes, "first", c) for c in open_groups}
    worst_scorers = {c: gaps(passes, "scorers", c) for c in open_groups}
    # «Al menos una vez en cada cuatro pasadas seguidas»: como mucho tres seguidas sin leerse.
    assert max(worst_first.values()) <= most, sorted(c for c, g in worst_first.items() if g > most)
    assert max(worst_scorers.values()) <= most, sorted(c for c, g in worst_scorers.items() if g > most)
    for code in closed:
        assert gaps(passes, "first", code) <= most_closed, code                # ≤ 8 pedido; aquí, ≤ 6


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
    """Un cerrado, una vez en cada época de cuatro pasadas (24 h): en 24 pasadas, seis veces, y nunca
    más de cinco seguidas sin leer (su pasada salta dos puestos de una época a otra; lo pedido: en
    cada ocho)."""
    closed = [f"FF{i}" for i in range(1, 25) if i != 5]          # FF5, de Las Mesas, sigue abierto
    passes, everyone = simulate(tmp_path, monkeypatch, commits, closed=closed)
    check(passes, everyone, closed=closed)
    for code in closed:                                          # una vez en cada época, exactamente
        assert [sum(code in p["first"] for p in passes[e:e + 4]) for e in range(0, PASSES, 4)] == [1] * 6, code


@pytest.mark.parametrize("numbers, page, most", [
    ([n for n in range(3000, 3030) if n != 3005][:PASSES], PAGE, 2),          # una ejecución cancelada
    ([n for n in range(2000, 2040) if n % 3 != 1][:PASSES], PAGE, 2),         # una de cada tres
    ([n for n in range(2000, 2040) if n % 3 != 1][:PASSES], 4.0, 4),          # …con páginas más lentas
    ([n for n in range(2000, 2040) if n % 3 != 1][:PASSES], 5.0, 4),
    (list(range(4000, 4000 + 2 * PASSES, 2)), 4.0, 3),                        # una de cada dos
], ids=["un-salto", "uno-de-cada-tres", "uno-de-cada-tres-4s", "uno-de-cada-tres-5s", "uno-de-cada-dos-4s"])
def test_a_cancelled_run_skips_a_number_and_the_rotation_still_holds(tmp_path, monkeypatch, numbers, page, most):
    """GITHUB_RUN_NUMBER se salta un número cuando GitHub cancela una ejecución en cola (concurrency: las
    tandas de la federación lanzan el bot) o falla antes del bot: el turno de ese número no tiene su
    pasada. El turno siguiente de cada nivel (el margen de plan_groups, con sus goleadores) lo cubre:
    con ~3 s por página, ningún grupo se queda fuera más de dos pasadas seguidas. Los turnos son
    siempre cuatro, sea cual sea N: con los tres prebenjamín no prioritarios (PG1, PG3 y PG4) eran un
    ciclo de tres pasadas, y saltándose una de cada tres PG3 no tenía nunca su turno (ni sus
    goleadores, a 4 s, ni el grupo, a 5 s)."""
    passes, everyone = simulate(tmp_path, monkeypatch, commits=False, numbers=numbers, page=page)
    check(passes, everyone, page=page, most=most)
    assert sum("PG3" in p["scorers"] for p in passes) >= PASSES // 4


@pytest.mark.parametrize("commits, page", [(True, 5.5), (False, 6.0)], ids=["con-commits", "sin-commits"])
def test_with_slow_pages_the_turns_still_fit(tmp_path, monkeypatch, commits, page):
    """Si cada página cuesta el doble de lo previsto (6 s, como antes de fiflp_carga), el plazo da para
    unos 27 grupos por pasada: los prioritarios y el turno de cada nivel, que es lo que hace falta para
    leerlos todos (y sus goleadores) en cuatro pasadas seguidas. Lo que se pierde es el margen. Es el
    límite: a 6,5 s ya no caben (test_slower_pages_cut_a_different_part_of_the_turn_each_day). Con commits
    (un acta nueva en un cuarto de los grupos en cada pasada), desde el 16/10/2026 el límite es 5,5 s: cada
    grupo se lee completo, y esos cuestan dos páginas más en la misma pasada (su acta y sus goleadores;
    antes, en la segunda pasada, que el plazo cortaba)."""
    passes, everyone = simulate(tmp_path, monkeypatch, commits, page=page)
    check(passes, everyone, page=page)
    assert all(len(p["first"]) < 40 for p in passes)


@pytest.mark.parametrize("extra, page, most", [
    (1, 5.3, 3),            # 8 páginas por grupo: el límite de las cuatro pasadas
    (0, 6.5, 7), (0, 6.8, 7), (1, 5.5, 7), (1, 6.0, 7),
], ids=["8pag-5.3s", "7pag-6.5s", "7pag-6.8s", "8pag-5.5s", "8pag-6.0s"])
def test_slower_pages_cut_a_different_part_of_the_turn_each_day(tmp_path, monkeypatch, extra, page, most):
    """Más allá de ~6 s por página (7 por grupo; ~5,3 s con 8, un sábado con seis jornadas en la
    ventana) la primera pasada no llega al turno entero de benjamín, el último del paso 3. El corte
    caía siempre en la cola de un turno que solo avanzaba un puesto cada cuatro pasadas: a 6,8 s, 31
    grupos se quedaban hasta 14 pasadas seguidas (3,5 días) sin leer. Con el turno girado según la
    época (spin), lo que queda fuera cambia de un día a otro: nadie pasa más de 7 seguidas sin leer
    (al menos una vez en cada ocho, 48 h). Igual con o sin commits (no hay estado)."""
    passes, everyone = simulate(tmp_path, monkeypatch, commits=False, page=page, extra=extra)
    check(passes, everyone, page=page, most=most)
    if most > 3:
        assert any(p["run"]["deferred"] for p in passes)


@pytest.mark.parametrize("phase", range(4))
@pytest.mark.parametrize("page, most", [(PAGE, 3), (4.0, 7)], ids=["3s", "4s"])
def test_a_pass_lost_every_day_at_the_same_hour_does_not_starve_its_turn(tmp_path, monkeypatch, phase, page, most):
    """28 pasadas (una semana) con la federación caída en una de cada cuatro, siempre la misma (la
    misma hora cada día: una franja en que bloquea o se cae). El turno de esa pasada lo lee el margen
    de la anterior: con ~3 s por página, todo grupo se lee (con sus goleadores) al menos una vez en cada
    cuatro pasadas, la perdida incluida; con 4 s, el margen no da para el turno entero, pero cada día
    lee otra parte (spin): al menos una vez en cada ocho. Antes, a 3,8 s, FF1 y FF2 pasaban 17
    seguidas sin leer y a 4,5 s algunos no se leían en toda la semana."""
    lost = {i for i in range(28) if i % 4 == phase}
    passes, everyone = simulate(tmp_path, monkeypatch, commits=False, numbers=range(1000, 1028), page=page, lost=lost)
    check(passes, everyone, page=page, most=most)


@pytest.mark.parametrize("phase", range(4))
def test_a_pass_lost_every_day_does_not_starve_the_closed_groups_of_its_hour(tmp_path, monkeypatch, phase):
    """Con un turno fijo para cada cerrado (crc32 % 4), los de la pasada que se pierde cada día no se
    leían nunca (FF1, FF3, FF8, FF10, FF12 y FF19 en 28 pasadas). Su pasada salta dos puestos de una
    época a otra (closed_turn): la que se pierde les quita como mucho una de cada dos, y se leen al
    menos una vez en cada ocho pasadas, lo pedido."""
    closed = [f"FF{i}" for i in range(1, 25) if i != 5]
    lost = {i for i in range(28) if i % 4 == phase}
    passes, everyone = simulate(tmp_path, monkeypatch, commits=False, closed=closed, numbers=range(1000, 1028),
                                lost=lost)
    check(passes, everyone, closed=closed, most=3, most_closed=7)


@pytest.mark.parametrize("page", [PAGE, 7.0], ids=["3s", "7s"])
def test_each_priority_group_is_read_complete_before_the_next_and_nothing_starts_past_the_deadline(
        tmp_path, monkeypatch, page):
    """Cada grupo, completo antes del siguiente (desde el 16/10/2026): las actas y los goleadores de cada
    prioritario van justo tras su calendario y antes que el calendario del siguiente grupo. Hasta entonces
    iban tras TODOS los calendarios de los prioritarios, a cuenta de la reserva de la segunda pasada, y no le
    quitaban nada a los demás; ahora la segunda pasada no existe (el segundo freno de la federación la dejaba
    sin hacer) y esas actas las pagan los demás grupos, que leen menos en esa pasada: lo que se gana es que
    ningún grupo leído se queda sin sus actas ni sus goleadores. Con la temporada llena, a 3 s y a 7 s por
    página y un fin de semana con 8 actas de más en cada uno de los siete prioritarios (70 actas: más que
    las 60 de una pasada, MAX_ACTAS_PER_RUN), ninguna página empieza pasado el plazo y, en la pasada del día
    (extras_turn), la página de competiciones se lee tras los prioritarios."""
    number = next(n for n in range(1000, 1004) if U.daily_turn("competiciones y directorio", n, 4))
    mine = {gid: code for gid, (code, _) in enumerate(season_groups(), 1) if code in MINE}
    for actas in (0, 8):
        (passes, everyone), = [simulate(tmp_path, monkeypatch, commits=False, numbers=[number], page=page,
                                        actas=actas)]
        p = passes[0]
        assert p["last_start"] <= BUDGET and p["end"] <= BUDGET + page, actas
        assert set(MINE) <= p["first"] and set(MINE) <= p["scorers"], actas
        # Lo de cada prioritario (calendario, goleadores y actas, que llevan su número de grupo: gid·1000 + k),
        # seguido: nada de otro grupo entre su calendario y lo último suyo.
        owner = []
        for u in p["urls"]:
            group = re.search(r"(?i)codgrupo=(\d+)", u)
            acta = re.search(r"CodActa=(\d+)", u)
            owner.append(int(group.group(1)) if group else int(acta.group(1)) // 1000 if acta else None)
        for gid in mine:
            at = [i for i, o in enumerate(owner) if o == gid]
            assert at and all(owner[i] == gid for i in range(at[0], at[-1] + 1)), (actas, mine[gid])
        assert sum("CodActa=" in u for u in p["urls"]) == (min(60, 8 * len(MINE)) if actas else 0), actas
        # Las competiciones, en su pasada del día, tras los prioritarios.
        catalog = [i for i, u in enumerate(p["urls"]) if "NFG_CmpJornada" in u and "CodGrupo=" not in u]
        last_mine = max(i for i, o in enumerate(owner) if o in mine)
        assert catalog and catalog[0] > last_mine, actas


# ── Con el cupo de la federación (15/10/2026) ──────────────────────────────────

class Cupo:
    """La federación MEDIDA el 15/10/2026 (freno-fiflp.yml; test_bot_freno.Quota): sirve `per_ip`
    documentos y después vacías durante `block` s desde la primera vacía (los sondeos no lo alargan); al
    pasar, otro cupo. Cada carga, `cost` s del reloj. Apunta cuándo empieza cada petición y las que sirve."""

    def __init__(self, clock, per_ip=15, block=300, cost=2.0):
        self.clock, self.per_ip, self.block, self.cost = clock, per_ip, block, cost
        self.count, self.since, self.urls, self.starts, self.served = 0, None, [], [], []

    def braking(self):
        if self.since is not None and self.clock.t >= self.since + self.block:
            self.since, self.count = None, 0
        if self.since is None and self.count >= self.per_ip:
            self.since = self.clock.t
        if self.since is None:
            self.count += 1
        return self.since is not None


class CupoPage(Page):
    """La página del navegador sobre Cupo. El calendario de un grupo abierto trae las jornadas del 3/10 y
    el 10/10, ya en la base, y `rounds` - 1 más (17/10, 24/10…) que no tiene: se leen la del 10 y esas, y un
    grupo cuesta 2 + `rounds` páginas (clasificación, calendario y sus jornadas: 4 un miércoles y 5 un
    sábado, test_bot_paginas)."""

    def __init__(self, web, closed=(), rounds=2):
        super().__init__(closed)
        self.web, self.empty, self.rounds = web, False, rounds

    def goto(self, url, wait_until=None, timeout=None):
        web = self.web
        web.urls.append(url)
        web.starts.append(web.clock.t)
        self.url, self.empty = url, web.braking()
        if not self.empty:
            web.served.append(url)
        web.clock.t += web.cost

    def evaluate(self, js, *a):
        import fiflp_carga as C
        if js == C.EMPTY_JS:
            return self.empty
        return [] if self.empty else super().evaluate(js, *a)[:1 + self.rounds]

    def wait_for_function(self, js, arg=None, timeout=None, polling=None):
        pass


class Reader:
    BASE = Fed.BASE

    @staticmethod
    def parse_standings(page):
        return []

    @staticmethod
    def parse_matches(page):
        return []


def level(code):
    return "alevín" if code.startswith("AL") else "prebenjamín" if code.startswith("PG") else "benjamín"


@pytest.mark.parametrize("commits, rounds, days", [(True, 2, 7), (True, 3, 7), (False, 2, 2), (False, 3, 2)],
                         ids=["con-commits-4pag", "con-commits-5pag", "sin-commits-4pag", "sin-commits-5pag"])
def test_with_the_measured_quota_every_group_is_read_within_days(tmp_path, monkeypatch, commits, rounds, days):
    """Con el cupo medido (~15 páginas por IP y ~5 min de bloqueo: fiflp_carga) y el bot de ahora (desde el
    16/10/2026: una pasada cada 2 h que espera solo el primer freno, BRAKE_PAUSES, y acaba en el segundo;
    16 min de plazo; cada grupo completo; los prioritarios cuando toca), cada pasada son ~30 páginas: los
    prioritarios de su turno (cada uno, una de cada tres pasadas: 6 h) y unos pocos grupos más (4 o 5
    páginas por grupo, más sus goleadores y sus actas). Hasta el 15/10/2026, con la cuota de alevín DELANTE
    del turno de prebenjamín y de benjamín, esos pocos eran siempre alevín y los 46 grupos no prioritarios
    de benjamín y prebenjamín no se leían NUNCA; con el turno intercalado (plan_groups, interleave) y la
    fase de cada nivel (pass_phase), cada nivel lee su parte y todo grupo se lee en una semana. Con commits
    (data-health.json publicado: la hora de los prioritarios se publica siempre), cada prioritario se lee
    al menos cada 6 h y no en todas. Sin commits (cada pasada arranca del mismo data-health.json, de hace
    6 h y cada vez más viejo), los prioritarios tocan en todas: lo seguro, aunque cueste el resto. Ningún
    error, ninguna página pasado el plazo y una sola espera del freno por pasada."""
    import fiflp_carga as C
    import source_health
    (tmp_path / "index.html").write_text('<script src="./data-seasons.js?v=20261014a"></script>')
    monkeypatch.setattr(source_health, "ROOT", tmp_path)
    monkeypatch.setattr(source_health, "REPORT_PATH", tmp_path / "data-health.json")
    monkeypatch.setattr(source_health, "_report", None)
    monkeypatch.setattr(U, "flatten", lambda page, selector=None: 0)
    monkeypatch.setattr(U, "apply_acta", lambda conn, mid, code, acta, log=print: bool(
        conn.execute("UPDATE matches SET cod_acta=? WHERE id=?", (code, mid))))
    for name in ("FIFLP_PRIORITY_TEAMS", "FIFLP_ALEVIN_MIN", "FIFLP_BUDGET_MIN", "FIFLP_RESERVE_MIN",
                 "FIFLP_BRAKE_PAUSE_MIN", "FIFLP_BRAKE_PAUSES", "FIFLP_BRAKE_PROBE_S", "FIFLP_BRAKE_MAX_MIN",
                 "FIFLP_MIN_INTERVAL", "FIFLP_PRIORITY_MAX_H"):
        monkeypatch.delenv(name, raising=False)
    base = base_db()
    codes = {gid: code for gid, code, _ in U.fiflp_groups(base, 1)}
    start_report = base_report(base)
    conn, report, reads, others, mine = base, start_report, {code: 0 for code in codes.values()}, [], {c: [] for c in MINE}
    every = U.PASS_EVERY
    for i in range(int(timedelta(days=days) / every)):
        if not commits:
            conn = sqlite3.connect(":memory:")
            base.backup(conn)
            report = start_report
        source_health.REPORT_PATH.write_text(json.dumps(report))
        source_health.begin("2026-2027")
        clock = Clock()
        monkeypatch.setattr(U, "clock", clock)

        def sleep(s):
            clock.t += max(s, 0)
        monkeypatch.setattr(C, "pause", lambda extra=0: sleep(1.0 + extra))
        now = NOW + every * i
        web = Cupo(clock)
        F = C.Federacion(Reader, deadline=clock() + U.budget_seconds(), interval=7.0, clock=clock, sleep=sleep,
                         wall=lambda: now + timedelta(seconds=clock.t), log=lambda s: None)
        groups = U.fiflp_groups(conn, 1)
        pending = {code: u for _, code, u in groups}
        U.run_passes(CupoPage(web, rounds=rounds), F, conn, 1, groups, TODAY, pending, now=now, number=1000 + i)
        source_health.finish(now=now + timedelta(minutes=20))
        assert pending == {}
        assert all(t <= F.deadline for t in web.starts), i                 # nada pasado el plazo
        report = json.loads(source_health.REPORT_PATH.read_text())
        assert report["summary"]["error"] == 0, i
        assert F.pauses == 1 and len(web.served) <= 2 * web.per_ip + 1, i  # una espera: ~30 páginas
        # Leído: su calendario servido, y el grupo entero (no en unserved: el freno lo cortó).
        fresh = {codes[int(m.group(1))] for u in web.served if "CodJornada" not in u
                 for m in [re.search(r"NFG_CmpJornada\?.*CodGrupo=(\d+)$", u)] if m} - set(report["run"]["unserved"])
        for code in fresh:
            reads[code] += 1
            if code in MINE:
                mine[code].append(i)
        others.append(len(fresh - set(MINE)))
    passes = int(timedelta(days=days) / every)
    if commits:
        # Cada prioritario, al menos una de cada tres pasadas (6 h), y no en todas.
        for code, got in mine.items():
            marks = [-1] + got + [passes]
            assert max(b - a for a, b in zip(marks, marks[1:])) <= 3, (code, got)
            assert len(got) < passes, code
        # Las primeras, con los siete prioritarios a la vez (data-health.json de hace 6 h para todos), no leen
        # más; después se reparten (priority_slot) y cada pasada lee ~2-3 grupos más.
        assert statistics.mean(others[3:]) >= 2 and min(others[3:]) >= 1, others
        never = sorted(c for c, n in reads.items() if not n)
        assert never == [], (len(never), never)
        assert {level(c) for c, n in reads.items() if n and c not in MINE} == {"alevín", "prebenjamín", "benjamín"}
    else:
        # Sin publicar data-health.json (commits que fallan), todos los prioritarios tocan en todas, como antes
        # del 16/10/2026, y el cupo no da para los siete: los primeros (por nivel y código), en todas.
        assert all(len(mine[c]) == passes for c in ("PG2", "B2", "FF5")), mine
