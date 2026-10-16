"""Activar desde la federación grupos de alevín de Gran Canaria y la Segunda Fase de 2026-27
(fiflp_manifest.py → activate_season.py --fiflp-raw --add → update_fiflp.py), sin red.

  - Los códigos de alevín empiezan por AL (docs/alevin.md): la Fase Previa son AL1…, nunca FF1…
    (que es benjamín) ni LZ… para el alevín de Lanzarote, que no se publica.
  - La Segunda Fase admite cualquier letra (2026-27 tendrá, al menos, la F) y las eliminatorias
    tienen código propio (EL, PEL, ALEL) y la fase «Eliminatorias».
  - activate_season guarda el código del acta de cada partido si el raw lo trae, y el bot lee
    TODAS las jornadas ya jugadas de un grupo recién activado en su primera pasada: si no, las
    actas de las jornadas de más de tres semanas (BACK_DAYS) no se leían nunca.
"""
from datetime import date
import os
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import fiflp_manifest as M  # noqa: E402
import update_fiflp as U  # noqa: E402
from activate_season import add_groups, fiflp_evidence, validate_manifest, verify_sources  # noqa: E402
from db import SCHEMA  # noqa: E402

URL = ("https://www.fiflp.com/pnfg/NPcd/NFG_CmpJornada?cod_primaria=1000120"
       "&CodTemporada=22&CodCompeticion={comp}&CodGrupo={grupo}")


@pytest.fixture(autouse=True)
def _run_number(monkeypatch, tmp_path):
    """El orden del bot sale del número de la pasada (GITHUB_RUN_NUMBER, update_fiflp.run_number): uno
    fijo, para que las pruebas den lo mismo en local y dentro de update.yml (donde Actions pone el
    suyo). Y la marca de «subir la base» (FIFLP_DB_MARK), en una carpeta de la prueba."""
    monkeypatch.setenv("GITHUB_RUN_NUMBER", "3000")
    monkeypatch.setenv("FIFLP_DB_MARK", str(tmp_path / "base-cambiada"))


@pytest.mark.parametrize("name, meta", [
    ("LIGA ALEVIN GRAN CANARIA FASE PREVIA", ("AL", "Primera Fase GC")),
    ("LIGA ALEVIN F7 GRAN CANARIA FASE LIGA A", ("ALA", "Segunda Fase A")),
    ("LIGA ALEVIN GRAN CANARIA SEGUNDA FASE F", ("ALF", "Segunda Fase F")),
    ("ALEVIN ELIMINATORIAS GRAN CANARIA", ("ALEL", "Eliminatorias")),
    ("COPA CAMPEONES ALEVÍN", ("ALCC", "Copa de Campeones")),
    ("CLAUSURA ALEVÍN", ("ALCL", "Clausura Alevín")),
    # Benjamín: la Segunda Fase con cualquier letra (FASE LIGA o SEGUNDA FASE) y las eliminatorias.
    ("LIGA BENJAMIN F7 GRAN CANARIA FASE LIGA C", ("C", "Segunda Fase C")),
    ("LIGA BENJAMIN GRAN CANARIA FASE LIGA F", ("F", "Segunda Fase F")),
    ("LIGA BENJAMIN GRAN CANARIA SEGUNDA FASE F", ("F", "Segunda Fase F")),
    ("LIGA BENJAMIN GRAN CANARIA ELIMINATORIAS", ("EL", "Eliminatorias")),
    ("ELIMINATORIAS PREBENJAMIN GRAN CANARIA", ("PEL", "Eliminatorias")),
    # Lo de siempre, igual.
    ("LIGA BENJAMIN GRAN CANARIA FASE PREVIA", ("FF", "Primera Fase GC")),
    ("LIGA BENJAMIN F-7 DE FUERTEVENTURA 1ª FASE", ("FV1", "Fuerteventura Fase 1")),
    ("LIGA PREBENJAMIN DE GRAN CANARIA", ("PG", "Gran Canaria")),
])
def test_comp_meta_codes(name, meta):
    assert M.comp_meta(name) == meta


