# Verification - To Do Application

Status: Verification complete. Result: **Pass** for everything that was executed. Items that were not executed or not verified are listed in section 8.
Date: 2026-11-05
Scope: US-001..US-005, tasks T-1..T-35 (`docs/sdlc/impl-plan.md`)
Inputs: `requirements.md` (FR-1..FR-34, NFR-1..NFR-12), `architecture.md` v0.2, `design-review.md`, `impl-plan.md`, `code-review.md` (verdict Approve, no High or Critical finding)
Verifier: QA agent (step 7). No file in `src/` or `tests/` was changed. No `.env` file was read or changed. Nothing was pushed.

User decisions applied (from the hand-over for this step):

- OQ-CR-1: the 485-line `src/public/app.js` is accepted as a deviation from PA-3 (CR-1).
- CR-3, CR-4, CR-5 and CR-6 stay open. They are listed as known issues in section 7.

## 1. Result

| Area | Result | Basis |
|------|--------|-------|
| Unit and integration tests (`npm test`) | Pass | 480 of 480 tests pass (section 4.1) |
| Script tests (`npm run test:scripts`) | Pass | 6 of 6 tests pass (section 4.2) |
| Workspace check (`npm run check`) | Pass | "Workspace check passed." (section 4.3) |
| Acceptance criteria traceability | Pass | 20 of 20 criteria map to tests or to the browser checklist (section 3) |
| Browser checklist (headless Chrome 156) | Pass | 78 checks executed, 78 pass, 0 fail (section 5) |
| Document quality | Pass with 3 Low notes | No placeholder text, 134 paths resolve, every FR and NFR has a task and a test or check (section 6) |
| Node 20 run (OQ-CR-2) | Not verified | No Node 20 runtime on this machine (section 8) |
| New defects | None | Two known Low issues were reproduced (section 7) |

Test runtime for all results in this file: Node v26.4.0, npm 11.17.0, Windows. Time zone of the browser run: India Standard Time (UTC+05:30).

## 2. Added tests

None. Each acceptance criterion already has automated coverage (backend and view-model logic) or is on the browser checklist (UI-only behaviour: FR-15, FR-22, FR-29, FR-31). The review found no gap that a Node test can close. The UI-only items stay manual by accepted risk AR-3 and R-5 (no browser automation tool in the repository). The headless Chrome script used in section 5 lives outside the repository and is not part of the suite.

## 3. Traceability: acceptance criterion to test

Test files are in `tests/unit` or `tests/integration`. Quoted names are test titles from the run. "M-n" is a browser checklist item from section 5.

### US-001 Create a task

| AC | Criterion | FR / NFR | Automated tests | Browser |
|----|-----------|----------|-----------------|---------|
| AC-1 | Title mandatory, at most 100 characters; empty title shows a validation error | FR-1, FR-2, FR-34, NFR-6 | `validation.test.js` (title 0, 1, 100, 101 characters, whitespace-only, 100 and 101 emoji); `task-service.test.js` "createTask with an invalid title raises ValidationError and writes nothing"; `api-create.test.js` "invalid fields give 400 with field messages and write nothing", "the title is trimmed and a title of 100 characters is accepted" | M-10, M-12 |
| AC-2 | Description (max 500), priority (default Medium) and due date are optional | FR-3, FR-4, FR-5 | `validation.test.js` (description 500 and 501, priority values and default); `task.test.js` "createTaskRecord builds an Open task..."; `api-create.test.js` "defaults apply: priority Medium, empty description, no due date" | M-12 |
| AC-3 | Due date in the past is rejected with a clear message | FR-6, NFR-11 | `dates.test.js`; `validation.test.js` (yesterday, today, tomorrow, 2026-02-30); `task-service.test.js` "createTask rejects a due date in the past and uses the injected clock for 'today'"; `api-create.test.js` "a due date of today is accepted and is not overdue" | M-11 |
| AC-4 | New task appears at the top with status Open | FR-7, FR-8, FR-10 | `task.test.js` "createTaskRecord builds an Open task with id, createdAt and no completedAt"; `api-create.test.js` "POST /api/tasks creates a task and returns 201 with the stored fields and overdue"; `api-list-filter.test.js` "the order is newest created first, also after creating through the API" | M-2, M-13 |

