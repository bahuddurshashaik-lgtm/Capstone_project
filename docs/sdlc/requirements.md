# Requirements - To Do Application

Status: Final for step 1 (all 13 open questions resolved on 2026-11-05)
Date: 2026-11-05
Scope: US-001, US-002, US-003, US-004, US-005

## 1. Stories

Source: `docs/user-stories/user-stories.json` (Confluence MCP not used; JSON is the source of truth).

| ID | Title | Statement | Priority |
|----|-------|-----------|----------|
| US-001 | Create a task | As a user, I want to add a new task with a title, optional description, priority and due date, so that I can capture work before I forget it. | High |
| US-002 | View and filter the task list | As a user, I want to see all my tasks and filter them by status, priority or due date, so that I can focus on what matters now. | High |
| US-003 | Edit a task | As a user, I want to change the title, description, priority or due date of a task, so that my tasks stay accurate. | Medium |
| US-004 | Mark a task complete or reopen it | As a user, I want to mark a task completed and reopen it, so that I can track progress and correct mistakes. | High |
| US-005 | Delete a task | As a user, I want to delete a task I no longer need, so that my list stays clean. | Medium |

Acceptance criteria are numbered AC-1..AC-4 in the order they appear in each story (for example US-001 AC-3 is "A due date in the past is rejected").

## 2. Functional requirements

### US-001 Create a task

| ID | Requirement | Traces to |
|----|-------------|-----------|
| FR-1 | The system shall let the user create a task with a title. The title is mandatory and has at most 100 characters. | US-001 AC-1 |
| FR-2 | If the title is empty, the system shall reject the task and show a validation error next to the title field. | US-001 AC-1 |
| FR-3 | The system shall accept an optional description of at most 500 characters. | US-001 AC-2 |
| FR-4 | The system shall accept a priority of Low, Medium or High. The default is Medium. | US-001 AC-2 |
| FR-5 | The system shall accept an optional due date. | US-001 AC-2 |
| FR-6 | The system shall reject a due date in the past and show a clear message. | US-001 AC-3 |
| FR-7 | After a successful save, the system shall give the task status Open and show it at the top of the task list. | US-001 AC-4 |
| FR-8 | The system shall assign each task a unique id and a creation timestamp. | US-001 AC-4 (supports US-003, US-004, US-005) |

### US-002 View and filter the task list

| ID | Requirement | Traces to |
|----|-------------|-----------|
| FR-9 | The system shall list all tasks showing title, priority, due date and status for each. | US-002 AC-1 |
| FR-10 | The system shall order the list with the newest created task first, with or without filters. Editing, completing or reopening a task shall not change its position (see A-11). | US-001 AC-4, US-002 AC-1 |
| FR-11 | The system shall provide a status filter (Open, Completed). | US-002 AC-2 |
| FR-12 | The system shall provide a priority filter (Low, Medium, High). | US-002 AC-2 |
| FR-13 | The system shall provide an overdue filter. A task is overdue when its status is Open and its due date is before today. | US-002 AC-2, AC-3 |
| FR-14 | The system shall combine all active filters with AND logic. | US-002 AC-2 |
| FR-15 | The system shall let the user clear all filters and see the full list again. | US-002 AC-2 |
| FR-16 | The system shall highlight overdue open tasks visually. The highlight shall not rely on colour alone. | US-002 AC-3 |
| FR-17 | When no task matches the current filters or no task exists, the system shall show an empty-state message instead of a blank screen. | US-002 AC-4 |

### US-003 Edit a task

| ID | Requirement | Traces to |
|----|-------------|-----------|
| FR-18 | The system shall let the user edit title, description, priority and due date of an existing task. | US-003 (statement) |
| FR-19 | Edits shall follow the same validation rules as creation (FR-1, FR-2, FR-3, FR-4, FR-6). | US-003 AC-1 |
| FR-20 | Saving an edit shall update the task in place, keep its id, creation timestamp and status, and refresh the list. | US-003 AC-2 |
| FR-21 | If the task no longer exists when the user opens or saves an edit, the system shall show the message "Task not found" and leave other tasks unchanged. | US-003 AC-3 |
| FR-22 | Cancelling an edit shall leave the task unchanged. | US-003 AC-4 |

