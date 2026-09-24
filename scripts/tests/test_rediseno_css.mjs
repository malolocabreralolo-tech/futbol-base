// Plan B1, tarea 11: intención de acta.css (spec §3.2-§3.4, §4.8 y §8).
// Comprueba reglas, no píxeles: la verificación visual va aparte, con capturas.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = readFileSync(join(ROOT, 'acta.css'), 'utf8');

// Reglas del CSS como {media, selector, body}; un nivel de @media.
function parseCss(src) {
  const rules = [];
  const walk = (s, media) => {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf('{', i);
      if (open < 0) break;
      const prelude = s.slice(i, open).trim();
      let depth = 1, j = open + 1;
      for (; j < s.length && depth; j++) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') depth--;
      }
      const body = s.slice(open + 1, j - 1);
      if (prelude.startsWith('@media')) walk(body, prelude);
      else rules.push({ media, selector: prelude, body });
      i = j;
    }
  };
  walk(src.replace(/\/\*[\s\S]*?\*\//g, ''), null);
  return rules;
}

const RULES = parseCss(SRC);
const DESKTOP = (m) => m !== null && /min-width:\s*1024px/.test(m);
// Cuerpo de las reglas cuyo selector (en una lista separada por comas) es
// exactamente `selector`, dentro de la media indicada (null = nivel superior).
function decl(selector, media = (m) => m === null) {
  const found = RULES.filter(r => media(r.media) && r.selector.split(',').map(s => s.trim()).includes(selector));
  assert.ok(found.length, `no hay regla para «${selector}»`);
  return found.map(r => r.body).join(';');
}

test('cifras tabulares y Public Sans con system-ui de respaldo en todo el documento', () => {
  const body = decl('body');
  assert.match(body, /font-variant-numeric:\s*tabular-nums/);
  assert.match(body, /font-family:\s*'Public Sans',\s*system-ui/);
  assert.match(body, /background:\s*var\(--paper\)/);
  assert.match(body, /color:\s*var\(--text\)/);
  // El atajo font: reinicia font-variant-numeric; solo vale `font: inherit`.
  const atajos = RULES.filter(r => /(^|;)\s*font\s*:/.test(r.body) && !/(^|;)\s*font\s*:\s*inherit\s*(;|$)/.test(r.body));
  assert.deepEqual(atajos.map(r => r.selector), []);
});

test('etiquetas en frase normal: nada en mayúsculas forzadas', () => {
  assert.doesNotMatch(SRC, /text-transform:\s*uppercase/);
  assert.doesNotMatch(SRC, /font-variant(-caps)?:\s*(all-)?small-caps/);
});

test('foco visible: contorno de 2 px en tinta', () => {
  assert.match(decl(':focus-visible'), /outline:\s*2px solid var\(--ink\)/);
});

test('caja: borde de 1,5 px en tinta, sin radio ni sombra; casillas con etiqueta y dato', () => {
  const box = decl('.box');
  assert.match(box, /border:\s*1\.5px solid var\(--ink\)/);
  assert.doesNotMatch(box, /border-radius|box-shadow/);
  assert.match(decl('.cells'), /background:\s*var\(--rule\)/, 'las divisiones internas van en --rule');
  assert.match(decl('.cell-label'), /color:\s*var\(--mute\)/);
  const valor = decl('.cell-value');
  assert.match(valor, /color:\s*var\(--ink\)/);
  assert.match(valor, /font-weight:\s*800/);
  const titulo = decl('.block-title');
  assert.match(titulo, /color:\s*var\(--ink\)/);
  assert.match(titulo, /font-weight:\s*800/);
  assert.match(decl('.block-context'), /color:\s*var\(--mute\)/);
});

test('resalte propio: fondo --mark, tinta 800 y barra de 3 px; nunca el óvalo', () => {
  for (const [fila, primero] of [['.standings tr.is-mine > *', '.standings tr.is-mine > :first-child'],
    ['.match-row.is-mine', '.match-row.is-mine']]) {
    const d = decl(fila);
    assert.match(d, /background:\s*var\(--mark\)/, fila);
    assert.match(d, /color:\s*var\(--ink\)/, fila);
    assert.match(d, /font-weight:\s*800/, fila);
    assert.match(decl(primero), /box-shadow:\s*inset 3px 0 0 var\(--ink\)/, primero);
  }
  const propias = RULES.filter(r => /is-mine/.test(r.selector)).map(r => r.body).join(';');
  assert.doesNotMatch(propias, /border-radius|outline|border:/, 'el resalte no dibuja ningún contorno');
  assert.doesNotMatch(SRC, /ellipse|\.pen\b/);
});

test('foco visible en los enlaces de la tabla: la celda del equipo no recorta el contorno', () => {
  assert.doesNotMatch(decl('.standings .st-team'), /overflow(-[xy])?\s*:\s*(hidden|clip|auto|scroll)/);
  const name = decl('.st-name');
  assert.match(name, /overflow:\s*hidden/, 'el recorte va en el nombre');
  assert.match(name, /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(decl('.st-link'), /overflow/);
});

test('el selector segmentado sigue visible en escritorio (Todas, Casa y Fuera)', () => {
  const desktop = RULES.filter(r => DESKTOP(r.media) && /\.segment/.test(r.selector)).map(r => r.body).join(';');
  assert.doesNotMatch(desktop, /display:\s*none|visibility:\s*hidden/);
  assert.doesNotMatch(SRC, /\.segmented[^{]*\{[^}]*display:\s*none/);
});

test('fila de partido y tabla: nombres con elipsis, filas separadas por --line', () => {
  for (const sel of ['.match-name', '.st-name']) {
    const d = decl(sel);
    assert.match(d, /text-overflow:\s*ellipsis/, sel);
    assert.match(d, /white-space:\s*nowrap/, sel);
  }
  assert.match(decl('.standings thead th'), /border-bottom:\s*1\.5px solid var\(--ink\)/);
  assert.match(decl('.standings th'), /border-bottom:\s*1px solid var\(--line\)/);
  assert.match(decl('.box > .match-row + .match-row'), /border-top-color:\s*var\(--line\)/);
});

test('forma: G, E y P con sus colores; la P nunca en tinta roja', () => {
  for (const [c, fondo, texto] of [['g', 'win', 'on-win'], ['e', 'draw', 'on-draw'], ['p', 'loss', 'on-loss']]) {
    const d = decl(`.form-${c}`);
    assert.match(d, new RegExp(`background:\\s*var\\(--${fondo}\\)`), `.form-${c}`);
    assert.match(d, new RegExp(`color:\\s*var\\(--${texto}\\)`), `.form-${c}`);
  }
  const chip = decl('.form-chip');
  const px = +chip.match(/width:\s*(\d+)px/)[1];
  assert.ok(px >= 15 && px <= 18, `círculos de 15-18 px, no ${px}`);
});

test('segmento activo y acción principal: relleno de tinta con texto --on-ink', () => {
  for (const sel of ['.segment[aria-current]', '.button.is-main', '.tab[aria-current] .tab-icon']) {
    const d = decl(sel);
    assert.match(d, /background:\s*var\(--ink\)/, sel);
    assert.match(d, /color:\s*var\(--on-ink\)/, sel);
  }
});

test('escudo con object-fit y monograma gris del mismo tamaño', () => {
  assert.match(decl('.crest'), /object-fit:\s*contain/);
  assert.match(decl('.mono'), /background:\s*var\(--line\)/);
  for (const px of [16, 32, 46]) {
    assert.match(decl(`.crest-${px}`), new RegExp(`width:\\s*${px}px`));
    assert.match(decl(`.mono-${px}`), new RegExp(`height:\\s*${px}px`));
  }
});

test('aviso en --mute con término en negrita; vacío con borde discontinuo en --rule', () => {
  assert.match(decl('.notice'), /color:\s*var\(--mute\)/);
  assert.match(decl('.notice b'), /color:\s*var\(--text\)/);
  assert.match(decl('.empty'), /border:\s*1\.5px dashed var\(--rule\)/);
});

test('barra: abajo en móvil con safe-area y el cuerpo no queda tapado', () => {
  const bar = decl('.tabbar');
  assert.match(bar, /position:\s*fixed/);
  assert.match(bar, /bottom:\s*0/);
  assert.match(bar, /height:\s*calc\(64px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(bar, /padding-bottom:\s*env\(safe-area-inset-bottom\)/);
  assert.match(decl('body'), /padding-bottom:\s*calc\(64px \+ env\(safe-area-inset-bottom\)\)/);
});

test('barra: pestañas arriba desde 1024 px, sin posición fija ni hueco inferior', () => {
  assert.match(decl('.tabbar', DESKTOP), /position:\s*static/);
  assert.match(decl('body', DESKTOP), /padding-bottom:\s*0/);
  assert.match(decl('.tab[aria-current]', DESKTOP), /box-shadow:\s*inset 0 -3px 0 var\(--ink\)/);
  assert.match(decl('.page', DESKTOP), /max-width:\s*1120px/);
  assert.match(decl('.page'), /max-width:\s*640px/, 'móvil y tableta, centrado a 640 px');
});

test('todo lo pulsable mide al menos 44 px', () => {
  for (const sel of ['.tab', '.segment', '.button', '.match-row', '.st-link']) {
    assert.match(decl(sel), /min-height:\s*44px/, sel);
  }
});

test('movimiento solo con prefers-reduced-motion: no-preference y sin animaciones de entrada', () => {
  const fuera = RULES.filter(r => /(^|;)\s*(transition|animation)[\w-]*\s*:/.test(r.body)
    && !(r.media && /prefers-reduced-motion:\s*no-preference/.test(r.media)));
  assert.deepEqual(fuera.map(r => r.selector), []);
  assert.doesNotMatch(SRC, /@keyframes/);
});

test('saltar al contenido: oculto hasta recibir el foco; utilidad visualmente oculta', () => {
  assert.match(decl('.skip-link'), /transform:\s*translateY\(/);
  assert.match(decl('.skip-link:focus'), /transform:\s*none/);
  assert.match(decl('.vh'), /clip-path:\s*inset\(50%\)/);
});

test('sin emoji en la hoja de estilos', () => {
  assert.doesNotMatch(SRC, /\p{Extended_Pictographic}/u);
});

// ── Plan B2, tarea 4: la cabecera de pantalla y la pregunta de la portada ───

test('cabecera de pantalla (screenHead): 72 px con regla de tinta; «‹» y la acción miden 44 px', () => {
  const head = decl('.screen-head');
  assert.match(head, /min-height:\s*72px/);
  assert.match(head, /border-bottom:\s*2px solid var\(--ink\)/);
  assert.match(decl('.screen-head-text'), /min-width:\s*0/, 'sin min-width el nombre empujaría la página a 320 px');
  // El nombre completo en una línea: si no cabe a 320 px, con elipsis (spec §3.5).
  const h1 = decl('.screen-head h1');
  for (const rule of [/white-space:\s*nowrap/, /text-overflow:\s*ellipsis/, /overflow:\s*hidden/]) assert.match(h1, rule);
  assert.match(decl('.screen-sub'), /color:\s*var\(--mute\)/);
  for (const sel of ['.back', '.screen-action']) assert.match(decl(sel), /min-height:\s*44px/, sel);
  assert.match(decl('.back'), /width:\s*44px/);
  assert.match(decl('.screen-action'), /color:\s*var\(--ink\)/, 'la acción, en tinta también cuando es un botón');
});

test('portada: cada candidato de la pregunta (estado E) es un botón de al menos 44 px, con el nombre en tinta', () => {
  assert.match(decl('.choice'), /min-height:\s*56px/);
  assert.match(decl('.choice-name'), /color:\s*var\(--ink\)/);
  assert.match(decl('.choice-text'), /min-width:\s*0/);
});
