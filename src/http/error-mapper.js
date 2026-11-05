import { NotFoundError, StoreError, ValidationError } from '../domain/errors.js';
import { RequestError } from './request-error.js';

export const INTERNAL = 'INTERNAL';
export const INTERNAL_MESSAGE = 'Something went wrong. Try again.';

const SERVER_ERROR_STATUS = 500;

const NO_HEADERS = Object.freeze({});

const errorBody = (code, message, fields) => ({
  error: fields ? { code, message, fields } : { code, message },
});

const describe = (status, code, message, { fields, headers = NO_HEADERS } = {}) => ({
  status,
  headers,
  body: errorBody(code, message, fields),
});

export function mapError(error) {
  if (error instanceof ValidationError) {
    return describe(400, error.code, error.message, { fields: error.fields });
  }
  if (error instanceof NotFoundError) return describe(404, error.code, error.message);
  if (error instanceof RequestError) {
    return describe(error.status, error.code, error.message, { headers: { ...error.headers } });
  }
  if (error instanceof StoreError) return describe(SERVER_ERROR_STATUS, error.code, error.message);
  return describe(SERVER_ERROR_STATUS, INTERNAL, INTERNAL_MESSAGE);
}

const toSingleLine = (text) => String(text).replace(/\s+/g, ' ').trim();

function loggedMessage(error, mapped) {
  const { code, message } = mapped.body.error;
  if (code !== INTERNAL) return message;
  return toSingleLine(error instanceof Error ? error.message : 'Unexpected error');
}

export function logError(error, log = console.error) {
  const mapped = mapError(error);
  if (mapped.status < SERVER_ERROR_STATUS) return;
  log(`${mapped.body.error.code}: ${loggedMessage(error, mapped)}`);
}
