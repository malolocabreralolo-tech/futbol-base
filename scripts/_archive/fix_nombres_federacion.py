#!/usr/bin/env python3
"""Fixer one-shot: los equipos que siguen con el nombre de la federación
('DANIEL CARNEVALI, C.D. "A"', 'VILLA DE SANTA BRIGIDA, U.D "B"') pasan al del
portal ('Carnevali', 'Santa Brígida B') o, si el club no tiene otro, a uno con
forma de portal ('El Cotillo', 'Herbania B').

La tabla NOMBRES está revisada a mano, equipo a equipo, con la prueba de las
alineaciones: los niños (fiflp_id) del equipo de la federación juegan en otras
temporadas en el equipo del portal (p. ej. 27 de los 34 de 'VILLA DE SANTA
BRIGIDA, U.D. "A"' en 'Santa Brígida'). Cada entrada es (nombre bueno, nombre de
reserva): si el bueno ya es de otro equipo, se funden; si no, se renombra. No se
funden nunca (y entonces se usa el de reserva, o se deja como está):
  - dos equipos que han coincidido en un grupo (son dos equipos distintos);
  - dos equipos de la misma temporada, categoría y fase ('Roque Amagro' en P1 y
    'ROQUE AMAGRO-CLARAVISION, C.D.' en P2 son dos equipos del mismo club);
  - dos equipos de islas distintas.
Los nombres del portal que usa la temporada en curso no se tocan (el bot los
lee del portal cada día). Después: el escudo pasa al nombre nuevo
(data-shields.js y teams.shield_filename) y se borran las filas de equipos sin
ningún partido, clasificación, goleador ni acta.

    python3 scripts/_archive/fix_nombres_federacion.py            # informe
    python3 scripts/_archive/fix_nombres_federacion.py --write
"""
import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
sys.path.insert(0, os.path.join(ROOT, "scripts", "_archive"))
from db import get_connection                       # noqa: E402
from fix_nombres_fiflp import fundir, REFERENCIAS   # noqa: E402
from activate_season import _portal_style           # noqa: E402

SHIELDS_PATH = os.path.join(ROOT, "data-shields.js")
from fiflp_names import FED_NAMES_PATH, fed_alias   # noqa: E402

