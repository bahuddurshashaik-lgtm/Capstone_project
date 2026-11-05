import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPLETED_CUE,
  CORRUPT_STORE_TEXT,
  EMPTY_LIST_TEXT,
  GENERIC_ERROR_TEXT,
  NOT_FOUND_TEXT,
  NO_MATCH_TEXT,
  OVERDUE_CUE,
  WRITE_FAILED_TEXT,
  describeError,
  describeTask,
  dueDateText,
  emptyStateMessage,
  formatCompletedAt,
  listSummaryText,
  statusCue,
  toggleAction,
} from '../../src/public/view-model.js';

const openTask = {
  id: 'a1',
  title: 'Buy milk',
  description: 'Two litres',
  priority: 'High',
  dueDate: '2026-11-06',
  status: 'Open',
  createdAt: '2026-11-05T09:00:00.000Z',
  completedAt: null,
  overdue: false,
};

const overdueTask = { ...openTask, dueDate: '2026-11-01', overdue: true };

const completedTask = {
  ...openTask,
  status: 'Completed',
  completedAt: '2026-11-05T18:00:00.000Z',
};

const normaliseSpaces = (text) => text.replace(/\s/g, ' ');

test('the module loads in Node without a DOM', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  assert.equal(typeof describeTask, 'function');
});

// ---- cues (FR-16, FR-25, NFR-8) ----

test('an overdue open task gets the Overdue text badge and an icon', () => {
  const view = describeTask(overdueTask);
  assert.deepEqual(view.cue, OVERDUE_CUE);
  assert.equal(view.cue.text, 'Overdue');
  assert.notEqual(view.cue.icon, '');
  assert.equal(view.strikeThrough, false);
});

test('a completed task gets the Completed text, an icon and strike-through', () => {
  const view = describeTask(completedTask);
  assert.deepEqual(view.cue, COMPLETED_CUE);
  assert.equal(view.cue.text, 'Completed');
  assert.notEqual(view.cue.icon, '');
  assert.equal(view.strikeThrough, true);
});

test('an open task that is not overdue has no cue and no strike-through', () => {
  const view = describeTask(openTask);
  assert.equal(view.cue, null);
  assert.equal(view.strikeThrough, false);
});

test('the overdue flag comes from the API: a past due date alone does not make a task overdue', () => {
  const task = { ...openTask, dueDate: '2000-01-01', overdue: false };
  assert.equal(statusCue(task), null);
});

test('only an overdue flag of true gives the Overdue cue', () => {
  assert.equal(statusCue({ ...openTask, overdue: 'true' }), null);
  assert.equal(statusCue({ ...openTask, overdue: undefined }), null);
  assert.equal(statusCue(overdueTask), OVERDUE_CUE);
});

test('a completed task never shows the Overdue cue', () => {
  assert.equal(statusCue({ ...completedTask, overdue: true }), COMPLETED_CUE);
});

// ---- labels ----

test('describeTask gives plain text labels for priority, due date and status', () => {
  const view = describeTask(openTask);
  assert.equal(view.id, 'a1');
  assert.equal(view.title, 'Buy milk');
  assert.equal(view.description, 'Two litres');
  assert.equal(view.priorityText, 'Priority: High');
  assert.equal(view.dueText, 'Due 2026-11-06');
  assert.equal(view.statusText, 'Status: Open');
  assert.equal(view.completedText, null);
});

test('describeTask leaves task text unchanged, so the UI can write it with textContent', () => {
  const view = describeTask({ ...openTask, title: '<script>alert(1)</script>', description: '<b>x</b>' });
  assert.equal(view.title, '<script>alert(1)</script>');
  assert.equal(view.description, '<b>x</b>');
});

test('dueDateText says "No due date" for null and for an empty value', () => {
  assert.equal(dueDateText(null), 'No due date');
  assert.equal(dueDateText(''), 'No due date');
  assert.equal(dueDateText(undefined), 'No due date');
  assert.equal(dueDateText('2026-12-31'), 'Due 2026-12-31');
});

test('the due date text does not depend on the time zone', () => {
  assert.equal(dueDateText('2026-03-29'), 'Due 2026-03-29');
});

test('a missing description becomes an empty string', () => {
  assert.equal(describeTask({ ...openTask, description: undefined }).description, '');
});

// ---- completion time (FR-24, A-13) ----

test('the completion time is shown in the requested local time zone', () => {
  const options = { locale: 'en-US', timeZone: 'Asia/Kolkata' };
  assert.match(normaliseSpaces(formatCompletedAt('2026-11-05T18:00:00.000Z', options)), /Nov 5, 2026, 11:30 PM/);
  const utc = { locale: 'en-US', timeZone: 'UTC' };
  assert.match(normaliseSpaces(formatCompletedAt('2026-11-05T18:00:00.000Z', utc)), /Nov 5, 2026, 6:00 PM/);
});

test('a time zone change can move the completion time to the next day', () => {
  const result = formatCompletedAt('2026-11-05T22:00:00.000Z', { locale: 'en-US', timeZone: 'Asia/Kolkata' });
  assert.match(normaliseSpaces(result), /Nov 6, 2026, 3:30 AM/);
});

test('formatCompletedAt returns null for a missing or invalid time', () => {
  assert.equal(formatCompletedAt(null), null);
  assert.equal(formatCompletedAt(undefined), null);
  assert.equal(formatCompletedAt('not a date'), null);
  assert.equal(formatCompletedAt(12345), null);
});

