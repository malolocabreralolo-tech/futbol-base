# Rebase de la rama del rediseño (`rediseno-acta`)

El rediseño «Acta» se construye en la rama `rediseno-acta` y no se fusiona en `main` hasta B5. Mientras tanto, el bot sigue comiteando en `main` cada pocas horas, y la rama se rebasa a menudo sobre `main` (spec §12). Este es el procedimiento (Plan B2, decisión 8).

## Qué choca y qué se queda

El bot (`update.yml`, `fetch-fiflp.yml` y `fetch-fiflp-actas.yml`) comitea tres cosas:

- **`data-*.js`, `data-health.json` y `futbolbase.db`.** La rama no los toca, así que no chocan. Si alguno chocara, se queda el de `main`: `git checkout --ours -- <fichero>` (en un rebase, «ours» es `main`).
- **`sw.js`.** El bot solo cambia `CACHE_NAME` en la línea 1, y la rama cambia `STATIC_ASSETS`. Git suele mezclarlo solo.
- **`index.html`.** El bot sube todas las `?v=` y el literal oculto «Última actualización». Desde el corte, la rama tiene otro `index.html`, y el choque es casi seguro.

Siempre se queda **la estructura de la rama con las marcas de versión de `main`**: las `?v=`, «Última actualización» y `CACHE_NAME`. Lo hace `scripts/sync_versions.py`. `CACHE_NAME` y las `?v=` no se suben a mano en B2 (decisión 7): la subida conjunta es del despliegue de B4 y B5.

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

Se repite en cada parada hasta que termine el rebase. Un conflicto en cualquier otro fichero se resuelve a mano: el bot nunca toca `src/`, `scripts/` ni `docs/`.

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

El PR borrador hacia `main` vuelve a lanzar `tests.yml`, con las suites y los tres smoke.