### US-002 View and filter the task list

| AC | Criterion | FR / NFR | Automated tests | Browser |
|----|-----------|----------|-----------------|---------|
| AC-1 | List shows title, priority, due date and status | FR-9, FR-10 | `api-list-filter.test.js` "GET /api/tasks returns 200 with tasks newest first and the unfiltered total", "every task has the stored fields and a boolean overdue flag"; `filters.test.js` (newest first); `view-model.test.js` "describeTask gives plain text labels for priority, due date and status" | M-1, M-2 |
| AC-2 | Status, priority and overdue filters, combinable; clear shows the full list | FR-11, FR-12, FR-13, FR-14, FR-15 | `filters.test.js` "status filter", "priority filter", "filters combine with AND"; `validation.test.js` (`validateFilters`); `api-list-filter.test.js` "each filter alone", "filters combine with AND", "an empty value means the filter is not set", "overdue=false and other overdue values give 400"; `api-client.test.js` (`buildListQuery`) | M-4, M-5 (FR-15 is browser only) |
| AC-3 | Overdue open tasks are visually highlighted | FR-13, FR-16, NFR-8, NFR-11 | `task.test.js` (`isOverdue`: open, due today, completed, no date); `filters.test.js` "a task due today and a Completed past-due task are not overdue"; `api-list-filter.test.js` "overdue is true only for an Open task due before today", "a task due today becomes overdue after midnight without a restart"; `view-model.test.js` "an overdue open task gets the Overdue text badge and an icon"; `ui-markup.test.js` "every text colour pair has a contrast ratio of at least 4.5:1" | M-6, M-28 |
| AC-4 | Empty-state message instead of a blank screen | FR-17 | `view-model.test.js` (empty-state tests: "No tasks yet" and "No tasks match your filters"); `api-list-filter.test.js` "total ignores filters, so an empty result can be told from an empty store", "an empty store gives an empty list and a total of 0" | M-3 |

### US-003 Edit a task

| AC | Criterion | FR / NFR | Automated tests | Browser |
|----|-----------|----------|-----------------|---------|
| AC-1 | Same validation rules as creation | FR-19, FR-34 | `validation.test.js` (`validateTaskUpdate`); `task-service.test.js` "updateTask with invalid fields raises ValidationError and changes nothing", "updateTask accepts an unchanged past due date and rejects a changed one"; `api-edit.test.js` "invalid values give 400 with field messages and change nothing", "an unchanged past due date is accepted", "a changed past due date is rejected, a future date and null are accepted" | M-15 |
| AC-2 | Saving updates in place and refreshes the list | FR-18, FR-20 | `task.test.js` (`applyUpdate` keeps id, createdAt, status); `task-service.test.js` "updateTask changes only the four editable fields and keeps id, createdAt and status"; `api-edit.test.js` "PUT replaces the four fields and keeps id, createdAt, status and completedAt", "an edit does not change the position of the task in the list" | M-14, M-16 |
| AC-3 | Editing a task that no longer exists shows "Task not found" | FR-21 | `task-service.test.js` "updateTask of an unknown id raises NotFoundError and writes nothing"; `error-mapper.test.js` "a NotFoundError maps to 404 NOT_FOUND 'Task not found' without fields"; `api-edit.test.js` "GET of an unknown id gives 404 NOT_FOUND", "PUT of an unknown id gives 404 and writes nothing", "editing a task that was deleted gives 404"; `concurrency.test.js` "a delete that arrives first makes the racing edit of the same task give 404"; `view-model.test.js` (`NOT_FOUND` gives "Task not found") | M-18 |
| AC-4 | Cancelling the edit leaves the task unchanged | FR-22 | None (UI only, no request is sent; accepted risk AR-3) | M-17 |

