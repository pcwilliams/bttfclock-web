// The curated list of cities offered in the settings picker.
//
// The catalog is deliberately small (40 entries) rather than exposing the
// full IANA tz list: most zones are redundant aliases, and a short,
// recognisable list is easier to scan. `id` is our own slug (the
// persistence key), not the IANA identifier, so zones can be remapped
// without breaking saved selections.
//
// `hill_valley` is an easter-egg alias for America/Los_Angeles.

/** @typedef {{ id: string, displayName: string, timeZone: string }} City */

/** @type {readonly City[]} */
export const ALL_CITIES = Object.freeze([
  ['london', 'LONDON', 'Europe/London'],
  ['new_york', 'NEW YORK', 'America/New_York'],
  ['hong_kong', 'HONG KONG', 'Asia/Hong_Kong'],
  ['los_angeles', 'LOS ANGELES', 'America/Los_Angeles'],
  ['chicago', 'CHICAGO', 'America/Chicago'],
  ['toronto', 'TORONTO', 'America/Toronto'],
  ['mexico_city', 'MEXICO CITY', 'America/Mexico_City'],
  ['sao_paulo', 'SAO PAULO', 'America/Sao_Paulo'],
  ['buenos_aires', 'BUENOS AIRES', 'America/Argentina/Buenos_Aires'],
  ['reykjavik', 'REYKJAVIK', 'Atlantic/Reykjavik'],
  ['dublin', 'DUBLIN', 'Europe/Dublin'],
  ['paris', 'PARIS', 'Europe/Paris'],
  ['berlin', 'BERLIN', 'Europe/Berlin'],
  ['madrid', 'MADRID', 'Europe/Madrid'],
  ['rome', 'ROME', 'Europe/Rome'],
  ['amsterdam', 'AMSTERDAM', 'Europe/Amsterdam'],
  ['stockholm', 'STOCKHOLM', 'Europe/Stockholm'],
  ['athens', 'ATHENS', 'Europe/Athens'],
  ['istanbul', 'ISTANBUL', 'Europe/Istanbul'],
  ['moscow', 'MOSCOW', 'Europe/Moscow'],
  ['cairo', 'CAIRO', 'Africa/Cairo'],
  ['lagos', 'LAGOS', 'Africa/Lagos'],
  ['johannesburg', 'JOHANNESBURG', 'Africa/Johannesburg'],
  ['dubai', 'DUBAI', 'Asia/Dubai'],
  ['tehran', 'TEHRAN', 'Asia/Tehran'],
  ['karachi', 'KARACHI', 'Asia/Karachi'],
  ['mumbai', 'MUMBAI', 'Asia/Kolkata'],
  ['bangkok', 'BANGKOK', 'Asia/Bangkok'],
  ['singapore', 'SINGAPORE', 'Asia/Singapore'],
  ['beijing', 'BEIJING', 'Asia/Shanghai'],
  ['tokyo', 'TOKYO', 'Asia/Tokyo'],
  ['seoul', 'SEOUL', 'Asia/Seoul'],
  ['sydney', 'SYDNEY', 'Australia/Sydney'],
  ['melbourne', 'MELBOURNE', 'Australia/Melbourne'],
  ['auckland', 'AUCKLAND', 'Pacific/Auckland'],
  ['honolulu', 'HONOLULU', 'Pacific/Honolulu'],
  ['anchorage', 'ANCHORAGE', 'America/Anchorage'],
  ['denver', 'DENVER', 'America/Denver'],
  ['vancouver', 'VANCOUVER', 'America/Vancouver'],
  ['hill_valley', 'HILL VALLEY', 'America/Los_Angeles'],
].map(([id, displayName, timeZone]) => Object.freeze({ id, displayName, timeZone })));

/** Linear lookup by slug. n = 40, so the scan is fine. */
export function cityWithId(id) {
  return ALL_CITIES.find((c) => c.id === id) ?? null;
}

/**
 * Default selection on first launch and after Reset. Time-ordered across
 * GMT offsets so each hour rolls down the display top-to-bottom.
 */
export const DEFAULT_SELECTION = Object.freeze(
  ['new_york', 'london', 'hong_kong'].map(cityWithId),
);
