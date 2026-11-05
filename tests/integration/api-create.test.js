import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import { createTempDirectory, startTestServer } from '../helpers/start-test-server.js';

const NOW = new Date(2026, 10, 5, 12, 0, 0);
const NOW_ISO = NOW.toISOString();
const TODAY = '2026-11-05';
const YESTERDAY = '2026-11-04';
const TOMORROW = '2026-11-06';

function createIdSequence() {
  let counter = 0;
  return () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
}

async function withServer(action, options = {}) {
  const server = await startTestServer({ clock: () => new Date(NOW), newId: createIdSequence(), ...options });
  try {
    return await action(server);
  } finally {
    await server.stop();
  }
}

const readFileTasks = async (server) => JSON.parse(await fsPromises.readFile(server.dataFile, 'utf8')).tasks;

const post = (server, json, extra = {}) => server.request({ method: 'POST', path: '/api/tasks', json, ...extra });

function assertValidationError(result, expectedFields) {
  assert.equal(result.status, 400);
  assert.equal(result.json.error.code, 'VALIDATION_ERROR');
  assert.deepEqual(result.json.error.fields, expectedFields);
}

test('POST /api/tasks creates a task and returns 201 with the stored fields and overdue', async () => {
  await withServer(async (server) => {
    const result = await post(server, {
      title: 'Buy milk',
      description: 'two litres',
      priority: 'High',
      dueDate: TOMORROW,
    });
    assert.equal(result.status, 201);
    assert.match(result.headers['content-type'], /^application\/json/);
    assert.deepEqual(result.json, {
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Buy milk',
      description: 'two litres',
      priority: 'High',
      dueDate: TOMORROW,
      status: 'Open',
      createdAt: NOW_ISO,
      completedAt: null,
      overdue: false,
    });
  });
});

test('defaults apply: priority Medium, empty description, no due date', async () => {
  await withServer(async (server) => {
    const result = await post(server, { title: 'Minimal' });
    assert.equal(result.status, 201);
    assert.equal(result.json.priority, 'Medium');
    assert.equal(result.json.description, '');
    assert.equal(result.json.dueDate, null);
    assert.equal(result.json.status, 'Open');
    assert.equal(result.json.completedAt, null);
  });
});

test('a due date of today is accepted and is not overdue', async () => {
  await withServer(async (server) => {
    const result = await post(server, { title: 'Today', dueDate: TODAY });
    assert.equal(result.status, 201);
    assert.equal(result.json.dueDate, TODAY);
    assert.equal(result.json.overdue, false);
  });
});

test('the title is trimmed and a title of 100 characters is accepted', async () => {
  await withServer(async (server) => {
    assert.equal((await post(server, { title: '  Padded  ' })).json.title, 'Padded');
    const longest = 'a'.repeat(100);
    assert.equal((await post(server, { title: longest })).json.title, longest);
  });
});

test('the file contains the task after success, oldest first', async () => {
  await withServer(async (server) => {
    const first = await post(server, { title: 'First' });
    const second = await post(server, { title: 'Second' });
    const stored = await readFileTasks(server);
    assert.deepEqual(
      stored.map((task) => task.id),
      [first.json.id, second.json.id],
    );
    const { overdue, ...firstWithoutOverdue } = first.json;
    assert.equal(overdue, false);
    assert.deepEqual(stored[0], firstWithoutOverdue);
    assert.notEqual(first.json.id, second.json.id);
  });
});

test('invalid fields give 400 with field messages and write nothing', async () => {
  await withServer(async (server) => {
    const cases = [
      [{ title: '' }, { title: 'Enter a title.' }],
      [{ title: '   ' }, { title: 'Enter a title.' }],
      [{}, { title: 'Enter a title.' }],
      [{ title: 'a'.repeat(101) }, { title: 'Title must be 100 characters or fewer.' }],
      [{ title: 'x', description: 'd'.repeat(501) }, { description: 'Description must be 500 characters or fewer.' }],
      [{ title: 'x', priority: 'Urgent' }, { priority: 'Choose Low, Medium or High.' }],
      [{ title: 'x', dueDate: YESTERDAY }, { dueDate: 'Due date cannot be in the past.' }],
      [{ title: 'x', dueDate: '2026-02-30' }, { dueDate: 'Enter a valid date.' }],
      [{ title: 'x', dueDate: '' }, { dueDate: 'Enter a valid date.' }],
      [{ title: 5 }, { title: 'Enter a valid value.' }],
      [{ title: 'x', description: null }, { description: 'Enter a valid value.' }],
    ];
    for (const [input, fields] of cases) {
      assertValidationError(await post(server, input), fields);
    }
    assert.deepEqual(await readFileTasks(server), []);
  });
});

test('several invalid fields are reported together', async () => {
  await withServer(async (server) => {
    const result = await post(server, { title: '', priority: 'Nope', dueDate: YESTERDAY, description: 'd'.repeat(501) });
    assertValidationError(result, {
      title: 'Enter a title.',
      priority: 'Choose Low, Medium or High.',
      dueDate: 'Due date cannot be in the past.',
      description: 'Description must be 500 characters or fewer.',
    });
  });
});

test('an unknown key is rejected, including status, id and createdAt', async () => {
  await withServer(async (server) => {
    assertValidationError(await post(server, { title: 'x', status: 'Completed' }), { status: 'Unknown field.' });
    assertValidationError(await post(server, { title: 'x', id: 'mine', createdAt: NOW_ISO }), {
      id: 'Unknown field.',
      createdAt: 'Unknown field.',
    });
    assert.deepEqual(await readFileTasks(server), []);
  });
});

