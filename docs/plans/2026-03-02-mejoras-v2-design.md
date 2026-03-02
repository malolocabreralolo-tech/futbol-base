# Mejoras v2: Rediseño + Estadísticas + Multi-Temporada

## Resumen

Evolución del portal futbol-base con tres ejes: rediseño visual estilo FotMob/deportivo moderno, estadísticas avanzadas pre-calculadas, e infraestructura para histórico multi-temporada. Sin cambiar stack (vanilla JS + CSS + GitHub Pages).

## Decisiones

- **Stack**: Vanilla JS + CSS puro, sin frameworks ni build step
- **Estilo visual**: Deportivo moderno (FotMob/FlashScore)
- **Datos**: Pre-calculados en generate_js.py desde SQLite, nuevos archivos data-stats.js
- **Multi-temporada**: Infraestructura lista, selector en header, archivos por temporada
- **Histórico**: Solo temporada actual disponible; estructura lista para futuras

---

## 1. Rediseño Visual

### Paleta de colores
- Background: `#0d1117` (dark), `#f6f8fa` (light)
- Cards: `#161b22` (dark), `#ffffff` (light)
- Accent primario: `#00e676` (verde neón)
- Accent secundario: `#ffc107` (amarillo, goleadores)
- Victoria: `#00e676`, Empate: `#78909c`, Derrota: `#ef5350`
- Texto: `#e6edf3` (dark), `#1f2328` (light)

### Tipografía
- Headers: Bebas Neue (mantener)
- Body: Inter o DM Sans (mantener DM Sans)
- Números/resultados: Tabular nums, bold, monoespaciado

### Componentes rediseñados

**Header**: Compacto, logo + selector temporada + theme toggle en una línea. Categorías como pills debajo. Tabs con indicador de línea activa verde.

**Tarjetas de partido**: Escudos grandes (40px), marcador centrado grande (24px bold), borde izquierdo coloreado según resultado, info secundaria (fecha, campo) en gris.

**Tablas de clasificación**: Mini escudo junto al nombre, columna PTS con fondo verde, DG coloreado, forma (últimos 5) como puntos de color, hover con highlight. Zonas coloreadas (ascenso verde sutil, descenso rojo sutil).

**Modal detalle partido**: Layout centrado con escudos grandes, timeline de goles con línea vertical, comparativa de equipos con barras visuales.

**Modal perfil equipo**: Stats en grid (tarjetas con icono + número grande + label), mini sparkline de evolución de puntos.

**Bottom tab bar (móvil)**: Navegación fija abajo con iconos SVG + label, solo en pantallas < 768px.

**Micro-animaciones**: Fade-in escalonado para tarjetas, transición suave entre secciones, hover scale en tarjetas de partido.

### Iconos
SVG inline en vez de emojis para: balón, escudo genérico, trofeo, calendario, campo, goleador.

---

## 2. Estadísticas Avanzadas

### Nuevo archivo: data-stats.js

Pre-calculado por generate_js.py con:

```javascript
const STATS = {
  benjamin: {
    season: {
      topScorer: { name, team, goals },
      mostGoals: { team, gf },
      leastConceded: { team, gc },
      biggestWin: { home, away, score, date },
      mostGoalsMatch: { home, away, score, totalGoals, date },
      totalGoals: number,
      totalMatches: number,
      avgGoalsPerMatch: number
    },
    teams: {
      "Team Name": {
        streak: { type: 'W'|'D'|'L', count: number },
        homeRecord: { w, d, l, pct },
        awayRecord: { w, d, l, pct },
        avgGF: number,
        avgGC: number,
        biggestWin: { vs, score, date },
        worstLoss: { vs, score, date },
        pointsHistory: [pts_j1, pts_j2, ...],  // acumulado por jornada
        goalsShare: number  // % goles del equipo por máximo goleador
      }
    }
  },
  prebenjamin: { ... }
}
```

### Dónde se muestran

- **Modal equipo**: Racha, local/visitante, promedios, mejor/peor resultado, sparkline puntos
- **Modal partido**: Comparativa enriquecida con rachas y rendimiento
- **Tab Goleadores**: Columna extra "Media" (goles/partido) y "% equipo"
- **Nuevo tab "Estadísticas"**: Records de la temporada, rankings curiosos

---

## 3. Multi-Temporada

### Infraestructura

- Selector de temporada en header: `[2025/26 ▾]`
- Archivos por temporada: `data-benjamin.js` (actual), `data-benjamin-2024.js` (pasada)
- Carga lazy: solo la temporada seleccionada en memoria
- SQLite ya tiene tabla `seasons` con `is_current`

### Alcance actual
- Solo temporada 2025/26 disponible
- Selector aparece pero con una sola opción (preparado para futuro)
- Cuando haya nueva temporada, el scraper crea nueva season automáticamente

---

## 4. Estructura de archivos

### Archivos modificados
- `index.html` - Nuevo HTML structure
- `style.css` - CSS completamente nuevo
- `app.js` - Ampliado con stats, multi-temporada, animaciones
- `sw.js` - Añadir data-stats.js al cache
- `scripts/generate_js.py` - Generar data-stats.js

### Archivos nuevos
- `data-stats.js` - Estadísticas pre-calculadas
- `icons.svg` - Sprite SVG con iconos deportivos

### Sin cambios
- `scripts/db.py` - Schema SQLite (ya tiene seasons)
- `scripts/fetch_futbolaspalmas.py` - Scraper (sin cambios)
- `manifest.json` - PWA manifest
