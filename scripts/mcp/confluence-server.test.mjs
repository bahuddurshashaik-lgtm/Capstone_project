import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'confluence-server.mjs');

function runSession(requests) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, CONFLUENCE_EMAIL: '', CONFLUENCE_API_TOKEN: '', CONFLUENCE_BASE_URL: '' }
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', () => resolve(out.trim().split('\n').map((l) => JSON.parse(l))));
    child.stdin.end(requests.map((r) => JSON.stringify(r)).join('\n') + '\n');
  });
}

test('MCP server lists tools, lists stories, dry-runs publish and reports errors', async () => {
  const responses = await runSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_user_stories', arguments: {} } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'publish_user_stories', arguments: {} } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_page', arguments: { title: 'x' } } },
    { jsonrpc: '2.0', id: 6, method: 'nope' }
  ]);
  const byId = Object.fromEntries(responses.map((r) => [r.id, r]));

  assert.equal(byId[1].result.serverInfo.name, 'todo-confluence');
  assert.deepEqual(
    byId[2].result.tools.map((t) => t.name),
    ['list_user_stories', 'publish_user_stories', 'get_page', 'upsert_page']
  );
  assert.equal(JSON.parse(byId[3].result.content[0].text).length, 5);
  assert.equal(JSON.parse(byId[4].result.content[0].text).length, 6);
  assert.equal(byId[5].result.isError, true);
  assert.match(byId[5].result.content[0].text, /Missing environment variables/);
  assert.equal(byId[6].error.code, -32601);
  assert.equal(responses.length, 6);
});
