// The three colours of the Time Circuits rows, in fixed top-to-bottom
// order matching the screen-used prop: red (destination time), green
// (present time), amber (last time departed).
//
// Colour is derived from the row's *slot index*, not from the city, so
// moving a city to a new slot also changes its LED colour.
//
// All values are sRGB triples in 0…1, identical to the Swift app's
// RowColor so both platforms match.

export const RowColor = Object.freeze({
  red: Object.freeze({
    name: 'red',
    lit: [1.0, 0.16, 0.16],        // saturated: colon dots, AM/PM lamps
    litCore: [1.0, 0.55, 0.45],    // pale centre of lit segments
    bloom: [1.0, 0.16, 0.10],      // halo tint
    ghost: [0.22, 0.04, 0.04],     // unlit segments seen through the gel
    windowTint: [0.08, 0.01, 0.01], // dark cast behind the digits
  }),
  green: Object.freeze({
    name: 'green',
    lit: [0.20, 1.0, 0.35],
    litCore: [0.70, 1.0, 0.75],
    bloom: [0.23, 1.0, 0.30],
    ghost: [0.04, 0.16, 0.06],
    windowTint: [0.01, 0.06, 0.02],
  }),
  amber: Object.freeze({
    name: 'amber',
    lit: [1.0, 0.70, 0.0],
    litCore: [1.0, 0.90, 0.55],
    bloom: [1.0, 0.70, 0.10],
    ghost: [0.20, 0.12, 0.02],
    windowTint: [0.07, 0.04, 0.0],
  }),
});

/**
 * Maps a 0-based row slot to its colour. Index 2 and above collapse to
 * amber so an out-of-range index never yields undefined.
 */
export function rowColorForIndex(index) {
  if (index === 0) return RowColor.red;
  if (index === 1) return RowColor.green;
  return RowColor.amber;
}
