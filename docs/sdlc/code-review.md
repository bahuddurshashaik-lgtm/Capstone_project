# Code Review - To Do Application

Status: Review complete, awaiting user decision on OQ-CR-1
Date: 2026-11-05
Scope: US-001..US-005, tasks T-1..T-35 (`docs/sdlc/impl-plan.md`)
Reviewed against: `requirements.md` (FR-1..FR-34, NFR-1..NFR-12), `architecture.md` v0.2, `design-review.md` (AD-1..AD-16), `.github/instructions/coding-standards.instructions.md`
Reviewer: Code reviewer agent (step 6). No file in `src/` or `tests/` was changed. No `.env` file was read.

## 1. Verdict

**Approve.** There are no High findings and no Critical findings. The code does what the requirements and the agreed design say. One Medium finding (CR-1) is a deviation from the implementation plan and needs a user decision (OQ-CR-1). The other findings are Low or Info and do not block step 7.

| Area | Verdict | Basis |
|------|---------|-------|
| Correctness | Approve | Every FR and NFR in section 3 maps to code and a test or a manual checklist item. API behaviour was also probed live (section 6). |
| Security | Approve | CSP, `textContent`, Host and Origin checks, streaming body limit, loopback bind, no secrets and no `.env` access. One Low gap (CR-3). |
| Error handling | Approve | Not found, empty list, corrupt store, write failure, bad JSON, bad route and bad method are all handled without a crash. One Low gap (CR-4). |
| Test coverage | Approve | 480 tests pass. Happy path, validation and Not Found are covered for every use case. Browser-only behaviour has no automated test (accepted risk AR-3, CR-2). |
| Code clarity | Changes requested (minor) | Small, well-named functions. `src/public/app.js` is 485 lines, above the plan's 300-line trigger (CR-1). |
| DRY | Approve | Production code has no avoidable duplication. Test helpers are repeated across files (CR-5, Low). |
| Dependency safety | Approve | `package.json` has no `dependencies` or `devDependencies`. `npm audit` cannot run and has nothing to check (section 5). |

## 2. Findings

Severity: High = wrong behaviour, data loss or security hole. Medium = real maintainability or plan deviation that should be decided before merge. Low = small gap or hardening. Info = observation, no change needed.