@pytest.mark.parametrize("name", [
    "LIGA ALEVIN LANZAROTE FASE 1",              # antes: LZ, benjamín (chocaba con LZ1-5)
    "LIGA ALEVIN FUERTEVENTURA F7 1ª FASE",
    "LIGA ALEVIN FUTBOL SALA GRAN CANARIA",
    "COPA CAMPEONES PREBENJAMIN",                # antes: PG (chocaba con PG1-4)
    "TORNEO CLAUSURA TEMPORADA PREBENJAMIN",
    "COPA CAMPEONES BENJAMÍN",
    # Las eliminatorias de Lanzarote y Fuerteventura (el catálogo de 2026-27 ya las tiene en sénior)
    # salían EL/PEL de Gran Canaria: isla equivocada y «código repetido: EL1» junto a las de GC.
    "ELIMINATORIAS LIGA BENJAMIN DE LANZAROTE",
    "ELIMINATORIAS PREBENJAMIN FUERTEVENTURA",
    "ELIMINATORIAS DE ASCENSO BENJAMIN (LANZAROTE-FUERTEVENTURA)",
])
def test_comp_meta_refuses_what_has_no_convention_or_is_out_of_scope(name):
    with pytest.raises(ValueError):
        M.comp_meta(name)


def group(comp_id, comp_name, n, teams, day="03-10-2026", acta=None, played=False):
    return {"competition_id": comp_id, "competition_name": comp_name, "group_id": str(5500 + n),
            "group_name": f"GRUPO {n}", "standings": [],
            "jornadas": [{"num": "1", "date": day, "matches": [
                {"home": teams[0], "away": teams[1], "hs": 3 if played else None, "as": 1 if played else None,
                 "date": day, "time": "10:00", "venue": "CAMPO", **({"fiflp_acta": acta} if acta else {})}]}]}


ALEVIN = "LIGA ALEVIN GRAN CANARIA FASE PREVIA"
TEAMS = ['ARUCAS, C.F. "A"', 'MOYA, U.D. "B"']


def test_build_gives_alevin_its_own_codes_category_and_full_name():
    raw = [group("54976940", ALEVIN, n, TEAMS) for n in (2, 1, 10)] + \
          [group("54976988", "LIGA BENJAMIN GRAN CANARIA FASE PREVIA", 1, TEAMS)]
    groups = M.build(raw, "2026-2027", "22")
    assert [(g["id"], g["cat"], g["island"], g["phase"]) for g in groups] == [
        ("AL1", "alevin", "grancanaria", "Primera Fase GC"), ("AL2", "alevin", "grancanaria", "Primera Fase GC"),
        ("AL10", "alevin", "grancanaria", "Primera Fase GC"), ("FF1", "benjamin", "grancanaria", "Primera Fase GC")]
    assert groups[0]["fullName"] == "ALEVIN PRIMERA FASE GC - GRUPO 1"
    assert groups[0]["url"] == URL.format(comp="54976940", grupo="5501")


def test_build_refuses_alevin_of_other_islands():
    with pytest.raises(ValueError):
        M.build([group("54976933", "LIGA ALEVIN LANZAROTE FASE 1", 1, TEAMS)], "2026-2027", "22")


def test_the_manifest_cli_accepts_alevin_as_team_category():
    text = (ROOT / "scripts" / "fiflp_manifest.py").read_text(encoding="utf-8")
    arg = text.index('add_argument("--cat"')
    assert '"alevin"' in text[arg:text.index("\n", arg)]


# ── Activación ───────────────────────────────────────────────────────────────

def db():
    from migrate_actas_schema import migrate
    conn = sqlite3.connect(":memory:")
    conn.executescript(SCHEMA)
    migrate(conn)
    conn.execute("INSERT INTO seasons(name,start_year,end_year,is_current) VALUES('2026-2027',2026,2027,1)")
    conn.execute("INSERT INTO categories(name) VALUES('BENJAMIN'),('PREBENJAMIN')")     # sin ALEVIN todavía
    conn.commit()
    return conn


