import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../lib/stories.mjs';

export const LOG_DIR = path.join(ROOT, 'logs');

export async function readHookInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Supports both the Copilot CLI payload (toolName/toolArgs) and the VS Code payload (tool_name/tool_input).
export function normalizeToolCall(input) {
  const name = input.toolName ?? input.tool_name ?? '';
  let args = input.toolArgs ?? input.tool_input ?? {};
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch {
      args = { command: args };
    }
  }
  return { name, args };
}

export async function writeLog(file, entry) {
  await mkdir(LOG_DIR, { recursive: true });
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry });
  await appendFile(path.join(LOG_DIR, file), line + '\n', 'utf8');
}

export function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason
      }
    })
  );
}

const SECRET_PATTERNS = [
  /ATATT[A-Za-z0-9_\-=]{20,}/, // Atlassian API token
  /gh[pousr]_[A-Za-z0-9]{30,}/, // GitHub token
  /AKIA[0-9A-Z]{16}/, // AWS access key id
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(api[_-]?key|secret|token|password)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}/i
];

export function containsSecret(text) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

export function redact(text) {
  return SECRET_PATTERNS.reduce((out, pattern) => out.replace(new RegExp(pattern.source, pattern.flags + 'g'), '[REDACTED]'), text);
}
