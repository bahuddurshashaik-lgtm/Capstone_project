// Local git operations for the todo-git MCP server. Only a fixed set of safe commands is exposed:
// no merge, reset, rebase, clean, file checkout or force push, and no generic "run git".
// Every call uses execFileSync with an argument array (never a shell string) and cwd = ROOT.
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './stories.mjs';

export const PROTECTED_BRANCHES = ['main', 'master'];
export const CO_AUTHOR_TRAILER = 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>';
export const MAX_FILES = 200;
const MAX_SCAN_BYTES = 5 * 1024 * 1024;
const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
const REF_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_/~^-]|\.(?!\.)){0,99}$/;

export const TOKEN_PATTERNS = [
  { name: 'github-classic-token', regex: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { name: 'github-fine-grained-token', regex: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: 'atlassian-api-token', regex: /ATATT[A-Za-z0-9_=-]{20,}/g }
];

// Redaction

export function redactUrlCredentials(text) {
  return String(text).replace(/\b([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^\s/@]+@/g, '$1***@');
}

export function redactSecrets(text) {
  let result = redactUrlCredentials(text);
  for (const { regex } of TOKEN_PATTERNS) result = result.replace(regex, '***');
  return result.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g, 'Bearer ***');
}

// Returns the names of the token patterns found in the text, never the matched values.
export function findTokenPatterns(text) {
  return TOKEN_PATTERNS.filter(({ regex }) => new RegExp(regex.source).test(text)).map(({ name }) => name);
}

// Validators

export function validateBranchName(name) {
  if (typeof name !== 'string' || !BRANCH_PATTERN.test(name)) {
    throw new Error('Invalid branch name: use letters, digits, ".", "_", "-" and "/" (max 100 characters, starting with a letter or digit).');
  }
  if (name.includes('..') || name.endsWith('/') || name.endsWith('.lock')) {
    throw new Error('Invalid branch name: must not contain "..", end with "/" or end with ".lock".');
  }
  return name;
}

export function validateRevRange(range) {
  if (typeof range !== 'string' || range.length === 0 || range.length > 200) throw new Error('Invalid range: expected a non-empty string up to 200 characters.');
  const parts = range.match(/^(.+?)(\.\.\.?)(.+)$/);
  const refs = parts ? [parts[1], parts[3]] : [range];
  if (!refs.every((ref) => REF_PATTERN.test(ref))) {
    throw new Error('Invalid range: use a ref or "<ref>..<ref>" / "<ref>...<ref>" with letters, digits, ".", "_", "-", "/", "~" and "^".');
  }
  return range;
}

export function validateRef(ref, name = 'ref') {
  if (typeof ref !== 'string' || ref.length > 100 || !REF_PATTERN.test(ref)) throw new Error(`Invalid ${name}: expected a branch or ref name.`);
  return ref;
}

export function validateMessage(message) {
  if (typeof message !== 'string' || !message.trim()) throw new Error('"message" must be a non-empty string.');
  const text = message.replace(/\r\n?/g, '\n').trim();
  if (text.includes('\0')) throw new Error('"message" must not contain NUL characters.');
  if (text.split('\n')[0].length > 200) throw new Error('The first line of "message" must be at most 200 characters.');
  if (findTokenPatterns(text).length > 0) throw new Error('"message" looks like it contains a token; refusing to commit.');
  return text;
}

// Returns the normalized repo-relative path using forward slashes.
export function validateRepoPath(file) {
  if (typeof file !== 'string' || !file.trim()) throw new Error('Each file must be a non-empty string.');
  if (file.length > 260) throw new Error('File path is too long.');
  if (/[\u0000-\u001f:]/.test(file)) throw new Error(`Invalid file path "${file}": control characters and ":" are not allowed.`);
  const slashed = file.replace(/\\/g, '/');
  if (slashed.startsWith('/') || path.win32.isAbsolute(file) || path.posix.isAbsolute(slashed)) {
    throw new Error(`Invalid file path "${file}": must be relative to the repository root.`);
  }
  if (slashed.split('/').includes('..')) throw new Error(`Invalid file path "${file}": ".." is not allowed.`);
  const normalized = path.posix.normalize(slashed);
  if (normalized === '.' || normalized.startsWith('-') || normalized.startsWith('../') || normalized.endsWith('/')) {
    throw new Error(`Invalid file path "${file}": must name a file inside the repository and not start with "-".`);
  }
  return normalized;
}

// Returns the reason a path may never be committed, or null when it is allowed.
export function forbiddenPathReason(normalizedPath) {
  const segments = normalizedPath.toLowerCase().split('/');
  // Windows ignores trailing dots and spaces, so ".env." is the same file as ".env".
  const base = segments[segments.length - 1].replace(/[. ]+$/, '');
  if (base === '.env' || (base.startsWith('.env.') && base !== '.env.example')) return 'environment files (.env) must never be committed';
  if (segments.includes('logs')) return 'files under logs/ must never be committed';
  if (segments.includes('node_modules')) return 'files under node_modules/ must never be committed';
  return null;
}

export function validateCommitFiles(files) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('"files" must be a non-empty array of repo-relative paths.');
  if (files.length > MAX_FILES) throw new Error(`At most ${MAX_FILES} files can be committed at once.`);
  const normalized = [...new Set(files.map(validateRepoPath))];
  const forbidden = normalized.map((file) => ({ file, reason: forbiddenPathReason(file) })).filter((entry) => entry.reason);
  if (forbidden.length > 0) throw new Error(`Refusing to commit: ${forbidden.map((e) => `${e.file} (${e.reason})`).join('; ')}.`);
  return normalized;
}

