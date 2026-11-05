import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NETWORK_ERROR_CODE,
  UNEXPECTED_RESPONSE_CODE,
  buildListQuery,
  createApiClient,
} from '../../src/public/api-client.js';
import { startTestServer } from '../helpers/start-test-server.js';

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function recordingFetch(respond) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  return { fetch, calls };
}

const clientWith = (respond, options = {}) => {
  const recorder = recordingFetch(respond);
  return { ...recorder, client: createApiClient({ fetch: recorder.fetch, ...options }) };
};

// ---- success ----

test('a success response returns the data', async () => {
  const { client } = clientWith(() => jsonResponse({ tasks: [], total: 0 }));
  assert.deepEqual(await client.listTasks({}), { ok: true, data: { tasks: [], total: 0 } });
});

test('204 No Content returns ok with null data', async () => {
  const { client, calls } = clientWith(() => new Response(null, { status: 204 }));
  assert.deepEqual(await client.deleteTask('abc'), { ok: true, data: null });
  assert.equal(calls[0].init.method, 'DELETE');
  assert.equal(calls[0].url, '/api/tasks/abc');
});

test('each call uses the right method, path and body', async () => {
  const { client, calls } = clientWith(() => jsonResponse({ id: 'x' }));
  await client.getTask('x');
  await client.createTask({ title: 'A' });
  await client.updateTask('x', { title: 'B' });
  await client.setStatus('x', 'Completed');
  const summary = calls.map(({ url, init }) => [init.method, url, init.body]);
  assert.deepEqual(summary, [
    ['GET', '/api/tasks/x', undefined],
    ['POST', '/api/tasks', '{"title":"A"}'],
    ['PUT', '/api/tasks/x', '{"title":"B"}'],
    ['PUT', '/api/tasks/x/status', '{"status":"Completed"}'],
  ]);
});

test('the task id is encoded in the path, so it cannot change the route', async () => {
  const { client, calls } = clientWith(() => jsonResponse({}));
  await client.getTask('../status?x=1');
  assert.equal(calls[0].url, '/api/tasks/..%2Fstatus%3Fx%3D1');
});

test('the base URL is put in front of the path', async () => {
  const { client, calls } = clientWith(() => jsonResponse({}), { baseUrl: 'http://127.0.0.1:3000' });
  await client.getTask('x');
  assert.equal(calls[0].url, 'http://127.0.0.1:3000/api/tasks/x');
});

// ---- content type ----

test('write calls send Content-Type application/json', async () => {
  const { client, calls } = clientWith(() => jsonResponse({}));
  await client.createTask({ title: 'A' });
  await client.updateTask('x', { title: 'B' });
  await client.setStatus('x', 'Open');
  await client.deleteTask('x');
  for (const { init } of calls) assert.equal(init.headers['Content-Type'], 'application/json', init.method);
});

test('read calls send no body and no content type', async () => {
  const { client, calls } = clientWith(() => jsonResponse({}));
  await client.listTasks({});
  await client.getTask('x');
  for (const { init } of calls) {
    assert.equal(init.body, undefined);
    assert.equal(init.headers, undefined);
  }
});

// ---- filters ----

test('buildListQuery leaves out empty filters and overdue false', () => {
  assert.equal(buildListQuery({}), '');
  assert.equal(buildListQuery(), '');
  assert.equal(buildListQuery({ status: '', priority: '', overdue: false }), '');
});

test('buildListQuery puts the active filters in the query', () => {
  assert.equal(buildListQuery({ status: 'Open' }), '?status=Open');
  assert.equal(
    buildListQuery({ status: 'Open', priority: 'High', overdue: true }),
    '?status=Open&priority=High&overdue=true',
  );
});

test('listTasks sends the filters as a query string', async () => {
  const { client, calls } = clientWith(() => jsonResponse({ tasks: [], total: 0 }));
  await client.listTasks({ priority: 'Low', overdue: true });
  assert.equal(calls[0].url, '/api/tasks?priority=Low&overdue=true');
});

// ---- structured errors ----

