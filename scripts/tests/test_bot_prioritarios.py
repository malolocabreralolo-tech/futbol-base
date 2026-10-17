"""Los prioritarios solo cuando toca, y cada grupo completo (update_fiflp, 16/10/2026).

Con el cron cada 6 h, los seis o siete grupos de Las Mesas Huracán se leían en cada pasada: ~33 de las ~45
páginas que daba la federación por pasada (pasadas 1107-1110). Con pasadas cada 2 h, un prioritario se lee:
  - en su pasada (priority_slot: una de cada tres, repartidos), o si en la pasada siguiente su última
    comprobación correcta (data-health.json) ya tendría más de PRIORITY_MAX_AGE (6 h; FIFLP_PRIORITY_MAX_H),
    o no la tiene (stale);
  - o si está CALIENTE (hot_reason): un partido de sus equipos de los dos últimos días, empezado hace más de
    una hora, sin resultado o con su acta por leer (con código, sin importar y sin intentar), durante 12 h
    (HOT_FOR: una lectura correcta posterior que sigue sin ello lo devuelve al ritmo de 6 h);
  - si no, descansa como un cerrado: conserva su comprobación. La hora de los que se leen se publica siempre
    (source_health.record(publish_time=True)): de ella sale cuándo les vuelve a tocar.
Y cada grupo leído se completa antes del siguiente: sus goleadores si tocan (scorers_due) y sus actas
pendientes; lo que el segundo freno deja a medias, lo recupera la pasada siguiente (new_actas, catch_up).
Sin red: la base en memoria y páginas falsas.
"""
from datetime import date, datetime, timedelta, timezone
import json
import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import SCHEMA  # noqa: E402
from migrate_actas_schema import migrate  # noqa: E402
import update_fiflp as U  # noqa: E402

NOW = datetime(2026, 10, 17, 12, 23, tzinfo=timezone.utc)     # sábado, 13:23 en Canarias (UTC+1 en octubre)
TODAY = NOW.date()
KEYS = U.priority_keys(["Las Mesas Hu."])


def at(hours):
    return (NOW - timedelta(hours=hours)).isoformat(timespec="seconds")


def check(hours, status="ok"):
    return {"url": "u", "status": status, "message": "3 jornadas leídas", "checkedAt": at(hours)}


# ── Cuándo toca un prioritario ─────────────────────────────────────────────────

def test_a_priority_group_is_due_in_its_slot_or_before_it_goes_past_six_hours():
    """En su pasada, siempre; fuera de ella, si en la siguiente (2 h después) ya pasaría de 6 h (con 30 min
    de margen por los retrasos de GitHub) o si no tiene comprobación correcta. Así, con una pasada cada 2 h,
    entre dos lecturas no pasan más de 6 h, y los prioritarios se reparten entre las pasadas."""
    assert U.PRIORITY_MAX_AGE == timedelta(hours=6) and U.PASS_EVERY == timedelta(hours=2)
    assert U.stale(check(0.1), NOW, slot=True)                              # su pasada
    assert not U.stale(check(2), NOW) and not U.stale(check(4), NOW)        # las dos de en medio, no
    assert not U.stale(check(4 + 25 / 60), NOW)                              # una pasada que llega 25 min tarde
    assert U.stale(check(4 + 35 / 60), NOW) and U.stale(check(6), NOW)      # su pasada se perdió o no llegó a él
    assert U.stale(None, NOW) and U.stale(check(1, "error"), NOW) and U.stale({"status": "ok"}, NOW)
    assert U.stale({"status": "ok", "checkedAt": "ayer"}, NOW)
    # FIFLP_PRIORITY_MAX_H: otra frescura (y otro reparto: una de cada max/2 pasadas).
    assert U.priority_max_age({"FIFLP_PRIORITY_MAX_H": "8"}) == timedelta(hours=8)
    assert U.priority_max_age({"FIFLP_PRIORITY_MAX_H": "4,5"}) == timedelta(hours=4.5)
    for bad in ("", "x", "0", "-3"):
        assert U.priority_max_age({"FIFLP_PRIORITY_MAX_H": bad}) == U.PRIORITY_MAX_AGE, bad
    assert not U.stale(check(6.5), NOW, max_age=timedelta(hours=8)) and U.stale(check(6.6), NOW, timedelta(hours=8))


