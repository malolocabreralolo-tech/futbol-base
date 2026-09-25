// Qué pantalla pinta cada ruta de §4.1 (el router las recibe de app.js). Las de B3 llevan la
// provisional (decisión 6 de B2) hasta que llegue la suya.
import { SCREENS } from './links.js';
import { screen as home } from './screen-home.js';
import { screen as jornada } from './screen-jornada.js';
import { screen as tabla } from './screen-tabla.js';
import { screen as partido } from './screen-partido.js';
import { screen as copa } from './screen-copa.js';
import { screen as goleadores } from './screen-goleadores.js';
import { screen as equipo } from './screen-equipo.js';
import { screen as explorar } from './screen-explorar.js';
import { screen as ligas } from './screen-ligas.js';
import { screen as records } from './screen-records.js';
import { screen as pendiente } from './screen-pendiente.js';

const READY = { '': home, jornada, tabla, partido, equipo, explorar, ligas, copa, goleadores, records };

export const SCREEN_MAP = Object.freeze(Object.fromEntries(SCREENS.map((name) => [name, READY[name] || pendiente])));
