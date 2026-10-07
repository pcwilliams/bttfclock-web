// Polygon geometry for the hand-drawn LED segments — a direct port of the
// Swift app's SegmentShapes.swift so both platforms draw identical glyphs.
//
// Every bar (horizontal, vertical, diagonal) is a six-point hexagon with
// beveled tips, like real multiplexed LED segments and the DSEG font the
// prop is traced from. Italic skew is applied per point.
//
// Coordinates are y-DOWN inside a (0,0)–(w,h) character box, matching the
// SwiftUI original. The three.js layer flips y when building meshes.
// Each function returns an array indexed by segment bit, so callers can
// build one mesh per segment and light them from the bitmask.

export const SegmentGeometry = Object.freeze({
  /** Bar thickness as a fraction of the box's shorter side. */
  thicknessRatio: 0.18,
  /** Right-leaning x-shear as a fraction of height. */
  italicSkew: 0.10,
  /** Width / height of a 7-segment digit box. */
  sevenSegAspect: 0.58,
  /** Width / height of a 14-segment letter box (room for diagonals). */
  fourteenSegAspect: 0.68,
});

function skew([x, y], h, italic) {
  return italic ? [x + SegmentGeometry.italicSkew * (h - y), y] : [x, y];
}

function horizBar(cy, x0, x1, t) {
  const b = t * 0.5;
  return [[x0, cy], [x0 + b, cy - t / 2], [x1 - b, cy - t / 2],
    [x1, cy], [x1 - b, cy + t / 2], [x0 + b, cy + t / 2]];
}

function vertBar(cx, y0, y1, t) {
  const b = t * 0.5;
  return [[cx, y0], [cx + t / 2, y0 + b], [cx + t / 2, y1 - b],
    [cx, y1], [cx - t / 2, y1 - b], [cx - t / 2, y0 + b]];
}

function diagonal([x0, y0], [x1, y1], t) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const half = t / 2;
  const b = t * 0.5;
  const s = [x0 + ux * b, y0 + uy * b];
  const e = [x1 - ux * b, y1 - uy * b];
  return [[x0, y0], [s[0] + nx * half, s[1] + ny * half], [e[0] + nx * half, e[1] + ny * half],
    [x1, y1], [e[0] - nx * half, e[1] - ny * half], [s[0] - nx * half, s[1] - ny * half]];
}

function frame(w, h) {
  const t = Math.min(w, h) * SegmentGeometry.thicknessRatio;
  return {
    t,
    gap: t * 0.18, // gap where two segments meet
    midX: w / 2,
    midY: h / 2,
    leftX: t / 2,
    rightX: w - t / 2,
    topY: t / 2,
    botY: h - t / 2,
  };
}

function outerSix({ t, gap, midY, leftX, rightX, topY, botY }) {
  return [
    horizBar(topY, leftX + t, rightX - t, t),         // A
    vertBar(rightX, topY + gap, midY - gap, t),       // B
    vertBar(rightX, midY + gap, botY - gap, t),       // C
    horizBar(botY, leftX + t, rightX - t, t),         // D
    vertBar(leftX, midY + gap, botY - gap, t),        // E
    vertBar(leftX, topY + gap, midY - gap, t),        // F
  ];
}

/** Seven polygons (A–G) for a w×h box. */
export function sevenSegmentPolygons(w, h, italic = true) {
  const f = frame(w, h);
  const polys = outerSix(f);
  // Middle bar is inset (× 0.7) so it doesn't touch the side verticals.
  polys.push(horizBar(f.midY, f.leftX + f.t * 0.7, f.rightX - f.t * 0.7, f.t)); // G
  return polys.map((p) => p.map((pt) => skew(pt, h, italic)));
}

/** Fourteen polygons (A–F, G1, G2, H, I, J, K, L, M) for a w×h box. */
export function fourteenSegmentPolygons(w, h, italic = true) {
  const f = frame(w, h);
  const { t, gap, midX, midY, leftX, rightX, topY, botY } = f;
  // Diagonals are thinner: they cover more area at the same thickness.
  const dt = t * 0.78;
  const polys = outerSix(f);
  polys.push(
    horizBar(midY, leftX + t * 0.7, midX - gap, t),                                 // G1
    horizBar(midY, midX + gap, rightX - t * 0.7, t),                                // G2
    diagonal([leftX + t, topY + gap], [midX - gap, midY - gap * 0.3], dt),          // H
    vertBar(midX, topY + gap, midY - gap, t),                                       // I
    diagonal([rightX - t, topY + gap], [midX + gap, midY - gap * 0.3], dt),         // J
    diagonal([midX + gap, midY + gap * 0.3], [rightX - t, botY - gap], dt),         // K
    vertBar(midX, midY + gap, botY - gap, t),                                       // L
    diagonal([midX - gap, midY + gap * 0.3], [leftX + t, botY - gap], dt),          // M
  );
  return polys.map((p) => p.map((pt) => skew(pt, h, italic)));
}