### US-004 Mark a task complete or reopen it

| AC | Criterion | FR / NFR | Automated tests | Browser |
|----|-----------|----------|-----------------|---------|
| AC-1 | One action moves a task between Open and Completed | FR-23, FR-28 | `task.test.js` (`applyStatus`); `task-service.test.js` (`setStatus` tests, including "setStatus of an unknown id raises NotFoundError and writes nothing"); `api-status.test.js` "completing an Open task sets status Completed and completedAt from the clock", "reopening a Completed task clears completedAt", "an unknown id gives 404 NOT_FOUND and writes nothing" | M-19, M-21 |
| AC-2 | Completed tasks show a completion timestamp and are visually distinct | FR-24, FR-25, NFR-8 | `api-status.test.js` (completedAt from the clock); `view-model.test.js` "the completion time is shown in the requested local time zone", "a completed task gets the Completed text, an icon and strike-through"; `ui-markup.test.js` "the stylesheet styles overdue and completed tasks and struck-through titles" | M-19, M-28 |
| AC-3 | Reopening clears the completion timestamp | FR-26 | `task.test.js` "applyStatus back to Open clears completedAt"; `api-status.test.js` "reopening a Completed task clears completedAt" | M-20 |
| AC-4 | The status change persists after reload | FR-27, FR-33 | `api-status.test.js` "the new status is still there after a new server starts on the same file (FR-27)"; `persistence.test.js` "created, edited, completed and deleted tasks survive a restart on the same file"; `task-store.test.js` "a saved file can be loaded by a new store (restart)" | M-20 (page reload) |

### US-005 Delete a task

| AC | Criterion | FR / NFR | Automated tests | Browser |
|----|-----------|----------|-----------------|---------|
| AC-1 | Confirmation prompt before delete | FR-29 | `ui-markup.test.js` "the confirmation dialog is a named native dialog with Cancel and Delete buttons" (markup only) | M-22 (behaviour is browser only) |
| AC-2 | Confirming removes the task from the list and storage | FR-30, FR-33 | `task-service.test.js` "deleteTask removes only that task and returns nothing"; `api-delete.test.js` "DELETE returns 204 with no body", "the task is gone from the list, from GET by id and from the file", "the delete is still there after a new server starts on the same file (FR-30)"; `persistence.test.js` (restart test) | M-24 |
| AC-3 | Cancelling keeps the task | FR-31 | None (UI only; accepted risk AR-3) | M-23 |
| AC-4 | Deleting a task that is already gone shows "Task not found" | FR-32 | `task-service.test.js` "deleting the same task twice raises NotFoundError the second time"; `api-delete.test.js` "a second delete of the same task gives 404 NOT_FOUND", "an unknown id gives 404 and writes nothing"; `concurrency.test.js` "two racing deletes of one task give exactly one 204 and one 404" | M-25 |

### Non-functional requirements

