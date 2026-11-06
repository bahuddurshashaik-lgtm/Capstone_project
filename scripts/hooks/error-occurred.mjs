// errorOccurred: records errors for later troubleshooting.
import { readHookInput, writeLog, redact } from './hook-utils.mjs';

const input = await readHookInput();
const error = input.error ?? {};
await writeLog('errors.jsonl', {
  event: 'errorOccurred',
  name: error.name ?? 'Error',
  message: redact(String(error.message ?? JSON.stringify(input))).slice(0, 500)
});
