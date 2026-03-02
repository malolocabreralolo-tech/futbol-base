# Mejoras v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rediseñar visualmente el portal futbol-base con estilo deportivo moderno (FotMob), añadir estadísticas avanzadas pre-calculadas, e infraestructura multi-temporada.

**Architecture:** Evolución progresiva del proyecto vanilla JS + CSS. Se genera un nuevo `data-stats.js` desde `generate_js.py` con estadísticas pre-calculadas. El CSS se reescribe completo. El HTML se reestructura para nuevos componentes. `app.js` se amplía con nuevas secciones y modales enriquecidos.

**Tech Stack:** Vanilla JavaScript, CSS3 (custom properties, grid, flexbox), Python 3.11 (SQLite to JS generation), GitHub Pages

---

## Context

**Project location:** `/home/manolo/claude/futbol-base`

**Key existing files:**
- `index.html` - Single page app shell
- `style.css` - All CSS (~1040 lines)
- `app.js` - All JS logic (~950 lines)
- `scripts/generate_js.py` - SQLite to data-*.js generator (~311 lines)
- `scripts/db.py` - SQLite schema and helpers
- `sw.js` - Service worker with network-first for data files
- `data-*.js` - Generated data files (benjamin, prebenjamin, history, matchdetail, shields, goleadores)

**Design doc:** `docs/plans/2026-03-02-mejoras-v2-design.md`

**No test framework** - static site, no build step. Testing = run Python scripts + visually verify in browser.

---

### Task 1: Generate data-stats.js from SQLite

**Goal:** Add statistics generation to `generate_js.py` producing `data-stats.js`.

**Files:**
- Modify: `scripts/generate_js.py`
- Create: `data-stats.js` (generated output)

**Step 1:** Add `generate_stats_js(conn)` function after `generate_goleadores_js`. Queries: total matches/goals, top scorer, most GF team, least GC team, biggest win, most goals match. Per team: streak, home/away records, avg GF/GC, best/worst result, points history array.

**Step 2:** Update `main()` to call it and write output.

**Step 3:** Run `python3 scripts/generate_js.py` and verify `data-stats.js` exists with valid content.

**Step 4:** Commit.

---

### Task 2: Create SVG icon sprite

**Goal:** SVG sprite file with clean icons replacing emojis.

**Files:**
- Create: `icons.svg`

Icons needed: ball, trophy, calendar, field, arrow-up, moon, sun, search, chevron-down, star, home, chart, stats.

---

### Task 3: Rewrite index.html

**Goal:** New HTML structure: compact header, season selector, 5 tabs (add Estadisticas), bottom tab bar, data-stats.js script.

**Files:**
- Modify: `index.html`

Key changes: SVG icon references, season select dropdown, 5th stats tab with sec-stats div, bottom-tabs nav for mobile, data-stats.js included.

---

### Task 4: Rewrite style.css

**Goal:** Complete CSS rewrite with FotMob-style design system.

**Files:**
- Modify: `style.css`

Sections: CSS variables (new palette), header (compact), tab indicator, match cards (colored borders), standings (mini escudos, PTS highlight), stats grid (record cards), bottom tabs, modal redesign, animations (fadeInUp, slideUp), responsive.

---

### Task 5: Update app.js core (routing, tabs, icons)

**Goal:** Support new HTML: 5th section, bottom tab sync, tab indicator, SVG icon helper.

**Files:**
- Modify: `app.js`

Add: `icon()` helper, `updateTabIndicator()`, bottom-tab click handlers, stats routing in renderSection, SVG theme toggle.

---

### Task 6: Redesigned standings and match cards

**Goal:** Update buildStandingsTable and renderMatchCards for new design.

**Files:**
- Modify: `app.js`

Changes: teamBadge with size param, mini escudos in standings, pts-cell/gd classes, match cards with border-win/draw/loss, bigger escudos (32px), icon helpers for date/venue.

---

### Task 7: New Stats section (renderStats)

**Goal:** Display season records and rankings in Estadisticas tab.

**Files:**
- Modify: `app.js`

Add: `renderStats()` and `recordCard()` functions. Shows total matches, goals, avg, pichichi, records.

---

### Task 8: Enriched team profile modal

**Goal:** Show STATS.teams data in team modal: streak, home/away, sparkline, best/worst.

**Files:**
- Modify: `app.js`

Add: `buildSparkline()` function, enrich `openTeamDetail` with analysis section.

---

### Task 9: Enriched match detail modal

**Goal:** Show team streaks in match comparison.

**Files:**
- Modify: `app.js`

Add streak badges to `openMatchDetail` comparison section.

---

### Task 10: Update sw.js and workflow

**Goal:** Add data-stats.js and icons.svg to cache and workflow.

**Files:**
- Modify: `sw.js` (add to ASSETS and DATA_FILES, bump cache version)
- Modify: `.github/workflows/update.yml` (add data-stats.js to git add)

---

### Task 11: Integration test

**Goal:** Full pipeline test.

Run scraper, verify data-stats.js, serve locally, check all 5 tabs, modals, bottom tabs, animations, search, dark/light themes. Fix issues. Final commit and push.

**Checklist:**
- Dark/light theme
- Season selector visible
- All 5 tabs functional
- Standings with escudos, PTS highlight, form dots
- Match cards with colored borders
- Team modal with stats/sparkline
- Match modal with streaks
- Stats tab with records
- Bottom tabs on mobile
- Tab indicator animation
- Search filtering

---

## Dependencies

Tasks 1-4: independent, any order.
Tasks 5-9: depend on 3+4 (HTML/CSS).
Task 10: depends on 1.
Task 11: depends on all.