NAMES = {'ARUCAS, C.F. "A"': "Arucas", 'MOYA, U.D. "B"': "Moya B"}


def alevin_manifest(raw):
    return {"season": "2026-2027", "groups": M.build(raw, "2026-2027", "22")}


def test_alevin_groups_are_added_creating_their_category():
    conn = db()
    raw = [group("54976940", ALEVIN, 1, TEAMS)]
    manifest = alevin_manifest(raw)
    validate_manifest(manifest, "2026-2027", adding=True)
    add_groups(conn, manifest, verify_sources(manifest, fiflp_raw=raw, names=NAMES))
    assert conn.execute("""SELECT g.code, c.name, g.full_name FROM groups g JOIN categories c ON c.id=g.category_id""").fetchall() \
        == [("AL1", "ALEVIN", "ALEVIN PRIMERA FASE GC - GRUPO 1")]


def test_an_unknown_category_is_still_refused():
    manifest = alevin_manifest([group("54976940", ALEVIN, 1, TEAMS)])
    manifest["groups"][0]["cat"] = "infantil"
    with pytest.raises(ValueError, match="Categoría"):
        validate_manifest(manifest, "2026-2027", adding=True)


def test_the_acta_code_of_the_raw_is_kept_at_activation():
    """El raw de fetch_fiflp_islas trae el código del acta de cada partido (parse_matches): sin
    guardarlo, el bot no las leía hasta volver a pasar por esa jornada."""
    conn = db()
    raw = [group("54976940", ALEVIN, 1, TEAMS, acta=281234, played=True)]
    gr = alevin_manifest(raw)["groups"][0]
    rounds, _ = fiflp_evidence(gr, raw, NAMES)
    assert rounds == {"Jornada 1": [["2026-10-03", "Arucas", "Moya B", 3, 1, "10:00", "CAMPO", 281234]]}
    manifest = alevin_manifest(raw)
    add_groups(conn, manifest, verify_sources(manifest, fiflp_raw=raw, names=NAMES))
    assert conn.execute("SELECT fiflp_acta, home_score FROM matches").fetchone() == (281234, 3)
    # Sin código en el raw (los de antes de octubre de 2026), la fila de siempre, de 7 columnas.
    plain = [group("54976940", ALEVIN, 1, TEAMS)]
    assert fiflp_evidence(alevin_manifest(plain)["groups"][0], plain, NAMES)[0]["Jornada 1"][0][-1] == "CAMPO"


# ── Primera pasada del bot sobre un grupo recién activado ───────────────────

def test_a_freshly_activated_group_is_marked_for_a_full_read():
    conn = db()
    raw = [group("54976940", ALEVIN, 1, TEAMS)]
    manifest = alevin_manifest(raw)
    add_groups(conn, manifest, verify_sources(manifest, fiflp_raw=raw, names=NAMES))
    gid = conn.execute("SELECT id FROM groups WHERE code='AL1'").fetchone()[0]
    assert U.full_read_pending(conn) == {gid}


def test_full_read_takes_every_round_already_played_but_not_the_far_future():
    today = date(2026, 10, 25)
    stored = {f"Jornada {n}": (f"2026-10-{n + 1:02d}", False) for n in (1, 2, 3)}
    stored["Jornada 9"] = ("2027-03-01", True)
    options = [{"value": "1", "text": "1 - 02-10-2026"}, {"value": "2", "text": "2 - 03-09-2026"},
               {"value": "3", "text": "3 - 03-10-2026"}, {"value": "4", "text": "4 - 01-11-2026"},
               {"value": "9", "text": "9 - 01-03-2027"}]
    # Lo normal: solo la 4 (próxima) y las que faltan; la 1-3 ya están y son de hace más de 21 días.
    assert [o["value"] for o in U.rounds_to_refresh(options, stored, today)] == ["4"]
    # La primera vez: todas las jugadas (sus actas) y las próximas; la de marzo, no.
    assert [o["value"] for o in U.rounds_to_refresh(options, stored, today, full=True)] == ["1", "2", "3", "4"]


