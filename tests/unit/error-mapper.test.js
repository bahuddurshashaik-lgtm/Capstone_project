import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundError, StoreError, ValidationError } from '../../src/domain/errors.js';
import { INTERNAL_MESSAGE, logError, mapError } from '../../src/http/error-mapper.js';
import {
  RequestError,
  forbidden,
  methodNotAllowed,
  payloadTooLarge,
  routeNotFound,
  unsupportedMediaType,
} from '../../src/http/request-error.js';

const corruptMessage =
  'Your task file cannot be read: C:\\data\\tasks.json. It was not changed. Fix, move or delete the file, then reload this page.';
const writeFailedMessage = 'Your change could not be saved. Nothing was changed. Try again.';

test('a ValidationError maps to 400 with its field messages', () => {
  const mapped = mapError(new ValidationError({ title: 'Enter a title.', dueDate: 'Enter a valid date.' }));
  assert.equal(mapped.status, 400);
  assert.deepEqual(mapped.body, {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Please correct the highlighted fields.',
      fields: { title: 'Enter a title.', dueDate: 'Enter a valid date.' },
    },
  });
});

test('a ValidationError without fields (bad JSON) still has a fields map', () => {
  const mapped = mapError(new ValidationError({}, 'The request body must be valid JSON.'));
  assert.deepEqual(mapped.body.error.fields, {});
  assert.equal(mapped.body.error.message, 'The request body must be valid JSON.');
});

test('a NotFoundError maps to 404 NOT_FOUND "Task not found" without fields', () => {
  const mapped = mapError(new NotFoundError());
  assert.equal(mapped.status, 404);
  assert.deepEqual(mapped.body, { error: { code: 'NOT_FOUND', message: 'Task not found' } });
});

test('route and request errors map to the codes of architecture 6.2', () => {
  const cases = [
    [routeNotFound(), 404, 'ROUTE_NOT_FOUND'],
    [methodNotAllowed(['GET', 'POST']), 405, 'METHOD_NOT_ALLOWED'],
    [forbidden(), 403, 'FORBIDDEN'],
    [payloadTooLarge(), 413, 'PAYLOAD_TOO_LARGE'],
    [unsupportedMediaType(), 415, 'UNSUPPORTED_MEDIA_TYPE'],
  ];
  for (const [error, status, code] of cases) {
    const mapped = mapError(error);
    assert.equal(mapped.status, status, code);
    assert.equal(mapped.body.error.code, code);
    assert.equal(mapped.body.error.message, error.message);
    assert.equal('fields' in mapped.body.error, false);
  }
});

test('ROUTE_NOT_FOUND is never reported as NOT_FOUND', () => {
  assert.notEqual(mapError(routeNotFound()).body.error.code, 'NOT_FOUND');
  assert.notEqual(mapError(routeNotFound()).body.error.message, 'Task not found');
});

test('METHOD_NOT_ALLOWED carries the Allow header', () => {
  assert.deepEqual(mapError(methodNotAllowed(['GET', 'HEAD'])).headers, { Allow: 'GET, HEAD' });
  assert.deepEqual(mapError(new NotFoundError()).headers, {});
});

test('store errors map to 500 and keep their own message', () => {
  const corrupt = mapError(new StoreError('STORE_CORRUPT', corruptMessage));
  assert.equal(corrupt.status, 500);
  assert.deepEqual(corrupt.body, { error: { code: 'STORE_CORRUPT', message: corruptMessage } });

  const writeFailed = mapError(new StoreError('STORE_WRITE_FAILED', writeFailedMessage));
  assert.equal(writeFailed.status, 500);
  assert.deepEqual(writeFailed.body, { error: { code: 'STORE_WRITE_FAILED', message: writeFailedMessage } });
});

test('unknown errors map to INTERNAL with a generic message and no stack trace', () => {
  const failure = new TypeError('secret detail at C:\\private\\file.js');
  const mapped = mapError(failure);
  assert.equal(mapped.status, 500);
  assert.deepEqual(mapped.body, { error: { code: 'INTERNAL', message: INTERNAL_MESSAGE } });
  const text = JSON.stringify(mapped);
  assert.ok(!text.includes('secret detail'));
  assert.ok(!text.includes(failure.stack.split('\n')[1].trim()));
});

test('values that are not errors map to INTERNAL', () => {
  for (const value of [undefined, null, 'text', 42, {}]) {
    assert.equal(mapError(value).body.error.code, 'INTERNAL');
  }
});

test('an error with a foreign code is not trusted', () => {
  const lookalike = Object.assign(new Error('boom'), { code: 'NOT_FOUND', status: 404 });
  assert.equal(mapError(lookalike).status, 500);
  assert.equal(mapError(lookalike).body.error.code, 'INTERNAL');
});

test('mapError does not leak the headers object of the source error', () => {
  const source = methodNotAllowed(['GET']);
  mapError(source).headers.Allow = 'changed';
  assert.equal(source.headers.Allow, 'GET');
});

function captureLog() {
  const lines = [];
  const log = (...args) => lines.push(args);
  return { lines, log };
}

test('store errors are logged as code and message only', () => {
  const { lines, log } = captureLog();
  const error = new StoreError('STORE_CORRUPT', corruptMessage, { cause: new Error('{"title":"private"}') });
  logError(error, log);
  assert.deepEqual(lines, [[`STORE_CORRUPT: ${corruptMessage}`]]);
});

test('an unexpected error is logged on one line without its stack', () => {
  const { lines, log } = captureLog();
  logError(new Error('line one\nline two'), log);
  assert.deepEqual(lines, [['INTERNAL: line one line two']]);
});

test('a thrown value that is not an Error is logged without its content', () => {
  const { lines, log } = captureLog();
  logError({ title: 'private task text' }, log);
  assert.deepEqual(lines, [['INTERNAL: Unexpected error']]);
});

test('client errors are not logged', () => {
  const { lines, log } = captureLog();
  for (const error of [new ValidationError({ title: 'Enter a title.' }), new NotFoundError(), routeNotFound(), forbidden(), new RequestError(400, 'X', 'y')]) {
    logError(error, log);
  }
  assert.deepEqual(lines, []);
});
