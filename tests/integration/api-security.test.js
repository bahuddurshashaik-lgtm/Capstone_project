import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { join } from 'node:path';
import { createApp } from '../../src/http/app.js';
import { SECURITY_HEADERS, createStaticFiles } from '../../src/http/static-files.js';
import { createTempDirectory, sendRequest, startTestServer } from '../helpers/start-test-server.js';

const EXPECTED_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

const PAGE_FILES = {
  'index.html': '<!doctype html><title>To Do</title>',
  'styles.css': 'body { margin: 0; }',
  'app.js': 'export const app = 1;',
  'api-client.js': 'export const client = 1;',
  'view-model.js': 'export const model = 1;',
};

async function createSite() {
  const temp = await createTempDirectory('todo-static-');
  const publicDirectory = join(temp.directory, 'public');
  await fsPromises.mkdir(publicDirectory);
  for (const [name, content] of Object.entries(PAGE_FILES)) {
    await fsPromises.writeFile(join(publicDirectory, name), content);
  }
  await fsPromises.writeFile(join(publicDirectory, 'secret.txt'), 'not on the allow-list');
  await fsPromises.writeFile(join(temp.directory, 'server.js'), 'SERVER SOURCE');
  return { publicDirectory, remove: temp.remove };
}

async function withServer(action, { skipFiles = [], ...options } = {}) {
  const site = await createSite();
  for (const name of skipFiles) await fsPromises.rm(join(site.publicDirectory, name));
  const server = await startTestServer({ publicDirectory: site.publicDirectory, ...options });
  try {
    return await action(server);
  } finally {
    await server.stop();
    await site.remove();
  }
}

