#!/usr/bin/env python3
"""
debug_fiflp_copa.py — Captures raw HTML structure from FIFLP Copa de Campeones
page so we can debug the score parser locally.

Outputs scripts/debug_fiflp_copa.json with:
  - For each jornada, raw HTML of the matches container
  - Parsed structure (tables, rows, cells with text content)
  - The current parse_matches() output for comparison

Run via .github/workflows/debug-fiflp-copa.yml (FIFLP IP-blocks local).
"""
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright

OUTPUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "debug_fiflp_copa.json")
BASE = "https://www.fiflp.com/pnfg/NPcd"

# Copa de Campeones — parametrizable por env (default: prebenjamín 2024-25).
# Para las cups 2025-26: DBG_COMP=54968356 DBG_GRUPO=54968357 DBG_SEASON=21
COMP_ID = os.environ.get("DBG_COMP", "1469")
GRUPO_ID = os.environ.get("DBG_GRUPO", "196763")
SEASON = os.environ.get("DBG_SEASON", "20")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ))
        page.set_default_timeout(30000)

        url = (f"{BASE}/NFG_CmpJornada?cod_primaria=1000120"
               f"&CodTemporada={SEASON}"
               f"&CodCompeticion={COMP_ID}"
               f"&CodGrupo={GRUPO_ID}")
        print(f"Loading: {url}")
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3500)

        result = {"url": url, "jornadas": []}

        # Get all jornada options
        jornada_opts = page.evaluate("""
            () => {
                const sel = document.querySelector('select[name="jornada"]');
                if (!sel) return [];
                return Array.from(sel.options)
                    .filter(o => o.value && o.value !== '0')
                    .map(o => ({value: o.value, text: o.text.trim()}));
            }
        """)
        print(f"Jornadas: {len(jornada_opts)}")
        result["jornada_options"] = jornada_opts

        # For each jornada: trigger the load, capture HTML structure
        for jor in jornada_opts:
            print(f"\n=== {jor['text']} ===")
            try:
                page.evaluate(f"BuscarPartidos('{jor['value']}')")
                page.wait_for_timeout(2500)
            except Exception as e:
                print(f"  trigger err: {e}")

            # Capture: all tables on the page
            tables_data = page.evaluate("""
                () => {
                    const tables = Array.from(document.querySelectorAll('table'));
                    return tables.map((t, i) => {
                        const rows = Array.from(t.querySelectorAll('tr'));
                        return {
                            idx: i,
                            row_count: rows.length,
                            outer_html: t.outerHTML.slice(0, 8000),
                            rows: rows.slice(0, 6).map(r => {
                                const cells = Array.from(r.querySelectorAll('td,th'));
                                return {
                                    cell_count: cells.length,
                                    cells: cells.map(c => ({
                                        text: (c.innerText || '').trim().slice(0, 200),
                                        html: c.innerHTML.slice(0, 500),
                                    }))
                                };
                            })
                        };
                    });
                }
            """)

            # Filter to interesting tables (those with team-name-like content)
            interesting = []
            for t in tables_data:
                # Heuristic: 2-row table with 3 cells in first row (the existing
                # parser's target shape), or any table whose first row has at
                # least 3 cells with non-empty text.
                if t["row_count"] in (1, 2, 3, 4) and len(t["rows"]) > 0:
                    interesting.append(t)

            # Rich post-JS dump of every score span (.wid2_resultado_cerrada):
            # after FIFLP's packed ntype JS runs, each digit element gets a
            # 'fa-<digit>' class. Capture each descendant's tag/class/text/
            # ::before so we can write a correct multi-digit extractor.
            score_cells = page.evaluate("""
                () => Array.from(document.querySelectorAll('.wid2_resultado_cerrada'))
                  .map(span => ({
                    innerText: (span.innerText || '').trim(),
                    cls: span.className,
                    els: Array.from(span.querySelectorAll('*')).map(el => ({
                      tag: el.tagName, cls: el.className,
                      txt: (el.innerText || '').trim(),
                      before: window.getComputedStyle(el, '::before').content,
                    })),
                  }))
            """)

            # Per-match reconstruction of the RENDERED score (text nodes + the
            # ::before digit of each element, in DOM order) for each row that
            # has a score cell — shows exactly how home/away/separator are laid
            # out so the static parser can split them.
            # Simula el extractor robusto candidato: cada partido tiene 2 spans
            # .wid2_resultado_cerrada (home, away); el dígito REAL está en los
            # pseudo-elementos ::before/::after (los decoy son texto plano, que
            # se ignoran). Concatena multi-dígito en orden DOM.
            match_scores = page.evaluate(r"""
                () => {
                  const readSpan = (span) => {
                    let digits = '';
                    const els = [span, ...span.querySelectorAll('*')];
                    for (const el of els) {
                      for (const p of ['::before', '::after']) {
                        const c = window.getComputedStyle(el, p).content || '';
                        const m = c.replace(/["']/g,'').match(/\d+/);
                        if (m) digits += m[0];
                      }
                    }
                    return digits;
                  };
                  const out = [];
                  for (const tr of document.querySelectorAll('tr')) {
                    const tds = Array.from(tr.querySelectorAll('td'));
                    const scoreTd = tds.find(td => td.querySelector('.wid2_resultado_cerrada'));
                    if (!scoreTd) continue;
                    const spans = Array.from(scoreTd.querySelectorAll('.wid2_resultado_cerrada'));
                    out.push({
                      home: tds[0] ? tds[0].innerText.trim().slice(0,30) : '',
                      away: tds[2] ? tds[2].innerText.trim().slice(0,30) : '',
                      nspans: spans.length,
                      hs: spans[0] ? readSpan(spans[0]) : '',
                      as: spans[1] ? readSpan(spans[1]) : '',
                    });
                  }
                  return out;
                }
            """)

            jor_record = {
                "value": jor["value"],
                "text": jor["text"],
                "table_count": len(tables_data),
                "interesting_tables": interesting[:30],
                "score_cells": score_cells,
                "match_scores": match_scores,
            }
            result["jornadas"].append(jor_record)
            time.sleep(1.0)

        browser.close()

    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\nSaved debug data to {OUTPUT}")


if __name__ == "__main__":
    main()
