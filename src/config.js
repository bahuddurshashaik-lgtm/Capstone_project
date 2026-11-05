import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_PORT = 3000;
export const MIN_PORT = 1;
export const MAX_PORT = 65535;

export const DEFAULT_DATA_FILE = fileURLToPath(new URL('../data/tasks.json', import.meta.url));

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

const isBlank = (value) => value === undefined || value.trim() === '';

function parsePort(rawPort) {
  if (isBlank(rawPort)) return DEFAULT_PORT;
  const text = rawPort.trim();
  const port = /^\d{1,5}$/.test(text) ? Number(text) : Number.NaN;
  if (!(port >= MIN_PORT && port <= MAX_PORT)) {
    throw new ConfigError(`PORT must be a whole number from ${MIN_PORT} to ${MAX_PORT}.`);
  }
  return port;
}

function parseDataFile(rawPath) {
  if (isBlank(rawPath)) return DEFAULT_DATA_FILE;
  const text = rawPath.trim();
  if (text.includes('\0')) throw new ConfigError('TODO_DATA_FILE must be a valid file path.');
  return resolve(text);
}

export function loadConfig(env = process.env) {
  return {
    port: parsePort(env.PORT),
    dataFile: parseDataFile(env.TODO_DATA_FILE),
  };
}