NOMBRES = {
    # ── Gran Canaria
    'ALMENARA, U.D.': ('Almenara', None),
    'AREGRANCA REHOYAS, C.D.': ('Aregranca', 'Aregranca Rehoyas'),
    'ATLETICO ANGOSTURA': ('Atl. Angostura', 'Atlético Angostura'),
    # El Atlético Gran Canaria: el portal lo llama 'Atlético' (la temporada en curso y las archivadas) y
    # 'Gran Canaria' (2021-2026), con los mismos niños; sus filiales van con el nombre de ahora.
    'ATLETICO G.C., C.F. "B"': ('Atlético B', 'Atlético Gran Canaria B'),
    'ATLETICO G.C., C.F. "C"': ('Atlético C', 'Atlético Gran Canaria C'),
    'AVIA CAR SAN FERNANDO': ('San Fernando', 'Avia Car San Fernando'),
    'AVIA CAR SAN FERNANDO "B"': ('San Fernando B', 'Avia Car San Fernando B'),
    'BAÑADEROS, C.D. UNION COSTA "A"': ('Bañaderos', 'Unión Costa Bañaderos'),
    'BAÑADEROS, C.D. UNION COSTA "B"': ('Bañaderos B', 'Unión Costa Bañaderos B'),
    'CERRUDA SANTA LUCIA DE TIRAJANA A, C.D. "A"': ('CD Cerruda', 'Cerruda'),
    'CERRUDA SANTA LUCIA DE TIRAJANA, C.D.': ('CD Cerruda', 'Cerruda'),
    'CERRUDA SANTA LUCIA DE TIRAJANA, C.D. "A"': ('CD Cerruda', 'Cerruda'),
    'CERRUDA SANTA LUCIA DE TIRAJANA, C.D. "B"': ('Cerruda B', None),
    'CLARAVISION-ROQUE AMAGRO, C.D.': ('Roque Amagro', 'Roque Amagro Claravisión'),
    'ROQUE AMAGRO-ALUVIDRIO, C.D.': ('Roque Amagro', 'Roque Amagro Aluvidrio'),
    'ROQUE AMAGRO-CLARAVISION, C.D.': ('Roque Amagro', 'Roque Amagro Claravisión'),
    'COSTA AYALA, UNION JUVENIL': ('Costa Ayala', 'Unión Juvenil Costa Ayala'),
    'DANIEL CARNEVALI, C.D. "A"': ('Carnevali', 'Daniel Carnevali'),
    'DANIEL CARNEVALI, C.D. "B"': ('Carnevali B', 'Daniel Carnevali B'),
    'GALDARCLUBS JACOBEO 21-22, C.D.': ('Gáldar CF', 'Galdarclubs Jacobeo'),
    'GUINIGUADA APOLINARIO, C.D. "A"': ('Guiniguada', 'Guiniguada Apolinario'),
    'GUINIGUADA APOLINARIO, C.D. "B"': ('Guiniguada B', 'Guiniguada Apolinario B'),
    'INTER DEL PILAR C.F. "B"': ('Inter Pilar B', None),
    'JOVERO-LAS ROSAS, C.D.': ('Las Rosas', 'Jovero-Las Rosas'),
    'JOVERO-LAS ROSAS, C.D. "A"': ('Las Rosas', 'Jovero-Las Rosas'),
    'LA UNION DE VECINDARIO': ('UD Vecindario', 'La Unión de Vecindario'),
    'LA UNION DE VECINDARIO "B"': ('Vecindario B', 'La Unión de Vecindario B'),
    'LA UNION DE VECINDARIO "C"': ('Vecindario C', 'La Unión de Vecindario C'),
    'MAJORERAS-GUAYADEQUE, C.F. LAS': ('Las Majoreras', 'Las Majoreras-Guayadeque'),
    'MARZASPORT, ATLETICO': ('Atco. Marzasport', 'Atlético Marzasport'),
    'PANADERIA PULIDO SAN MATEO, C.F.': ('San Mateo', 'Panadería Pulido San Mateo'),
    'PLAYA DEL HOMBRE, C.D.': ('Playa D.H.', 'Playa del Hombre'),
    'SAN JOSE, REAL SPORTING': ('Real Sporting', 'Real Sporting San José'),
    'SAN JUAN TRES PALMAS, C.D.': ('San Juan', 'San Juan Tres Palmas'),
    'SAN PEDRO MARTIR, C.D.': ('San Pedro', 'San Pedro Mártir'),
    'SAN PEDRO MARTIR, C.D. "A"': ('San Pedro', 'San Pedro Mártir'),
    'SAN PEDRO MARTIR, C.D. "B"': ('San Pedro B', 'San Pedro Mártir B'),
    'SANTIDAD BANOT, C.D.': ('Santidad', 'Santidad Banot'),
    'VETERANOS DEL PILA, C.D.': ('Veteranos', 'Veteranos del Pila'),
    'VETERANOS DEL PILA., C.D. "A"': ('Veteranos', 'Veteranos del Pila'),
    'VETERANOS DEL PILA, C.D. "B"': ('Veteranos B', 'Veteranos del Pila B'),
    'VETERANOS DEL PILA, C.D. "C"': ('Veteranos C', 'Veteranos del Pila C'),
    'VETERANOS DEL PILA SAGRADO CORAZON C, C.D. "C"': ('Veteranos C', 'Veteranos del Pila C'),
    'VETERANOS DEL PILA SAGRADO CORAZON, C.D. "C"': ('Veteranos C', 'Veteranos del Pila C'),
    'VICTORIA, REAL CLUB': ('Victoria', 'Real Club Victoria'),
    'VILLA DE SANTA BRIGIDA, U.D. "A"': ('Santa Brígida', 'Villa de Santa Brígida'),
    'VILLA DE SANTA BRIGIDA, U.D "B"': ('Santa Brígida B', 'Villa de Santa Brígida B'),
    # ── Fuerteventura
    'ATISACHI DE FUERTEVENTURA C.F., C.D.': ('Atisachi FTV', 'Atisachi de Fuerteventura'),
    'ATISACHI DE FUERTEVENTURA C.F., C.D. "A"': ('Atisachi FTV', 'Atisachi de Fuerteventura'),
    'ATISACHI DE FUERTEVENTURA C.F., C.D. "B"': ('Atisachi FTV B', 'Atisachi de Fuerteventura B'),
    'BALOMPEDICA ISLA TRANQUILA, C.D. ATLETICO': ('Balompédica', 'Atlético Balompédica Isla Tranquila'),
    'BALOMPEDICA ISLA TRANQUILA, C.D. ATLETICO "A"': ('Balompédica', 'Atlético Balompédica Isla Tranquila'),
    'BALOMPEDICA ISLA TRANQUILA A, C.D. ATLETICO "A"': ('Balompédica', 'Atlético Balompédica Isla Tranquila'),
    'BALOMPEDICA ISLA TRANQUILA, C.D. ATLETICO "B"': ('Balompédica B', 'Atlético Balompédica Isla Tranquila B'),
    'CORRALEJO B, C.D. "B"': ('Corralejo B', None),
    'CORRALEJO, C.D. "B"': ('Corralejo B', None),
    'CORRALEJO, C.D. "C"': ('Corralejo C', None),
    'COTILLO, C.D. EL': ('El Cotillo', None),
    'EUROPEAN F.U., CD': ('European FU', 'European'),
    'GRAN TARAJAL SOC. TAMAS., U.D.': ('Gran Tarajal', None),
    'HENEQUEN FUE. F.C., C.D.': ('Henequén FTV', None),
    'Henequen Fue. B': ('Henequén FTV B', None),        # el filial que inventó pretty_name (2017-2019)
    'HERBANIA B, C.D. "B"': ('Herbania B', None),
    'HERBANIA, C.D. "B"': ('Herbania B', None),
    'HERBANIA, C.D. "C"': ('Herbania C', None),
    'INTER FUERTEVENTURA, C.D.': ('Inter FTV', 'Inter Fuerteventura'),
    'JANDIA, U.D. "B"': ('Jandía B', None),
    'LA CUADRA-UNION PUERTO DEL ROSARIO, C.D.': ('La Cuadra', None),
    'PEÑA DE LA AMISTAD B, C.D. "B"': ('Peña B', 'Peña de La Amistad B'),
    'PLAYAS DE SOTAVENTO A, U.D "A"': ('UD Sotavento', 'Playas de Sotavento'),
    'PLAYAS DE SOTAVENTO, U.D. "A"': ('UD Sotavento', 'Playas de Sotavento'),
    'Playas de Sotavento': ('UD Sotavento', None),
    'PLAYAS DE SOTAVENTO B, U.D. "B"': ('Sotavento B', 'Playas de Sotavento B'),
    'PLAYAS DE SOTAVENTO, U.D. "B"': ('Sotavento B', 'Playas de Sotavento B'),
    'STEAUA DE TIRAJANA CLUB DEPORTIVO': ('Steaua de Tirajana', None),
    'STEAUA DE TIRAJANA CLUB DEPORTIVO ?A?': ('Steaua de Tirajana', None),
    'TAMARAGUA, C.D.': ('Tamaragua', None),
    'TAMASITE, C.D. "B"': ('CD Tamasite B', None),
    'TARAJALEJO B, U.D. "B"': ('UD Tarajalejo B', None),
    'TISCAMANITA, C.F.': ('Tiscamanita', None),
    'VILLAVERDE NORTE, S.D.': ('Villaverde', 'Villaverde Norte'),
    'VILLAVERDE NORTE, S.D. "A"': ('Villaverde', 'Villaverde Norte'),
    'VILLAVERDE NORTE, S.D. "B"': ('Villaverde B', 'Villaverde Norte B'),
    # ── Lanzarote
    'ALTAVISTA C.F.': ('Altavista', None),
    'ESTEFUT, C.D.': ('Estefut', None),
    'FUTBOL P.D.C. 2016 A, C.D. "A"': ('Fútbol PDC 2016', None),
    'FUTBOL P.D.C. 2016, C.D.': ('Fútbol PDC 2016', None),
    'INTERNACIONAL PH "B"': ('Internacional B', 'Internacional PH B'),
    'INTERNACIONAL PH B "B"': ('Internacional B', 'Internacional PH B'),
    'INTERNACIONAL PH "C"': ('Internacional C', 'Internacional PH C'),
    'INTERNACIONAL PH C "C"': ('Internacional C', 'Internacional PH C'),
    'INTERNACIONAL PH "D"': ('Internacional D', 'Internacional PH D'),
    'INTERNACIONAL PH D "DB"': ('Internacional D', 'Internacional PH D'),
    # Sus niños juegan después en 'O. Marítima', pero el nombre es el de otro club: se queda aparte.
    'JUVENTUD MARITIMA A, C.D. "A"': ('Juventud Marítima', None),
    'JUVENTUD MARITIMA, C.D. "A"': ('Juventud Marítima', None),
    'ORIENTACION MARITIMA, C.D. "A"': ('O. Marítima', 'Orientación Marítima'),
    'Orientacion Marítima': ('O. Marítima', 'Orientación Marítima'),
    'ORIENTACION MARITIMA B, C.D. "B"': ('O. Marítima B', 'Orientación Marítima B'),
    'ORIENTACION MARITIMA, C.D. "B"': ('O. Marítima B', 'Orientación Marítima B'),
    'ORIENTACION MARITIMA C, C.D "C"': ('O. Marítima C', 'Orientación Marítima C'),
    'ORIENTACION MARITIMA, C.D "C"': ('O. Marítima C', 'Orientación Marítima C'),
    'PALMEIROS DE COSTA T., U.D.': ('UD Palmeiros', 'Palmeiros de Costa Teguise'),
    'PALMEIROS DE COSTA T A., U.D. "A"': ('UD Palmeiros', 'Palmeiros de Costa Teguise'),
    'PALMEIROS DE COSTA T., U.D. "A"': ('UD Palmeiros', 'Palmeiros de Costa Teguise'),
    'PALMEIROS DE COSTA T , U.D. "B"': ('Palmeiros B', 'Palmeiros de Costa Teguise B'),
    'PALMEIROS DE COSTA T B., U.D. "B"': ('Palmeiros B', 'Palmeiros de Costa Teguise B'),
    'PUERTO DEL CARMEN A, F.C. "A"': ('Puerto del Carmen', None),
    'SAN BARTOLOME D, C.F "DB"': ('San Bartolomé D', None),
    'SPORTING TIAS C, C.F. "C"': ('Sporting C', 'Sporting Tías C'),
    'SPORTING TIAS, C.F. "C"': ('Sporting C', 'Sporting Tías C'),
    'UNION SUR YAIZA A, C.D. "A"': ('Unión Sur Yaiza', None),
    'LANZAROTE, U.D. "A"': ('UD Lanzarote', None),
    'VALTERRA, U.D.': ('Valterra', None),
}


