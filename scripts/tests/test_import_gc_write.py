"""TDD — `write_group` de import_fiflp_gc contra una base de verdad.

Es el único camino del proyecto que REEMPLAZA la clasificación oficial de un
grupo que ya existe (DELETE + INSERT), y el escenario que la memoria marca como
el más caro: sustituir datos autoritativos por otros peores. El guard que lo
protege solo cuenta partidos jugados, así que conviene fijar por escrito qué
hace con lo demás.
"""
import sqlite3
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import db as DB                                        # noqa: E402
from import_fiflp_gc import write_group, canonical_names, existing_groups  # noqa: E402


@pytest.fixture()
def conn():
    c = sqlite3.connect(":memory:")
    DB.init_db(c)
    c.execute("INSERT INTO seasons (name, start_year, end_year, is_current) "
              "VALUES ('2023-2024', 2023, 2024, 0)")
    c.execute("INSERT INTO categories (name) VALUES ('BENJAMIN')")
    yield c
    c.close()


def _grupo_existente(conn, equipos, jugados=2):
    """Un grupo con clasificación oficial y algunos partidos."""
    cat = conn.execute("SELECT id FROM categories LIMIT 1").fetchone()[0]
    sid = conn.execute("SELECT id FROM seasons LIMIT 1").fetchone()[0]
    gid = DB.get_or_create_group(conn, sid, cat, "GC1", name="Grupo 1")
    ids = {n: DB.get_or_create_team(conn, n) for n in equipos}
    for pos, n in enumerate(equipos, 1):
        conn.execute(
            """INSERT INTO standings (group_id, team_id, position, points, played,
                                      won, drawn, lost, gf, gc, gd)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (gid, ids[n], pos, 30 - pos, 10, 10 - pos, 0, pos, 20, 5, 15))
    for i in range(jugados):
        conn.execute(
            """INSERT INTO matches (group_id, jornada, date, time, home_team_id,
                                    away_team_id, home_score, away_score, venue)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (gid, str(i + 1), "", "", ids[equipos[0]], ids[equipos[1]], 1, 0, ""))
    conn.commit()
    return sid, cat, gid, ids


def _raw(equipos, jornadas):
    return {"standings": [{"team": n, "pos": i + 1, "pts": 9, "j": 3, "g": 3,
                           "e": 0, "p": 0, "gf": 9, "gc": 1, "df": 8}
                          for i, n in enumerate(equipos)],
            "jornadas": jornadas}


class TestWriteGroupPreservaLaIdentidad:
    EQUIPOS = ["Firgas", "Moya", "Teror"]

    def test_writes_the_scraped_calendar_and_table(self, conn):
        sid, cat, gid, _ = _grupo_existente(conn, self.EQUIPOS)
        g = _raw(self.EQUIPOS, [{"num": "1", "matches": [
            {"home": "FIRGAS, C.D.", "away": "MOYA, U.D.", "hs": 2, "as": 1},
            {"home": "TEROR BALOMPIE", "away": "FIRGAS, C.D.", "hs": 0, "as": 3}]}])
        nombres = ["FIRGAS, C.D.", "MOYA, U.D.", "TEROR BALOMPIE"]
        canon = canonical_names(nombres, self.EQUIPOS, self.EQUIPOS)
        write_group(conn, g, sid, "GC1", cat, canon)
        assert conn.execute(
            "SELECT COUNT(*) FROM matches WHERE group_id=?", (gid,)).fetchone()[0] == 2

    def test_keeps_the_names_the_database_already_had(self, conn):
        """Lo importante: no crear clubes nuevos con la grafía de FIFLP."""
        sid, cat, gid, _ = _grupo_existente(conn, self.EQUIPOS)
        antes = {r[0] for r in conn.execute("SELECT name FROM teams")}
        g = _raw(["FIRGAS, C.D.", "MOYA, U.D.", "TEROR BALOMPIE"],
                 [{"num": "1", "matches": [
                     {"home": "FIRGAS, C.D.", "away": "MOYA, U.D.", "hs": 2, "as": 1}]}])
        nombres = ["FIRGAS, C.D.", "MOYA, U.D.", "TEROR BALOMPIE"]
        canon = canonical_names(nombres, self.EQUIPOS, self.EQUIPOS)
        write_group(conn, g, sid, "GC1", cat, canon)
        assert {r[0] for r in conn.execute("SELECT name FROM teams")} == antes

    def test_the_new_table_replaces_the_old_one_row_for_row(self, conn):
        sid, cat, gid, _ = _grupo_existente(conn, self.EQUIPOS)
        g = _raw(self.EQUIPOS[:2], [{"num": "1", "matches": [
            {"home": "Firgas", "away": "Moya", "hs": 1, "as": 1}]}])
        canon = canonical_names(self.EQUIPOS, self.EQUIPOS, self.EQUIPOS)
        write_group(conn, g, sid, "GC1", cat, canon)
        filas = conn.execute(
            "SELECT COUNT(*) FROM standings WHERE group_id=?", (gid,)).fetchone()[0]
        assert filas == 2, "la clasificación escrita es la del scrape, sin restos"

    def test_a_scrape_with_no_table_leaves_the_group_without_standings(self, conn):
        """Documenta el filo del cuchillo: write_group NO decide, escribe.

        Con 0 filas de clasificación en el raw, el grupo se queda sin tabla.
        Quien tiene que evitar llegar aquí es el guard de no-regresión de
        main() (solo escribe si el scrape trae ESTRICTAMENTE más jugados), no
        esta función. Si algún día se llama a write_group desde otro sitio, hay
        que replicar ese guard.
        """
        sid, cat, gid, _ = _grupo_existente(conn, self.EQUIPOS)
        g = {"standings": [], "jornadas": [{"num": "1", "matches": [
            {"home": "Firgas", "away": "Moya", "hs": 1, "as": 0}]}]}
        canon = canonical_names(self.EQUIPOS, self.EQUIPOS, self.EQUIPOS)
        write_group(conn, g, sid, "GC1", cat, canon)
        assert conn.execute(
            "SELECT COUNT(*) FROM standings WHERE group_id=?", (gid,)).fetchone()[0] == 0

    def test_the_bye_never_becomes_a_team_or_a_match(self, conn):
        sid, cat, gid, _ = _grupo_existente(conn, self.EQUIPOS)
        g = _raw(self.EQUIPOS, [{"num": "1", "matches": [
            {"home": "Firgas", "away": "Moya", "hs": 2, "as": 1},
            {"home": "Teror", "away": "Descansa", "hs": None, "as": None}]}])
        canon = canonical_names(self.EQUIPOS + ["Descansa"], self.EQUIPOS, self.EQUIPOS)
        write_group(conn, g, sid, "GC1", cat, canon)
        assert conn.execute(
            "SELECT COUNT(*) FROM matches WHERE group_id=?", (gid,)).fetchone()[0] == 1
        assert not conn.execute(
            "SELECT 1 FROM teams WHERE name LIKE '%escans%'").fetchone()

    def test_existing_groups_reads_squad_and_calendar(self, conn):
        sid, cat, gid, _ = _grupo_existente(conn, self.EQUIPOS)
        info = existing_groups(conn, sid)["GC1"]
        assert set(info["teams"]) == set(self.EQUIPOS)
        assert info["played"] == 2
        assert info["pairs"] == {frozenset(("Firgas", "Moya"))}
