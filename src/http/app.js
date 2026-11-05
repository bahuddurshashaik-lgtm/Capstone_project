import { SECURITY_HEADERS, createStaticFiles } from './static-files.js';
import { logError, mapError } from './error-mapper.js';
import { readJsonBody } from './json-body.js';
import { forbidden, methodNotAllowed, routeNotFound } from './request-error.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LOCAL_HOST_NAMES = Object.freeze(['127.0.0.1', 'localhost']);

const JSON_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
});

// ---- Host and Origin checks (architecture 6.3) ----

const localPort = (request) => request.socket.localPort;

function isLocalHost(request) {
  const host = String(request.headers.host ?? '').toLowerCase();
  return LOCAL_HOST_NAMES.some((name) => host === `${name}:${localPort(request)}`);
}

function isLocalOrigin(request) {
  const origin = String(request.headers.origin).toLowerCase();
  return LOCAL_HOST_NAMES.some((name) => origin === `http://${name}:${localPort(request)}`);
}

function assertLocalHost(request) {
  if (!isLocalHost(request)) throw forbidden();
}

function assertLocalOrigin(request) {
  const isWrite = WRITE_METHODS.has(request.method);
  if (isWrite && request.headers.origin !== undefined && !isLocalOrigin(request)) throw forbidden();
}

// ---- routing ----

const splitPath = (pathname) => pathname.split('/').slice(1);

function parseTarget(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.startsWith('/')) throw routeNotFound();
  try {
    return new URL(`http://localhost${rawUrl}`);
  } catch {
    throw routeNotFound();
  }
}

function matchSegments(routeSegments, pathSegments) {
  if (routeSegments.length !== pathSegments.length) return null;
  const params = {};
  for (const [index, expected] of routeSegments.entries()) {
    const actual = pathSegments[index];
    if (expected === ':id') {
      if (actual === '') return null;
      params.id = actual;
    } else if (expected !== actual) {
      return null;
    }
  }
  return params;
}

function findRoute(routes, pathname) {
  const pathSegments = splitPath(pathname);
  for (const route of routes) {
    const params = matchSegments(route.segments, pathSegments);
    if (params) return { route, params };
  }
  return null;
}

function staticRoutes(staticFiles) {
  const serve = async ({ url }) => {
    const file = await staticFiles.load(url.pathname);
    if (!file) throw routeNotFound();
    return { status: 200, headers: file.headers, body: file.body };
  };
  return staticFiles.paths.map((path) => ({ segments: splitPath(path), methods: { GET: serve, HEAD: serve } }));
}

const created = (task) => ({ status: 201, json: task });
const ok = (json) => ({ status: 200, json });

function apiRoutes(service) {
  const createTask = async ({ request }) => created(await service.createTask(await readJsonBody(request)));
  const listTasks = async ({ url }) => ok(await service.listTasks(url.searchParams));
  const getTask = async ({ params }) => ok(await service.getTask(params.id));
  const updateTask = async ({ params, request }) =>
    ok(await service.updateTask(params.id, await readJsonBody(request)));
  return [
    { segments: ['api', 'tasks'], methods: { GET: listTasks, POST: createTask } },
    { segments: ['api', 'tasks', ':id'], methods: { GET: getTask, PUT: updateTask } },
  ];
}

function pickHandler(route, method) {
  if (!Object.hasOwn(route.methods, method)) throw methodNotAllowed(Object.keys(route.methods));
  return route.methods[method];
}

// ---- responses ----

function toWireResponse({ status, headers = {}, json, body }) {
  const payload = json === undefined ? body : Buffer.from(JSON.stringify(json));
  const wireHeaders = { ...SECURITY_HEADERS, ...(json === undefined ? {} : JSON_HEADERS), ...headers };
  if (payload !== undefined) wireHeaders['Content-Length'] = String(payload.length);
  return { status, wireHeaders, payload };
}

function sendResult(response, result) {
  const { status, wireHeaders, payload } = toWireResponse(result);
  response.writeHead(status, wireHeaders);
  response.end(payload);
}

function sendError(response, error, log) {
  logError(error, log);
  if (response.headersSent) {
    response.destroy();
    return;
  }
  const { status, headers, body } = mapError(error);
  sendResult(response, { status, headers, json: body });
}

export function createApp({ service, staticFiles = createStaticFiles(), log = console.error }) {
  const routes = [...staticRoutes(staticFiles), ...apiRoutes(service)];

  async function dispatch(request) {
    assertLocalHost(request);
    assertLocalOrigin(request);
    const url = parseTarget(request.url);
    const match = findRoute(routes, url.pathname);
    if (!match) throw routeNotFound();
    const handler = pickHandler(match.route, request.method);
    return handler({ request, url, params: match.params });
  }

  async function handleRequest(request, response) {
    try {
      sendResult(response, await dispatch(request));
    } catch (error) {
      sendError(response, error, log);
    }
  }

  return (request, response) => handleRequest(request, response).catch(() => response.destroy());
}
