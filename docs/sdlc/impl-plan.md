# Implementation Plan - To Do Application

Status: Draft v0.1, awaiting user approval
Date: 2026-11-05
Scope: US-001, US-002, US-003, US-004, US-005
Inputs: `docs/sdlc/requirements.md` (FR-1..FR-34, NFR-1..NFR-12), `docs/sdlc/architecture.md` v0.2, `docs/sdlc/design-review.md` (AD-1..AD-16; OQ-2, OQ-5 and OQ-6 defaults accepted by the user)

## 1. How to read this plan

- Tasks are numbered T-1..T-35 and ordered so that a task only depends on lower numbers.
- Every task includes its own test files. Code and tests are done together and the task is not done until its tests pass with `npm test`.
- Paths follow the layout in architecture section 7. Six small additions to the test layout are listed in section 5 (PA-1).
- Priority: P0 = needed for the High stories (US-001, US-002, US-004) and for the core of the system. P1 = US-003, US-005, hardening and non-functional tests. P2 = documentation and final checks.
- Size: S = under 1 hour, M = 1 to 3 hours, L = more than 3 hours. No task is larger than M.
- Status values: Not started, In progress, Done, Blocked.
- Coding standards (`.github/instructions/coding-standards.instructions.md`) apply to every task in `src/` and `tests/`: small single-purpose functions, shared helpers instead of duplicated logic, validation of every external input, explicit user-friendly errors, no secrets in code or logs, and unit tests for the happy path, validation failures and Not Found.
- No `.env` file is read, created or changed by any task (NFR-3).
- The implementer asks for approval before each task (see `implementer` agent).

## 2. Task table

### 2.1 Foundation and domain (no I/O)

| Task | Description | Files touched | Requirements | Priority | Depends on | Size | Status |
|------|-------------|---------------|--------------|----------|------------|------|--------|
| T-1 | Project setup: add the `test` script `node --test "tests/**/*.test.js"` to `package.json` and add `data/` to `.gitignore`. No other `package.json` change and no dependency. | `package.json`, `.gitignore` | NFR-3, NFR-12 | P0 | none | S | Done |
| T-2 | Error types `ValidationError` (with a `fields` map), `NotFoundError` ("Task not found") and `StoreError` (with a code `STORE_CORRUPT` or `STORE_WRITE_FAILED`). | `src/domain/errors.js`, `tests/unit/errors.test.js` | FR-21, FR-28, FR-32, NFR-6, NFR-10 | P0 | T-1 | S | Done |
| T-3 | Date helpers: `todayLocal(clock)`, `isValidCalendarDate`, `isBefore` for `YYYY-MM-DD`. One definition of "today". | `src/domain/dates.js`, `tests/unit/dates.test.js` | FR-6, FR-13, NFR-11 | P0 | T-1 | S | Done |
| T-4 | Create validation: `validateNewTask(input, today)` plus small shared field validators (title, description, priority, due date, unknown keys, type checks). All errors are collected in one pass. | `src/domain/validation.js`, `tests/unit/validation.test.js` | FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-34, NFR-2, NFR-6 | P0 | T-2, T-3 | M | Done |
| T-5 | Remaining validators: `validateTaskUpdate(input, existing, today)` (all four keys required, unchanged past date accepted), `validateStatus`, `validateFilters` (empty value means not set, `overdue` accepts only `true`, repeated or unknown keys rejected). Reuses the T-4 helpers. | `src/domain/validation.js`, `tests/unit/validation.test.js` | FR-11, FR-12, FR-13, FR-19, FR-34, NFR-2, NFR-6 | P0 | T-4 | M | Done |
| T-6 | Task record functions: `createTaskRecord` (UUID, status Open, `createdAt`, `completedAt` null), `applyUpdate` (keeps id, `createdAt`, status), `applyStatus` (sets or clears `completedAt`; same status is a no-op), `isOverdue`. | `src/domain/task.js`, `tests/unit/task.test.js` | FR-7, FR-8, FR-13, FR-20, FR-23, FR-24, FR-26, NFR-11 | P0 | T-3 | M | Done |
| T-7 | Filter and order: `filterTasks` (status, priority, overdue combined with AND) and newest-first ordering of a creation-ordered list. | `src/domain/filters.js`, `tests/unit/filters.test.js` | FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, NFR-11 | P0 | T-6 | S | Done |

