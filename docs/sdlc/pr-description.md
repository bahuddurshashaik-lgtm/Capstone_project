## Purpose
Add two project-independent reusable skill files that establish standardized quality frameworks for user story creation and pull request authoring. Integrate these skills into existing requirements-analyst and pr-author agents to ensure consistent SDLC process quality.

Resolves: Process improvement initiative for standardized agent workflows

## Summary of Changes
- **Created** `.github/skills/USER-STORY-CREATION-SKILL.md` (4.7 KB)
  - Five core rules: Clear requirement format, Acceptance criteria, INVEST principles, Scope & dependencies, Review before creation
  - Validation checklist and expected output templates
  - Instructions to never invent missing requirements
  
- **Created** `.github/skills/PR-AUTHORING-SKILL.md` (7.2 KB)
  - Five core rules: Requirement traceability, Clear PR description, Code quality, Testing & validation, Review before raising
  - Pre-submission validation checklist
  - Safety checks for secrets, debugging code, and merge conflicts

- **Modified** `.github/agents/requirements-analyst.agent.md`
  - Added mandatory skill loading step
  - Integrated USER-STORY-CREATION-SKILL five core rules into process
  - Enhanced validation against INVEST principles
  - Cross-referenced "never invent requirements" rule

- **Modified** `.github/agents/pr-author.agent.md`
  - Added mandatory skill loading step
  - Integrated PR-AUTHORING-SKILL five core rules into process
  - Added pre-submission validation checklist
  - Enhanced PR description template with traceability sections

## Implementation Details
Both skill files are designed to be project-agnostic and technology-independent, allowing any AI agent across different projects to:
- Load the skill before performing their specialized tasks
- Follow standardized five-rule frameworks systematically
- Use validation checklists to ensure quality
- Apply consistent output templates

The agents now explicitly load their respective skills as the first step in their process, ensuring consistent application of quality standards.

## Testing
- ✅ Manual verification: Both skill files created in `.github/skills/` directory
- ✅ File size check: USER-STORY-CREATION-SKILL.md (4.7 KB), PR-AUTHORING-SKILL.md (7.2 KB)
- ✅ Agent file modifications: requirements-analyst and pr-author updated successfully
- ✅ Git diff validation: 371 insertions across 4 files (2 new, 2 modified)
- ✅ Content verification: All five core rules present in each skill file
- ✅ Integration verification: Agents reference skills in Required Skills sections

## Related Issues
- Part of SDLC quality improvement initiative
- Enables consistent multi-agent workflows across projects

## Known Limitations
None - skills are fully functional and integrated

## Reviewer Checklist
- [ ] Verify USER-STORY-CREATION-SKILL.md contains all five core rules
- [ ] Verify PR-AUTHORING-SKILL.md contains all five core rules
- [ ] Confirm requirements-analyst.agent.md loads USER-STORY-CREATION-SKILL
- [ ] Confirm pr-author.agent.md loads PR-AUTHORING-SKILL
- [ ] Check that skills are project-agnostic and reusable
- [ ] Validate markdown formatting and clarity
- [ ] Ensure no sensitive information or secrets included

🤖 Generated with [Claude Code](https://claude.com/claude-code)
