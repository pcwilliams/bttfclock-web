import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TimeReadout, MONTH_ABBREVIATIONS, resolveTimeZone } from '../js/models/timeReadout.js';

test('BTTF classic: 1985-10-26 01:21 Los Angeles', () => {
  const instant = new Date('1985-10-26T01:21:00-07:00');
  const r = TimeReadout.make(instant, 'America/Los_Angeles');
  assert.equal(r.month, 'OCT');
  assert.equal(r.day, 26);
  assert.equal(r.year, 1985);
  assert.equal(r.hour12, 1);
  assert.equal(r.minute, 21);
  assert.equal(r.isAM, true);
});

test('midnight reads as 12 AM', () => {
  const r = TimeReadout.make(new Date('2000-01-01T00:00:00Z'), 'UTC');
  assert.equal(r.hour12, 12);
  assert.equal(r.isAM, true);
});

test('noon reads as 12 PM', () => {
  const r = TimeReadout.make(new Date('2000-01-01T12:00:00Z'), 'UTC');
  assert.equal(r.hour12, 12);
  assert.equal(r.isAM, false);
});

test('same instant, different time zones, different readouts', () => {
  const instant = new Date(1_700_000_000_000);
  const london = TimeReadout.make(instant, 'Europe/London');
  const ny = TimeReadout.make(instant, 'America/New_York');
  const hk = TimeReadout.make(instant, 'Asia/Hong_Kong');
  assert.equal(london.equals(ny), false);
  assert.equal(ny.equals(hk), false);
});

test('digit strings are zero-padded', () => {
  const r = new TimeReadout({ month: 'JAN', day: 3, year: 42, hour12: 7, minute: 5, isAM: true });
  assert.equal(r.dayDigits, '03');
  assert.equal(r.yearDigits, '0042');
  assert.equal(r.hourDigits, '07');
  assert.equal(r.minuteDigits, '05');
});

test('year clamps at 0000 and 9999', () => {
  const low = new TimeReadout({ month: 'JAN', day: 1, year: -100, hour12: 12, minute: 0, isAM: true });
  assert.equal(low.yearDigits, '0000');
  const high = new TimeReadout({ month: 'JAN', day: 1, year: 99999, hour12: 12, minute: 0, isAM: true });
  assert.equal(high.yearDigits, '9999');
});

test('month abbreviations are exactly three upper-case letters', () => {
  assert.equal(MONTH_ABBREVIATIONS.length, 12);
  for (const m of MONTH_ABBREVIATIONS) {
    assert.equal(m.length, 3);
    assert.equal(m, m.toUpperCase());
  }
});

test('unknown time zone falls back to UTC instead of throwing', () => {
  assert.equal(resolveTimeZone('Mars/Olympus_Mons'), 'UTC');
  const r = TimeReadout.make(new Date('2000-01-01T15:30:00Z'), 'Mars/Olympus_Mons');
  assert.equal(r.hour12, 3);
  assert.equal(r.minute, 30);
  assert.equal(r.isAM, false);
});

test('DST: London is GMT in January and BST in July', () => {
  const jan = TimeReadout.make(new Date('2026-01-15T12:00:00Z'), 'Europe/London');
  const jul = TimeReadout.make(new Date('2026-07-15T12:00:00Z'), 'Europe/London');
  assert.equal(jan.hour12, 12);
  assert.equal(jul.hour12, 1);
});