### 2.2 Storage and service

| Task | Description | Files touched | Requirements | Priority | Depends on | Size | Status |
|------|-------------|---------------|--------------|----------|------------|------|--------|
| T-8 | Task store, load side: read the file with an injectable file-system layer, apply the load check (version, exact keys, field rules, unique ids, `completedAt` invariant, ISO dates), first-run creation of directory and empty file, deletion of a stale `*.tmp`, `STORE_CORRUPT` for invalid or unreadable files, load retry on each call while corrupt. | `src/storage/task-store.js`, `tests/unit/task-store.test.js` | FR-33, NFR-10, AD-7, AD-15 | P0 | T-2, T-4 | M | Done |
| T-9 | Task store, write side: `mutate(fn)` with a one-at-a-time promise queue; save with temp file in the same directory, `fsync`, rename; rename retried up to 3 attempts (20 ms, 50 ms) on `EPERM`, `EBUSY`, `EACCES`; then `STORE_WRITE_FAILED` and temp file removed; memory replaced only after a successful save. | `src/storage/task-store.js`, `tests/unit/task-store.test.js` | FR-27, FR-30, FR-33, NFR-9, AD-1, AD-6 | P0 | T-8 | M | Done |
| T-10 | Task service, create and read: `createTask`, `listTasks` (returns `{ tasks, total }`, newest first), `getTask`. Every returned task has the `overdue` flag. Clock injected. | `src/services/task-service.js`, `tests/unit/task-service.test.js` | FR-1..FR-10, FR-34, NFR-11, AD-2 | P0 | T-5, T-6, T-7, T-9 | M | Done |
| T-11 | Task service, change: `updateTask`, `setStatus`, `deleteTask`. Lookup, validation and change run inside one `store.mutate` call; a missing task raises `NotFoundError` and writes nothing. | `src/services/task-service.js`, `tests/unit/task-service.test.js` | FR-18..FR-21, FR-23..FR-28, FR-30, FR-32, FR-34, NFR-9, AD-1 | P1 | T-10 | M | Done |

### 2.3 Configuration and HTTP layer