test('a completed task shows the formatted completion time', () => {
  const view = describeTask(completedTask, { locale: 'en-US', timeZone: 'UTC' });
  assert.match(normaliseSpaces(view.completedText), /^Completed on Nov 5, 2026, 6:00 PM$/);
});

test('a completed task with an unreadable completion time shows no time line', () => {
  assert.equal(describeTask({ ...completedTask, completedAt: 'bad' }).completedText, null);
});

test('an open task never shows a completion time', () => {
  assert.equal(describeTask({ ...openTask, completedAt: '2026-11-05T18:00:00.000Z' }).completedText, null);
});

// ---- toggle (FR-23) ----

test('toggleAction offers the opposite status', () => {
  assert.deepEqual(toggleAction(openTask), { label: 'Mark complete', nextStatus: 'Completed' });
  assert.deepEqual(toggleAction(completedTask), { label: 'Reopen', nextStatus: 'Open' });
});

test('describeTask carries the toggle action', () => {
  assert.equal(describeTask(openTask).toggle.nextStatus, 'Completed');
  assert.equal(describeTask(completedTask).toggle.nextStatus, 'Open');
});

// ---- empty state and summary (FR-17) ----

test('the empty state says "No tasks yet" when no task exists', () => {
  assert.equal(emptyStateMessage(0), 'No tasks yet');
  assert.equal(emptyStateMessage(0), EMPTY_LIST_TEXT);
});

test('the empty state says "No tasks match your filters" when tasks exist but none match', () => {
  assert.equal(emptyStateMessage(1), 'No tasks match your filters');
  assert.equal(emptyStateMessage(1000), NO_MATCH_TEXT);
});

test('the empty state falls back to "No tasks yet" for a missing total', () => {
  assert.equal(emptyStateMessage(undefined), EMPTY_LIST_TEXT);
});

test('the list summary shows shown and total counts', () => {
  assert.equal(listSummaryText(2, 5), 'Showing 2 of 5 tasks');
  assert.equal(listSummaryText(1, 1), 'Showing 1 of 1 task');
  assert.equal(listSummaryText(0, 0), 'Showing 0 of 0 tasks');
});

// ---- error messages (architecture 6.2) ----

test('NOT_FOUND gives "Task not found" and asks for a refresh', () => {
  const info = describeError({ code: 'NOT_FOUND', message: 'Task not found', fields: null });
  assert.deepEqual(info, { text: 'Task not found', display: 'message', refresh: true });
  assert.equal(info.text, NOT_FOUND_TEXT);
});

test('only NOT_FOUND gives "Task not found"', () => {
  const codes = [
    'ROUTE_NOT_FOUND',
    'METHOD_NOT_ALLOWED',
    'FORBIDDEN',
    'PAYLOAD_TOO_LARGE',
    'UNSUPPORTED_MEDIA_TYPE',
    'INTERNAL',
    'NETWORK_ERROR',
    'UNEXPECTED_RESPONSE',
    'SOMETHING_NEW',
  ];
  for (const code of codes) {
    const info = describeError({ code, message: 'Task not found', fields: null });
    assert.equal(info.text, GENERIC_ERROR_TEXT, code);
    assert.equal(info.display, 'message', code);
    assert.equal(info.refresh, false, code);
  }
});

test('a corrupt store shows the server message in a banner, with the file path', () => {
  const message = 'Your task file cannot be read: C:\\data\\tasks.json. It was not changed. Fix, move or delete the file, then reload this page.';
  const info = describeError({ code: 'STORE_CORRUPT', message, fields: null });
  assert.deepEqual(info, { text: message, display: 'banner', refresh: false });
});

test('a corrupt store without a server message uses the default banner text', () => {
  assert.equal(describeError({ code: 'STORE_CORRUPT' }).text, CORRUPT_STORE_TEXT);
  assert.equal(describeError({ code: 'STORE_CORRUPT', message: '  ' }).text, CORRUPT_STORE_TEXT);
});

test('a write failure shows the "Nothing was changed" banner', () => {
  const info = describeError({ code: 'STORE_WRITE_FAILED', message: WRITE_FAILED_TEXT, fields: null });
  assert.deepEqual(info, { text: WRITE_FAILED_TEXT, display: 'banner', refresh: false });
  assert.equal(describeError({ code: 'STORE_WRITE_FAILED' }).text, WRITE_FAILED_TEXT);
});

test('a validation error with fields is shown next to the fields', () => {
  const info = describeError({
    code: 'VALIDATION_ERROR',
    message: 'Please correct the highlighted fields.',
    fields: { title: 'Enter a title.' },
  });
  assert.equal(info.display, 'fields');
  assert.equal(info.refresh, false);
});

test('a validation error without fields (for example bad JSON) is shown as a message', () => {
  const info = describeError({ code: 'VALIDATION_ERROR', message: 'The request body is not valid JSON.', fields: null });
  assert.deepEqual(info, { text: 'The request body is not valid JSON.', display: 'message', refresh: false });
  assert.equal(describeError({ code: 'VALIDATION_ERROR', fields: {} }).text, GENERIC_ERROR_TEXT);
});

test('a missing or empty error gives the generic message', () => {
  assert.equal(describeError(undefined).text, GENERIC_ERROR_TEXT);
  assert.equal(describeError(null).text, GENERIC_ERROR_TEXT);
  assert.equal(describeError({}).text, GENERIC_ERROR_TEXT);
});
