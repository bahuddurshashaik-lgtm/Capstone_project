import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { ConfigError, loadConfig } from './config.js';
import { StoreError } from './domain/errors.js';
import { systemClock } from './domain/dates.js';
import { createApp } from './http/app.js';
import { logError as logMappedError } from './http/error-mapper.js';
import { createStaticFiles } from './http/static-files.js';
import { createTaskService } from './services/task-service.js';
import { createTaskStore } from './storage/task-store.js';

export const LOOPBACK_HOST = '127.0.0.1';

export class StartupError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'StartupError';
  }
}

function listenFailure(error, port) {
  if (error.code === 'EADDRINUSE') {
    return new StartupError(`Port ${port} is already in use. Set PORT to another value.`, { cause: error });
  }
  return new StartupError(`Cannot listen on port ${port} (${error.code ?? 'error'}). Set PORT to another value.`, {
    cause: error,
  });
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(listenFailure(error, port));
    server.once('error', onError);
    server.listen(port, LOOPBACK_HOST, () => {
      server.off('error', onError);
      resolve(server.address().port);
    });
  });
}

function closeServer(server) {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(resolve));
}

async function initializeStore(store) {
  try {
    const { firstRun } = await store.initialize();
    return { firstRun, problem: null };
  } catch (error) {
    if (!(error instanceof StoreError)) throw error;
    return { firstRun: false, problem: error };
  }
}

function reportStoreState({ firstRun, problem }, dataFile, { log, logError }) {
  if (firstRun) log(`No task file found. Created a new one at ${dataFile}`);
  if (problem) logMappedError(problem, logError);
}

export async function startServer({
  config = loadConfig(),
  clock = systemClock,
  newId = randomUUID,
  publicDirectory,
  log = console.log,
  logError = console.error,
} = {}) {
  const store = createTaskStore({ filePath: config.dataFile });
  const storeState = await initializeStore(store);
  const service = createTaskService({ store, clock, newId });
  const staticFiles = createStaticFiles(publicDirectory ? { directory: publicDirectory } : {});
  const server = http.createServer(createApp({ service, staticFiles, log: logError }));

  const port = await listen(server, config.port);
  reportStoreState(storeState, config.dataFile, { log, logError });
  log(`To Do is running at http://${LOOPBACK_HOST}:${port}`);
  return { server, port, dataFile: config.dataFile, close: () => closeServer(server) };
}

function describeStartupFailure(error) {
  if (error instanceof StartupError || error instanceof ConfigError) return error.message;
  return 'The server could not start. Check the data file location and try again.';
}

export async function main({ env = process.env, logError = console.error, exit = process.exit } = {}) {
  try {
    await startServer({ config: loadConfig(env) });
  } catch (error) {
    logError(describeStartupFailure(error));
    exit(1);
  }
}

const isRunDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isRunDirectly) await main();