| NFR | Verified by | Result |
|-----|-------------|--------|
| NFR-1 | `api-security.test.js` (CSP and headers); `api-create.test.js` "a title with markup is stored and returned as plain text"; `ui-markup.test.js` "app.js never builds markup from strings or runs strings as code (NFR-1)"; browser M-7 | Pass |
| NFR-2 | `validation.test.js`; `json-body.test.js`; `api-security.test.js` (Host, Origin, content type, body limit) | Pass |
| NFR-3 | `config.test.js` "no .env file is read"; `error-mapper.test.js` (log lines); code review (no secrets, no `.env` access); no `.env` file was touched in this step | Pass |
| NFR-4, NFR-5 | `performance.test.js` (p95 within 200 ms and 300 ms for 1,000 tasks); browser M-9 (render of 1,000 rows) | Pass (see note N-2 in section 7) |
| NFR-6 | `validation.test.js`; `view-model.test.js` (`describeError`); browser M-10, M-11 | Pass (CR-4 is a known gap for network errors) |
| NFR-7 | `ui-markup.test.js` (labels, `aria-describedby` structure, live region, focusable heading, `:focus-visible`); browser M-26, M-27 | Pass |
| NFR-8 | `ui-markup.test.js` (text 4.5:1, borders and focus 3:1); browser M-6, M-28 (measured in the rendered page) | Pass |
| NFR-9 | `task-store.test.js`; `persistence.test.js` "a forced write failure leaves memory and file unchanged, and the next save works"; `concurrency.test.js` | Pass |
| NFR-10 | `task-store.test.js` (load checks); `persistence.test.js`; `server-startup.test.js` "a corrupt data file does not stop the server..."; browser M-8 | Pass |
| NFR-11 | `dates.test.js`; `filters.test.js`; `api-list-filter.test.js` "a task due today becomes overdue after midnight without a restart" | Pass |
| NFR-12 | `npm test`: 480 tests including every boundary (title 0, 1, 100, 101; description 500, 501) | Pass |

### Coverage by test file

| Layer | File | Tests |
|-------|------|-------|
| Integration | `api-create.test.js` | 17 |
| Integration | `api-delete.test.js` | 13 |
| Integration | `api-edit.test.js` | 21 |
| Integration | `api-list-filter.test.js` | 20 |
| Integration | `api-security.test.js` | 30 |
| Integration | `api-status.test.js` | 16 |
| Integration | `concurrency.test.js` | 7 |
| Integration | `performance.test.js` | 2 |
| Integration | `persistence.test.js` | 8 |
| Integration | `server-startup.test.js` | 13 |
| Unit | `api-client.test.js` | 21 |
| Unit | `config.test.js` | 9 |
| Unit | `dates.test.js` | 9 |
| Unit | `error-mapper.test.js` | 15 |
| Unit | `errors.test.js` | 6 |
| Unit | `filters.test.js` | 15 |
| Unit | `json-body.test.js` | 15 |
| Unit | `task-service.test.js` | 50 |
| Unit | `task-store.test.js` | 68 |
| Unit | `task.test.js` | 19 |
| Unit | `ui-markup.test.js` | 27 |
| Unit | `validation.test.js` | 47 |
| Unit | `view-model.test.js` | 32 |
| | Total | 480 (147 integration, 333 unit) |

Each file was also run on its own; every file reports 0 failures. The per-file counts add up to 480.

## 4. Raw test output

Commands were run from the project root. Exit codes were read from the shell after each command.

### 4.1 `npm test`

Exit code 0. The first lines, the last lines and the summary are shown. The run prints one `✔` line for each of the 480 tests; the lines between are left out here.

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

### 4.2 `npm run test:scripts`

Exit code 0.

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

### 4.3 `npm run check`

Exit code 0. The script (`scripts/validate-workspace.mjs`) checks the frontmatter of agents, prompts, instructions and skills, and that each hook script in `.github/hooks/hooks.json` exists.

```text
> todo-application@0.1.0 check
> node scripts/validate-workspace.mjs

Workspace check passed.
```

## 5. Manual browser checklist

How it was run: a throwaway script outside the repository started `node src/server.js` on a temporary data file and drove headless Chrome 156.0.8078.80 (Windows) over the DevTools protocol. It used real clicks, real key events (Tab, Shift+Tab, Enter, Space, Arrow keys, Escape) and the page's own code. A second tab was simulated by sending `DELETE` requests directly to the API. The script, its data files and the browser profile were removed afterwards. Last run: 78 checks, 78 pass, 0 fail. The first two runs reported failures that were mistakes in the script, not in the product: a wrong expected list position, a log filter that counted deliberate 4xx and 5xx answers as problems, and reading the page before the list refresh had finished. They were fixed in the script and the run was repeated until it was clean. The product code was not changed.

