"""Un freno no es un error, y una pausa larga en vez de rendirse (update_fiflp + fiflp_carga, 15/10/2026).

La federación frena de forma errática: sirve páginas vacías («<html><head></head><body></body></html>»
con un 200) tras 10-41 páginas unas pasadas y ninguna en 130-169 otras, a 7 s por página. La pasada 1103
(run 38676418915, 03:28 UTC) frenó a las ~14 páginas, en la jornada 4 de AL4: AL4 y AL9 (de Las Mesas)
quedaron como «error» en data-health.json (la web ponía «Revisión pendiente.» en sus equipos) aunque solo
la federación no las sirvió, y la pasada se rindió a los 4,8 min con 20 de plazo sin usar: AL18 y AL20 ni
se intentaron. Ahora:
  - A: un grupo cuyo calendario la federación no sirve por su freno conserva su última comprobación y
    queda para otra pasada (run.unserved), sin escribir nada de lo que ya había leído (señal del freno:
    una página vacía, un 503 o un 429); uno que no carga sin señal de freno (una URL muerta mientras el
    resto carga, o dos seguidas: la federación sirve otra página) sigue siendo un error, y también si se
    cierra el navegador;
  - B: al frenar, la espera del freno y LA MISMA página otra vez, mientras quepa en el plazo. Desde lo
    medido el 15/10/2026 (freno-fiflp.yml: ~15 páginas por IP y ~2-6 min de bloqueo, casi siempre ~5; el
    ritmo no importa): sin reintentar la vacía, 4 min sin pedir nada y después un sondeo de la misma
    página cada minuto, con un tope de 20 min por freno; al volver, al mismo ritmo (antes, pausas fijas
    de 5 min, 3 por pasada, y más despacio al volver). Desde el 16/10/2026 (pasadas 1107-1110: el bloqueo
    escala dentro de una pasada, ~300 s, ~900 s y más que el plazo), una sola espera por pasada
    (fiflp_carga.BRAKE_PAUSES): el segundo freno acaba la pasada, que dura 16 min como mucho
    (update_fiflp.DEADLINE_SECONDS) y se repite cada 2 h con otra IP; y cada grupo se lee completo
    (calendario, goleadores y actas) antes del siguiente (update_fiflp.run_passes). Ninguna página empieza
    pasado el plazo.
Sin red: la federación del bot de verdad (fiflp_carga.Federacion) con un reloj y un sueño falsos, sobre
una página falsa que sirve vacío mientras dura el freno (o, Quota, con el cupo medido).
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
BUDGET = U.DEADLINE_SECONDS            # el plazo del bot: 16 min desde el 16/10/2026 (33 desde el 15, eran 25)
BASE = "https://www.fiflp.com/pnfg/NPcd"

# Los seis grupos de Las Mesas Huracán de la pasada 1103 y unos pocos más.
GROUPS = [("PG2", "PREBENJAMIN", ["Las Mesas Hu.", "Moya"]), ("FF5", "BENJAMIN", ["Las Mesas Hu.", "Tamaraceite"]),
          ("AL4", "ALEVIN", ["Las Mesas Hu. A", "Arucas"]), ("AL9", "ALEVIN", ["Las Mesas Hu. B", "Teror"]),
          ("AL18", "ALEVIN", ["Las Mesas Hu. C", "Firgas"]), ("AL20", "ALEVIN", ["Las Mesas Huracán D", "Tablero"]),
          ("AL1", "ALEVIN", ["Guiniguada", "Lomo Blanco"]), ("PG1", "PREBENJAMIN", ["Unión Viera", "Pedro Hidalgo"]),
          ("FF1", "BENJAMIN", ["Valsequillo", "Haría"]), ("FF2", "BENJAMIN", ["Tías", "Carnevali"])]
ALL = [code for code, _, _ in GROUPS]
# El de la pasada 1103: los seis de Las Mesas (todos tocan: comprobados hace 6 h) y el turno. Desde el
# 16/10/2026, con la fase de cada nivel en el turno intercalado (update_fiflp.pass_phase), FF1 antes que PG1.
ORDER = ["PG2", "FF5", "AL4", "AL9", "AL18", "AL20", "AL1", "FF1", "PG1", "FF2"]
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
                 "FIFLP_BRAKE_PAUSES", "FIFLP_BRAKE_PROBE_S", "FIFLP_BRAKE_MAX_MIN", "FIFLP_MIN_INTERVAL"):
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
# la clasificación, el calendario y las jornadas 2 y 3. La jornada 4 de AL4, vacía. Desde el 16/10/2026 cada
# grupo se lee completo, con sus goleadores justo tras su calendario (aquí sin goleadores en la base: tocan),
# así que el freno de la jornada 4 de AL4 llega dos páginas después: 16.
SERVED_1103 = 16


def test_the_1103_brake_passes_after_the_brake_wait_and_the_pass_goes_on(bot, capsys):
    """Con el freno de la pasada 1103 (vacía la jornada 4 de AL4) que se pasa a los 4 min: sin reintentarla,
    la espera de 4 min y la misma página otra vez (el primer sondeo), y AL4 se lee entero; la pasada sigue
    (AL9, AL18, AL20 y los demás), al mismo ritmo. Nada queda como error."""
    data, web, F, log = bot(capsys, serve=SERVED_1103, lasts=4 * 60)
    assert calendars(web) == ORDER
    assert [u for _, u in web.starts].count(url(ID["AL4"]) + "&CodJornada=4") == 2     # vacía y, a los 4 min, servida
    groups = data["groups"]
    for code in ALL:
        assert groups[code]["status"] == "ok" and groups[code]["checkedAt"] > report()["groups"][code]["checkedAt"], code
    assert data["summary"] == {"ok": len(ALL), "rejected": 0, "error": 0}
    run = data["run"]
    assert run["pauses"] == 1 and run["resumed"] == 1 and run["brakeAfter"] == [SERVED_1103] and "blocked" not in run
    assert run["unserved"] == [] and run["deferred"] == [] and run["extrasDeferred"] == []
    assert "se reintenta en 60 s" not in log
    assert (f"      la federación frena tras {SERVED_1103} páginas: espera de 4 min y después la misma página cada "
            "60 s, hasta las 03:49 UTC como mucho\n") in log
    assert "      la federación vuelve a servir a los 240 s: se sigue\n" in log
    assert "error" not in log and "sin federación" not in log
    # Al mismo ritmo el resto de la pasada (antes, ×1,5): 7 s entre el inicio de dos peticiones.
    resumed = next(i for i, (t, u) in enumerate(web.starts) if u.endswith("&CodJornada=4") and t > web.brake_from + 240)
    starts = [t for t, _ in web.starts[resumed:]]
    assert len(starts) > 20 and min(b - a for a, b in zip(starts, starts[1:])) >= 7.0
    assert any(b - a == 7.0 for a, b in zip(starts, starts[1:])) and F.interval == 7.0
    # La espera no cuenta como coste de las páginas ni del calendario más largo (el de AL4).
    assert "de ellos en pausa por el freno" in log


@pytest.mark.parametrize("cap, probes", [(None, 9), ("5", 2)])
def test_the_1103_brake_that_does_not_pass_keeps_the_last_checks_and_stops_the_pass(bot, capsys, monkeypatch, cap,
                                                                                        probes):
    """Si el freno no se pasa: la espera, los sondeos de la misma página cada minuto desde los 4 min mientras
    quepan en el plazo con 2 min de margen (con los 16 min de plazo desde el 16/10/2026, 9: el tope de 20 min
    por freno, FIFLP_BRAKE_MAX_MIN, ya no llega; con un tope de 5, 2), y después nada más en esta pasada.
    AL4, que la federación no sirvió, conserva su comprobación anterior (no «error»: la web no pone
    «Revisión pendiente.» en sus equipos), sin escribir nada de las jornadas 2 y 3 que ya había leído y sin
    mover su hora; AL9 y los demás, a otra pasada como siempre. PG2 y FF5, completos: sus goleadores, justo
    tras su calendario (hasta el 16/10/2026 iban tras todos los calendarios de los prioritarios y aquí se
    quedaban para otra pasada)."""
    if cap:
        monkeypatch.setenv("FIFLP_BRAKE_MAX_MIN", cap)
    conn = season()
    before = {code: matches(conn, code) for code in ALL}
    previous = report()
    data, web, F, log = bot(capsys, conn=conn, previous=previous, serve=SERVED_1103)
    assert calendars(web) == ["PG2", "FF5", "AL4"]
    assert len(web.starts) == SERVED_1103 + 1 + probes                    # la vacía y cada sondeo
    groups = data["groups"]
    assert [groups[c]["status"] for c in ("PG2", "FF5")] == ["ok", "ok"]
    for code in ("AL4", "AL9", "AL18", "AL20", "AL1", "PG1", "FF1", "FF2"):
        assert groups[code] == previous["groups"][code], code
    assert data["summary"] == {"ok": len(ALL), "rejected": 0, "error": 0}
    assert matches(conn, "AL4") == before["AL4"]                          # nada a medias
    assert matches(conn, "PG2") == before["PG2"] + 1 and matches(conn, "FF5") == before["FF5"] + 1
    run = data["run"]
    assert run["unserved"] == ["AL4"] and run["blocked"] and run["pauses"] == 1 and run["resumed"] == 0
    assert run["deferred"] == ["AL9", "AL18", "AL20", "AL1", "FF1", "PG1", "FF2"]
    assert run["extrasDeferred"] == [] and run["refreshed"] == 2
    scorers = [CODE[int(u.rsplit("=", 1)[1])] for _, u in web.starts if "NFG_CMP_Goleadores" in u]
    assert scorers == ["PG2", "FF5"]                                        # cada uno, tras su calendario
    assert f"      la federación frena tras {SERVED_1103} páginas: espera de 4 min" in log
    if cap:
        assert (f"      la federación sigue frenando a los {240 + 60 * (probes - 1)} s (tope de {cap} min por "
                "freno): nada más en esta pasada\n") in log
    else:
        assert (f"      la federación sigue frenando a los {240 + 60 * (probes - 1)} s y no queda plazo para otro "
                "sondeo: nada más en esta pasada\n") in log
    assert "    sin federación: a otra pasada (no carga la jornada 4)\n" in log
    assert "  Sin federación: 1 grupo conserva su última comprobación, a otra pasada (AL4)\n" in log
    assert "(sin federación: las actas y los goleadores" not in log
    assert "! error" not in log


def test_a_brake_in_the_priority_scorers_pauses_and_the_others_are_read(bot, capsys):
    """El freno puede caer en los goleadores (o las actas) de un prioritario, que desde el 16/10/2026 van
    justo tras su calendario (cada grupo, completo): aquí en los de FF5, la página 12 (PG2: cinco y sus
    goleadores; FF5: cinco). La misma espera, la misma página otra vez y la pasada sigue con los demás
    grupos, cada uno con sus goleadores tras su calendario."""
    data, web, F, log = bot(capsys, serve=11, lasts=4 * 60)
    scorers = [CODE[int(u.rsplit("=", 1)[1])] for _, u in web.starts if "NFG_CMP_Goleadores" in u]
    assert scorers[:6] == ["PG2", "FF5", "FF5", "AL4", "AL9", "AL18"]   # FF5: vacía y, a los 4 min, servida
    assert calendars(web) == ORDER
    assert data["run"]["pauses"] == 1 and data["run"]["resumed"] == 1 and data["summary"]["error"] == 0
    assert data["run"]["unserved"] == [] and data["run"]["deferred"] == [] and data["run"]["extrasDeferred"] == []
    assert log.index("[FF5]") < log.index("la federación frena tras") < log.index("[AL4]")
    # Cada grupo, completo antes del siguiente: sus goleadores, entre su calendario y el del siguiente.
    order = [("cal", CODE[int(u.rsplit("=", 1)[1])]) if "NFG_CmpJornada" in u and "CodGrupo=" in u
             and "CodJornada" not in u else ("gol", CODE[int(u.rsplit("=", 1)[1])]) for _, u in web.starts
             if "NFG_CMP_Goleadores" in u or ("NFG_CmpJornada" in u and "CodGrupo=" in u and "CodJornada" not in u)]
    assert [x for x in dict.fromkeys(order)] == [(k, c) for c in ORDER for k in ("cal", "gol")]


class Unpaused:
    """La federación del bot como era hasta la mañana del 15/10/2026 (sin esperar el freno: bloqueada con
    tres páginas seguidas sin cargar), con su cuenta de las señales del freno (`brakes`): tras `serve`
    páginas, todas vacías (cada una, con la espera de 60 s y el reintento de entonces)."""
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
    assert data["run"]["deferred"] == ["AL18", "AL20", "AL1", "FF1", "PG1", "FF2"]
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
    """Un calendario que no carga por un corte de conexión (o un 500) no es, en ese momento, señal de freno
    (puede ser la URL): AL4 falla con una página sin cargar, que no bloquea. Pero si la federación no sirve
    ninguna página más hasta quedar bloqueada (en AL9: la racha, y la última página que cargó tampoco
    carga), también era el freno: AL4 conserva su comprobación, como AL9."""
    monkeypatch.setenv("FIFLP_BRAKE_PAUSES", "0")

    class Down(Federation):          # tras las 14 primeras, conexiones cortadas
        def page(self):
            web, page = self, Page(self)
            plain = page.goto

            def goto(url, wait_until=None, timeout=None):
                response = plain(url, wait_until, timeout)
                if len(web.starts) > SERVED_1103:
                    raise TimeoutError("Timeout 30000ms exceeded")
                return response
            page.goto = goto
            return page
    previous = report()
    data, web, F, log = bot(capsys, previous=previous, web=Down)
    assert "    ! error: no carga la jornada 4\n" in log                    # en ese momento, sin señal de freno
    assert data["groups"]["AL4"] == previous["groups"]["AL4"] and data["groups"]["AL9"] == previous["groups"]["AL9"]
    assert data["summary"]["error"] == 0 and data["run"]["unserved"] == ["AL4", "AL9"] and data["run"]["blocked"]
    assert "  Sin federación: 2 grupos conservan su última comprobación, a otra pasada (AL4, AL9)\n" in log


def test_the_brake_wait_is_not_taken_if_it_does_not_fit_before_the_deadline(bot, capsys):
    """Con 400 s de plazo, tras la página vacía de AL4 no caben los 4 min de espera y 2 de margen: ni espera
    ni nada más, y AL4 conserva su comprobación. Sin reintentar la vacía."""
    previous = report()
    data, web, F, log = bot(capsys, budget=400, previous=previous, serve=SERVED_1103)
    assert "pauses" not in data["run"] and data["run"]["blocked"] and data["run"]["unserved"] == ["AL4"]
    assert data["groups"]["AL4"] == previous["groups"]["AL4"] and data["summary"]["error"] == 0
    assert ("      la federación frena y no queda plazo para esperarla (4 min y 2 de margen): nada más en esta "
            "pasada\n") in log
    assert F.paused == 0 and len(web.starts) == SERVED_1103 + 1


def test_after_a_late_resume_no_page_starts_past_the_deadline(bot, capsys):
    """Con 600 s de plazo y un bloqueo de ~6 min (el más largo medido, 364 s), la espera cabe justo: tres
    sondeos (a los 240, 300 y 360 s) y la pasada sigue; lo que sigue se corta en el plazo. Desde el
    16/10/2026 cada grupo se lee completo, así que el freno cae en las 20 actas de PG2, justo tras su
    calendario y sus goleadores (antes iban tras los calendarios de los prioritarios y caía en AL4): tras la
    espera, sus actas hasta el plazo, y los calendarios de los demás, a otra pasada (en los últimos 2 min no
    empieza ninguno). Ninguna página empieza después del plazo (lo comprueba bot: Federacion ni las pide)."""
    conn = season()
    for k in range(20):          # 20 actas por leer en PG2
        conn.execute("""INSERT INTO matches(group_id, jornada, date, home_team_id, away_team_id, home_score,
                        away_score, fiflp_acta) SELECT group_id, ?, '2026-10-10', away_team_id, home_team_id, 2, 2, ?
                        FROM matches WHERE group_id=? AND jornada='Jornada 1'""", (f"Jornada {20 + k}", 9000 + k, ID["PG2"]))
    conn.commit()
    data, web, F, log = bot(capsys, conn=conn, budget=600, serve=SERVED_1103, lasts=358)
    assert data["run"]["pauses"] == 1 and data["run"]["resumed"] == 1 and data["groups"]["PG2"]["status"] == "ok"
    assert F.probes == 3 and "      la federación vuelve a servir a los 360 s: se sigue\n" in log
    assert "CodActa=" in web.starts[SERVED_1103][1]                     # el freno, en las actas de PG2
    deferred = data["run"]["deferred"]
    assert deferred and deferred == ORDER[len(ORDER) - len(deferred):]                 # la cola, a otra pasada
    assert data["summary"]["error"] == 0
    actas = {u for _, u in web.starts if "CodActa=" in u}
    assert len(actas) <= 20 and max(t for t, _ in web.starts) <= F.deadline
    assert ("PG2" in data["run"]["extrasDeferred"]) == bool(U.pending_actas(conn, ID["PG2"]))


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


def test_a_long_brake_in_a_priority_group_is_waited_and_each_group_is_read_complete(bot, capsys):
    """Un freno de 9 min (dentro del tope de 20) se pasa en el 6.º sondeo, y la pasada sigue. Desde el
    16/10/2026 cada grupo se lee completo antes del siguiente: las 8 actas de PG2 y las de FF5, justo tras su
    calendario y sus goleadores (hasta entonces iban tras los calendarios de todos los prioritarios, que
    tenían su plazo alargado por las esperas). Lo que no cabe en los 16 min, a otra pasada (la siguiente, 2 h
    después, con otra IP), sin error."""
    conn = with_actas(season(), {"PG2": 8, "FF5": 8})
    data, web, F, log = bot(capsys, conn=conn, serve=SERVED_1103, lasts=9 * 60)
    run = data["run"]
    assert run["pauses"] == 1 and run["resumed"] == 1 and F.probes == 6 and data["summary"]["error"] == 0
    read = calendars(web)
    assert read == ORDER[:len(read)] and {"PG2", "FF5"} <= set(read)
    assert all(data["groups"][c]["status"] == "ok" for c in read)
    # Las actas de cada uno, entre su calendario y el del siguiente.
    owner = []
    for _, u in web.starts:
        acta = re.search(r"CodActa=(\d+)", u)
        group = re.search(r"(?i)codgrupo=(\d+)", u)
        owner.append(CODE[(int(acta.group(1)) - 9000) // 100] if acta else CODE[int(group.group(1))] if group else None)
    for code in ("PG2", "FF5"):
        at = [i for i, o in enumerate(owner) if o == code]
        assert all(owner[i] == code for i in range(at[0], at[-1] + 1)), code
    assert U.pending_actas(conn, ID["PG2"]) == [] and U.pending_actas(conn, ID["FF5"]) == []


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
    """El freno con 503 desde la jornada 4 de AL4: un 503 es señal del freno, y AL4 no queda como error ni
    si la espera (en AL9, la tercera página seguida sin cargar) lo arregla ni si no. Si lo arregla, AL9 se
    lee entero, también su clasificación, que se perdió en el freno."""
    previous = report()
    data, web, F, log = bot(capsys, previous=previous, web=Refusing, serve=SERVED_1103, lasts=lasts)
    assert data["groups"]["AL4"] == previous["groups"]["AL4"] and data["summary"]["error"] == 0
    assert "    sin federación: a otra pasada (no carga la jornada 4)\n" in log and "! error" not in log
    if lasts:
        assert data["run"]["unserved"] == ["AL4"] and data["run"]["pauses"] == 1 and data["run"]["resumed"] == 1
        assert all(data["groups"][c]["status"] == "ok" for c in ALL if c != "AL4")
        standings = [t for t, u in web.starts if "NFG_VisClasificacion" in u and f"codgrupo={ID['AL9']}&" in u]
        assert len(standings) == 3 + 1 and standings[-1] > web.brake_from + lasts  # sus 3 intentos y, tras la espera, otra
        assert list(dict.fromkeys(calendars(web))) == ORDER                  # todos, AL9 con sus reintentos
    else:
        assert data["run"]["unserved"] == ["AL4", "AL9"] and data["run"]["blocked"]
    assert "  Sin federación: " in log


def test_two_dead_urls_in_a_row_are_still_errors_and_not_a_brake(bot, capsys):
    """Dos grupos seguidos con la URL muerta (500 a todo) hacen tres páginas seguidas sin cargar, y no son el
    freno: la última página leída carga. Ni pausas ni bloqueo, los dos como error, y la pasada sigue (antes:
    tres pausas de 5 min, la pasada perdida y los dos con su «ok» de antes). (AL1 y FF1: los dos seguidos
    del turno desde el 16/10/2026; antes, AL1 y PG1.)"""
    data, web, F, log = bot(capsys, dead={"AL1", "FF1"})
    groups = data["groups"]
    assert groups["AL1"]["status"] == groups["FF1"]["status"] == "error"
    assert all(groups[c]["status"] == "ok" for c in ALL if c not in ("AL1", "FF1"))
    assert data["summary"]["error"] == 2 and data["run"]["unserved"] == [] and data["run"]["deferred"] == []
    assert "pauses" not in data["run"] and "blocked" not in data["run"] and "pausa de" not in log
    assert "      3 páginas seguidas sin cargar, pero la federación sirve otra: no es el freno, es esta página\n" in log


def test_two_dead_urls_at_the_start_of_the_pass_are_still_errors(bot, capsys):
    """Como la anterior, pero los dos muertos son los dos primeros de la pasada (PG2 y FF5: los prioritarios
    van siempre los primeros, en el mismo orden). Aún no ha cargado ninguna página que volver a pedir: el bot
    prueba la página de competiciones de la temporada, que existe siempre. Carga: no es el freno, los dos
    como error y la pasada sigue (antes: tres pausas de 5 min, la pasada perdida y los dos con su «ok» de
    antes, en cada pasada)."""
    data, web, F, log = bot(capsys, dead={"PG2", "FF5"})
    groups = data["groups"]
    assert groups["PG2"]["status"] == groups["FF5"]["status"] == "error"
    assert all(groups[c]["status"] == "ok" for c in ALL if c not in ("PG2", "FF5"))
    assert data["run"]["unserved"] == [] and data["run"]["deferred"] == []
    assert "pauses" not in data["run"] and "blocked" not in data["run"] and F.paused == 0
    catalog = BASE + "/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22"
    assert [u for _, u in web.starts].count(catalog) == 2          # la prueba y check_competitions


@pytest.mark.parametrize("cost,lasts", [(2.0, 154), (2.0, 200), (7.0, 60), (7.0, 150), (7.0, 190)])
def test_a_short_brake_of_error_pages_is_not_an_error(bot, capsys, cost, lasts):
    """Un 503 (o un 429) es la federación que no sirve («no disponible», «demasiadas peticiones»), no la
    página: es señal del freno aunque no llegue a la racha de tres páginas. Un freno con 503 que se pasa
    antes de la racha (60-190 s a 7 s por página) o justo antes de comprobar si la federación sirve otra
    (154 s) no deja a AL4 como error ni mueve su hora (antes: «error», «no carga la jornada 4»)."""
    previous = report()
    data, web, F, log = bot(capsys, previous=previous, web=Refusing, serve=SERVED_1103, lasts=lasts, cost=cost)
    assert data["groups"]["AL4"] == previous["groups"]["AL4"] and "AL4" in data["run"]["unserved"]
    assert data["summary"]["error"] == 0 and "! error" not in log
    assert "    sin federación: a otra pasada (no carga la jornada 4)\n" in log


class Closing(Federation):
    """Chromium cae tras `serve` peticiones: la página, cerrada (TargetClosedError de Playwright)."""

    def page(self):
        web, page = self, Page(self)
        plain = page.goto
        page.is_closed = lambda: len(web.starts) >= web.serve

        def goto(url, wait_until=None, timeout=None):
            if page.is_closed():
                web.starts.append((web.clock.t, url))
                raise RuntimeError("Target page, context or browser has been closed")
            return plain(url, wait_until, timeout)
        page.goto = goto
        return page


def test_a_closed_browser_is_an_error_and_not_a_brake(bot, capsys):
    """Si Chromium cae a mitad de AL4, no es el freno de la federación: ni pausas largas ni «sin federación».
    AL4 queda como error (se ve en la web, como antes de la pausa larga) y lo demás, a otra pasada."""
    data, web, F, log = bot(capsys, web=Closing, serve=SERVED_1103)
    assert data["groups"]["AL4"]["status"] == "error" and data["summary"]["error"] == 1
    assert data["run"]["unserved"] == [] and data["run"]["blocked"] and "pauses" not in data["run"]
    assert data["run"]["deferred"] == ["AL9", "AL18", "AL20", "AL1", "FF1", "PG1", "FF2"]
    assert F.paused == 0 and "frena" not in log and len(web.starts) == SERVED_1103 + 1
    assert "      el navegador se ha cerrado: nada más en esta pasada\n" in log


def test_an_acta_the_deadline_does_not_let_start_is_not_counted_as_read(monkeypatch):
    """Federacion no pide una página que, tras la espera del intervalo, empezaría pasado el plazo. Esa acta
    no se ha leído: ni cuenta en «n/m actas» ni gasta del cupo de la pasada (antes: «2/3 actas» con dos
    pedidas)."""
    conn = with_actas(season(), {"PG2": 3})
    clock = Clock()
    monkeypatch.setattr(U, "clock", clock)
    monkeypatch.setattr(U, "flatten", lambda page, selector=None: 0)
    monkeypatch.setattr(U, "apply_acta", lambda conn, mid, code, acta, log=print: True)

    def sleep(s):
        clock.t += s
    monkeypatch.setattr(C, "pause", lambda extra=0: sleep(1.0 + extra))
    web = Federation(clock)
    # Actas a las 1000 y a las 1007 (cada una 2 s y 1 de pausa); la 3.ª empezaría a las 1014.
    F = C.Federacion(Reader, deadline=1012.0, interval=7.0, clock=clock, sleep=sleep, log=lambda *_: None)
    tried = set()
    done, read = U.import_actas(web.page(), F, conn, ID["PG2"], 60, deadline=F.deadline, tried=tried, log=lambda *_: None)
    assert [t for t, _ in web.starts] == [1000.0, 1007.0]
    assert (done, read) == (2, 2) and len(tried) == 2


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
    solo por eso). Diez sondeos, los que caben en los 16 min del plazo con 2 de margen (hasta el
    16/10/2026, con 33 min, los 17 del tope de 20 min por freno)."""
    previous = report(at=NOW - timedelta(hours=1))
    data, web, F, log = bot(capsys, previous=previous, serve=0)
    assert data == previous and F.pauses == 1 and F.probes == 10 and F.halted


