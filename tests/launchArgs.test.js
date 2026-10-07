import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowColorForIndex, RowColor } from '../js/models/rowColor.js';
import { cityWithId, DEFAULT_SELECTION, ALL_CITIES } from '../js/models/cityCatalog.js';
import { parseLaunchArgs, parseFrozenDate, parseCityIds } from '../js/services/launchArgs.js';

test('row colour follows slot index', () => {
  assert.equal(rowColorForIndex(0), RowColor.red);
  assert.equal(rowColorForIndex(1), RowColor.green);
  assert.equal(rowColorForIndex(2), RowColor.amber);
  assert.equal(rowColorForIndex(99), RowColor.amber);
});

test('catalog has London, New York and Hong Kong', () => {
  for (const id of ['london', 'new_york', 'hong_kong']) assert.ok(cityWithId(id));
});

test('default selection is three cities', () => {
  assert.equal(DEFAULT_SELECTION.length, 3);
});

test('Hill Valley easter egg', () => {
  const hv = cityWithId('hill_valley');
  assert.ok(hv);
  assert.equal(hv.displayName, 'HILL VALLEY');
  assert.equal(hv.timeZone, 'America/Los_Angeles');
});

test('catalog: 40 unique ids, every zone known to Intl', () => {
  assert.equal(ALL_CITIES.length, 40);
  assert.equal(new Set(ALL_CITIES.map((c) => c.id)).size, 40);
  for (const c of ALL_CITIES) {
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: c.timeZone }), c.id);
  }
});

test('frozendate parses common ISO 8601 forms', () => {
  const expected = Date.parse('1985-10-26T08:21:00Z');
  for (const v of [
    '1985-10-26T01:21:00-07:00',
    '1985-10-26T01:21-07:00',
    '1985-10-26T01:21:00.000-07:00',
    '1985-10-26T01:21:00-0700',
    '1985-10-26T08:21:00Z',
  ]) {
    assert.equal(parseFrozenDate(v)?.getTime(), expected, v);
  }
});

test('frozendate restores a "+" offset that URL decoding turned into a space', () => {
  const args = parseLaunchArgs('?frozendate=2015-10-21T16:29:00+01:00');
  assert.equal(args.frozenDate.getTime(), Date.parse('2015-10-21T15:29:00Z'));
});

test('frozendate rejects missing offsets and garbage', () => {
  for (const v of ['1985-10-26T01:21:00', 'yesterday', '', '1985-13-45T99:99:00Z']) {
    assert.equal(parseFrozenDate(v), null, v);
  }
  assert.equal(parseFrozenDate(null), null);
});

test('cities parses a trimmed, lower-cased list', () => {
  assert.deepEqual(parseCityIds(' London, tokyo ,,sydney '), ['london', 'tokyo', 'sydney']);
  assert.equal(parseCityIds(''), null);
  assert.equal(parseCityIds(null), null);
});

test('flags default to off when absent', () => {
  const none = parseLaunchArgs('');
  assert.deepEqual(none, { frozenDate: null, cityIds: null, openSettings: false });
  const all = parseLaunchArgs('?settings&cities=paris');
  assert.equal(all.openSettings, true);
  assert.deepEqual(all.cityIds, ['paris']);
});
