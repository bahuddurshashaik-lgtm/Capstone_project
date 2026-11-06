import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadStories,
  validateStories,
  storyStatement,
  storyToStorageHtml,
  escapeHtml,
  htmlToText
} from './stories.mjs';
import { readConfig, ConfluenceClient } from './confluence-client.mjs';

test('bundled stories are valid and there are 4 to 5 of them', async () => {
  const data = await loadStories();
  assert.ok(data.stories.length >= 4 && data.stories.length <= 5);
});

test('validateStories rejects missing fields and duplicates', () => {
  assert.throws(() => validateStories({ stories: [] }));
  const story = { id: 'A', title: 't', persona: 'p', want: 'w', benefit: 'b', priority: 'High', acceptanceCriteria: ['x'] };
  assert.throws(() => validateStories({ stories: [story, story] }), /Duplicate/);
  assert.throws(() => validateStories({ stories: [{ ...story, acceptanceCriteria: [] }] }), /acceptanceCriteria/);
});

test('storyStatement and html escaping', () => {
  const story = { persona: 'user', want: 'to add <b>', benefit: 'it works', acceptanceCriteria: ['a & b'], priority: 'High' };
  assert.equal(storyStatement(story), 'As a user, I want to add <b> so that it works.');
  assert.equal(escapeHtml('<a>&"'), '&lt;a&gt;&amp;&quot;');
  assert.match(storyToStorageHtml(story), /a &amp; b/);
  assert.equal(htmlToText('<p>Hi &amp; bye</p><ol><li>one</li></ol>'), 'Hi & bye\none');
});

test('readConfig reports missing variables', () => {
  assert.throws(() => readConfig({}), /CONFLUENCE_BASE_URL.*CONFLUENCE_EMAIL.*CONFLUENCE_API_TOKEN/);
});

test('upsertPage creates when missing and updates when present', async () => {
  const calls = [];
  const responses = [
    { results: [] },
    { id: '10' },
    { results: [{ id: '10', version: { number: 3 } }] },
    { id: '10' }
  ];
  const fakeFetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body });
    return { ok: true, json: async () => responses.shift() };
  };
  const client = new ConfluenceClient(
    { baseUrl: 'https://x/wiki', spaceKey: 'CP', email: 'a@b.c', token: 't', parentTitle: 'P' },
    fakeFetch
  );
  const created = await client.upsertPage({ title: 'T', html: '<p>1</p>', parentId: '1' });
  const updated = await client.upsertPage({ title: 'T', html: '<p>2</p>' });
  assert.equal(created.action, 'created');
  assert.equal(updated.action, 'updated');
  assert.equal(JSON.parse(calls[3].body).version.number, 4);
});