test('an error response returns code, message and fields', async () => {
  const body = {
    error: { code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.', fields: { title: 'Enter a title.' } },
  };
  const { client } = clientWith(() => jsonResponse(body, 400));
  assert.deepEqual(await client.createTask({ title: '' }), {
    ok: false,
    error: { code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.', fields: { title: 'Enter a title.' } },
  });
});

test('an error response without fields has fields null', async () => {
  const body = { error: { code: 'NOT_FOUND', message: 'Task not found' } };
  const { client } = clientWith(() => jsonResponse(body, 404));
  assert.deepEqual(await client.getTask('gone'), {
    ok: false,
    error: { code: 'NOT_FOUND', message: 'Task not found', fields: null },
  });
});

test('a network failure returns a generic error and does not throw', async () => {
  const client = createApiClient({
    fetch: async () => {
      throw new TypeError('fetch failed');
    },
  });
  const result = await client.listTasks({});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, NETWORK_ERROR_CODE);
  assert.equal(result.error.fields, null);
  assert.doesNotMatch(result.error.message, /fetch failed/);
});

test('an error answer that is not JSON gives an unexpected-response error', async () => {
  const { client } = clientWith(() => new Response('<html>Bad gateway</html>', { status: 502 }));
  const result = await client.listTasks({});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, UNEXPECTED_RESPONSE_CODE);
});

test('an error JSON without a code and message gives an unexpected-response error', async () => {
  const { client } = clientWith(() => jsonResponse({ error: 'boom' }, 500));
  assert.equal((await client.listTasks({})).error.code, UNEXPECTED_RESPONSE_CODE);
});

test('a success answer that is not JSON gives an unexpected-response error', async () => {
  const { client } = clientWith(() => new Response('not json', { status: 200 }));
  assert.equal((await client.getTask('x')).error.code, UNEXPECTED_RESPONSE_CODE);
});

test('the default fetch is the global fetch', async () => {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(url);
    return jsonResponse({ tasks: [], total: 0 });
  };
  try {
    assert.equal((await createApiClient().listTasks({})).ok, true);
  } finally {
    globalThis.fetch = original;
  }
  assert.deepEqual(seen, ['/api/tasks']);
});

// ---- against the real server ----

async function withServer(action) {
  const server = await startTestServer();
  try {
    return await action(server, createApiClient({ baseUrl: server.baseUrl }));
  } finally {
    await server.stop();
  }
}

test('the client works against the real API: create, list, edit, toggle, delete', async () => {
  await withServer(async (_server, client) => {
    const created = await client.createTask({ title: 'Buy milk', description: '', priority: 'High', dueDate: '2999-12-31' });
    assert.equal(created.ok, true);
    const id = created.data.id;

    const listed = await client.listTasks({ priority: 'High' });
    assert.deepEqual(listed.data.tasks.map((task) => task.id), [id]);
    assert.equal(listed.data.total, 1);

    const edited = await client.updateTask(id, { title: 'Buy oat milk', description: 'x', priority: 'Low', dueDate: null });
    assert.equal(edited.data.title, 'Buy oat milk');

    const completed = await client.setStatus(id, 'Completed');
    assert.equal(completed.data.status, 'Completed');
    assert.equal(typeof completed.data.completedAt, 'string');

    assert.deepEqual(await client.deleteTask(id), { ok: true, data: null });
    assert.equal((await client.listTasks({})).data.total, 0);
  });
});

test('the real API: validation errors carry fields', async () => {
  await withServer(async (_server, client) => {
    const result = await client.createTask({ title: '   ', dueDate: '2000-01-01' });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'VALIDATION_ERROR');
    assert.equal(result.error.fields.title, 'Enter a title.');
    assert.equal(result.error.fields.dueDate, 'Due date cannot be in the past.');
  });
});

test('the real API: Task not found for get, edit, status and delete', async () => {
  await withServer(async (_server, client) => {
    const missing = 'does-not-exist';
    const results = [
      await client.getTask(missing),
      await client.updateTask(missing, { title: 'A', description: '', priority: 'Low', dueDate: null }),
      await client.setStatus(missing, 'Completed'),
      await client.deleteTask(missing),
    ];
    for (const result of results) {
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'NOT_FOUND');
      assert.equal(result.error.message, 'Task not found');
    }
  });
});

test('the real API: a corrupt store gives STORE_CORRUPT with the server message', async () => {
  const server = await startTestServer({ tasks: [{ not: 'a task' }] });
  try {
    const result = await createApiClient({ baseUrl: server.baseUrl }).listTasks({});
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'STORE_CORRUPT');
    assert.match(result.error.message, /cannot be read/);
  } finally {
    await server.stop();
  }
});
