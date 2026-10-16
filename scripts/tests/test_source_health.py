"""data-health.json no debe generar un commit por ejecución solo porque cambie
la hora de comprobación: se reescribe si cambia algo con significado (estado o
mensaje de un grupo, versión de los datos publicados, temporada) o si la última
comprobación publicada tiene más de un día (latido)."""
from datetime import datetime, timedelta, timezone
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import source_health  # noqa: E402

T0 = datetime(2026, 9, 23, 3, 35, tzinfo=timezone.utc)


@pytest.fixture
def portal(tmp_path, monkeypatch):
    (tmp_path / "index.html").write_text(
        '<script src="./data-seasons.js?v=20260909h"></script>'
        '<footer>Última actualización: 26/07/2026</footer>')
    monkeypatch.setattr(source_health, "ROOT", tmp_path)
    monkeypatch.setattr(source_health, "REPORT_PATH", tmp_path / "data-health.json")
    return tmp_path


def run(groups, now):
    source_health.begin("2025-2026")
    for code, status, message in groups:
        source_health.record(code, f"https://example.test/{code}", status, message, now=now)
    source_health.finish(now=now)
    return source_health.REPORT_PATH.read_text()


OK = [("A1", "ok", "11 equipos; 0 encuentros disponibles"), ("PG2", "ok", "15 equipos")]


def test_first_report_is_written(portal):
    text = run(OK, T0)
    report = json.loads(text)
    assert report["checkedAt"] == T0.isoformat(timespec="seconds")
    assert report["dataVersion"] == "20260909h"


def test_same_content_within_a_day_keeps_the_file_byte_identical(portal):
    first = run(OK, T0)
    assert run(OK, T0 + timedelta(hours=5)) == first
    assert run(OK, T0 + timedelta(hours=23, minutes=59)) == first


def test_heartbeat_rewrites_after_a_day(portal):
    run(OK, T0)
    later = T0 + timedelta(hours=24)
    report = json.loads(run(OK, later))
    assert report["checkedAt"] == later.isoformat(timespec="seconds")


def test_status_change_is_published_immediately(portal):
    run(OK, T0)
    report = json.loads(run([("A1", "error", "HTTP 500"), OK[1]], T0 + timedelta(hours=5)))
    assert report["groups"]["A1"]["status"] == "error"
    assert report["summary"]["error"] == 1


def test_message_change_is_published_immediately(portal):
    run(OK, T0)
    report = json.loads(run([("A1", "ok", "11 equipos; 3 encuentros disponibles"), OK[1]],
                            T0 + timedelta(hours=5)))
    assert report["groups"]["A1"]["message"].startswith("11 equipos; 3")


def test_new_published_data_version_is_published(portal):
    run(OK, T0)
    index = portal / "index.html"
    index.write_text(index.read_text().replace("20260909h", "20260923a"))
    report = json.loads(run(OK, T0 + timedelta(hours=5)))
    assert report["dataVersion"] == "20260923a"
    assert report["checkedAt"] == (T0 + timedelta(hours=5)).isoformat(timespec="seconds")


def test_unreadable_previous_report_is_replaced(portal):
    source_health.REPORT_PATH.write_text("{roto")
    report = json.loads(run(OK, T0))
    assert report["groups"]["A1"]["status"] == "ok"


def test_previous_checks_are_only_those_of_the_same_season(portal):
    run(OK, T0)
    source_health.begin("2025-2026")
    assert source_health.previous_groups()["A1"]["checkedAt"] == T0.isoformat(timespec="seconds")
    source_health.begin("2026-2027")
    assert source_health.previous_groups() == {}


def test_a_group_left_for_the_next_pass_keeps_its_last_check(portal):
    """Rotación del bot de la federación, grupos cerrados que descansan y categorías que este workflow
    no lee (update_fiflp.run_passes, FIFLP_CATS): sin comprobarse en esta pasada, su entrada sigue
    como estaba, sin marcarla como error."""
    first = json.loads(run(OK, T0))
    source_health.begin("2025-2026")
    source_health.record("PG2", "https://example.test/PG2", "ok", "16 equipos", now=T0 + timedelta(hours=5))
    source_health.carry("A1")
    source_health.carry("NUEVO")                     # sin comprobación anterior: no aparece
    source_health.finish(now=T0 + timedelta(hours=5))
    report = json.loads(source_health.REPORT_PATH.read_text())
    assert report["groups"]["A1"] == first["groups"]["A1"]
    assert report["groups"]["PG2"]["message"] == "16 equipos"
    assert "NUEVO" not in report["groups"] and report["summary"]["error"] == 0


