// Shared logic for opening or updating the pull request of a branch. Never pushes, force-pushes or merges.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './stories.mjs';
import { GithubClient, loadEnvFile, readGithubConfig, splitPrDescription } from './github-client.mjs';

export const DEFAULT_BODY_FILE = path.join('docs', 'sdlc', 'pr-description.md');

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function assertPushed(head) {
  try {
    git(['ls-remote', '--exit-code', '--heads', 'origin', head]);
  } catch {
    throw new Error(`Branch "${head}" was not found on origin. Push it first (for example: git push -u origin ${head}), then run this again.`);
  }
}

// Dry run needs no token and makes no network or ls-remote call.
export async function openPullRequest({ head, base, bodyFile = DEFAULT_BODY_FILE, title, dryRun = false } = {}) {
  await loadEnvFile();
  const env = dryRun ? { ...process.env, GITHUB_TOKEN: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || 'dry-run' } : process.env;
  const config = readGithubConfig(env);
  const baseBranch = base ?? config.baseBranch;
  const headBranch = head ?? git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!headBranch || headBranch === 'HEAD') throw new Error('Cannot determine the head branch (detached HEAD). Pass --head <branch>.');
  if (headBranch === baseBranch) throw new Error(`Head and base are both "${baseBranch}". Switch to a feature branch or pass --head.`);

  const markdown = await readFile(path.resolve(ROOT, bodyFile), 'utf8');
  const description = splitPrDescription(markdown);
  const prTitle = title ?? description.title;
  if (!prTitle) throw new Error('No title found. Add a "# Title" heading to the body file or pass --title.');

  if (dryRun) {
    return { dryRun: true, repository: config.repository, title: prTitle, head: headBranch, base: baseBranch, bodyLength: description.body.length };
  }

  assertPushed(headBranch);
  const client = new GithubClient(config);
  const result = await client.upsertPullRequest({ head: headBranch, base: baseBranch, title: prTitle, body: description.body });
  return { action: result.action, number: result.number, url: result.url };
}