def test_the_first_pass_reads_all_rounds_and_then_clears_the_mark():
    conn = db()
    raw = [group("54976940", ALEVIN, 1, TEAMS, day="03-09-2026")]
    manifest = alevin_manifest(raw)
    add_groups(conn, manifest, verify_sources(manifest, fiflp_raw=raw, names=NAMES))
    gid, code, url = conn.execute("SELECT id, code, url FROM groups").fetchone()
    seen = []

    class Page:
        url = ""

        def evaluate(self, script):
            return [{"value": "1", "text": "1 - 03-09-2026"}]

        def wait_for_timeout(self, ms):
            pass

        def content(self):
            return "<html></html>"

    class Fed:
        BASE = "https://www.fiflp.com/pnfg/NPcd"

        def goto(self, page, url):
            seen.append(url)
            return True

        def delay(self):
            pass

        def parse_standings(self, page):
            return []

        def parse_matches(self, page):
            return [{"home": TEAMS[0], "away": TEAMS[1], "hs": 3, "as": 1, "date": "03-09-2026",
                     "time": "10:00", "venue": "CAMPO", "fiflp_acta": 281234}]

    today = date(2026, 10, 25)          # la jornada 1 es de hace más de 21 días
    U.run_passes(Page(), Fed(), conn, 1, [(gid, code, url)], today, {code: url}, deadline_seconds=600)
    assert any("CodJornada=1" in u for u in seen), "la primera pasada lee la jornada vieja"
    assert conn.execute("SELECT fiflp_acta FROM matches").fetchone() == (281234,)
    assert U.full_read_pending(conn) == set()
    # update.yml solo sube futbolbase.db si cambia algo publicado: la marca le dice que la suba
    # también ahora, o la pasada siguiente (desde la base de main) repetiría la lectura completa.
    mark = Path(os.environ["FIFLP_DB_MARK"])
    assert mark.exists()
    mark.unlink()
    seen.clear()
    U.run_passes(Page(), Fed(), conn, 1, [(gid, code, url)], today, {code: url}, deadline_seconds=600)
    assert not any("CodJornada=1" in u for u in seen), "después, la ventana de siempre"
    assert not mark.exists(), "sin primera pasada que quitar, la base no se sube por esto"


def test_fiflp_groups_lists_alevin_last_and_filters_by_category():
    """El orden de la pasada lo decide update_fiflp.plan_groups (test_bot_plazo.py); fiflp_groups da
    los grupos de la federación de la temporada, alevín («AL…», que por orden alfabético iba delante
    de FF y PG) al final, y solo los de unas categorías si se le pide (FIFLP_CATS)."""
    conn = db()
    conn.execute("INSERT INTO categories(name) VALUES('ALEVIN')")
    cats = dict(conn.execute("SELECT name, id FROM categories"))
    for code, cat in (("AL1", "ALEVIN"), ("FF1", "BENJAMIN"), ("PG1", "PREBENJAMIN"), ("PG2", "PREBENJAMIN"),
                      ("FF2", "BENJAMIN")):
        conn.execute("INSERT INTO groups(season_id,category_id,code,url) VALUES (1,?,?,?)",
                     (cats[cat], code, URL.format(comp=1, grupo=code)))
    assert [g[1] for g in U.fiflp_groups(conn, 1)] == ["FF1", "FF2", "PG1", "PG2", "AL1"]
    assert [g[1] for g in U.fiflp_groups(conn, 1, categories=("ALEVIN",))] == ["AL1"]
    assert [g[1] for g in U.fiflp_groups(conn, 1, categories=("BENJAMIN", "PREBENJAMIN"))] == ["FF1", "FF2", "PG1", "PG2"]


# ── Alevín no cabe entero en una pasada del bot ─────────────────────────────

class _Page:
    url = ""

    def evaluate(self, script):
        return [{"value": "1", "text": "1 - 03-10-2026"}]

    def wait_for_timeout(self, ms):
        pass

    def content(self):
        return "<html></html>"