def team_id(conn, name):
    row = conn.execute("SELECT id FROM teams WHERE name=?", (name,)).fetchone()
    return row[0] if row else None


def _phase(phase):
    """La fase sin la letra de su nivel: 'Segunda Fase B GC' y 'Segunda Fase E GC' son la misma."""
    return " ".join(w for w in (phase or "").split() if not re.fullmatch(r"[A-H]", w))


def presence(conn, tid):
    """(grupos, {(temporada, categoría, fase)}, islas) donde juega el equipo."""
    rows = conn.execute("""
        SELECT DISTINCT g.id, g.season_id, g.category_id, g.phase, g.island FROM groups g
         WHERE g.id IN (SELECT group_id FROM standings WHERE team_id=:t
                        UNION SELECT group_id FROM matches WHERE home_team_id=:t OR away_team_id=:t
                        UNION SELECT group_id FROM scorers WHERE team_id=:t)""", {"t": tid}).fetchall()
    return ({r[0] for r in rows}, {(r[1], r[2], _phase(r[3])) for r in rows},
            # Los torneos de cierre juntan islas: su isla no es la del equipo.
            {r[4] for r in rows if r[4] and not (r[3] or "").startswith("Torneo")})


def why_not(conn, a, b):
    """Por qué no se pueden fundir los equipos a y b (None si se puede)."""
    ga, pa, ia = presence(conn, a)
    gb, pb, ib = presence(conn, b)
    if ga & gb:
        return "han coincidido en un grupo"
    if pa & pb:
        return "juegan la misma fase de una temporada"
    if ia and ib and not ia & ib:
        return "son de islas distintas"
    return None


