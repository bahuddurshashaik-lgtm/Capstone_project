import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../../src/domain/errors.js';
import {
  MESSAGES,
  parseDescription,
  parseDueDate,
  parsePriority,
  parseTitle,
  validateNewTask,
} from '../../src/domain/validation.js';

const TODAY = '2026-11-05';

function fieldsOf(action) {
  try {
    action();
  } catch (error) {
    assert.ok(error instanceof ValidationError, `expected ValidationError, got ${error}`);
    return error.fields;
  }
  assert.fail('expected a ValidationError');
}

const create = (input) => validateNewTask(input, TODAY);

// ---- validateNewTask: happy path ----

test('validateNewTask accepts a title only and applies the create defaults', () => {
  assert.deepEqual(create({ title: 'Buy milk' }), {
    title: 'Buy milk',
    description: '',
    priority: 'Medium',
    dueDate: null,
  });
});

test('validateNewTask accepts all four fields', () => {
  const input = { title: 'Report', description: 'Q4 numbers', priority: 'High', dueDate: '2026-11-06' };
  assert.deepEqual(create(input), input);
});

test('validateNewTask trims the title but not the description', () => {
  const result = create({ title: '  Buy milk  ', description: '  keep spaces  ' });
  assert.equal(result.title, 'Buy milk');
  assert.equal(result.description, '  keep spaces  ');
});

test('validateNewTask does not change its input', () => {
  const input = { title: ' x ' };
  create(input);
  assert.deepEqual(input, { title: ' x ' });
});

// ---- title ----

test('title length boundaries 0, 1, 100 and 101', () => {
  assert.equal(fieldsOf(() => create({ title: '' })).title, MESSAGES.titleRequired);
  assert.equal(create({ title: 'a' }).title, 'a');
  assert.equal(create({ title: 'a'.repeat(100) }).title.length, 100);
  assert.equal(fieldsOf(() => create({ title: 'a'.repeat(101) })).title, 'Title must be 100 characters or fewer.');
});

test('a whitespace-only title is rejected', () => {
  assert.equal(fieldsOf(() => create({ title: '   \t ' })).title, 'Enter a title.');
});

test('title length is counted in Unicode code points', () => {
  assert.equal(create({ title: '😀'.repeat(100) }).title, '😀'.repeat(100));
  assert.equal(fieldsOf(() => create({ title: '😀'.repeat(101) })).title, MESSAGES.titleTooLong);
});

test('the title limit applies after trimming', () => {
  assert.equal(create({ title: ` ${'a'.repeat(100)} ` }).title.length, 100);
});

test('a missing title asks for a title', () => {
  assert.equal(fieldsOf(() => create({})).title, 'Enter a title.');
});

// ---- description ----

test('description length boundaries 0, 500 and 501', () => {
  assert.equal(create({ title: 't', description: '' }).description, '');
  assert.equal(create({ title: 't', description: 'd'.repeat(500) }).description.length, 500);
  assert.equal(
    fieldsOf(() => create({ title: 't', description: 'd'.repeat(501) })).description,
    'Description must be 500 characters or fewer.',
  );
});

test('description length is counted in Unicode code points', () => {
  assert.equal(create({ title: 't', description: '😀'.repeat(500) }).description.length, 1000);
  assert.ok(fieldsOf(() => create({ title: 't', description: '😀'.repeat(501) })).description);
});

// ---- priority ----

test('each allowed priority is accepted and a missing priority becomes Medium', () => {
  for (const priority of ['Low', 'Medium', 'High']) {
    assert.equal(create({ title: 't', priority }).priority, priority);
  }
  assert.equal(create({ title: 't' }).priority, 'Medium');
});

test('a priority outside Low, Medium, High is rejected', () => {
  for (const priority of ['Urgent', 'low', '', 'HIGH']) {
    assert.equal(fieldsOf(() => create({ title: 't', priority })).priority, 'Choose Low, Medium or High.', priority);
  }
});

// ---- due date ----

test('due date: yesterday rejected, today and tomorrow accepted', () => {
  assert.equal(fieldsOf(() => create({ title: 't', dueDate: '2026-11-04' })).dueDate, 'Due date cannot be in the past.');
  assert.equal(create({ title: 't', dueDate: '2026-11-05' }).dueDate, '2026-11-05');
  assert.equal(create({ title: 't', dueDate: '2026-11-06' }).dueDate, '2026-11-06');
});

