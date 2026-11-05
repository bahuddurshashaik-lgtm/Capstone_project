import { randomUUID } from 'node:crypto';
import fsPromises from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StoreError } from '../../src/domain/errors.js';
import { createApp } from '../../src/http/app.js';
import { createStaticFiles } from '../../src/http/static-files.js';
import { createTaskService } from '../../src/services/task-service.js';
import { createTaskStore } from '../../src/storage/task-store.js';

export async function createTempDirectory(prefix = 'todo-test-') {
  const directory = await fsPromises.mkdtemp(join(tmpdir(), prefix));
  return { directory, remove: () => fsPromises.rm(directory, { recursive: true, force: true }) };
}

function readResponse(response, resolve) {
  const chunks = [];
  response.on('data', (chunk) => chunks.push(chunk));
  response.on('end', () => {
    const text = Buffer.concat(chunks).toString('utf8');
    const isJson = String(response.headers['content-type']).includes('application/json');
    resolve({
      status: response.statusCode,
      headers: response.headers,
      text,
      json: isJson && text !== '' ? JSON.parse(text) : null,
    });
  });
}

export function sendRequest(port, { method = 'GET', path = '/', headers = {}, json, body } = {}) {
  const payload = json === undefined ? body : JSON.stringify(json);
  const jsonHeaders = json === undefined ? {} : { 'Content-Type': 'application/json' };
  const lengthHeaders = payload === undefined ? {} : { 'Content-Length': String(Buffer.byteLength(payload)) };
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port, method, path, headers: { ...jsonHeaders, ...lengthHeaders, ...headers } },
      (response) => readResponse(response, resolve),
    );
    request.on('error', reject);
    request.end(payload);
  });
}

async function prepareDataFile({ dataFile, tasks }) {
  if (!tasks) return;
  await fsPromises.writeFile(dataFile, JSON.stringify({ version: 1, tasks }), 'utf8');
}

async function initializeStore(store) {
  try {
    await store.initialize();
  } catch (error) {
    if (!(error instanceof StoreError)) throw error;
  }
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function closeServer(server) {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(resolve));
}

/**
 * Starts the real app on port 0 with a temporary data file.
 * Options: dataFile (reuse a file, for restart tests), tasks (seed the file), clock, newId,
 * fs (store file-system layer), publicDirectory (static files). A corrupt file does not stop the start.
 */
export async function startTestServer({
  dataFile,
  tasks,
  clock,
  newId = randomUUID,
  fs,
  publicDirectory,
} = {}) {
  const temp = dataFile ? null : await createTempDirectory();
  const filePath = dataFile ?? join(temp.directory, 'tasks.json');
  await prepareDataFile({ dataFile: filePath, tasks });

  const logs = [];
  const store = createTaskStore({ filePath, ...(fs && { fs }) });
  await initializeStore(store);
  const service = createTaskService({ store, clock, newId });
  const staticFiles = createStaticFiles(publicDirectory ? { directory: publicDirectory } : {});
  const server = http.createServer(createApp({ service, staticFiles, log: (line) => logs.push(line) }));
  const port = await listen(server);

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    dataFile: filePath,
    store,
    service,
    logs,
    request: (options) => sendRequest(port, options),
    stop: async () => {
      await closeServer(server);
      await temp?.remove();
    },
  };
}
