import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dateToKey, formatLongDate, getDaysUntil, keyToDate } from '../src/services/dates.ts';

test('date keys round-trip through local dates', () => {
  assert.equal(dateToKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(dateToKey(keyToDate('2026-12-31')), '2026-12-31');
});

test('formats a date key in full', () => {
  assert.equal(formatLongDate('2026-10-08'), '8 October 2026');
});

test('counts whole days until a date', () => {
  assert.equal(getDaysUntil('2026-10-08', '2026-10-08'), 0);
  assert.equal(getDaysUntil('2026-10-09', '2026-10-08'), 1);
  assert.equal(getDaysUntil('2027-01-01', '2026-12-31'), 1);
  assert.equal(getDaysUntil('2026-10-01', '2026-10-08'), -7);
});

test('day counts are not shifted by daylight saving changes', () => {
  assert.equal(getDaysUntil('2026-10-26', '2026-10-24'), 2);
  assert.equal(getDaysUntil('2026-03-30', '2026-03-28'), 2);
});

test('an impossible date returns -1', () => {
  assert.equal(getDaysUntil('2026-02-30', '2026-02-01'), -1);
  assert.equal(getDaysUntil('', '2026-02-01'), -1);
});
