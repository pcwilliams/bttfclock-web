import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClockModel, isColonLit } from '../js/services/clock.js';
import { cityWithId } from '../js/models/cityCatalog.js';

test('frozen date produces deterministic readouts', () => {
  const vm = new ClockModel({ frozenDate: new Date('1985-10-26T01:21:00-07:00') });
  const cities = ['london', 'new_york', 'hong_kong'].map(cityWithId);
  const readouts = vm.readouts(cities);
  assert.equal(readouts.length, 3);
  assert.ok(vm.isFrozen);
  assert.equal(readouts[1].hour12, 4); // 04:21 AM in New York
});

test('unfrozen clock reports not frozen', () => {
  assert.equal(new ClockModel().isFrozen, false);
});

test('frozen date does not advance over time', async () => {
  const vm = new ClockModel({ frozenDate: new Date(123_456_789_000) });
  const first = vm.now.getTime();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(vm.now.getTime(), first);
});

test('msUntilNextMinute counts down to the boundary', () => {
  const vm = new ClockModel();
  assert.equal(vm.msUntilNextMinute(1_700_000_040_000), 60_000);
  assert.equal(vm.msUntilNextMinute(1_700_000_099_999), 1);
  assert.equal(vm.msUntilNextMinute(1_700_000_070_000), 30_000);
});

const base = 1_700_000_000_000;

test('colon lit on the exact second boundary', () => {
  assert.ok(isColonLit(base));
});

test('colon lit through the first half-second', () => {
  for (let ms = 0; ms < 500; ms += 50) assert.ok(isColonLit(base + ms), `+${ms}ms`);
});

test('colon unlit through the second half-second', () => {
  for (let ms = 500; ms < 1000; ms += 50) assert.equal(isColonLit(base + ms), false, `+${ms}ms`);
});

test('colon toggles at exactly half a second', () => {
  assert.ok(isColonLit(base + 499));
  assert.equal(isColonLit(base + 501), false);
});
