# PR: Change the primary button colour from blue to teal

## Summary

The primary button ("Add task") changes from blue to teal (`#0f766e`) by updating one CSS variable. White text on teal has a contrast ratio of about 5.5:1, so it still meets the WCAG AA text contrast threshold. No logic, markup or API changed.

## Changes Made

- `src/public/styles.css`: `--color-primary` changes from `#1a56c4` to `#0f766e`. This is the only place the colour is defined; it is used by `button.primary`.
- `CHANGELOG.md`: adds a `Changed` entry under `Unreleased`.
- `docs/sdlc/pr-description.md`: replaced with this description.

## Test Evidence

Run on Windows, 2026-11-06. All commands exited with code 0.

- `npm test`: 480 passed, 0 failed.
- `npm run check`: `Workspace check passed.`
- `npm run test:scripts`: 24 passed, 0 failed.

## Known Limitations

- Visual change only; no automated test asserts the colour, so it needs a manual look in the browser.
- Local edits to `.env.example` and `.vscode/mcp.json` exist in the working tree and are deliberately not part of this PR.
- Replacing `docs/sdlc/pr-description.md` removes the description of the previous PR; it remains in that PR's history.

## Reviewer Checklist

- [ ] Confirm the diff only touches `src/public/styles.css`, `CHANGELOG.md` and `docs/sdlc/pr-description.md`.
- [ ] Open the app and confirm the "Add task" button is teal with readable white text, including focus and disabled states.
- [ ] Confirm `CHANGELOG.md` has one new `Changed` entry under `Unreleased`.
- [ ] Run `npm test`, `npm run check` and `npm run test:scripts` and confirm all pass.
- [ ] Confirm no secret or `.env` file is in the diff.
- [ ] Merge manually (the agent never merges).
