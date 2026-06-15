"""TDD — synth_copa_campeones rankea por RONDA ALCANZADA (revisión 2026-06-15 L5).

Un equipo que avanzó por penaltis (empate) tiene 0 victorias igual que el
rival eliminado, y si luego pierde en semis su GD empeora → quedaba POR DEBAJO
del eliminado. Debe rankear por la ronda más profunda alcanzada (semifinalista
> cuartofinalista), luego campeón, luego wins/pts/GD.
"""
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

_SCHEMA = """
CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT UNIQUE, shield_filename TEXT);
CREATE TABLE matches (id INTEGER PRIMARY KEY, group_id INTEGER, jornada TEXT, date TEXT,
  time TEXT, home_team_id INTEGER, away_team_id INTEGER, home_score INTEGER,
  away_score INTEGER, venue TEXT);
CREATE TABLE standings (id INTEGER PRIMARY KEY, group_id INTEGER, team_id INTEGER,
  position INTEGER, points INTEGER, played INTEGER, won INTEGER, drawn INTEGER,
  lost INTEGER, gf INTEGER, gc INTEGER, gd INTEGER);
CREATE TABLE groups (id INTEGER PRIMARY KEY, code TEXT, current_jornada TEXT);
"""


def _conn():
    c = sqlite3.connect(":memory:")
    c.executescript(_SCHEMA)
    # 4-team bracket: Cuartos (A-B pen draw, C-D), Semis (B-C), Final (C-?)
    # B advances past A on penalties, reaches semis, loses to C.
    teams = ["A", "B", "C", "D", "CHAMP"]
    for i, t in enumerate(teams, 1):
        c.execute("INSERT INTO teams (id,name) VALUES (?,?)", (i, t))
    c.execute("INSERT INTO groups (id,code) VALUES (1,'BCA1')")
    tid = {t: i for i, t in enumerate(teams, 1)}

    def m(jor, h, a, hs, as_):
        c.execute("INSERT INTO matches (group_id,jornada,home_team_id,away_team_id,home_score,away_score) "
                  "VALUES (1,?,?,?,?,?)", (jor, tid[h], tid[a], hs, as_))
    # Cuartos
    m("06-06 ( Cuartos )", "A", "B", 1, 1)   # B avanza por penaltis
    m("06-06 ( Cuartos )", "C", "D", 3, 0)
    # Semifinales
    m("06-06 ( Semifinales )", "B", "C", 0, 2)   # C avanza, B eliminado en semis
    m("06-06 ( Semifinales )", "CHAMP", "D", 5, 0)  # (D vuelve por relleno; CHAMP a la final)
    # Final
    m("06-06 ( Final )", "C", "CHAMP", 0, 1)   # CHAMP campeón
    c.commit()
    return c


def test_advancer_outranks_eliminated_via_round_reached():
    from synth_copa_campeones import synth_group
    c = _conn()
    synth_group(c, 1, "BCA1")
    rows = c.execute("SELECT t.name, st.position FROM standings st JOIN teams t ON st.team_id=t.id "
                     "WHERE st.group_id=1 ORDER BY st.position").fetchall()
    pos = {name: p for name, p in rows}
    # CHAMP campeón (final winner); C runner-up (final loser)
    assert pos["CHAMP"] == 1, rows
    assert pos["C"] == 2, rows
    # B (llegó a semis por penaltis) debe ir POR ENCIMA de A (eliminado en cuartos)
    assert pos["B"] < pos["A"], f"B (semifinalista) debe rankear sobre A (cuartos); {rows}"


def test_champion_is_final_winner():
    from synth_copa_campeones import synth_group
    c = _conn()
    champ = synth_group(c, 1, "BCA1")
    assert champ == "CHAMP"