def current_names(conn):
    top = conn.execute("SELECT max(start_year) FROM seasons").fetchone()[0]
    return {r[0] for r in conn.execute("""
        SELECT DISTINCT t.name FROM teams t JOIN standings st ON st.team_id=t.id
          JOIN groups g ON g.id=st.group_id JOIN seasons s ON s.id=g.season_id WHERE s.start_year=?""", (top,))}


def move(conn, old_id, target, log):
    """Funde old_id en el equipo `target` o lo renombra a `target`. Devuelve
    'fundido', 'renombrado' o el motivo por el que no se puede."""
    tid = team_id(conn, target)
    if tid is None:
        conn.execute("UPDATE teams SET name=? WHERE id=?", (target, old_id))
        return "renombrado"
    if tid == old_id:
        return "renombrado"
    reason = why_not(conn, old_id, tid)
    if reason:
        return reason
    shield = conn.execute("SELECT shield_filename FROM teams WHERE id=?", (old_id,)).fetchone()[0]
    fundir(conn, old_id, tid)
    if shield:
        conn.execute("UPDATE teams SET shield_filename=? WHERE id=? AND shield_filename IS NULL", (shield, tid))
    return "fundido"


def load_shields():
    with open(SHIELDS_PATH, encoding="utf-8") as f:
        return json.loads(re.search(r"const SHIELDS=(\{.*?\});", f.read(), re.S).group(1))