| Task | Description | Files touched | Requirements | Priority | Depends on | Size | Status |
|------|-------------|---------------|--------------|----------|------------|------|--------|
| T-12 | Config: read `PORT` (default 3000, validated) and `TODO_DATA_FILE`; default file `<project root>/data/tasks.json` resolved from `import.meta.url`. Reads no `.env` file. | `src/config.js`, `tests/unit/config.test.js` | NFR-3, AD-16 | P0 | T-1 | S | Done |
| T-13 | JSON body reader: byte count while reading, limit 16 KB, content type `application/json` on write requests, JSON syntax check. | `src/http/json-body.js`, `src/http/request-error.js`, `tests/unit/json-body.test.js` | NFR-2, AD-11 | P0 | T-2 | S | Done |
| T-14 | Error mapper: domain and store errors to status code and the error body shape; all codes of architecture 6.2; no stack trace in the body; log code and message only. | `src/http/error-mapper.js`, `tests/unit/error-mapper.test.js` | FR-21, FR-28, FR-32, NFR-2, NFR-3, NFR-6, NFR-10, AD-9 | P0 | T-2 | S | Done |
| T-15 | Static file server: fixed allow-list of files under `src/public/`, content types, no URL-to-path join, security headers (CSP, `nosniff`, `Referrer-Policy`). The directory is injectable for tests. | `src/http/static-files.js`, `tests/integration/api-security.test.js` | NFR-1, NFR-3, AD-8 | P0 | T-1 | S | Done |
| T-16 | HTTP app core: request handler, router with `ROUTE_NOT_FOUND` and `METHOD_NOT_ALLOWED` (`Allow` header), `Host` and `Origin` checks (`FORBIDDEN`), `Cache-Control: no-store` on API responses. Adds the test helper that starts the real app on port 0 with a temporary data file. | `src/http/app.js`, `tests/helpers/start-test-server.js`, `tests/integration/api-security.test.js` | NFR-1, NFR-2, NFR-3, AD-8, AD-9 | P0 | T-9, T-10, T-13, T-14, T-15 | M | Done |
| T-17 | Route `POST /api/tasks` (US-001). | `src/http/app.js`, `tests/integration/api-create.test.js` | FR-1..FR-8, FR-34 | P0 | T-10, T-16 | S | Done |
| T-18 | Route `GET /api/tasks` with `status`, `priority`, `overdue` query rules and `total` (US-002). | `src/http/app.js`, `tests/integration/api-list-filter.test.js` | FR-9..FR-14, FR-17, NFR-11, AD-10 | P0 | T-10, T-16 | M | Done |
| T-19 | Routes `GET /api/tasks/:id` and `PUT /api/tasks/:id` (US-003). | `src/http/app.js`, `tests/integration/api-edit.test.js` | FR-18..FR-21, FR-34, AD-4 | P1 | T-11, T-16 | M | Not started |
| T-20 | Route `PUT /api/tasks/:id/status` (US-004). | `src/http/app.js`, `tests/integration/api-status.test.js` | FR-23, FR-24, FR-26, FR-27, FR-28 | P0 | T-11, T-16 | S | Not started |
| T-21 | Route `DELETE /api/tasks/:id` (US-005). | `src/http/app.js`, `tests/integration/api-delete.test.js` | FR-30, FR-32, FR-33 | P1 | T-11, T-16 | S | Not started |
| T-22 | Entry point: wire config, clock, store, service and app; bind to `127.0.0.1`; print one line with the data file path on first run; on a listen error print one line and exit with code 1. Export a start function so tests can run it. | `src/server.js`, `tests/integration/server-startup.test.js` | NFR-3, NFR-10, AD-13, AD-15 | P0 | T-12, T-17..T-21 | M | Not started |

### 2.4 Web UI

| Task | Description | Files touched | Requirements | Priority | Depends on | Size | Status |
|------|-------------|---------------|--------------|----------|------------|------|--------|
| T-23 | View model (pure functions, no DOM): labels, Overdue badge and icon, Completed text, icon and strike-through flag, local completion time, empty-state message choice using `total`, and error-code to user message mapping (corrupt store, write failure, generic, "Task not found"). Takes `overdue` from the API and never computes "today". | `src/public/view-model.js`, `tests/unit/view-model.test.js` | FR-16, FR-17, FR-24, FR-25, NFR-6, NFR-8, AD-2, AD-5, AD-9 | P0 | T-1 | M | Not started |
| T-24 | API client: `fetch` wrapper that returns data or a structured error (`code`, `message`, `fields`), and sends a JSON body with the right content type. Fetch is injected for tests. | `src/public/api-client.js`, `tests/unit/api-client.test.js` | NFR-2, NFR-6 | P0 | T-1 | S | Not started |
| T-25 | Static page and styles: `index.html` (labelled form, `novalidate`, date input without `min`, no `maxlength`, filter bar, list, empty state, `<dialog>`, `aria-live="polite"` region, banner area) and `styles.css` (`:focus-visible`, contrast of at least 4.5:1, no inline style or script). | `src/public/index.html`, `src/public/styles.css`, `tests/unit/ui-markup.test.js`, `tests/integration/api-security.test.js` | FR-16, FR-25, NFR-1, NFR-7, NFR-8, AD-3, AD-14 | P0 | T-15, T-16 | M | Not started |
| T-26 | UI shell, list and filters: load and render the list with `textContent` and one document fragment, status, priority and overdue filters, clear filters, empty states, message region and banners, refresh when the tab regains focus. | `src/public/app.js` | FR-9, FR-10, FR-15, FR-16, FR-17, NFR-1, NFR-5, NFR-7, AD-5 | P0 | T-18, T-22, T-23, T-24, T-25 | M | Not started |
| T-27 | UI create form (US-001): submit, field errors next to fields with `aria-describedby` and `role="alert"`, focus on the first invalid field, keep values on error, reset and refresh on success. | `src/public/app.js` | FR-1, FR-2, FR-7, NFR-6, NFR-7 | P0 | T-17, T-26 | M | Not started |
| T-28 | UI edit (US-003): open an edit form from a task (loads the task with `GET`), save with `PUT`, cancel leaves the task unchanged, "Task not found" closes the form and refreshes. | `src/public/app.js` | FR-18, FR-19, FR-20, FR-21, FR-22, NFR-6, NFR-7 | P1 | T-19, T-27 | M | Not started |
| T-29 | UI toggle (US-004): one button per task sends the opposite status; shows the completion time; "Task not found" refreshes the list. | `src/public/app.js` | FR-23, FR-24, FR-25, FR-26, FR-28, NFR-7, NFR-8 | P0 | T-20, T-26 | S | Not started |
| T-30 | UI delete (US-005): confirmation `<dialog>` with `showModal()`, focus returns to the trigger on close, confirm sends `DELETE`, cancel changes nothing, 404 is shown as a message and the list refreshes. | `src/public/app.js` | FR-29, FR-30, FR-31, FR-32, NFR-7 | P1 | T-21, T-26 | S | Not started |

