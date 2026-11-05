import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isBefore,
  isValidCalendarDate,
  systemClock,
  todayLocal,
} from '../../src/domain/dates.js';

const clockAt = (...parts) => () => new Date(...parts);

test('todayLocal returns the local date of the injected clock', () => {
  assert.equal(todayLocal(clockAt(2026, 10, 5, 12, 0, 0)), '2026-11-05');
});

test('todayLocal pads single-digit month and day', () => {
  assert.equal(todayLocal(clockAt(2026, 0, 3, 8, 0, 0)), '2026-01-03');
});

test('todayLocal changes exactly at local midnight', () => {
  const justBefore = clockAt(2026, 10, 5, 23, 59, 59, 999);
  const justAfter = clockAt(2026, 10, 6, 0, 0, 0, 0);
  assert.equal(todayLocal(justBefore), '2026-11-05');
  assert.equal(todayLocal(justAfter), '2026-11-06');
});

test('todayLocal uses the system clock by default', () => {
  assert.match(todayLocal(), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(systemClock() instanceof Date);
});

test('isValidCalendarDate accepts real dates including a leap day', () => {
  assert.equal(isValidCalendarDate('2026-11-05'), true);
  assert.equal(isValidCalendarDate('2024-02-29'), true);
  assert.equal(isValidCalendarDate('2026-12-31'), true);
});

test('isValidCalendarDate rejects dates that do not exist', () => {
  assert.equal(isValidCalendarDate('2026-02-30'), false);
  assert.equal(isValidCalendarDate('2026-13-01'), false);
  assert.equal(isValidCalendarDate('2025-02-29'), false);
  assert.equal(isValidCalendarDate('2026-04-31'), false);
  assert.equal(isValidCalendarDate('2026-00-10'), false);
  assert.equal(isValidCalendarDate('2026-01-00'), false);
});

test('isValidCalendarDate rejects wrong formats and wrong types', () => {
  for (const value of ['', '2026-1-5', '05-11-2026', '2026/11/05', '2026-11-05T00:00:00Z', ' 2026-11-05', null, undefined, 20261105, {}]) {
    assert.equal(isValidCalendarDate(value), false, String(value));
  }
});

test('isBefore compares YYYY-MM-DD dates', () => {
  assert.equal(isBefore('2026-11-04', '2026-11-05'), true);
  assert.equal(isBefore('2026-11-06', '2026-11-05'), false);
  assert.equal(isBefore('2025-12-31', '2026-01-01'), true);
});

test('isBefore is false for equal dates', () => {
  assert.equal(isBefore('2026-11-05', '2026-11-05'), false);
});
