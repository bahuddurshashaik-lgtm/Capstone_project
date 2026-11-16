# PR Authoring Skill

## Purpose
This skill guides AI agents in creating high-quality, reviewable pull requests that follow best practices for code review and collaboration. It ensures PRs are well-documented, traceable, and ready for team review across any technology stack or project.

## Usage
Invoke this skill when:
- Creating a new pull request from completed work
- Preparing code changes for team review
- Validating PR readiness before submission
- Ensuring traceability between code changes and requirements

## Core Rules

### 1. Requirement Traceability
Establish clear linkage between code changes and requirements:
- **Link to Jira Story:** Include the Jira issue ID/key in PR title or description
- **Verify Against Acceptance Criteria:** Confirm all acceptance criteria from the linked story are satisfied
- **Map Changes to Requirements:** Explicitly connect code changes to specific acceptance criteria
- **Document Trade-offs:** If any acceptance criteria are not met, explain why and document alternatives

Traceability ensures reviewers understand the "why" behind changes and validates completeness.

### 2. Clear PR Description
Provide comprehensive context for reviewers. Include:
- **Purpose:** One-sentence summary of what this PR accomplishes
- **Summary of Changes:** High-level overview of modifications (e.g., "Added user authentication API endpoints")
- **Implementation Details:**
  - Key technical decisions and rationale
  - Files/modules modified and why
  - Architecture or design patterns used
  - Any breaking changes or migration steps
- **Related Issue:** Link to Jira story, bug ticket, or feature request (e.g., "Closes PROJ-123")
- **Testing Approach:** How changes were validated (unit tests, integration tests, manual testing)
- **Screenshots/Videos:** For UI changes, include visual evidence of functionality

### 3. Code Quality
Ensure code meets project standards:
- **Follow Coding Standards:** Adhere to project's style guide, linting rules, and naming conventions
- **Maintain Readability:**
  - Use descriptive variable and function names
  - Keep functions focused and concise
  - Add comments only where complexity requires explanation
- **Avoid Unnecessary Changes:**
  - No reformatting of unrelated code
  - No scope creep beyond the story requirements
  - No "drive-by" refactoring unless explicitly part of the task
- **Consistent with Existing Patterns:** Follow established architectural patterns and code organization

### 4. Testing & Validation
Thoroughly validate changes before creating the PR:
- **Run Relevant Tests:**
  - Execute all unit tests related to modified code
  - Run integration tests if available
  - Verify end-to-end workflows for feature changes
- **Validate Results:** Ensure all tests pass; if any fail, investigate and resolve or document as known issues
- **Document Test Coverage:**
  - List new tests added
  - Confirm coverage of acceptance criteria
  - Note any edge cases tested
- **Known Failures:** If tests fail or features are incomplete, explicitly document:
  - Which tests fail and why
  - Blocking issues or dependencies
  - Plan for resolution

### 5. Review Before Raising
Perform a comprehensive pre-submission check:
- **Accidental Files Check:**
  - Review `git status` for unintended files (logs, .DS_Store, IDE configs)
  - Ensure `.gitignore` is properly configured
- **Secrets Scan:**
  - Check for hardcoded credentials, API keys, or tokens
  - Verify environment variables are used for sensitive data
  - Look for accidentally committed `.env` files
- **Debugging Code:**
  - Remove console.log, print statements, or temporary debug code
  - Remove commented-out code blocks (unless intentionally documented)
- **Merge Conflicts:** Ensure branch is up-to-date with target branch and conflicts are resolved
- **Branch Verification:**
  - **Source Branch:** Confirm you're creating PR from the correct feature branch
  - **Target Branch:** Verify PR targets the correct base branch (e.g., `main`, `develop`, or feature branch)
  - Check branch naming follows project conventions

## Validation Checklist

Before creating the pull request, confirm:
- [ ] PR is linked to the relevant Jira story or issue
- [ ] All acceptance criteria are satisfied or exceptions documented
- [ ] PR title is clear and includes issue reference (e.g., "PROJ-123: Add user login API")
- [ ] Description includes purpose, summary, implementation details, and related issue
- [ ] Code follows project coding standards and style guide
- [ ] No unnecessary changes, reformatting, or scope creep
- [ ] All relevant tests have been run and pass (or failures documented)
- [ ] New tests added to cover changes
- [ ] No accidental files in the commit (logs, IDE files, OS files)
- [ ] No secrets, credentials, or sensitive data in code
- [ ] All debugging code removed
- [ ] Branch is up-to-date with target branch, no merge conflicts
- [ ] Source and target branches are correct
- [ ] For UI changes: screenshots or videos included

## Expected Output

Each pull request should include:

1. **Title:** Format: `[JIRA-KEY]: Brief description` (e.g., "PROJ-123: Implement user authentication")
2. **Description:** Structured Markdown with:
   - **Purpose/Summary**
   - **Changes Made**
   - **Implementation Details**
   - **Related Issue** (Jira link)
   - **Testing Performed**
   - **Screenshots** (if UI changes)
3. **Commits:**
   - Logical, atomic commits with clear messages
   - Commit history is clean (squash fixup commits if appropriate)
4. **Files Changed:**
   - Only files relevant to the story
   - No unintended or auto-generated files
5. **Tests:**
   - All existing tests pass
   - New tests for added functionality
6. **Labels/Reviewers:**
   - Appropriate labels applied (e.g., `feature`, `bugfix`, `documentation`)
   - Reviewers assigned per project conventions

## Handling Missing Information

When essential information is missing or unclear:
1. **Stop and flag the gap explicitly** - do not proceed with assumptions
2. **Identify what's needed:**
   - Jira story link or requirement details
   - Target branch or merge strategy
   - Testing requirements or acceptance criteria
3. **Ask specific questions:**
   - "Which Jira story does this relate to?"
   - "Should this PR target `main` or a feature branch?"
   - "What specific tests should be run to validate this change?"
4. **Wait for clarification** before creating the PR

## Quality Standards

High-quality pull requests are:
- **Focused:** Single purpose, addresses one story or bug
- **Complete:** All requirements satisfied, tests pass
- **Well-documented:** Clear description, implementation notes, and testing details
- **Traceable:** Linked to requirements, commits reference issue IDs
- **Reviewable:** Reasonable size, logical commits, clear diff
- **Safe:** No secrets, no accidental files, no breaking changes without documentation
- **Professional:** Follows team conventions and project standards

## PR Size Guidelines

- **Small PR (preferred):** < 400 lines changed, focused on single feature/fix
- **Medium PR:** 400-800 lines, may span multiple related changes
- **Large PR:** > 800 lines, should be avoided unless unavoidable (e.g., large refactor or generated code)

**Recommendation:** Break large changes into multiple smaller PRs when possible for easier review.

---

**Note for AI Agents:** This skill is technology-agnostic and project-independent. Apply these principles consistently across all languages, frameworks, version control systems (Git, Mercurial, etc.), and collaboration platforms (GitHub, GitLab, Bitbucket, Azure DevOps, etc.).
