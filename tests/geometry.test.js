import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sevenSegmentPolygons, fourteenSegmentPolygons, SegmentGeometry } from '../js/models/segmentGeometry.js';
import { rowLayout, intrinsicRowWidth, enclosureLayout, RowMetrics } from '../js/models/layout.js';

test('segment polygons: 7 and 14 hexagons', () => {
  const seven = sevenSegmentPolygons(16.24, 28);
  const fourteen = fourteenSegmentPolygons(19.04, 28);
  assert.equal(seven.length, 7);
  assert.equal(fourteen.length, 14);
  for (const p of [...seven, ...fourteen]) {
    assert.equal(p.length, 6);
    for (const [x, y] of p) assert.ok(Number.isFinite(x) && Number.isFinite(y));
  }
});

test('italic skew shifts the top right and leaves the baseline', () => {
  const h = 28;
  const upright = sevenSegmentPolygons(16, h, false);
  const italic = sevenSegmentPolygons(16, h, true);
  // Segment D (bottom bar) sits near y = h: barely moves.
  const dBottom = italic[3][0][0] - upright[3][0][0];
  // Segment A (top bar) sits near y = 0: moves ~ skew × h.
  const aTop = italic[0][0][0] - upright[0][0][0];
  assert.ok(aTop > dBottom);
  assert.ok(Math.abs(aTop - SegmentGeometry.italicSkew * (h - upright[0][0][1])) < 1e-9);
});

test('row width matches the Swift intrinsicRowWidth', () => {
  // 3×19.04+10+8 + 3×(2×16.24+5+8) + (4×16.24+15+8) + 18 + 12 + 5×4 + 9
  assert.ok(Math.abs(intrinsicRowWidth() - 358.52) < 1e-9);
  const row = rowLayout();
  assert.equal(row.width, intrinsicRowWidth());
  assert.equal(row.height, 28 + 22 + 3 + 18);
});

test('row layout: fields in order, non-overlapping, ending at the row edge', () => {
  const row = rowLayout();
  assert.deepEqual(row.fields.map((f) => f.caption), ['MONTH', 'DAY', 'YEAR', 'HOUR', 'MIN']);
  assert.deepEqual(row.fields.map((f) => f.chars.length), [3, 2, 4, 2, 2]);
  for (let i = 1; i < row.fields.length; i++) {
    const prev = row.fields[i - 1].window;
    assert.ok(row.fields[i].window.x >= prev.x + prev.w);
  }
  const last = row.fields.at(-1).window;
  assert.ok(Math.abs(last.x + last.w - row.width) < 1e-9);
  // Colon sits between HOUR and MIN, AM/PM between YEAR and HOUR.
  assert.ok(row.colon.x > row.fields[3].window.x && row.colon.x < row.fields[4].window.x);
  assert.ok(row.amPm.x > row.fields[2].window.x && row.amPm.x < row.fields[3].window.x);
});

test('AM/PM lamps clear the digit baseline', () => {
  const row = rowLayout();
  const windowBottom = row.fields[0].window.y + row.fields[0].window.h;
  assert.ok(row.amPm.pm.lamp.y + row.amPm.lampRadius < windowBottom);
  assert.ok(row.amPm.am.lamp.y < row.amPm.pm.label.y);
});

test('enclosure grows with row count; empty state still has a size', () => {
  const one = enclosureLayout(1);
  const three = enclosureLayout(3);
  assert.ok(three.height > one.height);
  assert.equal(three.panels.length, 3);
  assert.equal(one.width, three.width);
  const empty = enclosureLayout(0);
  assert.equal(empty.panels.length, 0);
  assert.ok(empty.empty.h > 0);
  assert.ok(RowMetrics.digitHeight > 0);
});
