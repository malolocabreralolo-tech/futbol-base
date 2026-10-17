"""El reloj de las pasadas (reloj.yml, scripts/reloj_pasadas.py; 17/10/2026): cada ~15 min decide si lanza una
pasada del bot (update.yml). Una cada 2 h (update_fiflp.PASS_EVERY) y una cada hora en las ventanas de partidos,
hora de Canarias (viernes de 18 a 24 y sábado y domingo de 10 a 24, con su cambio de hora: el 25/10/2026 a las
02:00 vuelve a UTC+0), con 10 min de holgura; nunca con una ejecución de update.yml sin acabar. Sin red: la
entrada es el JSON de `gh run list`. El workflow, en test_workflows.py; con el bot, la semana simulada de
test_bot_pasada_corta.py (test_with_the_clock_…)."""
from datetime import datetime, timedelta, timezone
import io
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import reloj_pasadas as R  # noqa: E402

H1, H2 = timedelta(minutes=60), timedelta(minutes=120)


def utc(text):
    return datetime.fromisoformat(text).replace(tzinfo=timezone.utc)


def run(created, status="completed", conclusion="success", event="workflow_dispatch", number=1):
    return {"number": number, "event": event, "status": status, "conclusion": conclusion if status == "completed" else "",
            "createdAt": created.strftime("%Y-%m-%dT%H:%M:%SZ")}


# ── Las ventanas ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("moment, expected", [
    # Octubre de 2026, hasta el 25: hora de verano de Canarias (UTC+1).
    ("2026-10-15T19:00", H2),       # jueves, 20:00: entre semana, nunca
    ("2026-10-16T09:00", H2),       # viernes, 10:00
    ("2026-10-16T16:59", H2),       # viernes, 17:59
    ("2026-10-16T17:00", H1),       # viernes, 18:00
    ("2026-10-16T22:59", H1),       # viernes, 23:59
    ("2026-10-16T23:00", H2),       # sábado, 00:00
    ("2026-10-17T08:59", H2),       # sábado, 09:59
    ("2026-10-17T09:00", H1),       # sábado, 10:00
    ("2026-10-17T15:30", H1),       # sábado, 16:30
    ("2026-10-17T22:59", H1),       # sábado, 23:59
    ("2026-10-17T23:00", H2),       # domingo, 00:00
    ("2026-10-18T08:59", H2),       # domingo, 09:59
    ("2026-10-18T09:00", H1),       # domingo, 10:00
    ("2026-10-18T22:59", H1),       # domingo, 23:59
    ("2026-10-18T23:00", H2),       # lunes, 00:00
    ("2026-10-19T11:00", H2),       # lunes, 12:00
])
def test_the_windows_in_canary_time(moment, expected):
    assert R.interval(utc(moment)) == expected, R.local_time(utc(moment))


@pytest.mark.parametrize("moment, expected", [
    # El 25/10/2026 a las 02:00 de Canarias (01:00 UTC) vuelve a ser las 01:00: desde ahí, UTC+0.
    ("2026-10-24T08:59", H2),       # sábado 24, 09:59 (UTC+1)
    ("2026-10-24T09:00", H1),       # sábado 24, 10:00 (UTC+1)
    ("2026-10-25T00:30", H2),       # domingo 25, 01:30 (la primera vez, UTC+1)
    ("2026-10-25T01:30", H2),       # domingo 25, 01:30 (la segunda, UTC+0)
    ("2026-10-25T09:00", H2),       # domingo 25, 09:00 (con UTC+1 serían las 10:00: dentro, mal)
    ("2026-10-25T09:59", H2),       # domingo 25, 09:59
    ("2026-10-25T10:00", H1),       # domingo 25, 10:00
    ("2026-10-25T23:59", H1),       # domingo 25, 23:59
    ("2026-10-26T00:00", H2),       # lunes 26, 00:00
    ("2026-10-30T17:59", H2),       # viernes 30, 17:59 (UTC+0)
    ("2026-10-30T18:00", H1),       # viernes 30, 18:00
    # Y el de marzo: el 28/3/2027 a las 01:00 de Canarias (01:00 UTC) pasan a ser las 02:00 (UTC+1).
    ("2027-03-27T09:59", H2),       # sábado 27, 09:59 (UTC+0)
    ("2027-03-27T10:00", H1),       # sábado 27, 10:00
    ("2027-03-28T08:59", H2),       # domingo 28, 09:59 (UTC+1)
    ("2027-03-28T09:00", H1),       # domingo 28, 10:00
])
def test_the_windows_follow_the_change_of_time(moment, expected):
    assert R.interval(utc(moment)) == expected, R.local_time(utc(moment))