### 2.5 Cross-cutting tests, documentation and final gate

| Task | Description | Files touched | Requirements | Priority | Depends on | Size | Status |
|------|-------------|---------------|--------------|----------|------------|------|--------|
| T-31 | Persistence tests: data survives a server restart on the same file; a corrupt file gives `STORE_CORRUPT` and is not overwritten; a repaired file works without restart; a forced write failure leaves memory and file unchanged; a missing file is a first run. | `tests/integration/persistence.test.js` | FR-27, FR-30, FR-33, NFR-9, NFR-10 | P1 | T-9, T-21, T-22 | M | Not started |
| T-32 | Concurrency tests: parallel creates keep every task; parallel edits of different tasks keep every change; delete racing an edit of one task gives one success and one 404; the file stays valid. | `tests/integration/concurrency.test.js` | NFR-9, FR-21, FR-32, AD-1 | P1 | T-19, T-20, T-21 | S | Not started |
| T-33 | Performance test: seed 1,000 tasks, call the HTTP API on loopback, repeat each operation 20 times, assert the 95th percentile within 200 ms (create, edit, toggle, delete) and 300 ms (list and filter). | `tests/integration/performance.test.js` | NFR-4, NFR-5, AD-12 | P1 | T-17..T-21 | S | Not started |
| T-34 | Documentation: README run instructions (start command, `PORT`, `TODO_DATA_FILE`, data file location, run one instance only, supported browsers) and a CHANGELOG entry. | `README.md`, `CHANGELOG.md` | NFR-3 (AR-2) | P2 | T-22 | S | Not started |
| T-35 | Final gate: run `npm test`, `npm run test:scripts` and `npm run check`; confirm every FR and NFR in section 4 has a passing test or a manual checklist item; hand over to the verification step. | none (run only) | NFR-12 | P2 | T-1..T-34 | S | Not started |

## 3. Acceptance and test checks

Each check must pass before the task status becomes Done.