class _Fed:
    BASE = "https://www.fiflp.com/pnfg/NPcd"

    def __init__(self):
        self.seen = []

    def goto(self, page, url):
        self.seen.append(url)
        return True

    def delay(self):
        pass

    def parse_standings(self, page):
        return []

    def parse_matches(self, page):
        return []


def _bot_base():
    conn = db()
    conn.execute("INSERT INTO categories(name) VALUES('ALEVIN')")
    cats = dict(conn.execute("SELECT name, id FROM categories"))
    for code, cat in (("FF1", "BENJAMIN"), ("PG2", "PREBENJAMIN"), ("AL1", "ALEVIN"), ("AL2", "ALEVIN"),
                      ("AL3", "ALEVIN"), ("AL4", "ALEVIN"), ("AL5", "ALEVIN")):
        conn.execute("INSERT INTO groups(season_id,category_id,code,url) VALUES (1,?,?,?)",
                     (cats[cat], code, URL.format(comp=1, grupo=code)))
    conn.commit()
    return conn


def _read(fed):
    """Los grupos cuyo calendario leyó la pasada, en orden."""
    import re
    return [re.search(r"CodGrupo=(\w+)", u).group(1) for u in fed.seen
            if "NFG_CmpJornada" in u and "CodGrupo=" in u and "CodJornada" not in u]


def test_the_alevin_quota_takes_turns_by_the_pass_number_even_without_commits(monkeypatch):
    """La cuota de alevín (FIFLP_ALEVIN_MIN) va tras los prioritarios, intercalada con el turno de benjamín
    (desde el 15/10/2026; antes, delante de él), y empieza en cada pasada por otro turno: el número de la
    pasada (GITHUB_RUN_NUMBER), no nada guardado en la base, que update.yml solo sube si cambia algún
    data-*.js (con un turno guardado en ella, fiflp_reads, cada pasada sin cambios volvía a leer los mismos
    grupos)."""
    monkeypatch.setattr(U, "flatten", lambda page, selector=None: 0)
    monkeypatch.setenv("FIFLP_ALEVIN_MIN", "2")
    committed = _bot_base()
    reads = []
    for number in (3000, 3001, 3002):
        monkeypatch.setenv("GITHUB_RUN_NUMBER", str(number))
        conn = sqlite3.connect(":memory:")
        committed.backup(conn)           # cada pasada arranca de la base subida, que no cambia
        fed, groups = _Fed(), U.fiflp_groups(conn, 1)
        U.run_passes(_Page(), fed, conn, 1, groups, date(2026, 10, 5), {g[1]: g[2] for g in groups})
        reads.append(_read(fed))
    # PG2, el grupo del equipo de la portada (src/config.js), siempre el primero; la cuota, 2 alevín
    # desde su turno (5 grupos: turnos [AL1, AL2], [AL3, AL4], [AL5] y []; dentro del turno, el inicio
    # de su época, update_fiflp.spin: 3000-3003 son la época 750, que empieza por el segundo); FF1, el
    # único de benjamín, en su turno (la pasada 3000) va intercalado con la cuota (tras el primero de ella:
    # antes del 15/10/2026, tras toda) y en las demás, entre el resto, según la fase de cada nivel en esa
    # pasada (update_fiflp.pass_phase, desde el 16/10/2026: en la 3001, ahora tras AL2 y no antes).
    assert reads == [["PG2", "AL2", "FF1", "AL1", "AL4", "AL3", "AL5"],
                     ["PG2", "AL4", "AL3", "AL5", "AL1", "AL2", "FF1"],
                     ["PG2", "AL5", "AL1", "AL2", "FF1", "AL3", "AL4"]]


