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


# Las páginas de la federación cargan decenas de scripts de publicidad y medición (refinery89,
# doubleclick, prebid, consentmanager, criteo…) que retrasan el «documento cargado» hasta el límite
# de 30 s de goto: cada acta tardaba ~55 s con sus reintentos (4/10/2026) y el bot agotaba su plazo.
# Solo hace falta lo de la federación: sus páginas y scripts (www.fiflp.com), las hojas de estilo y
# las fuentes con los glifos de las cifras que lee el aplanado (files.fiflp.com y
# laspalmas.filesnovanet.es). Un dominio vale con todos sus subdominios. Los escudos se leen del
# atributo src de su <img> (fetch_fiflp_goleadores.CRESTS_JS, fiflp_detalle): no hace falta cargarlos.
# (weblaspalmas, federadolaspalmas y laspalmas.novanet.es salen en el menú de sus páginas solo como
# enlaces: no se carga nada de ahí, ni antes con la ruta ni ahora.)
FIFLP_HOSTS = ("fiflp.com", "filesnovanet.es")

# Lo que Playwright pone en --blink-settings al lanzar Chromium sin ventana (un ratón: hover y puntero
# fino; chromium.js, _innerDefaultArgs, Playwright 1.58). Chromium se queda con el ÚLTIMO --blink-settings
# de la línea de órdenes y Playwright pone los args del lector después de los suyos: sin repetirlos aquí,
# (hover: hover) y (pointer: fine) dejarían de cumplirse y la página se pintaría distinta que en las
# pruebas (test_fiflp_lanzamiento lo comprueba con el Chromium de verdad).
PLAYWRIGHT_HEADLESS_BLINK = "primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"


def fiflp_request(url):
    """¿Es de la federación esta petición? (El mismo criterio que fiflp_launch_args: el dominio o un
    subdominio de FIFLP_HOSTS.)"""
    from urllib.parse import urlparse
    host = (urlparse(url).hostname or "").lower()
    return any(host == h or host.endswith("." + h) for h in FIFLP_HOSTS)


def host_resolver_rules(hosts=FIFLP_HOSTS):
    """Las reglas de --host-resolver-rules: ningún host se resuelve («MAP * ~NOTFOUND»: la petición falla
    al instante, como un DNS que no lo encuentra, también la de una IP) salvo cada dominio de `hosts` y sus
    subdominios («EXCLUDE dominio» y «EXCLUDE *.dominio»; el comodín es un glob de Chromium, `*` vale
    también por varios niveles, y no cubre el dominio a secas). Las reglas van separadas por comas: la
    sintaxis de la documentación de Chromium (proxy SOCKS: «MAP * ~NOTFOUND , EXCLUDE myproxy») y la que
    usa el propio Playwright con un proxy SOCKS."""
    rules = ["MAP * ~NOTFOUND"]
    for host in hosts:
        rules += [f"EXCLUDE {host}", f"EXCLUDE *.{host}"]
    return ", ".join(rules)


def fiflp_launch_args(hosts=FIFLP_HOSTS):
    """Los argumentos de Chromium para leer la federación: chromium.launch(headless=True,
    args=fiflp_launch_args()). Lo usan el bot (update_fiflp._with_browser) y todas las tandas y sondas.

      - --host-resolver-rules: solo se resuelven los hosts de la federación (host_resolver_rules). Lo
        ajeno (publicidad, medición) falla en el DNS de Chromium sin salir a la red.
      - --blink-settings=…imagesEnabled=false: sin imágenes (escudos, banners, iconos). Ningún lector las
        necesita cargadas: los escudos se leen del src; las cifras salen de las hojas de estilo y las
        fuentes, que sí cargan. Con los ajustes de ratón de Playwright (PLAYWRIGHT_HEADLESS_BLINK).

    Por qué así y no con page.route/context.route (fiflp_only, hasta el 15/10/2026): una ruta de
    Playwright DESACTIVA LA CACHÉ HTTP del navegador, y cada página volvía a pedir los ~20 scripts y las
    hojas de la federación (Cache-Control: max-age=15552000, public) y las imágenes: ~45-52 peticiones a
    la red por página, 22-24 a www.fiflp.com. Sin ruta, con estos argumentos y el mismo contexto de
    página en página (medido por el controlador con Chromium de verdad el 15/10/2026, 3 páginas
    seguidas): 34 la primera y 5 las siguientes (3 a www.fiflp.com: el documento y 2 XHR), ~10 veces
    menos; el desplegable de jornadas se rellena igual y las hojas de estilo están. Desde el 14/10 la
    federación frena al bot tras unas decenas de páginas, y lo que cuenta su freno son, muy
    probablemente, las peticiones.

    Ojo: con un proxy (Playwright `proxy` o las variables http_proxy/https_proxy que Chromium lee en
    Linux) el host del proxy también se mapea a ~NOTFOUND y no cargaría nada; ni GitHub Actions ni el bot
    usan proxy. Un host nuevo de la federación que no esté en FIFLP_HOSTS dejaría de cargar: se añade allí
    (y vale a la vez para fiflp_request y para estos argumentos)."""
    return [f"--host-resolver-rules={host_resolver_rules(hosts)}",
            f"--blink-settings={PLAYWRIGHT_HEADLESS_BLINK},imagesEnabled=false"]


def fiflp_only(page):
    """Ya no hace nada: devuelve la página tal cual. Hasta el 15/10/2026 bloqueaba lo que no era de la
    federación con page.route, y una ruta de Playwright desactiva la caché HTTP (~10 veces más
    peticiones por página: fiflp_launch_args). El bloqueo va ahora en el lanzamiento del navegador
    (chromium.launch(..., args=fiflp_launch_args())). Se conserva para que una llamada de otra rama o de
    un script suelto no rompa al importarla; ningún lector la usa, y test_fiflp_lanzamiento falla si un
    lector de la federación vuelve a usar una ruta o lanza Chromium sin esos argumentos."""
    return page
