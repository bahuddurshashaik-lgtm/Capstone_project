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

// Creation order, oldest first. The API returns them newest first: E, D, C, B, A.
const SEEDED_TASKS = [
  seedTask('A', { priority: 'Low', dueDate: '2026-11-04' }),
  seedTask('B', { priority: 'High', dueDate: '2026-11-05' }),
  seedTask('C', { status: 'Completed', completedAt: '2026-11-02T09:00:00.000Z', dueDate: '2026-11-01' }),
  seedTask('D', { priority: 'High', dueDate: '2026-11-03' }),
  seedTask('E', { priority: 'Low' }),
];

async function withServer(action, options = {}) {
  const { now = NOW, ...serverOptions } = options;
  const tasks = 'tasks' in options ? options.tasks : SEEDED_TASKS;
  let current = now;
  const server = await startTestServer({ ...serverOptions, tasks, clock: () => new Date(current) });
  server.setNow = (value) => {
    current = value;
  };
  try {
    return await action(server);
  } finally {
    await server.stop();
  }
}

const list = (server, query = '') => server.request({ path: `/api/tasks${query}` });
const ids = (result) => result.json.tasks.map((task) => task.id);

function assertQueryError(result, fields) {
  assert.equal(result.status, 400);
  assert.equal(result.json.error.code, 'VALIDATION_ERROR');
  assert.deepEqual(result.json.error.fields, fields);
}

test('GET /api/tasks returns 200 with tasks newest first and the unfiltered total', async () => {
  await withServer(async (server) => {
    const result = await list(server);
    assert.equal(result.status, 200);
    assert.match(result.headers['content-type'], /^application\/json/);
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.deepEqual(ids(result), ['E', 'D', 'C', 'B', 'A']);
    assert.equal(result.json.total, 5);
    assert.deepEqual(Object.keys(result.json).sort(), ['tasks', 'total']);
  });
});

test('every task has the stored fields and a boolean overdue flag', async () => {
  await withServer(async (server) => {
    const { tasks } = (await list(server)).json;
    const keys = ['completedAt', 'createdAt', 'description', 'dueDate', 'id', 'overdue', 'priority', 'status', 'title'];
    for (const task of tasks) {
      assert.deepEqual(Object.keys(task).sort(), keys);
      assert.equal(typeof task.overdue, 'boolean');
    }
  });
});

test('overdue is true only for an Open task due before today', async () => {
  await withServer(async (server) => {
    const overdueById = Object.fromEntries((await list(server)).json.tasks.map((task) => [task.id, task.overdue]));
    assert.deepEqual(overdueById, {
      A: true, // open, due yesterday
      B: false, // open, due today
      C: false, // completed, due in the past
      D: true, // open, due three days ago
      E: false, // open, no due date
    });
  });
});

test('each filter alone', async () => {
  await withServer(async (server) => {
    assert.deepEqual(ids(await list(server, '?status=Open')), ['E', 'D', 'B', 'A']);
    assert.deepEqual(ids(await list(server, '?status=Completed')), ['C']);
    assert.deepEqual(ids(await list(server, '?priority=High')), ['D', 'B']);
    assert.deepEqual(ids(await list(server, '?priority=Low')), ['E', 'A']);
    assert.deepEqual(ids(await list(server, '?priority=Medium')), ['C']);
    assert.deepEqual(ids(await list(server, '?overdue=true')), ['D', 'A']);
  });
});

test('filters combine with AND', async () => {
  await withServer(async (server) => {
    assert.deepEqual(ids(await list(server, '?status=Open&priority=High')), ['D', 'B']);
    assert.deepEqual(ids(await list(server, '?priority=High&overdue=true')), ['D']);
    assert.deepEqual(ids(await list(server, '?status=Open&priority=Low&overdue=true')), ['A']);
    assert.deepEqual(ids(await list(server, '?status=Completed&overdue=true')), []);
    assert.deepEqual(ids(await list(server, '?status=Completed&priority=High')), []);
  });
});

test('total ignores filters, so an empty result can be told from an empty store', async () => {
  await withServer(async (server) => {
    const result = await list(server, '?status=Completed&overdue=true');
    assert.equal(result.status, 200);
    assert.deepEqual(result.json, { tasks: [], total: 5 });
  });
});

test('an empty value means the filter is not set', async () => {
  await withServer(async (server) => {
    assert.deepEqual(ids(await list(server, '?status=&priority=&overdue=')), ['E', 'D', 'C', 'B', 'A']);
    assert.deepEqual(ids(await list(server, '?status=Open&priority=')), ['E', 'D', 'B', 'A']);
    assert.deepEqual(ids(await list(server, '?')), ['E', 'D', 'C', 'B', 'A']);
  });
});

test('overdue=false and other overdue values give 400', async () => {
  await withServer(async (server) => {
    for (const value of ['false', 'True', '1', 'yes']) {
      assertQueryError(await list(server, `?overdue=${value}`), { overdue: 'Invalid filter value.' });
    }
  });
});

