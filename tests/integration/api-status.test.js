import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import { join } from 'node:path';
import { createTempDirectory, startTestServer } from '../helpers/start-test-server.js';

const FIRST_TIME = new Date(2026, 10, 5, 12, 0, 0);
const LATER_TIME = new Date(2026, 10, 5, 15, 45, 0);
const YESTERDAY = '2026-11-04';

function seedTask(id, overrides = {}) {
  return {
    id,
    title: `Task ${id}`,
    description: '',
    priority: 'Medium',
    dueDate: null,
    status: 'Open',
    createdAt: '2026-11-01T08:00:00.000Z',
    completedAt: null,
    ...overrides,
  };
}

const OPEN = seedTask('open');
const PAST_DUE = seedTask('past', { dueDate: YESTERDAY, priority: 'High' });
const DONE = seedTask('done', { status: 'Completed', completedAt: '2026-11-03T10:30:00.000Z' });
const SEEDED_TASKS = [OPEN, PAST_DUE, DONE];

async function withServer(action, options = {}) {
  let current = FIRST_TIME;
  const server = await startTestServer({ tasks: SEEDED_TASKS, clock: () => new Date(current), ...options });
  server.setNow = (value) => {
    current = value;
  };
  try {
    return await action(server);
  } finally {
    await server.stop();
  }
}

const setStatus = (server, id, json, extra = {}) =>
  server.request({ method: 'PUT', path: `/api/tasks/${id}/status`, json, ...extra });
const getTask = (server, id) => server.request({ path: `/api/tasks/${id}` });
const readFileText = (server) => fsPromises.readFile(server.dataFile, 'utf8');

function assertNotFound(result) {
  assert.equal(result.status, 404);
  assert.deepEqual(result.json, { error: { code: 'NOT_FOUND', message: 'Task not found' } });
}

function assertStatusError(result, fields) {
  assert.equal(result.status, 400);
  assert.equal(result.json.error.code, 'VALIDATION_ERROR');
  assert.deepEqual(result.json.error.fields, fields);
}

test('completing an Open task sets status Completed and completedAt from the clock', async () => {
  await withServer(async (server) => {
    const result = await setStatus(server, 'open', { status: 'Completed' });
    assert.equal(result.status, 200);
    assert.equal(result.json.status, 'Completed');
    assert.equal(result.json.completedAt, FIRST_TIME.toISOString());
    assert.deepEqual({ ...result.json, status: 'Open', completedAt: null }, { ...OPEN, overdue: false });
    assert.deepEqual((await getTask(server, 'open')).json, result.json);
  });
});

test('reopening a Completed task clears completedAt', async () => {
  await withServer(async (server) => {
    const result = await setStatus(server, 'done', { status: 'Open' });
    assert.equal(result.status, 200);
    assert.equal(result.json.status, 'Open');
    assert.equal(result.json.completedAt, null);
    assert.equal((await getTask(server, 'done')).json.completedAt, null);
  });
});

test('complete, reopen and complete again gives a new completedAt', async () => {
  await withServer(async (server) => {
    const first = await setStatus(server, 'open', { status: 'Completed' });
    assert.equal((await setStatus(server, 'open', { status: 'Open' })).json.completedAt, null);
    server.setNow(LATER_TIME);
    const second = await setStatus(server, 'open', { status: 'Completed' });
    assert.equal(first.json.completedAt, FIRST_TIME.toISOString());
    assert.equal(second.json.completedAt, LATER_TIME.toISOString());
  });
});

test('completing twice keeps the first completedAt', async () => {
  await withServer(async (server) => {
    const first = await setStatus(server, 'open', { status: 'Completed' });
    server.setNow(LATER_TIME);
    const before = await readFileText(server);
    const second = await setStatus(server, 'open', { status: 'Completed' });
    assert.equal(second.status, 200);
    assert.equal(second.json.completedAt, first.json.completedAt);
    assert.equal(await readFileText(server), before);
  });
});

test('setting Open on an Open task changes nothing', async () => {
  await withServer(async (server) => {
    const before = await readFileText(server);
    const result = await setStatus(server, 'open', { status: 'Open' });
    assert.equal(result.status, 200);
    assert.deepEqual(result.json, { ...OPEN, overdue: false });
    assert.equal(await readFileText(server), before);
  });
});

test('only status and completedAt change, and the position in the list stays', async () => {
  await withServer(async (server) => {
    const before = (await server.request({ path: '/api/tasks' })).json.tasks.map((task) => task.id);
    await setStatus(server, 'past', { status: 'Completed' });
    const stored = JSON.parse(await readFileText(server)).tasks;
    assert.deepEqual(stored[0], OPEN);
    assert.deepEqual(stored[1], { ...PAST_DUE, status: 'Completed', completedAt: FIRST_TIME.toISOString() });
    assert.deepEqual(stored[2], DONE);
    const after = (await server.request({ path: '/api/tasks' })).json.tasks.map((task) => task.id);
    assert.deepEqual(after, before);
  });
});

