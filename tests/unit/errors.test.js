import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NotFoundError,
  STORE_CORRUPT,
  STORE_WRITE_FAILED,
  StoreError,
  ValidationError,
} from '../../src/domain/errors.js';

test('ValidationError carries its code and a plain fields object', () => {
  const error = new ValidationError({ title: 'Enter a title.' });
  assert.ok(error instanceof Error);
  assert.equal(error.code, 'VALIDATION_ERROR');
  assert.deepEqual(error.fields, { title: 'Enter a title.' });
  assert.equal(Object.getPrototypeOf(error.fields), Object.prototype);
});

test('ValidationError copies the fields so later changes do not leak in', () => {
  const fields = { title: 'Enter a title.' };
  const error = new ValidationError(fields);
  fields.priority = 'changed';
  assert.deepEqual(error.fields, { title: 'Enter a title.' });
});

test('NotFoundError says "Task not found"', () => {
  const error = new NotFoundError();
  assert.equal(error.message, 'Task not found');
  assert.equal(error.code, 'NOT_FOUND');
  assert.equal(error.name, 'NotFoundError');
});

test('StoreError carries STORE_CORRUPT and STORE_WRITE_FAILED codes', () => {
  const corrupt = new StoreError(STORE_CORRUPT, 'cannot read');
  const failed = new StoreError(STORE_WRITE_FAILED, 'cannot save');
  assert.equal(corrupt.code, 'STORE_CORRUPT');
  assert.equal(corrupt.message, 'cannot read');
  assert.equal(failed.code, 'STORE_WRITE_FAILED');
  assert.ok(corrupt instanceof Error);
});

test('StoreError keeps the original cause', () => {
  const cause = new Error('EPERM');
  const error = new StoreError(STORE_WRITE_FAILED, 'cannot save', { cause });
  assert.equal(error.cause, cause);
});

test('StoreError rejects an unknown code', () => {
  assert.throws(() => new StoreError('OTHER', 'x'), TypeError);
});
