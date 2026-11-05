# To Do Application - User Stories

> Generated from `user-stories.json`. Do not edit by hand.

## US-001: Create a task

As a user, I want to add a new task with a title, optional description, priority and due date so that I can capture work I need to do before I forget it.

**Priority:** High

**Acceptance Criteria**

1. A title is mandatory and limited to 100 characters; an empty title shows a validation error.
2. Description (max 500 characters), priority (Low/Medium/High, default Medium) and due date are optional.
3. A due date in the past is rejected with a clear message.
4. After saving, the new task appears at the top of the task list with status Open.

## US-002: View and filter the task list

As a user, I want to see all my tasks and filter them by status, priority or due date so that I can focus on what matters most right now.

**Priority:** High

**Acceptance Criteria**

1. The list shows title, priority, due date and status for every task.
2. Filters for status (Open/Completed), priority and overdue are available and can be combined.
3. Overdue open tasks are visually highlighted.
4. When no task matches, an empty-state message is shown instead of a blank screen.

## US-003: Edit a task

As a user, I want to change the title, description, priority or due date of an existing task so that I can keep my tasks accurate as plans change.

**Priority:** Medium

**Acceptance Criteria**

1. The same validation rules as task creation apply to edits.
2. Saving updates the task in place and refreshes the list.
3. Editing a task that no longer exists shows a 'Task not found' message.
4. Cancelling the edit leaves the task unchanged.

## US-004: Mark a task complete or reopen it

As a user, I want to mark a task as completed and reopen it if needed so that I can track my progress and correct mistakes.

**Priority:** High

**Acceptance Criteria**

1. Toggling status moves a task between Open and Completed with one action.
2. Completed tasks show a completion timestamp and are visually distinct.
3. Reopening a task clears its completion timestamp.
4. The status change persists after reloading the application.

## US-005: Delete a task

As a user, I want to delete a task I no longer need so that my list stays clean and relevant.

**Priority:** Medium

**Acceptance Criteria**

1. A confirmation prompt is shown before a task is deleted.
2. Confirming removes the task permanently from the list and storage.
3. Cancelling the prompt keeps the task.
4. Deleting a task that is already gone is handled gracefully with a 'Task not found' message.
