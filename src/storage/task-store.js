import fsPromises from 'node:fs/promises';
import { dirname } from 'node:path';
import { STORE_CORRUPT, StoreError } from '../domain/errors.js';
import { checkStoreContent, STORE_VERSION } from './store-file-check.js';

const corruptError = (filePath, options) =>
  new StoreError(
    STORE_CORRUPT,
    `Your task file cannot be read: ${filePath}. It was not changed. Fix, move or delete the file, then reload this page.`,
    options,
  );

const unreadableError = (filePath, options) =>
  new StoreError(
    STORE_CORRUPT,
    `Your task file cannot be opened: ${filePath}. It was not changed. Check the file permissions, then reload this page.`,
    options,
  );

const emptyStoreText = () => `${JSON.stringify({ version: STORE_VERSION, tasks: [] }, null, 2)}\n`;

const freezeTasks = (tasks) => Object.freeze(tasks.map((task) => Object.freeze({ ...task })));

export function createTaskStore({ filePath, fs = fsPromises }) {
  if (typeof filePath !== 'string' || filePath === '') {
    throw new TypeError('createTaskStore needs a data file path.');
  }
  const tempPath = `${filePath}.tmp`;
  let tasks = null;
  let pendingLoad = null;
  let firstRun = false;

  async function prepareDirectory() {
    try {
      await fs.mkdir(dirname(filePath), { recursive: true });
      await fs.rm(tempPath, { force: true });
    } catch (cause) {
      throw unreadableError(filePath, { cause });
    }
  }

  async function readFileText() {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (cause) {
      if (cause.code === 'ENOENT') return null;
      throw unreadableError(filePath, { cause });
    }
  }

  async function createEmptyStore() {
    try {
      await fs.writeFile(filePath, emptyStoreText(), { encoding: 'utf8', flag: 'wx' });
    } catch (cause) {
      throw unreadableError(filePath, { cause });
    }
  }

  async function loadFromDisk() {
    await prepareDirectory();
    const text = await readFileText();
    if (text === null) {
      await createEmptyStore();
      firstRun = true;
      return freezeTasks([]);
    }
    const checked = checkStoreContent(text);
    if (checked.problem) {
      throw corruptError(filePath, { cause: new Error(checked.problem) });
    }
    return freezeTasks(checked.tasks);
  }

  function ensureLoaded() {
    if (tasks) return Promise.resolve(tasks);
    pendingLoad ??= loadFromDisk()
      .then((loaded) => {
        tasks = loaded;
        return loaded;
      })
      .finally(() => {
        pendingLoad = null;
      });
    return pendingLoad;
  }

  async function initialize() {
    await ensureLoaded();
    return { firstRun };
  }

  return { filePath, initialize, readAll: ensureLoaded };
}
