# Design Review - To Do Application

Status: Review complete, awaiting user approval
Date: 2026-11-05
Scope: US-001, US-002, US-003, US-004, US-005
Reviewed: `docs/sdlc/architecture.md` v0.1 against `docs/sdlc/requirements.md` (final; FR-1..FR-34, NFR-1..NFR-12, A-1..A-13)
Reviewer: Design reviewer agent

## 1. Summary

The v0.1 design is sound in its main choices: one Node.js process, no runtime dependencies, an in-memory list backed by one atomically written JSON file, and validation in a pure domain layer. Every FR and NFR maps to a component and a test.

The review found 17 findings: 2 High, 9 Medium and 6 Low. The High findings are both gaps in the contract between layers, not wrong technology choices:

- DR-1: the write queue serialises file writes, but the lookup and the change are not inside it, so two quick requests can lose an update.
- DR-2: the API does not return `overdue`. The UI would have to compute "today" in the browser, which breaks NFR-11 and makes FR-13 and FR-16 untestable.

No finding requires a change of technology, delivery form or directory structure.

Review checklist result:

| Area | Result |
|------|--------|
| Requirement coverage | All FR and NFR covered. One interpretation gap (NFR-10, missing file) - DR-5. |
| Security | Sound baseline (loopback bind, CSP, `textContent`, Host check). Origin check and cache headers added - DR-10. |
| Error handling | Missing codes for unknown route or method, and weak recovery for a corrupt file - DR-6, DR-11. |
| Data integrity | Lost-update race, platform behaviour of rename, load-time invariants - DR-1, DR-7, DR-9. |
| Testability | Good (injected clock, fake store). Gaps in concurrency and performance test method - DR-1, DR-14. |
| Scalability | Adequate for 1,000 tasks (A-8). Whole-file rewrite is covered by the performance test (R-7). |
| Simplicity | No component removed. Layout is small enough for five stories - DR-17. |

## 2. Findings

Severity: High = would cause wrong behaviour, data loss or an untestable requirement if built as drafted. Medium = real risk or ambiguity that is cheap to fix now. Low = hardening or clarity.

