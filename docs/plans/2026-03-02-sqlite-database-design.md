# Diseño: SQLite como base de datos central

**Fecha**: 2026-03-02
**Objetivo**: Añadir SQLite como fuente de verdad para resiliencia y histórico multi-temporada

## Arquitectura

```
futbolaspalmas.com → scraper → SQLite (futbolbase.db) → generador → data-*.js → GitHub Pages
```

El scraper escribe en SQLite en vez de directamente en los .js. Un generador lee SQLite y produce los data-*.js para GitHub Pages.

## Schema

```sql
-- Temporadas
seasons (id INTEGER PK, name TEXT, start_year INTEGER, end_year INTEGER, is_current BOOLEAN)

-- Categorías
categories (id INTEGER PK, name TEXT UNIQUE)  -- "BENJAMIN", "PREBENJAMIN"

-- Grupos (por temporada)
groups (id INTEGER PK, season_id FK, category_id FK, code TEXT, name TEXT, full_name TEXT, phase TEXT, island TEXT, url TEXT)

-- Equipos (globales, reutilizables entre temporadas)
teams (id INTEGER PK, name TEXT UNIQUE, shield_filename TEXT)

-- Clasificación (se sobreescribe cada actualización)
standings (id INTEGER PK, group_id FK, team_id FK, position INTEGER, points INTEGER, played INTEGER, won INTEGER, drawn INTEGER, lost INTEGER, gf INTEGER, gc INTEGER, gd INTEGER)

-- Partidos (histórico permanente)
matches (id INTEGER PK, group_id FK, jornada TEXT, date TEXT, time TEXT, home_team_id FK, away_team_id FK, home_score INTEGER NULL, away_score INTEGER NULL, venue TEXT)

-- Goles por partido
goals (id INTEGER PK, match_id FK, minute INTEGER, player_name TEXT, running_score TEXT, side TEXT, type TEXT)

-- Goleadores (resumen por grupo)
scorers (id INTEGER PK, group_id FK, player_name TEXT, team_id FK, goals INTEGER, games INTEGER)
```

## Cambios en scripts

1. `fetch_futbolaspalmas.py` → escribe en SQLite (futbolbase.db)
2. Nuevo `generate_js.py` → lee SQLite, genera data-*.js
3. Workflow ejecuta ambos secuencialmente

## Beneficios

- **Resiliencia**: Datos seguros en SQLite si la fuente cae
- **Histórico**: Multi-temporada con campo `is_current`
- **Integridad**: DB normalizada, sin duplicados de claves
- **Mejoras futuras**: Estadísticas acumuladas, temporadas anteriores

## Sin cambios

- GitHub Pages, mismo aspecto, mismos data-*.js
- Service Worker y PWA intactos
- Sin coste adicional