// git runner

function git(args, { trim = true, timeout = 60_000, allowFail = false, env } = {}) {
  try {
    const out = execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
      timeout,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env }
    });
    return trim ? out.trim() : out;
  } catch (error) {
    if (allowFail) return null;
    const detail = redactSecrets(String(error.stderr || error.message || '').trim()).split('\n').slice(0, 10).join('\n');
    throw new Error(`git ${args.find((a) => !a.startsWith('-')) ?? ''} failed: ${detail}`.trim());
  }
}

function currentBranch() {
  return git(['branch', '--show-current']);
}

function assertOnFeatureBranch(branch) {
  if (!branch) throw new Error('HEAD is detached; switch to a feature branch first.');
  if (PROTECTED_BRANCHES.includes(branch)) throw new Error(`Refusing to work directly on "${branch}". Create a feature branch first.`);
}

function parseStatus(raw) {
  const tokens = raw.split('\0');
  const files = [];
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i];
    if (entry.length < 4) continue;
    const item = { path: entry.slice(3), index: entry[0], worktree: entry[1] };
    if ('RC'.includes(entry[0]) || 'RC'.includes(entry[1])) item.originalPath = tokens[++i];
    files.push(item);
  }
  return files;
}

// Tools

export function gitStatus() {
  const branch = currentBranch();
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], { allowFail: true }) || null;
  let ahead = null;
  let behind = null;
  if (upstream) {
    const counts = git(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], { allowFail: true });
    if (counts) [behind, ahead] = counts.split(/\s+/).map(Number);
  }
  const files = parseStatus(git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], { trim: false }));
  return { branch: branch || '(detached HEAD)', upstream, ahead, behind, clean: files.length === 0, files };
}

export function gitLog({ limit = 10, range } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('"limit" must be an integer between 1 and 50.');
  const args = ['log', `--max-count=${limit}`, '--format=%H%x1f%s'];
  if (range !== undefined) args.push(validateRevRange(range));
  args.push('--');
  const commits = git(args)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, subject] = line.split('\x1f');
      return { hash, subject: redactSecrets(subject ?? '') };
    });
  return { commits };
}

export function gitDiffStat({ base = 'main' } = {}) {
  validateRef(base, 'base');
  const summary = git(['diff', '--stat', `${base}...HEAD`, '--']);
  return { base, summary };
}

export function createBranch({ name } = {}) {
  validateBranchName(name);
  git(['check-ref-format', '--branch', name]);
  if (git(['show-ref', '--verify', '--quiet', `refs/heads/${name}`], { allowFail: true }) !== null) {
    throw new Error(`Branch "${name}" already exists.`);
  }
  git(['switch', '-c', name]);
  return { created: true, branch: currentBranch() };
}

