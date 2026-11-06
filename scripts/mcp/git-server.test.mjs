import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, 'git-server.mjs');
const ROOT = path.resolve(HERE, '..', '..');

function runSession(requests) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', () => resolve(out.trim().split('\n').map((l) => JSON.parse(l))));
    child.stdin.end(requests.map((r) => JSON.stringify(r)).join('\n') + '\n');
  });
}

const call = (id, name, args = {}) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

test('MCP server lists tools and serves read-only git tools', async () => {
  const responses = await runSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    call(3, 'git_status'),
    call(4, 'git_log', { limit: 1 }),
    call(5, 'git_log', { limit: 0 }),
    call(6, 'git_log', { range: '--all' }),
    call(7, 'nope'),
    { jsonrpc: '2.0', id: 8, method: 'nope' }
  ]);
  const byId = Object.fromEntries(responses.map((r) => [r.id, r]));

  assert.equal(byId[1].result.serverInfo.name, 'todo-git');
  assert.deepEqual(
    byId[2].result.tools.map((t) => t.name),
    ['git_status', 'git_log', 'git_diff_stat', 'create_branch', 'commit', 'push']
  );

  const status = JSON.parse(byId[3].result.content[0].text);
  assert.equal(typeof status.branch, 'string');
  assert.ok(Array.isArray(status.files));

  const log = JSON.parse(byId[4].result.content[0].text);
  assert.equal(log.commits.length, 1);
  assert.match(log.commits[0].hash, /^[0-9a-f]{40}$/);
  assert.equal(typeof log.commits[0].subject, 'string');

  assert.equal(byId[5].result.isError, true);
  assert.equal(byId[6].result.isError, true);
  assert.equal(byId[7].error.code, -32602);
  assert.equal(byId[8].error.code, -32601);
  assert.equal(responses.length, 8);
});

test('MCP server refuses unsafe branch names, files and pushes without changing the repository', async () => {
  const headBefore = git('rev-parse', 'HEAD');
  const branchBefore = git('branch', '--show-current');
  const stagedBefore = git('diff', '--cached', '--name-only');

  const responses = await runSession([
    call(1, 'create_branch', { name: 'bad name' }),
    call(2, 'create_branch', { name: '../x' }),
    call(3, 'create_branch', { name: '-x' }),
    call(4, 'commit', { message: 'x', files: ['.env'], dryRun: false }),
    call(5, 'commit', { message: 'x', files: ['logs/audit.jsonl'], dryRun: false }),
    call(6, 'commit', { message: 'x', files: ['../outside.txt'] }),
    call(7, 'commit', { message: 'x', files: [] }),
    call(8, 'commit', { message: 'Harmless preview', files: ['README.md'] }),
    call(9, 'push', { branch: 'main' }),
    call(10, 'push', { branch: '--force' })
  ]);
  const byId = Object.fromEntries(responses.map((r) => [r.id, r]));

  for (const id of [1, 2, 3]) assert.equal(byId[id].result.isError, true, `create_branch case ${id}`);
  for (const id of [4, 5]) assert.equal(byId[id].result.isError, true, `commit case ${id}`);
  assert.match(byId[4].result.content[0].text, /\.env/);
  assert.match(byId[5].result.content[0].text, /logs/);
  assert.equal(byId[6].result.isError, true);
  assert.equal(byId[7].result.isError, true);

  if (['main', 'master'].includes(branchBefore)) {
    assert.equal(byId[8].result.isError, true);
    assert.match(byId[8].result.content[0].text, /Refusing/);
  } else {
    assert.notEqual(byId[8].result.isError, true);
    const preview = JSON.parse(byId[8].result.content[0].text);
    assert.equal(preview.dryRun, true);
    assert.deepEqual(preview.files, ['README.md']);
    assert.match(preview.message, /Co-authored-by: Copilot/);
  }

  assert.equal(byId[9].result.isError, true);
  assert.match(byId[9].result.content[0].text, /Refusing to push/);
  assert.equal(byId[10].result.isError, true);

  assert.equal(git('rev-parse', 'HEAD'), headBefore);
  assert.equal(git('branch', '--show-current'), branchBefore);
  assert.equal(git('diff', '--cached', '--name-only'), stagedBefore);
});
