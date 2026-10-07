import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sevenSegmentMask, fourteenSegmentMask, isSegmentOn } from '../js/models/segmentMaps.js';

test('7-seg 0 lights all segments except the middle', () => {
  const m = sevenSegmentMask('0');
  for (let i = 0; i < 6; i++) assert.ok(isSegmentOn(m, i), `seg ${i}`);
  assert.equal(isSegmentOn(m, 6), false);
});

test('7-seg 1 lights only the right verticals', () => {
  const m = sevenSegmentMask('1');
  assert.ok(isSegmentOn(m, 1));
  assert.ok(isSegmentOn(m, 2));
  for (const i of [0, 3, 4, 5, 6]) assert.equal(isSegmentOn(m, i), false, `seg ${i} should be off`);
});

test('7-seg blank is zero', () => {
  assert.equal(sevenSegmentMask(' '), 0);
  assert.equal(sevenSegmentMask('_'), 0);
});

test('7-seg maps every digit', () => {
  for (const ch of '0123456789') assert.notEqual(sevenSegmentMask(ch), 0, `digit ${ch}`);
});

test('14-seg 0 has the slash diagonals', () => {
  const m = fourteenSegmentMask('0');
  assert.ok(isSegmentOn(m, 10), 'J (upper-right diagonal)');
  assert.ok(isSegmentOn(m, 13), 'M (lower-left diagonal)');
});

test('14-seg letter O is a full border with no diagonals', () => {
  const m = fourteenSegmentMask('O');
  for (let i = 0; i < 6; i++) assert.ok(isSegmentOn(m, i), `border seg ${i}`);
  assert.equal(isSegmentOn(m, 10), false);
  assert.equal(isSegmentOn(m, 13), false);
});

test('14-seg lookup is case-insensitive', () => {
  assert.equal(fourteenSegmentMask('c'), fourteenSegmentMask('C'));
  assert.equal(fourteenSegmentMask('t'), fourteenSegmentMask('T'));
});

test('14-seg maps every month letter', () => {
  for (const ch of 'JANFEBMARPYULGSOCTVD') assert.notEqual(fourteenSegmentMask(ch), 0, `letter ${ch}`);
});

test('regression: A, S and V masks (fixed in the Swift app)', () => {
  assert.equal(fourteenSegmentMask('A'), 0x00f7);
  assert.equal(fourteenSegmentMask('S'), 0x00ed);
  // V = B, F, K, M
  assert.equal(fourteenSegmentMask('V'), (1 << 1) | (1 << 5) | (1 << 11) | (1 << 13));
});
