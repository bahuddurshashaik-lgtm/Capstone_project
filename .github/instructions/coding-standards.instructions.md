---
description: Coding standards for application code and tests
applyTo: "src/**,tests/**"
---
- Functions are small, single-purpose and named for intent; avoid explanatory comments by naming well.
- Validate every external input (title <= 100 chars, description <= 500 chars, priority in Low/Medium/High, due date not in the past).
- Return explicit, user-friendly errors; handle 'Task not found', empty lists and storage failures without crashing.
- Never log or hard-code secrets.
- Extract duplicated logic into shared helpers.
- Every feature has unit tests for the happy path, validation failures and 'Not Found' cases; cross-component behaviour has integration tests.
