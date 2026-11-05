---
name: github-pull-request
description: Open or update the GitHub pull request for the current feature branch from docs/sdlc/pr-description.md. Use when raising or refreshing a PR.
---
# GitHub pull request

Source of truth for the PR title and body: `docs/sdlc/pr-description.md` (title is the first `# ` heading, body is the rest).

## Setup
1. Copy `.env.example` to `.env` and fill `GITHUB_TOKEN` (fine-grained token with Pull requests: Read and write and Contents: Read on this repo, created at https://github.com/settings/tokens). Never print or commit it. `GH_TOKEN` is also accepted.
2. `GITHUB_REPOSITORY` (`owner/repo`) defaults to the `origin` remote. `GITHUB_BASE_BRANCH` defaults to `main`.
3. Push the feature branch yourself with normal git (for example `git push -u origin <branch>`). The script never pushes.

## Commands
- Preview (no GitHub call, no token needed): `npm run pr:create:dry`
- Open or update the PR: `npm run pr:create`
- Options: `node scripts/github/create-pr.mjs [--head <branch>] [--base <branch>] [--body-file <path>] [--title <text>] [--dry-run]`

The head defaults to the current branch. The script refuses when head equals base and when the head branch is not on `origin`.

Raising the PR is idempotent: an open PR for the same head and base is updated (title and body); otherwise a new one is created. The result is printed as the action (`created` or `updated`) and the PR URL.

## Guardrails
Never merge, never force-push, never push without explicit user confirmation.

## MCP alternative
The project MCP server `todo-github` (`scripts/mcp/github-server.mjs`, registered in `.vscode/mcp.json`) exposes the same automation as one tool, `create_pull_request` (inputs: `dryRun`, `head`, `base`, `title`, `bodyFile`, all optional). Call it with `dryRun` first (the default, no token needed), then with `dryRun: false`. It opens or updates the PR idempotently and never pushes, merges or force-pushes. The token is read from `GITHUB_TOKEN` in `.env` through the `envFile` setting; it is never stored in `mcp.json`.

The hosted `github` MCP server tools (for example `create_pull_request`, `update_pull_request`) can also be used if available; otherwise run `npm run pr:create`.
