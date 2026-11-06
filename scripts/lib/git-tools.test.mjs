import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findTokenPatterns,
  forbiddenPathReason,
  redactSecrets,
  redactUrlCredentials,
  validateBranchName,
  validateCommitFiles,
  validateMessage,
  validateRepoPath,
  validateRevRange
} from './git-tools.mjs';

// Built at runtime so this file itself does not trip token scanners.
const CLASSIC = 'ghp_' + 'a1B2'.repeat(8);
const FINE = 'github_pat_' + 'x9Y_'.repeat(8);
const ATLASSIAN = 'ATATT' + 'z8Q-'.repeat(8);

test('validateBranchName accepts normal names and rejects unsafe ones', () => {
  for (const ok of ['main', 'feature/todo-app', 'release-1.2.3', 'a', 'fix_bug/x.y']) assert.equal(validateBranchName(ok), ok);
  const bad = ['', 'bad name', '../x', '-x', '/x', 'x/', 'a..b', 'x.lock', 'a/b.lock', 'x;rm', 'x$(id)', '.hidden', 'a'.repeat(101), 'é', null, 42];
  for (const name of bad) assert.throws(() => validateBranchName(name), /branch name/, String(name));
});

test('validateRepoPath normalizes relative paths and rejects traversal, absolute and option-like paths', () => {
  assert.equal(validateRepoPath('README.md'), 'README.md');
  assert.equal(validateRepoPath('src\\app.js'), 'src/app.js');
  assert.equal(validateRepoPath('./src/./app.js'), 'src/app.js');
  for (const bad of ['', '  ', '../x', 'a/../../x', '/etc/passwd', 'C:\\x', 'C:x', '\\\\server\\share', '-rf', '--force', '.', 'dir/', 'a\0b', 42, null]) {
    assert.throws(() => validateRepoPath(bad), undefined, String(bad));
  }
});

test('forbiddenPathReason blocks .env files, logs/ and node_modules/ but allows .env.example', () => {
  for (const bad of ['.env', '.env.local', '.env.production', 'sub/.env', '.ENV', '.env.', 'logs/audit.jsonl', 'a/logs/x.txt', 'node_modules/x/index.js']) {
    assert.ok(forbiddenPathReason(bad), bad);
  }
  for (const ok of ['.env.example', 'README.md', 'src/env.js', 'docs/logs.md', 'scripts/lib/git-tools.mjs']) assert.equal(forbiddenPathReason(ok), null, ok);
});

test('validateCommitFiles deduplicates and refuses forbidden or empty lists', () => {
  assert.deepEqual(validateCommitFiles(['README.md', './README.md', '.env.example']), ['README.md', '.env.example']);
  assert.throws(() => validateCommitFiles([]), /non-empty/);
  assert.throws(() => validateCommitFiles('README.md'), /non-empty/);
  assert.throws(() => validateCommitFiles(['README.md', '.env']), /\.env/);
  assert.throws(() => validateCommitFiles(['logs/audit.jsonl']), /logs/);
  assert.throws(() => validateCommitFiles(['node_modules/x.js']), /node_modules/);
});

test('validateMessage requires a short first line and no tokens', () => {
  assert.equal(validateMessage('  feat: add git server \n'), 'feat: add git server');
  assert.equal(validateMessage('title\n\n' + 'b'.repeat(500)).split('\n')[0], 'title');
  assert.throws(() => validateMessage(''), /non-empty/);
  assert.throws(() => validateMessage('   '), /non-empty/);
  assert.throws(() => validateMessage('x'.repeat(201)), /200/);
  assert.throws(() => validateMessage(`oops ${CLASSIC}`), /token/);
});

test('validateRevRange accepts refs and ranges and rejects options', () => {
  for (const ok of ['main', 'main..HEAD', 'main...HEAD', 'HEAD~3', 'origin/main..feature/x', 'v1.2.3']) assert.equal(validateRevRange(ok), ok);
  for (const bad of ['', '--all', '-n1', 'a b', 'a....b', 'main..', '..HEAD', 'x;y', '$(id)', 'a'.repeat(201)]) {
    assert.throws(() => validateRevRange(bad), /range/, bad);
  }
});

test('findTokenPatterns reports pattern names for token-like strings only', () => {
  assert.deepEqual(findTokenPatterns(`token=${CLASSIC}`), ['github-classic-token']);
  assert.deepEqual(findTokenPatterns(FINE), ['github-fine-grained-token']);
  assert.deepEqual(findTokenPatterns(`x ${ATLASSIAN} y`), ['atlassian-api-token']);
  assert.deepEqual(findTokenPatterns('ghp_short and github_pat_short and plain text'), []);
  // repeated calls are stable (no sticky regex state)
  assert.equal(findTokenPatterns(CLASSIC).length, 1);
  assert.equal(findTokenPatterns(CLASSIC).length, 1);
});

test('redactUrlCredentials and redactSecrets hide credentials', () => {
  assert.equal(redactUrlCredentials('https://user:secret@github.com/o/r.git'), 'https://***@github.com/o/r.git');
  assert.equal(redactUrlCredentials('https://token@github.com/o/r.git'), 'https://***@github.com/o/r.git');
  assert.equal(redactUrlCredentials('https://github.com/o/r.git'), 'https://github.com/o/r.git');
  assert.equal(redactUrlCredentials('git@github.com:o/r.git'), 'git@github.com:o/r.git');
  const redacted = redactSecrets(`fatal: https://u:p@host/x ${CLASSIC} ${FINE} ${ATLASSIAN}`);
  assert.equal(redacted, 'fatal: https://***@host/x *** *** ***');
});
