import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterTasks, newestFirst } from '../../src/domain/filters.js';
import { applyStatus, applyUpdate, createTaskRecord } from '../../src/domain/task.js';

const TODAY = '2026-11-05';
const NO_FILTERS = { status: null, priority: null, overdue: false };
const clockAt = (iso) => () => new Date(iso);

let counter = 0;
function makeTask({ title, priority = 'Medium', dueDate = null, completed = false }) {
  counter += 1;
  const created = createTaskRecord(
    { title, description: '', priority, dueDate },
    clockAt(`2026-11-01T10:00:0${counter % 10}.000Z`),
    () => `id-${title}`,
  );
  return completed ? applyStatus(created, 'Completed', clockAt('2026-11-02T10:00:00.000Z')) : created;
}

// Oldest first, as the store keeps them.
const tasks = [
  makeTask({ title: 'A', priority: 'High', dueDate: '2026-11-01' }), // open, overdue
  makeTask({ title: 'B', priority: 'High', dueDate: '2026-11-01', completed: true }), // completed past due: not overdue
  makeTask({ title: 'C', priority: 'Low', dueDate: '2026-11-05' }), // due today: not overdue
  makeTask({ title: 'D', priority: 'Low', dueDate: '2026-11-02' }), // open, overdue
  makeTask({ title: 'E', priority: 'Medium' }), // no due date
];

const titles = (list) => list.map((task) => task.title);
const filtered = (filters) => titles(filterTasks(tasks, { ...NO_FILTERS, ...filters }, TODAY));

test('no filter returns every task in the same order', () => {
  assert.deepEqual(filtered({}), ['A', 'B', 'C', 'D', 'E']);
});

test('status filter', () => {
  assert.deepEqual(filtered({ status: 'Open' }), ['A', 'C', 'D', 'E']);
  assert.deepEqual(filtered({ status: 'Completed' }), ['B']);
});

test('priority filter', () => {
  assert.deepEqual(filtered({ priority: 'High' }), ['A', 'B']);
  assert.deepEqual(filtered({ priority: 'Low' }), ['C', 'D']);
  assert.deepEqual(filtered({ priority: 'Medium' }), ['E']);
});

test('overdue filter keeps only Open tasks due before today', () => {
  assert.deepEqual(filtered({ overdue: true }), ['A', 'D']);
});

test('a task due today and a Completed past-due task are not overdue', () => {
  const overdueTitles = filtered({ overdue: true });
  assert.ok(!overdueTitles.includes('C'));
  assert.ok(!overdueTitles.includes('B'));
});

test('filters combine with AND', () => {
  assert.deepEqual(filtered({ status: 'Open', priority: 'High' }), ['A']);
  assert.deepEqual(filtered({ priority: 'Low', overdue: true }), ['D']);
  assert.deepEqual(filtered({ status: 'Open', priority: 'High', overdue: true }), ['A']);
  assert.deepEqual(filtered({ status: 'Completed', overdue: true }), []);
});

test('missing filter properties mean not set', () => {
  assert.deepEqual(titles(filterTasks(tasks, {}, TODAY)), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(titles(filterTasks(tasks, { status: undefined, priority: undefined }, TODAY)), ['A', 'B', 'C', 'D', 'E']);
});

test('the overdue filter follows the date given as today', () => {
  const nextDay = titles(filterTasks(tasks, { ...NO_FILTERS, overdue: true }, '2026-11-06'));
  assert.deepEqual(nextDay, ['A', 'C', 'D']);
});

test('filtering an empty list gives an empty list', () => {
  assert.deepEqual(filterTasks([], { ...NO_FILTERS, status: 'Open' }, TODAY), []);
});

test('filtering does not change the input list', () => {
  const copy = [...tasks];
  filterTasks(tasks, { ...NO_FILTERS, status: 'Open' }, TODAY);
  assert.deepEqual(tasks, copy);
});

test('newestFirst returns the creation-ordered list reversed', () => {
  assert.deepEqual(titles(newestFirst(tasks)), ['E', 'D', 'C', 'B', 'A']);
});

test('newestFirst applies to a filtered list too', () => {
  const open = filterTasks(tasks, { ...NO_FILTERS, status: 'Open' }, TODAY);
  assert.deepEqual(titles(newestFirst(open)), ['E', 'D', 'C', 'A']);
});

test('newestFirst does not change the input list', () => {
  newestFirst(tasks);
  assert.deepEqual(titles(tasks), ['A', 'B', 'C', 'D', 'E']);
});

test('newestFirst of an empty list is an empty list', () => {
  assert.deepEqual(newestFirst([]), []);
});

test('an edit or a status change does not change the position of a task', () => {
  const edited = tasks.map((task) =>
    task.title === 'C' ? applyUpdate(task, { title: 'C', description: 'x', priority: 'High', dueDate: null }) : task,
  );
  const toggled = edited.map((task) => (task.title === 'A' ? applyStatus(task, 'Completed', clockAt('2026-11-05T10:00:00.000Z')) : task));
  assert.deepEqual(titles(newestFirst(toggled)), ['E', 'D', 'C', 'B', 'A']);
});
