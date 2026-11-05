// userPromptSubmitted: logs prompts (secrets redacted) so the SDLC run is traceable.
import { readHookInput, writeLog, containsSecret, redact } from './hook-utils.mjs';

const input = await readHookInput();
const prompt = String(input.prompt ?? '');
if (containsSecret(prompt)) console.error('Warning: the prompt looks like it contains a secret. Use .env instead of pasting credentials.');
await writeLog('prompts.jsonl', { event: 'userPromptSubmitted', prompt: redact(prompt).slice(0, 500) });