| Task | Acceptance and test checks |
|------|----------------------------|
| T-1 | `package.json` has the `test` script and no new dependency. `git check-ignore data/tasks.json` reports the path. `npm test` runs once T-2 exists. |
| T-2 | Each error type carries its code and message. `ValidationError.fields` is a plain object. `NotFoundError` message is "Task not found". |
| T-3 | `todayLocal` returns the local date from a fixed clock, including a time just before and just after local midnight. `2026-02-30` and `2026-13-01` are invalid. `2024-02-29` is valid. `isBefore` is false for equal dates. |
| T-4 | Title lengths 0, 1, 100 and 101 give reject, accept, accept, reject. Whitespace-only title is rejected. 100 emoji accepted, 101 rejected (code points). Description 500 accepted, 501 rejected. Priority outside Low, Medium, High is rejected; missing priority becomes Medium. Due date yesterday rejected, today and tomorrow accepted, `""` rejected. Wrong types and unknown keys rejected. Several errors are returned together. |
| T-5 | Edit with a missing key returns "This field is required." for that key. An unchanged past due date is accepted; a changed past date is rejected. `status`, `id` or `createdAt` in an edit gives "Unknown field.". `validateStatus` accepts only Open and Completed. `validateFilters` accepts empty values, `overdue=true`; rejects `overdue=false`, repeated keys, unknown keys and unknown values. |
| T-6 | A new record has a UUID, status Open, `completedAt` null and a valid `createdAt`. `applyUpdate` keeps id, `createdAt`, status and `completedAt`. `applyStatus` to Completed sets `completedAt`; back to Open clears it; the same status keeps the old `completedAt`. `isOverdue` is true only for an Open task with a due date before today. A task due today is not overdue. A Completed past-due task is not overdue. |
| T-7 | Each filter alone, all three combined (AND), and no filter. Result order is newest created first, with and without filters. An edit does not change position. Empty input gives an empty list. |
| T-8 | Valid file loads. Each load-check failure marks the store corrupt: bad JSON, version 2, missing `tasks`, extra task key, duplicate id, Open task with `completedAt`, Completed task without it, bad date, title over 100. Missing file creates the directory and an empty store. Stale `*.tmp` is deleted. A permission error gives `STORE_CORRUPT` with the unreadable message. A corrupt file is not modified. After repair, the next call loads it. |
| T-9 | `mutate` saves and then swaps memory. Two parallel `mutate` calls run one after the other and both changes persist. Rename fails twice with `EPERM`, then succeeds: the save works. Rename fails every time: `STORE_WRITE_FAILED`, memory and file unchanged, temp file removed. A function that throws leaves data unchanged. The temp file is in the data directory. |
| T-10 | Create returns a task with `overdue` and status Open. Invalid input raises `ValidationError` and writes nothing. `listTasks` returns newest first and `total` equals the unfiltered count. `getTask` of an unknown id raises `NotFoundError`. A fixed clock moved past midnight turns a due-today task into overdue without a restart. Service is called without the UI (FR-34). |
| T-11 | Update changes only the four fields and keeps status. Invalid update changes nothing. Update, status change and delete of an unknown id raise `NotFoundError` and write nothing. Setting the same status keeps `completedAt`. Delete removes the task from the store. Editing a Completed task keeps it Completed. |
| T-12 | Defaults: port 3000 and the project-root data path regardless of the working directory. Environment values override both. Invalid `PORT` gives a clear error. No `.env` file is read. |
| T-13 | A body over 16 KB sent in chunks without `Content-Length` is stopped and gives `PAYLOAD_TOO_LARGE`. A wrong content type gives `UNSUPPORTED_MEDIA_TYPE`. Malformed JSON gives `VALIDATION_ERROR`. A valid body is returned as an object. |
| T-14 | Each error type maps to the status and code in architecture 6.2. Unknown errors map to `INTERNAL` with no stack trace. A validation error carries `fields`. The log line has only code and message. |
| T-15 | Only allow-listed files are served. `/../server.js` and encoded traversal return 404. Responses have the CSP, `X-Content-Type-Options` and `Referrer-Policy` headers with the exact values from architecture 6.3. |
| T-16 | Unknown path gives 404 `ROUTE_NOT_FOUND`, never `NOT_FOUND`. Known path with an unsupported method gives 405 with `Allow`. Foreign `Host` gives 403. Foreign `Origin` on a write gives 403; a missing `Origin` is allowed. API responses have `Cache-Control: no-store`. The helper starts and stops the app on port 0 with a temporary file. |
| T-17 | `201` with the new task. Invalid title, description, priority and past due date give `400` with `fields`. Empty body, wrong content type and unknown key are rejected. The file contains the task after success and is unchanged after failure. `<script>` in the title is stored and returned as plain text. |
| T-18 | `200` with `{ tasks, total }` and `overdue` on every task. Filter combinations, empty value, `overdue=true`, `overdue=false` (400), repeated key (400), unknown key (400). `total` ignores filters. A due-today task is not overdue; a Completed past-due task is not overdue. |
| T-19 | `GET` returns the task or 404 `NOT_FOUND`. `PUT` returns `200` and keeps id, `createdAt` and status. Missing key, unknown key and invalid values give 400 and change nothing. An unchanged past due date is accepted. Edit of a deleted task gives 404. |
| T-20 | Complete sets `completedAt`; reopen clears it; repeated complete keeps the first `completedAt`. Invalid status gives 400. Unknown id gives 404. The new status is still there after a new server starts on the same file (FR-27). |
| T-21 | `204` and the task is gone from the list and the file. Second delete gives 404 `NOT_FOUND`. Other tasks are unchanged. |
| T-22 | Server listens on `127.0.0.1` only. First run prints one line with the full path. Port in use prints "Port <n> is already in use. Set PORT to another value." and exits with code 1 (tested with a child process). Corrupt store: the server still starts and answers `STORE_CORRUPT`. |
| T-23 | Overdue input gives badge text "Overdue" and an icon. Completed input gives text "Completed", an icon and strike-through. Completion time is formatted in local time. The empty-state message is "No tasks yet" when `total` is 0 and "No tasks match your filters" otherwise. Each error code maps to the message in architecture 6.2; only `NOT_FOUND` gives "Task not found". Module imports in Node without a DOM. |
| T-24 | Success returns data. An error response returns `code`, `message` and `fields`. A network failure returns a generic error. Write calls send `Content-Type: application/json`. |
| T-25 | Markup test: form has `novalidate`; date input has no `min`; no `maxlength`; no inline `style`, `<script>` body or `on*` attributes; every input has a label; dialog and live region exist. `GET /` and `GET /styles.css` return 200 with the CSP header. Contrast is checked in the manual checklist. |
| T-26 | Manual: list shows title, priority, due date and status. Filters combine and "Clear filters" restores the full list. Both empty states appear. A title of `<script>alert(1)</script>` is shown as text. Overdue cue is visible without colour. Corrupt-store banner shows the path. Tab order is logical with visible focus. 1,000 rows render within 300 ms. |
| T-27 | Manual: empty title shows the error next to the title and focus moves there. A past date shows its message. Values stay after an error. A valid task appears at the top. Works by keyboard only. |
| T-28 | Manual: edit form is pre-filled. Saving a task with a past due date without touching the date succeeds. Cancel leaves the task unchanged and sends no request. Editing a task deleted in another tab shows "Task not found" and refreshes. |
| T-29 | Manual: one click completes and reopens. Completed task shows the local completion time, check icon and strike-through. Toggle on a deleted task shows "Task not found". Works by keyboard only. |
| T-30 | Manual: Delete opens the dialog; focus is trapped and returns to the trigger on close. Cancel keeps the task. Confirm removes it. Delete of an already deleted task shows "Task not found" and refreshes. |
| T-31 | All five scenarios in the task description pass using temporary files. The corrupt file bytes are identical before and after the test. |
| T-32 | After 50 parallel creates, 50 tasks exist. Parallel edits of different tasks all persist. Racing delete and edit gives exactly one `2xx` and one 404. The file parses and passes the load check. |
| T-33 | The test passes on the developer machine. The report prints the p95 time of each operation. The test has no fixed sleeps. |
| T-34 | README lists commands and variables exactly as implemented and warns to run one instance. CHANGELOG has an entry for the first release. No secrets in either file. |
| T-35 | All three commands exit with code 0. A traceability table in the hand-over note shows each FR and NFR with a test or checklist item. |

