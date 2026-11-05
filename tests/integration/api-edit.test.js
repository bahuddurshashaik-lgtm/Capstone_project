import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import { startTestServer } from '../helpers/start-test-server.js';

const NOW = new Date(2026, 10, 5, 12, 0, 0);
const YESTERDAY = '2026-11-04';
const OLDER_PAST_DATE = '2026-11-01';
const TOMORROW = '2026-11-06';

function seedTask(id, overrides = {}) {
  return {
    id,
    title: `Task ${id}`,
    description: `Notes ${id}`,
    priority: 'Medium',
    dueDate: null,
    status: 'Open',
    createdAt: '2026-11-01T08:00:00.000Z',
    completedAt: null,
    ...overrides,
  };
}

const PAST_DUE = seedTask('past', { priority: 'Low', dueDate: YESTERDAY });
const FUTURE = seedTask('future', { priority: 'High', dueDate: TOMORROW });
const DONE = seedTask('done', {
  status: 'Completed',
  completedAt: '2026-11-03T10:30:00.000Z',
  dueDate: YESTERDAY,
});
const SEEDED_TASKS = [PAST_DUE, FUTURE, DONE];

const validEdit = (overrides = {}) => ({
  title: 'Edited title',
  description: 'Edited notes',
  priority: 'High',
  dueDate: TOMORROW,
  ...overrides,
});

async function withServer(action, options = {}) {
  const server = await startTestServer({ tasks: SEEDED_TASKS, clock: () => new Date(NOW), ...options });
  try {
    return await action(server);
  } finally {
    await server.stop();
  }
}

const getTask = (server, id) => server.request({ path: `/api/tasks/${id}` });
const putTask = (server, id, json, extra = {}) =>
  server.request({ method: 'PUT', path: `/api/tasks/${id}`, json, ...extra });
const readFileText = (server) => fsPromises.readFile(server.dataFile, 'utf8');

function assertNotFound(result) {
  assert.equal(result.status, 404);
  assert.deepEqual(result.json, { error: { code: 'NOT_FOUND', message: 'Task not found' } });
}

function assertValidationError(result, fields) {
  assert.equal(result.status, 400);
  assert.equal(result.json.error.code, 'VALIDATION_ERROR');
  assert.deepEqual(result.json.error.fields, fields);
}

// ---- GET /api/tasks/:id ----

test('GET /api/tasks/:id returns the task with the overdue flag', async () => {
  await withServer(async (server) => {
    const result = await getTask(server, 'past');
    assert.equal(result.status, 200);
    assert.deepEqual(result.json, { ...PAST_DUE, overdue: true });
    assert.equal((await getTask(server, 'future')).json.overdue, false);
    assert.equal((await getTask(server, 'done')).json.overdue, false);
  });
});

test('GET of an unknown id gives 404 NOT_FOUND "Task not found"', async () => {
  await withServer(async (server) => {
    for (const id of ['missing', '123', 'constructor', '__proto__', 'a%20b', 'x'.repeat(300)]) {
      assertNotFound(await getTask(server, id));
    }
  });
});

test('the 404 for a missing task is NOT_FOUND, but an unknown route is ROUTE_NOT_FOUND', async () => {
  await withServer(async (server) => {
    assert.equal((await getTask(server, 'missing')).json.error.code, 'NOT_FOUND');
    assert.equal((await server.request({ path: '/api/tasks/missing/extra' })).json.error.code, 'ROUTE_NOT_FOUND');
  });
});

// ---- PUT /api/tasks/:id ----

test('PUT replaces the four fields and keeps id, createdAt, status and completedAt', async () => {
  await withServer(async (server) => {
    const result = await putTask(server, 'future', validEdit());
    assert.equal(result.status, 200);
    assert.deepEqual(result.json, {
      ...FUTURE,
      ...validEdit(),
      overdue: false,
    });
    assert.equal(result.json.id, 'future');
    assert.equal(result.json.createdAt, FUTURE.createdAt);
    assert.equal(result.json.status, 'Open');
    assert.deepEqual((await getTask(server, 'future')).json, result.json);
  });
});

