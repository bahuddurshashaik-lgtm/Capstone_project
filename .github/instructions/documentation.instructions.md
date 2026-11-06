---
description: Rules for SDLC documents
applyTo: "docs/**/*.md"
---
- Use the templates from the `sdlc-artifacts` skill; keep the file names `requirements.md`, `architecture.md`, `design-review.md`, `impl-plan.md` in `docs/sdlc/`.
- Number requirements (FR-n, NFR-n) and tasks (T-n) so they can be traced across documents.
- No placeholder text (TODO, TBD, lorem). Unknowns go in "Open questions".
- Use Mermaid for diagrams. Keep sentences short and testable.
- `docs/user-stories/user-stories.md` is generated; edit `user-stories.json` instead.
