import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GithubClient, parseRemoteUrl, readGithubConfig, splitPrDescription } from './github-client.mjs';

const FAKE = 'fake-tok-123';
const config = { token: FAKE, repository: 'octo/app', baseBranch: 'main', apiUrl: 'https://api.github.com' };

test('parseRemoteUrl handles https, ssh and .git suffix', () => {
  assert.equal(parseRemoteUrl('https://github.com/octo/app.git'), 'octo/app');
  assert.equal(parseRemoteUrl('https://github.com/octo/app'), 'octo/app');
  assert.equal(parseRemoteUrl('https://user@github.com/octo/app.git\n'), 'octo/app');
  assert.equal(parseRemoteUrl('git@github.com:octo/app.git'), 'octo/app');
  assert.equal(parseRemoteUrl('ssh://git@github.com/octo/app.git'), 'octo/app');
  assert.equal(parseRemoteUrl('not a url'), null);
});

test('readGithubConfig reports a missing token and applies defaults', () => {
  assert.throws(() => readGithubConfig({ GITHUB_REPOSITORY: 'octo/app' }, () => null), /GITHUB_TOKEN.*Copy \.env\.example/);
  assert.throws(() => readGithubConfig({ GITHUB_TOKEN: 't' }, () => null), /GITHUB_REPOSITORY/);
  const result = readGithubConfig({ GH_TOKEN: 't' }, () => 'octo/app');
  assert.deepEqual(result, { token: 't', repository: 'octo/app', baseBranch: 'main', apiUrl: 'https://api.github.com' });
});

test('splitPrDescription takes the first H1 as title and the rest as body', () => {
  const { title, body } = splitPrDescription('# PR: Thing\n\n## Summary\n\nText\n\n');
  assert.equal(title, 'PR: Thing');
  assert.equal(body, '## Summary\n\nText');
  assert.equal(splitPrDescription('no heading').title, '');
});

function fakeFetchWith(responses, calls) {
  return async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    const next = responses.shift();
    return next.ok === false
      ? { ok: false, status: next.status, statusText: 'Error', text: async () => next.text }
      : { ok: true, json: async () => next };
  };
}

test('upsertPullRequest creates when none is open and updates when present', async () => {
  const calls = [];
  const pr = { number: 7, html_url: 'https://github.com/octo/app/pull/7' };
  const client = new GithubClient(config, fakeFetchWith([[], pr, [{ number: 7 }], pr], calls));
  const created = await client.upsertPullRequest({ head: 'feature/x', base: 'main', title: 'T', body: 'B' });
  const updated = await client.upsertPullRequest({ head: 'feature/x', base: 'main', title: 'T2', body: 'B2' });

  assert.deepEqual(created, { number: 7, url: pr.html_url, action: 'created' });
  assert.equal(updated.action, 'updated');
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url, 'https://api.github.com/repos/octo/app/pulls?head=octo%3Afeature%2Fx&base=main&state=open');
  assert.equal(calls[0].headers.Authorization, `Bearer ${FAKE}`);
  assert.equal(calls[0].headers['X-GitHub-Api-Version'], '2022-11-28');
  assert.equal(calls[1].method, 'POST');
  assert.equal(calls[1].url, 'https://api.github.com/repos/octo/app/pulls');
  assert.deepEqual(JSON.parse(calls[1].body), { title: 'T', body: 'B', head: 'feature/x', base: 'main' });
  assert.equal(calls[3].method, 'PATCH');
  assert.equal(calls[3].url, 'https://api.github.com/repos/octo/app/pulls/7');
  assert.deepEqual(JSON.parse(calls[3].body), { title: 'T2', body: 'B2' });
});

test('errors include status and a trimmed detail but never the token', async () => {
  const calls = [];
  const text = `Bad credentials ${FAKE} ${'x'.repeat(500)}`;
  const client = new GithubClient(config, fakeFetchWith([{ ok: false, status: 401, text }], calls));
  await assert.rejects(client.findOpenPr('feature/x'), (error) => {
    assert.match(error.message, /401/);
    assert.ok(!error.message.includes(FAKE));
    assert.ok(error.message.length < 400);
    return true;
  });
});
