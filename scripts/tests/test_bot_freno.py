"""Un freno no es un error, y una pausa larga en vez de rendirse (update_fiflp + fiflp_carga, 15/10/2026).

La federación frena de forma errática: sirve páginas vacías («<html><head></head><body></body></html>»
con un 200) tras 10-41 páginas unas pasadas y ninguna en 130-169 otras, a 7 s por página. La pasada 1103
(run 38676418915, 03:28 UTC) frenó a las ~14 páginas, en la jornada 4 de AL4: AL4 y AL9 (de Las Mesas)
quedaron como «error» en data-health.json (la web ponía «Revisión pendiente.» en sus equipos) aunque solo
la federación no las sirvió, y la pasada se rindió a los 4,8 min con 20 de plazo sin usar: AL18 y AL20 ni
se intentaron. Ahora:
  - A: un grupo cuyo calendario la federación no sirve por su freno conserva su última comprobación y
    queda para otra pasada (run.unserved), sin escribir nada de lo que ya había leído; uno que no carga
    sin señal de freno (una URL muerta mientras el resto carga, o dos seguidas: la última página leída
    carga) sigue siendo un error;
  - B: al frenar, una pausa larga (5 min) y LA MISMA página otra vez, mientras quepa en el plazo y hasta
    3 por pasada; si vuelve a servir, la pasada sigue, más despacio, sin que las pausas les quiten su
    plazo a los calendarios de los prioritarios. Ninguna página empieza pasado el plazo.
Sin red: la federación del bot de verdad (fiflp_carga.Federacion) con un reloj y un sueño falsos, sobre
una página falsa que sirve vacío mientras dura el freno.
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
import fiflp_carga as C  # noqa: E402
import update_fiflp as U  # noqa: E402

TODAY = date(2026, 10, 15)
NOW = datetime(2026, 10, 15, 3, 28, tzinfo=timezone.utc)     # la pasada 1103
BUDGET = 25 * 60
BASE = "https://www.fiflp.com/pnfg/NPcd"

# Los seis grupos de Las Mesas Huracán de la pasada 1103 y unos pocos más.
GROUPS = [("PG2", "PREBENJAMIN", ["Las Mesas Hu.", "Moya"]), ("FF5", "BENJAMIN", ["Las Mesas Hu.", "Tamaraceite"]),
          ("AL4", "ALEVIN", ["Las Mesas Hu. A", "Arucas"]), ("AL9", "ALEVIN", ["Las Mesas Hu. B", "Teror"]),
          ("AL18", "ALEVIN", ["Las Mesas Hu. C", "Firgas"]), ("AL20", "ALEVIN", ["Las Mesas Huracán D", "Tablero"]),
          ("AL1", "ALEVIN", ["Guiniguada", "Lomo Blanco"]), ("PG1", "PREBENJAMIN", ["Unión Viera", "Pedro Hidalgo"]),
          ("FF1", "BENJAMIN", ["Valsequillo", "Haría"]), ("FF2", "BENJAMIN", ["Tías", "Carnevali"])]
ALL = [code for code, _, _ in GROUPS]
ORDER = ["PG2", "FF5", "AL4", "AL9", "AL18", "AL20", "AL1", "PG1", "FF1", "FF2"]     # el de la pasada 1103
ID = {code: i for i, (code, _, _) in enumerate(GROUPS, 1)}
CODE = {i: code for code, i in ID.items()}
# El calendario de cada grupo: tres jornadas en la ventana del bot (la 2, la 3 y la 4).
OPTIONS = [{"value": str(n), "text": f"{n} - {day}"} for n, day in ((2, "26-09-2026"), (3, "03-10-2026"),
                                                                   (4, "10-10-2026"))]


def url(n):
    return f"{BASE}/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22&CodCompeticion=900&CodGrupo={n}"


def season():
    """Cada grupo con la jornada 1 jugada (19/9) y la 5 por jugar (17/10, con los lados al revés que el
    partido que trae la jornada 2: así ese entra como nuevo y no como uno movido de jornada)."""
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.execute("INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2026-2027', 2026, 2027, 1)")
    cats = {}
    for code, cat, teams in GROUPS:
        if cat not in cats:
            cats[cat] = conn.execute("INSERT INTO categories(name) VALUES (?)", (cat,)).lastrowid
        conn.execute("INSERT INTO groups(id, season_id, category_id, code, url) VALUES (?, 1, ?, ?, ?)",
                     (ID[code], cats[cat], code, url(ID[code])))
        ids = [conn.execute("INSERT OR IGNORE INTO teams(name) VALUES (?)", (t,)) and
               conn.execute("SELECT id FROM teams WHERE name=?", (t,)).fetchone()[0] for t in teams]
        conn.execute("""INSERT INTO matches(group_id, jornada, date, home_team_id, away_team_id, home_score, away_score)
                        VALUES (?, 'Jornada 1', '2026-09-19', ?, ?, 1, 0)""", (ID[code], *ids))
        conn.execute("""INSERT INTO matches(group_id, jornada, date, home_team_id, away_team_id)
                        VALUES (?, 'Jornada 5', '2026-10-17', ?, ?)""", (ID[code], ids[1], ids[0]))
    conn.commit()
    return conn


def matches(conn, code):
    return conn.execute("SELECT count(*) FROM matches WHERE group_id=?", (ID[code],)).fetchone()[0]


def report(at=NOW - timedelta(hours=6)):
    """data-health.json de la pasada anterior (como lo deja source_health.finish): todo bien."""
    groups = {code: {"url": url(ID[code]), "status": "ok", "message": "3 jornadas leídas",
                     "checkedAt": at.isoformat()} for code in ALL}
    return {"version": 1, "season": "2026-2027", "groups": groups,
            "nextSeason": {"name": "2027-2028", "status": "pending"}, "checkedAt": at.isoformat(),
            "dataVersion": "20261014a", "summary": {"ok": len(ALL), "rejected": 0, "error": 0}}


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


class Federation:
    """La web de la federación: cada carga cuesta `cost` s. Tras `serve` peticiones frena (sirve vacías)
    durante `lasts` s (None: no se le pasa en toda la pasada). Las URLs de los grupos de `dead` responden
    500 siempre (una URL muerta). Apunta cuándo empieza cada petición."""

    def __init__(self, clock, serve=None, lasts=None, dead=(), cost=2.0):
        self.clock, self.serve, self.lasts, self.dead, self.cost = clock, serve, lasts, set(dead), cost
        self.brake_from, self.starts = None, []

    def braking(self):
        if self.serve is not None and self.brake_from is None and len(self.starts) > self.serve:
            self.brake_from = self.clock.t
        return self.brake_from is not None and (self.lasts is None or self.clock.t < self.brake_from + self.lasts)

    def page(self):
        return Page(self)


class Response:
    def __init__(self, status):
        self.status = status


class Page:
    def __init__(self, web):
        self.web, self.url, self.empty = web, "", False

    def goto(self, url, wait_until=None, timeout=None):
        web = self.web
        web.starts.append((web.clock.t, url))
        self.url, self.empty = url, web.braking()
        web.clock.t += web.cost
        group = re.search(r"(?i)codgrupo=(\d+)(?:&|$)", url)
        return Response(500 if group and CODE.get(int(group.group(1))) in web.dead else 200)

    def evaluate(self, js, *a):
        if js == C.EMPTY_JS:
            return self.empty
        if 'select[name="jornada"]' in js:
            return OPTIONS if "CodGrupo=" in self.url and "NFG_CmpJornada" in self.url else []
        return []

    def wait_for_function(self, js, arg=None, timeout=None, polling=None):
        pass

    def content(self):
        return "<html></html>"


class Reader:
    """Los lectores del raspador: sin clasificación, y en la jornada 2 un partido que la base no tiene
    (así se ve si se escribe algo de un grupo a medias)."""
    BASE = BASE

    @staticmethod
    def parse_standings(page):
        return []

    @staticmethod
    def parse_matches(page):
        if not page.url.endswith("&CodJornada=2"):
            return []
        home, away = dict((c, t) for c, _, t in GROUPS)[CODE[int(re.search(r"CodGrupo=(\d+)", page.url).group(1))]]
        return [{"home": home, "away": away, "hs": None, "as": None, "date": "", "time": "", "venue": ""}]


@pytest.fixture
def bot(tmp_path, monkeypatch):
    """La pasada 1103 con data-health.json de verdad (source_health) en un directorio de prueba. Devuelve
    run(web=…, fed=…): (data-health.json, la web, la Federacion, el log)."""
    import source_health
    (tmp_path / "index.html").write_text('<script src="./data-seasons.js?v=20261014a"></script>')
    monkeypatch.setattr(source_health, "ROOT", tmp_path)
    monkeypatch.setattr(source_health, "REPORT_PATH", tmp_path / "data-health.json")
    monkeypatch.setattr(source_health, "_report", None)
    monkeypatch.setattr(U, "flatten", lambda page, selector=None: 0)
    monkeypatch.setattr(U, "apply_acta", lambda conn, mid, code, acta, log=print: bool(
        conn.execute("UPDATE matches SET cod_acta=? WHERE id=?", (code, mid))))
    monkeypatch.setenv("FIFLP_PRIORITY_TEAMS", "Las Mesas Hu.")
    for name in ("FIFLP_ALEVIN_MIN", "FIFLP_BUDGET_MIN", "FIFLP_RESERVE_MIN", "FIFLP_BRAKE_PAUSE_MIN",
                 "FIFLP_BRAKE_PAUSES", "FIFLP_MIN_INTERVAL"):
        monkeypatch.delenv(name, raising=False)

    def run(capsys, conn=None, budget=BUDGET, previous=None, web=None, fed=None, **web_kw):
        conn = conn or season()
        previous = previous or report()
        source_health.REPORT_PATH.write_text(json.dumps(previous))
        source_health.begin("2026-2027")
        clock = Clock()
        monkeypatch.setattr(U, "clock", clock)

        def sleep(s):
            clock.t += s
        monkeypatch.setattr(C, "pause", lambda extra=0: sleep(1.0 + extra))     # FIFLP_DELAY, en el reloj
        web = (web or Federation)(clock, **web_kw)
        F = (fed or C.Federacion)(Reader, deadline=clock() + budget, interval=7.0, clock=clock, sleep=sleep,
                                  wall=lambda: NOW + timedelta(seconds=clock.t - 1000))
        groups = U.fiflp_groups(conn, 1)
        pending = {code: u for _, code, u in groups}
        U.run_passes(web.page(), F, conn, 1, groups, TODAY, pending, deadline_seconds=budget, now=NOW, number=1103)
        source_health.finish(now=NOW + timedelta(minutes=8))
        assert pending == {}
        assert all(t <= F.deadline for t, _ in web.starts), "ninguna página empieza pasado el plazo"
        return json.loads(source_health.REPORT_PATH.read_text()), web, F, capsys.readouterr().out
    return run


def calendars(web):
    """Los grupos cuyo calendario se pidió, en orden (con sus repeticiones)."""
    return [CODE[int(u.rsplit("=", 1)[1])] for _, u in web.starts
            if "NFG_CmpJornada" in u and "CodGrupo=" in u and "CodJornada" not in u]


# La pasada 1103: PG2 y FF5 (cinco páginas cada uno: clasificación, calendario y tres jornadas) y, de AL4,
# la clasificación, el calendario y las jornadas 2 y 3. La jornada 4 de AL4, vacía.
SERVED_1103 = 14


def test_the_1103_brake_passes_after_a_long_pause_and_the_pass_goes_on(bot, capsys):
    """Con el freno de la pasada 1103 (vacía la jornada 4 de AL4 y, tras 60 s, otra vez) que se pasa a los
    4 min: una pausa de 5 min, la misma página otra vez, y AL4 se lee entero; la pasada sigue (AL9, AL18,
    AL20 y los demás), más despacio. Nada queda como error."""
    data, web, F, log = bot(capsys, serve=SERVED_1103, lasts=4 * 60)
    assert calendars(web) == ORDER
    assert [u for _, u in web.starts].count(url(ID["AL4"]) + "&CodJornada=4") == 3     # vacía, vacía, servida
    groups = data["groups"]
    for code in ALL:
        assert groups[code]["status"] == "ok" and groups[code]["checkedAt"] > report()["groups"][code]["checkedAt"], code
    assert data["summary"] == {"ok": len(ALL), "rejected": 0, "error": 0}
    run = data["run"]
    assert run["pauses"] == 1 and run["resumed"] == 1 and "blocked" not in run
    assert run["unserved"] == [] and run["deferred"] == [] and run["extrasDeferred"] == []
    assert "      página vacía (la federación frena) (1/3), se reintenta en 60 s\n" in log
    assert "      la federación frena: pausa de 5 min (1/3), hasta las 03:35 UTC\n" in log
    assert "      la federación vuelve a servir: se sigue, una página cada 10.5 s\n" in log
    assert "error" not in log and "sin federación" not in log
    # Más despacio el resto de la pasada: 10,5 s entre el inicio de dos peticiones.
    resumed = next(i for i, (t, u) in enumerate(web.starts) if u.endswith("&CodJornada=4") and t > web.brake_from + 240)
    starts = [t for t, _ in web.starts[resumed:]]
    assert len(starts) > 20 and min(b - a for a, b in zip(starts, starts[1:])) >= 10.5
    # La pausa no cuenta como coste de las páginas ni del calendario más largo (el de AL4).
    assert "de ellos en pausa por el freno" in log


@pytest.mark.parametrize("pauses", [3, 1])
def test_the_1103_brake_that_does_not_pass_keeps_the_last_checks_and_stops_the_pass(bot, capsys, monkeypatch, pauses):
    """Si el freno no se pasa: las pausas (FIFLP_BRAKE_PAUSES), cada una con la misma página, y después
    nada más en esta pasada. AL4, que la federación no sirvió, conserva su comprobación anterior (no
    «error»: la web no pone «Revisión pendiente.» en sus equipos), sin escribir nada de las jornadas 2 y
    3 que ya había leído y sin mover su hora; AL9 y los demás, a otra pasada como siempre."""
    monkeypatch.setenv("FIFLP_BRAKE_PAUSES", str(pauses))
    conn = season()
    before = {code: matches(conn, code) for code in ALL}
    previous = report()
    data, web, F, log = bot(capsys, conn=conn, previous=previous, serve=SERVED_1103)
    assert calendars(web) == ["PG2", "FF5", "AL4"]
    assert len(web.starts) == SERVED_1103 + 2 + pauses                    # vacía, tras 60 s y tras cada pausa
    groups = data["groups"]
    assert [groups[c]["status"] for c in ("PG2", "FF5")] == ["ok", "ok"]
    for code in ("AL4", "AL9", "AL18", "AL20", "AL1", "PG1", "FF1", "FF2"):
        assert groups[code] == previous["groups"][code], code
    assert data["summary"] == {"ok": len(ALL), "rejected": 0, "error": 0}
    assert matches(conn, "AL4") == before["AL4"]                          # nada a medias
    assert matches(conn, "PG2") == before["PG2"] + 1 and matches(conn, "FF5") == before["FF5"] + 1
    run = data["run"]
    assert run["unserved"] == ["AL4"] and run["blocked"] and run["pauses"] == pauses and run["resumed"] == 0
    assert run["deferred"] == ["AL9", "AL18", "AL20", "AL1", "PG1", "FF1", "FF2"]
    assert run["extrasDeferred"] == ["PG2", "FF5"] and run["refreshed"] == 2
    assert f"      la federación frena: pausa de 5 min ({pauses}/{pauses}), hasta las " in log
    assert f"      la federación sigue frenando tras {pauses} pausa" in log
    assert "    sin federación: a otra pasada (no carga la jornada 4)\n" in log
    assert "  Sin federación: 1 grupo conserva su última comprobación, a otra pasada (AL4)\n" in log
    assert "(sin federación: las actas y los goleadores de 2 grupos, en otra pasada: PG2, FF5)" in log
    assert "! error" not in log


def test_a_brake_in_the_priority_scorers_pauses_and_the_others_are_read(bot, capsys):
    """El freno puede caer en las actas y los goleadores de los prioritarios (tras sus 30 páginas de
    calendario): la misma pausa, y la pasada sigue con los demás grupos. La pausa no es tiempo de actas:
    no alarga el plazo de los calendarios de los demás (lo pierden ellos, como en cualquier pausa)."""
    data, web, F, log = bot(capsys, serve=31, lasts=4 * 60)
    scorers = [CODE[int(u.rsplit("=", 1)[1])] for _, u in web.starts if "NFG_CMP_Goleadores" in u]
    assert scorers[:7] == ["PG2", "FF5", "FF5", "FF5", "AL4", "AL9", "AL18"]   # FF5: vacía, tras 60 s y tras la pausa
    assert calendars(web) == ORDER
    assert data["run"]["pauses"] == 1 and data["run"]["resumed"] == 1 and data["summary"]["error"] == 0
    assert data["run"]["unserved"] == [] and data["run"]["deferred"] == []
    assert log.index("Actas y goleadores de los prioritarios") < log.index("pausa de 5 min (1/3)") < log.index("[AL1]")


class Unpaused:
    """La federación del bot como era hasta el 15/10/2026 (sin pausas largas: bloqueada con tres páginas
    seguidas sin cargar), con su cuenta de las señales del freno (`brakes`): tras `serve` páginas, todas
    vacías (cada una, con su espera de 60 s)."""
    BASE = BASE

    def __init__(self, reader, deadline=None, clock=None, sleep=None, serve=SERVED_1103, **kw):
        self.deadline, self.clock, self.serve = deadline, clock, serve
        self.urls, self.failures, self.served, self.brakes = [], 0, 0, 0

    @property
    def blocked(self):
        return self.failures >= C.BLOCKED_AFTER

    def goto(self, page, url):
        self.urls.append(url)
        page.url = url
        ok = len(self.urls) <= self.serve
        self.clock.t += 7 if ok else 7 + 60 + 2
        self.failures = 0 if ok else self.failures + 1
        self.served += ok
        self.brakes += not ok
        return ok

    def delay(self, *a):
        pass

    parse_standings, parse_matches = staticmethod(Reader.parse_standings), staticmethod(Reader.parse_matches)


def test_a_group_the_federation_does_not_serve_is_not_an_error(bot, capsys):
    """La parte A sola, con el registro de la pasada 1103 tal cual (la federación de entonces, sin pausas):
    AL4 (vacía su jornada 4) y AL9 (vacías su clasificación y su calendario) no quedan como error: una
    página vacía en su lectura es el freno, no el grupo. Conservan su comprobación anterior."""
    previous = report()
    data, web, F, log = bot(capsys, previous=previous, fed=Unpaused)
    assert [CODE[int(u.rsplit("=", 1)[1])] for u in F.urls if "CodGrupo=" in u and "CodJornada" not in u] == [
        "PG2", "FF5", "AL4", "AL9"]
    assert data["groups"]["AL4"] == previous["groups"]["AL4"] and data["groups"]["AL9"] == previous["groups"]["AL9"]
    assert data["summary"]["error"] == 0
    assert data["run"]["unserved"] == ["AL4", "AL9"] and data["run"]["blocked"]
    assert data["run"]["deferred"] == ["AL18", "AL20", "AL1", "PG1", "FF1", "FF2"]
    assert log.count("    sin federación: a otra pasada (") == 2
    assert "    sin federación: a otra pasada (no carga el calendario de la federación)\n" in log


def test_a_dead_url_without_a_brake_is_still_an_error(bot, capsys):
    """Una URL muerta (FF1 responde 500 a todo, tras sus reintentos) mientras el resto carga bien no es el
    freno: FF1 sigue como error, y no hay pausas largas (dos páginas seguidas sin cargar no bloquean)."""
    data, web, F, log = bot(capsys, dead={"FF1"})
    groups = data["groups"]
    assert groups["FF1"]["status"] == "error" and groups["FF1"]["message"] == "no carga el calendario de la federación"
    assert all(groups[c]["status"] == "ok" for c in ALL if c != "FF1")
    assert data["summary"] == {"ok": len(ALL) - 1, "rejected": 0, "error": 1}
    assert data["run"]["unserved"] == [] and "pauses" not in data["run"] and "blocked" not in data["run"]
    assert "    ! error: no carga el calendario de la federación\n" in log and "pausa de" not in log


def test_a_failure_just_before_the_federation_stops_serving_was_the_brake(bot, capsys, monkeypatch):
    """Un calendario que no carga sin página vacía (un 503 tras otro, el Apache de la federación cuando
    bloquea) no es, en ese momento, señal de freno: AL4 falla con una página sin cargar, que no bloquea.
    Pero si la federación no sirve ninguna página más hasta quedar bloqueada (en AL9), también era el
    freno: AL4 conserva su comprobación, como AL9."""
    monkeypatch.setenv("FIFLP_BRAKE_PAUSES", "0")

    class Down(Federation):          # tras las 14 primeras, todo 503
        def page(self):
            web, page = self, Page(self)
            plain = page.goto

            def goto(url, wait_until=None, timeout=None):
                response = plain(url, wait_until, timeout)
                return Response(503) if len(web.starts) > SERVED_1103 else response
            page.goto = goto
            return page
    previous = report()
    data, web, F, log = bot(capsys, previous=previous, web=Down)
    assert "    ! error: no carga la jornada 4\n" in log                    # en ese momento, sin señal de freno
    assert data["groups"]["AL4"] == previous["groups"]["AL4"] and data["groups"]["AL9"] == previous["groups"]["AL9"]
    assert data["summary"]["error"] == 0 and data["run"]["unserved"] == ["AL4", "AL9"] and data["run"]["blocked"]
    assert "  Sin federación: 2 grupos conservan su última comprobación, a otra pasada (AL4, AL9)\n" in log


def test_the_long_pause_is_not_taken_if_it_does_not_fit_before_the_deadline(bot, capsys):
    """Con 400 s de plazo, tras la página vacía de AL4 y su espera no caben 5 min de pausa y 2 de margen:
    ni pausa ni nada más, y AL4 conserva su comprobación."""
    previous = report()
    data, web, F, log = bot(capsys, budget=400, previous=previous, serve=SERVED_1103)
    assert "pauses" not in data["run"] and data["run"]["blocked"] and data["run"]["unserved"] == ["AL4"]
    assert data["groups"]["AL4"] == previous["groups"]["AL4"] and data["summary"]["error"] == 0
    assert "      la federación frena y no queda plazo para una pausa de 5 min: nada más en esta pasada\n" in log
    assert F.paused == 0 and len(web.starts) == SERVED_1103 + 2


def test_after_a_late_resume_no_page_starts_past_the_deadline(bot, capsys):
    """Con 600 s de plazo, la pausa cabe justo (AL4 se lee tras ella) y lo que sigue se corta en el plazo:
    los calendarios de los demás, a otra pasada, y las actas de los prioritarios, hasta el plazo. Ninguna
    página empieza después (lo comprueba bot: Federacion ni las pide)."""
    conn = season()
    for k in range(20):          # 20 actas por leer en PG2
        conn.execute("""INSERT INTO matches(group_id, jornada, date, home_team_id, away_team_id, home_score,
                        away_score, fiflp_acta) SELECT group_id, ?, '2026-10-10', away_team_id, home_team_id, 2, 2, ?
                        FROM matches WHERE group_id=? AND jornada='Jornada 1'""", (f"Jornada {20 + k}", 9000 + k, ID["PG2"]))
    conn.commit()
    data, web, F, log = bot(capsys, conn=conn, budget=600, serve=SERVED_1103, lasts=5 * 60)
    assert data["run"]["pauses"] == 1 and data["run"]["resumed"] == 1 and data["groups"]["AL4"]["status"] == "ok"
    assert data["run"]["deferred"][:3] == ["AL9", "AL18", "AL20"]
    actas = [t for t, u in web.starts if "CodActa=" in u]
    assert actas and len(actas) < 20 and max(t for t, _ in web.starts) <= F.deadline
    assert "PG2" in data["run"]["extrasDeferred"]


def test_a_group_cut_by_the_deadline_waits_for_another_pass(bot, capsys):
    """Ninguna página empieza pasado el plazo global, tampoco a mitad de un grupo (antes, el último grupo
    se pasaba de él; tras una pausa larga podría pasarse más): Federacion no la pide, y el grupo, que no
    acabó, conserva su última comprobación sin escribir nada (plazo agotado, como lo que no cabe). Aquí,
    páginas de 30 s y 110 s de plazo: la jornada 4 de PG2 empezaría a los 124. (El informe anterior, de
    hace más de 24 h: si no, sin cambios, no se reescribiría y no se vería `run`.)"""
    conn = season()
    before = matches(conn, "PG2")
    previous = report(at=NOW - timedelta(hours=30))
    data, web, F, log = bot(capsys, conn=conn, budget=110, previous=previous, cost=30.0)
    assert [u for _, u in web.starts][-1].endswith("&CodJornada=3")
    assert data["groups"]["PG2"] == previous["groups"]["PG2"] and matches(conn, "PG2") == before
    assert data["run"]["deferred"] == ORDER and data["run"]["unserved"] == [] and data["summary"]["error"] == 0
    assert "    plazo agotado: a otra pasada (no carga la jornada 4)\n" in log


def with_actas(conn, counts):
    """Actas por leer (partidos jugados con su código de acta) en los grupos de `counts`."""
    for code, n in counts.items():
        for k in range(n):
            conn.execute("""INSERT INTO matches(group_id, jornada, date, home_team_id, away_team_id, home_score,
                            away_score, fiflp_acta) SELECT group_id, ?, '2026-10-10', away_team_id, home_team_id, 2, 2, ?
                            FROM matches WHERE group_id=? AND jornada='Jornada 1'""",
                         (f"Jornada {20 + k}", 9000 + 100 * ID[code] + k, ID[code]))
    conn.commit()
    return conn


def test_a_long_brake_in_the_priority_calendars_does_not_put_their_actas_first(bot, capsys):
    """Un freno de 12 min en la jornada 4 de AL4 se pasa en la 3.ª pausa, a los ~18 min, con la primera
    pasada de 19: las pausas no les quitan su plazo a los calendarios de los prioritarios (lo pagan la
    reserva y los demás grupos). AL20 (de Las Mesas) se lee, y antes que las actas de PG2 y FF5 (antes, a
    otra pasada, y su tiempo para esas actas: el orden de main al revés)."""
    conn = with_actas(season(), {"PG2": 8, "FF5": 8})
    data, web, F, log = bot(capsys, conn=conn, serve=SERVED_1103, lasts=12 * 60)
    run = data["run"]
    assert run["pauses"] == 3 and run["resumed"] == 1
    assert calendars(web)[:6] == ORDER[:6] and "AL20" not in run["deferred"]
    assert all(data["groups"][c]["status"] == "ok" for c in ORDER[:6])
    first_acta = next(i for i, (_, u) in enumerate(web.starts) if "CodActa=" in u)
    al20 = max(i for i, (_, u) in enumerate(web.starts) if u.startswith(url(ID["AL20"])))
    assert al20 < first_acta
    assert log.index("[AL20]") < log.index("Actas y goleadores de los prioritarios") < log.index("[PG2] ")


class Refusing(Federation):
    """La federación que frena con un 503 (el Apache de la federación cuando bloquea) en vez de con páginas
    vacías: tras `serve` peticiones, durante `lasts` s (None: toda la pasada)."""

    def page(self):
        page = Page(self)
        plain = page.goto

        def goto(url, wait_until=None, timeout=None):
            response = plain(url, wait_until, timeout)
            if page.empty:
                page.empty = False
                return Response(503)
            return response
        page.goto = goto
        return page


@pytest.mark.parametrize("lasts", [4 * 60, None])
def test_a_brake_of_error_pages_is_a_brake_whether_or_not_it_passes(bot, capsys, lasts):
    """El freno con 503 desde la jornada 4 de AL4: AL4 falla con una página sin cargar, que en ese momento
    no es señal de freno; AL9 deja la tercera seguida y la última página ya leída tampoco carga: el freno.
    AL4 no queda como error ni si la pausa lo arregla ni si no (antes: error si lo arreglaba, y sin error si
    no). Si lo arregla, AL9 se lee entero, también su clasificación, que se perdió en el freno."""
    previous = report()
    data, web, F, log = bot(capsys, previous=previous, web=Refusing, serve=SERVED_1103, lasts=lasts)
    assert data["groups"]["AL4"] == previous["groups"]["AL4"] and data["summary"]["error"] == 0
    assert "    ! error: no carga la jornada 4\n" in log                     # en ese momento, sin señal de freno
    if lasts:
        assert data["run"]["unserved"] == ["AL4"] and data["run"]["pauses"] == 1 and data["run"]["resumed"] == 1
        assert all(data["groups"][c]["status"] == "ok" for c in ALL if c != "AL4")
        standings = [t for t, u in web.starts if "NFG_VisClasificacion" in u and f"codgrupo={ID['AL9']}&" in u]
        assert len(standings) == 3 + 1 and standings[-1] > web.brake_from + lasts  # sus 3 intentos y, tras la pausa, otra
        assert list(dict.fromkeys(calendars(web))) == ORDER                  # todos, AL9 con sus reintentos
    else:
        assert data["run"]["unserved"] == ["AL4", "AL9"] and data["run"]["blocked"]
    assert "  Sin federación: " in log


def test_two_dead_urls_in_a_row_are_still_errors_and_not_a_brake(bot, capsys):
    """Dos grupos seguidos con la URL muerta (500 a todo) hacen tres páginas seguidas sin cargar, y no son el
    freno: la última página leída carga. Ni pausas ni bloqueo, los dos como error, y la pasada sigue (antes:
    tres pausas de 5 min, la pasada perdida y los dos con su «ok» de antes)."""
    data, web, F, log = bot(capsys, dead={"AL1", "PG1"})
    groups = data["groups"]
    assert groups["AL1"]["status"] == groups["PG1"]["status"] == "error"
    assert all(groups[c]["status"] == "ok" for c in ALL if c not in ("AL1", "PG1"))
    assert data["summary"]["error"] == 2 and data["run"]["unserved"] == [] and data["run"]["deferred"] == []
    assert "pauses" not in data["run"] and "blocked" not in data["run"] and "pausa de" not in log
    assert "      3 páginas seguidas sin cargar, pero otra ya leída carga: no es el freno, es esta página\n" in log


class Patchy(Federation):
    """La jornada 2 de AL4, vacía dos veces (el freno, que la pausa larga arregla); su jornada 4, un 503 en
    sus tres intentos."""

    def page(self):
        web, page = self, Page(self)
        plain = page.goto

        def goto(u, wait_until=None, timeout=None):
            response = plain(u, wait_until, timeout)
            asked = sum(x == u for _, x in web.starts)
            if u == url(ID["AL4"]) + "&CodJornada=2" and asked <= 2:
                page.empty = True
            if u == url(ID["AL4"]) + "&CodJornada=4" and asked <= 3:
                return Response(503)
            return response
        page.goto = goto
        return page


def test_a_group_with_an_empty_page_in_its_read_is_braked_even_if_another_page_fails(bot, capsys):
    """Una página vacía en la lectura de un grupo es el freno aunque la que acaba fallando sea otra (aquí, un
    503 en la jornada 4 de AL4, tras la pausa que arregló la 2): AL4 conserva su comprobación."""
    previous = report()
    data, web, F, log = bot(capsys, previous=previous, web=Patchy)
    assert data["run"]["pauses"] == 1 and data["run"]["resumed"] == 1
    assert data["groups"]["AL4"] == previous["groups"]["AL4"] and data["run"]["unserved"] == ["AL4"]
    assert data["summary"]["error"] == 0
    assert "    sin federación: a otra pasada (no carga la jornada 4)\n" in log


@pytest.mark.parametrize("budget", range(20, 80, 3))
def test_no_page_starts_past_the_deadline_whatever_the_budget(bot, capsys, budget):
    """Ninguna página empieza pasado el plazo (lo comprueba bot), caiga donde caiga: también dentro de la
    espera del intervalo entre dos peticiones. El grupo que el plazo corta queda para otra pasada, sin error."""
    data, web, F, log = bot(capsys, budget=budget)
    assert data["summary"]["error"] == 0 and "! error" not in log


def test_a_braked_pass_does_not_rewrite_the_report(bot, capsys):
    """Si la federación frena desde la primera página y no se le pasa, todo conserva su comprobación: ni
    las notas de la pasada (run.pauses, run.unserved, VOLATILE) reescriben data-health.json (sin commit
    solo por eso)."""
    previous = report(at=NOW - timedelta(hours=1))
    data, web, F, log = bot(capsys, previous=previous, serve=0)
    assert data == previous and F.pauses == 3 and F.halted
