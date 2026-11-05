import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import { startTestServer } from '../helpers/start-test-server.js';
import { checkStoreContent } from '../../src/storage/store-file-check.js';

const NOW = new Date(2026, 10, 5, 12, 0, 0);
const clock = () => new Date(NOW);
const PARALLEL_COUNT = 50;

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

const seedMany = (count) => Array.from({ length: count }, (_, index) => seedTask(`task-${index}`));

async function withServer(options, action) {
  const server = await startTestServer({ clock, ...options });
  try {
    return await action(server);
  } finally {
    await server.stop();
  }
}

const listTasks = async (server) => (await server.request({ path: '/api/tasks' })).json.tasks;
const createTask = (server, title) => server.request({ method: 'POST', path: '/api/tasks', json: { title } });
const editTask = (server, id, title) =>
  server.request({
    method: 'PUT',
    path: `/api/tasks/${id}`,
    json: { title, description: '', priority: 'High', dueDate: null },
  });
const deleteTask = (server, id) => server.request({ method: 'DELETE', path: `/api/tasks/${id}` });

async function assertFileIsValid(server, expectedCount) {
  const checked = checkStoreContent(await fsPromises.readFile(server.dataFile, 'utf8'));
  assert.equal(checked.problem, undefined, `the data file passes the load check (${checked.problem})`);
  assert.equal(checked.tasks.length, expectedCount);
  return checked.tasks;
}

function assertNotFound(result) {
  assert.equal(result.status, 404);
  assert.deepEqual(result.json, { error: { code: 'NOT_FOUND', message: 'Task not found' } });
}

/** File-system layer whose first save pauses at the commit step until `release()` is called. */
function createPausedFirstSave() {
  let release;
  let markReached;
  const released = new Promise((resolve) => (release = resolve));
  const reached = new Promise((resolve) => (markReached = resolve));
  let paused = false;
  const fs = {
    ...fsPromises,
    rename: async (...args) => {
      if (!paused) {
        paused = true;
        markReached();
        await released;
      }
      return fsPromises.rename(...args);
    },
  };
  return { fs, reached, release };
}

test('parallel creates keep every task with a distinct id (NFR-9)', async () => {
  await withServer({}, async (server) => {
    const results = await Promise.all(
      Array.from({ length: PARALLEL_COUNT }, (_, index) => createTask(server, `Parallel ${index}`)),
    );
    assert.ok(results.every((result) => result.status === 201));

    const tasks = await listTasks(server);
    assert.equal(tasks.length, PARALLEL_COUNT);
    assert.equal(new Set(tasks.map((task) => task.id)).size, PARALLEL_COUNT);
    assert.equal(new Set(tasks.map((task) => task.title)).size, PARALLEL_COUNT);
    await assertFileIsValid(server, PARALLEL_COUNT);
  });
});

test('parallel edits of different tasks keep every change', async () => {
  await withServer({ tasks: seedMany(PARALLEL_COUNT) }, async (server) => {
    const results = await Promise.all(
      Array.from({ length: PARALLEL_COUNT }, (_, index) => editTask(server, `task-${index}`, `Edited ${index}`)),
    );
    assert.ok(results.every((result) => result.status === 200));

    const fileTasks = await assertFileIsValid(server, PARALLEL_COUNT);
    for (const task of fileTasks) {
      assert.equal(task.title, `Edited ${task.id.replace('task-', '')}`);
      assert.equal(task.priority, 'High');
    }
    assert.deepEqual(
      (await listTasks(server)).map((task) => task.title).sort(),
      fileTasks.map((task) => task.title).sort(),
    );
  });
});

test('mixed parallel creates, edits and deletes all apply', async () => {
  await withServer({ tasks: seedMany(20) }, async (server) => {
    const requests = [
      ...Array.from({ length: 10 }, (_, index) => createTask(server, `New ${index}`)),
      ...Array.from({ length: 5 }, (_, index) => editTask(server, `task-${index}`, `Edited ${index}`)),
      ...Array.from({ length: 5 }, (_, index) => deleteTask(server, `task-${index + 10}`)),
    ];
    const results = await Promise.all(requests);
    assert.deepEqual(
      results.map((result) => result.status),
      [...Array(10).fill(201), ...Array(5).fill(200), ...Array(5).fill(204)],
    );
    await assertFileIsValid(server, 25);
  });
});

test('a delete that arrives first makes the racing edit of the same task give 404 (FR-21, FR-32)', async () => {
  const gate = createPausedFirstSave();
  await withServer({ tasks: seedMany(3), fs: gate.fs }, async (server) => {
    const deleting = deleteTask(server, 'task-1');
    await gate.reached;
    const editing = editTask(server, 'task-1', 'Too late');
    gate.release();

    const [deleted, edited] = await Promise.all([deleting, editing]);
    assert.equal(deleted.status, 204);
    assertNotFound(edited);
    const fileTasks = await assertFileIsValid(server, 2);
    assert.deepEqual(fileTasks.map((task) => task.id), ['task-0', 'task-2']);
  });
});

test('an edit that arrives first succeeds and the racing delete then removes the task', async () => {
  const gate = createPausedFirstSave();
  await withServer({ tasks: seedMany(3), fs: gate.fs }, async (server) => {
    const editing = editTask(server, 'task-1', 'First');
    await gate.reached;
    const deleting = deleteTask(server, 'task-1');
    gate.release();

    const [edited, deleted] = await Promise.all([editing, deleting]);
    assert.equal(edited.status, 200);
    assert.equal(deleted.status, 204);
    await assertFileIsValid(server, 2);
    assertNotFound(await server.request({ path: '/api/tasks/task-1' }));
  });
});

test('two racing deletes of one task give exactly one 204 and one 404', async () => {
  await withServer({ tasks: seedMany(3) }, async (server) => {
    const results = await Promise.all([deleteTask(server, 'task-1'), deleteTask(server, 'task-1')]);
    const statuses = results.map((result) => result.status).sort();
    assert.deepEqual(statuses, [204, 404]);
    assertNotFound(results.find((result) => result.status === 404));
    await assertFileIsValid(server, 2);
  });
});

test('racing status changes keep the first completedAt and a valid file', async () => {
  await withServer({ tasks: seedMany(2) }, async (server) => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        server.request({ method: 'PUT', path: '/api/tasks/task-0/status', json: { status: 'Completed' } }),
      ),
    );
    assert.ok(results.every((result) => result.status === 200));
    assert.equal(new Set(results.map((result) => result.json.completedAt)).size, 1);
    const fileTasks = await assertFileIsValid(server, 2);
    assert.equal(fileTasks.find((task) => task.id === 'task-0').completedAt, results[0].json.completedAt);
  });
});
