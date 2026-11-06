// postToolUse: appends a redacted audit record for every tool call.
import { readHookInput, normalizeToolCall, writeLog, redact } from './hook-utils.mjs';

const input = await readHookInput();
const { name, args } = normalizeToolCall(input);
const result = input.toolResult ?? input.tool_response ?? {};
await writeLog('audit.jsonl', {
  event: 'postToolUse',
  tool: name,
  args: redact(JSON.stringify(args)).slice(0, 300),
  result: result.resultType ?? result.status ?? 'unknown'
});
