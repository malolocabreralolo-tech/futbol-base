# Rediseño total «Acta»: diseño

Fecha: 23 de septiembre de 2026. Estado: v3, tras dos rondas de revisión adversarial: tres agentes (planificación, viabilidad y fidelidad) y una segunda pasada de verificación con dos agentes. Pendiente de revisión por el usuario.

## 0. Cómo leer esta spec

Maquetas aprobadas (PNG, fuera del repo), en `/home/manolo/backups/futbol-base/rediseno-2026-09-23/maquetas/`:
- `4-acta-roja.png`: Mi equipo en temporada.
- `5-1-jornada.png`, `5-2-tabla.png`, `5-3-partido.png` y `5-4-explorar.png`.
- `6-1-pretemporada.png`: Mi equipo en pretemporada, con el **resalte definitivo**.

Capturas del diseño anterior: `…/rediseno-2026-09-23/antes/`.

**Precedencia: si una maqueta contradice este texto, manda el texto.** En concreto:
- El óvalo de bolígrafo de 4, 5-1 y 5-2 **está rechazado**; el resalte válido es el de 6-1 (§3.3).
- La barra «Partidos/Más» de 4 está obsoleta; vale la de §4.1.
- En 5-1, el aviso «Sin datos en la fuente: el partido de RC Victoria y Arucas B» **era falso**: uno descansaba y el otro tenía como rival a CD Batán, que se retiró. Vale la regla de §4.3.
- Los nombres de jugadores y equipos de las maquetas son ilustrativos; vale §3.5.

## 1. Brief acordado

- **Para quién.** El usuario y su familia; no es un portal público. La web es pública, pero se diseña para su uso.
- **Trabajo principal.** Seguir a un equipo, hoy Las Mesas Hu. (prebenjamín, Grupo 2 de Gran Canaria, 2025/26):
  - próximo partido: cuándo, dónde y cómo llegar;
  - último resultado y quién marcó;
  - clasificación y rivales.
- **Secundario.** Echar un ojo a otro equipo sin que cambie la portada. Otras ligas, islas, copas, Maspalomas Cup, archivo y récords siguen disponibles fuera de la navegación principal. **Nada de lo que hoy se publica desaparece sin decirlo** (§4.11).
- **Máxima información.** Nombres completos de jugadores, goleadores globales y récords, con una sola regla de presentación (§3.5). Se exportan datos que la base tiene y hoy no se publican (§9).
- **Tema claro por defecto.** El oscuro se activa solo si el sistema lo pide (`prefers-color-scheme`). No hay selector de tema.
- **Dirección visual «Acta» en tinta roja.** Casillas, reglas finas y tinta roja; el equipo propio con fondo rosado, texto en tinta y barra roja a la izquierda.
- **Navegación.** Barra de 4: Mi equipo, Jornada, Tabla y Explorar.
- **Técnica.** Vista nueva sin paso de compilación. Se conserva la capa de datos (SQLite, scrapers, `generate_js.py`, `data-*.js`, bot `update.yml`) y las funciones puras probadas.

## 2. Alcance y reparto en dos planes

**Plan A, datos (se publica solo, sin cambiar la interfaz actual).** Los cambios de exportación de §9 y la corrección del duplicado de Lanzarote.

**Plan B, rediseño.** Todo lo demás: interfaz, service worker, manifiesto y pruebas. Se publica de una vez cuando esté completo.

**Fuera de alcance:**
- notificaciones, cuentas, datos en directo y suscripción `webcal`;
- cambios en los scrapers o en el esquema SQLite;
- una sonda automática de la temporada siguiente;
- activar 2026/27, que tiene su procedimiento en `docs/temporada-nueva.md` (el diseño resuelve cómo lo vive la interfaz, §6).

## 3. Sistema visual

### 3.1 Tokens

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--paper` | `#FFFFFF` | `#15171C` | fondo |
| `--text` | `#1A1F2B` | `#ECEEF2` | texto principal |
| `--mute` | `#5A6272` | `#A3AAB8` | texto secundario |
| `--ink` | `#C0182B` | `#FF5A64` | tinta: títulos de bloque, bordes de caja, botones, dato clave |
| `--on-ink` | `#FFFFFF` | `#15171C` | texto sobre tinta (botón principal, segmento activo, icono activo) |
| `--rule` | `#E7B9BE` | `#5A2A30` | divisiones internas de casillas |
| `--line` | `#ECEEF2` | `#262A33` | separador de filas |
| `--mark` | `#FBEDEE` | `#2A1B1E` | fondo del equipo propio |
| `--win` / `--on-win` | `#1B7A43` / `#FFFFFF` | `#3FBF78` / `#15171C` | G |
| `--draw` / `--on-draw` | `#E4E7EC` / `#1A1F2B` | `#3A3F4A` / `#ECEEF2` | E |
| `--loss` / `--on-loss` | `#1A1F2B` / `#FFFFFF` | `#ECEEF2` / `#15171C` | P, nunca en rojo |

El test de contraste (§11) comprueba AA (≥4,5:1) en estos pares y en ambos temas:
- `text/paper`, `mute/paper`, `ink/paper`, `on-ink/ink`, `ink/mark` y `text/mark`;
- `on-win/win`, `on-draw/draw` y `on-loss/loss`.

### 3.2 Tipografía

- **Public Sans** variable, alojada en `fonts/` (woff2, subconjunto latino) y precacheada. Si falla, se usa `system-ui`. Una sola familia.
- Escala en px: 11,5 (etiqueta de casilla), 12,5 (nota), 13,5 (texto), 15 (nombre destacado), 17–19 (dato de casilla) y 40 (marcador de la ficha de partido).
- Pesos: 400, 600, 700 y 800.
- `tabular-nums` en toda cifra. Etiquetas en frase normal, nunca en mayúsculas.

### 3.3 Componentes

- **Caja:** borde de 1,5 px en `--ink`, sin radio ni sombra.
- **Casillas:** rejilla dentro de una caja, con etiqueta en `--mute` y dato en `--ink` de peso 800.
- **Título de bloque:** en tinta, peso 800. Contexto opcional a la derecha en `--mute` («jornada 30, final», «faltan 3 días»).
- **Fila de partido:** hora, local con escudo, marcador en recuadro, escudo y visitante. Los nombres se cortan con elipsis, nunca parten línea.
- **Tabla:** cabecera separada por una regla de tinta y filas separadas por `--line`.
- **Resalte propio:** se usa en filas de tabla, filas de partido de Jornada y cara a cara. Es fondo `--mark`, texto en tinta de peso 800 y `box-shadow: inset 3px 0 0 var(--ink)` en el primer elemento de la fila.
- **Forma:** círculos de 15–18 px con la letra G, E o P y sus colores `--win/--draw/--loss` + `--on-*`.
- **Selector segmentado:** caja con segmentos; el activo va relleno de `--ink` con texto `--on-ink`.
- **Botonera:** casillas-botón; la acción principal va rellena de tinta.
- **Escudo:** 16, 32 o 46 px, con `object-fit: contain`, `width`, `height` y `decoding="async"`, y `loading="lazy"` salvo en la primera pantalla. Si no hay escudo, monograma de iniciales en un círculo gris del mismo tamaño.
- **Aviso:** texto en `--mute` con un término en negrita («Sin partido en esta jornada:»).
- **Vacío:** caja de borde discontinuo en `--rule` que explica qué falta y por qué.
- **Barra de navegación:** 4 destinos con icono SVG propio (nunca emoji). Altura 64 px + `safe-area-inset-bottom`.

### 3.4 Movimiento

Solo como respuesta a una acción, y solo con `prefers-reduced-motion: no-preference`. Sin animaciones de entrada.

### 3.5 Nombres

Hay dos funciones puras en `model.js`, con tests.

**`playerName(raw)`:**
- «Apellidos, Nombre» pasa a «Nombre Apellidos».
- El texto en MAYÚSCULAS de las actas pasa a mayúscula inicial en cada palabra (conservando «De», «La»…).
- **Nunca se añaden tildes** que la fuente no trae, ni se completan nombres.
- La cronología de futbolaspalmas trae solo el nombre de pila («Hugo») y se muestra así.

