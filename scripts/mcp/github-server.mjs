// Minimal MCP server (stdio, newline-delimited JSON-RPC 2.0) exposing the pull request automation.
// Never write to stdout except protocol messages; log to stderr.
import { createInterface } from 'node:readline';
import { openPullRequest } from '../lib/pull-request.mjs';

const SERVER_INFO = { name: 'todo-github', version: '0.1.0' };
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const TOOLS = [
  {
    name: 'create_pull_request',
    description:
      'Open or update the GitHub pull request for a branch, using the title and body from docs/sdlc/pr-description.md. Idempotent: an open PR for the same head and base is updated, otherwise one is created. Never pushes, merges or force-pushes; the head branch must already be on origin. Call with dryRun first (the default) to preview.',
    inputSchema: {
      type: 'object',
      properties: {
        dryRun: { type: 'boolean', description: 'Preview without calling GitHub or needing a token. Defaults to true.' },
        head: { type: 'string', description: 'Head branch. Defaults to the current git branch.' },
        base: { type: 'string', description: 'Base branch. Defaults to GITHUB_BASE_BRANCH or "main".' },
        title: { type: 'string', description: 'PR title. Defaults to the first "# " heading of the body file.' },
        bodyFile: { type: 'string', description: 'Markdown file with the PR title and body. Defaults to docs/sdlc/pr-description.md.' }
      },
      additionalProperties: false
    },
    handler: async ({ dryRun = true, head, base, title, bodyFile }) => {
      if (typeof dryRun !== 'boolean') throw new Error('"dryRun" must be a boolean');
      return openPullRequest({
        dryRun,
        head: optionalString(head, 'head'),
        base: optionalString(base, 'base'),
        title: optionalString(title, 'title'),
        bodyFile: optionalString(bodyFile, 'bodyFile')
      });
    }
  }
];

function optionalString(value, name) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error(`"${name}" must be a string`);
  return value;
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

if (process.argv[1]?.endsWith('github-server.mjs')) {
  createInterface({ input: process.stdin }).on('line', (line) => void onLine(line));
  console.error('todo-github MCP server running on stdio');
}
