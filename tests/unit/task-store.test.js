import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StoreError } from '../../src/domain/errors.js';
import { createTaskRecord } from '../../src/domain/task.js';
import { createTaskStore } from '../../src/storage/task-store.js';

const NOW = new Date('2026-11-05T11:59:00.000Z');
let idCounter = 0;
const nextId = () => `id-${++idCounter}`;
const baseFields = { title: 'Buy milk', description: '', priority: 'Medium', dueDate: '2026-11-06' };

function storedTask(overrides = {}) {
  return { ...createTaskRecord(baseFields, () => NOW, nextId), ...overrides };
}

function completedTask(overrides = {}) {
  return storedTask({ status: 'Completed', completedAt: '2026-11-05T12:30:00.000Z', ...overrides });
}

const fileContent = (tasks, version = 1) => JSON.stringify({ version, tasks }, null, 2);

const directories = [];
let dataDir;
let filePath;

beforeEach(async () => {
  dataDir = await fsPromises.mkdtemp(join(tmpdir(), 'todo-store-'));
  directories.push(dataDir);
  filePath = join(dataDir, 'tasks.json');
});

after(async () => {
  for (const directory of directories) await fsPromises.rm(directory, { recursive: true, force: true });
});

const writeDataFile = (text) => fsPromises.writeFile(filePath, text, 'utf8');
const readDataFile = () => fsPromises.readFile(filePath, 'utf8');

async function assertStoreError(promise, code, messagePart) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof StoreError);
    assert.equal(error.code, code);
    if (messagePart) assert.ok(error.message.includes(messagePart), error.message);
    return true;
  });
}

// ---- happy path ----

test('createTaskStore needs a file path', () => {
  assert.throws(() => createTaskStore({}), TypeError);
  assert.throws(() => createTaskStore({ filePath: '' }), TypeError);
});

test('a valid file loads, keeps creation order and exposes the path', async () => {
  const first = storedTask({ title: 'First' });
  const second = completedTask({ title: 'Second' });
  await writeDataFile(fileContent([first, second]));
  const store = createTaskStore({ filePath });

  const tasks = await store.readAll();

  assert.deepEqual(tasks, [first, second]);
  assert.equal(store.filePath, filePath);
  assert.deepEqual(await store.initialize(), { firstRun: false });
});

test('loaded tasks cannot be changed by callers', async () => {
  await writeDataFile(fileContent([storedTask()]));
  const tasks = await createTaskStore({ filePath }).readAll();

  assert.throws(() => tasks.push({}), TypeError);
  assert.throws(() => {
    tasks[0].title = 'Changed';
  }, TypeError);
});

test('a task with an emoji title, a null due date and a 500 character description loads', async () => {
  const task = storedTask({ title: '😀'.repeat(100), dueDate: null, description: 'd'.repeat(500) });
  await writeDataFile(fileContent([task]));

  assert.deepEqual(await createTaskStore({ filePath }).readAll(), [task]);
});

test('an existing task with a past due date still loads (past-date rule is not applied)', async () => {
  await writeDataFile(fileContent([storedTask({ dueDate: '2020-01-01' })]));

  assert.equal((await createTaskStore({ filePath }).readAll()).length, 1);
});

// ---- first run ----

test('a missing file is a first run: directory and empty store are created', async () => {
  const nestedPath = join(dataDir, 'nested', 'deeper', 'tasks.json');
  const store = createTaskStore({ filePath: nestedPath });

  assert.deepEqual(await store.initialize(), { firstRun: true });

  assert.deepEqual(await store.readAll(), []);
  assert.deepEqual(JSON.parse(await fsPromises.readFile(nestedPath, 'utf8')), { version: 1, tasks: [] });
});

test('two parallel first calls create the empty file once', async () => {
  const store = createTaskStore({ filePath });

  const [first, second] = await Promise.all([store.readAll(), store.readAll()]);

  assert.deepEqual(first, []);
  assert.equal(first, second);
});

test('a second start on the created file is not a first run', async () => {
  await createTaskStore({ filePath }).initialize();

  assert.deepEqual(await createTaskStore({ filePath }).initialize(), { firstRun: false });
});

test('a stale temp file next to the data file is deleted at start', async () => {
  await writeDataFile(fileContent([]));
  await fsPromises.writeFile(`${filePath}.tmp`, 'half written', 'utf8');

  await createTaskStore({ filePath }).readAll();

  assert.deepEqual(await fsPromises.readdir(dataDir), ['tasks.json']);
});

// ---- load check failures ----