def test_each_window_starts_an_hour_after_the_first_kickoffs():
    """La base de 2026-27: el viernes, los primeros a las 17 (238 partidos); el sábado y el domingo, a las 9
    (620 y 105). El bot no busca un resultado hasta el saque + HOT_AFTER (update_fiflp.hot_reason)."""
    assert R.FIRST_KICKOFF == {4: 17, 5: 9, 6: 9}
    assert R.WINDOWS == {4: 18, 5: 10, 6: 10}
    assert (R.BASE, R.WINDOW, R.SLACK) == (H2, H1, timedelta(minutes=10))
    assert R.window(utc("2026-10-17T09:00")) == "sábado de 10:00 a 24:00"
    assert R.window(utc("2026-10-16T17:00")) == "viernes de 18:00 a 24:00"
    assert R.window(utc("2026-10-15T17:00")) is None


# ── ¿Toca? ────────────────────────────────────────────────────────────────────

SAT = utc("2026-10-17T12:00")       # sábado, 13:00 en Canarias: cada hora
TUE = utc("2026-10-20T12:00")       # martes, 13:00: cada 2 h


def test_with_no_runs_it_is_due():
    assert R.due(SAT, []) and R.due(TUE, [])


@pytest.mark.parametrize("status", ["queued", "in_progress", "waiting", "pending", "requested", "action_required"])
def test_never_with_a_run_not_finished(status):
    """En cola, en marcha, esperando…: la siguiente se pondría en fila (concurrency update-data) y otra más
    cancelaría la pendiente, gastando un número de pasada sin pasada. Aunque sea de hace horas."""
    runs = [run(SAT - timedelta(hours=5), status=status, number=2), run(SAT - timedelta(hours=7), number=1)]
    ok, why = R.decide(SAT, runs)
    assert not ok and status in why


@pytest.mark.parametrize("now, minutes, expected", [
    (SAT, 49, False), (SAT, 49 + 59 / 60, False), (SAT, 50, True), (SAT, 75, True),
    (TUE, 60, False), (TUE, 109 + 59 / 60, False), (TUE, 110, True), (TUE, 300, True),
])
def test_the_interval_less_the_slack_since_the_last_one_was_created(now, minutes, expected):
    """Desde la creación de la última: el intervalo de ahora menos 10 min de holgura (un tick que llega unos
    minutos antes no deja pasar otra hora)."""
    assert R.due(now, [run(now - timedelta(minutes=minutes))]) is expected


def test_the_last_one_of_any_event_and_result_counts_whatever_the_order():
    """La creada más tarde, aunque gh las dé en otro orden, la lance quien la lance (el reloj, una tanda, a
    mano) y acabe como acabe (también fallida o cancelada)."""
    runs = [run(SAT - timedelta(minutes=200), event="schedule", number=1),
            run(SAT - timedelta(minutes=20), conclusion="failure", number=3),
            run(SAT - timedelta(minutes=90), conclusion="cancelled", number=2)]
    assert not R.due(SAT, runs)
    assert R.due(SAT, runs[:1] + runs[2:])
    ok, why = R.decide(SAT, runs)
    assert "la 3 (workflow_dispatch, failure)" in why and "hace 20 min" in why


