"""Menos páginas por grupo (update_fiflp, 15/10/2026).

La federación sirve ~15 páginas por IP y después frena ~5 min (medido el 15/10/2026: fiflp_carga): cada
página es ~1/15 del cupo. Un grupo costaba la clasificación, el calendario y las jornadas de la ventana de
21 días atrás y 14 adelante (~5: ~7 páginas). Ahora la ventana es de 10 atrás y 8 adelante (BACK_DAYS,
AHEAD_DAYS): la última jornada jugada y la próxima, 2-3 jornadas (~4-5 páginas), sin perder lo que
importa: los resultados que faltan (PENDING_DAYS, aplazados incluidos, también una jornada entera que
la federación pasa a fuera de la ventana), las jornadas que la base no tiene, las de entre semana y la
primera pasada completa de un grupo recién activado. Lo que sí deja de hacerse: releer una jornada
COMPLETA de hace 11-21 días (una corrección tan tardía ya no se ve en la jornada; el acta, que manda, sí
se lee).

Y el calendario (NFG_CmpJornada sin CodJornada): ¿trae ya los partidos de la jornada seleccionada en su
desplegable? Sin red no se puede asegurar (no hay ninguna guardada, y leer como una jornada los partidos
de otra los escribiría donde no es), así que no se aprovecha: se mide en cada pasada sin pedir nada más
(update_fiflp.calendar_shows, run.calendarShows).
Sin red: páginas y raspador falsos.
"""
from datetime import date, timedelta
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import update_fiflp as U  # noqa: E402

BASE = "https://www.fiflp.com/pnfg/NPcd"
GROUP = f"{BASE}/NFG_CmpJornada?cod_primaria=1000120&CodTemporada=22&CodCompeticion=900&CodGrupo=7"
FIRST = date(2026, 9, 19)                  # la jornada 1, un sábado; una por semana


def calendar(n=30, first=FIRST, extra=()):
    """El desplegable de jornadas de una liga semanal (sábados), y `extra` [(número, fecha)] además."""
    rounds = [(k, first + timedelta(weeks=k - 1)) for k in range(1, n + 1)] + list(extra)
    return [{"value": str(k), "text": f"{k} - {day:%d-%m-%Y}"} for k, day in rounds]


def stored(options, today, pending=()):
    """La base con TODO el calendario (como tras la activación): jugadas las de antes de hoy, con su resultado
    salvo las de `pending` (aplazados); las demás, sin jugar."""
    out = {}
    for opt in options:
        label, when = U.option_round(opt["text"])
        out[label] = (when.isoformat(), when >= today or opt["value"] in pending)
    return out


def picked(options, today, **kw):
    return [o["value"] for o in U.rounds_to_refresh(options, stored(options, today, kw.pop("pending", ())), today, **kw)]


def window(today, back, ahead, options):
    keep = (U.BACK_DAYS, U.AHEAD_DAYS)
    U.BACK_DAYS, U.AHEAD_DAYS = back, ahead
    try:
        return picked(options, today)
    finally:
        U.BACK_DAYS, U.AHEAD_DAYS = keep


@pytest.mark.parametrize("offset", range(14))
def test_the_window_reads_the_last_played_round_and_the_next_one_and_little_more(offset):
    """Cualquier día de dos semanas: la última jornada jugada (o la de hoy) y la próxima, siempre; como mucho
    tres jornadas de la ventana (antes, 5-6)."""
    today = date(2026, 10, 12) + timedelta(days=offset)
    options = calendar()
    got = picked(options, today)
    days = {o["value"]: U.option_round(o["text"])[1] for o in options}
    last = max((v for v, d in days.items() if d <= today), key=lambda v: days[v])
    upcoming = min((v for v, d in days.items() if d > today), key=lambda v: days[v])
    assert last in got and upcoming in got, (today, got)
    assert 2 <= len(got) <= 3, (today, got)
    assert 5 <= len(window(today, 21, 14, options)) <= 6                   # lo de antes
    assert U.BACK_DAYS == 10 and U.AHEAD_DAYS == 8