| ID | Source | Check | Result | Evidence |
|----|--------|-------|--------|----------|
| M-1 | T-26, FR-9 | List shows title, priority, due date and status for each task | Pass | Rows read "Priority: High", "Due 2020-01-01", "Status: Open" |
| M-2 | FR-10 | Newest created first; an edited task keeps its place | Pass | Third > Second > First; edited task stayed at the bottom |
| M-3 | T-26, FR-17 | "No tasks yet" for an empty store; "No tasks match your filters" when tasks exist but none match; count line "Showing 0 of 9 tasks" | Pass | Both messages shown, not a blank screen |
| M-4 | T-26, FR-11..FR-14 | Status, priority and overdue filters work alone and combine with AND | Pass | Completed only; overdue only; High + overdue; Completed + overdue gives no match |
| M-5 | T-26, FR-15 | "Clear filters" resets all controls and shows the full list | Pass | Controls empty and 9 of 9 tasks shown |
| M-6 | T-26, FR-16, FR-25 | Overdue and Completed cues use text and icon, not colour alone; a completed past-due task is not overdue | Pass | "⚠ Overdue", "✔ Completed", strike-through (`line-through`) |
| M-7 | T-26, NFR-1 | Title `<script>window.__xss=1</script>`, description `<img src=x onerror=...>` and title `<script>alert(1)</script>` appear as text | Pass | No script ran, no `<img>` created, 0 dialogs opened |
| M-8 | T-26, NFR-10 | Corrupt store: banner names the file path, the file is not changed, a create is refused, and a repaired file loads on window focus without restart | Pass | Banner text "Your task file cannot be read: ...tasks.json. It was not changed. ..." |
| M-9 | T-26, NFR-5 | 1,000 rows render within 300 ms | Pass | See the timing table below |
| M-10 | T-27, FR-2, NFR-6 | Empty title: error next to the title, `aria-invalid`, `aria-describedby="title-error"`, `role="alert"`, focus moves to the title | Pass | "Enter a title." |
| M-11 | T-27, FR-6 | Past due date: message next to the date field; entered values stay | Pass | "Due date cannot be in the past." |
| M-12 | T-27, FR-1, FR-3 | 101-character title rejected; 100 accepted; whitespace-only rejected; 501-character description rejected | Pass | "Title must be 100 characters or fewer." |
| M-13 | T-27, FR-7 | Valid task appears at the top; form resets; "Task added."; focus returns to the title | Pass | Due date of today accepted |
| M-14 | T-28, FR-18 | Edit form is pre-filled, switches to "Edit task" and "Save changes", focus on the title | Pass | `Seed overdue open|old one|High|2020-01-01|Save changes` |
| M-15 | T-28, A-6, FR-19 | Saving an edit that keeps a past due date works without touching the date; a changed past date is rejected | Pass | Task kept "Due 2020-01-01" and the Overdue badge |
| M-16 | T-28, FR-20 | Edit saves in place, "Task saved.", focus returns to the task's Edit button | Pass | |
| M-17 | T-28, FR-22 | Cancelling an edit sends no request, restores the add form and leaves the task unchanged | Pass | Recorded requests: `[]`; server data unchanged |
| M-18 | T-28, FR-21 | Saving an edit of a deleted task, and opening an edit of a deleted task, both show "Task not found", close the form and refresh the list | Pass | |
| M-19 | T-29, FR-23, FR-24, FR-25 | One click completes (one `PUT .../status`, then one list refresh); completion time in local time; check icon, text and strike-through | Pass | "Completed on Nov 5, 2026, 7:09 PM" for UTC 13:39:54Z (local IST 19:09) |
| M-20 | T-29, FR-26, FR-27 | Reopen clears the completion time on screen and in storage; a completed status survives a page reload | Pass | `completedAt` is `null` after reopen |
| M-21 | T-29, FR-28 | Toggling a deleted task shows "Task not found" and refreshes | Pass | |
| M-22 | T-30, FR-29 | Delete opens a modal dialog that names the task; focus starts on Cancel | Pass | `matches(':modal')` was true |
| M-23 | T-30, FR-31 | Cancel keeps the task, sends no `DELETE` request and returns focus to the Delete button | Pass | Recorded requests: `[]` |
| M-24 | T-30, FR-30, FR-33 | Confirm removes the task from the list, from the API and from the data file | Pass | "Task deleted." |
| M-25 | T-30, FR-32 | Deleting an already-deleted task shows "Task not found", closes the dialog and refreshes | Pass | |
| M-26 | NFR-7 | Keyboard only: create a task (type, arrow key for priority, Enter on Add task); Space completes; Delete opens the dialog; focus stays in the dialog; Escape closes it and returns focus; Tab to Delete and Enter confirms; Enter on Edit opens the form; Cancel is reachable | Pass | Focus order in the dialog: delete-cancel > delete-confirm > body > delete-cancel |
| M-27 | NFR-7, T-26 | Tab order is logical (title, description, priority, due date, Add task, three filters, Clear filters, task buttons); focus is visible; buttons have accessible names such as "Mark complete: Keyboard task" | Pass | Focus outline `solid 3px` |
| M-28 | NFR-8, T-25 | Contrast measured in the rendered page | Pass | Lowest probed text ratio 6.62:1 (primary button); Overdue badge 8.11:1; Completed badge 6.93:1; focus outline 10.04:1 against its background (needs 3:1) |
| M-29 | General | No script exception, `console.error` or CSP violation during the session | Pass | The log shows 15 expected network lines: deliberate 400, 404 and 500 answers, and one `/favicon.ico` 404 (note N-1) |