# ── El cupo medido el 15/10/2026: ~15 páginas por IP y ~5 min de bloqueo ──────

class Quota(Federation):
    """La federación MEDIDA el 15/10/2026 (freno-fiflp.yml): sirve `per_ip` documentos (los primeros,
    `first`: la pasada puede empezar con el cupo a medias) y después vacías durante el siguiente de `blocks`
    (segundos desde la primera vacía; None: no vuelve en esa pasada). Los sondeos durante el bloqueo no lo
    alargan ni gastan del cupo siguiente; al pasar, otro cupo. `brake_from`, el comienzo del último
    bloqueo; `history`, el de todos."""

    def __init__(self, clock, per_ip=15, first=None, blocks=(300,), **kw):
        super().__init__(clock, **kw)
        self.per_ip, self.blocks, self.count, self.history = per_ip, list(blocks), 0, []
        self.first = per_ip if first is None else first

    def braking(self):
        if self.brake_from is not None:
            lasts = self.blocks[min(len(self.history) - 1, len(self.blocks) - 1)]
            if lasts is None or self.clock.t < self.brake_from + lasts:
                return True
            self.brake_from, self.count = None, 0
        if self.count >= (self.per_ip if self.history else self.first):
            self.brake_from = self.clock.t
            self.history.append(self.clock.t)
            return True
        self.count += 1
        return False