def test_a_base_with_the_old_turn_table_still_works_and_it_is_not_used(monkeypatch):
    """La primera versión del turno de alevín guardaba en la base cuándo se leyó cada grupo (fiflp_reads,
    descartada: ese estado no se sube en una pasada sin cambios). Ninguna base publicada la tiene, pero
    una que la tenga (una copia local de entonces) sigue valiendo: nadie la lee ni la escribe."""
    monkeypatch.setattr(U, "flatten", lambda page, selector=None: 0)
    conn = _bot_base()
    conn.execute("CREATE TABLE fiflp_reads (group_id INTEGER PRIMARY KEY, read_at TEXT)")
    conn.execute("INSERT INTO fiflp_reads VALUES (3, '2026-10-01T00:00:00')")
    fed, groups = _Fed(), U.fiflp_groups(conn, 1)
    U.run_passes(_Page(), fed, conn, 1, groups, date(2026, 10, 5), {g[1]: g[2] for g in groups})
    assert sorted(_read(fed)) == sorted(g[1] for g in groups)
    assert conn.execute("SELECT * FROM fiflp_reads").fetchall() == [(3, "2026-10-01T00:00:00")]


def test_without_a_run_number_the_turn_comes_from_the_clock():
    """Fuera de GitHub (una pasada a mano), la franja del cron: cambia de turno de una franja a otra. Desde
    el 16/10/2026, de 2 h (update_fiflp.PASS_EVERY: el cron cada 2 h); antes, de 6."""
    from datetime import datetime, timezone
    a = U.run_number({}, datetime(2026, 10, 14, 0, tzinfo=timezone.utc))
    assert U.run_number({}, datetime(2026, 10, 14, 1, 59, tzinfo=timezone.utc)) == a
    assert U.run_number({}, datetime(2026, 10, 14, 2, tzinfo=timezone.utc)) == a + 1
    assert U.run_number({"GITHUB_RUN_NUMBER": "812"}) == 812


@pytest.mark.parametrize("number, expected", [(3000, ["AL2", "AL1", "AL4", "AL3", "AL5"]),
                                              (3001, ["AL4", "AL3", "AL5", "AL1", "AL2"])])
def test_a_run_with_only_alevin_reads_every_alevin_group(monkeypatch, number, expected):
    """FIFLP_CATS=alevin (un workflow solo de alevín, docs/alevin.md): sin benjamín delante, todos los
    grupos alevín que quepan en el plazo, no un turno fijo; cada pasada empieza por un turno distinto,
    para que un corte por tiempo no deje siempre sin leer los mismos."""
    monkeypatch.setattr(U, "flatten", lambda page, selector=None: 0)
    monkeypatch.setenv("FIFLP_ALEVIN_MIN", "0")
    monkeypatch.setenv("GITHUB_RUN_NUMBER", str(number))
    conn = _bot_base()
    groups = U.fiflp_groups(conn, 1, categories=("ALEVIN",))
    fed = _Fed()
    U.run_passes(_Page(), fed, conn, 1, groups, date(2026, 10, 5), {g[1]: g[2] for g in groups})
    assert _read(fed) == expected


@pytest.mark.parametrize("cats, recorded, kept", [
    ("alevin", ["AL1", "AL2", "AL3", "AL4", "AL5"], ["FF1", "PG2"]),
    ("benjamin,prebenjamin", ["FF1", "PG2"], ["AL1", "AL2", "AL3", "AL4", "AL5"]),
])
def test_fiflp_cats_keeps_the_health_of_the_categories_left_out(monkeypatch, cats, recorded, kept):
    """Con FIFLP_CATS cada workflow reescribe data-health.json: los grupos de las categorías que no lee
    se quedan con lo de su última lectura (source_health.carry), no desaparecen hasta la pasada del otro."""
    monkeypatch.setattr(U, "flatten", lambda page, selector=None: 0)
    monkeypatch.setenv("FIFLP_CATS", cats)
    seen_record, seen_carry = [], []
    monkeypatch.setattr(U.source_health, "record", lambda code, *a, **k: seen_record.append(code))
    monkeypatch.setattr(U.source_health, "carry", lambda code, url=None: seen_carry.append((code, url)))
    monkeypatch.setattr(U, "_with_browser", lambda work, deadline=None: work(_Page(), _Fed()))
    conn = _bot_base()
    U.update_groups(conn, 1, today=date(2026, 10, 5))
    urls = dict(conn.execute("SELECT code, url FROM groups"))
    assert sorted(seen_record) == recorded and sorted(seen_carry) == [(c, urls[c]) for c in kept]