test('the overdue flag follows the status: completed is not overdue, reopened is overdue again', async () => {
  await withServer(async (server) => {
    assert.equal((await getTask(server, 'past')).json.overdue, true);
    assert.equal((await setStatus(server, 'past', { status: 'Completed' })).json.overdue, false);
    assert.equal((await setStatus(server, 'past', { status: 'Open' })).json.overdue, true);
  });
});

test('an invalid status gives 400 and changes nothing', async () => {
  await withServer(async (server) => {
    const before = await readFileText(server);
    for (const status of ['Done', 'open', 'COMPLETED', '', null, 1, true, ['Open']]) {
      assertStatusError(await setStatus(server, 'open', { status }), { status: 'Choose Open or Completed.' });
    }
    assertStatusError(await setStatus(server, 'open', {}), { status: 'Choose Open or Completed.' });
    assert.equal(await readFileText(server), before);
  });
});

test('an unknown key in the status body is rejected', async () => {
  await withServer(async (server) => {
    assertStatusError(await setStatus(server, 'open', { status: 'Completed', title: 'Hijack' }), {
      title: 'Unknown field.',
    });
    assert.equal((await getTask(server, 'open')).json.status, 'Open');
  });
});

test('a body that is not an object, bad JSON or the wrong content type is rejected', async () => {
  await withServer(async (server) => {
    const send = (headers, body) =>
      server.request({ method: 'PUT', path: '/api/tasks/open/status', headers, body });
    const json = { 'Content-Type': 'application/json' };
    assertStatusError(await send(json, '"Completed"'), { body: 'Enter a valid value.' });
    assertStatusError(await send(json, 'null'), { body: 'Enter a valid value.' });
    assert.equal((await send(json, '{"status":')).status, 400);
    assert.equal((await send({ 'Content-Type': 'text/plain' }, '{"status":"Completed"}')).status, 415);
    assert.equal((await getTask(server, 'open')).json.status, 'Open');
  });
});

test('an unknown id gives 404 NOT_FOUND and writes nothing', async () => {
  await withServer(async (server) => {
    const before = await readFileText(server);
    assertNotFound(await setStatus(server, 'missing', { status: 'Completed' }));
    assertNotFound(await setStatus(server, 'missing', { status: 'Nonsense' }));
    assert.equal(await readFileText(server), before);
  });
});

test('a task that was deleted gives 404', async () => {
  await withServer(async (server) => {
    await server.service.deleteTask('open');
    assertNotFound(await setStatus(server, 'open', { status: 'Completed' }));
  });
});

test('a foreign Origin gives 403 and changes nothing', async () => {
  await withServer(async (server) => {
    const result = await setStatus(server, 'open', { status: 'Completed' }, { headers: { Origin: 'http://evil.example' } });
    assert.equal(result.status, 403);
    assert.equal((await getTask(server, 'open')).json.status, 'Open');
  });
});

test('the new status is still there after a new server starts on the same file (FR-27)', async () => {
  const temp = await createTempDirectory();
  try {
    const dataFile = join(temp.directory, 'tasks.json');
    const first = await startTestServer({ dataFile, tasks: SEEDED_TASKS, clock: () => new Date(FIRST_TIME) });
    const completed = await setStatus(first, 'open', { status: 'Completed' });
    await setStatus(first, 'done', { status: 'Open' });
    await first.stop();

    const second = await startTestServer({ dataFile, clock: () => new Date(LATER_TIME) });
    try {
      assert.deepEqual((await getTask(second, 'open')).json, completed.json);
      assert.equal((await getTask(second, 'done')).json.status, 'Open');
      assert.equal((await getTask(second, 'done')).json.completedAt, null);
    } finally {
      await second.stop();
    }
  } finally {
    await temp.remove();
  }
});

test('a failed save gives 500 STORE_WRITE_FAILED and the status is unchanged', async () => {
  const failingFs = { ...fsPromises, rename: async () => Promise.reject(Object.assign(new Error('disk full'), { code: 'EIO' })) };
  await withServer(
    async (server) => {
      const before = await readFileText(server);
      const result = await setStatus(server, 'open', { status: 'Completed' });
      assert.equal(result.status, 500);
      assert.equal(result.json.error.code, 'STORE_WRITE_FAILED');
      assert.equal(await readFileText(server), before);
      assert.equal((await getTask(server, 'open')).json.status, 'Open');
    },
    { fs: failingFs },
  );
});

test('other methods on the status path give 405 with Allow PUT', async () => {
  await withServer(async (server) => {
    for (const method of ['GET', 'POST', 'DELETE', 'PATCH']) {
      const result = await server.request({ method, path: '/api/tasks/open/status' });
      assert.equal(result.status, 405, method);
      assert.equal(result.json.error.code, 'METHOD_NOT_ALLOWED');
      assert.equal(result.headers.allow, 'PUT');
    }
  });
});