def busy_season():
    """La temporada de la pasada 1103 con trabajo de sobra para el plazo: 12 actas por leer en cada grupo
    (las 60 de la pasada, MAX_ACTAS_PER_RUN, y las de otra), además de los calendarios y los goleadores."""
    return with_actas(season(), {code: 12 for code in ALL})


@pytest.mark.parametrize("blocks", [(304, 364, 304, 122, 303, 300), (300, 900, 2700)], ids=["15-10", "1107-1110"])
def test_with_the_measured_quota_the_pass_waits_the_first_brake_and_ends_at_the_second(bot, capsys, blocks):
    """El caso medido: 15 páginas, ~5 min de bloqueo, otra vez 15… y, en las pasadas 1107-1110, el bloqueo
    escala dentro de la pasada (300, 900 y 2700 s). Desde el 16/10/2026, una espera por pasada
    (fiflp_carga.BRAKE_PAUSES): la del primero, ~15 páginas más y, en el segundo freno, nada más (la pasada
    siguiente, 2 h después, tiene otra IP y vuelve a empezar con 5 min). ~30 páginas en ~9 min, ninguna
    espera del de 900 s, ningún grupo como error y ninguna página pasado el plazo; cada grupo leído, completo
    (sus actas y sus goleadores, justo tras su calendario); lo que no cupo, a otra pasada. Hasta el
    16/10/2026, en 33 min, una espera tras otra (al menos 4) y la segunda pasada, sin llegar casi nunca."""
    data, web, F, log = bot(capsys, conn=busy_season(), web=Quota, blocks=blocks)
    run = data["run"]
    assert run["pauses"] == 1 and run["resumed"] == 1 and len(web.history) == 2 and run["blocked"]
    assert run["brakeAfter"] == [15, 15] and F.paused < 600
    assert "la federación frena otra vez, y ya se esperó 1 (FIFLP_BRAKE_PAUSES): nada más en esta pasada" in log
    assert data["summary"] == {"ok": len(ALL), "rejected": 0, "error": 0} and "! error" not in log
    read = list(dict.fromkeys(calendars(web)))
    assert read == ORDER[:len(read)] and len(read) >= 2
    assert len(web.starts) == 30 + 2 + F.probes - 1        # las 30, las dos vacías y los sondeos vacíos
    assert max(t for t, _ in web.starts) - 1000 < 10 * 60                    # ~9 min: 15, la espera y 15
    assert F.interval == 7.0 and "se reintenta en 60 s" not in log