test('due date null or missing means no due date', () => {
  assert.equal(create({ title: 't', dueDate: null }).dueDate, null);
  assert.equal(create({ title: 't' }).dueDate, null);
});

test('an empty due date string is rejected', () => {
  assert.equal(fieldsOf(() => create({ title: 't', dueDate: '' })).dueDate, 'Enter a valid date.');
});

test('impossible or badly formatted dates are rejected', () => {
  for (const dueDate of ['2026-02-30', '2026-13-01', '5/11/2027', '2027-1-5', 'tomorrow']) {
    assert.equal(fieldsOf(() => create({ title: 't', dueDate })).dueDate, MESSAGES.invalidDate, dueDate);
  }
});

test('the past-date rule uses the date given as today', () => {
  assert.equal(validateNewTask({ title: 't', dueDate: '2026-11-05' }, '2026-11-05').dueDate, '2026-11-05');
  assert.ok(fieldsOf(() => validateNewTask({ title: 't', dueDate: '2026-11-05' }, '2026-11-06')).dueDate);
});

// ---- types and unknown keys ----

test('wrong types are rejected with a field message', () => {
  assert.equal(fieldsOf(() => create({ title: 42 })).title, MESSAGES.invalidValue);
  assert.equal(fieldsOf(() => create({ title: 't', description: 5 })).description, MESSAGES.invalidValue);
  assert.equal(fieldsOf(() => create({ title: 't', priority: 1 })).priority, MESSAGES.invalidValue);
  assert.equal(fieldsOf(() => create({ title: 't', dueDate: 20261106 })).dueDate, MESSAGES.invalidValue);
  assert.equal(fieldsOf(() => create({ title: 't', description: null })).description, MESSAGES.invalidValue);
});

test('a body that is not an object is rejected', () => {
  for (const input of [null, undefined, 'text', 7, [], [{ title: 't' }]]) {
    assert.equal(fieldsOf(() => create(input)).body, MESSAGES.invalidValue, String(input));
  }
});

test('unknown keys are rejected, including status, id and createdAt', () => {
  const fields = fieldsOf(() => create({ title: 't', status: 'Completed', id: 'x', createdAt: 'y', extra: 1 }));
  assert.deepEqual(fields, {
    status: 'Unknown field.',
    id: 'Unknown field.',
    createdAt: 'Unknown field.',
    extra: 'Unknown field.',
  });
});

test('a __proto__ key in the body is reported as an unknown field', () => {
  const input = JSON.parse('{"title":"t","__proto__":{"x":1}}');
  const fields = fieldsOf(() => create(input));
  assert.equal(Object.getOwnPropertyDescriptor(fields, '__proto__').value, 'Unknown field.');
});

test('several errors are returned together', () => {
  const fields = fieldsOf(() =>
    create({ title: '', description: 'd'.repeat(501), priority: 'x', dueDate: '2020-01-01', extra: true }),
  );
  assert.deepEqual(Object.keys(fields).sort(), ['description', 'dueDate', 'extra', 'priority', 'title']);
});

test('the error is a ValidationError with a plain fields object', () => {
  try {
    create({ title: '' });
    assert.fail('expected an error');
  } catch (error) {
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(Object.getPrototypeOf(error.fields), Object.prototype);
  }
});

// ---- shared field parsers ----

test('field parsers return a value or an error message', () => {
  assert.deepEqual(parseTitle(' a '), { value: 'a' });
  assert.deepEqual(parseTitle(''), { error: MESSAGES.titleRequired });
  assert.deepEqual(parseDescription(''), { value: '' });
  assert.deepEqual(parsePriority('High'), { value: 'High' });
  assert.deepEqual(parsePriority('x'), { error: MESSAGES.priority });
  assert.deepEqual(parseDueDate(null), { value: null });
  assert.deepEqual(parseDueDate('2024-02-29'), { value: '2024-02-29' });
  assert.deepEqual(parseDueDate('2025-02-29'), { error: MESSAGES.invalidDate });
});