M-26 detail: when the focus left the last dialog button, it passed through the page body before returning to Cancel. No element behind the dialog received focus.

M-9 timing (1,000 seeded tasks, 7 runs of "Clear filters" from a 500-row list; "DOM" is the time until all 1,000 rows are in the list; "painted" is the time until the second animation frame after that):

| Run | DOM (ms) | Painted (ms) |
|-----|----------|--------------|
| 1 | 153.1 | 280.2 |
| 2 | 83.3 | 198.1 |
| 3 | 116.9 | 237.6 |
| 4 | 87.7 | 188.4 |
| 5 | 88.1 | 197.0 |
| 6 | 133.8 | 238.2 |
| 7 | 68.1 | 164.9 |

Initial page load with 1,000 rows: all rows present 476 ms after the navigation started (includes loading the page, scripts and the list).

## 6. Document quality check

Run by a throwaway read-only script plus searches. Files checked: `docs/sdlc/architecture.md`, `code-review.md`, `design-review.md`, `impl-plan.md`, `requirements.md`, `docs/user-stories/user-stories.md`, `README.md`, `CHANGELOG.md`.

| Check | Result |
|-------|--------|
| No placeholder text in the documents (open-work markers, "to be decided" markers, filler text) | Pass: 0 hits. The word "todo" appears only in the application name and in names such as `todo-confluence`. |
| No open-work markers in `src/` or `tests/` | Pass: 0 hits |
| File paths named in backticks resolve | Pass: 134 paths checked, 0 unresolved. Runtime path `data/tasks.json` is skipped because the directory is created at run time. |
| Markdown links resolve | Pass, nothing to check: the original documents contain no Markdown links, only backticked paths |
| Every FR (34) and NFR (12) is covered by at least one task | Pass: 0 requirements without a task (`impl-plan.md` task table, ranges expanded) |
| Every FR and NFR has a test or a manual check in `impl-plan.md` section 4 | Pass: 0 without a row. Three rows are manual only: FR-15, FR-22 with FR-31, and FR-29 (accepted risk AR-3). They are executed in section 5. |
| Test files named in the plan exist | Pass: 0 missing. All 23 test files are named in the plan. |
| All 35 tasks are Done | Pass: T-1..T-35 have status Done |
| Every acceptance criterion maps to an FR | Pass: all 4 criteria of each of the 5 stories are referenced by at least one FR |
| `docs/user-stories/user-stories.md` is in step with `user-stories.json` | Spot check only: all five story ids and sample criteria are present. The file was not regenerated. |
| Diagrams use Mermaid | Not re-checked in this step (checked in the design review) |
| Test layout in `architecture.md` section 7 matches the repository (CR-10) | **Drift confirmed**, see below |