**`teamShort(name)`:**
- Solo se usa en casillas estrechas: Últimos cinco, Verano y cara a cara en móvil.
- Quita las siglas iniciales o finales (UD, CD, AD, RC, CF, C.D., U.D., «, C.D.») y conserva la letra de filial.
- En tablas, cabeceras y fichas siempre va el nombre completo, cortado con elipsis si no cabe a 320 px.

## 4. Arquitectura de información

### 4.1 Rutas, barra e historial

La ruta vive en el hash con forma `#/<pantalla>?<parámetros>`. No hay modales: toda pantalla es una ruta.

| Ruta | Pantalla | Parámetros | Destino activo en la barra |
|---|---|---|---|
| `#/` | Mi equipo | ninguno | Mi equipo |
| `#/jornada` | Jornada | `s`, `g`, `r` | Jornada |
| `#/tabla` | Tabla | `s`, `g`, `v` (`puntos`, `goles`, `forma`, `casa`, `fuera`) | Tabla |
| `#/explorar` | Explorar | `s`, `q` | Explorar |
| `#/partido` | Partido | `s`, `g`, `r`, `h`, `a` | el de origen (ver abajo) |
| `#/equipo` | Equipo | `s`, `g` (**obligatorio**), `t` | Mi equipo si `(s, g, t)` es mi equipo; si no, Explorar |
| `#/ligas` | Sin `f`: competiciones de la categoría (filtradas por isla si llega `i`). Con `f`: grupos de esa competición | `s`, `c`, `i`, `f` (clave de competición, §5.3), `to` (`tabla` o `jornada`) | Explorar, o el de `to` si viene de «Otro grupo» |
| `#/copa` | Copa o torneo | `s`, `g` | Explorar |
| `#/goleadores` | Goleadores | `s`, `c`, `g` (vacío = global), `t` (filtra por equipo), `q` (búsqueda) | Explorar |
| `#/temporadas` | Archivo | ninguno | Explorar |
| `#/records` | Récords | `s`, `c` | Explorar |
| `#/fuentes` | Datos y fuentes | ninguno | Explorar |
| `#/ajustes` | Ajustes | ninguno | Explorar |

**Barra:**
- `aria-current="page"` solo en el destino que coincide con la ruta. En las secundarias, el destino marcado lleva `aria-current="true"`.
- **Destino de origen de Partido:** el último destino principal visitado en la sesión. Si se entra por enlace directo: Mi equipo si el partido es de mi equipo, Jornada en otro caso.

**Valores por defecto:**
- `s` = `PORTAL.season`.
- `g`, en Jornada y Tabla:
  - el grupo resuelto de mi equipo (§6);
  - si `s` no es la temporada actual, el primer grupo de liga de la categoría de mi equipo que contenga su nombre;
  - si no hay ninguno, redirección a `#/ligas?s&c` con un aviso.
- Si mi equipo no está resuelto (estado E, pregunta pendiente; o X, ausente), Jornada y Tabla abren `#/ligas` de la temporada actual con el aviso «Elige tu equipo en Mi equipo».
- **Grupos que no son de liga:** si `#/tabla` o `#/jornada` reciben un grupo con `kind ≠ 'league'`, redirigen a `#/copa` con `replaceState`.

**Historial:**
- Cambiar de pantalla usa `pushState`.
- Cambiar jornada, vista de Tabla o búsqueda usa `replaceState`.
- **«‹» (volver):** `history.back()` si la entrada anterior es de la app. Si no, enlace al padre:
  - Partido → `#/jornada?s&g&r`;
  - Equipo, Copa, Goleadores y Ligas → `#/explorar`.

**Enlaces antiguos** (compartidos por WhatsApp; `readRoute` de `links.js`): se traducen con `replaceState`.

| Antiguo | Nuevo |
|---|---|
| `section=miequipo` | `#/` |
| `section=miequipo&team=X&group=G` | `#/equipo?g=G&t=X` (un enlace **nunca** cambia mi equipo) |
| `section=clasif&group=G` | `#/tabla?g=G` |
| `section=jornadas&group=G&round=R` | `#/jornada?g=G&r=R` |
| `…&match=[h,a,j]` | `#/partido?g&r=j&h&a` |
| `…&team=X` en otras secciones | `#/equipo?g&t=X`; sin `group`, a `#/explorar?q=X` |
| `section=goleadores` | `#/goleadores?g` |
| `section=isla&island=I` | `#/ligas?i=I` |
| `section=stats` | `#/records` |

`season` ausente = `PORTAL.season`. Riesgo aceptado: tras activar 2026/27, un enlace antiguo sin temporada apunta a la temporada nueva, y si el grupo ya no existe cae en `#/ligas`.

### 4.2 Mi equipo (portada)

Maquetas: `4-acta-roja.png` (estado A) y `6-1-pretemporada.png` (estado D). El estado lo decide `homeState()` (§5.6), que se **evalúa en este orden**. Solo cuentan los partidos de liga que no son contra retirados (§5.3), y el próximo partido es siempre el primer partido en estado `pendiente`.

**E. Elegir equipo.**
- Cuándo: `resolveMyTeam` devuelve `ask` (§6.3).
- En lugar del contenido va una caja «¿En qué equipo juega ahora?» con los candidatos (escudo, nombre, categoría y etiqueta de grupo) y la opción «Ninguno: buscar otro equipo», que lleva a Explorar.

**X. No aparece.**
- Cuándo: `resolveMyTeam` devuelve `absent`.
- Muestra «Las Mesas Hu. no aparece en 2026/27» y «Elegir equipo», que lleva a Explorar.

**D. Temporada terminada.**
- Cuándo, según `groupFinished(group, today)`: ningún partido `pendiente` y, además, se cumple una de estas dos:
  - la temporada del grupo no es `PORTAL.season`;
  - hoy es 1 de junio del año final de la temporada o posterior.
- Contenido (maqueta 6-1):
  - **Cabecera:** escudo, nombre y «Temporada 2025/26 terminada». Si se muestra la caja de la temporada siguiente: «A la espera de la temporada 2026/27».
  - **Caja «Temporada 2026/27»** (solo si el grupo es de `PORTAL.season` y `data-health.nextSeason.status === 'pending'`, o si no hay `data-health`):
    - casillas «Grupos: pendientes en esta web» y «Última comprobación: <checkedAt>» (sin hora si no hay `data-health`);
    - texto: «La temporada 2026/27 aparecerá aquí cuando la federación publique los grupos y se activen en esta web. Si hay más de un equipo de Las Mesas, te preguntaremos cuál es el tuyo.»
    - No hay casilla de «se revisa cada…», porque el sistema no comprueba la temporada siguiente.
  - **«Así terminó 2025/26»** (`seasonSummary`): posición «de N», puntos, balance G/E/P, goles a favor y en contra, último resultado y máximo goleador del equipo.
  - **«Verano»:** torneos de la categoría del equipo en los que participó (§6.4). Muestra la fase de grupos (puesto) y cada partido de cuadro, con «pasó por penaltis» cuando toque.
  - **«Ver toda la temporada 2025/26»**, que abre `#/equipo?s=2025-2026&g=<grupo>&t=<nombre>`.
  - **«Clasificación final»:** la fila propia y las dos de arriba y abajo, con #, Equipo, J, DG y Pts, más «ver completa», que abre `#/tabla?s&g`.

**B. Inicio de temporada.**
- Cuándo: el grupo no tiene ningún partido con resultado.
- El próximo partido se muestra normal.
- En lugar de Últimos cinco, goleadores y cifras, un único vacío: «Aún no se ha jugado ninguna jornada».
- La clasificación sale en el orden de la fuente, a cero. Si llega vacía, se muestra el vacío «Clasificación sin publicar».
- **Nunca se muestran datos de otra temporada bajo títulos de la actual.**

**C. Hueco.**
- Cuándo: hay partidos jugados, ninguno `pendiente`, y todavía no se cumple `groupFinished`.
- El bloque superior pasa a «Último partido» (resultado grande, que abre la ficha), con la nota «Próximo partido sin fecha publicada».

