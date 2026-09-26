# Rebase y publicación de la rama del rediseño (`rediseno-acta`)

El rediseño «Acta» se construye en la rama `rediseno-acta`, y cada fase se publica al terminarla, con el visto bueno del usuario: `main` avanza hasta la rama con avance rápido (B2 en `376e981`, B3 en `862486f`). Entre una publicación y otra, el bot sigue comiteando en `main` cada pocas horas, y la rama trae `main` a menudo (spec §12). Este es el procedimiento (Plan B2, decisión 8), y al final, el de publicar (Plan B4, decisión 10).

## Qué choca y qué se queda

El bot (`update.yml`, `fetch-fiflp.yml` y `fetch-fiflp-actas.yml`) comitea tres cosas:

- **`data-*.js`, `data-health.json` y `futbolbase.db`.** La rama no los toca, así que no chocan. Si alguno chocara, se queda el de `main`: `git checkout --ours -- <fichero>` (en un rebase, «ours» es `main`). La excepción son los `data-*.js` que la rama retira a propósito (B4: `data-matchdetail-keys.js`, `data-stats.js` y `data-players-*.js`): si el bot los regeneró en `main`, chocan como «borrados en la rama y modificados en `main`», y se resuelven con `git rm`, nunca con el de `main`.
- **`sw.js`.** El bot solo cambia `CACHE_NAME` en la línea 1, y la rama cambia `STATIC_ASSETS`. Git suele mezclarlo solo.
- **`index.html`.** El bot sube todas las `?v=` y el literal oculto «Última actualización». Desde el corte, la rama tiene otro `index.html`, y el choque es casi seguro.

Siempre se queda **la estructura de la rama con las marcas de versión de `main`**: las `?v=`, «Última actualización» y `CACHE_NAME`. Lo hace `scripts/sync_versions.py`. `CACHE_NAME` y las `?v=` no se suben a mano: las sube `scripts/publicar.py` al publicar una fase (abajo).

## Antes de rebasar

```bash
cd /home/manolo/claude/futbol-base
git status --short
git fetch origin
git switch rediseno-acta
python3 scripts/sync_versions.py --from origin/main --since "$(git merge-base HEAD origin/main)"
```

- `git status` no debe mostrar ficheros modificados. `HANDOFF.md` y `docs/mejoras-2026-09.md` salen con `??` porque no están en git, y no cuentan.
- `sync_versions.py --since` comprueba que, desde la base común, `main` solo ha cambiado las marcas de versión de `index.html` y `sw.js`. Si sale con 1, alguien arregló algo en esos ficheros en `main`: hay que llevar ese cambio a mano a la rama después del rebase, porque la estructura de la rama lo sustituye.

## Rebasar

```bash
cd /home/manolo/claude/futbol-base
git rebase origin/main
```

Si se para con un conflicto:

```bash
cd /home/manolo/claude/futbol-base
git diff --name-only --diff-filter=U
```

Si los únicos ficheros en conflicto son `index.html`, `sw.js` o los dos:

```bash
cd /home/manolo/claude/futbol-base
git checkout --theirs -- $(git diff --name-only --diff-filter=U -- index.html sw.js)
python3 scripts/sync_versions.py --from origin/main
git add index.html sw.js
GIT_EDITOR=true git rebase --continue
```

- En un rebase, «theirs» es el commit de la rama que se está aplicando: su estructura.
- `sync_versions.py` le pone las marcas de `origin/main`.

Se repite en cada parada hasta que termine el rebase. Un conflicto en cualquier otro fichero se resuelve a mano: el bot nunca toca `src/` ni `docs/`; en `scripts/` solo comitea lo que generan `fetch-fiflp*.yml` (`scripts/fiflp_*_raw.json`, `scripts/tests/fixtures/acta_*.html`), que la rama no toca.

## Después de rebasar

```bash
cd /home/manolo/claude/futbol-base
python3 scripts/sync_versions.py --from origin/main --check
python3 -m pytest scripts/tests/ -q
node --test scripts/tests/test_*.mjs
node scripts/tests/render-smoke.mjs
node scripts/tests/interaction-smoke.mjs
node scripts/tests/pwa-smoke.mjs
```

