# PR: Document that the pr-author agent never merges (agent demo)

## Summary

This is a documentation-only change to show the `pr-author` agent working end to end: it updates the changelog, writes this description, and opens the pull request. The README now states that the agent never merges or force-pushes and that a human merges every PR. No application code, test, script or configuration changed.

## Changes Made

- `README.md`: adds one sentence under the SDLC table saying the `pr-author` agent never merges or force-pushes and a human merges every PR.
- `CHANGELOG.md`: adds a `Changed` entry under `Unreleased` for the README note.
- `docs/sdlc/pr-description.md`: replaced with this description (the PR source of truth).

## Test Evidence

Run on branch `docs/readme-pr-agent-demo` (from `origin/main`), Windows, 2026-11-06. Both commands exited with code 0.

`npm run check`:

```text
> todo-application@0.1.0 check
> node scripts/validate-workspace.mjs

Workspace check passed.
```

`npm run test:scripts`:

```text
> todo-application@0.1.0 test:scripts
> node --test "scripts/**/*.test.mjs"

ℹ tests 24
ℹ suites 0
ℹ pass 24
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1170.1268
```

`npm test` was not run because nothing under `src/` or `tests/` changed.

## Known Limitations

- Documentation only; it has no runtime effect and adds no tests.
- Local edits to `.env.example` and `.vscode/mcp.json` exist in the working tree and are deliberately not part of this PR.
- Replacing `docs/sdlc/pr-description.md` removes the description of the earlier To Do application PR (#1, already merged); it remains in that PR's history.

## Reviewer Checklist

- [ ] Confirm the diff only touches `README.md`, `CHANGELOG.md` and `docs/sdlc/pr-description.md`.
- [ ] Confirm the README sentence is accurate for the `pr-author` agent.
- [ ] Confirm `CHANGELOG.md` has one new `Changed` entry under `Unreleased` and no duplicate.
- [ ] Run `npm run check` and `npm run test:scripts` and confirm both pass.
- [ ] Confirm no secret or `.env` file is in the diff.
- [ ] Merge manually (the agent never merges).
