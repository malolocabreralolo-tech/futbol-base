"""La Maspalomas Cup (torneo de verano, no de la federación) también en la base (2026-10)."""
import shutil
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import import_torneos as T

RAW = ROOT / "scripts" / "maspalomas_cup_2026_raw.json"


def test_todos_los_partidos_con_su_fase_grupo_o_ronda(tmp_path):
    shutil.copy(RAW, tmp_path / RAW.name)
    conn = sqlite3.connect(":memory:")
    rep = T.import_changed_torneos(conn, folder=str(tmp_path), log=lambda *a: None)[RAW.name]
    assert rep["matches"] == 464
    by_cat = dict((c, (n, ph)) for c, n, ph in conn.execute(
        "SELECT category, count(*), count(phase) FROM tournament_matches GROUP BY category"))
    # Benjamín y prebenjamín, todos colocados; alevín (que la web no enseña) entra sin estructura.
    assert by_cat["Benjamín"] == (168, 168) and by_cat["Prebenjamín"] == (58, 58)
    assert by_cat["Alevín"][0] == 238
    final = conn.execute("""SELECT home, away, home_score, away_score, penalty_winner FROM tournament_matches
                            WHERE category='Benjamín' AND phase='Copa Oro' AND round='Final'""").fetchone()
    assert final == ("AD Huracán A", "UD Vecindario A", 2, 2, "away")
    assert conn.execute("SELECT count(*) FROM tournament_standings").fetchone()[0] == 92
    assert conn.execute("SELECT first_day, last_day FROM tournaments").fetchone() == ("2026-06-23", "2026-06-27")
    # Sin cambios, nada.
    assert T.import_changed_torneos(conn, folder=str(tmp_path), log=lambda *a: None) == {}