**A. En temporada** (maqueta 4). Por orden:
- **Cabecera:** escudo, nombre, etiqueta de grupo (§5.3) y «Cambiar», que lleva a `#/explorar` con el buscador enfocado.
- **Próximo partido**, con la cuenta atrás como contexto (`countdownLabel`: «hoy», «mañana» o «faltan N días», en `Atlantic/Canary`):
  - casillas de jornada, fecha y hora; local y visitante con escudos; el campo, o «Campo no publicado»;
  - botonera:
    - *Cómo llegar*, solo si hay campo;
    - *Calendario*, que descarga el `.ics` de ese partido;
    - *Compartir*, con `navigator.share` y el enlace al partido (si no hay `share`, copia el enlace).
- **Últimos cinco:**
  - casillas con G/E/P, el marcador desde el punto de vista del equipo y el rival (`teamShort`); cada casilla abre el partido;
  - enlace «calendario completo», que abre `#/equipo?s&g&t` de mi equipo en su ancla `#calendario`.
- **Clasificación completa**, con la fila propia resaltada.
- **Goleadores del equipo:** los 5 primeros y «ver todos», que abre `#/goleadores?s&g&t`.
- **La temporada en cifras** (`seasonSummary`, calculada con el modelo y nunca con `STATS`):
  - a favor y en contra, de la clasificación;
  - por partido, casa, fuera, mejor resultado y peor derrota, del calendario;
  - nota de cobertura (§7).
- **Frescura:** «Clasificación oficial de <fuente>, comprobada el <fecha, hora>» y «Ver fuentes».

**Primera visita, o almacén vacío:** `myTeam = PORTAL.defaultTeam`, completado con `season = PORTAL.season`. No hay asistente de bienvenida.

### 4.3 Jornada

Maqueta: `5-1-jornada.png`.
- «‹ Jornada N de M ›», con el intervalo de fechas.
- Partidos agrupados por día; el partido propio va primero y con resalte. Cada fila abre la ficha del partido.
- **Jornada por defecto** (`defaultRound`): la primera con algún partido sin resultado y fecha igual o posterior a hoy. Si no hay, la última con resultados.
- **Aviso** (`roundNotice(group, round)`). Los retirados nunca figuran en la lista de ausentes, y nunca se inventan emparejamientos.

  | Situación | Texto |
  |---|---|
  | Ningún equipo activo sin partido | sin aviso |
  | Algún equipo sin partido; la jornada tiene los partidos habituales del grupo (la moda de partidos por jornada) | «Sin partido en esta jornada: A[, B]». Si el grupo tiene retirados, se añade «(descansa o le tocaba contra <retirados>)» |
  | La jornada tiene menos partidos que la moda del grupo | «Faltan N partidos de esta jornada en la fuente» |

  Casos reales:
  - PG2, jornada 30: «Sin partido en esta jornada: RC Victoria y Arucas B (descansa o le tocaba contra CD Batán)».
  - PG3: la fuente borró del todo a un equipo retirado; en cada jornada faltan 2 equipos, pero la jornada está completa según su moda, así que no aparece «faltan».
- Botonera:
  - *Compartir jornada*;
  - *Calendario del grupo*: `.ics` de los partidos futuros del grupo; se oculta si no hay ninguno.
- «Otro grupo» → `#/ligas?s&c&i&to=jornada`.

### 4.4 Tabla

Maqueta: `5-2-tabla.png`.

**Móvil:** selector de vista, con #, Equipo y Pts siempre visibles.

| Vista | Columnas |
|---|---|
| Puntos | J, G, E, P, DG, Pts |
| Goles | GF, GC, DG, Pts |
| Forma | J, últimos 5, Pts |
| Casa y Fuera | J, G, E, P y Pts de esa condición (`homeAwayTable`, desde el calendario, con nota de cobertura) |

**Escritorio (≥1024 px):** todas las columnas y sin selector.

Además:
- Equipos retirados: «retirado» en la vista Forma.
- Debajo:
  - **Goleadores del grupo**: los 10 primeros con escudo, goles y PJ, y «ver todos» → `#/goleadores?s&g`. Si el grupo no tiene goleadores, un vacío.
  - **Procedencia** (`sourceInfo`): oficial, calculada o corregida, con enlace a la fuente.
- Cada equipo abre `#/equipo`.
- «Otro grupo» → `#/ligas?s&c&i&to=tabla`.

### 4.5 Partido

Maqueta: `5-3-partido.png`.
- Cabecera: «‹», etiqueta de grupo y jornada, *Compartir*.
- **Resultado:** casillas de fecha, hora y campo (o «no publicado»), escudos y marcador de 40 px. En eliminatorias resueltas por penaltis: «pasó por penaltis» y la tanda si se conoce (§9.3).
- **Goles**, en una sola cronología (`timelineFor`):
  - `MATCH_DETAIL` si hay una entrada inequívoca para el partido (§5.3), con tres columnas: goleador local | minuto y marcador parcial | goleador visitante;
  - si no, y hay acta, la lista de goleadores por equipo del acta, sin marcador parcial cuando falten minutos;
  - si no, un vacío.
  - Si la cronología existe y la suma de sus goles no coincide con el marcador, se avisa con las dos cifras y sus fuentes.
- **Alineaciones** (si hay acta):
  - titulares y suplentes con dorsal y goles, entrenadores y árbitro;
  - «Ver acta oficial» (§9.2).
  - Sin acta, el vacío «La federación no ha publicado el acta de este partido».
- **Cara a cara:** partidos entre ambos equipos **de la misma categoría**, con el partido actual resaltado.
  - Temporada actual: desde el modelo.
  - Temporadas anteriores: «Ver temporadas anteriores» las carga bajo demanda.
- **Contexto:** posición actual y forma de ambos, en una línea.
- Terminología: Local y Visitante; G, E y P.

### 4.6 Equipo (cualquier equipo)

Mismo esqueleto que Mi equipo, con los estados A, B, C o D; el D sin la caja de la temporada siguiente. Además:
- **«Hacer mi equipo»** arriba (salvo si ya lo es).
- **Calendario completo** del equipo (ancla `#calendario`), con cada partido y su estado (§5.3), y el botón «Calendario del equipo (.ics)» con todos los partidos de la temporada.
- **Evolución de puntos:** gráfica de línea sólida en tinta, sin puntos ni trazos discontinuos (preferencia del usuario), jornada a jornada, calculada con el modelo.
- **Plantilla** (si hay actas del grupo):
  - se construye desde `LINEUPS_<S>` filtrado por `(s, gr)` del grupo con `aggregatePlayerFromLineups`, **no** desde `PLAYERS_<S>`. PLAYERS indexa por nombre de equipo, y el mismo nombre en benjamín y prebenjamín mezclaría plantillas: 256 nombres coinciden en una misma temporada;
  - columnas: jugador (`playerName`), PJ, titular y goles;
  - la columna de tarjetas **solo aparece si algún jugador de la temporada tiene alguna**; hoy ninguno, porque el dato no se recoge;
  - al tocar un jugador se despliega su detalle, con sus partidos y el marcador desde su equipo. Botón con `aria-expanded`.
- **Trayectoria** (bajo demanda): una fila por temporada, categoría y equipo (nombre exacto) del mismo club (§6.1), con fase de liga más reciente, grupo, posición y puntos. Cada fila abre `#/tabla` de ese grupo y temporada.
- Visitar una ficha la añade a «Vistos hace poco» (máximo 8, sin duplicados).

### 4.7 Explorar

Maqueta: `5-4-explorar.png`.
- **Selector de temporada.**
- **Buscador:** por nombre normalizado, en ambas categorías de la temporada elegida, más los torneos. Cada resultado lleva escudo, categoría y etiqueta de grupo, y abre `#/equipo`.
- **Vistos hace poco.**
- **Ligas:** por categoría, con una entrada por competición (`competitionKey`, §5.3) y el recuento de grupos. Cada una abre `#/ligas?c&f`.
- **Copas y torneos:** «Copa de Campeones» (`#/ligas?f=copa-campeones`, con los campeones visibles) y «Maspalomas Cup 2026» (`#/ligas?f=maspalomas`).
- **Más:** Temporadas anteriores, Récords, Goleadores, Datos y fuentes, y Ajustes.