| ID | Severity | Area | File and symbol | Finding | Recommendation |
|----|----------|------|-----------------|---------|----------------|
| CR-1 | Medium | Code clarity | `src/public/app.js` (485 lines; whole file) | Impl-plan PA-3 says to split the file by feature if it passes about 300 lines. It is 485 lines and was not split. The file mixes DOM lookup (lines 49-83), message handling, list rendering, filters, create and edit form handling, toggle, and the delete dialog. Its logic (edit-mode state, refresh ticket, focus restore) is not reachable from Node tests. Splitting needs the allow-list in `src/http/static-files.js` (`ALLOWED_FILES`, `STATIC_PATHS`) and `api-security.test.js` (which lists the served files) to change in the same commit. `ui-markup.test.js` reads `STATIC_PATHS`, so it adapts and checks that every module import is allow-listed. | User decides (OQ-CR-1). Either split now into feature modules (for example list rendering, form and edit, delete dialog) and extend the allow-list and its tests, or record an accepted deviation in `impl-plan.md` PA-3. |
| CR-2 | Low | Test coverage | `src/public/app.js` (no automated test) | FR-22, FR-29, FR-31, the "Task not found" close-and-refresh path in the edit form (`handleTaskError`, `submitEdit`, `startEdit`), focus return after the delete dialog (`onDeleteDialogClosed`) and keyboard use are verified only by the manual checklist. This is the accepted risk AR-3 and R-5, so it is not a defect. | In step 7, run the manual checklist for exactly these items: FR-22, FR-29, FR-31, FR-21 in the edit form, FR-28 and FR-32 messages, saving an edit that keeps a past due date (A-6), dialog focus return, keyboard-only use, and 1,000-row render time. |
| CR-3 | Low | Security, consistency | `src/http/app.js` `toWireResponse` (line 112), `JSON_HEADERS` (line 9) | Architecture 6.3 says API responses send `Cache-Control: no-store`. The header is added only when a JSON body exists. A successful `DELETE` (204, no body) has no `Cache-Control` header. Confirmed by a live request. `api-security.test.js` (line 273) checks only error responses, so the gap is not caught. No data is exposed by a 204 response, so the impact is small. | Send `Cache-Control: no-store` on every `/api/` response, including 204, and add a 204 case to the header test. |
| CR-4 | Low | Error handling, usability | `src/public/view-model.js` `describeError` (lines 95-109, `default` branch); `src/public/api-client.js` `NETWORK_ERROR_MESSAGE` (line 7) | The API client builds specific messages for `NETWORK_ERROR` ("The app could not be reached...") and `UNEXPECTED_RESPONSE`. `describeError` ignores them and shows "Something went wrong. Try again." for every unknown code. The specific text is never shown. NFR-6 asks for specific messages. A stopped server is the most likely failure of a local app. | In `describeError`, use the client-supplied message for `NETWORK_ERROR` and `UNEXPECTED_RESPONSE`. Add a `view-model.test.js` case. |
| CR-5 | Low | DRY (tests) | `tests/integration/*.test.js` (`seedTask` in 7 files, `NOW` in 8 files, `withServer` in 8 files); `tests/unit/task-service.test.js` line 58 | The same seed builder, fixed clock and server wrapper are copied into many test files. A change to the task shape must be made in each copy. `tests/helpers/start-test-server.js` already exists as a shared home. | Move `seedTask`, the fixed clock and a `withServer` wrapper into `tests/helpers/`. Production code is not affected. |
| CR-6 | Low | DRY, clarity | `src/public/app.js` line 401; `src/public/view-model.js` lines 9-11; `src/storage/task-store.js` line 8 | `toggleTask` compares with the literal `'Completed'` although `view-model.js` exports `COMPLETED`. The write-failure text exists in both `view-model.js` (`WRITE_FAILED_TEXT`) and `task-store.js` (`WRITE_FAILED_MESSAGE`). The browser cannot import from `src/storage`, so the second copy is a fallback and is acceptable. | Import `COMPLETED` in `app.js`. Leave the fallback texts as they are. |
| CR-7 | Info | Test clarity | `tests/integration/persistence.test.js` lines 91-100 and 102-108 | The first-run test calls `server.store.initialize()` after the test helper already called it. It passes because `initialize()` returns the cached `firstRun` (`task-store.js` lines 45, 120, 143). The behaviour is also covered in `task-store.test.js` ("a missing file is a first run", line 96; "a second start ... is not a first run", line 115) and `server-startup.test.js` (first-run log line). The test is valid but depends on a store detail. | No change needed. Optionally add a comment in the test that the cached value is intended. |
| CR-8 | Info | Test robustness | `tests/integration/performance.test.js` | Measured p95 on this machine: 1.4 to 8.3 ms against budgets of 200 ms (writes) and 300 ms (reads). The margin is above 25 times. A p95 over 20 samples tolerates one slow sample. A flaky failure needs a heavily loaded runner. | No change needed. If a shared CI runner is used later, allow the budgets to be scaled by an environment variable. |
| CR-9 | Info | Delivery | `package.json` scripts | There is no `npm start` script. This matches architecture section 3 and OQ-4 (only `test` is added). The README documents `node src/server.js`. | No change needed. |
| CR-10 | Info | Documentation | `architecture.md` section 7 | The six extra test files and the helper from PA-1 are not yet in the architecture layout. PQ-1 says this is updated at the verification step. | Update the layout in step 7. |

## 3. Correctness against requirements

