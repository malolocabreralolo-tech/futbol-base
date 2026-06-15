"""Regression tests for the GitHub Actions workflows (.github/workflows/).

Guards the CI contracts fixed on 2026-06-11:

1. update.yml runs BOTH test suites BEFORE committing. Bot pushes made with
   the default GITHUB_TOKEN never trigger other workflows (GitHub's
   anti-recursion), so tests.yml had not run since 2026-05-22 and a red
   pytest was invisible. Running the suites inside update.yml makes a red
   suite block the data commit and show up as a red run.
2. tests.yml has a daily schedule + workflow_dispatch as a safety net, and
   its node job runs the glob `scripts/tests/test_*.mjs` (contract C5) so
   new suites (e.g. test_sp2_modules.mjs) are picked up automatically.
3. Every workflow that runs scripts/generate_js.py stages ALL of its
   outputs: `data-*.js` glob (covers data-seasons.js, data-season-*.js,
   data-matchdetail-keys.js, future files), plus index.html, sw.js
   (CACHE_NAME bump, contracts C3/C4) and futbolbase.db.

Static YAML checks only — no network, no workflow execution.
"""
import re
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
WF_DIR = ROOT / ".github" / "workflows"

OWNED = ["update.yml", "tests.yml", "fetch-fiflp.yml", "fetch-fiflp-actas.yml"]


def _load(name):
    return yaml.safe_load((WF_DIR / name).read_text(encoding="utf-8"))


def _triggers(data):
    # PyYAML parses the bare `on:` key as boolean True.
    return data.get("on", data.get(True))


def _steps(data, job):
    return data["jobs"][job]["steps"]


def _runs(data, job):
    return [(s.get("run") or "") for s in _steps(data, job)]


# ------------------------------------------------------------------ generic

@pytest.mark.parametrize("name", OWNED)
def test_workflow_yaml_is_valid(name):
    data = _load(name)
    assert isinstance(data, dict) and "jobs" in data


# --------------------------------------------------------------- update.yml

def test_update_runs_both_suites_before_commit():
    """Suites must run after the data refresh and before the commit step,
    so a red suite aborts the run (exit != 0) and nothing is published."""
    runs = _runs(_load("update.yml"), "update")
    pytest_idx = next(
        (i for i, r in enumerate(runs) if re.search(r"python3? -m pytest scripts/tests/", r)),
        None,
    )
    node_idx = next(
        (i for i, r in enumerate(runs) if "node --test scripts/tests/test_*.mjs" in r),
        None,
    )
    fetch_idx = next((i for i, r in enumerate(runs) if "fetch_futbolaspalmas" in r), None)
    commit_idx = next((i for i, r in enumerate(runs) if "git commit" in r), None)
    assert pytest_idx is not None, "update.yml must run pytest before committing"
    assert node_idx is not None, "update.yml must run node --test (glob) before committing"
    assert fetch_idx is not None and commit_idx is not None
    assert fetch_idx < pytest_idx < commit_idx, "pytest must run between fetch and commit"
    assert fetch_idx < node_idx < commit_idx, "node suite must run between fetch and commit"


def test_update_installs_test_dependencies():
    # pyyaml is needed by this very test file when CI runs pytest.
    runs = " ".join(_runs(_load("update.yml"), "update"))
    assert re.search(r"pip install[^\n]*\bpytest\b", runs)
    assert re.search(r"pip install[^\n]*\bpyyaml\b", runs)


def test_update_has_concurrency_and_timeout():
    data = _load("update.yml")
    conc = data.get("concurrency")
    assert conc, "update.yml must declare a concurrency group"
    assert conc.get("group") == "update-data"
    assert conc.get("cancel-in-progress") is False
    assert data["jobs"]["update"].get("timeout-minutes") == 30


def test_update_stages_all_generate_js_outputs():
    """generate_js.py (via fetch_futbolaspalmas.py) writes data-*.js,
    index.html (?v= bump) and sw.js (CACHE_NAME bump, C3/C4). The old
    explicit list silently dropped data-seasons.js and data-season-*.js."""
    runs = _runs(_load("update.yml"), "update")
    commit_run = next(r for r in runs if "git add" in r)
    for needed in ("data-*.js", "index.html", "sw.js", "futbolbase.db"):
        assert needed in commit_run, f"update.yml git add must stage {needed}"