**Ligas** (`#/ligas`):
- La lista de grupos de la competición, con etiqueta, número de equipos, jornada y líder.
- Cada grupo abre `#/tabla` o `#/copa` según su `kind`, o la pantalla de `to` si viene de «Otro grupo».
- En competiciones de varios grupos de liga, la vista **«Comparar grupos»**: tabla unificada por puntos por partido, que conserva la comparativa de prebenjamín actual.

**Copa** (`#/copa`):
- **Cuadro:** una ronda por pantalla en móvil (desplazamiento horizontal con ajuste y pestañas de ronda); todas las columnas en escritorio.
  - Campeón arriba.
  - Quién pasó, incluidos penaltis, y el camino de mi equipo resaltado.
- **Liguilla** (`isRoundRobinCup`): tabla y partidos.

**Goleadores** (`#/goleadores`):
- La lista **completa** con buscador, escudo, goles, PJ y equipo (abre su ficha).
- Global de la categoría, o de un grupo.
- Solo en temporadas con goleadores; si no hay, un vacío.

**Récords** (`#/records`):
- **Temporada actual:**
  - totales de partidos y goles, y media;
  - máximos goleadores (los 30 primeros y «ver todos»);
  - mayor goleada y partido con más goles;
  - más goles a favor y menos en contra, con un mínimo de 10 partidos;
  - mejor racha de victorias y mejor racha invicta (`bestStreaks`, calculadas con el modelo);
  - mejores local y visitante, con mínimo de partidos.
- **Temporadas anteriores:** lo mismo sin goleadores.
- Cada récord enlaza a su partido o equipo.

**Fuentes** (`#/fuentes`):
- Última comprobación y último cambio.
- Por grupo, con su **etiqueta legible**: estado, mensaje y enlace a la fuente.
- Estado de la temporada siguiente, con el texto de §4.2.D.

**Ajustes** (`#/ajustes`): mi equipo (cambiar) y «Borrar datos de esta app» (almacén local).

### 4.8 Escritorio (≥1024 px) y tableta

- **Cabecera:** marca a la izquierda y los 4 destinos en pestañas, con un ancho máximo de 1120 px.
- **Mi equipo en dos columnas.**
  - Izquierda: próximo o último partido, Últimos cinco y calendario completo del equipo.
  - Derecha: clasificación, goleadores y cifras.
  - En móvil, el calendario completo no está en la portada, sino en «calendario completo».
- **Tabla:** todas las columnas. **Jornada:** los días en dos columnas si caben.
- **Tableta (769–1023 px):** diseño móvil centrado a 640 px, con la barra inferior.

### 4.9 Tema

- Solo por CSS: tokens claros en `:root` y oscuros en `@media (prefers-color-scheme: dark)`.
- No hay selector, ni se guarda nada.
- La clave antigua `localStorage.theme` se ignora.
- `meta theme-color` se da dos veces, una por esquema (`media`).

### 4.10 Sin conexión

- Aviso en la cabecera: «Sin conexión. Datos del <lastDataChange de data-health o, si falta, del literal 'Última actualización'>».
- Lo que requiere un fichero perezoso que no está en caché muestra la caja de error con «Reintentar» (§7).

### 4.11 Funciones del diseño anterior: dónde quedan

| Antes | Ahora |
|---|---|
| Top 30 goleadores globales | Récords (30) y `#/goleadores` (lista completa) |
| Comparativa de prebenjamín por puntos por partido | «Comparar grupos» en `#/ligas` |
| Evolución de puntos de la ficha de equipo | Ficha de equipo (§4.6) |
| `.ics` de la temporada del equipo | Ficha de equipo (§4.6) |
| `.ics` de la jornada | *Calendario del grupo* (solo partidos futuros) |
| Por isla | Explorar → Ligas (filtrado por isla) |
| Estadísticas | Récords |
| Contadores de la cabecera y lemas de sección | Se eliminan |
| Selector de tema | Se elimina: sigue al sistema (decisión del usuario) |
| Indicador ⚽ de cronología en listas | Se elimina: se ve al abrir el partido |
| Varios favoritos con pestañas en la portada (v1 guardaba hasta 30) | Un solo «mi equipo» más «Vistos hace poco» (8), según la decisión «uno + echar un ojo». La migración lleva a `recent` los 8 primeros favoritos restantes; el resto se descarta |
| «Comparación en liga» (9 filas) y «Rachas actuales» en la ficha de partido | «Contexto» en una línea, con posición y forma de ambos equipos |
| Plantilla desde `data-players-*.js` | Desde `LINEUPS_<S>` por grupo (§4.6). `data-players-*.js` deja de cargarse y su generación se retira en B4 |

## 5. Arquitectura técnica

### 5.1 Principios

- Módulos ES en `src/`, **planos** (sin subcarpetas) e **importados de forma estática**, sin `import()` dinámico. Así el grafo de precache y su test los ven.
- Sin paso de compilación.
- **La URL es la fuente de verdad** de lo visible. El estado persistente (mi equipo, vistos) vive en un almacén versionado (§6.5).
- **Plantillas con escapado automático:** la etiqueta `html\`…\`` escapa toda interpolación, y `raw()` solo acepta fragmentos producidos por `html`.
- **Contrato de pantalla:**

  ```
  export const screen = {
    needs(params) → Promise[]                              // cargas perezosas que necesita (§5.4)
    render(ctx) → Html                                     // pura y síncrona
    mount?(root, ctx)                                      // comportamiento: plegar, deslizar
  }
  ctx = { model, params, myTeam, today, health, datasets } // today inyectado (reloj único)
  ```

  El router pinta el esqueleto de la pantalla, resuelve `needs` y pinta `render` **solo si su token de navegación sigue vigente**. Una respuesta lenta nunca pinta sobre otra ruta; sustituye a `fillIfCurrent`.
- **Delegación de eventos** en la raíz. Todo lo pulsable es `<a href>` o `<button>`.
- Se pinta solo lo visible: nada de tarjetas ocultas generadas.

### 5.2 Módulos

| Módulo | Responsabilidad |
|---|---|
| `app.js` | Arranque: almacén, router y primera pantalla |
| `config.js` | Sin cambios (`export const PORTAL = {JSON}`) |
| `state.js` | **Carga de datos y funciones de dominio heredadas.** Cargadores perezosos con un único vuelo por petición: `ensureSeasonData`, `ensureMatchDetail`, `ensureLineups`, `ensurePlayers`, `ensureStats` y `ensureSeasonCups` (nombra literalmente `MASPALOMAS_CUP_BENJAMIN` y `MASPALOMAS_CUP_PREBENJAMIN`). `dataVersion()`. Funciones puras de jornada, copa y escudo: `knockoutRoundLabel`, `matchAdvancer`, `bracketChampion`, `isRoundRobinCup`, `shieldFile(name)` (fichero de escudo exacto o normalizado, sin HTML; sustituye a `teamBadge`), `normalizeTeamName`, `normalizeForTeamsMapping`, `countMatches`… **Pierde** el HTML y el estado de interfaz `S` y `FEATURED`. El componente de escudo, con miniatura, tamaños, carga diferida y monograma, vive en `ui.js` |
| `model.js` | Modelo normalizado (§5.3) y funciones puras de §5.6 |
| `myteam.js` | Identidad de club y resolución de mi equipo (§6) |
| `links.js` | `parseRoute`/`routeHref` (formato nuevo), `readRoute` (legado) y `translateLegacy`. Fechas (`fixtureISO`, `displayDate`, `kickoffUTC`, `countdownLabel`), `buildCalendar` (ICS), `venueUrl` y compartir |
| `store.js` | Almacén `futbol-base:v2` y migración (§6.5) |
| `html.js` | `html`, `raw` y utilidades de lista |
| `ui.js` | Componentes de §3.3 |
| `shell.js` | Cabecera, barra, `aria-current`, aviso sin conexión y esqueletos |
| `router.js` | `hashchange`/`popstate`, traducción de enlaces antiguos, tokens de navegación, scroll por ruta y foco al `h1` |
| `screen-*.js` | Pantallas: `home`, `jornada`, `tabla`, `partido`, `equipo`, `explorar`, `ligas`, `copa`, `goleadores`, `temporadas`, `records`, `fuentes` y `ajustes` |

