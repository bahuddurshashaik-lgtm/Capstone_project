---
name: confluence-user-stories
description: Publish the To Do application user stories to the Confluence CP space or fetch a story page as text. Use when syncing user stories with Confluence.
---
# Confluence user stories

Source of truth: `docs/user-stories/user-stories.json` (5 stories, US-001..US-005).

## Setup
1. Copy `.env.example` to `.env` and fill `CONFLUENCE_EMAIL` and `CONFLUENCE_API_TOKEN` (Atlassian API token). Never print or commit them.
2. Base URL `https://bahuddurshashaik.atlassian.net/wiki`, space key `CP`.

## Commands
- Preview (no network): `npm run confluence:publish:dry`
- Publish (creates or updates a parent page and one child page per story): `npm run confluence:publish`
- Fetch a page to `docs/sdlc/source-story.txt`: `node scripts/confluence/fetch-page.mjs "US-001: Create a task"`
- Regenerate Markdown: `npm run stories:md`

Publishing is idempotent: existing pages are found by title and updated with an incremented version.

## MCP alternative
The `todo-confluence` MCP server (`.vscode/mcp.json`) exposes `list_user_stories`, `publish_user_stories`, `get_page` and `upsert_page`. Prefer it when available; call `publish_user_stories` with `dryRun: true` first.