def test_update_gates_db_commit_on_published_changes():
    """futbolbase.db churns every run (SQLite header) even when no data-*.js
    changes -> ~13/14 noise commits. The commit must be gated on the published
    artifacts: stage data-*.js/index.html/sw.js first, and only add the DB (and
    commit) when that set actually changed (review 2026-06-15, #3)."""
    runs = _runs(_load("update.yml"), "update")
    commit_run = next(r for r in runs if "git commit" in r)
    lines = commit_run.splitlines()
    pub_idx = next(
        i for i, l in enumerate(lines)
        if re.search(r"git add .*data-\*\.js.*index\.html.*sw\.js", l)
    )
    assert "futbolbase.db" not in lines[pub_idx], (
        "the first git add must NOT stage futbolbase.db (that is the churn we gate)"
    )
    gate_idx = next(i for i, l in enumerate(lines) if "git diff --cached --quiet" in l)
    db_idx = next(i for i, l in enumerate(lines) if re.search(r"git add .*futbolbase\.db", l))
    assert pub_idx < gate_idx < db_idx, (
        "futbolbase.db must be staged only inside the else branch, after the "
        "published-artifact gate"
    )


# ---------------------------------------------------------------- tests.yml

def test_tests_yml_has_schedule_and_dispatch():
    trig = _triggers(_load("tests.yml"))
    assert "workflow_dispatch" in trig, "tests.yml needs workflow_dispatch"
    crons = [e.get("cron") for e in (trig.get("schedule") or [])]
    assert "30 5 * * *" in crons, "tests.yml needs the daily 05:30 UTC safety-net cron"


def test_tests_yml_node_job_uses_glob():
    runs = " ".join(_runs(_load("tests.yml"), "node-tests"))
    assert "node --test scripts/tests/test_*.mjs" in runs, (
        "node job must use the test_*.mjs glob (contract C5) so new suites "
        "like test_sp2_modules.mjs run without wiring"
    )


def test_tests_yml_paths_cover_known_gaps():
    trig = _triggers(_load("tests.yml"))
    for event in ("push", "pull_request"):
        paths = trig[event]["paths"]
        assert "scripts/**.json" in paths, f"{event} paths must include scripts/**.json"
        assert ".github/workflows/update.yml" in paths, (
            f"{event} paths must include .github/workflows/update.yml"
        )


def test_tests_yml_render_smoke_intact():
    runs = " ".join(_runs(_load("tests.yml"), "render-smoke"))
    assert "node scripts/tests/render-smoke.mjs" in runs


def test_tests_yml_pytest_installs_pyyaml():
    runs = " ".join(_runs(_load("tests.yml"), "pytest"))
    assert re.search(r"pip install[^\n]*\bpyyaml\b", runs), (
        "pytest job must install pyyaml (test_workflows.py imports yaml)"
    )


# ----------------------------------------------------------- fetch-fiflp.yml

def test_fetch_fiflp_stages_globs_in_both_add_sites():
    """The commit step has two `git add` sites (before and after the
    stash/pull --rebase/stash pop retry). Both must use the stable
    data-*.js glob (the old second list dropped data-season-*.js, and
    data-matchdetail-keys.js was in neither) and stage sw.js (C3/C4)."""
    runs = _runs(_load("fetch-fiflp.yml"), "scrape")
    commit_run = next(r for r in runs if "git add" in r)
    assert commit_run.count("data-*.js") >= 2, "both git add sites need the data-*.js glob"
    assert commit_run.count("sw.js") >= 2, "both git add sites must stage sw.js"
    assert "futbolbase.db" in commit_run
    assert "index.html" in commit_run
    # rebase-retry flow preserved
    assert "git pull --rebase origin main" in commit_run
    assert "git stash" in commit_run


