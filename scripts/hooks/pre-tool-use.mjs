// preToolUse: blocks destructive commands and edits to secret files or the hook/guardrail files themselves.
import { readHookInput, normalizeToolCall, deny, writeLog, containsSecret } from './hook-utils.mjs';

const DANGEROUS_COMMANDS = [
  { pattern: /\bgit\s+push\b.*(--force|-f\b)/i, reason: 'Force-pushing is not allowed.' },
  { pattern: /\bgit\s+reset\s+--hard\b/i, reason: 'git reset --hard can destroy work.' },
  { pattern: /\bgit\s+clean\s+-[a-z]*f/i, reason: 'git clean -f deletes untracked files.' },
  { pattern: /\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\*|\.\s*$)/i, reason: 'Recursive delete of a root, home or wildcard path.' },
  { pattern: /Remove-Item\b.*-Recurse.*\b([A-Z]:\\?\s|\\\s|\*)/i, reason: 'Recursive delete of a drive root or wildcard path.' },
  { pattern: /\b(format|diskpart)\b\s+[a-z]:/i, reason: 'Disk formatting commands are blocked.' },
  { pattern: /\b(curl|wget|iwr|Invoke-WebRequest)\b.*\|\s*(sh|bash|iex|Invoke-Expression)/i, reason: 'Piping downloads into a shell is blocked.' },
  { pattern: /\bnpm\s+publish\b/i, reason: 'Publishing packages is not part of this workflow.' }
];

const PROTECTED_PATH = /(^|[\\/])(\.env(\.[^\\/]+)?|.*\.pem|id_rsa[^\\/]*)$/i;
const ALLOWED_PATH = /\.env\.example$/i;
const EDIT_TOOLS = /^(edit|create|write|apply_patch|replace_string_in_file|create_file|insert_edit_into_file)/i;

const input = await readHookInput();
const { name, args } = normalizeToolCall(input);
const command = String(args.command ?? args.script ?? '');
const filePath = String(args.path ?? args.filePath ?? args.file_path ?? '');

let reason = null;

if (command) {
  const hit = DANGEROUS_COMMANDS.find(({ pattern }) => pattern.test(command));
  if (hit) reason = hit.reason;
}

if (!reason && EDIT_TOOLS.test(name) && filePath) {
  if (PROTECTED_PATH.test(filePath) && !ALLOWED_PATH.test(filePath)) {
    reason = `Editing ${filePath} is blocked; secrets must stay out of agent-written files.`;
  } else if (containsSecret(JSON.stringify(args))) {
    reason = 'The content being written appears to contain a secret.';
  }
}

if (reason) {
  await writeLog('audit.jsonl', { event: 'preToolUse', decision: 'deny', tool: name, reason });
  deny(reason);
}
