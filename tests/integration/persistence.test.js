import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import { join } from 'node:path';
import { createTempDirectory, startTestServer } from '../helpers/start-test-server.js';

const NOW = new Date(2026, 10, 5, 12, 0, 0);
const clock = () => new Date(NOW);

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

const SEEDED_TASKS = [seedTask('first'), seedTask('second', { priority: 'High' })];
const CORRUPT_TEXT = '{ "version": 1, "tasks": [ this is not json';

async function withTempFile(action) {
  const temp = await createTempDirectory('todo-persist-');
  try {
    return await action(join(temp.directory, 'tasks.json'), temp.directory);
  } finally {
    await temp.remove();
  }
}

async function withServer(options, action) {
  const server = await startTestServer({ clock, ...options });
  try {
    return await action(server);
  } finally {
    await server.stop();
  }
}

const readFileText = (path) => fsPromises.readFile(path, 'utf8');
const listTasks = async (server) => (await server.request({ path: '/api/tasks' })).json;
const createTask = (server, title) => server.request({ method: 'POST', path: '/api/tasks', json: { title } });

function failRename(shouldFail) {
  return {
    ...fsPromises,
    rename: async (...args) => {
      if (shouldFail()) throw Object.assign(new Error('disk full'), { code: 'EIO' });
      return fsPromises.rename(...args);
    },
  };
}

function assertStoreCorrupt(result, dataFile) {
  assert.equal(result.status, 500);
  assert.equal(result.json.error.code, 'STORE_CORRUPT');
  assert.ok(result.json.error.message.includes(dataFile), 'the message shows the file path');
}

test('created, edited, completed and deleted tasks survive a restart on the same file (FR-27, FR-30, FR-33)', async () => {
  await withTempFile(async (dataFile) => {
    let expected;
    await withServer({ dataFile, tasks: SEEDED_TASKS }, async (server) => {
      const created = (await createTask(server, 'Brand new')).json;
      await server.request({
        method: 'PUT',
        path: '/api/tasks/first',
        json: { title: 'Edited', description: 'Notes', priority: 'Low', dueDate: '2026-12-01' },
      });
      await server.request({ method: 'PUT', path: '/api/tasks/second/status', json: { status: 'Completed' } });
      await server.request({ method: 'DELETE', path: `/api/tasks/${created.id}` });
      await createTask(server, 'Kept');
      expected = await listTasks(server);
    });

    await withServer({ dataFile }, async (server) => {
      const restarted = await listTasks(server);
      assert.deepEqual(restarted, expected);
      assert.equal(restarted.total, 3);
      assert.equal(restarted.tasks.find((task) => task.id === 'second').status, 'Completed');
      assert.equal(restarted.tasks.find((task) => task.id === 'first').title, 'Edited');
    });
  });
});

test('a missing file is a first run: the file is created with an empty list (NFR-10)', async () => {
  await withTempFile(async (_dataFile, directory) => {
    const nestedFile = join(directory, 'nested', 'data', 'tasks.json');
    await withServer({ dataFile: nestedFile }, async (server) => {
      assert.deepEqual(await server.store.initialize(), { firstRun: true });
      assert.deepEqual(await listTasks(server), { tasks: [], total: 0 });
      assert.deepEqual(JSON.parse(await readFileText(nestedFile)), { version: 1, tasks: [] });
    });
  });
});

test('an existing valid file is not a first run', async () => {
  await withTempFile(async (dataFile) => {
    await withServer({ dataFile, tasks: SEEDED_TASKS }, async (server) => {
      assert.deepEqual(await server.store.initialize(), { firstRun: false });
      assert.equal((await listTasks(server)).total, 2);
    });
  });
});

test('a corrupt file gives STORE_CORRUPT on reads and writes and is never overwritten (NFR-10)', async () => {
  await withTempFile(async (dataFile) => {
    await fsPromises.writeFile(dataFile, CORRUPT_TEXT, 'utf8');
    const before = await fsPromises.readFile(dataFile);
    await withServer({ dataFile }, async (server) => {
      assertStoreCorrupt(await server.request({ path: '/api/tasks' }), dataFile);
      assertStoreCorrupt(await createTask(server, 'Must not be saved'), dataFile);
      assertStoreCorrupt(await server.request({ method: 'DELETE', path: '/api/tasks/first' }), dataFile);
      assertStoreCorrupt(
        await server.request({ method: 'PUT', path: '/api/tasks/first/status', json: { status: 'Completed' } }),
        dataFile,
      );
    });
    assert.deepEqual(await fsPromises.readFile(dataFile), before);
    await assert.rejects(fsPromises.access(`${dataFile}.tmp`));
  });
});

test('a structurally invalid file (valid JSON) is also left untouched', async () => {
  await withTempFile(async (dataFile) => {
    const invalidText = JSON.stringify({ version: 2, tasks: [] });
    await fsPromises.writeFile(dataFile, invalidText, 'utf8');
    await withServer({ dataFile }, async (server) => {
      assertStoreCorrupt(await createTask(server, 'Must not be saved'), dataFile);
    });
    assert.equal(await readFileText(dataFile), invalidText);
  });
});

test('a repaired file works on the next request without restarting the server', async () => {
  await withTempFile(async (dataFile) => {
    await fsPromises.writeFile(dataFile, CORRUPT_TEXT, 'utf8');
    await withServer({ dataFile }, async (server) => {
      assertStoreCorrupt(await server.request({ path: '/api/tasks' }), dataFile);

      await fsPromises.writeFile(dataFile, JSON.stringify({ version: 1, tasks: SEEDED_TASKS }), 'utf8');

      const repaired = await listTasks(server);
      assert.equal(repaired.total, 2);
      assert.equal((await createTask(server, 'After repair')).status, 201);
      assert.equal((await listTasks(server)).total, 3);
    });
  });
});

test('a forced write failure leaves memory and file unchanged, and the next save works (NFR-9)', async () => {
  await withTempFile(async (dataFile) => {
    let failing = false;
    await withServer({ dataFile, tasks: SEEDED_TASKS, fs: failRename(() => failing) }, async (server) => {
      const before = await readFileText(dataFile);
      const listBefore = await listTasks(server);

      failing = true;
      const created = await createTask(server, 'Not saved');
      assert.equal(created.status, 500);
      assert.equal(created.json.error.code, 'STORE_WRITE_FAILED');
      const deleted = await server.request({ method: 'DELETE', path: '/api/tasks/first' });
      assert.equal(deleted.json.error.code, 'STORE_WRITE_FAILED');

      assert.equal(await readFileText(dataFile), before);
      assert.deepEqual(await listTasks(server), listBefore);
      await assert.rejects(fsPromises.access(`${dataFile}.tmp`));

      failing = false;
      assert.equal((await createTask(server, 'Saved now')).status, 201);
      assert.equal((await listTasks(server)).total, 3);
      assert.equal(JSON.parse(await readFileText(dataFile)).tasks.length, 3);
    });
  });
});

test('a stale temp file from a crashed save is removed at start and does not affect the data', async () => {
  await withTempFile(async (dataFile) => {
    await fsPromises.writeFile(dataFile, JSON.stringify({ version: 1, tasks: SEEDED_TASKS }), 'utf8');
    await fsPromises.writeFile(`${dataFile}.tmp`, 'half written', 'utf8');
    await withServer({ dataFile }, async (server) => {
      assert.equal((await listTasks(server)).total, 2);
    });
    await assert.rejects(fsPromises.access(`${dataFile}.tmp`));
  });
});
