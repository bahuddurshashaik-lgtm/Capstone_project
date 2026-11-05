// Sanity-checks that every agent, prompt, skill and hook file referenced by the SDLC pipeline exists and has frontmatter.
import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './lib/stories.mjs';

const problems = [];

async function listFiles(dir, suffix) {
  const entries = await readdir(path.join(ROOT, dir)).catch(() => []);
  return entries.filter((f) => f.endsWith(suffix)).map((f) => path.join(dir, f));
}

async function checkFrontmatter(file, requiredKeys) {
  const text = await readFile(path.join(ROOT, file), 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return problems.push(`${file}: missing YAML frontmatter`);
  for (const key of requiredKeys) {
    if (!new RegExp(`^${key}:`, 'm').test(match[1])) problems.push(`${file}: frontmatter missing "${key}"`);
  }
}

for (const file of await listFiles('.github/agents', '.agent.md')) await checkFrontmatter(file, ['name', 'description']);
for (const file of await listFiles('.github/prompts', '.prompt.md')) await checkFrontmatter(file, ['description']);
for (const file of await listFiles('.github/instructions', '.instructions.md')) await checkFrontmatter(file, ['applyTo']);
await checkFrontmatter('.github/skills/confluence-user-stories/SKILL.md', ['name', 'description']);
await checkFrontmatter('.github/skills/sdlc-artifacts/SKILL.md', ['name', 'description']);

const hooksFile = path.join(ROOT, '.github/hooks/hooks.json');
try {
  const config = JSON.parse(await readFile(hooksFile, 'utf8'));
  for (const [event, hooks] of Object.entries(config.hooks ?? {})) {
    for (const hook of hooks) {
      const script = (hook.bash ?? '').split(' ').find((p) => p.endsWith('.mjs'));
      if (!script) problems.push(`hooks.json: ${event} has no .mjs script`);
      else await access(path.join(ROOT, script)).catch(() => problems.push(`hooks.json: ${event} -> missing ${script}`));
    }
  }
} catch (error) {
  problems.push(`hooks.json: ${error.message}`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Workspace check passed.');