| ID | Severity | Area | Finding | Recommendation | Decision |
|----|----------|------|---------|----------------|----------|
| DR-1 | High | Data integrity | Section 6.2 says the service builds the new list, saves it, then swaps memory, and the store queues writes. Only the file write is queued. Lookup and change are done earlier in the service. Two requests that arrive together (double click, two tabs) both read the same list, and the second save silently drops the first change (lost update). The same gap lets a delete and an edit both pass the "exists" check (NFR-9, FR-21, FR-32). | Replace the store's "serialise writes" with `store.mutate(fn)`. It runs `fn(currentTasks)` inside the queue, saves the result, then swaps memory. The service does lookup, validation and change inside `fn`. Add a concurrency test. | Accepted (AD-1) |
| DR-2 | High | Requirement coverage, consistency | The API task shape does not include `overdue`. Section 4.1 says it is derived and section 6.5/R-1 says the server computes it, but nothing says it is sent. `view-model.js` would then need to compare `dueDate` with the browser's "today". That creates a second definition of today (NFR-11), and FR-13 and FR-16 could differ between filter and highlight. | Every task the API returns carries a boolean `overdue`, computed by the server with `todayLocal`. The browser never computes "today". `view-model.test.js` feeds `overdue` as input. | Accepted (AD-2) |
| DR-3 | Medium | Requirement coverage | The edit form would normally use `<input type="date" min=today>` or browser constraint validation. Either one blocks saving an unchanged past due date, which A-6 explicitly allows. | The form uses `novalidate` and the date input has no `min`. The server is the only authority for the past-date rule. Add to the manual checklist: edit a task with a past due date and save without touching the date. | Accepted (AD-3) |
| DR-4 | Medium | API contract | `PUT /api/tasks/:id` does not say whether it replaces or patches. If a missing `priority` took the create default (Medium), an edit would silently change priority (FR-20 says only the edited fields change). A missing `dueDate` could mean "keep" or "clear". | `PUT` is a full replacement of the four editable fields. `title`, `description`, `priority` and `dueDate` (string or `null`) are all required on edit. A missing key is a validation error. Defaults apply only on create. | Accepted (AD-4) |
| DR-5 | Medium | Requirement coverage | NFR-10 says a corrupted or missing store shall be reported with a clear message. The draft treats a missing file as an empty store without a message. On first run that is correct, but if the user deletes the file the next start silently looks like data loss. | Treat a missing file as first run (the only way to start without a file). Create the file at startup and print one console line with the full path. Show no UI banner. Record this as an interpretation of NFR-10 for the user to confirm. | Proposed (OQ-6); applied as default |
| DR-6 | Medium | Error handling | On a corrupt file every call returns `STORE_CORRUPT` and the file is never overwritten, so the app is unusable. The message gives no path and no recovery step. The store loads only at start, so after the user fixes the file they must also restart. | The banner names the file path and says to fix, move or delete the file and then reload the page. While the store is corrupt, each request retries the load, so a repaired file is picked up without a restart. An unreadable file (permission error) uses the same code with its own message. | Accepted (AD-5) |
| DR-7 | Medium | Data integrity | "Temp file then rename" is incomplete. (a) The data directory may not exist. (b) Without `fsync` of the temp file, a power loss can leave an empty file after the rename on some file systems (R-4 is then not fully mitigated). (c) On Windows, `rename` over an existing file can fail with `EPERM` or `EBUSY` when antivirus or an indexer briefly holds the file. This repository is developed on Windows. (d) Leftover temp files after a crash are never cleaned. | Create the directory with `mkdir` recursive. Write the temp file in the same directory, `fsync` it, then rename. Retry the rename up to 3 times with 20 ms and 50 ms waits on `EPERM`, `EBUSY` or `EACCES`, then fail with `STORE_WRITE_FAILED`. Delete a stale `*.tmp` file at start. | Accepted (AD-6) |
| DR-8 | Medium | Validation | "Characters" is not defined. JavaScript `string.length` counts UTF-16 units, so one emoji counts as 2. The boundary tests (100, 101) would pass for the wrong reason and the UI `maxlength` attribute (also UTF-16) would block input that the server accepts. Trimming of the description is not stated (A-4 covers only the title). | Count Unicode code points (`Array.from(s).length`) on the server. The UI does not set `maxlength`; the server error is shown next to the field. The title is trimmed (A-4); the description is stored as typed. Add boundary tests with an emoji. | Proposed (OQ-5); applied as default |
| DR-9 | Medium | Data integrity | The load-time "shape check" is not defined. A hand-edited file could hold duplicate ids, an Open task with `completedAt`, a Completed task without it, a bad date or an over-long title. These would later break filters or the overdue test. | Define the check: root object with `version` 1 and an array `tasks`; each task passes the same field rules as creation (without the past-date rule); ids are unique; `completedAt` is `null` exactly when status is Open; `createdAt` and `completedAt` are valid ISO 8601. Any failure marks the store corrupt. Unknown task keys are rejected. | Accepted (AD-7) |
| DR-10 | Medium | Security | The Host check blocks DNS rebinding and the JSON content type forces a preflight, but there is no explicit `Origin` check and no response for a failed Host check. API responses have no cache or referrer headers. The CSP blocks inline styles, which the UI design must respect. | On write requests, if `Origin` is present it must be `http://127.0.0.1:<port>` or `http://localhost:<port>`. Host or Origin failure returns 403 `FORBIDDEN`. Send `Cache-Control: no-store` on API responses and `Referrer-Policy: no-referrer` on all. State that the UI uses no inline `style` attribute or inline script. | Accepted (AD-8) |
| DR-11 | Low | Error handling | The error model has no code for an unknown route or an unsupported method. `NOT_FOUND` is mapped by the UI to "Task not found", which would be wrong for a bad URL. | Add `ROUTE_NOT_FOUND` (404) and `METHOD_NOT_ALLOWED` (405, with `Allow` header). The UI shows "Task not found" only for `NOT_FOUND`. | Accepted (AD-9) |
| DR-12 | Low | API contract | Query handling is undefined for empty values (`?status=`), repeated keys, `overdue=false` and unknown keys. The table shows `?status=&priority=&overdue=`, which suggests empty values are normal. | An empty value means "filter not set". `overdue` accepts only `true`; the UI omits it when off. A repeated key, an unknown key or any other value returns 400 `VALIDATION_ERROR`. | Accepted (AD-10) |
| DR-13 | Low | Security | The 16 KB limit does not say how it is enforced. Reading the whole body and then checking its size, or trusting only `Content-Length`, lets a chunked body use memory. | Count bytes while reading. Stop at 16 KB and return 413. Do not rely on `Content-Length` alone. Add a chunked-body test. | Accepted (AD-11) |
| DR-14 | Low | Testability | The performance test method is not defined (single run, which layer, which machine). One run on a shared machine is flaky. NFR-5 says "show results", but the render time of 1,000 rows in the browser has no check. | Call the HTTP API on loopback, repeat each operation 20 times and assert the 95th percentile against NFR-4 and NFR-5. Add a manual checklist item: render 1,000 tasks and confirm the list appears within 300 ms (browser performance panel). | Accepted (AD-12) |
| DR-15 | Medium | Usability, data safety | The default data file `data/tasks.json` is relative to the working directory. Starting the app from another folder (for example from an IDE or a shortcut) creates a second, empty file and looks like data loss. | Resolve the default path from the project root (derived from `import.meta.url` in `config.js`). `TODO_DATA_FILE` still overrides it. This refines OQ-2. | Proposed (OQ-2 revised); applied as default |
| DR-16 | Low | Error handling | Startup failures are not specified. Port 3000 in use would produce an unhandled `EADDRINUSE` stack trace. | `server.js` catches listen errors, prints one line (for example "Port 3000 is already in use. Set PORT to another value."), and exits with code 1. | Accepted (AD-13) |
| DR-17 | Low | Simplicity | The layout has 5 files in `src/http/` and 8 unit test files. This is more than the minimum, but each file has one job and the HTTP layer has no business rules. Merging them would make the HTTP layer harder to test. | No change. Do not add further layers (no repository interface, no DI container). | Closed, no change |

