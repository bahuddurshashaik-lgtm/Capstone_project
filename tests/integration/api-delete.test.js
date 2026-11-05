import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import { join } from 'node:path';
import { createTempDirectory, startTestServer } from '../helpers/start-test-server.js';

const NOW = new Date(2026, 10, 5, 12, 0, 0);

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

const FIRST = seedTask('first');
const MIDDLE = seedTask('middle', { priority: 'High', dueDate: '2026-11-10' });
const LAST = seedTask('last', { status: 'Completed', completedAt: '2026-11-03T10:30:00.000Z' });
const SEEDED_TASKS = [FIRST, MIDDLE, LAST];

async function withServer(action, options = {}) {
  const server = await startTestServer({ tasks: SEEDED_TASKS, clock: () => new Date(NOW), ...options });
  try {
    return await action(server);
  } finally {
    await server.stop();
  }
}

const deleteTask = (server, id, extra = {}) => server.request({ method: 'DELETE', path: `/api/tasks/${id}`, ...extra });
const listIds = async (server) => (await server.request({ path: '/api/tasks' })).json.tasks.map((task) => task.id);
const readFileTasks = async (server) => JSON.parse(await fsPromises.readFile(server.dataFile, 'utf8')).tasks;

function assertNotFound(result) {
  assert.equal(result.status, 404);
  assert.deepEqual(result.json, { error: { code: 'NOT_FOUND', message: 'Task not found' } });
}

test('DELETE returns 204 with no body', async () => {
  await withServer(async (server) => {
    const result = await deleteTask(server, 'middle');
    assert.equal(result.status, 204);
    assert.equal(result.text, '');
    assert.equal(result.headers['content-type'], undefined);
    assert.equal(result.headers['x-content-type-options'], 'nosniff');
  });
});

test('the task is gone from the list, from GET by id and from the file', async () => {
  await withServer(async (server) => {
    await deleteTask(server, 'middle');
    assert.deepEqual(await listIds(server), ['last', 'first']);
    assert.equal((await server.request({ path: '/api/tasks' })).json.total, 2);
    assertNotFound(await server.request({ path: '/api/tasks/middle' }));
    assert.deepEqual(
      (await readFileTasks(server)).map((task) => task.id),
      ['first', 'last'],
    );
  });
});

test('other tasks are unchanged', async () => {
  await withServer(async (server) => {
    await deleteTask(server, 'middle');
    assert.deepEqual(await readFileTasks(server), [FIRST, LAST]);
  });
});

test('a Completed task can be deleted', async () => {
  await withServer(async (server) => {
    assert.equal((await deleteTask(server, 'last')).status, 204);
    assert.deepEqual(await listIds(server), ['middle', 'first']);
  });
});

test('deleting the only task leaves an empty list with total 0', async () => {
  await withServer(
    async (server) => {
      assert.equal((await deleteTask(server, 'first')).status, 204);
      assert.deepEqual((await server.request({ path: '/api/tasks' })).json, { tasks: [], total: 0 });
      assert.deepEqual(await readFileTasks(server), []);
    },
    { tasks: [FIRST] },
  );
});

test('a second delete of the same task gives 404 NOT_FOUND', async () => {
  await withServer(async (server) => {
    assert.equal((await deleteTask(server, 'middle')).status, 204);
    assertNotFound(await deleteTask(server, 'middle'));
    assert.deepEqual(await listIds(server), ['last', 'first']);
  });
});

test('an unknown id gives 404 and writes nothing', async () => {
  await withServer(async (server) => {
    const before = await fsPromises.readFile(server.dataFile, 'utf8');
    for (const id of ['missing', 'constructor', '__proto__', 'x'.repeat(300)]) {
      assertNotFound(await deleteTask(server, id));
    }
    assert.equal(await fsPromises.readFile(server.dataFile, 'utf8'), before);
  });
});

test('a request body on DELETE is ignored', async () => {
  await withServer(async (server) => {
    const result = await deleteTask(server, 'middle', { headers: { 'Content-Type': 'text/plain' }, body: 'ignored' });
    assert.equal(result.status, 204);
  });
});

test('a foreign Origin gives 403 and deletes nothing', async () => {
  await withServer(async (server) => {
    const result = await deleteTask(server, 'middle', { headers: { Origin: 'http://evil.example' } });
    assert.equal(result.status, 403);
    assert.equal(result.json.error.code, 'FORBIDDEN');
    assert.deepEqual(await listIds(server), ['last', 'middle', 'first']);
  });
});

test('the delete is still there after a new server starts on the same file (FR-30)', async () => {
  const temp = await createTempDirectory();
  try {
    const dataFile = join(temp.directory, 'tasks.json');
    const first = await startTestServer({ dataFile, tasks: SEEDED_TASKS });
    assert.equal((await deleteTask(first, 'middle')).status, 204);
    await first.stop();

    const second = await startTestServer({ dataFile });
    try {
      assert.deepEqual(await listIds(second), ['last', 'first']);
    } finally {
      await second.stop();
    }
  } finally {
    await temp.remove();
  }
});

test('a failed save gives 500 STORE_WRITE_FAILED and the task is still there', async () => {
  const failingFs = { ...fsPromises, rename: async () => Promise.reject(Object.assign(new Error('disk full'), { code: 'EIO' })) };
  await withServer(
    async (server) => {
      const before = await fsPromises.readFile(server.dataFile, 'utf8');
      const result = await deleteTask(server, 'middle');
      assert.equal(result.status, 500);
      assert.equal(result.json.error.code, 'STORE_WRITE_FAILED');
      assert.equal(await fsPromises.readFile(server.dataFile, 'utf8'), before);
      assert.deepEqual(await listIds(server), ['last', 'middle', 'first']);
    },
    { fs: failingFs },
  );
});

test('a corrupt data file gives 500 STORE_CORRUPT and is not changed', async () => {
  const temp = await createTempDirectory();
  try {
    const dataFile = join(temp.directory, 'tasks.json');
    await fsPromises.writeFile(dataFile, '[]');
    await withServer(
      async (server) => {
        const result = await deleteTask(server, 'middle');
        assert.equal(result.status, 500);
        assert.equal(result.json.error.code, 'STORE_CORRUPT');
        assert.equal(await fsPromises.readFile(dataFile, 'utf8'), '[]');
      },
      { dataFile, tasks: undefined },
    );
  } finally {
    await temp.remove();
  }
});

test('unsupported methods give 405, and DELETE on the collection is not allowed', async () => {
  await withServer(async (server) => {
    const post = await server.request({ method: 'POST', path: '/api/tasks/middle', json: {} });
    assert.equal(post.status, 405);
    assert.equal(post.headers.allow, 'GET, PUT, DELETE');

    const collection = await server.request({ method: 'DELETE', path: '/api/tasks' });
    assert.equal(collection.status, 405);
    assert.equal(collection.headers.allow, 'GET, POST');
    assert.deepEqual(await listIds(server), ['last', 'middle', 'first']);
  });
});
