"""fiflp_render.py — Lo que la federación PINTA, como texto plano.

Las páginas de FIFLP esconden marcadores, marcadores parciales y minutos con
varias capas de ofuscación, distintas en cada partido y en cada carga:
  - dígitos pintados por CSS: '<i class="fa-4">' (glifo de FontAwesome) y
    reglas '<style>#idh86972:before{content:"\\0032"}</style>';
  - señuelos ocultos: '<span style="display:none">22</span>' y también
    PSEUDO-elementos ocultos ('#idh86988:before{content:"\\0032";display:none}');
  - el 4.º argumento de ntype(id, n, i, "fa-X"), otro señuelo (sus scripts ni
    se ejecutan al cargar una jornada por AJAX).

FLATTEN_JS recorre el DOM ya pintado y lo deja como se ve: inserta como texto
el contenido de cada ::before/::after VISIBLE y quita los elementos cortos
(cifras sueltas) que no se ven. Después, page.content() o inner_text() dan el
texto real y los parsers estáticos (acta_parser.py, el de jornadas) funcionan
sin saber nada de la ofuscación.
"""

FLATTEN_JS = r"""(root) => {
  root = root || document.body;
  const styled = st => st && st.display !== 'none' && st.visibility === 'visible'
      && parseFloat(st.opacity || '1') > 0 && parseFloat(st.fontSize || '1') > 0;
  // checkVisibility tiene en cuenta los antepasados ocultos (bloques duplicados
  // para móvil, pestañas); el tamaño de letra 0 hay que mirarlo aparte.
  const visible = el => (el.checkVisibility
      ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      : styled(getComputedStyle(el))) && parseFloat(getComputedStyle(el).fontSize || '1') > 0;
  const text = c => {
    if (!c || c === 'none' || c === 'normal') return null;
    const m = c.match(/^["'](.*)["']$/s);
    return m ? m[1] : null;
  };
  const inserts = [], removals = [];
  for (const el of root.querySelectorAll('*')) {
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') { removals.push(el); continue; }
    if (!visible(el)) {
      // Solo el más alto de cada rama oculta: quitarlo se lleva a sus hijos.
      if (!el.parentElement || el.parentElement === root || visible(el.parentElement)) removals.push(el);
      continue;
    }
    for (const where of ['::before', '::after']) {
      const ps = getComputedStyle(el, where);
      const t = text(ps.content);
      // Solo texto de verdad: los iconos de FontAwesome son caracteres de uso
      // privado (U+E000-U+F8FF) y no dicen nada.
      if (t !== null && t !== '' && !/[\uE000-\uF8FF]/.test(t) && styled(ps)) inserts.push([el, where, t]);
    }
  }
  for (const [el, where, t] of inserts) {
    const node = document.createTextNode(t);
    if (where === '::before') el.insertBefore(node, el.firstChild); else el.appendChild(node);
    el.setAttribute('data-flat', '1');
  }
  // Los textos ya están materializados: quitar los pseudo-elementos para que
  // no se dupliquen al pintar, y todo lo que no se ve (señuelos, estilos).
  const kill = document.createElement('style');
  kill.textContent = '[data-flat]::before,[data-flat]::after{content:none!important}';
  for (const el of removals) el.remove();
  document.head.appendChild(kill);
  return inserts.length;
}"""


def flatten(page, selector=None):
    """Aplana la página (o el elemento `selector`) y devuelve cuántos textos
    de pseudo-elementos ha materializado."""
    if selector:
        handle = page.query_selector(selector)
        return handle.evaluate(FLATTEN_JS) if handle else 0
    return page.evaluate(f"({FLATTEN_JS})(document.body)")