- `--check` sale con 0 si `index.html` y `sw.js` llevan las marcas de `origin/main`. Si no, dice cuáles faltan.
- Después vienen las suites y los tres smoke, todos en verde. Los smoke necesitan Playwright (`npm install --no-save --package-lock=false playwright@1.58.0`) y Chrome.

## Empujar

**Nunca se empuja con un workflow en marcha.**

```bash
cd /home/manolo/claude/futbol-base
gh run list --limit 3
git push --force-with-lease origin rediseno-acta
```

`gh run list` no debe mostrar ninguna ejecución `in_progress` ni `queued`. `--force-with-lease` no pisa la rama remota si alguien la movió después del último `fetch`.

El PR borrador #2 hacia `main` quedó cerrado al publicar B2, y un push a la rama no lanza `tests.yml`: se lanza a mano, `gh workflow run tests.yml --ref rediseno-acta`, con las suites y los tres smoke.

## Publicar una fase

Con el visto bueno del usuario, sin ningún workflow en marcha y con el árbol limpio. El paso de publicar de cada plan (el de B3, Tarea 12, paso 10) tiene las comprobaciones de la web; esto es lo que se repite en cada fase:

1. **Traer `main`** con un merge (`git merge --no-edit origin/main`): en un merge, «ours» es la rama. Si chocan `index.html` o `sw.js`, `git checkout --ours` de esos dos y `python3 scripts/sync_versions.py --from origin/main`; al final, `python3 scripts/sync_versions.py --from origin/main --check`. Un conflicto en otro fichero se resuelve a mano: el bot nunca toca `src/` ni `docs/`; en `scripts/` solo comitea lo que generan `fetch-fiflp*.yml` (`scripts/fiflp_*_raw.json`, `scripts/tests/fixtures/acta_*.html`), que la rama no toca. Si la fase borró un `data-*.js` que el bot sigue regenerando en `main` (B4: `data-matchdetail-keys.js`, `data-stats.js` y `data-players-*.js`), sale un conflicto «modificado y borrado»: se resuelve con `git rm` de esos ficheros. Resuelto todo, `git add` de lo resuelto y `git commit` termina el merge. Si fue limpio (sin conflicto) pero se queda con las marcas de una versión que no llegó a publicarse en `main` (decisión 53: el bot comitea `data-health.json` varias veces al día y la fusión suele ser limpia), `--check` falla al final: `python3 scripts/sync_versions.py --from origin/main`, `git add index.html sw.js` y `git commit --amend --no-edit` lo meten en el commit de la fusión. Y un retirado que `main` añada sin conflicto (p. ej. un `data-players-<temporada>.js` nuevo al activar una temporada) no lo avisa el merge: se comprueba a mano y se quita con `git rm`. El bloque completo, con sus comprobaciones, está en el paso de publicar del plan (Tarea 7, paso 2).
2. **Subir la versión** con `scripts/publicar.py`: las `?v=` de `index.html` y `CACHE_NAME` de `sw.js` a la vez, con la fecha UTC (o la letra siguiente, si no es mayor que la vigente), y `CODIGO`, sin tocar «Última actualización»:

   ```bash
   cd /home/manolo/claude/futbol-base
   python3 scripts/publicar.py
   git diff --stat
   ```

   Sale `versión <V> (antes, <la vigente>): <N> ?v= en index.html y futbolbase-v<V> en sw.js; «Última actualización: <la de los datos>», sin tocar` y la línea de `CODIGO`, y en el `diff`, solo `index.html` y `sw.js`. Si la vigente ya lleva la `z`, se para sin escribir nada.
3. **Suites y los tres smoke**, en verde, y el commit `Publica Bn del rediseño «Acta»: versión <V>` con `index.html` y `sw.js`.
4. **Empujar la rama, su CI y después `main`**: `git push origin rediseno-acta`, `gh workflow run tests.yml --ref rediseno-acta` y, con esa ejecución en verde, `git push origin rediseno-acta:main` (avance rápido). Cada push, sin ningún workflow en marcha (`gh run list --limit 5`). Si `main` avanzó mientras tanto, el push se rechaza: se vuelve al paso 1.
5. **Comprobar la web** con el perfil de un móvil que tenía la versión anterior, apertura a apertura, como en el paso de publicar del plan.
