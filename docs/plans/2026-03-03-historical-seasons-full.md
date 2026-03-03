# Historical Seasons Full Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hacer que las temporadas historicas (2024-2025, 2023-2024) tengan la misma funcionalidad que la actual: clasificaciones con logos, jornadas navegables y stats calculadas.

**Architecture:** Se extiende generate_seasons_js() para incluir partidos por jornada; se adapta app.js para leer esos datos en los tabs de Jornadas, Stats y Por isla; se anade fuzzy matching de escudos para equipos historicos.

**Tech Stack:** Python 3 (generate_js.py), Vanilla JS (app.js), SQLite (futbolbase.db)

---

### Task 1: Incluir jornadas en generate_seasons_js()

**Files:**
- Modify: `scripts/generate_js.py` (funcion generate_seasons_js, lineas 535-582)

Actualmente pone `"matches": []` para grupos historicos. Incluir campo `"jornadas"` con partidos agrupados por numero de jornada, y `"current_jornada"`.

**Step 1: Anadir helper get_historical_jornadas() antes de generate_seasons_js()**

```python
def get_historical_jornadas(conn, group_id):
    """Return matches grouped by jornada num for historical groups.
    Format: {jornada_num: [[date, home, away, hs, as_], ...]}
    """
    rows = conn.execute(
        """SELECT m.jornada, m.date, h.name, a.name, m.home_score, m.away_score
           FROM matches m
           JOIN teams h ON m.home_team_id = h.id
           JOIN teams a ON m.away_team_id = a.id
           WHERE m.group_id = ?
           ORDER BY m.jornada, m.date, h.name""",
        (group_id,),
    ).fetchall()

    jornadas = {}
    for jornada, dt, home, away, hs, as_ in rows:
        jornadas.setdefault(jornada, []).append([dt, home, away, hs, as_])

    return dict(sorted(jornadas.items()))
```

**Step 2: Modificar generate_seasons_js() para incluir jornadas y current_jornada**

Dentro del bloque `if not is_current:`, cambiar la consulta de grupos para incluir `g.current_jornada`, y el bucle de grupos:

Consulta SQL — anadir `g.current_jornada` al SELECT:
```sql
SELECT g.id, g.code, g.name, g.full_name, g.phase, g.island, g.current_jornada
FROM groups g
WHERE g.season_id = ? AND g.category_id IN ({placeholders})
ORDER BY g.code
```

Bucle de grupos — sustituir la linea de append:
```python
for gid, code, name, full_name, phase, island, current_jornada in groups:
    standings = get_standings(conn, gid)
    hist_jornadas = get_historical_jornadas(conn, gid)
    groups_data.append({
        "id": code,
        "name": name,
        "fullName": full_name,
        "phase": phase or island or "Gran Canaria",
        "island": island,
        "current_jornada": current_jornada,
        "standings": standings,
        "jornadas": hist_jornadas,
    })
```

