# PR: To Do application (US-001..US-005)

## Summary

This change adds a To Do application that covers all five user stories: create (US-001), list and filter (US-002), edit (US-003), complete or reopen (US-004) and delete (US-005) tasks. It is a local web UI and JSON API served on `127.0.0.1`, with no runtime dependencies and a JSON file store. It was built through the SDLC steps 1 to 7 (requirements, architecture, design review, plan, implementation, code review, verification). The code review verdict is Approve, and every check that was executed passes.

## Changes Made

Application code (already committed as 35 commits, T-1..T-35, on `main`):

- `src/server.js`, `src/config.js`: start-up, loopback-only listener, and configuration from `PORT` and `TODO_DATA_FILE` only. No `.env` file is read.
- `src/domain/` (`task.js`, `validation.js`, `filters.js`, `dates.js`, `errors.js`): task rules, validation by code points, filters, overdue rule, and one definition of "today".
- `src/services/task-service.js`: create, list, get, edit, change status and delete use cases.
- `src/storage/` (`task-store.js`, `store-file-check.js`): JSON file store with a write queue, atomic write (temp file, `fsync`, rename with retry), save-then-swap, and recovery from a corrupt file without overwriting it.
- `src/http/` (`app.js`, `error-mapper.js`, `json-body.js`, `request-error.js`, `static-files.js`): REST routes, Host and Origin checks, content type and body size limit, error mapping, and a six-file static allow-list with a Content-Security-Policy.
- `src/public/` (`index.html`, `styles.css`, `app.js`, `view-model.js`, `api-client.js`): browser UI. It uses `textContent` only, text and icon cues for status, a native confirmation dialog, and a live region for messages.
- `tests/unit/` (13 files), `tests/integration/` (10 files) and `tests/helpers/start-test-server.js`: 480 `node:test` tests, including boundaries, security, persistence, concurrency and a 1,000-task performance test.
- `package.json`: adds the `test` script and `engines.node >=20`. `.gitignore`: excludes `data/`. `README.md`: how to run the app.
- `CHANGELOG.md`: the existing "Added" bullet for the application is refined with the feature list. It is not duplicated.

Not yet committed (untracked in the working tree):

- `docs/sdlc/` (`requirements.md`, `architecture.md`, `design-review.md`, `impl-plan.md`, `code-review.md`, `verification.md`, `pr-description.md`): the SDLC artifacts that trace each requirement to a task and a test.
- `docs/user-stories/`, `scripts/`, `.github/`, `.vscode/`, `.env.example`, `src/.gitkeep`, `tests/*/.gitkeep`: project scaffold (agents, prompts, instructions, skills, hooks, Confluence publish and fetch scripts, workspace check). `.env.example` is a template only; no real `.env` file was read or changed.

Git state: branch `main`, no feature branch yet, nothing pushed. A feature branch and a commit are made only when the user asks.

## Test Evidence

From `docs/sdlc/verification.md` (Node v26.4.0, npm 11.17.0, Windows, 2026-11-05). All commands exited with code 0.

`npm test`:

```text
> todo-application@0.1.0 test
> node --test "tests/**/*.test.js"

✔ POST /api/tasks creates a task and returns 201 with the stored fields and overdue (191.6494ms)
✔ defaults apply: priority Medium, empty description, no due date (136.4911ms)
... (476 more passing test lines) ...
✔ a validation error with fields is shown next to the fields (0.1477ms)
✔ a validation error without fields (for example bad JSON) is shown as a message (0.199ms)
✔ a missing or empty error gives the generic message (0.1085ms)
ℹ tests 480
ℹ suites 0
ℹ pass 480
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2337.1572
```

`npm run test:scripts`:

```text
> todo-application@0.1.0 test:scripts
> node --test "scripts/**/*.test.mjs"

✔ bundled stories are valid and there are 4 to 5 of them (5.8817ms)
✔ validateStories rejects missing fields and duplicates (1.1168ms)
✔ storyStatement and html escaping (0.9161ms)
✔ readConfig reports missing variables (0.3925ms)
✔ upsertPage creates when missing and updates when present (0.882ms)
✔ MCP server lists tools, lists stories, dry-runs publish and reports errors (108.8414ms)
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 249.8151
```

`npm run check`:

```text
> todo-application@0.1.0 check
> node scripts/validate-workspace.mjs

Workspace check passed.
```

Other results from `verification.md`:

| Check | Result |
|-------|--------|
| Acceptance criteria traced to a test or a browser check | 20 of 20 |
| Browser checklist (headless Chrome 156, India Standard Time) | 78 run, 78 pass, 0 fail |
| Document quality (placeholders, 134 backticked paths, FR and NFR coverage) | Pass, with 3 Low notes |
| Code review (`code-review.md`) | Approve. No High or Critical finding. |
| 1,000-row render (NFR-5, target 300 ms), painted frame | 164.9 to 280.2 ms over 7 runs |
| API p95 with 1,000 tasks (budgets 200 ms writes, 300 ms reads) | 1.4 to 8.3 ms |

