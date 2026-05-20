"""Smoke tests for fetch_fiflp_actas public API.

Guards against import errors and verifies that the module exposes all
expected symbols with the correct shapes. No network is needed.
"""


def test_public_api_importable():
    from scripts.fetch_fiflp_actas import (
        main,
        KNOWN_COMPS,
        SEASON_NAME,
        parse_args,
        enumerate_actas_main,
        enumerate_actas_cascade,
        fetch_and_parse_acta,
        enumerate_actas_lstpartidos,
        enumerate_actas_via_teams,
        enumerate_actas_by_range,
        discover_comps,
        delay,
        goto,
        raw_path,
        load_raw,
        save_raw,
    )
    assert callable(main)
    assert callable(enumerate_actas_main)
    assert callable(enumerate_actas_cascade)
    assert callable(fetch_and_parse_acta)


def test_known_comps_positive_counts():
    from scripts.fetch_fiflp_actas import KNOWN_COMPS
    # Must have pre-loaded comps for seasons 19, 20, 21
    assert set(KNOWN_COMPS.keys()) >= {"19", "20", "21"}
    assert sum(len(v) for v in KNOWN_COMPS.values()) > 10
    for season, ids in KNOWN_COMPS.items():
        assert len(ids) > 0, f"season {season} has no comps"
        for cid in ids:
            assert isinstance(cid, str) and cid.isdigit(), f"bad comp id: {cid!r}"


def test_season_name_map():
    from scripts.fetch_fiflp_actas import SEASON_NAME
    assert SEASON_NAME["17"] == "2021-2022"
    assert SEASON_NAME["21"] == "2025-2026"
    assert len(SEASON_NAME) == 5


def test_raw_path_naming():
    from scripts.fetch_fiflp_actas import raw_path
    p = raw_path("21")
    assert p.name == "fiflp_actas_2025-2026_raw.json"
    p = raw_path("17")
    assert p.name == "fiflp_actas_2021-2022_raw.json"