**Firmas que cambian** (dejan de leer `S`/`FEATURED`): `isFeatured`, `featuredStandingFrom`, `featuredMatchesFrom`, `featuredScorersFrom`, `getData`, `getTeamForm` y `withSeasonCup` pasan a recibir equipo, categoría y temporada como parámetros. Los tests que mutan `state.S` o leen `FEATURED` se **reescriben**.

**Se mueven**, con sus tests, a `model.js` o `links.js`:
- `matchDateISO`, `localTodayISO` y `countdownLabel` (en minúsculas). `seasonOutlook` se elimina y la sustituyen `matchState` y `groupFinished`;
- `sortPlantillaRows`, `aggregatePlayerFromLineups` y `mergeAndOrderEvents`;
- `resolveSeasonDataset`, `filterCompetitionGroups` y `sourceInfo`.

**Se eliminan:**
- los módulos `render.js`, `modals.js`, `miequipo.js`, `init.js`, `favorites.js`, `filters.js`, `health.js`, `plantilla.js` y `matchdetail-rich.js`;
- las funciones `goalBarPct` (no hay barras) y `updateSearchCount`;
- los estados de partido basados en `m[8]`;
- los dos detectores de copa, sustituidos por `groupKind` (§5.3).

### 5.3 Modelo normalizado (`model.js`)

```
Season  { name, current, groups: Group[] }                 // ligas y copas FIFLP de ambas categorías
Group   { season, id, cat, name, fullName, phase, island, compKey, label,
          kind: 'league'|'cup-bracket'|'cup-league', url|null, standingsKind,
          standings: Row[], rounds: Round[], currentRound|null }
Row     { pos, team, pts, pj, g, e, p, gf, gc, dg, retired }
Round   { key, label, n|null, dateFrom|null, dateTo|null, matches: Match[] }
Match   { season, groupId, roundKey, dateISO|null, time|null, venue|null, home, away,
          hs|null, as|null, advancer: 'home'|'away'|null, shootout: 'h-a'|null, state }
Cups    { season, cat, groups: Group[] }                   // torneos (Maspalomas), capa aparte
```

**Formato de fila de partido, único y por posición** (el mismo que `HISTORY`):

```
[fecha, local, visitante, gl, gv, pen, hora, campo, tanda?]
 0      1      2          3   4   5    6     7      8
```
- `pen` es `'home'`, `'away'` o `null`: quién pasó en una eliminatoria.
- `tanda` es `'h-a'`, opcional.
- `model.js` acepta filas de **5** (temporadas antiguas sin detalle), **6** (cuadros de la Maspalomas y copas FIFLP), **8** y **9** columnas.
- Las filas inline de la **fase de grupos de la Maspalomas** usan otro orden, `[fecha, hora, local, visitante, gl, gv, campo]`, y se leen con su adaptador propio.

**Reglas:**
- **Fechas:** `fixtureISO` (tres formatos, año según la temporada).
- **Temporada actual:** partidos desde `HISTORY[id]` (nunca desde `matches` inline, que solo trae una jornada) y tabla desde `standings`.
- **Históricas:** `SEASON_*.{cat}[i].jornadas`.
- **Torneos** (`Cups`): capa aparte, asíncrona y memorizada por separado (`ensureSeasonCups`). El `Season` memorizado **no** depende de ella.
  - Fase de grupos: filas inline con su adaptador; `kind = 'cup-league'`.
  - Cuadros: `jornadas` + `pen` + `tanda`; `kind = 'cup-bracket'`.
- **`groupKind(group)`:** un solo detector, que unifica `isCupGroup` e `isKnockoutGroup` y aplica `isRoundRobinCup` (la regla del embudo).
- **`competitionKey(group)` → `{cat, island, division, phase, cup, key, label}`**, que separa tres ejes:
  - `division`: `preferente`, `primera` o `unica`;
  - `phase`: `primera-fase`, `segunda-fase`, `segunda-a` a `segunda-e`, `fase-1`, `fase-2`, `oro`, `plata`, `bronce` o `null`;
  - `cup`: `campeones`, `insular` (Copa Fuerteventura, Copa Delegación, Copa Cabildo…), `maspalomas` o `null`.

  El plan saca de la base todas las combinaciones reales de temporada × `phase` (unas 60) y las pone en una tabla de equivalencias. Un test comprueba que **ninguna fase existente queda sin clasificar**.
  - `label` es la etiqueta legible de grupo: «Prebenjamín, Grupo 2 de Gran Canaria», «Benjamín, Segunda Fase A, Grupo 2».
- **`retiredTeams(group)`**, la única definición de retirado:
  1. equipo de la clasificación que no aparece en ningún partido del calendario, con `pj > 0` y `g + e = 0` (Batán en PG2: 0-0-28 y 0 partidos en `HISTORY`), o con `pj = 0` en un grupo terminado;
  2. o equipo que aparece en el calendario, no tiene fila en la clasificación y no tiene ningún resultado: «CD Teguinte» en PFV2, «COTILLO, C.D. EL» y 'CORRALEJO, C.D. "B"' en FV11.

  Los partidos contra retirados se excluyen del próximo partido, de `defaultRound`, de `groupFinished` y de la cobertura.
- **`state` de partido:**

  | Estado | Condición |
  |---|---|
  | `jugado` | marcador conocido |
  | `pendiente` | sin marcador y fecha hoy o posterior |
  | `sin resultado` | sin marcador y fecha pasada |
  | `sin fecha` | sin fecha |

  - Se calcula con `fixtureISO` (tres formatos de fecha).
  - `sin fecha` y `sin resultado` se ven en el calendario con su estado, pero **no cuentan como próximos partidos**.
  - Se sustituye a `seasonOutlook`, que contaba los partidos sin fecha como próximos y no entendía `DD-MM-YYYY`.
  - «Aplazado» y «no disputado» solo aparecerán si algún día hay un estado explícito en los datos.
- **Identidad de partido en rutas:** `(s, g, r, h, a)`, única por construcción.
- **Cronología y actas:** siguen indexadas por `home|away|hs-as` en ficheros perezosos.
  - Tras §9.2, cada entrada es `{s, gr, g}` si la clave es única, o `{dup: true, list: [{s, gr, g}, …]}` si está repetida.
  - `timelineFor(match)` usa la entrada (o el elemento de `list`) cuyo `(s, gr)` coincide con el partido. Si no coincide ninguno, o coinciden varios, no hay cronología.
  - En listas no se indica si un partido tiene cronología: `hasTimeline` no forma parte del modelo.

### 5.4 Carga de datos y rendimiento

- **Inmediatos** (`<script defer src="./data-X.js?v=…">` antes del módulo), que necesita la portada:
  - `data-benjamin.js`, `data-prebenjamin.js`, `data-history.js`, `data-goleadores.js`, `data-shields.js` y `data-seasons.js`.
  - Se leen con identificador desnudo y comprobación `typeof`, nunca con `globalThis` ni `window`.
- **Perezosos** (`fetch` + expresión regular + `JSON.parse`, con un único vuelo por petición):
  - `data-season-*.js`, `data-matchdetail.js`, `data-lineups-*.js` y `data-players-*.js` (como hoy);
  - **nuevos:** `data-stats.js` (Récords) y `data-maspalomas-cup-2026.js` (Explorar, Copa, Verano, buscador y ficha de equipo).