### US-004 Mark a task complete or reopen it

| ID | Requirement | Traces to |
|----|-------------|-----------|
| FR-23 | The system shall move a task between Open and Completed with a single user action (toggle). | US-004 AC-1 |
| FR-24 | When a task becomes Completed, the system shall record a completion timestamp (stored as ISO 8601) and show it as date and time in the user's local time zone (see A-13). | US-004 AC-2 |
| FR-25 | Completed tasks shall be visually distinct from open tasks. The distinction shall not rely on colour alone. | US-004 AC-2 |
| FR-26 | When a task is reopened, the system shall clear its completion timestamp. | US-004 AC-3 |
| FR-27 | A status change shall persist after the application is reloaded. | US-004 AC-4 |
| FR-28 | If the task no longer exists when toggled, the system shall show "Task not found". | US-004 AC-1 (error case, see A-10) |

### US-005 Delete a task

| ID | Requirement | Traces to |
|----|-------------|-----------|
| FR-29 | Before deleting, the system shall show a confirmation prompt. | US-005 AC-1 |
| FR-30 | On confirmation, the system shall remove the task permanently from the list and from storage. | US-005 AC-2 |
| FR-31 | On cancel, the system shall keep the task unchanged. | US-005 AC-3 |
| FR-32 | If the task is already gone, the system shall show "Task not found" and refresh the list without error. | US-005 AC-4 |

### Cross-cutting

| ID | Requirement | Traces to |
|----|-------------|-----------|
| FR-33 | All task data (create, edit, status change, delete) shall persist across application reloads. | US-004 AC-4, US-005 AC-2 |
| FR-34 | Validation shall be enforced in the data/business layer, not only in the user interface. | US-001 AC-1..3, US-003 AC-1 |

## 3. Non-functional requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-1 | Security | All user-supplied text (title, description) shall be treated as data and escaped on output so that it cannot run as script or markup. |
| NFR-2 | Security | The system shall reject malformed input (wrong types, unknown priority or status values, invalid dates) with a validation error and no state change. |
| NFR-3 | Security | The system shall not log or expose secrets. No `.env` file is read by the application. |
| NFR-4 | Performance | Create, edit, toggle and delete shall complete in 200 ms or less for up to 1,000 tasks (excluding user think time; see A-8, A-12). |
| NFR-5 | Performance | Listing and filtering up to 1,000 tasks shall show results in 300 ms or less, without pagination (see A-8, A-12). |
| NFR-6 | Usability | Validation and error messages shall be specific, shown next to the field or action, and written in plain language. |
| NFR-7 | Usability | Every function shall be usable by keyboard alone. Controls shall have accessible names and visible focus (see A-12). |
| NFR-8 | Usability | Overdue and completed states shall use text or icon cues in addition to colour (contrast ratio of at least 4.5:1 for text; see A-12). |
| NFR-9 | Reliability | A failed operation shall leave stored data unchanged (no partial writes). |
| NFR-10 | Reliability | Data shall survive restart of the application. A corrupted or missing store shall be reported with a clear message and not crash the application. |
| NFR-11 | Reliability | Date comparisons (past due date, overdue) shall use one consistent definition of "today" (see assumption A-3). |
| NFR-12 | Maintainability | Code shall have automated unit tests covering every FR, including each validation boundary (0, 1, 100, 101 title characters; 500, 501 description characters). |

## 4. Assumptions

