# To Do Application - Agentic SDLC

A To Do application delivered end to end by GitHub Copilot agents, prompts, instructions, skills and hooks. User stories are kept in Confluence (space `CP`: https://bahuddurshashaik.atlassian.net/wiki/spaces/CP/overview).

## Run the To Do application
Requires Node.js 20 or later. The application has no dependencies, so there is nothing to install.

1. From the project root, run `node src/server.js`.
2. Open `http://127.0.0.1:3000` in a browser.

The server listens on `127.0.0.1` only, so it is not reachable from other devices. Stop it with `Ctrl+C`.

| Setting | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port to listen on. A whole number from 1 to 65535. |
| `TODO_DATA_FILE` | `data/tasks.json` in the project root | Path of the JSON file that stores your tasks. |

Example (PowerShell): `$env:PORT = "3100"; node src/server.js`

- Settings come from environment variables only. No `.env` file is read.
- On the first run the server creates the data file and prints its full path.
- The data file is plain JSON. If it is damaged, the server still starts and the page shows an error with the file path. The file is never overwritten. Fix, move or delete it, then reload the page.
- If the port is in use, the server prints "Port <n> is already in use. Set PORT to another value." and exits with code 1.
- The browser files are served from `src/public/`.
- Run only one server instance for a data file. Two instances that share one file overwrite each other's changes.
- Supported browsers: the latest two stable versions of Chrome, Edge, Firefox and Safari.

## Test the application
`npm test` runs the unit and integration tests in `tests/`. `npm run test:scripts` tests the helper scripts. `npm run check` validates the agents, prompts and hooks.

## Project structure
```
.github/
  copilot-instructions.md      repo-wide guidance
  agents/                      sdlc-orchestrator + 8 specialist agents
  prompts/                     01..08 step prompts, run-sdlc, publish-user-stories
  instructions/                coding, documentation and script rules
  skills/                      confluence-user-stories, github-pull-request, sdlc-artifacts
  hooks/hooks.json             session, prompt, tool and error hooks
docs/
  user-stories/                user-stories.json (source), user-stories.md (generated)
  sdlc/                        requirements, architecture, design-review, impl-plan, ...
scripts/
  confluence/                  publish-user-stories.mjs, fetch-page.mjs
  github/                      create-pr.mjs
  hooks/                       hook implementations
  lib/                         shared helpers + tests
  mcp/                         confluence-server.mjs, github-server.mjs, git-server.mjs (MCP servers) + tests
  user-stories/                markdown export
src/
  server.js                    entry point (reads PORT and TODO_DATA_FILE)
  config.js                    settings
  domain/                      validation, task rules, dates, filters, errors
  services/                    task service (use cases)
  storage/                     JSON file store
  http/                        routes, error mapping, static files
  public/                      browser UI (HTML, CSS, JavaScript)
tests/{unit,integration,helpers}
```

## User stories
| ID | Title | Priority |
|---|---|---|
| US-001 | Create a task | High |
| US-002 | View and filter the task list | High |
| US-003 | Edit a task | Medium |
| US-004 | Mark a task complete or reopen it | High |
| US-005 | Delete a task | Medium |

## Publish stories to Confluence
1. `copy .env.example .env` and set `CONFLUENCE_EMAIL` and `CONFLUENCE_API_TOKEN` ([create a token](https://id.atlassian.com/manage-profile/security/api-tokens)).
2. `npm run confluence:publish:dry` to preview, then `npm run confluence:publish`.

## Confluence MCP server
`scripts/mcp/confluence-server.mjs` is a dependency-free MCP server (stdio) named `todo-confluence`, registered in `.vscode/mcp.json`. VS Code prompts for your Atlassian email and API token (stored as secure inputs, never in files). Tools: `list_user_stories`, `publish_user_stories` (`dryRun` defaults to true), `get_page`, `upsert_page`. Start it from the MCP servers list in VS Code, then ask Copilot to "publish the user stories to Confluence".

## Open a pull request
1. `copy .env.example .env` (if you have not already) and set `GITHUB_TOKEN` ([create a token](https://github.com/settings/tokens) with Pull requests: Read and write and Contents: Read on this repository).
2. Push your feature branch with normal git, for example `git push -u origin <branch>`. The script never pushes, force-pushes or merges.
3. `npm run pr:create:dry` to preview, then `npm run pr:create`. The title and body come from `docs/sdlc/pr-description.md`. Running it again updates the open PR instead of creating a second one.

## GitHub MCP server
`scripts/mcp/github-server.mjs` is a dependency-free MCP server (stdio) named `todo-github`, registered in `.vscode/mcp.json`. It has one tool, `create_pull_request` (`dryRun` defaults to true; optional `head`, `base`, `title`, `bodyFile`), which opens or updates the PR idempotently and never pushes, merges or force-pushes. VS Code prompts once for the GitHub token (secure input `github_token`: hidden, stored by VS Code, never written to a file) the first time you start the server; the same input also authenticates the hosted `github` server. Alternatively, `GITHUB_TOKEN` in `.env` works for the terminal command `npm run pr:create` (and for `todo-github` when the prompt is left empty); never put the token in `mcp.json`. Ask Copilot to "open the pull request (dry run first)".

## Git MCP server
`scripts/mcp/git-server.mjs` is a dependency-free MCP server (stdio) named `todo-git`, registered in `.vscode/mcp.json` (`npm run mcp:git`). It runs the local git steps that precede the PR using your normal git credentials (no token or `.env` needed); the git logic lives in `scripts/lib/git-tools.mjs` and always uses argument arrays, never a shell. Tools:
- `git_status`: branch, upstream, ahead/behind and changed files.
- `git_log`: `limit` (1-50, default 10) and optional `range`; returns hash and subject.
- `git_diff_stat`: `git diff --stat <base>...HEAD` (`base` defaults to `main`).
- `create_branch`: `name` is validated; creates and switches with `git switch -c`; refuses existing branches.
- `commit`: `message` and `files` (explicit repo-relative paths); `dryRun` defaults to true. Refuses `.env` files (except `.env.example`), `logs/`, `node_modules/`, files containing token patterns, and commits on `main`; appends the `Co-authored-by: Copilot` trailer.
- `push`: `dryRun` defaults to true and optional `branch`; only `git push -u origin <branch>`, never `main`/`master`, never force.

There is no merge, reset, rebase, clean or generic "run git" tool. Errors redact token-like strings and credentials in remote URLs. Ask Copilot to "create a branch, commit these files and push (dry run first)", then open the PR with `todo-github`.

## Agents and the SDLC
| Step | Agent | Prompt | Output |
|---|---|---|---|
| 1 Requirements | requirements-analyst | `/01-requirements` | docs/sdlc/requirements.md |
| 2 Architecture | solution-architect | `/02-architecture` | docs/sdlc/architecture.md |
| 3 Design review | design-reviewer | `/03-design-review` | docs/sdlc/design-review.md |
| 4 Planning | implementation-planner | `/04-impl-plan` | docs/sdlc/impl-plan.md |
| 5 Implementation | implementer | `/05-implement` | src/, tests/ |
| 6 Review | code-reviewer | `/06-code-review` | docs/sdlc/code-review.md |
| 7 Verify | verifier | `/07-verify` | docs/sdlc/verification.md |
| 8 PR | pr-author | `/08-pull-request` | pr-description.md, CHANGELOG.md |

`sdlc-orchestrator` (`/run-sdlc`) chains all steps with human approval between them.

## Hooks (`.github/hooks/hooks.json`)
- `preToolUse` blocks force-push, hard reset, recursive deletes, piped installers, `npm publish`, and edits to `.env`/key files or content containing secrets.
- `postToolUse`, `userPromptSubmitted`, `errorOccurred`, `sessionStart`, `sessionEnd` write redacted JSONL logs to `logs/` (git-ignored).

## Commands
`npm run check` (validate agents/prompts/hooks) | `npm run test:scripts` | `npm run stories:md` | `npm run pr:create:dry`