test('the file contains the change and the other tasks are untouched', async () => {
  await withServer(async (server) => {
    await putTask(server, 'future', validEdit({ title: '  Trimmed  ' }));
    const stored = JSON.parse(await readFileText(server)).tasks;
    assert.deepEqual(stored[0], PAST_DUE);
    assert.deepEqual(stored[1], { ...FUTURE, ...validEdit({ title: 'Trimmed' }) });
    assert.deepEqual(stored[2], DONE);
  });
});

test('an edit does not change the position of the task in the list', async () => {
  await withServer(async (server) => {
    const before = (await server.request({ path: '/api/tasks' })).json.tasks.map((task) => task.id);
    await putTask(server, 'past', validEdit());
    const after = (await server.request({ path: '/api/tasks' })).json.tasks.map((task) => task.id);
    assert.deepEqual(after, before);
  });
});

test('editing a Completed task keeps it Completed with the same completedAt', async () => {
  await withServer(async (server) => {
    const result = await putTask(server, 'done', validEdit({ dueDate: null }));
    assert.equal(result.status, 200);
    assert.equal(result.json.status, 'Completed');
    assert.equal(result.json.completedAt, DONE.completedAt);
    assert.equal(result.json.overdue, false);
  });
});

test('an unchanged past due date is accepted', async () => {
  await withServer(async (server) => {
    const result = await putTask(server, 'past', validEdit({ dueDate: YESTERDAY }));
    assert.equal(result.status, 200);
    assert.equal(result.json.dueDate, YESTERDAY);
    assert.equal(result.json.overdue, true);
  });
});

test('a changed past due date is rejected, a future date and null are accepted', async () => {
  await withServer(async (server) => {
    assertValidationError(await putTask(server, 'past', validEdit({ dueDate: OLDER_PAST_DATE })), {
      dueDate: 'Due date cannot be in the past.',
    });
    assertValidationError(await putTask(server, 'future', validEdit({ dueDate: YESTERDAY })), {
      dueDate: 'Due date cannot be in the past.',
    });
    assert.equal((await putTask(server, 'past', validEdit({ dueDate: TOMORROW }))).json.overdue, false);
    assert.equal((await putTask(server, 'future', validEdit({ dueDate: null }))).json.dueDate, null);
  });
});

test('a missing key gives "This field is required." for that key and changes nothing', async () => {
  await withServer(async (server) => {
    const before = await readFileText(server);
    for (const key of ['title', 'description', 'priority', 'dueDate']) {
      const input = validEdit();
      delete input[key];
      assertValidationError(await putTask(server, 'future', input), { [key]: 'This field is required.' });
    }
    assertValidationError(await putTask(server, 'future', {}), {
      title: 'This field is required.',
      description: 'This field is required.',
      priority: 'This field is required.',
      dueDate: 'This field is required.',
    });
    assert.equal(await readFileText(server), before);
  });
});

test('unknown keys, including status, id and createdAt, are rejected and change nothing', async () => {
  await withServer(async (server) => {
    const before = await readFileText(server);
    assertValidationError(await putTask(server, 'future', validEdit({ status: 'Completed' })), {
      status: 'Unknown field.',
    });
    assertValidationError(await putTask(server, 'future', validEdit({ id: 'other', createdAt: '2020-01-01T00:00:00.000Z' })), {
      id: 'Unknown field.',
      createdAt: 'Unknown field.',
    });
    assert.equal(await readFileText(server), before);
  });
});

test('invalid values give 400 with field messages and change nothing', async () => {
  await withServer(async (server) => {
    const before = await readFileText(server);
    const cases = [
      [{ title: '' }, { title: 'Enter a title.' }],
      [{ title: '   ' }, { title: 'Enter a title.' }],
      [{ title: 'a'.repeat(101) }, { title: 'Title must be 100 characters or fewer.' }],
      [{ description: 'd'.repeat(501) }, { description: 'Description must be 500 characters or fewer.' }],
      [{ priority: 'Urgent' }, { priority: 'Choose Low, Medium or High.' }],
      [{ dueDate: '' }, { dueDate: 'Enter a valid date.' }],
      [{ dueDate: '2026-02-30' }, { dueDate: 'Enter a valid date.' }],
      [{ dueDate: 20261106 }, { dueDate: 'Enter a valid value.' }],
      [{ title: 7 }, { title: 'Enter a valid value.' }],
    ];
    for (const [overrides, fields] of cases) {
      assertValidationError(await putTask(server, 'future', validEdit(overrides)), fields);
    }
    assert.equal(await readFileText(server), before);
  });
});

