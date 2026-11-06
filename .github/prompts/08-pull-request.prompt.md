---
description: Step 8 - prepare the pull request
agent: pr-author
---
Prepare the PR description (Summary, Changes Made, Test Evidence, Known Limitations, Reviewer Checklist) and the changelog entry.

After the user confirms, create the branch, commit and push with the `todo-git` MCP tools (`create_branch`, `commit`, `push`; `dryRun` first, then `dryRun: false`) or with normal git (no force). Then open or update the PR with `npm run pr:create:dry` and `npm run pr:create` (or the `todo-github` / `github` MCP tools if available). Never commit `.env`, `logs/` or `node_modules/`, never force-push and never merge.
