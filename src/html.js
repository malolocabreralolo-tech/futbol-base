// Plantillas con escapado automático (spec §5.1).
// html`…` escapa toda interpolación salvo los fragmentos Html que ella misma
// produce (y los arrays de ellos). Así, un nombre de equipo con comillas o
// «<» nunca rompe el marcado ni inyecta nada.

export class Html { constructor(s) { this.s = s; } toString() { return this.s; } }

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escape(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

// Una interpolación: Html tal cual, arrays unidos sin separador, null,
// undefined y false como nada (permite ${cond && html`…`}), y el resto escapado.
function part(value) {
  if (value instanceof Html) return value.s;
  if (Array.isArray(value)) return value.map(part).join('');
  if (value === false) return '';
  return escape(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return new Html(out);
}

export function raw(value) {
  if (value instanceof Html) return value;
  throw new TypeError('raw() solo acepta fragmentos creados con html``');
}

export function join(items, sep = '') {
  const kept = items.filter((item) => item != null && item !== false);
  return new Html(kept.map(part).join(part(sep)));
}