test('unknown values for status and priority give 400', async () => {
  await withServer(async (server) => {
    assertQueryError(await list(server, '?status=Done'), { status: 'Invalid filter value.' });
    assertQueryError(await list(server, '?status=open'), { status: 'Invalid filter value.' });
    assertQueryError(await list(server, '?priority=Urgent'), { priority: 'Invalid filter value.' });
  });
});

test('a repeated key gives 400, even with equal values', async () => {
  await withServer(async (server) => {
    assertQueryError(await list(server, '?status=Open&status=Completed'), { status: 'Invalid filter value.' });
    assertQueryError(await list(server, '?priority=High&priority=High'), { priority: 'Invalid filter value.' });
    assertQueryError(await list(server, '?overdue=true&overdue=true'), { overdue: 'Invalid filter value.' });
  });
});

test('an unknown key gives 400', async () => {
  await withServer(async (server) => {
    assertQueryError(await list(server, '?sort=title'), { sort: 'Unknown field.' });
    assertQueryError(await list(server, '?status=Open&page=2'), { page: 'Unknown field.' });
  });
});

test('several bad query values are reported together and nothing is filtered', async () => {
  await withServer(async (server) => {
    assertQueryError(await list(server, '?status=Done&overdue=false&x=1'), {
      x: 'Unknown field.',
      status: 'Invalid filter value.',
      overdue: 'Invalid filter value.',
    });
  });
});

test('an empty store gives an empty list and a total of 0', async () => {
  await withServer(
    async (server) => {
      assert.deepEqual((await list(server)).json, { tasks: [], total: 0 });
      assert.deepEqual((await list(server, '?status=Open')).json, { tasks: [], total: 0 });
    },
    { tasks: [] },
  );
});

test('a first run with no data file gives an empty list', async () => {
  await withServer(
    async (server) => {
      assert.deepEqual((await list(server)).json, { tasks: [], total: 0 });
    },
    { tasks: undefined },
  );
});

test('a task due today becomes overdue after midnight without a restart', async () => {
  await withServer(async (server) => {
    const before = (await list(server, '?overdue=true')).json.tasks.map((task) => task.id);
    assert.deepEqual(before, ['D', 'A']);

    server.setNow(new Date(2026, 10, 6, 0, 0, 1));
    const after = (await list(server, '?overdue=true')).json.tasks.map((task) => task.id);
    assert.deepEqual(after, ['D', 'B', 'A']);
  });
});

test('the order is newest created first, also after creating through the API', async () => {
  await withServer(
    async (server) => {
      const body = (title) => ({ method: 'POST', path: '/api/tasks', json: { title } });
      const first = await server.request(body('First'));
      const second = await server.request(body('Second'));
      const third = await server.request(body('Third'));
      assert.deepEqual(ids(await list(server)), [third.json.id, second.json.id, first.json.id]);
    },
    { tasks: [] },
  );
});

test('the order follows creation order, not dates or titles', async () => {
  const tasks = [
    seedTask('old', { title: 'Zebra', createdAt: '2026-11-05T10:00:00.000Z' }),
    seedTask('new', { title: 'Apple', createdAt: '2026-11-05T10:00:00.000Z' }),
  ];
  await withServer(async (server) => assert.deepEqual(ids(await list(server)), ['new', 'old']), { tasks });
});

test('a title with markup comes back as plain JSON text', async () => {
  const tasks = [seedTask('x', { title: '<script>alert(1)</script>' })];
  await withServer(
    async (server) => {
      const result = await list(server);
      assert.equal(result.json.tasks[0].title, '<script>alert(1)</script>');
      assert.match(result.headers['content-type'], /^application\/json/);
      assert.equal(result.headers['x-content-type-options'], 'nosniff');
    },
    { tasks },
  );
});

test('other methods on /api/tasks give 405 with Allow GET, POST', async () => {
  await withServer(async (server) => {
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const result = await server.request({ method, path: '/api/tasks' });
      assert.equal(result.status, 405, method);
      assert.equal(result.json.error.code, 'METHOD_NOT_ALLOWED');
      assert.equal(result.headers.allow, 'GET, POST');
    }
  });
});

test('a corrupt data file gives 500 STORE_CORRUPT, and a repaired file works without a restart', async () => {
  const temp = await createTempDirectory();
  try {
    const dataFile = join(temp.directory, 'tasks.json');
    await fsPromises.writeFile(dataFile, 'not json at all');
    await withServer(
      async (server) => {
        const broken = await list(server);
        assert.equal(broken.status, 500);
        assert.equal(broken.json.error.code, 'STORE_CORRUPT');
        assert.equal(await fsPromises.readFile(dataFile, 'utf8'), 'not json at all');

        await fsPromises.writeFile(dataFile, JSON.stringify({ version: 1, tasks: [seedTask('fixed')] }));
        assert.deepEqual(ids(await list(server)), ['fixed']);
      },
      { dataFile, tasks: undefined },
    );
  } finally {
    await temp.remove();
  }
});