const corruptCases = [
  ['invalid JSON', () => '{ "version": 1, "tasks": ['],
  ['empty file', () => ''],
  ['root is an array', () => '[]'],
  ['root is null', () => 'null'],
  ['version 2', () => fileContent([], 2)],
  ['missing version', () => JSON.stringify({ tasks: [] })],
  ['missing tasks', () => JSON.stringify({ version: 1 })],
  ['tasks is not a list', () => JSON.stringify({ version: 1, tasks: {} })],
  ['task is not an object', () => fileContent(['text'])],
  ['task is null', () => fileContent([null])],
  ['extra task key', () => fileContent([{ ...storedTask(), extra: true }])],
  ['missing task key', () => fileContent([(({ priority, ...rest }) => rest)(storedTask())])],
  ['duplicate id', () => fileContent([storedTask({ id: 'same' }), storedTask({ id: 'same' })])],
  ['empty id', () => fileContent([storedTask({ id: '' })])],
  ['numeric id', () => fileContent([storedTask({ id: 7 })])],
  ['Open task with completedAt', () => fileContent([storedTask({ completedAt: '2026-11-05T12:00:00.000Z' })])],
  ['Completed task without completedAt', () => fileContent([completedTask({ completedAt: null })])],
  ['Completed task with bad completedAt', () => fileContent([completedTask({ completedAt: 'yesterday' })])],
  ['bad due date', () => fileContent([storedTask({ dueDate: '2026-02-30' })])],
  ['empty due date string', () => fileContent([storedTask({ dueDate: '' })])],
  ['bad createdAt', () => fileContent([storedTask({ createdAt: '2026-11-05' })])],
  ['createdAt with an impossible date', () => fileContent([storedTask({ createdAt: '2026-02-30T10:00:00.000Z' })])],
  ['createdAt with an impossible time', () => fileContent([storedTask({ createdAt: '2026-11-05T25:00:00.000Z' })])],
  ['title over 100 characters', () => fileContent([storedTask({ title: 'a'.repeat(101) })])],
  ['blank title', () => fileContent([storedTask({ title: '   ' })])],
  ['description over 500 characters', () => fileContent([storedTask({ description: 'd'.repeat(501) })])],
  ['unknown priority', () => fileContent([storedTask({ priority: 'Urgent' })])],
  ['unknown status', () => fileContent([storedTask({ status: 'Done' })])],
  ['title is not a string', () => fileContent([storedTask({ title: 5 })])],
];

for (const [name, buildContent] of corruptCases) {
  test(`load check: ${name} marks the store corrupt and leaves the file unchanged`, async () => {
    const content = buildContent();
    await writeDataFile(content);
    const store = createTaskStore({ filePath });

    await assertStoreError(store.readAll(), 'STORE_CORRUPT', filePath);

    assert.equal(await readDataFile(), content);
  });
}

test('the corrupt message names the file, says it was not changed and never contains task text', async () => {
  await writeDataFile(fileContent([storedTask({ title: 'Secret plan', priority: 'Urgent' })]));

  await assert.rejects(createTaskStore({ filePath }).readAll(), (error) => {
    assert.match(error.message, /cannot be read/);
    assert.match(error.message, /It was not changed/);
    assert.ok(!error.message.includes('Secret plan'));
    return true;
  });
});

test('initialize reports a corrupt store instead of creating a new file', async () => {
  await writeDataFile('not json');

  await assertStoreError(createTaskStore({ filePath }).initialize(), 'STORE_CORRUPT');

  assert.equal(await readDataFile(), 'not json');
});

// ---- unreadable file ----

function fakeFs(overrides) {
  return { ...fsPromises, ...overrides };
}

function errorWithCode(code) {
  return Object.assign(new Error(`${code}: simulated`), { code });
}

test('a permission error on read gives STORE_CORRUPT with the "cannot be opened" message', async () => {
  await writeDataFile(fileContent([]));
  const fs = fakeFs({ readFile: async () => Promise.reject(errorWithCode('EACCES')) });

  await assertStoreError(createTaskStore({ filePath, fs }).readAll(), 'STORE_CORRUPT', 'cannot be opened');
  assert.equal(await readDataFile(), fileContent([]));
});

test('a path that is a directory gives STORE_CORRUPT as unreadable', async () => {
  await fsPromises.mkdir(filePath);

  await assertStoreError(createTaskStore({ filePath }).readAll(), 'STORE_CORRUPT', 'cannot be opened');
});

test('failing to create the data directory gives STORE_CORRUPT as unreadable', async () => {
  const fs = fakeFs({ mkdir: async () => Promise.reject(errorWithCode('EACCES')) });

  await assertStoreError(createTaskStore({ filePath, fs }).readAll(), 'STORE_CORRUPT', 'cannot be opened');
});

test('failing to create the first-run file gives STORE_CORRUPT as unreadable', async () => {
  const fs = fakeFs({ writeFile: async () => Promise.reject(errorWithCode('EACCES')) });

  await assertStoreError(createTaskStore({ filePath, fs }).readAll(), 'STORE_CORRUPT', 'cannot be opened');
});

// ---- retry while corrupt ----

test('while corrupt every call loads the file again, so a repaired file works without a restart', async () => {
  await writeDataFile('broken');
  const store = createTaskStore({ filePath });
  await assertStoreError(store.readAll(), 'STORE_CORRUPT');
  await assertStoreError(store.readAll(), 'STORE_CORRUPT');

  const task = storedTask();
  await writeDataFile(fileContent([task]));

  assert.deepEqual(await store.readAll(), [task]);
});

test('once loaded, reads come from memory and do not read the file again', async () => {
  const task = storedTask();
  await writeDataFile(fileContent([task]));
  let reads = 0;
  const fs = fakeFs({
    readFile: async (...args) => {
      reads += 1;
      return fsPromises.readFile(...args);
    },
  });
  const store = createTaskStore({ filePath, fs });

  await store.readAll();
  await store.readAll();

  assert.equal(reads, 1);
});
