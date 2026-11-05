import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Readable } from 'node:stream';
import { ValidationError } from '../../src/domain/errors.js';
import { MAX_BODY_BYTES, readJsonBody } from '../../src/http/json-body.js';
import { RequestError } from '../../src/http/request-error.js';

function fakeRequest(chunks, headers = { 'content-type': 'application/json' }) {
  const request = Readable.from(chunks.map((chunk) => Buffer.from(chunk)));
  request.headers = headers;
  return request;
}

const json = (text) => fakeRequest([text]);

async function failureOf(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return assert.fail('Expected the promise to reject.');
}

test('a valid JSON body is returned as an object', async () => {
  assert.deepEqual(await readJsonBody(json('{"title":"Buy milk","dueDate":null}')), {
    title: 'Buy milk',
    dueDate: null,
  });
});

test('a body split over several chunks is joined, including multi-byte characters', async () => {
  const bytes = Buffer.from('{"title":"café ✓"}');
  const request = fakeRequest([bytes.subarray(0, 13), bytes.subarray(13)]);
  assert.deepEqual(await readJsonBody(request), { title: 'café ✓' });
});

test('content type parameters and letter case are accepted', async () => {
  const request = fakeRequest(['{}'], { 'content-type': 'Application/JSON; charset=utf-8' });
  assert.deepEqual(await readJsonBody(request), {});
});

test('any valid JSON value is passed on so that validation can reject the wrong shape', async () => {
  assert.deepEqual(await readJsonBody(json('[1,2]')), [1, 2]);
  assert.equal(await readJsonBody(json('null')), null);
});

test('a missing or wrong content type gives UNSUPPORTED_MEDIA_TYPE', async () => {
  for (const headers of [{}, { 'content-type': 'text/plain' }, { 'content-type': 'application/jsonp' }, { 'content-type': 'application/x-www-form-urlencoded' }]) {
    const error = await failureOf(readJsonBody(fakeRequest(['{}'], headers)));
    assert.ok(error instanceof RequestError);
    assert.equal(error.code, 'UNSUPPORTED_MEDIA_TYPE');
    assert.equal(error.status, 415);
  }
});

test('malformed JSON gives VALIDATION_ERROR', async () => {
  for (const text of ['{"title":', 'not json', "{'title':'x'}", '']) {
    const error = await failureOf(readJsonBody(json(text)));
    assert.ok(error instanceof ValidationError, `body ${JSON.stringify(text)}`);
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(error.message, 'The request body must be valid JSON.');
  }
});

test('bytes that are not valid UTF-8 give VALIDATION_ERROR', async () => {
  const request = fakeRequest([Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x7d])]);
  assert.ok((await failureOf(readJsonBody(request))) instanceof ValidationError);
});

test('a body of exactly 16 KB is accepted and one byte more is rejected', async () => {
  const overhead = Buffer.byteLength('{"d":""}');
  const exact = `{"d":"${'a'.repeat(MAX_BODY_BYTES - overhead)}"}`;
  assert.equal(Buffer.byteLength(exact), MAX_BODY_BYTES);
  assert.equal((await readJsonBody(json(exact))).d.length, MAX_BODY_BYTES - overhead);

  const error = await failureOf(readJsonBody(json(`${exact} `)));
  assert.equal(error.code, 'PAYLOAD_TOO_LARGE');
  assert.equal(error.status, 413);
});

test('the limit counts bytes, not characters', async () => {
  const text = `{"d":"${'✓'.repeat(6000)}"}`;
  assert.ok(text.length < MAX_BODY_BYTES && Buffer.byteLength(text) > MAX_BODY_BYTES);
  assert.equal((await failureOf(readJsonBody(json(text)))).code, 'PAYLOAD_TOO_LARGE');
});

test('a large body without Content-Length is stopped while it is read', async () => {
  const chunks = Array.from({ length: 64 }, () => 'x'.repeat(1024));
  const error = await failureOf(readJsonBody(fakeRequest(chunks)));
  assert.equal(error.code, 'PAYLOAD_TOO_LARGE');
});

test('a declared Content-Length over the limit is rejected', async () => {
  const request = fakeRequest(['{}'], { 'content-type': 'application/json', 'content-length': '999999' });
  assert.equal((await failureOf(readJsonBody(request))).code, 'PAYLOAD_TOO_LARGE');
});

test('a false small Content-Length does not let a big body through', async () => {
  const chunks = Array.from({ length: 32 }, () => 'x'.repeat(1024));
  const request = fakeRequest(chunks, { 'content-type': 'application/json', 'content-length': '2' });
  assert.equal((await failureOf(readJsonBody(request))).code, 'PAYLOAD_TOO_LARGE');
});

test('a custom limit is honoured', async () => {
  const error = await failureOf(readJsonBody(json('{"title":"abcdef"}'), { maxBytes: 10 }));
  assert.equal(error.code, 'PAYLOAD_TOO_LARGE');
});

// ---- real server: a chunked upload with no Content-Length ----

function startBodyServer() {
  const server = http.createServer(async (request, response) => {
    let status = 200;
    let body;
    try {
      body = { received: await readJsonBody(request) };
    } catch (error) {
      status = error.status ?? 400;
      body = { code: error.code };
    }
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function sendChunked(port, chunks) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port, method: 'POST', path: '/', headers: { 'Content-Type': 'application/json' } },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (piece) => {
          text += piece;
        });
        response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(text) }));
      },
    );
    request.on('error', reject);
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

test('over a real connection, a chunked body over 16 KB gives 413 PAYLOAD_TOO_LARGE', async () => {
  const server = await startBodyServer();
  try {
    const chunks = ['{"d":"', ...Array.from({ length: 20 }, () => 'a'.repeat(1024)), '"}'];
    const result = await sendChunked(server.address().port, chunks);
    assert.equal(result.status, 413);
    assert.equal(result.body.code, 'PAYLOAD_TOO_LARGE');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('over a real connection, a small chunked body is read', async () => {
  const server = await startBodyServer();
  try {
    const result = await sendChunked(server.address().port, ['{"title":', '"Hi"}']);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.received, { title: 'Hi' });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