def test_fetch_fiflp_pipeline_steps_intact():
    runs = " ".join(_runs(_load("fetch-fiflp.yml"), "scrape"))
    for script in (
        "fetch_fiflp_2425.py",
        "import_fiflp_2425.py",
        "import_wayback_2425.py",
        "synth_copa_campeones.py",
        "generate_js.py",
    ):
        assert script in runs, f"fetch-fiflp.yml lost pipeline step {script}"


def test_fetch_fiflp_runs_tests_before_commit():
    """A dispatch republishes ALL data-*.js to main; it must gate on the suites
    like update.yml. Its bot push (GITHUB_TOKEN) does not trigger tests.yml
    (anti-recursion), so a regression would only surface next day (review #7)."""
    runs = _runs(_load("fetch-fiflp.yml"), "scrape")
    pytest_idx = next(
        (i for i, r in enumerate(runs) if re.search(r"python3? -m pytest scripts/tests/", r)), None)
    node_idx = next(
        (i for i, r in enumerate(runs) if "node --test scripts/tests/test_*.mjs" in r), None)
    gen_idx = next((i for i, r in enumerate(runs) if "generate_js.py" in r), None)
    commit_idx = next((i for i, r in enumerate(runs) if "git commit" in r), None)
    assert pytest_idx is not None, "fetch-fiflp.yml must run pytest before committing"
    assert node_idx is not None, "fetch-fiflp.yml must run node --test (glob) before committing"
    assert gen_idx is not None and commit_idx is not None
    assert gen_idx < pytest_idx < commit_idx, "pytest must run between generate and commit"
    assert gen_idx < node_idx < commit_idx, "node suite must run between generate and commit"


def test_fetch_fiflp_installs_test_deps():
    runs = " ".join(_runs(_load("fetch-fiflp.yml"), "scrape"))
    assert re.search(r"pip install[^\n]*\bpytest\b", runs)
    assert re.search(r"pip install[^\n]*\bpyyaml\b", runs)


# ----------------------------------------------------- fetch-fiflp-actas.yml

def test_actas_stage_all_covers_all_generate_js_outputs():
    """stage_all() is used by both the first commit and the snapshot+reset
    re-apply path (f1f2c75), so fixing it fixes both. The old list only had
    data-lineups-*.js/data-players-*.js and missed everything else
    generate_js.py rewrites, plus sw.js."""
    runs = _runs(_load("fetch-fiflp-actas.yml"), "scrape")
    commit_run = next(r for r in runs if "stage_all" in r)
    assert "add_if_exists data-*.js" in commit_run
    assert "add_if_exists sw.js" in commit_run
    assert "add_if_exists futbolbase.db" in commit_run
    assert "add_if_exists index.html" in commit_run
    assert "add_if_exists scripts/tests/fixtures/acta_*.html" in commit_run


def test_actas_snapshot_reset_flow_intact():
    runs = _runs(_load("fetch-fiflp-actas.yml"), "scrape")
    commit_run = next(r for r in runs if "stage_all" in r)
    assert "git reset --hard origin/main" in commit_run
    assert "SNAPSHOT" in commit_run
    assert "git push origin HEAD:main" in commit_run
    data = _load("fetch-fiflp-actas.yml")
    assert data.get("concurrency", {}).get("cancel-in-progress") is False


def test_actas_runs_tests_before_commit():
    """Same gate as fetch-fiflp.yml: actas publishes to main, so the suites
    must run before the first commit (review 2026-06-15, #7)."""
    runs = _runs(_load("fetch-fiflp-actas.yml"), "scrape")
    pytest_idx = next(
        (i for i, r in enumerate(runs) if re.search(r"python3? -m pytest scripts/tests/", r)), None)
    node_idx = next(
        (i for i, r in enumerate(runs) if "node --test scripts/tests/test_*.mjs" in r), None)
    commit_idx = next((i for i, r in enumerate(runs) if "git commit" in r), None)
    assert pytest_idx is not None, "fetch-fiflp-actas.yml must run pytest before committing"
    assert node_idx is not None, "fetch-fiflp-actas.yml must run node --test (glob) before committing"
    assert commit_idx is not None
    assert pytest_idx < commit_idx, "pytest must run before the first commit"
    assert node_idx < commit_idx, "node suite must run before the first commit"