## Known Limitations

Accepted by the user for this release (no change made):

- CR-1 (Medium): `src/public/app.js` has 485 lines. Plan assumption PA-3 says to split it at about 300 lines. This is an accepted deviation (OQ-CR-1). `impl-plan.md` PA-3 does not record it yet; the decision is in `verification.md` only.
- Stale layout: `architecture.md` section 7 does not list 9 existing files (6 test files and `tests/helpers/start-test-server.js` from PA-1, plus `src/http/request-error.js` and `src/storage/store-file-check.js`) (CR-10, K-8). It was not fixed.
- Stale status lines (D-1): `impl-plan.md` says "Draft v0.1, awaiting user approval". `architecture.md` and `design-review.md` say "awaiting user approval". `code-review.md` says "awaiting user decision on OQ-CR-1". All 35 tasks are Done and the decisions were made. These lines were not fixed.

Open Low findings (follow-up change; each needs a test):

- CR-3: a successful `DELETE` (204) has no `Cache-Control: no-store` header. Architecture 6.3 says all API responses send it. No data is exposed by a 204.
- CR-4: when the server cannot be reached, the UI shows "Something went wrong. Try again." instead of the specific client message (`NETWORK_ERROR`, `UNEXPECTED_RESPONSE`). This is a gap against NFR-6.
- CR-5: test helpers (`seedTask`, fixed clock, `withServer`) are copied across integration test files instead of living in `tests/helpers/`.
- CR-6: `src/public/app.js` compares with the literal `'Completed'` instead of the exported `COMPLETED`.

Not executed or not verified:

- Node 20 (OQ-CR-2): not run. Only Node v26.4.0 was available. `engines` allows Node 20 and later, but it is not proven that Node 20 expands the quoted glob in `npm test` and `npm run test:scripts`. If it does not, both scripts fail on Node 20.
- Firefox, Safari and Edge: not run. Only Chrome 156 was used. The README lists them as supported, and native `<dialog>` focus handling can differ.
- Screen reader announcements (`aria-live`, `role="alert"`): not run. Only the attributes and focus behaviour were checked.
- A tab left open across midnight (AR-1): not run. This is an accepted risk; the list refreshes on focus and after each action.
- Rendering time on a real GPU or a slow device: not run. Headless Chrome used `--disable-gpu`.
- Forced-colours mode, zoom and small screens: not run.
- A real second browser tab: simulated with direct `DELETE` requests.
- `npm audit`: cannot run (no dependencies, no lockfile).

Observations:

- N-1: the browser asks for `/favicon.ico` and gets a JSON 404. This adds one console error on each page load. No functional effect.
- N-2: the painted frame for 1,000 rows took up to 280.2 ms against the 300 ms target (NFR-5) in headless Chrome without a GPU. The target is met, but the margin is thin (about 20 ms).
- The browser checklist is not part of the repository. There is no automated browser test (accepted risk AR-3), so FR-15, FR-22, FR-29 and FR-31 have no automated test.
- There is no `npm start` script by design. Run the app with `node src/server.js` (see `README.md`).

Out of scope (from `requirements.md` section 5): user accounts and sharing, cloud or multi-device sync, sub-tasks, tags, attachments and reminders, recurring tasks, sorting other than newest first, text search, bulk actions, undo of deletes, import and export, and localisation (English only).

## Reviewer Checklist

- [ ] Read `docs/sdlc/requirements.md` and confirm FR-1..FR-34 and NFR-1..NFR-12 match the five user stories.
- [ ] Run `npm test` and confirm 480 pass, 0 fail.
- [ ] Run `npm run test:scripts` and `npm run check` and confirm both pass.
- [ ] Start the app with `node src/server.js` and try create, filter, edit, complete, reopen and delete in a browser.
- [ ] Confirm the server listens on `127.0.0.1` only and a request with a foreign `Host` or `Origin` is refused.
- [ ] Confirm `src/public/app.js` uses no `innerHTML`, `insertAdjacent` or `eval`.
- [ ] Confirm no secret is in the diff, no `.env` file is committed, and `.env.example` holds no real values.
- [ ] Confirm `data/` is ignored by `.gitignore`.
- [ ] Review each known limitation above and accept it for this release or ask for a fix: CR-1, CR-3, CR-4, CR-5, CR-6, the stale layout and status lines, the favicon 404 and the thin render margin.
- [ ] Decide whether a Node 20 run (OQ-CR-2) is required before merge.
- [ ] Decide whether Firefox, Safari and Edge checks are required before merge.
- [ ] Confirm `CHANGELOG.md` has one refined "Added" entry for the application and no duplicate.
- [ ] Confirm the work is on a feature branch before merge, not directly on `main`.
