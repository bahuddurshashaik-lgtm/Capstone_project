// sessionStart: records the session and prints a short reminder of the SDLC workflow.
import { readHookInput, writeLog } from './hook-utils.mjs';

const input = await readHookInput();
await writeLog('sessions.jsonl', { event: 'sessionStart', source: input.source ?? 'unknown', cwd: input.cwd ?? process.cwd() });
console.error('To Do App SDLC: requirements -> architecture -> design review -> plan -> implement -> review -> verify -> PR.');
