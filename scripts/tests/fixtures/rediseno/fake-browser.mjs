// El navegador falso de las pruebas de Node del rediseño (M1 de la revisión final de B2): uno solo,
// para el router (test_rediseno_router.mjs) y para start() de verdad (test_rediseno_integracion.mjs).
// Lo justo de un navegador:
// - el historial, con entradas, estado, pushState, replaceState y back() (popstate y hashchange en
//   un turno posterior, nunca en este); con deferBack, el índice tampoco cambia hasta ese turno,
//   como en un navegador real;
// - location.hash y reload(), el desplazamiento (scrollTo y scroll), navigator.onLine con sus eventos
//   online y offline, y localStorage y sessionStorage en memoria;
// - un document con sus oyentes, el título, activeElement, la barra de 4 destinos, el hueco del aviso
//   sin conexión (.shell-offline) y el literal «Última actualización» de index.html;
// - el <main id="contenido"> que pinta el router: guarda el HTML y, en cada pintado, crea su h1 y un
//   elemento por cada id (con su etiqueta: un <input id="buscar"> es un INPUT), con sus oyentes; su
//   querySelector encuentra el h1 y esos elementos por su id ('#buscar'), como el mount de Explorar.
// Cada elemento sabe closest(selector) solo sobre sí mismo, con selectores de etiqueta y de atributo
// ('a[href],[data-action]', '[data-action="retry"]'), que es lo que usan el router y app.js.
// Para el mount de una pantalla, fakeSection (Plan B5, Tarea 4): la sección pintada, con la delegación
// de sus clics y sus bloques por id.

// ¿Cumple el elemento el selector? Una lista separada por comas de etiqueta y atributos:
// 'a', '[href]', 'a[href]', '[data-action="retry"]'.
function matches(el, selector) {
  return String(selector).split(',').some((part) => {
    const m = part.trim().match(/^([a-zA-Z][\w-]*)?((?:\[[^\]]+\])*)$/);
    if (!m) return false;
    if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
    return [...m[2].matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)]
      .every(([, name, value]) => el.hasAttribute(name) && (value === undefined || el.getAttribute(name) === value));
  });
}

// Un Storage en memoria sobre un Map (el de un móvil, que dura entre cargas si se reutiliza).
export function memoryStorage(map = new Map()) {
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
  };
}

