import fsPromises from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_PUBLIC_DIRECTORY = fileURLToPath(new URL('../public/', import.meta.url));

export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
});

const HTML = 'text/html; charset=utf-8';
const CSS = 'text/css; charset=utf-8';
const JAVASCRIPT = 'text/javascript; charset=utf-8';

const ALLOWED_FILES = new Map([
  ['/', { file: 'index.html', contentType: HTML }],
  ['/index.html', { file: 'index.html', contentType: HTML }],
  ['/styles.css', { file: 'styles.css', contentType: CSS }],
  ['/app.js', { file: 'app.js', contentType: JAVASCRIPT }],
  ['/api-client.js', { file: 'api-client.js', contentType: JAVASCRIPT }],
  ['/view-model.js', { file: 'view-model.js', contentType: JAVASCRIPT }],
]);

export const STATIC_PATHS = Object.freeze([...ALLOWED_FILES.keys()]);

const isMissingFile = (error) => error.code === 'ENOENT' || error.code === 'EISDIR';

const staticHeaders = (contentType, body) => ({
  ...SECURITY_HEADERS,
  'Content-Type': contentType,
  'Content-Length': String(body.length),
  'Cache-Control': 'no-cache',
});

export function createStaticFiles({ directory = DEFAULT_PUBLIC_DIRECTORY, fs = fsPromises } = {}) {
  async function load(pathname) {
    const entry = ALLOWED_FILES.get(pathname);
    if (!entry) return null;
    try {
      const body = await fs.readFile(join(directory, entry.file));
      return { headers: staticHeaders(entry.contentType, body), body };
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  return { paths: STATIC_PATHS, load };
}
