// Publishes docs/user-stories/user-stories.json to Confluence (one parent page + one child page per story).
// Usage: node scripts/confluence/publish-user-stories.mjs [--dry-run]
import { loadStories } from '../lib/stories.mjs';
import { ConfluenceClient, loadEnvFile, readConfig } from '../lib/confluence-client.mjs';
import { publishStories } from '../lib/publish.mjs';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const data = await loadStories();
  await loadEnvFile();

  const config = dryRun
    ? { parentTitle: process.env.CONFLUENCE_PARENT_TITLE ?? 'To Do Application - User Stories' }
    : readConfig();
  const results = await publishStories(new ConfluenceClient(config), data, { dryRun });
  for (const { action, title } of results) console.log(`${dryRun ? '[dry-run] ' : ''}${action}: ${title}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