def test_source_health_carry_keeps_the_previous_entry_of_the_same_group(tmp_path, monkeypatch):
    import json
    import source_health as H
    monkeypatch.setattr(H, "REPORT_PATH", tmp_path / "data-health.json")
    previous = {"season": "2026-2027",
                "groups": {"AL2": {"url": "u", "status": "ok", "message": "m", "checkedAt": "2026-10-05T00:00:00+00:00"},
                           "AL3": {"url": "otra", "status": "ok", "message": "m", "checkedAt": "2026-10-05T00:00:00+00:00"}}}
    (tmp_path / "data-health.json").write_text(json.dumps(previous))
    monkeypatch.setattr(H, "load_config", lambda: {"nextSeason": "2027-2028"})
    H.begin("2026-2027")
    H.carry("AL2", "u")
    H.carry("AL3", "u3")                  # otro grupo con el mismo código: no es su comprobación
    H.carry("AL9", "u9")                  # nunca leído: no sale todavía
    assert H._report["groups"] == {"AL2": previous["groups"]["AL2"]}
    monkeypatch.setattr(H, "_report", None)


def _with_retired(played_against_retired, acta=None):
    """Un grupo de la federación cuya clasificación ya no lista a un equipo retirado que sigue en el
    calendario (AL11 de 2026-27: la federación lo quita de la tabla y deja sus partidos sin fecha)."""
    raw = [group("54976940", ALEVIN, 1, TEAMS, played=True)]
    raw[0]["standings"] = [
        {"pos": 1, "team": TEAMS[0], "pts": 3, "j": 1, "g": 1, "e": 0, "p": 0, "gf": 3, "gc": 1, "df": 2},
        {"pos": 2, "team": TEAMS[1], "pts": 0, "j": 1, "g": 0, "e": 0, "p": 1, "gf": 1, "gc": 3, "df": -2}]
    raw[0]["jornadas"].append({"num": "2", "date": "10-10-2026", "matches": [
        {"home": TEAMS[0], "away": 'RETIRADO, C.D. "B"', "hs": 2 if played_against_retired else None,
         "as": 0 if played_against_retired else None, "date": "10-10-2026", "time": "", "venue": "",
         **({"fiflp_acta": acta} if acta else {})}]})
    return raw


def test_a_retired_team_only_in_the_calendar_does_not_stop_the_activation():
    """La web ya lo trata como retirado (model.retiredTeams: en el calendario, fuera de la tabla y sin
    resultados); la activación no debe abortar por él."""
    raw = _with_retired(False)
    manifest = alevin_manifest(raw)
    conn = db()
    add_groups(conn, manifest, verify_sources(manifest, fiflp_raw=raw, names=NAMES))
    assert conn.execute("SELECT COUNT(*) FROM matches").fetchone() == (2,)


def test_administrative_results_of_a_retired_team_do_not_stop_the_activation():
    """AL15 de 2026-27: el retirado tiene 0-1 y 1-0 en todas las jornadas, sin acta."""
    raw = _with_retired(True)
    manifest = alevin_manifest(raw)
    conn = db()
    add_groups(conn, manifest, verify_sources(manifest, fiflp_raw=raw, names=NAMES))
    assert conn.execute("SELECT COUNT(*) FROM matches WHERE home_score IS NOT NULL").fetchone() == (2,)


def test_a_calendar_of_another_group_still_stops_the_activation():
    """Lo que la comprobación busca: el calendario de otro grupo, con casi todos sus equipos fuera de
    la tabla. Uno o dos retirados (como AL20, que jugó la J1 con acta y se retiró) no lo son."""
    raw = _with_retired(True, acta=281999)
    manifest = alevin_manifest(raw)
    verify_sources(manifest, fiflp_raw=raw, names=NAMES)      # un retirado con acta: se acepta
    raw[0]["standings"] = raw[0]["standings"][:1]
    raw[0]["standings"][0]["team"] = 'OTRO, C.D. "A"'
    with pytest.raises(ValueError, match="equipos diferentes"):
        verify_sources(manifest, fiflp_raw=raw, names=NAMES)
