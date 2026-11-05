import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, DEFAULT_DATA_FILE, DEFAULT_PORT, loadConfig } from '../../src/config.js';

const projectRoot = resolve(fileURLToPath(import.meta.url), '..', '..', '..');

async function inWorkingDirectory(directory, action) {
  const previous = process.cwd();
  process.chdir(directory);
  try {
    return await action();
  } finally {
    process.chdir(previous);
  }
}

test('defaults are port 3000 and the data file under the project root', () => {
  const config = loadConfig({});
  assert.equal(config.port, DEFAULT_PORT);
  assert.equal(config.port, 3000);
  assert.equal(config.dataFile, join(projectRoot, 'data', 'tasks.json'));
});

test('the default data file does not depend on the working directory', async () => {
  const elsewhere = await fsPromises.mkdtemp(join(tmpdir(), 'todo-config-'));
  try {
    const config = await inWorkingDirectory(elsewhere, () => loadConfig({}));
    assert.equal(config.dataFile, DEFAULT_DATA_FILE);
    assert.equal(config.dataFile, join(projectRoot, 'data', 'tasks.json'));
  } finally {
    await fsPromises.rm(elsewhere, { recursive: true, force: true });
  }
});

test('PORT and TODO_DATA_FILE override the defaults', () => {
  const dataFile = join(tmpdir(), 'custom-tasks.json');
  const config = loadConfig({ PORT: '8080', TODO_DATA_FILE: dataFile });
  assert.equal(config.port, 8080);
  assert.equal(config.dataFile, dataFile);
});

test('a relative TODO_DATA_FILE becomes a full path', () => {
  const config = loadConfig({ TODO_DATA_FILE: 'my-data/tasks.json' });
  assert.equal(config.dataFile, resolve('my-data', 'tasks.json'));
});

test('empty or blank values count as not set', () => {
  const config = loadConfig({ PORT: '', TODO_DATA_FILE: '   ' });
  assert.equal(config.port, DEFAULT_PORT);
  assert.equal(config.dataFile, DEFAULT_DATA_FILE);
});

test('the lowest and highest ports are accepted', () => {
  assert.equal(loadConfig({ PORT: '1' }).port, 1);
  assert.equal(loadConfig({ PORT: '65535' }).port, 65535);
  assert.equal(loadConfig({ PORT: ' 3001 ' }).port, 3001);
});

test('an invalid PORT gives a clear error that does not echo the value', () => {
  for (const bad of ['abc', '0', '65536', '-1', '3.5', '80a', '1e3', '0x50', '999999']) {
    assert.throws(
      () => loadConfig({ PORT: bad }),
      (error) => {
        assert.ok(error instanceof ConfigError);
        assert.equal(error.message, 'PORT must be a whole number from 1 to 65535.');
        return true;
      },
      `PORT=${bad}`,
    );
  }
});

test('a TODO_DATA_FILE with a NUL character is rejected', () => {
  assert.throws(() => loadConfig({ TODO_DATA_FILE: 'data\0.json' }), ConfigError);
});

test('no .env file is read', async () => {
  const directory = await fsPromises.mkdtemp(join(tmpdir(), 'todo-config-env-'));
  try {
    await fsPromises.writeFile(join(directory, '.env'), 'PORT=4444\nTODO_DATA_FILE=from-dotenv.json\n');
    const config = await inWorkingDirectory(directory, () => loadConfig({}));
    assert.equal(config.port, DEFAULT_PORT);
    assert.equal(config.dataFile, DEFAULT_DATA_FILE);
  } finally {
    await fsPromises.rm(directory, { recursive: true, force: true });
  }
});