## 3. Agreed design decisions

The user cannot be consulted during this automated run. The two High findings were not discussed live. Decisions below are the reviewer's recommendations, applied to `architecture.md` v0.2 as defaults, and they need user confirmation at the approval gate. The user can reject any item and the architecture will be changed back.

| ID | Decision | Findings | Status |
|----|----------|----------|--------|
| AD-1 | The store exposes `mutate(fn)`. It is the only way to change tasks. Lookup, validation and change run inside it, and it is serialised. | DR-1 | Applied in v0.2; High, confirm at approval |
| AD-2 | The API returns `overdue` on every task. The browser never computes "today". | DR-2 | Applied in v0.2; High, confirm at approval |
| AD-3 | Edit form uses `novalidate` and no `min` on the date input. | DR-3 | Applied in v0.2 |
| AD-4 | `PUT /api/tasks/:id` replaces all four editable fields; all four keys are required. | DR-4 | Applied in v0.2 |
| AD-5 | Corrupt or unreadable store: banner with path and recovery step, reload retried on each request. | DR-6 | Applied in v0.2 |
| AD-6 | Atomic write: mkdir, same-directory temp file, `fsync`, rename with up to 3 attempts, stale temp cleanup at start. | DR-7 | Applied in v0.2 |
| AD-7 | Load-time check validates every task and the invariants listed in DR-9. | DR-9 | Applied in v0.2 |
| AD-8 | `Origin` check, 403 `FORBIDDEN`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. | DR-10 | Applied in v0.2 |
| AD-9 | New codes `ROUTE_NOT_FOUND` and `METHOD_NOT_ALLOWED`. | DR-11 | Applied in v0.2 |
| AD-10 | Query rules for empty, repeated, unknown and `overdue=false` values. | DR-12 | Applied in v0.2 |
| AD-11 | Streaming body size limit. | DR-13 | Applied in v0.2 |
| AD-12 | Performance test uses HTTP, 20 repetitions, 95th percentile; manual render check. | DR-14 | Applied in v0.2 |
| AD-13 | Listen errors give a one-line message and exit code 1. | DR-16 | Applied in v0.2 |
| AD-14 | Text length is counted in Unicode code points; no UI `maxlength`; description is not trimmed. | DR-8 | Applied as default, depends on OQ-5 |
| AD-15 | A missing data file is a first run: file created, one console line, no UI banner. | DR-5 | Applied as default, depends on OQ-6 |
| AD-16 | Default data file is `<project root>/data/tasks.json`. | DR-15 | Applied as default, depends on OQ-2 (revised) |

## 4. Open questions

These have a proposed assumption that is already applied in `architecture.md` v0.2. They are also listed in section 11 of that file.