def save_shields(shields):
    with open(SHIELDS_PATH, "w", encoding="utf-8") as f:
        f.write("const SHIELDS=" + json.dumps(shields, ensure_ascii=False, separators=(",", ":")) + ";\n")


def unused_teams(conn):
    refs = " AND ".join(f"NOT EXISTS (SELECT 1 FROM {t} WHERE {c}=teams.id)" for t, c in REFERENCIAS)
    return conn.execute(f"SELECT id, name FROM teams WHERE {refs}").fetchall()


def run(conn, shields, log=print):
    """Aplica NOMBRES sobre la conexión (sin commit) y sobre `shields`. Devuelve el informe."""
    report = {"fundido": [], "renombrado": [], "sin_tocar": [], "borrados": []}
    current = current_names(conn)
    for raw, (good, spare) in NOMBRES.items():
        old_id = team_id(conn, raw)
        if old_id is None:
            continue
        if raw in current:
            report["sin_tocar"].append((raw, "lo usa la temporada en curso"))
            continue
        done, target = None, None
        for target in (good, spare):
            if not target:
                continue
            done = move(conn, old_id, target, log)
            if done in ("fundido", "renombrado"):
                break
            log(f"  · {raw!r} → {target!r}: no, {done}")
        if done not in ("fundido", "renombrado"):
            report["sin_tocar"].append((raw, done))
            continue
        report[done].append((raw, target))
        if raw in shields:
            shields.setdefault(target, shields[raw])
            del shields[raw]
    # Filas sin uso: las que dejaron importaciones antiguas con el nombre de la federación.
    for tid, name in unused_teams(conn):
        if not _portal_style(name):
            conn.execute("DELETE FROM teams WHERE id=?", (tid,))
            report["borrados"].append(name)
    return report


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--db", help="otra base (por defecto, la del proyecto)")
    args = ap.parse_args()
    if args.db:
        import sqlite3
        conn = sqlite3.connect(args.db)
    else:
        conn = get_connection()
    conn.execute("PRAGMA foreign_keys=ON")
    shields = load_shields()
    before = conn.execute("SELECT COUNT(*) FROM teams").fetchone()[0]
    report = run(conn, shields)
    for key in ("fundido", "renombrado"):
        print(f"\n{key.upper()} ({len(report[key])})")
        for raw, target in report[key]:
            print(f"  {raw!r} → {target!r}")
    print(f"\nSIN TOCAR ({len(report['sin_tocar'])})")
    for raw, why in report["sin_tocar"]:
        print(f"  {raw!r}: {why}")
    print(f"\nFILAS SIN USO BORRADAS ({len(report['borrados'])}): {report['borrados']}")
    left = [n for (n,) in conn.execute("SELECT name FROM teams") if not _portal_style(n)]
    print(f"\nEquipos {before} → {conn.execute('SELECT COUNT(*) FROM teams').fetchone()[0]}; "
          f"con nombre de la federación: {len(left)} {left}")
    if args.write:
        bad = conn.execute("PRAGMA foreign_key_check").fetchall()
        if bad:
            sys.exit(f"Referencias rotas: {bad[:5]} — no se escribe nada")
        conn.commit()
        save_shields(shields)
        # La tabla que leen los importadores (activate_season.known_names): al rehacer un grupo, el
        # nombre de la federación da el de la base, no otra grafía nueva.
        table = {}
        if os.path.exists(FED_NAMES_PATH):
            with open(FED_NAMES_PATH, encoding="utf-8") as f:
                table = json.load(f)
        table.update({raw: target for key in ("fundido", "renombrado") for raw, target in report[key]})
        with open(FED_NAMES_PATH, "w", encoding="utf-8") as f:
            json.dump(dict(sorted(table.items())), f, ensure_ascii=False, indent=1)
            f.write("\n")
        fed_alias.cache_clear()
        print("Escrito. Regenera con scripts/generate_js.py.")
    else:
        conn.rollback()
        print("\nInforme: nada escrito (repite con --write).")
    conn.close()


if __name__ == "__main__":
    main()
