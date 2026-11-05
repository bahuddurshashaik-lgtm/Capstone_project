// Generates docs/user-stories/user-stories.md from user-stories.json.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadStories, storiesToMarkdown, ROOT } from '../lib/stories.mjs';

const data = await loadStories();
const target = path.join(ROOT, 'docs', 'user-stories', 'user-stories.md');
await writeFile(target, storiesToMarkdown(data), 'utf8');
console.log(`Wrote ${target}`);
