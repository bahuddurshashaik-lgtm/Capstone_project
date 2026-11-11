# Implementation Plan — EPMCDMETST-71468 (Mark task as Completed and persist completion status)

## 1. Story summary
As a user of the To Do application, I want to mark an existing task as **Completed** so I can track what I have finished, and the completion status must persist after refresh/restart.

## 2. Acceptance Criteria to satisfy
### AC1 — Mark as completed
- Given at least one task is displayed with status **Open**
- When the user marks that task as **Completed**
- Then the UI shows it as **Completed** and it is visually distinguishable

### AC2 — Persistence
- Given a task was marked **Completed**
- When the user refreshes the page or the server restarts
- Then the task still appears **Completed** (and completion timestamp remains)

### AC3 — Completed timestamp rule
- When a task is **Completed**, `completedAt` is set to a valid ISO 8601 timestamp
- When a task is **Open**, `completedAt` is `null`

## 3. What needs to be implemented (exact scope)
Only implement what is required to ensure the application supports:
1. A UI control per task to toggle **Open ↔ Completed**
2. Updating task `status` and `completedAt` according to the rules above
3. Persisting that change to the JSON task storage so it survives refresh/restart

Note: The repository already contains task status constants and logic for applying status (`Open`/`Completed`) and storing tasks via a JSON file. This plan focuses only on verifying and completing EPMCDMETST-71468 requirements.

## 4. Files that may need to be updated/created (minimal)
### Likely to update (only if gaps exist)
- `src/public/app.js`  
  Ensure each task row has a control (checkbox/button) that triggers “mark complete / reopen”.
- `src/public/view-model.js`  
  Ensure completed tasks have clear visual distinction (label/styling) and expose the correct toggle label/action.
- `src/http/app.js`  
  Ensure an API route exists to update task status (e.g., `PUT /api/tasks/:id/status`) and returns updated task JSON.
- `src/services/task-service.js`  
  Ensure status change uses the domain status function and persists using store mutation.
- `src/domain/task.js`  
  Ensure setting status updates `completedAt` exactly as required (ISO string when Completed, null when Open).
- `src/storage/task-store.js`  
  Ensure status changes are written using `TaskStore.mutate(fn)` and persisted to disk.

### Tests to add/update (recommended to confirm ACs)
- `tests/unit/...`  
  Unit tests for `completedAt` rule when toggling status.
- `tests/integration/...`  
  Integration tests for API status update and persistence (reload/restart scenario).

## 5. Step-by-step implementation instructions
### Step 1 — Confirm current behavior against ACs
1. Run the app (`node src/server.js`).
2. Create a new task (it should be **Open**).
3. Use the UI control to mark it **Completed**.
4. Confirm:
   - the task is visually distinguishable as Completed (label/styling)
   - `completedAt` appears in the UI if displayed
5. Refresh the browser and confirm it stays Completed.
6. Restart the server and confirm it still stays Completed.

### Step 2 — Ensure API supports status changes and persistence
1. Verify there is an endpoint to update status (intended: `PUT /api/tasks/:id/status`).
2. Ensure the endpoint:
   - accepts a status value (`Open` or `Completed`)
   - updates `completedAt` based on the rules
   - persists using `TaskStore.mutate(fn)` so it is saved atomically

### Step 3 — Ensure domain rules are enforced
1. Confirm status toggling logic enforces:
   - Completed → `completedAt = <ISO timestamp>`
   - Open → `completedAt = null`
2. Ensure no update path allows invalid combinations (e.g., `status=Open` with non-null `completedAt`).

### Step 4 — Add/update tests (to prove ACs)
1. Unit tests:
   - “mark complete sets completedAt (ISO)”
   - “reopen resets completedAt to null”
2. Integration tests:
   - create task → set status Completed → verify response + stored state
   - simulate restart (reload store from disk) → verify task still Completed and completedAt preserved

## 6. How to test the story is complete
### Manual checks
- Mark task as Completed in UI and see visual distinction (AC1)
- Refresh page and verify task remains Completed (AC2)
- Restart server and verify task remains Completed (AC2)
- Verify `completedAt` is present when Completed and null when Open (AC3)

### Automated checks
- Run test suite: `npm test`
- Ensure added unit + integration tests pass and cover AC1–AC3 behaviors.

## 7. Out of scope (not included)
- New filtering features
- New task fields beyond `status` and `completedAt`
- UI redesign beyond what is needed to distinguish Completed tasks
- Any changes unrelated to marking tasks Completed and persisting completion state