// hash: la dirección inicial. storage: el Map del localStorage. deferBack: back() no cambia el
// índice hasta su propio popstate. legacyUpdated: el texto del literal oculto de index.html.
export function fakeBrowser(hash = '#/', { storage = new Map(), deferBack = false, legacyUpdated = 'Última actualización: 23/09/2026' } = {}) {
  const listeners = { window: {}, document: {} };
  const on = (bag) => (type, fn) => { (bag[type] ||= []).push(fn); };
  const fire = (bag, type, event) => (bag[type] || []).slice().forEach((fn) => fn(event));
  const entries = [{ hash, state: null }];
  let index = 0;
  const hashOf = (url) => (String(url).includes('#') ? String(url).slice(String(url).indexOf('#')) : String(url));
  const reloads = [];

  const doc = { title: 'Fútbol Base Las Palmas', activeElement: null, addEventListener: on(listeners.document) };
  function element(tag, attrs = {}) {
    const el = {
      tagName: tag.toUpperCase(), attrs: { ...attrs }, focused: 0, scrolled: 0, listeners: {},
      get id() { return el.attrs.id || ''; },
      getAttribute: (n) => (Object.hasOwn(el.attrs, n) ? el.attrs[n] : null),
      setAttribute: (n, v) => { el.attrs[n] = String(v); },
      removeAttribute: (n) => { delete el.attrs[n]; },
      hasAttribute: (n) => Object.hasOwn(el.attrs, n),
      closest: (selector) => (matches(el, selector) ? el : null),
      focus: (options) => { el.focused++; el.focusOptions = options; doc.activeElement = el; },
      scrollIntoView: (options) => { el.scrolled++; el.scrollOptions = options; },
      addEventListener: (type, fn) => { (el.listeners[type] ||= []).push(fn); },
      removeEventListener: (type, fn) => { el.listeners[type] = (el.listeners[type] || []).filter((f) => f !== fn); },
    };
    return el;
  }

  const tabs = ['#/', '#/jornada', '#/tabla', '#/explorar'].map((href) => element('a', { class: 'tab', href }));
  const offline = { innerHTML: '' };
  // El <main id="contenido">: la raíz del router y el destino de «Saltar al contenido».
  const main = element('main', { id: 'contenido' });
  let markup = '';
  let painted = { h1: null, ids: new Map() };
  Object.defineProperty(main, 'innerHTML', {
    get: () => markup,
    set: (value) => {
      markup = String(value);
      painted = {
        h1: markup.includes('<h1') ? element('h1') : null,
        ids: new Map([...markup.matchAll(/<([a-zA-Z][\w-]*)\b[^>]*? id="([^"]+)"/g)].map(([, tag, id]) => [id, element(tag, { id })])),
      };
    },
  });
  main.querySelector = (selector) => (selector === 'h1' ? painted.h1
    : /^#[\w-]+$/.test(selector) ? painted.ids.get(selector.slice(1)) || null : null);
  main.contains = (el) => el === painted.h1 || [...painted.ids.values()].includes(el);

  doc.querySelector = (selector) => (selector === '.shell-offline' ? offline : null);
  doc.querySelectorAll = (selector) => (selector === '.tabbar a.tab' ? tabs : []);
  doc.getElementById = (id) => (id === 'contenido' ? main
    : id === 'legacyUpdated' && legacyUpdated != null ? { textContent: legacyUpdated } : painted.ids.get(id) || null);

  const history = {
    scrollRestoration: 'auto',
    get state() { return entries[index].state; },
    pushState(state, _title, url) {
      entries.splice(index + 1, entries.length, { hash: hashOf(url), state: structuredClone(state) });
      index++;
    },
    replaceState(state, _title, url) {
      entries[index] = { hash: url === undefined ? entries[index].hash : hashOf(url), state: structuredClone(state) };
    },
    // Sin deferBack el índice baja ya y solo se aplaza el evento; con deferBack, como un navegador
    // real, tampoco cambian history.state ni location.hash hasta que la vuelta atrás ocurre (así se
    // ve la carrera de dos back() seguidos, B2, ronda 2).
    back() {
      if (index === 0) return;
      const pop = () => { fire(listeners.window, 'popstate', { state: entries[index].state }); fire(listeners.window, 'hashchange', {}); };
      if (deferBack) {
        const target = index - 1;
        queueMicrotask(() => { index = target; pop(); });
        return;
      }
      index--;
      queueMicrotask(pop);
    },
  };
  const place = (map) => memoryStorage(map);
  const win = {
    document: doc, history, scrollY: 0, navigator: { onLine: true },
    location: { get hash() { return entries[index].hash; }, reload: () => { reloads.push(true); } },
    scrollTo(_x, y) { win.scrollY = y; fire(listeners.window, 'scroll', {}); },
    addEventListener: on(listeners.window),
    localStorage: place(storage), sessionStorage: place(new Map()),
  };

  return {
    win, doc, main, root: main, reloads,
    entries: () => entries.map((e) => e.hash),
    index: () => index,
    hash: () => entries[index].hash,
    h1: () => main.querySelector('h1'),
    // Los destinos marcados de la barra: [href, aria-current].
    marks: () => tabs.filter((t) => t.hasAttribute('aria-current')).map((t) => [t.getAttribute('href'), t.getAttribute('aria-current')]),
    // Un clic como lo recibe la delegación del documento, en un elemento con esos atributos;
    // devuelve si alguien lo atendió (preventDefault).
    click(attrs, tag = 'a') {
      let prevented = false;
      fire(listeners.document, 'click', { target: element(tag, attrs), button: 0, defaultPrevented: false, preventDefault() { prevented = true; } });
      return prevented;
    },
    // Un hash escrito a mano en la barra de direcciones: entrada nueva del navegador, sin estado.
    type(newHash) {
      entries.splice(index + 1, entries.length, { hash: newHash, state: null });
      index++;
      fire(listeners.window, 'popstate', { state: null });
      fire(listeners.window, 'hashchange', {});
    },
    scroll(y) { win.scrollY = y; fire(listeners.window, 'scroll', {}); },
    // navigator.onLine y su evento, como lo dispara un navegador de verdad.
    setOnline(value) {
      win.navigator.onLine = value;
      fire(listeners.window, value ? 'online' : 'offline', {});
    },
  };
}

// La sección pintada de una pantalla, lo justo para su mount (Plan B5, Tarea 4; el navegador falso de
// arriba no busca por selector ni guarda árboles): la delegación de sus clics, que se para con
// stopPropagation (lo que se para no sigue hasta el documento, donde escucha el router), y sus bloques
// por id (blocks: { id: markup }). Un bloque se sustituye con outerHTML, como en un navegador: el que
// sale deja de estar conectado y el nuevo, si trae el mismo id, se encuentra otra vez, con su título
// (.block-title), que guarda el foco que recibe. clickIn(id, attrs) pulsa un botón con esos atributos
// dentro del bloque `id`, y devuelve el evento ({ prevented, stopped }) y el botón. Con `view`, la
// sección es de un documento con esa ventana (ownerDocument.defaultView, la que usa fillSquad); sin
// ella, no tiene documento, como en Node.
export function fakeSection(screenId, blocks = {}, { view = null } = {}) {
  const listeners = [];
  const painted = new Map();
  const focus = { el: null };
  const makeBlock = (id, markup) => {
    const title = {
      tabindex: null, options: null,
      hasAttribute: (n) => n === 'tabindex' && title.tabindex !== null,
      setAttribute: (n, v) => { if (n === 'tabindex') title.tabindex = String(v); },
      focus: (options) => { title.options = options; focus.el = title; },
    };
    const el = {
      id, markup, title, isConnected: true,
      get outerHTML() { return el.markup; },
      set outerHTML(value) {
        el.isConnected = false;
        painted.delete(id);
        const next = String(value);
        if (next.includes(` id="${id}"`)) painted.set(id, makeBlock(id, next));
      },
      querySelector: (sel) => (sel === '.block-title' && el.markup.includes('class="block-title"') ? title : null),
    };
    return el;
  };
  for (const [id, markup] of Object.entries(blocks)) painted.set(id, makeBlock(id, String(markup)));
  const section = {
    ownerDocument: view ? { defaultView: view } : undefined,
    matches: (sel) => sel === `[data-screen="${screenId}"]`,
    contains: () => true,
    addEventListener: (type, fn) => { if (type === 'click') listeners.push(fn); },
    querySelector: (sel) => (/^#[\w-]+$/.test(sel) ? painted.get(sel.slice(1)) || null : null),
  };
  return {
    section, focus,
    block: (id) => painted.get(id) || null,
    clickIn(id, attrs, tag = 'button') {
      const target = {
        tagName: tag.toUpperCase(), attrs: { ...attrs }, disabled: false, textContent: '',
        hasAttribute: (n) => Object.hasOwn(target.attrs, n),
        getAttribute: (n) => (Object.hasOwn(target.attrs, n) ? target.attrs[n] : null),
        closest: (sel) => (matches(target, sel) ? target : sel === `#${id}` ? painted.get(id) || null : null),
      };
      const event = { target, prevented: false, stopped: false, preventDefault() { event.prevented = true; }, stopPropagation() { event.stopped = true; } };
      for (const fn of listeners) fn(event);
      return { event, target };
    },
  };
}
