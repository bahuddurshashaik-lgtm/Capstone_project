# Pull Request Authoring Skill

## Purpose
This skill provides a structured framework for AI agents to create high-quality pull requests that are clear, complete, and ready for review. It ensures proper traceability, code quality, and validation before submission.

## Usage
Invoke this skill when:
- Creating a new pull request for code changes
- Preparing code for review and merge
- Validating pull request completeness before submission
- Ensuring code changes meet quality and testing standards

## Core Rules

### 1. Requirement Traceability
Link the pull request to relevant tracking items and verify implementation:
- **Link to Jira story/issue:** Include ticket number and link in PR description
- **Verify against acceptance criteria:** Ensure all acceptance criteria from the story are met
- **Cross-reference requirements:** Confirm implementation matches original requirements
- **Document deviations:** If implementation differs from requirements, explain why
- **Reference related PRs:** Link to related or dependent pull requests

### 2. Clear PR Description
Provide a comprehensive description that includes:

**Purpose:**
- Brief summary of what this PR accomplishes
- Link to related Jira issue or story

**Summary of Changes:**
- High-level overview of what was modified
- Key files or components affected

**Implementation Details:**
- Approach taken and rationale for technical decisions
- Any architectural or design patterns used
- Notable code changes or refactoring

**Related Issues:**
- Jira ticket reference (e.g., "Resolves PROJ-123")
- Links to related documentation or discussions

### 3. Code Quality
Maintain high standards for code quality:
- **Follow coding standards:** Adhere to project's style guide and conventions
- **Maintain readability:** Use clear variable names, proper structure, and logical organization
- **Avoid unnecessary changes:** Only include changes relevant to the PR's purpose
- **No debugging artifacts:** Remove console.log, commented code, or debug statements
- **Consistent formatting:** Ensure code is properly formatted per project standards
- **Documentation:** Update relevant comments, README, or documentation files

### 4. Testing & Validation
Ensure changes are properly tested and validated:
- **Run relevant tests:** Execute unit tests, integration tests, and any applicable test suites
- **Validate test results:** Verify all tests pass or document known failures
- **Document test coverage:** Describe what was tested and how
- **Manual testing:** Document any manual testing performed
- **Edge cases:** Verify handling of edge cases and error conditions
- **Known failures:** If tests fail, document the reason and plan for resolution

### 5. Review Before Raising
Perform a thorough pre-submission checklist:
- **No accidental files:** Verify no unintended files are included (temp files, IDE config, personal notes)
- **No secrets or credentials:** Check for API keys, passwords, tokens, or sensitive data
- **No debugging code:** Remove console statements, debug flags, or test data
- **No merge conflicts:** Ensure clean merge with target branch
- **Correct branches:** Verify source branch and target branch are correct
- **Commit quality:** Review commit messages for clarity and completeness
- **Code review self-check:** Review your own changes as if you were a reviewer

## Validation Checklist

Before creating a pull request, verify:

- [ ] PR is linked to a Jira story or issue
- [ ] All acceptance criteria from the story are met
- [ ] PR description includes purpose, summary, and implementation details
- [ ] Code follows project coding standards and style guide
- [ ] No unnecessary or unrelated changes included
- [ ] All debugging code and artifacts removed
- [ ] Relevant tests have been executed
- [ ] Test results documented and passing (or failures explained)
- [ ] No accidental files or IDE configurations included
- [ ] No secrets, credentials, or sensitive data exposed
- [ ] No merge conflicts with target branch
- [ ] Source and target branches are correct
- [ ] Commit messages are clear and descriptive
- [ ] Documentation updated if needed

## Expected Output

A complete pull request should include:

1. **PR Title:** Clear, concise summary of changes (e.g., "Add user authentication with JWT")

2. **PR Description:**
   ```
   ## Purpose
   [What this PR accomplishes]
   
   Resolves: [JIRA-123](link-to-jira)
   
   ## Summary of Changes
   - [Change 1]
   - [Change 2]
   - [Change 3]
   
   ## Implementation Details
   [Technical approach and rationale]
   
   ## Testing
   - [Test 1 description and result]
   - [Test 2 description and result]
   
   ## Related Issues
   - Related to: [JIRA-456](link)
   - Depends on: #123
   ```

3. **Commits:** Clean, logical commits with descriptive messages

4. **Changed Files:** Only relevant files included

5. **Test Evidence:** Documentation or screenshots of test results

## Handling Incomplete Requirements

When essential information is missing:
1. **Do not proceed** with PR creation until clarification is obtained
2. **Ask specific questions** about missing requirements or acceptance criteria
3. **Document assumptions** if temporary decisions must be made
4. **Flag uncertainties** in the PR description
5. **Request review** from appropriate stakeholders

## Pre-Submission Self-Review

Before submitting, ask yourself:

1. **Purpose:** Would a reviewer immediately understand why this PR exists?
2. **Completeness:** Does this PR fully implement the stated requirements?
3. **Quality:** Is the code clean, readable, and maintainable?
4. **Testing:** Have I provided evidence that this works correctly?
5. **Safety:** Am I confident nothing sensitive or unintended is included?
6. **Clarity:** Can this PR be reviewed efficiently without questions?

## Branch Strategy Verification

Before creating the PR:
- **Source branch:** Confirm you're creating the PR from the correct feature/fix branch
- **Target branch:** Verify the PR targets the correct base branch (main, develop, feature branch)
- **Branch naming:** Ensure branch name follows project conventions
- **Up-to-date:** Confirm source branch is up-to-date with target branch

## Example PR Template

```
## Purpose
Implement user authentication using JWT tokens as specified in PROJ-123.

Resolves: [PROJ-123](https://jira.example.com/browse/PROJ-123)

## Summary of Changes
- Added JWT token generation and validation middleware
- Implemented login and logout endpoints
- Added password hashing with bcrypt
- Created authentication integration tests

## Implementation Details
Used jsonwebtoken library for JWT handling and bcrypt for password security.
Middleware validates tokens on protected routes and attaches user context.
Token expiration set to 24 hours with refresh capability.

## Testing
- ✅ Unit tests: 15 new tests covering auth logic (100% coverage)
- ✅ Integration tests: Login/logout flows validated
- ✅ Manual testing: Tested in local environment with Postman
- ✅ Edge cases: Invalid tokens, expired tokens, missing credentials

## Related Issues
- Depends on: #245 (User model changes)
- Related to: PROJ-124 (Authorization rules - next sprint)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