def test_run_notes_alone_do_not_rewrite_the_report(portal):
    first = run(OK, T0)
    source_health.begin("2025-2026")
    for code, status, message in OK:
        source_health.record(code, f"https://example.test/{code}", status, message, now=T0 + timedelta(hours=5))
    source_health.note_run({"deferred": ["A1"], "seconds": 1200})
    source_health.finish(now=T0 + timedelta(hours=5))
    assert source_health.REPORT_PATH.read_text() == first


def test_meaningful_view_ignores_only_timestamps():
    a = {"season": "x", "checkedAt": "1", "groups": {"A1": {"status": "ok", "checkedAt": "1"}}}
    b = {"season": "x", "checkedAt": "2", "groups": {"A1": {"status": "ok", "checkedAt": "2"}}}
    c = {"season": "x", "checkedAt": "2", "groups": {"A1": {"status": "error", "checkedAt": "2"}}}
    assert source_health.meaningful(a) == source_health.meaningful(b)
    assert source_health.meaningful(a) != source_health.meaningful(c)


def test_a_failed_run_publishes_its_errors_but_not_its_good_checks(portal):
    """update.yml, si el paso del bot falla («Publicar diagnóstico si la fuente falla»), sube solo
    data-health.json, sin la base ni los datos: las comprobaciones correctas de esa ejecución no se publican
    (vuelven a la anterior; sin ella, nada), y los errores sí (el diagnóstico). La hora de un prioritario
    (publish_time) tampoco: con ella la pasada siguiente lo daba por leído (update_fiflp.plan_groups) y no
    lo releía hasta ~6 h, con sus datos perdidos."""
    first = json.loads(run(OK + [("B1", "ok", "8 equipos")], T0))
    later = T0 + timedelta(hours=2)
    for failed in (True, False):
        source_health.REPORT_PATH.write_text(json.dumps(first))
        source_health.begin("2025-2026")
        source_health.record("A1", "https://example.test/A1", "ok", "11 equipos; 3 encuentros", now=later,
                             publish_time=True)
        source_health.record("PG2", "https://example.test/PG2", "error", "HTTP 500", now=later)
        source_health.record("NUEVO", "https://example.test/NUEVO", "ok", "6 equipos", now=later)
        source_health.record("B1", "https://example.test/otro", "ok", "8 equipos", now=later)
        source_health.finish(now=later, failed=failed)
        report = json.loads(source_health.REPORT_PATH.read_text())
        assert report["groups"]["PG2"]["status"] == "error"
        if failed:
            assert report["groups"]["A1"] == first["groups"]["A1"]
            assert "NUEVO" not in report["groups"] and "B1" not in report["groups"]
            assert report["summary"] == {"ok": 1, "rejected": 0, "error": 1}
        else:
            assert report["groups"]["A1"]["checkedAt"] == later.isoformat(timespec="seconds")
            assert report["groups"]["NUEVO"]["status"] == "ok"


def test_the_bot_run_tells_finish_whether_it_failed(portal, monkeypatch):
    """fetch_futbolaspalmas.main pasa failed=True a source_health.finish si algo falla tras comprobar (p. ej.
    generate_js), y False si acaba bien."""
    import fetch_futbolaspalmas as FB
    import generate_js
    import migrate_categories
    import migrate_compactar
    import migrate_team_names
    import update_fiflp

    class Conn:
        def commit(self):
            pass

        def rollback(self):
            pass

        def close(self):
            pass
    for name, module in (("migrate", migrate_categories), ("migrate", migrate_compactar),
                         ("migrate", migrate_team_names)):
        monkeypatch.setattr(module, name, lambda conn: None)
    monkeypatch.setattr(FB, "get_connection", Conn)
    monkeypatch.setattr(FB, "init_db", lambda conn: None)
    monkeypatch.setattr(FB, "active_season", lambda conn: (1, "2025-2026"))
    monkeypatch.setattr(FB, "FILES", [])
    monkeypatch.setattr(FB, "update_fp_app", lambda conn, name: None)
    monkeypatch.setattr(FB, "import_past_seasons", lambda conn: None)
    monkeypatch.setenv("FIFLP_UPDATE", "1")
    monkeypatch.setattr(update_fiflp, "update_groups", lambda conn, season_id: source_health.record(
        "A1", "https://example.test/A1", "ok", "leído", publish_time=True))
    seen = []
    monkeypatch.setattr(source_health, "finish", lambda now=None, failed=False: seen.append(failed))

    def boom():
        raise RuntimeError("generate_js roto")
    monkeypatch.setattr(generate_js, "main", boom)
    with pytest.raises(RuntimeError):
        FB.main()
    monkeypatch.setattr(generate_js, "main", lambda: None)
    FB.main()
    assert seen == [True, False]