async function withCustomApp(staticFiles, action) {
  const logs = [];
  const app = createApp({ service: {}, staticFiles, log: (line) => logs.push(line) });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await action({ port: server.address().port, logs });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

function assertErrorBody(result, status, code) {
  assert.equal(result.status, status);
  assert.equal(result.json.error.code, code);
  assert.equal(typeof result.json.error.message, 'string');
}

function assertSecurityHeaders(headers, label) {
  assert.equal(headers['content-security-policy'], EXPECTED_CSP, label);
  assert.equal(headers['x-content-type-options'], 'nosniff', label);
  assert.equal(headers['referrer-policy'], 'no-referrer', label);
}

// ---- T-15: static files ----

test('security header values match architecture 6.3', () => {
  assert.equal(SECURITY_HEADERS['Content-Security-Policy'], EXPECTED_CSP);
  assert.equal(SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');
  assert.equal(SECURITY_HEADERS['Referrer-Policy'], 'no-referrer');
});

test('allow-listed files are served with the right content type', async () => {
  await withServer(async (server) => {
    const expected = [
      ['/', 'text/html; charset=utf-8', PAGE_FILES['index.html']],
      ['/index.html', 'text/html; charset=utf-8', PAGE_FILES['index.html']],
      ['/styles.css', 'text/css; charset=utf-8', PAGE_FILES['styles.css']],
      ['/app.js', 'text/javascript; charset=utf-8', PAGE_FILES['app.js']],
      ['/api-client.js', 'text/javascript; charset=utf-8', PAGE_FILES['api-client.js']],
      ['/view-model.js', 'text/javascript; charset=utf-8', PAGE_FILES['view-model.js']],
    ];
    for (const [path, contentType, text] of expected) {
      const result = await server.request({ path });
      assert.equal(result.status, 200, path);
      assert.equal(result.headers['content-type'], contentType, path);
      assert.equal(result.text, text, path);
    }
  });
});

test('every static response has the CSP, nosniff and Referrer-Policy headers', async () => {
  await withServer(async (server) => {
    for (const path of ['/', '/styles.css', '/app.js']) {
      assertSecurityHeaders((await server.request({ path })).headers, path);
    }
  });
});

test('files outside the allow-list are not served, even when they exist in the directory', async () => {
  await withServer(async (server) => {
    for (const path of ['/secret.txt', '/package.json', '/index.htm', '/INDEX.HTML', '/app.js/']) {
      assertErrorBody(await server.request({ path }), 404, 'ROUTE_NOT_FOUND');
    }
  });
});

test('the query string is not part of the path', async () => {
  await withServer(async (server) => {
    const result = await server.request({ path: '/app.js?file=secret.txt' });
    assert.equal(result.status, 200);
    assert.equal(result.text, PAGE_FILES['app.js']);
  });
});

test('path traversal, plain or encoded, returns 404 and never the file', async () => {
  await withServer(async (server) => {
    const attempts = [
      '/../server.js',
      '/../../server.js',
      '/%2e%2e/server.js',
      '/%2E%2E%2Fserver.js',
      '/..%2Fserver.js',
      '/..%5Cserver.js',
      '/styles.css/../../server.js',
      '/%2e%2e%2f%2e%2e%2fserver.js',
      '/app.js%00',
      '/app.js%2f..%2f..%2fserver.js',
      '//server.js',
      '/....//server.js',
    ];
    for (const path of attempts) {
      const result = await server.request({ path });
      assert.equal(result.status, 404, path);
      assert.ok(!result.text.includes('SERVER SOURCE'), path);
    }
  });
});

test('an allow-listed file that is missing from the directory gives 404', async () => {
  await withServer(
    async (server) => {
      assertErrorBody(await server.request({ path: '/styles.css' }), 404, 'ROUTE_NOT_FOUND');
      assert.equal((await server.request({ path: '/app.js' })).status, 200);
    },
    { skipFiles: ['styles.css'] },
  );
});

test('an allow-listed name that is a directory gives 404', async () => {
  const site = await createSite();
  try {
    await fsPromises.rm(join(site.publicDirectory, 'app.js'));
    await fsPromises.mkdir(join(site.publicDirectory, 'app.js'));
    assert.equal(await createStaticFiles({ directory: site.publicDirectory }).load('/app.js'), null);
  } finally {
    await site.remove();
  }
});

test('read errors other than a missing file are passed on', async () => {
  const failing = { readFile: async () => Promise.reject(Object.assign(new Error('denied'), { code: 'EACCES' })) };
  await assert.rejects(createStaticFiles({ directory: 'unused', fs: failing }).load('/app.js'), { code: 'EACCES' });
});

test('the allow-list holds only the UI files', () => {
  assert.deepEqual(createStaticFiles().paths, [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/api-client.js',
    '/view-model.js',
  ]);
});

test('the default directory is src/public', async () => {
  const probe = [];
  const spy = {
    readFile: async (path) => {
      probe.push(path);
      return Buffer.from('x');
    },
  };
  await createStaticFiles({ fs: spy }).load('/styles.css');
  assert.match(probe[0].replaceAll('\\', '/'), /\/src\/public\/styles\.css$/);
});

// ---- T-16: routing ----

test('an unknown path gives 404 ROUTE_NOT_FOUND and never NOT_FOUND', async () => {
  await withServer(async (server) => {
    for (const path of ['/nope', '/api', '/api/nope', '/api/tasks/', '/api/tasks/abc/other', '/a/b/c/d']) {
      const result = await server.request({ path });
      assertErrorBody(result, 404, 'ROUTE_NOT_FOUND');
      assert.notEqual(result.json.error.message, 'Task not found');
    }
  });
});

test('a request target that is not a path gives 404 ROUTE_NOT_FOUND', async () => {
  await withServer(async (server) => {
    for (const path of ['http://evil.example/app.js', '*']) {
      assertErrorBody(await server.request({ path }), 404, 'ROUTE_NOT_FOUND');
    }
  });
});

test('a known path with an unsupported method gives 405 with an Allow header', async () => {
  await withServer(async (server) => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const result = await server.request({ method, path: '/', json: {} });
      assertErrorBody(result, 405, 'METHOD_NOT_ALLOWED');
      assert.equal(result.headers.allow, 'GET, HEAD', method);
    }
    const options = await server.request({ method: 'OPTIONS', path: '/styles.css' });
    assertErrorBody(options, 405, 'METHOD_NOT_ALLOWED');
  });
});

test('HEAD on a static file returns the headers and no body', async () => {
  await withServer(async (server) => {
    const result = await server.request({ method: 'HEAD', path: '/styles.css' });
    assert.equal(result.status, 200);
    assert.equal(result.headers['content-type'], 'text/css; charset=utf-8');
    assert.equal(result.headers['content-length'], String(PAGE_FILES['styles.css'].length));
    assert.equal(result.text, '');
  });
});

test('API and error responses have Cache-Control no-store and the security headers', async () => {
  await withServer(async (server) => {
    const responses = [
      await server.request({ path: '/api/nope' }),
      await server.request({ method: 'POST', path: '/', json: {} }),
      await server.request({ path: '/', headers: { Host: 'evil.example' } }),
    ];
    for (const result of responses) {
      assert.equal(result.headers['cache-control'], 'no-store');
      assert.match(result.headers['content-type'], /^application\/json/);
      assertSecurityHeaders(result.headers, String(result.status));
    }
  });
});

test('static files are not marked no-store', async () => {
  await withServer(async (server) => {
    assert.equal((await server.request({ path: '/' })).headers['cache-control'], 'no-cache');
  });
});

// ---- T-16: Host check ----

test('a foreign Host gives 403 FORBIDDEN, on every kind of path', async () => {
  await withServer(async (server) => {
    const hosts = ['evil.example', 'evil.example:80', `127.0.0.1:${server.port + 1}`, '127.0.0.1', 'localhost', '[::1]:80'];
    for (const host of hosts) {
      for (const path of ['/', '/api/tasks', '/nope']) {
        assertErrorBody(await server.request({ path, headers: { Host: host } }), 403, 'FORBIDDEN');
      }
    }
  });
});

