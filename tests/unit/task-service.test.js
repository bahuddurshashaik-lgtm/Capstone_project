import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundError, StoreError, ValidationError } from '../../src/domain/errors.js';
import { createTaskRecord } from '../../src/domain/task.js';
import { createTaskService } from '../../src/services/task-service.js';

// ---- test doubles ----

function createMemoryStore(initialTasks = []) {
  const freezeList = (list) => Object.freeze(list.map((task) => Object.freeze({ ...task })));
  let tasks = freezeList(initialTasks);
  let queue = Promise.resolve();
  const store = {
    writes: 0,
    snapshot: () => tasks,
    readAll: async () => tasks,
    mutate(change) {
      const run = queue.then(async () => {
        const outcome = await change(tasks);
        if (outcome.tasks !== tasks) {
          tasks = freezeList(outcome.tasks);
          store.writes += 1;
        }
        return outcome.result;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
  return store;
}

function createClock(start) {
  let current = start;
  const clock = () => new Date(current);
  clock.set = (value) => {
    current = value;
  };
  return clock;
}

const at = (year, month, day, hour = 12, minute = 0) => new Date(year, month - 1, day, hour, minute);

function setup({ tasks = [], now = at(2026, 11, 5) } = {}) {
  const store = createMemoryStore(tasks);
  const clock = createClock(now);
  let counter = 0;
  const service = createTaskService({ store, clock, newId: () => `id-${++counter}` });
  return { store, clock, service };
}

const goodInput = { title: 'Buy milk', description: 'two litres', priority: 'High', dueDate: '2026-11-06' };

function seedTask(overrides = {}) {
  const base = createTaskRecord(
    { title: 'Seed', description: '', priority: 'Medium', dueDate: null },
    () => at(2026, 11, 1),
    () => `seed-${Math.random()}`,
  );
  return { ...base, ...overrides };
}

async function captureError(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return assert.fail('Expected the promise to reject.');
}

// ---- createTask ----

test('createTask returns the new Open task with an id, createdAt and the overdue flag', async () => {
  const { service, clock } = setup();

  const task = await service.createTask(goodInput);

  assert.equal(task.id, 'id-1');
  assert.equal(task.title, 'Buy milk');
  assert.equal(task.description, 'two litres');
  assert.equal(task.priority, 'High');
  assert.equal(task.dueDate, '2026-11-06');
  assert.equal(task.status, 'Open');
  assert.equal(task.completedAt, null);
  assert.equal(task.createdAt, clock().toISOString());
  assert.equal(task.overdue, false);
});

test('createTask stores the task without the overdue flag', async () => {
  const { service, store } = setup();

  await service.createTask(goodInput);

  const [stored] = store.snapshot();
  assert.equal(stored.id, 'id-1');
  assert.ok(!('overdue' in stored));
  assert.equal(store.writes, 1);
});

test('createTask applies the defaults: trimmed title, Medium priority, empty description, no due date', async () => {
  const { service } = setup();

  const task = await service.createTask({ title: '  Plain  ' });

  assert.equal(task.title, 'Plain');
  assert.equal(task.priority, 'Medium');
  assert.equal(task.description, '');
  assert.equal(task.dueDate, null);
});

test('createTask accepts a due date of today and a title of 100 characters', async () => {
  const { service } = setup();

  const task = await service.createTask({ title: 'a'.repeat(100), dueDate: '2026-11-05' });

  assert.equal(task.dueDate, '2026-11-05');
  assert.equal(task.overdue, false);
});

test('createTask gives each task its own id', async () => {
  const { service } = setup();

  const first = await service.createTask(goodInput);
  const second = await service.createTask(goodInput);

  assert.notEqual(first.id, second.id);
});

test('createTask without an injected id function uses a UUID', async () => {
  const store = createMemoryStore();
  const service = createTaskService({ store });

  const task = await service.createTask(goodInput);

  assert.match(task.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('createTask with an invalid title raises ValidationError and writes nothing', async () => {
  const { service, store } = setup();

  const error = await captureError(service.createTask({ ...goodInput, title: '   ' }));

  assert.ok(error instanceof ValidationError);
  assert.deepEqual(Object.keys(error.fields), ['title']);
  assert.equal(store.writes, 0);
  assert.equal(store.snapshot().length, 0);
});

test('createTask reports every invalid field together', async () => {
  const { service, store } = setup();

  const error = await captureError(
    service.createTask({
      title: 'a'.repeat(101),
      description: 'd'.repeat(501),
      priority: 'Urgent',
      dueDate: '2026-11-04',
      extra: 1,
    }),
  );

  assert.deepEqual(Object.keys(error.fields).sort(), ['description', 'dueDate', 'extra', 'priority', 'title']);
  assert.equal(store.writes, 0);
});

test('createTask rejects a due date in the past and uses the injected clock for "today"', async () => {
  const { service, clock } = setup();
  const yesterday = await captureError(service.createTask({ ...goodInput, dueDate: '2026-11-04' }));
  assert.equal(yesterday.fields.dueDate, 'Due date cannot be in the past.');

  clock.set(at(2026, 11, 4));
  const task = await service.createTask({ ...goodInput, dueDate: '2026-11-04' });
  assert.equal(task.dueDate, '2026-11-04');
});

test('createTask rejects a body that is not an object', async () => {
  const { service, store } = setup();

  for (const body of [null, undefined, 'text', 7, []]) {
    const error = await captureError(service.createTask(body));
    assert.ok(error instanceof ValidationError);
  }
  assert.equal(store.writes, 0);
});

test('createTask passes a store failure on unchanged', async () => {
  const failure = new StoreError('STORE_WRITE_FAILED', 'Your change could not be saved.');
  const store = { readAll: async () => [], mutate: async () => Promise.reject(failure) };
  const service = createTaskService({ store, clock: createClock(at(2026, 11, 5)) });

  assert.equal(await captureError(service.createTask(goodInput)), failure);
});

// ---- listTasks ----

test('listTasks on an empty store returns an empty list and total 0', async () => {
  const { service } = setup();

  assert.deepEqual(await service.listTasks(), { tasks: [], total: 0 });
});

test('listTasks returns the newest created task first and the overdue flag on every task', async () => {
  const { service } = setup();
  await service.createTask({ ...goodInput, title: 'First' });
  await service.createTask({ ...goodInput, title: 'Second' });
  await service.createTask({ ...goodInput, title: 'Third' });

  const { tasks, total } = await service.listTasks();

  assert.deepEqual(tasks.map((task) => task.title), ['Third', 'Second', 'First']);
  assert.equal(total, 3);
  assert.ok(tasks.every((task) => task.overdue === false));
});

test('listTasks combines status, priority and overdue filters with AND', async () => {
  const tasks = [
    seedTask({ id: 'a', priority: 'High', dueDate: '2026-11-01' }),
    seedTask({ id: 'b', priority: 'Low', dueDate: '2026-11-01' }),
    seedTask({ id: 'c', priority: 'High', dueDate: '2026-11-09' }),
    seedTask({ id: 'd', priority: 'High', dueDate: '2026-11-01', status: 'Completed', completedAt: '2026-11-02T10:00:00.000Z' }),
  ];
  const { service } = setup({ tasks });

  const overdue = await service.listTasks(new URLSearchParams('overdue=true'));
  assert.deepEqual(overdue.tasks.map((task) => task.id), ['b', 'a']);

  const overdueHigh = await service.listTasks(new URLSearchParams('overdue=true&priority=High'));
  assert.deepEqual(overdueHigh.tasks.map((task) => task.id), ['a']);

  const completed = await service.listTasks(new URLSearchParams('status=Completed'));
  assert.deepEqual(completed.tasks.map((task) => [task.id, task.overdue]), [['d', false]]);

  const none = await service.listTasks(new URLSearchParams('status=Completed&priority=Low'));
  assert.deepEqual(none.tasks, []);
});

test('listTasks total ignores the filters', async () => {
  const { service } = setup({ tasks: [seedTask({ id: 'a' }), seedTask({ id: 'b', priority: 'High' })] });

  const result = await service.listTasks(new URLSearchParams('priority=High'));

  assert.equal(result.tasks.length, 1);
  assert.equal(result.total, 2);
});

test('listTasks treats an empty filter value as not set', async () => {
  const { service } = setup({ tasks: [seedTask({ id: 'a' }), seedTask({ id: 'b' })] });

  const result = await service.listTasks(new URLSearchParams('status=&priority=&overdue='));

  assert.equal(result.tasks.length, 2);
});

test('listTasks rejects invalid filters with ValidationError', async () => {
  const { service } = setup();

  for (const query of ['status=Done', 'priority=Urgent', 'overdue=false', 'status=Open&status=Completed', 'color=red']) {
    const error = await captureError(service.listTasks(new URLSearchParams(query)));
    assert.ok(error instanceof ValidationError, query);
  }
});

test('listTasks does not change the stored tasks', async () => {
  const { service, store } = setup({ tasks: [seedTask({ id: 'a' }), seedTask({ id: 'b' })] });

  await service.listTasks();

  assert.deepEqual(store.snapshot().map((task) => task.id), ['a', 'b']);
  assert.equal(store.writes, 0);
});

test('listTasks passes a corrupt store error on unchanged', async () => {
  const failure = new StoreError('STORE_CORRUPT', 'Your task file cannot be read: x.');
  const store = { readAll: async () => Promise.reject(failure), mutate: async () => {} };
  const service = createTaskService({ store });

  assert.equal(await captureError(service.listTasks()), failure);
});

// ---- overdue follows the clock (NFR-11) ----

test('a task due today becomes overdue after midnight without a restart', async () => {
  const { service, clock } = setup({ now: at(2026, 11, 5, 23, 59) });
  const created = await service.createTask({ title: 'Pay rent', dueDate: '2026-11-05' });
  assert.equal(created.overdue, false);

  clock.set(at(2026, 11, 6, 0, 1));

  assert.equal((await service.getTask(created.id)).overdue, true);
  const overdueList = await service.listTasks(new URLSearchParams('overdue=true'));
  assert.deepEqual(overdueList.tasks.map((task) => task.id), [created.id]);
});

test('a Completed task with a past due date is not overdue', async () => {
  const completed = seedTask({
    id: 'done',
    dueDate: '2026-10-01',
    status: 'Completed',
    completedAt: '2026-10-02T10:00:00.000Z',
  });
  const { service } = setup({ tasks: [completed] });

  assert.equal((await service.getTask('done')).overdue, false);
});

// ---- getTask ----

test('getTask returns the task with the overdue flag', async () => {
  const { service } = setup({ tasks: [seedTask({ id: 'a', dueDate: '2026-11-01' })] });

  const task = await service.getTask('a');

  assert.equal(task.id, 'a');
  assert.equal(task.overdue, true);
});

test('getTask of an unknown id raises NotFoundError "Task not found"', async () => {
  const { service } = setup({ tasks: [seedTask({ id: 'a' })] });

  const error = await captureError(service.getTask('missing'));

  assert.ok(error instanceof NotFoundError);
  assert.equal(error.message, 'Task not found');
});

test('getTask with an id that is not a string raises NotFoundError', async () => {
  const { service } = setup({ tasks: [seedTask({ id: 'a' })] });

  for (const id of [undefined, null, 5, {}]) {
    assert.ok((await captureError(service.getTask(id))) instanceof NotFoundError);
  }
});

test('the task returned by getTask is a copy; changing it does not change the store', async () => {
  const { service, store } = setup({ tasks: [seedTask({ id: 'a', title: 'Original' })] });

  const task = await service.getTask('a');
  task.title = 'Changed by caller';

  assert.equal(store.snapshot()[0].title, 'Original');
});
