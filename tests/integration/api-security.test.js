import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SECURITY_HEADERS, createStaticFiles } from '../../src/http/static-files.js';

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
  const root = await fsPromises.mkdtemp(join(tmpdir(), 'todo-static-'));
  const publicDirectory = join(root, 'public');
  await fsPromises.mkdir(publicDirectory);
  for (const [name, content] of Object.entries(PAGE_FILES)) {
    await fsPromises.writeFile(join(publicDirectory, name), content);
  }
  await fsPromises.writeFile(join(publicDirectory, 'secret.txt'), 'not on the allow-list');
  await fsPromises.writeFile(join(root, 'server.js'), 'SERVER SOURCE');
  return { root, publicDirectory };
}

function startStaticServer(staticFiles) {
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(`http://localhost${request.url}`).pathname;
    const file = await staticFiles.load(pathname);
    if (!file) {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('missing');
      return;
    }
    response.writeHead(200, file.headers);
    response.end(file.body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function rawGet(port, path) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, method: 'GET', path }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () =>
        resolve({ status: response.statusCode, headers: response.headers, text: Buffer.concat(chunks).toString('utf8') }),
      );
    });
    request.on('error', reject);
    request.end();
  });
}

async function withStaticServer(action, { skipFiles = [] } = {}) {
  const site = await createSite();
  for (const name of skipFiles) await fsPromises.rm(join(site.publicDirectory, name));
  const server = await startStaticServer(createStaticFiles({ directory: site.publicDirectory }));
  try {
    return await action({ port: server.address().port, site });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fsPromises.rm(site.root, { recursive: true, force: true });
  }
}

test('security header values match architecture 6.3', () => {
  assert.equal(SECURITY_HEADERS['Content-Security-Policy'], EXPECTED_CSP);
  assert.equal(SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');
  assert.equal(SECURITY_HEADERS['Referrer-Policy'], 'no-referrer');
});

test('allow-listed files are served with the right content type', async () => {
  await withStaticServer(async ({ port }) => {
    const expected = [
      ['/', 'text/html; charset=utf-8', PAGE_FILES['index.html']],
      ['/index.html', 'text/html; charset=utf-8', PAGE_FILES['index.html']],
      ['/styles.css', 'text/css; charset=utf-8', PAGE_FILES['styles.css']],
      ['/app.js', 'text/javascript; charset=utf-8', PAGE_FILES['app.js']],
      ['/api-client.js', 'text/javascript; charset=utf-8', PAGE_FILES['api-client.js']],
      ['/view-model.js', 'text/javascript; charset=utf-8', PAGE_FILES['view-model.js']],
    ];
    for (const [path, contentType, text] of expected) {
      const result = await rawGet(port, path);
      assert.equal(result.status, 200, path);
      assert.equal(result.headers['content-type'], contentType, path);
      assert.equal(result.text, text, path);
    }
  });
});

test('every static response has the CSP, nosniff and Referrer-Policy headers', async () => {
  await withStaticServer(async ({ port }) => {
    for (const path of ['/', '/styles.css', '/app.js']) {
      const { headers } = await rawGet(port, path);
      assert.equal(headers['content-security-policy'], EXPECTED_CSP, path);
      assert.equal(headers['x-content-type-options'], 'nosniff', path);
      assert.equal(headers['referrer-policy'], 'no-referrer', path);
    }
  });
});

test('files outside the allow-list are not served, even when they exist in the directory', async () => {
  await withStaticServer(async ({ port }) => {
    for (const path of ['/secret.txt', '/package.json', '/index.htm', '/INDEX.HTML', '/app.js/']) {
      assert.equal((await rawGet(port, path)).status, 404, path);
    }
  });
});

test('the query string is not part of the path', async () => {
  await withStaticServer(async ({ port }) => {
    const result = await rawGet(port, '/app.js?file=secret.txt');
    assert.equal(result.status, 200);
    assert.equal(result.text, PAGE_FILES['app.js']);
  });
});

test('path traversal, plain or encoded, returns 404 and never the file', async () => {
  await withStaticServer(async ({ port }) => {
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
      const result = await rawGet(port, path);
      assert.equal(result.status, 404, path);
      assert.ok(!result.text.includes('SERVER SOURCE'), path);
    }
  });
});

test('an allow-listed file that is missing from the directory gives 404', async () => {
  await withStaticServer(
    async ({ port }) => {
      assert.equal((await rawGet(port, '/styles.css')).status, 404);
      assert.equal((await rawGet(port, '/app.js')).status, 200);
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
    await fsPromises.rm(site.root, { recursive: true, force: true });
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
  const spy = { readFile: async (path) => { probe.push(path); return Buffer.from('x'); } };
  await createStaticFiles({ fs: spy }).load('/styles.css');
  assert.match(probe[0].replaceAll('\\', '/'), /\/src\/public\/styles\.css$/);
});