CR-10 confirmed. Section 7 of `architecture.md` does not list these 9 files that exist in the repository:

| File | Listed in plan assumption PA-1 |
|------|-------------------------------|
| `tests/unit/errors.test.js` | Yes |
| `tests/unit/config.test.js` | Yes |
| `tests/unit/json-body.test.js` | Yes |
| `tests/unit/api-client.test.js` | Yes |
| `tests/unit/ui-markup.test.js` | Yes |
| `tests/integration/server-startup.test.js` | Yes |
| `tests/helpers/start-test-server.js` | Yes |
| `src/http/request-error.js` | No (new finding, same drift) |
| `src/storage/store-file-check.js` | No (new finding, same drift) |

No file listed in the layout is missing from the repository. Per the hand-over, `architecture.md` was not edited in this step. PQ-1 expected the layout update at this step; it stays open (section 7, K-8).

Other document notes (Low, no change made):

- D-1: the status lines are out of date. `impl-plan.md` says "Draft v0.1, awaiting user approval", `design-review.md` says "awaiting user approval" and `code-review.md` says "awaiting user decision on OQ-CR-1". All 35 tasks are Done and the user has decided OQ-CR-1.
- D-2: `impl-plan.md` PA-3 does not yet record the accepted `app.js` deviation. The decision is recorded in this file only.
- D-3: `code-review.md` section 9 says CR-3 and CR-4 are best fixed before or during step 7. They were left open by user decision.

## 7. Known issues, deviations and observations

No new High, Medium or Critical defect was found. The two Low code-review findings below were reproduced.

| ID | Severity | Status | Description | Repro steps and result |
|----|----------|--------|-------------|------------------------|
| K-1 (CR-1) | Medium | Accepted deviation (OQ-CR-1) | `src/public/app.js` has 485 lines; PA-3 says to split it at about 300 lines. | Not a defect. The user accepted it. Browser behaviour of the file was fully exercised in section 5. |
| K-2 (CR-3) | Low | Open, reproduced | A successful `DELETE` (204) has no `Cache-Control: no-store` header. Architecture 6.3 says API responses send it. | 1. Start the server on a temporary data file. 2. `POST /api/tasks` with `{"title":"repro"}`. 3. `DELETE /api/tasks/<id>`. Result: `204`, `cache-control: null`. A second `DELETE` gives `404` with `no-store`, and `GET /api/tasks` gives `200` with `no-store`. No data is exposed by a 204. |
| K-3 (CR-4) | Low | Open, reproduced | The UI shows "Something went wrong. Try again." when the server cannot be reached. The specific client message is not shown (NFR-6). | 1. Create the API client with a `fetch` that throws. 2. `listTasks({})` returns `{ code: "NETWORK_ERROR", message: "The app could not be reached. Check that it is running, then try again." }`. 3. `describeError` of that error returns `"Something went wrong. Try again."`. |
| K-4 (CR-5) | Low | Open | Test helpers (`seedTask`, fixed clock, `withServer`) are copied across integration test files. | Code review finding; not re-checked. |
| K-5 (CR-6) | Low | Open | `app.js` compares with the literal `'Completed'` instead of the exported `COMPLETED`. | Code review finding; not re-checked. |
| K-6 (CR-7..CR-9) | Info | No change needed | First-run test relies on cached `firstRun`; performance margin; no `npm start` script. | See `code-review.md`. |
| K-7 (CR-2) | Low | Closed by this step | UI-only items had no automated test. | Executed in section 5 (M-17, M-18, M-21..M-26). The repository still has no automated browser test (AR-3). |
| K-8 (CR-10) | Info | Open | `architecture.md` section 7 does not list 9 existing files. | Section 6 above. |
| N-1 | Info | New | The browser asks for `/favicon.ico`. The server answers `404` with a JSON `ROUTE_NOT_FOUND` body. This adds one red line to the browser console on every page load. No functional effect. | Open the page with the developer tools console open. |
| N-2 | Info | New | In headless Chrome without a GPU, the painted frame after rendering 1,000 rows took up to 280.2 ms against the 300 ms target (NFR-5). DOM insertion took 68 to 153 ms. The target is met, but the margin for the painted frame is small on this software-rendered setup. | Section 5, M-9. A non-headless run on a slower machine was not done. |

