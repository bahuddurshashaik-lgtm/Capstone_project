import { execFileSync } from 'node:child_process';
import { loadEnvFile as loadBaseEnvFile } from './confluence-client.mjs';

// VS Code may pass GITHUB_TOKEN as an empty string when the prompt is skipped; let .env fill it.
export const loadEnvFile = (file) => loadBaseEnvFile(file, { overrideEmpty: true });

// Accepts https and ssh remotes (with or without .git) and returns "owner/repo", or null.
export function parseRemoteUrl(url) {
  const match = String(url ?? '')
    .trim()
    .match(/^(?:https?:\/\/(?:[^@/]+@)?[^/]+\/|ssh:\/\/(?:[^@/]+@)?[^/]+\/|[^@\s/]+@[^:\s/]+:)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  return match ? `${match[1]}/${match[2]}` : null;
}

function repositoryFromGit() {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return parseRemoteUrl(url);
  } catch {
    return null;
  }
}

export function readGithubConfig(env = process.env, detectRepository = repositoryFromGit) {
  const config = {
    token: env.GITHUB_TOKEN || env.GH_TOKEN || '',
    repository: env.GITHUB_REPOSITORY || detectRepository() || '',
    baseBranch: env.GITHUB_BASE_BRANCH || 'main',
    apiUrl: (env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '')
  };
  const missing = [];
  if (!config.token) missing.push('GITHUB_TOKEN');
  if (!config.repository) missing.push('GITHUB_REPOSITORY');
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
  }
  return config;
}

// Title is the first H1 heading; body is everything after it.
export function splitPrDescription(markdown) {
  const text = String(markdown ?? '').replace(/^\uFEFF/, '');
  const match = text.match(/^#[ \t]+(.+?)[ \t]*$/m);
  if (!match) return { title: '', body: text.trim() };
  const body = text.slice(0, match.index) + text.slice(match.index + match[0].length);
  return { title: match[1].trim(), body: body.trim() };
}

export class GithubClient {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetch = fetchImpl;
  }

  async request(method, apiPath, body) {
    const response = await this.fetch(`${this.config.apiUrl}${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'todo-application-pr-script',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300).split(this.config.token).join('***');
      throw new Error(`GitHub ${method} ${apiPath} failed: ${response.status} ${response.statusText} ${detail}`);
    }
    return response.json();
  }

  async findOpenPr(head, base = this.config.baseBranch) {
    const owner = this.config.repository.split('/')[0];
    const query = new URLSearchParams({ head: `${owner}:${head}`, base, state: 'open' });
    const result = await this.request('GET', `/repos/${this.config.repository}/pulls?${query}`);
    return result[0] ?? null;
  }

  async upsertPullRequest({ head, base = this.config.baseBranch, title, body }) {
    const existing = await this.findOpenPr(head, base);
    if (existing) {
      const updated = await this.request('PATCH', `/repos/${this.config.repository}/pulls/${existing.number}`, { title, body });
      return { number: updated.number, url: updated.html_url, action: 'updated' };
    }
    const created = await this.request('POST', `/repos/${this.config.repository}/pulls`, { title, body, head, base });
    return { number: created.number, url: created.html_url, action: 'created' };
  }
}
