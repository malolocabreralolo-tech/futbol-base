"""generate_js con alevín (contrato de docs/alevin.md, §4 y §5).

  - data-alevin.js (temporada en curso, carga perezosa) SIEMPRE, aunque esté vacío, con
    exactamente ALEVIN, ALEV_STATS, HISTORY_ALEV, GOL_ALEV, ESTADOS_ALEV y EQUIPOS_ALEV, en ese
    orden y con la forma de sus pares de benjamín.
  - data-history.js (carga inicial) solo con benjamín y prebenjamín: HISTORY, ESTADOS, EQUIPOS y
    HIST_MATCHES; si no, la carga inicial crecería sola con 32 grupos alevín.
  - Temporadas pasadas: el alevín nunca dentro de data-season-<S>.js, sino en
    data-season-<S>-alevin.js (SEASON_<S>_ALEVIN), fuera de SEASON_FILES del service worker, y
    solo si la temporada tiene grupos alevín.
"""
import json
import re
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from db import SCHEMA  # noqa: E402


def const(text, name):
    m = re.search(rf"^const {name}=(.*?);$", text, re.M)
    assert m, f"sin const {name}"
    return json.loads(m.group(1))


def site(tmp_path, alevin=True):
    """Una base con 2026-27 en curso (FF1, PG2 y, si se pide, AL1) y 2025-26 cerrada (FF1 y AL3)."""
    from migrate_actas_schema import migrate
    import import_fp_app
    import import_fiflp_detalle
    db = tmp_path / "fb.db"
    conn = sqlite3.connect(db)
    conn.executescript(SCHEMA)
    migrate(conn)
    import_fp_app.migrate(conn)
    import_fiflp_detalle.migrate(conn)
    conn.executescript("""
      INSERT INTO seasons(id,name,start_year,end_year,is_current) VALUES (1,'2026-2027',2026,2027,1),
                                                                         (2,'2025-2026',2025,2026,0);
      INSERT INTO categories(id,name) VALUES (1,'BENJAMIN'),(2,'PREBENJAMIN'),(3,'ALEVIN');
      INSERT INTO teams(id,name) VALUES (1,'Arucas'),(2,'Moya'),(3,'Gáldar'),(4,'Tablero');
      INSERT INTO groups(id,season_id,category_id,code,name,full_name,phase,island,url,current_jornada) VALUES
        (1,1,1,'FF1','Grupo 1','BENJAMIN PRIMERA FASE GC - GRUPO 1','Primera Fase GC','grancanaria','u','Jornada 1'),
        (2,1,2,'PG2','Grupo 2','PREBENJAMIN GRAN CANARIA - GRUPO 2','Gran Canaria','grancanaria','u','Jornada 1'),
        (4,2,1,'FF1','Grupo 1','BENJAMIN PRIMERA FASE GC - GRUPO 1','Primera Fase GC','grancanaria','','Jornada 1');
    """)
    rows = [(1, 1, 2, "2026-10-03"), (2, 2, 4, "2026-10-03"), (4, 1, 2, "2025-10-04")]
    if alevin:
        conn.executescript("""
          INSERT INTO groups(id,season_id,category_id,code,name,full_name,phase,island,url,current_jornada) VALUES
            (3,1,3,'AL1','Grupo 1','ALEVIN PRIMERA FASE GC - GRUPO 1','Primera Fase GC','grancanaria','u','Jornada 1'),
            (5,2,3,'AL3','Grupo 3','ALEVIN PRIMERA FASE GC - GRUPO 3','Primera Fase GC','grancanaria','','Jornada 1');
        """)
        rows += [(3, 1, 3, "2026-10-04"), (5, 3, 1, "2025-10-05")]
    for gid, home, away, day in rows:
        for pos, tid in enumerate((home, away), 1):
            conn.execute("""INSERT INTO standings(group_id,team_id,position,points,played,won,drawn,lost,gf,gc,gd)
                            VALUES (?,?,?,?,1,?,0,?,?,?,?)""",
                         (gid, tid, pos, 3 if pos == 1 else 0, int(pos == 1), int(pos == 2),
                          2 if pos == 1 else 1, 1 if pos == 1 else 2, 1 if pos == 1 else -1))
        mid = conn.execute("""INSERT INTO matches(group_id,jornada,date,time,home_team_id,away_team_id,home_score,
                              away_score,venue) VALUES (?,'Jornada 1',?,'10:00',?,?,2,1,'CAMPO')""",
                           (gid, day, home, away)).lastrowid
        conn.execute("INSERT INTO scorers(group_id,player_name,team_id,goals,games) VALUES (?,'PEREZ, JUAN',?,2,1)",
                     (gid, home))
        conn.execute("""INSERT INTO fp_matches(fp_id,liga_id,match_id,estado,motivo_aplazado)
                        VALUES (?,1,?,'aplazado','lluvia')""", (mid, mid))
    conn.execute("INSERT INTO fp_ligas(liga_id,season_id,group_id,name) VALUES (1,1,NULL,'x')")
    conn.execute("""INSERT INTO team_seasons(team_id,season_id,shirt,venue_name) VALUES
                    (1,1,'Amarilla','CAMPO'),(3,1,'Azul','CAMPO'),(2,1,'Roja','CAMPO')""")
    conn.commit()
    conn.close()
    root = tmp_path / "site"
    root.mkdir()
    (root / "index.html").write_text('<script src="./data-seasons.js?v=20260101"></script>\n', encoding="utf-8")
    (root / "sw.js").write_text("const CACHE_NAME = 'futbolbase-v20260101';\nconst SEASON_FILES = [\n];\n",
                                encoding="utf-8")
    return db, root