def test_the_slots_spread_the_priority_groups_over_three_passes():
    """Siete prioritarios: tres, dos y dos por pasada, cada uno una de cada tres (6 h); con 8 h, una de cada
    cuatro."""
    for number in range(30):
        mine = [i for i in range(7) if U.priority_slot(i, number)]
        assert len(mine) in (2, 3) and all(U.priority_slot(i, number + 3) for i in mine)
        assert not any(U.priority_slot(i, number + k) for i in mine for k in (1, 2))
    assert sum(U.priority_slot(0, n, timedelta(hours=8)) for n in range(12)) == 3


# ── Caliente: un partido suyo recién jugado ────────────────────────────────────

def base(matches):
    """Un grupo (PG2) con Las Mesas Hu. y Moya, y otro equipo de otro club (Teror). `matches`: (fecha, hora,
    local, visitante, goles, código del acta, acta importada, intentos)."""
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.execute("INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2026-2027', 2026, 2027, 1)")
    conn.execute("INSERT INTO categories(id, name) VALUES (1, 'PREBENJAMIN')")
    conn.execute("INSERT INTO groups(id, season_id, category_id, code, url) VALUES (1, 1, 1, 'PG2', 'u')")
    ids = {}
    for name in ("Las Mesas Hu.", "Moya", "Teror"):
        ids[name] = conn.execute("INSERT INTO teams(name) VALUES (?)", (name,)).lastrowid
    for k, (day, hour, home, away, score, acta, imported, tries) in enumerate(matches, 1):
        hs, as_ = score if score else (None, None)
        conn.execute("""INSERT INTO matches(group_id, jornada, date, time, home_team_id, away_team_id, home_score,
                        away_score, fiflp_acta, cod_acta, acta_tries) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                     (f"Jornada {k}", day, hour, ids[home], ids[away], hs, as_, acta, acta if imported else None,
                      tries))
    conn.commit()
    return conn


@pytest.mark.parametrize("match, why", [
    (("2026-10-17", "11:00", "Las Mesas Hu.", "Moya", None, 501, False, 0), "resultado"),   # 13:23: 2 h 23 después
    (("2026-10-17", "12:30", "Moya", "Las Mesas Hu.", None, 501, False, 0), None),          # empezó hace 53 min
    (("2026-10-17", "12:20", "Moya", "Las Mesas Hu.", None, 501, False, 0), "resultado"),   # hace 1 h 3 min
    (("2026-10-17", None, "Moya", "Las Mesas Hu.", None, 501, False, 0), "resultado"),      # sin hora: desde las 9:00
    (("2026-10-17", "11:00", "Las Mesas Hu.", "Moya", (2, 1), None, False, 0), None),      # sin código: no hay acta
    (("2026-10-17", None, "Las Mesas Hu.", "Moya", (3, 0), None, False, 0), None),         # de mesa (un retirado)
    (("2026-10-17", "11:00", "Las Mesas Hu.", "Moya", (2, 1), 501, False, 0), "acta"),     # el acta, sin intentar
    (("2026-10-17", "11:00", "Las Mesas Hu.", "Moya", (2, 1), 501, False, 1), None),       # ya falló: por edad
    (("2026-10-17", "11:00", "Las Mesas Hu.", "Moya", (2, 1), 501, True, 0), None),        # importada: al día
    (("2026-10-15", "18:00", "Las Mesas Hu.", "Moya", None, 501, False, 0), "resultado"),   # anteayer, sin resultado
    (("2026-10-14", "18:00", "Las Mesas Hu.", "Moya", None, 501, False, 0), None),          # hace tres días: por edad
    (("2026-10-17", "11:00", "Moya", "Teror", None, 501, False, 0), None),                  # no es de Las Mesas
    (("2026-10-18", "10:00", "Las Mesas Hu.", "Moya", None, 501, False, 0), None),          # mañana
], ids=["sin-resultado", "aun-jugandose", "hace-una-hora", "sin-hora", "sin-codigo", "de-mesa", "acta-nueva",
        "acta-fallida", "al-dia", "anteayer", "hace-tres-dias", "otro-club", "manana"])
def test_a_priority_group_is_hot_while_a_match_of_its_teams_has_just_been_played(match, why):
    """Un partido de sus equipos prioritarios de los dos últimos días (hora de Canarias, la de la base),
    empezado hace más de una hora: sin resultado, o con él y con su acta por leer (con código, sin importar y
    sin intentar: como pending_actas). Solo con la base: nada de estado nuevo ni de páginas. Cambiado el
    16/10/2026 (corrector): «sin-codigo» era «acta», pero un resultado sin código de acta no tiene acta que
    leer (uno de mesa, «de-mesa», nunca la tiene: AL20 en la base real, caliente ~3 días seguidos)."""
    assert U.hot_reason(base([match]), 1, KEYS, NOW) == why


@pytest.mark.parametrize("match, last, why", [
    (("2026-10-17", "09:00", "Las Mesas Hu.", "Moya", None, 501, False, 0), 1, "resultado"),     # leído a las 12:23
    (("2026-10-16", "09:30", "Las Mesas Hu.", "Moya", None, 501, False, 0), 16, "resultado"),    # el 16 a las 21:23
    (("2026-10-16", "09:30", "Las Mesas Hu.", "Moya", None, 501, False, 0), 14, None),           # a las 23:23
    (("2026-10-16", "09:30", "Las Mesas Hu.", "Moya", None, 501, False, 0), None, "resultado"),  # sin comprobación
    (("2026-10-16", "09:30", "Las Mesas Hu.", "Moya", (2, 1), 501, False, 0), 14, None),         # el acta, igual
    (("2026-10-16", "17:00", "Las Mesas Hu.", "Moya", None, 501, False, 0), 8, "resultado"),     # el 17 a las 5:23
    (("2026-10-16", "17:00", "Las Mesas Hu.", "Moya", None, 501, False, 0), 6, None),            # a las 7:23
    (("2026-10-16", None, "Las Mesas Hu.", "Moya", None, 501, False, 0), 16, "resultado"),       # sin hora: las 9:00
    (("2026-10-16", None, "Las Mesas Hu.", "Moya", None, 501, False, 0), 14, None),
], ids=["dentro", "antes-del-tope", "pasado-el-tope", "sin-comprobacion", "acta-pasado-el-tope", "de-tarde",
        "de-tarde-pasado", "sin-hora", "sin-hora-pasado"])
def test_a_hot_group_cools_down_once_read_well_past_its_match(match, last, why):
    """Caliente, como mucho HOT_FOR (12 h) desde HOT_AFTER tras el saque: si una lectura correcta del grupo
    (la comprobación publicada) es de después y sigue sin el resultado o el acta, la federación tarda (un
    aplazado que conserva su fecha, un resultado de mesa, un acta que llega al día siguiente): vuelve al
    ritmo de 6 h (el tope: el saque + 13 h; el 16 a las 9:30, a las 22:30). Una comprobación con error no
    cuenta (y el grupo toca igual, stale). NOW: sábado 17, 13:23 en Canarias; `last`, horas antes de NOW
    (12:23 UTC; en Canarias, una más)."""
    assert U.HOT_FOR == timedelta(hours=12)
    conn = base([match])
    assert U.hot_reason(conn, 1, KEYS, NOW, None if last is None else check(last)) == why
    if last is not None:
        assert U.hot_reason(conn, 1, KEYS, NOW, check(last, "error")) == U.hot_reason(conn, 1, KEYS, NOW) is not None


def test_an_administrative_result_does_not_keep_a_priority_group_hot_for_days():
    """Lo de la base real del 16/10/2026: AL20 (prioritario) con un 3-0 a un retirado del 11/10, sin hora y sin
    código de acta, y sus pasadas cada 2 h del 11 al 15/10 (cada una lee lo que toca y publica su hora).
    Antes, caliente («acta») en 36 pasadas seguidas (todas hasta el 13/10 22:23 UTC) y leído en 36 de las 36
    primeras; ahora ninguna, y leído una de cada tres pasadas, como los demás prioritarios. Igual con un
    aplazado que conserva su fecha (sin resultado): caliente unas 12 h, no tres días."""
    for score, most in (((3, 0), 0), (None, 7)):
        conn = base([("2026-10-11", None, "Las Mesas Hu.", "Moya", score, None, False, 0)])
        conn.execute("UPDATE groups SET url='https://www.fiflp.com/x?CodTemporada=22&CodCompeticion=9&CodGrupo=1'")
        start = datetime(2026, 10, 11, 0, 23, tzinfo=timezone.utc)
        checks, hot, reads = {"PG2": {"url": "u", "status": "ok", "checkedAt": (start - timedelta(hours=1)).isoformat()}}, 0, 0
        for k in range(48):
            now = start + 2 * k * timedelta(hours=1)
            p = U.plan_groups(conn, U.fiflp_groups(conn, 1), checks, now.date(), 3000 + k, priority=["Las Mesas Hu."],
                              pinned=(), env={}, now=now)
            hot += "PG2" in p.hot
            if "PG2" in p.priority:
                reads += 1
                checks["PG2"] = {"url": "u", "status": "ok", "checkedAt": now.isoformat()}
        assert hot <= most and reads <= 16 + most, (score, hot, reads)


def test_hot_uses_the_canary_time_of_the_matches():
    """La hora de los partidos es la de Canarias: un saque a las 12:20 de Canarias (11:20 UTC en octubre)
    está caliente desde las 13:20 de Canarias (12:20 UTC), no una hora más tarde."""
    conn = base([("2026-10-17", "12:20", "Moya", "Las Mesas Hu.", None, 501, False, 0)])
    assert U.local_time(datetime(2026, 10, 17, 12, 21, tzinfo=timezone.utc)) == datetime(2026, 10, 17, 13, 21)
    assert U.hot_reason(conn, 1, KEYS, datetime(2026, 10, 17, 12, 19, tzinfo=timezone.utc)) is None
    assert U.hot_reason(conn, 1, KEYS, datetime(2026, 10, 17, 12, 21, tzinfo=timezone.utc)) == "resultado"
    assert U.local_time(datetime(2026, 12, 5, 12, 0, tzinfo=timezone.utc)) == datetime(2026, 12, 5, 12, 0)   # invierno


# ── El orden de la pasada con los prioritarios cuando toca ─────────────────────

def season(hot=()):
    """PG2, FF5 y AL3 (de Las Mesas) y FF1 y AL1 (no): la jornada 1 jugada el 10/10 con su acta importada y
    la 2 el 17/10 a las 10:00; en los grupos de `hot`, la de Las Mesas sin resultado."""
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.execute("INSERT INTO seasons(id, name, start_year, end_year, is_current) VALUES (1, '2026-2027', 2026, 2027, 1)")
    cats = {}
    groups = [("PG2", "PREBENJAMIN", "Las Mesas Hu."), ("FF5", "BENJAMIN", "Las Mesas Hu."),
              ("FF1", "BENJAMIN", "Arucas"), ("AL3", "ALEVIN", "Las Mesas Hu. A"), ("AL1", "ALEVIN", "Teror")]
    for gid, (code, cat, team) in enumerate(groups, 1):
        if cat not in cats:
            cats[cat] = conn.execute("INSERT INTO categories(name) VALUES (?)", (cat,)).lastrowid
        conn.execute("INSERT INTO groups(id, season_id, category_id, code, url) VALUES (?, 1, ?, ?, ?)",
                     (gid, cats[cat], code, f"https://www.fiflp.com/x?CodTemporada=22&CodCompeticion=9&CodGrupo={gid}"))
        ids = []
        for name in (team, f"Rival {code}"):
            row = conn.execute("SELECT id FROM teams WHERE name=?", (name,)).fetchone()
            ids.append(row[0] if row else conn.execute("INSERT INTO teams(name) VALUES (?)", (name,)).lastrowid)
        conn.execute("""INSERT INTO matches(group_id, jornada, date, time, home_team_id, away_team_id, home_score,
                        away_score, fiflp_acta, cod_acta) VALUES (?, 'Jornada 1', '2026-10-10', '10:00', ?, ?, 1, 0, ?, ?)""",
                     (gid, *ids, gid * 10, gid * 10))
        played = code not in hot
        conn.execute("""INSERT INTO matches(group_id, jornada, date, time, home_team_id, away_team_id, home_score,
                        away_score, fiflp_acta, cod_acta) VALUES (?, 'Jornada 2', '2026-10-17', '10:00', ?, ?, ?, ?, ?, ?)""",
                     (gid, *ids, 2 if played else None, 2 if played else None, gid * 10 + 1,
                      gid * 10 + 1 if played else None))
    conn.commit()
    return conn


def plan(conn, checks, number):
    return U.plan_groups(conn, U.fiflp_groups(conn, 1), checks, TODAY, number, priority=["Las Mesas Hu."],
                         pinned=(), env={}, now=NOW)


def codes(rows):
    return [c for _, c, _ in rows]


def test_a_priority_group_that_is_not_due_rests_like_a_closed_one():
    """Comprobados hace 1 h, en una pasada que no es la suya, los prioritarios descansan (resting y fresh:
    conservan su comprobación); los demás, en su rotación de siempre. Los que tocan van primero, y su hora
    se publica (timed)."""
    conn = season()
    fresh = {"PG2": check(1), "FF5": check(1), "AL3": check(1), "FF1": check(1), "AL1": check(1)}
    for n in range(3):
        p = plan(conn, fresh, n)
        due = {c for i, c in enumerate(["PG2", "FF5", "AL3"]) if U.priority_slot(i, n)}
        assert p.priority == due and p.timed == due and p.hot == {}
        assert set(codes(p.fresh)) == {"PG2", "FF5", "AL3"} - due and set(codes(p.fresh)) <= set(codes(p.resting))
        assert codes(p.order)[:len(due)] == [c for c in ("PG2", "FF5", "AL3") if c in due]
        assert set(codes(p.order)) == due | {"FF1", "AL1"}
    # Sin comprobación (o de hace 5 h: la siguiente ya pasaría de 6), todos.
    for checks in ({}, {c: check(5) for c in fresh}):
        p = plan(conn, checks, 0)
        assert p.priority == {"PG2", "FF5", "AL3"} and p.fresh == [] and codes(p.order)[:3] == ["PG2", "FF5", "AL3"]


def test_a_hot_priority_group_goes_first_even_out_of_its_slot():
    """Un partido de AL3 jugado esta mañana sin resultado: AL3, caliente, va el primero aunque se leyera
    hace 1 h y no sea su pasada; los calientes, por la comprobación más vieja primero."""
    conn = season(hot=("AL3", "FF5"))
    checks = {"PG2": check(1), "FF5": check(1.5), "AL3": check(2), "FF1": check(1), "AL1": check(1)}
    number = next(n for n in range(3) if not U.priority_slot(1, n) and not U.priority_slot(2, n))
    p = plan(conn, checks, number)
    assert p.hot == {"AL3": "resultado", "FF5": "resultado"}
    assert codes(p.order)[:2] == ["AL3", "FF5"] and {"AL3", "FF5"} <= p.timed


def test_the_time_of_a_priority_check_is_published_even_if_nothing_else_changes(tmp_path, monkeypatch):
    """La hora de la comprobación de un prioritario (publish_time) reescribe data-health.json aunque no cambie
    nada más: sin ella, la pasada siguiente no sabría que se leyó y lo leería otra vez. La de los demás, no
    (no hay commit solo por la hora)."""
    import source_health
    (tmp_path / "index.html").write_text('<script src="./data-seasons.js?v=20261014a"></script>')
    monkeypatch.setattr(source_health, "ROOT", tmp_path)
    monkeypatch.setattr(source_health, "REPORT_PATH", tmp_path / "data-health.json")
    monkeypatch.setattr(source_health, "_report", None)
    then = NOW - timedelta(hours=2)
    previous = {"version": 1, "season": "2026-2027", "nextSeason": {"name": "2027-2028", "status": "pending"},
                "groups": {"PG2": check(2), "FF1": check(2)}, "checkedAt": then.isoformat(), "dataVersion": "20261014a"}
    previous["summary"] = {"ok": 2, "rejected": 0, "error": 0}
    for timed, rewritten in ((False, False), (True, True)):
        source_health.REPORT_PATH.write_text(json.dumps(previous))
        source_health.begin("2026-2027")
        source_health.record("PG2", "u", "ok", "3 jornadas leídas", now=NOW, publish_time=timed)
        source_health.record("FF1", "u", "ok", "3 jornadas leídas", now=NOW)
        source_health.finish(now=NOW)
        data = json.loads(source_health.REPORT_PATH.read_text())
        assert (data != previous) == rewritten, timed
        if rewritten:
            assert data["groups"]["PG2"]["checkedAt"] == NOW.isoformat(timespec="seconds")


# ── Cada grupo, completo: los goleadores si tocan ──────────────────────────────

def scorers_base(played=True, scorers=True, new_acta=False, closed=False):
    conn = season()
    gid = 3                                                          # FF1
    if not played:
        conn.execute("UPDATE matches SET home_score=NULL, away_score=NULL WHERE group_id=?", (gid,))
    if scorers:
        conn.execute("INSERT INTO scorers(group_id, player_name, team_id, goals, games) VALUES (?, 'Jugador', 1, 2, 2)",
                     (gid,))
    if new_acta:
        conn.execute("UPDATE matches SET cod_acta=NULL WHERE group_id=? AND jornada='Jornada 2'", (gid,))
    if closed:
        conn.execute("UPDATE matches SET date='2026-09-01' WHERE group_id=?", (gid,))
    conn.commit()
    return conn, gid


@pytest.mark.parametrize("case, kw, changed, last, due", [
    ("nada-jugado", {"played": False, "scorers": False}, False, None, False),
    ("cambio", {}, True, check(1), True),
    ("sin-goleadores", {"scorers": False}, False, check(1), True),
    ("acta-nueva", {"new_acta": True}, False, check(1), True),
    ("hoy-ya", {}, False, check(1), False),                          # leído hoy (13:23 y 12:23 en Canarias)
    ("ayer", {}, False, check(14), True),                            # el viernes por la noche
    ("sin-comprobacion", {}, False, None, True),
    ("con-error", {}, False, check(1, "error"), True),
    ("cerrado", {"closed": True}, False, check(30), False),
], ids=lambda x: x if isinstance(x, str) else "")
def test_the_scorers_of_a_group_are_read_when_something_changed_or_once_a_day(case, kw, changed, last, due):
    """Lo barato, sin estado nuevo: con algo jugado, sí si la lectura cambió resultados, si no tiene goleadores
    o si tiene un acta nueva (la federación ya la cuenta en los suyos); un cerrado, no; y si no, una vez al
    día: si su última comprobación correcta es de otro día (hora de Canarias) o no la hay. Un grupo no
    prioritario, leído cada uno o varios días: casi siempre; un prioritario, en la primera lectura del día y
    cuando cambia algo."""
    conn, gid = scorers_base(**kw)
    assert U.scorers_due(conn, gid, last, TODAY, NOW, changed) is due, case


def test_new_actas_are_the_untried_pending_ones_most_recent_first():
    """new_actas: las actas pendientes sin intentar (lo que el segundo freno dejó a medias), por grupo, los
    de los partidos más recientes primero; las que ya fallaron (acta_tries > 0) no son nuevas."""
    conn = season(hot=("PG2", "AL1"))
    conn.execute("UPDATE matches SET home_score=1, away_score=1 WHERE home_score IS NULL")       # con resultado
    conn.execute("UPDATE matches SET cod_acta=NULL, date='2026-10-11' WHERE group_id=3 AND jornada='Jornada 1'")
    conn.execute("UPDATE matches SET acta_tries=1 WHERE group_id=1")                              # PG2: ya falló
    assert U.new_actas(conn, [1, 2, 3, 4, 5]) == [(5, 1), (3, 1)]
    assert U.new_actas(conn, []) == []


def test_competitions_and_the_directory_once_a_day():
    """extras_turn: una pasada de cada EXTRAS_PASSES (12: 24 h a la cadencia base), en una que salta dos
    puestos de un día a otro (daily_turn, como los cerrados)."""
    assert U.EXTRAS_PASSES == 12
    for day in range(10):
        assert sum(U.extras_turn(n) for n in range(12 * day, 12 * (day + 1))) == 1
    turns = [n for n in range(240) if U.extras_turn(n)]
    assert {b - a for a, b in zip(turns, turns[1:])} <= {2, 14}            # dos puestos más allá (o al dar la vuelta)


def test_the_team_cards_are_capped_in_pages(monkeypatch):
    """update_directorio, como mucho `pages` páginas (EXTRAS_PAGES en la pasada del día): con muchos grupos
    sin fichas (una fase nueva), unos cada día."""
    conn = season()
    for gid in range(1, 6):
        conn.execute("INSERT INTO standings(group_id, team_id, position) SELECT ?, home_team_id, 1 FROM matches "
                     "WHERE group_id=? LIMIT 1", (gid, gid))
    conn.commit()
    asked = []

    class Fed:
        BASE = "https://www.fiflp.com/pnfg/NPcd"

        def goto(self, page, url):
            asked.append(url)
            return False

        def delay(self):
            pass
    U.update_directorio(object(), Fed(), conn, 1, U.fiflp_groups(conn, 1), pages=2)
    assert len(asked) == 2
    asked.clear()
    U.update_directorio(object(), Fed(), conn, 1, U.fiflp_groups(conn, 1))
    assert len(asked) == 5