## 8. Not executed or not verified

| Item | Status | Reason |
|------|--------|--------|
| OQ-CR-2: `npm test` and the quoted glob `"tests/**/*.test.js"` on Node 20 | **Not verified** | Only Node v26.4.0 is installed. No Node 20 runtime and no version manager (nvm, fnm, volta) is present, and Docker is not available. A Node 20 runtime would have to be downloaded from the network; this was not done without approval. `package.json` allows Node 20 and later (`engines`), and PA-5 assumes the glob works there. This assumption is unproven. Risk: if Node 20 does not expand the quoted pattern itself, `npm test` and `npm run test:scripts` fail on Node 20. Proposed next step: run `npm test` once on a Node 20 runtime and record the result here. |
| Other browsers: Firefox, Safari, Edge | Not executed | Only Chrome 156 was used. The README lists the latest two versions of Chrome, Edge, Firefox and Safari as supported. Native `<dialog>` focus handling can differ by browser. |
| Screen reader announcements (`aria-live`, `role="alert"`) | Not executed | No assistive technology available. Only the attributes and the focus behaviour were checked. |
| Operating system high-contrast or forced-colours mode, zoom and small screens | Not executed | Outside the checklist. The cues use text and icons, so they do not rely on colour. |
| Tab left open across midnight (AR-1) | Not executed | Accepted risk. The list refreshes on focus and after each action. |
| A real second browser tab | Simulated | Deletion in "another tab" was sent as direct `DELETE` requests to the API. |
| `npm audit` | Not run | No dependencies and no lockfile (code review section 5). |
| Rendering time on a real GPU or a slow device | Not executed | Headless Chrome with `--disable-gpu` only. |

## 9. Open questions

| ID | Question | Proposed answer (used until answered) |
|----|----------|---------------------------------------|
| VQ-1 | Should a Node 20 run be done before release (OQ-CR-2)? | Yes. Run `npm test` and `npm run test:scripts` on Node 20 and add the output to section 4. Until then Node 20 support is unproven. |
| VQ-2 | Should the architecture layout (K-8) and the stale status lines (D-1, D-2) be updated now? | Yes, as a small documentation change in the pull request step. They were not changed here. |
| VQ-3 | Should CR-3 and CR-4 be fixed before merge? | They are Low. Fix them in a follow-up change with a test each (204 header case; `NETWORK_ERROR` in `describeError`). |

## 10. Result

**Pass.** All 480 tests, 6 script tests and the workspace check pass. 20 of 20 acceptance criteria are traced to tests or to executed browser checks. 78 of 78 browser checks pass. No placeholder text and no broken path was found. No new High, Medium or Critical defect was found.

Conditions on this result:

- Node 20 was not tested (OQ-CR-2). The result applies to Node v26.4.0.
- Only Chrome was used for the browser checks.
- Known issues K-2 to K-5 and K-8 remain open by user decision.