def test_entering_a_window_the_next_pass_comes_sooner():
    """A las 17:59 del viernes, una creada hace 70 min aún no toca (110); a las 18:00, sí (50)."""
    friday = utc("2026-10-16T17:00")               # 18:00 en Canarias
    assert not R.due(friday - timedelta(minutes=1), [run(friday - timedelta(minutes=71))])
    assert R.due(friday, [run(friday - timedelta(minutes=70))])


def test_a_run_created_in_the_future_is_not_due():
    """Un reloj que va por detrás del de GitHub no lanza otra encima."""
    ok, why = R.decide(SAT, [run(SAT + timedelta(minutes=5))])
    assert not ok and "después de ahora" in why


@pytest.mark.parametrize("bad", [{}, None, "x", [1], [{"createdAt": "2026-10-17T10:00:00Z"}],
                                 [{"status": "completed"}], [{"status": "completed", "createdAt": "ayer"}]])
def test_an_input_that_is_not_the_list_of_runs_is_an_error(bad):
    """Mejor un job en rojo que un reloj que decide sobre otra cosa."""
    with pytest.raises(ValueError):
        R.decide(SAT, bad)


# ── La línea de órdenes (el paso de reloj.yml) ────────────────────────────────

def test_the_command_line_prints_the_decision_and_writes_due(tmp_path, capsys):
    out = tmp_path / "salida"
    runs = json.dumps([run(SAT - timedelta(minutes=55), number=1118)])
    assert R.main(["--now", "2026-10-17T12:00:00Z"], io.StringIO(runs), {"GITHUB_OUTPUT": str(out)}) == 0
    assert R.main(["--now", "2026-10-17T12:00:00+00:00"], io.StringIO("[]"), {"GITHUB_OUTPUT": str(out)}) == 0
    assert R.main(["--now", "2026-10-20T12:00:00Z"], io.StringIO(runs.replace("2026-10-17", "2026-10-20")),
                  {"GITHUB_OUTPUT": str(out)}) == 0
    assert out.read_text() == "due=true\ndue=true\ndue=false\n"
    printed = capsys.readouterr().out.splitlines()
    assert printed[0].startswith("17/10/2026 13:00 en Canarias, ventana de partidos (sábado de 10:00 a 24:00)")
    assert "Toca: la última, la 1118" in printed[0]
    assert "fuera de las ventanas de partidos: una pasada cada 120 min. No toca" in printed[2]


def test_the_command_line_fails_without_writing_anything(tmp_path, capsys):
    """Un fallo de gh (lo que deja en el fichero no es la lista): sale con error, sin due (el paso de lanzar no
    corre) y con el motivo a la vista."""
    out = tmp_path / "salida"
    for text in ("", "no es json", '{"message": "Bad credentials"}'):
        assert R.main(["--now", "2026-10-17T12:00:00Z"], io.StringIO(text), {"GITHUB_OUTPUT": str(out)}) == 1
    assert not out.exists()
    assert "no se lanza nada" in capsys.readouterr().err
    assert R.main(["--otra"], io.StringIO("[]"), {}) == 2


def test_it_runs_alone_with_the_system_python(tmp_path):
    """reloj.yml solo baja este fichero (checkout disperso) y no instala nada: corre solo, sin el resto del
    repositorio, en modo aislado (-I: ni el directorio del guion en sys.path ni variables de Python)."""
    alone = tmp_path / "reloj_pasadas.py"
    shutil.copy(Path(R.__file__), alone)
    out = tmp_path / "salida"
    done = subprocess.run([sys.executable, "-I", str(alone), "--now", "2026-10-17T12:00:00Z"], input="[]", text=True,
                          capture_output=True, cwd=tmp_path, env={"GITHUB_OUTPUT": str(out)}, timeout=60)
    assert done.returncode == 0, done.stderr
    assert "Toca: no hay ninguna ejecución de update.yml." in done.stdout
    assert out.read_text() == "due=true\n"
