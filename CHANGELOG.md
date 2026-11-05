# Changelog

All notable changes to this project are documented here ([Keep a Changelog](https://keepachangelog.com)).

## [Unreleased]
### Added
- To Do application (US-001..US-005): create, list and filter, edit, complete or reopen, and delete tasks in a local web UI served on `127.0.0.1`, with a JSON file store configured by `PORT` and `TODO_DATA_FILE`. It has no runtime dependencies and needs Node.js 20 or later (tested on Node 26 only).
  - Task fields: title (1-100 characters), optional description (up to 500), priority (default Medium) and optional due date. Past due dates are rejected.
  - List: newest first, filters by status, priority and overdue (combinable, with "Clear filters"), overdue and completed cues shown as text and icon, and empty-state messages.
  - Edit, complete, reopen (with a completion time) and delete with a confirmation dialog. A task that was already deleted shows "Task not found".
  - Atomic file writes, recovery from a corrupt data file without overwriting it, and request checks (Host, Origin, content type, body size, Content-Security-Policy).
  - 480 automated tests (`npm test`), including a 1,000-task performance test.
- Project scaffold: SDLC agents, prompts, instructions, skills and hooks.
- Five user stories and Confluence publish/fetch scripts.
