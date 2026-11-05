// Opens or updates the pull request for a branch (idempotent). Never pushes, force-pushes or merges.
// Usage: node scripts/github/create-pr.mjs [--head <branch>] [--base <branch>] [--body-file <path>] [--title <text>] [--dry-run]
import { parseArgs } from 'node:util';
import { DEFAULT_BODY_FILE, openPullRequest } from '../lib/pull-request.mjs';

async function main() {
  const { values } = parseArgs({
    options: {
      head: { type: 'string' },
      base: { type: 'string' },
      'body-file': { type: 'string', default: DEFAULT_BODY_FILE },
      title: { type: 'string' },
      'dry-run': { type: 'boolean', default: false }
    }
  });

  const result = await openPullRequest({
    head: values.head,
    base: values.base,
    bodyFile: values['body-file'],
    title: values.title,
    dryRun: values['dry-run']
  });

  if (result.dryRun) {
    console.log(`Dry run (no GitHub call, no token needed)\nRepository: ${result.repository}\nTitle: ${result.title}\nHead: ${result.head}\nBase: ${result.base}\nBody length: ${result.bodyLength} characters`);
    return;
  }
  console.log(`Pull request ${result.action}: ${result.url}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