| ID | Assumption | Related question |
|----|------------|------------------|
| A-1 | Single user, single device. No login, no sharing, no multi-user concurrency. | Q-1 |
| A-2 | Node.js 20 or later is the runtime (from `package.json`). The delivery form (web UI, CLI or API) and the supported browsers or OS versions are decided in the architecture step. | Q-2 |
| A-3 | The due date is a calendar date without time. "Past" means before today in the user's local time zone. A due date equal to today is allowed. | Q-3 |
| A-4 | Title is trimmed of leading and trailing whitespace before validation. A whitespace-only title counts as empty. Length is counted in characters after trimming. Duplicate titles are allowed. | Q-4 |
| A-5 | Editing does not change status. Editing a Completed task is allowed. | Q-5 |
| A-6 | Editing a task whose due date is already in the past and is unchanged is allowed. Only a changed or newly entered past date is rejected. | Q-7 |
| A-7 | The filter set is Status, Priority and Overdue. "Filter by due date" in the story statement is met by the Overdue filter. | Q-8 |
| A-8 | Tasks are stored locally. The expected maximum is 1,000 tasks, and the list is not paginated. The performance targets in NFR-4 and NFR-5 apply up to this size. | Q-9 |
| A-9 | Delete is permanent. There is no undo and no trash. | Q-10 |
| A-10 | A status toggle on a task that no longer exists shows "Task not found" and changes nothing (FR-28). | Q-6 |
| A-11 | The list is always ordered newest created first. Editing, completing or reopening a task does not change its position (FR-10). | Q-11 |
| A-12 | The accessibility and performance targets in NFR-4, NFR-5, NFR-7 and NFR-8 are accepted as proposed. | Q-12 |
| A-13 | The completion timestamp is stored as ISO 8601 and shown as date and time in the user's local time zone. | Q-13 |

## 5. Out of scope

- User accounts, authentication, sharing and collaboration.
- Cloud sync, multi-device sync and offline conflict handling.
- Sub-tasks, tags, categories, attachments, reminders and notifications.
- Recurring tasks.
- Sorting options other than newest first.
- Text search.
- Bulk actions (multi-select complete or delete).
- Undo and restore of deleted tasks.
- Import and export of tasks.
- Localisation (English only).

## 6. Open questions

None. All 13 questions (Q-1 to Q-13) were answered on 2026-11-05 and are recorded in the Q&A log (section 7).

## 7. Q&A log

The user answered "go with the default" for every question. Each answer is the proposed assumption, accepted as-is.

| ID | Question | Answer (accepted assumption) | Source | Date |
|----|----------|------------------------------|--------|------|
| Q-1 | Is the application for one user on one device, or does it need accounts? | A-1: single user, no accounts. | User | 2026-11-05 |
| Q-2 | Which platform is required: web app, CLI, desktop or API? Which browsers or OS versions are supported? | A-2: decided in architecture; Node.js 20 or later. | User | 2026-11-05 |
| Q-3 | Is the due date a date only or a date and time? Which time zone defines "today"? Is a due date of today allowed? | A-3: date only, local time zone, today allowed. | User | 2026-11-05 |
| Q-4 | Should whitespace be trimmed from the title? Are duplicate titles allowed? | A-4: trim; whitespace-only is empty; duplicates are allowed. | User | 2026-11-05 |
| Q-5 | Can a Completed task be edited? | A-5: yes, status is unchanged. | User | 2026-11-05 |
| Q-6 | What should happen when a status toggle targets a task that no longer exists? The story only defines this for edit and delete. | A-10 / FR-28: show "Task not found". | User | 2026-11-05 |
| Q-7 | When editing a task whose stored due date has since passed, must the user change the date before saving? | A-6: no, an unchanged past date is accepted. | User | 2026-11-05 |
| Q-8 | Does "filter by due date" require more than the Overdue filter (for example due today, due this week or a date range)? | A-7: Overdue only. | User | 2026-11-05 |
| Q-9 | What is the expected maximum number of tasks? Is pagination needed? | A-8: up to 1,000 tasks, no pagination. | User | 2026-11-05 |
| Q-10 | Is permanent delete acceptable, or is a soft delete or undo wanted? | A-9: permanent delete. | User | 2026-11-05 |
| Q-11 | How should the list be ordered when no filter is active, and after a task is edited or reopened? | A-11 / FR-10: newest created first, always. | User | 2026-11-05 |
| Q-12 | What are the accessibility and performance targets (for example WCAG 2.1 AA)? | A-12: NFR-4, NFR-5, NFR-7 and NFR-8 are the targets. | User | 2026-11-05 |
| Q-13 | Should the completion timestamp be shown with date and time, in what format and in which time zone? | A-13 / FR-24: local time, date and time, ISO 8601 stored. | User | 2026-11-05 |
