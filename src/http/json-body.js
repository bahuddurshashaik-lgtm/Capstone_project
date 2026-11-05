import { ValidationError } from '../domain/errors.js';
import { payloadTooLarge, unsupportedMediaType } from './request-error.js';

export const MAX_BODY_BYTES = 16 * 1024;

const JSON_MEDIA_TYPE = 'application/json';
const INVALID_JSON_MESSAGE = 'The request body must be valid JSON.';

const invalidJson = () => new ValidationError({}, INVALID_JSON_MESSAGE);

function assertJsonContentType(request) {
  const header = request.headers['content-type'];
  const mediaType = typeof header === 'string' ? header.split(';')[0].trim().toLowerCase() : '';
  if (mediaType !== JSON_MEDIA_TYPE) throw unsupportedMediaType();
}

function declaredLengthExceeds(request, maxBytes) {
  const declared = Number(request.headers['content-length']);
  return Number.isFinite(declared) && declared > maxBytes;
}

function collectBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;

    const stopAndDrain = (error) => {
      request.off('data', onData);
      request.off('end', onEnd);
      request.resume();
      reject(error);
    };
    const onData = (chunk) => {
      received += chunk.length;
      if (received > maxBytes) return stopAndDrain(payloadTooLarge());
      chunks.push(chunk);
    };
    const onEnd = () => resolve(Buffer.concat(chunks));

    request.on('data', onData);
    request.on('end', onEnd);
    request.on('error', reject);
  });
}

function parseJsonText(bytes) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw invalidJson();
  }
}

export async function readJsonBody(request, { maxBytes = MAX_BODY_BYTES } = {}) {
  assertJsonContentType(request);
  if (declaredLengthExceeds(request, maxBytes)) {
    request.resume();
    throw payloadTooLarge();
  }
  return parseJsonText(await collectBody(request, maxBytes));
}