// Resolves each path to its real location: it must stay inside the repository, not be a symlink or directory,
// and the real path must still pass the forbidden-path check (for example Windows short names).
function checkWorkingTreeFile(file, rootReal) {
  const absolute = path.join(ROOT, file);
  let stats;
  try {
    stats = lstatSync(absolute);
  } catch {
    // Missing on disk: only allowed for a tracked file whose deletion is being committed.
    if (git(['--literal-pathspecs', 'ls-files', '--error-unmatch', '--', file], { allowFail: true }) === null) {
      throw new Error(`File not found and not tracked: ${file}`);
    }
    return null;
  }
  if (stats.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${file}`);
  if (!stats.isFile()) throw new Error(`Not a regular file: ${file}. List files individually.`);
  const real = path.relative(rootReal, realpathSync.native(absolute)).split(path.sep).join('/');
  if (real.startsWith('..') || path.isAbsolute(real)) throw new Error(`File resolves outside the repository: ${file}`);
  const reason = forbiddenPathReason(real);
  if (reason) throw new Error(`Refusing to commit ${file}: ${reason}.`);
  return { absolute, size: stats.size };
}

function scanFilesForTokens(files) {
  const rootReal = realpathSync.native(ROOT);
  const flagged = [];
  for (const file of files) {
    const info = checkWorkingTreeFile(file, rootReal);
    if (!info) continue;
    if (info.size > MAX_SCAN_BYTES) throw new Error(`File too large to scan for secrets: ${file}`);
    if (findTokenPatterns(readFileSync(info.absolute, 'latin1')).length > 0) flagged.push(file);
  }
  if (flagged.length > 0) throw new Error(`Refusing to commit: possible access token found in ${flagged.join(', ')}. Remove it first.`);
}

export function commit({ message, files, dryRun = true } = {}) {
  if (typeof dryRun !== 'boolean') throw new Error('"dryRun" must be a boolean.');
  const text = validateMessage(message);
  const paths = validateCommitFiles(files);
  const branch = currentBranch();
  assertOnFeatureBranch(branch);
  scanFilesForTokens(paths);

  const changes = parseStatus(git(['--literal-pathspecs', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...paths], { trim: false }));
  const fullMessage = text.includes(CO_AUTHOR_TRAILER) ? text : `${text}\n\n${CO_AUTHOR_TRAILER}`;
  if (dryRun) {
    return { dryRun: true, branch, message: fullMessage, files: paths, changes, nothingToCommit: changes.length === 0 };
  }
  if (changes.length === 0) throw new Error('Nothing to commit: none of the given files has changes.');

  git(['--literal-pathspecs', 'add', '--', ...paths]);
  // Committing with explicit paths leaves anything else that is staged out of this commit.
  git(['--literal-pathspecs', 'commit', '-m', text, '-m', CO_AUTHOR_TRAILER, '--', ...paths]);
  const [hash, subject] = git(['log', '-1', '--format=%H%x1f%s']).split('\x1f');
  return { dryRun: false, branch, commit: hash, subject, files: paths };
}

export function push({ dryRun = true, branch } = {}) {
  if (typeof dryRun !== 'boolean') throw new Error('"dryRun" must be a boolean.');
  const target = branch === undefined || branch === null || branch === '' ? currentBranch() : branch;
  if (!target) throw new Error('HEAD is detached; pass a branch to push.');
  validateBranchName(target);
  if (PROTECTED_BRANCHES.includes(target)) throw new Error(`Refusing to push "${target}". Push a feature branch.`);
  git(['check-ref-format', '--branch', target]);
  if (git(['show-ref', '--verify', '--quiet', `refs/heads/${target}`], { allowFail: true }) === null) {
    throw new Error(`Local branch "${target}" does not exist.`);
  }
  const remote = redactUrlCredentials(git(['remote', 'get-url', 'origin']));
  const command = `git push -u origin ${target}`;
  if (dryRun) return { dryRun: true, command, remote, branch: target };
  git(['push', '-u', 'origin', target], { timeout: 120_000 });
  return { dryRun: false, command, remote, branch: target, pushed: true };
}