test('a __proto__ key is an unknown field and does not change Object.prototype', async () => {
  await withServer(async (server) => {
    const result = await server.request({
      method: 'POST',
      path: '/api/tasks',
      headers: { 'Content-Type': 'application/json' },
      body: '{"title":"x","__proto__":{"polluted":true}}',
    });
    assert.equal(result.status, 400);
    const { fields } = result.json.error;
    assert.deepEqual(Object.keys(fields), ['__proto__']);
    assert.equal(Object.getOwnPropertyDescriptor(fields, '__proto__').value, 'Unknown field.');
    assert.equal({}.polluted, undefined);
    assert.deepEqual(await readFileTasks(server), []);
  });
});

test('an empty body, malformed JSON and a body that is not an object are rejected', async () => {
  await withServer(async (server) => {
    const raw = (body) =>
      server.request({ method: 'POST', path: '/api/tasks', headers: { 'Content-Type': 'application/json' }, body });
    for (const body of ['', '{"title":', 'nonsense']) {
      const result = await raw(body);
      assert.equal(result.status, 400, body);
      assert.equal(result.json.error.code, 'VALIDATION_ERROR');
    }
    for (const body of ['null', '[]', '"text"', '42', 'true']) {
      assertValidationError(await raw(body), { body: 'Enter a valid value.' });
    }
    assert.deepEqual(await readFileTasks(server), []);
  });
});

test('a wrong or missing content type gives 415 and writes nothing', async () => {
  await withServer(async (server) => {
    const body = JSON.stringify({ title: 'Sneaky' });
    for (const headers of [{ 'Content-Type': 'text/plain' }, { 'Content-Type': 'application/x-www-form-urlencoded' }, {}]) {
      const result = await server.request({ method: 'POST', path: '/api/tasks', headers, body });
      assert.equal(result.status, 415);
      assert.equal(result.json.error.code, 'UNSUPPORTED_MEDIA_TYPE');
    }
    assert.deepEqual(await readFileTasks(server), []);
  });
});

test('a body over 16 KB gives 413 and writes nothing', async () => {
  await withServer(async (server) => {
    const result = await post(server, { title: 'x', description: 'd'.repeat(20 * 1024) });
    assert.equal(result.status, 413);
    assert.equal(result.json.error.code, 'PAYLOAD_TOO_LARGE');
    assert.deepEqual(await readFileTasks(server), []);
  });
});

test('a foreign Origin gives 403 and writes nothing; the local Origin is accepted', async () => {
  await withServer(async (server) => {
    const foreign = await post(server, { title: 'Cross site' }, { headers: { Origin: 'http://evil.example' } });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.json.error.code, 'FORBIDDEN');
    assert.deepEqual(await readFileTasks(server), []);

    const local = await post(server, { title: 'Same site' }, { headers: { Origin: `http://127.0.0.1:${server.port}` } });
    assert.equal(local.status, 201);
  });
});

test('a title with markup is stored and returned as plain text', async () => {
  await withServer(async (server) => {
    const title = '<script>alert(1)</script>';
    const result = await post(server, { title, description: '<img src=x onerror=alert(1)>' });
    assert.equal(result.status, 201);
    assert.equal(result.json.title, title);
    assert.equal(result.json.description, '<img src=x onerror=alert(1)>');
    assert.match(result.headers['content-type'], /^application\/json/);
    assert.equal(result.headers['x-content-type-options'], 'nosniff');
    assert.equal((await readFileTasks(server))[0].title, title);
  });
});

test('other methods on /api/tasks are rejected with 405 and an Allow header that lists POST', async () => {
  await withServer(async (server) => {
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const result = await server.request({ method, path: '/api/tasks' });
      assert.equal(result.status, 405, method);
      assert.equal(result.json.error.code, 'METHOD_NOT_ALLOWED');
      assert.match(result.headers.allow, /POST/);
    }
  });
});

test('a failed save gives 500 STORE_WRITE_FAILED, keeps the file unchanged and logs code and message', async () => {
  const failingFs = { ...fsPromises, rename: async () => Promise.reject(Object.assign(new Error('disk full'), { code: 'EIO' })) };
  await withServer(
    async (server) => {
      const before = await fsPromises.readFile(server.dataFile, 'utf8');
      const result = await post(server, { title: 'Will not be saved' });
      assert.equal(result.status, 500);
      assert.equal(result.json.error.code, 'STORE_WRITE_FAILED');
      assert.equal(result.json.error.message, 'Your change could not be saved. Nothing was changed. Try again.');
      assert.equal(await fsPromises.readFile(server.dataFile, 'utf8'), before);
      assert.deepEqual(server.logs, [`STORE_WRITE_FAILED: ${result.json.error.message}`]);
      assert.ok(!JSON.stringify(server.logs).includes('Will not be saved'));
    },
    { fs: failingFs, tasks: [] },
  );
});

test('a corrupt data file gives 500 STORE_CORRUPT with the path and the file is not changed', async () => {
  const temp = await createTempDirectory();
  try {
    const dataFile = `${temp.directory}/tasks.json`;
    await fsPromises.writeFile(dataFile, '{ broken');
    await withServer(
      async (server) => {
        const result = await post(server, { title: 'Nope' });
        assert.equal(result.status, 500);
        assert.equal(result.json.error.code, 'STORE_CORRUPT');
        assert.ok(result.json.error.message.includes(dataFile));
        assert.equal(await fsPromises.readFile(dataFile, 'utf8'), '{ broken');
      },
      { dataFile },
    );
  } finally {
    await temp.remove();
  }
});
