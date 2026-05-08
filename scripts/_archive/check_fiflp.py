#!/usr/bin/env python3
"""
check_fiflp.py — verifica que fiflp_raw.json tiene datos útiles.
Sale con error si no hay nada, para abortar el workflow.
"""
import json, os, sys

RAW_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fiflp_raw.json")

if not os.path.exists(RAW_PATH):
    print("ERROR: fiflp_raw.json no encontrado")
    sys.exit(1)

with open(RAW_PATH, encoding="utf-8") as f:
    data = json.load(f)

groups  = len(data)
teams   = sum(len(g["standings"]) for g in data)
matches = sum(len(j["matches"]) for g in data for j in g["jornadas"])
played  = sum(1 for g in data for j in g["jornadas"] for m in j["matches"] if m["hs"] is not None)

print(f"grupos={groups} equipos={teams} partidos={matches} jugados={played}")

if groups == 0:
    print("ERROR: Sin datos — probablemente bloqueo de IP en FIFLP. Abortando.")
    sys.exit(1)

print("OK")
