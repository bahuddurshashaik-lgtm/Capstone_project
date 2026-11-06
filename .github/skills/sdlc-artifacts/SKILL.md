---
name: sdlc-artifacts
description: Templates and quality rules for the SDLC documents (requirements, architecture, design review, implementation plan, verification). Use when writing or reviewing any file in docs/sdlc.
---
# SDLC artifact templates

All files go in `docs/sdlc/`.

## requirements.md
Story (id, statement, source) | Functional requirements (FR-n -> acceptance criterion) | Non-functional requirements (NFR-n) | Assumptions | Out of scope | Open questions | Q&A log (question, answer, date)

## architecture.md
Context | Component diagram (Mermaid) + responsibilities | Technology choices (+ rejected alternative) | Data model | Data flow (Mermaid sequence) | Error handling & security | Directory layout | Risks | Revision history

## design-review.md
Findings table (ID, severity, area, finding, recommendation, decision) | Agreed design decisions | Accepted risks | Architecture changes made

## impl-plan.md
Task table (T-n, description, files, requirements, priority, depends on, size, status) | Blocked tasks | Critical path

## verification.md
Traceability (acceptance criterion -> test) | Raw test output | Document quality check | Result (Pass/Fail)

## Quality rules
Every FR maps to at least one task and one test. No TODO/TBD. Diagrams in Mermaid. Facts only; unknowns are listed as open questions.
