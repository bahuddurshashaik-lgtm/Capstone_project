---
description: Rules for automation scripts and hooks
applyTo: "scripts/**,.github/hooks/**"
---
- Scripts are dependency-free ES modules (`.mjs`) for Node 20+.
- Read credentials only from environment variables or `.env`; never print them. Redact before logging.
- Hooks must be fast (< 10 s), read JSON from stdin, and fail open on internal errors except when denying a clearly unsafe action.
- Add or update a `*.test.mjs` next to shared library code and run `npm run test:scripts`.
