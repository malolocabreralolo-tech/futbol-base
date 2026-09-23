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


def test_meaningful_view_ignores_only_timestamps():
    a = {"season": "x", "checkedAt": "1", "groups": {"A1": {"status": "ok", "checkedAt": "1"}}}
    b = {"season": "x", "checkedAt": "2", "groups": {"A1": {"status": "ok", "checkedAt": "2"}}}
    c = {"season": "x", "checkedAt": "2", "groups": {"A1": {"status": "error", "checkedAt": "2"}}}
    assert source_health.meaningful(a) == source_health.meaningful(b)
    assert source_health.meaningful(a) != source_health.meaningful(c)
