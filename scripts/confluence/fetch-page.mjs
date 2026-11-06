// Reads a Confluence page by title and writes it as plain text for the requirements step.
// Usage: node scripts/confluence/fetch-page.mjs "US-001: Create a task" [output-file]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { htmlToText, ROOT } from '../lib/stories.mjs';
import { ConfluenceClient, loadEnvFile, readConfig } from '../lib/confluence-client.mjs';

async function main() {
  const [title, output = path.join(ROOT, 'docs', 'sdlc', 'source-story.txt')] = process.argv.slice(2);
  if (!title) throw new Error('Usage: fetch-page.mjs "<page title>" [output-file]');

  await loadEnvFile();
  const client = new ConfluenceClient(readConfig());
  const page = await client.findPage(title);
  if (!page) throw new Error(`Page not found: ${title}`);

  const text = `${page.title}\n\n${htmlToText(page.body.storage.value)}\n`;
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, text, 'utf8');
  console.log(`Saved "${page.title}" to ${output}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