## 4. Requirement coverage

Every FR and NFR is covered by at least one task and one test or manual check.

| Requirement | Tasks | Tests or checks |
|-------------|-------|-----------------|
| FR-1, FR-2 | T-4, T-10, T-17, T-27 | validation.test.js, task-service.test.js, api-create.test.js, T-27 manual |
| FR-3, FR-4, FR-5 | T-4, T-6, T-17 | validation.test.js, task.test.js, api-create.test.js |
| FR-6 | T-3, T-4 | dates.test.js, validation.test.js |
| FR-7, FR-8 | T-6, T-10, T-17, T-27 | task.test.js, api-create.test.js |
| FR-9, FR-10 | T-7, T-10, T-18, T-26 | filters.test.js, api-list-filter.test.js |
| FR-11, FR-12, FR-13, FR-14 | T-5, T-6, T-7, T-18 | validation.test.js, filters.test.js, api-list-filter.test.js |
| FR-15 | T-26 | T-26 manual |
| FR-16, FR-25 | T-23, T-25, T-26, T-29 | view-model.test.js, ui-markup.test.js, T-26 and T-29 manual |
| FR-17 | T-18, T-23, T-26 | api-list-filter.test.js, view-model.test.js, T-26 manual |
| FR-18, FR-19, FR-20 | T-5, T-6, T-11, T-19, T-28 | validation.test.js, task.test.js, task-service.test.js, api-edit.test.js |
| FR-21, FR-28, FR-32 | T-2, T-11, T-14, T-19, T-20, T-21 | task-service.test.js, error-mapper.test.js, api-edit.test.js, api-status.test.js, api-delete.test.js |
| FR-22, FR-31 | T-28, T-30 | T-28 and T-30 manual (no request is sent) |
| FR-23, FR-24, FR-26 | T-6, T-11, T-20, T-23, T-29 | task.test.js, api-status.test.js, view-model.test.js |
| FR-27, FR-30, FR-33 | T-8, T-9, T-11, T-21, T-31 | task-store.test.js, api-delete.test.js, persistence.test.js |
| FR-29 | T-30 | T-30 manual |
| FR-34 | T-4, T-5, T-10, T-11 | task-service.test.js (calls the service without the UI) |
| NFR-1 | T-15, T-16, T-25, T-26 | api-security.test.js, ui-markup.test.js, T-26 manual |
| NFR-2 | T-4, T-5, T-13, T-16 | validation.test.js, json-body.test.js, api-security.test.js |
| NFR-3 | T-1, T-12, T-14, T-15, T-16 | config.test.js, error-mapper.test.js, api-security.test.js, code review |
| NFR-4, NFR-5 | T-33 (T-26 manual for render time) | performance.test.js, T-26 manual |
| NFR-6 | T-4, T-14, T-23, T-27 | validation.test.js, view-model.test.js, T-27 manual |
| NFR-7, NFR-8 | T-23, T-25, T-26..T-30 | view-model.test.js, ui-markup.test.js, manual checklist |
| NFR-9 | T-9, T-31, T-32 | task-store.test.js, persistence.test.js, concurrency.test.js |
| NFR-10 | T-8, T-22, T-31 | task-store.test.js, server-startup.test.js, persistence.test.js |
| NFR-11 | T-3, T-6, T-7, T-18 | dates.test.js, task.test.js, filters.test.js, api-list-filter.test.js |
| NFR-12 | all tasks, T-35 | `npm test` |