@pytest.mark.parametrize("served", [0, 3, 7, 11, 14, 15, 19, 23, 27])
def test_with_the_measured_quota_no_priority_group_becomes_an_error(bot, capsys, served):
    """Caiga donde caiga el freno en la lectura de los prioritarios (tras `served` páginas: la clasificación,
    el calendario o una jornada de cualquiera de los seis de Las Mesas), ninguno queda como error: con
    bloqueos de ~5 min, la espera y sus sondeos los leen enteros; y si uno no vuelve en el tope (aquí, el
    segundo), el grupo que pilla conserva su comprobación (run.unserved) y los demás, a otra pasada."""
    previous = report()
    data, web, F, log = bot(capsys, previous=previous, web=Quota, first=served, blocks=(300, None))
    assert web.history and len(web.history) == 2                            # el primero se pasa; el segundo, no
    assert data["summary"]["error"] == 0 and "! error" not in log
    for code in ORDER[:6]:
        assert data["groups"][code]["status"] == "ok", code
        assert (data["groups"][code] == previous["groups"][code]
                or data["groups"][code]["checkedAt"] > previous["groups"][code]["checkedAt"]), code
    assert data["run"]["pauses"] >= 1 and data["run"]["resumed"] >= 1


@pytest.mark.parametrize("selected, calendar, shows, line", [
    ("2", "J2", {"same": 10}, None),
    ("3", "J2", {"different": 10}, "    calendario: seleccionada la jornada 3, pero sus partidos no son los de su "
                                   "página (son los de la jornada 2)\n"),
    ("1", "J2", {"other": 10}, "    calendario: enseña los partidos de la jornada 2 y la seleccionada es la jornada 1\n"),
    (None, "J2", {"other": 10}, "    calendario: enseña los partidos de la jornada 2, sin jornada seleccionada\n"),
    ("2", "otro", {"different": 10}, "    calendario: seleccionada la jornada 2, pero sus partidos no son los de su "
                                     "página (1 partidos)\n"),
    ("1", "otro", {"unread": 10}, None), (None, "otro", {"unselected": 10}, None), ("2", None, {"empty": 10}, None),
], ids=["igual", "distinta-otra", "otra-seleccionada-1", "otra-sin-seleccion", "distinta", "no-leida", "sin-seleccion",
        "vacio"])
