// Minimal MCP server (stdio, newline-delimited JSON-RPC 2.0) exposing Confluence + user-story tools.
// Never write to stdout except protocol messages; log to stderr.
import { createInterface } from 'node:readline';
import { loadStories, storyPageTitle, htmlToText } from '../lib/stories.mjs';
import { ConfluenceClient, loadEnvFile, readConfig } from '../lib/confluence-client.mjs';
import { publishStories } from '../lib/publish.mjs';

const SERVER_INFO = { name: 'todo-confluence', version: '0.1.0' };
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const TOOLS = [
  {
    name: 'list_user_stories',
    description: 'List the To Do application user stories stored in docs/user-stories/user-stories.json.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => {
      const data = await loadStories();
      return data.stories.map((s) => ({ id: s.id, title: s.title, priority: s.priority, pageTitle: storyPageTitle(s) }));
    }
  },
  {
    name: 'publish_user_stories',
    description:
      'Publish all user stories to the Confluence CP space (a parent page plus one child page per story). Idempotent: existing pages are updated. Use dryRun to preview.',
    inputSchema: {
      type: 'object',
      properties: { dryRun: { type: 'boolean', description: 'Preview without writing to Confluence. Defaults to true.' } },
      additionalProperties: false
    },
    handler: async ({ dryRun = true }) => {
      const data = await loadStories();
      return publishStories(await createClient(dryRun), data, { dryRun });
    }
  },
  {
    name: 'get_page',
    description: 'Fetch a Confluence page from the configured space by exact title and return it as plain text.',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string', description: 'Exact page title, e.g. "US-001: Create a task".' } },
      required: ['title'],
      additionalProperties: false
    },
    handler: async ({ title }) => {
      requireString(title, 'title');
      const page = await (await createClient()).findPage(title);
      if (!page) throw new Error(`Page not found: ${title}`);
      return { id: page.id, title: page.title, version: page.version.number, text: htmlToText(page.body.storage.value) };
    }
  },
  {
    name: 'upsert_page',
    description: 'Create or update a Confluence page (storage-format HTML) under the space home page or a given parent page id.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        html: { type: 'string', description: 'Confluence storage-format HTML body.' },
        parentId: { type: 'string', description: 'Optional parent page id. Defaults to the space home page.' }
      },
      required: ['title', 'html'],
      additionalProperties: false
    },
    handler: async ({ title, html, parentId }) => {
      requireString(title, 'title');
      requireString(html, 'html');
      const client = await createClient();
      return client.upsertPage({ title, html, parentId: parentId ?? (await client.getSpaceHomeId()) });
    }
  }
];

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`"${name}" must be a non-empty string`);
}

async function createClient(dryRun = false) {
  await loadEnvFile();
  const config = dryRun
    ? { parentTitle: process.env.CONFLUENCE_PARENT_TITLE ?? 'To Do Application - User Stories' }
    : readConfig();
  return new ConfluenceClient(config);
}

function rpcError(code, message) {
  return Object.assign(new Error(message), { code });
}

export async function handleMessage(message) {
  const { id, method, params = {} } = message;

  switch (method) {
    case 'initialize': {
      const requested = params.protocolVersion;
      return {
        protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO
      };
    }
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) throw rpcError(-32602, `Unknown tool: ${params.name}`);
      try {
        const result = await tool.handler(params.arguments ?? {});
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message }] };
      }
    }
    default:
      if (id === undefined) return undefined;
      throw rpcError(-32601, `Method not found: ${method}`);
  }
}

function send(payload) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...payload }) + '\n');
}

async function onLine(line) {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return send({ id: null, error: { code: -32700, message: 'Parse error' } });
  }
  try {
    const result = await handleMessage(message);
    if (message.id !== undefined) send({ id: message.id, result });
  } catch (error) {
    if (message.id !== undefined) send({ id: message.id, error: { code: error.code ?? -32603, message: error.message } });
  }
}

if (process.argv[1]?.endsWith('confluence-server.mjs')) {
  createInterface({ input: process.stdin }).on('line', (line) => void onLine(line));
  console.error('todo-confluence MCP server running on stdio');
}