test('127.0.0.1 and localhost with the real port are accepted, in any letter case', async () => {
  await withServer(async (server) => {
    for (const host of [`127.0.0.1:${server.port}`, `localhost:${server.port}`, `LocalHost:${server.port}`]) {
      assert.equal((await server.request({ path: '/', headers: { Host: host } })).status, 200, host);
    }
  });
});

// ---- T-16: Origin check ----

test('a foreign Origin on a write request gives 403 FORBIDDEN', async () => {
  await withServer(async (server) => {
    const origins = [
      'http://evil.example',
      'null',
      `https://127.0.0.1:${server.port}`,
      `http://127.0.0.1:${server.port + 1}`,
      'http://127.0.0.1',
      `http://evil.example:${server.port}`,
      '',
    ];
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      for (const origin of origins) {
        const result = await server.request({ method, path: '/nope', json: {}, headers: { Origin: origin } });
        assertErrorBody(result, 403, 'FORBIDDEN');
      }
    }
  });
});

test('a missing Origin on a write request is allowed', async () => {
  await withServer(async (server) => {
    assertErrorBody(await server.request({ method: 'POST', path: '/nope', json: {} }), 404, 'ROUTE_NOT_FOUND');
  });
});

test('a local Origin on a write request is allowed', async () => {
  await withServer(async (server) => {
    for (const origin of [`http://127.0.0.1:${server.port}`, `http://localhost:${server.port}`]) {
      const result = await server.request({ method: 'POST', path: '/nope', json: {}, headers: { Origin: origin } });
      assertErrorBody(result, 404, 'ROUTE_NOT_FOUND');
    }
  });
});

test('Origin is only checked on write requests', async () => {
  await withServer(async (server) => {
    const result = await server.request({ path: '/', headers: { Origin: 'http://evil.example' } });
    assert.equal(result.status, 200);
  });
});

// ---- T-16: unexpected errors and the test helper ----

test('an unexpected error gives 500 INTERNAL with no stack trace and one log line', async () => {
  const staticFiles = {
    paths: ['/'],
    load: async () => {
      throw new Error('disk exploded at C:\\secret\\path');
    },
  };
  await withCustomApp(staticFiles, async ({ port, logs }) => {
    const result = await sendRequest(port, { path: '/' });
    assertErrorBody(result, 500, 'INTERNAL');
    assert.ok(!result.text.includes('secret'));
    assert.ok(!result.text.includes('    at '));
    assert.deepEqual(logs, ['INTERNAL: disk exploded at C:\\secret\\path']);
  });
});

test('the app keeps serving after an unexpected error', async () => {
  let fail = true;
  const staticFiles = {
    paths: ['/'],
    load: async () => {
      if (fail) throw new Error('once');
      return { headers: { 'Content-Type': 'text/plain' }, body: Buffer.from('ok') };
    },
  };
  await withCustomApp(staticFiles, async ({ port }) => {
    assert.equal((await sendRequest(port, { path: '/' })).status, 500);
    fail = false;
    assert.equal((await sendRequest(port, { path: '/' })).text, 'ok');
  });
});

test('the helper starts on a free port with a temporary data file and cleans up on stop', async () => {
  const server = await startTestServer();
  const { port, dataFile } = server;
  assert.ok(port > 0);
  assert.deepEqual(JSON.parse(await fsPromises.readFile(dataFile, 'utf8')), { version: 1, tasks: [] });
  await server.stop();
  await assert.rejects(fsPromises.stat(dataFile), { code: 'ENOENT' });
  await assert.rejects(
    new Promise((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1', resolve);
      socket.on('error', reject);
    }),
  );
});

test('the helper can reuse a data file and does not delete it', async () => {
  const temp = await createTempDirectory();
  try {
    const dataFile = join(temp.directory, 'reused.json');
    const first = await startTestServer({ dataFile, tasks: [] });
    await first.stop();
    const second = await startTestServer({ dataFile });
    await second.stop();
    await fsPromises.stat(dataFile);
  } finally {
    await temp.remove();
  }
});

test('the helper still starts when the data file is corrupt', async () => {
  const temp = await createTempDirectory();
  try {
    const dataFile = join(temp.directory, 'corrupt.json');
    await fsPromises.writeFile(dataFile, '{ not json');
    const server = await startTestServer({ dataFile });
    assert.equal((await server.request({ path: '/nope' })).status, 404);
    await server.stop();
    assert.equal(await fsPromises.readFile(dataFile, 'utf8'), '{ not json');
  } finally {
    await temp.remove();
  }
});