Story view:

| Story | Backend tasks | UI tasks |
|-------|---------------|----------|
| US-001 | T-4, T-6, T-10, T-17 | T-27 |
| US-002 | T-5, T-7, T-10, T-18 | T-23, T-26 |
| US-003 | T-5, T-11, T-19 | T-28 |
| US-004 | T-6, T-11, T-20 | T-29 |
| US-005 | T-11, T-21 | T-30 |

## 5. Plan assumptions

| ID | Assumption | Reason |
|----|------------|--------|
| PA-1 | Six test files are added to the layout in architecture section 7: `tests/unit/errors.test.js`, `config.test.js`, `json-body.test.js`, `api-client.test.js`, `ui-markup.test.js`, and `tests/integration/server-startup.test.js`. A helper `tests/helpers/start-test-server.js` is also added; it is not matched by the `*.test.js` pattern. | Coding standards require tests for every feature. These modules have no test file in the layout. |
| PA-2 | The store takes its file-system functions as a parameter with Node's `fs/promises` as the default. | Needed for the rename-failure and write-failure tests in architecture section 8. |
| PA-3 | `src/public/app.js` is built up over T-26..T-30 in one file. If it passes about 300 lines, split it by feature with the same tests. | The architecture lists one UI wiring file. |
| PA-4 | The manual checklist items in T-25..T-30 become the checklist in `verification.md` (step 7). They are not a separate document. | Architecture section 8. |
| PA-5 | Node's `--test` glob works with Node 20 or later on Windows and Linux. `npm test` is first run after T-2 so that the pattern matches a file. | `package.json` engines. |

