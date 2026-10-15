"""freno_experimento.py — Mide el freno de la federación desde un runner de GitHub (freno-fiflp.yml).

Desde el 14/10/2026 la federación sirve páginas vacías tras ~10-25 páginas seguidas, también con 3
peticiones por página (fiflp_launch_args, con caché). Este experimento NO toca la base ni el repo: pide
documentos distintos (calendario y primeras jornadas de los grupos de la temporada) a un ritmo fijo
(FRENO_INTERVAL segundos), y cuando llega la primera página vacía prueba, por orden:
  1. la misma página otra vez, en la misma sesión, a los 10 s;
  2. la misma página en un contexto nuevo (otras cookies: otra sesión de la federación);
  3. si el contexto nuevo la sirve, sigue en él y cuenta hasta el siguiente freno (¿el freno es por
     sesión?), hasta FRENO_ROTATIONS veces;
  4. si no, una página cada 60 s (alternando sesión vieja y nueva) hasta que vuelva a servir, para
     medir cuánto dura, y sigue contando hasta el siguiente.
Todo con plazo (FRENO_MINUTES). Resumen en el log y en probe_out/freno.json.
"""
import json
import os
import sqlite3
import time
from pathlib import Path

from fiflp_carga import _empty
from fiflp_render import fiflp_launch_args, goto

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "probe_out"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


def urls():
    """Documentos distintos: el calendario y las jornadas 1-3 de cada grupo de la federación de la
    temporada en curso."""
    conn = sqlite3.connect(ROOT / "futbolbase.db")
    rows = conn.execute("""SELECT g.code, g.url FROM groups g JOIN seasons s ON s.id = g.season_id
                           WHERE s.is_current = 1 AND g.url LIKE '%fiflp.com%' ORDER BY g.code""",
                        ()).fetchall()
    out = []
    for k in (None, 1, 2, 3):
        for code, url in rows:
            out.append((code, url if k is None else f"{url}&CodJornada={k}"))
    return out


def main():
    from playwright.sync_api import sync_playwright
    interval = float(os.environ.get("FRENO_INTERVAL") or 7)
    minutes = float(os.environ.get("FRENO_MINUTES") or 22)
    rotations = int(os.environ.get("FRENO_ROTATIONS") or 4)
    end = time.monotonic() + minutes * 60
    t0 = time.monotonic()
    todo = urls()
    print(f"{len(todo)} documentos, una página cada {interval:g} s, {minutes:g} min", flush=True)
    events, headers = [], {}
    stamp = lambda: round(time.monotonic() - t0, 1)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=fiflp_launch_args())

        def session():
            ctx = browser.new_context(user_agent=UA)
            return ctx, ctx.new_page()

        def load(page, url, label):
            try:
                r = goto(page, url, wait_until="domcontentloaded", timeout=30000)
                status = r.status if r else None
                empty = _empty(page)
                if r is not None and (empty and "empty" not in headers or not empty and "ok" not in headers):
                    headers["empty" if empty else "ok"] = {"status": status, **dict(r.headers)}
            except Exception as e:
                status, empty = f"error: {str(e)[:80]}", True
            ev = {"t": stamp(), "what": label, "status": status, "empty": bool(empty)}
            events.append(ev)
            return not empty and status == 200

        ctx, page = session()
        sessions, served, since, last = 1, 0, 0, 0.0
        runs = []                       # páginas servidas seguidas antes de cada freno
        i = 0
        while i < len(todo) and time.monotonic() < end:
            wait = last + interval - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            last = time.monotonic()
            code, url = todo[i]
            if load(page, url, f"s{sessions} {code} #{i}"):
                served += 1
                since += 1
                i += 1
                continue
            runs.append({"session": sessions, "pages": since, "t": stamp()})
            print(f"[{stamp():7.1f}s] FRENO tras {since} páginas (sesión {sessions}, {served} en total)", flush=True)
            since = 0
            time.sleep(10)
            same = load(page, url, f"s{sessions} misma página a los 10 s")
            print(f"           misma sesión a los 10 s: {'sirve' if same else 'vacía'}", flush=True)
            if same:
                continue
            ctx2, page2 = session()
            fresh_ok = load(page2, url, f"s{sessions + 1} contexto nuevo")
            print(f"           contexto nuevo (otra sesión): {'SIRVE' if fresh_ok else 'vacía'}", flush=True)
            if fresh_ok and sessions <= rotations:
                ctx.close()
                ctx, page, sessions = ctx2, page2, sessions + 1
                served += 1
                since = 1
                i += 1
                last = time.monotonic()
                continue
            # Ni la sesión nueva: una página por minuto hasta que vuelva.
            began = time.monotonic()
            back = False
            n = 0
            while time.monotonic() + 60 < end:
                time.sleep(60)
                n += 1
                use_new = n % 2 == 1
                ok = load(page2 if use_new else page, url, f"sondeo {n} ({'nueva' if use_new else 'vieja'})")
                print(f"           sondeo a los {time.monotonic() - began:5.0f} s, sesión "
                      f"{'nueva' if use_new else 'vieja'}: {'sirve' if ok else 'vacía'}", flush=True)
                if ok:
                    back = True
                    if use_new:
                        ctx.close()
                        ctx, page, sessions = ctx2, page2, sessions + 1
                    else:
                        ctx2.close()
                    break
            runs[-1]["recovered_after"] = round(time.monotonic() - began) if back else None
            if not back:
                break
            served += 1
            since = 1
            i += 1
            last = time.monotonic()
        if since:
            runs.append({"session": sessions, "pages": since, "t": stamp(), "end": True})
        browser.close()

    summary = {"interval": interval, "minutes": minutes, "served": served, "runs": runs,
               "headers": headers, "events": events}
    OUT.mkdir(exist_ok=True)
    (OUT / "freno.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1))
    print(f"\nServidas {served} páginas en {stamp() / 60:.1f} min a {interval:g} s; tramos: "
          + ", ".join(f"{r['pages']}" + (f" (vuelve a los {r['recovered_after']} s)" if r.get("recovered_after")
                                          else "") for r in runs))
    for kind, h in headers.items():
        print(f"cabeceras ({kind}): " + json.dumps({k: v for k, v in h.items()
                                                    if k.lower() not in ("set-cookie",)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
