import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fsPromises from 'node:fs/promises';
import net from 'node:net';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StartupError, main, startServer } from '../../src/server.js';
import { createTempDirectory, sendRequest } from '../helpers/start-test-server.js';

const SERVER_FILE = resolve(fileURLToPath(import.meta.url), '..', '..', '..', 'src', 'server.js');
const NOW = new Date(2026, 10, 5, 12, 0, 0);

function createRecorder() {
  const lines = { out: [], err: [] };
  return {
    lines,
    log: (line) => lines.out.push(line),
    logError: (line) => lines.err.push(line),
  };
}

async function withRunningServer(action, { dataFile, recorder = createRecorder(), ...options } = {}) {
  const temp = await createTempDirectory('todo-startup-');
  const file = dataFile ?? join(temp.directory, 'nested', 'tasks.json');
  const running = await startServer({
    config: { port: 0, dataFile: file },
    log: recorder.log,
    logError: recorder.logError,
    ...options,
  });
  try {
    return await action({ ...running, dataFile: file, recorder, directory: temp.directory });
  } finally {
    await running.close();
    await temp.remove();
  }
}

function occupyPort() {
  return new Promise((resolvePort, reject) => {
    const blocker = net.createServer();
    blocker.once('error', reject);
    blocker.listen(0, '127.0.0.1', () => {
      resolvePort({
        port: blocker.address().port,
        release: () => new Promise((done) => blocker.close(done)),
      });
    });
  });
}

async function findFreePort() {
  const blocker = await occupyPort();
  await blocker.release();
  return blocker.port;
}

function runServerProcess(env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [SERVER_FILE], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('exit', (code) => resolveRun({ code, stdout, stderr }));
  });
}

const nonEmptyLines = (text) => text.split(/\r?\n/).filter((line) => line !== '');

// ---- in-process start ----

