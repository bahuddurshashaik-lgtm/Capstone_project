// Minimal MCP server (stdio, newline-delimited JSON-RPC 2.0) exposing safe local git operations for the PR workflow.
// Never write to stdout except protocol messages; log to stderr.
import { createInterface } from 'node:readline';
import { commit, createBranch, gitDiffStat, gitLog, gitStatus, push, redactSecrets } from '../lib/git-tools.mjs';

const SERVER_INFO = { name: 'todo-git', version: '0.1.0' };
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const TOOLS = [
  {
    name: 'git_status',
    description: 'Show the current branch, upstream, ahead/behind counts and the changed files of the repository.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: () => gitStatus()
  },
  {
    name: 'git_log',
    description: 'List recent commits (hash and subject), optionally limited to a revision range such as "main..HEAD".',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Number of commits to return. Defaults to 10.' },
        range: { type: 'string', description: 'Optional revision range, for example "main..HEAD".' }
      },
      additionalProperties: false
    },
    handler: ({ limit = 10, range }) => gitLog({ limit, range: optionalString(range, 'range') })
  },
  {
    name: 'git_diff_stat',
    description: 'Summarize the changes of the current branch against a base branch (git diff --stat base...HEAD).',
    inputSchema: {
      type: 'object',
      properties: { base: { type: 'string', description: 'Base branch or ref. Defaults to "main".' } },
      additionalProperties: false
    },
    handler: ({ base }) => gitDiffStat({ base: optionalString(base, 'base') })
  },
  {
    name: 'create_branch',
    description: 'Create a new local branch and switch to it (git switch -c). Refuses invalid names and branches that already exist.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Branch name, for example "feature/todo-app".' } },
      required: ['name'],
      additionalProperties: false
    },
    handler: ({ name }) => createBranch({ name })
  },
  {
    name: 'commit',
    description:
      'Stage the given files and commit them with a Co-authored-by Copilot trailer. Refuses .env files, logs/, node_modules/, files containing token patterns, and commits on main. dryRun defaults to true: preview first and commit only after the user confirms.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Commit message (first line at most 200 characters).' },
        files: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'Repo-relative file paths to commit.' },
        dryRun: { type: 'boolean', description: 'Preview what would be committed without changing anything. Defaults to true.' }
      },
      required: ['message', 'files'],
      additionalProperties: false
    },
    handler: ({ message, files, dryRun = true }) => commit({ message, files, dryRun })
  },
  {
    name: 'push',
    description:
      'Push a feature branch to origin with "git push -u origin <branch>". Never force-pushes, never pushes main or master. dryRun defaults to true: preview first and push only after the user confirms.',
    inputSchema: {
      type: 'object',
      properties: {
        dryRun: { type: 'boolean', description: 'Preview the push without contacting the remote. Defaults to true.' },
        branch: { type: 'string', description: 'Branch to push. Defaults to the current branch.' }
      },
      additionalProperties: false
    },
    handler: ({ dryRun = true, branch }) => push({ dryRun, branch: optionalString(branch, 'branch') })
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
        return { content: [{ type: 'text', text: redactSecrets(JSON.stringify(result, null, 2)) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: redactSecrets(error.message) }] };
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

if (process.argv[1]?.endsWith('git-server.mjs')) {
  createInterface({ input: process.stdin }).on('line', (line) => void onLine(line));
  console.error('todo-git MCP server running on stdio');
}