def test_a_midweek_round_is_read_like_any_other():
    """Una jornada entre semana (un festivo: el miércoles 14/10) cae dentro de la ventana igual que las del
    sábado: el jueves se leen la del sábado pasado, la del miércoles y la del sábado que viene."""
    options = calendar(extra=[(31, date(2026, 10, 14))])
    assert picked(options, date(2026, 10, 15)) == ["4", "5", "31"]


def test_a_missing_result_is_still_looked_for_for_months():
    """Un resultado que falta (un aplazado) no depende de la ventana: su jornada se lee en cada pasada
    hasta PENDING_DAYS (120 días). La de hace 4 meses y medio, no (como antes)."""
    today = date(2027, 1, 30)
    options = calendar()
    got = picked(options, today, pending={"3", "8"})            # 3 de octubre (119 días) y 7 de noviembre
    assert "3" in got and "8" in got
    assert "1" not in picked(options, today, pending={"1"})    # 19 de septiembre: 133 días


def test_a_round_the_base_does_not_have_is_always_read():
    """Una jornada nueva (la federación la añade, o la base aún no la tiene) se lee, caiga donde caiga."""
    options = calendar()
    today = date(2026, 10, 15)
    base = stored(options, today)
    del base["Jornada 1"], base["Jornada 20"]
    got = [o["value"] for o in U.rounds_to_refresh(options, base, today)]
    assert "1" in got and "20" in got


def test_the_first_full_read_of_a_new_group_does_not_change():
    """La primera pasada de un grupo recién activado (full_read_pending) lee todas las jugadas, por viejas
    que sean (el código de sus actas), y las próximas de la ventana."""
    options = calendar()
    today = date(2026, 11, 20)
    got = [o["value"] for o in U.rounds_to_refresh(options, stored(options, today), today, full=True)]
    assert got == [str(k) for k in range(1, 12)]                # y las del 21 y el 28/11 (8 días)


def test_what_is_no_longer_reread_is_a_complete_round_two_or_three_weeks_old():
    """Lo que se deja de hacer, a propósito: una jornada COMPLETA de hace 11-21 días ya no se relee (antes,
    sí). Una corrección de un resultado tan tardía no la ve la jornada; el acta (que manda) sí se lee, y
    la clasificación, en cada pasada."""
    options = calendar()
    today = date(2026, 10, 15)                                  # la 4 (10/10) y la 3 (3/10): 5 y 12 días
    assert "3" not in picked(options, today) and "3" in window(today, 21, 14, options)


def test_a_whole_round_moved_two_weeks_on_is_read_once_with_its_new_date():
    """La federación pasa una jornada entera sin jugar (la 5, del sábado 17/10) al 31/10 (un puente). La base la
    sigue teniendo en su fecha vieja, ya pasada y sin resultados, y el desplegable da la nueva, fuera de la
    ventana (AHEAD_DAYS, 8). Se lee por su fecha GUARDADA (un partido sin resultado de hace menos de
    PENDING_DAYS), una vez: write_round les pone la nueva a sus partidos (la de la jornada, si no traen la suya)
    y ya no se vuelve a leer hasta que entre en la ventana. Sin esto, la web la enseñaba hasta el 23/10 como
    jugada el 17 y sin resultado (con la ventana de antes, 14 días, solo si caía a 9-14 días vista)."""
    today = date(2026, 10, 20)
    options = [{"value": "4", "text": "4 - 10-10-2026"}, {"value": "5", "text": "5 - 31-10-2026"},
               {"value": "6", "text": "6 - 24-10-2026"}]
    stored = {"Jornada 4": ("2026-10-10", False), "Jornada 5": ("2026-10-17", True), "Jornada 6": ("2026-10-24", True)}
    assert [o["value"] for o in U.rounds_to_refresh(options, stored, today)] == ["4", "5", "6"]
    for day in ("21-11-2026", "13-02-2027"):                    # a un mes o a cuatro, igual: una vez
        moved = options[:1] + [{"value": "5", "text": f"5 - {day}"}] + options[2:]
        assert [o["value"] for o in U.rounds_to_refresh(moved, stored, today)] == ["4", "5", "6"]
    stored["Jornada 5"] = ("2026-10-31", True)                  # leída: en la base, en su fecha nueva
    assert [o["value"] for o in U.rounds_to_refresh(options, stored, today)] == ["4", "6"]
    stored["Jornada 5"] = ("2026-06-01", True)                  # más de PENDING_DAYS: ni así (como antes)
    assert [o["value"] for o in U.rounds_to_refresh(options, stored, today)] == ["4", "6"]