test('a body that is not an object is rejected', async () => {
  await withServer(async (server) => {
    for (const body of ['null', '[]', '"text"', '5']) {
      const result = await server.request({
        method: 'PUT',
        path: '/api/tasks/future',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      assertValidationError(result, { body: 'Enter a valid value.' });
    }
  });
});

test('malformed JSON gives 400, a wrong content type 415, an oversized body 413', async () => {
  await withServer(async (server) => {
    const before = await readFileText(server);
    const malformed = await server.request({
      method: 'PUT',
      path: '/api/tasks/future',
      headers: { 'Content-Type': 'application/json' },
      body: '{"title":',
    });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.json.error.code, 'VALIDATION_ERROR');

    const wrongType = await server.request({
      method: 'PUT',
      path: '/api/tasks/future',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(validEdit()),
    });
    assert.equal(wrongType.status, 415);

    assert.equal((await putTask(server, 'future', validEdit({ description: 'd'.repeat(20000) }))).status, 413);
    assert.equal(await readFileText(server), before);
  });
});

test('a foreign Origin on PUT gives 403 and changes nothing', async () => {
  await withServer(async (server) => {
    const before = await readFileText(server);
    const result = await putTask(server, 'future', validEdit(), { headers: { Origin: 'http://evil.example' } });
    assert.equal(result.status, 403);
    assert.equal(result.json.error.code, 'FORBIDDEN');
    assert.equal(await readFileText(server), before);
  });
});

test('PUT of an unknown id gives 404 and writes nothing', async () => {
  await withServer(async (server) => {
    const before = await readFileText(server);
    assertNotFound(await putTask(server, 'missing', validEdit()));
    assert.equal(await readFileText(server), before);
  });
});

test('the task is looked up before the body is validated', async () => {
  await withServer(async (server) => {
    assertNotFound(await putTask(server, 'missing', {}));
  });
});

test('editing a task that was deleted gives 404', async () => {
  await withServer(async (server) => {
    await server.service.deleteTask('future');
    assertNotFound(await putTask(server, 'future', validEdit()));
    assertNotFound(await getTask(server, 'future'));
  });
});

test('markup in an edited title is stored and returned as plain text', async () => {
  await withServer(async (server) => {
    const title = '<img src=x onerror=alert(1)>';
    const result = await putTask(server, 'future', validEdit({ title }));
    assert.equal(result.json.title, title);
    assert.equal(JSON.parse(await readFileText(server)).tasks[1].title, title);
  });
});

test('a failed save gives 500 STORE_WRITE_FAILED and the task is unchanged', async () => {
  const failingFs = { ...fsPromises, rename: async () => Promise.reject(Object.assign(new Error('disk full'), { code: 'EIO' })) };
  await withServer(
    async (server) => {
      const before = await readFileText(server);
      const result = await putTask(server, 'future', validEdit());
      assert.equal(result.status, 500);
      assert.equal(result.json.error.code, 'STORE_WRITE_FAILED');
      assert.equal(await readFileText(server), before);
      assert.deepEqual((await getTask(server, 'future')).json, { ...FUTURE, overdue: false });
    },
    { fs: failingFs },
  );
});

test('unsupported methods on /api/tasks/:id give 405 with an Allow header', async () => {
  await withServer(async (server) => {
    for (const method of ['POST', 'PATCH']) {
      const result = await server.request({ method, path: '/api/tasks/future', json: {} });
      assert.equal(result.status, 405, method);
      assert.equal(result.json.error.code, 'METHOD_NOT_ALLOWED');
      assert.match(result.headers.allow, /GET/);
      assert.match(result.headers.allow, /PUT/);
    }
  });
});
