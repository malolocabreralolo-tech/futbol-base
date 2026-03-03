# Diseño: Temporadas Históricas Completas

**Fecha:** 2026-03-03
**Estado:** Aprobado

## Objetivo

Hacer que las temporadas históricas (2024-2025, 2023-2024) tengan la misma funcionalidad que la temporada actual: clasificaciones con logos, jornadas navegables y stats calculadas de partidos.

## Alcance

### ✅ Lo que se implementa
- **Clasificaciones**: con logos (matching fuzzy) y forma de equipos calculada de partidos históricos
- **Jornadas**: pestaña funcional con todos los partidos navegables
- **Stats**: calculadas de partidos (mayor goleada, media goles, más goleador por GF, menos batido)
- **Por isla**: funcional para temporadas con datos de varias islas (2024-2025 sí tiene)

### ❌ Lo que no está disponible
- **Goleadores individuales**: no existen en ninguna fuente (AJAX POST, no archivado por Wayback; FIFLP no los publica; live server purga datos históricos)

---

## Componentes a modificar

### 1. `scripts/generate_js.py` — `generate_seasons_js()`

Actualmente pone `"matches": []` para todos los grupos históricos. Cambiar para incluir:
- Campo `"jornadas"`: dict `{num: [[date, home, away, hs, as_], ...]}` igual que `HISTORY` para temporada actual
- Mantener `"standings"` como está
- Añadir `"current_jornada"` para que el selector arranque en la jornada correcta

### 2. `app.js` — Logos (teamBadge)

Añadir matching en cascada en `teamBadge()`:
1. Exact match en SHIELDS
2. Normalized: quitar sufijos ("CF", "UD", "CD", "AD"), lowercase, trim → buscar por substring
3. Fallback a initials (comportamiento actual)

Script auxiliar `scripts/check_missing_shields.py` que lista equipos sin logo por temporada.

### 3. `app.js` — Jornadas históricas

- Quitar la desactivación de la pestaña Jornadas para `isHistorical()`
- `renderJornadas()`: si `isHistorical()`, leer `group.jornadas` en vez de `HISTORY[code]`
- El selector de grupos usa `getData()` que ya devuelve datos históricos correctamente
- El historical-banner permanece (indica que goleadores no disponibles)

### 4. `app.js` — Stats históricas

- `renderStats()`: actualmente solo funciona para temporada actual (lee `STATS`)
- Para históricas: calcular stats en el frontend desde `group.jornadas` y `group.standings`
  - Total partidos jugados, media goles, mayor goleada, equipo con más GF/menos GC

### 5. `app.js` — Forma en clasificaciones históricas

- `getTeamForm()` actualmente lee `HISTORY[groupId]` — solo temporada actual
- Para históricas: leer `group.jornadas` del grupo correspondiente en `getData()`

### 6. `app.js` — Por isla (históricas)

- La pestaña "Por isla" usa `getData()` que ya filtra por temporada correctamente
- Solo quitar la desactivación para históricas si tienen datos de varias islas

### 7. `style.css` — Banner histórico actualizado

Ajustar el texto del banner histórico para indicar "sin goleadores individuales" en vez de "solo clasificaciones disponibles".

---

## Estructura de datos en `data-seasons.js`

```js
{
  name: "2024-2025",
  current: false,
  benjamin: [{
    id: "A1",
    name: "Grupo 1",
    fullName: "...",
    phase: "Segunda Fase A GC",
    island: "gran_canaria",
    current_jornada: 16,
    standings: [[pos, team, pts, j, g, e, p, gf, gc, gd], ...],
    jornadas: {
      1: [["21/10", "Equipo A", "Equipo B", 2, 1], ...],
      2: [...],
    }
  }, ...]
}
```

---

## Fuentes de datos confirmadas

| Temporada | Clasificaciones | Partidos | Goleadores |
|-----------|----------------|----------|------------|
| 2025-2026 | ✅ futbolaspalmas.com | ✅ futbolaspalmas.com | ✅ futbolaspalmas.com |
| 2024-2025 | ✅ FIFLP | ✅ FIFLP | ❌ |
| 2023-2024 | ✅ Wayback Machine | ✅ Wayback Machine | ❌ |

---

## Orden de implementación

1. `generate_js.py` — incluir jornadas en SEASONS
2. `app.js` — teamBadge fuzzy matching
3. `app.js` — habilitar Jornadas para históricas (leer group.jornadas)
4. `app.js` — Stats calculadas desde partidos históricos
5. `app.js` — Forma de equipos en clasificaciones históricas
6. `app.js` — Habilitar Por isla para históricas
7. `style.css` — Actualizar texto del banner
8. `scripts/check_missing_shields.py` — listar equipos sin logo
9. Regenerar JS y commit