- **`dataVersion()`:** todos los perezosos toman `?v=` de `script[src*="data-seasons.js"]`, que siempre se mantiene. Hay un test que comprueba que cada petición perezosa lleva la versión actual.
- **Se deja de generar `data-matchdetail-keys.js`.** Se tocan a la vez:
  - `generate_js.py` (generador y lista de salida);
  - `test_pygen_fixes.py` (505-541);
  - `test_js_modules.mjs` (32, 238-248, 263-297);
  - `test_sw_fixes.mjs` (94-98);
  - `sw.js`, `index.html` y el fichero del repo.
- **Esqueleto estático:** `index.html` lleva la cabecera, la barra y una primera caja de alto fijo, común a todos los estados de la portada. El resto queda por debajo del pliegue. Es lo que justifica `defer`: el esqueleto se pinta antes de que lleguen los datos, y `app.js` lo sustituye.
- **Escudos en miniatura:**
  - `scripts/build_crests.py` (Pillow) genera `escudos/s/<nombre original sin extensión>.png` a 96×96, optimizados. Se ejecuta a mano cuando se añade un escudo.
  - La interfaz pide primero `escudos/s/`; si falla, el original y, si también falla, el monograma.
- **Presupuesto** (misma medición que la auditoría: 4G lenta y CPU ×4):
  - contenido de la portada visible en menos de 3 s (antes 6,2 s);
  - CLS menor de 0,1 (antes 1,13), medido en el estado A con datos de prueba y reloj fijado;
  - menos de 300 KB de imágenes en Tabla (antes 986 KB).

### 5.5 PWA

- **Contrato de `sw.js` sin cambios:**
  - la línea 1 es `CACHE_NAME`;
  - los literales `STATIC_ASSETS` y `SEASON_FILES`;
  - `classifyRequest`, `staleKeysFor`, `matchIgnoringVersion`, `versionedAssetURL` y `putAndPurge`.
- **`STATIC_ASSETS`**:
  - `./`, `./index.html`, `./style.css`, `./manifest.json` y `./data-health.json`;
  - los iconos de `icons/`;
  - `fonts/*.woff2`;
  - todo el grafo de imports estáticos de `src/app.js`;
  - los `data-*` inmediatos.
- **`SEASON_FILES`:** los `data-season-*.js`, más `data-maspalomas-cup-2026.js` y `data-stats.js`, que son perezosos pero se usan en la portada y en el buscador sin conexión.
- Las miniaturas de escudos se guardan en caché según se usan (cache-first).
- **Manifiesto:**
  - iconos PNG en `icons/` (192, 512 y maskable 512) y `apple-touch-icon` PNG de 180;
  - `theme_color` y `background_color` del tema claro;
  - `description`;
  - `start_url: ./index.html#/`.
- **Despliegue del rediseño:**
  - suben a la vez `CACHE_NAME` y todos los `?v=`;
  - **no se toca** el literal «Última actualización», que alimenta `lastDataChange` en data-health;
  - `bump_cache_version()` gana el parámetro `touch_footer`, **`True` por defecto**, para que el bot siga moviendo el pie. El despliegue del rediseño pasa `False`. El test comprueba los dos caminos.
- `tests.yml` añade `fonts/**`, `icons/**` y `escudos/**` a su filtro de rutas.

### 5.6 Funciones puras nuevas, con tests (firma y casos)

- `homeState({resolution, model, today, health})` → `'E'|'X'|'D'|'B'|'C'|'A'`, evaluado en el orden de §4.2.
- `groupFinished(group, today)` y `showNextSeasonBox({group, health})` (§4.2.D).
- `resolveMyTeam(myTeam, season, today)` → `{status: 'ok', group, name, cat}` | `{status: 'ask', candidates}` | `{status: 'absent'}` (§6.3).
- `baseKey(name)`, `buildClubIndex(names, shields, aliases)` y `sameClub(index, a, b)` (§6.1).
- `competitionKey(group)` y `groupLabel(group)` (§5.3).
- `groupKind(group)`, `matchState(match, today)` y `retiredTeams(group)`.
- `defaultRound(group, today)` y `roundNotice(group, round)` (§4.3).
- `homeAwayTable(group)`, `coverageNote(team, group)` y `bestStreaks(season, cat)`.
- `countdownLabel(dateISO, today)`, `playerName(raw)` y `teamShort(name)`.
- `timelineFor(match, matchDetail, lineups)`.
- `seasonSummary(team, group)`, que alimenta las cifras y el «Así terminó».

## 6. Mi equipo a través de temporadas y fases

### 6.1 Identidad de club

El club es la **componente conexa** de un grafo sobre el universo de nombres: equipos de liga de las temporadas cargadas, claves de `SHIELDS` y nombres de torneo. `buildClubIndex` construye el grafo una vez (union-find), y `sameClub(index, a, b)` es cierto si `a` y `b` quedan en la misma componente. Por eso la relación es transitiva. Hay arista entre dos nombres si se cumple cualquiera de estas condiciones:

1. **Mismo fichero de escudo** en `SHIELDS` (exacto o normalizado). `lasMesasEscudo.png` agrupa «Las Mesas Hu.», «Las Mesas B», «L.Mesas Hu. B» y 'MESAS, U.D. LAS "B"'.
2. **Misma clave base:** `baseKey(n)` = `normalizeForTeamsMapping(n)` sin siglas y sin un último token de una letra [a-e]. Esto une «RC Victoria» (`victoria.png`) con «RC Victoria B» (`victoria2019.png`), que el escudo separa.
3. **Alias explícito:** tabla versionada en `myteam.js`, con tests, para nombres de torneos y de la federación. Por ejemplo, `'UD Las Mesas Huracán' → 'Las Mesas Hu.'`.

**Tests con los nombres reales:**
- «Las Mesas Hu.», «Las Mesas Hu. B», «L.Mesas Hu. B», «Las Mesas B» y «UD Las Mesas Huracán» → mismo club;
- «RC Victoria» y «RC Victoria B» → mismo club;
- un par de filiales de Lanzarote que siga existiendo tras §9.4 (por ejemplo «US Yaiza» y «US Yaiza B»; el plan elige el par real) → mismo club;
- «Las Mesas Hu.» y «AD Huracán» → **distintos**, también a través de «UD Las Mesas Huracán».

**Riesgo aceptado:** `SHIELDS` comparte algún fichero entre nombres que quizá no son el mismo club; por ejemplo, `unionviera.png` para «Garepa Viera». La relación solo sirve para proponer candidatos y la pregunta del estado E los enseña con su nombre, así que un falso candidato no causa un cambio silencioso.

### 6.2 Qué se guarda

`myTeam = { name, season, cat, groupId }`. La migración y `PORTAL.defaultTeam` rellenan `season = PORTAL.season`.

### 6.3 Resolución (`resolveMyTeam`)

**Candidatos de un club en una categoría:** solo se buscan en los grupos de liga de la fase más reciente de esa categoría (los que tienen partidos `pendiente` o, si no hay ninguno, los de nivel más alto según `competitionKey`). Se toma **uno por equipo** (nombre exacto).

**Paso 0, el caso normal, sin preguntas.** Se aplica si `myTeam.season === PORTAL.season` y el grupo `myTeam.groupId` sigue conteniendo `myTeam.name`.
- **Cambio de fase:** si el grupo guardado no tiene partidos `pendiente` y en `myTeam.cat` hay otro grupo de liga con el mismo `name` que sí los tiene, se pasa a ese grupo en silencio. Es el caso de Primera a Segunda Fase.
- **Filial que cambia de nombre:** si el grupo guardado no tiene partidos `pendiente`, no hay grupo con el mismo `name` que los tenga, pero sí grupos con partidos pendientes con un equipo del mismo club, se pasa al paso 2. Es el caso de «Las Mesas Hu. B» en FF13 frente a «Las Mesas B» en B2.
- **En cualquier otro caso** se usa el grupo guardado.

**Paso 1, cambio de temporada** (`myTeam.season ≠ PORTAL.season`). Se buscan candidatos del mismo club (§6.1) en ambas categorías:
- **Uno:** se usa, y se actualizan `{season, cat, groupId, name}`.
- **Varios:** estado E. La respuesta fija `{season, cat, groupId, name}` y no se vuelve a preguntar esa temporada. Esto incluye el caso de que `myTeam.name` exista tal cual solo en una categoría y otro equipo del club esté en la otra.
- **Ninguno:** estado X.

