#!/usr/bin/env python3
"""
DB sanity tests — regressions for the 2026-06-11 data cleanup:
  (a) no score > 50 (parser once captured DOM ids like 41736 as away_score)
  (b) no duplicate matches per group once the jornada label is normalized
      ('Jornada 5' vs '5' — double import of FF1-FF23 in 2025-2026)
  (c) no team-against-itself matches (STEAUA vs STEAUA, id=724079)
  (d) no duplicate cod_acta across matches
  (e) referential integrity (PRAGMA foreign_key_check comes back empty)

Run: python3 -m pytest scripts/tests/test_db_sanity.py -v
"""

import os
import sqlite3

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(ROOT, "futbolbase.db")

MAX_SANE_SCORE = 50


@pytest.fixture(scope="module")
def conn():
    if not os.path.exists(DB_PATH):
        pytest.skip("futbolbase.db not present")
    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA foreign_keys=ON")
    yield con
    con.close()


def test_no_absurd_scores(conn):
    """(a) No home/away score above MAX_SANE_SCORE (legit max in DB is 41)."""
    rows = conn.execute(
        """SELECT m.id, m.home_score, m.away_score
           FROM matches m
           WHERE m.home_score > ? OR m.away_score > ?""",
        (MAX_SANE_SCORE, MAX_SANE_SCORE),
    ).fetchall()
    assert rows == [], (
        f"{len(rows)} matches with score > {MAX_SANE_SCORE} "
        f"(corrupt parser output): {rows[:10]}"
    )


def test_no_duplicate_matches_normalized_jornada(conn):
    """(b) No two matches in the same group with the same home/away pair once
    the jornada label is normalized ('Jornada N' -> 'N')."""
    rows = conn.execute(
        """SELECT group_id,
                  TRIM(REPLACE(jornada, 'Jornada ', '')) AS jnorm,
                  home_team_id, away_team_id, COUNT(*) AS n
           FROM matches
           GROUP BY group_id, jnorm, home_team_id, away_team_id
           HAVING n > 1"""
    ).fetchall()
    assert rows == [], (
        f"{len(rows)} duplicated (group, jornada, home, away) tuples "
        f"after normalizing jornada label: {rows[:10]}"
    )


def test_no_self_matches(conn):
    """(c) No match where a team plays against itself."""
    rows = conn.execute(
        "SELECT id, group_id, home_team_id FROM matches WHERE home_team_id = away_team_id"
    ).fetchall()
    assert rows == [], f"team-against-itself matches found: {rows}"


def test_no_duplicate_cod_acta(conn):
    """(d) Each acta code is attached to at most one match."""
    rows = conn.execute(
        """SELECT cod_acta, COUNT(*) AS n FROM matches
           WHERE cod_acta IS NOT NULL
           GROUP BY cod_acta HAVING n > 1"""
    ).fetchall()
    assert rows == [], f"cod_acta values shared by several matches: {rows[:10]}"


def test_foreign_key_integrity(conn):
    """(e) PRAGMA foreign_key_check returns no violations."""
    rows = conn.execute("PRAGMA foreign_key_check").fetchall()
    assert rows == [], f"foreign key violations: {rows[:10]}"


def test_no_duplicate_groups(conn):
    """(f) Ningún grupo repite el calendario de otro de su misma temporada.

    Los slugs de futbolaspalmas se renumeran entre snapshots del archivo, así
    que el mismo grupo puede llegar dos veces con códigos distintos. Pasó en
    2021-22: GC7 era GC5 con menos resultados y PGC3 era PGC2 clavado. Un
    grupo fantasma duplica sus partidos en los recuentos, mete una fase que no
    existió en el selector y aparece en la web como una liga más.

    Se compara el CALENDARIO (jornada + local + visitante), no la plantilla:
    una copa la juegan los mismos equipos de su liga y sería un falso positivo.
    """
    fixtures = {}
    for gid, code, season in conn.execute(
            """SELECT g.id, g.code, s.name FROM groups g
               JOIN seasons s ON s.id=g.season_id"""):
        rows = conn.execute(
            """SELECT jornada, home_team_id, away_team_id FROM matches
               WHERE group_id=?""", (gid,)).fetchall()
        if len(rows) >= 10:
            fixtures[(season, code)] = set(rows)

    duplicados = []
    claves = sorted(fixtures)
    for i, a in enumerate(claves):
        for b in claves[i + 1:]:
            if a[0] != b[0]:                       # distinta temporada
                continue
            comun = len(fixtures[a] & fixtures[b])
            if comun and comun / min(len(fixtures[a]), len(fixtures[b])) >= 0.9:
                duplicados.append(f"{a[0]}: {a[1]} ~ {b[1]} ({comun} partidos comunes)")

    assert not duplicados, "Grupos duplicados: " + "; ".join(duplicados)


def test_lineup_keys_point_at_teams_that_played(conn):
    """(g) Las claves de data-lineups-*.js nombran equipos de esa temporada.

    La clave es '<local>|<visitante>|<goles>', así que un nombre desactualizado
    deja el partido sin alineación en el modal, en silencio. Y hay temporadas
    (2022-23, 2024-25) con CERO actas en la base: sus ficheros publicados son de
    una generación anterior y generate_js.py ya no los reescribe, así que un
    renombrado de equipos los deja atrás sin que nada falle. Pasó con la fusión
    de duplicados del 2026-07-26.
    """
    import glob
    import re

    problemas = []
    for ruta in sorted(glob.glob(os.path.join(ROOT, "data-lineups-*.js"))):
        temporada = re.search(r"data-lineups-(\d{4}-\d{4})\.js", ruta).group(1)
        fila = conn.execute("SELECT id FROM seasons WHERE name=?", (temporada,)).fetchone()
        if not fila:
            continue
        vivos = {r[0] for r in conn.execute(
            """SELECT DISTINCT t.name FROM matches m
               JOIN teams t ON t.id IN (m.home_team_id, m.away_team_id)
               JOIN groups g ON g.id=m.group_id WHERE g.season_id=?""", (fila[0],))}
        with open(ruta, encoding="utf-8") as f:
            texto = f.read()
        nombres = {n for par in re.findall(r'"([^"|]+)\|([^"|]+)\|[^"]*"', texto)
                   for n in par}
        muertos = sorted(n for n in nombres if n not in vivos)
        if muertos:
            problemas.append(f"{temporada}: {muertos[:5]}")

    assert not problemas, ("Alineaciones publicadas con equipos que no jugaron "
                           "esa temporada: " + "; ".join(problemas))


def test_island_ids_are_the_ones_the_frontend_knows(conn):
    """(h) La isla de cada grupo usa el identificador que entiende el frontend.

    renderIsla (src/render.js) tiene la lista de islas cableada
    ('grancanaria'/'lanzarote'/'fuerteventura') y descarta lo que no case. Los
    importadores de Wayback escribían 'gran_canaria' con guión bajo, así que 66
    grupos —incluidos los 23 de la Primera Fase de la temporada en curso— no
    aparecían en la sección POR ISLA.
    """
    validas = {"grancanaria", "lanzarote", "fuerteventura"}
    malas = sorted({r[0] for r in conn.execute(
        "SELECT DISTINCT island FROM groups WHERE island IS NOT NULL AND island != ''")
        if r[0] not in validas})
    assert not malas, f"islas que el frontend no conoce: {malas}"
