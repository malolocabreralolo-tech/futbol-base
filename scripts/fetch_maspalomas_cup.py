#!/usr/bin/env python3
"""
Scraper para Maspalomas Cup - API pública de partidos.
La API está detrás de Vercel Security Checkpoint.
Usa cloudscraper o headers de navegador para pasarla.
"""
import json, os, sys, datetime
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

API_URL = "https://www.maspalomascup.es/api/public/partidos"
OUT_DIR = os.path.dirname(os.path.abspath(__file__)) + "/.."

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
    "Referer": "https://www.maspalomascup.es/calendario",
    "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
}

def fetch_partidos():
    """Fetch all matches from the API using cloudscraper to bypass Vercel Security Checkpoint."""
    import cloudscraper
    s = cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "darwin", "mobile": False}
    )
    try:
        resp = s.get(API_URL, timeout=30)
        if resp.status_code != 200:
            print(f"HTTP {resp.status_code}: {resp.text[:200]}", file=sys.stderr)
            return None
        return resp.json()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return None

def format_for_portal(matches):
    """Convert API matches to the format used by the futbol-base portal."""
    by_cat = {"Prebenjamín": [], "Benjamín": [], "Alevín": []}
    
    for m in matches:
        cat = m.get("categoryName", "")
        if cat not in by_cat:
            continue
        
        entry = {
            "n": m.get("matchNumber"),
            "date": m.get("date"),
            "field": m.get("field"),
            "home": m.get("homeTeamName"),
            "away": m.get("awayTeamName"),
            "hs": m.get("homeScore"),
            "as": m.get("awayScore"),
            "status": m.get("status")
        }
        if m.get("penaltyStatus") and m["penaltyStatus"] != "none":
            entry["pen"] = {
                "s": m["penaltyStatus"],
                "w": m.get("penaltyWinner"),
                "h": m.get("penaltyHomeScore"),
                "a": m.get("penaltyAwayScore")
            }
        by_cat[cat].append(entry)
    
    # Sort by match number
    for cat in by_cat:
        by_cat[cat].sort(key=lambda x: x.get("n", 0))
    
    return by_cat

def main():
    print("Fetching Maspalomas Cup 2026 partidos...")
    data = fetch_partidos()
    
    if not data:
        print("ERROR: No se pudieron obtener los datos.", file=sys.stderr)
        sys.exit(1)
    
    matches = data.get("scheduledMatches", [])
    print(f"Total partidos: {len(matches)}")
    
    # Stats
    by_cat = {}
    by_status = {}
    for m in matches:
        by_cat[m.get("categoryName", "?")] = by_cat.get(m.get("categoryName", "?"), 0) + 1
        by_status[m.get("status", "?")] = by_status.get(m.get("status", "?"), 0) + 1
    
    print(f"Por categoría: {by_cat}")
    print(f"Por estado: {by_status}")
    
    # Formatear para el portal
    formatted = format_for_portal(matches)
    
    # Guardar JSON completo (backup)
    raw_path = os.path.join(OUT_DIR, "data-maspalomas-cup-2026.json")
    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump(formatted, f, ensure_ascii=False, indent=2)
    print(f"\nGuardado: {raw_path}")
    
    # También guardar como JS para el portal
    js_path = os.path.join(OUT_DIR, "data-maspalomas-cup-2026.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("// Maspalomas Cup 2026 - Datos extraídos de maspalomascup.es/api/public/partidos\n")
        f.write(f"// Actualizado: {datetime.datetime.now().isoformat()}\n")
        f.write("const MASPALOMAS_CUP_2026 = ")
        json.dump(formatted, f, ensure_ascii=False, indent=2)
        f.write(";\n")
    print(f"Guardado: {js_path}")
    
    print(f"\nResumen:")
    print(f"  Prebenjamín: {len(formatted['Prebenjamín'])} partidos")
    print(f"  Benjamín: {len(formatted['Benjamín'])} partidos")
    print(f"  Alevín: {len(formatted['Alevín'])} partidos")

if __name__ == "__main__":
    main()