**Paso 2, el grupo guardado ya no sirve** (misma temporada). Como el paso 1, pero solo en `myTeam.cat`. Si solo hay un candidato y tiene el mismo nombre, se usa sin preguntar; en cualquier otro caso, se pregunta.

Los estados D, B, C y A se calculan después, sobre el grupo resuelto.

### 6.4 Verano

Busca en `Cups` de la temporada terminada, **solo de `myTeam.cat`**, los grupos de torneo con un equipo del mismo club (§6.1, con alias).

Test con datos reales: para PG2 Las Mesas salen MCP3 (Grupo C, 3.º) y MCPK1 (Copa Plata: previa 1-4, cuartos 1-1 por penaltis y semifinal 2-4). MCB16 y MCBK2 (benjamín) quedan fuera.

### 6.5 Almacén y migración

- **`futbol-base:v2`:** `{ myTeam, recent: [{s, g, t}] }`.
- **Migración única** desde `futbol-base:favorites:v1`:
  - `selected` es la clave `cat|groupId|normalizeTeamName(name)`; se resuelve contra `teams` de v1 para obtener el nombre.
  - `myTeam` toma `season = '2025-2026'`, el literal de la única temporada con favoritos v1, **no** `PORTAL.season`. Así, si el rediseño se publica después de activar 2026/27, se ejecuta el paso 1 y no se da por bueno en silencio un grupo con el mismo código de otra temporada.
  - Si el grupo guardado es de un torneo (MC*), se pasa al paso 2.
  - El resto de favoritos pasa a `recent` (los 8 primeros).
  - v1 no se borra.
- Las claves `season`, `cat` y `theme` antiguas se ignoran.
- Si `localStorage` falla, se usan los valores por defecto en memoria.

## 7. Estados, errores y honestidad

- **Carga:** esqueleto con las dimensiones finales, sin saltos.
- **Error de un fichero:** caja «No se pudieron cargar los datos de <qué>» con «Reintentar». Nunca se cae a datos de otra temporada.
- **Cobertura** (`coverageNote`): cuando se calcula desde el calendario y no coincide con el PJ de la clasificación.
  - Descuenta los partidos contra retirados y lo dice: «26 partidos en el calendario y 2 contra CD Batán (retirado)».
  - Solo si falta algo más: «N de M partidos con resultado».
- **Datos contradictorios:** ambas cifras con su procedencia.
- **Frescura:** `data-health.json` alimenta «comprobada el <fecha, hora>». Se reescribe solo con cambios o una vez al día, y así se presenta, nunca como «ahora».

## 8. Accesibilidad

- «Saltar al contenido». Un `h1` por pantalla, con el foco en él al navegar.
- `aria-current` según §4.1.
- Todo lo pulsable es `a` o `button`, de al menos 44 px en móvil. `:focus-visible` con contorno de 2 px en tinta.
- Desplegables (plantilla, «ver todos») con `aria-expanded`.
- Tablas con `<th scope>` y `<caption>` visualmente oculto.
- Contraste AA en ambos temas (§3.1). La forma siempre lleva letra.
- Sin desplazamiento horizontal a 320 px, salvo el cuadro de copa, donde es intencionado.
- `lang="es"`. Fechas y horas en `Atlantic/Canary`.

## 9. Plan A: cambios en la capa de datos

Solo se exportan columnas que ya existen. Cada cambio lleva su test en `scripts/tests/`.

**Verificación en local, antes de publicar el plan entero:**
1. fixer;
2. `generate_js.py`;
3. `fetch_futbolaspalmas.py`;
4. `pytest` y `node --test`.

La fuente no puede deshacer los cambios. La interfaz actual tiene que seguir funcionando igual.

1. **Hora y campo en temporadas pasadas.**
   - `generate_js.py` exporta las filas de 8 columnas ya existentes `[fecha, local, visitante, gl, gv, null, hora, campo]` en **todas** las temporadas: se quita la condición `season_name >= '2025-2026'` de la línea ~1009. Hay unos 5.400 partidos con hora y campo sin publicar.
   - La interfaz actual ya lee `m[6]` y `m[7]` en `group.jornadas` (`render.js:532`, `init.js:101`), así que funciona sin cambios.
   - `test_js_modules.mjs:145` pasa a aceptar 5 u 8 columnas.
2. **Cronología y actas sin colisiones.**
   - Las entradas de `MATCH_DETAIL[clave]` y `LINEUPS_<S>[clave]` añaden `s` (temporada) y `gr` (código de grupo).
   - Si dos partidos producen la misma clave, se exporta `{dup: true, list: [{s, gr, g}, …]}` en lugar de sobrescribir. La interfaz actual lee `.g`, recibe `undefined` y no muestra cronología, igual que hoy.
   - Tests:
     - ninguna clave se sobrescribe en silencio;
     - 'CD Calero|La Garita|1-11' da una cronología en FF15 y otra en PG2.
   - `LINEUPS_<S>[clave]` añade `cod` (`matches.cod_acta`). La interfaz construye `https://www.fiflp.com/pnfg/NPcd/NFG_CmpPartido?cod_primaria=1000120&CodActa=<cod>&cod_acta=<cod>`, que es la URL que usa `fetch_fiflp_actas.py:331`.
   - En el Plan B se comprueba abriendo la URL varias veces en un navegador limpio, sin sesión. Si no abre de forma fiable, se muestra «Acta nº <cod>» sin enlace.
3. **Tanda de penaltis de la Maspalomas Cup.**
   - `row_short` de `fetch_maspalomas_cup.py` pasa a emitir, en los cuadros, `[día, local, visitante, gl, gv, pen|null, hora, campo corto, tanda|null]`, con `m['time']` y `short_field(m['field'])`.
   - La tanda `"h-a"` sale de `penaltyHomeScore`/`penaltyAwayScore` del raw, presentes en los 24 partidos resueltos por penaltis.
   - Se verifica con `--from-raw`.
   - El índice 5 sigue siendo quién pasó. Se actualizan el test dorado y el de `row_short` de `test_maspalomas_cup.py`.
4. **Lanzarote benjamín 2025-26: LZ1-4 frente a LZS1-4.**
   - **Diagnóstico:** es la misma competición con dos fuentes, pero **no son copias exactas**. Coinciden 261 de 342 partidos por jornada, fecha y marcador, y las clasificaciones difieren en algún puesto.
     - LZ (futbolaspalmas) tiene URL, la mantiene viva `update.yml` y aporta goleadores y cronología.
     - LZS (FIFLP) aporta el campo en todos los partidos.
   - **Decisión: se conserva LZ1-4.** Un fixer en `scripts/_archive/`:
     1. copia `venue` (y `time` si falta) de LZS a LZ en los partidos que emparejan sin ambigüedad por número de jornada, fecha y marcador;
     2. escribe en su log los partidos y las filas de clasificación que difieren, para revisarlos;
     3. borra LZS1-4 con `delete_group`;
     4. ejecuta `generate_js.py` en el mismo paso.
   - **Guardián nuevo** en `test_db_sanity`. Compara grupos de la misma temporada, categoría e isla:
     - solo con los partidos con fecha y marcador;
     - solo si ambos grupos tienen al menos 10 de esos partidos;
     - como denominador, el grupo menor.

     Si coinciden al menos un 70 % por (número de jornada normalizado, fecha ISO, gl, gv), el test falla. La clave con ids de equipo no sirve entre fuentes.
   - **Test negativo:** PLZ1 y PLZ2 de 2024-25 (dos grupos distintos que comparten fechas sin marcador) no disparan el guardián.
   - **Comprobación del plan:** en las 5 temporadas, el guardián solo salta con LZ y LZS antes del fixer, y con nada después.

## 10. Restricciones que se respetan