**Step 3: Verificar generacion**

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/generate_js.py
python3 -c "
import re, json
with open('data-seasons.js') as f: c = f.read()
seasons = json.loads(re.match(r'const SEASONS=(\[.*\]);?\$', c, re.DOTALL).group(1))
s = next(x for x in seasons if x['name'] == '2024-2025')
g = s['benjamin'][0]
jkeys = list(g['jornadas'].keys())
print('Group:', g['id'], '| jornadas:', len(jkeys), '| first key:', jkeys[0])
print('Sample match:', g['jornadas'][jkeys[0]][0])
"
```

Expected: muestra numero de jornadas y un partido de muestra.

**Step 4: Commit**

```bash
git add scripts/generate_js.py data-seasons.js
git commit -m "data: include match jornadas in historical SEASONS data"
```

---

### Task 2: Fuzzy matching de escudos en teamBadge()

**Files:**
- Modify: `app.js:37-43`

Equipos historicos tienen nombres cortos ("Arucas") pero SHIELDS usa nombres largos ("Arucas CF"). Anadir matching normalizado en cascada.

**Step 1: Reemplazar teamBadge() y anadir cache de normalizacion (lineas 37-43)**

Sustituir el bloque actual (lines 37-43) con:

```js
let _shieldsNorm = null;
function getShieldsNorm() {
  if (_shieldsNorm) return _shieldsNorm;
  if (typeof SHIELDS === 'undefined') return (_shieldsNorm = {});
  const STRIP = /\b(cf|ud|cd|ad|sd|ce|cef|ssd|atletico|atl)\b/gi;
  _shieldsNorm = {};
  Object.keys(SHIELDS).forEach(k => {
    const norm = k.toLowerCase().replace(STRIP, '').replace(/["\s]+/g, ' ').trim();
    if (norm && !_shieldsNorm[norm]) _shieldsNorm[norm] = SHIELDS[k];
  });
  return _shieldsNorm;
}

function teamBadge(name) {
  if (typeof SHIELDS !== 'undefined') {
    // 1. Exact match
    if (SHIELDS[name]) {
      return '<img class="team-badge" src="./escudos/' + SHIELDS[name] + '" alt="' + name + '" onerror="this.outerHTML=teamBadgeFallback(this.alt)">';
    }
    // 2. Normalized match (strip suffixes)
    const STRIP = /\b(cf|ud|cd|ad|sd|ce|cef|ssd|atletico|atl)\b/gi;
    const norm = name.toLowerCase().replace(STRIP, '').replace(/["\s]+/g, ' ').trim();
    const shNorm = getShieldsNorm();
    if (norm && shNorm[norm]) {
      return '<img class="team-badge" src="./escudos/' + shNorm[norm] + '" alt="' + name + '" onerror="this.outerHTML=teamBadgeFallback(this.alt)">';
    }
    // 3. Substring match
    if (norm.length >= 4) {
      const found = Object.keys(SHIELDS).find(k => {
        const kn = k.toLowerCase().replace(STRIP, '').replace(/["\s]+/g, ' ').trim();
        return kn.includes(norm) || norm.includes(kn);
      });
      if (found) {
        return '<img class="team-badge" src="./escudos/' + SHIELDS[found] + '" alt="' + name + '" onerror="this.outerHTML=teamBadgeFallback(this.alt)">';
      }
    }
  }
  return teamBadgeFallback(name);
}
```

**Step 2: Commit**

```bash
git add app.js
git commit -m "feat: fuzzy shield matching for historical team names"
```

---

### Task 3: Script check_missing_shields.py

**Files:**
- Create: `scripts/check_missing_shields.py`

**Step 1: Crear el script**

```python
#!/usr/bin/env python3
"""
check_missing_shields.py - Lista equipos sin escudo en data-shields.js.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHIELDS_PATH = os.path.join(ROOT, 'data-shields.js')
SEASONS_PATH = os.path.join(ROOT, 'data-seasons.js')

STRIP = re.compile(r'\b(cf|ud|cd|ad|sd|ce|cef|ssd|atletico|atl)\b', re.IGNORECASE)

def normalize(name):
    return STRIP.sub('', name.lower()).replace('"', '').strip()

def load_json_var(path, varname):
    with open(path) as f:
        m = re.match(r'const ' + varname + r'=(\[.*\]|\{.*\});?\s*$', f.read(), re.DOTALL)
    return json.loads(m.group(1))

def has_shield(name, shields, shields_norm):
    if name in shields: return True
    n = normalize(name)
    if n and n in shields_norm: return True
    if len(n) >= 4:
        for k in shields:
            kn = normalize(k)
            if n in kn or kn in n: return True
    return False

def main():
    shields = load_json_var(SHIELDS_PATH, 'SHIELDS')
    shields_norm = {normalize(k): v for k, v in shields.items() if normalize(k)}
    seasons = load_json_var(SEASONS_PATH, 'SEASONS')

    print(f"Shields loaded: {len(shields)}\n")

    for season in seasons:
        sname = season['name']
        for cat in ['benjamin', 'prebenjamin']:
            groups = season.get(cat, [])
            missing = set()
            for g in groups:
                for row in g.get('standings', []):
                    team = row[1]
                    if not has_shield(team, shields, shields_norm):
                        missing.add(team)
            if missing:
                print(f"[{sname}] {cat.upper()} - {len(missing)} sin escudo:")
                for t in sorted(missing):
                    print(f"  - {t!r}")

if __name__ == '__main__':
    main()
```

**Step 2: Ejecutar y revisar output**

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/check_missing_shields.py
```

**Step 3: Commit**

```bash
git add scripts/check_missing_shields.py
git commit -m "tools: add check_missing_shields.py for historical team audit"
```

---

### Task 4: Habilitar tabs en temporadas historicas

**Files:**
- Modify: `app.js` - funciones updateSeasonUI() (lineas 152-162) y el listener del selector (lineas 135-143)

**Step 1: Modificar updateSeasonUI() - solo deshabilitar 'goleadores'**

Reemplazar el bloque de desactivacion de tabs (lineas 159-162):
```js
// ANTES:
$$('.section-tab').forEach(tab => {
  if (tab.dataset.section === 'clasif') return;
  tab.classList.toggle('disabled', hist);
  tab.disabled = hist;
});

// DESPUES: solo deshabilitar goleadores
$$('.section-tab').forEach(tab => {
  const disable = hist && tab.dataset.section === 'goleadores';
  tab.classList.toggle('disabled', disable);
  tab.disabled = disable;
});
```

**Step 2: Modificar el listener de cambio de temporada - no forzar clasif al cambiar**

En el listener `select.addEventListener('change', ...)` (lineas 135-143), reemplazar:
```js
// ANTES:
if (isHistorical() && S.section !== 'clasif') {
  S.section = 'clasif';
  $$('.section-tab').forEach(t => t.classList.toggle('active', t.dataset.section === 'clasif'));
}

// DESPUES: solo forzar a clasif si estabamos en goleadores
if (isHistorical() && S.section === 'goleadores') {
  S.section = 'clasif';
  $$('.section-tab').forEach(t => t.classList.toggle('active', t.dataset.section === 'clasif'));
}
```

**Step 3: Commit**

```bash
git add app.js
git commit -m "feat: enable jornadas/stats/isla tabs for historical seasons"
```

---

### Task 5: Jornadas historicas en renderJornadaContent()

**Files:**
- Modify: `app.js:405-508` (renderJornadaContent)
- Modify: `app.js:509-514` (getJornadaMatches)

**Step 1: Anadir helper getHistoricalJornadaMatches() despues de getJornadaMatches() (linea ~514)**

```js
function getHistoricalJornadaMatches(group, jorNum) {
  if (!group || !group.jornadas || !group.jornadas[jorNum]) return [];
  return group.jornadas[jorNum].map(function(m) {
    return { date: m[0], home: m[1], away: m[2], hs: m[3], as: m[4] };
  });
}
```

**Step 2: Anadir bloque historical al inicio de renderJornadaContent()**

Al inicio de `renderJornadaContent()`, despues de `if (!group) return;`, insertar:

```js
// HISTORICAL PATH
if (isHistorical() && group.jornadas && Object.keys(group.jornadas).length > 0) {
  var jorNums = Object.keys(group.jornadas).map(Number).sort(function(a,b){return a-b;});
  if (!S.jorNum || !jorNums.includes(Number(S.jorNum))) {
    var lastPlayed = jorNums[jorNums.length - 1];
    for (var i = jorNums.length - 1; i >= 0; i--) {
      var ms = group.jornadas[jorNums[i]] || [];
      if (ms.some(function(m){return m[3] !== null && m[3] !== undefined;})) {
        lastPlayed = jorNums[i]; break;
      }
    }
    S.jorNum = String(lastPlayed);
  }
  jorNums.forEach(function(num) {
    var key = String(num);
    var pill = el('button', 'jornada-pill' + (key === S.jorNum ? ' active' : ''), 'J' + num);
    pill.addEventListener('click', function() {
      S.jorNum = key;
      $$('.jornada-pill').forEach(function(p){p.classList.remove('active');});
      pill.classList.add('active');
      renderMatchCards(matchesDiv, getHistoricalJornadaMatches(group, num), 'history');
    });
    pillsDiv.appendChild(pill);
  });
  setTimeout(function() {
    var active = pillsDiv.querySelector('.active');
    if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, 50);
  renderMatchCards(matchesDiv, getHistoricalJornadaMatches(group, Number(S.jorNum)), 'history');
  return;
}
// END HISTORICAL PATH
```

**Step 3: Commit**

```bash
git add app.js
git commit -m "feat: enable jornadas tab for historical seasons"
```

---

### Task 6: Forma de equipos en clasificaciones historicas

**Files:**
- Modify: `app.js:45-63` (getTeamForm)
- Modify: `app.js:311-330` (buildStandingsTable - columna F)

**Step 1: Modificar getTeamForm()**

Reemplazar la funcion completa (lineas 45-63):

```js
function getTeamForm(teamName, groupId, n) {
  n = n || 5;
  var jornadas = null;
  if (isHistorical()) {
    var group = getData().find(function(g){return g.id === groupId;});
    if (group && group.jornadas) jornadas = group.jornadas;
  } else {
    if (typeof HISTORY === 'undefined' || !HISTORY[groupId]) return [];
    jornadas = HISTORY[groupId];
  }
  if (!jornadas) return [];
  var all = [];
  Object.entries(jornadas).forEach(function([jorKey, matches]) {
    var jorNum = parseInt(jorKey);
    matches.forEach(function(m) {
      var date = m[0], home = m[1], away = m[2], hs = m[3], as_ = m[4];
      if (hs === null || hs === undefined || as_ === null || as_ === undefined) return;
      if (home !== teamName && away !== teamName) return;
      var isHome = home === teamName;
      var gf = isHome ? hs : as_, gc = isHome ? as_ : hs;
      all.push({ jorNum: jorNum, date: date, result: gf > gc ? 'W' : gf < gc ? 'L' : 'D' });
    });
  });
  all.sort(function(a,b){return a.jorNum - b.jorNum || a.date.localeCompare(b.date);});
  return all.slice(-n);
}
```

**Step 2: Habilitar columna Forma en clasificaciones historicas**

En buildStandingsTable(), calcular si hay jornadas disponibles y usarlo en vez de `!hist`:

Reemplazar `const hist = isHistorical();` y las comprobaciones `if (!hist)`:

```js
// Calcular si hay jornadas en el contexto actual
const hist = isHistorical();
const histHasJornadas = hist && getData().some(function(g){
  return g.jornadas && Object.keys(g.jornadas).length > 0;
});
const showForm = !hist || histHasJornadas;
```

Y luego usar `showForm` en vez de `!hist` para la columna F.

**Step 3: Commit**

```bash
git add app.js
git commit -m "feat: show team form in historical standings"
```

---

### Task 7: Stats calculadas para temporadas historicas

**Files:**
- Modify: `app.js` (anadir calcHistoricalStats() y modificar renderStats())

**Step 1: Anadir calcHistoricalStats() antes de renderStats() (linea ~1118)**

```js
function calcHistoricalStats() {
  var groups = getData();
  var totalMatches = 0, totalGoals = 0;
  var biggestDiff = -1, biggestWin = null;
  var mostGoalsTotal = -1, mostGoalsMatch = null;
  var teamGF = {}, teamGC = {};

  groups.forEach(function(g) {
    (g.standings || []).forEach(function(row) {
      var team = row[1];
      teamGF[team] = (teamGF[team] || 0) + (row[7] || 0);
      teamGC[team] = (teamGC[team] || 0) + (row[8] || 0);
    });
    Object.values(g.jornadas || {}).forEach(function(matches) {
      matches.forEach(function(m) {
        var hs = m[3], as_ = m[4];
        if (hs === null || hs === undefined || as_ === null || as_ === undefined) return;
        totalMatches++;
        var goals = hs + as_;
        totalGoals += goals;
        var diff = Math.abs(hs - as_);
        if (diff > biggestDiff || (diff === biggestDiff && goals > ((biggestWin && biggestWin._goals) || 0))) {
          biggestDiff = diff;
          biggestWin = { home: m[1], away: m[2], hs: hs, as_: as_, score: hs + '-' + as_, date: m[0], _goals: goals };
        }
        if (goals > mostGoalsTotal) {
          mostGoalsTotal = goals;
          mostGoalsMatch = { home: m[1], away: m[2], score: hs + '-' + as_, totalGoals: goals, date: m[0] };
        }
      });
    });
  });

  var mostGoalsTeam = Object.entries(teamGF).sort(function(a,b){return b[1]-a[1];})[0];
  var leastConcededTeam = Object.entries(teamGC).sort(function(a,b){return a[1]-b[1];})[0];

  return {
    season: {
      totalMatches: totalMatches,
      totalGoals: totalGoals,
      avgGoalsPerMatch: totalMatches > 0 ? Math.round(totalGoals / totalMatches * 100) / 100 : 0,
      topScorer: null,
      mostGoals: mostGoalsTeam ? { team: mostGoalsTeam[0], gf: mostGoalsTeam[1] } : null,
      leastConceded: leastConcededTeam ? { team: leastConcededTeam[0], gc: leastConcededTeam[1] } : null,
      biggestWin: biggestWin ? { home: biggestWin.home, away: biggestWin.away, score: biggestWin.score, date: biggestWin.date } : null,
      mostGoalsMatch: mostGoalsMatch,
    },
    teams: {}
  };
}
```

**Step 2: Modificar renderStats() para usar calcHistoricalStats() en historicas**

Al inicio de renderStats(), reemplazar la comprobacion de STATS:

```js
function renderStats() {
  var container = $('#sec-stats');
  container.innerHTML = '';

  var stats;
  if (isHistorical()) {
    stats = calcHistoricalStats();
  } else {
    if (typeof STATS === 'undefined' || !STATS[S.cat]) {
      container.innerHTML = '<div class="empty-state">...</div>';
      return;
    }
    stats = STATS[S.cat];
  }
  // el resto del codigo usa 'stats' en vez de 'STATS[S.cat]'
  var ss = stats.season;
  // ...
```

**Step 3: Commit**

```bash
git add app.js
git commit -m "feat: calculate stats from match data for historical seasons"
```

---

### Task 8: Textos y iconos menores

**Files:**
- Modify: `app.js:247` (banner historico)
- Modify: `app.js` (phaseIcons - anadir Primera Fase GC)

**Step 1: Actualizar texto del banner**

```js
// Linea 247 - cambiar texto:
'Datos historicos - Temporada ' + S.season.replace('-', '/') + ' - Sin goleadores individuales'
```

**Step 2: Anadir icono para "Primera Fase GC" en phaseIcons (~linea 255)**

```js
const phaseIcons = {
  'Segunda Fase A': '🏆', 'Segunda Fase B': '🥈', 'Segunda Fase C': '🥉',
  'Lanzarote': '🌋', 'Fuerteventura': '🏝️', 'Gran Canaria': '🏔️',
  'Primera Fase GC': '🏟️',
  'Primera Fase': '🏟️',
};
```

**Step 3: Commit**

```bash
git add app.js
git commit -m "fix: update historical banner text and add Primera Fase icon"
```

---

### Task 9: Regenerar JS y publicar

**Step 1: Regenerar todos los datos JS**

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/generate_js.py
```

**Step 2: Ejecutar check_missing_shields**

```bash
python3 scripts/check_missing_shields.py
```

Anotar equipos sin escudo para anadir manualmente si se quiere.

**Step 3: Bump cache del service worker**

```bash
NEWVER="futbolbase-v$(date +%Y%m%d)b"
sed -i "s/futbolbase-v[0-9a-z]*/futbolbase-v$(date +%Y%m%d)b/" sw.js
```

**Step 4: Commit final y push**

```bash
git add data-seasons.js data-benjamin.js data-prebenjamin.js \
        data-history.js data-goleadores.js data-shields.js \
        data-stats.js data-matchdetail.js index.html sw.js
git commit -m "data: regenerate all JS with historical jornadas and updated cache"
git push
```

**Step 5: Verificar GitHub Pages** (esperar ~2 min) que:
- Temporada 2024-2025: tabs Jornadas, Stats, Por isla activos con datos reales
- Temporada 2023-2024: clasif con logos, jornadas navegables, stats con goleada y media goles
- Logos aparecen en equipos historicos (Arucas, Moya, etc.)