def test_the_stored_date_of_a_round_is_its_first_match_without_a_result():
    """stored_rounds da, de cada jornada, la fecha del primer partido SIN resultado: un partido adelantado y ya
    jugado (con resultado y fecha pasada) no hace leer antes de tiempo su jornada, que sigue a dos semanas; uno
    adelantado que aún no tiene resultado, sí (lo busca PENDING_DAYS); y sin ninguno pendiente, nada."""
    import sqlite3
    from db import SCHEMA
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    for t in range(1, 5):
        conn.execute("INSERT INTO teams(id, name) VALUES (?, ?)", (t, f"Equipo {t}"))
    rows = [("Jornada 7", "2026-10-17", 1, 2, 3, 1), ("Jornada 7", "2026-10-31", 3, 4, None, None),   # adelantado, jugado
            ("Jornada 8", "2026-10-18", 1, 3, None, None), ("Jornada 8", "2026-11-07", 2, 4, None, None),  # sin resultado
            ("Jornada 3", "2026-10-03", 1, 4, 0, 0), ("Jornada 3", "2026-10-03", 2, 3, 1, 1)]
    for jornada, day, home, away, hs, as_ in rows:
        conn.execute("""INSERT INTO matches(group_id, jornada, date, home_team_id, away_team_id, home_score, away_score)
                        VALUES (1, ?, ?, ?, ?, ?, ?)""", (jornada, day, home, away, hs, as_))
    stored = U.stored_rounds(conn, 1)
    assert stored == {"Jornada 7": ("2026-10-31", True), "Jornada 8": ("2026-10-18", True), "Jornada 3": ("", False)}
    options = [{"value": "7", "text": "7 - 31-10-2026"}, {"value": "8", "text": "8 - 07-11-2026"},
               {"value": "3", "text": "3 - 03-10-2026"}]
    assert [o["value"] for o in U.rounds_to_refresh(options, stored, date(2026, 10, 20))] == ["8"]


# ── Lo que cuesta un grupo ─────────────────────────────────────────────────────

class Page:
    """El calendario de un grupo con `options`; `selected`, la jornada seleccionada en su desplegable (None:
    ninguna); `shows`, los partidos que enseña el calendario."""
    url = ""

    def __init__(self, options, selected=None, shows=None):
        self.options, self.selected, self.shows = options, selected, shows

    def evaluate(self, js, *a):
        if js == U.SELECTED_JS:
            return self.selected
        if 'select[name="jornada"]' in js:
            return self.options if "CodGrupo=" in self.url else []
        return None

    def wait_for_function(self, js, arg=None, timeout=None, polling=None):
        pass

    def content(self):
        return "<html></html>"


class Fed:
    """El raspador: cuenta las páginas y da los partidos de cada jornada (`rounds`: {valor: [partidos]}; en el
    calendario, los que enseñe la página)."""
    BASE = BASE

    def __init__(self, rounds=None):
        self.urls, self.rounds = [], rounds or {}

    def goto(self, page, url):
        self.urls.append(url)
        page.url = url
        return True

    def delay(self, *a):
        pass

    def parse_standings(self, page):
        return []

    def parse_matches(self, page):
        if "CodJornada=" in page.url:
            return self.rounds.get(page.url.rsplit("=", 1)[1], [])
        return page.shows or []


