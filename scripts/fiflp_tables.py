"""fiflp_tables.py — La clasificación oficial de la federación y los marcadores de
las actas en un grupo de una temporada pasada, sin que el grupo se aleje nunca
más de su clasificación.

En 2025-26 la clasificación y el calendario de futbolaspalmas fallaban a la
vez en algunos partidos (Barrial–Acodetti B 1-1 en los dos; el acta y la
clasificación de la federación dicen 4-4). Medidos el uno contra el otro
cuadraban, y corregir solo el marcador con el acta «empeoraba» el grupo
(score_deviation). Por eso se decide por grupo entre:
  - dejarlo como está;
  - corregir los marcadores con las actas;
  - poner la clasificación oficial (del raw de goleadores);
  - las dos cosas;
y se queda la opción con menos desvío (group_deviation, la misma medida que la
vigilancia de test_score_deviation.py), con preferencia por lo oficial si
empatan. La oficial solo entra si los partidos jugados de cada equipo son los
mismos que en la guardada (si la federación anuló los de un retirado, no). Nunca una que se aleje más que lo que había: la vigilancia no salta.
Un grupo sin clasificación guardada recibe la oficial siempre. Solo grupos de
liga: las copas tienen su propia tabla (synth_copa_campeones.py) o ninguna.
"""
from score_deviation import group_deviation

PREFERENCE = {"official+fixes": 0, "official": 1, "fixes": 2, "keep": 3}


def official_rows(conn, group_id, entry):
    """Filas de la clasificación oficial con los equipos de la base, o None si
    algún equipo no casa (entonces la tabla no se toca)."""
    from import_fiflp_goleadores import clean_team_name, team_bridge
    standings = entry.get("standings") or []
    if not standings:
        return None
    bridge = team_bridge(conn, group_id, entry)
    rows = []
    for r in standings:
        name = bridge.get(clean_team_name(r.get("team")))
        found = conn.execute("SELECT id FROM teams WHERE name=?", (name,)).fetchone() if name else None
        if not found:
            return None
        gf, gc = r.get("gf"), r.get("gc")
        rows.append((found[0], r.get("pos"), r.get("pts"), r.get("j"), r.get("g"), r.get("e"), r.get("p"),
                     gf, gc, gf - gc if gf is not None and gc is not None else None))
    ids = [r[0] for r in rows]
    return rows if len(ids) == len(set(ids)) else None


def write_table(conn, group_id, rows):
    conn.execute("DELETE FROM standings WHERE group_id=?", (group_id,))
    conn.executemany("""INSERT INTO standings (group_id, team_id, position, points, played, won, drawn, lost,
                        gf, gc, gd) VALUES (?,?,?,?,?,?,?,?,?,?,?)""", [(group_id, *r) for r in rows])


def _deviation_with(conn, group_id, rows, fixes):
    conn.execute("SAVEPOINT tabla_oficial")
    try:
        write_table(conn, group_id, rows)
        return group_deviation(conn, group_id, fixes)["dev"]
    finally:
        conn.execute("ROLLBACK TO tabla_oficial")
        conn.execute("RELEASE tabla_oficial")


def is_league(conn, group_id):
    from generate_js import _is_league_group
    row = conn.execute("SELECT code, phase FROM groups WHERE id=?", (group_id,)).fetchone()
    return bool(row) and _is_league_group(row[0], row[1])


def settle(conn, group_id, fixes, official=None):
    """Aplica la mejor opción para el grupo. fixes: {match_id: (gl, gv)} de actas
    coherentes; official: official_rows(...) o None. Devuelve el nombre de la
    opción ('keep', 'fixes', 'official', 'official+fixes')."""
    if official and not is_league(conn, group_id):
        official = None
    played = dict(conn.execute("SELECT team_id, played FROM standings WHERE group_id=?", (group_id,)).fetchall())
    stored = len(played)
    # Con otros partidos jugados (la federación anula los de un equipo retirado, que siguen en el
    # calendario), la oficial no cuadraría con el calendario aunque la medida, que solo cuenta los
    # equipos con todos sus partidos, no lo viera: no se usa.
    if official and any(r[0] in played and played[r[0]] != r[3] for r in official):
        official = None
    d0 = group_deviation(conn, group_id)["dev"]
    options = [("keep", d0, None, {})]
    if fixes:
        options.append(("fixes", group_deviation(conn, group_id, fixes)["dev"], None, fixes))
    if official:
        options.append(("official", _deviation_with(conn, group_id, official, {}), official, {}))
        if fixes:
            options.append(("official+fixes", _deviation_with(conn, group_id, official, fixes), official, fixes))
    if official and not stored:
        # Sin tabla guardada no hay nada que empeorar: la oficial, con las actas si acercan.
        options = [o for o in options if o[2] is not None]
    name, _, rows, chosen = min(options, key=lambda o: (o[1], PREFERENCE[o[0]]))
    if rows is not None:
        write_table(conn, group_id, rows)
    for mid, (home, away) in chosen.items():
        conn.execute("UPDATE matches SET home_score=?, away_score=? WHERE id=?", (home, away, mid))
    return name
