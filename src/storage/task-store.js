import fsPromises from 'node:fs/promises';
import { dirname } from 'node:path';
import { STORE_CORRUPT, STORE_WRITE_FAILED, StoreError } from '../domain/errors.js';
import { checkStoreContent, STORE_VERSION } from './store-file-check.js';

export const RENAME_RETRY_DELAYS_MS = Object.freeze([20, 50]);
const RETRYABLE_RENAME_CODES = Object.freeze(['EPERM', 'EBUSY', 'EACCES']);
const WRITE_FAILED_MESSAGE = 'Your change could not be saved. Nothing was changed. Try again.';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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

const writeFailedError = (options) => new StoreError(STORE_WRITE_FAILED, WRITE_FAILED_MESSAGE, options);

const storeText = (tasks) => `${JSON.stringify({ version: STORE_VERSION, tasks }, null, 2)}\n`;

function assertMutationOutcome(outcome) {
  if (typeof outcome !== 'object' || outcome === null || !Array.isArray(outcome.tasks)) {
    throw new TypeError('A mutate function must return { tasks, result }.');
  }
}

const freezeTasks = (tasks) => Object.freeze(tasks.map((task) => Object.freeze({ ...task })));

export function createTaskStore({ filePath, fs = fsPromises, pause = wait }) {
  if (typeof filePath !== 'string' || filePath === '') {
    throw new TypeError('createTaskStore needs a data file path.');
  }
  const tempPath = `${filePath}.tmp`;
  let tasks = null;
  let pendingLoad = null;
  let firstRun = false;
  let queue = Promise.resolve();

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

  async function writeTempFile(text) {
    const handle = await fs.open(tempPath, 'w');
    try {
      await handle.writeFile(text, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async function renameTempFile() {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await fs.rename(tempPath, filePath);
        return;
      } catch (error) {
        const delay = RENAME_RETRY_DELAYS_MS[attempt];
        if (delay === undefined || !RETRYABLE_RENAME_CODES.includes(error.code)) throw error;
        await pause(delay);
      }
    }
  }

  async function removeTempFile() {
    try {
      await fs.rm(tempPath, { force: true });
    } catch {
      // The failed save is already reported; a leftover temp file is deleted at the next start.
    }
  }

  async function saveTasks(list) {
    try {
      await writeTempFile(storeText(list));
      await renameTempFile();
    } catch (cause) {
      await removeTempFile();
      throw writeFailedError({ cause });
    }
  }

  async function createEmptyStore() {
    try {
      await saveTasks([]);
    } catch (error) {
      throw unreadableError(filePath, { cause: error });
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

  async function runMutation(change) {
    const current = await ensureLoaded();
    const outcome = await change(current);
    assertMutationOutcome(outcome);
    if (outcome.tasks !== current) {
      const next = freezeTasks(outcome.tasks);
      await saveTasks(next);
      tasks = next;
    }
    return outcome.result;
  }

  function mutate(change) {
    const run = queue.then(() => runMutation(change));
    queue = run.catch(() => {});
    return run;
  }

  return { filePath, initialize, readAll: ensureLoaded, mutate };
}
