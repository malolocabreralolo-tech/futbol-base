# SP-2 — Presentación rica de actas

Spec: `docs/superpowers/specs/2026-05-20-sp2-rich-presentation-design.md`
Plan: `docs/superpowers/plans/2026-05-20-sp2-rich-presentation.md`

## Superficies de UI

1. **Plantilla por equipo** — `openTeamDetail()` integra una sección
   "Plantilla" con tabla sortable A (#·Jugador·PJ·TIT·G·A·R).
2. **Match detail enriquecido** — `openMatchDetail()` añade alineaciones
   2-columnas + cronología unificada (goles+cambios+tarjetas con iconos).
3. **Perfil expandible inline** — click en una fila de plantilla muestra
   stats agregados + lista de partidos del jugador. Memo en memoria (no
   localStorage).
4. **MI EQUIPO** — nueva card "Plantilla 2025-26" siempre visible entre
   el calendario y los goleadores.

## Datos consumidos

- `data-lineups-<season>.js` → `LINEUPS_<S>[match_key]` con `{home, away, events, coachH, coachA, ref}`.
- `data-players-<season>.js` → `PLAYERS_<S>[team_id]` + `TEAMS_<S>[norm_name]`.

Cargados lazy vía `ensureLineups(season)` y `ensurePlayers(season)` en
`src/state.js`. Sin globalThis/window — regex parse del texto del fichero.

## Empty states honestos

Cada superficie sigue visible aunque los data files no existan, mostrando un
mensaje claro: "No hay datos de plantilla para esta temporada — aparecerán
cuando se importen las actas FIFLP del equipo." El portal no engaña al
usuario sobre cobertura.

## Cómo lanzar

Sin acción del usuario — todo es automático al cargar la SPA. Para regenerar
los data files tras un cambio en la DB:

```bash
python3 scripts/generate_js.py
```

Para verificación manual:

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

Las 4 superficies funcionan offline (Service Worker cachea on-demand los
data files tras la primera carga).
