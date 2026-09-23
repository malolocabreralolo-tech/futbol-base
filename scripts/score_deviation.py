"""Desvío de los marcadores frente a la clasificación oficial.

La clasificación oficial (GF/GC por equipo) no está ofuscada en ninguna fuente,
así que sirve de vara de medir para el calendario: si los goles que suman los
partidos de un equipo no coinciden con los de su fila de la tabla, algún
marcador está mal. Los calendarios importados de FIFLP pierden dígitos al leer
su ofuscación (un 15-0 queda en 5-0); los de futbolaspalmas cuadran.

Solo cuentan los equipos cuyo calendario tiene todos sus partidos (PJ de la
tabla == partidos con marcador): si falta alguno, la diferencia no dice nada.

Uso:
    python3 scripts/score_deviation.py                 # informe por temporada
    python3 scripts/score_deviation.py --write-baseline  # fija la línea base
    python3 scripts/score_deviation.py --write-baseline --allow-increase

La línea base (scripts/tests/fixtures/score_deviation_baseline.json) solo
recoge las temporadas cerradas; el vigilante de test_score_deviation.py falla
si algún grupo se separa más de su clasificación que en ella. Solo puede bajar:
reescribirla con algún grupo peor exige --allow-increase (p. ej., una fusión
que conserva la clave o una corrección que la medida no premia).
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASELINE_PATH = ROOT / "scripts" / "tests" / "fixtures" / "score_deviation_baseline.json"


def team_deviations(conn, group_id, overrides=None):
    """{team_id: desvío} de los equipos con el calendario completo.

    overrides: {match_id: (gl, gv)} para medir cómo quedaría el grupo con otros
    marcadores sin tocar la base.
    """
    overrides = overrides or {}
    oficial = {team: (gf or 0, gc or 0, pj or 0) for team, gf, gc, pj in conn.execute(
        "SELECT team_id, gf, gc, played FROM standings WHERE group_id=?", (group_id,))}
    calendario = {}
    for mid, home, away, hs, as_ in conn.execute(
            "SELECT id, home_team_id, away_team_id, home_score, away_score FROM matches WHERE group_id=?",
            (group_id,)):
        hs, as_ = overrides.get(mid, (hs, as_))
        if hs is None or as_ is None:
            continue
        for team, favor, contra in ((home, hs, as_), (away, as_, hs)):
            fila = calendario.setdefault(team, [0, 0, 0])
            fila[0] += favor
            fila[1] += contra
            fila[2] += 1
    return {team: abs(gf - calendario[team][0]) + abs(gc - calendario[team][1])
            for team, (gf, gc, pj) in oficial.items()
            if pj and team in calendario and calendario[team][2] == pj}


def group_deviation(conn, group_id, overrides=None):
    """{'dev', 'complete', 'teams'} del grupo (ver team_deviations)."""
    teams = conn.execute("SELECT COUNT(*) FROM standings WHERE group_id=?", (group_id,)).fetchone()[0]
    if not teams:
        return {"dev": 0, "complete": 0, "teams": 0}
    per_team = team_deviations(conn, group_id, overrides)
    return {"dev": sum(per_team.values()), "complete": len(per_team), "teams": teams}


def baseline_key(season, category, code):
    return f"{season}|{category}|{code}"


def _groups(conn, closed_only):
    sql = """SELECT g.id, s.name, c.name, g.code FROM groups g
             JOIN seasons s ON s.id = g.season_id
             JOIN categories c ON c.id = g.category_id"""
    if closed_only:
        sql += " WHERE s.is_current = 0"
    return conn.execute(sql + " ORDER BY s.name, c.name, g.code").fetchall()


def closed_season_deviations(conn):
    """{clave: desvío} de todos los grupos con tabla de las temporadas cerradas."""
    out = {}
    for gid, season, category, code in _groups(conn, closed_only=True):
        d = group_deviation(conn, gid)
        if d["teams"]:
            out[baseline_key(season, category, code)] = d["dev"]
    return out


def regressions(baseline, current):
    """[(clave, línea base, ahora)] de los grupos que empeoran.

    Un grupo de la línea base que ya no existe no cuenta. Al bot nunca le
    afecta, porque solo escribe la temporada en curso; una fusión que conserva
    la clave sí puede empeorar un grupo, y eso lo decide el mantenedor."""
    return [(key, base, current[key]) for key, base in sorted(baseline.items())
            if key in current and current[key] > base]


def load_baseline(path=BASELINE_PATH):
    try:
        return json.loads(Path(path).read_text())["groups"]
    except (OSError, ValueError, KeyError):
        return {}


def write_baseline(conn, path=BASELINE_PATH, allow_increase=False):
    devs = closed_season_deviations(conn)
    worse = regressions(load_baseline(path), devs)
    if worse and not allow_increase:
        raise ValueError("la línea base solo puede bajar; empeoran (grupo, antes, ahora): "
                         f"{worse[:10]}. Si es a propósito, usa --allow-increase.")
    Path(path).write_text(json.dumps({
        "version": 1,
        "nota": "Desvío de goles (calendario frente a clasificación oficial) por grupo "
                "de temporadas cerradas. Solo puede bajar; se regenera con "
                "python3 scripts/score_deviation.py --write-baseline.",
        "groups": devs,
    }, ensure_ascii=False, indent=1, sort_keys=True) + "\n")
    return devs


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--write-baseline", action="store_true")
    ap.add_argument("--allow-increase", action="store_true",
                    help="con --write-baseline: acepta grupos que empeoran")
    args = ap.parse_args(argv)
    sys.path.insert(0, str(ROOT / "scripts"))
    from db import get_connection
    conn = get_connection()
    resumen = {}
    for gid, season, category, code in _groups(conn, closed_only=False):
        d = group_deviation(conn, gid)
        if not d["teams"]:
            continue
        r = resumen.setdefault(season, [0, 0, 0])
        r[0] += 1
        r[1] += d["dev"] > 0
        r[2] += d["dev"]
    print("temporada   grupos  con desvío  goles de desvío")
    for season, (n, bad, dev) in sorted(resumen.items()):
        print(f"{season}  {n:6}  {bad:10}  {dev:15}")
    if args.write_baseline:
        devs = write_baseline(conn, allow_increase=args.allow_increase)
        print(f"Línea base escrita: {len(devs)} grupos de temporadas cerradas "
              f"({sum(devs.values())} goles de desvío) → {BASELINE_PATH.relative_to(ROOT)}")
    conn.close()


if __name__ == "__main__":
    main()
