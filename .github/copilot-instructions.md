# Copilot instructions - To Do Application

This repository delivers a **To Do application** through an agentic SDLC driven by GitHub Copilot agents, prompts, instructions, skills and hooks.

## Layout
- `.github/agents/` - SDLC agents (orchestrator + 8 specialists)
- `.github/prompts/` - one slash prompt per SDLC step
- `.github/instructions/` - file-scoped coding and documentation rules
- `.github/skills/` - reusable skills (Confluence user stories, SDLC artifact templates)
- `.github/hooks/hooks.json` - guardrail and audit hooks (scripts in `scripts/hooks/`)
- `docs/user-stories/` - source of truth for user stories (`user-stories.json`)
- `docs/sdlc/` - requirements, architecture, design review, plan, review, verification, PR description
- `src/` application code, `tests/` unit and integration tests
- `scripts/` Confluence sync, hooks and validation

## Rules
- Follow the SDLC order: requirements -> architecture -> design review -> plan -> implement -> review -> verify -> PR.
- Always get human approval between steps.
- Never read, write or print `.env` files or credentials. Use environment variables.
- User stories live in `docs/user-stories/user-stories.json`; regenerate Markdown with `npm run stories:md`.
- Validate the workspace with `npm run check` and `npm run test:scripts`.
