// Shared palette for non-LED chrome: the painted plates and their text.
// The same across all three rows because on the prop these are physical
// DYMO-tape labels and silk-screen, not LEDs. sRGB 0…1, matching the app.

export const Palette = Object.freeze({
  /** Dull brick red behind field captions and AM/PM labels. */
  captionPlateRed: [0.60, 0.10, 0.09],
  /** Worn off-white used for all chrome text. */
  chromeTextGrey: [0.78, 0.78, 0.75],
  /** Near-black behind the city name. */
  cityPlateBlack: [0.04, 0.04, 0.04],
});

/** `[r,g,b]` in 0…1 → CSS `rgb()` string, for canvas drawing. */
export function cssRGB([r, g, b], alpha = 1) {
  const c = (v) => Math.round(v * 255);
  return alpha === 1
    ? `rgb(${c(r)}, ${c(g)}, ${c(b)})`
    : `rgba(${c(r)}, ${c(g)}, ${c(b)}, ${alpha})`;
}