| ID | Question | Proposed assumption (used until answered) |
|----|----------|-------------------------------------------|
| OQ-2 (revised) | The data file was `data/tasks.json` under the working directory. Is the project root acceptable instead? | `<project root>/data/tasks.json`, overridable with `TODO_DATA_FILE`; `data/` is git-ignored. |
| OQ-5 | Is "characters" in FR-1 and FR-3 counted as Unicode code points (so one emoji is one character)? | Yes, code points. |
| OQ-6 | NFR-10 says a missing store is reported. Is a silent first-run start (file created, one console line, no UI message) acceptable? | Yes. A missing file at start is treated as first run. |

## 5. Accepted risks

| ID | Risk | Why accepted | Linked finding |
|----|------|--------------|----------------|
| AR-1 | A browser tab left visible and untouched across midnight keeps showing old overdue flags until the next action, focus change or reload. | Single user (A-1). The list refreshes after every action and when the tab regains focus (R-1). A timer adds complexity for little value. | R-1 |
| AR-2 | Two server instances (different ports) using the same data file overwrite each other's changes. `store.mutate` protects only one process. | Single user, single device (A-1). A lock file is not justified. The README should say to run one instance. | DR-1, new R-8 |
| AR-3 | Browser-only requirements (focus order, dialog focus return, contrast, keyboard use, FR-22, FR-29, FR-31, render time) have only a manual checklist. | No browser automation tool is added (R-5). The logic behind the UI is covered by `view-model.test.js` and API tests. | R-5, DR-14 |
| AR-4 | The server's time zone defines "today" (for example through a remote session). | Out of scope by A-1 (R-2). | R-2 |
| AR-5 | Another program holding the data file for longer than the rename retries (about 70 ms) causes `STORE_WRITE_FAILED`. The change is rolled back and the user can retry. | Failing safe is correct (NFR-9). Longer waits would risk NFR-4. | DR-7 |
| AR-6 | Two tabs editing the same task: last write wins. | Unchanged from R-3. `store.mutate` prevents corruption and lost updates between different tasks. | R-3 |

## 6. Architecture changes made

All changes are in `docs/sdlc/architecture.md`, now version 0.2.

| Section | Change | Finding |
|---------|--------|---------|
| Header | Status set to "Draft v0.2 (revised after design review)"; input list names this review. | all |
| 2.1 Responsibilities | Updated Web UI, HTTP layer, Task service, Task store, Config and Entry point rows. | DR-1, DR-2, DR-3, DR-8, DR-10, DR-13, DR-15, DR-16 |
| 4.1 Task | Text length in code points; description not trimmed; `overdue` is returned by the API. | DR-2, DR-8 |
| 4.2 File format | Default path from project root; first-run handling; load-time invariants; directory and temp file handling. | DR-5, DR-7, DR-9, DR-15 |
| 4.3 Today | Browser never computes "today". | DR-2 |
| 5.1 API surface | `PUT` is full replacement; query rules; `overdue` in every task. | DR-2, DR-4, DR-12 |
| 5.2 Sequence | `store.mutate` replaces `save`; write step includes `fsync`. | DR-1, DR-7 |
| 6.1 Validation | Code points; required keys on edit; empty date string rejected. | DR-4, DR-8 |
| 6.2 Error model | New codes `FORBIDDEN`, `ROUTE_NOT_FOUND`, `METHOD_NOT_ALLOWED`; new corrupt and write-failure messages; behaviour rules rewritten. | DR-1, DR-6, DR-7, DR-10, DR-11 |
| 6.3 Security | Origin check, cache and referrer headers, no inline style or script, streaming body limit. | DR-10, DR-13 |
| 6.4 Accessibility | `novalidate` form and no `min` on the date input. | DR-3 |
| 6.5 Performance | Test method and manual render check. | DR-14 |
| 7 Directory layout | Added `concurrency.test.js`; data path note. | DR-1, DR-15 |
| 8 Testing approach | Added concurrency, chunked body, emoji boundary and Windows-rename retry tests. | DR-1, DR-7, DR-8, DR-13 |
| 9 Traceability | NFR-9 and NFR-11 rows updated. | DR-1, DR-2 |
| 10 Risks | R-1 and R-3 updated; R-8, R-9 added. | DR-1, DR-7 |
| 11 Open questions | OQ-2 revised; OQ-5 and OQ-6 added. | DR-5, DR-8, DR-15 |
| 12 Revision history | Version 0.2 row added. | all |

## 7. Approval

Next step: the user approves `design-review.md` and `architecture.md` v0.2, or rejects any decision AD-1..AD-16. Then step 4 (implementation plan) starts.