def test_the_calendar_diagnostic_is_noted_in_the_run(bot, capsys, monkeypatch, selected, calendar, shows, line):
    """Lo que enseña el calendario de cada grupo (su primera carga, sin CodJornada: update_fiflp.calendar_shows
    y calendar_check) frente a las jornadas que se leen por su URL, en el registro y en run (calendarShows: sin
    commit solo por ello, como todo run), sin pedir ninguna página más. Hasta el 16/10/2026 solo se medía si
    la opción SELECCIONADA del desplegable (selectedIndex) se iba a leer, y en las pasadas reales (1107-1110)
    no salió nunca: si el JS de la federación no marca la jornada que enseña, la seleccionada es la primera
    (la vacía o «0», que se filtra, o la jornada 1, fuera de la ventana). Ahora se compara con todas las
    leídas: «same» (la seleccionada), «other» (otra leída, o ninguna seleccionada), «different» (la
    seleccionada se leyó y no coincide), «unread» (ninguna leída y la seleccionada no se leyó), «unselected»
    (ninguna leída ni seleccionada) y «empty» (el calendario sin partidos). Aquí la jornada 2 trae un partido
    y la 3 y la 4, ninguno; el calendario, el de la 2, otro o ninguno."""
    option = {"value": selected, "text": f"{selected} - 26-09-2026"} if selected else None
    plain_matches = Reader.parse_matches

    def parse_matches(page):
        if "CodJornada" in page.url or calendar is None:
            return plain_matches(page)
        home, away = dict((c, t) for c, _, t in GROUPS)[CODE[int(re.search(r"CodGrupo=(\d+)", page.url).group(1))]]
        if calendar == "otro":
            home, away = away, home
        return [{"home": home, "away": away, "hs": None, "as": None, "date": "", "time": "", "venue": ""}]
    monkeypatch.setattr(Reader, "parse_matches", staticmethod(parse_matches))

    class Selecting(Federation):
        def page(self):
            page = Page(self)
            plain = page.evaluate
            page.evaluate = lambda js, *a: option if js == U.SELECTED_JS else plain(js, *a)
            return page
    plain_data, plain_web, _, _ = bot(capsys)
    data, web, F, log = bot(capsys, web=Selecting)
    assert [u for _, u in web.starts] == [u for _, u in plain_web.starts]          # ni una página más
    assert data["run"].get("calendarShows") == shows
    same = shows.get("same", 0)
    assert f"  Calendario (diagnóstico): en {same} de 10 grupos enseña los partidos de la jornada seleccionada" in log
    if line:
        assert log.count(line) == 10, line