def generate(monkeypatch, db, root):
    import generate_js
    monkeypatch.setattr(generate_js, "PROJECT_ROOT", str(root))
    monkeypatch.setattr(generate_js, "get_connection", lambda: sqlite3.connect(str(db)))
    generate_js.main()
    return {p.name: p.read_text(encoding="utf-8") for p in root.glob("data-*.js")}


def test_data_alevin_has_the_contract_constants_in_order(tmp_path, monkeypatch):
    files = generate(monkeypatch, *site(tmp_path))
    text = files["data-alevin.js"]
    assert re.findall(r"^const (\w+)=", text, re.M) == [
        "ALEVIN", "ALEV_STATS", "HISTORY_ALEV", "GOL_ALEV", "ESTADOS_ALEV", "EQUIPOS_ALEV"]
    alevin, benjamin = const(text, "ALEVIN"), const(files["data-benjamin.js"], "BENJAMIN")
    assert [g["id"] for g in alevin] == ["AL1"] and set(alevin[0]) == set(benjamin[0])
    assert const(text, "ALEV_STATS") == {"groups": 1, "teams": 2}
    assert list(const(text, "HISTORY_ALEV")) == ["AL1"]
    assert const(text, "HISTORY_ALEV")["AL1"]["Jornada 1"][0] == ["2026-10-04", "Arucas", "Gáldar", 2, 1, None,
                                                                 "10:00", "CAMPO"]
    gol = const(text, "GOL_ALEV")
    assert [(g["id"], g["s"]) for g in gol] == [("AL1", [["PEREZ, JUAN", "Arucas", 2, 1]])]
    assert gol[0]["g"].startswith("ALEVIN")
    assert list(const(text, "ESTADOS_ALEV")) == ["AL1"]
    assert sorted(const(text, "EQUIPOS_ALEV")) == ["Arucas", "Gáldar"]


def test_the_initial_load_keeps_only_benjamin_and_prebenjamin(tmp_path, monkeypatch):
    files = generate(monkeypatch, *site(tmp_path))
    history = files["data-history.js"]
    assert sorted(const(history, "HISTORY")) == ["FF1", "PG2"]
    assert sorted(const(history, "ESTADOS")) == ["FF1", "PG2"]
    assert sorted(const(history, "EQUIPOS")) == ["Arucas", "Moya"]          # Gáldar solo juega en alevín
    assert re.search(r"const HIST_MATCHES=2;", history)
    assert "AL1" not in files["data-goleadores.js"] and "AL1" not in files["data-benjamin.js"]


def test_past_seasons_keep_alevin_in_their_own_lazy_file(tmp_path, monkeypatch):
    db, root = site(tmp_path)
    files = generate(monkeypatch, db, root)
    past = const(files["data-season-2025-2026.js"], "SEASON_2025_2026")
    assert "alevin" not in past and [g["id"] for g in past["benjamin"]] == ["FF1"]
    assert "Gáldar" not in json.dumps(past, ensure_ascii=False)
    alevin = const(files["data-season-2025-2026-alevin.js"], "SEASON_2025_2026_ALEVIN")
    assert alevin["name"] == "2025-2026" and [g["id"] for g in alevin["alevin"]] == ["AL3"]
    assert set(alevin["alevin"][0]) == set(past["benjamin"][0])
    assert [g["id"] for g in alevin["gol"]["alevin"]] == ["AL3"]
    worker = (root / "sw.js").read_text(encoding="utf-8")
    assert "./data-season-2025-2026.js" in worker and "alevin" not in worker


