// URL query parameters — the web equivalent of the app's launch
// arguments. Applied after persistence loads, so they win.
//
//   ?frozendate=1985-10-26T01:21:00-07:00   pin the clock at an instant
//   ?cities=london,tokyo,sydney             replace the selection
//   ?settings                               open the city panel on load
//
// Every parser returns null / false when the parameter is absent.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Parses an ISO 8601 instant with an explicit offset. The offset is
 * required: a bare local time would mean different instants on
 * different machines, defeating reproducible screenshots.
 *
 * URLSearchParams decodes '+' as a space, so `+01:00` in an unencoded
 * URL arrives as ` 01:00`; we put the plus back.
 */
export function parseFrozenDate(value) {
  if (value == null) return null;
  const v = value.trim().replace(/ (\d{2}:?\d{2})$/, '+$1');
  const m = ISO_RE.exec(v);
  if (!m) return null;
  let offset = m[8];
  if (offset !== 'Z' && !offset.includes(':')) offset = `${offset.slice(0, 3)}:${offset.slice(3)}`;
  const normalised = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}${m[7] ?? ''}${offset}`;
  const t = Date.parse(normalised);
  return Number.isNaN(t) ? null : new Date(t);
}

/** `a,b,c` → ['a','b','c'] (trimmed, lower-cased, empties dropped). */
export function parseCityIds(value) {
  if (value == null) return null;
  const ids = value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return ids.length ? ids : null;
}

export function parseLaunchArgs(search) {
  const p = new URLSearchParams(search);
  return {
    frozenDate: parseFrozenDate(p.get('frozendate')),
    cityIds: parseCityIds(p.get('cities')),
    openSettings: p.has('settings'),
  };
}
