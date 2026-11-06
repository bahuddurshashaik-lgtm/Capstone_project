import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'github-server.mjs');

function runSession(requests) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, GITHUB_TOKEN: '', GH_TOKEN: '', GITHUB_REPOSITORY: 'example-owner/example-repo' }
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', () => resolve(out.trim().split('\n').map((l) => JSON.parse(l))));
    child.stdin.end(requests.map((r) => JSON.stringify(r)).join('\n') + '\n');
  });
}

test('MCP server lists tools, dry-runs a pull request and reports errors without a token', async () => {
  const responses = await runSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'create_pull_request', arguments: { head: 'feature/x', base: 'main' } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'create_pull_request', arguments: { dryRun: false, head: 'feature/does-not-exist', base: 'main' } } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope', arguments: {} } },
    { jsonrpc: '2.0', id: 6, method: 'nope' }
  ]);
  const byId = Object.fromEntries(responses.map((r) => [r.id, r]));

  assert.equal(byId[1].result.serverInfo.name, 'todo-github');
  assert.deepEqual(
    byId[2].result.tools.map((t) => t.name),
    ['create_pull_request']
  );

  assert.notEqual(byId[3].result.isError, true);
  const dryRun = JSON.parse(byId[3].result.content[0].text);
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.repository, 'example-owner/example-repo');
  assert.equal(typeof dryRun.title, 'string');
  assert.ok(dryRun.title.length > 0);
  assert.equal(dryRun.head, 'feature/x');
  assert.equal(dryRun.base, 'main');
  assert.equal(typeof dryRun.bodyLength, 'number');

  assert.equal(byId[4].result.isError, true);
  assert.match(byId[4].result.content[0].text, /Missing environment variables|GITHUB_TOKEN/);
  assert.equal(byId[5].error.code, -32602);
  assert.equal(byId[6].error.code, -32601);
  assert.equal(responses.length, 6);
});
