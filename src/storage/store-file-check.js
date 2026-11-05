import { isValidCalendarDate } from '../domain/dates.js';
import { STATUS_OPEN } from '../domain/task.js';
import {
  isPlainObject,
  parseDescription,
  parseDueDate,
  parsePriority,
  parseStatus,
  parseTitle,
} from '../domain/validation.js';

export const STORE_VERSION = 1;

const TASK_KEYS = Object.freeze([
  'id',
  'title',
  'description',
  'priority',
  'dueDate',
  'status',
  'createdAt',
  'completedAt',
]);

const FIELD_PARSERS = Object.freeze({
  title: parseTitle,
  description: parseDescription,
  priority: parsePriority,
  dueDate: parseDueDate,
  status: parseStatus,
});

const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?Z$/;

function isTimestamp(value) {
  return (
    typeof value === 'string' &&
    TIMESTAMP_PATTERN.test(value) &&
    isValidCalendarDate(value.slice(0, 10))
  );
}

function hasExactTaskKeys(task) {
  const keys = Object.keys(task);
  return keys.length === TASK_KEYS.length && TASK_KEYS.every((key) => Object.hasOwn(task, key));
}

function findFieldProblem(task) {
  for (const [key, parse] of Object.entries(FIELD_PARSERS)) {
    if ('error' in parse(task[key])) return `invalid ${key}`;
  }
  if (typeof task.id !== 'string' || task.id === '') return 'invalid id';
  if (!isTimestamp(task.createdAt)) return 'invalid createdAt';
  return null;
}

function findCompletionProblem(task) {
  if (task.status === STATUS_OPEN) {
    return task.completedAt === null ? null : 'Open task has completedAt';
  }
  return isTimestamp(task.completedAt) ? null : 'Completed task has no valid completedAt';
}

function findTaskProblem(task) {
  if (!isPlainObject(task)) return 'task is not an object';
  if (!hasExactTaskKeys(task)) return 'task has missing or unknown keys';
  return findFieldProblem(task) ?? findCompletionProblem(task);
}

function findListProblem(tasks) {
  const seenIds = new Set();
  for (const task of tasks) {
    const problem = findTaskProblem(task);
    if (problem) return problem;
    if (seenIds.has(task.id)) return 'duplicate id';
    seenIds.add(task.id);
  }
  return null;
}

function checkRoot(root) {
  if (!isPlainObject(root)) return { problem: 'root is not an object' };
  if (root.version !== STORE_VERSION) return { problem: 'unsupported version' };
  if (!Array.isArray(root.tasks)) return { problem: 'tasks is not a list' };
  const problem = findListProblem(root.tasks);
  return problem ? { problem } : { tasks: root.tasks };
}

export function checkStoreContent(text) {
  let root;
  try {
    root = JSON.parse(text);
  } catch {
    return { problem: 'not valid JSON' };
  }
  return checkRoot(root);
}