| Requirement | Where it is implemented | Tests | Result |
|-------------|------------------------|-------|--------|
| FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-34 | `src/domain/validation.js` (`validateNewTask`, `parseTitle`, `parseDescription`, `parsePriority`, `parseDueDate`); called from `task-service.js` `createTask` | `validation.test.js` (boundaries 0, 1, 100, 101 and 500, 501; emoji; whitespace; yesterday, today, tomorrow), `task-service.test.js`, `api-create.test.js` | Met |
| FR-7, FR-8 | `task.js` `createTaskRecord` (UUID, `Open`, `createdAt`); `filters.js` `newestFirst` | `task.test.js`, `api-create.test.js` | Met |
| FR-9, FR-10 | `task-service.js` `listTasks`; `filters.js` `newestFirst` (creation order reversed, edits do not move a task) | `filters.test.js`, `api-list-filter.test.js` | Met |
| FR-11..FR-14 | `filters.js` `filterTasks` (AND logic), `task.js` `isOverdue`, `validation.js` `validateFilters` (empty, repeated, unknown, `overdue=false`) | `filters.test.js`, `api-list-filter.test.js` | Met |
| FR-15, FR-17 | `public/app.js` `clearAllFilters`, `showEmptyState`; `view-model.js` `emptyStateMessage` (uses `total`) | `view-model.test.js`, `api-list-filter.test.js`; manual checklist | Met (UI part manual) |
| FR-16, FR-25, NFR-8 | `view-model.js` `statusCue` (text and icon), `styles.css` | `view-model.test.js`, `ui-markup.test.js` (contrast 4.5:1 text, 3:1 borders and focus) | Met |
| FR-18..FR-20 | `validation.js` `validateTaskUpdate` (full replacement, unknown keys rejected, unchanged past date accepted); `task.js` `applyUpdate`; `task-service.js` `updateTask` | `validation.test.js`, `task.test.js`, `api-edit.test.js` | Met |
| FR-21, FR-28, FR-32 | `NotFoundError` raised inside `store.mutate`; `error-mapper.js`; `public/view-model.js` `describeError`; `app.js` `handleTaskError` | `task-service.test.js`, `api-edit.test.js`, `api-status.test.js`, `api-delete.test.js` | Met |
| FR-22, FR-31 | `app.js` `cancelEdit`, `cancelDelete` (no request sent) | Manual checklist only | Met by design (CR-2) |
| FR-23, FR-24, FR-26 | `task.js` `applyStatus` (idempotent, keeps first `completedAt`, clears on reopen); `view-model.js` `formatCompletedAt` | `task.test.js`, `api-status.test.js`, `view-model.test.js` | Met |
| FR-27, FR-30, FR-33 | `task-store.js` `mutate` (save, then swap memory) | `task-store.test.js`, `persistence.test.js`, `api-delete.test.js` | Met |
| FR-29 | `index.html` `<dialog>`, `app.js` `askDelete`, `confirmDelete` | Manual checklist only | Met by design (CR-2) |
| NFR-1 | `app.js` uses `textContent` only (no `innerHTML`, `insertAdjacent`, `eval` found by search); CSP in `static-files.js` | `api-security.test.js`, `api-create.test.js` (markup title) | Met |
| NFR-2 | `validation.js`, `json-body.js`, `app.js` Host and Origin checks | `validation.test.js`, `json-body.test.js`, `api-security.test.js` | Met |
| NFR-3 | `config.js` reads only `PORT` and `TODO_DATA_FILE`; `error-mapper.js` `logError` logs code and message only | `config.test.js`, `error-mapper.test.js`, `api-create.test.js` line 251 | Met |
| NFR-4, NFR-5 | In-memory reads, one file rewrite per write | `performance.test.js` | Met (CR-8) |
| NFR-9 | `store.mutate` queue, temp file, `fsync`, rename with retry, save-then-swap | `task-store.test.js`, `persistence.test.js`, `concurrency.test.js` | Met |
| NFR-10 | `task-store.js` load check (`store-file-check.js`), reload while corrupt, first run, `server.js` keeps running on a corrupt file | `task-store.test.js`, `persistence.test.js`, `server-startup.test.js` | Met |
| NFR-11 | `dates.js` `todayLocal` is the only definition of "today"; the browser never computes it | `dates.test.js`, `filters.test.js` | Met |
| NFR-12 | 480 `node:test` tests, all boundaries present | `npm test` | Met |
| NFR-6, NFR-7 | Field errors with `aria-describedby`, `role="alert"`, first invalid field focused; native controls; `:focus-visible` | `ui-markup.test.js`; manual checklist | Met (CR-4 for network errors) |

Design decisions AD-1..AD-16 are all present in code: `store.mutate` (AD-1), `overdue` in every response (AD-2), `novalidate` and no `min` (AD-3, checked in `index.html`), full-replacement `PUT` (AD-4), corrupt-store recovery (AD-5), safe atomic write with retry (AD-6), load checks (AD-7), Origin and cache headers (AD-8, except CR-3), new error codes (AD-9), query rules (AD-10), streaming body limit (AD-11), listen error handling (AD-13), code-point counting (AD-14), first run (AD-15), project-root data path (AD-16).

## 4. Security, error handling and tests (detail)

Security checks that passed:

- Secrets: no secret, token or `.env` access in `src/`. `.gitignore` excludes `.env`, `.env.*` and `data/`.
- Input: every field is type-checked, trimmed (title only), length-limited by code points and range-checked. Unknown keys are rejected, including `__proto__` and `constructor`. Live probe result: `400` with "Unknown field." and no state change.
- Cross-site and rebinding: wrong `Host` gives 403. A foreign `Origin` on a write gives 403. A non-JSON content type gives 415. The listener binds to `127.0.0.1` only (`server.js` `LOOPBACK_HOST`, tested in `server-startup.test.js`).
- Path access: only six allow-listed files are served. Live probes with `/../../package.json` and `/..%2f..%2fpackage.json` returned `ROUTE_NOT_FOUND`.
- Body limit: counted while reading, with a `Content-Length` pre-check (`json-body.js`).
- Error responses never contain a stack trace. An unexpected error returns a generic message (`error-mapper.js`).

Error handling checks that passed: missing task on get, edit, status and delete (404 `NOT_FOUND`, nothing written); empty and non-matching lists (`total` drives the message); corrupt, unreadable and missing store; failed write with memory and file unchanged and the temp file removed; unknown route (404) and method (405 with `Allow`); malformed JSON (400); port in use (one line, exit 1).

Test quality: tests use a fixed clock, a temporary directory and the real HTTP server on port 0. Each use case has a happy-path, a validation-failure and a Not Found test. Concurrency tests cover parallel creates, edits and a delete racing an edit. Rename retry and write failure are tested with a fake file-system layer.

## 5. Dependency safety

| Check | Result |
|-------|--------|
| `package.json` dependencies | None. No `dependencies` or `devDependencies` key. |
| `npm audit` | Fails with `ENOLOCK`: there is no lockfile, because there is nothing to lock. With zero dependencies there is no vulnerable package to report. |
| Runtime requirement | `engines.node` is `>=20`. The code uses `Object.hasOwn`, `fs.rm` and `server.closeAllConnections`, which exist in Node 20. |
| Runtime used for the test run | Node v26.4.0 (see OQ-CR-2). |

Verdict: Approve.

## 6. Evidence

| Check | Result |
|-------|--------|
| `npm test` | 480 tests, 480 pass, 0 fail, about 2.3 s. |
| `node --test tests/integration/performance.test.js` | p95 create 8.3 ms, edit 6.2, toggle 7.4, delete 7.2, list 7.3, filter 1.4. |
| Live API probes (temporary data file, fixed clock 2026-11-05) | Create trims the title and returns `overdue`. Delete gives 204, then 404. `__proto__` and `constructor` keys give 400. A body of `[]` or `null` gives 400. Wrong `Host` gives 403. A repeated `status` query gives 400. A due date of yesterday gives 400. A due date of today gives 201. A 204 response has no `Cache-Control` (CR-3). |
| Search of `src/` for `innerHTML`, `outerHTML`, `insertAdjacent`, `eval(`, `localStorage`, inline `.style` | No matches. |
| File sizes | `src/public/app.js` 485 lines. All other source files are 199 lines or fewer. |

## 7. Points raised by the implementer

| Point | Assessment |
|-------|------------|
| `app.js` is 485 lines against PA-3 (about 300); allow-list fixed to six files | Confirmed. Recorded as CR-1 (Medium) with the cost of a split: the allow-list and `api-security.test.js` must change together. |
| `persistence.test.js` first-run check relies on `initialize()` returning the cached `firstRun` | Confirmed and valid. Recorded as CR-7 (Info). The behaviour is covered by two other test files. |
| Performance budgets may be flaky under load | Not confirmed. Margin is above 25 times. Recorded as CR-8 (Info). |
| No `npm start` script by design | Consistent with architecture OQ-4. Recorded as CR-9 (Info). |

## 8. Open questions

| ID | Question | Proposed answer (used until answered) |
|----|----------|---------------------------------------|
| OQ-CR-1 | Should `src/public/app.js` be split now (CR-1), or is the 485-line file accepted as a recorded deviation from PA-3? | Accept the deviation for this release and record it in `impl-plan.md` PA-3. The file is cohesive and sectioned, and a split changes the six-file allow-list and its tests. |
| OQ-CR-2 | Must `npm test` pass on Node 20, the lowest version in `engines`? The review ran on Node v26.4.0 only. The quoted glob in `"test": "node --test \"tests/**/*.test.js\""` (and the existing `test:scripts`) is expanded by Node itself, and this review did not verify that Node 20 does this. | Run `npm test` once on Node 20 in step 7 and record the result in `verification.md`. |

## 9. Next step

Step 7 (verify) can start. Before it starts, the user answers OQ-CR-1. CR-3 and CR-4 are small and are best fixed before or during step 7. CR-5 and CR-6 can follow.
