import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './stories.mjs';

export async function loadEnvFile(file = path.join(ROOT, '.env'), { overrideEmpty = false } = {}) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const current = process.env[match[1]];
    if (current === undefined || (overrideEmpty && current === '')) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

export function readConfig(env = process.env) {
  const config = {
    baseUrl: (env.CONFLUENCE_BASE_URL ?? '').replace(/\/+$/, ''),
    spaceKey: env.CONFLUENCE_SPACE_KEY ?? 'CP',
    email: env.CONFLUENCE_EMAIL ?? '',
    token: env.CONFLUENCE_API_TOKEN ?? '',
    parentTitle: env.CONFLUENCE_PARENT_TITLE ?? 'To Do Application - User Stories'
  };
  const missing = [];
  if (!config.baseUrl) missing.push('CONFLUENCE_BASE_URL');
  if (!config.email) missing.push('CONFLUENCE_EMAIL');
  if (!config.token) missing.push('CONFLUENCE_API_TOKEN');
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
  }
  return config;
}

export class ConfluenceClient {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetch = fetchImpl;
    this.authHeader = 'Basic ' + Buffer.from(`${config.email}:${config.token}`).toString('base64');
  }

  async request(method, apiPath, body) {
    const response = await this.fetch(`${this.config.baseUrl}${apiPath}`, {
      method,
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`Confluence ${method} ${apiPath} failed: ${response.status} ${response.statusText} ${detail}`);
    }
    return response.json();
  }

  async findPage(title) {
    const query = new URLSearchParams({
      title,
      spaceKey: this.config.spaceKey,
      expand: 'version,body.storage'
    });
    const result = await this.request('GET', `/rest/api/content?${query}`);
    return result.results[0] ?? null;
  }

  async getSpaceHomeId() {
    const result = await this.request('GET', `/rest/api/space/${encodeURIComponent(this.config.spaceKey)}?expand=homepage`);
    return result.homepage?.id ?? null;
  }

  async upsertPage({ title, html, parentId }) {
    const existing = await this.findPage(title);
    const storage = { value: html, representation: 'storage' };
    if (existing) {
      const updated = await this.request('PUT', `/rest/api/content/${existing.id}`, {
        id: existing.id,
        type: 'page',
        title,
        version: { number: existing.version.number + 1 },
        body: { storage }
      });
      return { id: updated.id, action: 'updated' };
    }
    const created = await this.request('POST', '/rest/api/content', {
      type: 'page',
      title,
      space: { key: this.config.spaceKey },
      ancestors: parentId ? [{ id: String(parentId) }] : undefined,
      body: { storage }
    });
    return { id: created.id, action: 'created' };
  }
}