## 6. Blocked tasks

No task is blocked by an external party or an open decision. Every task below waits only for earlier tasks.

| Task | Blocked by | Note |
|------|------------|------|
| T-8 | T-2, T-4 | The load check reuses the field rules. |
| T-9 | T-8 | Same file, write side. |
| T-10 | T-5, T-6, T-7, T-9 | Needs validation, records, filters and the store. |
| T-16 | T-9, T-10, T-13, T-14, T-15 | The test helper needs the real store and service. |
| T-17..T-21 | T-16 and T-10 or T-11 | Routes need the app core and the service. |
| T-22 | T-12, T-17..T-21 | Entry point wires all routes. |
| T-26 | T-18, T-22, T-23, T-24, T-25 | UI shell needs the list route, the running server and the helpers. |
| T-27..T-30 | T-26 and the matching route task | Each UI feature needs its route. |
| T-31 | T-9, T-21, T-22 | Needs restart ability. |
| T-35 | all other tasks | Final gate. |

Tasks that can run in parallel once T-1 is done: T-2, T-3, T-12, T-15, T-23, T-24. T-13 and T-14 need only T-2, so they can also run before the store is finished.

## 7. Critical path

T-1 -> T-2 -> T-4 -> T-5 -> T-10 (also needs T-6, T-7, T-9) -> T-11 -> T-16 -> T-19 -> T-22 -> T-26 -> T-27 -> T-28 -> T-35.

Store branch: T-2 -> T-4 -> T-8 -> T-9 -> T-10. This branch joins the critical path at T-10, so a delay in T-8 or T-9 delays everything after it.

Shortest path to a usable release of the High stories (US-001, US-002, US-004): T-1..T-18, T-20, T-23..T-25, T-12 and T-22, then T-26, T-27 and T-29. T-22 as written also waits for T-19 and T-21, so those routes are built before the entry point. US-003 (T-19, T-28) and US-005 (T-21, T-30) are P1 for the UI work and follow.

Size count: 18 S tasks and 17 M tasks; there is no L task.

## 8. Open questions

All questions have a proposed assumption that is used until the user answers.

| ID | Question | Proposed assumption |
|----|----------|---------------------|
| PQ-1 | Is it acceptable to add the six test files and one helper listed in PA-1 to the test layout in the architecture? | Yes. Architecture section 7 is updated with the extra files at the verification step. |
| PQ-2 | May T-34 edit `README.md` and `CHANGELOG.md`? | Yes. Only run instructions and one changelog entry are added. |
| PQ-3 | Should the implementer commit after each task or only at the end? | One commit per task, using the conventional message `T-n: <short description>`. No push without approval. |

## 9. Approval

Next step: the user approves this plan or asks for changes. After approval, step 5 (implementation) starts with T-1 and the implementer asks for approval before each task.
