// Pure layout maths for the clock face, in the Swift app's "natural
// points" (y-DOWN, origin at the top-left of each row's content box).
//
// The three.js scene uses these numbers 1:1 as world units, so a field
// that is 45.48pt wide in SwiftUI is 45.48 units wide in the 3D model.
// The camera then fits the whole enclosure to the viewport, which is the
// 3D equivalent of the Swift app's per-row `.scaleEffect`.
//
// Keeping this free of three.js lets the unit tests pin the geometry.

import { SegmentGeometry } from './segmentGeometry.js';

export const RowMetrics = Object.freeze({
  digitHeight: 28,      // height of one LED character
  charGap: 5,           // between characters inside a field
  fieldGap: 4,          // between fields in the same group
  dateTimeGap: 9,       // YEAR → AM/PM: separates date from time
  amPmWidth: 18,
  colonWidth: 12,
  rowExtraHeight: 22,   // room above the digits for caption plates
  cityPlateHeight: 18,
  cityPlateSpacing: 3,
  windowPadH: 4,        // LED inset inside each black window
  windowPadV: 3,
  captionHeight: 11,    // red DYMO caption plate
  captionGap: 2,        // caption → window
});

export const EnclosureMetrics = Object.freeze({
  paddingH: 10,
  paddingV: 10,
  rowSpacing: 5,
  panelPadH: 7,
  panelPadV: 5,
  cornerRadius: 14,
  panelCornerRadius: 5,
  rivetInset: 5.5,
  rivetRadius: 2.6,
  emptyStateHeight: 60,
});

/** Total natural width of one row: the sum of every field and gap. */
export function intrinsicRowWidth(m = RowMetrics) {
  const digitW = m.digitHeight * SegmentGeometry.sevenSegAspect;
  const charW = m.digitHeight * SegmentGeometry.fourteenSegAspect;
  const pad = m.windowPadH * 2;
  const monthW = charW * 3 + m.charGap * 2 + pad;
  const twoDigitW = digitW * 2 + m.charGap + pad;
  const yearW = digitW * 4 + m.charGap * 3 + pad;
  return monthW + twoDigitW * 3 + yearW + m.amPmWidth + m.colonWidth
    + m.fieldGap * 5 + m.dateTimeGap;
}

/**
 * Full geometry of one row. All rects are `{ x, y, w, h }`, y-down.
 *
 * Vertical placement mirrors the SwiftUI HStack(alignment: .bottom):
 * caption + gap + window = 47pt, centred in the 50pt display row.
 */
export function rowLayout(m = RowMetrics) {
  const width = intrinsicRowWidth(m);
  const displayHeight = m.digitHeight + m.rowExtraHeight;
  const height = displayHeight + m.cityPlateSpacing + m.cityPlateHeight;

  const windowH = m.digitHeight + m.windowPadV * 2;
  const fieldH = m.captionHeight + m.captionGap + windowH;
  const top = (displayHeight - fieldH) / 2;
  const windowY = top + m.captionHeight + m.captionGap;
  const bottom = windowY + windowH;
  const digitY = windowY + m.windowPadV;
  const digitCenterY = digitY + m.digitHeight / 2;

  const digitW = m.digitHeight * SegmentGeometry.sevenSegAspect;
  const charW = m.digitHeight * SegmentGeometry.fourteenSegAspect;

  let x = 0;
  const fields = [];
  const addField = (id, caption, count, kind) => {
    const cw = kind === 14 ? charW : digitW;
    const w = cw * count + m.charGap * (count - 1) + m.windowPadH * 2;
    const chars = [];
    for (let i = 0; i < count; i++) {
      chars.push({ x: x + m.windowPadH + i * (cw + m.charGap), y: digitY, w: cw, h: m.digitHeight, kind });
    }
    fields.push({
      id,
      caption,
      window: { x, y: windowY, w, h: windowH },
      captionCenter: { x: x + w / 2, y: top + m.captionHeight / 2 },
      chars,
    });
    x += w;
  };

  addField('month', 'MONTH', 3, 14);
  x += m.fieldGap;
  addField('day', 'DAY', 2, 7);
  x += m.fieldGap;
  addField('year', 'YEAR', 4, 7);
  x += m.dateTimeGap;

  // AM/PM block: two (label plate + lamp) pairs stacked, bottom-aligned
  // like a field, then nudged up 5pt so the PM lamp clears the baseline.
  const amPmX = x;
  const labelH = 7.7;
  const lampR = 2.5;
  const pairH = labelH + 0.5 + lampR * 2;
  const amPmBottom = bottom - 5;
  const pmLampY = amPmBottom - lampR;
  const pmLabelY = pmLampY - lampR - 0.5 - labelH / 2;
  const amLampY = pmLampY - pairH - 1.5;
  const amLabelY = amLampY - lampR - 0.5 - labelH / 2;
  const amPmCx = amPmX + m.amPmWidth / 2;
  const amPm = {
    x: amPmX,
    w: m.amPmWidth,
    labelH,
    lampRadius: lampR,
    am: { label: { x: amPmCx, y: amLabelY }, lamp: { x: amPmCx, y: amLampY } },
    pm: { label: { x: amPmCx, y: pmLabelY }, lamp: { x: amPmCx, y: pmLampY } },
  };
  x += m.amPmWidth + m.fieldGap;

  addField('hour', 'HOUR', 2, 7);
  x += m.fieldGap;

  // Colon: no window, two 5pt dots centred on the digits, 9pt apart.
  const colonCx = x + m.colonWidth / 2;
  const colon = {
    x,
    w: m.colonWidth,
    dotRadius: 2.5,
    dots: [{ x: colonCx, y: digitCenterY - 4.5 }, { x: colonCx, y: digitCenterY + 4.5 }],
  };
  x += m.colonWidth + m.fieldGap;

  addField('minute', 'MIN', 2, 7);

  const cityPlate = {
    cx: width / 2,
    y: displayHeight + m.cityPlateSpacing,
    h: m.cityPlateHeight,
  };

  return { width, height, displayHeight, fields, amPm, colon, cityPlate, digitCenterY };
}

/**
 * Enclosure geometry for `rowCount` rows (0 → empty-state panel).
 * Returns the outer size and each row panel's rect plus the rect its
 * row content occupies. y-down, origin at the enclosure's top-left.
 */
export function enclosureLayout(rowCount, e = EnclosureMetrics, row = rowLayout()) {
  const panelW = row.width + e.panelPadH * 2;
  const panelH = row.height + e.panelPadV * 2;
  const width = panelW + e.paddingH * 2;
  const panels = [];
  if (rowCount === 0) {
    const height = e.emptyStateHeight + e.paddingV * 2;
    return { width, height, panels, empty: { x: e.paddingH, y: e.paddingV, w: panelW, h: e.emptyStateHeight } };
  }
  let y = e.paddingV;
  for (let i = 0; i < rowCount; i++) {
    panels.push({
      panel: { x: e.paddingH, y, w: panelW, h: panelH },
      content: { x: e.paddingH + e.panelPadH, y: y + e.panelPadV, w: row.width, h: row.height },
    });
    y += panelH + e.rowSpacing;
  }
  const height = y - e.rowSpacing + e.paddingV;
  return { width, height, panels, empty: null };
}
