---
description: Step 8 - prepare the pull request
agent: pr-author
---
Prepare the PR description (Summary, Changes Made, Test Evidence, Known Limitations, Reviewer Checklist) and the changelog entry.

After the user confirms, the branch is pushed by the user or with normal git (no force). Then open or update the PR with `npm run pr:create:dry` and `npm run pr:create` (or the `github` MCP tools if available). Never force-push and never merge.
