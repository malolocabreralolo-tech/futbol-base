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
import re
import sqlite3
import sys
from collections import Counter

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(ROOT, "futbolbase.db")
sys.path.insert(0, os.path.join(ROOT, "scripts"))

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


# ─── (k) El mismo grupo sacado de dos fuentes ────────────────────────────────
# test_no_duplicate_groups compara (jornada, local, visitante) con ids de
# equipo, y eso solo caza la copia que llega dos veces de UNA fuente. FIFLP y
# futbolaspalmas escriben los nombres cada una a su manera ('Pto.del Carmen' /
# 'PUERTO DEL CARMEN, F.C. "A"') y la jornada también ('7' / 'Jornada 7'), así
# que entre fuentes se compara lo que las dos comparten: número de jornada,
# fecha ISO y marcador.
MIN_JUGADOS_SOLAPE = 10
MAX_SOLAPE_FUENTES = 0.7


def _jornada_num(label):
    """'Jornada 7' y '7' son la misma jornada; una ronda de copa se queda tal cual."""
    s = (label or "").strip()
    m = re.fullmatch(r"(?:Jornada\s+)?(\d+)", s, re.IGNORECASE)
    return str(int(m.group(1))) if m else s


def _iso_date(raw, start_year, end_year):
    """YYYY-MM-DD, DD-MM-YYYY o DD/MM (año según la temporada) -> ISO; si no, None."""
    s = (raw or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        return s
    m = re.fullmatch(r"(\d{2})-(\d{2})-(\d{4})", s)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    m = re.fullmatch(r"(\d{2})/(\d{2})", s)
    if m:
        year = start_year if int(m.group(2)) >= 7 else end_year
        return f"{year}-{m.group(2)}-{m.group(1)}"
    return None


def _claves_jugadas(con, group_id, start_year, end_year):
    """Multiconjunto (jornada, fecha ISO, gl, gv) de los partidos con fecha y marcador."""
    claves = Counter()
    for jornada, fecha, gl, gv in con.execute(
            """SELECT jornada, date, home_score, away_score FROM matches
               WHERE group_id=? AND home_score IS NOT NULL AND away_score IS NOT NULL""",
            (group_id,)):
        iso = _iso_date(fecha, start_year, end_year)
        if iso:
            claves[(_jornada_num(jornada), iso, gl, gv)] += 1
    return claves


def grupos_repetidos(con):
    """Parejas de grupos de la misma temporada, categoría e isla que comparten al
    menos un 70 % de sus partidos jugados. Solo entran grupos con al menos 10
    partidos con fecha y marcador, y el denominador es el grupo menor.
    Devuelve [(temporada, código_a, código_b, comunes, proporción)]."""
    por_contexto = {}
    for gid, code, season, sy, ey, cat, island in con.execute(
            """SELECT g.id, g.code, s.name, s.start_year, s.end_year, UPPER(c.name),
                      COALESCE(g.island, '')
               FROM groups g JOIN seasons s ON s.id=g.season_id
               JOIN categories c ON c.id=g.category_id
               ORDER BY s.name, g.code"""):
        claves = _claves_jugadas(con, gid, sy, ey)
        if sum(claves.values()) >= MIN_JUGADOS_SOLAPE:
            por_contexto.setdefault((season, cat, island), []).append((code, claves))
    repetidos = []
    for (season, _cat, _island), grupos in sorted(por_contexto.items()):
        for i, (code_a, a) in enumerate(grupos):
            for code_b, b in grupos[i + 1:]:
                comunes = sum((a & b).values())
                ratio = comunes / min(sum(a.values()), sum(b.values()))
                if ratio >= MAX_SOLAPE_FUENTES:
                    repetidos.append((season, code_a, code_b, comunes, round(ratio, 2)))
    return repetidos


def test_no_group_repeats_another_source(conn):
    """(k) Ningún grupo es otro de su misma temporada, categoría e isla sacado de
    otra fuente.

    Pasó en 2025-26 con Lanzarote benjamín: LZ1-4 (futbolaspalmas) y LZS1-4
    (FIFLP) eran la misma liga, la web la publicaba dos veces y STATS sumaba
    los partidos de las dos (CD Tahiche: 36 entradas de pointsHistory para 18
    partidos). Coincidían entre el 73 y el 79 % de los partidos jugados; el
    siguiente par de toda la base se queda en el 13 %.
    """
    repetidos = grupos_repetidos(conn)
    assert not repetidos, "Grupos repetidos entre fuentes: " + "; ".join(
        f"{s}: {a} ~ {b} ({n} partidos comunes, {r:.0%})" for s, a, b, n, r in repetidos)


def test_source_overlap_guard_ignores_plz_2024_25(conn):
    """(k) Negativo real: PLZ1 y PLZ2 de 2024-25 son grupos distintos que
    comparten jornadas y fechas SIN marcador. Contando esas filas, 5 de las 6
    de PLZ2 coinciden con PLZ1 (83 %); el guardián no debe saltar."""
    codigos = {r[0] for r in conn.execute(
        """SELECT g.code FROM groups g JOIN seasons s ON s.id=g.season_id
           WHERE s.name='2024-2025' AND g.code IN ('PLZ1', 'PLZ2')""")}
    assert codigos == {"PLZ1", "PLZ2"}, "faltan PLZ1/PLZ2 de 2024-25 en la base"
    assert not [r for r in grupos_repetidos(conn) if {r[1], r[2]} == {"PLZ1", "PLZ2"}]


def _base_dos_grupos(filas_a, filas_b, isla_b="lanzarote"):
    """Base en memoria con LZ1 y LZS1. Cada fila es (jornada, fecha, gl, gv) y
    cada partido lleva equipos propios, como pasa entre fuentes distintas."""
    import db
    con = sqlite3.connect(":memory:")
    db.init_db(con)
    con.execute("INSERT INTO seasons (id,name,start_year,end_year,is_current) "
                "VALUES (1,'2025-2026',2025,2026,1)")
    con.execute("INSERT INTO categories (id,name) VALUES (1,'BENJAMIN')")
    con.execute("INSERT INTO groups (id,season_id,category_id,code,island) VALUES "
                "(1,1,1,'LZ1','lanzarote'),(2,1,1,'LZS1',?)", (isla_b,))
    for gid, filas in ((1, filas_a), (2, filas_b)):
        for i, (jornada, fecha, gl, gv) in enumerate(filas):
            h = con.execute("INSERT INTO teams (name) VALUES (?)", (f"L{gid}-{i}",)).lastrowid
            a = con.execute("INSERT INTO teams (name) VALUES (?)", (f"V{gid}-{i}",)).lastrowid
            con.execute("INSERT INTO matches (group_id,jornada,date,home_team_id,away_team_id,"
                        "home_score,away_score) VALUES (?,?,?,?,?,?,?)",
                        (gid, jornada, fecha, h, a, gl, gv))
    return con


_FUTBOLASPALMAS = [(f"Jornada {j}", f"2026-02-{j:02d}", j, j % 3) for j in range(1, 13)]
_FIFLP = [(str(j), f"{j:02d}-02-2026", j, j % 3) for j in range(1, 13)]


def test_source_overlap_flags_same_league_from_two_sources():
    con = _base_dos_grupos(_FUTBOLASPALMAS, _FIFLP)
    assert grupos_repetidos(con) == [("2025-2026", "LZ1", "LZS1", 12, 1.0)]


def test_source_overlap_ignores_shared_dates_without_score():
    """Como PLZ1/PLZ2 2024-25: dos grupos distintos (marcadores distintos) que
    comparten 30 jornadas y fechas sin resultado. Contando esas filas saldría
    30/40 = 75 % y el guardián saltaría."""
    jugados_b = [(j, d, gl + 20, gv) for j, d, gl, gv in _FIFLP[:10]]
    pendientes_a = [(f"Jornada {j}", "2026-05-02", None, None) for j in range(13, 43)]
    pendientes_b = [(str(j), "02-05-2026", None, None) for j in range(13, 43)]
    con = _base_dos_grupos(_FUTBOLASPALMAS[:10] + pendientes_a, jugados_b + pendientes_b)
    assert grupos_repetidos(con) == []


def test_source_overlap_needs_ten_played_matches_in_both_groups():
    assert grupos_repetidos(_base_dos_grupos(_FUTBOLASPALMAS, _FIFLP[:9])) == []


def test_source_overlap_only_compares_the_same_island():
    assert grupos_repetidos(_base_dos_grupos(_FUTBOLASPALMAS, _FIFLP, "fuerteventura")) == []


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
        nombres = {n for clave in _lineup_keys(texto)
                   for n in clave.split("|")[:2]}
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


def _lineup_keys(texto):
    """Claves de un data-lineups-*.js, parseando el JSON de verdad.

    Con una regex ingenua se pierden los equipos cuyo nombre lleva comillas
    ('VETERANOS DEL PILA., C.D. "A"'), que son justo los que peor reconcilian.
    """
    import json
    import re as _re
    m = _re.search(r"const LINEUPS_\d{4}_\d{4}\s*=\s*(\{[\s\S]*?\});\s*$", texto.strip())
    return list(json.loads(m.group(1))) if m else []


def _lineup_count(texto):
    """Partidos publicados en un data-lineups-*.js (no claves).

    Desde el Plan A (§9.2) dos partidos con la misma clave `local|visitante|gl-gv`
    salen como {"dup": true, "list": [...]} en vez de pisarse, así que una clave
    repetida vale tantos partidos como su lista.
    """
    import json
    import re as _re
    m = _re.search(r"const LINEUPS_\d{4}_\d{4}\s*=\s*(\{[\s\S]*?\});\s*$", texto.strip())
    if not m:
        return 0
    return sum(len(v["list"]) if v.get("dup") else 1
               for v in json.loads(m.group(1)).values())


def test_lineup_count_counts_every_match_of_a_dup_key():
    """(i) cuenta partidos: una clave repetida no descuadra la comparación."""
    texto = ('// Auto-generated by scripts/generate_js.py — do not edit\n'
             'const LINEUPS_2025_2026 = {"A|B|1-0": {"s": "2025-2026", "gr": "A1"}, '
             '"CD Calero|La Garita|1-11": {"dup": true, "list": ['
             '{"s": "2025-2026", "gr": "PG2"}, {"s": "2025-2026", "gr": "FF15"}]}};\n')
    assert _lineup_keys(texto) == ["A|B|1-0", "CD Calero|La Garita|1-11"]
    assert _lineup_count(texto) == 3


def test_published_lineups_match_the_database(conn):
    """(i) Cada data-lineups-*.js tiene EXACTAMENTE las actas que dice la base.

    Las temporadas 2022-23 y 2024-25 llegaron a tener 0 actas en la base
    mientras el sitio seguía sirviendo ficheros de una generación anterior: la
    'fuente de verdad' no respaldaba lo publicado, así que auditar contra la DB
    daba un falso negativo y cualquier renombrado dejaba atrás los ficheros sin
    que nada fallara. Este test ata las dos cosas.
    """
    import glob
    import re as _re

    descuadres = []
    for ruta in sorted(glob.glob(os.path.join(ROOT, "data-lineups-*.js"))):
        temporada = _re.search(r"data-lineups-(\d{4}-\d{4})\.js", ruta).group(1)
        fila = conn.execute("SELECT id FROM seasons WHERE name=?", (temporada,)).fetchone()
        if not fila:
            continue
        en_db = conn.execute(
            """SELECT COUNT(*) FROM matches m JOIN groups g ON g.id=m.group_id
               WHERE g.season_id=? AND m.cod_acta IS NOT NULL""", (fila[0],)).fetchone()[0]
        with open(ruta, encoding="utf-8") as f:
            publicadas = _lineup_count(f.read())
        if en_db != publicadas:
            descuadres.append(f"{temporada}: base={en_db} publicado={publicadas}")

    assert not descuadres, ("Alineaciones publicadas que la base no respalda: "
                            + "; ".join(descuadres))


def test_standings_and_calendar_name_the_same_teams(conn):
    """(j) Dentro de un grupo, la tabla y el calendario nombran igual.

    FIFLP escribe la letra de filial en la clasificación pero no en el
    calendario ('CORRALEJO B, C.D. "B"' arriba, 'CORRALEJO, C.D. "B"' en los
    partidos), así que el mismo equipo entraba dos veces en el mismo grupo: uno
    con clasificación y sin partidos, otro al revés. En la web ese equipo abre
    su ficha vacía y su columna de forma sale en blanco. Eran 24 grupos.
    """
    problemas = []
    for gid, code, temporada in conn.execute(
            """SELECT g.id, g.code, se.name FROM groups g
                 JOIN seasons se ON se.id=g.season_id"""):
        tabla = {r[0] for r in conn.execute(
            """SELECT t.name FROM standings s JOIN teams t ON t.id=s.team_id
               WHERE s.group_id=?""", (gid,))}
        calendario = {r[0] for r in conn.execute(
            """SELECT DISTINCT t.name FROM matches m
               JOIN teams t ON t.id IN (m.home_team_id, m.away_team_id)
               WHERE m.group_id=?""", (gid,))}
        if not tabla or not calendario:
            continue
        # Un equipo de la tabla sin NINGÚN partido es normal si el archivo está
        # incompleto; lo que no puede pasar es que exista con otro nombre.
        huerfanos = tabla - calendario
        fantasmas = calendario - tabla
        if huerfanos and fantasmas:
            problemas.append(f"{temporada} {code}: tabla-only={sorted(huerfanos)[:2]} "
                             f"calendario-only={sorted(fantasmas)[:2]}")

    assert not problemas, ("Grupos donde tabla y calendario usan nombres "
                           "distintos: " + "; ".join(problemas[:6]))