**`index.html`:**
- las etiquetas `<script … src="./data-*.js?v=…">` de los inmediatos (un `defer` no rompe ninguna regex; verificado);
- el literal oculto `Última actualización: dd/mm/aaaa`;
- `navigator.serviceWorker.register('./sw.js')` + `.update()`, sin `unregister`;
- todas las `?v=` con el formato `\d{8}[a-z]?`; la primera `?v=` del fichero decide el sufijo.

**El resto:**
- `sw.js`: línea 1 y literales. `src/config.js`: JSON puro.
- Islas `grancanaria`, `lanzarote` y `fuerteventura`. `src/` plano.
- Globales de datos con comprobación `typeof`; nunca `globalThis` ni `window`.
- En pruebas de navegador, `waitForAsync` y nunca `waitForFunction` con predicado asíncrono.
- Las suites de Node y Python bloquean al bot: cada commit que llega a `main` lleva todas las suites en verde.
- Nunca se empuja con un workflow en marcha.

## 11. Pruebas

- **Se conservan** los tests de lógica pura, con los imports actualizados. Los que dependían de `S`/`FEATURED` se reescriben (§5.2).
- **Se borran** los de detalle visual del diseño anterior: casi todo `test_uxui2_fixes`, parte de `test_uxui_fixes` y de `test_sp2_modules`.
- **Se reescriben** los de intención contra el código nuevo:
  - sin `globalThis` y escapado;
  - error honesto con «Reintentar»;
  - cuadro frente a liguilla y penaltis;
  - G/E/P;
  - `aria-current`;
  - contraste AA y `tabular-nums`.
- **Unitarios nuevos:** cada función de §5.6, más:
  - `html.js`: escapa todo, y `raw` solo acepta fragmentos de `html`;
  - `store.js`: migración, `localStorage` que falla y claves antiguas ignoradas;
  - `links.js`: ida y vuelta de cada ruta y cada fila de la tabla de enlaces antiguos de §4.1;
  - el token de navegación del router;
  - `dataVersion()` en cada petición perezosa.
- **Casos reales de hoy.** Usan **fixtures congeladas** en `scripts/tests/fixtures/rediseno/`: extractos de PG2, PG3, A2, FF5, FF13, B2, PFV2, MCP3/MCPK1, `data-health` y un favorito v1. `today` se inyecta. **Nunca se leen los `data-*.js` ni `config.js` vivos**, que cambian al activar 2026/27 y bloquearían al bot.
  1. 23/09/2026, `PORTAL.season` 2025-26 y `nextSeason` pendiente → `homeState` D con la caja de la temporada siguiente, sin pregunta. El 15/06/2026 → D sin esa caja si `nextSeason` no está pendiente; una ficha de 2024-25 → D sin caja.
  2. Migración v1 con `selected` = `'prebenjamin|PG2|las mesas hu'` y «Las Mesas Hu.» también en A2 y FF5 → con `PORTAL.season` 2025-26, paso 0, **sin pregunta**. Con 2026/27 activada, paso 1.
  2b. `myTeam` = FF13 «Las Mesas Hu. B» (terminado) y B2 con «Las Mesas B» pendiente → pregunta (filial que cambia de nombre). Candidatos por fase más reciente: con FF5, A2, FF13, B2 y PG2 salen 3 (A2, B2 y PG2).
  3. 2026/27 simulado con «Las Mesas Hu.» solo en prebenjamín y «Las Mesas B» en benjamín → estado E, una vez; la respuesta se respeta en la siguiente carga.
  4. Jornada 1 de 2026/27 sin resultados → estado B, sin datos de 2025-26 en pantalla.
  5. PG2, jornada 30 → «Sin partido en esta jornada: RC Victoria y Arucas B (descansa o le tocaba contra CD Batán)». PG3, cualquier jornada → sin «faltan». PFV2 → CD Teguinte retirado; sus partidos sin fecha no son el próximo partido de nadie.
  6. Cobertura de Las Mesas en PG2 → «26 partidos en el calendario y 2 contra CD Batán (retirado)».
  7. Partido PG2 del 02/06 Las Mesas–Huracán (2–7) → **sin** cronología (la 2–9 es de A2). El cara a cara de PG2 no incluye los partidos de A2.
  8. Verano de PG2 → MCP3 y MCPK1; no MCB16 ni MCBK2.
- **Navegador** (job `render-smoke` de CI):
  - `render-smoke.mjs`, con los datos reales: marcadores **independientes del estado**. Exige cabecera, un `h1` con el nombre del equipo y alguno de los bloques de A, B, C o D, y no admite E, X ni error. Así no se pone en rojo al cambiar de temporada.
  - **Estado D en navegador:** con fixtures servidas (como hoy hace `interaction-smoke` con `data-history.js`) y el reloj de la página fijado con `page.clock`.
  - `interaction-smoke.mjs` a 320, 390, 768 y 1440 px, en claro y oscuro (emulando `prefers-color-scheme`):
    - barra con 4 destinos sin tapar contenido;
    - jornada anterior y siguiente;
    - vistas de Tabla;
    - abrir partido y volver con Atrás, y entrar por enlace directo y volver con «‹»;
    - buscar un equipo, abrir su ficha y comprobar que mi equipo no cambia;
    - «Hacer mi equipo»;
    - traducir un enlace antiguo de WhatsApp;
    - «Otro grupo» → Ligas → Tabla;
    - sin desplazamiento horizontal.
  - `pwa-smoke.mjs`: el service worker nuevo sustituye al viejo, la portada (cualquier estado de A a D) funciona sin conexión, y también el buscador.
- **Verificación visual antes de publicar:**
  - capturas a 390 px (claro y oscuro) y 1440 px (claro) de cada pantalla y de los estados A, B, C, D y E, error, vacío y sin conexión;
  - revisadas y enviadas al usuario como PNG.

## 12. Plan B: fases y corte

Rama `rediseno-acta`. `tests.yml` no corre en push a ramas, así que cada fase se verifica:
- en local: `pytest`, `node --test scripts/tests/test_*.mjs` y los tres smoke;
- con un **PR borrador** hacia `main`, que sí dispara `tests.yml`.

La rama se rebasa a menudo sobre `main`, porque el bot comitea `index.html`, `sw.js` y `data-*`.

1. **B1, cimientos, sin tocar la app actual.** Ficheros nuevos que la app vieja no importa:
   - `html.js`, `model.js`, `myteam.js`, `store.js`, `ui.js` y las rutas nuevas en `links.js`;
   - `style.css` nuevo como `style-acta.css`, que todavía no se enlaza;
   - `fonts/` e `icons/`;
   - tests unitarios de §5.6 y de §11 («casos reales»).

   La app actual y todas sus suites siguen en verde.
2. **Corte (un solo commit), al empezar B2:**
   - `index.html` pasa al esqueleto y al `app.js` nuevos;
   - `style-acta.css` sustituye a `style.css`;
   - se borran los 9 módulos viejos;
   - se mueven funciones puras y se cambian firmas;
   - se borran los tests de detalle visual y se reescriben los de intención;
   - `checkRenderedDom`, `interaction-smoke` y `pwa-smoke` se adaptan al esqueleto;
   - `test_sw_fixes` y `STATIC_ASSETS` pasan al grafo nuevo.

   Tras el corte, todas las suites en verde con la portada mínima.
3. **B2, pantallas principales:** `shell.js`, `router.js`, Mi equipo (estados A–E), Jornada, Tabla y Partido.
4. **B3, secundarias:** Equipo, Explorar, Ligas (con «Comparar grupos»), Copa, Goleadores, Temporadas, Récords, Fuentes y Ajustes.
5. **B4, PWA y rendimiento:**
   - miniaturas de escudos;
   - `defer` y carga perezosa;
   - baja de `data-matchdetail-keys.js`;
   - `sw.js`, manifiesto e iconos;
   - despliegue con `touch_footer=False`;
   - medición del presupuesto de §5.4.
6. **B5, cierre:**
   - pruebas de navegador completas y verificación visual (§11), con capturas para el usuario;
   - rebase final, subida de versión sin tocar el pie, publicación (sin workflows en marcha) y comprobación en la web publicada.

El Plan A se ejecuta y se publica antes que el B, y el B parte de sus datos.