test('the server listens on 127.0.0.1 only', async () => {
  await withRunningServer(async ({ server, port }) => {
    assert.equal(server.address().address, '127.0.0.1');
    assert.equal(server.address().port, port);

    const external = Object.values(networkInterfaces())
      .flat()
      .find((entry) => entry && entry.family === 'IPv4' && !entry.internal);
    if (!external) return;
    const reachable = await new Promise((resolveProbe) => {
      const socket = net.connect({ host: external.address, port, timeout: 1000 });
      socket.once('connect', () => {
        socket.destroy();
        resolveProbe(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolveProbe(false);
      });
      socket.once('error', () => resolveProbe(false));
    });
    assert.equal(reachable, false, 'the server must not answer on a non-loopback address');
  });
});

test('a first run creates the file and prints one line with the full data file path', async () => {
  const recorder = createRecorder();
  await withRunningServer(
    async ({ dataFile }) => {
      const pathLines = recorder.lines.out.filter((line) => line.includes(dataFile));
      assert.equal(pathLines.length, 1);
      assert.deepEqual(JSON.parse(await fsPromises.readFile(dataFile, 'utf8')), { version: 1, tasks: [] });
      assert.deepEqual(recorder.lines.err, []);
    },
    { recorder },
  );
});

test('a start on an existing file does not print the first-run line', async () => {
  const temp = await createTempDirectory('todo-startup-');
  try {
    const dataFile = join(temp.directory, 'tasks.json');
    await withRunningServer(async () => {}, { dataFile });
    const recorder = createRecorder();
    await withRunningServer(
      async () => {
        assert.equal(recorder.lines.out.filter((line) => line.includes(dataFile)).length, 0);
        assert.equal(recorder.lines.out.length, 1);
        assert.match(recorder.lines.out[0], /^To Do is running at http:\/\/127\.0\.0\.1:\d+$/);
      },
      { dataFile, recorder },
    );
  } finally {
    await temp.remove();
  }
});

test('the wired app serves the API, with the injected clock and id function', async () => {
  let counter = 0;
  await withRunningServer(
    async ({ port }) => {
      const created = await sendRequest(port, { method: 'POST', path: '/api/tasks', json: { title: 'Wired' } });
      assert.equal(created.status, 201);
      assert.equal(created.json.id, 'id-1');
      assert.equal(created.json.createdAt, NOW.toISOString());

      const listed = await sendRequest(port, { path: '/api/tasks' });
      assert.deepEqual(
        listed.json.tasks.map((task) => task.title),
        ['Wired'],
      );
      assert.equal(listed.json.total, 1);
    },
    { clock: () => new Date(NOW), newId: () => `id-${++counter}` },
  );
});

test('the wired app serves the UI files from the given directory', async () => {
  const site = await createTempDirectory('todo-startup-public-');
  try {
    await fsPromises.writeFile(join(site.directory, 'index.html'), '<title>To Do</title>');
    await withRunningServer(
      async ({ port }) => {
        const page = await sendRequest(port, { path: '/' });
        assert.equal(page.status, 200);
        assert.equal(page.text, '<title>To Do</title>');
        assert.ok(page.headers['content-security-policy']);
      },
      { publicDirectory: site.directory },
    );
  } finally {
    await site.remove();
  }
});

test('a corrupt data file does not stop the server; it answers STORE_CORRUPT and the file is untouched', async () => {
  const temp = await createTempDirectory('todo-startup-');
  try {
    const dataFile = join(temp.directory, 'tasks.json');
    await fsPromises.writeFile(dataFile, '{ definitely not json');
    const recorder = createRecorder();
    await withRunningServer(
      async ({ port }) => {
        const result = await sendRequest(port, { path: '/api/tasks' });
        assert.equal(result.status, 500);
        assert.equal(result.json.error.code, 'STORE_CORRUPT');
        assert.ok(result.json.error.message.includes(dataFile));
        assert.equal(await fsPromises.readFile(dataFile, 'utf8'), '{ definitely not json');
        assert.equal(recorder.lines.err.length >= 1, true);
        assert.match(recorder.lines.err[0], /^STORE_CORRUPT: Your task file cannot be read: /);
        assert.ok(!recorder.lines.err.join('\n').includes('definitely not json'));
      },
      { dataFile, recorder },
    );
  } finally {
    await temp.remove();
  }
});

test('close() stops the listener', async () => {
  const temp = await createTempDirectory('todo-startup-');
  try {
    const running = await startServer({
      config: { port: 0, dataFile: join(temp.directory, 'tasks.json') },
      log: () => {},
      logError: () => {},
    });
    await running.close();
    await assert.rejects(sendRequest(running.port, { path: '/api/tasks' }), { code: 'ECONNREFUSED' });
  } finally {
    await temp.remove();
  }
});

test('a port that is in use rejects with the one-line message', async () => {
  const blocker = await occupyPort();
  const temp = await createTempDirectory('todo-startup-');
  try {
    const recorder = createRecorder();
    await assert.rejects(
      startServer({
        config: { port: blocker.port, dataFile: join(temp.directory, 'tasks.json') },
        log: recorder.log,
        logError: recorder.logError,
      }),
      (error) => {
        assert.ok(error instanceof StartupError);
        assert.equal(error.message, `Port ${blocker.port} is already in use. Set PORT to another value.`);
        return true;
      },
    );
    assert.deepEqual(recorder.lines.out, []);
  } finally {
    await blocker.release();
    await temp.remove();
  }
});

test('main prints one line and exits with code 1 when the port is in use', async () => {
  const blocker = await occupyPort();
  const temp = await createTempDirectory('todo-startup-');
  try {
    const recorder = createRecorder();
    const exits = [];
    await main({
      env: { PORT: String(blocker.port), TODO_DATA_FILE: join(temp.directory, 'tasks.json') },
      logError: recorder.logError,
      exit: (code) => exits.push(code),
    });
    assert.deepEqual(exits, [1]);
    assert.deepEqual(recorder.lines.err, [`Port ${blocker.port} is already in use. Set PORT to another value.`]);
  } finally {
    await blocker.release();
    await temp.remove();
  }
});

test('main reports an invalid PORT in one line and exits with code 1', async () => {
  const recorder = createRecorder();
  const exits = [];
  await main({ env: { PORT: 'not-a-port' }, logError: recorder.logError, exit: (code) => exits.push(code) });
  assert.deepEqual(exits, [1]);
  assert.deepEqual(recorder.lines.err, ['PORT must be a whole number from 1 to 65535.']);
});

// ---- real child process ----

test('running src/server.js with a port in use prints one line and exits with code 1', { timeout: 30000 }, async () => {
  const blocker = await occupyPort();
  const temp = await createTempDirectory('todo-startup-');
  try {
    const result = await runServerProcess({
      PORT: String(blocker.port),
      TODO_DATA_FILE: join(temp.directory, 'tasks.json'),
    });
    assert.equal(result.code, 1);
    assert.deepEqual(nonEmptyLines(result.stderr), [`Port ${blocker.port} is already in use. Set PORT to another value.`]);
    assert.deepEqual(nonEmptyLines(result.stdout), []);
    assert.ok(!result.stderr.includes('    at '), 'no stack trace');
  } finally {
    await blocker.release();
    await temp.remove();
  }
});

test('running src/server.js with an invalid PORT exits with code 1 and one line', { timeout: 30000 }, async () => {
  const temp = await createTempDirectory('todo-startup-');
  try {
    const result = await runServerProcess({ PORT: '99999', TODO_DATA_FILE: join(temp.directory, 'tasks.json') });
    assert.equal(result.code, 1);
    assert.deepEqual(nonEmptyLines(result.stderr), ['PORT must be a whole number from 1 to 65535.']);
  } finally {
    await temp.remove();
  }
});

test('running src/server.js starts the server on PORT and TODO_DATA_FILE', { timeout: 30000 }, async () => {
  const temp = await createTempDirectory('todo-startup-');
  const port = await findFreePort();
  const dataFile = join(temp.directory, 'child', 'tasks.json');
  const child = spawn(process.execPath, [SERVER_FILE], {
    env: { ...process.env, PORT: String(port), TODO_DATA_FILE: dataFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const output = await new Promise((resolveOutput, reject) => {
      let text = '';
      child.stdout.on('data', (chunk) => {
        text += chunk;
        if (text.includes('To Do is running at')) resolveOutput(text);
      });
      child.once('exit', (code) => reject(new Error(`server exited early with code ${code}`)));
    });
    assert.ok(output.includes(dataFile), 'first-run line has the data file path');
    assert.ok(output.includes(`http://127.0.0.1:${port}`));

    const result = await sendRequest(port, { path: '/api/tasks' });
    assert.deepEqual(result.json, { tasks: [], total: 0 });
  } finally {
    child.kill();
    await new Promise((resolveExit) => (child.exitCode === null ? child.once('exit', resolveExit) : resolveExit()));
    await temp.remove();
  }
});
