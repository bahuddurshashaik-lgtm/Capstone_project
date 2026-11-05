import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStatus,
  applyUpdate,
  createTaskRecord,
  isOverdue,
} from '../../src/domain/task.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NOW = new Date('2026-11-05T11:59:00.000Z');
const clockAt = (iso) => () => new Date(iso);

const fields = { title: 'Buy milk', description: 'two litres', priority: 'High', dueDate: '2026-11-06' };

function openTask(overrides = {}) {
  return createTaskRecord({ ...fields, ...overrides }, () => NOW);
}

// ---- createTaskRecord ----

test('createTaskRecord builds an Open task with id, createdAt and no completedAt', () => {
  const task = createTaskRecord(fields, () => NOW);
  assert.match(task.id, UUID_V4);
  assert.equal(task.status, 'Open');
  assert.equal(task.createdAt, '2026-11-05T11:59:00.000Z');
  assert.equal(task.completedAt, null);
  assert.deepEqual(
    { title: task.title, description: task.description, priority: task.priority, dueDate: task.dueDate },
    fields,
  );
});

test('createTaskRecord has exactly the stored keys', () => {
  assert.deepEqual(Object.keys(openTask()).sort(), [
    'completedAt', 'createdAt', 'description', 'dueDate', 'id', 'priority', 'status', 'title',
  ]);
});

test('createTaskRecord gives every task a different id', () => {
  assert.notEqual(openTask().id, openTask().id);
});

test('createTaskRecord ignores keys that are not editable fields', () => {
  const task = createTaskRecord({ ...fields, status: 'Completed', id: 'x' }, () => NOW);
  assert.equal(task.status, 'Open');
  assert.match(task.id, UUID_V4);
});

test('createTaskRecord accepts an injected id generator', () => {
  assert.equal(createTaskRecord(fields, () => NOW, () => 'fixed-id').id, 'fixed-id');
});

// ---- applyUpdate ----

test('applyUpdate changes the four fields and keeps id, createdAt and status', () => {
  const task = openTask();
  const updated = applyUpdate(task, { title: 'New', description: '', priority: 'Low', dueDate: null });
  assert.equal(updated.title, 'New');
  assert.equal(updated.description, '');
  assert.equal(updated.priority, 'Low');
  assert.equal(updated.dueDate, null);
  assert.equal(updated.id, task.id);
  assert.equal(updated.createdAt, task.createdAt);
  assert.equal(updated.status, 'Open');
  assert.equal(updated.completedAt, null);
});

test('applyUpdate keeps a Completed task Completed with its completedAt', () => {
  const completed = applyStatus(openTask(), 'Completed', clockAt('2026-11-05T12:30:00.000Z'));
  const updated = applyUpdate(completed, { ...fields, title: 'Renamed' });
  assert.equal(updated.status, 'Completed');
  assert.equal(updated.completedAt, '2026-11-05T12:30:00.000Z');
  assert.equal(updated.title, 'Renamed');
});

test('applyUpdate does not change the original task and ignores extra keys', () => {
  const task = openTask();
  const updated = applyUpdate(task, { ...fields, title: 'New', status: 'Completed', id: 'other' });
  assert.equal(task.title, 'Buy milk');
  assert.equal(updated.status, 'Open');
  assert.equal(updated.id, task.id);
});

// ---- applyStatus ----

test('applyStatus to Completed sets completedAt from the clock', () => {
  const completed = applyStatus(openTask(), 'Completed', clockAt('2026-11-05T12:30:00.000Z'));
  assert.equal(completed.status, 'Completed');
  assert.equal(completed.completedAt, '2026-11-05T12:30:00.000Z');
});

test('applyStatus back to Open clears completedAt', () => {
  const completed = applyStatus(openTask(), 'Completed', clockAt('2026-11-05T12:30:00.000Z'));
  const reopened = applyStatus(completed, 'Open', clockAt('2026-11-05T13:00:00.000Z'));
  assert.equal(reopened.status, 'Open');
  assert.equal(reopened.completedAt, null);
});

test('applyStatus with the same status keeps the first completedAt', () => {
  const completed = applyStatus(openTask(), 'Completed', clockAt('2026-11-05T12:30:00.000Z'));
  const again = applyStatus(completed, 'Completed', clockAt('2026-11-05T18:00:00.000Z'));
  assert.equal(again.completedAt, '2026-11-05T12:30:00.000Z');
  assert.deepEqual(again, completed);
});

test('applyStatus keeps an Open task Open without a completedAt', () => {
  const task = openTask();
  assert.deepEqual(applyStatus(task, 'Open'), task);
});

test('applyStatus keeps id, createdAt and the editable fields and does not change the original', () => {
  const task = openTask();
  const completed = applyStatus(task, 'Completed', clockAt('2026-11-05T12:30:00.000Z'));
  assert.equal(completed.id, task.id);
  assert.equal(completed.createdAt, task.createdAt);
  assert.equal(completed.title, task.title);
  assert.equal(task.status, 'Open');
  assert.equal(task.completedAt, null);
});

// ---- isOverdue ----

const TODAY = '2026-11-05';

test('isOverdue is true for an Open task due before today', () => {
  assert.equal(isOverdue(openTask({ dueDate: '2026-11-04' }), TODAY), true);
});

test('isOverdue is false for a task due today or later', () => {
  assert.equal(isOverdue(openTask({ dueDate: '2026-11-05' }), TODAY), false);
  assert.equal(isOverdue(openTask({ dueDate: '2026-11-06' }), TODAY), false);
});

test('isOverdue is false for a task without a due date', () => {
  assert.equal(isOverdue(openTask({ dueDate: null }), TODAY), false);
});

test('isOverdue is false for a Completed task with a past due date', () => {
  const completed = applyStatus(openTask({ dueDate: '2026-11-04' }), 'Completed', () => NOW);
  assert.equal(isOverdue(completed, TODAY), false);
});

test('isOverdue becomes true when today moves past the due date', () => {
  const task = openTask({ dueDate: '2026-11-05' });
  assert.equal(isOverdue(task, '2026-11-05'), false);
  assert.equal(isOverdue(task, '2026-11-06'), true);
});

test('a reopened past-due task is overdue again', () => {
  const task = openTask({ dueDate: '2026-11-04' });
  const completed = applyStatus(task, 'Completed', () => NOW);
  assert.equal(isOverdue(applyStatus(completed, 'Open'), TODAY), true);
});
