// Qué pantalla pinta cada ruta de §4.1 (el router las recibe de app.js). Las de B3 llevan la
// provisional (decisión 6 de B2) hasta que llegue la suya.
import { SCREENS } from './links.js';
import { screen as home } from './screen-home.js';
import { screen as pendiente } from './screen-pendiente.js';

const READY = { '': home };

export const SCREEN_MAP = Object.freeze(Object.fromEntries(SCREENS.map((name) => [name, READY[name] || pendiente])));
