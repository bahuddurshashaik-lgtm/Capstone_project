// fetch wrapper for the JSON API. Every call resolves to { ok: true, data } or { ok: false, error },
// where error is { code, message, fields }. Calls never throw, so the UI has one error path.

export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';
export const UNEXPECTED_RESPONSE_CODE = 'UNEXPECTED_RESPONSE';

const NETWORK_ERROR_MESSAGE = 'The app could not be reached. Check that it is running, then try again.';
const UNEXPECTED_RESPONSE_MESSAGE = 'The app sent an answer that could not be understood. Try again.';

const JSON_HEADERS = Object.freeze({ 'Content-Type': 'application/json' });
const NO_CONTENT = 204;

const success = (data) => ({ ok: true, data });
const failure = (code, message, fields = null) => ({ ok: false, error: { code, message, fields } });

const networkFailure = () => failure(NETWORK_ERROR_CODE, NETWORK_ERROR_MESSAGE);
const unexpectedFailure = () => failure(UNEXPECTED_RESPONSE_CODE, UNEXPECTED_RESPONSE_MESSAGE);

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

export function buildListQuery(filters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.overdue === true) params.set('overdue', 'true');
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
}

function buildRequestInit(method, body) {
  const isWrite = method !== 'GET';
  const init = { method };
  if (isWrite) init.headers = { ...JSON_HEADERS };
  if (body !== undefined) init.body = JSON.stringify(body);
  return init;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function readSuccess(response) {
  if (response.status === NO_CONTENT) return success(null);
  const data = await readJson(response);
  return data === undefined ? unexpectedFailure() : success(data);
}

async function readFailure(response) {
  const body = await readJson(response);
  const error = body?.error;
  if (!isPlainObject(error) || typeof error.code !== 'string' || typeof error.message !== 'string') {
    return unexpectedFailure();
  }
  return failure(error.code, error.message, isPlainObject(error.fields) ? error.fields : null);
}

export function createApiClient({ fetch: fetchImpl, baseUrl = '' } = {}) {
  const doFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));

  async function send(method, path, body) {
    let response;
    try {
      response = await doFetch(`${baseUrl}${path}`, buildRequestInit(method, body));
    } catch {
      return networkFailure();
    }
    return response.ok ? readSuccess(response) : readFailure(response);
  }

  const taskPath = (id) => `/api/tasks/${encodeURIComponent(id)}`;

  return {
    listTasks: (filters) => send('GET', `/api/tasks${buildListQuery(filters)}`),
    getTask: (id) => send('GET', taskPath(id)),
    createTask: (input) => send('POST', '/api/tasks', input),
    updateTask: (id, input) => send('PUT', taskPath(id), input),
    setStatus: (id, status) => send('PUT', `${taskPath(id)}/status`, { status }),
    deleteTask: (id) => send('DELETE', taskPath(id)),
  };
}
