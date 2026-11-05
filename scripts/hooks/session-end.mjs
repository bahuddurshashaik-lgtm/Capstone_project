// sessionEnd: records the end of the session and warns when SDLC artifacts are missing.
import { access } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '../lib/stories.mjs';
import { readHookInput, writeLog } from './hook-utils.mjs';

const input = await readHookInput();
const artifacts = ['requirements.md', 'architecture.md', 'design-review.md', 'impl-plan.md'];
const present = {};
for (const name of artifacts) {
  present[name] = await access(path.join(ROOT, 'docs', 'sdlc', name)).then(() => true, () => false);
}
await writeLog('sessions.jsonl', { event: 'sessionEnd', reason: input.reason ?? 'unknown', artifacts: present });