@pytest.fixture
def scrape(monkeypatch):
    monkeypatch.setattr(U, "flatten", lambda page, selector=None: 0)

    def run(today, options=None, page=None, fed=None, check=None, back=None, ahead=None):
        options = options or calendar()
        page, fed = page or Page(options), fed or Fed()
        if back is not None:
            monkeypatch.setattr(U, "BACK_DAYS", back)
            monkeypatch.setattr(U, "AHEAD_DAYS", ahead)
        _, rounds = U.scrape_group(page, fed, GROUP, stored(options, today), today, check=check)
        return fed.urls, rounds
    return run


@pytest.mark.parametrize("today, now, before", [(date(2026, 10, 14), 4, 7), (date(2026, 10, 17), 5, 8)],
                         ids=["miércoles", "sábado"])
def test_a_group_costs_fewer_pages(scrape, today, now, before):
    """Un grupo de liga semanal con todo lo jugado al día: un miércoles, 4 páginas (clasificación, calendario,
    la jornada del sábado pasado y la del que viene); un sábado, 5 (también la de hoy). Antes, 7 y 8."""
    urls, rounds = scrape(today)
    assert len(urls) == now and len(rounds) == now - 2
    old, _ = scrape(today, back=21, ahead=14)
    assert len(old) == before


def _match(home, away, hs=None, as_=None, acta=None):
    return {"home": home, "away": away, "hs": hs, "as": as_, "fiflp_acta": acta, "date": "10-10-2026",
            "time": "10:00", "venue": "Campo"}


ROUND_4 = [_match("UNO", "DOS", 2, 1, 41), _match("TRES", "CUATRO", 0, 0, 42)]
ROUND_5 = [_match("DOS", "TRES", acta=51), _match("CUATRO", "UNO", acta=52)]


def test_the_calendar_round_is_measured_without_asking_anything_more(scrape, capsys):
    """El diagnóstico del calendario no pide ninguna página: compara los partidos que enseña con los de la
    jornada seleccionada leída por su URL (que se lee igual), y lo cuenta en `check`."""
    today = date(2026, 10, 14)
    rounds = {"4": ROUND_4, "5": ROUND_5}
    plain, _ = scrape(today, fed=Fed(rounds))
    check = {}
    selected = {"value": "4", "text": "4 - 10-10-2026"}
    urls, got = scrape(today, page=Page(calendar(), selected, ROUND_4), fed=Fed(rounds), check=check)
    assert urls == plain and check == {"same": 1}
    assert got["Jornada 4"][0]["hs"] == 2 and "calendario" not in capsys.readouterr().out
    # Si enseña otra (aquí, la 5 con la 4 seleccionada), se dice; y se sigue leyendo cada jornada por su URL.
    check = {}
    urls, got = scrape(today, page=Page(calendar(), selected, ROUND_5), fed=Fed(rounds), check=check)
    assert urls == plain and check == {"different": 1} and list(got) == ["Jornada 4", "Jornada 5"]
    assert ("    calendario: seleccionada la jornada 4, pero sus partidos no son los de su página (son los de la "
            "jornada 5)") in capsys.readouterr().out
    # Una seleccionada que no se lee en esta pasada, o ninguna: nada que comparar (ni se aplana el calendario).
    for selected in ({"value": "20", "text": "20 - 30-01-2027"}, None):
        check = {}
        urls, _ = scrape(today, page=Page(calendar(), selected, ROUND_4), fed=Fed(rounds), check=check)
        assert urls == plain and check == {}


def test_the_calendar_diagnostic_never_breaks_a_group(scrape):
    """Si leer el calendario falla (una página rara), el grupo se lee igual: es solo un diagnóstico."""
    class Odd(Fed):
        def parse_matches(self, page):
            if "CodJornada=" not in page.url:
                raise RuntimeError("tabla rara")
            return super().parse_matches(page)
    check = {}
    urls, rounds = scrape(date(2026, 10, 14), page=Page(calendar(), {"value": "4", "text": "4 - 10-10-2026"}),
                          fed=Odd({"4": ROUND_4}), check=check)
    assert len(urls) == 4 and check == {} and rounds["Jornada 4"]