def test_without_alevin_the_file_is_empty_and_no_season_file_is_left(tmp_path, monkeypatch):
    db, root = site(tmp_path, alevin=False)
    (root / "data-season-2025-2026-alevin.js").write_text("const SEASON_2025_2026_ALEVIN={};\n")   # de antes
    files = generate(monkeypatch, db, root)
    assert files["data-alevin.js"] == ('const ALEVIN=[];\nconst ALEV_STATS={"groups":0,"teams":0};\n'
                                       'const HISTORY_ALEV={};\nconst GOL_ALEV=[];\nconst ESTADOS_ALEV={};\n'
                                       'const EQUIPOS_ALEV={};\n')
    assert "data-season-2025-2026-alevin.js" not in files
    assert sorted(const(files["data-history.js"], "EQUIPOS")) == ["Arucas", "Gáldar", "Moya"]


def test_the_published_empty_file_is_the_one_in_the_repository():
    """data-alevin.js va en el repositorio (vacío hasta que se active alevín): el frontend lo pide."""
    text = (ROOT / "data-alevin.js").read_text(encoding="utf-8")
    assert re.findall(r"^const (\w+)=", text, re.M) == [
        "ALEVIN", "ALEV_STATS", "HISTORY_ALEV", "GOL_ALEV", "ESTADOS_ALEV", "EQUIPOS_ALEV"]
    index = (ROOT / "index.html").read_text(encoding="utf-8")
    worker = (ROOT / "sw.js").read_text(encoding="utf-8")
    assert "data-alevin.js" not in index
    assert "data-alevin.js" not in worker[worker.index("STATIC_ASSETS"):worker.index("SEASON_FILES")]


def test_check_missing_shields_reads_alevin(tmp_path, monkeypatch, capsys):
    import check_missing_shields as C
    db, root = site(tmp_path)
    generate(monkeypatch, db, root)
    (root / "data-shields.js").write_text('const SHIELDS={"Arucas":"a.png","Moya":"m.png"};\n', encoding="utf-8")
    for name, value in (("ROOT", str(root)), ("SHIELDS_PATH", str(root / "data-shields.js")),
                        ("SEASONS_PATH", str(root / "data-seasons.js")),
                        ("BENJAMIN_PATH", str(root / "data-benjamin.js")),
                        ("PREBENJAMIN_PATH", str(root / "data-prebenjamin.js")),
                        ("ALEVIN_PATH", str(root / "data-alevin.js"))):
        monkeypatch.setattr(C, name, value)
    C.main()
    out = capsys.readouterr().out
    assert "[2026-2027] ALEVIN - 1 sin escudo" in out and "[2025-2026] ALEVIN - 1 sin escudo" in out
    assert "'Gáldar'" in out


def test_archiving_a_season_with_alevin_keeps_the_integrity_test_green(tmp_path, monkeypatch):
    """La «trampa del verano de 2027»: al activar 2027-28, 2026-27 pasa al archivo con sus grupos
    alevín. test_per_season_files_match_db_codes compara los códigos de la base con los de los
    ficheros de la temporada: tiene que contar también data-season-<S>-alevin.js, o el bot dejaría
    de publicar ese día."""
    from scripts.tests import test_data_integrity as T
    db, root = site(tmp_path)
    conn = sqlite3.connect(db)
    conn.execute("UPDATE seasons SET is_current=0")
    conn.execute("INSERT INTO seasons(id,name,start_year,end_year,is_current) VALUES (3,'2027-2028',2027,2028,1)")
    conn.commit()
    conn.close()
    files = generate(monkeypatch, db, root)
    assert "data-season-2026-2027-alevin.js" in files and "data-season-2025-2026-alevin.js" in files
    monkeypatch.setattr(T, "ROOT", str(root))
    monkeypatch.setattr(T, "DB_PATH", str(db))
    T.TestGeneratedFiles().test_per_season_files_match_db_codes()
    T.TestGeneratedFiles().test_standings_canonical_format()
    T.TestHistoricalMatchRows().test_every_historical_row_has_eight_columns()
    T.TestHistoricalMatchRows().test_time_and_venue_counts_match_db()
    # Y sin el fichero de alevín, la prueba lo ve.
    (root / "data-season-2026-2027-alevin.js").unlink()
    with pytest.raises(AssertionError, match="AL1"):
        T.TestGeneratedFiles().test_per_season_files_match_db_codes()


@pytest.mark.parametrize("code, phase, league", [
    ("AL1", "Primera Fase GC", True), ("ALF2", "Segunda Fase F", True), ("F1", "Segunda Fase F", True),
    ("ALEL1", "Eliminatorias", False), ("EL1", "Eliminatorias", False), ("PEL1", "Eliminatorias", False),
    ("ALCC1", "Copa de Campeones", False), ("ALCCA1", "Copa de Campeones A", False),
    ("ALCL1", "Clausura Alevín", False),
])
def test_cups_and_eliminatorias_never_get_a_recomputed_league_table(code, phase, league):
    """Las eliminatorias (fase «Eliminatorias») son copa, como en la web (isCupGroup): su
    clasificación no se recalcula como una liga."""
    import generate_js
    assert generate_js._is_league_group(code, phase) is league
